import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Booking, BookingStatus } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { CustomerStackParamList } from '../../navigation/types';
import { useErrorHandler } from '../../utils/errorHandler';
import { calcBookingFee } from '../../utils/bookingFee';

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;

const FILTERS: { label: string; value: BookingStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Active', value: 'accepted' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

export default function BookingHistoryScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<BookingStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { showError } = useErrorHandler();

  const fetch = useCallback(async () => {
    if (!user) return;
    let q = supabase
      .from('bookings')
      .select(`
        *,
        provider:providers!bookings_provider_id_fkey(
          business_name, profile_photo_url, business_logo
        ),
        service:services(name)
      `)
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      if (filter === 'accepted') {
        q = q.in('status', ['accepted', 'on_the_way', 'arrived', 'in_progress']);
      } else {
        q = q.eq('status', filter);
      }
    }

    const { data, error } = await q;
    if (error) showError(error, 'Failed to load bookings.');
    setBookings(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [user, filter]);

  useEffect(() => { fetch(); }, [fetch]);

  const onRefresh = () => { setRefreshing(true); fetch(); };

  const renderBooking = ({ item }: { item: Booking }) => {
    const prov = item.provider as unknown as { business_name: string | null; profile_photo_url: string | null; business_logo: string | null } | null;
    const provName = prov?.business_name ?? 'Provider';
    const provPhoto = prov?.profile_photo_url ?? prov?.business_logo ?? null;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('BookingDetail', { bookingId: item.id })}
        activeOpacity={0.8}
      >
        <View style={styles.cardLeft}>
          <Avatar uri={provPhoto} name={provName} size={48} />
          <View style={styles.info}>
            <Text style={styles.providerName} numberOfLines={1}>
              {provName}
            </Text>
            <Text style={styles.serviceName} numberOfLines={1}>
              {item.service?.name ?? 'Service'}
            </Text>
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={12} color={COLORS.textLight} />
              <Text style={styles.dateText}>
                {format(new Date(item.scheduled_date), 'MMM d, yyyy')}
              </Text>
              {item.total_amount != null && item.total_amount > 0 && (
                <>
                  <Text style={styles.dot}>•</Text>
                  <Text style={styles.amountText}>
                    ₱{(item.total_amount + calcBookingFee(item.total_amount)).toLocaleString('en-PH')}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>
        <View style={styles.cardRight}>
          <Badge label={item.status} status={item.status} size="sm" />
          <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} style={{ marginTop: SPACING.xs }} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.title}>My Bookings</Text>
      </View>

      {/* Filter tabs */}
      <FlatList
        data={FILTERS}
        keyExtractor={(item) => item.value}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterTab, filter === item.value && styles.filterTabActive]}
            onPress={() => setFilter(item.value)}
          >
            <Text style={[styles.filterText, filter === item.value && styles.filterTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
        style={styles.filterList}
      />

      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        renderItem={renderBooking}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        windowSize={5}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="calendar-outline"
              title="No bookings yet"
              subtitle="Book a service to get started"
              actionLabel="Browse Services"
              onAction={() => navigation.getParent()?.navigate('Search')}
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  topBar: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  title: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.xxl, color: COLORS.text },
  filterList: { maxHeight: 48, marginBottom: SPACING.xs },
  filterRow: { paddingHorizontal: SPACING.md, gap: SPACING.sm, alignItems: 'center' },
  filterTab: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  filterTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  filterTextActive: { fontFamily: FONTS.bold, color: COLORS.white },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  info: { flex: 1 },
  providerName: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.base, color: COLORS.text },
  serviceName: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  dateText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  dot: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  amountText: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.xs, color: COLORS.primary },
  cardRight: { alignItems: 'flex-end', gap: SPACING.xs },
});
