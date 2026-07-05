import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import {
  canReviewProviders,
  canMonitorBookings,
  canHandleReports,
  canViewIncidentReports,
  isAdminOrStaff,
  isStaff,
  getStaffRoleLabel,
} from '../../utils/roleUtils';
import { createEscalation } from '../../services/escalationService';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

interface OpsCounts {
  pendingProviders: number;
  featuredPending: number;
  platformFeesOutstanding: number;
  incidentReports: number;
  openReports: number;
  activeBookings: number;
  openDisputes: number;
  escalations: number;
}

interface OpsModule {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  badgeKey?: keyof OpsCounts;
  onPress: () => void;
  permission: (role?: UserRole | string | null) => boolean;
  comingSoon?: boolean;
  description?: string;
}

const EMPTY_COUNTS: OpsCounts = {
  pendingProviders: 0,
  featuredPending: 0,
  platformFeesOutstanding: 0,
  incidentReports: 0,
  openReports: 0,
  activeBookings: 0,
  openDisputes: 0,
  escalations: 0,
};

export default function OperationsCenterScreen() {
  const navigation = useNavigation<NavProp>();
  const { user, signOut } = useAuthStore();
  const role = user?.role;
  const roleLabel = getStaffRoleLabel(role);

  const [counts, setCounts] = useState<OpsCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [searching, setSearching] = useState(false);

  const modules = useMemo((): OpsModule[] => [
    {
      id: 'pendingProviders',
      label: 'Pending Providers',
      icon: 'person-add-outline',
      badgeKey: 'pendingProviders',
      onPress: () => navigation.navigate('PendingProviders'),
      permission: canReviewProviders,
    },
    {
      id: 'featuredProviders',
      label: 'Featured Providers',
      icon: 'star-outline',
      badgeKey: 'featuredPending',
      onPress: () => navigation.navigate('FeaturedRevenue'),
      permission: canReviewProviders,
    },
    {
      id: 'platformFees',
      label: 'Platform Fees',
      icon: 'cash-outline',
      badgeKey: 'platformFeesOutstanding',
      onPress: () => navigation.navigate('AdminPlatformFees'),
      permission: isAdminOrStaff,
    },
    {
      id: 'customerTips',
      label: 'Customer Tips',
      icon: 'heart-outline',
      onPress: () => navigation.navigate('TipsRevenue'),
      permission: isAdminOrStaff,
    },
    {
      id: 'incidentReports',
      label: 'Incident Reports',
      icon: 'warning-outline',
      badgeKey: 'incidentReports',
      onPress: () => navigation.navigate('StaffIncidentReports'),
      permission: canViewIncidentReports,
    },
    {
      id: 'userReports',
      label: 'User Reports',
      icon: 'flag-outline',
      badgeKey: 'openReports',
      onPress: () => navigation.navigate('AdminReports'),
      permission: canHandleReports,
    },
    {
      id: 'activeBookings',
      label: 'Active Bookings',
      icon: 'calendar-outline',
      badgeKey: 'activeBookings',
      onPress: () => navigation.navigate('BookingManagement'),
      permission: canMonitorBookings,
    },
    {
      id: 'openDisputes',
      label: 'Open Disputes',
      icon: 'alert-circle-outline',
      badgeKey: 'openDisputes',
      onPress: () => navigation.navigate('Disputes'),
      permission: canHandleReports,
    },
    {
      id: 'escalations',
      label: 'Escalations',
      icon: 'trending-up-outline',
      badgeKey: 'escalations',
      onPress: () => navigation.navigate('Escalations'),
      permission: isAdminOrStaff,
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: 'notifications-outline',
      onPress: () => navigation.navigate('AdminNotifications'),
      permission: isAdminOrStaff,
    },
    {
      id: 'supportInbox',
      label: 'Support Inbox',
      icon: 'headset-outline',
      onPress: () => {},
      permission: isAdminOrStaff,
      comingSoon: true,
      description: 'Support Inbox will centralize customer and provider support tickets.',
    },
  ], [navigation]);

  const fetchCounts = useCallback(async () => {
    try {
      const [providers, featured, pfees, incidents, reports, bookings, disputes, escalations] = await Promise.all([
        supabase.from('providers').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
        supabase.from('featured_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('provider_platform_fees').select('id', { count: 'exact', head: true }).eq('status', 'unpaid'),
        supabase.from('booking_incident_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).in('status', ['accepted', 'on_the_way', 'arrived', 'in_progress']),
        supabase.from('disputes').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('escalations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      ]);
      setCounts({
        pendingProviders:       providers.count  ?? 0,
        featuredPending:        featured.count   ?? 0,
        platformFeesOutstanding: pfees.count     ?? 0,
        incidentReports:        incidents.count  ?? 0,
        openReports:            reports.count    ?? 0,
        activeBookings:         bookings.count   ?? 0,
        openDisputes:           disputes.count   ?? 0,
        escalations:            escalations.count ?? 0,
      });
    } catch (err) {
      console.error('[OperationsCenter] fetchCounts error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useFocusEffect(useCallback(() => { fetchCounts(); }, [fetchCounts]));

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

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
      ]
    );
  };

  const totalAlerts =
    counts.pendingProviders +
    counts.incidentReports +
    counts.openReports +
    counts.openDisputes +
    counts.escalations;

  const visibleModules = modules.filter((m) => m.permission(role));

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
        contentContainerStyle={styles.scroll}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Operations Center</Text>
            <Text style={styles.subtitle}>{roleLabel}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
            <Ionicons name="log-out-outline" size={22} color={COLORS.error} />
          </TouchableOpacity>
        </View>

        {/* ── Alert summary bar ── */}
        {totalAlerts > 0 && (
          <View style={styles.alertBar}>
            <Ionicons name="alert-circle" size={15} color={COLORS.warning} />
            <Text style={styles.alertBarText}>
              {totalAlerts} item{totalAlerts !== 1 ? 's' : ''} require{totalAlerts === 1 ? 's' : ''} attention
            </Text>
          </View>
        )}

        {/* ── User Lookup ── */}
        <View style={styles.searchCard}>
          <View style={styles.searchCardHeader}>
            <View style={styles.smallIconWrap}>
              <Ionicons name="search-outline" size={16} color={COLORS.primary} />
            </View>
            <Text style={styles.searchCardTitle}>User Lookup</Text>
          </View>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={searchEmail}
              onChangeText={setSearchEmail}
              placeholder="Search by email address"
              placeholderTextColor={COLORS.textLight}
              autoCapitalize="none"
              keyboardType="email-address"
              returnKeyType="search"
              onSubmitEditing={handleUserSearch}
            />
            <TouchableOpacity
              style={[styles.searchBtn, searching && { opacity: 0.7 }]}
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

        {/* ── Modules section label ── */}
        <Text style={styles.sectionLabel}>Modules</Text>

        {/* ── Module grid ── */}
        <View style={styles.grid}>
          {visibleModules.map((mod) => {
            const count = mod.badgeKey ? (counts[mod.badgeKey] ?? 0) : 0;
            return (
              <TouchableOpacity
                key={mod.id}
                style={[styles.card, mod.comingSoon && styles.cardDisabled]}
                onPress={mod.comingSoon ? undefined : mod.onPress}
                activeOpacity={mod.comingSoon ? 1 : 0.78}
                disabled={mod.comingSoon}
              >
                <View style={styles.cardTop}>
                  <View style={[styles.iconWrap, mod.comingSoon && styles.iconWrapDisabled]}>
                    <Ionicons
                      name={mod.icon}
                      size={22}
                      color={mod.comingSoon ? COLORS.textMuted : COLORS.primary}
                    />
                  </View>
                  {count > 0 && !mod.comingSoon && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
                    </View>
                  )}
                  {mod.comingSoon && (
                    <View style={styles.soonPill}>
                      <Text style={styles.soonText}>Soon</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.cardLabel, mod.comingSoon && styles.cardLabelMuted]}>
                  {mod.label}
                </Text>
                {count > 0 && !mod.comingSoon && (
                  <Text style={styles.cardCount}>{count} pending</Text>
                )}
                {mod.comingSoon && mod.description && (
                  <Text style={styles.cardDescription}>{mod.description}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Escalate to Admin ── */}
        {isStaff(role) && (
          <TouchableOpacity style={styles.escalateBtn} onPress={handleEscalate} activeOpacity={0.8}>
            <Ionicons name="trending-up-outline" size={20} color={COLORS.white} />
            <Text style={styles.escalateText}>Escalate to Admin</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: SPACING.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingBottom: SPACING.xl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  headerLeft: { flex: 1 },
  title: { fontSize: FONTS.sizes.xxl, fontFamily: FONTS.bold, color: COLORS.text },
  subtitle: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.errorLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.sm,
  },

  alertBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.warningLight,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  alertBarText: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.medium,
    color: '#92400E',
  },

  searchCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  searchCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  smallIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchCardTitle: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.regular,
    color: COLORS.text,
  },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sectionLabel: {
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.semiBold,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  card: {
    width: '47%',
    minHeight: 110,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  cardDisabled: {
    backgroundColor: COLORS.surfaceSecondary,
    borderColor: COLORS.divider,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapDisabled: {
    backgroundColor: COLORS.surfaceTertiary,
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.bold, color: COLORS.white },
  soonPill: {
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
  },
  soonText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.medium, color: COLORS.textLight },
  cardLabel: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  cardLabelMuted: { color: COLORS.textMuted },
  cardCount: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  cardDescription: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    marginTop: 4,
    lineHeight: 16,
  },

  escalateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.error,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
  },
  escalateText: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.white },
});
