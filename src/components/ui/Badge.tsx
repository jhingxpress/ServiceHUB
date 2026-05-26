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
        {label.replace('_', ' ').toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'flex-start',
  },
  small: {
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 2,
  },
  text: {
    fontSize: FONTS.sizes.xs,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  smallText: {
    fontSize: 10,
  },
});
