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
import { Booking } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import { ProviderStackParamList } from '../../navigation/types';
import { useErrorHandler } from '../../utils/errorHandler';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;

export default function ActiveJobsScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { showError } = useErrorHandler();

  const fetchJobs = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        customer:users!bookings_customer_id_fkey(full_name, avatar_url, phone),
        service:services(name, price)
      `)
      .eq('provider_id', user.id)
      .in('status', ['accepted', 'in_progress'])
      .order('scheduled_date', { ascending: true });
    if (error) showError(error, 'Failed to load active jobs.');
    setJobs(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleStart = async (bookingId: string) => {
    const { error } = await supabase.from('bookings').update({ status: 'in_progress' }).eq('id', bookingId);
    if (error) { showError(error, 'Failed to start job.'); return; }
    fetchJobs();
  };

  const handleComplete = (bookingId: string) => {
    Alert.alert('Mark Complete', 'Confirm job completion?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Complete',
        onPress: async () => {
          const { error } = await supabase.from('bookings').update({ status: 'completed' }).eq('id', bookingId);
          if (error) { showError(error, 'Failed to complete job.'); return; }
          fetchJobs();
        },
      },
    ]);
  };

  const renderJob = ({ item }: { item: Booking }) => {
    const cust = item.customer as unknown as { full_name: string | null; avatar_url: string | null; phone: string | null };
    const isActive = item.status === 'in_progress';

    return (
      <View style={[styles.card, isActive && styles.cardActive]}>
        {/* Status bar */}
        <View style={[styles.statusStrip, { backgroundColor: isActive ? COLORS.success : COLORS.warning }]} />

        <View style={styles.cardBody}>
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={[styles.statusBadge, { backgroundColor: isActive ? '#D1FAE5' : '#FEF3C7' }]}>
              <View style={[styles.statusDot, { backgroundColor: isActive ? COLORS.success : COLORS.warning }]} />
              <Text style={[styles.statusText, { color: isActive ? COLORS.success : '#92400E' }]}>
                {isActive ? 'In Progress' : 'Accepted'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => navigation.navigate('ChatRoom', {
                bookingId: item.id,
                otherUserId: item.customer_id,
                otherUserName: cust?.full_name ?? 'Customer',
              })}
              style={styles.chatBtn}
            >
              <Ionicons name="chatbubble-outline" size={16} color={COLORS.primary} />
              <Text style={styles.chatBtnText}>Chat</Text>
            </TouchableOpacity>
          </View>

          {/* Customer */}
          <View style={styles.custRow}>
            <Avatar uri={cust?.avatar_url} name={cust?.full_name} size={48} borderColor={isActive ? COLORS.success : COLORS.warning} />
            <View style={styles.custInfo}>
              <Text style={styles.custName}>{cust?.full_name ?? 'Customer'}</Text>
              <Text style={styles.serviceName}>{item.service?.name ?? 'Service'}</Text>
            </View>
            <Text style={styles.price}>${item.total_price ?? item.service?.price ?? '—'}</Text>
          </View>

          {/* Details */}
          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <Ionicons name="calendar-outline" size={14} color={COLORS.textLight} />
              <Text style={styles.detailText}>
                {format(new Date(item.scheduled_date), 'EEE, MMM d')} at {item.scheduled_time?.slice(0, 5)}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="location-outline" size={14} color={COLORS.textLight} />
              <Text style={styles.detailText} numberOfLines={1}>{item.location}</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {!isActive && (
              <TouchableOpacity style={styles.startBtn} onPress={() => handleStart(item.id)}>
                <Ionicons name="play" size={14} color={COLORS.white} />
                <Text style={styles.startBtnText}>Start Job</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.completeBtn, !isActive && { flex: 0.45 }]}
              onPress={() => handleComplete(item.id)}
            >
              <Ionicons name="checkmark-circle" size={14} color={COLORS.white} />
              <Text style={styles.completeBtnText}>Mark Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Active Jobs</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{jobs.length}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(item) => item.id}
          renderItem={renderJob}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          maxToRenderPerBatch={8}
          initialNumToRender={6}
          windowSize={5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchJobs(); }}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="briefcase-outline"
              title="No active jobs"
              subtitle="Accepted bookings will appear here"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm,
  },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text },
  countBadge: {
    backgroundColor: COLORS.success, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  countText: { fontSize: FONTS.sizes.sm, color: COLORS.white, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: SPACING.md, gap: SPACING.md, flexGrow: 1 },
  card: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.medium,
  },
  cardActive: { borderColor: COLORS.success + '40' },
  statusStrip: { width: 5 },
  cardBody: { flex: 1, padding: SPACING.md },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: BORDER_RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 4,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: FONTS.sizes.xs, fontWeight: '700' },
  chatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 5,
  },
  chatBtnText: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontWeight: '600' },
  custRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  custInfo: { flex: 1 },
  custName: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  serviceName: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  price: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.primary },
  detailsRow: { gap: 5, marginBottom: SPACING.md },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  actions: { flexDirection: 'row', gap: SPACING.sm },
  startBtn: {
    flex: 0.45, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.warning,
  },
  startBtnText: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.white },
  completeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.success,
  },
  completeBtnText: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.white },
});
