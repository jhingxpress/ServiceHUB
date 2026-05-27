import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Category } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

const MAX_FILE_SIZE = 1024 * 1024 * 1024;
const TOTAL_STEPS = 4;
const STEP_TITLES = ['Business Info', 'Category', 'Documents', 'Review & Submit'];

const PH_ID_TYPES = [
  { value: 'philippine_national_id', label: 'Philippine National ID (PhilSys)' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'passport', label: 'Passport' },
  { value: 'umid', label: 'UMID' },
  { value: 'postal_id', label: 'Postal ID' },
  { value: 'voters_id', label: "Voter's ID" },
  { value: 'sss_id', label: 'SSS ID' },
  { value: 'philhealth_id', label: 'PhilHealth ID' },
  { value: 'tin_id', label: 'TIN ID' },
];

const PERMIT_TYPES = [
  { key: 'barangay_clearance', label: 'Barangay Clearance' },
  { key: 'business_permit', label: 'Business Permit' },
  { key: 'dti_registration', label: 'DTI Registration' },
  { key: 'bir_registration', label: 'BIR Certificate' },
  { key: 'tesda_certificate', label: 'TESDA Certificate' },
  { key: 'professional_cert', label: 'Professional License / Certificate' },
  { key: 'other_supporting', label: 'Other Supporting Documents' },
];

type UploadState = 'idle' | 'uploading' | 'success' | 'failed';

interface ValidIdSide {
  uri: string | null;
  uploadedUrl: string | null;
  state: UploadState;
  error: string | null;
}

interface ValidIdDoc {
  idType: string | null;
  showDropdown: boolean;
  front: ValidIdSide;
  back: ValidIdSide;
}

interface PermitDoc {
  key: string;
  label: string;
  checked: boolean;
  uri: string | null;
  uploadedUrl: string | null;
  state: UploadState;
  error: string | null;
}

const INITIAL_VALID_ID: ValidIdDoc = {
  idType: null, showDropdown: false,
  front: { uri: null, uploadedUrl: null, state: 'idle', error: null },
  back: { uri: null, uploadedUrl: null, state: 'idle', error: null },
};

const getMimeType = (uri: string, assetMime?: string | null): string => {
  if (assetMime) return assetMime;
  const ext = uri.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  return 'image/jpeg';
};

