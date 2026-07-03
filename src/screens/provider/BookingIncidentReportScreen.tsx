import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../../constants/theme';
import Button from '../../components/ui/Button';
import { ProviderStackParamList } from '../../navigation/types';
import { BookingIncidentReason } from '../../types';
import { useErrorHandler } from '../../utils/errorHandler';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;
type RouteType = RouteProp<ProviderStackParamList, 'BookingIncidentReport'>;

const REASONS: { value: BookingIncidentReason; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'customer_not_present', label: 'Customer Not Present', icon: 'person-remove-outline' },
  { value: 'wrong_address', label: 'Wrong Address', icon: 'location-outline' },
  { value: 'customer_refused_service', label: 'Customer Refused Service', icon: 'close-circle-outline' },
  { value: 'unsafe_location', label: 'Unsafe Location', icon: 'warning-outline' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

export default function BookingIncidentReportScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { bookingId } = route.params;
  const { user } = useAuthStore();
  const { showError, showSuccess } = useErrorHandler();

  const [reason, setReason] = useState<BookingIncidentReason | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason) {
      Alert.alert('Select a Reason', 'Please choose what happened.');
      return;
    }
    if (!user) return;

    setSubmitting(true);
    try {
      let latitude: number | null = null;
      let longitude: number | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({});
          latitude = pos.coords.latitude;
          longitude = pos.coords.longitude;
        }
      } catch {
        // GPS is optional — proceed without it
      }

      const { error } = await supabase.from('booking_incident_reports').insert({
        booking_id: bookingId,
        provider_id: user.id,
        reason,
        notes: notes.trim() || null,
        latitude,
        longitude,
      });

      if (error) throw error;

      showSuccess('Incident reported. Our team will review it.');
      navigation.goBack();
    } catch (err) {
      showError(err, 'Failed to submit incident report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report an Issue</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Let us know what happened at this job. This will not change the booking status,
          cancel it, or assign blame — it simply logs the incident for our records.
        </Text>

        <Text style={styles.label}>What happened?</Text>
        <View style={styles.reasonList}>
          {REASONS.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[styles.reasonCard, reason === r.value && styles.reasonCardActive]}
              onPress={() => setReason(r.value)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={r.icon}
                size={20}
                color={reason === r.value ? COLORS.white : COLORS.primary}
              />
              <Text style={[styles.reasonLabel, reason === r.value && styles.reasonLabelActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Additional Notes (optional)</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Add any extra details..."
          placeholderTextColor={COLORS.textLight}
          multiline
          numberOfLines={5}
          value={notes}
          onChangeText={setNotes}
          textAlignVertical="top"
        />

        <Button
          title="Submit Report"
          onPress={handleSubmit}
          loading={submitting}
          fullWidth
          style={{ marginTop: SPACING.lg }}
        />
      </ScrollView>
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
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.bold, color: COLORS.text },
  content: { padding: SPACING.md },
  subtitle: {
    fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  label: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  reasonList: { gap: SPACING.sm, marginBottom: SPACING.lg },
  reasonCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  reasonCardActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  reasonLabel: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.base, color: COLORS.text },
  reasonLabelActive: { color: COLORS.white },
  textArea: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
    fontFamily: FONTS.regular, fontSize: FONTS.sizes.base, color: COLORS.text,
    minHeight: 110,
  },
});
