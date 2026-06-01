import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { ProviderStackParamList } from '../../navigation/types';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';

type NavProp = NativeStackNavigationProp<ProviderStackParamList>;

interface ConversationThread {
  booking_id: string;
  customer_id: string;
  customer_name: string | null;
  customer_avatar: string | null;
  last_message: string | null;
  last_message_type: string | null;
  last_message_at: string | null;
  unread_count: number;
  service_name: string | null;
}

export default function ProviderMessagesScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();

  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadThreads = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .rpc('get_provider_conversations', { p_provider_id: user.id });

    if (error) {
      console.error('[ProviderMessages] RPC error:', error.code, error.message);
      setThreads([]);
    } else {
      setThreads(
        (data ?? []).map((row: any) => ({
          booking_id: row.booking_id,
          customer_id: row.customer_id,
          customer_name: row.customer_name ?? null,
          customer_avatar: row.customer_avatar ?? null,
          last_message:
            row.last_message_type === 'image'
              ? '📷 Photo'
              : (row.last_message ?? null),
          last_message_type: row.last_message_type ?? 'text',
          last_message_at: row.last_message_at ?? null,
          unread_count: Number(row.unread_count ?? 0),
          service_name: row.service_name ?? null,
        }))
      );
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useFocusEffect(
    useCallback(() => {
      console.log('[ProviderMessages] focus → re-fetching threads');
      loadThreads();
    }, [loadThreads])
  );

  useEffect(() => {
    if (!user) return;

    // Explicit UPDATE listener: catches mark_messages_read() bulk updates
    // Explicit INSERT listener: catches new messages sent TO provider
    const channel = supabase
      .channel(`provider-inbox-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        (payload) => {
          console.log('[ProviderMessages] realtime UPDATE', payload.new.id, 'is_read=', (payload.new as any).is_read);
          loadThreads();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        (payload) => {
          console.log('[ProviderMessages] realtime INSERT', payload.new.id);
          loadThreads();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${user.id}` },
        (payload) => {
          console.log('[ProviderMessages] realtime INSERT (own send)', payload.new.id);
          loadThreads();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[ProviderMessages] realtime connected');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadThreads]);

  const bookingRef = (id: string) =>
    `#${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;

  const renderItem = ({ item }: { item: ConversationThread }) => {
    const hasUnread = item.unread_count > 0;
    return (
      <TouchableOpacity
        style={[styles.threadCard, hasUnread && styles.threadCardUnread]}
        activeOpacity={0.8}
        onPress={() =>
          navigation.getParent()?.navigate('ChatRoom', {
            bookingId: item.booking_id,
            otherUserId: item.customer_id,
            otherUserName: item.customer_name ?? 'Customer',
            otherUserAvatar: item.customer_avatar,
          })
        }
      >
        <Avatar
          uri={item.customer_avatar}
          name={item.customer_name ?? 'Customer'}
          size={52}
        />
        <View style={styles.threadInfo}>
          <View style={styles.threadTop}>
            <Text style={styles.threadName} numberOfLines={1}>
              {item.customer_name ?? 'Customer'}
            </Text>
            <View style={styles.threadRight}>
              {item.last_message_at && (
                <Text style={styles.threadTime}>
                  {formatDistanceToNow(new Date(item.last_message_at), {
                    addSuffix: true,
                  })}
                </Text>
              )}
              {hasUnread && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>
                    {item.unread_count > 9 ? '9+' : item.unread_count}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.bookingRef}>
              {bookingRef(item.booking_id)}
            </Text>
            {item.service_name && (
              <>
                <Text style={styles.dot}>·</Text>
                <Text style={styles.serviceName} numberOfLines={1}>
                  {item.service_name}
                </Text>
              </>
            )}
          </View>

          <Text
            style={[styles.threadLastMsg, hasUnread && styles.threadLastMsgUnread]}
            numberOfLines={1}
          >
            {item.last_message ?? 'Start the conversation'}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Messages</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Messages</Text>
      </View>

      <FlatList
        data={threads}
        keyExtractor={(item) => item.booking_id}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadThreads();
            }}
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title="No messages yet"
            subtitle="Chat with customers once a booking is accepted"
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
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  title: { fontSize: FONTS.sizes.xxl, fontFamily: FONTS.bold, color: COLORS.text },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  threadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },
  threadCardUnread: {
    borderColor: COLORS.primary + '50',
    backgroundColor: COLORS.primaryLight + '30',
  },
  threadInfo: { flex: 1 },
  threadTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  threadName: {
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    flex: 1,
  },
  threadRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  threadTime: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  unreadBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { fontSize: 11, fontFamily: FONTS.semiBold, color: COLORS.white },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  bookingRef: {
    fontSize: FONTS.sizes.xs,
    fontFamily: FONTS.semiBold,
    color: COLORS.primary,
  },
  dot: { fontSize: FONTS.sizes.xs, color: COLORS.textMuted },
  serviceName: {
    fontSize: FONTS.sizes.xs,
    color: COLORS.textSecondary,
    maxWidth: 140,
  },
  threadLastMsg: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  threadLastMsgUnread: {
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
  },
});
