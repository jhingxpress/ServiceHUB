import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { AdminStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

interface Dispute {
  id: string;
  booking_id: string;
  raised_by: string;
  reason: string;
  status: 'open' | 'in_review' | 'resolved' | 'rejected';
  resolution_notes: string | null;
  created_at: string;
  booking?: {
    id: string;
    customer: { full_name: string | null; avatar_url: string | null };
    provider: { full_name: string | null; avatar_url: string | null };
    service: { name: string } | null;
  };
}

const FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'In Review', value: 'in_review' },
  { label: 'Resolved', value: 'resolved' },
];

export default function DisputesScreen() {
  const navigation = useNavigation<NavProp>();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  const fetchDisputes = async () => {
    let q = supabase
      .from('disputes')
      .select(`
        *,
        booking:bookings(
          id,
          customer:users!bookings_customer_id_fkey(full_name, avatar_url),
          provider:providers!bookings_provider_id_fkey(users!providers_id_fkey(full_name, avatar_url)),
          service:services(name)
        )
      `)
      .order('created_at', { ascending: false });
    
    if (filter !== 'all') q = q.eq('status', filter);
    
    const { data } = await q;
    setDisputes((data ?? []) as Dispute[]);
    setLoading(false);
  };

  useEffect(() => { fetchDisputes(); }, [filter]);

  const updateStatus = async (disputeId: string, status: string, notes?: string) => {
    await supabase
      .from('disputes')
      .update({ status, resolution_notes: notes || null })
      .eq('id', disputeId);
    fetchDisputes();
  };

  const handleResolve = (id: string) => {
    Alert.prompt(
      'Resolve Dispute',
      'Enter resolution notes (optional)',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resolve',
          onPress: (notes) => updateStatus(id, 'resolved', notes),
        },
      ],
      'plain-text'
    );
  };

  const handleReject = (id: string) => {
    Alert.alert('Reject Dispute', 'Reject this dispute?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: () => updateStatus(id, 'rejected'),
      },
    ]);
  };

  const renderDispute = ({ item }: { item: Dispute }) => {
    const booking = item.booking as Dispute['booking'];
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.parties}>
            <Avatar uri={booking?.customer?.avatar_url} name={booking?.customer?.full_name} size={36} />
            <Ionicons name="arrow-forward" size={16} color={COLORS.textLight} />
            <Avatar uri={booking?.provider?.avatar_url} name={booking?.provider?.full_name} size={36} />
          </View>
          <Badge label={item.status} status={item.status === 'resolved' ? 'completed' : item.status === 'rejected' ? 'cancelled' : 'pending'} size="sm" />
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="construct-outline" size={14} color={COLORS.textLight} />
          <Text style={styles.infoText}>{booking?.service?.name ?? 'Unknown Service'}</Text>
        </View>

        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>Reason:</Text>
          <Text style={styles.reasonText}>{item.reason}</Text>
        </View>

        {item.resolution_notes && (
          <View style={styles.resolutionBox}>
            <Text style={styles.resolutionLabel}>Resolution:</Text>
            <Text style={styles.resolutionText}>{item.resolution_notes}</Text>
          </View>
        )}

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{format(new Date(item.created_at), 'MMM d, yyyy')}</Text>
        </View>

        {item.status === 'open' && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => handleReject(item.id)}>
              <Ionicons name="close" size={14} color={COLORS.error} />
              <Text style={styles.actionText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.resolveBtn} onPress={() => handleResolve(item.id)}>
              <Ionicons name="checkmark" size={14} color={COLORS.white} />
              <Text style={styles.actionText}>Resolve</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
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
      <View style={styles.topBar}>
        <Text style={styles.title}>Disputes</Text>
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

      <FlatList
        data={disputes}
        keyExtractor={(item) => item.id}
        renderItem={renderDispute}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            icon="alert-circle-outline"
            title="No disputes"
            subtitle="Disputes will appear here when reported"
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  title: { fontSize: FONTS.sizes.xxl, fontFamily: FONTS.bold, color: COLORS.text },
  filterList: { maxHeight: 48, marginBottom: SPACING.xs },
  filterRow: { paddingHorizontal: SPACING.md, gap: SPACING.sm, alignItems: 'center' },
  filterTab: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  filterTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  filterTextActive: { color: COLORS.white, fontFamily: FONTS.semiBold },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  parties: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: SPACING.sm },
  infoText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  reasonBox: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm, marginBottom: SPACING.sm,
  },
  reasonLabel: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.textLight, marginBottom: 2 },
  reasonText: { fontSize: FONTS.sizes.sm, color: COLORS.text },
  resolutionBox: {
    backgroundColor: '#D1FAE5', borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm, marginBottom: SPACING.sm,
  },
  resolutionLabel: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.success, marginBottom: 2 },
  resolutionText: { fontSize: FONTS.sizes.sm, color: COLORS.text },
  metaRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: SPACING.sm },
  metaText: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  actionRow: { flexDirection: 'row', gap: SPACING.sm },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.error,
  },
  resolveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.success,
  },
  actionText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
});
