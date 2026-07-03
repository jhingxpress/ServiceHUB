import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
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
import { StaffActionLog } from '../../types';
import { isAdmin } from '../../utils/roleUtils';
import EmptyState from '../../components/ui/EmptyState';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

export default function StaffActionLogsScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [logs, setLogs] = useState<StaffActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      let q = supabase
        .from('staff_action_log')
        .select('*, staff:staff_id(full_name, email, role)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!isAdmin(user?.role)) {
        q = q.eq('staff_id', user?.id ?? '');
      }
      const { data, error } = await q;
      if (error) throw error;
      setLogs((data ?? []) as unknown as StaffActionLog[]);
    } catch (err) {
      console.error('[StaffActionLogs] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, user?.role]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs();
  };

  const renderItem = ({ item }: { item: StaffActionLog }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.primary} />
        </View>
        <Text style={styles.time}>{format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}</Text>
      </View>
      {isAdmin(user?.role) && item.staff && (
        <Text style={styles.staff}>
          {item.staff.full_name ?? item.staff.email ?? 'Unknown'} · {item.staff.role}
        </Text>
      )}
      <Text style={styles.action}>{item.action.replace(/_/g, ' ').toUpperCase()}</Text>
      {item.target_table && (
        <Text style={styles.target}>
          Target: {item.target_table}
          {item.target_record_id ? ` · ${item.target_record_id.slice(0, 8)}` : ''}
        </Text>
      )}
      {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
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
        <Text style={styles.title}>Staff Action Logs</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            title="No action logs"
            subtitle="Staff actions will be recorded here"
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
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  time: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, fontFamily: FONTS.medium },
  staff: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginBottom: 2 },
  action: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: 2 },
  target: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginBottom: 2 },
  notes: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20, marginTop: SPACING.xs },
});
