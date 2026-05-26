import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { AdminStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

interface PlatformStats {
  totalUsers: number;
  totalProviders: number;
  pendingProviders: number;
  totalBookings: number;
  completedBookings: number;
  totalRevenue: number;
}

export default function AdminDashboardScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<PlatformStats>({
    totalUsers: 0,
    totalProviders: 0,
    pendingProviders: 0,
    totalBookings: 0,
    completedBookings: 0,
    totalRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = async () => {
    const [usersRes, provRes, pendingRes, bookingsRes, completedRes, revenueRes] =
      await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('providers').select('id', { count: 'exact', head: true }).eq('is_verified', true),
        supabase.from('providers').select('id', { count: 'exact', head: true }).eq('is_verified', false),
        supabase.from('bookings').select('id', { count: 'exact', head: true }),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        supabase.from('payments').select('amount').eq('status', 'completed'),
      ]);

    const revenue = (revenueRes.data ?? []).reduce(
      (s: number, p: { amount: number }) => s + p.amount,
      0
    );

    setStats({
      totalUsers: usersRes.count ?? 0,
      totalProviders: provRes.count ?? 0,
      pendingProviders: pendingRes.count ?? 0,
      totalBookings: bookingsRes.count ?? 0,
      completedBookings: completedRes.count ?? 0,
      totalRevenue: revenue,
    });
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { loadStats(); }, []);

  const STAT_CARDS = [
    { label: 'Total Users', value: stats.totalUsers, icon: 'people-outline', color: COLORS.primary },
    { label: 'Providers', value: stats.totalProviders, icon: 'briefcase-outline', color: '#8B5CF6' },
    { label: 'Pending KYC', value: stats.pendingProviders, icon: 'shield-outline', color: COLORS.warning, action: () => navigation.navigate('PendingProviders') },
    { label: 'Total Bookings', value: stats.totalBookings, icon: 'calendar-outline', color: '#06B6D4' },
    { label: 'Completed', value: stats.completedBookings, icon: 'checkmark-circle-outline', color: COLORS.success },
    { label: 'Revenue', value: `$${Number(stats.totalRevenue).toFixed(0)}`, icon: 'cash-outline', color: '#F59E0B' },
  ];

  const QUICK_LINKS = [
    { label: 'Pending Providers', icon: 'shield-checkmark-outline', screen: 'PendingProviders' as const, badge: stats.pendingProviders },
    { label: 'Manage Users', icon: 'people-outline', screen: 'ManageUsers' as const },
    { label: 'Disputes', icon: 'alert-circle-outline', screen: 'Disputes' as const },
    { label: 'Analytics', icon: 'bar-chart-outline', screen: 'Analytics' as const },
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadStats(); }}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Admin Panel</Text>
            <Text style={styles.userName}>Welcome, {user?.full_name?.split(' ')[0] ?? 'Admin'}</Text>
          </View>
          <View style={styles.adminBadge}>
            <Ionicons name="shield-checkmark" size={20} color={COLORS.white} />
          </View>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {STAT_CARDS.map((s) => (
            <TouchableOpacity
              key={s.label}
              style={styles.statCard}
              onPress={s.action}
              disabled={!s.action}
              activeOpacity={s.action ? 0.7 : 1}
            >
              <View style={[styles.statIcon, { backgroundColor: s.color + '20' }]}>
                <Ionicons name={s.icon as React.ComponentProps<typeof Ionicons>['name']} size={20} color={s.color} />
              </View>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quick links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Admin Actions</Text>
          {QUICK_LINKS.map((q) => (
            <TouchableOpacity
              key={q.label}
              style={styles.linkCard}
              onPress={() => navigation.navigate(q.screen)}
              activeOpacity={0.8}
            >
              <View style={styles.linkIcon}>
                <Ionicons name={q.icon as React.ComponentProps<typeof Ionicons>['name']} size={22} color={COLORS.primary} />
              </View>
              <Text style={styles.linkLabel}>{q.label}</Text>
              <View style={styles.linkRight}>
                {q.badge ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{q.badge}</Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
              </View>
            </TouchableOpacity>
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
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.md,
  },
  greeting: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  userName: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text },
  adminBadge: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.md,
  },
  statCard: {
    width: '30.5%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  statIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xs },
  statValue: { fontSize: FONTS.sizes.lg, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2, textAlign: 'center' },
  section: { paddingHorizontal: SPACING.md },
  sectionTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  linkCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  linkIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  linkLabel: { flex: 1, fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  linkRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  badge: {
    backgroundColor: COLORS.error, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 2, minWidth: 24, alignItems: 'center',
  },
  badgeText: { fontSize: FONTS.sizes.xs, color: COLORS.white, fontWeight: '700' },
});
