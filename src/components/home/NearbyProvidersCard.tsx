/**
 * NearbyProvidersCard — Sprint 6.3
 *
 * Self-contained section that fetches the 8 nearest providers,
 * sorted by distance ascending.  Reuses the same haversine helper
 * and Supabase query pattern from MapboxDiscoveryScreen (Sprint 6.0).
 *
 * No new tables, no migrations, no backend changes.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';

import { supabase } from '../../lib/supabase';
import Avatar from '../ui/Avatar';
import { CustomerStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { toTitleCase } from '../../utils/formatting';

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;

// ── Haversine (same algorithm as MapboxDiscoveryScreen) ────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface NearbyProvider {
  id: string;
  business_name: string;
  latitude: number;
  longitude: number;
  rating: number;
  total_reviews: number;
  is_featured: boolean;
  profile_photo_url: string | null;
  business_logo: string | null;
  distanceKm: number;
  categoryName: string | null;
}

type LoadState = 'idle' | 'locating' | 'loading' | 'done' | 'no_location' | 'empty';

const NEARBY_LIMIT = 8;
const SEARCH_RADIUS_KM = 50;

// ── Component ─────────────────────────────────────────────────────────────────
export default function NearbyProvidersCard() {
  const navigation = useNavigation<NavProp>();
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [providers, setProviders] = useState<NearbyProvider[]>([]);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  const fetchProviders = useCallback(async (lat: number, lng: number) => {
    setLoadState('loading');
    try {
      const { data, error } = await supabase
        .from('providers')
        .select(
          'id, business_name, latitude, longitude, rating, total_reviews, is_featured, profile_photo_url, business_logo, categories(name)',
        )
        .eq('status', 'approved')
        .eq('is_verified', true)
        .eq('is_available', true)
        .eq('marketplace_status', 'live')
        .is('deleted_at', null)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (error || !data) {
        setLoadState('empty');
        return;
      }

      const nearby: NearbyProvider[] = (data as any[])
        .map((p) => ({
          id: p.id,
          business_name: p.business_name ?? 'Provider',
          latitude: p.latitude,
          longitude: p.longitude,
          rating: Number(p.rating ?? 0),
          total_reviews: p.total_reviews ?? 0,
          is_featured: p.is_featured ?? false,
          profile_photo_url: p.profile_photo_url ?? null,
          business_logo: p.business_logo ?? null,
          categoryName: (p.categories as any)?.name ?? null,
          distanceKm: haversine(lat, lng, p.latitude, p.longitude),
        }))
        .filter((p) => p.distanceKm <= SEARCH_RADIUS_KM)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, NEARBY_LIMIT);

      setProviders(nearby);
      setLoadState(nearby.length === 0 ? 'empty' : 'done');
    } catch {
      setLoadState('empty');
    }
  }, []);

  // ── Location ────────────────────────────────────────────────────────────────

  const requestAndLoad = useCallback(async () => {
    setLoadState('locating');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoadState('no_location');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      fetchProviders(pos.coords.latitude, pos.coords.longitude);
    } catch {
      setLoadState('no_location');
    }
  }, [fetchProviders]);

  useEffect(() => {
    requestAndLoad();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderCard = ({ item }: { item: NearbyProvider }) => (
    <View style={styles.card}>
      {/* Image + featured badge */}
      <View style={styles.cardTop}>
        <Avatar
          uri={item.profile_photo_url ?? item.business_logo}
          name={item.business_name}
          size={60}
        />
        {item.is_featured && (
          <View style={styles.featuredBadge}>
            <Ionicons name="sparkles" size={9} color={COLORS.warning} />
            <Text style={styles.featuredText}>Featured</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <Text style={styles.name} numberOfLines={2}>{item.business_name}</Text>
      {item.categoryName ? (
        <Text style={styles.category} numberOfLines={1}>
          {toTitleCase(item.categoryName)}
        </Text>
      ) : null}

      {/* Rating + distance row */}
      <View style={styles.chipsRow}>
        <View style={styles.chip}>
          <Ionicons name="star" size={10} color="#F59E0B" />
          <Text style={styles.chipText}>{item.rating.toFixed(1)}</Text>
        </View>
        <View style={[styles.chip, styles.chipDist]}>
          <Ionicons name="location" size={10} color={COLORS.primary} />
          <Text style={[styles.chipText, { color: COLORS.primary }]}>
            {formatDistance(item.distanceKm)}
          </Text>
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.btnRow}>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => navigation.navigate('ProviderStorefront', { providerId: item.id })}
          activeOpacity={0.8}
        >
          <Text style={styles.btnPrimaryText}>View Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnOutline}
          onPress={() => navigation.navigate('MapboxDiscovery')}
          activeOpacity={0.8}
        >
          <Ionicons name="map-outline" size={13} color={COLORS.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Section header (always rendered) ───────────────────────────────────────

  const header = (
    <View style={styles.sectionHeader}>
      <View>
        <Text style={styles.sectionTitle}>Nearby Providers</Text>
        <Text style={styles.sectionSubtitle}>Discover services around you</Text>
      </View>
      <TouchableOpacity
        onPress={() => navigation.navigate('MapboxDiscovery')}
        style={styles.seeAllBtn}
        activeOpacity={0.8}
      >
        <Text style={styles.seeAllText}>See All</Text>
        <Ionicons name="arrow-forward" size={13} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loadState === 'idle' || loadState === 'locating' || loadState === 'loading') {
    return (
      <View style={styles.section}>
        {header}
        <View style={styles.stateBox}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.stateText}>
            {loadState === 'locating' ? 'Getting your location…' : 'Finding nearby providers…'}
          </Text>
        </View>
      </View>
    );
  }

  // ── No location ──────────────────────────────────────────────────────────────
  if (loadState === 'no_location') {
    return (
      <View style={styles.section}>
        {header}
        <View style={styles.stateBox}>
          <Ionicons name="location-outline" size={28} color={COLORS.textLight} />
          <Text style={styles.stateTitle}>Location unavailable</Text>
          <Text style={styles.stateText}>
            Enable location to discover nearby services.
          </Text>
          <TouchableOpacity style={styles.stateBtn} onPress={requestAndLoad} activeOpacity={0.8}>
            <Text style={styles.stateBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────────────
  if (loadState === 'empty') {
    return (
      <View style={styles.section}>
        {header}
        <View style={styles.stateBox}>
          <Ionicons name="search-outline" size={28} color={COLORS.textLight} />
          <Text style={styles.stateTitle}>No nearby providers found</Text>
          <TouchableOpacity
            style={styles.stateBtn}
            onPress={() => navigation.navigate('MapboxDiscovery')}
            activeOpacity={0.8}
          >
            <Ionicons name="map-outline" size={14} color={COLORS.surface} />
            <Text style={styles.stateBtnText}>Explore Map</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Results ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.section}>
      {header}
      <FlatList
        data={providers}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hscroll}
        renderItem={renderCard}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  section: { marginBottom: SPACING.lg },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.lg,
    color: COLORS.text,
  },
  sectionSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingTop: 3,
  },
  seeAllText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.sm,
    color: COLORS.primary,
  },

  hscroll: { paddingHorizontal: SPACING.md, gap: SPACING.sm },

  // ── Individual card ──────────────────────────────────────────────────────────
  card: {
    width: 180,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.warningLight,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  featuredText: {
    fontFamily: FONTS.semiBold,
    fontSize: 9,
    color: '#92400E',
  },

  name: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
    lineHeight: 18,
    marginBottom: 2,
  },
  category: {
    fontFamily: FONTS.regular,
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },

  // ── Chips ────────────────────────────────────────────────────────────────────
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  chipDist: { backgroundColor: COLORS.primaryLight },
  chipText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.xs,
    color: COLORS.text,
  },

  // ── Buttons ──────────────────────────────────────────────────────────────────
  btnRow: {
    flexDirection: 'row',
    gap: SPACING.xs,
    alignItems: 'center',
  },
  btnPrimary: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.xs,
    color: COLORS.surface,
  },
  btnOutline: {
    width: 32,
    height: 32,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },

  // ── Empty / loading states ────────────────────────────────────────────────────
  stateBox: {
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  stateTitle: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
  },
  stateText: {
    fontFamily: FONTS.regular,
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  stateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    marginTop: SPACING.xs,
  },
  stateBtnText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.sm,
    color: COLORS.surface,
  },
});
