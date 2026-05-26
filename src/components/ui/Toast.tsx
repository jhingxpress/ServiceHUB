import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { useToast, ToastType } from '../../hooks/useToast';

const TYPE_CONFIG: Record<ToastType, { icon: string; bgColor: string; textColor: string }> = {
  success: { icon: 'checkmark-circle', bgColor: COLORS.success, textColor: COLORS.white },
  error: { icon: 'close-circle', bgColor: COLORS.error, textColor: COLORS.white },
  warning: { icon: 'warning', bgColor: COLORS.warning, textColor: COLORS.text },
  info: { icon: 'information-circle', bgColor: COLORS.primary, textColor: COLORS.white },
};

export default function Toast() {
  const { toasts, hideToast } = useToast();

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map((toast) => {
        const config = TYPE_CONFIG[toast.type];
        return (
          <ToastItem
            key={toast.id}
            message={toast.message}
            icon={config.icon}
            bgColor={config.bgColor}
            textColor={config.textColor}
            onHide={() => hideToast(toast.id)}
          />
        );
      })}
    </View>
  );
}

function ToastItem({
  message,
  icon,
  bgColor,
  textColor,
  onHide,
}: {
  message: string;
  icon: string;
  bgColor: string;
  textColor: string;
  onHide: () => void;
}) {
  const animatedValue = React.useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleHide = () => {
    Animated.timing(animatedValue, {
      toValue: -100,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onHide());
  };

  return (
    <Animated.View style={[styles.toast, { backgroundColor: bgColor, transform: [{ translateY: animatedValue }] }]}>
      <Ionicons name={icon as any} size={20} color={textColor} />
      <Text style={[styles.message, { color: textColor }]}>{message}</Text>
      <TouchableOpacity onPress={handleHide} style={styles.closeBtn}>
        <Ionicons name="close" size={16} color={textColor} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: SPACING.md,
    paddingTop: SPACING.lg,
    gap: SPACING.sm,
    zIndex: 1000,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.medium,
  },
  message: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    fontWeight: '600',
  },
  closeBtn: {
    padding: SPACING.xs,
  },
});
