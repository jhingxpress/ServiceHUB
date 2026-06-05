import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../../constants/theme';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { validators, validateForm } from '../../utils/validation';
import { useErrorHandler } from '../../utils/errorHandler';
import TermsOfServiceModal from '../../components/modals/TermsOfServiceModal';
import PrivacyPolicyModal from '../../components/modals/PrivacyPolicyModal';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'>;
};

export default function RegisterScreen({ navigation }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const { showError } = useErrorHandler();

  const handleContinue = () => {
    const validation = validateForm(
      { fullName, email, phone, password, confirmPassword },
      {
        fullName: (v) => validators.required(v, 'Full name'),
        email: validators.email,
        phone: (v) => (v ? validators.phone(v) : null),
        password: validators.password,
        confirmPassword: (v) => (v !== password ? 'Passwords do not match' : null),
      }
    );

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    if (!termsAccepted) {
      setErrors({ ...validation.errors, termsAccepted: 'You must agree to the Terms of Service and Privacy Policy to continue.' });
      Alert.alert('Consent Required', 'Please read and agree to the Terms of Service and Privacy Policy before creating an account.');
      return;
    }

    navigation.navigate('RoleSelection', {
      email: email.trim().toLowerCase(),
      password,
      fullName: fullName.trim(),
      phone: phone.trim() || undefined,
      acceptedTerms: true,
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back */}
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>

          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Join the ServiceHub community</Text>

          <View style={styles.form}>
            <Input
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              leftIcon="person-outline"
              placeholder="Juan Dela Cruz"
              autoCapitalize="words"
              error={errors.fullName}
            />
            <Input
              label="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              leftIcon="mail-outline"
              placeholder="you@example.com"
              error={errors.email}
            />
            <Input
              label="Phone number (optional)"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              leftIcon="call-outline"
              placeholder="0917 123 4567"
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              isPassword
              leftIcon="lock-closed-outline"
              placeholder="Minimum 6 characters"
              error={errors.password}
            />
            <Input
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              isPassword
              leftIcon="shield-checkmark-outline"
              placeholder="Repeat your password"
              error={errors.confirmPassword}
            />

            {/* Consent */}
            <View style={styles.consentWrap}>
              <TouchableOpacity
                style={styles.consentRow}
                onPress={() => {
                  setTermsAccepted((prev) => !prev);
                  if (errors.termsAccepted) {
                    setErrors((prev) => { const n = { ...prev }; delete n.termsAccepted; return n; });
                  }
                }}
                activeOpacity={0.8}
              >
                <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                  {termsAccepted && <Ionicons name="checkmark" size={14} color={COLORS.white} />}
                </View>
                <Text style={styles.consentText}>
                  I have read and agree to the{' '}
                  <Text style={styles.link} onPress={() => setShowTerms(true)}>Terms of Service</Text>
                  {' '}and{' '}
                  <Text style={styles.link} onPress={() => setShowPrivacy(true)}>Privacy Policy</Text>.
                </Text>
              </TouchableOpacity>
              {errors.termsAccepted && <Text style={styles.consentError}>{errors.termsAccepted}</Text>}
            </View>

            <Button
              title="Continue"
              onPress={handleContinue}
              fullWidth
              size="lg"
              style={styles.registerBtn}
              disabled={!termsAccepted}
            />
          </View>

          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <TermsOfServiceModal visible={showTerms} onClose={() => setShowTerms(false)} />
      <PrivacyPolicyModal visible={showPrivacy} onClose={() => setShowPrivacy(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  kav: { flex: 1 },
  scroll: { flexGrow: 1, padding: SPACING.lg },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontFamily: FONTS.bold,
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONTS.sizes.base,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  form: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  registerBtn: { marginTop: SPACING.xs },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  loginText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary },
  loginLink: { fontSize: FONTS.sizes.base, color: COLORS.primary, fontFamily: FONTS.semiBold },
  consentWrap: { marginTop: SPACING.sm, marginBottom: SPACING.sm },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  checkbox: {
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
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  consentText: { flex: 1, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
  link: { color: COLORS.primary, fontFamily: FONTS.semiBold },
  consentError: { fontSize: FONTS.sizes.sm, color: COLORS.error, marginTop: SPACING.xs, marginLeft: 28 },
});
