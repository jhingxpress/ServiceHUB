import React, { useEffect, useState, useCallback } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Booking } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
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
  const { user } = useAuthStore();
  const [stats, setStats] = useState<Stats>({ pending: 0, active: 0, completed: 0, earnings: 0 });
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;

    const [bookingsRes, providerRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, customer:users!bookings_customer_id_fkey(full_name, avatar_url), service:services(name)')
        .eq('provider_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase.from('providers').select('is_available, earnings_total').eq('id', user.id).single(),
    ]);

    const bookings: Booking[] = bookingsRes.data ?? [];
    setRecentBookings(bookings.slice(0, 5));
    setIsAvailable(providerRes.data?.is_available ?? true);

    setStats({
      pending: bookings.filter((b) => b.status === 'pending').length,
      active: bookings.filter((b) => ['accepted', 'in_progress'].includes(b.status)).length,
      completed: bookings.filter((b) => b.status === 'completed').length,
      earnings: providerRes.data?.earnings_total ?? 0,
    });

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleAvailability = async () => {
    const next = !isAvailable;
    setIsAvailable(next);
    await supabase.from('providers').update({ is_available: next }).eq('id', user?.id);
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={COLORS.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.full_name?.split(' ')[0] ?? 'Provider'}</Text>
          </View>
          <Avatar uri={user?.avatar_url} name={user?.full_name} size={44} borderColor={COLORS.primary} />
        </View>

        {/* Availability toggle */}
        <TouchableOpacity
          style={[styles.availabilityBar, { backgroundColor: isAvailable ? COLORS.successLight ?? '#D1FAE5' : '#FEE2E2' }]}
          onPress={toggleAvailability}
        >
          <View style={[styles.availDot, { backgroundColor: isAvailable ? COLORS.success : COLORS.error }]} />
          <Text style={[styles.availText, { color: isAvailable ? COLORS.success : COLORS.error }]}>
            {isAvailable ? 'You are available for bookings' : 'You are not accepting bookings'}
          </Text>
          <Text style={[styles.availToggle, { color: isAvailable ? COLORS.success : COLORS.error }]}>
            {isAvailable ? 'Go Offline' : 'Go Online'}
          </Text>
        </TouchableOpacity>

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

        {/* Quick Actions */}
        <View style={styles.quickSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickRow}>
            {[
              { label: 'Requests', icon: 'notifications-outline', action: () => navigation.navigate('ProviderTabs', { screen: 'Requests' }) },
              { label: 'Schedule', icon: 'calendar-outline', action: () => navigation.navigate('ProviderTabs', { screen: 'Schedule' }) },
              { label: 'Services', icon: 'construct-outline', action: () => navigation.navigate('ManageServices') },
              { label: 'Earnings', icon: 'wallet-outline', action: () => navigation.navigate('ProviderTabs', { screen: 'Earnings' }) },
            ].map((q) => (
              <TouchableOpacity
                key={q.label}
                style={styles.quickCard}
                onPress={q.action}
              >
                <Ionicons name={q.icon as React.ComponentProps<typeof Ionicons>['name']} size={24} color={COLORS.primary} />
                <Text style={styles.quickLabel}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recent Bookings */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Bookings</Text>
            <TouchableOpacity onPress={() => navigation.navigate('ProviderTabs', { screen: 'Requests' })}>
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
  userName: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text },
  availabilityBar: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md, gap: SPACING.sm,
  },
  availDot: { width: 10, height: 10, borderRadius: 5 },
  availText: { flex: 1, fontSize: FONTS.sizes.sm, fontWeight: '600' },
  availToggle: { fontSize: FONTS.sizes.sm, fontWeight: '700', textDecorationLine: 'underline' },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.md, gap: SPACING.sm, marginBottom: SPACING.md,
  },
  statCard: {
    flex: 1, minWidth: '45%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', ...SHADOWS.small,
  },
  statIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.sm },
  statValue: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  quickSection: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  sectionTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  quickRow: { flexDirection: 'row', gap: SPACING.sm },
  quickCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, alignItems: 'center', gap: SPACING.xs,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  quickLabel: { fontSize: FONTS.sizes.xs, color: COLORS.text, fontWeight: '600', textAlign: 'center' },
  section: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  sectionLink: { fontSize: FONTS.sizes.sm, color: COLORS.primary, fontWeight: '600' },
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
  bookingCustomer: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  bookingService: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 1 },
  bookingDate: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 2 },
});
