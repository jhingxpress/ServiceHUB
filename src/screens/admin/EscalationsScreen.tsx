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
  TextInput,
  Modal,
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
import { Escalation, EscalationStatus } from '../../types';
import { isAdmin } from '../../utils/roleUtils';
import { logStaffAction } from '../../services/staffAuditService';
import { fetchEscalations, updateEscalationStatus } from '../../services/escalationService';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

const STATUSES: EscalationStatus[] = ['open', 'in_progress', 'resolved', 'dismissed'];

export default function EscalationsScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<EscalationStatus | 'all'>('all');
  const [resolveModal, setResolveModal] = useState<{ visible: boolean; escalation: Escalation | null; notes: string }>({
    visible: false,
    escalation: null,
    notes: '',
  });
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await fetchEscalations();
    if (error) {
      console.error('[EscalationsScreen] load error:', error);
    } else {
      setEscalations(data ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleStatus = (escalation: Escalation, status: EscalationStatus) => {
    if (status === 'resolved' || status === 'dismissed') {
      setResolveModal({ visible: true, escalation, notes: escalation.notes ?? '' });
      return;
    }
    update(escalation, status, escalation.notes ?? undefined);
  };

  const update = async (escalation: Escalation | null, status: EscalationStatus, notes?: string) => {
    if (!escalation) return;
    setUpdating(true);
    try {
      const { data, error } = await updateEscalationStatus(escalation.id, status, notes);
      if (error) throw new Error(error);
      await logStaffAction({
        action: `escalation_${status}`,
        targetTable: 'escalations',
        targetRecordId: escalation.id,
        notes: `Escalation ${status}${notes ? ': ' + notes : ''}`,
      });
      setEscalations((prev) => prev.map((e) => (e.id === escalation.id ? (data ?? e) : e)));
      setResolveModal({ visible: false, escalation: null, notes: '' });
    } catch (err) {
      console.error('[EscalationsScreen] update error:', err);
      Alert.alert('Error', 'Failed to update escalation.');
    } finally {
      setUpdating(false);
    }
  };

  const filtered = filter === 'all' ? escalations : escalations.filter((e) => e.status === filter);

  const renderItem = ({ item }: { item: Escalation }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Badge
          label={item.status}
          status={
            item.status === 'open' ? 'pending' : item.status === 'in_progress' ? 'info' : item.status === 'resolved' ? 'completed' : 'cancelled'
          }
          size="sm"
        />
        <Text style={styles.time}>{format(new Date(item.created_at), 'MMM d, h:mm a')}</Text>
      </View>
      {item.created_by_user && (
        <Text style={styles.meta}>
          Escalated by {item.created_by_user.full_name ?? item.created_by_user.email} · {item.created_by_user.role}
        </Text>
      )}
      <Text style={styles.reason}>{item.reason}</Text>
      {item.target_table && (
        <Text style={styles.target}>
          Target: {item.target_table}
          {item.target_record_id ? ` · ${item.target_record_id.slice(0, 8)}` : ''}
        </Text>
      )}
      {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
      {isAdmin(user?.role) && item.status !== 'resolved' && item.status !== 'dismissed' && (
        <View style={styles.actions}>
          {STATUSES.filter((s) => s !== item.status).map((status) => (
            <TouchableOpacity
              key={status}
              style={[styles.actionBtn, (status === 'resolved' || status === 'dismissed') && styles.finalBtn]}
              onPress={() => handleStatus(item, status)}
            >
              <Text style={[styles.actionText, (status === 'resolved' || status === 'dismissed') && styles.finalText]}>
                {status.replace('_', ' ')}
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
        <Text style={styles.title}>Escalations</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.filterRow}>
        {['all', 'open', 'in_progress', 'resolved', 'dismissed'].map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f as EscalationStatus | 'all')}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1).replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <EmptyState icon="checkmark-circle-outline" title="No escalations" subtitle="Moderator escalations will appear here" />
        }
      />

      <Modal animationType="slide" transparent visible={resolveModal.visible} onRequestClose={() => setResolveModal({ visible: false, escalation: null, notes: '' })}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Resolve Escalation</Text>
              <TouchableOpacity onPress={() => setResolveModal({ visible: false, escalation: null, notes: '' })}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Resolution notes</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="Add notes..."
              placeholderTextColor={COLORS.textLight}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              value={resolveModal.notes}
              onChangeText={(text) => setResolveModal((m) => ({ ...m, notes: text }))}
            />
            <View style={styles.modalActions}>
              <Button
                title="Resolve"
                onPress={() => update(resolveModal.escalation, 'resolved', resolveModal.notes)}
                loading={updating}
                style={{ flex: 1 }}
              />
              <Button
                title="Dismiss"
                variant="outline"
                onPress={() => update(resolveModal.escalation, 'dismissed', resolveModal.notes)}
                loading={updating}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
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
  time: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, fontFamily: FONTS.medium },
  meta: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACING.xs },
  reason: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.xs },
  target: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginBottom: SPACING.xs },
  notes: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20, marginBottom: SPACING.sm },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  actionBtn: {
    flex: 1, backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm, alignItems: 'center',
  },
  finalBtn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.error },
  actionText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.primary },
  finalText: { color: COLORS.error },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, paddingBottom: SPACING.xl,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md,
  },
  modalTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.text },
  label: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.xs },
  input: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.base, color: COLORS.text, marginBottom: SPACING.sm,
  },
  notesInput: { minHeight: 100, paddingTop: SPACING.sm, paddingBottom: SPACING.sm, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
});
