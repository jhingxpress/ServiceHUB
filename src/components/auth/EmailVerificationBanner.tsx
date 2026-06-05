import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../stores/authStore';
import { BETA_MODE } from '../../config/featureFlags';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../../constants/theme';
import { RootStackParamList } from '../../navigation/types';

export default function EmailVerificationBanner() {
  const { user } = useAuthStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  if (BETA_MODE) return null;
  if (!user || user.email_verified) return null;

  return (
    <View style={styles.banner}>
      <Ionicons name="warning-outline" size={18} color={COLORS.warning} />
      <Text style={styles.text} numberOfLines={1}>
        Please verify your email address to continue.
      </Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => navigation.navigate('Auth', { screen: 'EmailVerification', params: { email: user.email } })}
      >
        <Text style={styles.btnText}>Verify</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warningLight + '30',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    gap: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.warning + '20',
  },
  text: {
    flex: 1,
    fontFamily: FONTS.medium,
    fontSize: FONTS.sizes.sm,
    color: COLORS.warning,
  },
  btn: {
    backgroundColor: COLORS.warning,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
  },
  btnText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.xs,
    color: COLORS.white,
  },
});
