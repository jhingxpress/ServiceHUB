import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, SectionList, TouchableOpacity, StyleSheet, Alert,
  Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { toTitleCase } from '../../utils/formatting';
import { validateImagePickerAsset } from '../../utils/fileValidation';
import { useAuthStore } from '../../stores/authStore';
import { Service, ProviderCategory, ServiceGroup, ServiceTemplate } from '../../types';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Button from '../../components/ui/Button';
import { ProviderStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;

interface ServiceWithExtras extends Service {
  image_count?: number;
}

type CatalogStep = 'group' | 'template' | 'none';

export default function ManageServicesScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [services, setServices] = useState<ServiceWithExtras[]>([]);
  const [linkedCategories, setLinkedCategories] = useState<ProviderCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', duration: '' });

  // Service Catalog state
  const [catalogStep, setCatalogStep] = useState<CatalogStep>('none');
  const [serviceGroups, setServiceGroups] = useState<ServiceGroup[]>([]);
  const [serviceTemplates, setServiceTemplates] = useState<ServiceTemplate[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ServiceGroup | null>(null);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [creatingFromTemplates, setCreatingFromTemplates] = useState(false);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});

  const fetchServices = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [srvRes, pcRes] = await Promise.all([
      supabase.from('services').select('*').eq('provider_id', user.id),
      supabase.from('provider_categories')
        .select('*, categories(id, name, icon, color)')
        .eq('provider_id', user.id)
        .order('is_primary', { ascending: false }),
    ]);

    if (srvRes.error) {
      console.error('ManageServices: services query failed', srvRes.error);
      Alert.alert('Error loading services', srvRes.error.message);
    }

    setLinkedCategories((pcRes.data ?? []) as ProviderCategory[]);

    const serviceIds = (srvRes.data ?? []).map((s: any) => s.id);

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

    const mapped: ServiceWithExtras[] = (srvRes.data ?? []).map((s: any) => ({
      ...s,
      image_count: imageCounts[s.id] || 0,
    }));
    setServices(mapped);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchServices(); }, [fetchServices]);

  // =========================
  // Service Catalog Flow
  // =========================

  const openCatalog = async () => {
    if (!user) return;
    console.log('[SERVICE] Build Audit v3');
    console.log('[SERVICE] Current user.id', user?.id);
    setCatalogStep('group');
    setSelectedGroup(null);
    setSelectedTemplateIds(new Set());
    setCatalogLoading(true);

    // Get provider's linked categories with parent info
    const { data: pcData, error: pcError } = await supabase
      .from('provider_categories')
      .select('category_id, categories(id, parent_id, name, is_parent)')
      .eq('provider_id', user.id);

    if (pcError) {
      console.error('[SERVICE] provider_categories query error:', pcError);
    }

    console.log('[SERVICE] Provider categories raw', pcData);

    const leafCategoryIds = (pcData ?? []).map((c: any) => c.category_id).filter(Boolean);
    const parentCategoryIds = (pcData ?? [])
      .map((c: any) => c.categories?.parent_id)
      .filter((id: string | null) => !!id);
    const allCategoryIds = [...new Set([...leafCategoryIds, ...parentCategoryIds])];
    const categoryNames = (pcData ?? []).map((c: any) => c.categories?.name).filter(Boolean);

    console.log('[SERVICE] Category names', categoryNames);
    console.log('[SERVICE] allCategoryIds', allCategoryIds);

    if (allCategoryIds.length === 0) {
      console.log('[SERVICE] No linked categories in provider_categories');
      setServiceGroups([]);
      setCatalogLoading(false);
      return;
    }

    const { data: groupsByLeaf, error: leafErr } = await supabase
      .from('service_groups')
      .select('*')
      .in('leaf_category_id', allCategoryIds)
      .eq('is_active', true);

    const { data: groupsByParent, error: parentErr } = await supabase
      .from('service_groups')
      .select('*')
      .in('category_id', allCategoryIds)
      .eq('is_active', true);

    if (leafErr) console.error('[SERVICE] groupsByLeaf error:', leafErr);
    if (parentErr) console.error('[SERVICE] groupsByParent error:', parentErr);

    console.log('[SERVICE] groupsByLeaf', groupsByLeaf?.length);
    console.log('[SERVICE] groupsByParent', groupsByParent?.length);

    // Merge and deduplicate by id
    const merged = new Map<string, ServiceGroup>();
    (groupsByLeaf ?? []).forEach((g: any) => merged.set(g.id, g as ServiceGroup));
    (groupsByParent ?? []).forEach((g: any) => merged.set(g.id, g as ServiceGroup));
    const mergedGroups = Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));

    console.log('[SERVICE] mergedGroups', mergedGroups?.length);
    console.log('[SERVICE] mergedGroupNames', mergedGroups?.map((g) => g.name));

    // Fetch parent category names for grouping
    const { data: catData } = await supabase.from('categories').select('id, name').eq('is_parent', true);
    const map: Record<string, string> = {};
    (catData ?? []).forEach((c: any) => { map[c.id] = c.name; });
    setCategoryMap(map);

    setServiceGroups(mergedGroups);
    console.log('[SERVICE] setServiceGroups', mergedGroups?.length);
    setCatalogLoading(false);
  };

  const selectGroup = async (group: ServiceGroup) => {
    setSelectedGroup(group);
    setCatalogStep('template');
    setCatalogLoading(true);

    console.log('[SERVICE] selectGroup:', group.name, 'groupId:', group.id);

    const { data: templates, error: templateErr } = await supabase
      .from('service_templates')
      .select('*')
      .eq('service_group_id', group.id)
      .eq('is_active', true)
      .order('name');

    if (templateErr) {
      console.error('[SERVICE] service_templates query error:', templateErr);
    }

    console.log('[SERVICE] Templates returned:', templates?.length ?? 0, 'for group:', group.name);
    setServiceTemplates((templates ?? []) as ServiceTemplate[]);
    setCatalogLoading(false);
  };

  const toggleTemplate = (templateId: string) => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) {
        next.delete(templateId);
      } else {
        next.add(templateId);
      }
      return next;
    });
  };

  const createFromTemplates = async () => {
    if (!user || selectedTemplateIds.size === 0) return;
    setCreatingFromTemplates(true);

    const existingNames = new Set(services.map((s) => s.name.toLowerCase().trim()));
    const selectedTemplates = serviceTemplates.filter((t) => selectedTemplateIds.has(t.id));
    const toCreate = selectedTemplates.filter((t) => !existingNames.has(t.name.toLowerCase().trim()));

    if (toCreate.length === 0) {
      Alert.alert('No new services', 'All selected services already exist in your list.');
      setCreatingFromTemplates(false);
      return;
    }

    try {
      const inserts = toCreate.map((t) => ({
        provider_id: user.id,
        name: t.name,
        description: t.description,
        price: 0,
        home_visit_fee: 0,
        duration_minutes: 60,
        is_active: true,
      }));

      const { error } = await supabase.from('services').insert(inserts);
      if (error) throw error;

      await Promise.all([
        supabase.rpc('refresh_provider_checklist', { p_provider_id: user.id }),
        supabase.rpc('refresh_provider_score', { p_provider_id: user.id }),
      ]);

      setCatalogStep('none');
      setSelectedGroup(null);
      setSelectedTemplateIds(new Set());
      fetchServices();
      Alert.alert('Success', `${toCreate.length} service(s) added successfully.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create services.');
    } finally {
      setCreatingFromTemplates(false);
    }
  };

  const closeCatalog = () => {
    setCatalogStep('none');
    setSelectedGroup(null);
    setSelectedTemplateIds(new Set());
  };

  // =========================
  // Existing Add / Edit
  // =========================

  const openAdd = () => { setEditingService(null); setForm({ name: '', description: '', price: '', duration: '' }); setModalVisible(true); };
  const openEdit = (s: Service) => { setEditingService(s); setForm({ name: s.name, description: s.description ?? '', price: s.price > 0 ? String(s.price) : '', duration: s.duration_minutes ? String(s.duration_minutes) : '' }); setModalVisible(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('Required', 'Sub-service name is required.'); return; }
    if (!user) return;
    setSaving(true);

    const trimmedName = form.name.trim();

    const priceNum = parseFloat(form.price);
    const hasPrice = !isNaN(priceNum) && priceNum > 0;
    const durationNum = parseInt(form.duration, 10);
    const hasDuration = !isNaN(durationNum) && durationNum > 0;

    if (editingService) {
      const updates: any = { name: trimmedName, description: form.description.trim() || null };
      if (hasPrice) updates.price = priceNum;
      if (hasDuration) updates.duration_minutes = durationNum;
      const { error } = await supabase.from('services').update(updates).eq('id', editingService.id);
      if (error) { Alert.alert('Error', error.message); } else { setModalVisible(false); fetchServices(); }
    } else {
      const duplicate = services.find((s) => s.name.toLowerCase().trim() === trimmedName.toLowerCase());
      if (duplicate) {
        Alert.alert('Duplicate Service', `"${trimmedName}" already exists. Please use a different name.`);
        setSaving(false);
        return;
      }

      const insert: any = {
        provider_id: user.id,
        name: trimmedName,
        description: form.description.trim() || null,
        price: hasPrice ? priceNum : 0,
        is_active: true,
      };
      if (hasDuration) insert.duration_minutes = durationNum;

      const { data: newServices, error } = await supabase.from('services').insert(insert).select('id');
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

  const handleDelete = (id: string) => {
    Alert.alert('Delete Sub-Service', 'Are you sure you want to delete this service?', [
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
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const validation = validateImagePickerAsset(asset, 'service-images');
    if (!validation.valid) {
      Alert.alert('Invalid Image', validation.error);
      return;
    }

    const uri = asset.uri;
    const ext = (asset.fileName || uri).split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = `image/${ext}`;
    const filename = `${user.id}/${Date.now()}.${ext}`;

    if (!asset.base64) {
      Alert.alert('Upload failed', 'Could not read image data. Please try again.');
      return;
    }

    setUploadingPhoto(serviceId);
    try {
      const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
      };

      const arrayBuffer = base64ToArrayBuffer(asset.base64);

      const { error: uploadError } = await supabase.storage
        .from('service-images')
        .upload(filename, arrayBuffer, { contentType: mimeType });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('service-images').getPublicUrl(filename);

      const { error: insertError } = await supabase.from('service_images').insert({
        service_id: serviceId,
        image_url: urlData.publicUrl,
        sort_order: 0,
      });

      if (insertError) throw insertError;

      Alert.alert('Success', 'Photo uploaded successfully.');
      fetchServices();
    } catch (err: any) {
      Alert.alert('Upload failed', err.message || 'Could not upload photo');
    } finally {
      setUploadingPhoto(null);
    }
  };

  // =========================
  // Render
  // =========================

  const renderCatalogContent = () => {
    console.log('[SERVICE] renderCatalogContent — catalogStep:', catalogStep, 'catalogLoading:', catalogLoading, 'serviceGroups.length:', serviceGroups.length, 'serviceTemplates.length:', serviceTemplates.length);

    if (catalogLoading) {
      return (
        <View style={styles.catalogCenter}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      );
    }

    if (catalogStep === 'group') {
      if (serviceGroups.length === 0) {
        return (
          <View style={styles.catalogCenter}>
            <Ionicons name="cube-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.catalogEmptyTitle}>No Service Groups</Text>
            <Text style={styles.catalogEmptyText}>No service groups found for your categories.</Text>
            <Button title="Create Custom Service" onPress={() => { closeCatalog(); openAdd(); }} fullWidth style={{ marginTop: SPACING.md }} />
          </View>
        );
      }

      return (
        <View style={{ flex: 1 }}>
          <Text style={styles.catalogSubtitle}>Select a service group to see available templates</Text>
          <SectionList
            sections={(() => {
              const grouped: Record<string, ServiceGroup[]> = {};
              serviceGroups.forEach((g) => {
                const catName = categoryMap[g.category_id] || 'Other';
                if (!grouped[catName]) grouped[catName] = [];
                grouped[catName].push(g);
              });
              return Object.entries(grouped)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([title, data]) => ({ title, data }));
            })()}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 120 }}
            renderSectionHeader={({ section: { title } }) => (
              <Text style={styles.catalogSectionHeader}>{title}</Text>
            )}
            renderItem={({ item }) => (
                <TouchableOpacity style={styles.groupCard} onPress={() => selectGroup(item)} activeOpacity={0.8}>
                  <View style={styles.groupIconWrap}>
                    <Ionicons
                      name={(item.icon as React.ComponentProps<typeof Ionicons>['name']) || 'cube-outline'}
                      size={24}
                      color={COLORS.primary}
                    />
                  </View>
                  <View style={styles.groupInfo}>
                    <Text style={styles.groupName}>{item.name}</Text>
                    {item.description ? (
                      <Text style={styles.groupDesc} numberOfLines={2}>{item.description}</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
            )}
          />
          <Button
            title="Create Custom Service"
            onPress={() => { closeCatalog(); openAdd(); }}
            variant="outline"
            fullWidth
            style={{ marginTop: SPACING.sm }}
          />
        </View>
      );
    }

    if (catalogStep === 'template') {
      return (
        <View style={{ flex: 1 }}>
          <View style={styles.catalogHeaderRow}>
            <TouchableOpacity onPress={() => { setCatalogStep('group'); setSelectedGroup(null); setSelectedTemplateIds(new Set()); }} style={styles.catalogBackBtn}>
              <Ionicons name="arrow-back" size={18} color={COLORS.primary} />
              <Text style={styles.catalogBackText}>Groups</Text>
            </TouchableOpacity>
            <Text style={styles.catalogGroupTitle}>{selectedGroup?.name}</Text>
            <View style={{ width: 60 }} />
          </View>
          <Text style={styles.catalogSubtitle}>Select the services you offer</Text>

          {serviceTemplates.length === 0 ? (
            <View style={styles.catalogCenter}>
              <Text style={styles.catalogEmptyTitle}>No Templates</Text>
              <Text style={styles.catalogEmptyText}>No service templates found in this group.</Text>
              <Button title="Create Custom Service" onPress={() => { closeCatalog(); openAdd(); }} fullWidth style={{ marginTop: SPACING.md }} />
            </View>
          ) : (
            <FlatList
              data={serviceTemplates}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: SPACING.xl }}
              renderItem={({ item }) => {
                const isSelected = selectedTemplateIds.has(item.id);
                const alreadyExists = services.some((s) => s.name.toLowerCase().trim() === item.name.toLowerCase().trim());
                return (
                  <TouchableOpacity
                    style={[styles.templateRow, isSelected && styles.templateRowSelected, alreadyExists && styles.templateRowDisabled]}
                    onPress={() => { if (!alreadyExists) toggleTemplate(item.id); }}
                    activeOpacity={alreadyExists ? 1 : 0.7}
                  >
                    <View style={styles.templateCheckbox}>
                      {alreadyExists ? (
                        <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                      ) : isSelected ? (
                        <Ionicons name="checkbox" size={22} color={COLORS.primary} />
                      ) : (
                        <Ionicons name="square-outline" size={22} color={COLORS.textMuted} />
                      )}
                    </View>
                    <View style={styles.templateInfo}>
                      <Text style={[styles.templateName, alreadyExists && { color: COLORS.textMuted }]}>{item.name}</Text>
                      {item.description ? (
                        <Text style={[styles.templateDesc, alreadyExists && { color: COLORS.textMuted }]} numberOfLines={2}>{item.description}</Text>
                      ) : null}
                      {alreadyExists && (
                        <Text style={styles.templateExistsLabel}>Already added</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          <View style={styles.catalogFooter}>
            <Text style={styles.catalogCount}>{selectedTemplateIds.size} selected</Text>
            <Button
              title="Add Selected Services"
              onPress={createFromTemplates}
              loading={creatingFromTemplates}
              disabled={selectedTemplateIds.size === 0}
              fullWidth
            />
            <Button
              title="Create Custom Service"
              onPress={() => { closeCatalog(); openAdd(); }}
              variant="outline"
              fullWidth
              style={{ marginTop: SPACING.sm }}
            />
          </View>
        </View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>My Services</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openCatalog}>
          <Ionicons name="add" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Linked categories */}
      {linkedCategories.length > 0 ? (
        <View style={styles.categoriesRow}>
          <Ionicons name="layers-outline" size={16} color={COLORS.primary} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: SPACING.sm }}>
            {linkedCategories.map((lc) => (
              <View
                key={lc.category_id}
                style={[
                  styles.linkedCatChip,
                  lc.is_primary && { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
                ]}
              >
                <Text
                  style={[
                    styles.linkedCatChipText,
                    lc.is_primary && { color: COLORS.white, fontFamily: FONTS.bold },
                  ]}
                >
                  {toTitleCase(lc.categories?.name) ?? 'Category'}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.hint}>
        <Ionicons name="information-circle-outline" size={15} color={COLORS.textSecondary} />
        <Text style={styles.hintText}>Add services from your category catalog, or create custom services. Set your price and duration in the edit modal.</Text>
      </View>

      {/* Empty state with catalog CTA */}
      {!loading && services.length === 0 && user && (
        <View style={{ marginBottom: SPACING.md, paddingHorizontal: SPACING.md }}>
          <View style={styles.emptyCatalogCard}>
            <Ionicons name="cube-outline" size={40} color={COLORS.primary} />
            <Text style={styles.emptyCatalogTitle}>Build Your Service Menu</Text>
            <Text style={styles.emptyCatalogText}>
              Choose from pre-defined service templates based on your category, or create custom services.
            </Text>
            <Button title="Browse Service Catalog" onPress={openCatalog} fullWidth size="lg" style={{ marginTop: SPACING.md }} />
            <Button title="Create Custom Service" onPress={openAdd} variant="outline" fullWidth size="lg" style={{ marginTop: SPACING.sm }} />
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
            const priceText = item.price > 0
              ? `₱${item.price.toLocaleString()}`
              : 'Price not set';
            return (
              <View style={[styles.card, !item.is_active && styles.cardDisabled]}>
                <View style={styles.cardTop}>
                  <View style={styles.cardInfo}>
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.serviceName}>{item.name}</Text>
                      <View style={[styles.statusBadge, item.is_active ? styles.statusActive : styles.statusInactive]}>
                        <Text style={[styles.statusText, item.is_active ? styles.statusActiveText : styles.statusInactiveText]}>
                          {item.is_active ? 'ACTIVE' : 'HIDDEN'}
                        </Text>
                      </View>
                    </View>
                    {item.description ? <Text style={styles.serviceDesc} numberOfLines={1}>{item.description}</Text> : null}
                    <View style={styles.metaRow}>
                      <Text style={styles.priceTag}>{priceText}</Text>
                      {item.duration_minutes ? (
                        <View style={styles.metaChip}>
                          <Ionicons name="time-outline" size={12} color={COLORS.textSecondary} />
                          <Text style={styles.metaChipText}>{item.duration_minutes} min</Text>
                        </View>
                      ) : null}
                      <View style={styles.metaChip}>
                        <Ionicons name="images-outline" size={12} color={COLORS.textSecondary} />
                        <Text style={styles.metaChipText}>{item.image_count ?? 0} Photos</Text>
                      </View>
                    </View>
                    <View style={styles.portfolioRow}>
                      <Text style={styles.portfolioLabel}>Portfolio</Text>
                      <View style={styles.portfolioTrack}>
                        <View style={[styles.portfolioFill, { width: `${portfolioPercent}%` }]} />
                      </View>
                      <Text style={styles.portfolioPercent}>{portfolioPercent}%</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('ProviderServicePreview', { serviceId: item.id })}>
                    <Ionicons name="eye-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.actionBtnText}>Preview</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)}>
                    <Ionicons name="pencil-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.actionBtnText}>Edit</Text>
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
                    <Text style={styles.actionBtnText}>Photos</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.deleteActionBtn]} onPress={() => handleDelete(item.id)}>
                    <Ionicons name="trash-outline" size={16} color={COLORS.error} />
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
              <Text style={styles.modalTitle}>{editingService ? 'Edit Sub-Service' : 'Add Custom Service'}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Service Name *</Text>
                <TextInput style={styles.fieldInput} value={form.name} onChangeText={(v) => setForm((p) => ({ ...p, name: v }))} placeholder="e.g. Aircon Cleaning" placeholderTextColor={COLORS.textLight} />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Description (optional)</Text>
                <TextInput style={[styles.fieldInput, styles.fieldInputMulti]} value={form.description} onChangeText={(v) => setForm((p) => ({ ...p, description: v }))} placeholder="What does this service include?" placeholderTextColor={COLORS.textLight} multiline numberOfLines={3} textAlignVertical="top" />
              </View>
              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1, marginRight: SPACING.sm }]}>
                  <Text style={styles.fieldLabel}>Starting Price (₱)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={form.price}
                    onChangeText={(v) => setForm((p) => ({ ...p, price: v }))}
                    placeholder="0"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Duration (min)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={form.duration}
                    onChangeText={(v) => setForm((p) => ({ ...p, duration: v }))}
                    placeholder="60"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <Button title={editingService ? 'Save Changes' : 'Add Service'} onPress={handleSave} loading={saving} fullWidth size="lg" style={{ marginTop: SPACING.sm, marginBottom: SPACING.xl }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Service Catalog Modal */}
      <Modal visible={catalogStep !== 'none'} animationType="slide" transparent>
        {(() => {
          console.log('[SERVICE MODAL]', {
            visible: catalogStep !== 'none',
            groupsCount: serviceGroups?.length,
            templatesCount: serviceTemplates?.length,
            catalogStep,
          });
          return null;
        })()}
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.modal, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {catalogStep === 'group' ? 'Service Catalog' : selectedGroup?.name}
              </Text>
              <TouchableOpacity onPress={closeCatalog}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            {renderCatalogContent()}
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
  categoriesRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: SPACING.md, marginBottom: SPACING.xs },
  linkedCatChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, paddingVertical: 5, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border, marginRight: SPACING.xs },
  linkedCatChipText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontFamily: FONTS.medium },
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
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  priceTag: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.primary },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.border },
  metaChipText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  portfolioRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.sm },
  portfolioLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, fontFamily: FONTS.medium, width: 48 },
  portfolioTrack: { flex: 1, height: 4, backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.full, overflow: 'hidden' },
  portfolioFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.full },
  portfolioPercent: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontFamily: FONTS.semiBold, width: 32, textAlign: 'right' },
  actionRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: COLORS.border + '40' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 10, backgroundColor: COLORS.primaryLight },
  actionBtnText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.primary },
  deleteActionBtn: { backgroundColor: '#FEE2E2', maxWidth: 48 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { flex: 1, backgroundColor: COLORS.background, borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl, padding: SPACING.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  modalTitle: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.semiBold, color: COLORS.text },
  formGroup: { marginBottom: SPACING.md },
  fieldLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.xs },
  fieldInput: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, padding: SPACING.md, fontSize: FONTS.sizes.base, color: COLORS.text, height: 48 },
  fieldInputMulti: { height: 80, paddingTop: SPACING.md },
  // Empty catalog card
  emptyCatalogCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    alignItems: 'center',
    ...SHADOWS.small,
  },
  emptyCatalogTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text, marginTop: SPACING.md },
  emptyCatalogText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.sm, lineHeight: 20 },
  // Catalog styles
  catalogCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.xl },
  catalogSubtitle: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACING.md },
  catalogEmptyTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text, marginTop: SPACING.md },
  catalogEmptyText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, textAlign: 'center', marginTop: SPACING.sm, paddingHorizontal: SPACING.lg },
  catalogSectionHeader: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.textSecondary, marginTop: SPACING.md, marginBottom: SPACING.xs, textTransform: 'uppercase' },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.small,
  },
  groupIconWrap: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  groupInfo: { flex: 1 },
  groupName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  groupDesc: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  catalogHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  catalogBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  catalogBackText: { fontSize: FONTS.sizes.sm, color: COLORS.primary, fontFamily: FONTS.medium },
  catalogGroupTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, textAlign: 'center', flex: 1 },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  templateRowSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  templateRowDisabled: {
    opacity: 0.6,
    backgroundColor: COLORS.surfaceTertiary ?? COLORS.surface,
  },
  templateCheckbox: { marginRight: SPACING.md },
  templateInfo: { flex: 1 },
  templateName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  templateDesc: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  templateExistsLabel: { fontSize: FONTS.sizes.xs, color: COLORS.success, fontFamily: FONTS.medium, marginTop: 2 },
  catalogFooter: { paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  catalogCount: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACING.sm, textAlign: 'center' },
  formRow: { flexDirection: 'row', marginBottom: SPACING.md },
});
