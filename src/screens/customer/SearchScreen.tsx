import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { Provider, Category } from '../../types';
import ServiceCard from '../../components/marketplace/ServiceCard';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import { CustomerStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
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

export default function SearchScreen() {
  const navigation = useNavigation<NavProp>();
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [services, setServices] = useState<Array<{
    id: string;
    name: string;
    price: number;
    min_option_price?: number | null;
    provider_name: string | null;
    provider_rating: number | null;
    provider_total_reviews: number | null;
    image_url: string | null;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [nearbyMode, setNearbyMode] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    supabase.from('categories').select('*').order('name').then(({ data }) => {
      setCategories(data ?? []);
    });
  }, []);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      // Phase 1: Search services
      let serviceQ = supabase
        .from('services')
        .select(`
          id, name, price, provider_id,
          provider:providers!services_provider_id_fkey(
            business_name, rating, total_reviews, profile_photo_url, business_logo
          )
        `)
        .eq('provider.status', 'approved')
        .eq('provider.is_available', true)
        .eq('provider.marketplace_status', 'live')
        .is('provider.deleted_at', null)
        .eq('is_active', true)
        .is('deleted_at', null);

      if (selectedCategory) {
        serviceQ = serviceQ.eq('provider.category_id', selectedCategory);
      }

      if (query.trim()) {
        serviceQ = serviceQ.or(`name.ilike.%${query.trim()}%,description.ilike.%${query.trim()}%`);
      }

      const { data: serviceData } = await serviceQ.limit(20);
      const rawServices = (serviceData ?? []) as any[];
      const serviceIds = rawServices.map((s) => s.id);

      let imageMap: Record<string, string> = {};
      let optionMap: Record<string, number> = {};
      if (serviceIds.length > 0) {
        const [{ data: images }, { data: options }] = await Promise.all([
          supabase
            .from('service_images')
            .select('service_id, image_url')
            .in('service_id', serviceIds)
            .order('sort_order'),
          supabase
            .from('service_options')
            .select('service_id, price')
            .in('service_id', serviceIds)
            .eq('is_active', true),
        ]);
        (images ?? []).forEach((img: any) => {
          if (!imageMap[img.service_id]) imageMap[img.service_id] = img.image_url;
        });
        (options ?? []).forEach((opt: any) => {
          const existing = optionMap[opt.service_id];
          if (!existing || opt.price < existing) {
            optionMap[opt.service_id] = opt.price;
          }
        });
      }

      setServices(
        rawServices.map((s) => ({
          id: s.id,
          name: s.name,
          price: s.price ?? 0,
          min_option_price: optionMap[s.id] ?? null,
          provider_name: s.provider?.business_name ?? null,
          provider_rating: s.provider?.rating ?? null,
          provider_total_reviews: s.provider?.total_reviews ?? null,
          image_url: imageMap[s.id] ?? null,
        }))
      );

      // Phase 2: Search providers
      let q = supabase
        .from('providers')
        .select('*, users!providers_id_fkey(full_name, avatar_url, email), categories(name, icon, color), provider_stats(*), profile_photo_url, business_logo')
        .eq('status', 'approved')
        .eq('is_available', true)
        .is('deleted_at', null);

      if (selectedCategory) {
        q = q.eq('category_id', selectedCategory);
      }

      if (query.trim()) {
        q = q.or(`business_name.ilike.%${query.trim()}%,users.full_name.ilike.%${query.trim()}%`);
      }

      const { data } = await q.order('rating', { ascending: false }).limit(50);
      let results = (data ?? []) as Provider[];

      if (nearbyMode && userLocation) {
        results = results
          .map((p) => ({
            ...p,
            _distance:
              p.latitude && p.longitude
                ? haversineKm(userLocation.lat, userLocation.lng, p.latitude, p.longitude)
                : Infinity,
          }))
          .filter((p: any) => p._distance <= (p.service_radius_km ?? 10))
          .sort((a: any, b: any) => a._distance - b._distance) as Provider[];
      }

      setProviders(results);
    } finally {
      setLoading(false);
    }
  }, [query, selectedCategory, nearbyMode, userLocation]);

  useEffect(() => { search(); }, [search]);

  const toggleNearby = () => {
    if (!nearbyMode) {
      // For MVP, use a hardcoded Davao del Sur center location
      // In production, use expo-location to get real user location
      setUserLocation({ lat: 6.7478, lng: 125.2943 }); // Digos City, Davao del Sur
      setNearbyMode(true);
    } else {
      setNearbyMode(false);
      setUserLocation(null);
    }
  };

  const renderProvider = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ProviderStorefront', { providerId: item.id })}
      activeOpacity={0.8}
    >
      <Avatar uri={item.profile_photo_url ?? item.business_logo ?? item.users?.avatar_url} name={item.business_name ?? item.users?.full_name} size={56} />
      <View style={styles.cardInfo}>
        <View style={styles.cardRow}>
          <Text style={styles.providerName} numberOfLines={1}>
            {item.business_name ?? item.users?.full_name ?? 'Provider'}
          </Text>
          {item.is_verified && (
            <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
          )}
        </View>
        <Text style={styles.category}>{item.categories?.name ?? 'General'}</Text>
        <View style={styles.metaRow}>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={13} color="#F59E0B" />
            <Text style={styles.rating}>{Number(item.rating).toFixed(1)}</Text>
            <Text style={styles.reviews}>({item.total_reviews})</Text>
          </View>
          {item.location && (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={13} color={COLORS.textLight} />
              <Text style={styles.location} numberOfLines={1}>{item.location}</Text>
            </View>
          )}
          {nearbyMode && item._distance !== undefined && item._distance !== Infinity && (
            <View style={styles.distanceRow}>
              <Ionicons name="navigate-circle" size={13} color={COLORS.primary} />
              <Text style={styles.distance}>{item._distance.toFixed(1)} km</Text>
            </View>
          )}
        </View>
      </View>
      {item.hourly_rate && (
        <View style={styles.priceCol}>
          <Text style={styles.price}>₱{item.hourly_rate}</Text>
          <Text style={styles.priceUnit}>/hr</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Search Input */}
      <View style={styles.searchWrapper}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={COLORS.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search services or providers..."
            placeholderTextColor={COLORS.textLight}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={search}
          />
          <TouchableOpacity onPress={toggleNearby}>
            <Ionicons name={nearbyMode ? "locate" : "locate-outline"} size={20} color={nearbyMode ? COLORS.primary : COLORS.textLight} />
          </TouchableOpacity>
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.textLight} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category Filter */}
      <FlatList
        data={[{ id: null, name: 'All', icon: 'apps-outline', color: COLORS.primary } as unknown as Category, ...categories]}
        keyExtractor={(item) => String(item.id)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
        renderItem={({ item }) => {
          const isSelected = selectedCategory === item.id;
          return (
            <TouchableOpacity
              style={[styles.filterChip, isSelected && styles.filterChipActive]}
              onPress={() => setSelectedCategory(item.id)}
            >
              <Text style={[styles.filterText, isSelected && styles.filterTextActive]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        }}
        style={styles.filterList}
      />

      {/* Results */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={[
            ...(services.length > 0
              ? [{ _type: 'section_services' as const, label: 'Services' }]
              : []),
            ...services.map((s) => ({ _type: 'service' as const, data: s })),
            ...(providers.length > 0
              ? [{ _type: 'section_providers' as const, label: 'Providers' }]
              : []),
            ...providers.map((p) => ({ _type: 'provider' as const, data: p })),
          ]}
          keyExtractor={(item, index) =>
            item._type.startsWith('section')
              ? item._type
              : `${item._type}-${(item as any).data.id}-${index}`
          }
          renderItem={({ item }) => {
            if (item._type === 'section_services') {
              return (
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitleText}>{item.label}</Text>
                </View>
              );
            }
            if (item._type === 'section_providers') {
              return (
                <View style={[styles.sectionHeaderRow, { marginTop: SPACING.lg }]}>
                  <Text style={styles.sectionTitleText}>{item.label}</Text>
                </View>
              );
            }
            if (item._type === 'service') {
              return (
                <ServiceCard
                  service={item.data}
                  onPress={() => navigation.navigate('ServiceDetail', { serviceId: item.data.id })}
                  showBookButton
                  onBook={() => navigation.navigate('ServiceDetail', { serviceId: item.data.id })}
                />
              );
            }
            return renderProvider({ item: item.data });
          }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="No results found"
              subtitle="Try adjusting your search or category filter"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  searchWrapper: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
    ...SHADOWS.small,
  },
  searchInput: { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.text, height: 36 },
  filterList: { maxHeight: 48, marginBottom: SPACING.xs },
  filterScroll: { paddingHorizontal: SPACING.md, gap: SPACING.sm, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  filterTextActive: { color: COLORS.white, fontFamily: FONTS.semiBold },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    gap: SPACING.md,
    ...SHADOWS.small,
  },
  cardInfo: { flex: 1 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  providerName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, flex: 1 },
  category: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xs, flexWrap: 'wrap' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rating: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  reviews: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  location: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, flex: 1 },
  priceCol: { alignItems: 'flex-end' },
  price: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.primary },
  priceUnit: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  distance: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontFamily: FONTS.semiBold },
  sectionHeaderRow: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.xs },
  sectionTitleText: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.lg, color: COLORS.text },
});
