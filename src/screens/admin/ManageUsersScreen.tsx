import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { AdminStackParamList } from '../../navigation/types';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';

interface UserRow {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  avatar_url: string | null;
  created_at: string;
}

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

export default function ManageUsersScreen() {
  const navigation = useNavigation<NavProp>();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filtered, setFiltered] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [roleFilter, setRoleFilter] = useState<'all' | 'customer' | 'provider' | 'admin'>('all');

  const fetchUsers = useCallback(async () => {
    console.log('[ManageUsersScreen] Fetching users...');
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, role, avatar_url, created_at')
        .order('created_at', { ascending: false });
      
      console.log('[ManageUsersScreen] Users data:', data);
      console.log('[ManageUsersScreen] Users count:', data?.length ?? 0);
      
      if (error) {
        console.error('[ManageUsersScreen] Fetch error:', error);
      }
      
      setUsers(data ?? []);
    } catch (err) {
      console.error('[ManageUsersScreen] Fetch exception:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useFocusEffect(
    useCallback(() => {
      fetchUsers();
    }, [fetchUsers])
  );

  useEffect(() => {
    let list = users;
    if (roleFilter !== 'all') list = list.filter((u) => u.role === roleFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) => u.full_name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }, [users, search, roleFilter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  };

  const ROLE_FILTERS = [
    { label: 'All', value: 'all' as const },
    { label: 'Customers', value: 'customer' as const },
    { label: 'Providers', value: 'provider' as const },
    { label: 'Admins', value: 'admin' as const },
  ];

  const ROLE_COLORS: Record<string, string> = {
    customer: COLORS.primary,
    provider: '#8B5CF6',
    admin: COLORS.error,
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Manage Users</Text>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={COLORS.textLight} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search users..."
          placeholderTextColor={COLORS.textLight}
        />
      </View>

      {/* Role filter */}
      <View style={styles.filterRow}>
        {ROLE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterTab, roleFilter === f.value && styles.filterTabActive]}
            onPress={() => setRoleFilter(f.value)}
          >
            <Text style={[styles.filterText, roleFilter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading users...</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('UserDetail', { userId: item.id })}
              activeOpacity={0.8}
            >
              <Avatar uri={item.avatar_url} name={item.full_name} size={46} />
              <View style={styles.userInfo}>
                <Text style={styles.userName} numberOfLines={1}>{item.full_name ?? 'Unknown'}</Text>
                <Text style={styles.userEmail} numberOfLines={1}>{item.email}</Text>
                <View style={styles.metaRow}>
                  <View style={[styles.rolePill, { backgroundColor: (ROLE_COLORS[item.role] ?? COLORS.textLight) + '20' }]}>
                    <Text style={[styles.roleText, { color: ROLE_COLORS[item.role] ?? COLORS.textLight }]}>
                      {item.role}
                    </Text>
                  </View>
                  <Text style={styles.joinDate}>
                    Joined {format(new Date(item.created_at), 'MMM yyyy')}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title="No users found"
              subtitle="Try adjusting your search or filters"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  topBar: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  title: { fontSize: FONTS.sizes.xxl, fontWeight: '800', color: COLORS.text },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchIcon: { marginLeft: SPACING.md },
  searchInput: { flex: 1, height: 44, paddingHorizontal: SPACING.sm, fontSize: FONTS.sizes.base, color: COLORS.text },
  filterRow: { flexDirection: 'row', paddingHorizontal: SPACING.md, gap: SPACING.xs, marginBottom: SPACING.sm },
  filterTab: {
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  filterTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontWeight: '500' },
  filterTextActive: { color: COLORS.white, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING.sm },
  loadingText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  userInfo: { flex: 1 },
  userName: { fontSize: FONTS.sizes.base, fontWeight: '700', color: COLORS.text },
  userEmail: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: 4 },
  rolePill: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: 8, paddingVertical: 2 },
  roleText: { fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  joinDate: { fontSize: 10, color: COLORS.textLight },
});
