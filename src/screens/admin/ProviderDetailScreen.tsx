import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, TextInput, Linking, Image,
  Modal, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { AdminStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { adminSuspendProvider } from '../../services/moderationService';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';

// Extract the object path from a full Supabase storage public URL
const extractStoragePath = (fullUrl: string): { bucket: string; path: string } | null => {
  if (!fullUrl) return null;
  // Try provider-documents bucket
  let marker = '/provider-documents/';
  let idx = fullUrl.indexOf(marker);
  if (idx !== -1) {
    return { bucket: 'provider-documents', path: fullUrl.slice(idx + marker.length) };
  }
  // Try kyc-documents bucket (legacy ProviderApplicationScreen uploads)
  marker = '/kyc-documents/';
  idx = fullUrl.indexOf(marker);
  if (idx !== -1) {
    return { bucket: 'kyc-documents', path: fullUrl.slice(idx + marker.length) };
  }
  // If already a relative path, assume provider-documents bucket
  if (!fullUrl.startsWith('http')) return { bucket: 'provider-documents', path: fullUrl };
  return null;
};

type Props = NativeStackScreenProps<AdminStackParamList, 'ProviderDetail'>;

interface ProviderDetailData {
  id: string;
  business_name: string | null;
  business_address: string | null;
  city: string | null;
  province: string | null;
  business_email: string | null;
  business_phone: string | null;
  service_description: string | null;
  service_area: string | null;
  years_of_experience: number | null;
  status: string;
  is_verified: boolean;
  is_featured: boolean;
  featured_until: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  users: { full_name: string | null; email: string | null; phone: string | null; avatar_url: string | null };
  category: { name: string; icon: string } | null;
  services: { id: string; name: string; price: number; is_active: boolean }[];
  kyc_documents: Record<string, string> | null;
}

interface DocRecord {
  id: string;
  document_type: string;
  category_type: string;
  id_type: string | null;
  side: string | null;
  file_url: string;
  status: string;
  uploaded_at: string;
}

interface FeaturedPaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  paymongo_checkout_id: string | null;
  paymongo_payment_id: string | null;
  checkout_url: string | null;
  paid_at: string | null;
  created_at: string;
}

interface LogEntry {
  id: string;
  action: string;
  notes: string | null;
  created_at: string;
  performer: { full_name: string | null } | null;
}

const DOC_LABELS: Record<string, string> = {
  valid_id: 'Valid ID',
  government_id: 'Government ID',
  barangay_clearance: 'Barangay Clearance',
  business_permit: 'Business Permit',
  dti_registration: 'DTI Registration',
  bir_registration: 'BIR Registration',
  tesda_certificate: 'TESDA Certificate',
  professional_cert: 'Professional Cert',
  other_supporting: 'Other Supporting Document',
};

const ID_TYPE_LABELS: Record<string, string> = {
  philippine_national_id: 'Philippine National ID',
  drivers_license: 'Driver\'s License',
  passport: 'Passport',
  umid: 'UMID',
  postal_id: 'Postal ID',
  voters_id: 'Voter\'s ID',
  sss_id: 'SSS ID',
  philhealth_id: 'PhilHealth ID',
  tin_id: 'TIN ID',
};

// Convert legacy kyc_documents JSON blob into DocRecord format for unified display
const KYC_DOC_TYPE_MAP: Record<string, { document_type: string; category_type: string; side: string | null }> = {
  gov_id_front: { document_type: 'valid_id', category_type: 'valid_id', side: 'front' },
  gov_id_back: { document_type: 'valid_id', category_type: 'valid_id', side: 'back' },
  selfie_with_id: { document_type: 'selfie_with_id', category_type: 'valid_id', side: null },
  business_permit: { document_type: 'business_permit', category_type: 'business_permit', side: null },
  certifications: { document_type: 'other_supporting', category_type: 'other_supporting', side: null },
};

const convertKycDocs = (kyc: Record<string, string> | null): DocRecord[] => {
  if (!kyc) return [];
  return Object.entries(kyc)
    .filter(([, url]) => !!url)
    .map(([field, url]) => {
      const mapped = KYC_DOC_TYPE_MAP[field] || { document_type: field, category_type: 'other_supporting', side: null };
      return {
        id: `kyc-${field}`,
        document_type: mapped.document_type,
        category_type: mapped.category_type,
        id_type: null,
        side: mapped.side,
        file_url: url,
        status: 'pending',
        uploaded_at: new Date().toISOString(),
      };
    });
};

