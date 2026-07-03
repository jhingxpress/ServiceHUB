import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { AdminStackParamList } from '../../navigation/types';
import { UserRole } from '../../types';
import { canReviewProviders, canMonitorBookings, canHandleReports, canViewIncidentReports, isAdminOrStaff, isStaff } from '../../utils/roleUtils';
import { createEscalation } from '../../services/escalationService';

interface OpsCounts {
  pendingProviders: number;
  incidentReports: number;
  openReports: number;
  activeBookings: number;
  openDisputes: number;
  escalations: number;
}

const SECTIONS = (
  navigation: NavProp
): {
  key: keyof OpsCounts;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  permission: (role?: UserRole | string | null) => boolean;
}[] => [
  { key: 'pendingProviders', label: 'Pending Providers', icon: 'person-add-outline', onPress: () => navigation.navigate('PendingProviders'), permission: canReviewProviders },
  { key: 'incidentReports', label: 'Incident Reports', icon: 'warning-outline', onPress: () => navigation.navigate('StaffIncidentReports'), permission: canViewIncidentReports },
  { key: 'openReports', label: 'User Reports', icon: 'flag-outline', onPress: () => navigation.navigate('AdminReports'), permission: canHandleReports },
  { key: 'activeBookings', label: 'Active Bookings', icon: 'calendar-outline', onPress: () => navigation.navigate('BookingManagement'), permission: canMonitorBookings },
  { key: 'openDisputes', label: 'Open Disputes', icon: 'alert-circle-outline', onPress: () => navigation.navigate('Disputes'), permission: canHandleReports },
  { key: 'escalations', label: 'Escalations', icon: 'trending-up-outline', onPress: () => navigation.navigate('Escalations'), permission: isAdminOrStaff },
];

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

export default function OperationsCenterScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const role = user?.role;
  const [counts, setCounts] = useState<OpsCounts>({
    pendingProviders: 0,
    incidentReports: 0,
    openReports: 0,
    activeBookings: 0,
    openDisputes: 0,
    escalations: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [searching, setSearching] = useState(false);

  const fetchCounts = useCallback(async () => {
    try {
      const [providers, incidents, reports, bookings, disputes, escalations] = await Promise.all([
        supabase.from('providers').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
        supabase.from('booking_incident_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).in('status', ['accepted', 'on_the_way', 'arrived', 'in_progress']),
        supabase.from('disputes').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('escalations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      ]);
      setCounts({
        pendingProviders: providers.count ?? 0,
        incidentReports: incidents.count ?? 0,
        openReports: reports.count ?? 0,
        activeBookings: bookings.count ?? 0,
        openDisputes: disputes.count ?? 0,
        escalations: escalations.count ?? 0,
      });
    } catch (err) {
      console.error('[OperationsCenter] fetchCounts error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  useFocusEffect(
    useCallback(() => {
      fetchCounts();
    }, [fetchCounts])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchCounts();
  };

  const handleUserSearch = async () => {
    const email = searchEmail.trim();
    if (!email) return;
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .ilike('email', `%${email}%`)
        .limit(1);
      if (error) throw error;
      if (data && data.length > 0) {
        navigation.navigate('UserDetail', { userId: data[0].id });
      } else {
        Alert.alert('Not found', 'No user found with that email.');
      }
    } catch (err) {
      console.error('[OperationsCenter] user search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleEscalate = () => {
    Alert.prompt(
      'Escalate to Admin',
      'Enter a reason for the escalation',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Escalate',
          onPress: async (reason) => {
            const trimmed = reason?.trim();
            if (!trimmed) {
              Alert.alert('Required', 'Please enter a reason.');
              return;
            }
            const { error } = await createEscalation({ reason: trimmed });
            if (error) {
              Alert.alert('Error', error);
              return;
            }
            Alert.alert('Escalated', 'Admin has been notified.');
            fetchCounts();
          },
        },
      ],
      'plain-text'
    );
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        <View style={styles.topBar}>
          <Text style={styles.title}>Operations Center</Text>
        </View>

        <View style={styles.searchCard}>
          <Text style={styles.sectionTitle}>User Lookup</Text>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={searchEmail}
              onChangeText={setSearchEmail}
              placeholder="Search by email"
              placeholderTextColor={COLORS.textLight}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={handleUserSearch}
              disabled={searching}
            >
              {searching ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Ionicons name="search" size={18} color={COLORS.white} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.grid}>
          {SECTIONS(navigation).map((section) => {
            if (!section.permission(role)) return null;
            const count = counts[section.key as keyof OpsCounts];
            return (
              <TouchableOpacity
                key={section.key}
                style={styles.card}
                onPress={section.onPress}
                activeOpacity={0.8}
              >
                <View style={styles.cardTop}>
                  <View style={styles.iconWrap}>
                    <Ionicons name={section.icon} size={22} color={COLORS.primary} />
                  </View>
                  {count > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardLabel}>{section.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {isStaff(role) && (
          <TouchableOpacity style={styles.escalateBtn} onPress={handleEscalate} activeOpacity={0.8}>
            <Ionicons name="trending-up-outline" size={20} color={COLORS.white} />
            <Text style={styles.escalateText}>Escalate to Admin</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: SPACING.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  title: { fontSize: FONTS.sizes.xxl, fontFamily: FONTS.bold, color: COLORS.text },
  searchCard: {
    backgroundColor: COLORS.surface, marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  sectionTitle: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, marginBottom: SPACING.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  searchInput: {
    flex: 1, backgroundColor: COLORS.background, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, fontSize: FONTS.sizes.base, color: COLORS.text,
  },
  searchBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  card: {
    width: '47%',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    minWidth: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.error,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  badgeText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.bold, color: COLORS.white },
  cardLabel: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  escalateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.error, marginHorizontal: SPACING.md, marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.lg, paddingVertical: SPACING.md,
  },
  escalateText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.white },
});
