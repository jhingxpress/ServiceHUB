import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, Alert, TextInput, Modal, FlatList, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { validateImagePickerAsset } from '../../utils/fileValidation';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Button from '../../components/ui/Button';
import { Category } from '../../types';

type KYCStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected';

interface ProviderDocs {
  gov_id_front?: string;
  gov_id_back?: string;
  selfie_with_id?: string;
  business_permit?: string;
  certifications?: string;
}

interface BusinessForm {
  business_name: string;
  owner_name: string;
  phone: string;
  business_address: string;
  category_id: string;
  category_name: string;
  service_description: string;
}

const STATUS_CONFIG: Record<KYCStatus, { label: string; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  not_submitted: { label: 'Not Submitted', color: COLORS.textLight, icon: 'document-outline' },
  pending: { label: 'Under Review', color: '#F59E0B', icon: 'time-outline' },
  approved: { label: 'Approved', color: COLORS.success, icon: 'shield-checkmark' },
  rejected: { label: 'Rejected', color: COLORS.error, icon: 'close-circle' },
};

const REQUIRED_DOCS: { field: keyof ProviderDocs; label: string; description: string; icon: React.ComponentProps<typeof Ionicons>['name']; required: boolean }[] = [
  { field: 'gov_id_front', label: 'Government ID (Front)', description: 'Front side of any valid government-issued ID', icon: 'card-outline', required: true },
  { field: 'gov_id_back', label: 'Government ID (Back)', description: 'Back side of your government-issued ID', icon: 'card-outline', required: true },
  { field: 'selfie_with_id', label: 'Selfie with ID', description: 'Hold your ID next to your face in a clear photo', icon: 'camera-outline', required: true },
  { field: 'business_permit', label: 'Business Permit', description: "Business/Mayor's permit (optional but recommended)", icon: 'briefcase-outline', required: false },
  { field: 'certifications', label: 'Certifications / Licenses', description: 'Trade certifications or licenses (optional)', icon: 'ribbon-outline', required: false },
];

