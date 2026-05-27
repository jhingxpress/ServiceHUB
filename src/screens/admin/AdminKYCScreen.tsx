import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';
import { AdminStackParamList } from '../../navigation/types';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

type KYCTab = 'customers' | 'providers';

interface KYCUser {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  kyc_status: string;
  kyc_documents: Record<string, string>;
  kyc_rejection_reason: string | null;
  created_at: string;
}

interface KYCProvider {
  id: string;
  kyc_status: string;
  kyc_documents: Record<string, string>;
  created_at: string;
  users: { full_name: string | null; email: string; avatar_url: string | null };
}

const STATUS_COLORS: Record<string, string> = {
  not_submitted: COLORS.textLight,
  pending: '#F59E0B',
  approved: COLORS.success,
  rejected: COLORS.error,
};

export default function AdminKYCScreen() {
  const navigation = useNavigation<NavProp>();
  const [tab, setTab] = useState<KYCTab>('customers');
  const [customers, setCustomers] = useState<KYCUser[]>([]);
  const [providers, setProviders] = useState<KYCProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [custRes, provRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, full_name, email, avatar_url, kyc_status, kyc_documents, kyc_rejection_reason, created_at')
        .eq('role', 'customer')
        .neq('kyc_status', 'not_submitted')
        .order('created_at', { ascending: false }),
      supabase
        .from('providers')
        .select('id, kyc_status, kyc_documents, created_at, users!providers_id_fkey(full_name, email, avatar_url)')
        .neq('kyc_status', 'not_submitted')
        .order('created_at', { ascending: false }),
    ]);
    setCustomers((custRes.data ?? []) as KYCUser[]);
    setProviders((provRes.data ?? []) as unknown as KYCProvider[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredCustomers = filter === 'pending' ? customers.filter((c) => c.kyc_status === 'pending') : customers;
  const filteredProviders = filter === 'pending' ? providers.filter((p) => p.kyc_status === 'pending') : providers;

  const renderCustomer = ({ item }: { item: KYCUser }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('CustomerKYCDetail', { userId: item.id })}
      activeOpacity={0.8}
    >
      <Avatar uri={item.avatar_url} name={item.full_name ?? item.email} size={44} />
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{item.full_name ?? 'Unknown'}</Text>
        <Text style={styles.cardEmail}>{item.email}</Text>
        <Text style={styles.cardDate}>Submitted {format(new Date(item.created_at), 'MMM d, yyyy')}</Text>
      </View>
      <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.kyc_status] ?? COLORS.textLight }]}>
        <Text style={styles.statusText}>{item.kyc_status}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderProvider = ({ item }: { item: KYCProvider }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ProviderDetail', { providerId: item.id })}
      activeOpacity={0.8}
    >
      <Avatar uri={item.users?.avatar_url} name={item.users?.full_name ?? item.users?.email} size={44} />
      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{item.users?.full_name ?? 'Unknown'}</Text>
        <Text style={styles.cardEmail}>{item.users?.email}</Text>
        <Text style={styles.cardDate}>Applied {format(new Date(item.created_at), 'MMM d, yyyy')}</Text>
      </View>
      <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.kyc_status] ?? COLORS.textLight }]}>
        <Text style={styles.statusText}>{item.kyc_status}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>KYC Review</Text>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'pending' && styles.filterBtnActive]}
          onPress={() => setFilter(filter === 'pending' ? 'all' : 'pending')}
        >
          <Text style={[styles.filterText, filter === 'pending' && styles.filterTextActive]}>
            {filter === 'pending' ? 'Pending Only' : 'All'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'customers' && styles.tabActive]}
          onPress={() => setTab('customers')}
        >
          <Ionicons name="people-outline" size={16} color={tab === 'customers' ? COLORS.primary : COLORS.textSecondary} />
          <Text style={[styles.tabText, tab === 'customers' && styles.tabTextActive]}>
            Customers {filteredCustomers.length > 0 ? `(${filteredCustomers.length})` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'providers' && styles.tabActive]}
          onPress={() => setTab('providers')}
        >
          <Ionicons name="briefcase-outline" size={16} color={tab === 'providers' ? COLORS.primary : COLORS.textSecondary} />
          <Text style={[styles.tabText, tab === 'providers' && styles.tabTextActive]}>
            Providers {filteredProviders.length > 0 ? `(${filteredProviders.length})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : tab === 'customers' ? (
        <FlatList
          data={filteredCustomers}
          keyExtractor={(item) => item.id}
          renderItem={renderCustomer}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="shield-checkmark-outline"
              title="No pending KYC"
              subtitle={filter === 'pending' ? 'No customers awaiting KYC review.' : 'No customer KYC submissions yet.'}
            />
          }
        />
      ) : (
        <FlatList
          data={filteredProviders}
          keyExtractor={(item) => item.id}
          renderItem={renderProvider}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="briefcase-outline"
              title="No pending applications"
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
  title: { fontSize: FONTS.sizes.xl, fontWeight: '800', color: COLORS.text },
  filterBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: BORDER_RADIUS.full, borderWidth: 1, borderColor: COLORS.border },
  filterBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, fontWeight: '600' },
  filterTextActive: { color: COLORS.white },
  tabs: { flexDirection: 'row', marginHorizontal: SPACING.md, marginBottom: SPACING.md, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg, padding: 4, borderWidth: 1, borderColor: COLORS.border },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: SPACING.sm, borderRadius: BORDER_RADIUS.md },
  tabActive: { backgroundColor: COLORS.white, ...SHADOWS.small },
  tabText: { fontSize: FONTS.sizes.sm, fontWeight: '600', color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.primary },
  list: { padding: SPACING.md, paddingTop: 0, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small },
  cardInfo: { flex: 1 },
  cardName: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  cardEmail: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  cardDate: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 2 },
  statusDot: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: BORDER_RADIUS.full },
  statusText: { fontSize: FONTS.sizes.xs, fontWeight: '700', color: COLORS.white, textTransform: 'capitalize' },
});
