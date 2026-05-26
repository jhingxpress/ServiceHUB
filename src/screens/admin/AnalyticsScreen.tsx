import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

interface Analytics {
  bookingsByStatus: Record<string, number>;
  topCategories: { name: string; count: number }[];
  recentSignups: number;
  avgRating: number;
}

export default function AnalyticsScreen() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [bookingsRes, catsRes, signupsRes, reviewsRes] = await Promise.all([
        supabase.from('bookings').select('status'),
        supabase
          .from('bookings')
          .select('providers!bookings_provider_id_fkey(category:categories(name))')
          .eq('status', 'completed'),
        supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
        supabase.from('reviews').select('rating'),
      ]);

      const byStatus: Record<string, number> = {};
      (bookingsRes.data ?? []).forEach((b: { status: string }) => {
        byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
      });

      const catCount: Record<string, number> = {};
      (catsRes.data ?? []).forEach((b: unknown) => {
        const cat = (b as { providers: { category: { name: string } | null } | null })
          ?.providers?.category?.name;
        if (cat) catCount[cat] = (catCount[cat] ?? 0) + 1;
      });

      const topCats = Object.entries(catCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      const ratings = (reviewsRes.data ?? []).map((r: { rating: number }) => r.rating);
      const avg = ratings.length ? ratings.reduce((s: number, r: number) => s + r, 0) / ratings.length : 0;

      setData({
        bookingsByStatus: byStatus,
        topCategories: topCats,
        recentSignups: signupsRes.count ?? 0,
        avgRating: avg,
      });
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const STATUS_COLORS: Record<string, string> = {
    pending: COLORS.warning,
    accepted: COLORS.primary,
    in_progress: '#06B6D4',
    completed: COLORS.success,
    cancelled: COLORS.error,
    rejected: '#6B7280',
  };

  const maxCatCount = Math.max(...(data?.topCategories.map((c) => c.count) ?? [1]), 1);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Analytics</Text>
        </View>

        {/* KPI Row */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Ionicons name="people-outline" size={22} color={COLORS.primary} />
            <Text style={styles.kpiValue}>{data?.recentSignups}</Text>
            <Text style={styles.kpiLabel}>New users (7d)</Text>
          </View>
          <View style={styles.kpiCard}>
            <Ionicons name="star" size={22} color="#F59E0B" />
            <Text style={styles.kpiValue}>{data?.avgRating.toFixed(1)}</Text>
            <Text style={styles.kpiLabel}>Avg Rating</Text>
          </View>
        </View>

        {/* Bookings by status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bookings by Status</Text>
          {Object.entries(data?.bookingsByStatus ?? {}).map(([status, count]) => {
            const total = Object.values(data?.bookingsByStatus ?? {}).reduce((s, c) => s + c, 0);
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <View key={status} style={styles.barRow}>
                <Text style={styles.barLabel}>{status.replace('_', ' ')}</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${pct}%`,
                        backgroundColor: STATUS_COLORS[status] ?? COLORS.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.barCount}>{count}</Text>
              </View>
            );
          })}
        </View>

        {/* Top categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Service Categories</Text>
          {(data?.topCategories ?? []).map((cat, i) => (
            <View key={cat.name} style={styles.catRow}>
              <Text style={styles.catRank}>#{i + 1}</Text>
              <Text style={styles.catName}>{cat.name}</Text>
              <View style={styles.catBarTrack}>
                <View
                  style={[
                    styles.catBarFill,
                    { width: `${(cat.count / maxCatCount) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.catCount}>{cat.count}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text },
  kpiRow: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  kpiCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg, alignItems: 'center', gap: SPACING.xs,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  kpiValue: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text },
  kpiLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, textAlign: 'center' },
  section: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.lg,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  sectionTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  barLabel: { fontSize: FONTS.sizes.sm, color: COLORS.text, width: 80, textTransform: 'capitalize' },
  barTrack: { flex: 1, height: 10, backgroundColor: COLORS.border, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5, minWidth: 4 },
  barCount: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text, width: 28, textAlign: 'right' },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  catRank: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.primary, width: 24 },
  catName: { fontSize: FONTS.sizes.sm, color: COLORS.text, width: 90 },
  catBarTrack: { flex: 1, height: 8, backgroundColor: COLORS.border, borderRadius: 4, overflow: 'hidden' },
  catBarFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 4, minWidth: 4 },
  catCount: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text, width: 28, textAlign: 'right' },
});
