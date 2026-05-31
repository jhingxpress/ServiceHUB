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
  provider_name: string | null;
  provider_rating: number | null;
  provider_total_reviews: number | null;
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
    supabase
      .from('services')
      .select(`
        id, name, price, provider_id,
        provider:providers!services_provider_id_fkey(
          business_name, rating, total_reviews, profile_photo_url, business_logo
        )
      `)
      .eq('provider.category_id', categoryId)
      .eq('provider.status', 'approved')
      .eq('provider.is_available', true)
      .eq('provider.marketplace_status', 'live')
      .is('provider.deleted_at', null)
      .eq('is_active', true)
      .is('deleted_at', null)
      .then(async ({ data }) => {
        const rawServices = (data ?? []) as any[];
        const serviceIds = rawServices.map((s) => s.id);

        let imageMap: Record<string, string> = {};
        if (serviceIds.length > 0) {
          const { data: images } = await supabase
            .from('service_images')
            .select('service_id, image_url')
            .in('service_id', serviceIds)
            .order('sort_order');
          (images ?? []).forEach((img: any) => {
            if (!imageMap[img.service_id]) imageMap[img.service_id] = img.image_url;
          });
        }

        const list: ServiceItem[] = rawServices.map((s) => ({
          id: s.id,
          name: s.name,
          price: s.price ?? 0,
          provider_name: s.provider?.business_name ?? null,
          provider_rating: s.provider?.rating ?? null,
          provider_total_reviews: s.provider?.total_reviews ?? null,
          image_url: imageMap[s.id] ?? null,
        }));

        setServices(list);
        setFiltered(list);
        setLoading(false);
      });
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
          keyExtractor={(item) => item.id}
          renderItem={renderService}
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
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.medium,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
  cardInfo: { flex: 1 },
  providerName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: COLORS.text, marginBottom: 3 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 },
  locText: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  rateText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  bookBtn: {
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  bookBtnText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.white },
  bio: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 19, marginBottom: SPACING.sm },
  serviceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, alignItems: 'center' },
  serviceChip: {
    backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  serviceChipText: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontFamily: FONTS.semiBold },
  moreServices: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  emptyState: { alignItems: 'center', paddingTop: SPACING.xxl, gap: SPACING.sm },
  emptyTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  emptySubtitle: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
});
