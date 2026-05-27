import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Category, Provider, Booking } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import StarRating from '../../components/ui/StarRating';
import Badge from '../../components/ui/Badge';
import { CustomerStackParamList, CustomerTabParamList } from '../../navigation/types';

type NavProp = CompositeNavigationProp<
  BottomTabNavigationProp<CustomerTabParamList, 'Home'>,
  NativeStackNavigationProp<CustomerStackParamList>
>;

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [catsRes, provsRes, booksRes] = await Promise.all([
        supabase.from('categories').select('*').order('name').limit(12),
        supabase
          .from('providers')
          .select('*, users!providers_id_fkey(full_name, avatar_url), categories(name, icon, color)')
          .eq('is_verified', true)
          .eq('is_available', true)
          .order('avg_rating', { ascending: false })
          .limit(8),
        user
          ? supabase
              .from('bookings')
              .select('*, providers!bookings_provider_id_fkey(users!providers_id_fkey(full_name, avatar_url)), services(name)')
              .eq('customer_id', user.id)
              .order('created_at', { ascending: false })
              .limit(3)
          : Promise.resolve({ data: [] }),
      ]);
      setCategories(catsRes.data ?? []);
      setProviders(provsRes.data ?? []);
      setRecentBookings((booksRes as { data: Booking[] | null }).data ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const firstName = user?.full_name?.split(' ')[0] ?? 'there';

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.userName}>{firstName} 👋</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
            <Avatar uri={user?.avatar_url} name={user?.full_name} size={44} borderColor={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <TouchableOpacity
          style={styles.searchBar}
          onPress={() => navigation.navigate('Search')}
          activeOpacity={0.8}
        >
          <Ionicons name="search-outline" size={18} color={COLORS.textLight} />
          <Text style={styles.searchText}>Search services or providers...</Text>
        </TouchableOpacity>

        {/* Banner */}
        <View style={styles.banner}>
          <View>
            <Text style={styles.bannerTitle}>Find trusted{'\n'}professionals near you</Text>
            <TouchableOpacity
              style={styles.bannerBtn}
              onPress={() => navigation.navigate('Search')}
            >
              <Text style={styles.bannerBtnText}>Explore</Text>
              <Ionicons name="arrow-forward" size={14} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
          <View style={styles.bannerIcon}>
            <Ionicons name="construct" size={52} color="rgba(255,255,255,0.25)" />
          </View>
        </View>

        {/* Categories */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Services</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Search')}>
              <Text style={styles.sectionLink}>See all</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.categoryGrid}>
            {categories.slice(0, 8).map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={styles.categoryCard}
                onPress={() => navigation.navigate('CategoryList', { categoryId: cat.id, categoryName: cat.name })}
                activeOpacity={0.8}
              >
                <View style={[styles.categoryIcon, { backgroundColor: (cat.color ?? COLORS.primary) + '18' }]}>
                  <Ionicons name={cat.icon as React.ComponentProps<typeof Ionicons>['name']} size={26} color={cat.color ?? COLORS.primary} />
                </View>
                <Text style={styles.categoryName} numberOfLines={2}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Top Providers */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Providers</Text>
            <TouchableOpacity onPress={() => navigation.navigate('ProviderList', {})}>
              <Text style={styles.sectionLink}>See all</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={providers}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hscroll}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.providerCard}
                onPress={() => navigation.navigate('ProviderProfile', { providerId: item.id })}
                activeOpacity={0.8}
              >
                <Avatar
                  uri={item.users?.avatar_url}
                  name={item.users?.full_name}
                  size={52}
                />
                <Text style={styles.providerName} numberOfLines={1}>
                  {item.users?.full_name ?? 'Provider'}
                </Text>
                <Text style={styles.providerCategory} numberOfLines={1}>
                  {item.categories?.name ?? 'Services'}
                </Text>
                <View style={styles.providerRating}>
                  <Ionicons name="star" size={12} color="#F59E0B" />
                  <Text style={styles.ratingText}>{Number(item.rating).toFixed(1)}</Text>
                </View>
                {item.hourly_rate && (
                  <Text style={styles.providerRate}>₱{item.hourly_rate}/hr</Text>
                )}
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Recent Bookings */}
        {recentBookings.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Bookings</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Bookings')}>
                <Text style={styles.sectionLink}>See all</Text>
              </TouchableOpacity>
            </View>
            {recentBookings.map((booking) => (
              <TouchableOpacity
                key={booking.id}
                style={styles.bookingCard}
                onPress={() => navigation.navigate('BookingDetail', { bookingId: booking.id })}
                activeOpacity={0.8}
              >
                <View style={styles.bookingLeft}>
                  <Avatar
                    uri={(booking.provider as unknown as { users: { avatar_url: string | null; full_name: string | null } })?.users?.avatar_url}
                    name={(booking.provider as unknown as { users: { avatar_url: string | null; full_name: string | null } })?.users?.full_name}
                    size={42}
                  />
                  <View style={styles.bookingInfo}>
                    <Text style={styles.bookingProvider} numberOfLines={1}>
                      {(booking.provider as unknown as { users: { full_name: string | null } })?.users?.full_name ?? 'Provider'}
                    </Text>
                    <Text style={styles.bookingService} numberOfLines={1}>
                      {booking.service?.name ?? 'Service'}
                    </Text>
                    <Text style={styles.bookingDate}>
                      {booking.scheduled_date}
                    </Text>
                  </View>
                </View>
                <Badge label={booking.status} status={booking.status} size="sm" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  greeting: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  userName: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    ...SHADOWS.small,
  },
  searchText: { fontSize: FONTS.sizes.base, color: COLORS.textLight, flex: 1 },
  banner: {
    marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.primary,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
  },
  bannerTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.white, lineHeight: 24, marginBottom: SPACING.sm },
  bannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    gap: 4,
    alignSelf: 'flex-start',
  },
  bannerBtnText: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.primary },
  bannerIcon: { opacity: 0.6 },
  section: { marginBottom: SPACING.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  sectionTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  sectionLink: { fontSize: FONTS.sizes.sm, color: COLORS.primary, fontWeight: '600' },
  hscroll: { paddingHorizontal: SPACING.md, gap: SPACING.sm },
  categoryGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: SPACING.md, gap: SPACING.sm,
  },
  categoryCard: {
    width: '22%',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
    borderWidth: 1, borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  categoryIcon: {
    width: 52,
    height: 52,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  categoryName: { fontSize: FONTS.sizes.xs, color: COLORS.text, fontWeight: '600', textAlign: 'center', lineHeight: 15 },
  providerCard: {
    width: 130,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  providerName: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text, marginTop: SPACING.sm, textAlign: 'center' },
  providerCategory: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2, textAlign: 'center' },
  providerRating: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: SPACING.xs },
  ratingText: { fontSize: FONTS.sizes.xs, fontWeight: '700', color: COLORS.text },
  providerRate: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontWeight: '600', marginTop: 2 },
  bookingCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  bookingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: SPACING.sm },
  bookingInfo: { flex: 1 },
  bookingProvider: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  bookingService: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 1 },
  bookingDate: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 2 },
  bottomPad: { height: SPACING.xl },
});
