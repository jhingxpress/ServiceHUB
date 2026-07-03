import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { AdminStackParamList } from '../../navigation/types';
import { BookingIncidentReport, BookingIncidentStatus } from '../../types';
import { canCloseReports } from '../../utils/roleUtils';
import { logStaffAction } from '../../services/staffAuditService';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

const STATUS_OPTIONS: { value: BookingIncidentStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'dismissed', label: 'Dismissed' },
];

export default function StaffIncidentReportsScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const role = user?.role;
  const [reports, setReports] = useState<BookingIncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<BookingIncidentStatus | 'all'>('all');

  const fetchReports = useCallback(async () => {
    try {
      let q = supabase
        .from('booking_incident_reports')
        .select('*, booking:bookings(id, status), provider:providers(id, business_name)')
        .order('created_at', { ascending: false });
      if (filter !== 'all') q = q.eq('status', filter);
      const { data, error } = await q;
      if (error) throw error;
      setReports((data ?? []) as unknown as BookingIncidentReport[]);
    } catch (err) {
      console.error('[StaffIncidentReports] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchReports();
  };

  const handleUpdateStatus = async (report: BookingIncidentReport, status: BookingIncidentStatus) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('booking_incident_reports')
        .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq('id', report.id);
      if (error) throw error;
      await logStaffAction({
        action: `incident_report_${status}`,
        targetTable: 'booking_incident_reports',
        targetRecordId: report.id,
        targetUserId: report.provider_id,
        notes: `Status changed to ${status}`,
      });
      fetchReports();
    } catch (err) {
      console.error('[StaffIncidentReports] update error:', err);
      Alert.alert('Error', 'Failed to update report status.');
    }
  };

  const renderItem = ({ item }: { item: BookingIncidentReport }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.iconWrap}>
          <Ionicons name="warning" size={20} color={COLORS.error} />
        </View>
        <Badge
          label={item.status}
          status={item.status === 'open' ? 'pending' : item.status === 'reviewed' ? 'completed' : 'cancelled'}
          size="sm"
        />
      </View>
      <Text style={styles.reason}>{item.reason.replace(/_/g, ' ').toUpperCase()}</Text>
      {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Reported {format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}</Text>
      </View>
      {item.latitude && item.longitude && (
        <Text style={styles.coords}>
          GPS: {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
        </Text>
      )}
      {canCloseReports(role) && item.status === 'open' && (
        <View style={styles.actions}>
          {STATUS_OPTIONS.filter((s) => s.value !== item.status).map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.actionBtn, option.value === 'dismissed' && styles.dismissBtn]}
              onPress={() => handleUpdateStatus(item, option.value)}
            >
              <Text style={[styles.actionText, option.value === 'dismissed' && styles.dismissText]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Incident Reports</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filterRow}>
        {['all', 'open', 'reviewed', 'dismissed'].map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f as BookingIncidentStatus | 'all')}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <EmptyState
            icon="checkmark-circle-outline"
            title="No incident reports"
            subtitle="Reports will appear here when providers submit them"
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  filterRow: {
    flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.md, marginBottom: SPACING.sm,
  },
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
  iconWrap: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.errorLight,
    alignItems: 'center', justifyContent: 'center',
  },
  reason: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.xs },
  notes: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20, marginBottom: SPACING.sm },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs },
  metaText: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  coords: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginBottom: SPACING.sm },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  actionBtn: {
    flex: 1, backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm, alignItems: 'center',
  },
  dismissBtn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.error },
  actionText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.primary },
  dismissText: { color: COLORS.error },
});
