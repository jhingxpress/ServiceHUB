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

// ─── Snap config ───────────────────────────────────────────────────────────────
const PEEK_HEIGHT  = 72;   // always-visible strip
const FULL_HEIGHT  = 380;  // expanded height

export type SheetState = 'peek' | 'full';

export interface MapboxBottomSheetProps {
  sheetState?: SheetState;
  onStateChange?: (state: SheetState) => void;
  statusText?: string;
  children?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export default function MapboxBottomSheet({
  sheetState = 'peek',
  onStateChange,
  statusText = 'Exploring map…',
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

      {/* Sheet content — filled by parent in future sprints */}
      <View style={styles.content}>
        {children ?? (
          <View style={styles.placeholder}>
            <Ionicons name="search-outline" size={32} color={COLORS.textLight} />
            <Text style={styles.placeholderTitle}>Provider search coming soon</Text>
            <Text style={styles.placeholderSub}>
              Sprint 6.0B will add nearby provider cards and filters here.
            </Text>
          </View>
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
});
