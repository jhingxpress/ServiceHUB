import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Dimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Service, ServiceImage, Provider, ProviderCategory, ProviderPortfolio } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import { ProviderStackParamList } from '../../navigation/types';

interface ProviderReview {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  photo_urls: string[] | null;
  customer_name: string | null;
  customer_avatar_url: string | null;
  created_at: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type RouteType = RouteProp<ProviderStackParamList, 'ProviderServicePreview'>;

export default function ProviderServicePreviewScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteType>();
  const { serviceId } = route.params;
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [service, setService] = useState<Service | null>(null);
  const [serviceImages, setServiceImages] = useState<ServiceImage[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [providerCategories, setProviderCategories] = useState<ProviderCategory[]>([]);
  const [portfolio, setPortfolio] = useState<ProviderPortfolio[]>([]);
  const [reviews, setReviews] = useState<ProviderReview[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: svc } = await supabase.from('services').select('*').eq('id', serviceId).single();
      setService(svc as Service | null);

      const [{ data: imgs }, { data: prov }] = await Promise.all([
        supabase.from('service_images').select('*').eq('service_id', serviceId).order('sort_order'),
        supabase.from('providers').select('*').eq('id', svc?.provider_id ?? user?.id).single(),
      ]);

      setServiceImages((imgs ?? []) as ServiceImage[]);
      setProvider(prov as Provider | null);

      if (prov?.id) {
        const [{ data: cats }, { data: port }, { data: revs }] = await Promise.all([
          supabase
            .from('provider_categories')
            .select('*, categories(id, name)')
            .eq('provider_id', prov.id)
            .order('is_primary', { ascending: false }),
          supabase
            .from('provider_portfolio')
            .select('*')
            .eq('provider_id', prov.id)
            .order('sort_order'),
          supabase
            .from('reviews')
            .select('id, rating, title, comment, photo_urls, customer_name, customer_avatar_url, created_at')
            .eq('provider_id', prov.id)
            .eq('is_visible', true)
            .order('created_at', { ascending: false })
            .limit(20),
        ]);
        console.log('[Preview] reviews loaded:', revs?.length ?? 0);
        setProviderCategories((cats ?? []) as ProviderCategory[]);
        setPortfolio((port ?? []) as ProviderPortfolio[]);
        setReviews((revs ?? []) as ProviderReview[]);
      }
    } catch (err: any) {
      console.error('[Preview] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [serviceId, user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const formatPrice = (amount: number) => `₱${amount.toLocaleString('en-PH')}`;

  const priceRange = () => {
    if (service && service.price > 0) return formatPrice(service.price);
    return 'Price not set';
  };

  const primaryCategory = providerCategories.find((c) => c.is_primary) ?? providerCategories[0];
  const categoryName = primaryCategory?.categories?.name ?? 'Service';

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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Service Preview</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Preview Badge */}
        <View style={styles.previewBadge}>
          <Ionicons name="eye-outline" size={14} color={COLORS.primary} />
          <Text style={styles.previewBadgeText}>Customer View Preview</Text>
        </View>

        {/* Photo Carousel */}
        {serviceImages.length > 0 ? (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                setActiveImageIndex(idx);
              }}
            >
              {serviceImages.map((img, idx) => (
                <View key={img.id}>
                  <Image source={{ uri: img.image_url }} style={styles.carouselImage} resizeMode="cover" />
                  <View style={styles.photoCountBadge}>
                    <Text style={styles.photoCountText}>{idx + 1} / {serviceImages.length}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            {serviceImages.length > 1 && (
              <View style={styles.dotRow}>
                {serviceImages.map((_, i) => (
                  <View key={i} style={[styles.dot, i === activeImageIndex && styles.dotActive]} />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.noImagePlaceholder}>
            <Ionicons name="images-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.noImageText}>No photos uploaded yet</Text>
          </View>
        )}

        {/* Service Info */}
        <View style={styles.infoCard}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryBadgeText}>{categoryName}</Text>
          </View>
          <Text style={styles.serviceName}>{service?.name ?? 'Service Name'}</Text>
          <Text style={styles.priceText}>{priceRange()}</Text>
          {service?.duration_minutes ? (
            <View style={styles.durationRow}>
              <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} />
              <Text style={styles.durationText}>{service.duration_minutes} min</Text>
            </View>
          ) : null}
          {service?.description ? (
            <Text style={styles.description}>{service.description}</Text>
          ) : null}
        </View>

        {/* Provider Card */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Service Provider</Text>
          <View style={styles.providerRow}>
            <Avatar
              uri={provider?.profile_photo_url ?? user?.avatar_url ?? null}
              name={provider?.business_name ?? user?.full_name}
              size={56}
            />
            <View style={styles.providerInfo}>
              <Text style={styles.providerName}>{provider?.business_name ?? provider?.owner_name ?? user?.full_name ?? 'Provider'}</Text>
              {provider?.business_headline ? (
                <Text style={styles.providerHeadline}>{provider.business_headline}</Text>
              ) : null}
              {provider?.service_area ? (
                <View style={styles.metaRow}>
                  <Ionicons name="map-outline" size={13} color={COLORS.textSecondary} />
                  <Text style={styles.metaText}>{provider.service_area}</Text>
                </View>
              ) : null}
              {provider?.city ? (
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={13} color={COLORS.textSecondary} />
                  <Text style={styles.metaText}>{provider.city}{provider?.province ? `, ${provider.province}` : ''}</Text>
                </View>
              ) : null}
              {provider?.years_of_experience ? (
                <View style={styles.metaRow}>
                  <Ionicons name="briefcase-outline" size={13} color={COLORS.textSecondary} />
                  <Text style={styles.metaText}>{provider.years_of_experience} years experience</Text>
                </View>
              ) : null}
            </View>
          </View>
          {provider?.is_available !== undefined && (
            <View style={[styles.availabilityBadge, provider.is_available ? styles.availabilityActive : styles.availabilityInactive]}>
              <Ionicons name={provider.is_available ? 'checkmark-circle' : 'close-circle'} size={14} color={provider.is_available ? COLORS.success : COLORS.error} />
              <Text style={[styles.availabilityText, provider.is_available ? { color: COLORS.success } : { color: COLORS.error }]}>
                {provider.is_available ? 'Available for bookings' : 'Currently unavailable'}
              </Text>
            </View>
          )}
        </View>

        {/* Portfolio Gallery */}
        {portfolio.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Portfolio</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {portfolio.map((p) => (
                <Image key={p.id} source={{ uri: p.image_url }} style={styles.portfolioThumb} resizeMode="cover" />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Customer Reviews */}
        {reviews.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Customer Reviews ({reviews.length})</Text>
            {reviews.map((r) => (
              <View key={r.id} style={styles.reviewItem}>
                <View style={styles.reviewHeader}>
                  <View style={styles.reviewStars}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Ionicons key={s} name={s <= r.rating ? 'star' : 'star-outline'} size={13} color="#F59E0B" />
                    ))}
                  </View>
                  <Text style={styles.reviewCustomer}>{r.customer_name ?? 'Customer'}</Text>
                  <Text style={styles.reviewDate}>{new Date(r.created_at).toLocaleDateString()}</Text>
                </View>
                {r.title ? <Text style={styles.reviewTitle}>{r.title}</Text> : null}
                {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
                {r.photo_urls && r.photo_urls.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reviewPhotosRow}>
                    {r.photo_urls.map((url, i) => (
                      <Image
                        key={i}
                        source={{ uri: url }}
                        style={styles.reviewPhotoThumb}
                        onError={() => console.warn('[Preview] Review photo load error', url)}
                      />
                    ))}
                  </ScrollView>
                )}
              </View>
            ))}
          </View>
        )}

        {/* CTA Buttons (disabled preview) */}
        <View style={styles.ctaRow}>
          <TouchableOpacity style={[styles.ctaBtn, styles.ctaSecondary]} activeOpacity={0.8} onPress={() => Alert.alert('Preview', 'This is a preview. Customers will be able to contact you here.')}>
            <Ionicons name="chatbubble-outline" size={18} color={COLORS.primary} />
            <Text style={styles.ctaSecondaryText}>Contact</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.ctaBtn, styles.ctaPrimary]} activeOpacity={0.8} onPress={() => Alert.alert('Preview', 'This is a preview. Customers will be able to book here.')}>
            <Ionicons name="calendar-outline" size={18} color={COLORS.white} />
            <Text style={styles.ctaPrimaryText}>Book Now</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text },
  previewBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.primaryLight, paddingVertical: 6, marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md, marginBottom: SPACING.sm,
  },
  previewBadgeText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.primary },
  carouselImage: {
    width: SCREEN_WIDTH - SPACING.md * 2,
    height: 260,
    borderRadius: BORDER_RADIUS.xl,
    marginHorizontal: SPACING.md,
  },
  dotRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: SPACING.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.primary },
  noImagePlaceholder: {
    height: 260, marginHorizontal: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed',
  },
  noImageText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: SPACING.sm },
  infoCard: {
    backgroundColor: COLORS.surface, marginHorizontal: SPACING.md, marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  categoryBadge: {
    alignSelf: 'flex-start', backgroundColor: COLORS.primaryLight,
    borderRadius: BORDER_RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 4,
    marginBottom: SPACING.sm,
  },
  categoryBadgeText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.primary },
  serviceName: { fontSize: FONTS.sizes.xxl, fontFamily: FONTS.bold, color: COLORS.text },
  priceText: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.primary, marginTop: SPACING.xs },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACING.xs },
  durationText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  description: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: SPACING.md, lineHeight: 20 },
  sectionCard: {
    backgroundColor: COLORS.surface, marginHorizontal: SPACING.md, marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  sectionTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.md },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  providerInfo: { flex: 1 },
  providerName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  providerHeadline: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  metaText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  photoCountBadge: {
    position: 'absolute',
    bottom: 12,
    right: SPACING.md + 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  photoCountText: { fontSize: FONTS.sizes.xs, color: COLORS.white, fontFamily: FONTS.semiBold },
  portfolioThumb: {
    width: 100,
    height: 100,
    borderRadius: BORDER_RADIUS.lg,
    marginRight: SPACING.sm,
  },
  availabilityBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACING.md,
    paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.full, alignSelf: 'flex-start',
  },
  availabilityActive: { backgroundColor: '#D1FAE5' },
  availabilityInactive: { backgroundColor: '#FEE2E2' },
  availabilityText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold },
  reviewItem: { paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.border },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 4 },
  reviewStars: { flexDirection: 'row', gap: 2 },
  reviewCustomer: { flex: 1, fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  reviewDate: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  reviewTitle: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: 2 },
  reviewComment: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 18 },
  reviewPhotosRow: { marginTop: SPACING.xs },
  reviewPhotoThumb: { width: 72, height: 72, borderRadius: BORDER_RADIUS.md, marginRight: SPACING.xs },
  ctaRow: { flexDirection: 'row', gap: SPACING.sm, marginHorizontal: SPACING.md, marginTop: SPACING.lg },
  ctaBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
  },
  ctaPrimary: { backgroundColor: COLORS.primary },
  ctaSecondary: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.primary },
  ctaPrimaryText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.white },
  ctaSecondaryText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.primary },
});
