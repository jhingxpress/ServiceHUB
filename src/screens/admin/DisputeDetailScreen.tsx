import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import ImageView from 'react-native-image-viewing';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { AdminStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';

type Props = NativeStackScreenProps<AdminStackParamList, 'DisputeDetail'>;

type DisputeStatusValue = 'open' | 'in_review' | 'resolved' | 'rejected';

interface DisputeDetail {
  id: string;
  booking_id: string;
  raised_by: string;
  reason: string;
  status: DisputeStatusValue;
  resolution_notes: string | null;
  created_at: string;
  booking: {
    id: string;
    status: string;
    scheduled_date: string;
    scheduled_time: string;
    location: string | null;
    notes: string | null;
    customer: { full_name: string | null; avatar_url: string | null; email: string | null };
    provider: { business_name: string | null; profile_photo_url: string | null };
    service: { name: string; price: number } | null;
  } | null;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  content: string | null;
  message_type: string;
  created_at: string;
  sender: { full_name: string | null; avatar_url: string | null } | null;
}

const STATUS_CFG: Record<DisputeStatusValue, { label: string; bg: string; color: string }> = {
  open: { label: 'Open', bg: '#FEF3C7', color: '#92400E' },
  in_review: { label: 'In Review', bg: COLORS.primaryLight, color: COLORS.primary },
  resolved: { label: 'Resolved', bg: COLORS.successLight, color: '#065F46' },
  rejected: { label: 'Rejected', bg: COLORS.errorLight, color: '#991B1B' },
};

export default function DisputeDetailScreen({ route, navigation }: Props) {
  const { disputeId } = route.params;
  const { user } = useAuthStore();

  const [dispute, setDispute] = useState<DisputeDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [resolutionNote, setResolutionNote] = useState('');
  const [showResolutionInput, setShowResolutionInput] = useState(false);
  const [pendingAction, setPendingAction] = useState<DisputeStatusValue | null>(null);
  const [viewerImages, setViewerImages] = useState<{ uri: string }[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);

  const loadData = useCallback(async () => {
    const [dispRes, msgsRes] = await Promise.all([
      supabase
        .from('disputes')
        .select(`
          id, booking_id, raised_by, reason, status, resolution_notes, created_at,
          booking:bookings(
            id, status, scheduled_date, scheduled_time, location, notes,
            customer:users!bookings_customer_id_fkey(full_name, avatar_url, email),
            provider:providers!bookings_provider_id_fkey(business_name, profile_photo_url),
            service:services(name, price)
          )
        `)
        .eq('id', disputeId)
        .single(),
      supabase
        .from('messages')
        .select(`
          id, sender_id, content, message_type, created_at,
          sender:users!messages_sender_id_fkey(full_name, avatar_url)
        `)
        .order('created_at', { ascending: true }),
    ]);

    if (dispRes.data) {
      const d = dispRes.data as unknown as DisputeDetail;
      setDispute(d);
      if (d.booking_id) {
        const filtered = (msgsRes.data ?? []) as unknown as ChatMessage[];
        setMessages(filtered);
      }
    }
    setLoading(false);
  }, [disputeId]);

  useEffect(() => { loadData(); }, [loadData]);

  const fetchMessages = useCallback(async (bookingId: string) => {
    const { data } = await supabase
      .from('messages')
      .select(`
        id, sender_id, content, message_type, created_at,
        sender:users!messages_sender_id_fkey(full_name, avatar_url)
      `)
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });
    setMessages((data ?? []) as unknown as ChatMessage[]);
  }, []);

  useEffect(() => {
    if (dispute?.booking_id) {
      fetchMessages(dispute.booking_id);
    }
  }, [dispute?.booking_id, fetchMessages]);

  const performAction = async (newStatus: DisputeStatusValue) => {
    if ((newStatus === 'resolved') && !resolutionNote.trim()) {
      Alert.alert('Required', 'Please enter resolution notes.'); return;
    }
    setResolving(true);
    const { error } = await supabase
      .from('disputes')
      .update({
        status: newStatus,
        resolution_notes: resolutionNote.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', disputeId);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      await loadData();
      setShowResolutionInput(false);
      setResolutionNote('');
      setPendingAction(null);
    }
    setResolving(false);
  };

  const openImage = (uri: string) => {
    setViewerImages([{ uri }]);
    setViewerIndex(0);
    setViewerVisible(true);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!dispute) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Dispute not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusCfg = STATUS_CFG[dispute.status] ?? STATUS_CFG.open;
  const booking = dispute.booking;
  const customer = booking?.customer as { full_name: string | null; avatar_url: string | null; email: string | null } | null;
  const provider = booking?.provider as { business_name: string | null; profile_photo_url: string | null } | null;
  const imageMessages = messages.filter((m) => m.message_type === 'image' && m.content);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dispute Detail</Text>
        <View style={[styles.statusPill, { backgroundColor: statusCfg.bg }]}>
          <Text style={[styles.statusPillText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>

        {/* Dispute Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dispute</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="flag-outline" size={15} color={COLORS.error} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Reason</Text>
                <Text style={styles.infoValue}>{dispute.reason}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={15} color={COLORS.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Filed</Text>
                <Text style={styles.infoValue}>{format(new Date(dispute.created_at), 'MMM d, yyyy h:mm a')}</Text>
              </View>
            </View>
            {dispute.resolution_notes ? (
              <>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <Ionicons name="checkmark-circle-outline" size={15} color={COLORS.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Resolution Notes</Text>
                    <Text style={styles.infoValue}>{dispute.resolution_notes}</Text>
                  </View>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* Parties */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Parties Involved</Text>
          <View style={styles.partiesRow}>
            <View style={styles.partyCard}>
              <Avatar uri={customer?.avatar_url} name={customer?.full_name} size={44} />
              <Text style={styles.partyRole}>Customer</Text>
              <Text style={styles.partyName} numberOfLines={1}>{customer?.full_name ?? 'Unknown'}</Text>
              {customer?.email ? <Text style={styles.partyEmail} numberOfLines={1}>{customer.email}</Text> : null}
            </View>
            <View style={styles.vsCol}>
              <Text style={styles.vsText}>VS</Text>
            </View>
            <View style={styles.partyCard}>
              <Avatar uri={provider?.profile_photo_url} name={provider?.business_name} size={44} />
              <Text style={styles.partyRole}>Provider</Text>
              <Text style={styles.partyName} numberOfLines={1}>{provider?.business_name ?? 'Unknown'}</Text>
            </View>
          </View>
        </View>

        {/* Booking Info */}
        {booking ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Booking Details</Text>
            <View style={styles.infoCard}>
              {[
                { icon: 'construct-outline', label: 'Service', value: booking.service?.name },
                { icon: 'cash-outline', label: 'Price', value: booking.service?.price ? `₱${booking.service.price}` : null },
                { icon: 'calendar-outline', label: 'Scheduled', value: `${format(new Date(booking.scheduled_date), 'MMM d, yyyy')} · ${booking.scheduled_time?.slice(0, 5) ?? ''}` },
                { icon: 'location-outline', label: 'Location', value: booking.location },
                { icon: 'information-circle-outline', label: 'Status', value: booking.status?.replace(/_/g, ' ') },
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
              {booking.notes ? (
                <>
                  <View style={styles.divider} />
                  <View style={styles.infoRow}>
                    <Ionicons name="document-text-outline" size={15} color={COLORS.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoLabel}>Customer Notes</Text>
                      <Text style={styles.infoValue}>{booking.notes}</Text>
                    </View>
                  </View>
                </>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Attached Photos from chat */}
        {imageMessages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Attached Photos ({imageMessages.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {imageMessages.map((m) => (
                <TouchableOpacity key={m.id} onPress={() => openImage(m.content!)}>
                  <Image source={{ uri: m.content! }} style={styles.photoThumb} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Message History */}
        {messages.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Message History ({messages.length})</Text>
            <View style={styles.infoCard}>
              {messages.map((msg, i) => {
                const senderData = msg.sender as { full_name: string | null; avatar_url: string | null } | null;
                return (
                  <View key={msg.id}>
                    <View style={styles.msgRow}>
                      <Avatar uri={senderData?.avatar_url} name={senderData?.full_name} size={32} />
                      <View style={styles.msgBubble}>
                        <Text style={styles.msgSender}>{senderData?.full_name ?? 'Unknown'}</Text>
                        {msg.message_type === 'image' && msg.content ? (
                          <TouchableOpacity onPress={() => openImage(msg.content!)}>
                            <Image source={{ uri: msg.content }} style={styles.msgImage} resizeMode="cover" />
                          </TouchableOpacity>
                        ) : (
                          <Text style={styles.msgContent}>{msg.content}</Text>
                        )}
                        <Text style={styles.msgTime}>{format(new Date(msg.created_at), 'MMM d, h:mm a')}</Text>
                      </View>
                    </View>
                    {i < messages.length - 1 && <View style={styles.msgDivider} />}
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Resolution Controls */}
        {(dispute.status === 'open' || dispute.status === 'in_review') && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Actions</Text>

            {showResolutionInput ? (
              <View style={styles.resolutionForm}>
                <Text style={styles.resolutionFormTitle}>
                  {pendingAction === 'resolved' ? 'Resolution Notes' : 'Rejection Reason'}
                </Text>
                <TextInput
                  style={styles.resolutionInput}
                  value={resolutionNote}
                  onChangeText={setResolutionNote}
                  placeholder={pendingAction === 'resolved' ? 'Describe how this was resolved...' : 'Reason for rejection...'}
                  placeholderTextColor={COLORS.textLight}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                <View style={styles.formBtns}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => { setShowResolutionInput(false); setResolutionNote(''); setPendingAction(null); }}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.confirmBtn,
                      { backgroundColor: pendingAction === 'resolved' ? COLORS.success : COLORS.error },
                      resolving && styles.disabledBtn,
                    ]}
                    onPress={() => pendingAction && performAction(pendingAction)}
                    disabled={resolving}
                  >
                    {resolving
                      ? <ActivityIndicator color={COLORS.white} size="small" />
                      : <Text style={styles.confirmBtnText}>
                          {pendingAction === 'resolved' ? 'Mark Resolved' : 'Reject Dispute'}
                        </Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.actionGrid}>
                {dispute.status === 'open' && (
                  <TouchableOpacity
                    style={styles.reviewBtn}
                    onPress={() => performAction('in_review')}
                    disabled={resolving}
                  >
                    <Ionicons name="search-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.reviewBtnText}>Mark In Review</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.resolveBtn}
                  onPress={() => { setPendingAction('resolved'); setShowResolutionInput(true); }}
                >
                  <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.white} />
                  <Text style={styles.resolveBtnText}>Resolve</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => { setPendingAction('rejected'); setShowResolutionInput(true); }}
                >
                  <Ionicons name="close-circle-outline" size={16} color={COLORS.error} />
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      <ImageView
        images={viewerImages}
        imageIndex={viewerIndex}
        visible={viewerVisible}
        onRequestClose={() => setViewerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary },
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
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, padding: SPACING.md },
  infoLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginBottom: 2 },
  infoValue: { fontSize: FONTS.sizes.sm, color: COLORS.text, fontFamily: FONTS.medium, lineHeight: 20 },
  divider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md },
  partiesRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  partyCard: {
    flex: 1, alignItems: 'center', gap: 4,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  partyRole: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, textTransform: 'uppercase' },
  partyName: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, textAlign: 'center' },
  partyEmail: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, textAlign: 'center' },
  vsCol: { alignItems: 'center', paddingHorizontal: 4 },
  vsText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.bold, color: COLORS.textLight },
  photoThumb: { width: 80, height: 80, borderRadius: BORDER_RADIUS.md, marginRight: SPACING.xs },
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, padding: SPACING.md },
  msgBubble: { flex: 1 },
  msgSender: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.primary, marginBottom: 2 },
  msgContent: { fontSize: FONTS.sizes.sm, color: COLORS.text, lineHeight: 18 },
  msgImage: { width: 120, height: 90, borderRadius: BORDER_RADIUS.md, marginTop: 4 },
  msgTime: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 4 },
  msgDivider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md },
  actionGrid: { gap: SPACING.sm },
  reviewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.primaryLight, borderWidth: 1, borderColor: COLORS.primary,
  },
  reviewBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.primary },
  resolveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.success, ...SHADOWS.small,
  },
  resolveBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.white },
  rejectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.errorLight, borderWidth: 1, borderColor: '#FECACA',
  },
  rejectBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.error },
  resolutionForm: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, gap: SPACING.sm, ...SHADOWS.small,
  },
  resolutionFormTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  resolutionInput: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
    fontSize: FONTS.sizes.base, color: COLORS.text, minHeight: 80,
  },
  formBtns: { flexDirection: 'row', gap: SPACING.sm },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  cancelBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  confirmBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl, ...SHADOWS.small,
  },
  confirmBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.white },
  disabledBtn: { opacity: 0.6 },
});
