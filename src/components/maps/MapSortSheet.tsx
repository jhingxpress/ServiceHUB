/**
 * MapSortSheet — Sprint 6.5
 *
 * Slide-up sort bottom sheet for MapboxDiscoveryScreen.
 * No database calls — sorts the current filteredMarkers array only.
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

export type SortOption =
  | 'nearest'
  | 'top_rated'
  | 'most_reviews'
  | 'featured_first'
  | 'open_now';

interface SortOptionDef {
  value: SortOption;
  label: string;
  sub: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const SORT_OPTIONS: SortOptionDef[] = [
  { value: 'nearest',        label: 'Nearest',        sub: 'Closest providers first',    icon: 'location-outline' },
  { value: 'top_rated',      label: 'Highest Rated',  sub: 'Best star ratings first',    icon: 'star-outline' },
  { value: 'most_reviews',   label: 'Most Reviews',   sub: 'Most reviewed first',        icon: 'chatbubble-outline' },
  { value: 'featured_first', label: 'Featured First', sub: 'Featured providers on top',  icon: 'sparkles-outline' },
  { value: 'open_now',       label: 'Open Now',       sub: 'Available providers first',  icon: 'time-outline' },
];

interface Props {
  visible: boolean;
  current: SortOption;
  onApply: (sort: SortOption) => void;
  onClose: () => void;
}

export default function MapSortSheet({ visible, current, onApply, onClose }: Props) {
  const [selected, setSelected] = useState<SortOption>(current);

  useEffect(() => {
    if (visible) setSelected(current);
  }, [visible, current]);

  const handleApply = () => {
    onApply(selected);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1} />
      <View style={styles.sheet}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Sort Providers</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* Options */}
        {SORT_OPTIONS.map((opt) => {
          const active = selected === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => setSelected(opt.value)}
              activeOpacity={0.8}
            >
              <View style={[styles.optionIcon, active && styles.optionIconActive]}>
                <Ionicons
                  name={opt.icon}
                  size={18}
                  color={active ? COLORS.surface : COLORS.primary}
                />
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={styles.optionSub}>{opt.sub}</Text>
              </View>
              <Ionicons
                name={active ? 'radio-button-on' : 'radio-button-off'}
                size={20}
                color={active ? COLORS.primary : COLORS.textLight}
              />
            </TouchableOpacity>
          );
        })}

        {/* Apply */}
        <TouchableOpacity style={styles.applyBtn} onPress={handleApply} activeOpacity={0.85}>
          <Text style={styles.applyText}>Apply</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl,
    paddingTop: SPACING.sm,
    ...SHADOWS.medium,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    marginBottom: SPACING.sm,
  },
  title: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.lg, color: COLORS.text },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
  },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  optionIcon: {
    width: 40, height: 40, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  optionIconActive: { backgroundColor: COLORS.primary },
  optionText: { flex: 1 },
  optionLabel: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
  },
  optionLabelActive: { color: COLORS.primary },
  optionSub: {
    fontFamily: FONTS.regular,
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },

  applyBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  applyText: {
    fontFamily: FONTS.bold,
    fontSize: FONTS.sizes.base,
    color: COLORS.surface,
  },
});
