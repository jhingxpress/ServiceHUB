import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import ImageView from 'react-native-image-viewing';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { CustomerStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import StarRating from '../../components/ui/StarRating';
import Avatar from '../../components/ui/Avatar';

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;
type RouteType = RouteProp<CustomerStackParamList, 'ReviewDetail'>;

interface ReviewDetailData {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  photo_urls: string[] | null;
  customer_name: string | null;
  customer_avatar_url: string | null;
  created_at: string;
  provider: { id: string; business_name: string | null } | null;
  booking: {
    scheduled_date: string | null;
    service: { name: string } | null;
  } | null;
}

export default function ReviewDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { reviewId, providerName: fallbackProviderName, serviceName: fallbackServiceName, bookingDate: fallbackBookingDate } = route.params;

  const [review, setReview] = useState<ReviewDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageViewVisible, setImageViewVisible] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  const fetchReview = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reviews')
      .select('id, rating, title, comment, photo_urls, customer_name, customer_avatar_url, created_at, provider:providers(id, business_name), booking:bookings(scheduled_date, service:services(name))')
      .eq('id', reviewId)
      .single();
    if (error) {
      console.error('[ReviewDetail] fetch error:', error.code, error.message, error.details);
    }
    console.log('REVIEW DETAIL DATA', JSON.stringify(data, null, 2));
    console.log('PHOTO URLS', (data as any)?.photo_urls);
    setReview(data as unknown as ReviewDetailData | null);
    setLoading(false);
  };

  useEffect(() => { fetchReview(); }, [reviewId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!review) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review Detail</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Text style={{ color: COLORS.textSecondary }}>Review not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayProviderName = review.provider?.business_name ?? fallbackProviderName ?? 'Provider';
  const displayServiceName = review.booking?.service?.name ?? fallbackServiceName ?? 'Service';
  const displayBookingDate = review.booking?.scheduled_date ?? fallbackBookingDate ?? null;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review Detail</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Provider & Service Info */}
        <View style={styles.card}>
          <View style={styles.providerRow}>
            <Avatar uri={null} name={displayProviderName} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>{displayProviderName}</Text>
              <Text style={styles.serviceName}>{displayServiceName}</Text>
              {displayBookingDate && (
                <Text style={styles.metaText}>Booked on {format(new Date(displayBookingDate), 'MMM d, yyyy')}</Text>
              )}
            </View>
          </View>
        </View>

        {/* Rating */}
        <View style={styles.card}>
          <View style={styles.ratingRow}>
            <StarRating rating={review.rating} size={24} />
            <Text style={styles.ratingNum}>{review.rating.toFixed(1)}</Text>
          </View>
          <Text style={styles.reviewDate}>
            Reviewed on {format(new Date(review.created_at), 'MMM d, yyyy')}
          </Text>
        </View>

        {/* Title & Comment */}
        {(!!review.title || !!review.comment) ? (
          <View style={styles.card}>
            {review.title ? <Text style={styles.titleText}>{review.title}</Text> : null}
            {review.comment ? <Text style={styles.commentText}>{review.comment}</Text> : null}
          </View>
        ) : null}

        {/* Photos */}
        {review.photo_urls && review.photo_urls.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Photos ({review.photo_urls.length})</Text>
            <View style={styles.photoGrid}>
              {review.photo_urls.map((url, idx) => (
                <TouchableOpacity
                  key={idx}
                  activeOpacity={0.85}
                  onPress={() => {
                    setSelectedImageIndex(idx);
                    setImageViewVisible(true);
                  }}
                >
                  <Image
                    source={{ uri: url }}
                    style={styles.photo}
                    onError={(e) => console.warn('[ReviewDetail] Photo load error', url, e.nativeEvent.error)}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <ImageView
          images={(review.photo_urls ?? []).map((uri) => ({ uri }))}
          imageIndex={selectedImageIndex}
          visible={imageViewVisible}
          onRequestClose={() => setImageViewVisible(false)}
          swipeToCloseEnabled
          doubleTapToZoomEnabled
          HeaderComponent={({ imageIndex }) => (
            <View style={styles.imageViewerHeader}>
              <TouchableOpacity
                style={styles.imageViewerCloseBtn}
                onPress={() => setImageViewVisible(false)}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.imageViewerCounter}>
                {imageIndex + 1} / {review.photo_urls?.length ?? 0}
              </Text>
            </View>
          )}
        />
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
  headerTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  content: { padding: SPACING.md, gap: SPACING.md },
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  providerName: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  serviceName: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, marginTop: 2 },
  metaText: { fontSize: FONTS.sizes.sm, color: COLORS.textLight, marginTop: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  ratingNum: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text },
  reviewDate: { fontSize: FONTS.sizes.sm, color: COLORS.textLight, marginTop: SPACING.sm },
  titleText: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.sm },
  commentText: { fontSize: FONTS.sizes.base, color: COLORS.textSecondary, lineHeight: 22 },
  sectionLabel: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.sm },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  photo: { width: 100, height: 100, borderRadius: BORDER_RADIUS.md },
  imageViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    width: '100%',
  },
  imageViewerCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewerCounter: {
    fontSize: FONTS.sizes.base,
    color: '#fff',
    fontFamily: FONTS.semiBold,
  },
});
