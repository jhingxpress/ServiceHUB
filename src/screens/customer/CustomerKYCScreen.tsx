import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Button from '../../components/ui/Button';

type KYCStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected';

interface KYCDocs {
  id_front?: string;
  id_back?: string;
  selfie?: string;
}

const STATUS_CONFIG: Record<KYCStatus, { label: string; color: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  not_submitted: { label: 'Not Submitted', color: COLORS.textLight, icon: 'document-outline' },
  pending: { label: 'Under Review', color: '#F59E0B', icon: 'time-outline' },
  approved: { label: 'Verified', color: COLORS.success, icon: 'shield-checkmark' },
  rejected: { label: 'Rejected', color: COLORS.error, icon: 'close-circle' },
};

export default function CustomerKYCScreen() {
  const navigation = useNavigation();
  const { user, refreshProfile } = useAuthStore();
  const [status, setStatus] = useState<KYCStatus>('not_submitted');
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [docs, setDocs] = useState<KYCDocs>({});
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchKYCStatus = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('users')
      .select('kyc_status, kyc_documents, kyc_rejection_reason')
      .eq('id', user.id)
      .single();
    if (data) {
      setStatus((data.kyc_status as KYCStatus) ?? 'not_submitted');
      setDocs(data.kyc_documents ?? {});
      setRejectionReason(data.kyc_rejection_reason ?? null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchKYCStatus(); }, [fetchKYCStatus]);

  const pickImage = async (field: keyof KYCDocs) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(true);
    const uri = result.assets[0].uri;
    const ext = uri.split('.').pop() ?? 'jpg';
    const path = `kyc/${user?.id}/${field}.${ext}`;

    const response = await fetch(uri);
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from('kyc-documents')
      .upload(path, blob, { upsert: true, contentType: `image/${ext}` });

    if (error) {
      Alert.alert('Upload Failed', error.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from('kyc-documents').getPublicUrl(path);
    setDocs((prev) => ({ ...prev, [field]: urlData.publicUrl }));
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!docs.id_front || !docs.id_back || !docs.selfie) {
      Alert.alert('Incomplete', 'Please upload all required documents before submitting.');
      return;
    }

    const { error } = await supabase
      .from('users')
      .update({ kyc_status: 'pending', kyc_documents: docs })
      .eq('id', user?.id);

    if (error) {
      Alert.alert('Error', 'Failed to submit KYC. Please try again.');
      return;
    }

    await refreshProfile();
    setStatus('pending');
    Alert.alert('Submitted!', 'Your KYC documents have been submitted for review. We\'ll notify you once verified.');
  };

  const statusConfig = STATUS_CONFIG[status];

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Identity Verification</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusConfig.color + '15', borderColor: statusConfig.color + '40' }]}>
          <Ionicons name={statusConfig.icon} size={28} color={statusConfig.color} />
          <View style={styles.statusText}>
            <Text style={[styles.statusLabel, { color: statusConfig.color }]}>{statusConfig.label}</Text>
            {status === 'pending' && <Text style={styles.statusSub}>Your documents are being reviewed. This usually takes 1-2 business days.</Text>}
            {status === 'approved' && <Text style={styles.statusSub}>Your identity has been verified. You can now book services.</Text>}
            {status === 'rejected' && <Text style={styles.statusSub}>{rejectionReason ?? 'Your submission was rejected. Please resubmit with valid documents.'}</Text>}
            {status === 'not_submitted' && <Text style={styles.statusSub}>Submit your documents to unlock booking features.</Text>}
          </View>
        </View>

        {/* Why KYC */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Why do we need this?</Text>
          <Text style={styles.infoText}>Identity verification helps us maintain a safe and trusted platform for all users. Your documents are encrypted and never shared without your consent.</Text>
        </View>

        {/* Document Upload Section */}
        {(status === 'not_submitted' || status === 'rejected') && (
          <>
            <Text style={styles.sectionTitle}>Required Documents</Text>

            <DocUpload
              label="Government ID (Front)"
              description="Clear photo of the front of your valid government-issued ID"
              icon="card-outline"
              imageUri={docs.id_front}
              onPress={() => pickImage('id_front')}
              uploading={uploading}
            />

            <DocUpload
              label="Government ID (Back)"
              description="Clear photo of the back of your valid government-issued ID"
              icon="card-outline"
              imageUri={docs.id_back}
              onPress={() => pickImage('id_back')}
              uploading={uploading}
            />

            <DocUpload
              label="Selfie with ID"
              description="A clear selfie holding your ID next to your face"
              icon="camera-outline"
              imageUri={docs.selfie}
              onPress={() => pickImage('selfie')}
              uploading={uploading}
            />

            <View style={styles.tips}>
              <Text style={styles.tipsTitle}>Tips for a successful submission:</Text>
              {['Ensure documents are clear and not blurry', 'All text must be readable', 'No glare or shadows on documents', 'Use a recent government-issued ID'].map((tip) => (
                <View key={tip} style={styles.tipRow}>
                  <Ionicons name="checkmark-circle" size={14} color={COLORS.success} />
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>

            <Button
              title={status === 'rejected' ? 'Resubmit Documents' : 'Submit for Verification'}
              onPress={handleSubmit}
              fullWidth
              size="lg"
              style={styles.submitBtn}
              disabled={uploading}
            />
          </>
        )}

        {/* Uploaded docs preview if pending */}
        {status === 'pending' && docs.id_front && (
          <>
            <Text style={styles.sectionTitle}>Submitted Documents</Text>
            {docs.id_front && <SubmittedDoc label="Government ID (Front)" uri={docs.id_front} />}
            {docs.id_back && <SubmittedDoc label="Government ID (Back)" uri={docs.id_back} />}
            {docs.selfie && <SubmittedDoc label="Selfie with ID" uri={docs.selfie} />}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DocUpload({ label, description, icon, imageUri, onPress, uploading }: {
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  imageUri?: string;
  onPress: () => void;
  uploading: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.docCard, imageUri ? styles.docCardUploaded : null]} onPress={onPress} disabled={uploading} activeOpacity={0.8}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.docPreview} />
      ) : (
        <View style={styles.docPlaceholder}>
          <Ionicons name={icon} size={32} color={COLORS.primary} />
        </View>
      )}
      <View style={styles.docInfo}>
        <View style={styles.docLabelRow}>
          <Text style={styles.docLabel}>{label}</Text>
          {imageUri ? (
            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
          ) : (
            <Ionicons name="cloud-upload-outline" size={18} color={COLORS.primary} />
          )}
        </View>
        <Text style={styles.docDesc}>{description}</Text>
        <Text style={[styles.docAction, { color: imageUri ? COLORS.success : COLORS.primary }]}>
          {imageUri ? 'Tap to replace' : 'Tap to upload'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function SubmittedDoc({ label, uri }: { label: string; uri: string }) {
  return (
    <View style={styles.submittedDoc}>
      <Image source={{ uri }} style={styles.submittedImage} />
      <Text style={styles.submittedLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  statusBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, padding: SPACING.md, borderRadius: BORDER_RADIUS.xl, borderWidth: 1, marginBottom: SPACING.md },
  statusText: { flex: 1 },
  statusLabel: { fontSize: FONTS.sizes.base, fontWeight: '700', marginBottom: 4 },
  statusSub: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 18 },
  infoCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg },
  infoTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.xs },
  infoText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
  sectionTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  docCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed', marginBottom: SPACING.md, ...SHADOWS.small },
  docCardUploaded: { borderStyle: 'solid', borderColor: COLORS.success + '60' },
  docPlaceholder: { width: 64, height: 64, borderRadius: BORDER_RADIUS.lg, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  docPreview: { width: 64, height: 64, borderRadius: BORDER_RADIUS.lg },
  docInfo: { flex: 1 },
  docLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  docLabel: { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  docDesc: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginBottom: 4, lineHeight: 16 },
  docAction: { fontSize: FONTS.sizes.xs, fontWeight: '600' },
  tips: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.lg },
  tipsTitle: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginBottom: 6 },
  tipText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  submitBtn: { marginBottom: SPACING.xl },
  submittedDoc: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, overflow: 'hidden', marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  submittedImage: { width: '100%', height: 180 },
  submittedLabel: { padding: SPACING.sm, fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
});
