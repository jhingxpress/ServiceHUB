import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CustomerStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';

type Props = NativeStackScreenProps<CustomerStackParamList, 'ProviderList'>;

interface ProviderItem {
  id: string;
  bio: string | null;
  location: string | null;
  hourly_rate: number | null;
  rating: number | null;
  total_reviews: number | null;
  users: { full_name: string | null; avatar_url: string | null };
  category: { name: string; icon: string } | null;
  services: { name: string }[];
}

export default function ProviderListScreen({ route, navigation }: Props) {
  const { categoryId, categoryName, search: initialSearch } = route.params ?? {};
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [filtered, setFiltered] = useState<ProviderItem[]>([]);
  const [search, setSearch] = useState(initialSearch ?? '');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    let q = supabase
      .from('providers')
      .select(`
        id, bio, location, hourly_rate, rating, total_reviews,
        users!providers_id_fkey(full_name, avatar_url),
        category:categories(name, icon),
        services(name)
      `)
      .eq('is_verified', true)
      .eq('is_available', true)
      .is('deleted_at', null)
      .order('rating', { ascending: false });

    if (categoryId) q = q.eq('category_id', categoryId);

    q.then(({ data }) => {
      setProviders((data ?? []) as unknown as ProviderItem[]);
      setLoading(false);
    });
  }, [categoryId]);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(providers);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(
      providers.filter(
        (p) =>
          p.users?.full_name?.toLowerCase().includes(q) ||
          p.location?.toLowerCase().includes(q) ||
          p.category?.name?.toLowerCase().includes(q)
      )
    );
  }, [providers, search]);

  const renderListItem = ({ item }: { item: ProviderItem }) => (
    <TouchableOpacity
      style={styles.listCard}
      onPress={() => navigation.navigate('ProviderStorefront', { providerId: item.id })}
      activeOpacity={0.85}
    >
      <Avatar uri={item.users?.avatar_url} name={item.users?.full_name} size={56} borderColor={COLORS.primary} />
      <View style={styles.listCardInfo}>
        <Text style={styles.providerName}>{item.users?.full_name ?? 'Provider'}</Text>
        <Text style={styles.categoryText}>{item.category?.name ?? ''}</Text>
        <View style={styles.metaRow}>
          {item.rating && (
            <View style={styles.ratingPill}>
              <Ionicons name="star" size={11} color="#F59E0B" />
              <Text style={styles.ratingPillText}>{Number(item.rating).toFixed(1)}</Text>
            </View>
          )}
          {item.location && (
            <View style={styles.locRow}>
              <Ionicons name="location-outline" size={11} color={COLORS.textLight} />
              <Text style={styles.locText} numberOfLines={1}>{item.location}</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.listCardRight}>
        {item.hourly_rate && (
          <Text style={styles.rateText}>₱{item.hourly_rate}</Text>
        )}
        {item.hourly_rate && <Text style={styles.rateUnit}>/hr</Text>}
        <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
      </View>
    </TouchableOpacity>
  );

  const renderGridItem = ({ item }: { item: ProviderItem }) => (
    <TouchableOpacity
      style={styles.gridCard}
      onPress={() => navigation.navigate('ProviderStorefront', { providerId: item.id })}
      activeOpacity={0.85}
    >
      <Avatar uri={item.users?.avatar_url} name={item.users?.full_name} size={64} />
      <Text style={styles.gridName} numberOfLines={1}>{item.users?.full_name?.split(' ')[0] ?? 'Pro'}</Text>
      <Text style={styles.gridCategory} numberOfLines={1}>{item.category?.name ?? ''}</Text>
      {item.rating && (
        <View style={styles.gridRating}>
          <Ionicons name="star" size={11} color="#F59E0B" />
          <Text style={styles.gridRatingText}>{Number(item.rating).toFixed(1)}</Text>
        </View>
      )}
      {item.hourly_rate && (
        <Text style={styles.gridRate}>₱{item.hourly_rate}/hr</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>{categoryName ?? 'All Providers'}</Text>
        <TouchableOpacity style={styles.viewToggle} onPress={() => setViewMode(v => v === 'list' ? 'grid' : 'list')}>
          <Ionicons name={viewMode === 'list' ? 'grid-outline' : 'list-outline'} size={20} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={COLORS.textLight} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search providers..."
          placeholderTextColor={COLORS.textLight}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={COLORS.textLight} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.resultRow}>
        <Text style={styles.resultCount}>{filtered.length} provider{filtered.length !== 1 ? 's' : ''} found</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <FlatList
          key={viewMode}
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={viewMode === 'list' ? renderListItem : renderGridItem}
          numColumns={viewMode === 'grid' ? 2 : 1}
          columnWrapperStyle={viewMode === 'grid' ? { gap: SPACING.sm } : undefined}
          contentContainerStyle={[styles.list, viewMode === 'grid' && styles.gridList]}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title="No providers found"
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
  viewToggle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md, borderWidth: 1.5, borderColor: COLORS.border, height: 46,
  },
  searchInput: { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.text },
  resultRow: { paddingHorizontal: SPACING.md, marginBottom: SPACING.sm },
  resultCount: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: SPACING.md, gap: SPACING.sm },
  gridList: { paddingHorizontal: SPACING.md },
  listCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  listCardInfo: { flex: 1 },
  providerName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  categoryText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 1, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  ratingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FEF3C7', borderRadius: BORDER_RADIUS.full, paddingHorizontal: 7, paddingVertical: 2,
  },
  ratingPillText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: '#92400E' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  locText: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, maxWidth: 120 },
  listCardRight: { alignItems: 'center' },
  rateText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: COLORS.primary },
  rateUnit: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginBottom: 4 },
  gridCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  gridName: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginTop: SPACING.sm },
  gridCategory: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  gridRating: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  gridRatingText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.text },
  gridRate: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontFamily: FONTS.semiBold, marginTop: 3 },
  empty: { alignItems: 'center', paddingTop: SPACING.xxl, gap: SPACING.sm },
  emptyTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
});
