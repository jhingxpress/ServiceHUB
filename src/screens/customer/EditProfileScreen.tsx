import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Location from 'expo-location';
import { useAuthStore } from '../../stores/authStore';
import { uploadImageToStorage } from '../../utils/storageUpload';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import { CustomerStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;

const GENDER_OPTIONS = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
] as const;

export default function EditProfileScreen() {
  const navigation = useNavigation<NavProp>();
  const { user, updateProfile } = useAuthStore();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [gender, setGender] = useState<string>('');
  const [dateOfBirth, setDateOfBirth] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detectingLocation, setDetectingLocation] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? '');
      setPhone(user.phone ?? '');
      setAddress(user.address ?? '');
      setCity(user.city ?? '');
      setProvince(user.province ?? '');
      setGender(user.gender ?? '');
      setAvatarUrl(user.avatar_url ?? null);
      setLatitude(user.latitude ?? null);
      setLongitude(user.longitude ?? null);
      if (user.date_of_birth) {
        setDateOfBirth(new Date(user.date_of_birth));
      }
    }
    setLoading(false);
  }, [user]);

  const handleChangePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    const ext = uri.split('.').pop() ?? 'jpg';
    const path = `${user?.id}/avatar.${ext}`;

    try {
      const publicUrl = await uploadImageToStorage('avatars', path, uri, `image/${ext}`);
      setAvatarUrl(publicUrl);
    } catch (err: any) {
      Alert.alert('Upload failed', err.message || 'Network request failed');
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateProfile({
        full_name: fullName.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        province: province.trim() || null,
        gender: (gender as any) || null,
        date_of_birth: dateOfBirth ? dateOfBirth.toISOString().split('T')[0] : null,
        avatar_url: avatarUrl,
      });
      Alert.alert('Success', 'Profile updated successfully.');
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleDetectLocation = async () => {
    setDetectingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Denied',
          'Location permission is required to detect your current position.\n\nLocation information may be used for bookings, navigation, fraud prevention, and platform security.'
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLatitude(loc.coords.latitude);
      setLongitude(loc.coords.longitude);
      Alert.alert('Location Detected', 'Your GPS coordinates have been captured. Please confirm your address below.');
    } catch (err: any) {
      Alert.alert('Location Error', err.message || 'Unable to detect location. Please enter manually.');
    } finally {
      setDetectingLocation(false);
    }
  };

  const onDateChange = (_: DateTimePickerEvent, selected?: Date) => {
    setShowDatePicker(false);
    if (selected) setDateOfBirth(selected);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

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
            <Text style={styles.title}>Edit Profile</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <TouchableOpacity style={styles.avatarWrap} onPress={handleChangePhoto}>
              <Avatar uri={avatarUrl} name={fullName} size={90} />
              <View style={styles.editBadge}>
                <Ionicons name="camera" size={14} color={COLORS.white} />
              </View>
            </TouchableOpacity>
            <Text style={styles.avatarHint}>Tap to change photo</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.textInput}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor={COLORS.textLight}
              />
            </View>

            <Text style={styles.label}>Mobile Number</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.textInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter mobile number"
                placeholderTextColor={COLORS.textLight}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.locationHeader}>
              <Text style={styles.label}>Default Address</Text>
              <TouchableOpacity onPress={handleDetectLocation} disabled={detectingLocation}>
                <View style={styles.detectBtn}>
                  {detectingLocation ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <>
                      <Ionicons name="locate" size={14} color={COLORS.primary} />
                      <Text style={styles.detectBtnText}>Detect</Text>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            </View>
            {latitude && longitude && (
              <Text style={styles.coordsText}>
                Lat: {latitude.toFixed(5)}, Lng: {longitude.toFixed(5)}
              </Text>
            )}
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.textInput}
                value={address}
                onChangeText={setAddress}
                placeholder="Street address, barangay"
                placeholderTextColor={COLORS.textLight}
              />
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>City</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.textInput}
                    value={city}
                    onChangeText={setCity}
                    placeholder="City"
                    placeholderTextColor={COLORS.textLight}
                  />
                </View>
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Province</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.textInput}
                    value={province}
                    onChangeText={setProvince}
                    placeholder="Province"
                    placeholderTextColor={COLORS.textLight}
                  />
                </View>
              </View>
            </View>

            <Text style={styles.label}>Gender</Text>
            <View style={styles.genderRow}>
              {GENDER_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.genderChip,
                    gender === opt.value && styles.genderChipActive,
                  ]}
                  onPress={() => setGender(opt.value)}
                >
                  <Text
                    style={[
                      styles.genderChipText,
                      gender === opt.value && styles.genderChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Date of Birth</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
              <Text style={styles.pickerText}>
                {dateOfBirth ? dateOfBirth.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Select date'}
              </Text>
              <Ionicons name="chevron-down" size={16} color={COLORS.textLight} />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={dateOfBirth ?? new Date(2000, 0, 1)}
                mode="date"
                maximumDate={new Date()}
                onChange={onDateChange}
              />
            )}
          </View>

          <View style={{ height: SPACING.xl }} />
        </ScrollView>

        {/* Footer Save Button */}
        <View style={styles.footer}>
          <Button
            title="Save Changes"
            onPress={handleSave}
            loading={saving}
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
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  avatarSection: { alignItems: 'center', marginBottom: SPACING.lg },
  avatarWrap: { position: 'relative' },
  editBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: COLORS.white,
  },
  avatarHint: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: SPACING.sm },
  form: { paddingHorizontal: SPACING.md, gap: SPACING.sm },
  label: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.xs, marginTop: SPACING.sm },
  locationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detectBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detectBtnText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.primary },
  coordsText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginBottom: SPACING.xs },
  inputWrap: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border, ...SHADOWS.small,
  },
  textInput: { height: 48, paddingHorizontal: SPACING.md, fontSize: FONTS.sizes.base, color: COLORS.text },
  row: { flexDirection: 'row', gap: SPACING.sm },
  half: { flex: 1 },
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  genderChip: {
    paddingHorizontal: SPACING.md, paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  genderChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  genderChipText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  genderChipTextActive: { color: COLORS.white, fontFamily: FONTS.semiBold },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border, padding: SPACING.md,
    ...SHADOWS.small,
  },
  pickerText: { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.text },
  footer: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
});
