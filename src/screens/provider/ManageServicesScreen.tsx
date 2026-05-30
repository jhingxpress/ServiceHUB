import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
  Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Service } from '../../types';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import SmartServiceSuggestions from '../../components/provider/SmartServiceSuggestions';
import { ProviderStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;

interface ServiceWithOptions extends Service {
  option_count?: number;
  image_count?: number;
  min_price?: number | null;
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
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '' });

  const fetchServices = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [provRes, srvRes] = await Promise.all([
      supabase.from('providers').select('categories(name)').eq('id', user.id).single(),
      supabase.from('services').select('*').eq('provider_id', user.id),
    ]);

    if (srvRes.error) {
      console.error('ManageServices: services query failed', srvRes.error);
      Alert.alert('Error loading services', srvRes.error.message);
    } else {
      console.log('ManageServices: loaded', (srvRes.data ?? []).length, 'services for provider', user.id);
    }

    const cat = (provRes.data as any)?.categories;
    setCategoryName(cat?.name ?? '');

    const serviceIds = (srvRes.data ?? []).map((s: any) => s.id);

    // Fetch active pricing options for all services
    let optionCounts: Record<string, number> = {};
    let minPrices: Record<string, number> = {};
    if (serviceIds.length > 0) {
      const { data: options } = await supabase
        .from('service_options')
        .select('service_id, price, is_active')
        .in('service_id', serviceIds)
        .eq('is_active', true);
      (options ?? []).forEach((opt: any) => {
        optionCounts[opt.service_id] = (optionCounts[opt.service_id] || 0) + 1;
        if (opt.price != null && (minPrices[opt.service_id] == null || opt.price < minPrices[opt.service_id])) {
          minPrices[opt.service_id] = opt.price;
        }
      });
    }

    // Fetch image counts for all services
    let imageCounts: Record<string, number> = {};
    if (serviceIds.length > 0) {
      const { data: images } = await supabase
        .from('service_images')
        .select('service_id')
        .in('service_id', serviceIds);
      (images ?? []).forEach((img: any) => {
        imageCounts[img.service_id] = (imageCounts[img.service_id] || 0) + 1;
      });
    }

    const mapped: ServiceWithOptions[] = (srvRes.data ?? []).map((s: any) => ({
      ...s,
      option_count: optionCounts[s.id] || 0,
      image_count: imageCounts[s.id] || 0,
      min_price: minPrices[s.id] ?? null,
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

    const trimmedName = form.name.trim();

    if (editingService) {
      const { error } = await supabase.from('services').update({ name: trimmedName, description: form.description.trim() || null }).eq('id', editingService.id);
      if (error) { Alert.alert('Error', error.message); } else { setModalVisible(false); fetchServices(); }
    } else {
      // Check for duplicate
      const duplicate = services.find((s) => s.name.toLowerCase().trim() === trimmedName.toLowerCase());
      if (duplicate) {
        Alert.alert('Duplicate Service', `"${trimmedName}" already exists. Please use a different name.`);
        setSaving(false);
        return;
      }

      const { error } = await supabase.from('services').insert({ provider_id: user.id, name: trimmedName, description: form.description.trim() || null, is_active: true });
      if (error) {
        Alert.alert('Error', error.message);
      } else {
        setModalVisible(false);
        await Promise.all([
          supabase.rpc('refresh_provider_checklist', { p_provider_id: user.id }),
          supabase.rpc('refresh_provider_score', { p_provider_id: user.id }),
        ]);
        fetchServices();
      }
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

  const handleUploadPhoto = async (serviceId: string) => {
    if (!user) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    setUploadingPhoto(serviceId);
    try {
      const uri = result.assets[0].uri;
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const filename = `${user.id}/${Date.now()}.${ext}`;

      console.log('[Upload] bucket: service-images');
      console.log('[Upload] path:', filename);

      const response = await fetch(uri);
      const blob = await response.blob();

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('service-images')
        .upload(filename, blob, { contentType: `image/${ext}` });

      console.log('[Upload] response data:', uploadData);
      if (uploadError) {
        console.error('[Upload] error:', uploadError);
        throw uploadError;
      }

      const { data: urlData } = supabase.storage.from('service-images').getPublicUrl(filename);
      console.log('[Upload] publicUrl:', urlData?.publicUrl);

      const { error: insertError } = await supabase.from('service_images').insert({
        service_id: serviceId,
        image_url: urlData.publicUrl,
        sort_order: 0,
      });

      if (insertError) throw insertError;

      Alert.alert('Success', 'Photo uploaded successfully.');
      fetchServices();
    } catch (err: any) {
      console.error('[Upload] catch error:', err);
      Alert.alert('Upload failed', err.message || 'Could not upload photo');
    } finally {
      setUploadingPhoto(null);
    }
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

      {/* Smart Service Suggestions + Single CTA */}
      {!loading && services.length === 0 && categoryName && user && (
        <View style={{ marginBottom: SPACING.md }}>
          <SmartServiceSuggestions
            categoryName={categoryName}
            existingServices={services}
            providerId={user.id}
            onAdded={fetchServices}
          />
          <View style={{ marginHorizontal: SPACING.md, marginTop: SPACING.md }}>
            <Button
              title="Create Custom Service"
              onPress={openAdd}
              variant="outline"
              fullWidth
              size="lg"
            />
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : (
        <FlatList
          data={services}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const portfolioPercent = Math.min(100, (item.image_count ?? 0) * 25);
            const hasPricing = (item.option_count ?? 0) > 0 || item.price > 0;
            const pricingLabel = hasPricing
              ? (item.min_price != null ? `Starting at ₱${item.min_price.toLocaleString()}` : 'Set')
              : 'Not Set';
            return (
              <View style={[styles.card, !item.is_active && styles.cardDisabled]}>
                <View style={styles.cardTop}>
                  <View style={styles.cardInfo}>
                    <Text style={styles.serviceName}>{item.name}</Text>
                    {item.description ? <Text style={styles.serviceDesc} numberOfLines={2}>{item.description}</Text> : null}
                    <View style={styles.metaRow}>
                      <View style={[styles.statusBadge, item.is_active ? styles.statusActive : styles.statusInactive]}>
                        <Text style={[styles.statusText, item.is_active ? styles.statusActiveText : styles.statusInactiveText]}>
                          {item.is_active ? 'Active' : 'Hidden'}
                        </Text>
                      </View>
                      <Text style={styles.pricingText}>
                        Pricing: {pricingLabel}
                      </Text>
                    </View>
                    {/* Portfolio completion bar */}
                    <View style={styles.portfolioRow}>
                      <Text style={styles.portfolioLabel}>Portfolio</Text>
                      <View style={styles.portfolioTrack}>
                        <View style={[styles.portfolioFill, { width: `${portfolioPercent}%` }]} />
                      </View>
                      <Text style={styles.portfolioPercent}>{portfolioPercent}%</Text>
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
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderRightWidth: 1, borderRightColor: COLORS.border + '40' }]}
                    onPress={() => navigation.navigate('ServiceOptions', { serviceId: item.id, serviceName: item.name })}
                  >
                    <Ionicons name="pricetag-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.actionBtnText}>Manage Pricing</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleUploadPhoto(item.id)}
                    disabled={uploadingPhoto === item.id}
                  >
                    {uploadingPhoto === item.id ? (
                      <ActivityIndicator size={16} color={COLORS.primary} />
                    ) : (
                      <Ionicons name="images-outline" size={16} color={COLORS.primary} />
                    )}
                    <Text style={styles.actionBtnText}>Upload Photos</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
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
  pricingText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  portfolioRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.sm },
  portfolioLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, fontFamily: FONTS.medium, width: 48 },
  portfolioTrack: { flex: 1, height: 4, backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.full, overflow: 'hidden' },
  portfolioFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.full },
  portfolioPercent: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontFamily: FONTS.semiBold, width: 32, textAlign: 'right' },
  actionRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border + '40' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.sm, backgroundColor: COLORS.primaryLight },
  actionBtnText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.primary },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { backgroundColor: COLORS.background, borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl, padding: SPACING.lg, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  modalTitle: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.semiBold, color: COLORS.text },
  formGroup: { marginBottom: SPACING.md },
  fieldLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.xs },
  fieldInput: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, padding: SPACING.md, fontSize: FONTS.sizes.base, color: COLORS.text, height: 48 },
  fieldInputMulti: { height: 80, paddingTop: SPACING.md },
});
