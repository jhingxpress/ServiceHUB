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
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { AdminStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';

interface PendingProvider {
  id: string;
  bio: string | null;
  location: string | null;
  created_at: string;
  category: { name: string; icon: string } | null;
  users: { full_name: string | null; email: string; avatar_url: string | null };
}

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

export default function PendingProvidersScreen() {
  const navigation = useNavigation<NavProp>();
  const [providers, setProviders] = useState<PendingProvider[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = useCallback(async () => {
    const { data } = await supabase
      .from('providers')
      .select(`
        id, bio, location, created_at,
        category:categories(name, icon),
        users!providers_id_fkey(full_name, email, avatar_url)
      `)
      .eq('is_verified', false)
      .order('created_at', { ascending: true });
    setProviders((data ?? []) as unknown as PendingProvider[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const handleApprove = (id: string, name: string | null) => {
    Alert.alert('Approve Provider', `Approve ${name ?? 'this provider'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Approve',
        onPress: async () => {
          await supabase.from('providers').update({ is_verified: true }).eq('id', id);
          fetchPending();
        },
      },
    ]);
  };

  const handleReject = (id: string, name: string | null) => {
    Alert.alert('Reject Provider', `Reject and remove ${name ?? 'this provider'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reject',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('providers').delete().eq('id', id);
          fetchPending();
        },
      },
    ]);
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
                <Text style={styles.name}>{item.users?.full_name ?? 'Unknown'}</Text>
                <Text style={styles.email}>{item.users?.email}</Text>
                <View style={styles.metaRow}>
                  {item.category && (
                    <View style={styles.catBadge}>
                      <Text style={styles.catText}>{item.category.name}</Text>
                    </View>
                  )}
                  {item.location && (
                    <View style={styles.locRow}>
                      <Ionicons name="location-outline" size={12} color={COLORS.textLight} />
                      <Text style={styles.locText}>{item.location}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
            {item.bio && (
              <Text style={styles.bio} numberOfLines={3}>{item.bio}</Text>
            )}
            <Text style={styles.appliedDate}>
              Applied {format(new Date(item.created_at), 'MMM d, yyyy')}
            </Text>
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
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text },
  countBadge: {
    backgroundColor: COLORS.error, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  countText: { fontSize: FONTS.sizes.sm, color: COLORS.white, fontWeight: '700' },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, marginBottom: SPACING.sm },
  info: { flex: 1 },
  name: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  email: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 6, flexWrap: 'wrap' },
  catBadge: {
    backgroundColor: COLORS.primaryLight, borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm, paddingVertical: 2,
  },
  catText: { fontSize: FONTS.sizes.xs, color: COLORS.primary, fontWeight: '600' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  locText: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  bio: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, lineHeight: 20, marginBottom: SPACING.sm },
  appliedDate: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginBottom: SPACING.sm },
  actions: { flexDirection: 'row', gap: SPACING.sm },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.error,
  },
  rejectText: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.error },
  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.success,
  },
  approveText: { fontSize: FONTS.sizes.sm, fontWeight: '700', color: COLORS.white },
});
