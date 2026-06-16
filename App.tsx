import 'react-native-url-polyfill/auto';
import React, { useEffect, useRef, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer, NavigationState } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  StyleSheet,
  ActivityIndicator,
  View,
  AppState,
  AppStateStatus,
  Linking,
  Alert,
} from 'react-native';
import { useFonts } from 'expo-font';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import RootNavigator from './src/navigation/RootNavigator';
import { useAuthStore } from './src/stores/authStore';
import ErrorBoundary from './src/components/ErrorBoundary';
import { ToastProvider } from './src/hooks/useToast';
import Toast from './src/components/ui/Toast';
import AnnouncementModal from './src/components/modals/AnnouncementModal';
import { useAnnouncementModal } from './src/hooks/useAnnouncementModal';
import EmailVerificationBanner from './src/components/auth/EmailVerificationBanner';
import { RecaptchaProvider } from './src/components/recaptcha/RecaptchaV3';
import { COLORS } from './src/constants/theme';
import {
  setupNotificationChannels,
  addForegroundListener,
  addTapListener,
  getLastNotificationResponse,
} from './src/services/notificationService';
import { navigationRef } from './src/navigation/navigationRef';
import { supabase } from './src/lib/supabase';
import { debugLogger } from './src/services/debugLogger';

function AnnouncementOverlay() {
  const { visible, title, message, type, closeModal } = useAnnouncementModal();
  return (
    <AnnouncementModal
      visible={visible}
      title={title}
      message={message}
      type={type}
      onClose={closeModal}
    />
  );
}

async function handleNotificationTap(data: Record<string, unknown>) {
  if (!navigationRef.isReady()) {
    console.log('[Notifications] Navigation not ready, deferring tap');
    return;
  }

  const type = data.type as string | undefined;
  const bookingId = data.booking_id as string | undefined;
  const senderId = data.sender_id as string | undefined;

  const user = useAuthStore.getState().user;
  if (!user) {
    console.log('[Notifications] No authenticated user, ignoring tap');
    return;
  }

  const role = user.role;
  console.log('[Notifications] Handling tap:', { type, bookingId, role });

  switch (type) {
    case 'booking_submitted':
    case 'booking_accepted':
    case 'booking_rejected':
    case 'provider_on_the_way':
    case 'provider_arrived':
    case 'service_completed':
    case 'booking_completed':
    case 'dispute_opened':
      if (bookingId) {
        if (role === 'customer') {
          navigationRef.navigate('Customer', { screen: 'BookingDetail', params: { bookingId } });
        } else if (role === 'provider') {
          navigationRef.navigate('Provider', { screen: 'BookingDetail', params: { bookingId } });
        } else if (role === 'admin') {
          navigationRef.navigate('Admin', { screen: 'BookingDetail', params: { bookingId } });
        }
      }
      break;

    case 'new_message':
    case 'chat_message':
      if (bookingId && senderId) {
        const { data: sender } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', senderId)
          .single();
        const otherUserName = (sender as any)?.full_name ?? 'Chat';
        if (role === 'customer') {
          navigationRef.navigate('Customer', {
            screen: 'ChatRoom',
            params: { bookingId, otherUserId: senderId, otherUserName },
          });
        } else if (role === 'provider') {
          navigationRef.navigate('Provider', {
            screen: 'ChatRoom',
            params: { bookingId, otherUserId: senderId, otherUserName },
          });
        }
      }
      break;

    case 'review_received':
      if (role === 'provider') {
        navigationRef.navigate('Provider', { screen: 'ProviderReviews' });
      }
      break;

    case 'verification_approved':
    case 'verification_rejected':
      if (role === 'provider') {
        navigationRef.navigate('Provider', { screen: 'ProviderTabs', params: { screen: 'Dashboard' } });
      }
      break;

    default:
      console.log('[Notifications] Unhandled notification type:', type);
  }
}

