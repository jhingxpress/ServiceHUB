import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import { AdminStackParamList } from '../../navigation/types';

type RouteType = RouteProp<AdminStackParamList, 'CustomerKYCDetail'>;

interface KYCUser {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  kyc_status: string;
  kyc_documents: Record<string, string>;
  kyc_rejection_reason: string | null;
  created_at: string;
}

const DOC_LABELS: Record<string, string> = {
  id_front: 'Government ID (Front)',
  id_back: 'Government ID (Back)',
  selfie: 'Selfie with ID',
};

export default function CustomerKYCDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteType>();
  const { userId } = route.params;
  const [user, setUser] = useState<KYCUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [processing, setProcessing] = useState(false);

  const fetchUser = useCallback(async () => {
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email, phone, avatar_url, kyc_status, kyc_documents, kyc_rejection_reason, created_at')
      .eq('id', userId)
      .single();
    setUser(data as KYCUser);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const handleApprove = () => {
    Alert.alert('Approve KYC', `Approve KYC for ${user?.full_name ?? user?.email}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          setProcessing(true);
          await supabase.from('users').update({ kyc_status: 'approved', kyc_rejection_reason: null }).eq('id', userId);
          setProcessing(false);
          Alert.alert('Approved', 'Customer KYC has been approved.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        },
      },
    ]);
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      Alert.alert('Required', 'Please provide a rejection reason.');
      return;
    }
    setProcessing(true);
    await supabase.from('users').update({
      kyc_status: 'rejected',
      kyc_rejection_reason: rejectionReason.trim(),
    }).eq('id', userId);
    setProcessing(false);
    Alert.alert('Rejected', 'Customer KYC has been rejected.', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!user) return null;

  const docs = user.kyc_documents ?? {};
  const isActionable = user.kyc_status === 'pending';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Customer KYC</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* User Info */}
        <View style={styles.userCard}>
          <Avatar uri={user.avatar_url} name={user.full_name ?? user.email} size={56} />
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user.full_name ?? 'Unknown'}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
            {user.phone && <Text style={styles.userPhone}>{user.phone}</Text>}
          </View>
          <View style={[styles.statusBadge, {
            backgroundColor: user.kyc_status === 'approved' ? COLORS.success + '20'
              : user.kyc_status === 'rejected' ? COLORS.error + '20'
              : '#F59E0B20',
          }]}>
            <Text style={[styles.statusBadgeText, {
              color: user.kyc_status === 'approved' ? COLORS.success
                : user.kyc_status === 'rejected' ? COLORS.error
                : '#F59E0B',
            }]}>{user.kyc_status}</Text>
          </View>
        </View>

        {/* Rejection reason if any */}
        {user.kyc_status === 'rejected' && user.kyc_rejection_reason && (
          <View style={styles.rejectionCard}>
            <Ionicons name="close-circle" size={18} color={COLORS.error} />
            <Text style={styles.rejectionText}>{user.kyc_rejection_reason}</Text>
          </View>
        )}

        {/* Documents */}
        <Text style={styles.sectionTitle}>Submitted Documents</Text>
        {Object.keys(docs).length === 0 ? (
          <Text style={styles.noDocs}>No documents submitted.</Text>
        ) : (
          Object.entries(docs).map(([key, uri]) => (
            <View key={key} style={styles.docCard}>
              <Text style={styles.docLabel}>{DOC_LABELS[key] ?? key}</Text>
              <Image source={{ uri }} style={styles.docImage} resizeMode="cover" />
            </View>
          ))
        )}

        {/* Actions */}
        {isActionable && !showRejectInput && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => setShowRejectInput(true)}
              disabled={processing}
            >
              <Ionicons name="close-circle-outline" size={20} color={COLORS.error} />
              <Text style={[styles.actionBtnText, { color: COLORS.error }]}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn]}
              onPress={handleApprove}
              disabled={processing}
            >
              {processing ? <ActivityIndicator color={COLORS.white} size="small" /> : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.white} />
                  <Text style={[styles.actionBtnText, { color: COLORS.white }]}>Approve</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Reject form */}
        {showRejectInput && (
          <View style={styles.rejectForm}>
            <Text style={styles.rejectFormTitle}>Reason for Rejection</Text>
            <TextInput
              style={styles.rejectInput}
              placeholder="Explain why the KYC is being rejected..."
              placeholderTextColor={COLORS.textLight}
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
              numberOfLines={3}
            />
            <View style={styles.rejectFormActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowRejectInput(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmRejectBtn} onPress={handleReject} disabled={processing}>
                {processing ? <ActivityIndicator color={COLORS.white} size="small" /> : (
                  <Text style={styles.confirmRejectText}>Confirm Reject</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: SPACING.md, paddingBottom: SPACING.xxl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.lg },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md, ...SHADOWS.small },
  userInfo: { flex: 1 },
  userName: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  userEmail: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  userPhone: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  statusBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.full },
  statusBadgeText: { fontSize: FONTS.sizes.xs, fontWeight: '700', textTransform: 'capitalize' },
  rejectionCard: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, backgroundColor: COLORS.error + '10', borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.error + '30', marginBottom: SPACING.md },
  rejectionText: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.error, lineHeight: 18 },
  sectionTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  noDocs: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: SPACING.lg },
  docCard: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, overflow: 'hidden', marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  docLabel: { padding: SPACING.sm, fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  docImage: { width: '100%', height: 200 },
  actions: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.lg },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl, ...SHADOWS.small },
  approveBtn: { backgroundColor: COLORS.success },
  rejectBtn: { backgroundColor: COLORS.error + '15', borderWidth: 1, borderColor: COLORS.error + '40' },
  actionBtnText: { fontSize: FONTS.sizes.base, fontWeight: '700' },
  rejectForm: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, marginTop: SPACING.lg },
  rejectFormTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  rejectInput: { backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, fontSize: FONTS.sizes.base, color: COLORS.text, minHeight: 80, textAlignVertical: 'top', marginBottom: SPACING.md },
  rejectFormActions: { flexDirection: 'row', gap: SPACING.md },
  cancelBtn: { flex: 1, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  cancelBtnText: { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.textSecondary },
  confirmRejectBtn: { flex: 1, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.error, alignItems: 'center' },
  confirmRejectText: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.white },
});
