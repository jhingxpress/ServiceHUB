import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { REVIEWS_LAST_SEEN_KEY } from './ProviderReviewsScreen';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore, formatBadgeCount } from '../../stores/notificationStore';
import { Booking, Provider, ProviderChecklist, ProviderPerformance, ProviderScore, BusinessStatus } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import OnboardingChecklist from '../../components/provider/OnboardingChecklist';
import PerformanceCard from '../../components/provider/PerformanceCard';
import ProviderScoreRing from '../../components/provider/ProviderScoreRing';
import BusinessGoals from '../../components/provider/BusinessGoals';
import ProviderApprovalModal from '../../components/provider/ProviderApprovalModal';
import { ProviderStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;

interface Stats {
  pending: number;
  active: number;
  completed: number;
  earnings: number;
}

interface FeaturedPaymentData {
  id: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  amount: number;
  checkout_url: string | null;
  paid_at: string | null;
  created_at: string;
}

export default function ProviderDashboard() {
  const navigation = useNavigation<NavProp>();
  const { user, providerProfile } = useAuthStore();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  // Fallback chain: provider photo → user avatar → initials
  const avatarUri = providerProfile?.profile_photo_url ?? user?.avatar_url ?? null;
  const [stats, setStats] = useState<Stats>({ pending: 0, active: 0, completed: 0, earnings: 0 });
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [checklist, setChecklist] = useState<ProviderChecklist | null>(null);
  const [performance, setPerformance] = useState<ProviderPerformance | null>(null);
  const [score, setScore] = useState<ProviderScore | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [newReviewCount, setNewReviewCount] = useState(0);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [featuredReqLoading, setFeaturedReqLoading] = useState(false);
  const [featuredPayment, setFeaturedPayment] = useState<FeaturedPaymentData | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const ONBOARDING_KEY = 'provider_onboarding_seen';

  const loadData = useCallback(async () => {
    if (!user) return;

    const [bookingsRes, providerRes, checklistRes, perfRes, scoreRes, featReqRes, paymentRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, service:services(name)')
        .eq('provider_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('providers').select('*, categories(name)').eq('id', user.id).single(),
      supabase.from('provider_checklist').select('*').eq('provider_id', user.id).single(),
      supabase.from('provider_performance').select('*').eq('provider_id', user.id).single(),
      supabase.from('provider_score').select('*').eq('provider_id', user.id).single(),
      supabase.from('featured_requests').select('id').eq('provider_id', user.id).eq('status', 'pending').maybeSingle(),
      supabase
        .from('featured_payments')
        .select('id, status, amount, checkout_url, paid_at, created_at')
        .eq('provider_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const bookings: Booking[] = bookingsRes.data ?? [];
    setRecentBookings(bookings.slice(0, 5));
    setProvider(providerRes.data as Provider | null);

    setStats({
      pending: bookings.filter((b) => b.status === 'pending').length,
      active: bookings.filter((b) => ['accepted', 'in_progress'].includes(b.status)).length,
      completed: bookings.filter((b) => b.status === 'completed').length,
      earnings: providerRes.data?.total_earnings ?? 0,
    });

    setChecklist(checklistRes.data ?? null);
    setPerformance(perfRes.data ?? null);
    setScore(scoreRes.data ?? null);
    setHasPendingRequest(!!featReqRes.data);
    setFeaturedPayment((paymentRes as { data: FeaturedPaymentData | null }).data ?? null);

    // Load new-review badge count
    const lastSeen = await AsyncStorage.getItem(REVIEWS_LAST_SEEN_KEY);
    let revQuery = supabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('provider_id', user.id);
    if (lastSeen) revQuery = revQuery.gt('created_at', lastSeen);
    const { count: revCount } = await revQuery;
    setNewReviewCount(revCount ?? 0);

    // Show approval modal once if provider is approved and hasn't seen it
    const checklistData = checklistRes.data as ProviderChecklist | null;
    if (checklistData?.is_approved) {
      const seen = await AsyncStorage.getItem(ONBOARDING_KEY);
      if (!seen) {
        setShowApprovalModal(true);
      }
    }

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const dismissApprovalModal = async () => {
    setShowApprovalModal(false);
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  };

  const handleCompleteProfile = () => {
    navigation.navigate('ProfileSetup');
  };

  const setBusinessStatus = async (status: BusinessStatus) => {
    if (!user) return;
    setProvider((prev) => (prev ? { ...prev, business_status: status } : prev));
    await supabase.from('providers').update({ business_status: status }).eq('id', user.id);
  };

  const handleFeaturedRequest = async () => {
    if (!user) return;

    // Re-open existing pending checkout if one already exists
    if (featuredPayment?.status === 'pending' && featuredPayment.checkout_url) {
      await Linking.openURL(featuredPayment.checkout_url);
      return;
    }

    setCheckoutLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const jwt = sessionData?.session?.access_token;
      if (!jwt) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('create-featured-checkout', {
        body: {},
      });

      if (error) {
        // Parse the actual error body from the Edge Function response
        let friendlyMessage = 'Failed to create checkout session. Please try again.';
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) friendlyMessage = body.error;
        } catch {
          // context not parseable — fall through to generic message
        }
        Alert.alert('Cannot Renew', friendlyMessage);
        return;
      }

      if (!data?.checkout_url) throw new Error('No checkout URL returned');

      // Refresh local state before opening browser
      await loadData();

      await Linking.openURL(data.checkout_url);
    } catch (err: any) {
      Alert.alert(
        'Payment Error',
        err?.message ?? 'Failed to create checkout session. Please try again.',
      );
    } finally {
      setCheckoutLoading(false);
    }
  };

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
      <ProviderApprovalModal
        visible={showApprovalModal}
        progressText={`${checklist ? (checklist.progress_percent > 0 ? 1 : 0) : 0}/6 Complete`}
        onDismiss={dismissApprovalModal}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={COLORS.primary} />}
      >
        {/* Header -->
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.full_name?.split(' ')[0] ?? 'Provider'}</Text>
          </View>
          <Avatar uri={avatarUri} name={user?.full_name} size={44} borderColor={COLORS.primary} />
        </View>

        {/* Business Status */}
        {provider && (
          <View style={styles.statusBar}>
            <Text style={styles.statusLabel}>Business Status</Text>
            <View style={styles.statusRow}>
              {(
                [
                  { key: 'available', label: 'Available', color: COLORS.success },
                  { key: 'busy', label: 'Busy', color: '#F59E0B' },
                  { key: 'vacation_mode', label: 'Vacation', color: '#8B5CF6' },
                  { key: 'closed', label: 'Closed', color: COLORS.error },
                ] as { key: BusinessStatus; label: string; color: string }[]
              ).map((s) => {
                const active = provider.business_status === s.key;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.statusChip, active && { backgroundColor: s.color + '20', borderColor: s.color }]}
                    onPress={() => setBusinessStatus(s.key)}
                  >
                    <View style={[styles.statusDot, { backgroundColor: s.color, opacity: active ? 1 : 0.3 }]} />
                    <Text style={[styles.statusChipText, active && { color: s.color, fontFamily: FONTS.bold }]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Profile Completion Card */}
        {provider && !provider.profile_completed && (
          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <View style={styles.profileIconWrap}>
                <Ionicons name="business-outline" size={24} color={COLORS.primary} />
              </View>
              <View style={styles.profileTextWrap}>
                <Text style={styles.profileTitle}>Complete Your Business Profile</Text>
                <Text style={styles.profileSubtitle}>
                  {Math.round(
                    ((provider.profile_photo_url ? 1 : 0) +
                      (provider.cover_photo_url ? 1 : 0) +
                      (provider.business_name ? 1 : 0) +
                      (provider.business_headline ? 1 : 0) +
                      (provider.business_description ? 1 : 0) +
                      (provider.service_area ? 1 : 0)) *
                      100 /
                      6
                  )}% Complete
                </Text>
              </View>
            </View>

            <View style={styles.profileChecklist}>
              {[
                { label: 'Business Name', done: !!provider.business_name },
                { label: 'Headline', done: !!provider.business_headline },
                { label: 'Profile Photo', done: !!provider.profile_photo_url },
                { label: 'Cover Photo', done: !!provider.cover_photo_url },
                { label: 'Service Area', done: !!provider.service_area },
                { label: 'Description', done: !!provider.business_description },
              ].map((item) => (
                <View key={item.label} style={styles.profileCheckItem}>
                  <Ionicons
                    name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={item.done ? COLORS.success : COLORS.textMuted}
                  />
                  <Text style={[styles.profileCheckLabel, item.done && styles.profileCheckDone]}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>

            <Button
              title="Complete Profile"
              onPress={handleCompleteProfile}
              fullWidth
              size="md"
              style={{ marginTop: SPACING.sm }}
            />
          </View>
        )}

        {/* Onboarding Checklist or Business Ready */}
        <OnboardingChecklist checklist={checklist} provider={provider} />

        {/* Stats */}
        <View style={styles.statsGrid}>
          {[
            { label: 'Pending', value: stats.pending, icon: 'time-outline', color: COLORS.warning },
            { label: 'Active', value: stats.active, icon: 'play-circle-outline', color: COLORS.primary },
            { label: 'Completed', value: stats.completed, icon: 'checkmark-circle-outline', color: COLORS.success },
            { label: 'Earnings', value: `₱${stats.earnings}`, icon: 'cash-outline', color: '#8B5CF6' },
          ].map((s) => (
            <View key={s.label} style={styles.statCard}>
              <View style={[styles.statIconWrap, { backgroundColor: s.color + '20' }]}>
                <Ionicons name={s.icon as React.ComponentProps<typeof Ionicons>['name']} size={20} color={s.color} />
              </View>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Featured Provider */}
        {provider && provider.status === 'approved' && (
          <View style={styles.featuredCard}>
            <View style={styles.featuredCardHeader}>
              <View style={styles.featuredCardIcon}>
                <Ionicons name="sparkles" size={22} color={COLORS.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featuredCardTitle}>⭐ Featured Provider</Text>
                <Text style={styles.featuredCardSubtitle}>
                  Get higher visibility in search results and appear in the Featured Providers section.
                </Text>
              </View>
            </View>
            {(() => {
              const _now = new Date();
              const _until = provider.featured_until ? new Date(provider.featured_until) : null;
              const _isExpired = provider.is_featured && !!_until && _until <= _now;
              const _daysLeft = _until && _until > _now
                ? Math.ceil((_until.getTime() - _now.getTime()) / (1000 * 60 * 60 * 24))
                : 0;
              const _isExpiringSoon = provider.is_featured && !_isExpired && !!_until && _daysLeft <= 7;
              const _isActive = provider.is_featured && !_isExpired;

              if (_isExpired) {
                return (
                  <View>
                    <View style={styles.featuredExpiredRow}>
                      <Ionicons name="close-circle" size={16} color={COLORS.error} />
                      <Text style={styles.featuredExpiredText}>Featured Expired</Text>
                    </View>
                    <Text style={styles.featuredUntilText}>
                      Expired on: {format(_until!, 'MMM d, yyyy')}
                    </Text>
                    <Text style={[styles.featuredPayStatusSubtext, { marginVertical: SPACING.xs }]}>
                      Renew now to regain featured visibility.
                    </Text>
                    <TouchableOpacity style={styles.featuredBtn} onPress={handleFeaturedRequest} disabled={checkoutLoading} activeOpacity={0.8}>
                      {checkoutLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.featuredBtnText}>Renew Featured</Text>}
                    </TouchableOpacity>
                  </View>
                );
              }

              if (_isExpiringSoon) {
                return (
                  <View>
                    <View style={styles.featuredWarnRow}>
                      <Ionicons name="warning" size={16} color={COLORS.warning} />
                      <Text style={styles.featuredWarnText}>Expires in {_daysLeft} day{_daysLeft !== 1 ? 's' : ''}</Text>
                    </View>
                    <Text style={styles.featuredUntilText}>
                      Expires on: {format(_until!, 'MMM d, yyyy')}
                    </Text>
                    <Text style={[styles.featuredPayStatusSubtext, { marginVertical: SPACING.xs }]}>
                      Renew now to avoid losing your featured placement.
                    </Text>
                    <TouchableOpacity style={styles.featuredBtn} onPress={handleFeaturedRequest} disabled={checkoutLoading} activeOpacity={0.8}>
                      {checkoutLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.featuredBtnText}>Renew Featured</Text>}
                    </TouchableOpacity>
                  </View>
                );
              }

              if (_isActive) {
                return (
                  <View>
                    <View style={styles.featuredActiveRow}>
                      <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                      <Text style={styles.featuredActiveText}>Featured Provider Active</Text>
                    </View>
                    {_until && (
                      <>
                        <Text style={styles.featuredUntilText}>
                          Expires on: {format(_until, 'MMM d, yyyy')}
                        </Text>
                        <Text style={styles.featuredDaysText}>
                          {_daysLeft} day{_daysLeft !== 1 ? 's' : ''} remaining
                        </Text>
                      </>
                    )}
                    <View style={styles.featuredRenewLocked}>
                      <Ionicons name="lock-closed-outline" size={14} color={COLORS.textSecondary} />
                      <Text style={styles.featuredRenewLockedText}>
                        Renewal becomes available 7 days before expiration.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.featuredBtn, styles.featuredBtnDisabled, { marginTop: SPACING.sm }]}
                      disabled
                      activeOpacity={1}
                    >
                      <Text style={styles.featuredBtnTextDisabled}>Renew Featured</Text>
                    </TouchableOpacity>
                  </View>
                );
              }

              if (featuredPayment?.status === 'paid') {
                return (
                  <View style={styles.featuredPayStatusBox}>
                    <View style={styles.featuredPayStatusRow}>
                      <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                      <Text style={[styles.featuredPayStatusText, { color: COLORS.success }]}>Payment Received</Text>
                    </View>
                    <View style={[styles.featuredPayStatusRow, { marginTop: 4 }]}>
                      <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} />
                      <Text style={styles.featuredPayStatusSubtext}>
                        Awaiting admin approval. You'll be notified once approved.
                      </Text>
                    </View>
                    {featuredPayment.paid_at && (
                      <Text style={styles.featuredPayMeta}>
                        Paid {format(new Date(featuredPayment.paid_at), 'MMM d, yyyy h:mm a')}
                      </Text>
                    )}
                  </View>
                );
              }

              if (featuredPayment?.status === 'pending') {
                return (
                  <View>
                    <View style={styles.featuredPayStatusBox}>
                      <View style={styles.featuredPayStatusRow}>
                        <Ionicons name="time-outline" size={14} color={COLORS.warning} />
                        <Text style={[styles.featuredPayStatusText, { color: COLORS.warning }]}>Payment Pending</Text>
                      </View>
                      <Text style={styles.featuredPayStatusSubtext}>
                        Complete payment in the browser to activate your request.
                      </Text>
                    </View>
                    <TouchableOpacity style={styles.featuredBtn} onPress={handleFeaturedRequest} disabled={checkoutLoading} activeOpacity={0.8}>
                      {checkoutLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.featuredBtnText}>Open Checkout</Text>}
                    </TouchableOpacity>
                  </View>
                );
              }

              return (
                <>
                  <View style={styles.featuredBenefits}>
                    {['Priority search placement', 'Featured badge on profile', 'Home screen exposure'].map((b) => (
                      <View key={b} style={styles.featuredBenefitRow}>
                        <Ionicons name="checkmark" size={13} color={COLORS.warning} />
                        <Text style={styles.featuredBenefitText}>{b}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.featuredPrice}>₱99/month</Text>
                  <TouchableOpacity style={styles.featuredBtn} onPress={handleFeaturedRequest} disabled={checkoutLoading} activeOpacity={0.8}>
                    {checkoutLoading ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.featuredBtnText}>Request Featured Badge</Text>}
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        )}

        {/* Provider Health — compact summary */}
        {score && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setShowHealthModal(true)}
          >
            <ProviderScoreRing score={score} compact />
          </TouchableOpacity>
        )}

        {/* Business Goals (shown when onboarding complete) */}
        {checklist && checklist.progress_percent >= 100 && (
          <BusinessGoals
            completedJobs={stats.completed}
            totalBookings={stats.completed + stats.active + stats.pending}
            totalReviews={provider?.total_reviews ?? 0}
            earnings={stats.earnings}
            rating={score?.score ?? 0}
          />
        )}

        {/* Quick Actions with badges */}
        <View style={styles.quickSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickRow}>
            {[
              { label: 'Pending', icon: 'time-outline', action: () => navigation.getParent()?.navigate('Requests'), badge: stats.pending > 0 ? stats.pending.toString() : undefined },
              { label: 'Messages', icon: 'chatbubble-outline', action: () => navigation.getParent()?.navigate('Messages'), badge: undefined },
              { label: 'Services', icon: 'construct-outline', action: () => navigation.navigate('ManageServices') },
              { label: 'Reviews', icon: 'star-outline', action: () => navigation.navigate('ProviderReviews'), badge: newReviewCount > 0 ? newReviewCount.toString() : undefined },
              { label: 'Analytics', icon: 'analytics-outline', action: () => navigation.navigate('ProviderAnalytics') },
            ].map((q) => (
              <TouchableOpacity
                key={q.label}
                style={styles.quickCard}
                onPress={q.action}
              >
                <View style={styles.quickIconWrap}>
                  <Ionicons name={q.icon as React.ComponentProps<typeof Ionicons>['name']} size={24} color={COLORS.primary} />
                  {q.badge ? (
                    <View style={styles.badgeWrap}>
                      <Text style={styles.badgeText} numberOfLines={1}>{q.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.quickLabel} numberOfLines={1} adjustsFontSizeToFit>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Business Performance — hidden when no meaningful activity */}
        {performance && (performance.profile_views > 0 || performance.total_bookings > 0 || performance.completion_rate > 0) && (
          <PerformanceCard performance={performance} />
        )}

        {/* My Reviews Tap Card */}
        <TouchableOpacity
          style={styles.reviewsBanner}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('ProviderReviews')}
        >
          <View style={styles.reviewsBannerLeft}>
            <View style={styles.reviewsBannerIcon}>
              <Ionicons name="star" size={22} color="#F59E0B" />
            </View>
            <View>
              <Text style={styles.reviewsBannerTitle}>My Reviews</Text>
              {provider?.total_reviews != null && provider.total_reviews > 0 ? (
                <Text style={styles.reviewsBannerSub}>
                  {provider.total_reviews} review{provider.total_reviews !== 1 ? 's' : ''}
                  {provider.rating > 0 ? `  ·  ${Number(provider.rating).toFixed(1)} ★` : ''}
                </Text>
              ) : (
                <Text style={styles.reviewsBannerSub}>No reviews yet</Text>
              )}
            </View>
          </View>
          <View style={styles.reviewsBannerRight}>
            {newReviewCount > 0 && (
              <View style={styles.reviewsNewBadge}>
                <Text style={styles.reviewsNewBadgeText}>{newReviewCount} new</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
          </View>
        </TouchableOpacity>

        {/* Recent Bookings */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Bookings</Text>
            <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Requests')}>
              <Text style={styles.sectionLink}>See all</Text>
            </TouchableOpacity>
          </View>
          {recentBookings.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No bookings yet</Text>
            </View>
          ) : (
            recentBookings.map((booking) => {
              return (
                <TouchableOpacity
                  key={booking.id}
                  style={styles.bookingCard}
                  onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}
                  activeOpacity={0.8}
                >
                  <Avatar uri={booking.customer_avatar_url} name={booking.customer_name} size={44} />
                  <View style={styles.bookingInfo}>
                    <Text style={styles.bookingCustomer} numberOfLines={1}>{booking.customer_name ?? 'Customer'}</Text>
                    <Text style={styles.bookingService} numberOfLines={1}>{booking.service?.name ?? 'Service'}</Text>
                    <Text style={styles.bookingDate}>{booking.scheduled_date} at {booking.scheduled_time?.slice(0, 5)}</Text>
                  </View>
                  <Badge label={booking.status} status={booking.status} size="sm" />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      {/* Provider Health Detail Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showHealthModal}
        onRequestClose={() => setShowHealthModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Provider Health</Text>
              <TouchableOpacity onPress={() => setShowHealthModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <ProviderScoreRing score={score} />
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  availabilityBar: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, gap: SPACING.sm,
  },
  statusBar: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  statusLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.sm },
  statusRow: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusChipText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.md,
  },
  statCard: {
    flex: 1, minWidth: '45%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', ...SHADOWS.small,
  },
  statIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  statValue: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text },
  statLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  quickSection: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  sectionTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.sm },
  quickRow: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  quickCard: {
    width: '23%', minWidth: 72, minHeight: 88,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm, alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  quickLabel: { fontSize: FONTS.sizes.xs, color: COLORS.text, fontFamily: FONTS.semiBold, textAlign: 'center', lineHeight: 14 },
  quickIconWrap: { position: 'relative' },
  badgeWrap: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: COLORS.error,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 9, color: COLORS.white, fontFamily: FONTS.bold },
  section: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  sectionLink: { fontSize: FONTS.sizes.sm, color: COLORS.primary, fontFamily: FONTS.semiBold },
  emptyCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  emptyText: { color: COLORS.textSecondary, fontSize: FONTS.sizes.base },
  bookingCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  bookingInfo: { flex: 1 },
  bookingCustomer: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  bookingService: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 1 },
  bookingDate: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 2 },
  profileCard: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.md },
  profileIconWrap: {
    width: 48, height: 48, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  profileTextWrap: { flex: 1 },
  profileTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  profileSubtitle: { fontSize: FONTS.sizes.sm, color: COLORS.primary, fontFamily: FONTS.medium, marginTop: 2 },
  profileChecklist: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  profileCheckItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, width: '47%' },
  profileCheckLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  profileCheckDone: { color: COLORS.success, textDecorationLine: 'line-through' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },
  reviewsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  reviewsBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  reviewsBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewsBannerTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  reviewsBannerSub: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  reviewsBannerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  reviewsNewBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
  },
  reviewsNewBadgeText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.bold, color: COLORS.white },
  featuredCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    backgroundColor: '#FFFBEB', borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: '#FDE68A', ...SHADOWS.small,
  },
  featuredCardHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm,
  },
  featuredCardIcon: {
    width: 44, height: 44, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center',
  },
  featuredCardTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: COLORS.text },
  featuredCardSubtitle: {
    fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2, lineHeight: 16,
  },
  featuredBenefits: { gap: SPACING.xs, marginBottom: SPACING.sm },
  featuredBenefitRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  featuredBenefitText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  featuredPrice: {
    fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.warning, marginBottom: SPACING.sm,
  },
  featuredBtn: { borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.sm, alignItems: 'center' as const, backgroundColor: COLORS.warning },
  featuredBtnPending: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: '#FDE68A' },
  featuredBtnDisabled: { backgroundColor: COLORS.border },
  featuredBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.white },
  featuredBtnTextPending: { color: COLORS.warning },
  featuredBtnTextDisabled: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.textLight },
  featuredRenewLocked: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: SPACING.xs, marginTop: SPACING.sm, paddingHorizontal: 2 },
  featuredRenewLockedText: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, lineHeight: 16 },
  featuredActiveRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: 4 },
  featuredActiveText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.success },
  featuredUntilText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  featuredPayStatusBox: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  featuredPayStatusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  featuredPayStatusText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold },
  featuredPayStatusSubtext: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, flex: 1, lineHeight: 16 },
  featuredPayMeta: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 4 },
  featuredExpiredRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: 4 },
  featuredExpiredText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.error },
  featuredWarnRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: 4 },
  featuredWarnText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.warning },
  featuredDaysText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
});
