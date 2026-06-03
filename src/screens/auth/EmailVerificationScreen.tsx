import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'EmailVerification'>;
};

export default function EmailVerificationScreen({ navigation }: Props) {
  const { checkEmailVerified, resendVerificationEmail } = useAuthStore();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleCheck = async () => {
    setChecking(true);
    const verified = await checkEmailVerified();
    setChecking(false);
    if (verified) {
      // Auth state listener + RootNavigator will auto-route to app
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      // We need the email; get it from the current pending session or store
      // For simplicity, resend uses the stored email from the last signUp attempt
      // The auth store's resendVerificationEmail requires an email param
      // Since we don't have it here, we'll get it from Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        await resendVerificationEmail(session.user.email);
        setResent(true);
        setTimeout(() => setResent(false), 3000);
      }
    } catch {
      // ignore
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons name="mail-unread-outline" size={48} color={COLORS.primary} />
        </View>

        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.subtitle}>
          We sent a verification link to your email address. Please check your inbox and tap the link to activate your account.
        </Text>

        <View style={styles.restrictions}>
          <Text style={styles.restrictTitle}>Before verification you cannot:</Text>
          <View style={styles.restrictItem}>
            <Ionicons name="close-circle" size={16} color={COLORS.error} />
            <Text style={styles.restrictText}>Create bookings</Text>
          </View>
          <View style={styles.restrictItem}>
            <Ionicons name="close-circle" size={16} color={COLORS.error} />
            <Text style={styles.restrictText}>Send messages</Text>
          </View>
          <View style={styles.restrictItem}>
            <Ionicons name="close-circle" size={16} color={COLORS.error} />
            <Text style={styles.restrictText}>Submit reviews</Text>
          </View>
          <View style={styles.restrictItem}>
            <Ionicons name="close-circle" size={16} color={COLORS.error} />
            <Text style={styles.restrictText}>Apply as a provider</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.btn, checking && styles.btnDisabled]}
          onPress={handleCheck}
          disabled={checking}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>
            {checking ? 'Checking…' : 'I have verified my email'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btnSecondary, resending && styles.btnDisabled]}
          onPress={handleResend}
          disabled={resending}
          activeOpacity={0.85}
        >
          <Text style={styles.btnSecondaryText}>
            {resent ? 'Verification email resent!' : resending ? 'Sending…' : 'Resend verification email'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backLink}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.backLinkText}>Back to login</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  content: {
    flex: 1,
    padding: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primaryLight + '30',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  restrictions: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  restrictTitle: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  restrictItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  restrictText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
  },
  btn: {
    width: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnText: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.white,
  },
  btnSecondary: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  btnSecondaryText: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
  },
  backLink: {
    marginTop: SPACING.sm,
  },
  backLinkText: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.medium,
    color: COLORS.primary,
  },
});
