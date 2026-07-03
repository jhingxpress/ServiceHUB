import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { AdminStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import { canReviewProviders } from '../../utils/roleUtils';
import { logStaffAction } from '../../services/staffAuditService';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import { useAuthStore } from '../../stores/authStore';

interface PendingProvider {
  id: string;
  business_name: string | null;
  city: string | null;
  province: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  category: { name: string; icon: string } | null;
  users: { full_name: string | null; email: string; avatar_url: string | null };
  provider_documents?: { id: string }[];
}

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

export default function PendingProvidersScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [providers, setProviders] = useState<PendingProvider[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('providers')
        .select(`
          id, business_name, city, province, status, created_at, updated_at,
          category:categories(name, icon),
          users!providers_id_fkey(full_name, email, avatar_url),
          provider_documents(id)
        `)
        .eq('status', 'pending_review')
        .order('updated_at', { ascending: true });

      if (error) throw error;
      setProviders((data ?? []) as unknown as PendingProvider[]);
    } catch (err) {
      console.error('[PendingProvidersScreen] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  useFocusEffect(
    useCallback(() => {
      fetchPending();
    }, [fetchPending])
  );

  const handleApprove = (id: string, name: string | null) => {
    Alert.alert('Approve Provider', `Approve ${name ?? 'this provider'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          try {
            const { error: updateError } = await supabase
              .from('providers')
              .update({
                status: 'approved' as const,
                is_verified: true,
                approved_at: new Date().toISOString(),
                approved_by: user?.id ?? null,
              })
              .eq('id', id);

            if (updateError) {
              Alert.alert('Error', `Failed to approve provider: ${updateError.message}`);
              return;
            }

            await supabase.from('provider_verification_logs').insert({
              provider_id: id,
              action: 'approved',
              performed_by: user?.id ?? null,
            });
            await logStaffAction({
              action: 'provider_approved',
              targetTable: 'providers',
              targetRecordId: id,
              notes: `Approved provider ${name ?? id}`,
            });

            await fetchPending();
          } catch (err) {
            Alert.alert('Error', 'Failed to approve provider');
          }
        },
      },
    ]);
  };

  const handleReject = (id: string, name: string | null) => {
    Alert.prompt(
      'Reject Provider',
      `Enter rejection reason for ${name ?? 'this provider'}:`,
      async (reason) => {
        if (!reason?.trim()) return;

        try {
          const { error: updateError } = await supabase
            .from('providers')
            .update({
              status: 'rejected' as const,
              is_verified: false,
              rejected_by: user?.id ?? null,
              rejection_reason: reason.trim(),
            })
            .eq('id', id);

          if (updateError) {
            Alert.alert('Error', `Failed to reject provider: ${updateError.message}`);
            return;
          }

          await supabase.from('provider_verification_logs').insert({
            provider_id: id,
            action: 'rejected',
            performed_by: user?.id ?? null,
            notes: reason.trim(),
          });
          await logStaffAction({
            action: 'provider_rejected',
            targetTable: 'providers',
            targetRecordId: id,
            notes: `Rejected provider ${name ?? id}: ${reason.trim()}`,
          });

          await fetchPending();
        } catch (err) {
          Alert.alert('Error', 'Failed to reject provider');
        }
      },
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
      <View style={styles.topBar}>
        <Text style={styles.title}>Pending Providers</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{providers.length}</Text>
        </View>
      </View>
      <FlatList
        data={providers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('ProviderDetail', { providerId: item.id })}
            activeOpacity={0.8}
          >
            <View style={styles.cardTop}>
              <Avatar uri={item.users?.avatar_url} name={item.users?.full_name} size={52} />
              <View style={styles.info}>
                <Text style={styles.name}>{item.business_name ?? item.users?.full_name ?? 'Unknown'}</Text>
                <Text style={styles.email}>{item.users?.full_name} · {item.users?.email}</Text>
                <View style={styles.metaRow}>
                  {item.category && (
                    <View style={styles.catBadge}>
                      <Text style={styles.catText}>{item.category.name}</Text>
                    </View>
                  )}
                  {(item.city || item.province) && (
                    <View style={styles.locRow}>
                      <Ionicons name="location-outline" size={12} color={COLORS.textLight} />
                      <Text style={styles.locText}>{[item.city, item.province].filter(Boolean).join(', ')}</Text>
                    </View>
                  )}
                  <View style={[styles.docBadge, { backgroundColor: (item.provider_documents?.length ?? 0) > 0 ? COLORS.successLight : COLORS.errorLight }]}>
                    <Ionicons name="document-outline" size={10} color={(item.provider_documents?.length ?? 0) > 0 ? COLORS.success : COLORS.error} />
                    <Text style={[styles.docBadgeText, { color: (item.provider_documents?.length ?? 0) > 0 ? COLORS.success : COLORS.error }]}>
                      {(item.provider_documents?.length ?? 0)} docs
                    </Text>
                  </View>
                </View>
              </View>
            </View>
            <Text style={styles.appliedDate}>
              Submitted {format(new Date(item.updated_at), 'MMM d, yyyy h:mm a')}
            </Text>
            {canReviewProviders(user?.role) && (
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => handleReject(item.id, item.users?.full_name)}
                >
                  <Ionicons name="close" size={16} color={COLORS.error} />
                  <Text style={styles.rejectText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => handleApprove(item.id, item.users?.full_name)}
                >
                  <Ionicons name="checkmark" size={16} color={COLORS.white} />
                  <Text style={styles.approveText}>Approve</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="shield-checkmark-outline"
            title="No pending providers"
            subtitle="All provider applications have been reviewed"
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm,
  },
  title: { fontSize: FONTS.sizes.xxl, fontFamily: FONTS.bold, color: COLORS.text },
  countBadge: {
    backgroundColor: COLORS.error, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  countText: { fontSize: FONTS.sizes.sm, color: COLORS.white, fontFamily: FONTS.semiBold },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, marginBottom: SPACING.sm },
  info: { flex: 1 },
  name: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  email: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 6, flexWrap: 'wrap' },
  catBadge: {
    backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 2,
  },
  catText: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontFamily: FONTS.semiBold },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  locText: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  docBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: BORDER_RADIUS.full, paddingHorizontal: 6, paddingVertical: 2 },
  docBadgeText: { fontSize: 10, fontFamily: FONTS.semiBold },
  bio: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20, marginBottom: SPACING.sm },
  appliedDate: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginBottom: SPACING.sm },
  actions: { flexDirection: 'row', gap: SPACING.sm },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.error,
  },
  rejectText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.error },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.success,
  },
  approveText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.white },
});
