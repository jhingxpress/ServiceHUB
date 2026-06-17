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
import { AdminStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

interface TipRow {
  id: string;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  user_id: string | null;
}

function fmtPHP(centavos: number) {
  return `₱${Math.round(centavos / 100).toLocaleString()}`;
}

export default function TipsRevenueScreen() {
  const navigation = useNavigation<NavProp>();
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [todayRev, setTodayRev]       = useState(0);
  const [monthRev, setMonthRev]       = useState(0);
  const [lifetimeRev, setLifetimeRev] = useState(0);
  const [contributors, setContributors] = useState(0);
  const [avgTip, setAvgTip]           = useState(0);
  const [largestTip, setLargestTip]   = useState(0);
  const [tips, setTips]               = useState<TipRow[]>([]);

  const loadData = useCallback(async () => {
    const todayStart = startOfDay(new Date()).toISOString();
    const monthStart = startOfMonth(new Date()).toISOString();

    const { data, error } = await supabase
      .from('servicehub_tips')
      .select('id, amount, status, paid_at, created_at, user_id')
      .eq('status', 'paid')
      .order('paid_at', { ascending: false });

    if (error) { setLoading(false); setRefreshing(false); return; }

    const rows = (data ?? []) as TipRow[];
    setTips(rows);

    let today = 0, month = 0, lifetime = 0, max = 0;
    const uniqueUsers = new Set<string>();

    rows.forEach((t) => {
      const date = t.paid_at ?? t.created_at;
      const amt  = Number(t.amount) || 0;
      lifetime += amt;
      if (date >= monthStart) month += amt;
      if (date >= todayStart) today += amt;
      if (t.user_id) uniqueUsers.add(t.user_id);
      if (amt > max) max = amt;
    });

    setTodayRev(today);
    setMonthRev(month);
    setLifetimeRev(lifetime);
    setContributors(uniqueUsers.size);
    setAvgTip(rows.length > 0 ? Math.round(lifetime / rows.length) : 0);
    setLargestTip(max);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); loadData(); }, [loadData]));

  const renderTip = ({ item }: { item: TipRow }) => {
    const displayDate = item.paid_at ?? item.created_at;
    return (
      <View style={styles.tipRow}>
        <View style={styles.tipIconWrap}>
          <Ionicons name="heart" size={14} color="#E11D48" />
        </View>
        <View style={styles.tipLeft}>
          <Text style={styles.tipAmount}>{fmtPHP(Number(item.amount))}</Text>
          <Text style={styles.tipDate}>{format(new Date(displayDate), 'MMM d, yyyy · h:mm a')}</Text>
        </View>
        <View style={styles.tipStatusBadge}>
          <Text style={styles.tipStatusText}>{item.status}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color="#E11D48" size="large" /></View>
      </SafeAreaView>
    );
  }

  const METRICS = [
    { icon: 'people-outline',   color: '#7C3AED', bg: '#EDE9FE',          label: 'Total Contributors', value: String(contributors) },
    { icon: 'analytics-outline',color: COLORS.primary, bg: COLORS.primaryLight, label: 'Average Tip',  value: fmtPHP(avgTip) },
    { icon: 'trophy-outline',   color: '#D97706', bg: '#FEF3C7',          label: 'Largest Tip',        value: fmtPHP(largestTip) },
  ] as const;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>❤️ Tips Revenue</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={tips}
        keyExtractor={(item) => item.id}
        renderItem={renderTip}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor="#E11D48"
          />
        }
        contentContainerStyle={styles.list}
        ListHeaderComponent={(
          <View>
            {/* Revenue summary */}
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

            {/* Metrics */}
            <Text style={styles.sectionLabel}>Metrics</Text>
            <View style={styles.metricsRow}>
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

            <Text style={styles.sectionLabel}>Recent Contributions</Text>
          </View>
        )}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyText}>No tips received yet</Text>
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
    flex: 1, backgroundColor: '#FFF1F2', borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: '#FECDD3', ...SHADOWS.small,
  },
  revenueValue: { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: '#E11D48' },
  revenueLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, textAlign: 'center' },
  metricsRow: { flexDirection: 'row', gap: SPACING.sm },
  metricCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.sm, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  metricIcon:  { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  metricValue: { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: COLORS.text },
  metricLabel: { fontSize: 10, color: COLORS.textSecondary, textAlign: 'center' },
  tipRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  tipIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FFF1F2', alignItems: 'center', justifyContent: 'center',
  },
  tipLeft:        { flex: 1 },
  tipAmount:      { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: COLORS.text },
  tipDate:        { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 2 },
  tipStatusBadge: {
    backgroundColor: '#D1FAE5', borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  tipStatusText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: '#065F46', textTransform: 'capitalize' },
  empty:     { alignItems: 'center', paddingTop: SPACING.xl, gap: SPACING.sm },
  emptyText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary },
});
