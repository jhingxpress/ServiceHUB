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
import ServiceCard from '../../components/marketplace/ServiceCard';
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

function getCategoryDisplayLabel(name: string): string {
  const map: Record<string, string> = {
    'HOME SERVICES': 'Home Services',
    'HVAC & APPLIANCES': 'HVAC & Appliances',
    'AUTOMOTIVE': 'Automotive',
    'CONSTRUCTION & RENOVATION': 'Construction',
    'EVENTS & ENTERTAINMENT': 'Events',
    'BEAUTY & WELLNESS': 'Beauty',
    'TECHNOLOGY & SECURITY': 'Technology',
    'LOGISTICS & TRANSPORTATION': 'Logistics',
    'BUSINESS SERVICES': 'Business',
    'EDUCATION & TRAINING': 'Education',
    'PET SERVICES': 'Pet Services',
    'HEALTH & HOME CARE': 'Health & Home',
  };
  return map[name] ?? name;
}

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [featuredServices, setFeaturedServices] = useState<Array<{
    id: string;
    name: string;
    price: number;
    min_option_price?: number | null;
    provider_name: string | null;
    provider_rating: number | null;
    provider_total_reviews: number | null;
    image_url: string | null;
  }>>([]);
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [catsRes, provsRes, srvsRes, booksRes] = await Promise.all([
        supabase.from('categories').select('*').eq('is_parent', true).order('name'),
        supabase
          .from('providers')
          .select('*, categories(name, icon, color), profile_photo_url, business_logo')
          .eq('is_verified', true)
          .eq('is_available', true)
          .eq('status', 'approved')
          .eq('marketplace_status', 'live')
          .is('deleted_at', null)
          .order('rating', { ascending: false })
          .limit(8),
        supabase
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
          .is('deleted_at', null)
          .limit(20),
        user
          ? supabase
              .from('bookings')
              .select('*, provider:providers!bookings_provider_id_fkey(id, business_name, profile_photo_url, business_logo), service:services(name)')
              .eq('customer_id', user.id)
              .order('created_at', { ascending: false })
              .limit(3)
          : Promise.resolve({ data: [] }),
      ]);

      // Fetch service images and options separately
      const rawServices = (srvsRes.data ?? []) as any[];
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

      setCategories(catsRes.data ?? []);
      setProviders(provsRes.data ?? []);
      setFeaturedServices(
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

        {/* Nearby Map CTA — hidden pending improvements */}
        {/* <TouchableOpacity
          style={styles.mapCta}
          onPress={() => navigation.navigate('MapDiscovery')}
          activeOpacity={0.85}
        >
          <View style={styles.mapCtaIcon}>
            <Ionicons name="map-outline" size={24} color={COLORS.primary} />
          </View>
          <View style={styles.mapCtaText}>
            <Text style={styles.mapCtaTitle}>View Nearby Providers</Text>
            <Text style={styles.mapCtaSubtitle}>Discover professionals on the map</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
        </TouchableOpacity> */}

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

        {/* Featured Services */}
        {featuredServices.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Featured Services</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Search')}>
                <Text style={styles.sectionLink}>See all</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={featuredServices}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hscroll}
              renderItem={({ item }) => (
                <ServiceCard
                  service={item}
                  onPress={() => navigation.navigate('ServiceDetail', { serviceId: item.id })}
                  style={{ width: 220 }}
                />
              )}
            />
          </View>
        )}

        {/* Categories */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Browse by Category</Text>
            {categories.length > 9 && (
              <TouchableOpacity onPress={() => navigation.navigate('AllCategories')}>
                <Text style={styles.sectionLink}>See all</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.categoryGrid}>
            {categories.slice(0, 9).map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={styles.categoryCard}
                onPress={() => navigation.navigate('CategoryList', { categoryId: cat.id, categoryName: cat.name })}
                activeOpacity={0.8}
              >
                <View style={[styles.categoryIcon, { backgroundColor: (cat.color ?? COLORS.primary) + '18' }]}>
                  <Ionicons name={cat.icon as React.ComponentProps<typeof Ionicons>['name']} size={26} color={cat.color ?? COLORS.primary} />
                </View>
                <Text style={styles.categoryName} numberOfLines={2} textBreakStrategy="simple">{getCategoryDisplayLabel(cat.name)}</Text>
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
                onPress={() => navigation.navigate('ProviderStorefront', { providerId: item.id })}
                activeOpacity={0.8}
              >
                <Avatar
                  uri={item.profile_photo_url ?? item.business_logo}
                  name={item.business_name}
                  size={52}
                />
                <Text style={styles.providerName} numberOfLines={1}>
                  {item.business_name ?? 'Provider'}
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

        {/* Recently Booked Providers */}
        {recentBookings.length > 0 && (() => {
          const seen = new Set<string>();
          const recentProviders = recentBookings
            .filter((b) => {
              const pid = (b.provider as any)?.id ?? b.provider_id;
              if (!pid || seen.has(pid)) return false;
              seen.add(pid);
              return true;
            })
            .slice(0, 6);
          if (recentProviders.length === 0) return null;
          return (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Book Again</Text>
                <TouchableOpacity onPress={() => navigation.navigate('Bookings')}>
                  <Text style={styles.sectionLink}>See bookings</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={recentProviders}
                keyExtractor={(b) => b.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hscroll}
                renderItem={({ item: booking }) => {
                  const prov = booking.provider as any;
                  return (
                    <TouchableOpacity
                      style={styles.recentProvCard}
                      onPress={() => navigation.navigate('ProviderStorefront', { providerId: (prov?.id ?? booking.provider_id) as string })}
                      activeOpacity={0.8}
                    >
                      <Avatar
                        uri={prov?.profile_photo_url ?? prov?.business_logo}
                        name={prov?.business_name}
                        size={48}
                      />
                      <Text style={styles.recentProvName} numberOfLines={2}>
                        {prov?.business_name ?? 'Provider'}
                      </Text>
                      <View style={styles.recentProvBtn}>
                        <Ionicons name="refresh-outline" size={11} color={COLORS.primary} />
                        <Text style={styles.recentProvBtnText}>Rebook</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          );
        })()}

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
                    uri={(booking.provider as any)?.profile_photo_url ?? (booking.provider as any)?.business_logo}
                    name={(booking.provider as any)?.business_name}
                    size={42}
                  />
                  <View style={styles.bookingInfo}>
                    <Text style={styles.bookingProvider} numberOfLines={1}>
                      {(booking.provider as any)?.business_name ?? 'Provider'}
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
  greeting: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  userName: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.xl, color: COLORS.text },
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
  bannerTitle: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.lg, color: COLORS.white, lineHeight: 24, marginBottom: SPACING.sm },
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
  bannerBtnText: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.sm, color: COLORS.primary },
  bannerIcon: { opacity: 0.6 },
  section: { marginBottom: SPACING.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  sectionTitle: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.lg, color: COLORS.text },
  sectionLink: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.sm, color: COLORS.primary },
  hscroll: { paddingHorizontal: SPACING.md, gap: SPACING.sm },
  categoryGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: SPACING.md, gap: SPACING.sm,
  },
  categoryCard: {
    width: '30%',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
    borderWidth: 1, borderColor: COLORS.border,
    height: 108,
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
  categoryName: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.xs, color: COLORS.text, textAlign: 'center', lineHeight: 16 },
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
  providerName: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.sm, color: COLORS.text, marginTop: SPACING.sm, textAlign: 'center' },
  providerCategory: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2, textAlign: 'center' },
  providerRating: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: SPACING.xs },
  ratingText: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.xs, color: COLORS.text },
  providerRate: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.xs, color: COLORS.primary, marginTop: 2 },
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
  bookingProvider: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.base, color: COLORS.text },
  bookingService: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 1 },
  bookingDate: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 2 },
  bottomPad: { height: SPACING.xl },
  recentProvCard: {
    width: 100, alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  recentProvName: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.xs, color: COLORS.text, textAlign: 'center', lineHeight: 15 },
  recentProvBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 3,
  },
  recentProvBtnText: { fontFamily: FONTS.semiBold, fontSize: 10, color: COLORS.primary },
  mapCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.md,
    ...SHADOWS.small,
  },
  mapCtaIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primaryLight + '40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapCtaText: { flex: 1 },
  mapCtaTitle: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.base, color: COLORS.text },
  mapCtaSubtitle: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
});
