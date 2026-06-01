import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import { CustomerStackParamList } from '../../navigation/types';
import { useErrorHandler } from '../../utils/errorHandler';

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;

interface ChatThread {
  bookingId: string;
  otherUserId: string;
  otherUserName: string | null;
  otherUserAvatar: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export default function ChatListScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuthStore();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const { showError } = useErrorHandler();

  const load = useCallback(async () => {
    if (!user) return;

    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        id,
        provider:providers!bookings_provider_id_fkey(
          id, business_name, profile_photo_url, business_logo
        )
      `)
      .eq('customer_id', user.id)
      .in('status', ['accepted', 'in_progress', 'completed']);

    if (bookingsError) { showError(bookingsError, 'Failed to load messages.'); setLoading(false); return; }
    if (!bookings) { setLoading(false); return; }

    const threadList: ChatThread[] = await Promise.all(
      bookings.map(async (b) => {
        const prov = (b.provider as unknown as { id: string; business_name: string | null; profile_photo_url: string | null; business_logo: string | null });
        const { data: msgs } = await supabase
          .from('messages')
          .select('content, message_type, created_at, sender_id, is_read')
          .eq('booking_id', b.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const { data: unreadData } = await supabase
          .from('messages')
          .select('id')
          .eq('booking_id', b.id)
          .eq('receiver_id', user.id)
          .eq('is_read', false);

        const lastMsg = msgs?.[0];
        const previewText =
          (lastMsg as any)?.message_type === 'image'
            ? '📷 Photo'
            : lastMsg?.content ?? null;
        return {
          bookingId: b.id,
          otherUserId: prov?.id ?? '',
          otherUserName: prov?.business_name ?? null,
          otherUserAvatar: prov?.profile_photo_url ?? prov?.business_logo ?? null,
          lastMessage: previewText,
          lastMessageAt: lastMsg?.created_at ?? null,
          unreadCount: unreadData?.length ?? 0,
        };
      })
    );

    setThreads(
      threadList
        .filter((t) => t.lastMessage)
        .sort((a, b) => {
          if (!a.lastMessageAt) return 1;
          if (!b.lastMessageAt) return -1;
          return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
        })
    );
    setLoading(false);
  }, [user, showError]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      console.log('[ChatList] focus → re-fetching threads');
      load();
    }, [load])
  );

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`customer-inbox-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        (payload) => {
          console.log('[ChatList] realtime INSERT', payload.new.id);
          load();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `receiver_id=eq.${user.id}` },
        (payload) => {
          console.log('[ChatList] realtime UPDATE', payload.new.id, 'is_read=', (payload.new as any).is_read);
          load();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[ChatList] realtime connected');
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

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
        <Text style={styles.title}>Messages</Text>
      </View>
      <FlatList
        data={threads}
        keyExtractor={(item) => item.bookingId}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.threadCard}
            onPress={() =>
              navigation.navigate('ChatRoom', {
                bookingId: item.bookingId,
                otherUserId: item.otherUserId,
                otherUserName: item.otherUserName ?? 'Provider',
                otherUserAvatar: item.otherUserAvatar,
              })
            }
            activeOpacity={0.8}
          >
            <Avatar uri={item.otherUserAvatar} name={item.otherUserName} size={52} />
            <View style={styles.threadInfo}>
              <View style={styles.threadTop}>
                <Text style={styles.threadName} numberOfLines={1}>
                  {item.otherUserName ?? 'Provider'}
                </Text>
                <View style={styles.threadRight}>
                  {item.lastMessageAt && (
                    <Text style={styles.threadTime}>
                      {formatDistanceToNow(new Date(item.lastMessageAt), { addSuffix: true })}
                    </Text>
                  )}
                  {item.unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{item.unreadCount > 9 ? '9+' : item.unreadCount}</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={styles.threadLastMsg} numberOfLines={1}>
                {item.lastMessage ?? 'Start the conversation'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title="No messages yet"
            subtitle="Chat with providers once your booking is accepted"
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  title: { fontSize: FONTS.sizes.xxl, fontFamily: FONTS.bold, color: COLORS.text },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  threadCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.small,
  },
  threadInfo: { flex: 1 },
  threadTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  threadName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text, flex: 1 },
  threadRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  threadTime: { fontSize: FONTS.sizes.xs, color: COLORS.textLight },
  unreadBadge: {
    backgroundColor: COLORS.primary, borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  unreadText: { fontSize: 11, fontFamily: FONTS.semiBold, color: COLORS.white },
  threadLastMsg: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
});
