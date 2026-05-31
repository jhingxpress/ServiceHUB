import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Dimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Service, ServiceImage, Provider, Review } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { CustomerStackParamList } from '../../navigation/types';
import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;
type RouteType = RouteProp<CustomerStackParamList, 'ServiceDetail'>;

const formatPrice = (amount: number) => `₱${amount.toLocaleString('en-PH')}`;

export default function ServiceDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { serviceId } = route.params;
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [service, setService] = useState<Service | null>(null);
  const [images, setImages] = useState<ServiceImage[]>([]);
  const [serviceOptions, setServiceOptions] = useState<any[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: svc } = await supabase.from('services').select('*').eq('id', serviceId).single();
      setService(svc as Service | null);

      const [{ data: imgs }, { data: opts }, { data: prov }, { data: revs }] = await Promise.all([
        supabase.from('service_images').select('*').eq('service_id', serviceId).order('sort_order'),
        supabase.from('service_options').select('*').eq('service_id', serviceId).eq('is_active', true).order('sort_order'),
        supabase.from('providers').select('*').eq('id', (svc as any)?.provider_id).single(),
        supabase
          .from('reviews')
          .select('*, customer:users!reviews_customer_id_fkey(full_name, avatar_url)')
          .eq('provider_id', (svc as any)?.provider_id)
          .eq('is_visible', true)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      setImages((imgs ?? []) as ServiceImage[]);
      setServiceOptions(opts ?? []);
      setProvider(prov as Provider | null);
      setReviews((revs ?? []) as Review[]);
    } catch (err: any) {
      console.error('[ServiceDetail] load error:', err);
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleBook = () => {
    if (!user) { Alert.alert('Sign In Required', 'Please sign in to book a service.'); return; }
    if (!provider) return;
    navigation.navigate('BookService', {
      providerId: provider.id,
      serviceId,
      serviceName: service?.name,
      price: service?.price,
    });
  };

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
        <Text style={styles.headerTitle} numberOfLines={1}>{service?.name ?? 'Service'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Photo Gallery */}
        {images.length > 0 ? (
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
              {images.map((img, idx) => (
                <View key={img.id}>
                  <Image source={{ uri: img.image_url }} style={styles.carouselImage} resizeMode="cover" />
                  <View style={styles.photoCountBadge}>
                    <Text style={styles.photoCountText}>{idx + 1} / {images.length}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            {images.length > 1 && (
              <View style={styles.dotRow}>
                {images.map((_, i) => (
                  <View key={i} style={[styles.dot, i === activeImageIndex && styles.dotActive]} />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.noImagePlaceholder}>
            <Ionicons name="images-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.noImageText}>No photos yet</Text>
          </View>
        )}

        {/* Service Info */}
        <View style={styles.infoCard}>
          <Text style={styles.serviceName}>{service?.name ?? 'Service'}</Text>
          <Text style={styles.priceText}>
            {service && service.price > 0 ? formatPrice(service.price) : 'Price not set'}
          </Text>
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

        {/* Pricing Options */}
        {serviceOptions.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Pricing Options</Text>
            {serviceOptions.map((opt) => (
              <View key={opt.id} style={styles.optionRow}>
                <View style={styles.optionLeft}>
                  <Text style={styles.optionName}>{opt.name}</Text>
                  {opt.description ? <Text style={styles.optionDesc}>{opt.description}</Text> : null}
                </View>
                <Text style={styles.optionPrice}>₱{(opt.price ?? 0).toLocaleString('en-PH')}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Provider Card */}
        {provider && (
          <TouchableOpacity
            style={styles.sectionCard}
            onPress={() => navigation.navigate('ProviderStorefront', { providerId: provider.id })}
            activeOpacity={0.85}
          >
            <Text style={styles.sectionTitle}>Service Provider</Text>
            <View style={styles.providerRow}>
              <Avatar uri={provider?.profile_photo_url ?? provider?.business_logo ?? null} name={provider?.business_name ?? provider?.owner_name} size={56} />
              <View style={styles.providerInfo}>
                <Text style={styles.providerName}>{provider?.business_name ?? provider?.owner_name ?? 'Provider'}</Text>
                {provider?.business_headline ? <Text style={styles.providerHeadline}>{provider.business_headline}</Text> : null}
                {provider?.city ? (
                  <View style={styles.metaRow}>
                    <Ionicons name="location-outline" size={13} color={COLORS.textSecondary} />
                    <Text style={styles.metaText}>{provider.city}{provider?.province ? `, ${provider.province}` : ''}</Text>
                  </View>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
            </View>
          </TouchableOpacity>
        )}

        {/* Reviews */}
        {reviews.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Reviews ({reviews.length})</Text>
            {reviews.slice(0, 3).map((r) => (
              <View key={r.id} style={styles.reviewRow}>
                <View style={styles.reviewHeader}>
                  <Avatar uri={(r as any).customer?.avatar_url ?? null} name={(r as any).customer?.full_name} size={32} />
                  <View style={styles.reviewMeta}>
                    <Text style={styles.reviewAuthor}>{(r as any).customer?.full_name ?? 'Customer'}</Text>
                    <View style={styles.starRow}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Ionicons key={i} name={i < r.rating ? 'star' : 'star-outline'} size={12} color={COLORS.warning} />
                      ))}
                    </View>
                  </View>
                </View>
                {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
              </View>
            ))}
          </View>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>

      {/* Bottom CTA */}
      <View style={styles.ctaBar}>
        <Button
          title="Book Now"
          onPress={handleBook}
          fullWidth
          style={{ marginHorizontal: SPACING.md }}
        />
      </View>
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
  headerTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.text, flex: 1, textAlign: 'center', marginHorizontal: SPACING.sm },
  carouselImage: {
    width: SCREEN_WIDTH - SPACING.md * 2,
    height: 260,
    borderRadius: BORDER_RADIUS.xl,
    marginHorizontal: SPACING.md,
  },
  dotRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: SPACING.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.primary },
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
  reviewRow: { marginBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.divider, paddingBottom: SPACING.md },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  reviewMeta: { flex: 1 },
  reviewAuthor: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  starRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
  reviewComment: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: SPACING.xs, lineHeight: 18 },
  ctaBar: {
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  optionLeft: { flex: 1 },
  optionName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  optionDesc: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  optionPrice: { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: COLORS.primary },
});
