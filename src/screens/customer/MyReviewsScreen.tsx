import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import EmptyState from '../../components/ui/EmptyState';
import Avatar from '../../components/ui/Avatar';

interface MyReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  provider: { id: string; business_name: string | null; users: { full_name: string | null; avatar_url: string | null } };
  review_media: { media_url: string; media_type: string }[];
  booking: { status: string };
}

export default function MyReviewsScreen() {
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const [reviews, setReviews] = useState<MyReview[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReviews = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('reviews')
      .select('id, rating, comment, created_at, provider:providers(id, business_name, users!providers_id_fkey(full_name, avatar_url)), review_media(*), booking:bookings(status)')
      .eq('customer_id', user.id)
      .order('created_at', { ascending: false });
    setReviews((data ?? []) as unknown as MyReview[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  const renderStars = (rating: number) => (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Ionicons key={s} name={s <= rating ? 'star' : 'star-outline'} size={14} color="#F59E0B" />
      ))}
    </View>
  );

  const renderItem = ({ item }: { item: MyReview }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Avatar uri={item.provider?.users?.avatar_url} name={item.provider?.business_name ?? item.provider?.users?.full_name} size={40} />
        <View style={styles.providerInfo}>
          <Text style={styles.providerName}>{item.provider?.business_name ?? item.provider?.users?.full_name ?? 'Provider'}</Text>
          {renderStars(item.rating)}
        </View>
        <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
      </View>
      {item.comment && (
        <Text style={styles.comment}>{item.comment}</Text>
      )}
      {item.review_media && item.review_media.length > 0 && (
        <FlatList
          data={item.review_media}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mediaRow}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item: m }) => (
            <Image source={{ uri: m.media_url }} style={styles.mediaImage} />
          )}
        />
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Reviews</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="star-outline"
              title="No reviews yet"
              subtitle="Reviews will appear after you complete and rate services."
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text },
  list: { padding: SPACING.md, paddingTop: 0, flexGrow: 1 },
  card: { backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  providerInfo: { flex: 1 },
  providerName: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  stars: { flexDirection: 'row', gap: 2, marginTop: 2 },
  date: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  comment: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20, marginTop: SPACING.xs },
  mediaRow: { gap: SPACING.sm, marginTop: SPACING.sm },
  mediaImage: { width: 80, height: 80, borderRadius: BORDER_RADIUS.md },
});
