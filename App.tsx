import 'react-native-url-polyfill/auto';
import React, { useEffect, useRef, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  StyleSheet,
  ActivityIndicator,
  View,
  AppState,
  AppStateStatus,
  Linking,
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
  const { initialize, validateSession, checkEmailVerified } = useAuthStore();
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Keep native splash visible while fonts + auth initialize
  useEffect(() => {
    SplashScreen.preventAutoHideAsync().catch(() => {});
  }, []);

  // 1. Initialize auth on app launch
  useEffect(() => {
    initialize();
  }, [initialize]);

  // 2. Validate session when app returns from background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
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

  // 7. Deep-link handler for email verification URLs
  useEffect(() => {
    const handleUrl = async ({ url }: { url: string }) => {
      console.log('[VERIFY] Deep link received:', url);
      if (url.includes('type=signup') || url.includes('verify')) {
        console.log('[VERIFY] Verification deep link detected — triggering verification check');
        try {
          const result = await checkEmailVerified();
          console.log('[VERIFY] Deep link verification result', {
            verified: result.verified,
            role: result.role,
            providerStatus: result.providerStatus,
          });
          if (result.verified) {
            console.log('[VERIFY] Deep link: user verified — RootNavigator will auto-route');
          } else {
            console.log('[VERIFY] Deep link: user still unverified');
          }
        } catch (err) {
          console.error('[VERIFY] Deep link verification error:', err);
        }
      }
    };

    const sub = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    return () => {
      sub.remove();
    };
  }, [checkEmailVerified]);

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
            <NavigationContainer ref={navigationRef}>
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
