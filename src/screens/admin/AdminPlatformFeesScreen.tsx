import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { AdminStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { AdminProviderFeeRow, BalanceStatus } from '../../types';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

const STATUS_CFG: Record<BalanceStatus, { label: string; color: string; bg: string }> = {
  clear:   { label: 'Clear',   color: '#059669', bg: '#D1FAE5' },
  warning: { label: 'Warning', color: '#D97706', bg: '#FEF3C7' },
  overdue: { label: 'Overdue', color: '#DC2626', bg: '#FEE2E2' },
  review:  { label: 'Review',  color: '#7C3AED', bg: '#EDE9FE' },
};

type SortKey = 'total_unpaid' | 'oldest_due_date' | 'fee_count';
type FilterKey = BalanceStatus | 'all';

function computeStatus(totalUnpaid: number, oldestDue: string | null): BalanceStatus {
  if (totalUnpaid <= 0 || !oldestDue) return 'clear';
  const days = Math.floor((Date.now() - new Date(oldestDue).getTime()) / 86400000);
  if (days <= 30) return 'clear';
  if (days <= 45) return 'warning';
  if (days <= 60) return 'overdue';
  return 'review';
}

function fmtPHP(n: number) {
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AdminPlatformFeesScreen() {
  const navigation = useNavigation<NavProp>();

  const [rows, setRows]           = useState<AdminProviderFeeRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState<FilterKey>('all');
  const [sortKey, setSortKey]     = useState<SortKey>('total_unpaid');
  const [sortAsc, setSortAsc]     = useState(false);

  const [totals, setTotals] = useState({
    outstanding: 0,
    thisMonth: 0,
    underReview: 0,
  });

  const loadData = useCallback(async () => {
    const [feesRes, providersRes] = await Promise.all([
      supabase
        .from('provider_platform_fees')
        .select('provider_id, platform_fee, due_date, created_at, status'),
      supabase
        .from('providers')
        .select('id, business_name, users!providers_id_fkey(full_name)'),
    ]);

    const feeRows = feesRes.data ?? [];
    const providerMap = new Map<string, { business_name: string | null; full_name: string | null }>();
    for (const p of (providersRes.data ?? [])) {
      providerMap.set(p.id, {
        business_name: p.business_name ?? null,
        full_name: (p as any).users?.full_name ?? null,
      });
    }

    // Aggregate per provider (unpaid fees only for balance)
    const grouped = new Map<string, {
      total_unpaid: number;
      oldest_due_date: string | null;
      fee_count: number;
    }>();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    let totalOutstanding = 0;
    let totalThisMonth   = 0;

    for (const f of feeRows) {
      if (f.status !== 'unpaid') continue;

      const prev = grouped.get(f.provider_id) ?? {
        total_unpaid: 0,
        oldest_due_date: null,
        fee_count: 0,
      };

      prev.total_unpaid += Number(f.platform_fee);
      prev.fee_count    += 1;

      if (!prev.oldest_due_date || f.due_date < prev.oldest_due_date) {
        prev.oldest_due_date = f.due_date;
      }

      grouped.set(f.provider_id, prev);
      totalOutstanding += Number(f.platform_fee);

      if (new Date(f.created_at) >= monthStart) {
        totalThisMonth += Number(f.platform_fee);
      }
    }

    const result: AdminProviderFeeRow[] = [];
    let underReviewCount = 0;

    for (const [providerId, agg] of grouped.entries()) {
      const provInfo = providerMap.get(providerId);
      const status = computeStatus(agg.total_unpaid, agg.oldest_due_date);
      if (status === 'review') underReviewCount++;

      result.push({
        provider_id:      providerId,
        business_name:    provInfo?.business_name ?? null,
        full_name:        provInfo?.full_name ?? null,
        total_unpaid:     agg.total_unpaid,
        oldest_due_date:  agg.oldest_due_date,
        fee_count:        agg.fee_count,
        balance_status:   status,
      });
    }

    setRows(result);
    setTotals({
      outstanding: totalOutstanding,
      thisMonth:   totalThisMonth,
      underReview: underReviewCount,
    });
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((a) => !a);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const displayed = rows
    .filter((r) => {
      if (filter !== 'all' && r.balance_status !== filter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        r.business_name?.toLowerCase().includes(q) ||
        r.full_name?.toLowerCase().includes(q) ||
        r.provider_id.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'total_unpaid') {
        cmp = a.total_unpaid - b.total_unpaid;
      } else if (sortKey === 'oldest_due_date') {
        cmp = (a.oldest_due_date ?? '').localeCompare(b.oldest_due_date ?? '');
      } else {
        cmp = a.fee_count - b.fee_count;
      }
      return sortAsc ? cmp : -cmp;
    });

  const FILTER_OPTS: { key: FilterKey; label: string }[] = [
    { key: 'all',     label: 'All'     },
    { key: 'warning', label: 'Warning' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'review',  label: 'Review'  },
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Platform Fees</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Totals */}
      <View style={styles.totalsRow}>
        <View style={[styles.totalCard, { borderColor: '#3B82F6' + '40' }]}>
          <Text style={styles.totalLabel}>Outstanding</Text>
          <Text style={[styles.totalValue, { color: '#3B82F6' }]}>{fmtPHP(totals.outstanding)}</Text>
        </View>
        <View style={[styles.totalCard, { borderColor: '#10B981' + '40' }]}>
          <Text style={styles.totalLabel}>This Month</Text>
          <Text style={[styles.totalValue, { color: '#10B981' }]}>{fmtPHP(totals.thisMonth)}</Text>
        </View>
        <View style={[styles.totalCard, { borderColor: '#7C3AED' + '40' }]}>
          <Text style={styles.totalLabel}>Under Review</Text>
          <Text style={[styles.totalValue, { color: '#7C3AED' }]}>{totals.underReview}</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={COLORS.textLight} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search provider name..."
          placeholderTextColor={COLORS.textLight}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={COLORS.textLight} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTER_OPTS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterChip, filter === key && styles.filterChipActive]}
            onPress={() => setFilter(key)}
          >
            <Text style={[styles.filterChipText, filter === key && styles.filterChipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
        {/* Sort toggles */}
        <TouchableOpacity style={styles.sortBtn} onPress={() => toggleSort('total_unpaid')}>
          <Ionicons
            name={sortKey === 'total_unpaid' ? (sortAsc ? 'arrow-up' : 'arrow-down') : 'swap-vertical-outline'}
            size={14}
            color={sortKey === 'total_unpaid' ? COLORS.primary : COLORS.textLight}
          />
          <Text style={[styles.sortBtnText, sortKey === 'total_unpaid' && { color: COLORS.primary }]}>
            Balance
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.sortBtn} onPress={() => toggleSort('oldest_due_date')}>
          <Ionicons
            name={sortKey === 'oldest_due_date' ? (sortAsc ? 'arrow-up' : 'arrow-down') : 'swap-vertical-outline'}
            size={14}
            color={sortKey === 'oldest_due_date' ? COLORS.primary : COLORS.textLight}
          />
          <Text style={[styles.sortBtnText, sortKey === 'oldest_due_date' && { color: COLORS.primary }]}>
            Due
          </Text>
        </TouchableOpacity>
      </View>

      {/* Count */}
      <Text style={styles.countText}>{displayed.length} provider{displayed.length !== 1 ? 's' : ''} with outstanding fees</Text>

      {/* List */}
      <FlatList
        data={displayed}
        keyExtractor={(item) => item.provider_id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle-outline" size={48} color={COLORS.success} />
            <Text style={styles.emptyText}>
              {filter !== 'all' || search.trim() ? 'No results found' : 'No outstanding fees'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const cfg = STATUS_CFG[item.balance_status];
          const isPastDue = item.oldest_due_date
            ? new Date(item.oldest_due_date) < new Date()
            : false;
          const displayName = item.business_name ?? item.full_name ?? 'Unknown Provider';

          return (
            <TouchableOpacity
              style={styles.feeRow}
              onPress={() => navigation.navigate('ProviderDetail', { providerId: item.provider_id })}
              activeOpacity={0.8}
            >
              <View style={[styles.statusDot, { backgroundColor: cfg.color }]} />
              <View style={styles.feeInfo}>
                <Text style={styles.providerName} numberOfLines={1}>{displayName}</Text>
                <Text style={styles.feeCount}>
                  {item.fee_count} unpaid fee{item.fee_count !== 1 ? 's' : ''}
                  {item.oldest_due_date
                    ? `  ·  Oldest: ${format(parseISO(item.oldest_due_date), 'MMM d, yyyy')}`
                    : ''}
                </Text>
                {isPastDue && item.balance_status !== 'clear' && (
                  <Text style={[styles.pastDueText, { color: cfg.color }]}>
                    Past due
                  </Text>
                )}
              </View>
              <View style={styles.feeRight}>
                <Text style={[styles.feeBalance, { color: cfg.color }]}>
                  {fmtPHP(item.total_unpaid)}
                </Text>
                <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },

  totalsRow: { flexDirection: 'row', padding: SPACING.md, gap: SPACING.sm },
  totalCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm, alignItems: 'center', borderWidth: 1, ...SHADOWS.small,
  },
  totalLabel: { fontSize: 10, color: COLORS.textSecondary, marginBottom: 2 },
  totalValue: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.bold },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.sm, height: 40,
  },
  searchIcon: { marginRight: SPACING.xs },
  searchInput: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text },

  filterRow:       { flexDirection: 'row', paddingHorizontal: SPACING.md, gap: SPACING.xs, marginBottom: SPACING.xs },
  filterChip: {
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.primary + '20', borderColor: COLORS.primary },
  filterChipText:   { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  filterChipTextActive: { color: COLORS.primary, fontFamily: FONTS.semiBold },

  sortBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sortBtnText: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, fontFamily: FONTS.medium },

  countText: {
    fontSize: FONTS.sizes.xs, color: COLORS.textSecondary,
    paddingHorizontal: SPACING.md, marginBottom: SPACING.xs,
  },

  listContent: { padding: SPACING.md, gap: SPACING.sm },

  emptyCard: {
    alignItems: 'center', padding: SPACING.xl * 2,
  },
  emptyText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, marginTop: SPACING.sm, fontFamily: FONTS.medium },

  feeRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  feeInfo:   { flex: 1 },
  providerName: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  feeCount:     { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  pastDueText:  { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, marginTop: 2 },
  feeRight:     { alignItems: 'flex-end', gap: 4 },
  feeBalance:   { fontSize: FONTS.sizes.sm, fontFamily: FONTS.bold },
  statusPill: {
    borderRadius: BORDER_RADIUS.full, paddingHorizontal: 8, paddingVertical: 2,
  },
  statusPillText: { fontSize: 10, fontFamily: FONTS.semiBold },
});
