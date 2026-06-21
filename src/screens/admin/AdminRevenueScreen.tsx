import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { startOfDay, startOfMonth } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { AdminStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

interface RevenueSource {
  today: number;
  thisMonth: number;
  lifetime: number;
}

interface MonthlyPoint {
  label: string;
  featured: number;
  tips: number;
  economy: number;
}

function fmtPHP(n: number) {
  return `₱${Math.round(n).toLocaleString()}`;
}

function aggSource(
  rows: any[],
  dateKey: string,
  todayStart: string,
  monthStart: string,
  divisor = 1,
): RevenueSource {
  const src: RevenueSource = { today: 0, thisMonth: 0, lifetime: 0 };
  rows.forEach((r) => {
    const date: string = r[dateKey] ?? r.created_at ?? '';
    const amt = (Number(r.amount) || 0) / divisor;
    src.lifetime += amt;
    if (date >= monthStart) src.thisMonth += amt;
    if (date >= todayStart) src.today += amt;
  });
  return src;
}

export default function AdminRevenueScreen() {
  const navigation = useNavigation<NavProp>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookings, setBookings] = useState<RevenueSource>({ today: 0, thisMonth: 0, lifetime: 0 });
  const [featured, setFeatured] = useState<RevenueSource>({ today: 0, thisMonth: 0, lifetime: 0 });
  const [tips, setTips] = useState<RevenueSource>({ today: 0, thisMonth: 0, lifetime: 0 });
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([]);

  const loadData = useCallback(async () => {
    const todayStart = startOfDay(new Date()).toISOString();
    const monthStart = startOfMonth(new Date()).toISOString();

    const [bookRes, featRes, tipsRes] = await Promise.all([
      supabase.from('payments').select('amount, created_at').eq('status', 'completed'),
      supabase.from('featured_payments').select('amount, paid_at').eq('status', 'paid'),
      supabase.from('servicehub_tips').select('amount, paid_at').eq('status', 'paid'),
    ]);

    setBookings(aggSource(bookRes.data ?? [], 'created_at', todayStart, monthStart));
    setFeatured(aggSource(featRes.data ?? [], 'paid_at', todayStart, monthStart));
    setTips(aggSource(tipsRes.data ?? [], 'paid_at', todayStart, monthStart, 100));

    // Build monthly grouped data for chart
    const monthMap: Record<string, { label: string; featured: number; tips: number; economy: number }> = {};
    const addToMonth = (rows: any[], dateKey: string, amountKey: string, field: 'featured' | 'tips' | 'economy', divisor = 1) => {
      rows.forEach((r) => {
        const date = r[dateKey] ?? r.created_at ?? '';
        if (!date) return;
        const d = new Date(date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        if (!monthMap[key]) monthMap[key] = { label, featured: 0, tips: 0, economy: 0 };
        monthMap[key][field] += (Number(r[amountKey]) || 0) / divisor;
      });
    };

    addToMonth(featRes.data ?? [], 'paid_at', 'amount', 'featured');
    addToMonth(tipsRes.data ?? [], 'paid_at', 'amount', 'tips', 100);
    addToMonth(bookRes.data ?? [], 'created_at', 'amount', 'economy');

    const sortedMonthly = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
    setMonthly(sortedMonthly);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); loadData(); }, [loadData]));

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Revenue Overview</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor={COLORS.primary}
          />
        }
        contentContainerStyle={styles.scroll}
      >
        {/* ── Platform Growth Trends Chart ───────────────────── */}
        {monthly.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Platform Growth Trends</Text>
            <View style={styles.chartCard}>
              {/* Legend */}
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.legendText}>Featured</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#E11D48' }]} />
                  <Text style={styles.legendText}>Tips</Text>
                </View>
              </View>

              {/* Grouped bars with value labels */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chartBody}>
                  {monthly.map((m) => {
                    const max = Math.max(m.featured, m.tips, 1);
                    return (
                      <View key={m.label} style={styles.chartColumn}>
                        <View style={styles.barGroup}>
                          <View style={styles.barCol}>
                            <Text style={styles.barValue}>{fmtPHP(m.featured)}</Text>
                            <View style={styles.barWrap}>
                              <View style={[styles.bar, { height: `${(m.featured / max) * 100}%`, backgroundColor: '#F59E0B' }]} />
                            </View>
                          </View>
                          <View style={styles.barCol}>
                            <Text style={styles.barValue}>{fmtPHP(m.tips)}</Text>
                            <View style={styles.barWrap}>
                              <View style={[styles.bar, { height: `${(m.tips / max) * 100}%`, backgroundColor: '#E11D48' }]} />
                            </View>
                          </View>
                        </View>
                        <Text style={styles.chartXLabel} numberOfLines={1}>{m.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </>
        )}

        {/* ── This Month ───────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>This Month</Text>
        <View style={styles.totalsRow}>
          {[
            { label: 'Featured', value: fmtPHP(featured.thisMonth), color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' },
            { label: 'Tips',     value: fmtPHP(tips.thisMonth),     color: '#E11D48', bg: '#FFF1F2', border: '#FECDD3' },
            { label: 'Economy',  value: fmtPHP(bookings.thisMonth), color: COLORS.success, bg: '#DCFCE7', border: '#BBF7D0' },
          ].map((c) => (
            <View key={c.label} style={[styles.totalCard, { backgroundColor: c.bg, borderColor: c.border }]}>
              <Text style={[styles.totalValue, { color: c.color }]}>{c.value}</Text>
              <Text style={styles.totalLabel}>{c.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Lifetime ───────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Lifetime</Text>
        <View style={styles.totalsRow}>
          {[
            { label: 'Featured', value: fmtPHP(featured.lifetime), color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' },
            { label: 'Tips',     value: fmtPHP(tips.lifetime),     color: '#E11D48', bg: '#FFF1F2', border: '#FECDD3' },
            { label: 'Economy',  value: fmtPHP(bookings.lifetime),  color: COLORS.success, bg: '#DCFCE7', border: '#BBF7D0' },
          ].map((c) => (
            <View key={c.label} style={[styles.totalCard, { backgroundColor: c.bg, borderColor: c.border }]}>
              <Text style={[styles.totalValue, { color: c.color }]}>{c.value}</Text>
              <Text style={styles.totalLabel}>{c.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Drill-down Cards ───────────────────────────────── */}
        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>Revenue Sources</Text>

        {/* Featured Revenue — drilldown */}
        <TouchableOpacity
          style={[styles.sourceCard, { borderColor: '#FDE68A' }]}
          onPress={() => navigation.navigate('FeaturedRevenue')}
          activeOpacity={0.85}
        >
          <View style={styles.sourceHeader}>
            <View style={[styles.sourceIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="sparkles" size={20} color={COLORS.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sourceTitle}>⭐ Featured Provider Revenue</Text>
              <Text style={styles.sourceSub}>Provider promotion payments</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
          </View>
        </TouchableOpacity>

        {/* Tips Revenue — drilldown */}
        <TouchableOpacity
          style={[styles.sourceCard, { borderColor: '#FECDD3' }]}
          onPress={() => navigation.navigate('TipsRevenue')}
          activeOpacity={0.85}
        >
          <View style={styles.sourceHeader}>
            <View style={[styles.sourceIcon, { backgroundColor: '#FFF1F2' }]}>
              <Ionicons name="heart" size={20} color="#E11D48" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sourceTitle}>❤️ Support Tips Revenue</Text>
              <Text style={styles.sourceSub}>Optional tips from customers</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
          </View>
        </TouchableOpacity>

        {/* Provider Economy */}
        <TouchableOpacity
          style={[styles.sourceCard, { borderColor: '#BBF7D0' }]}
          onPress={() => navigation.navigate('ProviderEconomy')}
          activeOpacity={0.85}
        >
          <View style={styles.sourceHeader}>
            <View style={[styles.sourceIcon, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="calendar-outline" size={20} color={COLORS.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sourceTitle}>👷 Provider Economy</Text>
              <Text style={styles.sourceSub}>Customer payments for completed bookings</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textSecondary} />
          </View>
        </TouchableOpacity>

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
  totalsRow: { flexDirection: 'row', gap: SPACING.sm },
  totalCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  totalValue:   { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: COLORS.text },
  totalLabel:   { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, textAlign: 'center' },
  divider: {
    height: 1, backgroundColor: COLORS.border,
    marginTop: SPACING.md, marginBottom: SPACING.xs,
  },
  chartCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: SPACING.md, marginBottom: SPACING.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.medium, color: COLORS.textSecondary },
  chartBody: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.md, paddingHorizontal: SPACING.xs },
  chartColumn: { alignItems: 'center', width: 50 },
  barGroup: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 120 },
  barCol: { alignItems: 'center' },
  barValue: { fontSize: 9, fontFamily: FONTS.medium, color: COLORS.textSecondary, marginBottom: 2 },
  barWrap: { width: 12, height: '100%', justifyContent: 'flex-end', backgroundColor: COLORS.surfaceSecondary, borderRadius: BORDER_RADIUS.sm, overflow: 'hidden' },
  bar: { width: '100%', borderRadius: BORDER_RADIUS.sm },
  chartXLabel: { fontSize: 9, fontFamily: FONTS.medium, color: COLORS.textSecondary, marginTop: 4, textAlign: 'center' },
  sourceCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1.5, ...SHADOWS.small,
  },
  sourceHeader:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  sourceIcon:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sourceTitle:     { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  sourceSub:       { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 1 },
});
