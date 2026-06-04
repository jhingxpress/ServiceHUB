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
import { uploadImageToStorage } from '../../utils/storageUpload';
import { validateImagePickerAsset } from '../../utils/fileValidation';
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
      const asset = result.assets[0];
      const validation = validateImagePickerAsset(asset, 'review-media');
      if (!validation.valid) {
        Alert.alert('Invalid Image', validation.error);
        return;
      }
      setPhotos((prev) => [...prev, asset.uri]);
    }
  };

  const removePhoto = (uri: string) => {
    setPhotos((prev) => prev.filter((p) => p !== uri));
  };

  const uploadReviewPhoto = async (uri: string): Promise<string | null> => {
    if (!user) return null;
    const rawExt = (uri.split('.').pop() ?? 'jpg').split('?')[0].split('#')[0].toLowerCase();
    const ext = rawExt === 'jpg' || rawExt === 'jpeg' ? 'jpeg' : rawExt === 'png' ? 'png' : 'jpeg';
    const mime = `image/${ext}`;
    const path = `${user.id}/${Date.now()}.${ext}`;
    try {
      const publicUrl = await uploadImageToStorage('review-media', path, uri, mime);
      return publicUrl;
    } catch {
      return null;
    }
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      showWarning('Please select a star rating before submitting.');
      return;
    }
    if (!user) {
      showError(new Error('User not authenticated'), 'You must be logged in to submit a review.');
      return;
    }
    setSubmitting(true);
    try {
      // 1. Verify auth session is still valid
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        showError(sessionError ?? new Error('Session expired'), 'Your session has expired. Please log in again.');
        setSubmitting(false);
        return;
      }

      // 2. Pre-validate: booking must exist, belong to user, and be completed
      const { data: bookingRow, error: bookingError } = await supabase
        .from('bookings')
        .select('id, status, provider_id')
        .eq('id', bookingId)
        .eq('customer_id', user.id)
        .single();

      if (bookingError || !bookingRow) {
        showError(bookingError ?? new Error('Booking not found'), 'Could not verify this booking. It may not belong to you or does not exist.');
        setSubmitting(false);
        return;
      }
      if (bookingRow.status !== 'completed') {
        showError(new Error(`Booking status is ${bookingRow.status}`), 'You can only review completed bookings.');
        setSubmitting(false);
        return;
      }

      // 3. Pre-validate: no existing review for this booking
      const { data: existingReview, error: existingError } = await supabase
        .from('reviews')
        .select('id')
        .eq('booking_id', bookingId)
        .maybeSingle();

      if (existingReview) {
        showError(new Error('Review already exists'), 'You have already reviewed this booking.');
        setSubmitting(false);
        return;
      }

      // 4. Upload photos first and collect URLs
      let photoUrls: string[] = [];
      if (photos.length > 0) {
        const uploadResults = await Promise.all(photos.map((uri) => uploadReviewPhoto(uri)));
        photoUrls = uploadResults.filter((url): url is string => url !== null);
      }

      // 5. Build complete payload with denormalized customer fields
      const payload = {
        booking_id: bookingId,
        provider_id: providerId,
        customer_id: user.id,
        customer_name: user.full_name ?? 'Customer',
        customer_avatar_url: user.avatar_url ?? null,
        rating,
        title: title.trim() || null,
        comment: comment.trim() || null,
        photo_urls: photoUrls.length > 0 ? photoUrls : [],
      };
      // 6. Insert review — do NOT use .single() to avoid silent RLS edge cases
      const { data: insertData, error: insertError } = await supabase
        .from('reviews')
        .insert(payload)
        .select('id');

      // 7. Explicitly handle every failure mode
      if (insertError) {
        showError(insertError, `Review submission failed: ${insertError.message}`);
        setSubmitting(false);
        return;
      }

      if (!insertData || insertData.length === 0) {
        // Silent RLS failure or unexpected empty result
        const silentErr = new Error('Insert returned no data. Possible RLS policy mismatch or trigger rejection.');
        showError(silentErr, 'Review submission blocked. Please contact support.');
        setSubmitting(false);
        return;
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
  title: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  content: { paddingHorizontal: SPACING.md },
  providerCard: {
    alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  providerName: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.semiBold, color: COLORS.text, marginTop: SPACING.sm },
  providerSub: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 4 },
  ratingSection: {
    alignItems: 'center', backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sectionLabel: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.sm },
  ratingLabel: { marginTop: SPACING.sm, fontSize: FONTS.sizes.base, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  aspectSection: { marginBottom: SPACING.md },
  aspectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  aspectChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.surface,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  aspectChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  aspectText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  aspectTextActive: { color: COLORS.primary, fontFamily: FONTS.semiBold },
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
  addPhotoText: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontFamily: FONTS.semiBold },
  submitBtn: { marginBottom: SPACING.xl },
});
