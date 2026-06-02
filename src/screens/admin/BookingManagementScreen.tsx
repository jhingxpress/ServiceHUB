import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { AdminStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';

type NavProp = NativeStackNavigationProp<AdminStackParamList>;

type BookingStatus = 'all' | 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

interface BookingItem {
  id: string;
  status: BookingStatus;
  scheduled_date: string;
  scheduled_time: string;
  location: string;
  created_at: string;
  customer: { full_name: string | null; avatar_url: string | null };
  provider_user: { full_name: string | null; avatar_url: string | null } | null;
  service: { name: string; price: number } | null;
}

const STATUS_TABS: { key: BookingStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'in_progress', label: 'Active' },
  { key: 'completed', label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E' },
  accepted: { bg: '#DBEAFE', text: '#1E40AF' },
  in_progress: { bg: '#EDE9FE', text: '#4C1D95' },
  completed: { bg: '#D1FAE5', text: '#065F46' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
  disputed: { bg: '#FFEDD5', text: '#9A3412' },
};

export default function BookingManagementScreen() {
  const navigation = useNavigation<NavProp>();
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [filtered, setFiltered] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<BookingStatus>('all');

  const fetchBookings = useCallback(async () => {
    const { data } = await supabase
      .from('bookings')
      .select(`
        id, status, scheduled_date, scheduled_time, location, created_at,
        customer:users!bookings_customer_id_fkey(full_name, avatar_url),
        provider_user:providers!bookings_provider_id_fkey(users!providers_id_fkey(full_name, avatar_url)),
        service:services(name, price)
      `)
      .order('created_at', { ascending: false });
    setBookings((data ?? []) as unknown as BookingItem[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  useEffect(() => {
    let list = bookings;
    if (activeTab !== 'all') {
      list = list.filter((b) => b.status === activeTab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (b) =>
          b.customer?.full_name?.toLowerCase().includes(q) ||
          b.service?.name?.toLowerCase().includes(q) ||
          b.location?.toLowerCase().includes(q)
      );
    }
    setFiltered(list);
  }, [bookings, activeTab, search]);

  const handleCancel = (bookingId: string) => {
    Alert.alert('Cancel Booking', 'Admin cancel this booking?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId);
          setBookings((prev) =>
            prev.map((b) => b.id === bookingId ? { ...b, status: 'cancelled' as BookingStatus } : b)
          );
        },
      },
    ]);
  };

  const renderBooking = ({ item }: { item: BookingItem }) => {
    const colors = STATUS_STYLE[item.status] ?? { bg: '#F1F5F9', text: COLORS.textSecondary };
    const cust = item.customer as unknown as { full_name: string | null; avatar_url: string | null };

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('BookingDetail', { bookingId: item.id })}
        activeOpacity={0.8}
      >
        <View style={styles.cardTop}>
          <Avatar uri={cust?.avatar_url} name={cust?.full_name} size={44} />
          <View style={styles.cardInfo}>
            <Text style={styles.custName}>{cust?.full_name ?? 'Unknown'}</Text>
            <Text style={styles.serviceName}>{item.service?.name ?? 'Service'}</Text>
            <Text style={styles.dateText}>
              {format(new Date(item.scheduled_date), 'MMM d')} · {item.scheduled_time?.slice(0, 5)}
            </Text>
          </View>
          <View>
            <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
              <Text style={[styles.statusText, { color: colors.text }]}>
                {item.status.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
              </Text>
            </View>
            {item.service?.price && (
              <Text style={styles.price}>₱{item.service.price}</Text>
            )}
          </View>
        </View>
        {item.location && (
          <View style={styles.locRow}>
            <Ionicons name="location-outline" size={12} color={COLORS.textLight} />
            <Text style={styles.locText} numberOfLines={1}>{item.location}</Text>
          </View>
        )}
        {item.status !== 'cancelled' && item.status !== 'completed' && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={(e) => { e.stopPropagation(); handleCancel(item.id); }}
          >
            <Ionicons name="close-circle-outline" size={14} color={COLORS.error} />
            <Text style={styles.cancelText}>Cancel Booking</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>Bookings</Text>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={17} color={COLORS.textLight} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by customer, service..."
          placeholderTextColor={COLORS.textLight}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={17} color={COLORS.textLight} />
          </TouchableOpacity>
        )}
      </View>

      {/* Status tabs */}
      <FlatList
        horizontal
        data={STATUS_TABS}
        keyExtractor={(t) => t.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
        renderItem={({ item: tab }) => (
          <TouchableOpacity
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      <View style={styles.resultRow}>
        <Text style={styles.resultCount}>{filtered.length} booking{filtered.length !== 1 ? 's' : ''}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderBooking}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchBookings(); }}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={COLORS.border} />
              <Text style={styles.emptyTitle}>No bookings found</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  title: { fontSize: FONTS.sizes.xxl, fontFamily: FONTS.bold, color: COLORS.text, paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.md, borderWidth: 1.5, borderColor: COLORS.border, height: 44,
  },
  searchInput: { flex: 1, fontSize: FONTS.sizes.base, color: COLORS.text },
  tabsRow: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm, gap: SPACING.xs },
  tab: {
    paddingHorizontal: SPACING.md, paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  tabTextActive: { color: COLORS.white, fontFamily: FONTS.semiBold },
  resultRow: { paddingHorizontal: SPACING.md, marginBottom: SPACING.xs },
  resultCount: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary, fontFamily: FONTS.medium },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm, marginBottom: SPACING.xs },
  cardInfo: { flex: 1 },
  custName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  serviceName: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 1 },
  dateText: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 2 },
  statusBadge: { borderRadius: BORDER_RADIUS.full, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-end', marginBottom: 4 },
  statusText: { fontSize: 10, fontFamily: FONTS.semiBold },
  price: { fontSize: FONTS.sizes.base, fontFamily: FONTS.bold, color: COLORS.primary, textAlign: 'right' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: SPACING.xs },
  locText: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, flex: 1 },
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 7, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', marginTop: SPACING.xs,
  },
  cancelText: { fontSize: FONTS.sizes.xs, fontFamily: FONTS.semiBold, color: COLORS.error },
  emptyState: { alignItems: 'center', paddingTop: SPACING.xxl, gap: SPACING.sm },
  emptyTitle: { fontSize: FONTS.sizes.lg, fontFamily: FONTS.semiBold, color: COLORS.text },
});