export default function App() {
  const { initialize, validateSession, setEmailJustVerified, setPasswordResetMode } = useAuthStore();
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const handleNavigationReady = useCallback(() => {
    const initialRoute = navigationRef.current?.getCurrentRoute();
    console.log('[NAV] Navigation ready — current route:', initialRoute?.name ?? 'unknown', 'params:', initialRoute?.params ?? null);
  }, []);

  const handleNavigationStateChange = useCallback((state?: NavigationState) => {
    const currentRoute = navigationRef.current?.getCurrentRoute();
    console.log('[NAV] State change', {
      routeStack: state?.routes?.map((r) => r.name) ?? [],
      index: state?.index ?? null,
      currentRoute: currentRoute?.name ?? null,
      currentParams: currentRoute?.params ?? null,
    });
  }, []);

  // Keep native splash visible while fonts + auth initialize
  useEffect(() => {
    SplashScreen.preventAutoHideAsync().catch(() => {});
  }, []);

  // 1. Initialize debug logger and auth on app launch
  useEffect(() => {
    debugLogger.initialize();
    initialize();
  }, [initialize]);

  // 2. Validate session when app returns from background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        debugLogger.log('AppState_active_fired', { prev: appStateRef.current, next: nextAppState, t: Date.now() });
        console.log('[AppState] background→active — calling validateSession');
        validateSession();
      }
      appStateRef.current = nextAppState;
    });
    return () => subscription.remove();
  }, [validateSession]);

  // 3. Setup Android notification channels on launch (APK requirement)
  useEffect(() => {
    setupNotificationChannels();
  }, []);

  // 4. Foreground notification listener
  useEffect(() => {
    const unsubscribe = addForegroundListener((notification) => {
      // Foreground alerts are handled by setNotificationHandler;
      // this listener can be used for analytics or custom in-app UI.
      const data = notification.request.content.data as Record<string, unknown> | undefined;
      console.log('[Notifications] Foreground received:', data?.type ?? 'unknown');
    });
    return unsubscribe;
  }, []);

  // 5. Notification tap / response listener (foreground + background)
  useEffect(() => {
    const unsubscribe = addTapListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      if (!data) return;
      handleNotificationTap(data);
    });
    return unsubscribe;
  }, []);

  // 6. Cold-start notification deep-link check
  useEffect(() => {
    getLastNotificationResponse().then((response) => {
      if (response) {
        const data = response.notification.request.content.data as Record<string, unknown> | undefined;
        if (data) {
          handleNotificationTap(data);
        }
      }
    });
  }, []);

  // 7. Deep-link handler for email verification and password reset URLs
  useEffect(() => {
    console.log('[DEEPLINK] Linking effect mounted');
    const handleUrl = async ({ url }: { url: string }) => {
      console.log('[DEEPLINK] Received:', url);

      // Password reset: com.servicehub.app://reset-password?code=<PKCE_CODE>&type=recovery
      if (url.includes('reset-password')) {
        try {
          const parsed = new URL(url);

          // ── Forensic log — helps diagnose exactly what Supabase sent ──────
          const allParams: Record<string, string> = {};
          parsed.searchParams.forEach((v, k) => { allParams[k] = v; });
          const fragment = url.includes('#') ? url.split('#')[1] : '';
          console.log('[RESET] Full URL received:', url);
          console.log('[RESET] URL breakdown:', {
            scheme: parsed.protocol,
            host: parsed.host,
            pathname: parsed.pathname,
            queryParams: allParams,
            fragment: fragment || '(none)',
          });
          // ─────────────────────────────────────────────────────────────────

          // Case 1 — Supabase error redirect
          // e.g. ?error=unauthorized_client&error_description=Email+link+is+invalid
          const errorParam = parsed.searchParams.get('error');
          if (errorParam) {
            const desc = parsed.searchParams.get('error_description')?.replace(/\+/g, ' ') ?? errorParam;
            console.error('[RESET] Supabase error redirect:', errorParam, desc);
            Alert.alert(
              'Link Expired',
              'This password reset link has expired or was already used. Please request a new one from the login screen.',
              [{ text: 'OK' }]
            );
            return;
          }

          // Case 2 — PKCE flow: code= in query params (supabase-js v2 default)
          const code = parsed.searchParams.get('code');
          if (code) {
            console.log('[RESET] PKCE code found — calling exchangeCodeForSession');
            // Set the flag BEFORE exchange so the SIGNED_IN listener (which starts
            // executing synchronously on the same microtask tick) can detect that we
            // are in a recovery flow and skip the email_confirmed_at enforcement that
            // would otherwise sign the user out and clear this flag.
            setPasswordResetMode(true);
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) {
              console.error('[RESET] exchangeCodeForSession error:', exchangeError.message);
              setPasswordResetMode(false);
              Alert.alert(
                'Link Expired',
                'This password reset link has expired or has already been used. Please request a new one from the login screen.',
                [{ text: 'OK' }]
              );
            } else {
              console.log('[RESET] PKCE session established — ResetPasswordScreen active');
            }
            return;
          }

          // Case 3 — Implicit flow fallback: access_token in query params or # fragment
          // Fires when Supabase project is configured for implicit (non-PKCE) recovery
          const fragmentParams = new URLSearchParams(fragment);
          const accessToken =
            parsed.searchParams.get('access_token') ?? fragmentParams.get('access_token');
          const refreshToken =
            parsed.searchParams.get('refresh_token') ?? fragmentParams.get('refresh_token');

          if (accessToken && refreshToken) {
            console.log('[RESET] Implicit flow tokens found — calling setSession');
            setPasswordResetMode(true);
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) {
              console.error('[RESET] setSession error:', sessionError.message);
              setPasswordResetMode(false);
              Alert.alert(
                'Link Expired',
                'This password reset link has expired or has already been used. Please request a new one from the login screen.',
                [{ text: 'OK' }]
              );
            } else {
              console.log('[RESET] Implicit session established — ResetPasswordScreen active');
            }
            return;
          }

          // Case 4 — No usable token found at all
          console.error('[RESET] No code, access_token, or error found in URL');
          console.error('[RESET] queryParams:', allParams, '| fragment:', fragment || '(none)');
          Alert.alert(
            'Invalid Link',
            'This password reset link is invalid. Please request a new one from the login screen.',
            [{ text: 'OK' }]
          );
        } catch (err) {
          console.error('[RESET] Deep link parsing error:', err);
        }
        return;
      }

      // PayMongo featured payment return — success
      // com.servicehub.app://featured/success
      if (url.includes('featured/success')) {
        console.log('[DEEPLINK] featured/success received');
        if (navigationRef.isReady()) {
          navigationRef.navigate('Provider', {
            screen: 'ProviderTabs',
            params: { screen: 'Dashboard' },
          } as any);
        }
        Alert.alert(
          'Payment Received',
          'Your payment was successful. Your Featured Provider request is now awaiting admin approval.'
        );
        return;
      }

      // PayMongo featured payment return — cancel
      // com.servicehub.app://featured/cancel
      if (url.includes('featured/cancel')) {
        console.log('[DEEPLINK] featured/cancel received');
        if (navigationRef.isReady()) {
          navigationRef.navigate('Provider', {
            screen: 'ProviderTabs',
            params: { screen: 'Dashboard' },
          } as any);
        }
        Alert.alert(
          'Payment Cancelled',
          'You cancelled the checkout. Your pending session is saved — tap "Open Checkout" on your Dashboard to complete payment.'
        );
        return;
      }

      // Email verification — two possible redirect formats:
      //   PKCE:     com.servicehub.app://verify?code=<CODE>&type=signup
      //   Implicit: com.servicehub.app://verify#access_token=...&refresh_token=...&type=signup
      if (url.includes('type=signup') || url.includes('verify')) {
        try {
          const parsed = new URL(url);
          const fragment = url.includes('#') ? url.split('#')[1] : '';
          const fragmentParams = new URLSearchParams(fragment);

          debugLogger.log('verify_link_received', { t: Date.now() });
          console.log('[VERIFY] verify_link_received:', url);

          // ── Diagnostics — zero behavior change ───────────────────────────────
          console.log('[VERIFY FULL URL]', url);
          debugLogger.log('verify_full_url', { url });

          const _diagCode = parsed.searchParams.get('code');
          const _diagAccessToken =
            parsed.searchParams.get('access_token') ?? fragmentParams.get('access_token');
          const _diagRefreshToken =
            parsed.searchParams.get('refresh_token') ?? fragmentParams.get('refresh_token');

          console.log('[VERIFY PARSED]', {
            code: _diagCode,
            hasAccessToken: !!_diagAccessToken,
            hasRefreshToken: !!_diagRefreshToken,
          });
          debugLogger.log('verify_parsed_values', {
            hasCode: !!_diagCode,
            hasAccessToken: !!_diagAccessToken,
            hasRefreshToken: !!_diagRefreshToken,
          });

          // Log fragment via BOTH extraction methods — discrepancy here means
          // new URL() is not parsing the hash of a custom-scheme URI correctly.
          const _diagFragmentParsedHash = parsed.hash.startsWith('#')
            ? parsed.hash.substring(1)
            : parsed.hash;
          console.log('[VERIFY FRAGMENT]', {
            rawSplit: fragment || '(none)',       // url.split('#')[1]
            parsedHash: _diagFragmentParsedHash || '(none)',  // parsed.hash
          });
          debugLogger.log('verify_fragment', {
            fragment: _diagFragmentParsedHash || '(none)',
            fragmentRaw: fragment || '(none)',
          });
          // ── End diagnostics ──────────────────────────────────────────────────

          // ── Case 1: PKCE flow — code= in query params ───────────────────────
          const code = parsed.searchParams.get('code');
          if (code) {
            debugLogger.log('verify_link_has_code', { t: Date.now() });
            console.log('[VERIFY] verify_link_has_code — calling exchangeCodeForSession');
            debugLogger.log('verify_exchange_start', { flow: 'pkce', t: Date.now() });
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) {
              debugLogger.log('verify_exchange_error', { flow: 'pkce', error: exchangeError.message, t: Date.now() });
              console.error('[VERIFY] verify_exchange_error (pkce):', exchangeError.message);
              return;
            }
            debugLogger.log('verify_exchange_success', { flow: 'pkce', t: Date.now() });
            debugLogger.log('verify_session_created', { flow: 'pkce', t: Date.now() });
            console.log('[VERIFY] verify_session_created (pkce) — SIGNED_IN will bootstrap, signalling EmailVerifiedScreen');
            setEmailJustVerified(true);
            return;
          }

          // ── Case 2: Implicit flow — tokens in URL fragment or query params ──
          const accessToken =
            parsed.searchParams.get('access_token') ?? fragmentParams.get('access_token');
          const refreshToken =
            parsed.searchParams.get('refresh_token') ?? fragmentParams.get('refresh_token');
          if (accessToken && refreshToken) {
            debugLogger.log('verify_link_has_access_token', { t: Date.now() });
            console.log('[VERIFY] verify_link_has_access_token — calling setSession');
            debugLogger.log('verify_exchange_start', { flow: 'implicit', t: Date.now() });
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) {
              debugLogger.log('verify_exchange_error', { flow: 'implicit', error: sessionError.message, t: Date.now() });
              console.error('[VERIFY] verify_exchange_error (implicit):', sessionError.message);
              return;
            }
            debugLogger.log('verify_exchange_success', { flow: 'implicit', t: Date.now() });
            debugLogger.log('verify_session_created', { flow: 'implicit', t: Date.now() });
            console.log('[VERIFY] verify_session_created (implicit) — SIGNED_IN will bootstrap, signalling EmailVerifiedScreen');
            setEmailJustVerified(true);
            return;
          }

          // ── Case 3: No usable token ─────────────────────────────────────────
          console.warn('[VERIFY] No PKCE code or access_token found in verification URL');
          console.warn('[VERIFY] queryParams:', Object.fromEntries(parsed.searchParams), '| fragment:', fragment || '(none)');
        } catch (err) {
          console.error('[VERIFY] Deep link verification error:', err);
        }
      }
    };

    const sub = Linking.addEventListener('url', (event) => {
      console.log('[DEEPLINK] Event listener fired with URL:', event.url);
      handleUrl(event);
    });
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('[DEEPLINK] Initial URL present:', url);
        handleUrl({ url });
      } else {
        console.log('[DEEPLINK] No initial URL');
      }
    });

    return () => {
      console.log('[DEEPLINK] Linking effect cleanup');
      sub.remove();
    };
  }, [setEmailJustVerified, setPasswordResetMode]);

  // Hide native splash once fonts are ready (auth state is handled inside RootNavigator)
  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    // Return null — native splash screen stays visible
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <ToastProvider>
            <NavigationContainer
              ref={navigationRef}
              onReady={handleNavigationReady}
              onStateChange={handleNavigationStateChange}
            >
              <RecaptchaProvider>
                <StatusBar style="dark" />
                <EmailVerificationBanner />
                <RootNavigator />
                <Toast />
                <AnnouncementOverlay />
              </RecaptchaProvider>
            </NavigationContainer>
          </ToastProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
