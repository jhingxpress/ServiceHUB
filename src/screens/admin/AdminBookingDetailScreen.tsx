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
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { AdminStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';

type Props = NativeStackScreenProps<AdminStackParamList, 'BookingDetail'>;

interface AdminBooking {
  id: string;
  status: string;
  scheduled_date: string;
  scheduled_time: string;
  location: string | null;
  notes: string | null;
  customer_name: string | null;
  created_at: string;
  updated_at: string;
  customer: { full_name: string | null; avatar_url: string | null; email: string | null; phone: string | null };
  provider: {
    business_name: string | null;
    profile_photo_url: string | null;
    city: string | null;
    province: string | null;
    users: { full_name: string | null; email: string | null; phone: string | null } | null;
  };
  service: { name: string; price: number; description: string | null } | null;
  payment: { status: string; amount: number; payment_method: string | null } | null;
}

const STATUS_CFG: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  pending:     { label: 'Pending',     bg: '#FEF3C7', color: '#92400E', icon: 'time-outline' },
  accepted:    { label: 'Accepted',    bg: '#DBEAFE', color: '#1E40AF', icon: 'checkmark-outline' },
  on_the_way:  { label: 'On the Way', bg: '#EDE9FE', color: '#5B21B6', icon: 'navigate-outline' },
  arrived:     { label: 'Arrived',     bg: '#E0F2FE', color: '#075985', icon: 'location-outline' },
  in_progress: { label: 'In Progress', bg: '#EDE9FE', color: '#4C1D95', icon: 'build-outline' },
  completed:   { label: 'Completed',   bg: '#D1FAE5', color: '#065F46', icon: 'checkmark-circle-outline' },
  cancelled:   { label: 'Cancelled',   bg: '#FEE2E2', color: '#991B1B', icon: 'close-circle-outline' },
  disputed:    { label: 'Disputed',    bg: '#FFEDD5', color: '#9A3412', icon: 'alert-circle-outline' },
};

const TIMELINE_STEPS = ['pending', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'completed'];

