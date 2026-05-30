import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProviderPerformance } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

interface Props {
  performance: ProviderPerformance | null;
}

const METRICS: { key: keyof ProviderPerformance; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string; suffix?: string }[] = [
  { key: 'profile_views', label: 'Profile Views', icon: 'eye-outline', color: '#8B5CF6' },
  { key: 'total_bookings', label: 'Bookings', icon: 'calendar-outline', color: COLORS.primary },
  { key: 'conversion_rate', label: 'Conversion', icon: 'trending-up-outline', color: COLORS.success, suffix: '%' },
  { key: 'response_rate', label: 'Response Rate', icon: 'chatbubble-outline', color: '#2563EB', suffix: '%' },
  { key: 'completion_rate', label: 'Completion', icon: 'checkmark-done-outline', color: '#059669', suffix: '%' },
];

export default function PerformanceCard({ performance }: Props) {
  if (!performance) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Business Performance</Text>
        <Ionicons name="analytics-outline" size={20} color={COLORS.primary} />
      </View>
      <View style={styles.grid}>
        {METRICS.map((m) => {
          const raw = performance[m.key];
          const value = raw == null ? '0' : typeof raw === 'number' && m.key !== 'profile_views' && m.key !== 'total_bookings'
            ? raw.toFixed(1)
            : String(raw);
          return (
            <View key={m.key} style={styles.metric}>
              <View style={[styles.iconWrap, { backgroundColor: m.color + '15' }]}>
                <Ionicons name={m.icon} size={18} color={m.color} />
              </View>
              <Text style={styles.metricValue}>
                {value}{m.suffix ?? ''}
              </Text>
              <Text style={styles.metricLabel}>{m.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.md,
    ...SHADOWS.small,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  metric: {
    flex: 1,
    minWidth: '30%',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },
  metricLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    fontFamily: FONTS.medium,
  },
});
