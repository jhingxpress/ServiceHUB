import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { useAuthStore } from '../../stores/authStore';
import { useRecaptcha } from '../../components/recaptcha/RecaptchaV3';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'RoleSelection'>;

type Role = 'customer' | 'provider';

export default function RoleSelectionScreen({ route, navigation }: Props) {
  const { email, password, fullName, phone } = route.params;
  const [selected, setSelected] = useState<Role | null>(null);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuthStore();
  const { execute } = useRecaptcha();

  const handleContinue = async () => {
    if (!selected) {
      Alert.alert('Select a role', 'Please choose how you want to use ServiceHub.');
      return;
    }

    setLoading(true);
    try {
      const captchaToken = await execute('register');
      await signUp({ email, password, fullName, role: selected, phone }, captchaToken);
      navigation.navigate('EmailVerification');
    } catch (err: any) {
      if (err?.message?.includes('reCAPTCHA')) {
        Alert.alert('Security Check Failed', err?.message ?? 'Please try again.');
      } else {
        Alert.alert('Sign Up Failed', err?.message ?? 'Unknown error');
      }
    } finally {
      setLoading(false);
    }
  };

  const ROLES: { id: Role; title: string; subtitle: string; icon: React.ComponentProps<typeof Ionicons>['name']; features: string[] }[] = [
    {
      id: 'customer',
      title: 'I need services',
      subtitle: 'Find and book skilled professionals near you',
      icon: 'search-outline',
      features: ['Book any service', 'Real-time tracking', 'Secure payments', 'Rate providers'],
    },
    {
      id: 'provider',
      title: 'I offer services',
      subtitle: 'Grow your business and earn more',
      icon: 'briefcase-outline',
      features: ['Accept bookings', 'Manage schedule', 'Track earnings', 'Build reputation'],
    },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={22} color={COLORS.text} />
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={styles.title}>How will you use{'\n'}ServiceHub?</Text>
        <Text style={styles.subtitle}>Choose your role — you can always change this later.</Text>

        <View style={styles.roles}>
          {ROLES.map((role) => {
            const isSelected = selected === role.id;
            return (
              <TouchableOpacity
                key={role.id}
                style={[styles.roleCard, isSelected && styles.roleCardSelected]}
                onPress={() => setSelected(role.id)}
                activeOpacity={0.8}
              >
                <View style={[styles.roleIcon, isSelected && styles.roleIconSelected]}>
                  <Ionicons name={role.icon} size={30} color={isSelected ? COLORS.white : COLORS.primary} />
                </View>
                <View style={styles.roleBody}>
                  <Text style={[styles.roleTitle, isSelected && styles.roleTitleSelected]}>{role.title}</Text>
                  <Text style={[styles.roleSubtitle, isSelected && styles.roleSubtitleSelected]}>{role.subtitle}</Text>
                  <View style={styles.featureList}>
                    {role.features.map((f) => (
                      <View key={f} style={styles.featureRow}>
                        <Ionicons
                          name="checkmark-circle"
                          size={14}
                          color={isSelected ? 'rgba(255,255,255,0.8)' : COLORS.success}
                        />
                        <Text style={[styles.featureText, isSelected && styles.featureTextSelected]}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={14} color={COLORS.white} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.continueBtn, !selected && styles.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!selected || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <Text style={styles.continueBtnText}>Create Account</Text>
              <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.terms}>
          By creating an account you agree to our{' '}
          <Text style={styles.termsLink}>Terms of Service</Text> and{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  backBtn: {
    marginTop: SPACING.sm,
    marginLeft: SPACING.md,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  content: { flex: 1, paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  title: {
    fontSize: FONTS.sizes.xxxl, fontFamily: FONTS.bold, color: COLORS.text,
    lineHeight: 40, marginBottom: SPACING.sm,
  },
  subtitle: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, marginBottom: SPACING.xl },
  roles: { gap: SPACING.md, marginBottom: SPACING.xl },
  roleCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 2, borderColor: COLORS.border, ...SHADOWS.medium,
  },
  roleCardSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  roleIcon: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  roleIconSelected: { backgroundColor: 'rgba(255,255,255,0.2)' },
  roleBody: { flex: 1 },
  roleTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.text, marginBottom: 2 },
  roleTitleSelected: { color: COLORS.white },
  roleSubtitle: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  roleSubtitleSelected: { color: 'rgba(255,255,255,0.75)' },
  featureList: { gap: 5 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  featureText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  featureTextSelected: { color: 'rgba(255,255,255,0.8)' },
  checkBadge: {
    position: 'absolute', top: SPACING.sm, right: SPACING.sm,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center',
  },
  continueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.md + 2, marginBottom: SPACING.md, ...SHADOWS.medium,
  },
  continueBtnDisabled: { backgroundColor: COLORS.border },
  continueBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.white },
  terms: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, textAlign: 'center', lineHeight: 18 },
  termsLink: { color: COLORS.primary, fontFamily: FONTS.semiBold },
});
