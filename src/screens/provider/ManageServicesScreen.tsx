import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Service } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';

export default function ManageServicesScreen() {
  const { user } = useAuthStore();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    duration_minutes: '',
  });

  const fetchServices = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('services')
      .select('*')
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false });
    setServices(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.price.trim()) {
      Alert.alert('Required', 'Service name and price are required.');
      return;
    }
    if (!user) return;
    setSaving(true);

    const { error } = await supabase.from('services').insert({
      provider_id: user.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: parseFloat(form.price),
      duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes, 10) : null,
      is_active: true,
    });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setForm({ name: '', description: '', price: '', duration_minutes: '' });
      setModalVisible(false);
      fetchServices();
    }
    setSaving(false);
  };

  const handleToggle = async (service: Service) => {
    await supabase.from('services').update({ is_active: !service.is_active }).eq('id', service.id);
    fetchServices();
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Service', 'Delete this service permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('services').delete().eq('id', id);
          fetchServices();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.title}>My Services</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={services}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={[styles.card, !item.is_active && styles.cardDisabled]}>
            <View style={styles.cardInfo}>
              <Text style={styles.serviceName}>{item.name}</Text>
              {item.description && (
                <Text style={styles.serviceDesc} numberOfLines={2}>{item.description}</Text>
              )}
              <View style={styles.metaRow}>
                <Text style={styles.price}>${item.price}</Text>
                {item.duration_minutes && (
                  <View style={styles.durationRow}>
                    <Ionicons name="time-outline" size={13} color={COLORS.textLight} />
                    <Text style={styles.duration}>{item.duration_minutes} min</Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.toggleBtn} onPress={() => handleToggle(item)}>
                <Ionicons
                  name={item.is_active ? 'eye-outline' : 'eye-off-outline'}
                  size={18}
                  color={item.is_active ? COLORS.primary : COLORS.textLight}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id)}>
                <Ionicons name="trash-outline" size={18} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="construct-outline"
              title="No services yet"
              subtitle="Add services to start receiving bookings"
              actionLabel="Add Service"
              onAction={() => setModalVisible(true)}
            />
          ) : null
        }
      />

      {/* Add service modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Service</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {[
                { key: 'name', label: 'Service Name *', placeholder: 'e.g. Deep House Cleaning', type: 'default' },
                { key: 'description', label: 'Description', placeholder: 'What does this service include?', type: 'default', multi: true },
                { key: 'price', label: 'Price ($) *', placeholder: '0.00', type: 'decimal-pad' },
                { key: 'duration_minutes', label: 'Duration (minutes)', placeholder: '60', type: 'number-pad' },
              ].map((f) => (
                <View key={f.key} style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>{f.label}</Text>
                  <TextInput
                    style={[styles.fieldInput, f.multi && styles.fieldInputMulti]}
                    value={(form as Record<string, string>)[f.key]}
                    onChangeText={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
                    placeholder={f.placeholder}
                    placeholderTextColor={COLORS.textLight}
                    keyboardType={f.type as 'default' | 'decimal-pad' | 'number-pad'}
                    multiline={f.multi}
                    numberOfLines={f.multi ? 3 : 1}
                    textAlignVertical={f.multi ? 'top' : 'center'}
                  />
                </View>
              ))}
              <Button
                title="Add Service"
                onPress={handleAdd}
                loading={saving}
                fullWidth
                size="lg"
                style={{ marginTop: SPACING.sm, marginBottom: SPACING.xl }}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm,
  },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text },
  addBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  cardDisabled: { opacity: 0.5 },
  cardInfo: { flex: 1 },
  serviceName: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  serviceDesc: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 3, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.sm },
  price: { fontSize: FONTS.sizes.lg, fontWeight: '800', color: COLORS.primary },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  duration: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  actions: { flexDirection: 'row', gap: SPACING.xs, marginLeft: SPACING.sm },
  toggleBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEE2E2',
    alignItems: 'center', justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modal: {
    backgroundColor: COLORS.background, borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl, padding: SPACING.lg, maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg,
  },
  modalTitle: { fontSize: FONTS.sizes.xl, fontWeight: '700', color: COLORS.text },
  formGroup: { marginBottom: SPACING.md },
  fieldLabel: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text, marginBottom: SPACING.xs },
  fieldInput: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border, padding: SPACING.md,
    fontSize: FONTS.sizes.base, color: COLORS.text, height: 48,
  },
  fieldInputMulti: { height: 80, paddingTop: SPACING.md },
});
