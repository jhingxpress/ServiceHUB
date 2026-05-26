import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import StarRating from '../../components/ui/StarRating';
import Button from '../../components/ui/Button';
import Avatar from '../../components/ui/Avatar';
import { CustomerStackParamList } from '../../navigation/types';
import { useErrorHandler } from '../../utils/errorHandler';

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;
type RouteType = RouteProp<CustomerStackParamList, 'ReviewService'>;

export default function ReviewScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { bookingId, providerId, providerName } = route.params;
  const { user } = useAuthStore();

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showError, showSuccess, showWarning } = useErrorHandler();

  const ASPECTS = [
    { id: 'punctuality', label: 'Punctuality' },
    { id: 'quality', label: 'Quality of work' },
    { id: 'communication', label: 'Communication' },
    { id: 'value', label: 'Value for money' },
  ];
  const [selected, setSelected] = useState<string[]>([]);

  const toggleAspect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      showWarning('Please select a star rating before submitting.');
      return;
    }
    if (!user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('reviews').insert({
        booking_id: bookingId,
        provider_id: providerId,
        customer_id: user.id,
        rating,
        comment: comment.trim() || null,
      });
      if (error) throw error;
      showSuccess('Review submitted! Thank you for your feedback.');
      navigation.goBack();
    } catch (err) {
      showError(err, 'Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Write a Review</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.content}>
            {/* Provider info */}
            <View style={styles.providerCard}>
              <Avatar name={providerName} size={60} />
              <Text style={styles.providerName}>{providerName}</Text>
              <Text style={styles.providerSub}>How was your experience?</Text>
            </View>

            {/* Star rating */}
            <View style={styles.ratingSection}>
              <Text style={styles.sectionLabel}>Overall Rating</Text>
              <StarRating
                rating={rating}
                size={40}
                interactive
                onRate={setRating}
              />
              <Text style={styles.ratingLabel}>
                {rating === 0 && 'Tap to rate'}
                {rating === 1 && 'Poor'}
                {rating === 2 && 'Fair'}
                {rating === 3 && 'Good'}
                {rating === 4 && 'Very Good'}
                {rating === 5 && 'Excellent!'}
              </Text>
            </View>

            {/* Aspects */}
            <View style={styles.aspectSection}>
              <Text style={styles.sectionLabel}>What did you like?</Text>
              <View style={styles.aspectRow}>
                {ASPECTS.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.aspectChip, selected.includes(a.id) && styles.aspectChipActive]}
                    onPress={() => toggleAspect(a.id)}
                  >
                    <Text style={[styles.aspectText, selected.includes(a.id) && styles.aspectTextActive]}>
                      {a.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Comment */}
            <View style={styles.commentSection}>
              <Text style={styles.sectionLabel}>Your Review (optional)</Text>
              <TextInput
                style={styles.commentInput}
                value={comment}
                onChangeText={setComment}
                placeholder="Share your experience with this provider..."
                placeholderTextColor={COLORS.textLight}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            </View>

            <Button
              title="Submit Review"
              onPress={handleSubmit}
              loading={submitting}
              fullWidth
              size="lg"
              style={styles.submitBtn}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  content: { paddingHorizontal: SPACING.md },
  providerCard: {
    alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  providerName: { fontSize: FONTS.sizes.xl, fontWeight: '700', color: COLORS.text, marginTop: SPACING.sm },
  providerSub: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  ratingSection: {
    alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sectionLabel: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },
  ratingLabel: { marginTop: SPACING.sm, fontSize: FONTS.sizes.base, color: COLORS.textSecondary, fontWeight: '500' },
  aspectSection: { marginBottom: SPACING.md },
  aspectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  aspectChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.surface,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  aspectChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  aspectText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontWeight: '500' },
  aspectTextActive: { color: COLORS.primary, fontWeight: '700' },
  commentSection: { marginBottom: SPACING.md },
  commentInput: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5, borderColor: COLORS.border, padding: SPACING.md,
    fontSize: FONTS.sizes.base, color: COLORS.text, minHeight: 120,
  },
  submitBtn: { marginBottom: SPACING.xl },
});
