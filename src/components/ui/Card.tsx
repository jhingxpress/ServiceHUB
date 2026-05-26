import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, BORDER_RADIUS, SPACING, SHADOWS } from '../../constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: 'none' | 'small' | 'medium' | 'large';
}

export default function Card({
  children,
  style,
  padding = 'md',
  shadow = 'small',
}: CardProps) {
  return (
    <View
      style={[
        styles.card,
        padding !== 'none' && styles[`pad_${padding}`],
        shadow !== 'none' && SHADOWS[shadow],
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pad_sm: { padding: SPACING.sm },
  pad_md: { padding: SPACING.md },
  pad_lg: { padding: SPACING.lg },
});
