import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Button from '../../components/ui/Button';
import { validators, validateForm } from '../../utils/validation';
import { useErrorHandler } from '../../utils/errorHandler';

export default function AddServiceScreen() {
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    duration_minutes: '',
    what_includes: '',
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { showError, showSuccess } = useErrorHandler();

  const update = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    const validation = validateForm(
      { name: form.name, price: form.price },
      {
        name: (v) => validators.required(v, 'Service name'),
        price: (v) => {
          if (!v.trim()) return 'Price is required';
          if (isNaN(parseFloat(v)) || parseFloat(v) <= 0) return 'Price must be a valid positive number';
          return null;
        },
      }
    );
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('services').insert({
        provider_id: user.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: parseFloat(form.price),
        duration_minutes: form.duration_minutes ? parseInt(form.duration_minutes, 10) : null,
        is_active: true,
      });
      if (error) throw error;
      showSuccess('Service added successfully!');
      navigation.goBack();
    } catch (err) {
      showError(err, 'Failed to add service. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const FIELDS: {
    key: string;
    label: string;
    placeholder: string;
    icon: React.ComponentProps<typeof Ionicons>['name'];
    keyboard?: 'default' | 'decimal-pad' | 'number-pad';
    multiline?: boolean;
    optional?: boolean;
  }[] = [
    { key: 'name', label: 'Service Name', placeholder: 'e.g. Deep Cleaning, AC Repair', icon: 'construct-outline' },
    { key: 'price', label: 'Price (PHP)', placeholder: '500', icon: 'cash-outline', keyboard: 'decimal-pad' },
    { key: 'duration_minutes', label: 'Duration (minutes)', placeholder: '60', icon: 'time-outline', keyboard: 'number-pad', optional: true },
    { key: 'description', label: 'Description', placeholder: 'What does this service include?', icon: 'document-text-outline', multiline: true, optional: true },
    { key: 'what_includes', label: 'What\'s Included', placeholder: 'Tools, materials, etc.', icon: 'list-outline', multiline: true, optional: true },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={20} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Add New Service</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            {FIELDS.map((field) => (
              <View key={field.key} style={styles.fieldGroup}>
                <View style={styles.fieldLabel}>
                  <Text style={styles.label}>{field.label}</Text>
                  {field.optional && <Text style={styles.optional}>Optional</Text>}
                </View>
                <View style={[styles.inputWrap, field.multiline && styles.inputWrapMulti, !!errors[field.key] && styles.inputWrapError]}>
                  <Ionicons name={field.icon} size={17} color={errors[field.key] ? COLORS.error : COLORS.textLight} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, field.multiline && styles.inputMulti]}
                    value={(form as Record<string, string>)[field.key]}
                    onChangeText={(v) => { update(field.key, v); if (errors[field.key]) setErrors((p) => ({ ...p, [field.key]: '' })); }}
                    placeholder={field.placeholder}
                    placeholderTextColor={COLORS.textLight}
                    keyboardType={field.keyboard ?? 'default'}
                    multiline={field.multiline}
                    numberOfLines={field.multiline ? 3 : 1}
                    textAlignVertical={field.multiline ? 'top' : 'center'}
                  />
                </View>
                {!!errors[field.key] && (
                  <Text style={styles.errorText}>{errors[field.key]}</Text>
                )}
              </View>
            ))}

            {/* Price preview */}
            {form.price ? (
              <View style={styles.previewCard}>
                <Text style={styles.previewLabel}>Price Preview</Text>
                <Text style={styles.previewPrice}>₱{parseFloat(form.price).toFixed(2)}</Text>
                {form.duration_minutes && (
                  <Text style={styles.previewDuration}>{form.duration_minutes} min service</Text>
                )}
              </View>
            ) : null}

            <Button
              title="Add Service"
              onPress={handleSave}
              loading={saving}
              fullWidth
              size="lg"
              style={{ marginTop: SPACING.md }}
            />
          </View>
          <View style={{ height: SPACING.xxl }} />
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
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
  form: { padding: SPACING.md, gap: SPACING.md },
  fieldGroup: {},
  fieldLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACING.xs },
  label: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.text },
  optional: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, fontStyle: 'italic' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1.5, borderColor: COLORS.border, ...SHADOWS.small,
  },
  inputWrapMulti: { alignItems: 'flex-start' },
  inputIcon: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.md },
  input: { flex: 1, height: 48, paddingRight: SPACING.md, fontSize: FONTS.sizes.base, color: COLORS.text },
  inputMulti: { height: 80, paddingTop: SPACING.sm, paddingBottom: SPACING.sm },
  previewCard: {
    backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, alignItems: 'center', gap: 4,
  },
  previewLabel: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontFamily: FONTS.semiBold },
  previewPrice: { fontSize: FONTS.sizes.xxxl, fontFamily: FONTS.bold, color: COLORS.primary },
  previewDuration: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  inputWrapError: { borderColor: COLORS.error },
  errorText: { fontSize: FONTS.sizes.xs, color: COLORS.error, marginTop: 4, marginLeft: 4 },
});
