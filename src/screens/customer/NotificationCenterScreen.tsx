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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import EmptyState from '../../components/ui/EmptyState';
import { Notification } from '../../types';

const TYPE_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  booking_submitted: 'calendar-outline',
  booking_accepted: 'checkmark-circle-outline',
  booking_rejected: 'close-circle-outline',
  booking_cancelled: 'close-circle-outline',
  booking_completed: 'checkbox-outline',
  provider_on_the_way: 'navigate-outline',
  provider_arrived: 'location-outline',
  service_completed: 'checkbox-outline',
  review_received: 'star-outline',
  review_reminder: 'star-outline',
  document_approved: 'document-text-outline',
  document_rejected: 'document-outline',
  verification_approved: 'shield-checkmark-outline',
  verification_rejected: 'shield-outline',
  chat_message: 'chatbubble-outline',
  new_message: 'chatbubble-outline',
  announcement: 'megaphone-outline',
  maintenance: 'hammer-outline',
  policy_update: 'document-text-outline',
  marketing: 'pricetag-outline',
  system: 'information-circle-outline',
  dispute_opened: 'warning-outline',
  dispute_updated: 'warning-outline',
  dispute_resolved: 'checkmark-circle-outline',
};

const TYPE_EMOJIS: Record<string, string> = {
  announcement: '📢',
  maintenance: '🛠',
  policy_update: '📜',
  booking_submitted: '🔔',
  booking_accepted: '🔔',
  booking_rejected: '🔔',
  booking_cancelled: '🔔',
  booking_completed: '🔔',
  provider_on_the_way: '🔔',
  provider_arrived: '🔔',
  review_received: '⭐',
  review_reminder: '⭐',
  chat_message: '💬',
  new_message: '💬',
};

export default function NotificationCenterScreen() {
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread'>('all');

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setNotifications((data ?? []) as Notification[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    if (error) {
      console.error('[NotificationCenter] markAsRead error:', error.code, error.message);
      return;
    }
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    if (error) {
      console.error('[NotificationCenter] markAllRead error:', error.code, error.message);
      return;
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      const run = async () => {
        await fetchNotifications();   // fetch first so user sees their notifications
        await markAllRead();          // then mark all read — this is the LAST state write
      };
      run();
    }, [fetchNotifications, markAllRead])
  );

  const filtered = activeFilter === 'unread'
    ? notifications.filter((n) => !n.is_read)
    : notifications;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const renderItem = ({ item }: { item: Notification }) => {
    const isPriority = ['announcement', 'maintenance', 'policy_update'].includes(item.type);
    return (
      <TouchableOpacity
        style={[styles.card, !item.is_read && styles.cardUnread]}
        onPress={() => markAsRead(item.id)}
        activeOpacity={0.8}
      >
        <View style={[styles.iconWrap, !item.is_read && styles.iconWrapUnread]}>
          <Ionicons
            name={TYPE_ICONS[item.type] ?? 'notifications-outline'}
            size={20}
            color={!item.is_read ? COLORS.primary : COLORS.textLight}
          />
        </View>
        <View style={styles.info}>
          <View style={styles.titleRow}>
            {TYPE_EMOJIS[item.type] && (
              <Text style={styles.typeEmoji}>{TYPE_EMOJIS[item.type]}</Text>
            )}
            <Text style={[styles.title, !item.is_read && styles.titleUnread, isPriority && styles.priorityTitle]}>
              {item.title}
            </Text>
          </View>
          <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
          <Text style={styles.time}>{new Date(item.created_at).toLocaleDateString()}</Text>
        </View>
        {!item.is_read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'all' && styles.filterChipActive]}
          onPress={() => setActiveFilter('all')}
        >
          <Text style={[styles.filterText, activeFilter === 'all' && styles.filterTextActive]}>All</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'unread' && styles.filterChipActive]}
          onPress={() => setActiveFilter('unread')}
        >
          <Text style={[styles.filterText, activeFilter === 'unread' && styles.filterTextActive]}>
            Unread {unreadCount > 0 ? `(${unreadCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title="No notifications"
              subtitle={activeFilter === 'unread' ? 'You have no unread notifications.' : 'Notifications will appear here.'}
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
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONTS.sizes.xl, fontFamily: FONTS.bold, color: COLORS.text },
  markAll: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.primary },
  filterRow: { flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  filterChip: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2, borderRadius: BORDER_RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterText: { fontSize: FONTS.sizes.sm, fontFamily: FONTS.semiBold, color: COLORS.textSecondary },
  filterTextActive: { color: COLORS.white },
  list: { padding: SPACING.md, paddingTop: 0, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  cardUnread: { backgroundColor: COLORS.primaryLight + '30', borderColor: COLORS.primary + '20' },
  iconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  iconWrapUnread: { backgroundColor: COLORS.primaryLight },
  info: { flex: 1 },
  title: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.textSecondary },
  titleUnread: { fontFamily: FONTS.semiBold, color: COLORS.text },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeEmoji: { fontSize: FONTS.sizes.base },
  priorityTitle: { color: COLORS.primary },
  body: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary, marginTop: 2, lineHeight: 18 },
  time: { fontSize: FONTS.sizes.xs, color: COLORS.textLight, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
});
