import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { ProviderStackParamList } from '../../navigation/types';
import {
  getCurrentMonthBounds,
  computeTopServices,
  computeRepeatCustomers,
  computePeakHours,
  computeActiveDays,
  generateInsights,
  type MonthlyTrends,
  type TopService,
  type RepeatCustomerData,
  type PeakHourRange,
  type ActiveDay,
} from '../../utils/providerAnalyticsHelpers';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;

interface AnalyticsData {
  profile_views: number;
  booking_requests: number;
  completed_jobs: number;
  total_reviews: number;
  rating: number;
  average_response_minutes: number;
  response_rate: number;
  is_featured: boolean;
  featured_until: string | null;
  featured_started_at: string | null;
  bookings_while_featured: number;
  views_while_featured: number;
  requests_while_featured: number;
  completed_while_featured: number;
  monthly: MonthlyTrends;
  topServices: TopService[];
  repeatCustomers: RepeatCustomerData;
  peakHours: PeakHourRange[];
  activeDays: ActiveDay[];
  insights: string[];
}

const METRIC_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  profile_views: 'eye-outline',
  booking_requests: 'calendar-outline',
  completed_jobs: 'checkmark-circle-outline',
  total_reviews: 'star-outline',
  conversion_rate: 'trending-up-outline',
};

const METRIC_LABEL: Record<string, string> = {
  profile_views: 'Profile Views',
  booking_requests: 'Booking Requests',
  completed_jobs: 'Completed Jobs',
  total_reviews: 'Reviews Received',
  conversion_rate: 'Conversion %',
};

const METRIC_COLOR: Record<string, string> = {
  profile_views: '#8B5CF6',
  booking_requests: COLORS.primary,
  completed_jobs: '#059669',
  total_reviews: '#F59E0B',
  conversion_rate: '#2563EB',
};

