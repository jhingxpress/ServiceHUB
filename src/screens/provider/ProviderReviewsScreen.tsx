import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ImageView from 'react-native-image-viewing';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { ProviderStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;

export const REVIEWS_LAST_SEEN_KEY = 'provider_reviews_last_seen';

interface ProviderReview {
  id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  photo_urls: string[] | null;
  customer_name: string | null;
  customer_avatar_url: string | null;
  created_at: string;
  booking: {
    scheduled_date: string | null;
    service: { name: string } | null;
  } | null;
}

export default function ProviderReviewsScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();

  const [reviews, setReviews] = useState<ProviderReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  const [imageViewVisible, setImageViewVisible] = useState(false);
  const [viewerImages, setViewerImages] = useState<{ uri: string }[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const openImages = (urls: string[], startIndex: number) => {
    setViewerImages(urls.map((uri) => ({ uri })));
    setViewerIndex(startIndex);
    setImageViewVisible(true);
  };

  const loadReviews = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('reviews')
      .select('id, rating, title, comment, photo_urls, customer_name, customer_avatar_url, created_at, booking:bookings(scheduled_date, service:services(name))')
      .eq('provider_id', user.id)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[ProviderReviews] fetch error:', error.code, error.message);
    }
    setReviews((data ?? []) as unknown as ProviderReview[]);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadReviews();
      AsyncStorage.getItem(REVIEWS_LAST_SEEN_KEY).then((val) => setLastSeen(val));
      AsyncStorage.setItem(REVIEWS_LAST_SEEN_KEY, new Date().toISOString());
    }, [loadReviews])
  );

  const totalReviews = reviews.length;
  const avgRating =
    totalReviews > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
      : 0;
  const dist = [5, 4, 3, 2, 1].map((s) => ({
    star: s,
    count: reviews.filter((r) => r.rating === s).length,
  }));
  const maxDistCount = Math.max(...dist.map((d) => d.count), 1);

  const isNew = (createdAt: string) =>
    lastSeen != null ? createdAt > lastSeen : false;

  const renderStars = (rating: number, size = 14) => (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Ionicons
          key={s}
          name={s <= rating ? 'star' : 'star-outline'}
          size={size}
          color="#F59E0B"
        />
      ))}
    </View>
  );

  const SummaryCard = () => {
    if (totalReviews === 0) return null;
    return (
      <View style={styles.summaryCard}>
        <View style={styles.summaryInner}>
          {/* Left — big number */}
          <View style={styles.summaryLeft}>
            <Text style={styles.avgNum}>{avgRating.toFixed(1)}</Text>
            {renderStars(Math.round(avgRating), 18)}
            <Text style={styles.totalLabel}>
              {totalReviews} review{totalReviews !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* Right — distribution bars */}
          <View style={styles.distCol}>
            {dist.map(({ star, count }) => (
              <View key={star} style={styles.distRow}>
                <Text style={styles.distStar}>{star}</Text>
                <Ionicons name="star" size={10} color="#F59E0B" />
                <View style={styles.distBarBg}>
                  <View
                    style={[
                      styles.distBarFill,
                      { width: `${(count / maxDistCount) * 100}%` as any },
                    ]}
                  />
                </View>
                <Text style={styles.distCount}>{count}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  };

  const renderItem = ({ item }: { item: ProviderReview }) => {
    const hasPhotos = !!item.photo_urls && item.photo_urls.length > 0;
    const newReview = isNew(item.created_at);

    return (
      <View style={[styles.reviewCard, newReview && styles.reviewCardNew]}>
        {newReview && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>New</Text>
          </View>
        )}

        {/* Header row */}
        <View style={styles.cardHeader}>
          <Avatar
            uri={item.customer_avatar_url ?? null}
            name={item.customer_name ?? 'Customer'}
            size={40}
          />
          <View style={styles.cardMeta}>
            <Text style={styles.customerName}>
              {item.customer_name ?? 'Customer'}
            </Text>
            <View style={styles.metaSubRow}>
              {renderStars(item.rating)}
              <Text style={styles.reviewDate}>
                {format(new Date(item.created_at), 'MMM d, yyyy')}
              </Text>
            </View>
          </View>
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingBadgeNum}>{item.rating}.0</Text>
          </View>
        </View>

        {/* Service + booking date */}
        {(item.booking?.service?.name || item.booking?.scheduled_date) && (
          <View style={styles.serviceRow}>
            {item.booking?.service?.name ? (
              <>
                <Ionicons
                  name="construct-outline"
                  size={12}
                  color={COLORS.textSecondary}
                />
                <Text style={styles.serviceMeta}>
                  {item.booking.service.name}
                </Text>
              </>
            ) : null}
            {item.booking?.scheduled_date ? (
              <>
                <Text style={styles.dot}>·</Text>
                <Ionicons
                  name="calendar-outline"
                  size={12}
                  color={COLORS.textSecondary}
                />
                <Text style={styles.serviceMeta}>
                  {format(
                    new Date(item.booking.scheduled_date),
                    'MMM d, yyyy'
                  )}
                </Text>
              </>
            ) : null}
          </View>
        )}

        {item.title ? (
          <Text style={styles.reviewTitle}>{item.title}</Text>
        ) : null}
        {item.comment ? (
          <Text style={styles.reviewComment}>{item.comment}</Text>
        ) : null}

        {hasPhotos && (
          <View style={styles.photoRow}>
            {item.photo_urls!.map((url, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.85}
                onPress={() => openImages(item.photo_urls!, i)}
              >
                <Image
                  source={{ uri: url }}
                  style={styles.photoThumb}
                  onError={() =>
                    console.warn('[ProviderReviews] photo error', url)
                  }
                />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  };

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="star-outline" size={52} color={COLORS.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>No reviews yet</Text>
      <Text style={styles.emptySubtitle}>
        Reviews from customers will appear here after completed jobs.
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          >
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Reviews</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Reviews</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={reviews}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadReviews();
            }}
            tintColor={COLORS.primary}
          />
        }
        ListHeaderComponent={<SummaryCard />}
        ListEmptyComponent={<EmptyState />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <ImageView
        images={viewerImages}
        imageIndex={viewerIndex}
        visible={imageViewVisible}
        onRequestClose={() => setImageViewVisible(false)}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
        HeaderComponent={({ imageIndex }) => (
          <View style={styles.viewerHeader}>
            <TouchableOpacity
              style={styles.viewerCloseBtn}
              onPress={() => setImageViewVisible(false)}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.viewerCounter}>
              {imageIndex + 1} / {viewerImages.length}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.bold,
    color: COLORS.text,
  },
  listContent: { paddingBottom: SPACING.xl },

  // ── Summary Card ──────────────────────────────────────────
  summaryCard: {
    margin: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  summaryInner: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg },
  summaryLeft: { alignItems: 'center', minWidth: 80 },
  avgNum: {
    fontSize: 44,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    lineHeight: 50,
  },
  starsRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
  totalLabel: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  distCol: { flex: 1, gap: 5 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  distStar: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    width: 10,
    textAlign: 'right',
  },
  distBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  distBarFill: { height: 6, backgroundColor: '#F59E0B', borderRadius: 3 },
  distCount: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    width: 18,
    textAlign: 'right',
  },

  // ── Review Card ────────────────────────────────────────────
  reviewCard: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  reviewCardNew: {
    borderColor: COLORS.primary + '60',
    backgroundColor: COLORS.primaryLight + '40',
  },
  newBadge: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    marginBottom: SPACING.xs,
  },
  newBadgeText: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.bold,
    color: COLORS.white,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  cardMeta: { flex: 1 },
  customerName: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
  },
  metaSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: 2,
  },
  reviewDate: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  ratingBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
  },
  ratingBadgeNum: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.bold,
    color: '#92400E',
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: SPACING.xs,
    flexWrap: 'wrap',
  },
  serviceMeta: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  dot: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  reviewTitle: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    marginTop: SPACING.xs,
    marginBottom: 2,
  },
  reviewComment: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginTop: 2,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.border,
  },

  // ── Empty State ────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl * 3,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.bold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: FONTS.sizes.base,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  // ── Image Viewer ───────────────────────────────────────────
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    width: '100%',
  },
  viewerCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCounter: {
    fontSize: FONTS.sizes.base,
    color: '#fff',
    fontFamily: FONTS.semiBold,
  },
});
