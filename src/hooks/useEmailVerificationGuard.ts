import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/authStore';
import { BETA_MODE } from '../config/featureFlags';
import { RootStackParamList } from '../navigation/types';

export function useEmailVerificationGuard() {
  const { user } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const guard = useCallback(
    (action: () => void, actionName = 'this action') => {
      if (!user) {
        Alert.alert('Sign in required', 'Please sign in to continue.', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In',
            onPress: () => {
              navigation.navigate('Auth', { screen: 'Login' });
            },
          },
        ]);
        return;
      }

      if (!BETA_MODE && !user.email_verified) {
        Alert.alert(
          'Email verification required',
          `Please verify your email address before you can ${actionName}.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Verify Email',
              onPress: () => {
                navigation.navigate('Auth', { screen: 'EmailVerification', params: { email: user.email } });
              },
            },
          ]
        );
        return;
      }

      action();
    },
    [user, navigation]
  );

  const isVerified = BETA_MODE || !!user?.email_verified;

  return { guard, isVerified };
}
