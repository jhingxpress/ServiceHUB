import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  ActivityIndicator,
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
import { ProviderStackParamList } from '../../navigation/types';
import { useErrorHandler } from '../../utils/errorHandler';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;

const FILTERS: { label: string; value: BookingStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Active', value: 'accepted' },
  { label: 'Completed', value: 'completed' },
];

export default function BookingRequestsScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filter, setFilter] = useState<BookingStatus | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { showError } = useErrorHandler();

  const fetchBookings = useCallback(async () => {
    if (!user) return;
    let q = supabase
      .from('bookings')
      .select('*, customer:users!bookings_customer_id_fkey(full_name, avatar_url), service:services(name)')
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false });
    if (filter !== 'all') q = q.eq('status', filter);
    const { data, error } = await q;
    if (error) showError(error, 'Failed to load bookings.');
    setBookings(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [user, filter]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const updateStatus = async (bookingId: string, status: BookingStatus) => {
    const { error } = await supabase.from('bookings').update({ status }).eq('id', bookingId);
    if (error) { showError(error, 'Failed to update booking status.'); return; }
    fetchBookings();
  };

  const handleAccept = (id: string) => {
    Alert.alert('Accept Booking', 'Accept this booking request?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Accept', onPress: () => updateStatus(id, 'accepted') },
    ]);
  };

  const handleReject = (id: string) => {
    Alert.alert('Reject Booking', 'Reject this booking request?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => updateStatus(id, 'rejected') },
    ]);
  };

  const handleStart = (id: string) => {
    Alert.alert('Start Job', 'Start this job now?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start', onPress: () => updateStatus(id, 'in_progress') },
    ]);
  };

  const handleOnTheWay = (id: string) => {
    Alert.alert('On The Way', 'Let the customer know you are on your way?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => updateStatus(id, 'on_the_way') },
    ]);
  };

  const handleArrived = (id: string) => {
    Alert.alert('Arrived', 'Confirm you have arrived at the service location?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => updateStatus(id, 'arrived') },
    ]);
  };

  const handleComplete = (id: string) => {
    Alert.alert('Mark Complete', 'Mark this booking as completed?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Complete', onPress: () => updateStatus(id, 'completed') },
    ]);
  };

  const renderBooking = ({ item }: { item: Booking }) => {
    const cust = item.customer as unknown as { full_name: string | null; avatar_url: string | null };
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('BookingDetail', { bookingId: item.id })}
        activeOpacity={0.8}
      >
        <View style={styles.cardTop}>
          <Avatar uri={cust?.avatar_url} name={cust?.full_name} size={46} />
          <View style={styles.cardInfo}>
            <Text style={styles.custName} numberOfLines={1}>{cust?.full_name ?? 'Customer'}</Text>
            <Text style={styles.serviceName} numberOfLines={1}>{item.service?.name ?? 'Service'}</Text>
            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={12} color={COLORS.textLight} />
              <Text style={styles.metaText}>{format(new Date(item.scheduled_date), 'MMM d')} at {item.scheduled_time?.slice(0, 5)}</Text>
              <Ionicons name="location-outline" size={12} color={COLORS.textLight} />
              <Text style={styles.metaText} numberOfLines={1}>{item.location}</Text>
            </View>
          </View>
          <Badge label={item.status} status={item.status} size="sm" />
        </View>

        {item.notes && (
          <Text style={styles.notes} numberOfLines={2}>{item.notes}</Text>
        )}

        {item.status === 'pending' && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => handleReject(item.id)}>
              <Ionicons name="close" size={16} color={COLORS.error} />
              <Text style={styles.rejectText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAccept(item.id)}>
              <Ionicons name="checkmark" size={16} color={COLORS.white} />
              <Text style={styles.acceptText}>Accept</Text>
            </TouchableOpacity>
          </View>
        )}

        {item.status === 'accepted' && (
          <TouchableOpacity style={styles.onTheWayBtn} onPress={() => handleOnTheWay(item.id)}>
            <Ionicons name="navigate-circle" size={16} color={COLORS.white} />
            <Text style={styles.onTheWayText}>On The Way</Text>
          </TouchableOpacity>
        )}

        {item.status === 'on_the_way' && (
          <TouchableOpacity style={styles.arrivedBtn} onPress={() => handleArrived(item.id)}>
            <Ionicons name="location" size={16} color={COLORS.white} />
            <Text style={styles.arrivedText}>Arrived</Text>
          </TouchableOpacity>
        )}

        {item.status === 'arrived' && (
          <TouchableOpacity style={styles.startBtn} onPress={() => handleStart(item.id)}>
            <Ionicons name="play-circle" size={16} color={COLORS.white} />
            <Text style={styles.startText}>Start Job</Text>
          </TouchableOpacity>
        )}

        {item.status === 'in_progress' && (
          <TouchableOpacity style={styles.completeBtn} onPress={() => handleComplete(item.id)}>
            <Ionicons name="checkmark-circle" size={16} color={COLORS.white} />
            <Text style={styles.completeText}>Mark as Completed</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Booking Requests</Text>
      </View>

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

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(item) => item.id}
          renderItem={renderBooking}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={10}
          initialNumToRender={8}
          windowSize={5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBookings(); }} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <EmptyState
              icon="calendar-outline"
              title="No bookings here"
              subtitle="Booking requests will appear here"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  topBar: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text },
  filterList: { maxHeight: 48, marginBottom: SPACING.xs },
  filterRow: { paddingHorizontal: SPACING.md, gap: SPACING.sm, alignItems: 'center' },
  filterTab: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  filterTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontWeight: '500' },
  filterTextActive: { color: COLORS.white, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
  cardInfo: { flex: 1 },
  custName: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  serviceName: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  metaText: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  notes: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontStyle: 'italic', marginBottom: SPACING.sm },
  actionRow: { flexDirection: 'row', gap: SPACING.sm },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.error,
  },
  rejectText: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.error },
  acceptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.success,
  },
  acceptText: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.white },
  onTheWayBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    backgroundColor: '#3B82F6',
  },
  onTheWayText: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.white },
  arrivedBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    backgroundColor: '#8B5CF6',
  },
  arrivedText: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.white },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
  },
  startText: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.white },
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.success,
  },
  completeText: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.white },
});
