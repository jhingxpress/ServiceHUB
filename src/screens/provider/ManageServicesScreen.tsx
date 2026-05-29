import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
  Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Service } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { ProviderStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;

interface ServiceWithOptions extends Service {
  option_count?: number;
}

export default function ManageServicesScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [services, setServices] = useState<ServiceWithOptions[]>([]);
  const [categoryName, setCategoryName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

  const fetchServices = useCallback(async () => {
    if (!user) return;

    const [provRes, srvRes] = await Promise.all([
      supabase.from('providers').select('categories(name)').eq('id', user.id).single(),
      supabase.from('services').select('*, service_options(id)').eq('provider_id', user.id).order('sort_order').order('created_at'),
    ]);

    const cat = (provRes.data as any)?.categories;
    setCategoryName(cat?.name ?? '');

    const mapped: ServiceWithOptions[] = (srvRes.data ?? []).map((s: any) => ({
      ...s,
      option_count: s.service_options?.length ?? 0,
    }));
    setServices(mapped);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const openAdd = () => { setEditingService(null); setForm({ name: '', description: '' }); setModalVisible(true); };
  const openEdit = (s: Service) => { setEditingService(s); setForm({ name: s.name, description: s.description ?? '' }); setModalVisible(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Required', 'Sub-service name is required.'); return; }
    if (!user) return;
    setSaving(true);

    if (editingService) {
      const { error } = await supabase.from('services').update({ name: form.name.trim(), description: form.description.trim() || null }).eq('id', editingService.id);
      if (error) { Alert.alert('Error', error.message); } else { setModalVisible(false); fetchServices(); }
    } else {
      const { error } = await supabase.from('services').insert({ provider_id: user.id, name: form.name.trim(), description: form.description.trim() || null, is_active: true });
      if (error) { Alert.alert('Error', error.message); } else { setModalVisible(false); fetchServices(); }
    }
    setSaving(false);
  };

  const handleToggle = async (service: Service) => {
    await supabase.from('services').update({ is_active: !service.is_active }).eq('id', service.id);
    fetchServices();
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Sub-Service', 'This will also delete all its pricing options. Continue?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('services').delete().eq('id', id); fetchServices(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>My Services</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Category badge */}
      {categoryName ? (
        <View style={styles.categoryBadge}>
          <Ionicons name="layers-outline" size={16} color={COLORS.primary} />
          <Text style={styles.categoryText}>Category: <Text style={{ fontFamily: FONTS.semiBold }}>{categoryName}</Text></Text>
        </View>
      ) : null}

      <View style={styles.hint}>
        <Ionicons name="information-circle-outline" size={15} color={COLORS.textSecondary} />
        <Text style={styles.hintText}>Add sub-services under your category. Tap "Manage Pricing" to set price options per sub-service.</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={services}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={[styles.card, !item.is_active && styles.cardDisabled]}>
              <View style={styles.cardTop}>
                <View style={styles.cardInfo}>
                  <Text style={styles.serviceName}>{item.name}</Text>
                  {item.description ? <Text style={styles.serviceDesc} numberOfLines={2}>{item.description}</Text> : null}
                  <View style={styles.metaRow}>
                    <View style={styles.optionsBadge}>
                      <Ionicons name="pricetag-outline" size={12} color={COLORS.primary} />
                      <Text style={styles.optionsText}>{item.option_count} option{item.option_count !== 1 ? 's' : ''}</Text>
                    </View>
                    <View style={[styles.statusBadge, item.is_active ? styles.statusActive : styles.statusInactive]}>
                      <Text style={[styles.statusText, item.is_active ? styles.statusActiveText : styles.statusInactiveText]}>
                        {item.is_active ? 'Active' : 'Hidden'}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item)}>
                    <Ionicons name="pencil-outline" size={16} color={COLORS.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => handleToggle(item)}>
                    <Ionicons name={item.is_active ? 'eye-outline' : 'eye-off-outline'} size={16} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.iconBtn, styles.deleteBtn]} onPress={() => handleDelete(item.id)}>
                    <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
              </View>
              <TouchableOpacity
                style={styles.manageOptionsBtn}
                onPress={() => navigation.navigate('ServiceOptions', { serviceId: item.id, serviceName: item.name })}
              >
                <Ionicons name="pricetags-outline" size={16} color={COLORS.primary} />
                <Text style={styles.manageOptionsText}>Manage Pricing Options</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="construct-outline"
              title="No sub-services yet"
              subtitle={`Add sub-services under your ${categoryName || 'category'} to start receiving bookings`}
              actionLabel="Add Sub-Service"
              onAction={openAdd}
            />
          }
        />
      )}

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingService ? 'Edit Sub-Service' : 'Add Sub-Service'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Sub-Service Name *</Text>
                <TextInput style={styles.fieldInput} value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} placeholder="e.g. Aircon Cleaning" placeholderTextColor={COLORS.textLight} />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Description (optional)</Text>
                <TextInput style={[styles.fieldInput, styles.fieldInputMulti]} value={form.description} onChangeText={(v) => setForm((p) => ({ ...p, description: v }))} placeholder="What does this sub-service include?" placeholderTextColor={COLORS.textLight} multiline numberOfLines={3} textAlignVertical="top" />
              </View>
              <Button title={editingService ? 'Save Changes' : 'Add Sub-Service'} onPress={handleSave} loading={saving} fullWidth size="lg" style={{ marginTop: SPACING.sm, marginBottom: SPACING.xl }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  categoryBadge: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginHorizontal: SPACING.md, marginBottom: SPACING.xs, backgroundColor: COLORS.primaryLight, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.full, alignSelf: 'flex-start' },
  categoryText: { fontSize: FONTS.sizes.sm, color: COLORS.primary },
  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, marginHorizontal: SPACING.md, marginBottom: SPACING.md, padding: SPACING.sm, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  hintText: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, lineHeight: 16 },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  card: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small, overflow: 'hidden' },
  cardDisabled: { opacity: 0.55 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', padding: SPACING.md },
  cardInfo: { flex: 1 },
  serviceName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  serviceDesc: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 3, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
  optionsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.primaryLight, paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.full },
  optionsText: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontFamily: FONTS.semiBold },
  statusBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.full },
  statusActive: { backgroundColor: '#D1FAE5' },
  statusInactive: { backgroundColor: COLORS.border },
  statusText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold },
  statusActiveText: { color: '#065F46' },
  statusInactiveText: { color: COLORS.textSecondary },
  actions: { flexDirection: 'row', gap: SPACING.xs, marginLeft: SPACING.sm },
  iconBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border },
  deleteBtn: { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
  manageOptionsBtn: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.primaryLight, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border + '40' },
  manageOptionsText: { flex: 1, fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.primary },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { backgroundColor: COLORS.background, borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl, padding: SPACING.lg, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  modalTitle: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.semiBold, color: COLORS.text },
  formGroup: { marginBottom: SPACING.md },
  fieldLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.xs },
  fieldInput: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, padding: SPACING.md, fontSize: FONTS.sizes.base, color: COLORS.text, height: 48 },
  fieldInputMulti: { height: 80, paddingTop: SPACING.md },
});
