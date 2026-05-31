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
        service:services(name, price),
        customer:users!bookings_customer_id_fkey(full_name, avatar_url, phone)
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
          const { error } = await supabase.from('bookings').update({ status }).eq('id', bookingId);
          if (error) {
            Alert.alert('Error', 'Failed to update status. Please try again.');
          }
          fetchBooking();
          setUpdating(false);
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

  const customer = (booking.customer as unknown as { full_name: string | null; avatar_url: string | null; phone: string | null }) ?? {};
  const currentStep = STEPS.indexOf(booking.status);
  const photos: string[] = (booking.photo_urls as any) ?? [];

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
            <Avatar uri={customer.avatar_url ?? null} name={customer.full_name} size={52} />
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{customer.full_name ?? 'Customer'}</Text>
              {customer.phone && (
                <TouchableOpacity onPress={() => Linking.openURL(`tel:${customer.phone}`)}>
                  <Text style={styles.customerPhone}>{customer.phone}</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() =>
                navigation.navigate('ChatRoom', {
                  bookingId,
                  otherUserId: booking.customer_id,
                  otherUserName: customer.full_name ?? 'Customer',
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
            <Text style={styles.infoValue} numberOfLines={3}>{booking.location}</Text>
          </View>
          {booking.service && (
            <View style={styles.infoRow}>
              <Ionicons name="construct-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.infoLabel}>Service</Text>
              <Text style={styles.infoValue}>{booking.service.name}</Text>
            </View>
          )}
          {booking.total_amount !== null && (
            <View style={[styles.infoRow, { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: SPACING.xs, paddingTop: SPACING.sm }]}>
              <Ionicons name="cash-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.infoLabel}>Total</Text>
              <Text style={[styles.infoValue, { color: COLORS.primary, fontFamily: FONTS.bold }]}>
                ₱{(booking.total_amount ?? 0).toLocaleString('en-PH')}
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
  notesText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, lineHeight: 22 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  photoThumb: { width: 80, height: 80, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.background },
  actions: { paddingHorizontal: SPACING.md, gap: SPACING.sm },
  actionBtn: { marginTop: 0 },
});
