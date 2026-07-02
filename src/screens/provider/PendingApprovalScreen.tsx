import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

export default function PendingApprovalScreen() {
  const { user, providerProfile, refreshProviderProfile, signOut } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);

  const status = providerProfile?.status ?? 'pending_review';

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshProviderProfile();
    setRefreshing(false);
  };

  const handleEditApplication = async () => {
    if (!user) return;
    setEditing(true);
    try {
      await supabase.from('providers')
        .update({ status: 'draft' })
        .eq('id', user.id);
      await refreshProviderProfile();
    } catch {
      Alert.alert('Error', 'Could not re-open your application. Please try again.');
      setEditing(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const CONFIG: Record<string, {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    iconColor: string;
    iconBg: string;
    title: string;
    subtitle: string;
    badgeLabel: string;
    badgeBg: string;
    badgeText: string;
  }> = {
    pending_review: {
      icon: 'hourglass-outline',
      iconColor: COLORS.warning,
      iconBg: COLORS.warningLight,
      title: 'Application Under Review',
      subtitle: 'Our team is reviewing your information and documents. This usually takes 1–3 business days.',
      badgeLabel: 'Pending Verification',
      badgeBg: COLORS.warningLight,
      badgeText: '#92400E',
    },
    rejected: {
      icon: 'close-circle-outline',
      iconColor: COLORS.error,
      iconBg: COLORS.errorLight,
      title: 'Application Not Approved',
      subtitle: 'Your application did not meet our verification requirements. Please review the reason below and resubmit.',
      badgeLabel: 'Application Rejected',
      badgeBg: COLORS.errorLight,
      badgeText: '#991B1B',
    },
    suspended: {
      icon: 'ban-outline',
      iconColor: COLORS.error,
      iconBg: COLORS.errorLight,
      title: 'Account Suspended',
      subtitle: 'Your provider account has been suspended. Please contact support for assistance.',
      badgeLabel: 'Suspended',
      badgeBg: COLORS.errorLight,
      badgeText: '#991B1B',
    },
  };

  const cfg = CONFIG[status] ?? CONFIG.pending_review;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <View style={styles.logoRow}>
          <View style={styles.logoDot} />
          <Text style={styles.logoText}>TAGA</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status icon */}
        <View style={[styles.iconWrap, { backgroundColor: cfg.iconBg }]}>
          <Ionicons name={cfg.icon} size={52} color={cfg.iconColor} />
        </View>

        {/* Status badge */}
        <View style={[styles.badge, { backgroundColor: cfg.badgeBg }]}>
          <Text style={[styles.badgeText, { color: cfg.badgeText }]}>{cfg.badgeLabel}</Text>
        </View>

        <Text style={styles.title}>{cfg.title}</Text>
        <Text style={styles.subtitle}>{cfg.subtitle}</Text>

        {/* Rejection reason */}
        {status === 'rejected' && providerProfile?.rejection_reason ? (
          <View style={styles.reasonCard}>
            <View style={styles.reasonHeader}>
              <Ionicons name="information-circle" size={18} color={COLORS.error} />
              <Text style={styles.reasonTitle}>Rejection Reason</Text>
            </View>
            <Text style={styles.reasonText}>{providerProfile.rejection_reason}</Text>
          </View>
        ) : null}

        {/* Application info */}
        {providerProfile && (
          <View style={styles.infoCard}>
            <Text style={styles.infoCardTitle}>Your Application</Text>
            {providerProfile.business_name ? (
              <View style={styles.infoRow}>
                <Ionicons name="business-outline" size={15} color={COLORS.primary} />
                <Text style={styles.infoLabel}>Business</Text>
                <Text style={styles.infoValue}>{providerProfile.business_name}</Text>
              </View>
            ) : null}
            {providerProfile.city && providerProfile.province ? (
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={15} color={COLORS.primary} />
                <Text style={styles.infoLabel}>Location</Text>
                <Text style={styles.infoValue}>{providerProfile.city}, {providerProfile.province}</Text>
              </View>
            ) : null}
            {providerProfile.created_at ? (
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={15} color={COLORS.primary} />
                <Text style={styles.infoLabel}>Submitted</Text>
                <Text style={styles.infoValue}>
                  {new Date(providerProfile.updated_at).toLocaleDateString('en-PH', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {/* What happens next */}
        {status === 'pending_review' && (
          <View style={styles.stepsCard}>
            <Text style={styles.stepsTitle}>What happens next?</Text>
            {[
              { icon: 'document-text-outline', label: 'Document review', desc: 'We verify your uploaded documents.' },
              { icon: 'shield-checkmark-outline', label: 'Identity verification', desc: 'We confirm your identity details.' },
              { icon: 'checkmark-circle-outline', label: 'Approval notification', desc: "You'll receive access once approved." },
            ].map((s, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={styles.stepIconWrap}>
                  <Ionicons name={s.icon as React.ComponentProps<typeof Ionicons>['name']} size={18} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepLabel}>{s.label}</Text>
                  <Text style={styles.stepDesc}>{s.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {status === 'rejected' && (
            <TouchableOpacity
              style={[styles.primaryBtn, editing && styles.btnDisabled]}
              onPress={handleEditApplication}
              disabled={editing}
            >
              {editing
                ? <ActivityIndicator color={COLORS.white} />
                : <>
                    <Ionicons name="create-outline" size={18} color={COLORS.white} />
                    <Text style={styles.primaryBtnText}>Edit & Resubmit Application</Text>
                  </>
              }
            </TouchableOpacity>
          )}

          {status === 'pending_review' && (
            <TouchableOpacity
              style={[styles.secondaryBtn, refreshing && styles.btnDisabled]}
              onPress={handleRefresh}
              disabled={refreshing}
            >
              {refreshing
                ? <ActivityIndicator color={COLORS.primary} size="small" />
                : <>
                    <Ionicons name="refresh-outline" size={18} color={COLORS.primary} />
                    <Text style={styles.secondaryBtnText}>Check Status</Text>
                  </>
              }
            </TouchableOpacity>
          )}

          {status === 'suspended' && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => Alert.alert('Contact Support', 'Please email support@taga.ph for assistance.')}>
              <Ionicons name="mail-outline" size={18} color={COLORS.primary} />
              <Text style={styles.secondaryBtnText}>Contact Support</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.signOutLinkBtn} onPress={handleSignOut}>
            <Text style={styles.signOutLinkText}>Sign out of this account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  logoText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: COLORS.primary },
  signOutBtn: { padding: SPACING.sm },
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: SPACING.md, paddingTop: SPACING.xl, paddingBottom: SPACING.xxl, gap: SPACING.md },
  iconWrap: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: 6 },
  badgeText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold },
  title: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text, textAlign: 'center' },
  subtitle: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 24, maxWidth: 320 },
  reasonCard: {
    width: '100%', backgroundColor: COLORS.errorLight, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: '#FECACA', padding: SPACING.md,
  },
  reasonHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  reasonTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.error },
  reasonText: { fontSize: FONTS.sizes.base, color: '#7F1D1D', lineHeight: 22 },
  infoCard: {
    width: '100%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, ...SHADOWS.small, gap: SPACING.xs,
  },
  infoCardTitle: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: SPACING.sm },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: 4 },
  infoLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontFamily: FONTS.semiBold, minWidth: 70 },
  infoValue: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.text },
  stepsCard: {
    width: '100%', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md, ...SHADOWS.small, gap: SPACING.sm,
  },
  stepsTitle: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.xs },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  stepIconWrap: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  stepLabel: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  stepDesc: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, lineHeight: 18, marginTop: 2 },
  actions: { width: '100%', gap: SPACING.sm, alignItems: 'center' },
  primaryBtn: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.primary, ...SHADOWS.medium,
  },
  primaryBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.white },
  secondaryBtn: {
    width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.primaryLight, borderWidth: 1.5, borderColor: COLORS.primary,
  },
  secondaryBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.primary },
  btnDisabled: { opacity: 0.6 },
  signOutLinkBtn: { paddingVertical: SPACING.sm },
  signOutLinkText: { fontSize: FONTS.sizes.sm, color: COLORS.textLight, textDecorationLine: 'underline' },
});
