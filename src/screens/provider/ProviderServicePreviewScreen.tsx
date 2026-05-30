import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Dimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Service, ServiceImage, ServiceOption, Provider, ProviderCategory } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import { ProviderStackParamList } from '../../navigation/types';

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
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [providerCategories, setProviderCategories] = useState<ProviderCategory[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: svc } = await supabase.from('services').select('*').eq('id', serviceId).single();
      setService(svc as Service | null);

      const [{ data: imgs }, { data: opts }, { data: prov }] = await Promise.all([
        supabase.from('service_images').select('*').eq('service_id', serviceId).order('sort_order'),
        supabase.from('service_options').select('*').eq('service_id', serviceId).eq('is_active', true).order('price'),
        supabase.from('providers').select('*').eq('id', svc?.provider_id ?? user?.id).single(),
      ]);

      setServiceImages((imgs ?? []) as ServiceImage[]);
      setServiceOptions((opts ?? []) as ServiceOption[]);
      setProvider(prov as Provider | null);

      if (prov?.id) {
        const { data: cats } = await supabase
          .from('provider_categories')
          .select('*, categories(id, name)')
          .eq('provider_id', prov.id)
          .order('is_primary', { ascending: false });
        setProviderCategories((cats ?? []) as ProviderCategory[]);
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
    if (serviceOptions.length > 0) {
      const prices = serviceOptions.map((o) => o.price).filter((p) => p > 0);
      if (prices.length === 0) return 'Price not set';
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      return min === max ? formatPrice(min) : `${formatPrice(min)} - ${formatPrice(max)}`;
    }
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
              {serviceImages.map((img) => (
                <Image key={img.id} source={{ uri: img.image_url }} style={styles.carouselImage} resizeMode="cover" />
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

        {/* Pricing Options */}
        {serviceOptions.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Pricing Options</Text>
            {serviceOptions.map((opt) => (
              <View key={opt.id} style={styles.optionRow}>
                <View style={styles.optionInfo}>
                  <Text style={styles.optionName}>{opt.name}</Text>
                  {opt.description ? <Text style={styles.optionDesc}>{opt.description}</Text> : null}
                </View>
                <Text style={styles.optionPrice}>{formatPrice(opt.price)}</Text>
              </View>
            ))}
          </View>
        )}

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
              {provider?.city ? (
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={13} color={COLORS.textSecondary} />
                  <Text style={styles.locationText}>{provider.city}{provider?.province ? `, ${provider.province}` : ''}</Text>
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
  optionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  optionInfo: { flex: 1, marginRight: SPACING.sm },
  optionName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.medium, color: COLORS.text },
  optionDesc: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  optionPrice: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.primary },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  providerInfo: { flex: 1 },
  providerName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  providerHeadline: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  locationText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  availabilityBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACING.md,
    paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.full, alignSelf: 'flex-start',
  },
  availabilityActive: { backgroundColor: '#D1FAE5' },
  availabilityInactive: { backgroundColor: '#FEE2E2' },
  availabilityText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold },
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
