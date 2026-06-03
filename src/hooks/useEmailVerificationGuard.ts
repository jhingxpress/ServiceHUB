import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/authStore';
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

      if (!user.email_verified) {
        Alert.alert(
          'Email verification required',
          `Please verify your email address before you can ${actionName}.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Verify Email',
              onPress: () => {
                navigation.navigate('Auth', { screen: 'EmailVerification' });
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

  const isVerified = !!user?.email_verified;

  return { guard, isVerified };
}
