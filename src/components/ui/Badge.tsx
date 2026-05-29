import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, STATUS_COLORS } from '../../constants/theme';

interface BadgeProps {
  label: string;
  status?: string;
  color?: string;
  bgColor?: string;
  style?: ViewStyle;
  size?: 'sm' | 'md';
}

export default function Badge({
  label,
  status,
  color,
  bgColor,
  style,
  size = 'md',
}: BadgeProps) {
  const statusStyle = status ? STATUS_COLORS[status] : null;
  const textColor = color ?? statusStyle?.text ?? COLORS.primary;
  const backgroundColor = bgColor ?? statusStyle?.bg ?? COLORS.primaryLight;

  return (
    <View
      style={[
        styles.badge,
        size === 'sm' && styles.small,
        { backgroundColor },
        style,
      ]}
    >
      <Text style={[styles.text, size === 'sm' && styles.smallText, { color: textColor }]}>
        {label.replace(/_/g, ' ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
  },
  small: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  text: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.xs,
    letterSpacing: 0.3,
    textTransform: 'capitalize',
  },
  smallText: {
    fontSize: 10,
  },
});
