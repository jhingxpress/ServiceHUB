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
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Button from '../../components/ui/Button';
import { ReportType } from '../../types';

type ReportRoute = RouteProp<
  { ReportScreen: { reportedUserId: string; bookingId?: string; reportedUserName?: string } },
  'ReportScreen'
>;

type NavProp = NativeStackNavigationProp<any>;

const REPORT_TYPES: { value: ReportType; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'fake_provider', label: 'Fake Provider', icon: 'person-remove-outline' },
  { value: 'fake_customer', label: 'Fake Customer', icon: 'person-remove-outline' },
  { value: 'spam', label: 'Spam', icon: 'mail-unread-outline' },
  { value: 'harassment', label: 'Harassment', icon: 'warning-outline' },
  { value: 'fraud', label: 'Fraud', icon: 'card-outline' },
  { value: 'no_show', label: 'No Show', icon: 'time-outline' },
  { value: 'inappropriate_content', label: 'Inappropriate Content', icon: 'eye-off-outline' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

export default function ReportScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<ReportRoute>();
  const { user } = useAuthStore();
  const { reportedUserId, bookingId, reportedUserName } = route.params;

  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!reportType) {
      Alert.alert('Select Report Type', 'Please choose a report type.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Description Required', 'Please describe the issue.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.from('reports').insert({
      reporter_id: user!.id,
      reported_user_id: reportedUserId,
      booking_id: bookingId || null,
      report_type: reportType,
      description: description.trim(),
    });
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    Alert.alert('Report Submitted', 'Thank you. Our team will review your report.', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Reporting: {reportedUserName || 'User'}
        </Text>

        <Text style={styles.label}>Report Type</Text>
        <View style={styles.typeGrid}>
          {REPORT_TYPES.map((type) => (
            <TouchableOpacity
              key={type.value}
              style={[
                styles.typeCard,
                reportType === type.value && styles.typeCardActive,
              ]}
              onPress={() => setReportType(type.value)}
              activeOpacity={0.8}
            >
              <Ionicons
                name={type.icon}
                size={20}
                color={reportType === type.value ? COLORS.white : COLORS.primary}
              />
              <Text
                style={[
                  styles.typeLabel,
                  reportType === type.value && styles.typeLabelActive,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={styles.textArea}
          placeholder="Describe what happened..."
          placeholderTextColor={COLORS.textLight}
          multiline
          numberOfLines={6}
          value={description}
          onChangeText={setDescription}
          textAlignVertical="top"
        />

        <Button
          title="Submit Report"
          onPress={handleSubmit}
          loading={loading}
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
    paddingVertical: SPACING.md,
  },
  headerTitle: { fontFamily: FONTS.semiBold, fontSize: FONTS.sizes.lg, color: COLORS.text },
  content: { padding: SPACING.md },
  subtitle: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.base, color: COLORS.textSecondary, marginBottom: SPACING.lg },
  label: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg },
  typeCard: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  typeCardActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeLabel: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.sm, color: COLORS.text },
  typeLabelActive: { fontFamily: FONTS.medium, fontSize: FONTS.sizes.sm, color: COLORS.white },
  textArea: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    fontFamily: FONTS.regular,
    fontSize: FONTS.sizes.base,
    color: COLORS.text,
    minHeight: 120,
  },
});