const uploadWithRetry = async (uri: string, path: string, mimeType: string, maxRetries = 2): Promise<string> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1000 * attempt));
      const response = await fetch(uri);
      if (!response.ok) throw new Error(`Fetch error: HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from('provider-documents')
        .upload(path, arrayBuffer, { contentType: mimeType, upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('provider-documents').getPublicUrl(path);
      return urlData.publicUrl;
    } catch (err) {
      lastError = err;
      console.error(`[DocUpload] Attempt ${attempt + 1}/${maxRetries + 1} failed:`, err);
    }
  }
  throw lastError;
};

export default function ProviderOnboardingScreen() {
  const { user, providerProfile, refreshProviderProfile } = useAuthStore();
  const scrollRef = useRef<ScrollView>(null);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 fields
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [description, setDescription] = useState('');
  const [yearsExp, setYearsExp] = useState('');
  const [serviceArea, setServiceArea] = useState('');

  // Step 2
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [catLoading, setCatLoading] = useState(true);

  // Step 3 — documents
  const [validId, setValidId] = useState<ValidIdDoc>(INITIAL_VALID_ID);
  const [permits, setPermits] = useState<PermitDoc[]>(
    PERMIT_TYPES.map(p => ({ ...p, checked: false, uri: null, uploadedUrl: null, state: 'idle' as UploadState, error: null }))
  );

  useEffect(() => {
    loadCategories();
    loadExistingData();
  }, []);

  const loadCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('name');
    setCategories((data ?? []) as Category[]);
    setCatLoading(false);
  };

  const loadExistingData = async () => {
    if (!user) return;
    const { data } = await supabase.from('providers').select('*').eq('id', user.id).single();
    if (data) {
      setBusinessName(data.business_name ?? '');
      setBusinessAddress(data.business_address ?? '');
      setCity(data.city ?? '');
      setProvince(data.province ?? '');
      setMobileNumber(data.business_phone ?? '');
      setBusinessEmail(data.business_email ?? '');
      setDescription(data.service_description ?? '');
      setYearsExp(data.years_of_experience ? String(data.years_of_experience) : '');
      setServiceArea(data.service_area ?? '');
      setSelectedCategoryId(data.category_id ?? null);
    }
    const { data: existingDocs } = await supabase
      .from('provider_documents').select('*').eq('provider_id', user.id);
    if (existingDocs?.length) {
      const vidDocs = existingDocs.filter((d: any) =>
        d.category_type === 'valid_id' || d.document_type === 'valid_id' || d.document_type === 'government_id'
      );
      if (vidDocs.length) {
        const idType = vidDocs[0].id_type ?? null;
        const front = vidDocs.find((d: any) => d.side === 'front');
        const back = vidDocs.find((d: any) => d.side === 'back');
        setValidId(prev => ({
          ...prev,
          idType,
          front: { uri: null, uploadedUrl: front?.file_url ?? null, state: front ? 'success' : 'idle', error: null },
          back: { uri: null, uploadedUrl: back?.file_url ?? null, state: back ? 'success' : 'idle', error: null },
        }));
      }
      setPermits(prev => prev.map(p => {
        const ex = existingDocs.find((d: any) => d.document_type === p.key);
        if (ex) return { ...p, checked: true, uploadedUrl: ex.file_url, state: 'success' as UploadState };
        return p;
      }));
    }
  };

  const validateStep1 = (): string | null => {
    if (!businessName.trim()) return 'Business Name is required.';
    if (!businessAddress.trim()) return 'Business Address is required.';
    if (!city.trim()) return 'City/Municipality is required.';
    if (!province.trim()) return 'Province is required.';
    if (!mobileNumber.trim()) return 'Mobile Number is required.';
    if (!/^(09|\+639)\d{9}$/.test(mobileNumber.replace(/\s/g, '')))
      return 'Enter a valid Philippine mobile number (e.g. 09XXXXXXXXX).';
    if (!businessEmail.trim()) return 'Email Address is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) return 'Enter a valid email address.';
    if (!description.trim() || description.trim().length < 20)
      return 'Business Description must be at least 20 characters.';
    return null;
  };

  const validateStep2 = (): string | null => {
    if (!selectedCategoryId) return 'Please select a service category.';
    return null;
  };

  const validateStep3 = (): string | null => {
    if (!validId.idType) return 'Please select your Valid ID type.';
    if (!validId.front.uploadedUrl) return 'Please upload the front of your Valid ID.';
    if (!validId.back.uploadedUrl) return 'Please upload the back of your Valid ID.';
    if (validId.front.state === 'uploading' || validId.back.state === 'uploading') return 'Please wait for your Valid ID uploads to finish.';
    const uploading = permits.find(p => p.checked && p.state === 'uploading');
    if (uploading) return 'Please wait for all uploads to finish.';
    const checkedNoFile = permits.find(p => p.checked && !p.uploadedUrl);
    if (checkedNoFile) return `Please upload your ${checkedNoFile.label} or uncheck it.`;
    if (!permits.some(p => p.uploadedUrl)) return 'Please upload at least one Permit, Certificate, or Clearance.';
    return null;
  };

  const handleNext = () => {
    let error: string | null = null;
    if (step === 1) error = validateStep1();
    else if (step === 2) error = validateStep2();
    else if (step === 3) error = validateStep3();
    if (error) { Alert.alert('Required', error); return; }
    setStep(s => s + 1);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleBack = () => {
    setStep(s => s - 1);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const pickFile = async (): Promise<{ uri: string; mimeType: string } | null> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload documents.');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
      Alert.alert('File Too Large', 'Maximum file size is 10MB. Please choose a smaller file.');
      return null;
    }
    return { uri: asset.uri, mimeType: getMimeType(asset.uri, asset.mimeType) };
  };

  const doValidIdSideUpload = async (side: 'front' | 'back', uri: string, mimeType: string) => {
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${user!.id}/valid_id_${side}_${Date.now()}.${ext}`;
    setValidId(prev => ({
      ...prev,
      [side]: { ...prev[side], uri, state: 'uploading', error: null },
    }));
    try {
      const url = await uploadWithRetry(uri, path, mimeType);
      await supabase.from('provider_documents').delete()
        .eq('provider_id', user!.id).eq('document_type', 'valid_id').eq('side', side);
      await supabase.from('provider_documents').insert({
        provider_id: user!.id, document_type: 'valid_id', category_type: 'valid_id',
        id_type: validId.idType, side, file_url: url, status: 'pending',
      });
      setValidId(prev => ({
        ...prev,
        [side]: { ...prev[side], uploadedUrl: url, state: 'success', error: null },
      }));
    } catch (err) {
      const msg = err instanceof Error && err.message
        ? err.message : 'Network error. Please check your connection and try again.';
      setValidId(prev => ({
        ...prev,
        [side]: { ...prev[side], state: 'failed', error: msg },
      }));
    }
  };

  const pickAndUploadValidIdSide = async (side: 'front' | 'back') => {
    if (!validId.idType) { Alert.alert('Select ID Type', 'Please select your Valid ID type first.'); return; }
    const file = await pickFile();
    if (!file) return;
    await doValidIdSideUpload(side, file.uri, file.mimeType);
  };

  const retryValidIdSide = (side: 'front' | 'back') => {
    const sideData = validId[side];
    if (sideData.uri) doValidIdSideUpload(side, sideData.uri, getMimeType(sideData.uri));
  };

  const removeValidIdSide = async (side: 'front' | 'back') => {
    if (user) await supabase.from('provider_documents').delete()
      .eq('provider_id', user.id).eq('document_type', 'valid_id').eq('side', side);
    setValidId(prev => ({
      ...prev,
      [side]: { uri: null, uploadedUrl: null, state: 'idle', error: null },
    }));
  };

  const doPermitUpload = async (docKey: string, uri: string, mimeType: string) => {
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${user!.id}/${docKey}_${Date.now()}.${ext}`;
    setPermits(prev => prev.map(p => p.key === docKey ? { ...p, uri, state: 'uploading', error: null } : p));
    try {
      const url = await uploadWithRetry(uri, path, mimeType);
      await supabase.from('provider_documents').delete()
        .eq('provider_id', user!.id).eq('document_type', docKey);
      await supabase.from('provider_documents').insert({
        provider_id: user!.id, document_type: docKey, category_type: 'permit_certificate',
        file_url: url, status: 'pending',
      });
      setPermits(prev => prev.map(p => p.key === docKey ? { ...p, uploadedUrl: url, state: 'success', error: null } : p));
    } catch (err) {
      const msg = err instanceof Error && err.message
        ? err.message : 'Network error. Please check your connection and try again.';
      setPermits(prev => prev.map(p => p.key === docKey ? { ...p, state: 'failed', error: msg } : p));
    }
  };

  const pickAndUploadPermit = async (docKey: string) => {
    const file = await pickFile();
    if (!file) return;
    setPermits(prev => prev.map(p => p.key === docKey ? { ...p, checked: true } : p));
    await doPermitUpload(docKey, file.uri, file.mimeType);
  };

  const retryPermit = (docKey: string) => {
    const p = permits.find(x => x.key === docKey);
    if (p?.uri) doPermitUpload(docKey, p.uri, getMimeType(p.uri));
  };

  const removePermit = (docKey: string) => {
    Alert.alert('Remove Document', 'Remove this uploaded document?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          if (user) await supabase.from('provider_documents').delete()
            .eq('provider_id', user.id).eq('document_type', docKey);
          setPermits(prev => prev.map(p => p.key === docKey
            ? { ...p, uri: null, uploadedUrl: null, state: 'idle', error: null }
            : p));
        },
      },
    ]);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      console.log('[handleSubmit] Starting submission...');
      console.log('[handleSubmit] User ID:', user?.id);
      console.log('[handleSubmit] Category ID:', selectedCategoryId);
      
      const payload = {
        id: user!.id,
        business_name: businessName.trim(),
        business_address: businessAddress.trim(),
        city: city.trim(),
        province: province.trim(),
        business_phone: mobileNumber.trim(),
        business_email: businessEmail.trim(),
        service_description: description.trim(),
        years_of_experience: yearsExp ? parseInt(yearsExp, 10) : 0,
        service_area: serviceArea.trim() || null,
        category_id: selectedCategoryId,
        location: `${city.trim()}, ${province.trim()}`,
        status: 'pending_review',
      };
      console.log('[handleSubmit] Payload:', payload);
      
      const { error, data } = await supabase.from('providers').upsert(payload);
      console.log('[handleSubmit] Upsert result:', { error, data });
      
      if (error) {
        console.error('[handleSubmit] Upsert error:', error);
        throw error;
      }
      
      console.log('[handleSubmit] Refreshing provider profile...');
      try {
        await refreshProviderProfile();
        console.log('[handleSubmit] Provider profile refreshed');
      } catch (refreshErr) {
        console.error('[handleSubmit] Refresh profile error:', refreshErr);
        // Don't throw on refresh error - submission succeeded
      }
      
      console.log('[handleSubmit] Submission successful');
    } catch (err) {
      console.error('[handleSubmit] Submission error:', err);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      Alert.alert('Submission Failed', msg + '\n\nPlease check your connection and try again.');
      setSubmitting(false);
    }
  };

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);

  const renderProgressBar = () => (
    <View style={styles.progressContainer}>
      {STEP_TITLES.map((title, i) => {
        const num = i + 1;
        const active = num === step;
        const done = num < step;
        return (
          <React.Fragment key={num}>
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, active && styles.stepCircleActive, done && styles.stepCircleDone]}>
                {done
                  ? <Ionicons name="checkmark" size={14} color={COLORS.white} />
                  : <Text style={[styles.stepNum, active && styles.stepNumActive]}>{num}</Text>
                }
              </View>
              <Text style={[styles.stepLabel, active && styles.stepLabelActive]} numberOfLines={1}>{title}</Text>
            </View>
            {i < TOTAL_STEPS - 1 && (
              <View style={[styles.stepLine, done && styles.stepLineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );

  const renderField = (label: string, value: string, onChange: (v: string) => void, opts?: {
    placeholder?: string; keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric';
    multiline?: boolean; required?: boolean;
  }) => (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}{opts?.required !== false ? ' *' : ''}</Text>
      <TextInput
        style={[styles.input, opts?.multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChange}
        placeholder={opts?.placeholder ?? label}
        placeholderTextColor={COLORS.textLight}
        keyboardType={opts?.keyboardType ?? 'default'}
        multiline={opts?.multiline}
        numberOfLines={opts?.multiline ? 4 : 1}
        textAlignVertical={opts?.multiline ? 'top' : 'center'}
        autoCapitalize={opts?.keyboardType === 'email-address' ? 'none' : 'sentences'}
      />
    </View>
  );

  const renderStep1 = () => (
    <View>
      {providerProfile?.rejection_reason ? (
        <View style={styles.rejectionBanner}>
          <Ionicons name="alert-circle" size={18} color={COLORS.error} />
          <Text style={styles.rejectionText}>
            Previous rejection reason: {providerProfile.rejection_reason}
          </Text>
        </View>
      ) : null}
      <Text style={styles.stepHeading}>Business Information</Text>
      <Text style={styles.stepSubheading}>Tell customers about your business.</Text>
      {renderField('Business Name', businessName, setBusinessName, { placeholder: 'e.g. Juan dela Cruz Services' })}
      {renderField('Business Address', businessAddress, setBusinessAddress, { placeholder: 'Street, Barangay' })}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          {renderField('City/Municipality', city, setCity, { placeholder: 'e.g. Cebu City' })}
        </View>
        <View style={{ flex: 1 }}>
          {renderField('Province', province, setProvince, { placeholder: 'e.g. Cebu' })}
        </View>
      </View>
      {renderField('Mobile Number', mobileNumber, setMobileNumber, { placeholder: '09XXXXXXXXX', keyboardType: 'phone-pad' })}
      {renderField('Email Address', businessEmail, setBusinessEmail, { placeholder: 'business@email.com', keyboardType: 'email-address' })}
      {renderField('Business Description', description, setDescription, {
        placeholder: 'Describe your services, experience, and what makes you stand out...',
        multiline: true, required: false,
      })}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          {renderField('Years of Experience', yearsExp, setYearsExp, { placeholder: 'e.g. 5', keyboardType: 'numeric', required: false })}
        </View>
        <View style={{ flex: 1 }}>
          {renderField('Service Area', serviceArea, setServiceArea, { placeholder: 'e.g. Metro Cebu', required: false })}
        </View>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View>
      <Text style={styles.stepHeading}>Select Service Category</Text>
      <Text style={styles.stepSubheading}>Choose your primary service category. You can only select one.</Text>
      {catLoading
        ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
        : (
          <View style={styles.catGrid}>
            {categories.map(cat => {
              const selected = cat.id === selectedCategoryId;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catCard, selected && styles.catCardSelected, { borderColor: selected ? cat.color : COLORS.border }]}
                  onPress={() => setSelectedCategoryId(cat.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.catIcon, { backgroundColor: selected ? cat.color : `${cat.color}20` }]}>
                    <Ionicons name={cat.icon as React.ComponentProps<typeof Ionicons>['name']} size={22} color={selected ? COLORS.white : cat.color} />
                  </View>
                  <Text style={[styles.catName, selected && styles.catNameSelected]} numberOfLines={2}>{cat.name}</Text>
                  {selected && (
                    <View style={[styles.catCheck, { backgroundColor: cat.color }]}>
                      <Ionicons name="checkmark" size={10} color={COLORS.white} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )
      }
    </View>
  );

  const renderUploadWidget = (
    state: UploadState,
    uploadedUrl: string | null,
    onPick: () => void,
    onRetry: () => void,
    onRemove: () => void,
  ) => {
    if (state === 'uploading') {
      return (
        <View style={styles.uploadStateRow}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.uploadingText}>Uploading...</Text>
        </View>
      );
    }
    if (state === 'success' && uploadedUrl) {
      return (
        <View style={styles.uploadSuccessRow}>
          <Image source={{ uri: uploadedUrl }} style={styles.docPreview} resizeMode="cover" />
          <View style={styles.uploadSuccessInfo}>
            <View style={styles.uploadSuccessBadge}>
              <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
              <Text style={styles.uploadSuccessText}>Uploaded</Text>
            </View>
            <View style={styles.uploadActions}>
              <TouchableOpacity style={styles.replaceBtn} onPress={onPick}>
                <Ionicons name="refresh-outline" size={13} color={COLORS.primary} />
                <Text style={styles.replaceBtnText}>Replace</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
                <Ionicons name="trash-outline" size={13} color={COLORS.error} />
                <Text style={styles.removeBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }
    if (state === 'failed') {
      return (
        <View style={styles.uploadFailedBox}>
          <View style={styles.uploadFailedRow}>
            <Ionicons name="close-circle" size={15} color={COLORS.error} />
            <Text style={styles.uploadFailedText}>Upload failed</Text>
          </View>
          <View style={styles.uploadFailedBtns}>
            <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
              <Ionicons name="refresh" size={13} color={COLORS.white} />
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.replaceBtn} onPress={onPick}>
              <Ionicons name="folder-open-outline" size={13} color={COLORS.primary} />
              <Text style={styles.replaceBtnText}>Different File</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    return (
      <TouchableOpacity style={styles.uploadBtn} onPress={onPick}>
        <Ionicons name="cloud-upload-outline" size={16} color={COLORS.primary} />
        <Text style={styles.uploadBtnText}>Upload File</Text>
        <Text style={styles.uploadHint}>(JPG/PNG · max 1GB)</Text>
      </TouchableOpacity>
    );
  };

  const renderStep3 = () => {
    const selectedIdLabel = PH_ID_TYPES.find(t => t.value === validId.idType)?.label;
    return (
      <View>
        <Text style={styles.stepHeading}>Verification Documents</Text>
        <Text style={styles.stepSubheading}>Upload clear photos or scans. Files are stored securely.</Text>

        {/* --- Section 1: Valid ID --- */}
        <View style={styles.docSection}>
          <View style={styles.docSectionHeader}>
            <View style={styles.docSectionIcon}><Ionicons name="card-outline" size={16} color={COLORS.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.docSectionTitle}>Valid ID <Text style={styles.reqBadge}>Required</Text></Text>
              <Text style={styles.docSectionNote}>Select one Philippine government-issued ID and upload a clear photo.</Text>
            </View>
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.label}>ID Type *</Text>
            <TouchableOpacity
              style={styles.dropdown}
              onPress={() => setValidId(prev => ({ ...prev, showDropdown: !prev.showDropdown }))}
              activeOpacity={0.7}
            >
              <Text style={[styles.dropdownText, !selectedIdLabel && styles.dropdownPlaceholder]}>
                {selectedIdLabel ?? 'Select Valid ID type...'}
              </Text>
              <Ionicons name={validId.showDropdown ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textLight} />
            </TouchableOpacity>
            {validId.showDropdown && (
              <View style={styles.dropdownList}>
                {PH_ID_TYPES.map(idType => (
                  <TouchableOpacity
                    key={idType.value}
                    style={[styles.dropdownItem, validId.idType === idType.value && styles.dropdownItemSelected]}
                    onPress={() => setValidId(prev => ({ ...prev, idType: idType.value, showDropdown: false }))}
                  >
                    <Text style={[styles.dropdownItemText, validId.idType === idType.value && styles.dropdownItemTextSel]}>
                      {idType.label}
                    </Text>
                    {validId.idType === idType.value && <Ionicons name="checkmark" size={15} color={COLORS.primary} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.idSidesRow}>
            <View style={styles.idSideCol}>
              <Text style={styles.idSideLabel}>Front</Text>
              {renderUploadWidget(
                validId.front.state,
                validId.front.uploadedUrl,
                () => pickAndUploadValidIdSide('front'),
                () => retryValidIdSide('front'),
                () => removeValidIdSide('front'),
              )}
              {validId.front.state === 'failed' && validId.front.error
                ? <Text style={styles.errorMsg}>{validId.front.error}</Text> : null}
            </View>
            <View style={styles.idSideCol}>
              <Text style={styles.idSideLabel}>Back</Text>
              {renderUploadWidget(
                validId.back.state,
                validId.back.uploadedUrl,
                () => pickAndUploadValidIdSide('back'),
                () => retryValidIdSide('back'),
                () => removeValidIdSide('back'),
              )}
              {validId.back.state === 'failed' && validId.back.error
                ? <Text style={styles.errorMsg}>{validId.back.error}</Text> : null}
            </View>
          </View>
        </View>

        {/* --- Section 2: Permits / Certificates / Clearances --- */}
        <View style={styles.docSection}>
          <View style={styles.docSectionHeader}>
            <View style={styles.docSectionIcon}><Ionicons name="document-text-outline" size={16} color={COLORS.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.docSectionTitle}>
                Permits, Certificates & Clearances <Text style={styles.reqBadge}>At least 1</Text>
              </Text>
              <Text style={styles.docSectionNote}>Check all documents you have and upload each file.</Text>
            </View>
          </View>

          {permits.map(permit => (
            <View key={permit.key} style={[styles.permitRow, permit.checked && styles.permitRowChecked]}>
              <TouchableOpacity
                style={styles.checkRow}
                onPress={() => {
                  if (permit.uploadedUrl) { removePermit(permit.key); }
                  else { setPermits(prev => prev.map(p => p.key === permit.key ? { ...p, checked: !p.checked } : p)); }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, permit.checked && styles.checkboxChecked]}>
                  {permit.checked && <Ionicons name="checkmark" size={12} color={COLORS.white} />}
                </View>
                <Text style={[styles.permitLabel, permit.checked && styles.permitLabelChecked]}>{permit.label}</Text>
                {permit.uploadedUrl && (
                  <View style={styles.smallSuccessBadge}>
                    <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                  </View>
                )}
              </TouchableOpacity>
              {permit.checked && (
                <View style={styles.permitUploadArea}>
                  {renderUploadWidget(
                    permit.state, permit.uploadedUrl,
                    () => pickAndUploadPermit(permit.key),
                    () => retryPermit(permit.key),
                    () => removePermit(permit.key),
                  )}
                  {permit.state === 'failed' && permit.error
                    ? <Text style={styles.errorMsg}>{permit.error}</Text> : null}
                </View>
              )}
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderStep4 = () => {
    const selectedIdLabel = PH_ID_TYPES.find(t => t.value === validId.idType)?.label;
    const uploadedPermits = permits.filter(p => p.uploadedUrl);
    return (
      <View>
        <Text style={styles.stepHeading}>Review & Submit</Text>
        <Text style={styles.stepSubheading}>Please review your information before submitting.</Text>
        <View style={styles.reviewCard}>
          <Text style={styles.reviewSection}>Business Information</Text>
          <ReviewRow icon="business-outline" label="Business Name" value={businessName} />
          <ReviewRow icon="location-outline" label="Address" value={`${businessAddress}, ${city}, ${province}`} />
          <ReviewRow icon="call-outline" label="Mobile" value={mobileNumber} />
          <ReviewRow icon="mail-outline" label="Email" value={businessEmail} />
          {serviceArea ? <ReviewRow icon="map-outline" label="Service Area" value={serviceArea} /> : null}
          {yearsExp ? <ReviewRow icon="time-outline" label="Experience" value={`${yearsExp} years`} /> : null}
        </View>
        <View style={styles.reviewCard}>
          <Text style={styles.reviewSection}>Service Category</Text>
          {selectedCategory ? (
            <View style={styles.catSelected}>
              <View style={[styles.catIcon, { backgroundColor: `${selectedCategory.color}20` }]}>
                <Ionicons name={selectedCategory.icon as React.ComponentProps<typeof Ionicons>['name']} size={20} color={selectedCategory.color} />
              </View>
              <Text style={styles.catSelectedName}>{selectedCategory.name}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.reviewCard}>
          <Text style={styles.reviewSection}>Documents</Text>
          {validId.front.uploadedUrl && (
            <View style={styles.docCheck}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
              <Text style={styles.docCheckText}>Valid ID (Front){selectedIdLabel ? ` — ${selectedIdLabel}` : ''}</Text>
            </View>
          )}
          {validId.back.uploadedUrl && (
            <View style={styles.docCheck}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
              <Text style={styles.docCheckText}>Valid ID (Back){selectedIdLabel ? ` — ${selectedIdLabel}` : ''}</Text>
            </View>
          )}
          {uploadedPermits.map(p => (
            <View key={p.key} style={styles.docCheck}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
              <Text style={styles.docCheckText}>{p.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.submitNote}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.primary} />
          <Text style={styles.submitNoteText}>
            Your application will be reviewed by our team within 1–3 business days. You'll be notified once approved.
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={styles.logoDot} />
          <Text style={styles.logoText}>ServiceHub</Text>
        </View>
        <Text style={styles.headerTitle}>Provider Application</Text>
      </View>
      {renderProgressBar()}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          <View style={{ height: SPACING.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={styles.footer}>
        {step > 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Ionicons name="arrow-back" size={18} color={COLORS.text} />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        )}
        {step < TOTAL_STEPS ? (
          <TouchableOpacity style={[styles.nextBtn, step === 1 && { flex: 1 }]} onPress={handleNext}>
            <Text style={styles.nextBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: COLORS.success }, submitting && styles.nextBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color={COLORS.white} />
              : <>
                  <Ionicons name="send" size={18} color={COLORS.white} />
                  <Text style={styles.nextBtnText}>Submit Application</Text>
                </>
            }
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

function ReviewRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.reviewRow}>
      <Ionicons name={icon as React.ComponentProps<typeof Ionicons>['name']} size={15} color={COLORS.primary} />
      <Text style={styles.reviewLabel}>{label}:</Text>
      <Text style={styles.reviewValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACING.md, paddingTop: SPACING.sm, paddingBottom: SPACING.xs },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  logoDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  logoText: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.primary },
  headerTitle: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text },
  progressContainer: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  stepItem: { alignItems: 'center', gap: 3 },
  stepCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  stepCircleActive: { backgroundColor: COLORS.primary },
  stepCircleDone: { backgroundColor: COLORS.success },
  stepNum: { fontSize: 12, fontWeight: '700', color: COLORS.textLight },
  stepNumActive: { color: COLORS.white },
  stepLabel: { fontSize: 9, fontWeight: '500', color: COLORS.textLight, textAlign: 'center', maxWidth: 55 },
  stepLabelActive: { color: COLORS.primary, fontWeight: '700' },
  stepLine: { flex: 1, height: 2, backgroundColor: COLORS.border, marginBottom: 14 },
  stepLineDone: { backgroundColor: COLORS.success },
  scroll: { flex: 1 },
  content: { padding: SPACING.md, gap: SPACING.sm },
  stepHeading: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  stepSubheading: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACING.md },
  rejectionBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: COLORS.errorLight, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: '#FECACA',
  },
  rejectionText: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.error, lineHeight: 20 },
  fieldWrap: { marginBottom: SPACING.sm },
  label: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text, marginBottom: 5 },
  input: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm, fontSize: FONTS.sizes.base, color: COLORS.text, height: 48,
  },
  inputMulti: { height: 100, paddingTop: SPACING.sm },
  row: { flexDirection: 'row', gap: SPACING.sm },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  catCard: {
    width: '47%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', gap: SPACING.sm, ...SHADOWS.small, position: 'relative',
  },
  catCardSelected: { backgroundColor: '#F5F3FF' },
  catIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  catName: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  catNameSelected: { color: COLORS.primary },
  catCheck: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  // Document sections
  docSection: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
    marginBottom: SPACING.md, ...SHADOWS.small,
  },
  docSectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.md },
  docSectionIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  docSectionTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  reqBadge: { fontSize: FONTS.sizes.xs, fontWeight: '600', color: COLORS.primary },
  docSectionNote: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, lineHeight: 16 },
  // Dropdown
  dropdown: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm, height: 48,
  },
  dropdownText: { fontSize: FONTS.sizes.base, color: COLORS.text, flex: 1 },
  dropdownPlaceholder: { color: COLORS.textLight },
  dropdownList: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, marginTop: 4,
    ...SHADOWS.medium, zIndex: 100,
  },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  dropdownItemSelected: { backgroundColor: COLORS.primaryLight },
  dropdownItemText: { fontSize: FONTS.sizes.sm, color: COLORS.text, flex: 1 },
  dropdownItemTextSel: { color: COLORS.primary, fontWeight: '600' },
  // ID sides (front/back)
  idSidesRow: { flexDirection: 'row', gap: SPACING.sm },
  idSideCol: { flex: 1 },
  idSideLabel: { fontSize: FONTS.sizes.xs, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  // Upload widgets
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, height: 44, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight,
  },
  uploadBtnText: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.primary },
  uploadHint: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  uploadStateRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.sm },
  uploadingText: { fontSize: FONTS.sizes.sm, color: COLORS.primary, fontWeight: '500' },
  uploadSuccessRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  docPreview: { width: 80, height: 64, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.surfaceSecondary },
  uploadSuccessInfo: { flex: 1, gap: 6 },
  uploadSuccessBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.successLight, borderRadius: BORDER_RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  uploadSuccessText: { fontSize: 11, fontWeight: '600', color: COLORS.success },
  uploadActions: { flexDirection: 'row', gap: SPACING.sm },
  replaceBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 8, borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  replaceBtnText: { fontSize: 11, fontWeight: '600', color: COLORS.primary },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 8, borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: '#FECACA', backgroundColor: COLORS.errorLight },
  removeBtnText: { fontSize: 11, fontWeight: '600', color: COLORS.error },
  uploadFailedBox: { backgroundColor: '#FFF7F7', borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: '#FECACA', padding: SPACING.sm, gap: SPACING.sm },
  uploadFailedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  uploadFailedText: { fontSize: FONTS.sizes.sm, color: COLORS.error, fontWeight: '600' },
  uploadFailedBtns: { flexDirection: 'row', gap: SPACING.sm },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.error },
  retryBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.white },
  errorMsg: { fontSize: FONTS.sizes.xs, color: COLORS.error, marginTop: 4, lineHeight: 16 },
  // Permit checklist
  permitRow: { borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm, overflow: 'hidden' },
  permitRowChecked: { borderColor: COLORS.primary },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.sm + 2 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  permitLabel: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text, fontWeight: '500' },
  permitLabelChecked: { color: COLORS.primary, fontWeight: '600' },
  smallSuccessBadge: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  permitUploadArea: { paddingHorizontal: SPACING.sm, paddingBottom: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm, backgroundColor: COLORS.background },
  // Review
  reviewCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.small },
  reviewSection: { fontSize: FONTS.sizes.xs, fontWeight: '700', color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: SPACING.sm },
  reviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, paddingVertical: 5 },
  reviewLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontWeight: '600', minWidth: 70 },
  reviewValue: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text },
  catSelected: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  catSelectedName: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  docCheck: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 4 },
  docCheckText: { fontSize: FONTS.sizes.sm, color: COLORS.text },
  submitNote: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: '#C7D2FE' },
  submitNoteText: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.primary, lineHeight: 20 },
  footer: { flexDirection: 'row', gap: SPACING.sm, padding: SPACING.md, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.md, borderRadius: BORDER_RADIUS.xl, borderWidth: 1.5, borderColor: COLORS.border },
  backBtnText: { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm + 2, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.primary, ...SHADOWS.small },
  nextBtnDisabled: { opacity: 0.6 },
  nextBtnText: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.white },
});
