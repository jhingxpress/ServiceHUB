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
import { AdminStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';

type Props = NativeStackScreenProps<AdminStackParamList, 'ProviderDetail'>;

interface ProviderDetail {
  id: string;
  bio: string | null;
  location: string | null;
  hourly_rate: number | null;
  experience_years: number | null;
  avg_rating: number | null;
  total_reviews: number | null;
  is_verified: boolean;
  is_available: boolean;
  users: { full_name: string | null; email: string | null; phone: string | null; avatar_url: string | null };
  category: { name: string; icon: string } | null;
  services: { id: string; name: string; price: number; is_active: boolean }[];
}

export default function ProviderDetailScreen({ route, navigation }: Props) {
  const { providerId } = route.params;
  const [provider, setProvider] = useState<ProviderDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('providers')
      .select(`
        id, bio, location, hourly_rate, experience_years, avg_rating, total_reviews, is_verified, is_available,
        users!providers_id_fkey(full_name, email, phone, avatar_url),
        category:categories(name, icon),
        services(id, name, price, is_active)
      `)
      .eq('id', providerId)
      .single()
      .then(({ data }) => {
        setProvider(data as unknown as ProviderDetail);
        setLoading(false);
      });
  }, [providerId]);

  const handleVerify = (approve: boolean) => {
    const action = approve ? 'Approve' : 'Reject';
    Alert.alert(`${action} Provider`, `Are you sure you want to ${action.toLowerCase()} this provider?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: action,
        style: approve ? 'default' : 'destructive',
        onPress: async () => {
          await supabase.from('providers').update({ is_verified: approve }).eq('id', providerId);
          setProvider((p) => p ? { ...p, is_verified: approve } : p);
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

  if (!provider) return null;

  const infoRows = [
    { icon: 'mail-outline', label: 'Email', value: provider.users?.email },
    { icon: 'call-outline', label: 'Phone', value: provider.users?.phone },
    { icon: 'location-outline', label: 'Location', value: provider.location },
    { icon: 'cash-outline', label: 'Hourly Rate', value: provider.hourly_rate ? `₱${provider.hourly_rate}/hr` : null },
    { icon: 'time-outline', label: 'Experience', value: provider.experience_years ? `${provider.experience_years} years` : null },
    { icon: 'star-outline', label: 'Rating', value: provider.avg_rating ? `${provider.avg_rating.toFixed(1)} (${provider.total_reviews} reviews)` : 'No reviews' },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Provider Detail</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Profile */}
        <View style={styles.profileCard}>
          <Avatar uri={provider.users?.avatar_url} name={provider.users?.full_name} size={72} borderColor={COLORS.primary} />
          <View style={styles.profileInfo}>
            <Text style={styles.name}>{provider.users?.full_name ?? 'Provider'}</Text>
            <Text style={styles.category}>{provider.category?.name ?? 'General Services'}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: provider.is_verified ? '#D1FAE5' : '#FEF3C7' }]}>
                <Ionicons name={provider.is_verified ? 'checkmark-circle' : 'time-outline'} size={12} color={provider.is_verified ? COLORS.success : COLORS.warning} />
                <Text style={[styles.badgeText, { color: provider.is_verified ? COLORS.success : COLORS.warning }]}>
                  {provider.is_verified ? 'Verified' : 'Pending'}
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: provider.is_available ? '#D1FAE5' : '#F1F5F9' }]}>
                <Text style={[styles.badgeText, { color: provider.is_available ? COLORS.success : COLORS.textLight }]}>
                  {provider.is_available ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Bio */}
        {provider.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bio}>{provider.bio}</Text>
          </View>
        )}

        {/* Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Information</Text>
          <View style={styles.infoCard}>
            {infoRows.filter((r) => r.value).map((row, i) => (
              <React.Fragment key={row.label}>
                <View style={styles.infoRow}>
                  <Ionicons name={row.icon as React.ComponentProps<typeof Ionicons>['name']} size={16} color={COLORS.primary} style={styles.infoIcon} />
                  <View>
                    <Text style={styles.infoLabel}>{row.label}</Text>
                    <Text style={styles.infoValue}>{row.value}</Text>
                  </View>
                </View>
                {i < infoRows.filter((r) => r.value).length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Services */}
        {provider.services?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Services ({provider.services.length})</Text>
            <View style={styles.serviceList}>
              {provider.services.map((s) => (
                <View key={s.id} style={styles.serviceRow}>
                  <View style={styles.serviceDot} />
                  <Text style={styles.serviceName}>{s.name}</Text>
                  <Text style={styles.servicePrice}>₱{s.price}</Text>
                  <View style={[styles.badge, { backgroundColor: s.is_active ? '#D1FAE5' : '#F1F5F9' }]}>
                    <Text style={[styles.badgeText, { color: s.is_active ? COLORS.success : COLORS.textLight }]}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionRow}>
          {!provider.is_verified && (
            <TouchableOpacity style={styles.approveBtn} onPress={() => handleVerify(true)}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
              <Text style={styles.approveBtnText}>Approve</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.rejectBtn, provider.is_verified && { flex: 1 }]}
            onPress={() => handleVerify(false)}
          >
            <Ionicons name="close-circle" size={18} color={COLORS.error} />
            <Text style={styles.rejectBtnText}>{provider.is_verified ? 'Revoke Verification' : 'Reject'}</Text>
          </TouchableOpacity>
        </View>
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
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  profileInfo: { flex: 1 },
  name: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text },
  category: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2, marginBottom: SPACING.sm },
  badgeRow: { flexDirection: 'row', gap: SPACING.sm },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: BORDER_RADIUS.full, paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  section: {},
  sectionTitle: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.textLight, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: SPACING.sm },
  bio: { fontSize: FONTS.sizes.base, color: COLORS.text, lineHeight: 22 },
  infoCard: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, padding: SPACING.md },
  infoIcon: { marginRight: 2 },
  infoLabel: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginBottom: 1 },
  infoValue: { fontSize: FONTS.sizes.base, color: COLORS.text, fontWeight: '500' },
  divider: { height: 1, backgroundColor: COLORS.border, marginLeft: SPACING.md + 16 + SPACING.md },
  serviceList: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small, gap: 0,
  },
  serviceRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  serviceDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
  serviceName: { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.text },
  servicePrice: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.primary },
  actionRow: { flexDirection: 'row', gap: SPACING.sm, paddingBottom: SPACING.xl },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.success, ...SHADOWS.small,
  },
  approveBtnText: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.white },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA',
  },
  rejectBtnText: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.error },
});
