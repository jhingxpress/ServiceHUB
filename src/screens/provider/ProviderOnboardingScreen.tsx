import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Image, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { toTitleCase } from '../../utils/formatting';
import { validateImagePickerAsset } from '../../utils/fileValidation';
import { useAuthStore } from '../../stores/authStore';
import { Category } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import ProviderVerificationPolicyModal from '../../components/modals/ProviderVerificationPolicyModal';
import TermsOfServiceModal from '../../components/modals/TermsOfServiceModal';
import PrivacyPolicyModal from '../../components/modals/PrivacyPolicyModal';


const MAX_FILE_SIZE = 1024 * 1024 * 1024;
const TOTAL_STEPS = 4;
const STEP_TITLES = ['Business', 'Category', 'Documents', 'Review'];

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
  { key: 'barangay_clearance',      label: 'Barangay Clearance' },
  { key: 'police_clearance',        label: 'Police Clearance' },
  { key: 'nbi_clearance',           label: 'NBI Clearance' },
  { key: 'tesda_certificate',       label: 'TESDA Certificate' },
  { key: 'nc_certificate',          label: 'NC II / NC III Certificate' },
  { key: 'prc_license',             label: 'PRC License' },
  { key: 'business_permit',         label: 'Business Permit' },
  { key: 'dti_registration',        label: 'DTI Registration' },
  { key: 'sec_registration',        label: 'SEC Registration' },
  { key: 'bir_registration',        label: 'BIR Certificate' },
  { key: 'employment_certificate',  label: 'Employment Certificate' },
  { key: 'professional_cert',       label: 'Other Professional Certificate' },
];

const CITY_SUGGESTIONS = [
  'Digos City','Mati City','Tagum City','Panabo City','Sta. Cruz','Bansalan','Hagonoy',
  'Davao City','General Santos City','Koronadal City','Kidapawan City','Malaybalay City',
  'Valencia City','Cagayan de Oro','Butuan City','Surigao City','Cebu City','Mandaue City',
  'Lapu-Lapu City','Tacloban City','Iloilo City','Bacolod City','Dumaguete City',
  'Manila','Quezon City','Caloocan','Pasig','Makati','Mandaluyong','San Juan',
  'Marikina','Pasay','Taguig','Parañaque','Las Piñas','Muntinlupa','Valenzuela',
  'Malabon','Navotas','San Jose del Monte','Meycauayan','Malolos','Angeles City',
  'Olongapo','Batangas City','Lipa City','Calamba','Santa Rosa','Biñan','Cabuyao',
  'San Pedro','Antipolo','Rodriguez','Cainta','Taytay','Binangonan','Angono',
  'Tagaytay','Dasmariñas','Imus','Bacoor','Kawit','Noveleta','General Trias',
  'Trece Martires','Naic','Tanza','Silang','Amadeo','Indang','Alfonso','Maragondon',
  'Magallanes','Ternate','Carmona','Gen. Mariano Alvarez','San Jose','Mabalacat',
  'Porac','Floridablanca','Guagua','Lubao','Sasmuan','Macabebe','Masantol','Apalit',
  'Calumpit','Hagonoy','Paombong','Baliuag','Pulilan','Plaridel','Bustos','San Miguel',
  'San Ildefonso','San Rafael','Angat','Norzagaray','Doña Remedios Trinidad','Bocaue',
  'Marilao','Obando','Santa Maria','Balagtas','Pandi','Bulakan','Meycauayan','Malolos',
];

