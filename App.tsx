import 'react-native-url-polyfill/auto';
import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  StyleSheet,
  ActivityIndicator,
  View,
  AppState,
  AppStateStatus,
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

export default function App() {
  const { initialize, validateSession } = useAuthStore();
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

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

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <ToastProvider>
            <NavigationContainer>
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
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
});
