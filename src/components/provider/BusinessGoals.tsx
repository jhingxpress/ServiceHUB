import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

interface Props {
  completedJobs: number;
  totalBookings: number;
  totalReviews: number;
  earnings: number;
  rating: number;
}

interface Goal {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  done: boolean;
}

export default function BusinessGoals({ completedJobs, totalBookings, totalReviews, earnings, rating }: Props) {
  const goals: Goal[] = [
    { label: 'Receive First Booking', icon: 'gift-outline', done: totalBookings >= 1 },
    { label: 'Complete First Job', icon: 'checkmark-done-outline', done: completedJobs >= 1 },
    { label: 'Receive First Review', icon: 'star-outline', done: totalReviews >= 1 },
    { label: 'Earn First ₱1,000', icon: 'cash-outline', done: earnings >= 1000 },
    { label: 'Reach 10 Completed Jobs', icon: 'trophy-outline', done: completedJobs >= 10 },
    { label: 'Become Top Rated Provider', icon: 'ribbon-outline', done: rating >= 4.5 && totalReviews >= 10 },
  ];

  const completed = goals.filter((g) => g.done).length;
  const nextGoal = goals.find((g) => !g.done);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Business Goals</Text>
          <Text style={styles.subtitle}>{completed}/{goals.length} Completed</Text>
        </View>
        {completed === goals.length && (
          <View style={styles.allDoneBadge}>
            <Ionicons name="trophy" size={14} color={COLORS.white} />
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(completed / goals.length) * 100}%` }]} />
      </View>

      {/* Next milestone */}
      {nextGoal && (
        <View style={styles.nextGoalRow}>
          <Ionicons name="flag-outline" size={14} color={COLORS.primary} />
          <Text style={styles.nextGoalLabel}>Next:</Text>
          <Text style={styles.nextGoalText}>{nextGoal.label}</Text>
        </View>
      )}

      <View style={styles.items}>
        {goals.map((goal) => (
          <View key={goal.label} style={[styles.item, goal.done && styles.itemDone]}>
            <View style={[styles.iconWrap, goal.done ? styles.iconDone : styles.iconTodo]}>
              <Ionicons
                name={goal.done ? 'checkmark' : goal.icon}
                size={14}
                color={goal.done ? COLORS.success : COLORS.primary}
              />
            </View>
            <Text style={[styles.label, goal.done && styles.labelDone]}>{goal.label}</Text>
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
  subtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
  items: {
    gap: SPACING.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  itemDone: {
    opacity: 0.7,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTodo: {
    backgroundColor: COLORS.primaryLight,
  },
  iconDone: {
    backgroundColor: COLORS.successLight,
  },
  label: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.medium,
    color: COLORS.text,
  },
  labelDone: {
    textDecorationLine: 'line-through',
    color: COLORS.textLight,
  },
  progressTrack: {
    height: 6,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.full,
  },
  allDoneBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextGoalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primaryLight,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  nextGoalLabel: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.semiBold,
    color: COLORS.primary,
  },
  nextGoalText: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.medium,
    color: COLORS.text,
    flex: 1,
  },
});
