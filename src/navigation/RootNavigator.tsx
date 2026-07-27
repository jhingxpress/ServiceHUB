import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/authStore';
import { RootStackParamList } from './types';
import { COLORS } from '../constants/theme';
import { isStaff } from '../utils/roleUtils';
import AuthNavigator from './AuthNavigator';
import CustomerNavigator from './CustomerNavigator';
import ProviderNavigator from './ProviderNavigator';
import AdminNavigator from './AdminNavigator';
import ProfileCompletionScreen from '../screens/auth/ProfileCompletionScreen';
import EmailVerifiedScreen from '../screens/auth/EmailVerifiedScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';
import StaffChangePasswordScreen from '../screens/auth/StaffChangePasswordScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

function isProfileComplete(user: { accepted_terms_at: string | null; role: string } | null): boolean {
  if (!user) return false;
  // Staff accounts skip marketplace onboarding entirely
  if (user.role === 'moderator' || user.role === 'support_agent' || user.role === 'operations_staff') {
    return true;
  }
  // Profile is incomplete if user hasn't accepted terms (first-time Google sign-in)
  return user.accepted_terms_at != null;
}

export default function RootNavigator() {
  const { user, isInitialized, isAuthenticating, emailJustVerified, passwordResetMode, mustChangePassword } = useAuthStore();

  if (!isInitialized || isAuthenticating) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const profileComplete = isProfileComplete(user);
  const isStaffRole = isStaff(user?.role);

  let screenName = '';
  if (passwordResetMode) {
    screenName = 'ResetPasswordScreen';
  } else if (!user) {
    screenName = 'AuthNavigator';
  } else if (mustChangePassword) {
    screenName = 'MustChangePasswordScreen';
  } else if (isStaffRole) {
    screenName = 'AdminNavigator';
  } else if (emailJustVerified) {
    screenName = 'EmailVerifiedScreen';
  } else if (!profileComplete) {
    screenName = 'ProfileCompletionScreen';
  } else if (user.role === 'customer') {
    screenName = 'CustomerNavigator';
  } else if (user.role === 'provider') {
    screenName = 'ProviderNavigator';
  } else {
    screenName = 'AdminNavigator';
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {passwordResetMode ? (
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      ) : !user ? (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      ) : mustChangePassword ? (
        <Stack.Screen name="MustChangePassword" component={StaffChangePasswordScreen} />
      ) : isStaffRole ? (
        <Stack.Screen name="Admin" component={AdminNavigator} />
      ) : emailJustVerified ? (
        <Stack.Screen name="EmailVerified" component={EmailVerifiedScreen} />
      ) : !profileComplete ? (
        <Stack.Screen name="ProfileCompletion" component={ProfileCompletionScreen} />
      ) : user.role === 'customer' ? (
        <Stack.Screen name="Customer" component={CustomerNavigator} />
      ) : user.role === 'provider' ? (
        <Stack.Screen name="Provider" component={ProviderNavigator} />
      ) : (
        <Stack.Screen name="Admin" component={AdminNavigator} />
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
