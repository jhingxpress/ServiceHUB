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
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';

type Props = NativeStackScreenProps<CustomerStackParamList, 'CategoryList'>;

interface ProviderItem {
  id: string;
  bio: string | null;
  location: string | null;
  hourly_rate: number | null;
  rating: number | null;
  total_reviews: number | null;
  users: { full_name: string | null; avatar_url: string | null };
  services: { name: string; price: number }[];
}

const SORT_OPTIONS = ['Top Rated', 'Nearest', 'Lowest Price', 'Most Reviews'];

export default function CategoryListScreen({ route, navigation }: Props) {
  const { categoryId, categoryName } = route.params;
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [filtered, setFiltered] = useState<ProviderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortIdx, setSortIdx] = useState(0);

  useEffect(() => {
    supabase
      .from('providers')
      .select(`
        id, bio, location, hourly_rate, rating, total_reviews,
        users!providers_id_fkey(full_name, avatar_url),
        services(name, price)
      `)
      .eq('category_id', categoryId)
      .eq('is_verified', true)
      .eq('is_available', true)
      .then(({ data }) => {
        const list = (data ?? []) as unknown as ProviderItem[];
        setProviders(list);
        setFiltered(list);
        setLoading(false);
      });
  }, [categoryId]);

  useEffect(() => {
    let list = providers;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.users?.full_name?.toLowerCase().includes(q) ||
          p.location?.toLowerCase().includes(q)
      );
    }
    switch (sortIdx) {
      case 0: list = [...list].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)); break;
      case 2: list = [...list].sort((a, b) => (a.hourly_rate ?? 0) - (b.hourly_rate ?? 0)); break;
      case 3: list = [...list].sort((a, b) => (b.total_reviews ?? 0) - (a.total_reviews ?? 0)); break;
    }
    setFiltered(list);
  }, [providers, search, sortIdx]);

  const renderProvider = ({ item }: { item: ProviderItem }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ProviderStorefront', { providerId: item.id })}
      activeOpacity={0.85}
    >
      <View style={styles.cardTop}>
        <Avatar uri={item.users?.avatar_url} name={item.users?.full_name} size={64} borderColor={COLORS.primary} />
        <View style={styles.cardInfo}>
          <Text style={styles.providerName}>{item.users?.full_name ?? 'Provider'}</Text>
          {item.location && (
            <View style={styles.locRow}>
              <Ionicons name="location-outline" size={12} color={COLORS.textLight} />
              <Text style={styles.locText}>{item.location}</Text>
            </View>
          )}
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={13} color="#F59E0B" />
            <Text style={styles.ratingText}>
              {item.rating ? Number(item.rating).toFixed(1) : 'New'}
              {item.total_reviews ? ` (${item.total_reviews})` : ''}
            </Text>
            {item.hourly_rate && (
              <Text style={styles.rateText}> · ₱{item.hourly_rate}/hr</Text>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={styles.bookBtn}
          onPress={() => navigation.navigate('BookService', { providerId: item.id })}
        >
          <Text style={styles.bookBtnText}>Book</Text>
        </TouchableOpacity>
      </View>
      {item.bio && (
        <Text style={styles.bio} numberOfLines={2}>{item.bio}</Text>
      )}
      {item.services?.length > 0 && (
        <View style={styles.serviceRow}>
          {item.services.slice(0, 3).map((s) => (
            <View key={s.name} style={styles.serviceChip}>
              <Text style={styles.serviceChipText}>{s.name}</Text>
            </View>
          ))}
          {item.services.length > 3 && (
            <Text style={styles.moreServices}>+{item.services.length - 3} more</Text>
          )}
        </View>
      )}
    </TouchableOpacity>
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
          placeholder={`Search ${categoryName} providers...`}
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
          renderItem={renderProvider}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
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
  title: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text },
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
  sortChipText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontWeight: '500' },
  sortChipTextActive: { color: COLORS.white, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: SPACING.md, gap: SPACING.sm },
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.medium,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
  cardInfo: { flex: 1 },
  providerName: { fontSize: FONTS.sizes.base, fontWeight: '800', color: COLORS.text, marginBottom: 3 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 },
  locText: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  rateText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  bookBtn: {
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  bookBtnText: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.white },
  bio: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 19, marginBottom: SPACING.sm },
  serviceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, alignItems: 'center' },
  serviceChip: {
    backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  serviceChipText: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontWeight: '600' },
  moreServices: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  emptyState: { alignItems: 'center', paddingTop: SPACING.xxl, gap: SPACING.sm },
  emptyTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  emptySubtitle: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
});
