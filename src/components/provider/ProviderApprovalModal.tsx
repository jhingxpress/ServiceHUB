import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProviderStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Button from '../ui/Button';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;

interface Props {
  visible: boolean;
  progressText: string;
  onDismiss: () => void;
}

export default function ProviderApprovalModal({ visible, progressText, onDismiss }: Props) {
  const navigation = useNavigation<NavProp>();

  const handleSetupServices = () => {
    onDismiss();
    navigation.navigate('ManageServices');
  };

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="checkmark-circle" size={56} color={COLORS.success} />
          </View>

          <Text style={styles.title}>Account Verified</Text>
          <Text style={styles.subtitle}>
            Congratulations! Your provider account has been approved and is now visible to customers.
          </Text>

          <View style={styles.divider} />

          <Text style={styles.stepsTitle}>Complete the steps below to start receiving bookings</Text>
          <Text style={styles.progressText}>{progressText}</Text>

          <View style={styles.buttonRow}>
            <Button
              title="Setup My Services"
              onPress={handleSetupServices}
              fullWidth
              size="lg"
              style={{ flex: 1 }}
            />
          </View>

          <TouchableOpacity onPress={onDismiss} style={styles.maybeLater}>
            <Text style={styles.maybeLaterText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: SPACING.md,
    ...SHADOWS.large,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: SPACING.sm,
  },
  stepsTitle: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    textAlign: 'center',
  },
  progressText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.primary,
    fontFamily: FONTS.semiBold,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    marginTop: SPACING.sm,
  },
  maybeLater: {
    paddingVertical: SPACING.sm,
  },
  maybeLaterText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textLight,
    fontFamily: FONTS.medium,
  },
});
