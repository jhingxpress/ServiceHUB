import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../stores/authStore';
import { validators } from '../../utils/validation';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../../constants/theme';
import Button from '../../components/ui/Button';

export default function StaffChangePasswordScreen() {
  const { changePassword, user, currentPassword } = useAuthStore();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = (): boolean => {
    const pwdError = validators.password(newPassword);
    setNewPasswordError(pwdError);
    if (pwdError) return false;
    if (newPassword !== confirmPassword) {
      setConfirmError('Passwords do not match');
      return false;
    }
    setConfirmError(null);
    return true;
  };

  const handleContinue = async () => {
    if (!validate()) return;
    setLoading(true);
    const result = await changePassword(newPassword, currentPassword ?? undefined);
    setLoading(false);
    if (!result.success) {
      Alert.alert('Error', result.error ?? 'Failed to update password');
      return;
    }
    Alert.alert('Success', 'Your password has been updated. Welcome to TAGA.');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Welcome to TAGA</Text>
          <Text style={styles.subtitle}>
            For security purposes, please change your temporary password before continuing.
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>New Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter new password"
              placeholderTextColor={COLORS.textLight}
              secureTextEntry
              autoCapitalize="none"
              value={newPassword}
              onChangeText={(text) => {
                setNewPassword(text);
                setNewPasswordError(validators.password(text));
              }}
            />
            {newPasswordError ? <Text style={styles.errorText}>{newPasswordError}</Text> : null}

            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor={COLORS.textLight}
              secureTextEntry
              autoCapitalize="none"
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setConfirmError(text === newPassword ? null : 'Passwords do not match');
              }}
            />
            {confirmError ? <Text style={styles.errorText}>{confirmError}</Text> : null}

            <Text style={styles.hint}>
              Must be at least 8 characters with one uppercase, one lowercase, and one number.
            </Text>

            <Button
              title="Continue"
              onPress={handleContinue}
              loading={loading}
              fullWidth
              style={{ marginTop: SPACING.md }}
            />
          </View>

          {user?.email && (
            <Text style={styles.emailText}>Signed in as {user.email}</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  title: {
    fontSize: FONTS.sizes.xxl,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONTS.sizes.base,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  form: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  label: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.base,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  errorText: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.error,
    marginBottom: SPACING.sm,
  },
  hint: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  emailText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
});
