import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../../constants/theme';

interface Props {
  size?: 'sm' | 'md';
  style?: object;
}

export default function FeaturedBadge({ size = 'sm', style }: Props) {
  const iconSize = size === 'md' ? 12 : 10;
  const fontSize = size === 'md' ? FONTS.sizes.xs : 9;
  const paddingH = size === 'md' ? 10 : 6;
  const paddingV = size === 'md' ? 4 : 2;

  return (
    <View style={[styles.badge, { paddingHorizontal: paddingH, paddingVertical: paddingV }, style]}>
      <Ionicons name="star" size={iconSize} color={COLORS.warning} />
      <Text style={[styles.text, { fontSize }]}>Featured</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.warningLight,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: FONTS.semiBold,
    color: '#92400E',
  },
});
