import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format, startOfDay, startOfMonth } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { isAdmin } from '../../utils/roleUtils';
import { AdminStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

interface FeaturedTx {
  id: string;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  providers: { business_name: string | null } | null;
}

const STATUS_CFG: Record<string, { bg: string; color: string }> = {
  paid:     { bg: '#D1FAE5', color: '#065F46' },
  pending:  { bg: '#FEF3C7', color: '#92400E' },
  failed:   { bg: '#FEE2E2', color: '#991B1B' },
  refunded: { bg: '#EDE9FE', color: '#5B21B6' },
};

function fmtPHP(n: number) {
  return `₱${Math.round(n).toLocaleString()}`;
}

export default function FeaturedRevenueScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const isAdminUser = isAdmin(user?.role);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [todayRev, setTodayRev]       = useState(0);
  const [monthRev, setMonthRev]       = useState(0);
  const [lifetimeRev, setLifetimeRev] = useState(0);
  const [activeCount, setActiveCount]   = useState(0);
  const [expiredCount, setExpiredCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [renewalsCount, setRenewalsCount] = useState(0);
  const [transactions, setTransactions] = useState<FeaturedTx[]>([]);

  const loadData = useCallback(async () => {
    const now        = new Date();
    const todayStart = startOfDay(now).toISOString();
    const monthStart = startOfMonth(now).toISOString();

    const [paidRes, activeRes, expiredRes, pendingReqRes, renewalsRes, txRes] = await Promise.all([
      supabase
        .from('featured_payments')
        .select('amount, paid_at')
        .eq('status', 'paid'),
      supabase
        .from('providers')
        .select('id', { count: 'exact', head: true })
        .eq('is_featured', true),
      supabase
        .from('providers')
        .select('id', { count: 'exact', head: true })
        .not('featured_until', 'is', null)
        .lt('featured_until', now.toISOString()),
      supabase
        .from('featured_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('featured_payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'paid')
        .gte('paid_at', monthStart),
      supabase
        .from('featured_payments')
        .select('id, amount, status, paid_at, created_at, providers(business_name)')
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    let today = 0, month = 0, lifetime = 0;
    (paidRes.data ?? []).forEach((r: any) => {
      const amt  = Number(r.amount) || 0;
      const date: string = r.paid_at ?? '';
      lifetime += amt;
      if (date >= monthStart) month += amt;
      if (date >= todayStart) today += amt;
    });

    setTodayRev(today);
    setMonthRev(month);
    setLifetimeRev(lifetime);
    setActiveCount(activeRes.count ?? 0);
    setExpiredCount(expiredRes.count ?? 0);
    setPendingCount(pendingReqRes.count ?? 0);
    setRenewalsCount(renewalsRes.count ?? 0);
    setTransactions((txRes.data ?? []) as unknown as FeaturedTx[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); loadData(); }, [loadData]));

  const renderTx = ({ item }: { item: FeaturedTx }) => {
    const cfg = STATUS_CFG[item.status] ?? { bg: COLORS.border, color: COLORS.textSecondary };
    const displayDate = item.paid_at ?? item.created_at;
    return (
      <View style={styles.txRow}>
        <View style={styles.txLeft}>
          <Text style={styles.txProvider} numberOfLines={1}>
            {item.providers?.business_name ?? 'Unknown Provider'}
          </Text>
          <Text style={styles.txDate}>{format(new Date(displayDate), 'MMM d, yyyy · h:mm a')}</Text>
        </View>
        <View style={styles.txRight}>
          <Text style={styles.txAmount}>{fmtPHP(Number(item.amount))}</Text>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusText, { color: cfg.color }]}>{item.status}</Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={COLORS.warning} size="large" /></View>
      </SafeAreaView>
    );
  }

  const METRICS = [
    { icon: 'sparkles',           color: COLORS.warning,  bg: '#FEF3C7',          label: 'Active Featured',      value: String(activeCount) },
    { icon: 'close-circle-outline', color: COLORS.error,  bg: '#FEE2E2',          label: 'Expired',              value: String(expiredCount) },
    { icon: 'time-outline',       color: COLORS.primary,  bg: COLORS.primaryLight, label: 'Pending Requests',    value: String(pendingCount) },
    { icon: 'refresh-outline',    color: '#7C3AED',       bg: '#EDE9FE',          label: 'Renewals This Month',  value: String(renewalsCount) },
  ] as const;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{isAdminUser ? '⭐ Featured Revenue' : '⭐ Featured Providers'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderTx}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor={COLORS.warning}
          />
        }
        contentContainerStyle={styles.list}
        ListHeaderComponent={(
          <View>
            {/* Revenue summary — Admin only */}
            {isAdminUser && (
              <View style={styles.revenueRow}>
                {[
                  { label: 'Today',      value: fmtPHP(todayRev) },
                  { label: 'This Month', value: fmtPHP(monthRev) },
                  { label: 'Lifetime',   value: fmtPHP(lifetimeRev) },
                ].map((c) => (
                  <View key={c.label} style={styles.revenueCard}>
                    <Text style={styles.revenueValue}>{c.value}</Text>
                    <Text style={styles.revenueLabel}>{c.label}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Metrics */}
            <Text style={styles.sectionLabel}>Metrics</Text>
            <View style={styles.metricsGrid}>
              {METRICS.map((m) => (
                <View key={m.label} style={styles.metricCard}>
                  <View style={[styles.metricIcon, { backgroundColor: m.bg }]}>
                    <Ionicons name={m.icon as React.ComponentProps<typeof Ionicons>['name']} size={18} color={m.color} />
                  </View>
                  <Text style={styles.metricValue}>{m.value}</Text>
                  <Text style={styles.metricLabel}>{m.label}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Recent Transactions</Text>
          </View>
        )}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Ionicons name="sparkles-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyText}>No featured transactions yet</Text>
          </View>
        )}
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
    backgroundColor: COLORS.surface,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  title: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text },
  list:  { padding: SPACING.md, gap: SPACING.sm },
  sectionLabel: {
    fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold,
    color: COLORS.textSecondary, marginTop: SPACING.sm, marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  revenueRow: { flexDirection: 'row', gap: SPACING.sm },
  revenueCard: {
    flex: 1, backgroundColor: '#FEF3C7', borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: '#FDE68A', ...SHADOWS.small,
  },
  revenueValue: { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: '#B45309' },
  revenueLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, textAlign: 'center' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  metricCard: {
    width: '47%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  metricIcon:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  metricValue: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.text },
  metricLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, textAlign: 'center' },
  txRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  txLeft:     { flex: 1, marginRight: SPACING.md },
  txProvider: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  txDate:     { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 4 },
  txRight:    { alignItems: 'flex-end', gap: SPACING.xs },
  txAmount:   { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.text },
  statusBadge: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  statusText:  { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, textTransform: 'capitalize' },
  empty:     { alignItems: 'center', paddingTop: SPACING.xl, gap: SPACING.sm },
  emptyText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary },
});
