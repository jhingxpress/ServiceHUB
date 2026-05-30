import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Provider } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { useErrorHandler } from '../../utils/errorHandler';

export default function ProfileSetupScreen() {
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const { showError, showSuccess, showWarning } = useErrorHandler();

  const [provider, setProvider] = useState<Provider | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState<'profile' | 'cover' | null>(null);

  const [businessName, setBusinessName] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [certifications, setCertifications] = useState('');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);
  const [coverPhotoUrl, setCoverPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('providers')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          showError(error, 'Failed to load profile');
        } else if (data) {
          setProvider(data as Provider);
          setBusinessName(data.business_name ?? '');
          setHeadline(data.business_headline ?? '');
          setDescription(data.business_description ?? '');
          setYearsExperience(data.years_of_experience ? String(data.years_of_experience) : '');
          setServiceArea(data.service_area ?? '');
          setCertifications(data.certifications ?? '');
          setProfilePhotoUrl(data.profile_photo_url ?? null);
          setCoverPhotoUrl(data.cover_photo_url ?? null);
        }
        setLoading(false);
      });
  }, [user]);

  const pickAndUploadImage = async (type: 'profile' | 'cover') => {
    if (!user) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert('Upload failed', 'Could not read image data.');
      return;
    }

    setUploadingPhoto(type);
    try {
      const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
      };

      const ext = (asset.fileName || asset.uri).split('.').pop()?.toLowerCase() || 'jpg';
      const mimeType = `image/${ext}`;
      const bucket = type === 'profile' ? 'provider-profile-images' : 'provider-cover-images';
      const path = `${user.id}/${Date.now()}.${ext}`;
      const arrayBuffer = base64ToArrayBuffer(asset.base64);

      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, arrayBuffer, {
        contentType: mimeType,
      });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
      if (type === 'profile') {
        setProfilePhotoUrl(urlData.publicUrl);
      } else {
        setCoverPhotoUrl(urlData.publicUrl);
      }
    } catch (err) {
      showError(err, 'Failed to upload image');
    } finally {
      setUploadingPhoto(null);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    const trimmedName = businessName.trim();
    const trimmedHeadline = headline.trim();
    const trimmedDescription = description.trim();
    const trimmedServiceArea = serviceArea.trim();

    if (!trimmedName) {
      showWarning('Business Name is required.');
      return;
    }
    if (!trimmedHeadline) {
      showWarning('Business Headline is required.');
      return;
    }
    if (!trimmedDescription) {
      showWarning('About Business is required.');
      return;
    }
    if (!trimmedServiceArea) {
      showWarning('Service Area is required.');
      return;
    }

    const years = yearsExperience ? parseInt(yearsExperience, 10) : null;
    if (yearsExperience && (isNaN(years || 0) || (years || 0) < 0)) {
      showWarning('Years Experience must be a valid number.');
      return;
    }

    const isComplete =
      !!profilePhotoUrl &&
      !!coverPhotoUrl &&
      !!trimmedName &&
      !!trimmedHeadline &&
      !!trimmedDescription &&
      !!trimmedServiceArea;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('providers')
        .update({
          business_name: trimmedName,
          business_headline: trimmedHeadline,
          business_description: trimmedDescription,
          years_of_experience: years,
          service_area: trimmedServiceArea,
          certifications: certifications.trim() || null,
          profile_photo_url: profilePhotoUrl,
          cover_photo_url: coverPhotoUrl,
          profile_completed: isComplete,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;
      showSuccess('Profile Updated Successfully');
      navigation.goBack();
    } catch (err) {
      showError(err, 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Business Profile</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.form}>
            {/* Cover Photo */}
            <Text style={styles.sectionLabel}>Cover Photo</Text>
            <TouchableOpacity
              style={styles.coverPhotoWrap}
              onPress={() => pickAndUploadImage('cover')}
              activeOpacity={0.8}
            >
              {coverPhotoUrl ? (
                <Image source={{ uri: coverPhotoUrl }} style={styles.coverPhoto} />
              ) : (
                <View style={styles.coverPhotoPlaceholder}>
                  <Ionicons name="image-outline" size={32} color={COLORS.textMuted} />
                  <Text style={styles.coverPhotoText}>Upload Cover Photo</Text>
                </View>
              )}
              {uploadingPhoto === 'cover' && (
                <View style={styles.uploadOverlay}>
                  <ActivityIndicator color={COLORS.white} />
                </View>
              )}
            </TouchableOpacity>

            {/* Profile Photo */}
            <Text style={styles.sectionLabel}>Profile Photo</Text>
            <TouchableOpacity
              style={styles.profilePhotoWrap}
              onPress={() => pickAndUploadImage('profile')}
              activeOpacity={0.8}
            >
              {profilePhotoUrl ? (
                <Image source={{ uri: profilePhotoUrl }} style={styles.profilePhoto} />
              ) : (
                <View style={styles.profilePhotoPlaceholder}>
                  <Ionicons name="camera-outline" size={28} color={COLORS.textMuted} />
                </View>
              )}
              {uploadingPhoto === 'profile' && (
                <View style={styles.uploadOverlay}>
                  <ActivityIndicator color={COLORS.white} />
                </View>
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={14} color={COLORS.white} />
              </View>
            </TouchableOpacity>

            <Input
              label="Business Name *"
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="Gene's Cleaning Services"
              leftIcon="business-outline"
            />

            <Input
              label="Business Headline *"
              value={headline}
              onChangeText={setHeadline}
              placeholder="Professional Cleaning Services in Davao"
              leftIcon="megaphone-outline"
              maxLength={80}
              hint={`${headline.length}/80 characters`}
            />

            <Input
              label="About Business *"
              value={description}
              onChangeText={setDescription}
              placeholder="Specializing in post-construction, deep cleaning and residential cleaning."
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              maxLength={1000}
              containerStyle={{ marginBottom: SPACING.md }}
            />
            <Text style={styles.charCount}>{description.length}/1000 characters</Text>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Years Experience"
                  value={yearsExperience}
                  onChangeText={setYearsExperience}
                  leftIcon="trophy-outline"
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </View>
            </View>

            <Input
              label="Service Area *"
              value={serviceArea}
              onChangeText={setServiceArea}
              placeholder="Davao City, Panabo, Tagum, Samal"
              leftIcon="location-outline"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              containerStyle={{ marginBottom: SPACING.md }}
            />

            <Input
              label="Certifications"
              value={certifications}
              onChangeText={setCertifications}
              placeholder="TESDA NCII, Safety Training"
              leftIcon="ribbon-outline"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              containerStyle={{ marginBottom: SPACING.md }}
            />

            <Button
              title="Save Profile"
              onPress={handleSave}
              loading={saving}
              fullWidth
              size="lg"
              style={{ marginTop: SPACING.sm }}
            />
          </View>
          <View style={{ height: SPACING.xl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  form: { paddingHorizontal: SPACING.md },
  sectionLabel: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  coverPhotoWrap: {
    width: '100%',
    height: 160,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.surfaceTertiary,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    position: 'relative',
  },
  coverPhoto: { width: '100%', height: '100%' },
  coverPhotoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  coverPhotoText: { fontSize: FONTS.sizes.sm, color: COLORS.textMuted, fontFamily: FONTS.medium },
  profilePhotoWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.surfaceTertiary,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignSelf: 'center',
    position: 'relative',
  },
  profilePhoto: { width: 100, height: 100, borderRadius: 50 },
  profilePhotoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  charCount: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginTop: -SPACING.md,
    marginBottom: SPACING.md,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
});
