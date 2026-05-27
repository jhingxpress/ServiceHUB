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
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
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

const MAX_PHOTOS = 3;

export default function ReviewScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { bookingId, providerId, providerName } = route.params;
  const { user } = useAuthStore();

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
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

  const pickPhoto = async () => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_PHOTOS} photos.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setPhotos((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const removePhoto = (uri: string) => {
    setPhotos((prev) => prev.filter((p) => p !== uri));
  };

  const uploadPhotoAndRecord = async (reviewId: string, uri: string) => {
    const ext = uri.split('.').pop() ?? 'jpg';
    const path = `reviews/${reviewId}/${Date.now()}.${ext}`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { error: upErr } = await supabase.storage.from('review-media').upload(path, blob, { contentType: `image/${ext}` });
    if (upErr) return;
    const { data } = supabase.storage.from('review-media').getPublicUrl(path);
    await supabase.from('review_media').insert({ review_id: reviewId, url: data.publicUrl, media_type: 'image' });
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      showWarning('Please select a star rating before submitting.');
      return;
    }
    if (!user) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('reviews')
        .insert({
          booking_id: bookingId,
          provider_id: providerId,
          customer_id: user.id,
          rating,
          title: title.trim() || null,
          comment: comment.trim() || null,
        })
        .select('id')
        .single();
      if (error) throw error;

      if (data?.id && photos.length > 0) {
        await Promise.allSettled(photos.map((uri) => uploadPhotoAndRecord(data.id, uri)));
      }

      showSuccess('Review submitted! Thank you for your feedback.');
      navigation.goBack();
    } catch (err) {
      showError(err, 'Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent!'];

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
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
              <StarRating rating={rating} size={40} interactive onRate={setRating} />
              <Text style={styles.ratingLabel}>{ratingLabels[rating] || 'Tap to rate'}</Text>
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

            {/* Review title */}
            <View style={styles.fieldSection}>
              <Text style={styles.sectionLabel}>Review Title (optional)</Text>
              <TextInput
                style={styles.titleInput}
                value={title}
                onChangeText={setTitle}
                placeholder="Sum up your experience in a few words"
                placeholderTextColor={COLORS.textLight}
                maxLength={100}
              />
            </View>

            {/* Comment */}
            <View style={styles.fieldSection}>
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

            {/* Photo upload */}
            <View style={styles.fieldSection}>
              <View style={styles.photoLabelRow}>
                <Text style={styles.sectionLabel}>Add Photos (optional)</Text>
                <Text style={styles.photoCount}>{photos.length}/{MAX_PHOTOS}</Text>
              </View>
              <View style={styles.photoRow}>
                {photos.map((uri) => (
                  <View key={uri} style={styles.photoThumb}>
                    <Image source={{ uri }} style={styles.thumbImage} />
                    <TouchableOpacity style={styles.removeBtn} onPress={() => removePhoto(uri)}>
                      <Ionicons name="close-circle" size={20} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPhoto}>
                    <Ionicons name="camera-outline" size={24} color={COLORS.primary} />
                    <Text style={styles.addPhotoText}>Add Photo</Text>
                  </TouchableOpacity>
                )}
              </View>
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
  sectionLabel: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
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
  fieldSection: { marginBottom: SPACING.md },
  titleInput: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5, borderColor: COLORS.border, padding: SPACING.md,
    fontSize: FONTS.sizes.base, color: COLORS.text, height: 48,
  },
  commentInput: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5, borderColor: COLORS.border, padding: SPACING.md,
    fontSize: FONTS.sizes.base, color: COLORS.text, minHeight: 120,
  },
  photoLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.sm },
  photoCount: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  photoThumb: { width: 90, height: 90, borderRadius: BORDER_RADIUS.md, overflow: 'visible' },
  thumbImage: { width: 90, height: 90, borderRadius: BORDER_RADIUS.md },
  removeBtn: { position: 'absolute', top: -8, right: -8, backgroundColor: COLORS.background, borderRadius: 10 },
  addPhotoBtn: {
    width: 90, height: 90, borderRadius: BORDER_RADIUS.md, borderWidth: 2, borderColor: COLORS.primary,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primaryLight,
    gap: 4,
  },
  addPhotoText: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontWeight: '600' },
  submitBtn: { marginBottom: SPACING.xl },
});
