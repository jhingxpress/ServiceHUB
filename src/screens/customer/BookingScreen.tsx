import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { validateImagePickerAsset } from '../../utils/fileValidation';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Button from '../../components/ui/Button';
import { CustomerStackParamList } from '../../navigation/types';
import { validators, validateForm } from '../../utils/validation';
import { useErrorHandler } from '../../utils/errorHandler';

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;
type RouteType = RouteProp<CustomerStackParamList, 'BookService'>;

export default function BookingScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { providerId, serviceId, serviceName, price } = route.params;
  const { user } = useAuthStore();

  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [location, setLocation] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [useProfileLocation, setUseProfileLocation] = useState(false);
  const latRef = useRef<number | null>(null);
  const lngRef = useRef<number | null>(null);

  const setCoords = (lat: number | null, lng: number | null) => {
    latRef.current = lat;
    lngRef.current = lng;
    setLatitude(lat);
    setLongitude(lng);
  };
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [detectingLocation, setDetectingLocation] = useState(false);
  const { showError, showSuccess } = useErrorHandler();

  const applyProfileLocation = () => {
    if (!user) return;
    setUseProfileLocation(true);
    setLocation(user.address ?? '');
    setCity(user.city ?? '');
    setProvince(user.province ?? '');
    if (user.latitude != null && user.longitude != null) {
      setCoords(user.latitude, user.longitude);
    } else {
      Alert.alert(
        'No Saved Coordinates',
        'Your saved address doesn\'t have GPS coordinates. Tap "Use Current Location" to capture them.'
      );
    }
  };

  const clearProfileLocation = () => {
    setUseProfileLocation(false);
    setLocation('');
    setCity('');
    setProvince('');
    setCoords(null, null);
  };

  const handleDetectBookingLocation = async () => {
    setDetectingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is required to set your service location.\n\nLocation information may be used for bookings, navigation, fraud prevention, and platform security.'
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords(loc.coords.latitude, loc.coords.longitude);
      setUseProfileLocation(false);
      Alert.alert('Location Captured', `Latitude: ${loc.coords.latitude.toFixed(5)}, Longitude: ${loc.coords.longitude.toFixed(5)}`);
    } catch (err: any) {
      Alert.alert('Location Error', err.message || 'Unable to detect location. Please enter manually.');
    } finally {
      setDetectingLocation(false);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsMultipleSelection: true,
    });
    if (!result.canceled) {
      const validUris: string[] = [];
      for (const asset of result.assets) {
        const validation = validateImagePickerAsset(asset, 'booking-photos');
        if (!validation.valid) {
          Alert.alert('Invalid Image', validation.error);
          continue;
        }
        validUris.push(asset.uri);
      }
      setPhotos((prev) => [...prev, ...validUris].slice(0, 4));
    }
  };

  const uploadPhotos = async (): Promise<string[]> => {
    if (photos.length === 0 || !user) return [];
    const uploaded: string[] = [];
    for (const uri of photos) {
      const rawExt = (uri.split('.').pop() ?? 'jpg').split('?')[0].split('#')[0].toLowerCase();
      const ext = rawExt === 'jpg' || rawExt === 'jpeg' ? 'jpeg' : rawExt === 'png' ? 'png' : 'jpeg';
      const mime = `image/${ext}`;
      const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const response = await fetch(uri);
      const blob = await response.blob();
      const { error: upErr } = await supabase.storage
        .from('booking-photos')
        .upload(path, blob, { contentType: mime });
      if (upErr) {
        console.error('Photo upload error:', upErr);
        continue;
      }
      const { data } = supabase.storage.from('booking-photos').getPublicUrl(path);
      uploaded.push(data.publicUrl);
    }
    return uploaded;
  };

  const checkConflict = async (): Promise<boolean> => {
    const scheduledDate = format(date, 'yyyy-MM-dd');
    const scheduledTime = format(time, 'HH:mm:ss');
    const { data, error } = await supabase
      .from('bookings')
      .select('id, scheduled_time')
      .eq('provider_id', providerId)
      .eq('scheduled_date', scheduledDate)
      .in('status', ['pending', 'accepted']);

    if (error || !data || data.length === 0) return false;

    const selectedMinutes = time.getHours() * 60 + time.getMinutes();
    for (const b of data) {
      const [h, m] = (b.scheduled_time as string).split(':').map(Number);
      const existingMinutes = h * 60 + m;
      if (Math.abs(selectedMinutes - existingMinutes) <= 60) return true;
    }
    return false;
  };

  const handleSubmit = async () => {
    const validation = validateForm(
      { location },
      {
        location: (v) => validators.required(v, 'Service location'),
      }
    );

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    if (latRef.current == null || lngRef.current == null) {
      Alert.alert(
        'GPS Coordinates Required',
        'Please tap "Use Current Location" to capture GPS coordinates. This is required so the provider can navigate to your service address.'
      );
      return;
    }

    if (!user) return;
    setSubmitting(true);
    try {
      // Conflict detection
      const hasConflict = await checkConflict();
      if (hasConflict) {
        Alert.alert(
          'Time Slot Unavailable',
          'This provider already has a booking within 1 hour of your selected time. Please choose a different time.'
        );
        setSubmitting(false);
        return;
      }

      // Upload photos to storage
      const photoUrls = await uploadPhotos();

      const { data, error } = await supabase
        .from('bookings')
        .insert({
          customer_id: user.id,
          provider_id: providerId,
          service_id: serviceId ?? null,
          scheduled_date: format(date, 'yyyy-MM-dd'),
          scheduled_time: format(time, 'HH:mm:ss'),
          location: location.trim(),
          latitude: latRef.current,
          longitude: lngRef.current,
          booking_city: city.trim() || null,
          booking_province: province.trim() || null,
          notes: notes.trim() || null,
          photo_urls: photoUrls,
          total_amount: price ?? null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      showSuccess('Booking sent successfully!');
      navigation.navigate('BookingDetail', { bookingId: data.id });
    } catch (err) {
      showError(err, 'Failed to create booking. Please try again.');
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
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Book Service</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Service info */}
          {serviceName && (
            <View style={styles.serviceInfo}>
              <View style={styles.serviceIconWrap}>
                <Ionicons name="construct-outline" size={24} color={COLORS.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceName}>{serviceName}</Text>
                {price && <Text style={styles.servicePrice}>₱{price}</Text>}
              </View>
            </View>
          )}

          <View style={styles.form}>
            {/* Date */}
            <Text style={styles.label}>Date</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
              <Text style={styles.pickerText}>{format(date, 'EEEE, MMMM d, yyyy')}</Text>
              <Ionicons name="chevron-down" size={16} color={COLORS.textLight} />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                minimumDate={new Date()}
                onChange={(_: DateTimePickerEvent, selected?: Date) => {
                  setShowDatePicker(false);
                  if (selected) setDate(selected);
                }}
              />
            )}

            {/* Time */}
            <Text style={styles.label}>Time</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => setShowTimePicker(true)}
            >
              <Ionicons name="time-outline" size={18} color={COLORS.primary} />
              <Text style={styles.pickerText}>{format(time, 'h:mm a')}</Text>
              <Ionicons name="chevron-down" size={16} color={COLORS.textLight} />
            </TouchableOpacity>
            {showTimePicker && (
              <DateTimePicker
                value={time}
                mode="time"
                onChange={(_: DateTimePickerEvent, selected?: Date) => {
                  setShowTimePicker(false);
                  if (selected) setTime(selected);
                }}
              />
            )}

            {/* Location */}
            <Text style={styles.label}>Service Location *</Text>
            {user?.address && (
              <TouchableOpacity
                style={[
                  styles.profileLocationBtn,
                  useProfileLocation && styles.profileLocationBtnActive,
                ]}
                onPress={useProfileLocation ? clearProfileLocation : applyProfileLocation}
              >
                <Ionicons
                  name={useProfileLocation ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={useProfileLocation ? COLORS.primary : COLORS.textLight}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.profileLocationTitle}>Use my saved address</Text>
                  <Text style={styles.profileLocationSub} numberOfLines={1}>
                    {user.address}, {user.city ?? ''}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            <View style={styles.inputWrap}>
              <Ionicons name="location-outline" size={18} color={COLORS.textLight} style={styles.inputIcon} />
              <TextInput
                style={styles.textInput}
                value={location}
                onChangeText={(text) => {
                  setLocation(text);
                  if (useProfileLocation) setUseProfileLocation(false);
                }}
                placeholder="Street address, barangay"
                placeholderTextColor={COLORS.textLight}
              />
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.textInput}
                    value={city}
                    onChangeText={(text) => {
                      setCity(text);
                      if (useProfileLocation) setUseProfileLocation(false);
                    }}
                    placeholder="City"
                    placeholderTextColor={COLORS.textLight}
                  />
                </View>
              </View>
              <View style={styles.half}>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.textInput}
                    value={province}
                    onChangeText={(text) => {
                      setProvince(text);
                      if (useProfileLocation) setUseProfileLocation(false);
                    }}
                    placeholder="Province"
                    placeholderTextColor={COLORS.textLight}
                  />
                </View>
              </View>
            </View>

            {/* Detect current location */}
            <TouchableOpacity
              style={styles.detectBtn}
              onPress={handleDetectBookingLocation}
              disabled={detectingLocation}
            >
              {detectingLocation ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Ionicons name="locate" size={18} color={COLORS.primary} />
              )}
              <Text style={styles.detectBtnText}>
                {detectingLocation ? 'Detecting...' : 'Use Current Location'}
              </Text>
            </TouchableOpacity>

            {latitude != null && longitude != null && (
              <View style={styles.capturedRow}>
                <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                <Text style={styles.capturedText}>
                  Location Captured — Lat: {latitude.toFixed(5)}, Lng: {longitude.toFixed(5)}
                </Text>
              </View>
            )}

            {/* Notes */}
            <Text style={styles.label}>Additional Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Describe the job, special requirements..."
              placeholderTextColor={COLORS.textLight}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />

            {/* Photos */}
            <Text style={styles.label}>Attach Photos (optional)</Text>
            <View style={styles.photosRow}>
              {photos.map((uri, i) => (
                <View key={i} style={styles.photoThumb}>
                  <Image source={{ uri }} style={styles.photoImage} />
                  <TouchableOpacity
                    style={styles.photoRemove}
                    onPress={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                  >
                    <Ionicons name="close-circle" size={20} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < 4 && (
                <TouchableOpacity style={styles.addPhotoBtn} onPress={handlePickImage}>
                  <Ionicons name="camera-outline" size={24} color={COLORS.textLight} />
                  <Text style={styles.addPhotoText}>Add Photo</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Summary */}
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Booking Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Date</Text>
              <Text style={styles.summaryValue}>{format(date, 'MMM d, yyyy')}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Time</Text>
              <Text style={styles.summaryValue}>{format(time, 'h:mm a')}</Text>
            </View>
            {price && (
              <View style={[styles.summaryRow, styles.summaryTotal]}>
                <Text style={styles.summaryTotalLabel}>Total</Text>
                <Text style={styles.summaryTotalValue}>₱{price}</Text>
              </View>
            )}
          </View>

          <View style={{ height: SPACING.xl }} />
        </ScrollView>

        <View style={styles.footer}>
          <Button
            title="Confirm Booking"
            onPress={handleSubmit}
            loading={submitting}
            fullWidth
            size="lg"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  serviceInfo: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.primaryLight, marginHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md,
  },
  serviceIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center',
  },
  serviceName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  servicePrice: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.primary, marginTop: 2 },
  form: { paddingHorizontal: SPACING.md },
  label: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.xs, marginTop: SPACING.md },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border, padding: SPACING.md,
    ...SHADOWS.small,
  },
  pickerText: { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.text },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border, ...SHADOWS.small,
  },
  inputIcon: { marginLeft: SPACING.md },
  textInput: { flex: 1, height: 48, paddingHorizontal: SPACING.sm, fontSize: FONTS.sizes.base, color: COLORS.text },
  profileLocationBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border, padding: SPACING.md,
    marginBottom: SPACING.sm, ...SHADOWS.small,
  },
  profileLocationBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  profileLocationTitle: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  profileLocationSub: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 2 },
  row: { flexDirection: 'row', gap: SPACING.sm },
  half: { flex: 1 },
  detectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md, marginTop: SPACING.sm, borderWidth: 1, borderColor: COLORS.primary,
  },
  detectBtnText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.primary },
  capturedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs, marginTop: SPACING.xs },
  capturedText: { fontSize: FONTS.sizes.xs, color: COLORS.success, fontFamily: FONTS.medium },
  notesInput: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border, padding: SPACING.md,
    fontSize: FONTS.sizes.base, color: COLORS.text, minHeight: 100,
    ...SHADOWS.small,
  },
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  photoThumb: { width: 80, height: 80, borderRadius: BORDER_RADIUS.md, overflow: 'hidden' },
  photoImage: { width: '100%', height: '100%' },
  photoRemove: { position: 'absolute', top: 2, right: 2 },
  addPhotoBtn: {
    width: 80, height: 80, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  addPhotoText: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, textAlign: 'center' },
  summary: {
    marginHorizontal: SPACING.md, marginTop: SPACING.lg,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  summaryTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  summaryLabel: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  summaryValue: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  summaryTotal: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: SPACING.xs, paddingTop: SPACING.sm },
  summaryTotalLabel: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  summaryTotalValue: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.primary },
  footer: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
});
