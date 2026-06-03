import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import ImageViewerModal from '../../components/ui/ImageViewerModal';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useFavorites } from '../../hooks/useFavorites';
import { Provider, Service, Review, ProviderBadge } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { CustomerStackParamList } from '../../navigation/types';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;
type RouteType = RouteProp<CustomerStackParamList, 'ProviderStorefront'>;

const { width: SCREEN_W } = Dimensions.get('window');

const BADGE_LABELS: Record<string, string> = {
  verified_provider: 'Verified',
  fast_responder: 'Fast Responder',
  top_rated: 'Top Rated',
  '100_plus_jobs': '100+ Jobs',
  '50_plus_jobs': '50+ Jobs',
  new_provider: 'New',
};

const BADGE_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  verified_provider: 'checkmark-circle',
  fast_responder: 'flash',
  top_rated: 'star',
  '100_plus_jobs': 'trophy',
  '50_plus_jobs': 'ribbon',
  new_provider: 'leaf',
};

export default function ProviderStorefrontScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { providerId } = route.params;
  const { user } = useAuthStore();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [provider, setProvider] = useState<Provider | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerTitle, setViewerTitle] = useState('');

  const openViewer = (url: string | null | undefined, title: string) => {
    if (!url) return;
    setViewerUrl(url);
    setViewerTitle(title);
    setViewerVisible(true);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: prov, error: provError } = await supabase
      .from('providers')
      .select('*, categories(name, icon, color), provider_badges(*), provider_gallery(*), provider_stats(*), profile_photo_url, business_logo')
      .eq('id', providerId)
      .eq('status', 'approved')
      .eq('marketplace_status', 'live')
      .is('deleted_at', null)
      .single();

    if (provError) {
      console.error('Provider lookup error:', provError);
      Alert.alert('Not Found', 'This provider is not available.');
      setLoading(false);
      return;
    }

    if (!prov) {
      Alert.alert('Not Found', 'This provider is not available.');
      setLoading(false);
      return;
    }

    let srvs: any[] | null = null;
    let srvError: any = null;

    // Try sort_order first (preferred), fallback to created_at if column missing
    const sortQuery = supabase
      .from('services')
      .select('*')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .order('sort_order');
    const fallbackQuery = supabase
      .from('services')
      .select('*')
      .eq('provider_id', providerId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    const sortRes = await sortQuery;
    if (sortRes.error && sortRes.error.code === '42703') {
      const fallbackRes = await fallbackQuery;
      srvs = fallbackRes.data;
      srvError = fallbackRes.error;
      if (srvError) {
        console.error('[ProviderStorefront] Services fallback query error:', srvError.code, srvError.message);
      }
    } else {
      srvs = sortRes.data;
      srvError = sortRes.error;
      if (srvError) {
        console.error('[ProviderStorefront] Services query error:', srvError.code, srvError.message);
      }
    }

    const serviceIds = (srvs ?? []).map((s) => s.id);

    const [{ data: options }, { data: images }] = await Promise.all([
      serviceIds.length > 0
        ? supabase.from('service_options').select('*').in('service_id', serviceIds).eq('is_active', true)
        : Promise.resolve({ data: [] }),
      serviceIds.length > 0
        ? supabase.from('service_images').select('*').in('service_id', serviceIds).order('sort_order')
        : Promise.resolve({ data: [] }),
    ]);

    const servicesWithRelations: Service[] = (srvs ?? []).map((s) => ({
      ...s,
      service_options: (options ?? []).filter((o: any) => o.service_id === s.id),
      service_images: (images ?? []).filter((i: any) => i.service_id === s.id),
    }));

    const { data: revs, error: revError } = await supabase
      .from('reviews')
      .select('id, booking_id, customer_id, provider_id, rating, title, comment, photo_urls, is_visible, created_at, customer_name, customer_avatar_url')
      .eq('provider_id', providerId)
      .eq('is_visible', true)
      .order('created_at', { ascending: false })
      .limit(10);
    if (revError) {
      console.error('[ProviderStorefront] Reviews query error:', revError.code, revError.message, revError.details);
    }

    setProvider(prov as unknown as Provider);
    setServices(servicesWithRelations);
    setReviews((revs ?? []) as unknown as Review[]);
    setLoading(false);
  }, [providerId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleToggleFavorite = async () => {
    if (!user) { Alert.alert('Sign In', 'Please sign in to save providers.'); return; }
    setSavingFavorite(true);
    await toggleFavorite(providerId);
    setSavingFavorite(false);
  };

  const handleBook = (service?: Service) => {
    if (!user) { Alert.alert('Sign In', 'Please sign in to book a service.'); return; }
    if (service) {
      navigation.navigate('ServiceDetail', { serviceId: service.id });
    } else {
      navigation.navigate('BookService', { providerId });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!provider) return null;

  const providerName = provider.business_name ?? 'Provider';
  const cat = provider.categories as unknown as { name: string; icon: string; color: string } | undefined;
  const badges = (provider.provider_badges ?? []) as ProviderBadge[];
  const gallery = provider.provider_gallery ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header with back and favorite */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, isFavorite(providerId) && styles.iconBtnActive]} onPress={handleToggleFavorite} disabled={savingFavorite}>
            <Ionicons name={isFavorite(providerId) ? 'heart' : 'heart-outline'} size={22} color={isFavorite(providerId) ? COLORS.error : COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* Cover Photo */}
        <TouchableOpacity
          style={styles.coverWrap}
          activeOpacity={provider.cover_photo_url ? 0.85 : 1}
          onPress={() => openViewer(provider.cover_photo_url, 'Cover Photo')}
        >
          <Image
            source={{ uri: provider.cover_photo_url ?? 'https://images.unsplash.com/photo-1581578731117-104f2a4128bc?w=800' }}
            style={styles.coverPhoto}
            resizeMode="cover"
          />
          <View style={styles.coverOverlay} />
          {provider.cover_photo_url && (
            <View style={styles.coverZoomHint}>
              <Ionicons name="expand-outline" size={16} color={COLORS.white} />
            </View>
          )}
        </TouchableOpacity>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <TouchableOpacity
            style={styles.logoWrap}
            activeOpacity={(provider.profile_photo_url ?? provider.business_logo) ? 0.8 : 1}
            onPress={() => openViewer(provider.profile_photo_url ?? provider.business_logo, providerName)}
          >
            <Avatar uri={provider.profile_photo_url ?? provider.business_logo} name={providerName} size={80} borderColor={COLORS.primary} />
            {provider.is_verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.providerName}>{providerName}</Text>
          <Text style={styles.categoryName}>{cat?.name ?? 'Service Provider'}</Text>

          {/* Availability + Response Time */}
          <View style={styles.statusRow}>
            <View style={styles.availabilityRow}>
              <View style={[
                styles.availabilityDot,
                provider.is_available ? styles.availableDot : styles.unavailableDot,
              ]} />
              <Text style={[
                styles.availabilityText,
                provider.is_available ? styles.availableText : styles.unavailableText,
              ]}>
                {provider.is_available ? 'Available' : 'Unavailable'}
              </Text>
            </View>
            {(provider as any).provider_stats?.average_response_minutes > 0 && (
              <View style={styles.responseTimeWrap}>
                <Ionicons name="timer-outline" size={12} color={COLORS.textLight} />
                <Text style={styles.responseTimeText}>
                  Responds in {Math.ceil((provider as any).provider_stats.average_response_minutes / 5) * 5} mins
                </Text>
              </View>
            )}
          </View>

          {/* Trust Metrics */}
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Ionicons name="star" size={16} color="#F59E0B" />
              <Text style={styles.metricValue}>{provider.rating?.toFixed(1) ?? '0.0'}</Text>
              <Text style={styles.metricLabel}>({provider.total_reviews})</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <Ionicons name="briefcase" size={16} color={COLORS.primary} />
              <Text style={styles.metricValue}>{provider.completed_jobs}</Text>
              <Text style={styles.metricLabel}>Jobs</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <Ionicons name="chatbubble-ellipses" size={16} color="#10B981" />
              <Text style={styles.metricValue}>{provider.response_rate}%</Text>
              <Text style={styles.metricLabel}>Response</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <Ionicons name="heart" size={16} color={COLORS.error} />
              <Text style={styles.metricValue}>{(provider as any).provider_stats?.favorite_count ?? 0}</Text>
              <Text style={styles.metricLabel}>Favorites</Text>
            </View>
          </View>

          {/* Badges */}
          {badges.length > 0 && (
            <View style={styles.badgesRow}>
              {badges.map((b) => (
                <View key={b.id} style={styles.badgeChip}>
                  <Ionicons name={BADGE_ICONS[b.badge_type] ?? 'ribbon'} size={12} color={COLORS.primary} />
                  <Text style={styles.badgeChipText}>{BADGE_LABELS[b.badge_type] ?? b.badge_type}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.aboutText}>{provider.service_description ?? 'No description provided.'}</Text>
          <View style={styles.infoList}>
            <View style={styles.infoItem}>
              <Ionicons name="location-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.infoText}>{provider.business_address ?? provider.location ?? 'Davao del Sur'}</Text>
            </View>
            {provider.business_phone && (
              <View style={styles.infoItem}>
                <Ionicons name="call-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.infoText}>{provider.business_phone}</Text>
              </View>
            )}
            <View style={styles.infoItem}>
              <Ionicons name="business-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.infoText}>{provider.provider_type === 'business' ? 'Business' : 'Individual Provider'}</Text>
            </View>
            {provider.years_of_experience ? (
              <View style={styles.infoItem}>
                <Ionicons name="calendar-outline" size={16} color={COLORS.textSecondary} />
                <Text style={styles.infoText}>{provider.years_of_experience} years experience</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Services */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Services</Text>
          {services.length === 0 ? (
            <Text style={styles.emptyText}>No services listed yet.</Text>
          ) : (
            services.map((s) => (
              <TouchableOpacity key={s.id} style={styles.serviceCard} onPress={() => handleBook(s)}>
                <View style={styles.serviceInfo}>
                  <Text style={styles.serviceName}>{s.name}</Text>
                  {s.description ? <Text style={styles.serviceDesc} numberOfLines={2}>{s.description}</Text> : null}
                  {s.duration_minutes ? (
                    <Text style={styles.serviceMeta}>⏱ {s.duration_minutes} min</Text>
                  ) : null}
                </View>
                <View style={styles.serviceRight}>
                  {(() => {
                    const activeOpts = s.service_options?.filter((o) => o.is_active) ?? [];
                    if (activeOpts.length > 0) {
                      const min = Math.min(...activeOpts.map((o) => o.price));
                      return <Text style={styles.servicePrice}>From ₱{min.toLocaleString('en-PH')}</Text>;
                    }
                    if (s.price > 0) {
                      return <Text style={styles.servicePrice}>₱{s.price.toLocaleString('en-PH')}</Text>;
                    }
                    return <Text style={[styles.servicePrice, { color: COLORS.textSecondary }]}>Request Quote</Text>;
                  })()}
                  <TouchableOpacity style={styles.bookBtn} onPress={() => handleBook(s)}>
                    <Text style={styles.bookBtnText}>Book</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Gallery */}
        {gallery.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Gallery</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
              {gallery.map((img) => (
                <View key={img.id} style={styles.galleryItem}>
                  <Image source={{ uri: img.image_url }} style={styles.galleryImage} resizeMode="cover" />
                  {img.is_before_after && (
                    <View style={styles.beforeAfterTag}>
                      <Text style={styles.beforeAfterText}>Before/After</Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Reviews */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Reviews</Text>
            <Text style={styles.reviewCount}>{provider.total_reviews} reviews</Text>
          </View>
          {reviews.length === 0 ? (
            <Text style={styles.emptyText}>No reviews yet.</Text>
          ) : (
            reviews.map((r) => {
              return (
                <View key={r.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <Avatar uri={r.customer_avatar_url} name={r.customer_name} size={36} />
                    <View style={styles.reviewMeta}>
                      <Text style={styles.reviewName}>{r.customer_name ?? 'Customer'}</Text>
                      <View style={styles.ratingRow}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Ionicons key={star} name={star <= r.rating ? 'star' : 'star-outline'} size={12} color="#F59E0B" />
                        ))}
                        <Text style={styles.reviewDate}>{format(new Date(r.created_at), 'MMM d, yyyy')}</Text>
                      </View>
                    </View>
                  </View>
                  {r.title ? <Text style={styles.reviewTitle}>{r.title}</Text> : null}
                  {r.comment ? <Text style={styles.reviewText}>{r.comment}</Text> : null}
                  {r.photo_urls && r.photo_urls.length > 0 && (
                    <View style={styles.reviewPhotos}>
                      {r.photo_urls.map((url, idx) => (
                        <Image key={idx} source={{ uri: url }} style={styles.reviewPhotoThumb} />
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* Bottom CTA */}
        <View style={styles.bottomSpace} />
      </ScrollView>

      <ImageViewerModal
        visible={viewerVisible}
        imageUrl={viewerUrl}
        onClose={() => setViewerVisible(false)}
        title={viewerTitle}
      />

      {/* Floating Book Button */}
      <View style={styles.floatingBar}>
        <TouchableOpacity style={styles.reportBtn} onPress={() => navigation.navigate('ReportScreen', { reportedUserId: provider.id, reportedUserName: providerName })}>
          <Ionicons name="flag-outline" size={18} color={COLORS.textLight} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.chatBtn} onPress={() => Alert.alert('Chat', 'Chat feature coming soon')}>
          <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
          <Text style={styles.chatBtnText}>Chat</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.mainBookBtn} onPress={() => handleBook()}>
          <Text style={styles.mainBookBtnText}>Book Service</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.lg + 8,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  iconBtnActive: { backgroundColor: 'rgba(255,255,255,0.9)' },
  coverWrap: { height: 200, position: 'relative' },
  coverPhoto: { width: '100%', height: '100%' },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.15)' },
  coverZoomHint: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 16,
    padding: 6,
  },
  profileCard: {
    backgroundColor: COLORS.surface, marginHorizontal: SPACING.md,
    marginTop: -50, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg, alignItems: 'center', ...SHADOWS.medium,
    borderWidth: 1, borderColor: COLORS.border,
  },
  logoWrap: { position: 'relative', marginTop: -70 },
  verifiedBadge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: COLORS.white, borderRadius: 10 },
  providerName: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.xl, color: COLORS.text, marginTop: SPACING.sm },
  categoryName: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.sm },
  availabilityRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  availabilityDot: { width: 8, height: 8, borderRadius: 4 },
  availableDot: { backgroundColor: '#22C55E' },
  unavailableDot: { backgroundColor: '#EF4444' },
  availabilityText: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.xs },
  availableText: { color: '#22C55E' },
  unavailableText: { color: '#EF4444' },
  responseTimeWrap: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  responseTimeText: { fontFamily: FONTS.regular, fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  metricsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: SPACING.md, gap: SPACING.md,
  },
  metric: { alignItems: 'center', gap: 2 },
  metricValue: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.base, color: COLORS.text },
  metricLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  metricDivider: { width: 1, height: 24, backgroundColor: COLORS.border },
  badgesRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: SPACING.xs, marginTop: SPACING.sm,
  },
  badgeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  badgeChipText: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.xs, color: COLORS.primary },
  section: { paddingHorizontal: SPACING.md, marginTop: SPACING.lg },
  sectionTitle: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.lg, color: COLORS.text, marginBottom: SPACING.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  reviewCount: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  aboutText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, lineHeight: 22 },
  infoList: { marginTop: SPACING.md, gap: SPACING.sm },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  infoText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  serviceCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  serviceInfo: { flex: 1 },
  serviceName: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.base, color: COLORS.text },
  serviceDesc: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  serviceMeta: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 4 },
  serviceRight: { alignItems: 'flex-end', gap: SPACING.sm },
  servicePrice: { fontFamily: FONTS.bold, fontSize: FONTS.sizes.lg, color: COLORS.primary },
  bookBtn: {
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  bookBtnText: { fontFamily: FONTS.semiBold, color: COLORS.white, fontSize: FONTS.sizes.sm },
  galleryRow: { gap: SPACING.sm },
  galleryItem: { position: 'relative' },
  galleryImage: { width: 140, height: 140, borderRadius: BORDER_RADIUS.lg },
  beforeAfterTag: {
    position: 'absolute', bottom: 8, left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  beforeAfterText: { fontFamily: FONTS.medium, color: COLORS.white, fontSize: 10 },
  reviewCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  reviewMeta: { flex: 1 },
  reviewName: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.base, color: COLORS.text },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  reviewDate: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginLeft: 4 },
  reviewText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: SPACING.sm, lineHeight: 20 },
  emptyText: { fontSize: FONTS.sizes.sm, color: COLORS.textLight, fontStyle: 'italic' },
  bottomSpace: { height: 100 },
  floatingBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  reportBtn: {
    width: 44, height: 48, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surfaceSecondary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  chatBtn: {
    width: 60, height: 48, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.primary,
  },
  chatBtnText: { fontFamily: FONTS.medium, fontSize: 10, color: COLORS.primary, marginTop: 2 },
  mainBookBtn: {
    flex: 1, height: 48, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  mainBookBtnText: { fontFamily: FONTS.bold, color: COLORS.white, fontSize: FONTS.sizes.base },
  reviewTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginTop: SPACING.sm },
  reviewPhotos: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm, flexWrap: 'wrap' },
  reviewPhotoThumb: { width: 80, height: 80, borderRadius: BORDER_RADIUS.md },
});
