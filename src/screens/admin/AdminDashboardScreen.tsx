import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
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

interface FeaturedRequestItem {
  provider_id: string;
  displayName: string;
}

export default function AdminDashboardScreen() {
  const navigation = useNavigation<NavProp>();
  const { user, signOut } = useAuthStore();
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
  const [featuredRequests, setFeaturedRequests] = useState<FeaturedRequestItem[]>([]);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);
  };

  const loadStats = async () => {
    const [usersRes, provRes, pendingRes, bookingsRes, completedRes, revenueRes, featPayRes] =
      await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('providers').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from('providers').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
        supabase.from('bookings').select('id', { count: 'exact', head: true }),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        supabase.from('payments').select('amount').eq('status', 'completed'),
        // Paid featured payments where provider not yet approved
        supabase
          .from('featured_payments')
          .select('provider_id, paid_at, providers!inner(id, business_name, is_featured, users(full_name))')
          .eq('status', 'paid')
          .eq('providers.is_featured', false)
          .order('paid_at', { ascending: false }),
      ]);

    const revenue = (revenueRes.data ?? []).reduce(
      (s: number, p: { amount: number }) => s + p.amount,
      0
    );

    // Deduplicate by provider_id — keep only the most recent paid payment per provider
    const seen = new Set<string>();
    const deduped: FeaturedRequestItem[] = [];
    for (const row of (featPayRes.data ?? []) as any[]) {
      if (seen.has(row.provider_id)) continue;
      if (row.providers?.is_featured !== false) continue;
      seen.add(row.provider_id);
      deduped.push({
        provider_id: row.provider_id,
        displayName:
          row.providers?.business_name ??
          row.providers?.users?.full_name ??
          'Unknown Provider',
      });
    }
    setFeaturedRequests(deduped);

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
    { label: 'Pending Providers', value: stats.pendingProviders, icon: 'shield-outline', color: COLORS.warning, action: () => navigation.navigate('PendingProviders') },
    { label: 'Total Bookings', value: stats.totalBookings, icon: 'calendar-outline', color: '#06B6D4' },
    { label: 'Completed', value: stats.completedBookings, icon: 'checkmark-circle-outline', color: COLORS.success },
    { label: 'Revenue', value: `$${Number(stats.totalRevenue).toFixed(0)}`, icon: 'cash-outline', color: '#F59E0B' },
  ];

  const QUICK_LINKS = [
    { label: 'Admin Alerts', icon: 'notifications-outline', screen: 'AdminNotifications' as const, badge: stats.pendingProviders, isTab: false as const },
    { label: 'Pending Providers', icon: 'shield-checkmark-outline', screen: 'PendingProviders' as const, isTab: false as const },
    { label: 'All Providers', icon: 'briefcase-outline', screen: 'AllProviders' as const, isTab: false as const },
    { label: 'Reports', icon: 'flag-outline', screen: 'AdminReports' as const, isTab: false as const },
    { label: 'Review Moderation', icon: 'star-outline', screen: 'AdminReviews' as const, isTab: false as const },
    { label: 'Revenue', icon: 'cash-outline', screen: 'AdminRevenue' as const, isTab: false as const },
    { label: 'Broadcast', icon: 'megaphone-outline', screen: 'AdminBroadcast' as const, isTab: false as const },
    { label: 'Manage Users', icon: 'people-outline', screen: 'Users' as const, isTab: true as const },
    { label: 'Disputes', icon: 'alert-circle-outline', screen: 'Disputes' as const, isTab: true as const },
    { label: 'Analytics', icon: 'bar-chart-outline', screen: 'Analytics' as const, isTab: true as const },
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
          <View style={styles.headerRight}>
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={20} color={COLORS.white} />
            </View>
            <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={22} color={COLORS.error} />
            </TouchableOpacity>
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

        {/* Featured Requests card */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⭐ Featured Requests</Text>
          <View style={styles.featuredCard}>
            {featuredRequests.length === 0 ? (
              <Text style={styles.featuredEmpty}>No pending featured requests.</Text>
            ) : (
              <>
                <View style={styles.featuredHeader}>
                  <View style={styles.featuredIconWrap}>
                    <Ionicons name="sparkles" size={20} color={COLORS.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.featuredCountText}>
                      {featuredRequests.length} pending approval{featuredRequests.length !== 1 ? 's' : ''}
                    </Text>
                    <Text style={styles.featuredCountSub}>Providers awaiting featured activation</Text>
                  </View>
                  <View style={styles.featuredBadge}>
                    <Text style={styles.featuredBadgeText}>{featuredRequests.length}</Text>
                  </View>
                </View>
                <View style={styles.featuredList}>
                  {featuredRequests.slice(0, 5).map((item) => (
                    <View key={item.provider_id} style={styles.featuredListRow}>
                      <View style={styles.featuredDot} />
                      <Text style={styles.featuredListName} numberOfLines={1}>{item.displayName}</Text>
                    </View>
                  ))}
                  {featuredRequests.length > 5 && (
                    <Text style={styles.featuredMoreText}>+{featuredRequests.length - 5} more</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.featuredReviewBtn}
                  onPress={() => navigation.navigate('AllProviders')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-done-outline" size={16} color={COLORS.white} />
                  <Text style={styles.featuredReviewBtnText}>Review Requests</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Quick links */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Admin Actions</Text>
          {QUICK_LINKS.map((q) => (
            <TouchableOpacity
              key={q.label}
              style={styles.linkCard}
              onPress={() => {
                if (q.isTab) {
                  (navigation as any).navigate('AdminTabs', { screen: q.screen });
                } else {
                  navigation.navigate(q.screen);
                }
              }}
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
  userName: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  adminBadge: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  logoutBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.md,
  },
  statCard: {
    width: '31%', minHeight: 110,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  statIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.xs },
  statValue: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.text },
  statLabel: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2, textAlign: 'center' },
  section: { paddingHorizontal: SPACING.md },
  sectionTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.sm },
  linkCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    minHeight: 64,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  linkIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  linkLabel: { flex: 1, fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  linkRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  badge: {
    backgroundColor: COLORS.error, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 2, minWidth: 24, alignItems: 'center',
  },
  badgeText: { fontSize: FONTS.sizes.xs, color: COLORS.white, fontFamily: FONTS.semiBold },
  featuredCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: '#FDE68A', ...SHADOWS.small,
  },
  featuredEmpty: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  featuredHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  featuredIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center',
  },
  featuredCountText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  featuredCountSub: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 1 },
  featuredBadge: {
    backgroundColor: COLORS.warning, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 2, minWidth: 26, alignItems: 'center',
  },
  featuredBadgeText: { fontSize: FONTS.sizes.xs, color: COLORS.white, fontFamily: FONTS.bold },
  featuredList: { gap: SPACING.xs, marginBottom: SPACING.sm },
  featuredListRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 2 },
  featuredDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.warning },
  featuredListName: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text, fontFamily: FONTS.medium },
  featuredMoreText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontFamily: FONTS.medium, marginTop: 2 },
  featuredReviewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, backgroundColor: COLORS.warning,
    borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.sm,
  },
  featuredReviewBtnText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.white },
});
