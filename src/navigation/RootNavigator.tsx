import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/authStore';
import { RootStackParamList } from './types';
import { COLORS } from '../constants/theme';
import AuthNavigator from './AuthNavigator';
import CustomerNavigator from './CustomerNavigator';
import ProviderNavigator from './ProviderNavigator';
import AdminNavigator from './AdminNavigator';
import ProfileCompletionScreen from '../screens/auth/ProfileCompletionScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

function isProfileComplete(user: { accepted_terms_at: string | null; role: string } | null): boolean {
  if (!user) return false;
  // Profile is incomplete if user hasn't accepted terms (first-time Google sign-in)
  return user.accepted_terms_at != null;
}

export default function RootNavigator() {
  const { user, isInitialized } = useAuthStore();

  if (!isInitialized) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const profileComplete = isProfileComplete(user);

  console.log('[ROOT DECISION]', {
    isInitialized,
    hasUser: !!user,
    userId: user?.id ?? null,
    email: user?.email ?? null,
    role: user?.role ?? null,
    emailVerified: user?.email_verified ?? null,
    acceptedTerms: user?.accepted_terms_at ?? null,
    profileComplete,
  });

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <>
          {console.log('[ROOT SCREEN]', 'AuthNavigator')}
          <Stack.Screen name="Auth" component={AuthNavigator} />
        </>
      ) : !profileComplete ? (
        <>
          {console.log('[ROOT SCREEN]', 'ProfileCompletionScreen')}
          <Stack.Screen name="ProfileCompletion" component={ProfileCompletionScreen} />
        </>
      ) : user.role === 'customer' ? (
        <>
          {console.log('[ROOT SCREEN]', 'CustomerNavigator')}
          <Stack.Screen name="Customer" component={CustomerNavigator} />
        </>
      ) : user.role === 'provider' ? (
        <>
          {console.log('[ROOT SCREEN]', 'ProviderNavigator')}
          <Stack.Screen name="Provider" component={ProviderNavigator} />
        </>
      ) : (
        <>
          {console.log('[ROOT SCREEN]', 'AdminNavigator')}
          <Stack.Screen name="Admin" component={AdminNavigator} />
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
