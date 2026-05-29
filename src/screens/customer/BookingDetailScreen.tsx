import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Booking } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS, STATUS_COLORS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { CustomerStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;
type RouteType = RouteProp<CustomerStackParamList, 'BookingDetail'>;

const STEPS = ['pending', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'completed'];

export default function BookingDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { bookingId } = route.params;
  const { user } = useAuthStore();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [hasReview, setHasReview] = useState(false);

  const fetchBooking = async () => {
    const { data } = await supabase
      .from('bookings')
      .select(`
        *,
        provider:providers!bookings_provider_id_fkey(
          *, users!providers_id_fkey(full_name, avatar_url, phone)
        ),
        service:services(name, price),
        customer:users!bookings_customer_id_fkey(full_name, avatar_url)
      `)
      .eq('id', bookingId)
      .single();
    setBooking(data ?? null);
    
    // Check if review exists
    if (data) {
      const { data: reviewData } = await supabase
        .from('reviews')
        .select('id')
        .eq('booking_id', bookingId)
        .single();
      setHasReview(!!reviewData);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchBooking();

    const channel = supabase
      .channel(`booking-status-${bookingId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${bookingId}` },
        () => fetchBooking()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [bookingId]);

  const handleCancel = () => {
    Alert.alert('Cancel Booking', 'Are you sure you want to cancel this booking?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Cancel Booking',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('id', bookingId);
          fetchBooking();
          setCancelling(false);
        },
      },
    ]);
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

  if (!booking) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={{ color: COLORS.textSecondary }}>Booking not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const providerUser = (booking.provider as unknown as { users: { full_name: string | null; avatar_url: string | null; phone: string | null } })?.users;
  const currentStep = STEPS.indexOf(booking.status);
  const isCompleted = booking.status === 'completed';
  const isCancellable = ['pending', 'accepted', 'on_the_way', 'arrived'].includes(booking.status);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Booking Details</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Status banner */}
        <View style={[styles.statusBanner, { backgroundColor: STATUS_COLORS[booking.status]?.bg ?? COLORS.primaryLight }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[booking.status]?.text ?? COLORS.primary }]}>
            {booking.status.replace('_', ' ').toUpperCase()}
          </Text>
          <Text style={[styles.statusSubtext, { color: STATUS_COLORS[booking.status]?.text ?? COLORS.primary }]}>
            {booking.status === 'pending' && 'Waiting for provider confirmation'}
            {booking.status === 'accepted' && 'Provider accepted your booking'}
            {booking.status === 'on_the_way' && 'Provider is on the way'}
            {booking.status === 'arrived' && 'Provider has arrived'}
            {booking.status === 'in_progress' && 'Service is in progress'}
            {booking.status === 'completed' && 'Service completed successfully'}
            {booking.status === 'cancelled' && 'This booking was cancelled'}
            {booking.status === 'rejected' && 'Provider rejected this booking'}
          </Text>
        </View>

        {/* Progress tracker */}
        {!['cancelled', 'rejected', 'disputed'].includes(booking.status) && (
          <View style={styles.progressSection}>
            <View style={styles.progressTrack}>
              {STEPS.map((step, i) => (
                <React.Fragment key={step}>
                  <View style={styles.stepItem}>
                    <View style={[
                      styles.stepDot,
                      i <= currentStep && styles.stepDotActive,
                      i < currentStep && styles.stepDotDone,
                    ]}>
                      {i < currentStep ? (
                        <Ionicons name="checkmark" size={10} color={COLORS.white} />
                      ) : (
                        <Text style={styles.stepNum}>{i + 1}</Text>
                      )}
                    </View>
                    <Text style={[styles.stepLabel, i <= currentStep && styles.stepLabelActive]}>
                      {step.replace('_', ' ')}
                    </Text>
                  </View>
                  {i < STEPS.length - 1 && (
                    <View style={[styles.stepLine, i < currentStep && styles.stepLineDone]} />
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>
        )}

        {/* Provider card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Provider</Text>
          <View style={styles.providerRow}>
            <Avatar uri={providerUser?.avatar_url} name={providerUser?.full_name} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>{providerUser?.full_name ?? 'Provider'}</Text>
              {providerUser?.phone && (
                <Text style={styles.providerPhone}>{providerUser.phone}</Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() =>
                navigation.navigate('ChatRoom', {
                  bookingId,
                  otherUserId: booking.provider_id,
                  otherUserName: providerUser?.full_name ?? 'Provider',
                })
              }
            >
              <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Booking info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Booking Info</Text>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.infoLabel}>Date</Text>
            <Text style={styles.infoValue}>
              {format(new Date(booking.scheduled_date), 'EEEE, MMM d, yyyy')}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.infoLabel}>Time</Text>
            <Text style={styles.infoValue}>
              {format(new Date(`1970-01-01T${booking.scheduled_time}`), 'h:mm a')}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.infoLabel}>Location</Text>
            <Text style={styles.infoValue} numberOfLines={2}>{booking.location}</Text>
          </View>
          {booking.service && (
            <View style={styles.infoRow}>
              <Ionicons name="construct-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.infoLabel}>Service</Text>
              <Text style={styles.infoValue}>{booking.service.name}</Text>
            </View>
          )}
          {booking.total_amount && (
            <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: SPACING.xs, paddingTop: SPACING.sm }]}>
              <Ionicons name="cash-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.infoLabel}>Total</Text>
              <Text style={[styles.infoValue, { color: COLORS.primary, fontWeight: '800' }]}>
                ₱{booking.total_amount}
              </Text>
            </View>
          )}
        </View>

        {/* Notes */}
        {booking.notes && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Notes</Text>
            <Text style={styles.notesText}>{booking.notes}</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {isCompleted && !hasReview && (
            <Button
              title="Leave a Review"
              onPress={() =>
                navigation.navigate('ReviewService', {
                  bookingId,
                  providerId: booking.provider_id,
                  providerName: providerUser?.full_name ?? 'Provider',
                })
              }
              fullWidth
              style={styles.actionBtn}
            />
          )}
          {isCancellable && (
            <Button
              title="Cancel Booking"
              onPress={handleCancel}
              loading={cancelling}
              variant="outline"
              fullWidth
              style={styles.actionBtn}
            />
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  statusBanner: {
    marginHorizontal: SPACING.md, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  statusText: { fontSize: FONTS.sizes.base, fontWeight: '800', marginBottom: 2 },
  statusSubtext: { fontSize: FONTS.sizes.sm },
  progressSection: { marginHorizontal: SPACING.md, marginBottom: SPACING.md },
  progressTrack: { flexDirection: 'row', alignItems: 'center' },
  stepItem: { alignItems: 'center', flex: 1 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  stepDotActive: { backgroundColor: COLORS.primary },
  stepDotDone: { backgroundColor: COLORS.success },
  stepNum: { fontSize: FONTS.sizes.xs, color: COLORS.white, fontWeight: '700' },
  stepLabel: { fontSize: 10, color: COLORS.textLight, textTransform: 'capitalize', textAlign: 'center' },
  stepLabelActive: { color: COLORS.primary, fontWeight: '600' },
  stepLine: { flex: 1, height: 2, backgroundColor: COLORS.border, marginBottom: 20 },
  stepLineDone: { backgroundColor: COLORS.success },
  card: {
    backgroundColor: COLORS.surface, marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  cardTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  providerName: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  providerPhone: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  chatBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, paddingVertical: 6,
  },
  infoLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, width: 70 },
  infoValue: { flex: 1, fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  notesText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, lineHeight: 22 },
  actions: { paddingHorizontal: SPACING.md, gap: SPACING.sm },
  actionBtn: { marginTop: 0 },
});