export default function ProviderAnalyticsScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    if (!user) return;
    const providerId = user.id;

    try {
      const [
        analyticsRes,
        statsRes,
        providerRes,
        featuredPaymentRes,
        completedBookingsRes,
        serviceBookingsRes,
      ] = await Promise.all([
        supabase.from('provider_analytics').select('profile_views, booking_requests').eq('provider_id', providerId).single(),
        supabase.from('provider_stats').select('completed_jobs, total_reviews, average_rating, average_response_minutes, response_rate').eq('provider_id', providerId).single(),
        supabase.from('providers').select('is_featured, featured_until').eq('id', providerId).single(),
        supabase
          .from('featured_payments')
          .select('paid_at')
          .eq('provider_id', providerId)
          .eq('status', 'paid')
          .order('paid_at', { ascending: false })
          .limit(1),
        supabase
          .from('bookings')
          .select('customer_id, created_at')
          .eq('provider_id', providerId)
          .eq('status', 'completed'),
        supabase
          .from('bookings')
          .select('service_id, services(name)')
          .eq('provider_id', providerId)
          .not('service_id', 'is', null),
      ]);

      const analytics = analyticsRes.data ?? { profile_views: 0, booking_requests: 0 };
      const stats = statsRes.data ?? { completed_jobs: 0, total_reviews: 0, average_rating: 0, average_response_minutes: 0, response_rate: 0 };
      const provider = providerRes.data ?? { is_featured: false, featured_until: null };
      const featuredPayment = featuredPaymentRes.data?.[0] ?? null;
      const completedBookings = (completedBookingsRes.data ?? []) as Array<{ customer_id: string; created_at: string }>;
      const serviceBookings = (serviceBookingsRes.data ?? []) as unknown as Array<{ service_id: string | null; services: { name: string } | null }>;

      // ── Monthly Trends ──
      const { start: monthStart, end: monthEnd } = getCurrentMonthBounds();
      const [monthViewsRes, monthRequestsRes, monthCompletedRes] = await Promise.all([
        supabase.from('provider_views').select('*', { count: 'exact', head: true }).eq('provider_id', providerId).gte('viewed_at', monthStart).lte('viewed_at', monthEnd),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('provider_id', providerId).gte('created_at', monthStart).lte('created_at', monthEnd),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('provider_id', providerId).eq('status', 'completed').gte('created_at', monthStart).lte('created_at', monthEnd),
      ]);

      const monthly: MonthlyTrends = {
        profileViews: monthViewsRes.count ?? 0,
        bookingRequests: monthRequestsRes.count ?? 0,
        completedJobs: monthCompletedRes.count ?? 0,
      };

      // ── Featured Period Metrics ──
      let viewsWhileFeatured = 0;
      let requestsWhileFeatured = 0;
      let completedWhileFeatured = 0;
      if (provider.is_featured && featuredPayment?.paid_at) {
        const start = featuredPayment.paid_at;
        const end = provider.featured_until ?? new Date().toISOString();
        const [viewsRes, requestsRes, completedRes] = await Promise.all([
          supabase.from('provider_views').select('*', { count: 'exact', head: true }).eq('provider_id', providerId).gte('viewed_at', start).lte('viewed_at', end),
          supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('provider_id', providerId).gte('created_at', start).lte('created_at', end),
          supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('provider_id', providerId).eq('status', 'completed').gte('created_at', start).lte('created_at', end),
        ]);
        viewsWhileFeatured = viewsRes.count ?? 0;
        requestsWhileFeatured = requestsRes.count ?? 0;
        completedWhileFeatured = completedRes.count ?? 0;
      }

      // ── Sprint 4.1 Metrics ──
      const topServices = computeTopServices(serviceBookings);
      const repeatCustomers = computeRepeatCustomers(completedBookings);
      const peakHours = computePeakHours(completedBookings);
      const activeDays = computeActiveDays(completedBookings);

      const profileViews = (analytics as any).profile_views ?? 0;
      const completedJobs = (stats as any).completed_jobs ?? 0;
      const conversionRate = profileViews > 0 ? Math.min(100, (completedJobs / profileViews) * 100) : 0;

      const insights = generateInsights({
        profileViews,
        completedJobs,
        totalReviews: (stats as any).total_reviews ?? 0,
        averageRating: (stats as any).average_rating ?? 0,
        averageResponseMinutes: (stats as any).average_response_minutes ?? 0,
        conversionRate,
        repeatRate: repeatCustomers.rate,
      });

      setData({
        profile_views: profileViews,
        booking_requests: (analytics as any).booking_requests ?? 0,
        completed_jobs: completedJobs,
        total_reviews: (stats as any).total_reviews ?? 0,
        rating: (stats as any).average_rating ?? 0,
        average_response_minutes: (stats as any).average_response_minutes ?? 0,
        response_rate: (stats as any).response_rate ?? 0,
        is_featured: provider.is_featured ?? false,
        featured_until: provider.featured_until ?? null,
        featured_started_at: featuredPayment?.paid_at ?? null,
        bookings_while_featured: requestsWhileFeatured,
        views_while_featured: viewsWhileFeatured,
        requests_while_featured: requestsWhileFeatured,
        completed_while_featured: completedWhileFeatured,
        monthly,
        topServices,
        repeatCustomers,
        peakHours,
        activeDays,
        insights,
      });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Business Analytics</Text>
          <View style={styles.backBtnPlaceholder} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const profileViews = data?.profile_views ?? 0;
  const completedJobs = data?.completed_jobs ?? 0;
  const conversionRate = profileViews > 0
    ? Math.min(100, (completedJobs / profileViews) * 100)
    : 0;

  const metrics = [
    { key: 'profile_views', value: profileViews },
    { key: 'booking_requests', value: data?.booking_requests ?? 0 },
    { key: 'completed_jobs', value: completedJobs },
    { key: 'total_reviews', value: data?.total_reviews ?? 0 },
    { key: 'conversion_rate', value: Number(conversionRate.toFixed(1)) },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Business Analytics</Text>
          <View style={styles.backBtnPlaceholder} />
        </View>

        {/* Compact Metrics */}
        <View style={styles.compactCard}>
          {metrics.map((m) => {
            const icon = METRIC_ICON[m.key];
            const label = METRIC_LABEL[m.key];
            const color = METRIC_COLOR[m.key];
            const suffix = m.key === 'conversion_rate' ? '%' : '';
            return (
              <View key={m.key} style={styles.compactRow}>
                <View style={styles.compactLeft}>
                  <View style={[styles.compactIconWrap, { backgroundColor: color + '15' }]}>
                    <Ionicons name={icon} size={18} color={color} />
                  </View>
                  <Text style={styles.compactLabel}>{label}</Text>
                </View>
                <Text style={styles.compactValue}>
                  {m.value}{suffix}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Featured Status & ROI */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Featured Status</Text>
          {data?.is_featured ? (
            <View style={styles.roiCard}>
              <View style={styles.featuredRow}>
                <Ionicons name="sparkles" size={20} color={COLORS.warning} />
                <Text style={styles.featuredActive}>Featured Provider Active</Text>
              </View>
              {data.featured_started_at && data.featured_until && (
                <Text style={styles.roiPeriod}>
                  {format(new Date(data.featured_started_at), 'MMM d, yyyy')}
                  {' → '}
                  {format(new Date(data.featured_until), 'MMM d, yyyy')}
                </Text>
              )}
              <View style={styles.roiDivider} />
              <View style={styles.roiGrid}>
                <View style={styles.roiItem}>
                  <View style={styles.roiIconWrap}>
                    <Ionicons name="eye-outline" size={16} color="#8B5CF6" />
                  </View>
                  <Text style={styles.roiValue}>{data.views_while_featured}</Text>
                  <Text style={styles.roiLabel}>Views</Text>
                </View>
                <View style={styles.roiItem}>
                  <View style={styles.roiIconWrap}>
                    <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
                  </View>
                  <Text style={styles.roiValue}>{data.requests_while_featured}</Text>
                  <Text style={styles.roiLabel}>Requests</Text>
                </View>
                <View style={styles.roiItem}>
                  <View style={styles.roiIconWrap}>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#059669" />
                  </View>
                  <Text style={styles.roiValue}>{data.completed_while_featured}</Text>
                  <Text style={styles.roiLabel}>Completed</Text>
                </View>
                <View style={styles.roiItem}>
                  <View style={styles.roiIconWrap}>
                    <Ionicons name="trending-up-outline" size={16} color="#2563EB" />
                  </View>
                  <Text style={styles.roiValue}>
                    {data.views_while_featured > 0
                      ? Math.min(100, (data.completed_while_featured / data.views_while_featured) * 100).toFixed(1)
                      : '0'}%
                  </Text>
                  <Text style={styles.roiLabel}>Conversion</Text>
                </View>
              </View>
              <View style={styles.roiCostRow}>
                <Ionicons name="pricetag-outline" size={14} color={COLORS.textLight} />
                <Text style={styles.roiCostText}>Featured cost: ₱99 / month</Text>
              </View>
            </View>
          ) : (
            <View style={styles.featuredCard}>
              <View style={styles.featuredRow}>
                <Ionicons name="sparkles-outline" size={20} color={COLORS.textLight} />
                <Text style={styles.featuredInactive}>Not currently featured</Text>
              </View>
            </View>
          )}
        </View>

        {/* Monthly Trends */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>This Month</Text>
          <View style={styles.trendRow}>
            <View style={styles.trendItem}>
              <Ionicons name="eye-outline" size={18} color="#8B5CF6" />
              <Text style={styles.trendValue}>{data?.monthly.profileViews ?? 0}</Text>
              <Text style={styles.trendLabel}>Profile Views</Text>
            </View>
            <View style={styles.trendItem}>
              <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
              <Text style={styles.trendValue}>{data?.monthly.bookingRequests ?? 0}</Text>
              <Text style={styles.trendLabel}>Booking Requests</Text>
            </View>
            <View style={styles.trendItem}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#059669" />
              <Text style={styles.trendValue}>{data?.monthly.completedJobs ?? 0}</Text>
              <Text style={styles.trendLabel}>Completed Jobs</Text>
            </View>
          </View>
        </View>

        {/* Top Services */}
        {data && data.topServices.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Services</Text>
            <View style={styles.listCard}>
              {data.topServices.map((svc, idx) => (
                <View key={svc.name} style={[styles.listRow, idx === data.topServices.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={styles.listLeft}>
                    <Text style={styles.listRank}>#{idx + 1}</Text>
                    <Text style={styles.listName}>{svc.name}</Text>
                  </View>
                  <Text style={styles.listCount}>{svc.bookings} booking{svc.bookings !== 1 ? 's' : ''}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Repeat Customers */}
        {data && data.completed_jobs > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customer Loyalty</Text>
            <View style={styles.loyaltyCard}>
              <View style={styles.loyaltyRow}>
                <View style={styles.loyaltyBlock}>
                  <Text style={styles.loyaltyValue}>{data.repeatCustomers.count}</Text>
                  <Text style={styles.loyaltyLabel}>Repeat Customers</Text>
                </View>
                <View style={styles.loyaltyDivider} />
                <View style={styles.loyaltyBlock}>
                  <Text style={styles.loyaltyValue}>{data.repeatCustomers.rate}%</Text>
                  <Text style={styles.loyaltyLabel}>Repeat Rate</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Peak Hours */}
        {data && data.peakHours.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Peak Hours</Text>
            <View style={styles.tagRow}>
              {data.peakHours.map((h) => (
                <View key={h.label} style={styles.tag}>
                  <Ionicons name="time-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.tagText}>{h.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Most Active Days */}
        {data && data.activeDays.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Most Active Days</Text>
            <View style={styles.tagRow}>
              {data.activeDays.map((d) => (
                <View key={d.name} style={styles.tag}>
                  <Ionicons name="calendar-outline" size={14} color={COLORS.primary} />
                  <Text style={styles.tagText}>{d.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Performance Insights */}
        {data && data.insights.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Insights</Text>
            <View style={styles.insightCard}>
              {data.insights.map((msg, idx) => (
                <View key={idx} style={styles.insightRow}>
                  <Ionicons name="bulb-outline" size={16} color={COLORS.warning} />
                  <Text style={styles.insightText}>{msg}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Quick note */}
        <View style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.textSecondary} />
          <Text style={styles.noteText}>
            Analytics are observational only. They do not affect your bookings, earnings, or provider status.
          </Text>
        </View>

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
  compactCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    marginHorizontal: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
  },
  compactRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  compactLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  compactIconWrap: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  compactLabel: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.sm, color: COLORS.text },
  compactValue: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.base, color: COLORS.text },
  section: { marginTop: SPACING.lg, paddingHorizontal: SPACING.md },
  sectionTitle: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.lg, color: COLORS.text, marginBottom: SPACING.sm },
  featuredCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    gap: SPACING.xs,
  },
  featuredRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  featuredActive: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.base, color: COLORS.warning },
  featuredInactive: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.base, color: COLORS.textLight },
  featuredSub: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginLeft: 34 },
  noteCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    marginHorizontal: SPACING.md, marginTop: SPACING.lg,
    backgroundColor: COLORS.surfaceSecondary, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  noteText: { flex: 1, fontFamily: FONTS.regular, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
  bottomPad: { height: 60 },
  roiCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  roiPeriod: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginLeft: 34 },
  roiDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.xs },
  roiGrid: { flexDirection: 'row', gap: SPACING.sm },
  roiItem: {
    flex: 1, alignItems: 'center',
    backgroundColor: COLORS.surfaceSecondary, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xs,
  },
  roiIconWrap: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  roiValue: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.lg, color: COLORS.text },
  roiLabel: { fontFamily: FONTS.medium, fontSize: 10, color: COLORS.textSecondary },
  roiCostRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  roiCostText: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  trendRow: { flexDirection: 'row', gap: SPACING.sm },
  trendItem: {
    flex: 1, alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    gap: SPACING.xs,
  },
  trendValue: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.xl, color: COLORS.text },
  trendLabel: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
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
  listCount: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  loyaltyCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  loyaltyRow: { flexDirection: 'row', alignItems: 'center' },
  loyaltyBlock: { flex: 1, alignItems: 'center', gap: 2 },
  loyaltyDivider: { width: 1, height: 40, backgroundColor: COLORS.border },
  loyaltyValue: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.xl, color: COLORS.text },
  loyaltyLabel: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.surfaceSecondary, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.border,
  },
  tagText: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.sm, color: COLORS.text },
  insightCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  insightText: { flex: 1, fontFamily: FONTS.regular, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
});
