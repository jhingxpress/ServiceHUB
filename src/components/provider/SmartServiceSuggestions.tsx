import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { Service } from '../../types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { useToast } from '../../hooks/useToast';

const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  'Cleaning': [
    'House Cleaning',
    'Deep Cleaning',
    'Office Cleaning',
    'Move-In Cleaning',
    'Sofa Cleaning',
    'Post-Construction Cleaning',
  ],
  'Plumbing': [
    'Leak Repair',
    'Pipe Installation',
    'Toilet Repair',
    'Faucet Replacement',
    'Drain Cleaning',
    'Water Heater Repair',
  ],
  'Electrical': [
    'Wiring Installation',
    'Outlet Repair',
    'Lighting Installation',
    'Breaker Repair',
    'Ceiling Fan Installation',
    'Electrical Inspection',
  ],
  'Aircon': [
    'Aircon Cleaning',
    'Aircon Repair',
    'Aircon Installation',
    'Refrigerant Refill',
    'Duct Cleaning',
  ],
  'Carpentry': [
    'Cabinet Installation',
    'Door Repair',
    'Furniture Assembly',
    'Wood Floor Repair',
    'Custom Shelving',
  ],
  'Painting': [
    'Interior Painting',
    'Exterior Painting',
    'Wallpaper Installation',
    'Wall Repair & Retouch',
  ],
  'Gardening': [
    'Lawn Mowing',
    'Landscape Design',
    'Tree Trimming',
    'Garden Maintenance',
    'Planting Services',
  ],
  'Pest Control': [
    'Termite Treatment',
    'Rodent Control',
    'Insect Spraying',
    'Bed Bug Removal',
    'Disinfection Service',
  ],
  'Appliance Repair': [
    'Refrigerator Repair',
    'Washing Machine Repair',
    'Microwave Repair',
    'TV Repair',
    'Small Appliance Repair',
  ],
  'Moving': [
    'Home Moving',
    'Office Moving',
    'Packing Service',
    'Furniture Disassembly',
  ],
};

interface Props {
  categoryName: string;
  existingServices: Service[];
  providerId: string;
  onAdded: () => void;
}

export default function SmartServiceSuggestions({ categoryName, existingServices, providerId, onAdded }: Props) {
  const { showToast } = useToast();
  const suggestions = CATEGORY_SUGGESTIONS[categoryName] ?? [];
  const existingNames = new Set(existingServices.map((s) => s.name.toLowerCase().trim()));

  // Only show suggestions that haven't been added yet
  const availableSuggestions = suggestions.filter(
    (name) => !existingNames.has(name.toLowerCase().trim())
  );

  if (availableSuggestions.length === 0) return null;

  const handleAdd = async (name: string) => {
    const trimmed = name.trim();

    // Frontend duplicate guard
    if (existingNames.has(trimmed.toLowerCase())) {
      showToast(`${trimmed} already exists`, 'warning');
      return;
    }

    const { error } = await supabase.from('services').insert({
      provider_id: providerId,
      name: trimmed,
      description: null,
      price: 0,
      home_visit_fee: 0,
      duration_minutes: 60,
      is_active: true,
    });
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      showToast(`${trimmed} added successfully`, 'success');
      // Refresh backend aggregates
      await Promise.all([
        supabase.rpc('refresh_provider_checklist', { p_provider_id: providerId }),
        supabase.rpc('refresh_provider_score', { p_provider_id: providerId }),
      ]);
      onAdded();
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="bulb-outline" size={22} color={COLORS.warning} />
        <Text style={styles.title}>Recommended Services</Text>
      </View>
      <Text style={styles.subtitle}>
        Based on your <Text style={{ fontFamily: FONTS.semiBold }}>{categoryName}</Text> category
      </Text>
      <View style={styles.chips}>
        {availableSuggestions.map((name) => (
          <TouchableOpacity
            key={name}
            style={styles.chip}
            onPress={() => handleAdd(name)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={16} color={COLORS.primary} />
            <Text style={styles.chipText}>{name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.sm,
    ...SHADOWS.small,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  title: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    color: COLORS.textSecondary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primaryLight,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  chipAdded: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.success + '30',
  },
  chipText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.medium,
    color: COLORS.primary,
  },
  chipTextAdded: {
    color: COLORS.success,
    textDecorationLine: 'line-through',
  },
});