const getDocumentLabel = (doc: DocRecord): string => {
  if (doc.category_type === 'valid_id' && doc.id_type) {
    const idLabel = ID_TYPE_LABELS[doc.id_type] || doc.id_type;
    return `${idLabel} (${doc.side === 'front' ? 'Front' : 'Back'})`;
  }
  return DOC_LABELS[doc.document_type] || doc.document_type;
};

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  draft: { label: 'Draft', bg: COLORS.surfaceSecondary, color: COLORS.textLight },
  pending_review: { label: 'Pending Review', bg: COLORS.warningLight, color: '#92400E' },
  approved: { label: 'Approved', bg: COLORS.successLight, color: '#065F46' },
  rejected: { label: 'Rejected', bg: COLORS.errorLight, color: '#991B1B' },
  suspended: { label: 'Suspended', bg: COLORS.errorLight, color: '#991B1B' },
};

export default function ProviderDetailScreen({ route, navigation }: Props) {
  const { providerId } = route.params;
  const { user } = useAuthStore();
  const [provider, setProvider] = useState<ProviderDetailData | null>(null);
  const [documents, setDocuments] = useState<DocRecord[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<'approve' | 'reject' | 'suspend' | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [rejectingRequest, setRejectingRequest] = useState(false);
  const [featuredPayment, setFeaturedPayment] = useState<FeaturedPaymentRecord | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [processingDoc, setProcessingDoc] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [provRes, docsRes, logsRes, featReqRes, featPayRes] = await Promise.all([
        supabase.from('providers').select(`
          id, business_name, business_address, city, province, business_email, business_phone,
          service_description, service_area, years_of_experience, status, is_verified, is_featured, featured_until,
          rejection_reason, created_at, updated_at,
          users!providers_id_fkey(full_name, email, phone, avatar_url),
          category:categories(name, icon),
          services(id, name, price, is_active),
          kyc_documents
        `).eq('id', providerId).single(),
        supabase.from('provider_documents').select('*').eq('provider_id', providerId).order('uploaded_at'),
        supabase.from('provider_verification_logs').select(`
          id, action, notes, created_at,
          performer:users!provider_verification_logs_performed_by_fkey(full_name)
        `).eq('provider_id', providerId).order('created_at', { ascending: false }),
        supabase.from('featured_requests').select('id').eq('provider_id', providerId).eq('status', 'pending').maybeSingle(),
        supabase
          .from('featured_payments')
          .select('id, amount, currency, status, paymongo_checkout_id, paymongo_payment_id, checkout_url, paid_at, created_at')
          .eq('provider_id', providerId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (provRes.error) throw provRes.error;

      const tableDocs = (docsRes.data ?? []) as DocRecord[];
      const rawKyc = (provRes.data as any)?.kyc_documents ?? null;
      const kycDocs = convertKycDocs(rawKyc);
      const allDocs = [...tableDocs, ...kycDocs];

      setProvider(provRes.data as unknown as ProviderDetailData);
      setDocuments(allDocs);
      setLogs((logsRes.data ?? []) as unknown as LogEntry[]);
      setHasPendingRequest(!!featReqRes.data);
      setFeaturedPayment((featPayRes as { data: FeaturedPaymentRecord | null }).data ?? null);

      // Generate signed URLs for private bucket images
      const urlMap: Record<string, string> = {};
      await Promise.all(
        allDocs.map(async (doc) => {
          const extracted = extractStoragePath(doc.file_url);
          if (extracted) {
            const { data: signedData } = await supabase.storage
              .from(extracted.bucket)
              .createSignedUrl(extracted.path, 3600);
            if (signedData?.signedUrl) {
              urlMap[doc.id] = signedData.signedUrl;
            }
          }
        })
      );
      setSignedUrls(urlMap);
    } catch (err: any) {
      console.error('[ProviderDetail] loadData error:', err?.message ?? err);
      setError(err?.message ?? 'Failed to load provider details');
    } finally {
      setLoading(false);
    }
  };

  const rejectFeaturedRequest = async () => {
    setRejectingRequest(true);
    try {
      const { error } = await supabase
        .from('featured_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('provider_id', providerId)
        .eq('status', 'pending');
      if (error) throw error;
      setHasPendingRequest(false);
      // Notify provider of rejection (non-fatal)
      try {
        const { data: prov } = await supabase
          .from('providers')
          .select('user_id')
          .eq('id', providerId)
          .single();
        if (prov?.user_id) {
          await supabase.from('notifications').insert({
            user_id: prov.user_id,
            type: 'system',
            title: 'Featured Request Not Approved',
            body: 'Your request for Featured Provider status was not approved at this time. You may resubmit after resolving any outstanding issues.',
            data: { type: 'featured_rejected', providerId },
          });
        }
      } catch (notifyErr) {
        console.warn('[rejectFeaturedRequest] Notification failed (non-fatal):', notifyErr);
      }
      Alert.alert('Done', 'Featured request rejected.');
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to reject request.');
    } finally {
      setRejectingRequest(false);
    }
  };

  const approveFeaturedRequest = async () => {
    if (!provider) return;
    setFeaturedLoading(true);
    const base = (provider.featured_until && new Date(provider.featured_until) > new Date())
      ? new Date(provider.featured_until)
      : new Date();
    base.setDate(base.getDate() + 30);
    const featuredUntil = base.toISOString();
    try {
      const { error } = await supabase
        .from('providers')
        .update({ is_featured: true, featured_until: featuredUntil })
        .eq('id', providerId);
      if (error) throw error;
      await supabase.from('provider_verification_logs').insert({
        provider_id: providerId,
        action: 'featured_enabled',
        performed_by: user?.id ?? null,
        notes: `Featured until ${featuredUntil.slice(0, 10)} (request approved)`,
      });
      await supabase
        .from('featured_requests')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('provider_id', providerId)
        .eq('status', 'pending');
      setHasPendingRequest(false);
      setProvider((p) => p ? { ...p, is_featured: true, featured_until: featuredUntil } : p);
      try {
        await supabase.functions.invoke('notify-featured-approved', {
          body: { provider_id: providerId, featured_until: featuredUntil },
        });
      } catch (notifyErr) {
        console.warn('[approveFeaturedRequest] Notification failed (non-fatal):', notifyErr);
      }
      Alert.alert('Approved', `Featured status granted until ${featuredUntil.slice(0, 10)}.`);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to approve featured request.');
    } finally {
      setFeaturedLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [providerId]);

  const handleDocAction = async (docId: string, action: 'approved' | 'rejected' | 'pending') => {
    setProcessingDoc(docId);
    try {
      const { error } = await supabase
        .from('provider_documents')
        .update({ status: action, reviewed_at: new Date().toISOString(), reviewed_by: user?.id })
        .eq('id', docId);
      if (error) throw error;
      // Insert notification log
      await supabase.from('provider_verification_logs').insert({
        provider_id: providerId,
        action: `doc_${action}`,
        performed_by: user?.id ?? null,
      });
      await loadData();
    } catch (err) {
      console.error('[ProviderDetail] Doc action error:', err);
      Alert.alert('Error', 'Failed to update document status');
    }
    setProcessingDoc(null);
  };

  const performAction = async () => {
    if (!actionMode) return;
    if ((actionMode === 'reject' || actionMode === 'suspend') && !actionNotes.trim()) {
      Alert.alert('Required', 'Please enter a reason.'); return;
    }

    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (actionMode === 'approve') {
        updates.status = 'approved'; updates.is_verified = true; updates.is_available = true;
        updates.approved_at = new Date().toISOString(); updates.approved_by = user?.id;
        updates.rejection_reason = null;
      } else if (actionMode === 'reject') {
        updates.status = 'rejected'; updates.is_verified = false;
        updates.rejected_by = user?.id;
        updates.rejection_reason = actionNotes.trim();
      } else if (actionMode === 'suspend') {
        const result = await adminSuspendProvider(providerId, actionNotes.trim());
        if (!result.success) throw new Error(result.error ?? 'Suspend failed');
        // Best-effort: preserve UI-facing rejection_reason field
        await supabase
          .from('providers')
          .update({ rejection_reason: actionNotes.trim() })
          .eq('id', providerId);
      }

      if (actionMode !== 'suspend') {
        const { error: updateError } = await supabase
          .from('providers')
          .update(updates)
          .eq('id', providerId);

        if (updateError) throw updateError;
      }

      await supabase.from('provider_verification_logs').insert({
        provider_id: providerId, action: actionMode,
        performed_by: user?.id ?? null, notes: actionNotes.trim() || null,
      });

      const completedAction = actionMode;
      setActionMode(null); setActionNotes('');
      await loadData();
      if (completedAction === 'approve') {
        setShowSuccessModal(true);
      }
    } catch (err) {
      Alert.alert('Error', 'Action failed. Please try again.');
    }
    finally { setSaving(false); }
  };

  const toggleFeatured = async () => {
    if (!provider) return;
    setFeaturedLoading(true);
    const newValue = !provider.is_featured;
    const updates: Record<string, unknown> = { is_featured: newValue };
    if (newValue) {
      // Preserve remaining time: if the provider still has active days remaining,
      // extend from the current expiry rather than from now.
      // Example: expires July 30, renewed July 20 → new expiry August 29 (not August 19).
      const base = (provider.featured_until && new Date(provider.featured_until) > new Date())
        ? new Date(provider.featured_until)
        : new Date();
      base.setDate(base.getDate() + 30);
      updates.featured_until = base.toISOString();
    } else {
      updates.featured_until = null;
    }
    try {
      const { error } = await supabase.from('providers').update(updates).eq('id', providerId);
      if (error) throw error;
      await supabase.from('provider_verification_logs').insert({
        provider_id: providerId,
        action: newValue ? 'featured_enabled' : 'featured_disabled',
        performed_by: user?.id ?? null,
        notes: newValue ? `Featured until ${(updates.featured_until as string).slice(0, 10)}` : 'Featured status removed',
      });
      if (newValue) {
        await supabase
          .from('featured_requests')
          .update({ status: 'approved', updated_at: new Date().toISOString() })
          .eq('provider_id', providerId)
          .eq('status', 'pending');
        setHasPendingRequest(false);
        // Notify provider of approval — non-fatal if push fails
        try {
          await supabase.functions.invoke('notify-featured-approved', {
            body: {
              provider_id:   providerId,
              featured_until: updates.featured_until as string,
            },
          });
        } catch (notifyErr) {
          console.warn('[toggleFeatured] Approval notification failed (non-fatal):', notifyErr);
        }
      }
      setProvider((p) => p ? { ...p, is_featured: newValue, featured_until: (updates.featured_until as string | null) } : p);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to update featured status');
    } finally {
      setFeaturedLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />
      </SafeAreaView>
    );
  }
  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  if (!provider) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="person-outline" size={48} color={COLORS.textLight} />
          <Text style={styles.emptyTitle}>Provider not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusCfg = STATUS_CFG[provider.status] ?? STATUS_CFG.draft;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Provider Review</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <Avatar uri={provider.users?.avatar_url} name={provider.users?.full_name} size={64} borderColor={COLORS.primary} />
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{provider.business_name ?? provider.users?.full_name ?? 'Provider'}</Text>
            <Text style={styles.sub}>{provider.users?.full_name} · {provider.category?.name ?? 'No category'}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
            </View>
            {provider.is_featured && (
              <View style={[styles.statusBadge, { backgroundColor: COLORS.warningLight, marginTop: 4 }]}>
                <Ionicons name="sparkles" size={12} color={COLORS.warning} />
                <Text style={[styles.statusBadgeText, { color: '#92400E', marginLeft: 4 }]}>
                  Featured{provider.featured_until ? ` · Until ${format(new Date(provider.featured_until), 'MMM d, yyyy')}` : ''}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Rejection reason if rejected */}
        {provider.rejection_reason ? (
          <View style={styles.reasonBox}>
            <Ionicons name="alert-circle" size={16} color={COLORS.error} />
            <Text style={styles.reasonText}>Reason: {provider.rejection_reason}</Text>
          </View>
        ) : null}

        {/* Business info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Business Information</Text>
          <View style={styles.infoCard}>
            {[
              { icon: 'business-outline', label: 'Business Name', value: provider.business_name },
              { icon: 'location-outline', label: 'Address', value: [provider.business_address, provider.city, provider.province].filter(Boolean).join(', ') },
              { icon: 'call-outline', label: 'Phone', value: provider.business_phone },
              { icon: 'mail-outline', label: 'Email', value: provider.business_email },
              { icon: 'person-outline', label: 'Owner', value: provider.users?.full_name },
              { icon: 'mail-outline', label: 'Account Email', value: provider.users?.email },
              { icon: 'time-outline', label: 'Experience', value: provider.years_of_experience ? `${provider.years_of_experience} years` : null },
              { icon: 'map-outline', label: 'Service Area', value: provider.service_area },
            ].filter(r => r.value).map((row, i, arr) => (
              <React.Fragment key={row.label}>
                <View style={styles.infoRow}>
                  <Ionicons name={row.icon as React.ComponentProps<typeof Ionicons>['name']} size={15} color={COLORS.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>{row.label}</Text>
                    <Text style={styles.infoValue}>{row.value}</Text>
                  </View>
                </View>
                {i < arr.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
            {provider.service_description ? (
              <>
                <View style={styles.divider} />
                <View style={styles.infoRow}>
                  <Ionicons name="document-text-outline" size={15} color={COLORS.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Description</Text>
                    <Text style={styles.infoValue}>{provider.service_description}</Text>
                  </View>
                </View>
              </>
            ) : null}
          </View>
        </View>

        {/* Featured Payment Details */}
        {featuredPayment && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Featured Payment</Text>
            <View style={styles.infoCard}>
              {[
                {
                  icon: 'cash-outline',
                  label: 'Amount',
                  value: `${featuredPayment.currency} ${Number(featuredPayment.amount).toFixed(2)}`,
                },
                {
                  icon: 'ellipse-outline',
                  label: 'Payment Status',
                  value: featuredPayment.status.toUpperCase(),
                },
                {
                  icon: 'calendar-outline',
                  label: 'Initiated',
                  value: format(new Date(featuredPayment.created_at), 'MMM d, yyyy h:mm a'),
                },
                featuredPayment.paid_at
                  ? {
                      icon: 'checkmark-circle-outline',
                      label: 'Paid At',
                      value: format(new Date(featuredPayment.paid_at), 'MMM d, yyyy h:mm a'),
                    }
                  : null,
                featuredPayment.paymongo_checkout_id
                  ? {
                      icon: 'receipt-outline',
                      label: 'Checkout Ref',
                      value: featuredPayment.paymongo_checkout_id,
                    }
                  : null,
                featuredPayment.paymongo_payment_id
                  ? {
                      icon: 'card-outline',
                      label: 'Payment Ref',
                      value: featuredPayment.paymongo_payment_id,
                    }
                  : null,
              ]
                .filter(Boolean)
                .map((row: any, i, arr) => (
                  <React.Fragment key={row.label}>
                    <View style={styles.infoRow}>
                      <Ionicons
                        name={row.icon as React.ComponentProps<typeof Ionicons>['name']}
                        size={15}
                        color={
                          row.label === 'Payment Status'
                            ? featuredPayment.status === 'paid'
                              ? COLORS.success
                              : featuredPayment.status === 'failed' || featuredPayment.status === 'refunded'
                              ? COLORS.error
                              : COLORS.warning
                            : COLORS.primary
                        }
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.infoLabel}>{row.label}</Text>
                        <Text
                          style={[
                            styles.infoValue,
                            row.label === 'Payment Status' && {
                              color:
                                featuredPayment.status === 'paid'
                                  ? COLORS.success
                                  : featuredPayment.status === 'failed' || featuredPayment.status === 'refunded'
                                  ? COLORS.error
                                  : COLORS.warning,
                              fontFamily: FONTS.semiBold,
                            },
                          ]}
                        >
                          {row.value}
                        </Text>
                      </View>
                    </View>
                    {i < arr.length - 1 && <View style={styles.divider} />}
                  </React.Fragment>
                ))}
            </View>
          </View>
        )}

        {/* Verification Checklist */}
        <View style={styles.verifyChecklst}>
          <Text style={styles.verifyChecklstTitle}>Verification Checklist</Text>
          <View style={styles.verifyChecklstRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.verifyChecklstSub}>Required</Text>
              {['Government ID Front', 'Government ID Back', 'Selfie with ID', 'At least 1 supporting document'].map(r => (
                <Text key={r} style={styles.verifyChecklstPass}>✓ {r}</Text>
              ))}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.verifyChecklstSub}>Reject if</Text>
              {['Screenshots / Memes', 'Anime / Facebook photos', 'Random pictures', 'Unreadable / blurry', 'Missing ID info'].map(r => (
                <Text key={r} style={styles.verifyChecklstFail}>✗ {r}</Text>
              ))}
            </View>
          </View>
        </View>

        {/* Documents */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Documents ({documents.length})</Text>
          {documents.length === 0
            ? <Text style={styles.emptyText}>No documents uploaded yet.</Text>
            : documents.map(doc => {
              const resolvedUrl = signedUrls[doc.id] ?? doc.file_url;
              return (
              <View key={doc.id} style={styles.docCard}>
                <TouchableOpacity style={styles.docRow} onPress={() => {
                  setPreviewImage(resolvedUrl);
                }}>
                  <Image
                    source={{ uri: resolvedUrl }}
                    style={styles.docThumbnail}
                    resizeMode="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docType}>{getDocumentLabel(doc)}</Text>
                    <Text style={styles.docDate}>Uploaded {format(new Date(doc.uploaded_at), 'MMM d, yyyy')}</Text>
                  </View>
                  <View style={[styles.docStatus, {
                    backgroundColor: doc.status === 'approved' ? COLORS.successLight : doc.status === 'rejected' ? COLORS.errorLight : COLORS.warningLight,
                  }]}>
                    <Text style={[styles.docStatusText, {
                      color: doc.status === 'approved' ? '#065F46' : doc.status === 'rejected' ? '#991B1B' : '#92400E',
                    }]}>{doc.status}</Text>
                  </View>
                  <Ionicons name="expand-outline" size={18} color={COLORS.primary} />
                </TouchableOpacity>
                {processingDoc === doc.id ? (
                  <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.sm }} />
                ) : (
                  <View style={styles.docActions}>
                    {doc.status !== 'approved' && (
                      <TouchableOpacity
                        style={[styles.docActionBtn, { backgroundColor: COLORS.successLight, borderColor: COLORS.success }]}
                        onPress={() => handleDocAction(doc.id, 'approved')}
                      >
                        <Ionicons name="checkmark" size={14} color={COLORS.success} />
                        <Text style={[styles.docActionText, { color: COLORS.success }]}>Approve</Text>
                      </TouchableOpacity>
                    )}
                    {doc.status !== 'rejected' && (
                      <TouchableOpacity
                        style={[styles.docActionBtn, { backgroundColor: COLORS.errorLight, borderColor: COLORS.error }]}
                        onPress={() => handleDocAction(doc.id, 'rejected')}
                      >
                        <Ionicons name="close" size={14} color={COLORS.error} />
                        <Text style={[styles.docActionText, { color: COLORS.error }]}>Reject</Text>
                      </TouchableOpacity>
                    )}
                    {doc.status !== 'pending' && (
                      <TouchableOpacity
                        style={[styles.docActionBtn, { backgroundColor: COLORS.warningLight, borderColor: COLORS.warning }]}
                        onPress={() => handleDocAction(doc.id, 'pending')}
                      >
                        <Ionicons name="refresh" size={14} color={COLORS.warning} />
                        <Text style={[styles.docActionText, { color: COLORS.warning }]}>Resubmit</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
            })
          }
        </View>

        {/* Action form */}
        {actionMode ? (
          <View style={styles.actionForm}>
            <Text style={styles.actionFormTitle}>
              {actionMode === 'approve' ? 'Approve Provider' : actionMode === 'reject' ? 'Reject Application' : 'Suspend Provider'}
            </Text>
            <TextInput
              style={styles.actionFormInput}
              value={actionNotes}
              onChangeText={setActionNotes}
              placeholder={actionMode === 'approve' ? 'Optional notes...' : 'Enter reason (required)...'}
              placeholderTextColor={COLORS.textLight}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={styles.actionFormBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setActionMode(null); setActionNotes(''); }}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: actionMode === 'approve' ? COLORS.success : COLORS.error }, saving && styles.disabledBtn]}
                onPress={performAction}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={COLORS.white} size="small" />
                  : <Text style={styles.confirmBtnText}>Confirm {actionMode.charAt(0).toUpperCase() + actionMode.slice(1)}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.actionsSection}>
            <Text style={styles.sectionTitle}>Actions</Text>
            <View style={styles.actionGrid}>
              {provider.status !== 'approved' && (
                <TouchableOpacity style={styles.approveBtn} onPress={() => setActionMode('approve')}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
                  <Text style={styles.approveBtnText}>Approve</Text>
                </TouchableOpacity>
              )}
              {(provider.status === 'pending_review' || provider.status === 'draft') && (
                <TouchableOpacity style={styles.rejectBtn} onPress={() => setActionMode('reject')}>
                  <Ionicons name="close-circle" size={18} color={COLORS.error} />
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>
              )}
              {provider.status === 'approved' && (
                <TouchableOpacity style={styles.rejectBtn} onPress={() => setActionMode('suspend')}>
                  <Ionicons name="ban-outline" size={18} color={COLORS.error} />
                  <Text style={styles.rejectBtnText}>Suspend</Text>
                </TouchableOpacity>
              )}
              {!hasPendingRequest && (
                <TouchableOpacity
                  style={[styles.featuredBtn, provider.is_featured && styles.featuredBtnActive]}
                  onPress={toggleFeatured}
                  disabled={featuredLoading}
                >
                  {featuredLoading ? (
                    <ActivityIndicator size="small" color={provider.is_featured ? COLORS.warning : COLORS.primary} />
                  ) : (
                    <>
                      <Ionicons name={provider.is_featured ? 'sparkles' : 'sparkles-outline'} size={18} color={provider.is_featured ? COLORS.warning : COLORS.primary} />
                      <Text style={[styles.featuredBtnText, provider.is_featured && styles.featuredBtnTextActive]}>
                        {provider.is_featured ? 'Featured On' : 'Feature Provider'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
            {hasPendingRequest && (
              <View style={[styles.actionGrid, { marginTop: SPACING.sm }]}>
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={approveFeaturedRequest}
                  disabled={featuredLoading}
                >
                  {featuredLoading ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={18} color={COLORS.white} />
                      <Text style={styles.approveBtnText}>Approve Featured</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={rejectFeaturedRequest}
                  disabled={rejectingRequest}
                >
                  {rejectingRequest ? (
                    <ActivityIndicator size="small" color={COLORS.error} />
                  ) : (
                    <>
                      <Ionicons name="close-circle-outline" size={18} color={COLORS.error} />
                      <Text style={styles.rejectBtnText}>Reject Featured</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Verification log */}
        {logs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Verification Log</Text>
            {logs.map(log => (
              <View key={log.id} style={styles.logRow}>
                <View style={[styles.logDot, {
                  backgroundColor: log.action === 'approved' ? COLORS.success : log.action === 'rejected' || log.action === 'suspended' ? COLORS.error : COLORS.primary,
                }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.logAction}>{log.action.charAt(0).toUpperCase() + log.action.slice(1)}</Text>
                  {log.notes ? <Text style={styles.logNotes}>{log.notes}</Text> : null}
                  <Text style={styles.logMeta}>
                    {log.performer?.full_name ?? 'System'} · {format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      {/* Image Preview Modal */}
      <Modal
        visible={!!previewImage}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
        statusBarTranslucent
      >
        <View style={styles.previewOverlay}>
          {previewImage ? (
            <Image
              source={{ uri: previewImage }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Ionicons name="image-outline" size={48} color={COLORS.textLight} />
              <Text style={styles.previewPlaceholderText}>No image available</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.previewClose}
            onPress={() => setPreviewImage(null)}
          >
            <Ionicons name="close" size={28} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Approval Success Modal */}
      <Modal
        visible={showSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSuccessModal(false)}
        statusBarTranslucent
      >
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={56} color={COLORS.success} />
            </View>
            <Text style={styles.successTitle}>Provider Approved</Text>
            <Text style={styles.successBody}>
              {provider?.business_name ?? provider?.users?.full_name ?? 'Provider'} has been approved and can now offer services on ServiceHub.
            </Text>
            <View style={styles.successActions}>
              <TouchableOpacity
                style={[styles.successBtn, styles.successBtnSecondary]}
                onPress={() => setShowSuccessModal(false)}
              >
                <Text style={styles.successBtnSecondaryText}>Review Details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.successBtn, styles.successBtnPrimary]}
                onPress={() => {
                  setShowSuccessModal(false);
                  navigation.goBack();
                }}
              >
                <Text style={styles.successBtnPrimaryText}>Back to Pending Providers</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.md },
  errorText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.medium, color: COLORS.error, textAlign: 'center', marginTop: SPACING.md },
  retryBtn: { marginTop: SPACING.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.xl },
  retryBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.white },
  emptyTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.textLight, marginTop: SPACING.md },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  content: { padding: SPACING.md, gap: SPACING.md },
  profileCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  profileInfo: { flex: 1, gap: 3 },
  name: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.text },
  sub: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  statusBadge: { alignSelf: 'flex-start', borderRadius: BORDER_RADIUS.full, paddingHorizontal: 10, paddingVertical: 4, marginTop: 4 },
  statusBadgeText: { fontSize: 12, fontFamily: FONTS.semiBold },
  reasonBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: COLORS.errorLight, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, borderWidth: 1, borderColor: '#FECACA',
  },
  reasonText: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.error, lineHeight: 20 },
  section: { gap: 0 },
  actionsSection: { gap: SPACING.sm },
  sectionTitle: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: SPACING.sm },
  infoCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, padding: SPACING.md },
  infoLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginBottom: 2 },
  infoValue: { fontSize: FONTS.sizes.sm, color: COLORS.text, fontFamily: FONTS.medium, lineHeight: 20 },
  divider: { height: 1, backgroundColor: COLORS.border, marginHorizontal: SPACING.md },
  emptyText: { fontSize: FONTS.sizes.sm, color: COLORS.textLight, fontStyle: 'italic' },
  docRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  docThumbnail: {
    width: 56, height: 56, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surfaceSecondary,
  },
  docType: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  docDate: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 2 },
  docStatus: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: 8, paddingVertical: 3 },
  docStatusText: { fontSize: 11, fontFamily: FONTS.semiBold },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center',
  },
  previewClose: {
    position: 'absolute', top: 50, right: 20,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  previewImage: {
    width: Dimensions.get('window').width * 0.9,
    height: Dimensions.get('window').height * 0.75,
  },
  previewPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.md },
  previewPlaceholderText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.medium, color: COLORS.textLight },
  actionForm: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, gap: SPACING.md, ...SHADOWS.small,
  },
  actionFormTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.text },
  actionFormInput: {
    backgroundColor: COLORS.surfaceSecondary, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
    fontSize: FONTS.sizes.base, color: COLORS.text, minHeight: 80,
  },
  actionFormBtns: { flexDirection: 'row', gap: SPACING.sm },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  cancelBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  confirmBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl, ...SHADOWS.small,
  },
  confirmBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.white },
  disabledBtn: { opacity: 0.6 },
  actionGrid: { flexDirection: 'row', gap: SPACING.sm },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.success, ...SHADOWS.small,
  },
  approveBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.white },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.errorLight, borderWidth: 1, borderColor: '#FECACA',
  },
  rejectBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.error },
  featuredBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.warningLight, borderWidth: 1, borderColor: '#FEF3C7',
  },
  featuredBtnActive: { backgroundColor: COLORS.warningLight, borderColor: COLORS.warning },
  featuredBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.warning },
  featuredBtnTextActive: { color: '#92400E' },
  docCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  docActions: {
    flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm,
    paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  docActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.xs + 2, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
  },
  docActionText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, paddingVertical: SPACING.sm },
  logDot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  logAction: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  logNotes: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2, lineHeight: 20 },
  logMeta: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 3 },
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  successCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: SPACING.md,
    ...SHADOWS.large,
  },
  successIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.successLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  successTitle: {
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'center',
  },
  successBody: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  successActions: {
    width: '100%',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  successBtn: {
    width: '100%',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBtnPrimary: {
    backgroundColor: COLORS.success,
    ...SHADOWS.small,
  },
  successBtnPrimaryText: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.white,
  },
  successBtnSecondary: {
    backgroundColor: COLORS.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  successBtnSecondaryText: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
  },
  verifyChecklst: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    backgroundColor: '#FFF7ED', borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: '#FED7AA', padding: SPACING.sm,
  },
  verifyChecklstTitle: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.bold, color: '#92400E', marginBottom: SPACING.xs },
  verifyChecklstRow: { flexDirection: 'row', gap: SPACING.sm },
  verifyChecklstSub: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: 3 },
  verifyChecklstPass: { fontSize: FONTS.sizes.xs, color: COLORS.success },
  verifyChecklstFail: { fontSize: FONTS.sizes.xs, color: COLORS.error },
});
