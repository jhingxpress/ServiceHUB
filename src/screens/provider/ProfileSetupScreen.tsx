import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Category } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { validators } from '../../utils/validation';
import { useErrorHandler } from '../../utils/errorHandler';

export default function ProfileSetupScreen() {
  const navigation = useNavigation();
  const { user, refreshProfile } = useAuthStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [experience, setExperience] = useState('');
  const [saving, setSaving] = useState(false);
  const { showError, showSuccess, showWarning } = useErrorHandler();

  useEffect(() => {
    supabase.from('categories').select('*').order('name').then(({ data }) => {
      setCategories(data ?? []);
    });
  }, []);

  const handleSave = async () => {
    if (!selectedCategory) {
      showWarning('Please select a service category.');
      return;
    }
    const bioError = validators.required(bio, 'Bio');
    if (bioError) {
      showWarning(bioError);
      return;
    }
    if (hourlyRate && (isNaN(parseFloat(hourlyRate)) || parseFloat(hourlyRate) < 0)) {
      showWarning('Hourly rate must be a valid positive number.');
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('providers').upsert({
        id: user.id,
        category_id: selectedCategory,
        bio: bio.trim(),
        location: location.trim() || null,
        hourly_rate: hourlyRate ? parseFloat(hourlyRate) : null,
        years_of_experience: experience ? parseInt(experience, 10) : null,
        is_available: true,
      });
      if (error) throw error;
      await refreshProfile();
      showSuccess('Provider profile saved successfully!');
      navigation.goBack();
    } catch (err) {
      showError(err, 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Provider Profile</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.form}>
            {/* Category */}
            <Text style={styles.label}>Service Category *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catChip, selectedCategory === cat.id && styles.catChipActive]}
                  onPress={() => setSelectedCategory(cat.id)}
                >
                  <Ionicons
                    name={cat.icon as React.ComponentProps<typeof Ionicons>['name']}
                    size={16}
                    color={selectedCategory === cat.id ? COLORS.white : COLORS.textSecondary}
                  />
                  <Text style={[styles.catText, selectedCategory === cat.id && styles.catTextActive]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Input
              label="Bio / About You *"
              value={bio}
              onChangeText={setBio}
              placeholder="Describe your skills and experience..."
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              containerStyle={{ marginBottom: SPACING.md }}
            />

            <Input
              label="Service Location"
              value={location}
              onChangeText={setLocation}
              leftIcon="location-outline"
              placeholder="City, State"
            />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Hourly Rate ($)"
                  value={hourlyRate}
                  onChangeText={setHourlyRate}
                  leftIcon="cash-outline"
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              </View>
              <View style={{ width: SPACING.sm }} />
              <View style={{ flex: 1 }}>
                <Input
                  label="Years Experience"
                  value={experience}
                  onChangeText={setExperience}
                  leftIcon="trophy-outline"
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </View>
            </View>

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
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  form: { paddingHorizontal: SPACING.md },
  label: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.sm },
  catScroll: { paddingBottom: SPACING.md, gap: SPACING.sm },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.surface,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  catTextActive: { color: COLORS.white, fontFamily: FONTS.semiBold },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
});
