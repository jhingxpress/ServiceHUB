import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { AuthStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../../constants/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'EmailVerification'>;

export default function EmailVerificationScreen({ route, navigation }: Props) {
  const { email } = route.params ?? {};
  const { checkEmailVerified, resendVerificationEmail } = useAuthStore();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const runVerificationCheck = useCallback(async (source: string) => {
    console.log('[VERIFY] EmailVerificationScreen: running check from', source);
    setChecking(true);
    setStatusMsg('Checking verification status...');
    try {
      const result = await checkEmailVerified();
      console.log('[VERIFY] checkEmailVerified result', result);
      console.log('[VERIFY] EmailVerificationScreen: check result', {
        source,
        verified: result.verified,
        role: result.role,
        providerStatus: result.providerStatus,
      });
      if (result.verified) {
        setStatusMsg(
          result.role === 'provider'
            ? result.providerStatus === 'approved'
              ? 'Email verified! Redirecting to provider dashboard...'
              : 'Email verified! Redirecting to provider onboarding...'
            : 'Email verified! Redirecting to home...'
        );
        // RootNavigator will auto-switch stacks when user state is set.
        // No manual navigation needed — the reactive state change handles it.
      } else {
        setStatusMsg('Email not yet verified. Please check your inbox and tap the link.');
      }
    } catch (err) {
      console.error('[VERIFY] EmailVerificationScreen: check error', err);
      setStatusMsg('Unable to check status. Please try again.');
    } finally {
      setChecking(false);
    }
  }, [checkEmailVerified]);

  // Auto-check when screen comes into focus (user returns from email app)
  useFocusEffect(
    useCallback(() => {
      console.log('[VERIFY] EmailVerificationScreen: screen focused');
      runVerificationCheck('focus');
    }, [runVerificationCheck])
  );

  // Also check when app returns from background (user tapped email link in email app)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        console.log('[VERIFY] EmailVerificationScreen: app became active');
        runVerificationCheck('app-active');
      }
    });
    return () => sub.remove();
  }, [runVerificationCheck]);

  const handleCheck = async () => {
    console.log('[VERIFY] Button pressed — I have verified my email');
    runVerificationCheck('manual-tap');
  };

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      await resendVerificationEmail(email);
      setResent(true);
      setTimeout(() => setResent(false), 3000);
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
          We sent a verification link to {email ? email : 'your email address'}. Please check your inbox and tap the link to activate your account.
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

        {statusMsg ? (
          <View style={styles.statusBox}>
            <Ionicons
              name={statusMsg.includes('verified') ? 'checkmark-circle' : 'information-circle'}
              size={18}
              color={statusMsg.includes('verified') ? COLORS.success : COLORS.textLight}
            />
            <Text style={[styles.statusText, statusMsg.includes('verified') && styles.statusTextSuccess]}>
              {statusMsg}
            </Text>
          </View>
        ) : null}

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
    color: COLORS.primary,
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
  statusBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
  },
  statusTextSuccess: {
    color: COLORS.success,
    fontFamily: FONTS.semiBold,
  },
});
