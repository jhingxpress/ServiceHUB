import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { AdminStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Badge from '../../components/ui/Badge';
import { Report, ReportStatus } from '../../types';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

const STATUS_FILTERS: { label: string; value: ReportStatus | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Investigating', value: 'investigating' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Dismissed', value: 'dismissed' },
];

export default function AdminReportsScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<ReportStatus | 'all'>('all');

  const loadReports = useCallback(async () => {
    let q = supabase
      .from('reports')
      .select('*, reporter:reporter_id(id, full_name, email), reported_user:reported_user_id(id, full_name, email, is_active)')
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      q = q.eq('status', filter);
    }

    const { data, error } = await q;
    if (error) Alert.alert('Error', error.message);
    setReports((data ?? []) as unknown as Report[]);
    setLoading(false);
    setRefreshing(false);
  }, [filter]);

  useFocusEffect(useCallback(() => { loadReports(); }, [loadReports]));

  const handleStatusChange = async (reportId: string, newStatus: ReportStatus, adminNotes?: string) => {
    const { error } = await supabase
      .from('reports')
      .update({
        status: newStatus,
        admin_notes: adminNotes ?? null,
        resolved_at: newStatus === 'resolved' || newStatus === 'dismissed' ? new Date().toISOString() : null,
        resolved_by: newStatus === 'resolved' || newStatus === 'dismissed' ? user?.id : null,
      })
      .eq('id', reportId);

    if (error) { Alert.alert('Error', error.message); return; }
    await loadReports();
  };

  const handleWarnUser = (report: Report) => {
    const reportedUser = report.reported_user as { id: string; full_name: string | null } | undefined;
    Alert.prompt(
      'Warn User',
      `Enter warning message for ${reportedUser?.full_name ?? 'this user'}:`,
      async (warningText) => {
        if (!warningText?.trim()) return;
        await handleStatusChange(report.id, 'investigating', `WARNING: ${warningText.trim()}`);
      },
      'plain-text'
    );
  };

  const handleSuspendUser = (report: Report) => {
    const reportedUser = report.reported_user as { id: string; full_name: string | null; is_active: boolean } | undefined;
    if (!reportedUser?.id) return;
    Alert.alert(
      'Suspend User',
      `Suspend ${reportedUser?.full_name ?? 'this user'}? Their account will be deactivated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Suspend',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('users')
              .update({ is_active: false })
              .eq('id', reportedUser.id);
            if (error) { Alert.alert('Error', error.message); return; }
            await handleStatusChange(report.id, 'resolved', 'User suspended by admin.');
          },
        },
      ]
    );
  };

  const handleToggleUserActive = (report: Report) => {
    const reportedUser = report.reported_user as { id: string; full_name: string | null; is_active: boolean } | undefined;
    if (!reportedUser?.id) return;
    const isActive = reportedUser.is_active;
    const action = isActive ? 'Deactivate' : 'Reactivate';
    Alert.alert(
      `${action} User`,
      `${action} account for ${reportedUser?.full_name ?? 'this user'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          style: isActive ? 'destructive' : 'default',
          onPress: async () => {
            const { error } = await supabase
              .from('users')
              .update({ is_active: !isActive })
              .eq('id', reportedUser.id);
            if (error) { Alert.alert('Error', error.message); return; }
            await loadReports();
          },
        },
      ]
    );
  };

  const openUserProfile = (report: Report) => {
    const reportedUser = report.reported_user as { id: string } | undefined;
    if (reportedUser?.id) {
      navigation.navigate('UserDetail', { userId: reportedUser.id });
    }
  };

  const renderItem = ({ item }: { item: Report }) => {
    const reportedUser = item.reported_user as { id: string; full_name: string | null; email: string | null; is_active?: boolean } | undefined;
    const reporter = item.reporter as { full_name: string | null; email: string | null } | undefined;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Badge label={item.report_type.replace(/_/g, ' ')} status={item.status} size="sm" />
          <Text style={styles.date}>{format(new Date(item.created_at), 'MMM d, yyyy')}</Text>
        </View>

        <Text style={styles.desc}>{item.description}</Text>

        <View style={styles.peopleRow}>
          <View style={styles.personChip}>
            <Ionicons name="person-outline" size={12} color={COLORS.textLight} />
            <Text style={styles.peopleText} numberOfLines={1}>By: {reporter?.full_name ?? reporter?.email ?? 'Unknown'}</Text>
          </View>
          <View style={[styles.personChip, reportedUser?.is_active === false && styles.personChipInactive]}>
            <Ionicons name="flag-outline" size={12} color={COLORS.error} />
            <Text style={styles.peopleText} numberOfLines={1}>
              Against: {reportedUser?.full_name ?? reportedUser?.email ?? 'Unknown'}
              {reportedUser?.is_active === false ? ' (Inactive)' : ''}
            </Text>
          </View>
        </View>

        {item.admin_notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Admin Notes</Text>
            <Text style={styles.notesText}>{item.admin_notes}</Text>
          </View>
        ) : null}

        {/* Report status actions */}
        {item.status === 'pending' && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.infoLight }]}
              onPress={() => handleStatusChange(item.id, 'investigating')}
            >
              <Ionicons name="search-outline" size={13} color={COLORS.info} />
              <Text style={[styles.actionText, { color: COLORS.info }]}>Investigate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.surfaceSecondary }]}
              onPress={() => handleStatusChange(item.id, 'dismissed')}
            >
              <Ionicons name="close-outline" size={13} color={COLORS.textSecondary} />
              <Text style={[styles.actionText, { color: COLORS.textSecondary }]}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}
        {item.status === 'investigating' && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.successLight }]}
              onPress={() => handleStatusChange(item.id, 'resolved')}
            >
              <Ionicons name="checkmark-outline" size={13} color={COLORS.success} />
              <Text style={[styles.actionText, { color: COLORS.success }]}>Resolve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: COLORS.surfaceSecondary }]}
              onPress={() => handleStatusChange(item.id, 'dismissed')}
            >
              <Ionicons name="close-outline" size={13} color={COLORS.textSecondary} />
              <Text style={[styles.actionText, { color: COLORS.textSecondary }]}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* User actions */}
        <View style={styles.userActionDivider}>
          <Text style={styles.userActionLabel}>User Actions</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.userActionsRow}>
          <TouchableOpacity style={styles.userActionBtn} onPress={() => openUserProfile(item)}>
            <Ionicons name="person-circle-outline" size={14} color={COLORS.primary} />
            <Text style={[styles.userActionText, { color: COLORS.primary }]}>View Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.userActionBtn} onPress={() => handleWarnUser(item)}>
            <Ionicons name="warning-outline" size={14} color={COLORS.warning} />
            <Text style={[styles.userActionText, { color: '#92400E' }]}>Warn</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.userActionBtn} onPress={() => handleSuspendUser(item)}>
            <Ionicons name="ban-outline" size={14} color={COLORS.error} />
            <Text style={[styles.userActionText, { color: COLORS.error }]}>Suspend</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.userActionBtn} onPress={() => handleToggleUserActive(item)}>
            <Ionicons
              name={reportedUser?.is_active === false ? 'checkmark-circle-outline' : 'person-remove-outline'}
              size={14}
              color={reportedUser?.is_active === false ? COLORS.success : COLORS.error}
            />
            <Text style={[styles.userActionText, { color: reportedUser?.is_active === false ? COLORS.success : COLORS.error }]}>
              {reportedUser?.is_active === false ? 'Reactivate' : 'Deactivate'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Reports</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterTab, filter === f.value && styles.filterTabActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadReports(); }}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="shield-checkmark-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.emptyText}>No reports found</Text>
          </View>
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
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
  },
  title: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.xxl, color: COLORS.text },
  filterScroll: { maxHeight: 48, marginBottom: SPACING.sm },
  filterRow: { paddingHorizontal: SPACING.md, gap: SPACING.sm, alignItems: 'center' },
  filterTab: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  filterTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  filterTextActive: { fontFamily: FONTS.bold, color: COLORS.white },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  date: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  desc: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.base, color: COLORS.text, marginBottom: SPACING.sm },
  peopleRow: { gap: SPACING.xs, marginBottom: SPACING.sm },
  personChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
  },
  personChipInactive: { backgroundColor: COLORS.errorLight },
  peopleText: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, flex: 1 },
  notesBox: {
    backgroundColor: COLORS.warningLight, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm, marginBottom: SPACING.sm, borderLeftWidth: 3, borderLeftColor: COLORS.warning,
  },
  notesLabel: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.xs, color: '#92400E', marginBottom: 2 },
  notesText: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.sm, color: COLORS.text },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
  },
  actionText: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.sm },
  userActionDivider: {
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingTop: SPACING.sm, marginTop: SPACING.xs, marginBottom: SPACING.sm,
  },
  userActionLabel: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.5 },
  userActionsRow: { flexDirection: 'row' },
  userActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm, paddingVertical: 6,
    marginRight: SPACING.xs, borderWidth: 1, borderColor: COLORS.border,
  },
  userActionText: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.xs },
  empty: { alignItems: 'center', marginTop: SPACING.xxl },
  emptyText: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.base, color: COLORS.textLight, marginTop: SPACING.md },
});
