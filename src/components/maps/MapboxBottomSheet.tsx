import React, { useRef, useEffect, useCallback } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { ProviderMarkerData, OpenStatus, formatDistance } from './ProviderMarker';

// ─── Snap config ───────────────────────────────────────────────────────────────
const PEEK_HEIGHT  = 72;   // always-visible strip
const FULL_HEIGHT  = 440;  // expanded height

export type SheetState = 'peek' | 'full';

export interface MapboxBottomSheetProps {
  sheetState?: SheetState;
  onStateChange?: (state: SheetState) => void;
  statusText?: string;
  selectedProvider?: ProviderMarkerData | null;
  onViewProfile?: (id: string) => void;
  onBookNow?: (id: string) => void;
  routeDistanceKm?: number | null;
  routeEtaMin?: number | null;
  children?: React.ReactNode;
  containerStyle?: ViewStyle;
}

function openStatusLabel(s: OpenStatus): string {
  if (s === 'open') return '🟢 Open Now';
  if (s === 'closing_soon') return '🟡 Closing Soon';
  return '🔴 Closed';
}
function openStatusBg(s: OpenStatus): string {
  if (s === 'open') return '#DCFCE7';
  if (s === 'closing_soon') return '#FEF3C7';
  return '#FEE2E2';
}
function openStatusColor(s: OpenStatus): string {
  if (s === 'open') return '#166534';
  if (s === 'closing_soon') return '#92400E';
  return '#991B1B';
}

export default function MapboxBottomSheet({
  sheetState = 'peek',
  onStateChange,
  statusText = 'Exploring map…',
  selectedProvider,
  onViewProfile,
  onBookNow,
  routeDistanceKm,
  routeEtaMin,
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
            {/* ── Header: avatar + info ── */}
            <View style={styles.cardHeader}>
              <View style={styles.avatarWrap}>
                {selectedProvider.imageUrl ? (
                  <Image
                    source={{ uri: selectedProvider.imageUrl }}
                    style={styles.avatar}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Ionicons name="person-outline" size={28} color={COLORS.textLight} />
                  </View>
                )}
                {selectedProvider.openStatus === 'open' && (
                  <View style={styles.openDot} />
                )}
              </View>
              <View style={styles.cardInfo}>
                {selectedProvider.isFeatured && (
                  <View style={styles.featuredBadge}>
                    <Text style={styles.featuredText}>⭐ Featured</Text>
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
              </View>
            </View>

            {/* ── Metrics ── */}
            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Ionicons name="star" size={13} color="#F59E0B" />
                <Text style={styles.metricText}>
                  {selectedProvider.rating > 0 ? selectedProvider.rating.toFixed(1) : '—'}
                  {(selectedProvider.totalReviews ?? 0) > 0 && ` (${selectedProvider.totalReviews})`}
                </Text>
              </View>
              {(selectedProvider.distanceKm ?? -1) >= 0 && (
                <View style={styles.metricItem}>
                  <Ionicons name="location-outline" size={13} color={COLORS.textSecondary} />
                  <Text style={styles.metricText}>
                    {formatDistance(selectedProvider.distanceKm!)}
                  </Text>
                </View>
              )}
              {(selectedProvider.responseRate ?? 0) > 0 && (
                <View style={styles.metricItem}>
                  <Text style={styles.metricText}>⚡ {selectedProvider.responseRate}% Response</Text>
                </View>
              )}
            </View>

            {/* ── Route info ── */}
            {(routeDistanceKm != null || routeEtaMin != null) && (
              <View style={styles.routeRow}>
                {routeDistanceKm != null && (
                  <View style={styles.routeChip}>
                    <Text style={styles.routeChipText}>🚗 {routeDistanceKm.toFixed(1)} km</Text>
                  </View>
                )}
                {routeEtaMin != null && (
                  <View style={styles.routeChip}>
                    <Text style={styles.routeChipText}>⏱ {routeEtaMin} min</Text>
                  </View>
                )}
              </View>
            )}

            {/* ── Open status + rate ── */}
            <View style={styles.statusRateRow}>
              {!!selectedProvider.openStatus && (
                <View
                  style={[
                    styles.statusPill,
                    { backgroundColor: openStatusBg(selectedProvider.openStatus) },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: openStatusColor(selectedProvider.openStatus) },
                    ]}
                  >
                    {openStatusLabel(selectedProvider.openStatus)}
                  </Text>
                </View>
              )}
              {(selectedProvider.hourlyRate ?? 0) > 0 && (
                <Text style={styles.rateText}>₱{selectedProvider.hourlyRate}/hr</Text>
              )}
            </View>

            {/* ── Buttons ── */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.secondaryBtn]}
                onPress={() => onViewProfile?.(selectedProvider.id)}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryBtnText}>View Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.primaryBtn]}
                onPress={() => onBookNow?.(selectedProvider.id)}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Book Now</Text>
              </TouchableOpacity>
            </View>
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
  cardHeader: { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
  avatarWrap: { position: 'relative' },
  avatar: { width: 72, height: 72, borderRadius: BORDER_RADIUS.xl },
  avatarPlaceholder: {
    backgroundColor: COLORS.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  openDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#22C55E', borderWidth: 2, borderColor: COLORS.surface,
  },
  cardInfo: { flex: 1, gap: 4 },
  featuredBadge: {
    backgroundColor: '#FEF3C7', borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 2,
    borderWidth: 1, borderColor: '#FDE68A', alignSelf: 'flex-start',
  },
  featuredText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: '#B45309' },
  providerName: {
    fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.text, lineHeight: 24,
  },
  categoryPill: {
    alignSelf: 'flex-start', backgroundColor: COLORS.primaryLight,
    borderRadius: BORDER_RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 2,
  },
  categoryText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.medium, color: COLORS.primary },
  metricsRow: {
    flexDirection: 'row', gap: SPACING.md, alignItems: 'center', flexWrap: 'wrap',
  },
  metricItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metricText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.medium, color: COLORS.text },
  statusRateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  statusPill: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
  statusPillText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold },
  rateText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.textSecondary },
  routeRow: { flexDirection: 'row', gap: SPACING.sm },
  routeChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EFF6FF', borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  routeChipText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: '#1D4ED8' },
  buttonRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  actionBtn: {
    flex: 1, borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.sm + 2, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtn: { backgroundColor: COLORS.primary, ...SHADOWS.small },
  primaryBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.white },
  secondaryBtn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  secondaryBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
});
