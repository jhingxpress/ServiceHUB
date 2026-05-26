import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { Provider, Service, Review } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import StarRating from '../../components/ui/StarRating';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { CustomerStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;
type RouteType = RouteProp<CustomerStackParamList, 'ProviderProfile'>;

export default function ProviderProfileScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { providerId } = route.params;

  const [provider, setProvider] = useState<Provider | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

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
          .select('*, categories(name)')
          .eq('provider_id', providerId)
          .eq('is_active', true),
        supabase
          .from('reviews')
          .select('*, customer:users!reviews_customer_id_fkey(full_name, avatar_url)')
          .eq('provider_id', providerId)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      setProvider(provRes.data ?? null);
      setServices(srvRes.data ?? []);
      setReviews(revRes.data ?? []);
      setLoading(false);
    };
    load();
  }, [providerId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!provider) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Provider not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const providerUser = provider.users;

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
            <Avatar
              uri={providerUser?.avatar_url}
              name={providerUser?.full_name}
              size={72}
              borderColor={COLORS.white}
            />
            <View style={styles.profileMeta}>
              <View style={styles.nameRow}>
                <Text style={styles.providerName}>{providerUser?.full_name ?? 'Provider'}</Text>
                {provider.is_verified && (
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                )}
              </View>
              <Text style={styles.categoryText}>{provider.categories?.name ?? 'Services'}</Text>
              <View style={styles.ratingRow}>
                <StarRating rating={provider.rating} size={14} />
                <Text style={styles.ratingNum}>{Number(provider.rating).toFixed(1)}</Text>
                <Text style={styles.reviewCount}>({provider.total_reviews} reviews)</Text>
              </View>
            </View>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{provider.total_reviews}</Text>
              <Text style={styles.statLabel}>Reviews</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{Number(provider.rating).toFixed(1)}</Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{services.length}</Text>
              <Text style={styles.statLabel}>Services</Text>
            </View>
          </View>

          {/* Details */}
          {provider.location && (
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.detailText}>{provider.location}</Text>
            </View>
          )}
          {provider.hourly_rate && (
            <View style={styles.detailRow}>
              <Ionicons name="cash-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.detailText}>Starting at ${provider.hourly_rate}/hr</Text>
            </View>
          )}
          {provider.is_available ? (
            <View style={styles.detailRow}>
              <Ionicons name="checkmark-circle-outline" size={16} color={COLORS.success} />
              <Text style={[styles.detailText, { color: COLORS.success }]}>Available now</Text>
            </View>
          ) : (
            <View style={styles.detailRow}>
              <Ionicons name="time-outline" size={16} color={COLORS.warning} />
              <Text style={[styles.detailText, { color: COLORS.warning }]}>Currently unavailable</Text>
            </View>
          )}

          {/* Bio */}
          {provider.bio && (
            <View style={styles.bioSection}>
              <Text style={styles.bioTitle}>About</Text>
              <Text style={styles.bioText}>{provider.bio}</Text>
            </View>
          )}
        </View>

        {/* Services */}
        {services.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Services Offered</Text>
            {services.map((service) => (
              <View key={service.id} style={styles.serviceCard}>
                <View style={styles.serviceInfo}>
                  <Text style={styles.serviceName}>{service.name}</Text>
                  {service.description && (
                    <Text style={styles.serviceDesc} numberOfLines={2}>{service.description}</Text>
                  )}
                  {service.duration_minutes && (
                    <View style={styles.durationRow}>
                      <Ionicons name="time-outline" size={13} color={COLORS.textLight} />
                      <Text style={styles.durationText}>{service.duration_minutes} min</Text>
                    </View>
                  )}
                </View>
                <View style={styles.serviceRight}>
                  <Text style={styles.servicePrice}>${service.price}</Text>
                  <Button
                    title="Book"
                    onPress={() =>
                      navigation.navigate('BookService', {
                        providerId,
                        serviceId: service.id,
                        serviceName: service.name,
                        price: service.price,
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

        {/* Reviews */}
        {reviews.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reviews</Text>
            {reviews.map((review) => (
              <View key={review.id} style={styles.reviewCard}>
                <View style={styles.reviewHeader}>
                  <Avatar
                    uri={review.customer?.avatar_url}
                    name={review.customer?.full_name}
                    size={36}
                  />
                  <View style={styles.reviewMeta}>
                    <Text style={styles.reviewerName}>{review.customer?.full_name ?? 'Customer'}</Text>
                    <StarRating rating={review.rating} size={12} />
                  </View>
                  <Text style={styles.reviewDate}>
                    {new Date(review.created_at).toLocaleDateString()}
                  </Text>
                </View>
                {review.comment && (
                  <Text style={styles.reviewComment}>{review.comment}</Text>
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
            {provider.hourly_rate && (
              <>
                <Text style={styles.ctaPrice}>${provider.hourly_rate}/hr</Text>
                <Text style={styles.ctaLabel}>Starting rate</Text>
              </>
            )}
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
  headerBg: {
    height: 140,
    backgroundColor: COLORS.primary,
    padding: SPACING.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.md,
    marginTop: -SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.medium,
  },
  avatarRow: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.md },
  profileMeta: { flex: 1, justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  providerName: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text },
  categoryText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ratingNum: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text },
  reviewCount: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.primary },
  statLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: COLORS.border },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.xs },
  detailText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  bioSection: { marginTop: SPACING.md },
  bioTitle: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.xs },
  bioText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, lineHeight: 22 },
  section: { padding: SPACING.md },
  sectionTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  serviceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  serviceInfo: { flex: 1, paddingRight: SPACING.sm },
  serviceName: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  serviceDesc: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 3, lineHeight: 18 },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  durationText: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  serviceRight: { alignItems: 'flex-end', justifyContent: 'space-between' },
  servicePrice: { fontSize: FONTS.sizes.lg, fontWeight: '800', color: COLORS.primary },
  bookBtn: { marginTop: SPACING.sm },
  reviewCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  reviewMeta: { flex: 1 },
  reviewerName: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.text },
  reviewDate: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  reviewComment: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
  bottomPad: { height: 100 },
  ctaBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    ...SHADOWS.medium,
  },
  ctaPrice: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text },
  ctaLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  ctaBtn: { minWidth: 130 },
});
