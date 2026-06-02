import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { format } from 'date-fns';
import ImageView from 'react-native-image-viewing';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';

interface AdminReview {
  id: string;
  booking_id: string;
  customer_id: string;
  provider_id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  photo_urls: string[] | null;
  customer_name: string | null;
  customer_avatar_url: string | null;
  is_hidden: boolean;
  created_at: string;
  provider: { business_name: string | null; profile_photo_url: string | null } | null;
  booking: { service: { name: string } | null } | null;
}

type FilterType = 'all' | 'visible' | 'hidden';

const FILTER_TABS: { label: string; value: FilterType }[] = [
  { label: 'All', value: 'all' },
  { label: 'Visible', value: 'visible' },
  { label: 'Hidden', value: 'hidden' },
];

const STAR_MAP = ['★', '★★', '★★★', '★★★★', '★★★★★'];

export default function AdminReviewsScreen() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');
  const [viewerImages, setViewerImages] = useState<{ uri: string }[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);

  const load = useCallback(async () => {
    let q = supabase
      .from('reviews')
      .select(`
        id, booking_id, customer_id, provider_id, rating, title, comment,
        photo_urls, customer_name, customer_avatar_url, is_hidden, created_at,
        provider:providers!reviews_provider_id_fkey(business_name, profile_photo_url),
        booking:bookings(service:services(name))
      `)
      .order('created_at', { ascending: false });

    if (filter === 'visible') q = (q as any).eq('is_hidden', false);
    if (filter === 'hidden') q = (q as any).eq('is_hidden', true);

    const { data, error } = await q;
    if (error) Alert.alert('Error', error.message);
    setReviews((data ?? []) as unknown as AdminReview[]);
    setLoading(false);
    setRefreshing(false);
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleHide = async (review: AdminReview) => {
    const next = !review.is_hidden;
    const { error } = await supabase
      .from('reviews')
      .update({ is_hidden: next })
      .eq('id', review.id);
    if (error) { Alert.alert('Error', error.message); return; }
    setReviews((prev) => prev.map((r) => r.id === review.id ? { ...r, is_hidden: next } : r));
  };

  const handleDelete = (review: AdminReview) => {
    Alert.alert(
      'Delete Review',
      `Permanently delete this ${review.rating}★ review by ${review.customer_name ?? 'customer'}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('reviews').delete().eq('id', review.id);
            if (error) { Alert.alert('Error', error.message); return; }
            setReviews((prev) => prev.filter((r) => r.id !== review.id));
          },
        },
      ]
    );
  };

  const openPhotos = (urls: string[], idx: number) => {
    setViewerImages(urls.map((uri) => ({ uri })));
    setViewerIndex(idx);
    setViewerVisible(true);
  };

  const renderItem = ({ item }: { item: AdminReview }) => {
    const providerData = item.provider as { business_name: string | null } | null;
    const bookingData = item.booking as { service: { name: string } | null } | null;

    return (
      <View style={[styles.card, item.is_hidden && styles.cardHidden]}>
        {item.is_hidden && (
          <View style={styles.hiddenBanner}>
            <Ionicons name="eye-off-outline" size={12} color={COLORS.white} />
            <Text style={styles.hiddenBannerText}>Hidden from public</Text>
          </View>
        )}

        <View style={styles.cardHeader}>
          <Avatar uri={item.customer_avatar_url} name={item.customer_name} size={42} />
          <View style={styles.headerInfo}>
            <Text style={styles.customerName} numberOfLines={1}>
              {item.customer_name ?? 'Unknown Customer'}
            </Text>
            <Text style={styles.providerLine} numberOfLines={1}>
              → {providerData?.business_name ?? 'Unknown Provider'}
            </Text>
            {bookingData?.service?.name ? (
              <Text style={styles.serviceLine} numberOfLines={1}>
                {bookingData.service.name}
              </Text>
            ) : null}
          </View>
          <View style={styles.ratingCol}>
            <Text style={styles.stars}>{STAR_MAP[item.rating - 1] ?? '☆'}</Text>
            <Text style={styles.ratingNum}>{item.rating}/5</Text>
            <Text style={styles.dateText}>{format(new Date(item.created_at), 'MMM d')}</Text>
          </View>
        </View>

        {item.title ? <Text style={styles.reviewTitle}>{item.title}</Text> : null}
        {item.comment ? <Text style={styles.reviewComment}>{item.comment}</Text> : null}

        {item.photo_urls && item.photo_urls.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.photoRow}
          >
            {item.photo_urls.map((url, i) => (
              <TouchableOpacity key={i} onPress={() => openPhotos(item.photo_urls!, i)}>
                <Image source={{ uri: url }} style={styles.thumb} resizeMode="cover" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, item.is_hidden ? styles.showBtn : styles.hideBtn]}
            onPress={() => toggleHide(item)}
          >
            <Ionicons
              name={item.is_hidden ? 'eye-outline' : 'eye-off-outline'}
              size={14}
              color={item.is_hidden ? COLORS.primary : '#92400E'}
            />
            <Text style={[styles.actionText, { color: item.is_hidden ? COLORS.primary : '#92400E' }]}>
              {item.is_hidden ? 'Show' : 'Hide'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash-outline" size={14} color={COLORS.error} />
            <Text style={[styles.actionText, { color: COLORS.error }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Review Moderation</Text>
        <Text style={styles.count}>{reviews.length}</Text>
      </View>

      <View style={styles.filterRow}>
        {FILTER_TABS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterTab, filter === f.value && styles.filterTabActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="star-outline"
              title="No reviews"
              subtitle="Reviews will appear here when submitted"
            />
          }
        />
      )}

      <ImageView
        images={viewerImages}
        imageIndex={viewerIndex}
        visible={viewerVisible}
        onRequestClose={() => setViewerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm,
  },
  title: { fontSize: FONTS.sizes.xxl, fontFamily: FONTS.bold, color: COLORS.text },
  count: {
    fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.white,
    backgroundColor: COLORS.primary, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 3, minWidth: 28, textAlign: 'center',
  },
  filterRow: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.md, marginBottom: SPACING.sm },
  filterTab: {
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  filterTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  filterTextActive: { color: COLORS.white, fontFamily: FONTS.semiBold },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    ...SHADOWS.small, overflow: 'hidden',
  },
  cardHidden: { opacity: 0.75, borderColor: COLORS.warning },
  hiddenBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.warning,
    marginHorizontal: -SPACING.md, marginTop: -SPACING.md, marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: 5,
  },
  hiddenBannerText: { fontSize: FONTS.sizes.xs, color: COLORS.white, fontFamily: FONTS.semiBold },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.sm },
  headerInfo: { flex: 1 },
  customerName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  providerLine: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  serviceLine: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 1 },
  ratingCol: { alignItems: 'flex-end', gap: 2 },
  stars: { fontSize: FONTS.sizes.sm, color: '#F59E0B' },
  ratingNum: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontFamily: FONTS.semiBold },
  dateText: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  reviewTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: 4 },
  reviewComment: { fontSize: FONTS.sizes.sm, color: COLORS.text, lineHeight: 20, marginBottom: SPACING.sm },
  photoRow: { marginBottom: SPACING.sm },
  thumb: { width: 72, height: 72, borderRadius: BORDER_RADIUS.md, marginRight: SPACING.xs },
  actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md, borderWidth: 1,
  },
  hideBtn: { borderColor: COLORS.warning, backgroundColor: COLORS.warningLight },
  showBtn: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  deleteBtn: { borderColor: COLORS.error, backgroundColor: COLORS.errorLight },
  actionText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold },
});
