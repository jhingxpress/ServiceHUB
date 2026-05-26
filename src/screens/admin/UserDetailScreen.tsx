import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { AdminStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';

type Props = NativeStackScreenProps<AdminStackParamList, 'UserDetail'>;

interface UserDetail {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
  bookings?: { id: string; status: string; created_at: string; services: { name: string } | null }[];
}

export default function UserDetailScreen({ route, navigation }: Props) {
  const { userId } = route.params;
  const [userData, setUserData] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('users')
      .select(`id, full_name, email, phone, avatar_url, role, is_active, created_at`)
      .eq('id', userId)
      .single()
      .then(async ({ data }) => {
        if (!data) { setLoading(false); return; }
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, status, created_at, service:services(name)')
          .eq('customer_id', userId)
          .order('created_at', { ascending: false })
          .limit(10);
        setUserData({ ...data, bookings: (bookings ?? []) as unknown as UserDetail['bookings'] } as UserDetail);
        setLoading(false);
      });
  }, [userId]);

  const handleToggleActive = () => {
    const action = userData?.is_active ? 'deactivate' : 'activate';
    Alert.alert(`${action.charAt(0).toUpperCase() + action.slice(1)} User`, `Are you sure you want to ${action} this user?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action.charAt(0).toUpperCase() + action.slice(1),
        style: userData?.is_active ? 'destructive' : 'default',
        onPress: async () => {
          const newStatus = !userData?.is_active;
          await supabase.from('users').update({ is_active: newStatus }).eq('id', userId);
          setUserData((p) => p ? { ...p, is_active: newStatus } : p);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ flex: 1 }} color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!userData) return null;

  const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    pending: { bg: '#FEF3C7', text: '#92400E' },
    accepted: { bg: '#DBEAFE', text: '#1E40AF' },
    in_progress: { bg: '#EDE9FE', text: '#4C1D95' },
    completed: { bg: '#D1FAE5', text: '#065F46' },
    cancelled: { bg: '#FEE2E2', text: '#991B1B' },
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Detail</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Profile */}
        <View style={styles.profileCard}>
          <Avatar uri={userData.avatar_url} name={userData.full_name} size={68} />
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{userData.full_name ?? 'Unknown User'}</Text>
            <Text style={styles.email}>{userData.email}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.roleBadge, { backgroundColor: userData.role === 'customer' ? '#EDE9FE' : COLORS.primaryLight }]}>
                <Text style={[styles.roleText, { color: userData.role === 'customer' ? '#4C1D95' : COLORS.primary }]}>
                  {userData.role.charAt(0).toUpperCase() + userData.role.slice(1)}
                </Text>
              </View>
              <View style={[styles.roleBadge, { backgroundColor: userData.is_active ? '#D1FAE5' : '#FEE2E2' }]}>
                <Text style={[styles.roleText, { color: userData.is_active ? COLORS.success : COLORS.error }]}>
                  {userData.is_active ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          {[
            { icon: 'call-outline', label: 'Phone', value: userData.phone ?? 'Not provided' },
            { icon: 'calendar-outline', label: 'Member Since', value: format(new Date(userData.created_at), 'MMMM d, yyyy') },
          ].map((row, i) => (
            <React.Fragment key={row.label}>
              <View style={styles.infoRow}>
                <Ionicons name={row.icon as React.ComponentProps<typeof Ionicons>['name']} size={16} color={COLORS.primary} />
                <View>
                  <Text style={styles.infoLabel}>{row.label}</Text>
                  <Text style={styles.infoValue}>{row.value}</Text>
                </View>
              </View>
              {i === 0 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
        </View>

        {/* Booking history */}
        {userData.bookings && userData.bookings.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Recent Bookings</Text>
            <View style={styles.bookingsCard}>
              {userData.bookings.map((b, i) => {
                const colors = STATUS_COLORS[b.status] ?? { bg: '#F1F5F9', text: COLORS.textSecondary };
                return (
                  <React.Fragment key={b.id}>
                    <View style={styles.bookingRow}>
                      <View>
                        <Text style={styles.bookingService}>{b.service?.name ?? 'Unknown Service'}</Text>
                        <Text style={styles.bookingDate}>{format(new Date(b.created_at), 'MMM d, yyyy')}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
                        <Text style={[styles.statusText, { color: colors.text }]}>
                          {b.status.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        </Text>
                      </View>
                    </View>
                    {i < (userData.bookings?.length ?? 0) - 1 && <View style={styles.divider} />}
                  </React.Fragment>
                );
              })}
            </View>
          </View>
        )}

        {/* Actions */}
        <TouchableOpacity
          style={[styles.toggleBtn, { backgroundColor: userData.is_active ? '#FEE2E2' : '#D1FAE5' }]}
          onPress={handleToggleActive}
        >
          <Ionicons
            name={userData.is_active ? 'ban-outline' : 'checkmark-circle-outline'}
            size={18}
            color={userData.is_active ? COLORS.error : COLORS.success}
          />
          <Text style={[styles.toggleBtnText, { color: userData.is_active ? COLORS.error : COLORS.success }]}>
            {userData.is_active ? 'Deactivate Account' : 'Activate Account'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
  headerTitle: { fontSize: FONTS.sizes.lg, fontWeight: '700', color: COLORS.text },
  content: { padding: SPACING.md, gap: SPACING.md },
  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  profileInfo: { flex: 1 },
  name: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text },
  email: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2, marginBottom: SPACING.sm },
  badgeRow: { flexDirection: 'row', gap: SPACING.sm },
  roleBadge: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: 10, paddingVertical: 3 },
  roleText: { fontSize: 11, fontWeight: '700' },
  infoCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md },
  infoLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  infoValue: { fontSize: FONTS.sizes.base, color: COLORS.text, fontWeight: '500' },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: SPACING.md },
  sectionTitle: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: SPACING.sm },
  bookingsCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  bookingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md },
  bookingService: { fontSize: FONTS.sizes.base, fontWeight: '600', color: COLORS.text },
  bookingDate: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 2 },
  statusBadge: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  toggleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: 'transparent', marginBottom: SPACING.xl,
  },
  toggleBtnText: { fontSize: FONTS.sizes.base, fontWeight: '700' },
});
