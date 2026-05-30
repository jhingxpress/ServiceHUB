import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProviderStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Button from '../../components/ui/Button';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;

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
  const navigation = useNavigation<NavProp>();
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
  const [loading, setLoading] = useState(true);

  const fetchSchedule = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('availability')
      .select('*')
      .eq('provider_id', user.id)
      .order('day_of_week');

    if (data && data.length > 0) {
      setSchedule(
        DAYS.map((day, i) => {
          const row = data.find((d: any) => d.day_of_week === i);
          if (!row) {
            return { day, enabled: false, startTime: '8:00 AM', endTime: '6:00 PM' };
          }
          const toDisplay = (t: string) => {
            const [hourStr] = t.split(':');
            const h = parseInt(hourStr, 10);
            const displayHour = h % 12 === 0 ? 12 : h % 12;
            return `${displayHour}:00 ${h < 12 ? 'AM' : 'PM'}`;
          };
          return {
            day,
            enabled: row.is_available,
            startTime: toDisplay(row.start_time),
            endTime: toDisplay(row.end_time),
          };
        })
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  useFocusEffect(
    useCallback(() => {
      fetchSchedule();
    }, [fetchSchedule])
  );

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
      .map((s) => {
        const parseTime = (t: string) => {
          const [time, period] = t.split(' ');
          let [h] = time.split(':').map(Number);
          if (period === 'PM' && h !== 12) h += 12;
          if (period === 'AM' && h === 12) h = 0;
          return `${String(h).padStart(2, '0')}:00:00`;
        };
        return {
          provider_id: user.id,
          day_of_week: DAYS.indexOf(s.day),
          start_time: parseTime(s.startTime),
          end_time: parseTime(s.endTime),
          is_available: true,
        };
      });

    if (rows.length > 0) {
      await supabase.from('availability').insert(rows);
    }

    await Promise.all([
      supabase.rpc('refresh_provider_checklist', { p_provider_id: user.id }),
      supabase.rpc('refresh_provider_score', { p_provider_id: user.id }),
    ]);

    setSaving(false);
    Alert.alert(
      'Saved',
      'Your availability schedule has been updated.',
      [
        { text: 'Stay Here', style: 'cancel' },
        { text: 'Go to Dashboard', onPress: () => navigation.navigate('ProviderTabs', { screen: 'Dashboard' }) },
      ]
    );
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

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          schedule.map((day, i) => (
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
        )))}

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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: SPACING.xl },
  footer: { paddingHorizontal: SPACING.md, marginTop: SPACING.md },
});
