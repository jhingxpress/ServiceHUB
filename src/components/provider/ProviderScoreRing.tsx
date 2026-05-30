import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ProviderScore } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

interface Props {
  score: ProviderScore | null;
}

const TIER_COLORS = {
  green: { bg: '#D1FAE5', text: '#065F46', ring: '#10B981' },
  yellow: { bg: '#FEF3C7', text: '#92400E', ring: '#F59E0B' },
  red: { bg: '#FEE2E2', text: '#991B1B', ring: '#EF4444' },
};

export default function ProviderScoreRing({ score }: Props) {
  if (!score) return null;

  const tier = TIER_COLORS[score.color_tier] ?? TIER_COLORS.red;
  const circumference = 2 * Math.PI * 40; // radius = 40
  const strokeDashoffset = circumference - (score.score / 100) * circumference;

  return (
    <View style={[styles.card, { borderColor: tier.ring }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Provider Score</Text>
        <View style={[styles.tierBadge, { backgroundColor: tier.bg }]}>
          <Text style={[styles.tierText, { color: tier.text }]}>
            {score.color_tier === 'green' ? 'Excellent' : score.color_tier === 'yellow' ? 'Good' : 'Needs Work'}
          </Text>
        </View>
      </View>

      <View style={styles.ringWrap}>
        <View style={styles.ringContainer}>
          <View style={styles.ringBackground} />
          <View
            style={[
              styles.ringProgress,
              {
                borderColor: tier.ring,
                transform: [{ rotate: '-90deg' }],
                borderBottomColor: 'transparent',
                borderLeftColor: 'transparent',
              },
            ]}
          />
          <View style={styles.ringInner}>
            <Text style={[styles.scoreValue, { color: tier.ring }]}>{score.score}%</Text>
          </View>
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.legendText}>90-100 Excellent</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.legendText}>75-89 Good</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.legendText}>Below 75 Needs Improvement</Text>
          </View>
        </View>
      </View>

      {/* Explanation */}
      <View style={styles.explanation}>
        <Text style={styles.explanationTitle}>Your visibility to customers depends on:</Text>
        {[
          'Service Setup',
          'Pricing Completion',
          'Portfolio Photos',
          'Response Rate',
          'Completed Jobs',
          'Customer Ratings',
        ].map((factor) => (
          <View key={factor} style={styles.factorRow}>
            <View style={[styles.legendDot, { backgroundColor: tier.ring }]} />
            <Text style={styles.factorText}>{factor}</Text>
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
    borderWidth: 2,
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
  tierBadge: {
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  tierText: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.semiBold,
  },
  ringWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  ringContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  ringBackground: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 8,
    borderColor: COLORS.background,
  },
  ringProgress: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 8,
  },
  ringInner: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreValue: {
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.bold,
  },
  legend: {
    flex: 1,
    gap: SPACING.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
  explanation: {
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  explanationTitle: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  factorText: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
});
