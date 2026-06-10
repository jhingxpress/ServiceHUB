import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MapView, { Marker, Callout, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { toTitleCase } from '../../utils/formatting';
import { Category } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import { CustomerStackParamList } from '../../navigation/types';

const SEARCH_RADIUS_KM = 50;
const PAGE_SIZE = 10;

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;

interface MapProvider {
  id: string;
  business_name: string | null;
  profile_photo_url: string | null;
  business_logo: string | null;
  category_id: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number;
  total_reviews: number;
  hourly_rate: number | null;
  categories?: { name: string; icon: string; color: string } | null;
}

interface ProviderWithDistance extends MapProvider {
  distanceKm: number;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)} m`;
  return `${km.toFixed(1)} km`;
}

export default function MapDiscoveryScreen() {
  const navigation = useNavigation<NavProp>();
  const mapRef = useRef<MapView>(null);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [providers, setProviders] = useState<ProviderWithDistance[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  const fetchProviders = useCallback(
    async (reset = false) => {
      if (!userLocation) return;
      const currentPage = reset ? 0 : page;

      let query = supabase
        .from('providers')
        .select(
          'id, business_name, profile_photo_url, business_logo, category_id, latitude, longitude, rating, total_reviews, hourly_rate, status, is_verified, is_available, marketplace_status, deleted_at, categories(name, icon, color)'
        )
        .eq('status', 'approved')
        .eq('is_verified', true)
        .eq('is_available', true)
        .eq('marketplace_status', 'live')
        .is('deleted_at', null)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('rating', { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (selectedCategory) {
        query = query.eq('category_id', selectedCategory);
      }

      if (searchQuery.trim()) {
        query = query.ilike('business_name', `%${searchQuery.trim()}%`);
      }

      const { data, error } = await query;
      setLoading(false);
      if (error) {
        console.error('[MapDiscovery] Fetch error:', error.message);
        return;
      }

      const raw = (data ?? []) as unknown as MapProvider[];
      console.log('[MapDiscovery] Raw providers from DB:', raw.length);
      raw.forEach((p) => {
        console.log('[MapDiscovery] Provider:', p.business_name, 'lat:', p.latitude, 'lng:', p.longitude, 'status:', (p as any).status, 'available:', (p as any).is_available, 'marketplace:', (p as any).marketplace_status);
      });
      const withDistance = raw
        .map((p) => ({
          ...p,
          distanceKm: haversine(
            userLocation.lat,
            userLocation.lng,
            p.latitude!,
            p.longitude!
          ),
        }))
        .filter((p) => p.distanceKm <= SEARCH_RADIUS_KM)
        .sort((a, b) => a.distanceKm - b.distanceKm);
      console.log('[MapDiscovery] After 50km filter:', withDistance.length);

      setProviders((prev) => (reset ? withDistance : [...prev, ...withDistance]));
      setHasMore(withDistance.length === PAGE_SIZE);
      setPage(currentPage + 1);
    },
    [userLocation, selectedCategory, searchQuery, page]
  );

  useEffect(() => {
    const init = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission',
          'Location access is needed to show nearby providers. You can still browse manually.\n\nLocation information may be used for bookings, navigation, fraud prevention, and platform security.'
        );
        setUserLocation({ lat: 14.5995, lng: 120.9842 }); // Default: Manila
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setUserLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    };
    init();
  }, []);

  useEffect(() => {
    const loadCategories = async () => {
      const { data } = await supabase.from('categories').select('*').eq('is_parent', true).order('name');
      setCategories(data ?? []);
    };
    loadCategories();
  }, []);

  useEffect(() => {
    if (userLocation) {
      setPage(0);
      setProviders([]);
      setHasMore(true);
      fetchProviders(true);
    }
  }, [userLocation, selectedCategory, searchQuery]);

  const initialRegion: Region | undefined = useMemo(() => {
    if (!userLocation) return undefined;
    return {
      latitude: userLocation.lat,
      longitude: userLocation.lng,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
  }, [userLocation]);

  const filteredProviders = useMemo(() => {
    return providers;
  }, [providers]);

  const onMapReady = useCallback(() => {
    setMapReady(true);
  }, []);

  const onMarkerPress = useCallback(
    (provider: ProviderWithDistance) => {
      mapRef.current?.animateToRegion(
        {
          latitude: provider.latitude!,
          longitude: provider.longitude!,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        300
      );
    },
    []
  );

  const onCardPress = useCallback(
    (provider: ProviderWithDistance) => {
      mapRef.current?.animateToRegion(
        {
          latitude: provider.latitude!,
          longitude: provider.longitude!,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        300
      );
    },
    []
  );

  const renderProviderCard = ({ item }: { item: ProviderWithDistance }) => (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.cardTop}
        onPress={() => onCardPress(item)}
        activeOpacity={0.8}
      >
        <Avatar uri={item.profile_photo_url ?? item.business_logo} name={item.business_name} size={52} />
        <View style={styles.cardInfo}>
          <Text style={styles.cardName} numberOfLines={1}>{item.business_name ?? 'Provider'}</Text>
          <Text style={styles.cardCategory}>{toTitleCase(item.categories?.name) ?? 'Services'}</Text>
          <View style={styles.cardMeta}>
            <Ionicons name="star" size={12} color="#F59E0B" />
            <Text style={styles.cardRating}>{Number(item.rating).toFixed(1)}</Text>
            <Text style={styles.cardDistance}>• {formatDistance(item.distanceKm)}</Text>
          </View>
        </View>
      </TouchableOpacity>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.cardBtn, styles.cardBtnSecondary]}
          onPress={() => navigation.navigate('ProviderStorefront', { providerId: item.id })}
        >
          <Text style={styles.cardBtnTextSecondary}>View Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cardBtn}
          onPress={() =>
            navigation.navigate('ProviderStorefront', { providerId: item.id })
          }
        >
          <Text style={styles.cardBtnText}>Book Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFilterChip = ({ item }: { item: Category }) => {
    const isActive = selectedCategory === item.id;
    return (
      <TouchableOpacity
        style={[styles.chip, isActive && styles.chipActive, { borderColor: isActive ? COLORS.primary : item.color ?? COLORS.border }]}
        onPress={() => setSelectedCategory(isActive ? null : item.id)}
        activeOpacity={0.8}
      >
        <Ionicons
          name={item.icon as React.ComponentProps<typeof Ionicons>['name']}
          size={14}
          color={isActive ? COLORS.white : item.color ?? COLORS.textSecondary}
        />
        <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{item.name}</Text>
      </TouchableOpacity>
    );
  };

  if (!userLocation || !initialRegion) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header / Search */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color={COLORS.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search providers..."
            placeholderTextColor={COLORS.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={COLORS.textLight} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Chips */}
      <FlatList
        data={categories}
        keyExtractor={(c) => c.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipList}
        ListHeaderComponent={
          <TouchableOpacity
            style={[styles.chip, selectedCategory === null && styles.chipActive]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text style={[styles.chipText, selectedCategory === null && styles.chipTextActive]}>All</Text>
          </TouchableOpacity>
        }
        renderItem={renderFilterChip}
      />

      {/* Map */}
      <View style={styles.mapWrap}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          onMapReady={onMapReady}
          showsUserLocation
          showsMyLocationButton
        >
          {/* User marker (explicit red pin alongside showsUserLocation) */}
          <Marker
            coordinate={{ latitude: userLocation.lat, longitude: userLocation.lng }}
            pinColor={COLORS.error}
            title="You"
          />

          {mapReady &&
            filteredProviders.map((p) => (
              <Marker
                key={p.id}
                coordinate={{ latitude: p.latitude!, longitude: p.longitude! }}
                pinColor={COLORS.primary}
                onPress={() => onMarkerPress(p)}
                tracksViewChanges={false}
              >
                <Callout tooltip>
                  <View style={styles.callout}>
                    <Text style={styles.calloutName} numberOfLines={1}>{p.business_name}</Text>
                    <View style={styles.calloutMeta}>
                      <Ionicons name="star" size={10} color="#F59E0B" />
                      <Text style={styles.calloutRating}>{Number(p.rating).toFixed(1)}</Text>
                      <Text style={styles.calloutDistance}>• {formatDistance(p.distanceKm)}</Text>
                    </View>
                  </View>
                </Callout>
              </Marker>
            ))}
        </MapView>

        {/* Floating recenter button */}
        <TouchableOpacity
          style={styles.recenterBtn}
          onPress={() =>
            mapRef.current?.animateToRegion(
              {
                latitude: userLocation.lat,
                longitude: userLocation.lng,
                latitudeDelta: 0.08,
                longitudeDelta: 0.08,
              },
              400
            )
          }
        >
          <Ionicons name="locate" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Bottom Provider Cards */}
      <View style={styles.bottomSheet}>
        {/* Count header */}
        <View style={styles.bottomSheetHeader}>
          {loading && providers.length === 0 ? (
            <Text style={styles.countText}>Finding providers...</Text>
          ) : (
            <Text style={styles.countText}>
              {filteredProviders.length > 0
                ? `${filteredProviders.length} provider${filteredProviders.length !== 1 ? 's' : ''} nearby`
                : 'No providers found'}
            </Text>
          )}
        </View>
        {loading && providers.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : filteredProviders.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="map-outline" size={36} color={COLORS.textLight} />
            <Text style={styles.emptyText}>
              {selectedCategory
                ? 'No providers in this category within 50 km'
                : searchQuery
                ? `No providers matching "${searchQuery}"`
                : 'No providers found within 50 km'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredProviders}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cardList}
            renderItem={renderProviderCard}
            onEndReached={() => {
              if (hasMore) fetchProviders();
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              hasMore ? <ActivityIndicator style={{ marginHorizontal: SPACING.md }} color={COLORS.primary} /> : null
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: FONTS.sizes.base,
    color: COLORS.text,
    paddingVertical: 0,
  },
  chipList: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 4,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontFamily: FONTS.medium,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
  },
  chipTextActive: {
    color: COLORS.white,
  },
  mapWrap: {
    flex: 1,
    minHeight: 300,
    position: 'relative',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  recenterBtn: {
    position: 'absolute',
    right: SPACING.md,
    bottom: SPACING.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.medium,
  },
  callout: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    minWidth: 140,
    ...SHADOWS.medium,
  },
  calloutName: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
    marginBottom: 2,
  },
  calloutMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  calloutRating: {
    fontFamily: FONTS.medium,
    fontSize: FONTS.sizes.xs,
    color: COLORS.text,
  },
  calloutDistance: {
    fontFamily: FONTS.regular,
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
  },
  bottomSheet: {
    height: 220,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    paddingTop: 0,
    ...SHADOWS.large,
  },
  bottomSheetHeader: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: 4,
  },
  countText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
  cardList: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  card: {
    width: 280,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.base,
    color: COLORS.text,
  },
  cardCategory: {
    fontFamily: FONTS.regular,
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  cardRating: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.xs,
    color: COLORS.text,
  },
  cardDistance: {
    fontFamily: FONTS.regular,
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  cardBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
  },
  cardBtnSecondary: {
    backgroundColor: COLORS.surfaceSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardBtnText: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.sm,
    color: COLORS.white,
  },
  cardBtnTextSecondary: {
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.sm,
    color: COLORS.text,
  },
  emptyText: {
    fontFamily: FONTS.medium,
    fontSize: FONTS.sizes.base,
    color: COLORS.textSecondary,
    marginTop: SPACING.sm,
  },
});
