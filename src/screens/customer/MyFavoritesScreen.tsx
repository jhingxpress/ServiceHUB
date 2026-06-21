import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CustomerStackParamList } from '../../navigation/types';
import { useFavorites } from '../../hooks/useFavorites';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import FeaturedBadge from '../../components/marketplace/FeaturedBadge';

type Props = NativeStackScreenProps<CustomerStackParamList, 'MyFavorites'>;

export default function MyFavoritesScreen({ navigation }: Props) {
  const { favorites, loading, refresh } = useFavorites();

  const renderItem = ({ item }: { item: (typeof favorites)[0] }) => {
    const provider = item.provider;
    if (!provider) return null;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('ProviderStorefront', { providerId: provider.id })}
        activeOpacity={0.85}
      >
        <Avatar
          uri={provider.profile_photo_url ?? provider.business_logo}
          name={provider.business_name}
          size={56}
          borderColor={COLORS.primary}
        />
        <View style={styles.info}>
          <Text style={styles.name}>{provider.business_name ?? 'Provider'}</Text>
          {(provider as any).is_featured && <FeaturedBadge style={{ marginTop: 2 }} />}
          <Text style={styles.category}>{(provider as any).categories?.name ?? ''}</Text>
          <View style={styles.metaRow}>
            {!!provider.rating && (
              <View style={styles.ratingPill}>
                <Ionicons name="star" size={11} color="#F59E0B" />
                <Text style={styles.ratingText}>{Number(provider.rating).toFixed(1)}</Text>
                {!!(provider as any).total_reviews && (
                  <Text style={styles.ratingCount}>({(provider as any).total_reviews})</Text>
                )}
              </View>
            )}
            {!!(provider as any).response_rate && (
              <View style={styles.statPill}>
                <Ionicons name="chatbubble-outline" size={10} color={COLORS.primary} />
                <Text style={styles.statText}>{(provider as any).response_rate}% resp</Text>
              </View>
            )}
          </View>
          {!!provider.location && (
            <View style={styles.locRow}>
              <Ionicons name="location-outline" size={11} color={COLORS.textLight} />
              <Text style={styles.locText} numberOfLines={1}>{provider.location}</Text>
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Providers</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={refresh}
          ListEmptyComponent={
            <EmptyState
              icon="heart-outline"
              title="No Saved Providers"
              subtitle="Bookmark providers you love to find them quickly here."
              actionLabel="Browse Providers"
              onAction={() => navigation.navigate('CustomerTabs', { screen: 'Search' })}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.xl, color: COLORS.text },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.xl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  info: { flex: 1 },
  name: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.base, color: COLORS.text },
  category: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 4 },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  ratingText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.bold, color: '#B45309' },
  ratingCount: { fontSize: FONTS.sizes.xs, color: '#B45309', marginLeft: 1 },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: COLORS.primaryLight, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  statText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.medium, color: COLORS.primary },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4 },
  locText: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, maxWidth: 140 },
});
