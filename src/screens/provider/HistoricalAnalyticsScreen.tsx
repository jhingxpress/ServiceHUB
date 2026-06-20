import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { ProviderStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;

const FILTERS = [
  { key: '3m', label: '3 Months', months: 3 },
  { key: '6m', label: '6 Months', months: 6 },
  { key: '1y', label: '1 Year', months: 12 },
  { key: 'all', label: 'All Time', months: 0 },
] as const;

interface MonthlyData {
  monthKey: string;
  monthLabel: string;
  revenue: number;
  bookings: number;
  avgValue: number;
}

export default function HistoricalAnalyticsScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();

  const [filter, setFilter] = useState<string>('6m');
  const [data, setData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const selected = FILTERS.find((f) => f.key === filter);
      let start: string | null = null;
      if (selected && selected.months > 0) {
        start = startOfMonth(subMonths(new Date(), selected.months)).toISOString();
      }

      let query = supabase
        .from('bookings')
        .select('created_at, amount, status')
        .eq('provider_id', user.id)
        .order('created_at', { ascending: true });

      if (start) query = query.gte('created_at', start);

      const { data: bookings, error } = await query;
      if (error) throw error;

      const rows = (bookings ?? []) as Array<{ created_at: string; amount: number | null; status: string }>;

      // Group by month
      const groups: Record<string, { revenue: number; bookings: number; count: number }> = {};
      rows.forEach((b) => {
        const d = parseISO(b.created_at);
        const key = format(d, 'yyyy-MM');
        const label = format(d, 'MMM yyyy');
        const groupKey = `${key}|${label}`;
        if (!groups[groupKey]) groups[groupKey] = { revenue: 0, bookings: 0, count: 0 };
        groups[groupKey].revenue += b.amount ?? 0;
        groups[groupKey].bookings += 1;
        groups[groupKey].count += 1;
      });

      const monthly: MonthlyData[] = Object.entries(groups).map(([k, v]) => {
        const [, label] = k.split('|');
        return {
          monthKey: k,
          monthLabel: label,
          revenue: v.revenue,
          bookings: v.bookings,
          avgValue: v.count > 0 ? Math.round(v.revenue / v.count) : 0,
        };
      });

      // Sort by monthKey descending (most recent first)
      monthly.sort((a, b) => b.monthKey.localeCompare(a.monthKey));

      setData(monthly);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  const totalBookings = data.reduce((sum, d) => sum + d.bookings, 0);
  const avgValue = totalBookings > 0 ? Math.round(totalRevenue / totalBookings) : 0;

  const highest = data.length > 0 ? data.reduce((max, d) => (d.revenue > max.revenue ? d : max), data[0]) : null;
  const lowest = data.length > 0 ? data.reduce((min, d) => (d.revenue < min.revenue ? d : min), data[0]) : null;

  const maxRevenue = highest?.revenue ?? 1;

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Historical Analytics</Text>
          <View style={styles.backBtnPlaceholder} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Historical Analytics</Text>
          <View style={styles.backBtnPlaceholder} />
        </View>

        {/* Filters */}
        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>₱{totalRevenue.toLocaleString('en-PH')}</Text>
            <Text style={styles.summaryLabel}>Total Revenue</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{totalBookings}</Text>
            <Text style={styles.summaryLabel}>Bookings</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>₱{avgValue.toLocaleString('en-PH')}</Text>
            <Text style={styles.summaryLabel}>Avg Value</Text>
          </View>
        </View>

        {/* Highest / Lowest */}
        {data.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Performance</Text>
            <View style={styles.extremeRow}>
              {highest && (
                <View style={[styles.extremeCard, { borderColor: '#10B981' }]}>
                  <Ionicons name="trending-up" size={18} color="#10B981" />
                  <Text style={styles.extremeLabel}>Highest Month</Text>
                  <Text style={styles.extremeValue}>₱{highest.revenue.toLocaleString('en-PH')}</Text>
                  <Text style={styles.extremeSub}>{highest.monthLabel}</Text>
                </View>
              )}
              {lowest && (
                <View style={[styles.extremeCard, { borderColor: '#EF4444' }]}>
                  <Ionicons name="trending-down" size={18} color="#EF4444" />
                  <Text style={styles.extremeLabel}>Lowest Month</Text>
                  <Text style={styles.extremeValue}>₱{lowest.revenue.toLocaleString('en-PH')}</Text>
                  <Text style={styles.extremeSub}>{lowest.monthLabel}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Monthly Breakdown */}
        {data.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
            <View style={styles.listCard}>
              {data.map((d, idx) => {
                const barWidth = maxRevenue > 0 ? (d.revenue / maxRevenue) * 100 : 0;
                return (
                  <View key={d.monthKey} style={[styles.listRow, idx === data.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={styles.listLeft}>
                      <Text style={styles.listMonth}>{d.monthLabel}</Text>
                      <View style={styles.barWrap}>
                        <View style={[styles.bar, { width: `${barWidth}%` }]} />
                      </View>
                    </View>
                    <View style={styles.listRight}>
                      <Text style={styles.listRevenue}>₱{d.revenue.toLocaleString('en-PH')}</Text>
                      <Text style={styles.listMeta}>{d.bookings} booking{d.bookings !== 1 ? 's' : ''}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {data.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="bar-chart-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyTitle}>No data yet</Text>
            <Text style={styles.emptySub}>Complete bookings to see historical analytics.</Text>
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backBtnPlaceholder: { width: 40 },
  headerTitle: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.lg, color: COLORS.text },
  filterRow: {
    flexDirection: 'row', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, marginTop: SPACING.sm,
  },
  filterChip: {
    flex: 1, alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.sm, color: COLORS.text },
  filterChipTextActive: { color: COLORS.white },
  summaryRow: {
    flexDirection: 'row', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, marginTop: SPACING.lg,
  },
  summaryCard: {
    flex: 1, alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  summaryValue: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.lg, color: COLORS.text },
  summaryLabel: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  section: { marginTop: SPACING.lg, paddingHorizontal: SPACING.md },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.lg, color: COLORS.text, marginBottom: SPACING.sm },
  extremeRow: { flexDirection: 'row', gap: SPACING.sm },
  extremeCard: {
    flex: 1, alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    gap: SPACING.xs,
  },
  extremeLabel: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  extremeValue: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.lg, color: COLORS.text },
  extremeSub: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  listCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  listLeft: { flex: 1, gap: 4 },
  listMonth: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.sm, color: COLORS.text },
  barWrap: { height: 6, backgroundColor: COLORS.surfaceSecondary, borderRadius: 3, overflow: 'hidden', width: '100%' },
  bar: { height: 6, backgroundColor: COLORS.primary, borderRadius: 3 },
  listRight: { alignItems: 'flex-end', marginLeft: SPACING.sm },
  listRevenue: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.sm, color: COLORS.text },
  listMeta: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  emptyState: { alignItems: 'center', marginTop: SPACING.xl },
  emptyTitle: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.lg, color: COLORS.text, marginTop: SPACING.sm },
  emptySub: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  bottomPad: { height: 60 },
});
