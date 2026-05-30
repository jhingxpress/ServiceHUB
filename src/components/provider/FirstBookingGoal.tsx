import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

interface Props {
  totalBookings: number;
}

const TIPS: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }[] = [
  { icon: 'pricetag-outline', text: 'Add pricing to your services' },
  { icon: 'images-outline', text: 'Upload portfolio photos' },
  { icon: 'calendar-outline', text: 'Complete your availability schedule' },
  { icon: 'flash-outline', text: 'Respond quickly to booking requests' },
];

export default function FirstBookingGoal({ totalBookings }: Props) {
  if (totalBookings > 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.goalIconWrap}>
          <Ionicons name="trophy-outline" size={24} color={COLORS.warning} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Goal: Receive Your First Booking</Text>
          <Text style={styles.subtitle}>Complete these steps to get noticed by customers</Text>
        </View>
      </View>

      <View style={styles.tips}>
        {TIPS.map((tip, i) => (
          <View key={i} style={styles.tipRow}>
            <Ionicons name={tip.icon} size={16} color={COLORS.primary} />
            <Text style={styles.tipText}>{tip.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.warning + '40',
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.md,
    ...SHADOWS.small,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  goalIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
  tips: {
    gap: SPACING.sm,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  tipText: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
});
