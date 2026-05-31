import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

interface Props {
  name: string;
  category?: string;
  priceRange: string;
  durationMinutes?: number;
  description?: string | null;
}

export default function ServiceHeader({ name, category, priceRange, durationMinutes, description }: Props) {
  return (
    <View style={styles.card}>
      {category ? (
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{category}</Text>
        </View>
      ) : null}
      <Text style={styles.serviceName}>{name}</Text>
      <Text style={styles.priceText}>{priceRange}</Text>
      {durationMinutes ? (
        <View style={styles.durationRow}>
          <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} />
          <Text style={styles.durationText}>{durationMinutes} min</Text>
        </View>
      ) : null}
      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primaryLight,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    marginBottom: SPACING.sm,
  },
  categoryBadgeText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.primary },
  serviceName: { fontSize: FONTS.sizes.xxl, fontFamily: FONTS.bold, color: COLORS.text },
  priceText: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.primary, marginTop: SPACING.xs },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACING.xs },
  durationText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  description: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: SPACING.md, lineHeight: 20 },
});
