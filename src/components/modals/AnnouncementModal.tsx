import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

export type PriorityType = 'announcement' | 'maintenance' | 'policy_update';

interface AnnouncementModalProps {
  visible: boolean;
  title: string;
  message: string;
  type: PriorityType;
  onClose: () => void;
}

const TYPE_CONFIG: Record<PriorityType, { icon: string; color: string; bg: string }> = {
  announcement: {
    icon: '📢',
    color: COLORS.primary,
    bg: COLORS.primaryLight + '60',
  },
  maintenance: {
    icon: '🛠',
    color: COLORS.warning,
    bg: COLORS.warningLight + '60',
  },
  policy_update: {
    icon: '📜',
    color: COLORS.info,
    bg: COLORS.infoLight + '60',
  },
};

export default function AnnouncementModal({
  visible,
  title,
  message,
  type,
  onClose,
}: AnnouncementModalProps) {
  const config = TYPE_CONFIG[type];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card} pointerEvents="box-none">
          <View style={styles.cardInner}>
            <View style={[styles.iconCircle, { backgroundColor: config.bg }]}>
              <Text style={styles.iconText}>{config.icon}</Text>
            </View>

            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>

            <TouchableOpacity
              style={[styles.okButton, { backgroundColor: config.color }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={styles.okButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    ...SHADOWS.large,
  },
  cardInner: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  iconText: {
    fontSize: 32,
  },
  title: {
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  message: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  okButton: {
    width: '100%',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  okButtonText: {
    fontSize: FONTS.sizes.md,
    fontFamily: FONTS.semiBold,
    color: COLORS.white,
  },
});
