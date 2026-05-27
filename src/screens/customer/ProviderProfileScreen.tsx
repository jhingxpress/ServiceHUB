import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { Provider, Review } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import StarRating from '../../components/ui/StarRating';
import Button from '../../components/ui/Button';
import { CustomerStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;
type RouteType = RouteProp<CustomerStackParamList, 'ProviderProfile'>;

interface ServiceOption { id: string; name: string; description: string | null; price: number; is_active: boolean; }
interface SubService { id: string; name: string; description: string | null; is_active: boolean; service_options: ServiceOption[]; }
interface ReviewWithMedia extends Omit<Review, 'customer' | 'review_media'> { review_media?: { id: string; url: string; media_type: string }[]; customer?: { full_name: string; avatar_url: string | null }; }

const formatPrice = (amount: number) =>
  `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProviderProfileScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { providerId } = route.params;

  const [provider, setProvider] = useState<Provider | null>(null);
  const [services, setServices] = useState<SubService[]>([]);
  const [reviews, setReviews] = useState<ReviewWithMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedService, setExpandedService] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const [provRes, srvRes, revRes] = await Promise.all([
        supabase
          .from('providers')
          .select('*, users!providers_id_fkey(full_name, avatar_url, phone, email), categories(name, icon, color)')
          .eq('id', providerId)
          .single(),
        supabase
          .from('services')
          .select('*, service_options(*)')
          .eq('provider_id', providerId)
          .eq('is_active', true)
          .order('sort_order')
          .order('created_at'),
        supabase
          .from('reviews')
          .select('*, customer:users!reviews_customer_id_fkey(full_name, avatar_url), review_media(*)')
          .eq('provider_id', providerId)
          .eq('is_visible', true)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      setProvider(provRes.data ?? null);
      const rawServices: SubService[] = (srvRes.data ?? []).map((s: any) => ({
        ...s,
        service_options: (s.service_options ?? []).filter((o: ServiceOption) => o.is_active),
      }));
      setServices(rawServices);
      setReviews(revRes.data ?? []);
      setLoading(false);
    };
    load();
  }, [providerId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!provider) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><Text style={styles.errorText}>Provider not found</Text></View>
      </SafeAreaView>
    );
  }

  const providerUser = (provider as any).users;
  const lowestPrice = services
    .flatMap((s) => s.service_options.map((o) => o.price))
    .reduce((min, p) => (p < min ? p : min), Infinity);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.headerBg}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarRow}>
            <Avatar uri={providerUser?.avatar_url} name={providerUser?.full_name} size={72} borderColor={COLORS.white} />
            <View style={styles.profileMeta}>
              <View style={styles.nameRow}>
                <Text style={styles.providerName}>{(provider as any).business_name || providerUser?.full_name || 'Provider'}</Text>
                {provider.is_verified && <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />}
              </View>
              <Text style={styles.categoryText}>{(provider as any).categories?.name ?? 'Services'}</Text>
              <View style={styles.ratingRow}>
                <StarRating rating={provider.rating} size={14} />
                <Text style={styles.ratingNum}>{Number(provider.rating).toFixed(1)}</Text>
                <Text style={styles.reviewCount}>({provider.total_reviews} reviews)</Text>
              </View>
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{Number(provider.rating).toFixed(1)}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{provider.total_reviews}</Text>
              <Text style={styles.statLabel}>Reviews</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{(provider as any).completed_jobs ?? 0}</Text>
              <Text style={styles.statLabel}>Jobs Done</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{services.length}</Text>
              <Text style={styles.statLabel}>Services</Text>
            </View>
          </View>

          {/* Business details */}
          {(provider as any).owner_name ? (
            <View style={styles.detailRow}>
              <Ionicons name="person-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.detailText}>{(provider as any).owner_name}</Text>
            </View>
          ) : null}
          {(provider as any).business_address || provider.location ? (
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.detailText}>{(provider as any).business_address || provider.location}</Text>
            </View>
          ) : null}
          {(provider as any).phone ? (
            <View style={styles.detailRow}>
              <Ionicons name="call-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.detailText}>{(provider as any).phone}</Text>
            </View>
          ) : null}
          {lowestPrice < Infinity ? (
            <View style={styles.detailRow}>
              <Ionicons name="cash-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.detailText}>Starting at {formatPrice(lowestPrice)}</Text>
            </View>
          ) : null}
          <View style={styles.detailRow}>
            {provider.is_available ? (
              <>
                <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success} />
                <Text style={[styles.detailText, { color: COLORS.success }]}>Available now</Text>
              </>
            ) : (
              <>
                <Ionicons name="time-outline" size={16} color={COLORS.warning} />
                <Text style={[styles.detailText, { color: COLORS.warning }]}>Currently unavailable</Text>
              </>
            )}
          </View>

          {/* Bio */}
          {provider.bio ? (
            <View style={styles.bioSection}>
              <Text style={styles.bioTitle}>About</Text>
              <Text style={styles.bioText}>{provider.bio}</Text>
            </View>
          ) : null}
        </View>

        {/* Sub-services with options */}
        {services.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Services Offered</Text>
            {services.map((service) => {
              const isExpanded = expandedService === service.id;
              return (
                <View key={service.id} style={styles.serviceCard}>
                  <TouchableOpacity
                    style={styles.serviceHeader}
                    onPress={() => setExpandedService(isExpanded ? null : service.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.serviceInfo}>
                      <Text style={styles.serviceName}>{service.name}</Text>
                      {service.description ? (
                        <Text style={styles.serviceDesc} numberOfLines={2}>{service.description}</Text>
                      ) : null}
                      <Text style={styles.optionCount}>
                        {service.service_options.length} pricing option{service.service_options.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={COLORS.textSecondary}
                    />
                  </TouchableOpacity>
                  {isExpanded && service.service_options.length > 0 && (
                    <View style={styles.optionsList}>
                      {service.service_options.map((opt) => (
                        <View key={opt.id} style={styles.optionRow}>
                          <View style={styles.optionLeft}>
                            <Text style={styles.optionName}>{opt.name}</Text>
                            {opt.description ? <Text style={styles.optionDesc}>{opt.description}</Text> : null}
                          </View>
                          <View style={styles.optionRight}>
                            <Text style={styles.optionPrice}>{formatPrice(opt.price)}</Text>
                            <Button
                              title="Book"
                              onPress={() =>
                                navigation.navigate('BookService', {
                                  providerId,
                                  serviceId: service.id,
                                  serviceName: `${service.name} – ${opt.name}`,
                                  price: opt.price,
                                  serviceOptionId: opt.id,
                                })
                              }
                              size="sm"
                              style={styles.bookBtn}
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                  {isExpanded && service.service_options.length === 0 && (
                    <View style={styles.noOptions}>
                      <Text style={styles.noOptionsText}>No pricing options yet</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Reviews */}
        {reviews.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customer Reviews</Text>
            {reviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Avatar uri={review.customer?.avatar_url} name={review.customer?.full_name} size={36} />
                  <View style={styles.reviewMeta}>
                    <Text style={styles.reviewerName}>{review.customer?.full_name ?? 'Customer'}</Text>
                    <StarRating rating={review.rating} size={12} />
                  </View>
                  <Text style={styles.reviewDate}>
                    {new Date(review.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
                {(review as any).title ? (
                  <Text style={styles.reviewTitle}>{(review as any).title}</Text>
                ) : null}
                {review.comment ? (
                  <Text style={styles.reviewComment}>{review.comment}</Text>
                ) : null}
                {review.review_media && review.review_media.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaRow}>
                    {review.review_media.filter((m) => m.media_type === 'image').map((m) => (
                      <Image key={m.id} source={{ uri: m.url }} style={styles.reviewImage} />
                    ))}
                  </ScrollView>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Book CTA */}
      {provider.is_available && (
        <View style={styles.ctaBar}>
          <View>
            {lowestPrice < Infinity ? (
              <>
                <Text style={styles.ctaPrice}>{formatPrice(lowestPrice)}</Text>
                <Text style={styles.ctaLabel}>Starting price</Text>
              </>
            ) : null}
          </View>
          <Button
            title="Book Now"
            onPress={() => navigation.navigate('BookService', { providerId })}
            size="md"
            style={styles.ctaBtn}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary },
  headerBg: { height: 140, backgroundColor: COLORS.primary, padding: SPACING.md },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  profileCard: {
    backgroundColor: COLORS.surface, marginHorizontal: SPACING.md, marginTop: -SPACING.xl,
    borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.medium,
  },
  avatarRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  profileMeta: { flex: 1, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  providerName: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text, flexShrink: 1 },
  categoryText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ratingNum: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text },
  reviewCount: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  statsRow: {
    flexDirection: 'row', backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md, padding: SPACING.md, marginBottom: SPACING.md,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: FONTS.sizes.lg, fontWeight: '800', color: COLORS.primary },
  statLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: COLORS.border },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  detailText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, flex: 1 },
  bioSection: { marginTop: SPACING.md },
  bioTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.xs },
  bioText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, lineHeight: 22 },
  section: { padding: SPACING.md },
  sectionTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  serviceCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small, overflow: 'hidden',
  },
  serviceHeader: { flexDirection: 'row', alignItems: 'center', padding: SPACING.md },
  serviceInfo: { flex: 1 },
  serviceName: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  serviceDesc: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 3, lineHeight: 18 },
  optionCount: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontWeight: '600', marginTop: 4 },
  optionsList: { borderTopWidth: 1, borderTopColor: COLORS.border + '60' },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.border + '40',
  },
  optionLeft: { flex: 1 },
  optionName: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.text },
  optionDesc: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  optionRight: { alignItems: 'flex-end', gap: SPACING.xs },
  optionPrice: { fontSize: FONTS.sizes.base, fontWeight: '800', color: COLORS.primary },
  bookBtn: {},
  noOptions: { padding: SPACING.md, alignItems: 'center' },
  noOptionsText: { fontSize: FONTS.sizes.sm, color: COLORS.textLight },
  reviewCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md,
    marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  reviewMeta: { flex: 1 },
  reviewerName: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text },
  reviewDate: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  reviewTitle: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  reviewComment: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
  mediaRow: { marginTop: SPACING.sm },
  reviewImage: { width: 80, height: 80, borderRadius: BORDER_RADIUS.md, marginRight: SPACING.sm },
  bottomPad: { height: 100 },
  ctaBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.surface, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderTopWidth: 1, borderTopColor: COLORS.border, ...SHADOWS.medium,
  },
  ctaPrice: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text },
  ctaLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  ctaBtn: { minWidth: 130 },
});
