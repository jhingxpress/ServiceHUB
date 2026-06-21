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

interface EconomyRow {
  id: string;
  amount: number;
  status: string;
  created_at: string;
}

interface BookingRow {
  id: string;
  created_at: string;
  service?: { name: string | null } | null;
}

interface MonthlyPoint {
  label: string;
  revenue: number;
  bookings: number;
}

interface TopService {
  name: string;
  count: number;
  revenue: number;
}

function fmtPHP(n: number) {
  return `₱${Math.round(n).toLocaleString()}`;
}

export default function ProviderEconomyScreen() {
  const navigation = useNavigation<NavProp>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todayRev, setTodayRev] = useState(0);
  const [monthRev, setMonthRev] = useState(0);
  const [lifetimeRev, setLifetimeRev] = useState(0);
  const [totalBookings, setTotalBookings] = useState(0);
  const [avgBookingValue, setAvgBookingValue] = useState(0);
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([]);
  const [topServices, setTopServices] = useState<TopService[]>([]);
  const [avgMonthlyRev, setAvgMonthlyRev] = useState(0);
  const [bestMonth, setBestMonth] = useState<MonthlyPoint | null>(null);

  const loadData = useCallback(async () => {
    const todayStart = startOfDay(new Date()).toISOString();
    const monthStart = startOfMonth(new Date()).toISOString();

    const [paymentsRes, bookingsRes] = await Promise.all([
      supabase
        .from('payments')
        .select('id, amount, status, created_at')
        .eq('status', 'completed')
        .order('created_at', { ascending: false }),
      supabase
        .from('bookings')
        .select('id, created_at, service:services(name)')
        .eq('status', 'completed')
        .order('created_at', { ascending: false }),
    ]);

    const payments = (paymentsRes.data ?? []) as EconomyRow[];
    const bookings = (bookingsRes.data ?? []) as unknown as BookingRow[];

    // Revenue aggregates
    let today = 0, month = 0, lifetime = 0;
    payments.forEach((p) => {
      const date = p.created_at ?? '';
      const amt = Number(p.amount) || 0;
      lifetime += amt;
      if (date >= monthStart) month += amt;
      if (date >= todayStart) today += amt;
    });

    setTodayRev(today);
    setMonthRev(month);
    setLifetimeRev(lifetime);

    // Booking aggregates
    setTotalBookings(bookings.length);
    setAvgBookingValue(bookings.length > 0 ? Math.round(lifetime / bookings.length) : 0);

    // Monthly breakdown
    const monthMap: Record<string, MonthlyPoint> = {};
    payments.forEach((p) => {
      const date = p.created_at;
      if (!date) return;
      const d = new Date(date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (!monthMap[key]) monthMap[key] = { label, revenue: 0, bookings: 0 };
      monthMap[key].revenue += Number(p.amount) || 0;
    });
    bookings.forEach((b) => {
      const date = b.created_at;
      if (!date) return;
      const d = new Date(date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      if (!monthMap[key]) monthMap[key] = { label, revenue: 0, bookings: 0 };
      monthMap[key].bookings += 1;
    });

    const sortedMonthly = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
    setMonthly(sortedMonthly);

    // Top services
    const serviceMap: Record<string, { count: number; revenue: number }> = {};
    bookings.forEach((b) => {
      const name = b.service?.name ?? 'Unknown Service';
      if (!serviceMap[name]) serviceMap[name] = { count: 0, revenue: 0 };
      serviceMap[name].count += 1;
    });
    // Approximate revenue per service by distributing total proportionally by booking count
    const sortedServices = Object.entries(serviceMap)
      .map(([name, data]) => ({
        name,
        count: data.count,
        revenue: bookings.length > 0 ? Math.round((data.count / bookings.length) * lifetime) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    setTopServices(sortedServices);

    // Derived metrics
    const avgMonthly = sortedMonthly.length > 0 ? Math.round(lifetime / sortedMonthly.length) : 0;
    setAvgMonthlyRev(avgMonthly);
    const best = sortedMonthly.length > 0
      ? sortedMonthly.reduce((b, m) => (m.revenue > b.revenue ? m : b), sortedMonthly[0])
      : null;
    setBestMonth(best);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); loadData(); }, [loadData]));

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={COLORS.success} size="large" /></View>
      </SafeAreaView>
    );
  }

  const METRICS = [
    { icon: 'calendar-outline', color: COLORS.success, bg: '#DCFCE7', label: 'Total Bookings', value: String(totalBookings) },
    { icon: 'analytics-outline', color: COLORS.primary, bg: COLORS.primaryLight, label: 'Avg Booking Value', value: fmtPHP(avgBookingValue) },
    { icon: 'trending-up-outline', color: '#7C3AED', bg: '#EDE9FE', label: 'Avg Monthly Rev', value: fmtPHP(avgMonthlyRev) },
  ] as const;

  const maxMonthlyRev = Math.max(...monthly.map((m) => m.revenue), 1);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>👷 Provider Economy</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor={COLORS.success}
          />
        }
        contentContainerStyle={styles.scroll}
      >
        {/* Revenue summary */}
        <View style={styles.revenueRow}>
          {[
            { label: 'Today', value: fmtPHP(todayRev) },
            { label: 'This Month', value: fmtPHP(monthRev) },
            { label: 'Lifetime', value: fmtPHP(lifetimeRev) },
          ].map((c) => (
            <View key={c.label} style={styles.revenueCard}>
              <Text style={styles.revenueValue}>{c.value}</Text>
              <Text style={styles.revenueLabel}>{c.label}</Text>
            </View>
          ))}
        </View>

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

        {/* Best Month */}
        {bestMonth && (
          <>
            <Text style={styles.sectionLabel}>Best Month</Text>
            <View style={styles.bestMonthCard}>
              <View style={[styles.metricIcon, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="trophy-outline" size={18} color="#B45309" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bestMonthLabel}>{bestMonth.label}</Text>
                <Text style={styles.bestMonthSub}>{bestMonth.bookings} booking{bestMonth.bookings !== 1 ? 's' : ''}</Text>
              </View>
              <Text style={styles.bestMonthValue}>{fmtPHP(bestMonth.revenue)}</Text>
            </View>
          </>
        )}

        {/* Monthly Trend */}
        {monthly.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Monthly Trend</Text>
            <View style={styles.chartCard}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chartBody}>
                  {monthly.map((m) => (
                    <View key={m.label} style={styles.chartColumn}>
                      <Text style={styles.barValue}>{fmtPHP(m.revenue)}</Text>
                      <View style={styles.barWrap}>
                        <View style={[styles.bar, { height: `${(m.revenue / maxMonthlyRev) * 100}%` }]} />
                      </View>
                      <Text style={styles.chartXLabel} numberOfLines={1}>{m.label}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </>
        )}

        {/* Monthly Breakdown */}
        <Text style={styles.sectionLabel}>Monthly Breakdown</Text>
        {monthly.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyText}>No completed bookings yet</Text>
          </View>
        ) : (
          monthly.map((m) => (
            <View key={m.label} style={styles.breakdownRow}>
              <View style={styles.breakdownLeft}>
                <Text style={styles.breakdownLabel}>{m.label}</Text>
                <Text style={styles.breakdownSub}>{m.bookings} booking{m.bookings !== 1 ? 's' : ''}</Text>
              </View>
              <Text style={styles.breakdownValue}>{fmtPHP(m.revenue)}</Text>
            </View>
          ))
        )}

        {/* Top Services */}
        <Text style={styles.sectionLabel}>Top Services</Text>
        {topServices.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="briefcase-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyText}>No service data available</Text>
          </View>
        ) : (
          topServices.map((s, i) => (
            <View key={s.name} style={styles.serviceRow}>
              <View style={[styles.rankBadge, { backgroundColor: i === 0 ? '#FEF3C7' : i === 1 ? '#F3F4F6' : i === 2 ? '#FEF3C7' : COLORS.surfaceSecondary }]}>
                <Text style={[styles.rankText, { color: i === 0 ? '#B45309' : COLORS.textSecondary }]}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceName} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.serviceSub}>{s.count} booking{s.count !== 1 ? 's' : ''}</Text>
              </View>
              <Text style={styles.serviceValue}>{fmtPHP(s.revenue)}</Text>
            </View>
          ))
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
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
  title:        { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text },
  scroll:       { padding: SPACING.md, gap: SPACING.sm },
  sectionLabel: {
    fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold,
    color: COLORS.textSecondary, marginTop: SPACING.sm, marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  revenueRow: { flexDirection: 'row', gap: SPACING.sm },
  revenueCard: {
    flex: 1, backgroundColor: '#DCFCE7', borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: '#BBF7D0', ...SHADOWS.small,
  },
  revenueValue: { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: '#065F46' },
  revenueLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, textAlign: 'center' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  metricCard: {
    width: '31%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.sm, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  metricIcon:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  metricValue: { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: COLORS.text },
  metricLabel: { fontSize: 10, color: COLORS.textSecondary, textAlign: 'center' },
  chartCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  chartBody: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.md, paddingHorizontal: SPACING.xs },
  chartColumn: { alignItems: 'center', width: 60 },
  barWrap: { width: 24, height: 120, justifyContent: 'flex-end', backgroundColor: COLORS.surfaceSecondary, borderRadius: BORDER_RADIUS.sm, overflow: 'hidden' },
  bar: { width: '100%', borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.success },
  barValue: { fontSize: 9, fontFamily: FONTS.medium, color: COLORS.textSecondary, marginBottom: 2 },
  chartXLabel: { fontSize: 9, fontFamily: FONTS.medium, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center' },
  breakdownRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
    marginBottom: SPACING.sm,
  },
  breakdownLeft: { flex: 1, marginRight: SPACING.sm },
  breakdownLabel: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  breakdownSub:   { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 2 },
  breakdownValue: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.success },
  serviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
    marginBottom: SPACING.sm,
  },
  rankBadge: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  rankText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.bold },
  serviceName:  { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  serviceSub:     { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 2 },
  serviceValue:   { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: COLORS.text },
  empty:     { alignItems: 'center', paddingTop: SPACING.xl, gap: SPACING.sm },
  emptyText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary },
  bestMonthCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: '#FFFBEB', borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: '#FDE68A', ...SHADOWS.small,
  },
  bestMonthLabel: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  bestMonthSub:   { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 2 },
  bestMonthValue: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: '#B45309' },
});
