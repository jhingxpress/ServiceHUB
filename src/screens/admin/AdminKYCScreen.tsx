import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import { AdminStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

interface ProviderApp {
  id: string;
  status: string;
  created_at: string;
  is_featured: boolean;
  featured_until: string | null;
  users: { full_name: string | null; email: string; avatar_url: string | null };
  categories: { name: string; icon: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft: COLORS.textLight,
  pending_review: '#F59E0B',
  approved: COLORS.success,
  rejected: COLORS.error,
  suspended: COLORS.error,
};

export default function AdminKYCScreen() {
  const navigation = useNavigation<NavProp>();
  const [providers, setProviders] = useState<ProviderApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('providers')
      .select('id, status, created_at, is_featured, featured_until, users!providers_id_fkey(full_name, email, avatar_url), categories(name, icon)')
      .order('created_at', { ascending: false });

    if (filter === 'pending') {
      q = q.eq('status', 'pending_review');
    } else {
      q = q.in('status', ['pending_review', 'approved', 'rejected', 'suspended']);
    }

    const { data } = await q;
    setProviders((data ?? []) as unknown as ProviderApp[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const renderProvider = ({ item }: { item: ProviderApp }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ProviderDetail', { providerId: item.id })}
      activeOpacity={0.8}
    >
      <Avatar uri={item.users?.avatar_url} name={item.users?.full_name ?? item.users?.email} size={44} />
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{item.users?.full_name ?? 'Unknown'}</Text>
        <Text style={styles.cardEmail}>{item.users?.email}</Text>
        {item.categories && (
          <Text style={styles.cardDate}>{item.categories.name}</Text>
        )}
        {item.is_featured && (
          <View style={styles.featuredBadge}>
            <Ionicons name="sparkles" size={10} color={COLORS.warning} />
            <Text style={styles.featuredBadgeText}>
              Featured{item.featured_until ? ` · Until ${format(new Date(item.featured_until), 'MMM d, yyyy')}` : ''}
            </Text>
          </View>
        )}
      </View>
      <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] ?? COLORS.textLight }]}>
        <Text style={styles.statusText}>{item.status.replace('_', ' ')}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Provider Verification</Text>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'pending' && styles.filterBtnActive]}
          onPress={() => setFilter(filter === 'pending' ? 'all' : 'pending')}
        >
          <Text style={[styles.filterText, filter === 'pending' && styles.filterTextActive]}>
            {filter === 'pending' ? 'Pending Only' : 'All'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : (
        <FlatList
          data={providers}
          keyExtractor={(item) => item.id}
          renderItem={renderProvider}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="briefcase-outline"
              title="No applications"
              subtitle={filter === 'pending' ? 'No providers awaiting review.' : 'No provider applications yet.'}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  title: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text },
  filterBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  filterBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontFamily: FONTS.semiBold },
  filterTextActive: { color: COLORS.white },
  list: { padding: SPACING.md, paddingTop: 0, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small },
  cardInfo: { flex: 1 },
  cardName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  cardEmail: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  cardDate: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 2 },
  statusDot: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.full },
  statusText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.white, textTransform: 'capitalize' },
  featuredBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  featuredBadgeText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: '#92400E' },
});
