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

  // ServiceHub platform income ONLY — bookings belong to providers, not ServiceHub
  const platformRevenue: RevenueSource = {
    today:     featured.today     + tips.today,
    thisMonth: featured.thisMonth + tips.thisMonth,
    lifetime:  featured.lifetime  + tips.lifetime,
  };

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
        {/* ── ServiceHub Revenue ───────────────────────────── */}
        <Text style={styles.sectionLabel}>💰 ServiceHub Revenue</Text>
        <View style={styles.totalsRow}>
          {[
            { label: 'Today',      value: fmtPHP(platformRevenue.today) },
            { label: 'This Month', value: fmtPHP(platformRevenue.thisMonth) },
            { label: 'Lifetime',   value: fmtPHP(platformRevenue.lifetime) },
          ].map((c) => (
            <View key={c.label} style={[styles.totalCard, styles.platformCard]}>
              <Text style={[styles.totalValue, { color: COLORS.primary }]}>{c.value}</Text>
              <Text style={styles.totalLabel}>{c.label}</Text>
            </View>
          ))}
        </View>

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
          <View style={styles.sourceTotals}>
            {[
              { label: 'Today',    value: fmtPHP(featured.today) },
              { label: 'Month',    value: fmtPHP(featured.thisMonth) },
              { label: 'Lifetime', value: fmtPHP(featured.lifetime) },
            ].map((s) => (
              <View key={s.label} style={styles.sourceStat}>
                <Text style={[styles.sourceStatValue, { color: '#B45309' }]}>{s.value}</Text>
                <Text style={styles.sourceStatLabel}>{s.label}</Text>
              </View>
            ))}
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
          <View style={styles.sourceTotals}>
            {[
              { label: 'Today',    value: fmtPHP(tips.today) },
              { label: 'Month',    value: fmtPHP(tips.thisMonth) },
              { label: 'Lifetime', value: fmtPHP(tips.lifetime) },
            ].map((s) => (
              <View key={s.label} style={styles.sourceStat}>
                <Text style={[styles.sourceStatValue, { color: '#E11D48' }]}>{s.value}</Text>
                <Text style={styles.sourceStatLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>

        {/* ── Provider Economy ─────────────────────────────── */}
        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>👷 Provider Economy</Text>
        <Text style={styles.economyDisclaimer}>
          Earnings generated by providers through completed bookings. Not included in ServiceHub Revenue.
        </Text>
        <View style={styles.totalsRow}>
          {[
            { label: 'Today',      value: fmtPHP(bookings.today) },
            { label: 'This Month', value: fmtPHP(bookings.thisMonth) },
            { label: 'Lifetime',   value: fmtPHP(bookings.lifetime) },
          ].map((c) => (
            <View key={c.label} style={[styles.totalCard, styles.economyCard]}>
              <Text style={[styles.totalValue, { color: COLORS.success }]}>{c.value}</Text>
              <Text style={styles.totalLabel}>{c.label}</Text>
            </View>
          ))}
        </View>

        {/* Service Bookings — analytics only, no drill-down */}
        <View style={[styles.sourceCard, { borderColor: '#BBF7D0' }]}>
          <View style={styles.sourceHeader}>
            <View style={[styles.sourceIcon, { backgroundColor: '#DCFCE7' }]}>
              <Ionicons name="calendar-outline" size={20} color={COLORS.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sourceTitle}>Service Bookings</Text>
              <Text style={styles.sourceSub}>Customer payments for completed bookings</Text>
            </View>
          </View>
          <View style={styles.sourceTotals}>
            {[
              { label: 'Today',    value: fmtPHP(bookings.today) },
              { label: 'Month',    value: fmtPHP(bookings.thisMonth) },
              { label: 'Lifetime', value: fmtPHP(bookings.lifetime) },
            ].map((s) => (
              <View key={s.label} style={styles.sourceStat}>
                <Text style={[styles.sourceStatValue, { color: COLORS.success }]}>{s.value}</Text>
                <Text style={styles.sourceStatLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>

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
  platformCard: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  economyCard:  { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  totalValue:   { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: COLORS.text },
  totalLabel:   { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, textAlign: 'center' },
  divider: {
    height: 1, backgroundColor: COLORS.border,
    marginTop: SPACING.md, marginBottom: SPACING.xs,
  },
  economyDisclaimer: {
    fontSize: FONTS.sizes.xs, color: COLORS.textSecondary,
    marginBottom: SPACING.sm, lineHeight: 18,
  },
  sourceCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1.5, ...SHADOWS.small,
  },
  sourceHeader:    { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  sourceIcon:      { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sourceTitle:     { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  sourceSub:       { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 1 },
  sourceTotals:    { flexDirection: 'row', gap: SPACING.sm, paddingTop: SPACING.xs, borderTopWidth: 1, borderTopColor: COLORS.border },
  sourceStat:      { flex: 1, alignItems: 'center', gap: 2 },
  sourceStatValue: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.bold },
  sourceStatLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
});
