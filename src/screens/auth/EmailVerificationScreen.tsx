import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { AuthStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../../constants/theme';
import { debugLogger } from '../../services/debugLogger';

type Props = NativeStackScreenProps<AuthStackParamList, 'EmailVerification'>;

// How often to poll for cross-device verification (ms)
const POLL_INTERVAL_MS = 5000;
const RESEND_COOLDOWN_SECS = 60;

export default function EmailVerificationScreen({ route, navigation }: Props) {
  const { email } = route.params ?? {};
  const { checkEmailVerified, resendVerificationEmail } = useAuthStore();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [cooldownSecs, setCooldownSecs] = useState(0);
  const [resendError, setResendError] = useState('');
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track when the app was last backgrounded to debounce AppState checks
  const backgroundedAtRef = useRef<number | null>(null);
  // Suppress the useFocusEffect check on the very first mount (avoids false
  // "not verified" flash before the deep link handler has a chance to run)
  const isFirstFocusRef = useRef(true);

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

  // Automatic polling — detects verification performed on another device.
  // Uses sequential setTimeout (not setInterval) to avoid overlapping calls.
  // Pauses automatically when the screen loses focus; resumes when refocused.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const runPoll = async () => {
        if (cancelled) return;
        debugLogger.log('EmailVerification_poll_check', { t: Date.now() });
        try {
          const result = await checkEmailVerified();
          if (cancelled) return;
          if (result.verified) {
            debugLogger.log('EmailVerification_verified_detected', { t: Date.now() });
            console.log('[VERIFY POLL] verification detected — RootNavigator will navigate automatically');
            debugLogger.log('EmailVerification_poll_stop', { reason: 'verified', t: Date.now() });
            // checkEmailVerified() already called set({ user: profile });
            // RootNavigator reacts to the user state change and navigates.
            return; // Do not reschedule
          }
        } catch (err) {
          console.error('[VERIFY POLL] error:', err);
        }
        if (!cancelled) {
          timer = setTimeout(runPoll, POLL_INTERVAL_MS);
        }
      };

      debugLogger.log('EmailVerification_poll_start', { intervalMs: POLL_INTERVAL_MS, t: Date.now() });
      console.log('[VERIFY POLL] started — polling every', POLL_INTERVAL_MS, 'ms');
      // Delay first poll so the screen fully renders before hitting the network
      timer = setTimeout(runPoll, POLL_INTERVAL_MS);

      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
        debugLogger.log('EmailVerification_poll_stop', { reason: 'focus_lost_or_unmount', t: Date.now() });
        console.log('[VERIFY POLL] stopped');
      };
    }, [checkEmailVerified])
  );

  // Skip check on the very first focus so we don't race with the deep link handler.
  // All subsequent focuses (user navigated back here manually) still trigger a check.
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocusRef.current) {
        isFirstFocusRef.current = false;
        console.log('[VERIFY] EmailVerificationScreen: first focus — skipping auto-check');
        return;
      }
      console.log('[VERIFY] EmailVerificationScreen: screen re-focused');
      runVerificationCheck('focus');
    }, [runVerificationCheck])
  );

  // Only check when app returns from background if the user was genuinely away
  // (>= 1500 ms). This prevents the deep link arrival — which also causes an
  // AppState active event — from triggering a premature check before
  // exchangeCodeForSession has run.
  useEffect(() => {
    const handleStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        backgroundedAtRef.current = Date.now();
      } else if (nextState === 'active' && backgroundedAtRef.current !== null) {
        const elapsed = Date.now() - backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (elapsed >= 1500) {
          console.log('[VERIFY] EmailVerificationScreen: app returned from background after', elapsed, 'ms');
          runVerificationCheck('app-active');
        } else {
          console.log('[VERIFY] EmailVerificationScreen: app active too quickly (', elapsed, 'ms) — skipping check to avoid deep-link race');
        }
      }
    };
    const sub = AppState.addEventListener('change', handleStateChange);
    return () => sub.remove();
  }, [runVerificationCheck]);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = useCallback(() => {
    debugLogger.log('resend_verification_cooldown_started', { t: Date.now() });
    console.log('[VERIFY] Resend cooldown started —', RESEND_COOLDOWN_SECS, 's');
    setCooldownSecs(RESEND_COOLDOWN_SECS);
    cooldownRef.current = setInterval(() => {
      setCooldownSecs(prev => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleCheck = async () => {
    console.log('[VERIFY] Button pressed — I have verified my email');
    runVerificationCheck('manual-tap');
  };

  const handleResend = async () => {
    if (!email) return;
    if (cooldownSecs > 0) {
      debugLogger.log('resend_verification_blocked_cooldown', { remaining: cooldownSecs, t: Date.now() });
      console.log('[VERIFY] Resend blocked — cooldown active:', cooldownSecs, 's remaining');
      return;
    }
    setResending(true);
    setResendError('');
    try {
      await resendVerificationEmail(email);
      setResent(true);
      startCooldown();
      setTimeout(() => setResent(false), 3000);
    } catch (err: any) {
      const msg = (err?.message ?? '').toLowerCase();
      if (msg.includes('rate limit') || msg.includes('email rate limit')) {
        setResendError(
          "We've already sent a verification email. Please check your inbox and wait a few minutes before requesting another email."
        );
      } else {
        setResendError(err?.message ?? 'Failed to resend. Please try again.');
      }
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

        {resendError ? (
          <View style={styles.statusBox}>
            <Ionicons name="alert-circle" size={18} color={COLORS.error} />
            <Text style={[styles.statusText, { color: COLORS.error }]}>{resendError}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.btnSecondary, (resending || cooldownSecs > 0) && styles.btnDisabled]}
          onPress={handleResend}
          disabled={resending || cooldownSecs > 0}
          activeOpacity={0.85}
        >
          <Text style={styles.btnSecondaryText}>
            {resent
              ? 'Verification email resent!'
              : resending
              ? 'Sending…'
              : cooldownSecs > 0
              ? `Resend in ${cooldownSecs}s`
              : 'Resend verification email'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.crossDeviceBtn}
          onPress={() => navigation.navigate('Login', { email: email?.trim().toLowerCase() })}
          activeOpacity={0.75}
        >
          <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.primary} />
          <Text style={styles.crossDeviceBtnText}>Verified on another device? Continue to Sign In</Text>
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
  crossDeviceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  crossDeviceBtnText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.medium,
    color: COLORS.primary,
    textDecorationLine: 'underline',
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
