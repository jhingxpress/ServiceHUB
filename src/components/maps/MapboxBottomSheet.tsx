import React, { useRef, useEffect, useCallback } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { ProviderMarkerData } from './ProviderMarker';

// ─── Snap config ───────────────────────────────────────────────────────────────
const PEEK_HEIGHT  = 72;   // always-visible strip
const FULL_HEIGHT  = 380;  // expanded height

export type SheetState = 'peek' | 'full';

export interface MapboxBottomSheetProps {
  sheetState?: SheetState;
  onStateChange?: (state: SheetState) => void;
  statusText?: string;
  selectedProvider?: ProviderMarkerData | null;
  onViewProfile?: (id: string) => void;
  children?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export default function MapboxBottomSheet({
  sheetState = 'peek',
  onStateChange,
  statusText = 'Exploring map…',
  selectedProvider,
  onViewProfile,
  children,
  containerStyle,
}: MapboxBottomSheetProps) {
  const translateY = useRef(
    new Animated.Value(FULL_HEIGHT - PEEK_HEIGHT),
  ).current;

  const snapTo = useCallback(
    (state: SheetState) => {
      const toValue = state === 'full' ? 0 : FULL_HEIGHT - PEEK_HEIGHT;
      Animated.spring(translateY, {
        toValue,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
      }).start();
      onStateChange?.(state);
    },
    [translateY, onStateChange],
  );

  useEffect(() => {
    snapTo(sheetState);
  }, [sheetState, snapTo]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 5,
      onPanResponderMove: (_, gs) => {
        const newY = Math.max(0, Math.min(FULL_HEIGHT - PEEK_HEIGHT, gs.dy));
        translateY.setValue(newY);
      },
      onPanResponderRelease: (_, gs) => {
        const isExpanded = gs.dy < (FULL_HEIGHT - PEEK_HEIGHT) / 2;
        snapTo(isExpanded ? 'full' : 'peek');
      },
    }),
  ).current;

  const toggleSheet = () =>
    snapTo(sheetState === 'full' ? 'peek' : 'full');

  return (
    <Animated.View
      style={[
        styles.sheet,
        { height: FULL_HEIGHT, transform: [{ translateY }] },
        containerStyle,
      ]}
    >
      {/* Drag handle + toggle */}
      <TouchableOpacity
        {...panResponder.panHandlers}
        onPress={toggleSheet}
        style={styles.handleArea}
        activeOpacity={1}
      >
        <View style={styles.handle} />
        <View style={styles.peekRow}>
          <View style={styles.peekLeft}>
            <Ionicons name="map-outline" size={16} color={COLORS.primary} />
            <Text style={styles.peekText}>{statusText}</Text>
          </View>
          <Ionicons
            name={sheetState === 'full' ? 'chevron-down' : 'chevron-up'}
            size={16}
            color={COLORS.textLight}
          />
        </View>
      </TouchableOpacity>

      {/* Sheet content */}
      <View style={styles.content}>
        {selectedProvider ? (
          <View style={styles.providerCard}>
            {selectedProvider.isFeatured && (
              <View style={styles.featuredRow}>
                <View style={styles.featuredBadge}>
                  <Text style={styles.featuredText}>⭐ Featured Provider</Text>
                </View>
              </View>
            )}
            <Text style={styles.providerName} numberOfLines={2}>
              {selectedProvider.name}
            </Text>
            {!!selectedProvider.category && (
              <View style={styles.categoryPill}>
                <Text style={styles.categoryText}>{selectedProvider.category}</Text>
              </View>
            )}
            <View style={styles.providerMeta}>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={13} color="#F59E0B" />
                <Text style={styles.ratingVal}>
                  {selectedProvider.rating > 0 ? selectedProvider.rating.toFixed(1) : 'No rating'}
                </Text>
                {(selectedProvider.totalReviews ?? 0) > 0 && (
                  <Text style={styles.reviewCount}>
                    · {selectedProvider.totalReviews} review{selectedProvider.totalReviews !== 1 ? 's' : ''}
                  </Text>
                )}
              </View>
              {(selectedProvider.hourlyRate ?? 0) > 0 && (
                <Text style={styles.rateText}>₱{selectedProvider.hourlyRate}/hr</Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.viewProfileBtn}
              onPress={() => onViewProfile?.(selectedProvider.id)}
              activeOpacity={0.85}
            >
              <Text style={styles.viewProfileText}>View Profile</Text>
              <Ionicons name="arrow-forward-outline" size={14} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        ) : (
          children ?? (
            <View style={styles.placeholder}>
              <Ionicons name="location-outline" size={32} color={COLORS.textLight} />
              <Text style={styles.placeholderTitle}>Tap a marker to explore</Text>
              <Text style={styles.placeholderSub}>
                Provider details will appear here.
              </Text>
            </View>
          )
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    ...SHADOWS.large,
  },
  handleArea: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginBottom: SPACING.sm,
  },
  peekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: SPACING.sm,
  },
  peekLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  peekText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingBottom: SPACING.xl,
  },
  placeholderTitle: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  placeholderSub: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.regular,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },
  providerCard: { gap: SPACING.sm },
  featuredRow: { flexDirection: 'row' },
  featuredBadge: {
    backgroundColor: '#FEF3C7', borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: '#FDE68A',
    alignSelf: 'flex-start',
  },
  featuredText: {
    fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: '#B45309',
  },
  providerName: {
    fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold,
    color: COLORS.text, lineHeight: 26,
  },
  categoryPill: {
    alignSelf: 'flex-start', backgroundColor: COLORS.primaryLight,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 2,
  },
  categoryText: {
    fontSize: FONTS.sizes.xs, fontFamily: FONTS.medium, color: COLORS.primary,
  },
  providerMeta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingVal: {
    fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text,
  },
  reviewCount: { fontSize: FONTS.sizes.sm, color: COLORS.textLight },
  rateText: {
    fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.textSecondary,
  },
  viewProfileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.xl, paddingVertical: SPACING.sm + 2,
    marginTop: SPACING.xs, ...SHADOWS.small,
  },
  viewProfileText: {
    fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.white,
  },
});
