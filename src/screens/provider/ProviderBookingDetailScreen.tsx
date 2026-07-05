import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, Linking,
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
import { ProviderStackParamList } from '../../navigation/types';
import { createNotification } from '../../services/notificationService';
import { calcBookingFee } from '../../utils/bookingFee';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;
type RouteType = RouteProp<ProviderStackParamList, 'BookingDetail'>;

const STEPS = ['pending', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'completed'];

export default function ProviderBookingDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { bookingId } = route.params;
  const { user } = useAuthStore();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const fetchBooking = async () => {
    const { data } = await supabase
      .from('bookings')
      .select(`
        *,
        service:services(name, price)
      `)
      .eq('id', bookingId)
      .single();
    setBooking(data ?? null);
    setLoading(false);
  };

  useEffect(() => {
    fetchBooking();
    const channel = supabase
      .channel(`provider-booking-${bookingId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `id=eq.${bookingId}` },
        () => fetchBooking()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [bookingId]);

  const updateStatus = async (status: string, title: string, message: string) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setUpdating(true);
          try {
            if (!user) return;
            const { error } = await supabase.from('bookings').update({ status }).eq('id', bookingId).eq('provider_id', user.id);
            if (error) {
              Alert.alert('Error', 'Failed to update status. Please try again.');
              setUpdating(false);
              return;
            }
            
            // Fetch booking to notify customer
            const { data: booking } = await supabase
              .from('bookings')
              .select('customer_id, total_amount')
              .eq('id', bookingId)
              .maybeSingle();
            if (booking?.customer_id) {
              const servicePrice = Number(booking.total_amount ?? 0);
              const bookingFee = servicePrice > 0 ? calcBookingFee(servicePrice) : 0;
              const totalDue = servicePrice + bookingFee;
              const totalDueText = totalDue > 0
                ? `Total Cash Due: ₱${totalDue.toLocaleString('en-PH')}.`
                : '';

              const notificationConfig: Record<string, { title: string; body: string }> = {
                accepted: { title: 'Booking Accepted', body: 'Your booking has been accepted by the provider.' },
                rejected: { title: 'Booking Rejected', body: 'Your booking has been rejected by the provider.' },
                on_the_way: { title: 'Provider On The Way', body: 'Your provider is on the way to your location.' },
                arrived: { title: 'Provider Arrived', body: 'Your provider has arrived at your location.' },
                in_progress: { title: 'Service In Progress', body: 'Your service is now in progress.' },
                completed: {
                  title: 'Booking Completed',
                  body: `Your booking has been completed.${totalDueText ? ' ' + totalDueText : ''}`,
                },
              };
              
              const config = notificationConfig[status];
              if (config) {
                createNotification({
                  userId: booking.customer_id,
                  type: `booking_${status}`,
                  title: config.title,
                  body: config.body,
                  data: { booking_id: bookingId }
                });
              }
            }
            
            await fetchBooking();
          } catch {
            Alert.alert('Error', 'An unexpected error occurred during status update.');
          } finally {
            setUpdating(false);
          }
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

  const currentStep = STEPS.indexOf(booking.status);
  const photos: string[] = Array.isArray(booking.photo_urls) ? (booking.photo_urls as string[]) : [];
  const customerName = booking.customer_name;
  const customerPhone = booking.customer_phone;
  const customerAvatar = booking.customer_avatar_url;

  const svcPrice   = Number(booking.total_amount ?? 0);
  const bookingFee = svcPrice > 0 ? calcBookingFee(svcPrice) : 0;

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
            {booking.status === 'pending' && 'New booking request'}
            {booking.status === 'accepted' && 'You accepted this booking'}
            {booking.status === 'on_the_way' && 'You are on the way'}
            {booking.status === 'arrived' && 'You have arrived'}
            {booking.status === 'in_progress' && 'Service in progress'}
            {booking.status === 'completed' && 'Service completed'}
            {booking.status === 'cancelled' && 'Booking was cancelled'}
            {booking.status === 'rejected' && 'You rejected this booking'}
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

        {/* Customer card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer</Text>
          <View style={styles.customerRow}>
            <Avatar uri={customerAvatar ?? null} name={customerName} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{customerName ?? 'Customer'}</Text>
              {customerPhone && (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${customerPhone}`)}>
                  <Text style={styles.customerPhone}>{customerPhone}</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() =>
                navigation.navigate('ChatRoom', {
                  bookingId,
                  otherUserId: booking.customer_id,
                  otherUserName: customerName ?? 'Customer',
                  otherUserAvatar: customerAvatar,
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
            <Text style={styles.infoValue}>{format(new Date(booking.scheduled_date), 'EEEE, MMM d, yyyy')}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.infoLabel}>Time</Text>
            <Text style={styles.infoValue}>{format(new Date(`1970-01-01T${booking.scheduled_time}`), 'h:mm a')}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.infoLabel}>Address</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoValue}>{booking.location}</Text>
              {(booking.booking_city || booking.booking_province) && (
                <Text style={styles.locationSub}>
                  {booking.booking_city}{booking.booking_city && booking.booking_province ? ', ' : ''}{booking.booking_province}
                </Text>
              )}
            </View>
          </View>
          {booking.latitude != null && booking.longitude != null && (
            <>
              <View style={styles.infoRow}>
                <Ionicons name="navigate-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.infoLabel}>GPS</Text>
                <View style={{ flex: 1 }}>
                  {(booking.booking_city || booking.booking_province) ? (
                    <Text style={styles.infoValue}>
                      📍 {[booking.booking_city, booking.booking_province].filter(Boolean).join(', ')}
                    </Text>
                  ) : (
                    <Text style={styles.infoValue}>{booking.location}</Text>
                  )}
                  <Text style={styles.coordsSub}>
                    ({booking.latitude.toFixed(5)}, {booking.longitude.toFixed(5)})
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.mapsBtn}
                onPress={() => {
                  const url = `https://www.google.com/maps/dir/?api=1&destination=${booking.latitude},${booking.longitude}`;
                  Linking.openURL(url);
                }}
              >
                <Ionicons name="navigate-outline" size={18} color={COLORS.primary} />
                <Text style={styles.mapsBtnText}>Navigate</Text>
              </TouchableOpacity>
            </>
          )}
          {booking.service && (
            <View style={styles.infoRow}>
              <Ionicons name="construct-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.infoLabel}>Service</Text>
              <Text style={styles.infoValue}>{booking.service.name}</Text>
            </View>
          )}
          {svcPrice > 0 && (
            <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: SPACING.xs, paddingTop: SPACING.sm }}>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Service Price</Text>
                <Text style={[styles.priceValue, { color: COLORS.primary }]}>₱{svcPrice.toLocaleString('en-PH')}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Platform Fee</Text>
                <Text style={styles.priceValue}>₱{bookingFee.toLocaleString('en-PH')}</Text>
              </View>
              <Text style={styles.priceReminder}>Remit Platform Fee to TAGA when booking is completed</Text>
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

        {/* Photos */}
        {photos.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Photos</Text>
            <View style={styles.photoRow}>
              {photos.map((url, i) => (
                <Image key={i} source={{ uri: url }} style={styles.photoThumb} resizeMode="cover" />
              ))}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {['accepted', 'on_the_way', 'arrived'].includes(booking.status) && (
            <Button
              title="Share Live Location"
              onPress={() =>
                navigation.navigate('ProviderLiveTracking', {
                  bookingId,
                  customerName: customerName ?? 'Customer',
                  customerLat: booking.latitude ?? undefined,
                  customerLng: booking.longitude ?? undefined,
                })
              }
              fullWidth
              style={styles.actionBtn}
            />
          )}
          {booking.status === 'pending' && (
            <>
              <Button
                title="Accept Booking"
                onPress={() => updateStatus('accepted', 'Accept Booking', 'Accept this booking request?')}
                loading={updating}
                fullWidth
                style={styles.actionBtn}
              />
              <Button
                title="Reject Booking"
                onPress={() => updateStatus('rejected', 'Reject Booking', 'Reject this booking request?')}
                loading={updating}
                variant="outline"
                fullWidth
                style={styles.actionBtn}
              />
            </>
          )}
          {booking.status === 'accepted' && (
            <Button
              title="Mark On The Way"
              onPress={() => updateStatus('on_the_way', 'On The Way', 'Let the customer know you are on your way?')}
              loading={updating}
              fullWidth
              style={styles.actionBtn}
            />
          )}
          {booking.status === 'on_the_way' && (
            <Button
              title="Mark Arrived"
              onPress={() => updateStatus('arrived', 'Arrived', 'Confirm you have arrived at the service location?')}
              loading={updating}
              fullWidth
              style={styles.actionBtn}
            />
          )}
          {booking.status === 'arrived' && (
            <Button
              title="Start Job"
              onPress={() => updateStatus('in_progress', 'Start Job', 'Start this job now?')}
              loading={updating}
              fullWidth
              style={styles.actionBtn}
            />
          )}
          {booking.status === 'in_progress' && (
            <Button
              title="Mark as Completed"
              onPress={() => updateStatus('completed', 'Mark Complete', 'Mark this booking as completed?')}
              loading={updating}
              fullWidth
              style={styles.actionBtn}
            />
          )}
          {['arrived', 'in_progress', 'completed'].includes(booking.status) && (
            <Button
              title="Report an Incident"
              onPress={() => navigation.navigate('BookingIncidentReport', { bookingId })}
              fullWidth
              variant="outline"
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
  title: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  statusBanner: {
    marginHorizontal: SPACING.md, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  statusText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, marginBottom: 2 },
  statusSubtext: { fontSize: FONTS.sizes.sm },
  progressSection: { marginHorizontal: SPACING.md, marginBottom: SPACING.md },
  progressTrack: { flexDirection: 'row', alignItems: 'center' },
  stepItem: { alignItems: 'center', flex: 1 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  stepDotActive: { backgroundColor: COLORS.primary },
  stepDotDone: { backgroundColor: COLORS.success },
  stepNum: { fontSize: FONTS.sizes.xs, color: COLORS.white, fontFamily: FONTS.semiBold },
  stepLabel: { fontSize: 10, color: COLORS.textLight, textTransform: 'capitalize', textAlign: 'center' },
  stepLabelActive: { color: COLORS.primary, fontFamily: FONTS.semiBold },
  stepLine: { flex: 1, height: 2, backgroundColor: COLORS.border, marginBottom: 20 },
  stepLineDone: { backgroundColor: COLORS.success },
  card: {
    backgroundColor: COLORS.surface, marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  cardTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.sm },
  customerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  customerName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  customerPhone: { fontSize: FONTS.sizes.sm, color: COLORS.primary, marginTop: 2, textDecorationLine: 'underline' },
  chatBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, paddingVertical: 6,
  },
  infoLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, width: 70 },
  infoValue: { flex: 1, fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  locationSub: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  coordsSub: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontFamily: FONTS.regular, marginTop: 2 },
  mapsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    marginTop: SPACING.xs, alignSelf: 'flex-start',
  },
  mapsBtnText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.primary },
  notesText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, lineHeight: 22 },
  priceRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  priceLabel:   { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  priceValue:   { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  priceReminder: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: SPACING.xs },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  photoThumb: { width: 80, height: 80, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.background },
  actions: { paddingHorizontal: SPACING.md, gap: SPACING.sm },
  actionBtn: { marginTop: 0 },
});
