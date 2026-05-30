import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProviderChecklist } from '../../types';
import { ProviderStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;

interface Props {
  checklist: ProviderChecklist | null;
}

const CHECKLIST_ITEMS: { key: keyof ProviderChecklist; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; navTarget?: string }[] = [
  { key: 'is_approved', label: 'Provider Approved', icon: 'shield-checkmark-outline' },
  { key: 'has_first_service', label: 'Add First Service', icon: 'construct-outline', navTarget: 'ManageServices' },
  { key: 'has_pricing', label: 'Set Service Pricing', icon: 'pricetag-outline', navTarget: 'ManageServices' },
  { key: 'has_photos', label: 'Upload Service Photos', icon: 'images-outline', navTarget: 'ProfileSetup' },
  { key: 'has_schedule', label: 'Configure Schedule', icon: 'calendar-outline', navTarget: 'Schedule' },
  { key: 'has_first_booking', label: 'Receive First Booking', icon: 'gift-outline' },
];

export default function OnboardingChecklist({ checklist }: Props) {
  const navigation = useNavigation<NavProp>();

  if (!checklist) return null;

  const completed = CHECKLIST_ITEMS.filter((item) => checklist[item.key] === true).length;
  const total = CHECKLIST_ITEMS.length;
  const percent = Math.round((completed / total) * 100);

  if (completed >= total) return null;

  const handlePress = (item: typeof CHECKLIST_ITEMS[0]) => {
    if (item.navTarget) {
      if (item.navTarget === 'Schedule') {
        navigation.getParent()?.navigate('Schedule');
      } else {
        navigation.navigate(item.navTarget as any);
      }
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Get Your Business Ready</Text>
          <Text style={styles.subtitle}>{completed}/{total} Complete</Text>
        </View>
        <View style={styles.percentBadge}>
          <Text style={styles.percentText}>{percent}%</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent}%` }]} />
      </View>

      {/* Items */}
      <View style={styles.items}>
        {CHECKLIST_ITEMS.map((item) => {
          const done = checklist[item.key] === true;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.item, done && styles.itemDone]}
              onPress={() => handlePress(item)}
              activeOpacity={0.7}
            >
              <View style={[styles.itemIconWrap, done ? styles.itemIconDone : styles.itemIconTodo]}>
                <Ionicons
                  name={done ? 'checkmark' : item.icon}
                  size={16}
                  color={done ? COLORS.success : COLORS.primary}
                />
              </View>
              <Text style={[styles.itemLabel, done && styles.itemLabelDone]}>{item.label}</Text>
            </TouchableOpacity>
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
  headerLeft: {
    gap: 2,
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
  percentBadge: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  percentText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.semiBold,
    color: COLORS.primary,
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
  itemIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconTodo: {
    backgroundColor: COLORS.primaryLight,
  },
  itemIconDone: {
    backgroundColor: COLORS.successLight,
  },
  itemLabel: {
    flex: 1,
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.medium,
    color: COLORS.text,
  },
  itemLabelDone: {
    textDecorationLine: 'line-through',
    color: COLORS.textLight,
  },
});
