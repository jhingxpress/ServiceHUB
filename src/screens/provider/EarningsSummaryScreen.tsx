import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../../constants/theme';
import { ProviderStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;

interface MonthlyData {
  label: string;
  amount: number;
}

interface ServiceEarning {
  name: string;
  amount: number;
  bookings: number;
}

interface SummaryData {
  lifetime: number;
  avgMonthly: number;
  highestMonth: MonthlyData | null;
  totalBookings: number;
  avgPerBooking: number;
  monthly: MonthlyData[];
  topServices: ServiceEarning[];
}

function fmtPHP(n: number) {
  return `₱${Math.round(n).toLocaleString()}`;
}

function getMonthKey(d: string): string {
  const date = parseISO(d);
  return format(date, 'yyyy-MM');
}

function getMonthLabel(d: string): string {
  const date = parseISO(d);
  return format(date, 'MMM yyyy');
}

export default function EarningsSummaryScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const { data: rows } = await supabase
        .from('bookings')
        .select('total_amount, created_at, service_id, services(name)')
        .eq('provider_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: true });

      const bookings = (rows ?? []) as unknown as Array<{
        total_amount: number | null;
        created_at: string;
        service_id: string | null;
        services: { name: string } | null;
      }>;

      const validBookings = bookings.filter((b) => b.total_amount != null && b.total_amount > 0);

      // Monthly grouping
      const monthMap: Record<string, { amount: number; label: string }> = {};
      validBookings.forEach((b) => {
        const key = getMonthKey(b.created_at);
        const label = getMonthLabel(b.created_at);
        if (!monthMap[key]) monthMap[key] = { amount: 0, label };
        monthMap[key].amount += Number(b.total_amount);
      });

      const monthly = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => ({ label: v.label, amount: v.amount }));

      // Service grouping
      const serviceMap: Record<string, { amount: number; bookings: number }> = {};
      validBookings.forEach((b) => {
        const name = b.services?.name ?? 'Unknown Service';
        if (!serviceMap[name]) serviceMap[name] = { amount: 0, bookings: 0 };
        serviceMap[name].amount += Number(b.total_amount);
        serviceMap[name].bookings += 1;
      });

      const topServices = Object.entries(serviceMap)
        .map(([name, v]) => ({ name, amount: v.amount, bookings: v.bookings }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      const lifetime = validBookings.reduce((sum, b) => sum + Number(b.total_amount), 0);
      const totalBookings = validBookings.length;
      const avgPerBooking = totalBookings > 0 ? lifetime / totalBookings : 0;
      const avgMonthly = monthly.length > 0 ? lifetime / monthly.length : 0;
      const highestMonth = monthly.length > 0
        ? monthly.reduce((max, m) => (m.amount > max.amount ? m : max), monthly[0])
        : null;

      setData({ lifetime, avgMonthly, highestMonth, totalBookings, avgPerBooking, monthly, topServices });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Earnings Summary</Text>
          <View style={styles.backBtnPlaceholder} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const maxMonthly = data && data.monthly.length > 0
    ? Math.max(...data.monthly.map((m) => m.amount))
    : 1;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Earnings Summary</Text>
          <View style={styles.backBtnPlaceholder} />
        </View>

        {/* Lifetime Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{fmtPHP(data?.lifetime ?? 0)}</Text>
            <Text style={styles.statLabel}>Lifetime Earnings</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{fmtPHP(data?.avgMonthly ?? 0)}</Text>
            <Text style={styles.statLabel}>Avg Monthly</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{fmtPHP(data?.highestMonth?.amount ?? 0)}</Text>
            <Text style={styles.statLabel}>Highest Month</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{data?.totalBookings ?? 0}</Text>
            <Text style={styles.statLabel}>Total Bookings</Text>
          </View>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{fmtPHP(data?.avgPerBooking ?? 0)}</Text>
            <Text style={styles.statLabel}>Avg Per Booking</Text>
          </View>
        </View>

        {/* Monthly Trend */}
        {data && data.monthly.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Monthly Trend</Text>
            <View style={styles.chartCard}>
              {data.monthly.map((m) => {
                const pct = maxMonthly > 0 ? (m.amount / maxMonthly) * 100 : 0;
                return (
                  <View key={m.label} style={styles.chartRow}>
                    <Text style={styles.chartLabel} numberOfLines={1}>{m.label}</Text>
                    <View style={styles.chartBarWrap}>
                      <View style={[styles.chartBar, { width: `${pct}%` }]} />
                    </View>
                    <Text style={styles.chartValue}>{fmtPHP(m.amount)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Monthly Breakdown */}
        {data && data.monthly.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
            <View style={styles.listCard}>
              {[...data.monthly].reverse().map((m, idx) => (
                <View key={m.label} style={[styles.listRow, idx === data.monthly.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.listName}>{m.label}</Text>
                  <Text style={styles.listAmount}>{fmtPHP(m.amount)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Top Earning Services */}
        {data && data.topServices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Earning Services</Text>
            <View style={styles.listCard}>
              {data.topServices.map((svc, idx) => (
                <View key={svc.name} style={[styles.listRow, idx === data.topServices.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={styles.listLeft}>
                    <Text style={styles.listRank}>#{idx + 1}</Text>
                    <View>
                      <Text style={styles.listName}>{svc.name}</Text>
                      <Text style={styles.listSub}>{svc.bookings} booking{svc.bookings !== 1 ? 's' : ''}</Text>
                    </View>
                  </View>
                  <Text style={styles.listAmount}>{fmtPHP(svc.amount)}</Text>
                </View>
              ))}
            </View>
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
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: SPACING.md, gap: SPACING.sm, marginTop: SPACING.sm,
  },
  statBlock: {
    flex: 1, minWidth: '30%', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    gap: 2,
  },
  statValue: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.base, color: COLORS.text },
  statLabel: { fontFamily: FONTS.medium, fontSize: 10, color: COLORS.textSecondary, textAlign: 'center' },
  section: { marginTop: SPACING.lg, paddingHorizontal: SPACING.md },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.lg, color: COLORS.text, marginBottom: SPACING.sm },
  chartCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  chartLabel: { width: 70, fontFamily: FONTS.medium, fontSize: 11, color: COLORS.textSecondary },
  chartBarWrap: {
    flex: 1, height: 20, backgroundColor: COLORS.surfaceSecondary,
    borderRadius: BORDER_RADIUS.sm, overflow: 'hidden',
  },
  chartBar: {
    height: '100%', backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.sm,
  },
  chartValue: { width: 80, fontFamily: FONTS.bold, fontSize: FONTS.sizes.xs, color: COLORS.text, textAlign: 'right' },
  listCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  listRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  listLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  listRank: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.sm, color: COLORS.primary, width: 24 },
  listName: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.sm, color: COLORS.text },
  listSub: { fontFamily: FONTS.regular, fontSize: 10, color: COLORS.textSecondary },
  listAmount: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.sm, color: COLORS.text },
  bottomPad: { height: 60 },
});
