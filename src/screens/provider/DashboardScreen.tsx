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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
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

export default function ProviderDashboard() {
  const navigation = useNavigation<NavProp>();
  const { user, providerProfile } = useAuthStore();

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
  const ONBOARDING_KEY = 'provider_onboarding_seen';

  const loadData = useCallback(async () => {
    if (!user) return;

    const [bookingsRes, providerRes, checklistRes, perfRes, scoreRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, customer:users!bookings_customer_id_fkey(full_name, avatar_url), service:services(name)')
        .eq('provider_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('providers').select('*, categories(name)').eq('id', user.id).single(),
      supabase.from('provider_checklist').select('*').eq('provider_id', user.id).single(),
      supabase.from('provider_performance').select('*').eq('provider_id', user.id).single(),
      supabase.from('provider_score').select('*').eq('provider_id', user.id).single(),
    ]);

    const bookings: Booking[] = bookingsRes.data ?? [];
    setRecentBookings(bookings.slice(0, 5));
    setProvider(providerRes.data as Provider | null);

    setStats({
      pending: bookings.filter((b) => b.status === 'pending').length,
      active: bookings.filter((b) => ['accepted', 'in_progress'].includes(b.status)).length,
      completed: bookings.filter((b) => b.status === 'completed').length,
      earnings: providerRes.data?.earnings_total ?? 0,
    });

    setChecklist(checklistRes.data ?? null);
    setPerformance(perfRes.data ?? null);
    setScore(scoreRes.data ?? null);

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

        {/* Provider Score */}
        <ProviderScoreRing score={score} />

        {/* Business Performance */}
        <PerformanceCard performance={performance} />

        {/* Quick Actions with badges */}
        <View style={styles.quickSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickRow}>
            {[
              { label: 'Requests', icon: 'notifications-outline', action: () => navigation.getParent()?.navigate('Requests'), badge: stats.pending > 0 ? stats.pending.toString() : undefined },
              { label: 'Active Jobs', icon: 'play-circle-outline', action: () => navigation.getParent()?.navigate('ActiveJobs'), badge: stats.active > 0 ? stats.active.toString() : undefined },
              { label: 'Services', icon: 'construct-outline', action: () => navigation.navigate('ManageServices') },
              { label: 'Earnings', icon: 'wallet-outline', action: () => navigation.getParent()?.navigate('Earnings'), badge: stats.earnings > 0 ? `₱${stats.earnings}` : undefined },
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
                <Text style={styles.quickLabel}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Future Features Placeholders */}
        <View style={styles.futureSection}>
          <Text style={styles.sectionTitle}>Coming Soon</Text>
          <View style={styles.futureRow}>
            {[
              { label: 'Top Rated', icon: 'trophy-outline' },
              { label: 'Fast Responder', icon: 'flash-outline' },
              { label: 'Verified Pro', icon: 'shield-checkmark-outline' },
              { label: 'Boost', icon: 'rocket-outline' },
            ].map((f) => (
              <View key={f.label} style={styles.futureChip}>
                <Ionicons name={f.icon as React.ComponentProps<typeof Ionicons>['name']} size={16} color={COLORS.textMuted} />
                <Text style={styles.futureChipText}>{f.label}</Text>
              </View>
            ))}
          </View>
        </View>

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
              const cust = booking.customer as unknown as { full_name: string | null; avatar_url: string | null };
              return (
                <TouchableOpacity
                  key={booking.id}
                  style={styles.bookingCard}
                  onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}
                  activeOpacity={0.8}
                >
                  <Avatar uri={cust?.avatar_url} name={cust?.full_name} size={44} />
                  <View style={styles.bookingInfo}>
                    <Text style={styles.bookingCustomer} numberOfLines={1}>{cust?.full_name ?? 'Customer'}</Text>
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
  quickRow: { flexDirection: 'row', gap: SPACING.sm },
  quickCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, alignItems: 'center', gap: SPACING.xs,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  quickLabel: { fontSize: FONTS.sizes.xs, color: COLORS.text, fontFamily: FONTS.semiBold, textAlign: 'center' },
  quickIconWrap: { position: 'relative', marginBottom: SPACING.xs },
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
  futureSection: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  futureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  futureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surfaceTertiary,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    opacity: 0.6,
  },
  futureChipText: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted, fontFamily: FONTS.medium },
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
});
