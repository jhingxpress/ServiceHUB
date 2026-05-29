import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Button from '../../components/ui/Button';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 === 0 ? 12 : i % 12;
  const ampm = i < 12 ? 'AM' : 'PM';
  return `${h}:00 ${ampm}`;
});

interface DaySchedule {
  day: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
}

export default function ScheduleScreen() {
  const { user } = useAuthStore();
  const [schedule, setSchedule] = useState<DaySchedule[]>(
    DAYS.map((day) => ({
      day,
      enabled: !['Saturday', 'Sunday'].includes(day),
      startTime: '8:00 AM',
      endTime: '6:00 PM',
    }))
  );
  const [saving, setSaving] = useState(false);

  const toggleDay = (index: number) => {
    setSchedule((prev) =>
      prev.map((d, i) => (i === index ? { ...d, enabled: !d.enabled } : d))
    );
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    await supabase.from('availability').delete().eq('provider_id', user.id);

    const rows = schedule
      .filter((s) => s.enabled)
      .map((s) => ({
        provider_id: user.id,
        day_of_week: DAYS.indexOf(s.day),
        start_time: s.startTime,
        end_time: s.endTime,
        is_available: true,
      }));

    if (rows.length > 0) {
      await supabase.from('availability').insert(rows);
    }

    setSaving(false);
    Alert.alert('Saved', 'Your availability schedule has been updated.');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Text style={styles.title}>My Schedule</Text>
          <Text style={styles.subtitle}>Set your weekly availability</Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            Customers can only book you during your available hours. Toggle days on/off and set your working hours.
          </Text>
        </View>

        {schedule.map((day, i) => (
          <View key={day.day} style={[styles.dayCard, !day.enabled && styles.dayCardDisabled]}>
            <View style={styles.dayHeader}>
              <Text style={[styles.dayName, !day.enabled && styles.dayNameDisabled]}>
                {day.day}
              </Text>
              <Switch
                value={day.enabled}
                onValueChange={() => toggleDay(i)}
                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                thumbColor={COLORS.white}
              />
            </View>
            {day.enabled && (
              <View style={styles.timeRow}>
                <View style={styles.timeBlock}>
                  <Text style={styles.timeLabel}>From</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeScroll}>
                    {HOURS.slice(5, 14).map((h) => (
                      <TouchableOpacity
                        key={h}
                        style={[styles.timeChip, day.startTime === h && styles.timeChipActive]}
                        onPress={() =>
                          setSchedule((prev) =>
                            prev.map((d, idx) => (idx === i ? { ...d, startTime: h } : d))
                          )
                        }
                      >
                        <Text style={[styles.timeChipText, day.startTime === h && styles.timeChipTextActive]}>
                          {h}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View style={styles.timeBlock}>
                  <Text style={styles.timeLabel}>To</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeScroll}>
                    {HOURS.slice(12, 23).map((h) => (
                      <TouchableOpacity
                        key={h}
                        style={[styles.timeChip, day.endTime === h && styles.timeChipActive]}
                        onPress={() =>
                          setSchedule((prev) =>
                            prev.map((d, idx) => (idx === i ? { ...d, endTime: h } : d))
                          )
                        }
                      >
                        <Text style={[styles.timeChipText, day.endTime === h && styles.timeChipTextActive]}>
                          {h}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            )}
          </View>
        ))}

        <View style={styles.footer}>
          <Button
            title="Save Schedule"
            onPress={handleSave}
            loading={saving}
            fullWidth
            size="lg"
          />
        </View>
        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  topBar: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  title: { fontSize: FONTS.sizes.xxl, fontFamily: FONTS.bold, color: COLORS.text },
  subtitle: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  infoCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md,
  },
  infoText: { fontSize: FONTS.sizes.sm, color: COLORS.primary, lineHeight: 20 },
  dayCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  dayCardDisabled: { opacity: 0.6 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  dayName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  dayNameDisabled: { color: COLORS.textLight },
  timeRow: { gap: SPACING.sm },
  timeBlock: {},
  timeLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontFamily: FONTS.semiBold, marginBottom: 6 },
  timeScroll: { gap: SPACING.xs },
  timeChip: {
    paddingHorizontal: SPACING.sm, paddingVertical: 6,
    borderRadius: BORDER_RADIUS.sm, backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border,
  },
  timeChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  timeChipText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  timeChipTextActive: { color: COLORS.white, fontFamily: FONTS.semiBold },
  footer: { paddingHorizontal: SPACING.md, marginTop: SPACING.md },
});
