import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/authStore';
import { isStaff } from '../../utils/roleUtils';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../../constants/theme';
import TermsOfServiceModal from '../../components/modals/TermsOfServiceModal';
import PrivacyPolicyModal from '../../components/modals/PrivacyPolicyModal';

const TERMS_VERSION = '1.0';

export default function ProfileCompletionScreen() {
  const { user, completeProfileSetup } = useAuthStore();

  useEffect(() => {
    if (isStaff(user?.role)) {
      console.error('[PROFILE] ProfileCompletionScreen rendered for staff role', {
        userId: user?.id,
        role: user?.role,
      });
      Alert.alert('Error', 'Staff accounts do not use marketplace onboarding.');
    }
  }, [user?.id, user?.role]);

  // Defensive: staff should never reach this screen; RootNavigator routes them to AdminNavigator
  if (isStaff(user?.role)) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>Redirecting to Staff Operations Center...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [role, setRole] = useState<'customer' | 'provider'>('customer');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const validate = (): string | null => {
    if (!fullName.trim()) return 'Full name is required.';
    if (!phone.trim()) return 'Phone number is required.';
    if (!/^(09|\+639)\d{9}$/.test(phone.replace(/\s/g, ''))) {
      return 'Enter a valid Philippine mobile number (e.g. 09171234567).';
    }
    if (!termsAccepted) return 'You must accept the Terms of Service.';
    if (!privacyAccepted) return 'You must accept the Privacy Policy.';
    return null;
  };

  const handleSubmit = async () => {
    console.log('[PROFILE] Continue pressed', {
      role,
      fullName: fullName.trim(),
      phone: phone.trim(),
      termsAccepted,
      privacyAccepted,
    });

    const error = validate();
    if (error) {
      console.log('[PROFILE] Validation failed:', error);
      Alert.alert('Required', error);
      return;
    }

    setSubmitting(true);
    try {
      console.log('[PROFILE] Calling completeProfileSetup...');
      await completeProfileSetup({
        full_name: fullName.trim(),
        phone: phone.trim(),
        role,
        accepted_terms_at: new Date().toISOString(),
        accepted_privacy_at: new Date().toISOString(),
        accepted_terms_version: TERMS_VERSION,
      });
      console.log('[PROFILE] completeProfileSetup succeeded — RootNavigator should switch');
    } catch (err) {
      console.error('[PROFILE] completeProfileSetup error:', err);
      const msg = err instanceof Error ? err.message : 'Failed to save profile. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="person-circle-outline" size={48} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>Complete your profile</Text>
            <Text style={styles.subtitle}>
              We need a few details to set up your account.
            </Text>
          </View>

          {/* Full Name */}
          <View style={styles.field}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Juan Dela Cruz"
              placeholderTextColor={COLORS.textLight}
              autoCapitalize="words"
            />
          </View>

          {/* Phone */}
          <View style={styles.field}>
            <Text style={styles.label}>Mobile Number *</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="0917 123 4567"
              placeholderTextColor={COLORS.textLight}
              keyboardType="phone-pad"
            />
          </View>

          {/* Role */}
          <View style={styles.field}>
            <Text style={styles.label}>I want to join as *</Text>
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[styles.roleCard, role === 'customer' && styles.roleCardActive]}
                onPress={() => setRole('customer')}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={role === 'customer' ? 'home' : 'home-outline'}
                  size={28}
                  color={role === 'customer' ? COLORS.primary : COLORS.textLight}
                />
                <Text style={[styles.roleLabel, role === 'customer' && styles.roleLabelActive]}>
                  Customer
                </Text>
                <Text style={styles.roleDesc}>Book services from trusted providers</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.roleCard, role === 'provider' && styles.roleCardActive]}
                onPress={() => setRole('provider')}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={role === 'provider' ? 'briefcase' : 'briefcase-outline'}
                  size={28}
                  color={role === 'provider' ? COLORS.primary : COLORS.textLight}
                />
                <Text style={[styles.roleLabel, role === 'provider' && styles.roleLabelActive]}>
                  Provider
                </Text>
                <Text style={styles.roleDesc}>Offer services and grow your business</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Consent */}
          <View style={styles.consentBlock}>
            <TouchableOpacity
              style={styles.consentRow}
              onPress={() => setTermsAccepted(v => !v)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                {termsAccepted && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
              </View>
              <Text style={styles.consentText}>
                I have read and agree to the{' '}
                <Text style={styles.link} onPress={() => setShowTerms(true)}>Terms of Service</Text>.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.consentRow}
              onPress={() => setPrivacyAccepted(v => !v)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>
                {privacyAccepted && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
              </View>
              <Text style={styles.consentText}>
                I have read and agree to the{' '}
                <Text style={styles.link} onPress={() => setShowPrivacy(true)}>Privacy Policy</Text>.
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.btn, submitting && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>
              {submitting ? 'Saving…' : 'Continue'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <TermsOfServiceModal visible={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicyModal visible={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
  kav: { flex: 1 },
  scroll: { flexGrow: 1, padding: SPACING.lg },
  header: { alignItems: 'center', marginBottom: SPACING.xl },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.primaryLight + '30',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  field: { marginBottom: SPACING.lg },
  label: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.regular,
    color: COLORS.text,
  },
  roleRow: { flexDirection: 'row', gap: SPACING.md },
  roleCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: SPACING.md,
    alignItems: 'center',
  },
  roleCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight + '15' },
  roleLabel: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  roleLabelActive: { color: COLORS.primary },
  roleDesc: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  consentBlock: { marginBottom: SPACING.lg, gap: SPACING.sm },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  checkbox: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  consentText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  link: { color: COLORS.primary, fontFamily: FONTS.semiBold },
  btn: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.white,
  },
});