const PROVINCE_SUGGESTIONS = [
  'Davao del Sur','Davao del Norte','Davao Oriental','Davao de Oro','Davao Occidental',
  'Bukidnon','Cotabato','South Cotabato','Sarangani','Maguindanao','Lanao del Norte',
  'Lanao del Sur','Misamis Oriental','Misamis Occidental','Camiguin','Surigao del Norte',
  'Surigao del Sur','Agusan del Norte','Agusan del Sur','Bukidnon','Basilan',
  'Cebu','Bohol','Negros Oriental','Siquijor','Iloilo','Guimaras','Aklan','Antique',
  'Capiz','Negros Occidental','Leyte','Southern Leyte','Biliran','Samar','Eastern Samar',
  'Northern Samar','Palawan','Romblon','Oriental Mindoro','Occidental Mindoro','Marinduque',
  'Quezon','Batangas','Cavite','Laguna','Rizal','Bulacan','Pampanga','Bataan','Zambales',
  'Tarlac','Nueva Ecija','Pangasinan','La Union','Benguet','Ifugao','Mountain Province',
  'Kalinga','Abra','Apayao','Ilocos Norte','Ilocos Sur','Isabela','Cagayan','Nueva Vizcaya',
  'Quirino','Batanes','Albay','Camarines Norte','Camarines Sur','Catanduanes','Masbate',
  'Sorsogon','Metro Manila',
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

  // Step 1 — GPS location
  const [providerLat, setProviderLat] = useState<number | null>(null);
  const [providerLng, setProviderLng] = useState<number | null>(null);
  const [detectingLoc, setDetectingLoc] = useState(false);

  // Step 2 — two-level category picker
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [catLoading, setCatLoading] = useState(true);
  const [catalogServices, setCatalogServices] = useState<string[]>([]);

  // Searchable suggestion dropdowns
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showProvinceDropdown, setShowProvinceDropdown] = useState(false);

  // Step 3 — documents
  const [validId, setValidId] = useState<ValidIdDoc>(INITIAL_VALID_ID);
  const [selfie, setSelfie] = useState<ValidIdSide>({ uri: null, uploadedUrl: null, state: 'idle', error: null });
  const [permits, setPermits] = useState<PermitDoc[]>(
    PERMIT_TYPES.map(p => ({ ...p, checked: false, uri: null, uploadedUrl: null, state: 'idle' as UploadState, error: null }))
  );

  // Step 4 — consent
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [verificationAccepted, setVerificationAccepted] = useState(false);
  const [showVerificationPolicy, setShowVerificationPolicy] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  useEffect(() => {
    (async () => {
      const cats = await loadCategories();
      await loadExistingData(cats);
    })();
  }, []);

  // Log categories state changes for debugging
  useEffect(() => {
    console.log('[Onboarding] Categories loaded:', categories.length, 'parents:', categories.filter(c => c.is_parent).map(c => ({ id: c.id, name: c.name })));
  }, [categories]);

  // Log selected category changes for debugging
  useEffect(() => {
    const selected = categories.find(c => c.id === selectedCategoryId);
    console.log('[Onboarding] selectedCategoryId:', selectedCategoryId, 'name:', selected?.name ?? 'NOT FOUND in categories');
  }, [selectedCategoryId, categories]);

  // Load suggested services from service_catalog when a category is selected on Step 2
  useEffect(() => {
    if (step === 2 && selectedCategoryId) {
      const selectedCat = categories.find(c => c.id === selectedCategoryId);
      console.log('[Catalog] selectedCategoryId:', selectedCategoryId);
      console.log('[Catalog] selectedCategoryName:', selectedCat?.name ?? 'UNKNOWN');
      supabase
        .from('service_catalog')
        .select('name')
        .eq('category_id', selectedCategoryId)
        .eq('is_active', true)
        .order('sort_order')
        .limit(6)
        .then(({ data, error }) => {
          console.log('[Catalog] result count:', data?.length ?? 0);
          console.log('[Catalog] services:', data);
          if (error) {
            console.error('[Catalog] Error:', error);
            setCatalogServices([]);
          } else {
            setCatalogServices(data?.map((item: { name: string }) => item.name) ?? []);
          }
        });
    } else {
      setCatalogServices([]);
    }
  }, [selectedCategoryId, step]);

  // Log catalogServices state after it updates
  useEffect(() => {
    console.log('[Catalog] catalogServices state:', catalogServices);
  }, [catalogServices]);

  // Debug log for Provider Verification Policy modal visibility
  useEffect(() => {
    console.log('[POLICY] Modal visible:', showVerificationPolicy);
  }, [showVerificationPolicy]);

  const loadCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('name');
    const cats = (data ?? []) as Category[];
    setCategories(cats);
    setCatLoading(false);
    return cats;
  };

  const loadExistingData = async (cats: Category[]) => {
    if (!user) return;
    console.log('[Onboarding] loadExistingData with', cats.length, 'categories');
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
      // Convert leaf category_id to parent for new onboarding UX
      console.log('[Onboarding] Provider category_id from DB:', data.category_id);
      const provCat = cats.find(c => c.id === data.category_id);
      console.log('[Onboarding] Mapped provCat:', provCat ? { id: provCat.id, name: provCat.name, is_parent: provCat.is_parent, parent_id: provCat.parent_id } : 'NOT FOUND');
      if (provCat?.is_parent) {
        setSelectedCategoryId(provCat.id);
        setSelectedParentId(provCat.id);
      } else if (provCat?.parent_id) {
        setSelectedCategoryId(provCat.parent_id);
        setSelectedParentId(provCat.parent_id);
      } else {
        setSelectedCategoryId(data.category_id ?? null);
      }
      setProviderLat(data.latitude ?? null);
      setProviderLng(data.longitude ?? null);
    }
    // Load existing provider category — convert leaf to parent for new onboarding UX
    const { data: pcData } = await supabase
      .from('provider_categories')
      .select('category_id')
      .eq('provider_id', user.id)
      .eq('is_primary', true)
      .single();
    if (pcData?.category_id) {
      console.log('[Onboarding] provider_categories category_id from DB:', pcData.category_id);
      const cat = cats.find(c => c.id === pcData.category_id);
      console.log('[Onboarding] Mapped provider_categories cat:', cat ? { id: cat.id, name: cat.name, is_parent: cat.is_parent, parent_id: cat.parent_id } : 'NOT FOUND');
      if (cat?.is_parent) {
        setSelectedCategoryId(cat.id);
        setSelectedParentId(cat.id);
      } else if (cat?.parent_id) {
        setSelectedCategoryId(cat.parent_id);
        setSelectedParentId(cat.parent_id);
      } else {
        setSelectedCategoryId(pcData.category_id);
      }
    }
    const { data: existingDocs } = await supabase
      .from('provider_documents').select('*').eq('provider_id', user.id);
    interface ProviderDoc {
      category_type?: string;
      document_type?: string;
      id_type?: string | null;
      side?: string;
      file_url?: string;
    }
    if (existingDocs?.length) {
      const docs = existingDocs as ProviderDoc[];
      const vidDocs = docs.filter((d) =>
        d.category_type === 'valid_id' || d.document_type === 'valid_id' || d.document_type === 'government_id'
      );
      if (vidDocs.length) {
        const idType = vidDocs[0].id_type ?? null;
        const front = vidDocs.find((d) => d.side === 'front');
        const back = vidDocs.find((d) => d.side === 'back');
        setValidId(prev => ({
          ...prev,
          idType,
          front: { uri: null, uploadedUrl: front?.file_url ?? null, state: front ? 'success' : 'idle', error: null },
          back: { uri: null, uploadedUrl: back?.file_url ?? null, state: back ? 'success' : 'idle', error: null },
        }));
      }
      const selfieDoc = docs.find((d) => d.document_type === 'selfie_with_id');
      if (selfieDoc?.file_url) {
        setSelfie({ uri: null, uploadedUrl: selfieDoc.file_url, state: 'success', error: null });
      }
      setPermits(prev => prev.map(p => {
        const ex = docs.find((d) => d.document_type === p.key);
        if (ex) return { ...p, checked: true, uploadedUrl: ex.file_url ?? null, state: 'success' as UploadState };
        return p;
      }));
    }
  };

  const handleDetectProviderLocation = async () => {
    setDetectingLoc(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is required to capture your business coordinates.\n\nLocation information may be used for bookings, navigation, fraud prevention, and platform security.'
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setProviderLat(loc.coords.latitude);
      setProviderLng(loc.coords.longitude);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to detect location.';
      Alert.alert('Location Error', message);
    } finally {
      setDetectingLoc(false);
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
    if (!validId.front.uploadedUrl) return 'Please capture the front of your Government ID.';
    if (!validId.back.uploadedUrl) return 'Please capture the back of your Government ID.';
    if (validId.front.state === 'uploading' || validId.back.state === 'uploading') return 'Please wait for your ID uploads to finish.';
    if (!selfie.uploadedUrl) return 'Please take a selfie holding your Government ID.';
    if (selfie.state === 'uploading') return 'Please wait for your selfie upload to finish.';
    const uploading = permits.find(p => p.checked && p.state === 'uploading');
    if (uploading) return 'Please wait for all uploads to finish.';
    const checkedNoFile = permits.find(p => p.checked && !p.uploadedUrl);
    if (checkedNoFile) return `Please upload your ${checkedNoFile.label} or uncheck it.`;
    if (!permits.some(p => p.uploadedUrl)) return 'Please upload at least one supporting document.';
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
    const validation = validateImagePickerAsset(asset, 'provider-documents');
    if (!validation.valid) {
      Alert.alert('Invalid Document', validation.error);
      return null;
    }
    return { uri: asset.uri, mimeType: getMimeType(asset.uri, asset.mimeType) };
  };

  const pickCamera = async (): Promise<{ uri: string; mimeType: string } | null> => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera Required', 'Please allow camera access. Government ID and selfie photos must be captured live for verification purposes.');
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return null;
    const asset = result.assets[0];
    const validation = validateImagePickerAsset(asset, 'provider-documents');
    if (!validation.valid) {
      Alert.alert('Invalid Document', validation.error);
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
      const { error: delError } = await supabase.from('provider_documents').delete()
        .eq('provider_id', user!.id).eq('document_type', 'valid_id').eq('side', side);
      if (delError) throw new Error(`Failed to replace existing document: ${delError.message}`);
      const { error: insError } = await supabase.from('provider_documents').insert({
        provider_id: user!.id, document_type: 'valid_id', category_type: 'valid_id',
        id_type: validId.idType, side, file_url: url, status: 'pending',
      });
      if (insError) throw new Error(`Failed to save document record: ${insError.message}`);
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
    const file = await pickCamera();
    if (!file) return;
    await doValidIdSideUpload(side, file.uri, file.mimeType);
  };

  const doSelfieUpload = async (uri: string, mimeType: string) => {
    const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${user!.id}/selfie_with_id_${Date.now()}.${ext}`;
    setSelfie(prev => ({ ...prev, uri, state: 'uploading', error: null }));
    try {
      const url = await uploadWithRetry(uri, path, mimeType);
      await supabase.from('provider_documents').delete()
        .eq('provider_id', user!.id).eq('document_type', 'selfie_with_id');
      const { error: insError } = await supabase.from('provider_documents').insert({
        provider_id: user!.id, document_type: 'selfie_with_id', category_type: 'valid_id',
        file_url: url, status: 'pending',
      });
      if (insError) throw new Error(`Failed to save document record: ${insError.message}`);
      setSelfie(prev => ({ ...prev, uploadedUrl: url, state: 'success', error: null }));
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : 'Network error. Please check your connection and try again.';
      setSelfie(prev => ({ ...prev, state: 'failed', error: msg }));
    }
  };

  const pickAndUploadSelfie = async () => {
    const file = await pickCamera();
    if (!file) return;
    await doSelfieUpload(file.uri, file.mimeType);
  };

  const retrySelfie = () => {
    if (selfie.uri) doSelfieUpload(selfie.uri, getMimeType(selfie.uri));
  };

  const removeSelfie = async () => {
    if (user) {
      await supabase.from('provider_documents').delete()
        .eq('provider_id', user.id).eq('document_type', 'selfie_with_id');
    }
    setSelfie({ uri: null, uploadedUrl: null, state: 'idle', error: null });
  };

  const retryValidIdSide = (side: 'front' | 'back') => {
    const sideData = validId[side];
    if (sideData.uri) doValidIdSideUpload(side, sideData.uri, getMimeType(sideData.uri));
  };

  const removeValidIdSide = async (side: 'front' | 'back') => {
    if (user) {
      const { error: delError } = await supabase.from('provider_documents').delete()
        .eq('provider_id', user.id).eq('document_type', 'valid_id').eq('side', side);
      if (delError) throw new Error(`Failed to remove document: ${delError.message}`);
    }
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
      const { error: delError } = await supabase.from('provider_documents').delete()
        .eq('provider_id', user!.id).eq('document_type', docKey);
      if (delError) throw new Error(`Failed to replace existing document: ${delError.message}`);
      const { error: insError } = await supabase.from('provider_documents').insert({
        provider_id: user!.id, document_type: docKey, category_type: 'permit_certificate',
        file_url: url, status: 'pending',
      });
      if (insError) throw new Error(`Failed to save document record: ${insError.message}`);
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
          if (user) {
            const { error: delError } = await supabase.from('provider_documents').delete()
              .eq('provider_id', user.id).eq('document_type', docKey);
            if (delError) throw new Error(`Failed to remove document: ${delError.message}`);
          }
          setPermits(prev => prev.map(p => p.key === docKey
            ? { ...p, uri: null, uploadedUrl: null, state: 'idle', error: null }
            : p));
        },
      },
    ]);
  };

  const handleSubmit = async () => {
    if (!termsAccepted || !verificationAccepted) {
      Alert.alert('Consent Required', 'Please read and agree to all required policies before submitting your application.');
      return;
    }
    setSubmitting(true);
    try {
      console.log('[ONBOARDING] Provider ID', user?.id);
      console.log('[ONBOARDING] Selected Category (parent)', selectedCategoryId);
      console.log('[ONBOARDING] Selected Category name', categories.find(c => c.id === selectedCategoryId)?.name);

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
        latitude: providerLat,
        longitude: providerLng,
        status: 'pending_review',
        accepted_verification_policy_at: new Date().toISOString(),
        accepted_terms_at: termsAccepted ? new Date().toISOString() : null,
        accepted_privacy_at: termsAccepted ? new Date().toISOString() : null,
      };

      const { error } = await supabase.from('providers').upsert(payload);

      if (error) {
        console.error('[ONBOARDING] Provider upsert error:', error.message);
        throw error;
      }
      console.log('[ONBOARDING] Provider upsert succeeded');

      // Insert / update provider_categories junction
      if (selectedCategoryId && user) {
        console.log('[ONBOARDING] Inserting provider_categories', {
          provider_id: user.id,
          category_id: selectedCategoryId,
        });
        await supabase.from('provider_categories').delete()
          .eq('provider_id', user.id).eq('is_primary', true);
        const { data: pcResult, error: pcErr } = await supabase.from('provider_categories').insert({
          provider_id: user.id,
          category_id: selectedCategoryId,
          is_primary: true,
        }).select();
        console.log('[ONBOARDING] Insert Result', { data: pcResult, error: pcErr?.message ?? null });
        if (pcErr) {
          console.error('[ONBOARDING] Insert Error', pcErr.message);
          Alert.alert('Warning', 'Provider profile saved, but category linking failed. Please contact support.');
        }
      } else {
        console.log('[ONBOARDING] Skipping provider_categories — no selectedCategoryId');
      }

      try {
        await refreshProviderProfile();
      } catch {
        // Don't throw on refresh error - submission succeeded
      }

      setSubmitting(false);
      Alert.alert(
        'Application Submitted',
        'Your provider application has been submitted for review. You will be notified once it is approved.',
        [{ text: 'OK' }]
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error. Please check your connection and try again.';
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
              <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{title}</Text>
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

  const renderSearchableField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    suggestions: string[],
    show: boolean,
    setShow: (v: boolean) => void,
    opts?: { placeholder?: string; keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric' }
  ) => {
    const filtered = value.trim()
      ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase())).slice(0, 6)
      : suggestions.slice(0, 6);
    return (
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>{label} *</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(t) => { onChange(t); setShow(true); }}
          onFocus={() => setShow(true)}
          placeholder={opts?.placeholder ?? label}
          placeholderTextColor={COLORS.textLight}
          keyboardType={opts?.keyboardType ?? 'default'}
          autoCapitalize="sentences"
        />
        {show && filtered.length > 0 && (
          <View style={styles.suggestionList}>
            {filtered.map(s => (
              <TouchableOpacity
                key={s}
                style={styles.suggestionItem}
                onPress={() => { onChange(s); setShow(false); }}
              >
                <Text style={styles.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

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
      {renderField('Business Name', businessName, setBusinessName, { placeholder: 'e.g. ABC Electrical Services, Juan\'s Repair Shop' })}
      {renderField('Business Address', businessAddress, setBusinessAddress, { placeholder: 'Street, Barangay' })}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          {renderSearchableField('City/Municipality', city, setCity, CITY_SUGGESTIONS, showCityDropdown, setShowCityDropdown, { placeholder: 'e.g. Digos City' })}
        </View>
        <View style={{ flex: 1 }}>
          {renderSearchableField('Province', province, setProvince, PROVINCE_SUGGESTIONS, showProvinceDropdown, setShowProvinceDropdown, { placeholder: 'e.g. Davao del Sur' })}
        </View>
      </View>
      {renderField('Mobile Number', mobileNumber, setMobileNumber, { placeholder: '0917 123 4567', keyboardType: 'phone-pad' })}
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
          {renderField('Service Area', serviceArea, setServiceArea, { placeholder: 'e.g. Metro Davao', required: false })}
        </View>
      </View>

      {/* GPS Location */}
      <View style={styles.fieldWrap}>
        <Text style={styles.label}>GPS Location (optional)</Text>
        <TouchableOpacity
          style={styles.locBtn}
          onPress={handleDetectProviderLocation}
          disabled={detectingLoc}
          activeOpacity={0.8}
        >
          {detectingLoc
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Ionicons name="locate-outline" size={18} color={COLORS.primary} />}
          <Text style={styles.locBtnText}>
            {detectingLoc ? 'Detecting...' : providerLat != null ? 'Update Location' : 'Use Current Location'}
          </Text>
        </TouchableOpacity>
        {providerLat != null && providerLng != null && (
          <View style={styles.locCaptured}>
            <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
            <Text style={styles.locCapturedText}>
              Captured — {providerLat.toFixed(5)}, {providerLng.toFixed(5)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const parentCategories = categories.filter(c => c.is_parent);

  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const res: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      res.push(arr.slice(i, i + size));
    }
    return res;
  };

  const renderStep2 = () => {
    const selectedParent = parentCategories.find(p => p.id === selectedCategoryId);
    const examples = catalogServices;
    console.log('[Catalog] renderStep2 examples:', examples, 'selectedParent:', selectedParent?.name ?? 'none');
    return (
      <View>
        <Text style={styles.stepHeading}>Select Primary Category</Text>
        <Text style={styles.stepSubheading}>Choose the category that best describes your business. You will create specific services later.</Text>
        {catLoading
          ? <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
          : (
            <View>
              {chunk(parentCategories, 2).map((row, rowIdx) => (
                <React.Fragment key={rowIdx}>
                  <View style={styles.catGridRow}>
                    {row.map(parent => {
                      const selected = parent.id === selectedCategoryId;
                      return (
                        <TouchableOpacity
                          key={parent.id}
                          style={[styles.catCard, selected && styles.catCardSelected, { borderColor: selected ? parent.color : COLORS.border }]}
                          onPress={() => { console.log('[Onboarding] Tapped category:', parent.name, 'id:', parent.id); setSelectedCategoryId(parent.id); setSelectedParentId(parent.id); }}
                          activeOpacity={0.8}
                        >
                          <View style={[styles.catIcon, { backgroundColor: selected ? parent.color : `${parent.color}20` }]}>
                            <Ionicons name={parent.icon as React.ComponentProps<typeof Ionicons>['name']} size={22} color={selected ? COLORS.white : parent.color} />
                          </View>
                          <Text style={[styles.catName, selected && styles.catNameSelected]} numberOfLines={2}>{toTitleCase(parent.name)}</Text>
                          {selected && (
                            <View style={[styles.catCheck, { backgroundColor: parent.color }]}>
                              <Ionicons name="checkmark" size={10} color={COLORS.white} />
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {row.some(p => p.id === selectedCategoryId) && selectedParent && (
                    <View style={[styles.examplesBox, { borderLeftColor: selectedParent.color, borderLeftWidth: 4 }]}>
                      <View style={styles.examplesHeader}>
                        <Ionicons name="information-circle-outline" size={16} color={selectedParent.color} />
                        <Text style={styles.examplesTitle}>{toTitleCase(selectedParent.name)}</Text>
                      </View>
                      <View style={styles.examplesRow}>
                        {examples.length > 0 ? examples.map(ex => (
                          <View key={ex} style={[styles.exampleChip, { backgroundColor: `${selectedParent.color}18` }]}>
                            <Text style={[styles.exampleChipText, { color: selectedParent.color }]}>{ex}</Text>
                          </View>
                        )) : (
                          <Text style={styles.examplesEmpty}>No suggested services available for this category yet.</Text>
                        )}
                      </View>
                      <Text style={styles.examplesNote}>You will create your actual services later in Manage Services.</Text>
                    </View>
                  )}
                </React.Fragment>
              ))}
            </View>
          )
        }
      </View>
    );
  };

  const renderUploadWidget = (
    state: UploadState,
    uploadedUrl: string | null,
    onPick: () => void,
    onRetry: () => void,
    onRemove: () => void,
    buttonLabel = 'Upload File',
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
        <Ionicons name={buttonLabel !== 'Upload File' ? 'camera-outline' : 'cloud-upload-outline'} size={16} color={COLORS.primary} />
        <Text style={styles.uploadBtnText}>{buttonLabel}</Text>
        <Text style={styles.uploadHint}>{buttonLabel !== 'Upload File' ? '(Camera only · JPG/PNG)' : '(JPG/PNG · max 1GB)'}</Text>
      </TouchableOpacity>
    );
  };

  const renderStep3 = () => {
    const selectedIdLabel = PH_ID_TYPES.find(t => t.value === validId.idType)?.label;
    return (
      <View>
        <Text style={styles.stepHeading}>Verification Documents</Text>
        <Text style={styles.stepSubheading}>All identity documents must be captured live with your camera. Supporting documents may use camera or gallery.</Text>

        {/* --- Verification Guide --- */}
        <View style={styles.verifyGuideCard}>
          <Image source={require('../../../assets/sample-photo.png')} style={styles.verifyGuideImage} resizeMode="contain" />
          <View style={styles.verifyGuideBody}>
            <Text style={styles.verifyGuideTitle}>Verification Requirements</Text>
            {['Government ID Front ✓', 'Government ID Back ✓', 'Selfie with ID ✓', 'At least 1 supporting document ✓'].map(r => (
              <Text key={r} style={styles.verifyGuideItem}>{r}</Text>
            ))}
            <Text style={styles.verifyGuideDivider}>Do NOT upload:</Text>
            {['Screenshots', 'Edited images', 'Memes / Anime images', 'Facebook photos', 'Random pictures'].map(r => (
              <Text key={r} style={styles.verifyGuideReject}>✗ {r}</Text>
            ))}
          </View>
        </View>

        {/* --- Section 1: Identity Verification --- */}
        <View style={styles.docSection}>
          <View style={styles.docSectionHeader}>
            <View style={styles.docSectionIcon}><Ionicons name="card-outline" size={16} color={COLORS.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.docSectionTitle}>Identity Verification <Text style={styles.reqBadge}>Required</Text></Text>
              <Text style={styles.docSectionNote}>Select one Philippine government-issued ID. Front, back, and selfie must be captured with your camera.</Text>
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
              <View style={styles.idSideLabelRow}>
                <Text style={styles.idSideLabel}>Front</Text>
                <View style={styles.cameraBadge}><Ionicons name="camera" size={10} color={COLORS.white} /><Text style={styles.cameraBadgeText}>Camera</Text></View>
              </View>
              {renderUploadWidget(
                validId.front.state,
                validId.front.uploadedUrl,
                () => pickAndUploadValidIdSide('front'),
                () => retryValidIdSide('front'),
                () => removeValidIdSide('front'),
                'Take Photo',
              )}
              {validId.front.state === 'failed' && validId.front.error
                ? <Text style={styles.errorMsg}>{validId.front.error}</Text> : null}
            </View>
            <View style={styles.idSideCol}>
              <View style={styles.idSideLabelRow}>
                <Text style={styles.idSideLabel}>Back</Text>
                <View style={styles.cameraBadge}><Ionicons name="camera" size={10} color={COLORS.white} /><Text style={styles.cameraBadgeText}>Camera</Text></View>
              </View>
              {renderUploadWidget(
                validId.back.state,
                validId.back.uploadedUrl,
                () => pickAndUploadValidIdSide('back'),
                () => retryValidIdSide('back'),
                () => removeValidIdSide('back'),
                'Take Photo',
              )}
              {validId.back.state === 'failed' && validId.back.error
                ? <Text style={styles.errorMsg}>{validId.back.error}</Text> : null}
            </View>
          </View>

          {/* Selfie with ID */}
          <View style={styles.selfieSection}>
            <View style={styles.idSideLabelRow}>
              <Text style={styles.idSideLabel}>Selfie Holding Your ID</Text>
              <View style={styles.cameraBadge}><Ionicons name="camera" size={10} color={COLORS.white} /><Text style={styles.cameraBadgeText}>Camera Required</Text></View>
            </View>
            <Text style={styles.selfieHint}>Hold your open ID next to your face. Ensure both your face and ID are clearly visible.</Text>
            {renderUploadWidget(
              selfie.state,
              selfie.uploadedUrl,
              pickAndUploadSelfie,
              retrySelfie,
              removeSelfie,
              'Take Selfie',
            )}
            {selfie.state === 'failed' && selfie.error
              ? <Text style={styles.errorMsg}>{selfie.error}</Text> : null}
          </View>
        </View>

        {/* --- Section 2: Professional Verification --- */}
        <View style={styles.docSection}>
          <View style={styles.docSectionHeader}>
            <View style={styles.docSectionIcon}><Ionicons name="document-text-outline" size={16} color={COLORS.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.docSectionTitle}>
                Professional Verification <Text style={styles.reqBadge}>At least 1</Text>
              </Text>
              <Text style={styles.docSectionNote}>Upload at least one supporting document. Camera or gallery accepted.</Text>
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
          {providerLat != null && providerLng != null
            ? <ReviewRow icon="navigate-outline" label="GPS" value={`${providerLat.toFixed(5)}, ${providerLng.toFixed(5)}`} />
            : null}
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
          {selfie.uploadedUrl && (
            <View style={styles.docCheck}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
              <Text style={styles.docCheckText}>Selfie with ID</Text>
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

        {/* Consent Section */}
        <View style={styles.consentCard}>
          <Text style={styles.consentTitle}>Legal Consent</Text>

          <View style={styles.consentRow}>
            <TouchableOpacity
              onPress={() => setTermsAccepted(prev => !prev)}
              activeOpacity={0.8}
              style={styles.consentCheckboxTouch}
            >
              <View style={[styles.consentCheckbox, termsAccepted && styles.consentCheckboxChecked]}>
                {termsAccepted && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
              </View>
            </TouchableOpacity>
            <Text style={styles.consentText}>
              I have read and agree to the{' '}
              <Text style={styles.consentLink} onPress={() => setShowTerms(true)}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={styles.consentLink} onPress={() => setShowPrivacy(true)}>Privacy Policy</Text>.
            </Text>
          </View>

          <View style={styles.consentRow}>
            <TouchableOpacity
              onPress={() => setVerificationAccepted(prev => !prev)}
              activeOpacity={0.8}
              style={styles.consentCheckboxTouch}
            >
              <View style={[styles.consentCheckbox, verificationAccepted && styles.consentCheckboxChecked]}>
                {verificationAccepted && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
              </View>
            </TouchableOpacity>
            <Text style={styles.consentText}>
              I agree to the{' '}
              <Text
                style={styles.consentLink}
                onPress={() => {
                  console.log('[POLICY] Provider Verification Policy pressed');
                  setShowVerificationPolicy(true);
                }}
              >
                Provider Verification Policy
              </Text>
              {' '}and certify that all submitted information and documents are accurate and belong to me or my business.
            </Text>
          </View>
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
            style={[
              styles.nextBtn,
              { backgroundColor: COLORS.success },
              (submitting || !termsAccepted || !verificationAccepted) && styles.nextBtnDisabled,
            ]}
            onPress={handleSubmit}
            disabled={submitting || !termsAccepted || !verificationAccepted}
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
      <ProviderVerificationPolicyModal visible={showVerificationPolicy} onClose={() => setShowVerificationPolicy(false)} />
      <TermsOfServiceModal visible={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicyModal visible={showPrivacy} onClose={() => setShowPrivacy(false)} />
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
  logoText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.primary },
  headerTitle: { fontSize: FONTS.sizes.xxl, fontFamily: FONTS.bold, color: COLORS.text },
  progressContainer: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  stepItem: { alignItems: 'center', gap: 3 },
  stepCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  stepCircleActive: { backgroundColor: COLORS.primary },
  stepCircleDone: { backgroundColor: COLORS.success },
  stepNum: { fontSize: 12, fontFamily: FONTS.semiBold, color: COLORS.textLight },
  stepNumActive: { color: COLORS.white },
  stepLabel: { fontSize: 10, fontFamily: FONTS.medium, color: COLORS.textLight, textAlign: 'center', maxWidth: 72 },
  stepLabelActive: { color: COLORS.primary, fontFamily: FONTS.semiBold },
  stepLine: { flex: 1, height: 2, backgroundColor: COLORS.border, marginBottom: 14 },
  stepLineDone: { backgroundColor: COLORS.success },
  scroll: { flex: 1 },
  content: { padding: SPACING.md, gap: SPACING.sm },
  stepHeading: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text, marginBottom: 4 },
  stepSubheading: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACING.md },
  rejectionBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: COLORS.errorLight, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: '#FECACA',
  },
  rejectionText: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.error, lineHeight: 20 },
  fieldWrap: { marginBottom: SPACING.sm },
  label: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: 5 },
  input: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm, fontSize: FONTS.sizes.base, color: COLORS.text, height: 48,
  },
  inputMulti: { height: 100, paddingTop: SPACING.sm },
  row: { flexDirection: 'row', gap: SPACING.sm },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  catGridRow: { flexDirection: 'row', gap: SPACING.sm, width: '100%' },
  catCard: {
    width: '47%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', gap: SPACING.xs, ...SHADOWS.small, position: 'relative',
  },
  catCardSelected: { backgroundColor: '#F5F3FF' },
  catIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  catName: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, textAlign: 'center' },
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
  docSectionTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: 2 },
  reqBadge: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.primary },
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
  dropdownItemTextSel: { color: COLORS.primary, fontFamily: FONTS.semiBold },
  // ID sides (front/back)
  idSidesRow: { flexDirection: 'row', gap: SPACING.sm },
  idSideCol: { flex: 1 },
  idSideLabel: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: 6 },
  // Upload widgets
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, height: 44, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight,
  },
  uploadBtnText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.primary },
  uploadHint: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  uploadStateRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.sm },
  uploadingText: { fontSize: FONTS.sizes.sm, color: COLORS.primary, fontFamily: FONTS.medium },
  uploadSuccessRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  docPreview: { width: 80, height: 64, borderRadius: BORDER_RADIUS.md, backgroundColor: COLORS.surfaceSecondary },
  uploadSuccessInfo: { flex: 1, gap: 6 },
  uploadSuccessBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.successLight, borderRadius: BORDER_RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  uploadSuccessText: { fontSize: 11, fontFamily: FONTS.semiBold, color: COLORS.success },
  uploadActions: { flexDirection: 'row', gap: SPACING.sm },
  replaceBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 8, borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  replaceBtnText: { fontSize: 11, fontFamily: FONTS.semiBold, color: COLORS.primary },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 8, borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: '#FECACA', backgroundColor: COLORS.errorLight },
  removeBtnText: { fontSize: 11, fontFamily: FONTS.semiBold, color: COLORS.error },
  uploadFailedBox: { backgroundColor: '#FFF7F7', borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: '#FECACA', padding: SPACING.sm, gap: SPACING.sm },
  uploadFailedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  uploadFailedText: { fontSize: FONTS.sizes.sm, color: COLORS.error, fontFamily: FONTS.semiBold },
  uploadFailedBtns: { flexDirection: 'row', gap: SPACING.sm },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.error },
  retryBtnText: { fontSize: 11, fontFamily: FONTS.semiBold, color: COLORS.white },
  errorMsg: { fontSize: FONTS.sizes.xs, color: COLORS.error, marginTop: 4, lineHeight: 16 },
  // Permit checklist
  permitRow: { borderRadius: BORDER_RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm, overflow: 'hidden' },
  permitRowChecked: { borderColor: COLORS.primary },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, padding: SPACING.sm + 2 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  permitLabel: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text, fontFamily: FONTS.medium },
  permitLabelChecked: { color: COLORS.primary, fontFamily: FONTS.semiBold },
  smallSuccessBadge: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  permitUploadArea: { paddingHorizontal: SPACING.sm, paddingBottom: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: SPACING.sm, backgroundColor: COLORS.background },
  // Review
  reviewCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.sm, ...SHADOWS.small },
  reviewSection: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: SPACING.sm },
  reviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, paddingVertical: 5 },
  reviewLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontFamily: FONTS.semiBold, minWidth: 70 },
  reviewValue: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text },
  catSelected: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  catSelectedName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  docCheck: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 4 },
  docCheckText: { fontSize: FONTS.sizes.sm, color: COLORS.text },
  submitNote: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: '#C7D2FE' },
  submitNoteText: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.primary, lineHeight: 20 },
  consentCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, marginBottom: SPACING.md, ...SHADOWS.small },
  consentTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.sm },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
  consentCheckboxTouch: { padding: 2, margin: -2 },
  consentCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    marginTop: 2,
  },
  consentCheckboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  consentText: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
  consentLink: { color: COLORS.primary, fontFamily: FONTS.semiBold },
  footer: { flexDirection: 'row', gap: SPACING.sm, padding: SPACING.md, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.md, borderRadius: BORDER_RADIUS.xl, borderWidth: 1.5, borderColor: COLORS.border },
  backBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm + 2, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.primary, ...SHADOWS.small },
  nextBtnDisabled: { opacity: 0.6 },
  nextBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.white },
  backToParents: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  backToParentsText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.primary },
  locBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: 11, backgroundColor: COLORS.primaryLight,
  },
  locBtnText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.primary },
  locCaptured: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: COLORS.successLight, borderRadius: BORDER_RADIUS.md,
  },
  locCapturedText: { fontSize: FONTS.sizes.xs, color: COLORS.success, fontFamily: FONTS.medium },
  suggestionList: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 4,
    ...SHADOWS.medium,
    zIndex: 100,
    maxHeight: 200,
  },
  suggestionItem: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  suggestionText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
  },
  examplesBox: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginTop: SPACING.sm,
    ...SHADOWS.small,
  },
  examplesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  examplesTitle: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
  },
  examplesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  exampleChip: {
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  exampleChipText: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.medium,
  },
  examplesNote: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
    fontStyle: 'italic',
  },
  examplesEmpty: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  verifyGuideCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: '#EFF6FF', borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: '#BFDBFE', padding: SPACING.sm, marginBottom: SPACING.md,
  },
  verifyGuideImage: { width: 80, height: 80, borderRadius: BORDER_RADIUS.md },
  verifyGuideBody: { flex: 1 },
  verifyGuideTitle: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.bold, color: COLORS.text, marginBottom: 4 },
  verifyGuideItem: { fontSize: FONTS.sizes.xs, color: COLORS.success, fontFamily: FONTS.medium },
  verifyGuideDivider: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.error, marginTop: 4, marginBottom: 2 },
  verifyGuideReject: { fontSize: FONTS.sizes.xs, color: COLORS.error },
  idSideLabelRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: 4 },
  cameraBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.full, paddingHorizontal: 5, paddingVertical: 2 },
  cameraBadgeText: { fontSize: 9, fontFamily: FONTS.bold, color: COLORS.white },
  selfieSection: { marginTop: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  selfieHint: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginBottom: SPACING.xs },
});
