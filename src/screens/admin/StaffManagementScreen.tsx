import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { AdminStackParamList } from '../../navigation/types';
import { StaffRole, User, EmploymentStatus } from '../../types';
import { STAFF_ROLES, getStaffRoleLabel, isValidStaffRole } from '../../utils/roleUtils';
import { logStaffAction } from '../../services/staffAuditService';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

interface StaffUser extends User {}

export default function StaffManagementScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ email: '', full_name: '', role: 'support_agent' as StaffRole });
  const [creating, setCreating] = useState(false);
  const [notesModal, setNotesModal] = useState<{ visible: boolean; member: StaffUser | null; notes: string }>({
    visible: false,
    member: null,
    notes: '',
  });
  const [savingNotes, setSavingNotes] = useState(false);
  const [tempPasswordModal, setTempPasswordModal] = useState<{ visible: boolean; password: string; staffName: string }>({
    visible: false,
    password: '',
    staffName: '',
  });

  const fetchStaff = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .in('role', STAFF_ROLES)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setStaff((data ?? []) as StaffUser[]);
    } catch (err) {
      console.error('[StaffManagement] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchStaff(); }, [fetchStaff]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStaff();
  };

  const handleCreate = async () => {
    if (!form.email.trim() || !form.full_name.trim()) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (!isValidStaffRole(form.role)) {
      Alert.alert('Invalid role', 'Please select a valid staff role.');
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-staff', {
        body: {
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          role: form.role,
        },
      });
      if (error || !data?.success) {
        Alert.alert('Error', error?.message ?? data?.error ?? 'Failed to create staff account');
        return;
      }
      await logStaffAction({
        action: 'create_staff',
        targetTable: 'users',
        targetRecordId: data.user_id,
        notes: `Created ${form.role} account`,
      });
      setForm({ email: '', full_name: '', role: 'support_agent' });
      setModalVisible(false);
      await fetchStaff();
      setTempPasswordModal({
        visible: true,
        password: data.temporary_password ?? '',
        staffName: form.full_name.trim(),
      });
    } catch (err) {
      console.error('[StaffManagement] create error:', err);
      Alert.alert('Error', 'Failed to create staff account.');
    } finally {
      setCreating(false);
    }
  };

  const handleResetPassword = (member: StaffUser) => {
    Alert.alert(
      'Reset Password',
      `Issue a new temporary password for ${member.full_name ?? 'this staff member'}? Their current password will stop working immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data, error } = await supabase.functions.invoke('reset-staff-password', {
                body: { user_id: member.id },
              });
              if (error || !data?.success) {
                Alert.alert('Error', error?.message ?? data?.error ?? 'Failed to reset password');
                return;
              }
              setTempPasswordModal({
                visible: true,
                password: data.temporary_password ?? '',
                staffName: member.full_name ?? 'Staff',
              });
            } catch (err) {
              console.error('[StaffManagement] reset password error:', err);
              Alert.alert('Error', 'Failed to reset password.');
            }
          },
        },
      ]
    );
  };

  const closeTempPasswordModal = () => {
    setTempPasswordModal({ visible: false, password: '', staffName: '' });
  };

  const shareTemporaryPassword = async () => {
    try {
      await Share.share({
        message: `Your temporary TAGA password is: ${tempPasswordModal.password}\nPlease change it after your first login.`,
      });
    } catch (err) {
      // User dismissed the share sheet; no action needed
    }
  };

  const toggleActive = (member: StaffUser) => {
    const newValue = !member.is_active;
    Alert.alert(
      newValue ? 'Activate Staff Account' : 'Deactivate Staff Account',
      `Are you sure you want to ${newValue ? 'activate' : 'deactivate'} ${member.full_name ?? 'this staff member'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: newValue ? 'Activate' : 'Deactivate',
          style: newValue ? 'default' : 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('users').update({ is_active: newValue }).eq('id', member.id);
              if (error) throw error;
              await logStaffAction({
                action: newValue ? 'activate_staff' : 'deactivate_staff',
                targetTable: 'users',
                targetRecordId: member.id,
                notes: `Staff account ${newValue ? 'activated' : 'deactivated'}`,
              });
              setStaff((prev) => prev.map((s) => (s.id === member.id ? { ...s, is_active: newValue } : s)));
            } catch (err) {
              console.error('[StaffManagement] toggle error:', err);
              Alert.alert('Error', 'Failed to update staff status.');
            }
          },
        },
      ]
    );
  };

  const changeRole = async (member: StaffUser) => {
    Alert.alert(
      'Change Role',
      'Select a new role',
      [
        ...STAFF_ROLES.map((role) => ({
          text: getStaffRoleLabel(role),
          onPress: async () => {
            if (role === member.role) return;
            try {
              const { error } = await supabase.from('users').update({ role }).eq('id', member.id);
              if (error) throw error;
              await logStaffAction({
                action: 'change_staff_role',
                targetTable: 'users',
                targetRecordId: member.id,
                notes: `Changed role from ${member.role} to ${role}`,
              });
              setStaff((prev) => prev.map((s) => (s.id === member.id ? { ...s, role } : s)));
            } catch (err) {
              console.error('[StaffManagement] change role error:', err);
              Alert.alert('Error', 'Failed to change role.');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const EMPLOYMENT_STATUSES: EmploymentStatus[] = ['active', 'suspended', 'inactive', 'resigned'];

  const changeEmploymentStatus = async (member: StaffUser) => {
    Alert.alert(
      'Change Employment Status',
      'Select a new status',
      [
        ...EMPLOYMENT_STATUSES.map((status) => ({
          text: status.charAt(0).toUpperCase() + status.slice(1),
          onPress: async () => {
            if (status === member.employment_status) return;
            try {
              const { error } = await supabase.from('users').update({ employment_status: status }).eq('id', member.id);
              if (error) throw error;
              await logStaffAction({
                action: 'change_employment_status',
                targetTable: 'users',
                targetRecordId: member.id,
                notes: `Employment status changed from ${member.employment_status} to ${status}`,
              });
              setStaff((prev) => prev.map((s) => (s.id === member.id ? { ...s, employment_status: status } : s)));
            } catch (err) {
              console.error('[StaffManagement] change employment status error:', err);
              Alert.alert('Error', 'Failed to change employment status.');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const openNotesModal = (member: StaffUser) => {
    setNotesModal({ visible: true, member, notes: member.internal_notes ?? '' });
  };

  const closeNotesModal = () => {
    setNotesModal({ visible: false, member: null, notes: '' });
  };

  const saveNotes = async () => {
    if (!notesModal.member) return;
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ internal_notes: notesModal.notes.trim() || null })
        .eq('id', notesModal.member.id);
      if (error) throw error;
      await logStaffAction({
        action: 'update_staff_internal_notes',
        targetTable: 'users',
        targetRecordId: notesModal.member.id,
        notes: 'Internal notes updated',
      });
      setStaff((prev) =>
        prev.map((s) => (s.id === notesModal.member!.id ? { ...s, internal_notes: notesModal.notes.trim() || null } : s))
      );
      closeNotesModal();
    } catch (err) {
      console.error('[StaffManagement] save notes error:', err);
      Alert.alert('Error', 'Failed to save internal notes.');
    } finally {
      setSavingNotes(false);
    }
  };

  const renderItem = ({ item }: { item: StaffUser }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View>
          <Text style={styles.name}>{item.full_name ?? 'Unnamed'}</Text>
          <Text style={styles.email}>{item.email}</Text>
        </View>
        <Badge
          label={getStaffRoleLabel(item.role)}
          status={item.role === 'moderator' ? 'pending' : item.role === 'support_agent' ? 'completed' : 'info'}
          size="sm"
        />
      </View>
      <View style={styles.statusRow}>
        <Badge
          label={item.employment_status}
          status={
            item.employment_status === 'active'
              ? 'completed'
              : item.employment_status === 'suspended'
              ? 'pending'
              : 'cancelled'
          }
          size="sm"
        />
        <Badge
          label={item.is_active ? 'Account Active' : 'Account Inactive'}
          status={item.is_active ? 'completed' : 'cancelled'}
          size="sm"
        />
      </View>
      {item.internal_notes && (
        <Text style={styles.internalNotes} numberOfLines={2}>
          {item.internal_notes}
        </Text>
      )}
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => changeRole(item)}>
          <Text style={styles.actionText}>Role</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => changeEmploymentStatus(item)}>
          <Text style={styles.actionText}>Status</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => openNotesModal(item)}>
          <Text style={styles.actionText}>Notes</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => handleResetPassword(item)}>
          <Text style={styles.actionText}>Reset</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.cardActionsSecondary}>
        <TouchableOpacity
          style={[styles.actionBtn, item.is_active && styles.deactivateBtn, { flex: 1 }]}
          onPress={() => toggleActive(item)}
        >
          <Text style={[styles.actionText, item.is_active && styles.deactivateText]}>
            {item.is_active ? 'Deactivate' : 'Activate'}
          </Text>
        </TouchableOpacity>
      </View>
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
        <Text style={styles.title}>Staff Management</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addBtn}>
          <Ionicons name="add" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={staff}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="No staff accounts"
            subtitle="Create staff accounts to manage operations"
          />
        }
      />

      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Staff Account</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor={COLORS.textLight}
              value={form.full_name}
              onChangeText={(text) => setForm((f) => ({ ...f, full_name: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={COLORS.textLight}
              keyboardType="email-address"
              autoCapitalize="none"
              value={form.email}
              onChangeText={(text) => setForm((f) => ({ ...f, email: text }))}
            />
            <Text style={styles.helperText}>
              A secure temporary password will be generated automatically.
            </Text>

            <Text style={styles.label}>Role</Text>
            <View style={styles.roleRow}>
              {STAFF_ROLES.map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[styles.roleTab, form.role === role && styles.roleTabActive]}
                  onPress={() => setForm((f) => ({ ...f, role }))}
                >
                  <Text style={[styles.roleText, form.role === role && styles.roleTextActive]}>
                    {getStaffRoleLabel(role)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button
              title="Create Staff Account"
              onPress={handleCreate}
              loading={creating}
              fullWidth
              style={{ marginTop: SPACING.md }}
            />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={tempPasswordModal.visible}
        onRequestClose={closeTempPasswordModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Temporary Password</Text>
              <TouchableOpacity onPress={closeTempPasswordModal}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>
              Share this password with {tempPasswordModal.staffName} once. It will not be shown again.
            </Text>
            <View style={styles.passwordDisplay}>
              <Text style={styles.passwordDisplayText} selectable>
                {tempPasswordModal.password}
              </Text>
            </View>
            <Text style={styles.passwordHint}>Long-press the password to copy, or use the button below.</Text>

            <Button
              title="Share Password"
              onPress={shareTemporaryPassword}
              fullWidth
              style={{ marginTop: SPACING.md }}
            />
            <Button
              title="Close"
              onPress={closeTempPasswordModal}
              variant="outline"
              fullWidth
              style={{ marginTop: SPACING.sm }}
            />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={notesModal.visible}
        onRequestClose={closeNotesModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Internal Notes</Text>
              <TouchableOpacity onPress={closeNotesModal}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Admin-only notes for {notesModal.member?.full_name ?? 'staff'}</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="Enter internal notes..."
              placeholderTextColor={COLORS.textLight}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              value={notesModal.notes}
              onChangeText={(text) => setNotesModal((n) => ({ ...n, notes: text }))}
            />

            <Button
              title="Save Notes"
              onPress={saveNotes}
              loading={savingNotes}
              fullWidth
              style={{ marginTop: SPACING.md }}
            />
            <Button
              title="Cancel"
              onPress={closeNotesModal}
              variant="outline"
              fullWidth
              style={{ marginTop: SPACING.sm }}
            />
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
  addBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACING.sm },
  name: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  email: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  statusRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  internalNotes: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontStyle: 'italic', marginBottom: SPACING.sm },
  cardActions: { flexDirection: 'row', gap: SPACING.sm },
  cardActionsSecondary: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  actionBtn: {
    flex: 1, backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.sm, alignItems: 'center',
  },
  deactivateBtn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.error },
  actionText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.primary },
  deactivateText: { color: COLORS.error },
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
  input: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.base, color: COLORS.text, marginBottom: SPACING.sm,
  },
  notesInput: {
    minHeight: 100, paddingTop: SPACING.sm, paddingBottom: SPACING.sm,
    textAlignVertical: 'top',
  },
  label: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.xs },
  roleRow: { flexDirection: 'row', gap: SPACING.sm, flexWrap: 'wrap' },
  roleTab: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
  },
  roleTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  roleText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  roleTextActive: { color: COLORS.white, fontFamily: FONTS.semiBold },
  helperText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginBottom: SPACING.sm, marginTop: -SPACING.xs },
  errorText: { fontSize: FONTS.sizes.xs, color: COLORS.error, marginBottom: SPACING.sm },
  passwordDisplay: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  passwordDisplayText: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    letterSpacing: 1,
  },
  passwordHint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
});
