/**
 * MapboxDiscoveryScreen — Sprint 6.0B
 *
 * Parallel map implementation using WebView + Leaflet + OpenStreetMap.
 * Coexists with the existing Google MapDiscoveryScreen untouched.
 *
 * Sprint 6.0A ✅:
 *   ✅ OSM tile map via Leaflet (WebView)
 *   ✅ User location dot + accuracy circle
 *   ✅ Pan and zoom
 *   ✅ Locate Me FAB
 *   ✅ Bottom sheet (peek state)
 *
 * Sprint 6.0B ✅:
 *   ✅ Provider markers (red = normal, gold = featured)
 *   ✅ Marker tap → bottom sheet provider card
 *   ✅ View Profile navigation
 *   ⬜ Clustering            — Sprint 6.0C
 *   ⬜ Routing / directions  — future
 *   ⬜ Booking integration   — future
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';

import MapboxMap, { MapboxMapHandle } from '../../components/maps/MapboxMap';
import MapboxBottomSheet, { SheetState } from '../../components/maps/MapboxBottomSheet';
import MapSortSheet, { SortOption } from '../../components/maps/MapSortSheet';
import { ProviderMarkerData } from '../../components/maps/ProviderMarker';
import { CustomerStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

type Props = NativeStackScreenProps<CustomerStackParamList, 'MapboxDiscovery'>;

type QuickFilter = 'all' | 'featured' | 'open_now' | 'top_rated';

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'featured', label: 'Featured' },
  { key: 'open_now', label: 'Open Now' },
  { key: 'top_rated', label: 'Top Rated' },
];

const CATEGORIES: string[] = [
  'All',
  'Home Services',
  'Cleaning',
  'Technology',
  'Events',
  'Transport',
  'Rentals',
  'Construction',
  'Beauty',
  'Automotive',
];

// Default center: Manila, Philippines
const DEFAULT_LAT = 14.5995;
const DEFAULT_LNG = 120.9842;
const DEFAULT_ZOOM = 13;
const SEARCH_RADIUS_KM = 50;

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

interface UserLocation {
  latitude: number;
  longitude: number;
}

type LocationState = 'requesting' | 'granted' | 'denied' | 'error';

export default function MapboxDiscoveryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapboxMapHandle>(null);

  const [locationState, setLocationState] = useState<LocationState>('requesting');
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [sheetState, setSheetState] = useState<SheetState>('peek');
  const [markers, setMarkers] = useState<ProviderMarkerData[]>([]);
  const [markersLoading, setMarkersLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderMarkerData | null>(null);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeEtaMin, setRouteEtaMin] = useState<number | null>(null);

  // ── Sprint 6.5: filter / search / sort state ───────────────────────────────
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<QuickFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSort, setSelectedSort] = useState<SortOption>('nearest');
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animatedFabBottom = useRef(new Animated.Value(80)).current;
  const animatedZoomBottom = useRef(new Animated.Value(140)).current;

  // ─── Sprint 6.5: derived filtered markers (no new queries) ─────────────────
  const filteredMarkers = useMemo<ProviderMarkerData[]>(() => {
    let result = [...markers];

    // Search
    const q = debouncedSearch.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (m) =>
          (m.name ?? '').toLowerCase().includes(q) ||
          (m.category ?? '').toLowerCase().includes(q),
      );
    }

    // Quick filter
    if (selectedFilter === 'featured') {
      result = result.filter((m) => m.isFeatured);
    } else if (selectedFilter === 'open_now') {
      result = result.filter((m) => m.openStatus === 'open');
    } else if (selectedFilter === 'top_rated') {
      result = result.filter((m) => m.rating >= 4.0);
    }

    // Category
    if (selectedCategory !== 'All') {
      result = result.filter(
        (m) => (m.category ?? '').toLowerCase() === selectedCategory.toLowerCase(),
      );
    }

    // Sort
    switch (selectedSort) {
      case 'nearest':
        result.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
        break;
      case 'top_rated':
        result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        break;
      case 'most_reviews':
        result.sort((a, b) => (b.totalReviews ?? 0) - (a.totalReviews ?? 0));
        break;
      case 'featured_first':
        result.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured));
        break;
      case 'open_now':
        result.sort((a, b) => Number(b.openStatus === 'open') - Number(a.openStatus === 'open'));
        break;
    }

    return result;
  }, [markers, debouncedSearch, selectedFilter, selectedCategory, selectedSort]);

  const hasActiveFilters =
    selectedFilter !== 'all' ||
    selectedCategory !== 'All' ||
    debouncedSearch.trim().length > 0 ||
    selectedSort !== 'nearest';

  // ─── Location ────────────────────────────────────────────────────────────────
  const statusText = useMemo(() => {
    if (selectedProvider) return selectedProvider.name;
    if (markersLoading || locationState === 'requesting') return 'Loading…';
    if (filteredMarkers.length > 0)
      return `${filteredMarkers.length} provider${filteredMarkers.length !== 1 ? 's' : ''} nearby`;
    if (locationState === 'denied') return 'Location unavailable';
    return 'Explore nearby services';
  }, [selectedProvider, markersLoading, locationState, filteredMarkers.length]);

  const requestLocation = useCallback(async () => {
    setLocationState('requesting');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationState('denied');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setLocationState('granted');
    } catch {
      setLocationState('error');
    }
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  // Fly to user location once map is ready
  useEffect(() => {
    if (mapReady && userLocation) {
      mapRef.current?.flyTo(userLocation.latitude, userLocation.longitude, DEFAULT_ZOOM);
    }
  }, [mapReady, userLocation]);

  // ─── Provider loading ─────────────────────────────────────────
  const loadProviders = useCallback(async () => {
    setMarkersLoading(true);
    try {
      const { data, error } = await supabase
        .from('providers')
        .select(
          'id, business_name, latitude, longitude, rating, total_reviews, hourly_rate, is_featured, profile_photo_url, business_logo, categories(name, icon, color)',
        )
        .eq('status', 'approved')
        .eq('is_verified', true)
        .eq('is_available', true)
        .eq('marketplace_status', 'live')
        .is('deleted_at', null)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (error || !data) return;

      const centerLat = userLocation?.latitude ?? DEFAULT_LAT;
      const centerLng = userLocation?.longitude ?? DEFAULT_LNG;

      const mapped: ProviderMarkerData[] = (data as any[])
        .filter(
          (p) =>
            p.latitude != null &&
            p.longitude != null &&
            haversine(centerLat, centerLng, p.latitude, p.longitude) <= SEARCH_RADIUS_KM,
        )
        .map((p) => ({
          id: p.id,
          name: p.business_name ?? 'Provider',
          latitude: p.latitude,
          longitude: p.longitude,
          category: (p.categories as any)?.name ?? null,
          rating: Number(p.rating ?? 0),
          totalReviews: p.total_reviews ?? 0,
          isFeatured: p.is_featured ?? false,
          imageUrl: p.profile_photo_url ?? p.business_logo ?? null,
          hourlyRate: p.hourly_rate ?? null,
          distanceKm: haversine(centerLat, centerLng, p.latitude, p.longitude),
          responseRate: null,
          openStatus: 'open' as const,
        }));

      setMarkers(mapped);
    } finally {
      setMarkersLoading(false);
    }
  }, [userLocation]);

  useEffect(() => {
    if (mapReady) loadProviders();
  }, [mapReady, loadProviders]);

  // Inject filtered markers whenever derived array changes
  useEffect(() => {
    if (mapReady) {
      mapRef.current?.setMarkers(filteredMarkers);
    }
  }, [mapReady, filteredMarkers]);

  // ─── Handlers ────────────────────────────────────────────────────────────────
  const handleLocateMe = useCallback(() => {
    if (userLocation) {
      mapRef.current?.flyTo(userLocation.latitude, userLocation.longitude, DEFAULT_ZOOM);
    } else {
      requestLocation();
    }
  }, [userLocation, requestLocation]);

  const handleMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  useEffect(() => {
    const base = sheetState === 'full' ? 340 : 80;
    Animated.parallel([
      Animated.timing(animatedFabBottom, { toValue: base + insets.bottom, duration: 220, useNativeDriver: false }),
      Animated.timing(animatedZoomBottom, { toValue: base + insets.bottom + 60, duration: 220, useNativeDriver: false }),
    ]).start();
  }, [sheetState, insets.bottom]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRoute = useCallback(async (
    fromLat: number, fromLng: number,
    toLat: number, toLng: number,
  ) => {
    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const route = json?.routes?.[0];
      if (!route) return;
      const points: [number, number][] = (route.geometry.coordinates as [number, number][]).map(
        ([lng, lat]) => [lat, lng],
      );
      setRouteDistanceKm(Math.round((route.distance / 1000) * 10) / 10);
      setRouteEtaMin(Math.round(route.duration / 60));
      mapRef.current?.drawRoute(points);
    } catch {
      // Route is non-critical — silently ignore network failures
    }
  }, []);

  const handleMarkerPress = useCallback(
    (providerId: string) => {
      const found = filteredMarkers.find((m) => m.id === providerId) ?? null;
      setSelectedProvider(found);
      if (found) {
        setSheetState('full');
        mapRef.current?.flyTo(found.latitude, found.longitude, 15);
        if (userLocation) {
          fetchRoute(
            userLocation.latitude, userLocation.longitude,
            found.latitude, found.longitude,
          );
        }
      }
    },
    [filteredMarkers, userLocation, fetchRoute],
  );

  // ─── Sprint 6.5: search debounce ────────────────────────────────────────────
  const handleSearchChange = useCallback((text: string) => {
    setSearchText(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // ─── Sprint 6.5: reset filters ─────────────────────────────────────────────
  const resetFilters = useCallback(() => {
    setSelectedFilter('all');
    setSelectedCategory('All');
    setSelectedSort('nearest');
    setSearchText('');
    setDebouncedSearch('');
  }, []);

  const handleSheetStateChange = useCallback(
    (state: SheetState) => {
      setSheetState(state);
      if (state === 'peek') {
        setSelectedProvider(null);
        setRouteDistanceKm(null);
        setRouteEtaMin(null);
        mapRef.current?.selectMarker('');
        mapRef.current?.clearRoute();
      }
    },
    [],
  );

  const handleViewProfile = useCallback(
    (id: string) => {
      navigation.navigate('ProviderStorefront', { providerId: id });
    },
    [navigation],
  );

  const handleBookNow = useCallback(
    (id: string) => {
      navigation.navigate('BookService', { providerId: id });
    },
    [navigation],
  );

  // ─── Initial map center ──────────────────────────────────────────────────────
  const mapLat = userLocation?.latitude ?? DEFAULT_LAT;
  const mapLng = userLocation?.longitude ?? DEFAULT_LNG;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* Full-screen map */}
      <MapboxMap
        ref={mapRef}
        initialLatitude={mapLat}
        initialLongitude={mapLng}
        initialZoom={DEFAULT_ZOOM}
        showUserLocation={locationState === 'granted'}
        onMapReady={handleMapReady}
        onMarkerPress={handleMarkerPress}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Top overlay ────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={styles.topOverlay} pointerEvents="box-none">
        {/* Row 1: back + title pill + sort */}
        <View style={[styles.topRow, { marginTop: SPACING.sm }]}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.text} />
          </TouchableOpacity>

          {/* Title pill with count */}
          <View style={styles.titlePill}>
            <Ionicons name="map" size={14} color={COLORS.primary} />
            <Text style={styles.titleText}>Discover</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{filteredMarkers.length}</Text>
            </View>
            <View style={styles.osmBadge}>
              <Text style={styles.osmBadgeText}>CARTO</Text>
            </View>
          </View>

          {/* Sort button */}
          <TouchableOpacity
            style={[styles.iconBtn, selectedSort !== 'nearest' && styles.iconBtnActive]}
            onPress={() => setSortSheetOpen(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="funnel-outline" size={18} color={selectedSort !== 'nearest' ? COLORS.primary : COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* Active filter indicator */}
        {hasActiveFilters && (
          <TouchableOpacity style={styles.filterChipRow} onPress={resetFilters} activeOpacity={0.8}>
            <View style={styles.filterChip}>
              <Text style={styles.filterChipText}>
                {filteredMarkers.length} providers{' '}
                {selectedFilter !== 'all' && `• ${QUICK_FILTERS.find(f => f.key === selectedFilter)?.label}`}
                {selectedCategory !== 'All' && `• ${selectedCategory}`}
                {debouncedSearch && `• "${debouncedSearch}"`}
              </Text>
              <Ionicons name="close-circle" size={14} color={COLORS.textLight} />
            </View>
          </TouchableOpacity>
        )}

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={COLORS.textLight} />
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={handleSearchChange}
            placeholder="Search provider or category…"
            placeholderTextColor={COLORS.textLight}
            returnKeyType="search"
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchText(''); setDebouncedSearch(''); }}>
              <Ionicons name="close-circle" size={18} color={COLORS.textLight} />
            </TouchableOpacity>
          )}
        </View>

        {/* Quick filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsWrap}
          pointerEvents="auto"
        >
          {QUICK_FILTERS.map((f) => {
            const active = selectedFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSelectedFilter(f.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsWrap}
          pointerEvents="auto"
        >
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSelectedCategory(active ? 'All' : cat)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Location permission banner */}
        {locationState === 'denied' && (
          <View style={styles.permissionBanner}>
            <Ionicons name="location-outline" size={14} color={COLORS.warning} />
            <Text style={styles.permissionText}>
              Location permission denied. Showing default area.
            </Text>
          </View>
        )}
      </SafeAreaView>

      {/* ── Loading overlay ─────────────────────────────────────────────── */}
      {!mapReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading map…</Text>
        </View>
      )}

      {/* ── Empty state ───────────────────────────────────────────────── */}
      {mapReady && !markersLoading && filteredMarkers.length === 0 && markers.length > 0 && (
        <View style={styles.emptyOverlay} pointerEvents="box-none">
          <View style={styles.emptyCard}>
            <Ionicons name="search-outline" size={40} color={COLORS.textLight} />
            <Text style={styles.emptyTitle}>No providers match your filters.</Text>
            <TouchableOpacity style={styles.resetBtn} onPress={resetFilters} activeOpacity={0.85}>
              <Ionicons name="refresh" size={14} color={COLORS.surface} />
              <Text style={styles.resetBtnText}>Reset Filters</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── FAB: Locate Me ─────────────────────────────────────────────── */}
      {mapReady && (
        <Animated.View style={[styles.fab, { bottom: animatedFabBottom }]}>
          <TouchableOpacity
            onPress={handleLocateMe}
            activeOpacity={0.85}
            style={styles.fabInner}
          >
            <Ionicons
              name={locationState === 'granted' ? 'locate' : 'location-outline'}
              size={20}
              color={locationState === 'granted' ? COLORS.primary : COLORS.textSecondary}
            />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Zoom controls ──────────────────────────────────────────────── */}
      {mapReady && (
        <Animated.View style={[styles.zoomStack, { bottom: animatedZoomBottom }]}>
          <TouchableOpacity
            style={[styles.iconBtn, styles.zoomBtn]}
            onPress={() => mapRef.current?.zoomIn()}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={20} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.zoomDivider} />
          <TouchableOpacity
            style={[styles.iconBtn, styles.zoomBtn]}
            onPress={() => mapRef.current?.zoomOut()}
            activeOpacity={0.85}
          >
            <Ionicons name="remove" size={20} color={COLORS.text} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Bottom Sheet ────────────────────────────────────────────────── */}
      <MapboxBottomSheet
        sheetState={sheetState}
        onStateChange={handleSheetStateChange}
        statusText={statusText}
        selectedProvider={selectedProvider}
        onViewProfile={handleViewProfile}
        onBookNow={handleBookNow}
        routeDistanceKm={routeDistanceKm}
        routeEtaMin={routeEtaMin}
      />

      {/* ── Sort Sheet ──────────────────────────────────────────────────── */}
      <MapSortSheet
        visible={sortSheetOpen}
        current={selectedSort}
        onApply={setSelectedSort}
        onClose={() => setSortSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e5e5e5' },

  // Top
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
  },
  titlePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  titleText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
  },
  osmBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  osmBadgeText: {
    fontSize: 9,
    fontFamily: FONTS.bold,
    color: '#065F46',
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: '#FEF3C7',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  permissionText: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.medium,
    color: '#92400E',
    flex: 1,
  },

  // Icon button (shared)
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },

  // Loading
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245,245,245,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    zIndex: 20,
  },
  loadingText: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.medium,
    color: COLORS.textSecondary,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: SPACING.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.medium,
    zIndex: 10,
    overflow: 'hidden',
  },
  fabInner: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Zoom controls
  zoomStack: {
    position: 'absolute',
    right: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    ...SHADOWS.small,
    zIndex: 10,
  },
  zoomBtn: {
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  zoomDivider: { height: 1, backgroundColor: COLORS.border },

  // ── Sprint 6.5 styles ─────────────────────────────────────────────────────
  countBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  countBadgeText: {
    fontSize: 10,
    fontFamily: FONTS.bold,
    color: COLORS.surface,
  },
  filterChipRow: {
    alignItems: 'center',
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primaryLight,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.medium,
    color: COLORS.primary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
    paddingVertical: 0,
  },
  chipsWrap: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
  },
  chip: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
  },
  chipTextActive: {
    color: COLORS.surface,
  },
  emptyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 15,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.medium,
    marginHorizontal: SPACING.xl,
  },
  emptyTitle: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
  },
  resetBtnText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.sm,
    color: COLORS.surface,
  },
  iconBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
});
