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
      let q = supabase
        .from('providers')
        .select('*, users!providers_id_fkey(full_name, avatar_url, email), categories(name, icon, color), provider_stats(*)')
        .eq('status', 'approved')
        .eq('is_available', true);

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
      <Avatar uri={item.users?.avatar_url} name={item.users?.full_name} size={56} />
      <View style={styles.cardInfo}>
        <View style={styles.cardRow}>
          <Text style={styles.providerName} numberOfLines={1}>
            {item.users?.full_name ?? 'Provider'}
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
            placeholder="Search providers..."
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
          data={providers}
          keyExtractor={(item) => item.id}
          renderItem={renderProvider}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="No providers found"
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
  filterText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontWeight: '500' },
  filterTextActive: { color: COLORS.white, fontWeight: '700' },
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
  providerName: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, flex: 1 },
  category: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xs, flexWrap: 'wrap' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rating: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text },
  reviews: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 2, flex: 1 },
  location: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, flex: 1 },
  priceCol: { alignItems: 'flex-end' },
  price: { fontSize: FONTS.sizes.lg, fontWeight: '800', color: COLORS.primary },
  priceUnit: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  distance: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontWeight: '700' },
});