export default function AdminBookingDetailScreen({ route, navigation }: Props) {
  const { bookingId } = route.params;
  const [booking, setBooking] = useState<AdminBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, status, scheduled_date, scheduled_time, location, notes,
          customer_name, created_at, updated_at,
          customer:users!bookings_customer_id_fkey(full_name, avatar_url, email, phone),
          provider:providers!bookings_provider_id_fkey(
            business_name, profile_photo_url, city, province,
            users!providers_id_fkey(full_name, email, phone)
          ),
          service:services(name, price, description),
          payment:payments(status, amount, payment_method)
        `)
        .eq('id', bookingId)
        .single();

      if (error) Alert.alert('Error', error.message);
      setBooking(data as unknown as AdminBooking ?? null);
      setLoading(false);
    };
    load();
  }, [bookingId]);

  const handleAdminCancel = () => {
    Alert.alert('Cancel Booking', 'Admin cancel this booking?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          const { error } = await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('id', bookingId);
          if (error) {
            Alert.alert('Error', error.message);
          } else {
            setBooking((prev) => prev ? { ...prev, status: 'cancelled' } : prev);
          }
          setCancelling(false);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>Booking not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusCfg = STATUS_CFG[booking.status] ?? STATUS_CFG.pending;
  const customer = booking.customer as { full_name: string | null; avatar_url: string | null; email: string | null; phone: string | null } | null;
  const provider = booking.provider as { business_name: string | null; profile_photo_url: string | null; city: string | null; province: string | null; users: { full_name: string | null; email: string | null; phone: string | null } | null } | null;
  const service = booking.service as { name: string; price: number; description: string | null } | null;
  const payment = Array.isArray(booking.payment) ? booking.payment[0] : booking.payment as { status: string; amount: number; payment_method: string | null } | null;

  const currentStep = TIMELINE_STEPS.indexOf(booking.status);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Booking Detail</Text>
        <View style={[styles.statusPill, { backgroundColor: statusCfg.bg }]}>
          <Text style={[styles.statusPillText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Status Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Timeline</Text>
          <View style={styles.timelineCard}>
            {TIMELINE_STEPS.map((step, i) => {
              const cfg = STATUS_CFG[step];
              const done = currentStep >= i;
              const active = currentStep === i;
              return (
                <View key={step} style={styles.timelineRow}>
                  <View style={styles.timelineLeft}>
                    <View style={[
                      styles.timelineDot,
                      done && styles.timelineDotDone,
                      active && styles.timelineDotActive,
                    ]}>
                      {done ? <Ionicons name="checkmark" size={10} color={COLORS.white} /> : null}
                    </View>
                    {i < TIMELINE_STEPS.length - 1 && (
                      <View style={[styles.timelineLine, done && styles.timelineLineDone]} />
                    )}
                  </View>
                  <Text style={[
                    styles.timelineLabel,
                    active && styles.timelineLabelActive,
                    done && !active && styles.timelineLabelDone,
                  ]}>
                    {cfg?.label ?? step}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Service & Amount */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Service & Payment</Text>
          <View style={styles.infoCard}>
            {[
              { icon: 'construct-outline', label: 'Service', value: service?.name },
              { icon: 'document-text-outline', label: 'Description', value: service?.description },
              { icon: 'cash-outline', label: 'Service Price', value: service?.price ? `₱${service.price}` : null },
              { icon: 'wallet-outline', label: 'Payment Status', value: payment?.status },
              { icon: 'card-outline', label: 'Payment Method', value: payment?.payment_method },
              { icon: 'receipt-outline', label: 'Amount Paid', value: payment?.amount ? `₱${payment.amount}` : null },
            ].filter((r) => r.value).map((row, i, arr) => (
              <React.Fragment key={row.label}>
                <View style={styles.infoRow}>
                  <Ionicons name={row.icon as React.ComponentProps<typeof Ionicons>['name']} size={15} color={COLORS.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>{row.label}</Text>
                    <Text style={styles.infoValue}>{row.value}</Text>
                  </View>
                </View>
                {i < arr.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Schedule & Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule & Location</Text>
          <View style={styles.infoCard}>
            {[
              { icon: 'calendar-outline', label: 'Date', value: format(new Date(booking.scheduled_date), 'EEEE, MMMM d, yyyy') },
              { icon: 'time-outline', label: 'Time', value: booking.scheduled_time?.slice(0, 5) },
              { icon: 'location-outline', label: 'Location', value: booking.location },
              { icon: 'document-text-outline', label: 'Customer Notes', value: booking.notes },
            ].filter((r) => r.value).map((row, i, arr) => (
              <React.Fragment key={row.label}>
                <View style={styles.infoRow}>
                  <Ionicons name={row.icon as React.ComponentProps<typeof Ionicons>['name']} size={15} color={COLORS.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>{row.label}</Text>
                    <Text style={styles.infoValue}>{row.value}</Text>
                  </View>
                </View>
                {i < arr.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Customer */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer</Text>
          <View style={[styles.infoCard, styles.personCard]}>
            <Avatar uri={customer?.avatar_url} name={customer?.full_name} size={52} />
            <View style={styles.personInfo}>
              <Text style={styles.personName}>{customer?.full_name ?? booking.customer_name ?? 'Unknown'}</Text>
              {customer?.email ? <Text style={styles.personDetail}>{customer.email}</Text> : null}
              {customer?.phone ? <Text style={styles.personDetail}>{customer.phone}</Text> : null}
            </View>
          </View>
        </View>

        {/* Provider */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Provider</Text>
          <View style={[styles.infoCard, styles.personCard]}>
            <Avatar uri={provider?.profile_photo_url} name={provider?.business_name} size={52} />
            <View style={styles.personInfo}>
              <Text style={styles.personName}>{provider?.business_name ?? 'Unknown'}</Text>
              {provider?.users?.full_name ? <Text style={styles.personDetail}>{provider.users.full_name}</Text> : null}
              {provider?.users?.email ? <Text style={styles.personDetail}>{provider.users.email}</Text> : null}
              {(provider?.city || provider?.province) ? (
                <Text style={styles.personDetail}>
                  {[provider.city, provider.province].filter(Boolean).join(', ')}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* Meta */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Booking Metadata</Text>
          <View style={styles.infoCard}>
            {[
              { icon: 'key-outline', label: 'Booking ID', value: booking.id },
              { icon: 'create-outline', label: 'Created', value: format(new Date(booking.created_at), 'MMM d, yyyy h:mm a') },
              { icon: 'refresh-outline', label: 'Last Updated', value: format(new Date(booking.updated_at), 'MMM d, yyyy h:mm a') },
            ].map((row, i, arr) => (
              <React.Fragment key={row.label}>
                <View style={styles.infoRow}>
                  <Ionicons name={row.icon as React.ComponentProps<typeof Ionicons>['name']} size={15} color={COLORS.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>{row.label}</Text>
                    <Text style={[styles.infoValue, row.label === 'Booking ID' && styles.monoText]}>
                      {row.value}
                    </Text>
                  </View>
                </View>
                {i < arr.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Admin Action */}
        {booking.status !== 'cancelled' && booking.status !== 'completed' && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleAdminCancel}
            disabled={cancelling}
          >
            {cancelling
              ? <ActivityIndicator color={COLORS.error} size="small" />
              : <>
                  <Ionicons name="close-circle-outline" size={18} color={COLORS.error} />
                  <Text style={styles.cancelBtnText}>Admin Cancel Booking</Text>
                </>
            }
          </TouchableOpacity>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text, flex: 1, marginLeft: SPACING.sm },
  statusPill: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold },
  content: { padding: SPACING.md, gap: SPACING.md },
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold,
    color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.7,
  },
  infoCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  personCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md },
  personInfo: { flex: 1 },
  personName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  personDetail: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, padding: SPACING.md },
  infoLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginBottom: 2 },
  infoValue: { fontSize: FONTS.sizes.sm, color: COLORS.text, fontFamily: FONTS.medium, lineHeight: 20 },
  monoText: { fontFamily: 'monospace', fontSize: FONTS.sizes.xs },
  divider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md },
  timelineCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, ...SHADOWS.small,
  },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 0 },
  timelineLeft: { width: 24, alignItems: 'center' },
  timelineDot: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.border,
  },
  timelineDotDone: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  timelineDotActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  timelineLine: { width: 2, flex: 1, backgroundColor: COLORS.border, minHeight: 20, marginVertical: 2 },
  timelineLineDone: { backgroundColor: COLORS.success },
  timelineLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textLight, paddingLeft: SPACING.sm, paddingBottom: SPACING.sm, paddingTop: 2 },
  timelineLabelActive: { color: COLORS.primary, fontFamily: FONTS.semiBold },
  timelineLabelDone: { color: COLORS.text },
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.errorLight, borderWidth: 1, borderColor: '#FECACA',
  },
  cancelBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.error },
});
