import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { CustomerStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

type Props = NativeStackScreenProps<CustomerStackParamList, 'SavedLocations'>;

// ── Types ─────────────────────────────────────────────────────────────────────
interface SavedLocation {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  is_default: boolean;
  created_at: string;
}

type ModalMode = 'add' | 'edit';

// ── Icon helper ───────────────────────────────────────────────────────────────
function getLocIcon(name: string): React.ComponentProps<typeof Ionicons>['name'] {
  const n = name.toLowerCase();
  if (n.includes('home') || n.includes('house')) return 'home';
  if (n.includes('office') || n.includes('work')) return 'business';
  if (n.includes('school') || n.includes('university') || n.includes('college')) return 'school';
  if (n.includes('gym') || n.includes('fitness')) return 'barbell';
  if (n.includes('parent') || n.includes('mom') || n.includes('dad') || n.includes('family')) return 'people';
  return 'location';
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SavedLocationsScreen({ navigation }: Props) {
  const { user } = useAuthStore();

  const [locations, setLocations]   = useState<SavedLocation[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode]   = useState<ModalMode>('add');
  const [editId, setEditId]         = useState<string | null>(null);

  // ── Form state ────────────────────────────────────────────────────────────
  const [name, setName]         = useState('');
  const [address, setAddress]   = useState('');
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [formError, setFormError] = useState('');

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchLocations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('saved_locations')
      .select('*')
      .eq('customer_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    setLocations((data ?? []) as SavedLocation[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setModalMode('add');
    setEditId(null);
    setName('');
    setAddress('');
    setLatInput('');
    setLngInput('');
    setIsDefault(false);
    setFormError('');
    setModalVisible(true);
  };

  const openEdit = (loc: SavedLocation) => {
    setModalMode('edit');
    setEditId(loc.id);
    setName(loc.name);
    setAddress(loc.address);
    setLatInput(String(loc.latitude));
    setLngInput(String(loc.longitude));
    setIsDefault(loc.is_default);
    setFormError('');
    setModalVisible(true);
  };

  const closeModal = () => setModalVisible(false);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    const trimName    = name.trim();
    const trimAddress = address.trim();
    const lat = parseFloat(latInput);
    const lng = parseFloat(lngInput);

    if (!trimName)    { setFormError('Name is required.'); return; }
    if (!trimAddress) { setFormError('Address is required.'); return; }
    if (isNaN(lat) || lat < -90  || lat > 90)  { setFormError('Enter a valid latitude  (−90 to 90).'); return; }
    if (isNaN(lng) || lng < -180 || lng > 180) { setFormError('Enter a valid longitude (−180 to 180).'); return; }

    setSaving(true);
    setFormError('');
    try {
      // Enforce single default: clear any existing default first
      if (isDefault) {
        await supabase
          .from('saved_locations')
          .update({ is_default: false })
          .eq('customer_id', user!.id)
          .eq('is_default', true);
      }

      if (modalMode === 'add') {
        const { error } = await supabase.from('saved_locations').insert({
          customer_id: user!.id,
          name: trimName,
          address: trimAddress,
          latitude: lat,
          longitude: lng,
          is_default: isDefault,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('saved_locations')
          .update({
            name: trimName,
            address: trimAddress,
            latitude: lat,
            longitude: lng,
            is_default: isDefault,
          })
          .eq('id', editId!);
        if (error) throw error;
      }

      closeModal();
      fetchLocations();
    } catch (e: any) {
      setFormError(e.message ?? 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Set default ───────────────────────────────────────────────────────────
  const handleSetDefault = async (id: string) => {
    if (!user) return;
    await supabase
      .from('saved_locations')
      .update({ is_default: false })
      .eq('customer_id', user.id);
    await supabase
      .from('saved_locations')
      .update({ is_default: true })
      .eq('id', id);
    fetchLocations();
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = (id: string, locName: string) => {
    Alert.alert(
      'Delete Location',
      `Delete "${locName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('saved_locations').delete().eq('id', id);
            fetchLocations();
          },
        },
      ],
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Saved Locations</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : locations.length === 0 ? (
        /* ── Empty state ── */
        <View style={styles.center}>
          <Ionicons name="location-outline" size={56} color={COLORS.textLight} />
          <Text style={styles.emptyTitle}>No saved locations yet</Text>
          <Text style={styles.emptySubtitle}>
            Save frequently used addresses for faster booking.
          </Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={openAdd} activeOpacity={0.8}>
            <Ionicons name="add" size={18} color={COLORS.surface} />
            <Text style={styles.emptyBtnText}>Add Location</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* ── Location cards ── */
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          {locations.map((loc) => (
            <View key={loc.id} style={[styles.card, loc.is_default && styles.cardDefault]}>
              {/* Row: icon + info */}
              <View style={styles.cardTop}>
                <View style={[styles.iconWrap, loc.is_default && styles.iconWrapDefault]}>
                  <Ionicons
                    name={getLocIcon(loc.name)}
                    size={24}
                    color={loc.is_default ? COLORS.surface : COLORS.primary}
                  />
                </View>
                <View style={styles.cardInfo}>
                  <View style={styles.nameRow}>
                    <Text style={styles.locName} numberOfLines={1}>{loc.name}</Text>
                    {loc.is_default && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>Default</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.locAddress} numberOfLines={3}>{loc.address}</Text>
                  <Text style={styles.locCoords}>
                    {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                  </Text>
                </View>
              </View>

              {/* Row: action buttons */}
              <View style={styles.cardActions}>
                {!loc.is_default && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleSetDefault(loc.id)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="star-outline" size={15} color={COLORS.warning} />
                    <Text style={[styles.actionBtnText, { color: COLORS.warning }]}>Set Default</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => openEdit(loc)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="pencil-outline" size={15} color={COLORS.primary} />
                  <Text style={styles.actionBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleDelete(loc.id, loc.name)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="trash-outline" size={15} color={COLORS.error} />
                  <Text style={[styles.actionBtnText, { color: COLORS.error }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <View style={{ height: 96 }} />
        </ScrollView>
      )}

      {/* FAB */}
      {!loading && locations.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={openAdd} activeOpacity={0.85}>
          <Ionicons name="add" size={28} color={COLORS.surface} />
        </TouchableOpacity>
      )}

      {/* ── Add / Edit Modal ── */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity style={styles.modalDismiss} onPress={closeModal} activeOpacity={1} />
          <View style={styles.modalCard}>
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {modalMode === 'add' ? 'Add Location' : 'Edit Location'}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Name */}
              <Text style={styles.fieldLabel}>Name *</Text>
              <TextInput
                style={styles.fieldInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Home, Office, Parents House"
                placeholderTextColor={COLORS.textLight}
                maxLength={40}
              />

              {/* Address */}
              <Text style={styles.fieldLabel}>Address *</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldInputMulti]}
                value={address}
                onChangeText={setAddress}
                placeholder="Street, barangay, city"
                placeholderTextColor={COLORS.textLight}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />

              {/* Lat / Lng */}
              <View style={styles.coordRow}>
                <View style={styles.coordHalf}>
                  <Text style={styles.fieldLabel}>Latitude *</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={latInput}
                    onChangeText={setLatInput}
                    placeholder="14.5995"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.coordHalf}>
                  <Text style={styles.fieldLabel}>Longitude *</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={lngInput}
                    onChangeText={setLngInput}
                    placeholder="120.9842"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <Text style={styles.coordHint}>
                Open Google Maps, long-press your location, and copy the coordinates shown.
              </Text>

              {/* Set as default toggle */}
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Set as Default</Text>
                  <Text style={styles.toggleSub}>Auto-fills address when booking</Text>
                </View>
                <Switch
                  value={isDefault}
                  onValueChange={setIsDefault}
                  trackColor={{ false: COLORS.border, true: COLORS.primary }}
                  thumbColor={COLORS.surface}
                />
              </View>

              {/* Error */}
              {!!formError && (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle-outline" size={14} color={COLORS.error} />
                  <Text style={styles.errorText}>{formError}</Text>
                </View>
              )}

              {/* Save button */}
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator size="small" color={COLORS.surface} />
                  : <Text style={styles.saveBtnText}>
                      {modalMode === 'add' ? 'Add Location' : 'Save Changes'}
                    </Text>
                }
              </TouchableOpacity>

              <View style={{ height: SPACING.lg }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.md },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.lg, color: COLORS.text },

  // ── Empty ──────────────────────────────────────────────────────────────────
  emptyTitle: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.lg, color: COLORS.text },
  emptySubtitle: {
    fontFamily: FONTS.regular, fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20,
  },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm + 2, marginTop: SPACING.sm,
  },
  emptyBtnText: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.sm, color: COLORS.surface },

  // ── List ───────────────────────────────────────────────────────────────────
  list: { padding: SPACING.md, gap: SPACING.sm },

  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, ...SHADOWS.small,
  },
  cardDefault: { borderColor: COLORS.primary, borderWidth: 1.5 },
  cardTop: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.sm },

  iconWrap: {
    width: 48, height: 48, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  iconWrapDefault: { backgroundColor: COLORS.primary },

  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: 2 },
  locName: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.base, color: COLORS.text, flex: 1 },
  defaultBadge: {
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  defaultBadgeText: { fontFamily: FONTS.semiBold, fontSize: 10, color: COLORS.surface },
  locAddress: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 18 },
  locCoords: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 2 },

  cardActions: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    borderTopWidth: 1, borderTopColor: COLORS.divider, paddingTop: SPACING.sm,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.sm, paddingVertical: 5,
    borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border,
  },
  actionBtnText: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.xs, color: COLORS.primary },

  // ── FAB ────────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute', bottom: 28, right: SPACING.md,
    width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', ...SHADOWS.medium,
  },

  // ── Modal ──────────────────────────────────────────────────────────────────
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalDismiss: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.md,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: SPACING.md, paddingBottom: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  modalTitle: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.lg, color: COLORS.text },

  fieldLabel: {
    fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.sm,
    color: COLORS.text, marginBottom: 4, marginTop: SPACING.sm,
  },
  fieldInput: {
    backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2,
    fontFamily: FONTS.regular, fontSize: FONTS.sizes.base, color: COLORS.text,
  },
  fieldInputMulti: { minHeight: 60, textAlignVertical: 'top', paddingTop: SPACING.sm },

  coordRow: { flexDirection: 'row', gap: SPACING.sm },
  coordHalf: { flex: 1 },
  coordHint: {
    fontFamily: FONTS.regular, fontSize: FONTS.sizes.xs, color: COLORS.textSecondary,
    marginTop: SPACING.xs, lineHeight: 16,
  },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: SPACING.md, paddingVertical: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  toggleSub: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 1 },

  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FEF2F2', borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm, marginTop: SPACING.sm,
    borderWidth: 1, borderColor: '#FECACA',
  },
  errorText: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.xs, color: COLORS.error, flex: 1 },

  saveBtn: {
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md, alignItems: 'center', marginTop: SPACING.lg,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.base, color: COLORS.surface },
});
