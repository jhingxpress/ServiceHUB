import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Location from 'expo-location';

import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import MapboxMap, { MapboxMapHandle } from '../../components/maps/MapboxMap';
import { ProviderStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

type Props = NativeStackScreenProps<ProviderStackParamList, 'ProviderLiveTracking'>;

const GPS_INTERVAL_MS  = 12_000;
const STATUS_POLL_MS   = 15_000;
const TERMINAL_STATUSES = ['completed', 'cancelled'];

export default function ProviderLiveTrackingScreen({ navigation, route }: Props) {
  const { bookingId, customerName, customerLat, customerLng } = route.params;
  const { user } = useAuthStore();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapboxMapHandle>(null);
  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [mapReady, setMapReady]       = useState(false);
  const [tracking, setTracking]       = useState(false);
  const [currentLat, setCurrentLat]   = useState<number | null>(null);
  const [currentLng, setCurrentLng]   = useState<number | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [gpsError, setGpsError]       = useState<string | null>(null);
  const [trackingEnded, setTrackingEnded] = useState(false);

  // ── Supabase helpers ──────────────────────────────────────────────────────

  const deleteLocationRow = useCallback(async () => {
    await supabase
      .from('provider_live_locations')
      .delete()
      .eq('booking_id', bookingId);
  }, [bookingId]);

  const upsertLocation = useCallback(async (lat: number, lng: number) => {
    if (!user) return;
    await supabase.from('provider_live_locations').upsert(
      {
        booking_id:  bookingId,
        provider_id: user.id,
        latitude:    lat,
        longitude:   lng,
        updated_at:  new Date().toISOString(),
      },
      { onConflict: 'booking_id' },
    );
  }, [bookingId, user]);

  // ── Route drawing ─────────────────────────────────────────────────────────

  const drawRoute = useCallback(async (fLat: number, fLng: number) => {
    if (customerLat == null || customerLng == null) return;
    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/${fLng},${fLat};${customerLng},${customerLat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const r = json?.routes?.[0];
      if (!r) return;
      const points: [number, number][] = (r.geometry.coordinates as [number, number][]).map(
        ([lng, lat]) => [lat, lng],
      );
      mapRef.current?.drawRoute(points);
    } catch { /* non-critical */ }
  }, [customerLat, customerLng]);

  // ── Location tracking ─────────────────────────────────────────────────────

  const placeProviderPin = (lat: number, lng: number) => {
    mapRef.current?.addClusterMarker({
      id: 'provider-pin',
      latitude: lat,
      longitude: lng,
      name: 'Your Location',
      category: null,
      rating: 0,
      isFeatured: true,
    });
  };

  // Returns coords on success, null on GPS failure.
  const fetchAndUpdate = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude: lat, longitude: lng } = loc.coords;
      setCurrentLat(lat);
      setCurrentLng(lng);
      setGpsError(null);
      placeProviderPin(lat, lng);
      await upsertLocation(lat, lng);
      drawRoute(lat, lng);
      return { lat, lng };
    } catch {
      setGpsError('GPS signal lost — retrying…');
      return null;
    }
  }, [upsertLocation, drawRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Booking status poll ───────────────────────────────────────────────────

  const stopTracking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
    setTracking(false);
  }, []);

  const pollBookingStatus = useCallback(async () => {
    const { data } = await supabase
      .from('bookings')
      .select('status')
      .eq('id', bookingId)
      .maybeSingle();
    if (data && TERMINAL_STATUSES.includes(data.status)) {
      stopTracking();
      await deleteLocationRow();
      setTrackingEnded(true);
    }
  }, [bookingId, stopTracking, deleteLocationRow]);

  const startTracking = useCallback(async () => {
    // ── Task 5: guard against double-start ──
    if (intervalRef.current) return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setPermissionDenied(true);
      Alert.alert(
        'Permission Required',
        'Location permission is needed to share your position with the customer.',
      );
      return;
    }

    // Place customer pin
    if (customerLat != null && customerLng != null) {
      mapRef.current?.addClusterMarker({
        id: 'customer-pin',
        latitude: customerLat,
        longitude: customerLng,
        name: customerName,
        category: null,
        rating: 0,
        isFeatured: false,
      });
    }

    setTracking(true);

    // Initial fix — use returned coords directly (avoids stale state bug)
    const initial = await fetchAndUpdate();
    if (initial) {
      mapRef.current?.flyTo(initial.lat, initial.lng, 14);
    } else if (customerLat != null && customerLng != null) {
      mapRef.current?.flyTo(customerLat, customerLng, 13);
    }

    // Recurring GPS updates
    intervalRef.current = setInterval(fetchAndUpdate, GPS_INTERVAL_MS);

    // Booking status watcher (stops tracking when completed/cancelled)
    statusIntervalRef.current = setInterval(pollBookingStatus, STATUS_POLL_MS);
  }, [customerLat, customerLng, customerName, fetchAndUpdate, pollBookingStatus]);

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (mapReady) startTracking();
  }, [mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { stopTracking(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <MapboxMap
        ref={mapRef}
        initialLatitude={customerLat ?? 14.5995}
        initialLongitude={customerLng ?? 120.9842}
        initialZoom={13}
        showUserLocation={false}
        onMapReady={() => setMapReady(true)}
        style={StyleSheet.absoluteFillObject}
      />

      {/* ── Header ── */}
      <SafeAreaView edges={['top']} style={styles.headerWrap} pointerEvents="box-none">
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.titlePill}>
            <Ionicons name="navigate" size={14} color={COLORS.primary} />
            <Text style={styles.titleText}>Sharing Location</Text>
            {tracking && <View style={styles.liveDot} />}
          </View>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {/* ── Status banner ── */}
      <View style={[styles.statusBanner, { top: 72 + insets.top }]}>
        <View style={[styles.statusDot, {
          backgroundColor: trackingEnded ? '#9CA3AF' : permissionDenied ? '#EF4444' : tracking ? '#22C55E' : '#F59E0B',
        }]} />
        <Text style={styles.statusText} numberOfLines={1}>
          {trackingEnded        ? 'Tracking ended'
            : permissionDenied ? 'Location permission denied'
            : gpsError          ? gpsError
            : tracking          ? `📍 Sharing live location with ${customerName}`
            :                     'Starting GPS…'}
        </Text>
      </View>

      {/* ── Loading overlay ── */}
      {!mapReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Preparing map…</Text>
        </View>
      )}

      {/* ── Tracking ended banner ── */}
      {trackingEnded && (
        <View style={[styles.endedBanner, { bottom: 90 + insets.bottom }]}>
          <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success} />
          <Text style={styles.infoText}>Location sharing stopped</Text>
        </View>
      )}

      {/* ── Current coords chip ── */}
      {tracking && !trackingEnded && currentLat != null && currentLng != null && (
        <View style={[styles.coordsChip, { bottom: 90 + insets.bottom }]}>
          <Ionicons name="locate" size={12} color={COLORS.primary} />
          <Text style={styles.coordsText}>
            {currentLat.toFixed(5)}, {currentLng.toFixed(5)}
          </Text>
          <Text style={styles.intervalText}>· every {GPS_INTERVAL_MS / 1000}s</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#e5e5e5' },

  headerWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  titlePill: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.surface, paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2, borderRadius: BORDER_RADIUS.full,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  titleText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' },

  statusBanner: {
    position: 'absolute', left: SPACING.md, right: SPACING.md,
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small, zIndex: 9,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { flex: 1, fontSize: FONTS.sizes.sm, fontFamily: FONTS.medium, color: COLORS.text },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(245,245,245,0.88)',
    alignItems: 'center', justifyContent: 'center', gap: SPACING.md, zIndex: 20,
  },
  loadingText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.medium, color: COLORS.textSecondary },

  coordsChip: {
    position: 'absolute', left: SPACING.md,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small, zIndex: 9,
  },
  coordsText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.primary },
  intervalText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.regular, color: COLORS.textSecondary },

  endedBanner: {
    position: 'absolute', left: SPACING.md, right: SPACING.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small, zIndex: 9,
  },
  infoText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.medium, color: COLORS.textSecondary },
});
