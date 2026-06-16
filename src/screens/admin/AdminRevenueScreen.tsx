import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format, startOfDay, startOfMonth } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { AdminStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

type PeriodFilter = '7d' | '30d' | '90d' | 'all';

const PERIODS: { label: string; value: PeriodFilter }[] = [
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
  { label: 'All Time', value: 'all' },
];

const PAYMENT_STATUS_CFG: Record<string, { bg: string; color: string }> = {
  completed: { bg: COLORS.successLight, color: '#065F46' },
  pending:   { bg: '#FEF3C7',           color: '#92400E' },
  failed:    { bg: COLORS.errorLight,   color: '#991B1B' },
  refunded:  { bg: '#EDE9FE',           color: '#5B21B6' },
};

interface Payment {
  id: string;
  amount: number;
  status: string;
  payment_method: string | null;
  created_at: string;
  booking: {
    id: string;
    status: string;
    customer: { full_name: string | null } | null;
    service: { name: string } | null;
  } | null;
}

interface Summary {
  totalRevenue: number;
  paidCount: number;
  pendingAmount: number;
  refundedAmount: number;
  failedCount: number;
}

interface TipRow {
  id: string;
  amount: number;
  paid_at: string | null;
  created_at: string;
}

interface TipStats {
  today: number;
  thisMonth: number;
  lifetime: number;
  recent: TipRow[];
}

function getPeriodStart(period: PeriodFilter): string | null {
  if (period === 'all') return null;
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export default function AdminRevenueScreen() {
  const navigation = useNavigation<NavProp>();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<Summary>({ totalRevenue: 0, paidCount: 0, pendingAmount: 0, refundedAmount: 0, failedCount: 0 });
  const [period, setPeriod] = useState<PeriodFilter>('30d');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tipStats, setTipStats] = useState<TipStats>({ today: 0, thisMonth: 0, lifetime: 0, recent: [] });

  const loadData = useCallback(async () => {
    const since = getPeriodStart(period);
    let q = supabase
      .from('payments')
      .select(`
        id, amount, status, payment_method, created_at,
        booking:bookings(
          id, status,
          customer:users!bookings_customer_id_fkey(full_name),
          service:services(name)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (since) q = q.gte('created_at', since);

    const todayStart     = startOfDay(new Date()).toISOString();
    const monthStart     = startOfMonth(new Date()).toISOString();

    const [paymentsRes, tipsAllRes, tipsRecentRes] = await Promise.all([
      q,
      // All paid tips (for today/month/lifetime aggregates)
      supabase
        .from('servicehub_tips')
        .select('id, amount, paid_at, created_at')
        .eq('status', 'paid')
        .order('paid_at', { ascending: false }),
      // Most recent 5 paid tips for display
      supabase
        .from('servicehub_tips')
        .select('id, amount, paid_at, created_at')
        .eq('status', 'paid')
        .order('paid_at', { ascending: false })
        .limit(5),
    ]);

    if (paymentsRes.error) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const rows = (paymentsRes.data ?? []) as unknown as Payment[];
    setPayments(rows);

    const s: Summary = { totalRevenue: 0, paidCount: 0, pendingAmount: 0, refundedAmount: 0, failedCount: 0 };
    rows.forEach((p) => {
      const amt = Number(p.amount) || 0;
      if (p.status === 'completed') { s.totalRevenue += amt; s.paidCount++; }
      if (p.status === 'pending')  { s.pendingAmount += amt; }
      if (p.status === 'refunded') { s.refundedAmount += amt; }
      if (p.status === 'failed')   { s.failedCount++; }
    });
    setSummary(s);

    // Aggregate tip stats
    const allTips = (tipsAllRes.data ?? []) as TipRow[];
    const ts: TipStats = { today: 0, thisMonth: 0, lifetime: 0, recent: (tipsRecentRes.data ?? []) as TipRow[] };
    allTips.forEach((t) => {
      const paidDate = t.paid_at ?? t.created_at;
      const centavos = Number(t.amount) || 0;
      ts.lifetime += centavos;
      if (paidDate >= monthStart) ts.thisMonth += centavos;
      if (paidDate >= todayStart) ts.today     += centavos;
    });
    setTipStats(ts);

    setLoading(false);
    setRefreshing(false);
  }, [period]);

  useFocusEffect(useCallback(() => { setLoading(true); loadData(); }, [loadData]));

  const renderPayment = ({ item }: { item: Payment }) => {
    const cfg = PAYMENT_STATUS_CFG[item.status] ?? { bg: COLORS.border, color: COLORS.textSecondary };
    const booking = item.booking as Payment['booking'];
    const customer = booking?.customer as { full_name: string | null } | null;
    return (
      <TouchableOpacity
        style={styles.payCard}
        onPress={() => booking?.id && navigation.navigate('BookingDetail', { bookingId: booking.id })}
        activeOpacity={0.8}
      >
        <View style={styles.payLeft}>
          <Text style={styles.payService} numberOfLines={1}>{booking?.service?.name ?? 'Service'}</Text>
          <Text style={styles.payCustomer} numberOfLines={1}>{customer?.full_name ?? 'Customer'}</Text>
          <Text style={styles.payDate}>{format(new Date(item.created_at), 'MMM d, yyyy · h:mm a')}</Text>
          {item.payment_method && (
            <View style={styles.payMethodRow}>
              <Ionicons name="card-outline" size={11} color={COLORS.textLight} />
              <Text style={styles.payMethod}>{item.payment_method}</Text>
            </View>
          )}
        </View>
        <View style={styles.payRight}>
          <Text style={styles.payAmount}>₱{Number(item.amount).toLocaleString()}</Text>
          <View style={[styles.payStatus, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.payStatusText, { color: cfg.color }]}>{item.status}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Revenue</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Period filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.value}
            style={[styles.filterTab, period === p.value && styles.filterTabActive]}
            onPress={() => setPeriod(p.value)}
          >
            <Text style={[styles.filterText, period === p.value && styles.filterTextActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={payments}
          keyExtractor={(item) => item.id}
          renderItem={renderPayment}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadData(); }}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.summaryGrid}>
              {[
                { icon: 'cash-outline',         color: COLORS.success,  label: 'Revenue',         value: `₱${summary.totalRevenue.toLocaleString()}` },
                { icon: 'checkmark-circle-outline', color: COLORS.primary, label: 'Paid',          value: String(summary.paidCount) },
                { icon: 'time-outline',          color: COLORS.warning,  label: 'Pending',         value: `₱${summary.pendingAmount.toLocaleString()}` },
                { icon: 'return-up-back-outline',color: '#7C3AED',       label: 'Refunded',        value: `₱${summary.refundedAmount.toLocaleString()}` },
              ].map((card) => (
                <View key={card.label} style={styles.summaryCard}>
                  <Ionicons name={card.icon as React.ComponentProps<typeof Ionicons>['name']} size={22} color={card.color} />
                  <Text style={styles.summaryValue}>{card.value}</Text>
                  <Text style={styles.summaryLabel}>{card.label}</Text>
                </View>
              ))}
            </View>
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cash-outline" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyText}>No transactions in this period</Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.tipsSection}>
              <View style={styles.tipsSectionHeader}>
                <Ionicons name="heart" size={18} color='#E11D48' />
                <Text style={styles.tipsSectionTitle}>Support ServiceHub Tips</Text>
              </View>
              <View style={styles.tipsSummaryRow}>
                {[
                  { label: 'Today',      value: `₱${(tipStats.today / 100).toLocaleString()}` },
                  { label: 'This Month', value: `₱${(tipStats.thisMonth / 100).toLocaleString()}` },
                  { label: 'Lifetime',   value: `₱${(tipStats.lifetime / 100).toLocaleString()}` },
                ].map((s) => (
                  <View key={s.label} style={styles.tipsSummaryCard}>
                    <Text style={styles.tipsSummaryValue}>{s.value}</Text>
                    <Text style={styles.tipsSummaryLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>
              {tipStats.recent.length > 0 && (
                <View style={styles.tipsRecentSection}>
                  <Text style={styles.tipsRecentLabel}>Recent Contributions</Text>
                  {tipStats.recent.map((t) => (
                    <View key={t.id} style={styles.tipsRecentRow}>
                      <View style={styles.tipsRecentIcon}>
                        <Ionicons name="heart" size={14} color='#E11D48' />
                      </View>
                      <Text style={styles.tipsRecentAmount}>₱{(Number(t.amount) / 100).toLocaleString()}</Text>
                      <Text style={styles.tipsRecentDate}>
                        {format(new Date(t.paid_at ?? t.created_at), 'MMM d, yyyy · h:mm a')}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {tipStats.recent.length === 0 && (
                <Text style={styles.tipsEmptyText}>No tips received yet.</Text>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
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
  filterScroll: { maxHeight: 48, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  filterRow: { paddingHorizontal: SPACING.md, gap: SPACING.sm, alignItems: 'center', paddingVertical: SPACING.sm },
  filterTab: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border,
  },
  filterTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  filterTextActive: { fontFamily: FONTS.bold, color: COLORS.white },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, padding: SPACING.md },
  summaryCard: {
    flex: 1, minWidth: '45%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  summaryValue: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.text },
  summaryLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, textAlign: 'center' },
  list: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl, gap: SPACING.sm },
  payCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  payLeft: { flex: 1, marginRight: SPACING.md },
  payService: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  payCustomer: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  payDate: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 4 },
  payMethodRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  payMethod: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, textTransform: 'capitalize' },
  payRight: { alignItems: 'flex-end', gap: SPACING.xs },
  payAmount: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.text },
  payStatus: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  payStatusText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, textTransform: 'capitalize' },
  empty: { alignItems: 'center', paddingTop: SPACING.xxxl, gap: SPACING.md },
  emptyText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary },
  tipsSection: {
    marginHorizontal: SPACING.md, marginTop: SPACING.md, marginBottom: SPACING.xl,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: '#FECDD3', ...SHADOWS.small,
  },
  tipsSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  tipsSectionTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  tipsSummaryRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  tipsSummaryCard: {
    flex: 1, backgroundColor: '#FFF1F2', borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm, alignItems: 'center', gap: 2,
    borderWidth: 1, borderColor: '#FECDD3',
  },
  tipsSummaryValue: { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: '#E11D48' },
  tipsSummaryLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  tipsRecentSection: { gap: SPACING.sm },
  tipsRecentLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: 4 },
  tipsRecentRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  tipsRecentIcon: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#FFF1F2', alignItems: 'center', justifyContent: 'center',
  },
  tipsRecentAmount: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  tipsRecentDate: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  tipsEmptyText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
});
