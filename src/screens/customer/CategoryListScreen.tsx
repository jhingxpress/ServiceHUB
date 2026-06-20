import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CustomerStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import ServiceCard from '../../components/marketplace/ServiceCard';
import EmptyState from '../../components/ui/EmptyState';

type Props = NativeStackScreenProps<CustomerStackParamList, 'CategoryList'>;

interface ServiceItem {
  id: string;
  name: string;
  price: number;
  min_option_price?: number | null;
  provider_name: string | null;
  provider_rating: number | null;
  provider_total_reviews: number | null;
  provider_is_featured?: boolean;
  image_url: string | null;
}

const SORT_OPTIONS = ['Top Rated', 'Lowest Price', 'Most Reviews'];

export default function CategoryListScreen({ route, navigation }: Props) {
  const { categoryId, categoryName } = route.params;
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [filtered, setFiltered] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortIdx, setSortIdx] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Step 1: Resolve parent category to leaf category IDs
      const { data: leafCategories } = await supabase
        .from('categories')
        .select('id')
        .eq('parent_id', categoryId);

      const leafIds = (leafCategories ?? []).map((c: any) => c.id);
      const categoryIds = leafIds.length > 0 ? [...leafIds, categoryId] : [categoryId];

      // Step 2: Query services using leaf category IDs with inner join
      const { data } = await supabase
        .from('services')
        .select(`
          id, name, price, provider_id,
          provider:providers!inner(
            business_name, rating, total_reviews, profile_photo_url, business_logo, is_featured
          )
        `)
        .in('provider.category_id', categoryIds)
        .eq('provider.status', 'approved')
        .eq('provider.is_available', true)
        .eq('provider.marketplace_status', 'live')
        .is('provider.deleted_at', null)
        .eq('is_active', true)
        .is('deleted_at', null);

      const rawServices = (data ?? []) as any[];
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

      const list: ServiceItem[] = rawServices.map((s) => ({
        id: s.id,
        name: s.name,
        price: s.price ?? 0,
        min_option_price: optionMap[s.id] ?? null,
        provider_name: s.provider?.business_name ?? null,
        provider_rating: s.provider?.rating ?? null,
        provider_total_reviews: s.provider?.total_reviews ?? null,
        provider_is_featured: s.provider?.is_featured ?? false,
        image_url: imageMap[s.id] ?? null,
      }));

      setServices(list);
      setFiltered(list);
      setLoading(false);
    };

    load();
  }, [categoryId]);

  useEffect(() => {
    let list = services;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    switch (sortIdx) {
      case 0: list = [...list].sort((a, b) => (b.provider_rating ?? 0) - (a.provider_rating ?? 0)); break;
      case 1: list = [...list].sort((a, b) => a.price - b.price); break;
      case 2: list = [...list].sort((a, b) => (b.provider_total_reviews ?? 0) - (a.provider_total_reviews ?? 0)); break;
    }
    setFiltered(list);
  }, [services, search, sortIdx]);

  const renderService = ({ item }: { item: ServiceItem }) => (
    <ServiceCard
      service={item}
      onPress={() => navigation.navigate('ServiceDetail', { serviceId: item.id })}
      showBookButton
      onBook={() => navigation.navigate('ServiceDetail', { serviceId: item.id })}
      providerIsFeatured={item.provider_is_featured}
    />
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{categoryName}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={COLORS.textLight} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={`Search ${categoryName} services...`}
          placeholderTextColor={COLORS.textLight}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={COLORS.textLight} />
          </TouchableOpacity>
        )}
      </View>

      {/* Sort chips */}
      <View style={styles.sortRow}>
        <Ionicons name="options-outline" size={16} color={COLORS.textSecondary} style={{ marginRight: 6 }} />
        {SORT_OPTIONS.map((opt, i) => (
          <TouchableOpacity
            key={opt}
            style={[styles.sortChip, i === sortIdx && styles.sortChipActive]}
            onPress={() => setSortIdx(i)}
          >
            <Text style={[styles.sortChipText, i === sortIdx && styles.sortChipTextActive]}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          renderItem={renderService}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="No services found"
              subtitle="Try adjusting your search or filters"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md, borderWidth: 1.5, borderColor: COLORS.border, height: 46,
  },
  searchInput: { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.text },
  sortRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.xs,
  },
  sortChip: {
    paddingHorizontal: SPACING.sm + 2, paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  sortChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sortChipText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  sortChipTextActive: { color: COLORS.white, fontFamily: FONTS.semiBold },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: SPACING.md, gap: SPACING.sm },
  columnWrapper: { justifyContent: 'space-between', gap: SPACING.sm },
});
