/**
 * MapboxDiscoveryScreen — Sprint 6.0A
 *
 * Parallel map implementation using WebView + Leaflet + OpenStreetMap.
 * Coexists with the existing Google MapDiscoveryScreen untouched.
 *
 * Sprint 6.0A scope:
 *   ✅ OSM tile map via Leaflet (WebView)
 *   ✅ User location dot + accuracy circle
 *   ✅ Pan and zoom
 *   ✅ Locate Me FAB
 *   ✅ Bottom sheet (peek state)
 *   ⬜ Provider markers      — Sprint 6.0B
 *   ⬜ Clustering            — Sprint 6.0B
 *   ⬜ Routing / directions  — future
 *   ⬜ Booking integration   — future
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';

import MapboxMap, { MapboxMapHandle } from '../../components/maps/MapboxMap';
import MapboxBottomSheet, { SheetState } from '../../components/maps/MapboxBottomSheet';
import { CustomerStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

type Props = NativeStackScreenProps<CustomerStackParamList, 'MapboxDiscovery'>;

// Default center: Manila, Philippines
const DEFAULT_LAT = 14.5995;
const DEFAULT_LNG = 120.9842;
const DEFAULT_ZOOM = 13;

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
  const [statusText, setStatusText] = useState('Locating you…');

  // ─── Location ────────────────────────────────────────────────────────────────
  const requestLocation = useCallback(async () => {
    setLocationState('requesting');
    setStatusText('Locating you…');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationState('denied');
        setStatusText('Location unavailable — showing default area');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const loc = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setUserLocation(loc);
      setLocationState('granted');
      setStatusText('Exploring map');
    } catch {
      setLocationState('error');
      setStatusText('Could not get location');
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
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Top overlay ────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={styles.topOverlay} pointerEvents="box-none">
        <View style={[styles.topRow, { marginTop: SPACING.sm }]}>
          {/* Back */}
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.text} />
          </TouchableOpacity>

          {/* Title pill */}
          <View style={styles.titlePill}>
            <Ionicons name="map" size={14} color={COLORS.primary} />
            <Text style={styles.titleText}>Discover</Text>
            <View style={styles.osmBadge}>
              <Text style={styles.osmBadgeText}>OSM</Text>
            </View>
          </View>

          {/* Placeholder for symmetry */}
          <View style={{ width: 40 }} />
        </View>

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

      {/* ── FAB: Locate Me ─────────────────────────────────────────────── */}
      {mapReady && (
        <TouchableOpacity
          style={[styles.fab, { bottom: 80 + insets.bottom }]}
          onPress={handleLocateMe}
          activeOpacity={0.85}
        >
          <Ionicons
            name={locationState === 'granted' ? 'locate' : 'location-outline'}
            size={20}
            color={locationState === 'granted' ? COLORS.primary : COLORS.textSecondary}
          />
        </TouchableOpacity>
      )}

      {/* ── Zoom controls ──────────────────────────────────────────────── */}
      {mapReady && (
        <View style={[styles.zoomStack, { bottom: 80 + insets.bottom + 60 }]}>
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
        </View>
      )}

      {/* ── Bottom Sheet ────────────────────────────────────────────────── */}
      <MapboxBottomSheet
        sheetState={sheetState}
        onStateChange={setSheetState}
        statusText={statusText}
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
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.medium,
    zIndex: 10,
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
});