export default function ProviderApplicationScreen() {
  const navigation = useNavigation();
  const { user, refreshProfile } = useAuthStore();
  const [status, setStatus] = useState<KYCStatus>('not_submitted');
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [docs, setDocs] = useState<ProviderDocs>({});
  const [uploading, setUploading] = useState<keyof ProviderDocs | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const [form, setForm] = useState<BusinessForm>({
    business_name: '',
    owner_name: '',
    phone: '',
    business_address: '',
    category_id: '',
    category_name: '',
    service_description: '',
  });

  const fetchData = useCallback(async () => {
    if (!user) return;

    const [catRes, provRes] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('providers').select('kyc_status, kyc_documents, kyc_rejection_reason, business_name, owner_name, business_address, service_description, category_id').eq('id', user.id).single(),
    ]);

    setCategories(catRes.data ?? []);

    if (!provRes.data) {
      await supabase.from('providers').upsert({ id: user.id, is_available: false, is_verified: false });
    } else {
      const p = provRes.data;
      setStatus((p.kyc_status as KYCStatus) ?? 'not_submitted');
      setRejectionReason(p.kyc_rejection_reason ?? null);
      setDocs(p.kyc_documents ?? {});
      if (p.business_name) {
        const cat = (catRes.data ?? []).find((c: Category) => c.id === p.category_id);
        setForm({
          business_name: p.business_name ?? '',
          owner_name: p.owner_name ?? '',
          phone: (user as any).phone ?? '',
          business_address: p.business_address ?? '',
          category_id: p.category_id ?? '',
          category_name: cat?.name ?? '',
          service_description: p.service_description ?? '',
        });
      }
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pickImage = async (field: keyof ProviderDocs) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const validation = validateImagePickerAsset(result.assets[0], 'kyc-documents');
    if (!validation.valid) {
      Alert.alert('Invalid Document', validation.error);
      return;
    }

    setUploading(field);
    const uri = result.assets[0].uri;
    const ext = uri.split('.').pop() ?? 'jpg';
    const path = `kyc/${user?.id}/${field}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();

    const { error } = await supabase.storage.from('kyc-documents').upload(path, blob, { upsert: true, contentType: `image/${ext}` });
    if (error) { Alert.alert('Upload Failed', error.message); setUploading(null); return; }

    const { data: urlData } = supabase.storage.from('kyc-documents').getPublicUrl(path);
    setDocs((prev) => ({ ...prev, [field]: urlData.publicUrl }));
    setUploading(null);
  };

  const handleSubmit = async () => {
    if (!form.business_name.trim()) { Alert.alert('Required', 'Company/business name is required.'); return; }
    if (!form.owner_name.trim()) { Alert.alert('Required', 'Owner/representative name is required.'); return; }
    if (!form.phone.trim()) { Alert.alert('Required', 'Mobile number is required.'); return; }
    if (!form.business_address.trim()) { Alert.alert('Required', 'Business address is required.'); return; }
    if (!form.category_id) { Alert.alert('Required', 'Please select your service category.'); return; }
    if (!form.service_description.trim()) { Alert.alert('Required', 'Service description is required.'); return; }

    const requiredDocs = REQUIRED_DOCS.filter((d) => d.required).map((d) => d.field);
    const missing = requiredDocs.filter((f) => !docs[f]);
    if (missing.length > 0) { Alert.alert('Incomplete', 'Please upload all required documents (marked with *).'); return; }

    setSubmitting(true);
    const { error } = await supabase.from('providers').upsert({
      id: user?.id,
      business_name: form.business_name.trim(),
      owner_name: form.owner_name.trim(),
      business_address: form.business_address.trim(),
      service_description: form.service_description.trim(),
      category_id: form.category_id,
      kyc_status: 'pending',
      kyc_documents: docs,
      is_available: false,
      is_verified: false,
    });

    if (error) { Alert.alert('Error', error.message); setSubmitting(false); return; }

    await refreshProfile();
    setStatus('pending');
    setSubmitting(false);
    Alert.alert('Application Submitted!', "Your provider application is under review. We'll notify you once approved. This usually takes 1–3 business days.");
  };

  const setField = (key: keyof BusinessForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const statusConfig = STATUS_CONFIG[status];

  if (loading) {
    return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View></SafeAreaView>;
  }

  const canEdit = status === 'not_submitted' || status === 'rejected';

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Provider Application</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Status Banner */}
          <View style={[styles.statusBanner, { backgroundColor: statusConfig.color + '15', borderColor: statusConfig.color + '40' }]}>
            <Ionicons name={statusConfig.icon} size={28} color={statusConfig.color} />
            <View style={styles.statusText}>
              <Text style={[styles.statusLabel, { color: statusConfig.color }]}>{statusConfig.label}</Text>
              {status === 'not_submitted' && <Text style={styles.statusSub}>Fill in your business details and upload required documents to apply.</Text>}
              {status === 'pending' && <Text style={styles.statusSub}>Your application is under review. This usually takes 1–3 business days.</Text>}
              {status === 'approved' && <Text style={styles.statusSub}>Congratulations! You are a verified provider. You can now accept bookings.</Text>}
              {status === 'rejected' && <Text style={styles.statusSub}>{rejectionReason ?? 'Your application was not approved. Please resubmit with updated information.'}</Text>}
            </View>
          </View>

          {/* ── SECTION 1: Business Information ── */}
          {canEdit && (
            <>
              <Text style={styles.sectionTitle}>Business Information</Text>
              <View style={styles.formCard}>
                {[
                  { key: 'business_name', label: 'Company / Business Name *', placeholder: 'e.g. ABC Cooling Services' },
                  { key: 'owner_name', label: 'Owner / Representative Name *', placeholder: 'e.g. Juan dela Cruz' },
                  { key: 'phone', label: 'Mobile Number *', placeholder: '+639XXXXXXXXX', keyboardType: 'phone-pad' as const },
                  { key: 'business_address', label: 'Business Address *', placeholder: 'Street, City, Province', multi: true },
                ].map((f) => (
                  <View key={f.key} style={styles.formGroup}>
                    <Text style={styles.fieldLabel}>{f.label}</Text>
                    <TextInput
                      style={[styles.fieldInput, f.multi && styles.fieldInputMulti]}
                      value={(form as unknown as Record<string, string>)[f.key]}
                      onChangeText={(v) => setField(f.key as keyof BusinessForm, v)}
                      placeholder={f.placeholder}
                      placeholderTextColor={COLORS.textLight}
                      keyboardType={f.keyboardType ?? 'default'}
                      multiline={!!f.multi}
                      numberOfLines={f.multi ? 2 : 1}
                      textAlignVertical={f.multi ? 'top' : 'center'}
                    />
                  </View>
                ))}

                {/* Category Picker */}
                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>Service Category *</Text>
                  <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowCategoryPicker(true)}>
                    <Text style={[styles.pickerText, !form.category_id && { color: COLORS.textLight }]}>
                      {form.category_name || 'Select your service category...'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>

                {/* Service Description */}
                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>Service Description *</Text>
                  <TextInput
                    style={[styles.fieldInput, styles.fieldInputMulti, { height: 90 }]}
                    value={form.service_description}
                    onChangeText={(v) => setField('service_description', v)}
                    placeholder="Describe the services you offer, your experience, and specialties..."
                    placeholderTextColor={COLORS.textLight}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </View>
              </View>
            </>
          )}

          {/* Approved: show business info summary */}
          {status === 'approved' && form.business_name ? (
            <View style={styles.summaryCard}>
              <Text style={styles.sectionTitle}>Business Profile</Text>
              <SummaryRow label="Business" value={form.business_name} />
              <SummaryRow label="Owner" value={form.owner_name} />
              <SummaryRow label="Category" value={form.category_name} />
              <SummaryRow label="Address" value={form.business_address} />
            </View>
          ) : null}

          {/* ── SECTION 2: Documents ── */}
          {canEdit && (
            <>
              <Text style={styles.sectionTitle}>Identity Documents</Text>
              {REQUIRED_DOCS.map((doc) => (
                <DocUpload
                  key={doc.field}
                  label={doc.label + (doc.required ? ' *' : '')}
                  description={doc.description}
                  icon={doc.icon}
                  imageUri={docs[doc.field]}
                  onPress={() => pickImage(doc.field)}
                  uploading={uploading === doc.field}
                  required={doc.required}
                />
              ))}

              <View style={styles.tips}>
                <Text style={styles.tipsTitle}>Important Notes</Text>
                {['All required (*) fields and documents must be completed', 'Category cannot be changed after approval without admin review', 'Ensure images are clear, well-lit and unobstructed', 'False information will result in permanent ban'].map((tip) => (
                  <View key={tip} style={styles.tipRow}>
                    <Ionicons name="information-circle" size={14} color={COLORS.primary} />
                    <Text style={styles.tipText}>{tip}</Text>
                  </View>
                ))}
              </View>

              <Button
                title={status === 'rejected' ? 'Resubmit Application' : 'Submit Application'}
                onPress={handleSubmit}
                loading={submitting}
                fullWidth size="lg"
                style={styles.submitBtn}
                disabled={uploading !== null || submitting}
              />
            </>
          )}

          {/* Pending: show submitted docs */}
          {status === 'pending' && (
            <>
              <Text style={styles.sectionTitle}>Submitted Documents</Text>
              {REQUIRED_DOCS.map((doc) => docs[doc.field] ? (
                <SubmittedDoc key={doc.field} label={doc.label} uri={docs[doc.field]!} />
              ) : null)}
            </>
          )}

          {/* Approved: action button */}
          {status === 'approved' && (
            <View style={styles.approvedCard}>
              <Ionicons name="rocket-outline" size={40} color={COLORS.primary} />
              <Text style={styles.approvedTitle}>You're all set!</Text>
              <Text style={styles.approvedText}>Manage your sub-services and pricing, then start accepting bookings.</Text>
              <Button title="Manage My Services" onPress={() => (navigation as any).navigate('ManageServices')} fullWidth size="lg" style={{ marginTop: SPACING.md }} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category Picker Modal */}
      <Modal visible={showCategoryPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Category</Text>
              <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={categories}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.catOption, form.category_id === item.id && styles.catOptionActive]}
                  onPress={() => { setField('category_id', item.id); setField('category_name', item.name); setShowCategoryPicker(false); }}
                >
                  <Ionicons name={item.icon as React.ComponentProps<typeof Ionicons>['name']} size={22} color={form.category_id === item.id ? COLORS.primary : COLORS.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.catName, form.category_id === item.id && { color: COLORS.primary, fontFamily: FONTS.semiBold }]}>{item.name}</Text>
                    {item.description && <Text style={styles.catDesc} numberOfLines={1}>{item.description}</Text>}
                  </View>
                  {form.category_id === item.id && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function DocUpload({ label, description, icon, imageUri, onPress, uploading, required }: {
  label: string; description: string; icon: React.ComponentProps<typeof Ionicons>['name'];
  imageUri?: string; onPress: () => void; uploading: boolean; required: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.docCard, imageUri ? styles.docCardUploaded : null]} onPress={onPress} disabled={uploading} activeOpacity={0.8}>
      {uploading ? <View style={styles.docPlaceholder}><ActivityIndicator color={COLORS.primary} /></View>
        : imageUri ? <Image source={{ uri: imageUri }} style={styles.docPreview} />
        : <View style={styles.docPlaceholder}><Ionicons name={icon} size={32} color={COLORS.primary} /></View>}
      <View style={styles.docInfo}>
        <View style={styles.docLabelRow}>
          <Text style={styles.docLabel}>{label}</Text>
          {imageUri ? <Ionicons name="checkmark-circle" size={18} color={COLORS.success} /> : <Ionicons name="cloud-upload-outline" size={18} color={required ? COLORS.error : COLORS.primary} />}
        </View>
        <Text style={styles.docDesc}>{description}</Text>
        <Text style={[styles.docAction, { color: imageUri ? COLORS.success : COLORS.primary }]}>
          {uploading ? 'Uploading...' : imageUri ? 'Tap to replace' : 'Tap to upload'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function SubmittedDoc({ label, uri }: { label: string; uri: string }) {
  return (
    <View style={styles.submittedDoc}>
      <Image source={{ uri }} style={styles.submittedImage} />
      <View style={styles.submittedLabelRow}>
        <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
        <Text style={styles.submittedLabel}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  statusBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, padding: SPACING.md, borderRadius: BORDER_RADIUS.xl, borderWidth: 1, marginBottom: SPACING.lg },
  statusText: { flex: 1 },
  statusLabel: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, marginBottom: 4 },
  statusSub: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 18 },
  sectionTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.sm },
  formCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg, ...SHADOWS.small },
  formGroup: { marginBottom: SPACING.md },
  fieldLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.xs },
  fieldInput: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, padding: SPACING.md, fontSize: FONTS.sizes.base, color: COLORS.text, height: 48 },
  fieldInputMulti: { height: 72, paddingTop: SPACING.sm },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: SPACING.md, height: 48 },
  pickerText: { fontSize: FONTS.sizes.base, color: COLORS.text, flex: 1 },
  summaryCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg },
  summaryRow: { flexDirection: 'row', gap: SPACING.md, paddingVertical: SPACING.xs },
  summaryLabel: { width: 70, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  summaryValue: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text, fontFamily: FONTS.semiBold },
  docCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed', marginBottom: SPACING.md, ...SHADOWS.small },
  docCardUploaded: { borderStyle: 'solid', borderColor: COLORS.success + '60' },
  docPlaceholder: { width: 64, height: 64, borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  docPreview: { width: 64, height: 64, borderRadius: BORDER_RADIUS.lg },
  docInfo: { flex: 1 },
  docLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  docLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, flex: 1, marginRight: 8 },
  docDesc: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginBottom: 4, lineHeight: 16 },
  docAction: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold },
  tips: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg },
  tipsTitle: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.sm },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: 6 },
  tipText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, flex: 1 },
  submitBtn: { marginBottom: SPACING.xl },
  submittedDoc: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, overflow: 'hidden', marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  submittedImage: { width: '100%', height: 180 },
  submittedLabelRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, padding: SPACING.sm },
  submittedLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  approvedCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.xl, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', marginTop: SPACING.md },
  approvedTitle: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text, marginTop: SPACING.md, marginBottom: SPACING.xs },
  approvedText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { backgroundColor: COLORS.background, borderTopLeftRadius: BORDER_RADIUS.xl, borderTopRightRadius: BORDER_RADIUS.xl, padding: SPACING.lg, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  modalTitle: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.semiBold, color: COLORS.text },
  catOption: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md, borderRadius: BORDER_RADIUS.lg, marginBottom: SPACING.xs },
  catOptionActive: { backgroundColor: COLORS.primaryLight },
  catName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  catDesc: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
});
