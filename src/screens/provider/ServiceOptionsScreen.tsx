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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { ServiceOption } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { ProviderStackParamList } from '../../navigation/types';

type RouteType = RouteProp<ProviderStackParamList, 'ServiceOptions'>;

const formatPrice = (amount: number) =>
  `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ServiceOptionsScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteType>();
  const { serviceId, serviceName } = route.params;

  const [options, setOptions] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingOption, setEditingOption] = useState<ServiceOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', price: '' });

  const fetchOptions = useCallback(async () => {
    const { data } = await supabase
      .from('service_options')
      .select('*')
      .eq('service_id', serviceId)
      .order('sort_order')
      .order('created_at');
    setOptions(data ?? []);
    setLoading(false);
  }, [serviceId]);

  useEffect(() => { fetchOptions(); }, [fetchOptions]);

  const openAdd = () => {
    setEditingOption(null);
    setForm({ name: '', description: '', price: '' });
    setModalVisible(true);
  };

  const openEdit = (opt: ServiceOption) => {
    setEditingOption(opt);
    setForm({ name: opt.name, description: opt.description ?? '', price: String(opt.price) });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('Required', 'Option name is required.');
      return;
    }
    const priceNum = parseFloat(form.price);
    if (isNaN(priceNum) || priceNum < 0) {
      Alert.alert('Invalid', 'Please enter a valid price (₱0 or more).');
      return;
    }
    setSaving(true);
    if (editingOption) {
      const { error } = await supabase
        .from('service_options')
        .update({ name: form.name.trim(), description: form.description.trim() || null, price: priceNum })
        .eq('id', editingOption.id);
      if (error) { Alert.alert('Error', error.message); } else { setModalVisible(false); fetchOptions(); }
    } else {
      const { error } = await supabase.from('service_options').insert({
        service_id: serviceId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: priceNum,
        is_active: true,
      });
      if (error) { Alert.alert('Error', error.message); } else { setModalVisible(false); fetchOptions(); }
    }
    setSaving(false);
  };

  const handleToggle = async (opt: ServiceOption) => {
    await supabase.from('service_options').update({ is_active: !opt.is_active }).eq('id', opt.id);
    fetchOptions();
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Option', 'Remove this pricing option?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => { await supabase.from('service_options').delete().eq('id', id); fetchOptions(); },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.titleArea}>
          <Text style={styles.title}>Pricing Options</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{serviceName}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.hint}>
        <Ionicons name="information-circle-outline" size={15} color={COLORS.textSecondary} />
        <Text style={styles.hintText}>
          Add price options for this sub-service. Customers choose from these when booking.
          {'\n'}e.g. "Window Type Aircon – ₱500", "Split Type – ₱1,200"
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={options}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={[styles.card, !item.is_active && styles.cardDisabled]}>
              <View style={styles.cardLeft}>
                <Text style={styles.optionName}>{item.name}</Text>
                {item.description ? (
                  <Text style={styles.optionDesc} numberOfLines={2}>{item.description}</Text>
                ) : null}
                <View style={styles.metaRow}>
                  <Text style={styles.price}>{formatPrice(item.price)}</Text>
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
                  <Ionicons
                    name={item.is_active ? 'eye-outline' : 'eye-off-outline'}
                    size={16}
                    color={COLORS.textSecondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.iconBtn, styles.deleteBtn]} onPress={() => handleDelete(item.id)}>
                  <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="pricetags-outline"
              title="No pricing options yet"
              subtitle="Add pricing options so customers can choose what they need"
              actionLabel="Add Option"
              onAction={openAdd}
            />
          }
        />
      )}

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingOption ? 'Edit Option' : 'Add Pricing Option'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Option Name *</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={form.name}
                  onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
                  placeholder="e.g. Window Type Aircon"
                  placeholderTextColor={COLORS.textLight}
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Description (optional)</Text>
                <TextInput
                  style={[styles.fieldInput, styles.fieldInputMulti]}
                  value={form.description}
                  onChangeText={(v) => setForm((p) => ({ ...p, description: v }))}
                  placeholder="Brief description of this option..."
                  placeholderTextColor={COLORS.textLight}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Price (₱) *</Text>
                <View style={styles.priceRow}>
                  <View style={styles.pesoBox}>
                    <Text style={styles.pesoSign}>₱</Text>
                  </View>
                  <TextInput
                    style={[styles.fieldInput, styles.priceInput]}
                    value={form.price}
                    onChangeText={(v) => setForm((p) => ({ ...p, price: v }))}
                    placeholder="0.00"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
              <Button
                title={editingOption ? 'Save Changes' : 'Add Option'}
                onPress={handleSave}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleArea: { flex: 1 },
  title: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text },
  subtitle: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 1 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  hintText: { flex: 1, fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, lineHeight: 17 },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  cardDisabled: { opacity: 0.55 },
  cardLeft: { flex: 1 },
  optionName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  optionDesc: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 3, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.sm },
  price: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.primary },
  statusBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: BORDER_RADIUS.full },
  statusActive: { backgroundColor: '#D1FAE5' },
  statusInactive: { backgroundColor: COLORS.border },
  statusText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold },
  statusActiveText: { color: '#065F46' },
  statusInactiveText: { color: COLORS.textSecondary },
  actions: { flexDirection: 'row', gap: SPACING.xs, marginLeft: SPACING.sm },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  deleteBtn: { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.semiBold, color: COLORS.text },
  formGroup: { marginBottom: SPACING.md },
  fieldLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.xs },
  fieldInput: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: SPACING.md,
    fontSize: FONTS.sizes.base,
    color: COLORS.text,
    height: 48,
  },
  fieldInputMulti: { height: 72, paddingTop: SPACING.md },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  pesoBox: {
    width: 44,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1.5,
    borderColor: COLORS.primary + '60',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pesoSign: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.primary },
  priceInput: { flex: 1 },
});
