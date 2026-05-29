import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Badge from '../../components/ui/Badge';
import { Report, ReportStatus } from '../../types';

type NavProp = NativeStackNavigationProp<any>;

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
      .select('*, reporter:reporter_id(id, full_name, email), reported_user:reported_user_id(id, full_name, email)')
      .order('created_at', { ascending: false });

    if (filter !== 'all') {
      q = q.eq('status', filter);
    }

    const { data, error } = await q;
    if (error) Alert.alert('Error', error.message);
    setReports(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [filter]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleStatusChange = async (reportId: string, newStatus: ReportStatus) => {
    const { error } = await supabase
      .from('reports')
      .update({
        status: newStatus,
        resolved_at: newStatus === 'resolved' || newStatus === 'dismissed' ? new Date().toISOString() : null,
        resolved_by: newStatus === 'resolved' || newStatus === 'dismissed' ? user?.id : null,
      })
      .eq('id', reportId);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    loadReports();
  };

  const renderItem = ({ item }: { item: Report }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Badge label={item.report_type.replace(/_/g, ' ')} status={item.status} size="sm" />
        <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
      </View>

      <Text style={styles.desc}>{item.description}</Text>

      <View style={styles.peopleRow}>
        <Text style={styles.peopleText}>
          By: {item.reporter?.full_name ?? 'Unknown'}
        </Text>
        <Text style={styles.peopleText}>
          Against: {item.reported_user?.full_name ?? 'Unknown'}
        </Text>
      </View>

      {item.status === 'pending' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: COLORS.infoLight }]}
            onPress={() => handleStatusChange(item.id, 'investigating')}
          >
            <Text style={[styles.actionText, { color: COLORS.info }]}>Investigate</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: COLORS.errorLight }]}
            onPress={() => handleStatusChange(item.id, 'dismissed')}
          >
            <Text style={[styles.actionText, { color: COLORS.error }]}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {item.status === 'investigating' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: COLORS.successLight }]}
            onPress={() => handleStatusChange(item.id, 'resolved')}
          >
            <Text style={[styles.actionText, { color: COLORS.success }]}>Resolve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: COLORS.errorLight }]}
            onPress={() => handleStatusChange(item.id, 'dismissed')}
          >
            <Text style={[styles.actionText, { color: COLORS.error }]}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

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

      <View style={styles.filterRow}>
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
      </View>

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadReports(); }} tintColor={COLORS.primary} />}
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
  filterRow: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  filterTab: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  filterTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  filterTextActive: { fontFamily: FONTS.bold, color: COLORS.white },
  list: { padding: SPACING.md, gap: SPACING.sm },
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  date: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  desc: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.base, color: COLORS.text, marginBottom: SPACING.sm },
  peopleRow: { flexDirection: 'row', gap: SPACING.lg, marginBottom: SPACING.sm },
  peopleText: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  actions: { flexDirection: 'row', gap: SPACING.sm },
  actionBtn: { flex: 1, alignItems: 'center', paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md },
  actionText: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.sm },
  empty: { alignItems: 'center', marginTop: SPACING.xxl },
  emptyText: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.base, color: COLORS.textLight, marginTop: SPACING.md },
});
