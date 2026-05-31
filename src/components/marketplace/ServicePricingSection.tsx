import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ServiceOption } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

interface Props {
  options: ServiceOption[];
  basePrice?: number;
}

const formatPrice = (amount: number) => `₱${amount.toLocaleString('en-PH')}`;

export default function ServicePricingSection({ options, basePrice }: Props) {
  if (options.length === 0 && (!basePrice || basePrice <= 0)) {
    return null;
  }

  const displayOptions = options.length > 0 ? options : [
    { id: 'base', name: 'Standard Service', description: null, price: basePrice ?? 0, is_active: true } as ServiceOption,
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Pricing Options</Text>
      {displayOptions.map((opt) => (
        <View key={opt.id} style={styles.row}>
          <View style={styles.info}>
            <Text style={styles.name}>{opt.name}</Text>
            {opt.description ? <Text style={styles.desc}>{opt.description}</Text> : null}
          </View>
          <Text style={styles.price}>{formatPrice(opt.price)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    gap: SPACING.md,
    ...SHADOWS.small,
  },
  title: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  info: { flex: 1, marginRight: SPACING.sm },
  name: { fontSize: FONTS.sizes.base, fontFamily: FONTS.medium, color: COLORS.text },
  desc: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  price: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.primary },
});
