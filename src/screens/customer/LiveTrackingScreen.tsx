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

import { supabase } from '../../lib/supabase';
import MapboxMap, { MapboxMapHandle } from '../../components/maps/MapboxMap';
import { CustomerStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';

type Props = NativeStackScreenProps<CustomerStackParamList, 'LiveTracking'>;

const POLL_MS = 12_000;
const ACTIVE_STATUSES    = ['accepted', 'on_the_way', 'arrived'];
const TERMINAL_STATUSES  = ['completed', 'cancelled', 'rejected'];

interface ProviderLoc {
  latitude: number;
  longitude: number;
  updated_at: string;
}

export default function LiveTrackingScreen({ navigation, route }: Props) {
  const { bookingId, providerName, customerLat, customerLng } = route.params;
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapboxMapHandle>(null);

  // Interval refs for mid-session cancellation (Tasks 4 & 6)
  const t1Ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const t2Ref = useRef<ReturnType<typeof setInterval> | null>(null);
  const t3Ref = useRef<ReturnType<typeof setInterval> | null>(null);

  const [mapReady, setMapReady]           = useState(false);
  const [providerLoc, setProviderLoc]     = useState<ProviderLoc | null>(null);
  const [bookingStatus, setBookingStatus] = useState('accepted');
  const [lastUpdated, setLastUpdated]     = useState<Date | null>(null);
  const [secondsSince, setSecondsSince]   = useState(0);
  const [trackingFinished, setTrackingFinished] = useState(false);

  // ── Polling ───────────────────────────────────────────────────────────────

  const stopAllPolling = useCallback(() => {
    if (t1Ref.current) { clearInterval(t1Ref.current); t1Ref.current = null; }
    if (t2Ref.current) { clearInterval(t2Ref.current); t2Ref.current = null; }
    if (t3Ref.current) { clearInterval(t3Ref.current); t3Ref.current = null; }
  }, []);

  const pollProvider = useCallback(async () => {
    const { data } = await supabase
      .from('provider_live_locations')
      .select('latitude, longitude, updated_at')
      .eq('booking_id', bookingId)
      .maybeSingle();
    if (data) {
      setProviderLoc(data);
      setLastUpdated(new Date());
      setSecondsSince(0);
    }
  }, [bookingId]);

  const pollStatus = useCallback(async () => {
    const { data } = await supabase
      .from('bookings')
      .select('status')
      .eq('id', bookingId)
      .maybeSingle();
    if (data) setBookingStatus(data.status);
  }, [bookingId]);

  useEffect(() => {
    pollProvider();
    pollStatus();
    t1Ref.current = setInterval(pollProvider, POLL_MS);
    t2Ref.current = setInterval(pollStatus, POLL_MS);
    t3Ref.current = setInterval(() => setSecondsSince((s) => s + 1), 1000);
    return () => { stopAllPolling(); };
  }, [pollProvider, pollStatus, stopAllPolling]);

  // Stop all polling + clear map when booking reaches a terminal state
  useEffect(() => {
    if (TERMINAL_STATUSES.includes(bookingStatus)) {
      stopAllPolling();
      setTrackingFinished(true);
      mapRef.current?.clearRoute();
      mapRef.current?.clearClusterMarkers();
    }
  }, [bookingStatus, stopAllPolling]);

  // ── Map pins + route ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapReady) return;

    if (customerLat != null && customerLng != null) {
      mapRef.current?.addClusterMarker({
        id: 'customer-pin',
        latitude: customerLat,
        longitude: customerLng,
        name: 'Service Address',
        category: null,
        rating: 0,
        isFeatured: false,
      });
    }

    if (providerLoc) {
      mapRef.current?.addClusterMarker({
        id: 'provider-pin',
        latitude: providerLoc.latitude,
        longitude: providerLoc.longitude,
        name: providerName,
        category: null,
        rating: 0,
        isFeatured: true,
      });

      if (customerLat != null && customerLng != null) {
        fetchRoute(
          customerLat, customerLng,
          providerLoc.latitude, providerLoc.longitude,
        );
      }
    }
  }, [mapReady, providerLoc]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRoute = async (
    fLat: number, fLng: number, tLat: number, tLng: number,
  ) => {
    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/${fLng},${fLat};${tLng},${tLat}?overview=full&geometries=geojson`;
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
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const statusLabel = () => {
    switch (bookingStatus) {
      case 'accepted':    return 'Provider accepted — heading to you';
      case 'on_the_way':  return 'Provider is on the way';
      case 'arrived':     return 'Provider has arrived';
      case 'in_progress': return 'Service in progress';
      default:            return bookingStatus.replace(/_/g, ' ');
    }
  };

  const isActive = ACTIVE_STATUSES.includes(bookingStatus);

  // Derive status dot colour
  const dotColor = trackingFinished ? '#9CA3AF' : isActive ? '#22C55E' : '#F59E0B';

  return (
    <View style={styles.root}>
      <MapboxMap
        ref={mapRef}
        initialLatitude={customerLat ?? 14.5995}
        initialLongitude={customerLng ?? 120.9842}
        initialZoom={14}
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
            <Text style={styles.titleText}>Live Tracking</Text>
          </View>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={pollProvider}
          >
            <Ionicons name="refresh-outline" size={18} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* ── Status banner ── */}
      <View style={[styles.statusBanner, { top: 72 + insets.top }]}>
        <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
        <Text style={styles.statusText} numberOfLines={1}>
          {trackingFinished ? 'Tracking finished' : statusLabel()}
        </Text>
      </View>

      {/* ── Loading overlay ── */}
      {!mapReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading map…</Text>
        </View>
      )}

      {/* ── Tracking finished banner ── */}
      {mapReady && trackingFinished && (
        <View style={[styles.infoBanner, { bottom: 90 + insets.bottom }]}>
          <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success} />
          <Text style={styles.infoText}>Tracking finished</Text>
        </View>
      )}

      {/* ── Waiting for provider ── */}
      {mapReady && !providerLoc && !trackingFinished && (
        <View style={[styles.infoBanner, { bottom: 90 + insets.bottom }]}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.infoText}>Waiting for provider to share location…</Text>
        </View>
      )}

      {/* ── Last updated chip ── */}
      {mapReady && lastUpdated && providerLoc && !trackingFinished && (
        <View style={[styles.updateChip, { bottom: 90 + insets.bottom }]}>
          <Ionicons name="time-outline" size={12} color={COLORS.textSecondary} />
          <Text style={styles.updateText}>
            Updated {secondsSince}s ago · refreshes every {POLL_MS / 1000}s
          </Text>
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

  infoBanner: {
    position: 'absolute', left: SPACING.md, right: SPACING.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small, zIndex: 9,
  },
  infoText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.medium, color: COLORS.textSecondary },

  updateChip: {
    position: 'absolute', left: SPACING.md, right: SPACING.md,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small, zIndex: 9,
  },
  updateText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.regular, color: COLORS.textSecondary },
});
