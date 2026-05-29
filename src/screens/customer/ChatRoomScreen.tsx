import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../../constants/theme';
import Avatar from '../../components/ui/Avatar';
import MessageInput from '../../components/chat/MessageInput';
import { CustomerStackParamList } from '../../navigation/types';

interface Message {
  id: string;
  booking_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  delivery_status: 'sent' | 'delivered' | 'read';
  created_at: string;
  sender?: { full_name: string | null; avatar_url: string | null };
}

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;
type RouteType = RouteProp<CustomerStackParamList, 'ChatRoom'>;

export default function ChatRoomScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { bookingId, otherUserId, otherUserName } = route.params;
  const { user } = useAuthStore();
  const flatListRef = useRef<FlatList>(null);
  const channelRef = useRef<any>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const markAsRead = useCallback(async () => {
    if (!user) return;
    await supabase.rpc('mark_messages_read', {
      p_booking_id: bookingId,
      p_user_id: user.id,
    });
  }, [bookingId, user]);

  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, sender:users!messages_sender_id_fkey(full_name, avatar_url)')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });
    setMessages(data ?? []);
    setLoading(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
  }, [bookingId]);

  useEffect(() => {
    fetchMessages();
    markAsRead();

    const channel = supabase
      .channel(`chat-${bookingId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `booking_id=eq.${bookingId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `booking_id=eq.${bookingId}` },
        (payload) => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === payload.new.id ? payload.new as Message : msg))
          );
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Chat realtime connected');
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [bookingId, fetchMessages, markAsRead]);

  const handleSend = async () => {
    if (!text.trim() || !user) return;
    setSending(true);
    const content = text.trim();
    setText('');
    
    const { error } = await supabase.from('messages').insert({
      booking_id: bookingId,
      sender_id: user.id,
      receiver_id: otherUserId,
      content,
      delivery_status: 'sent',
    });
    
    if (error) {
      setText(content);
      console.error('Send error:', error);
    }
    setSending(false);
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = item.sender_id === user?.id;
    const showReadStatus = isOwn && item.delivery_status === 'read';
    const showDelivered = isOwn && item.delivery_status === 'delivered';
    
    return (
      <View style={[styles.msgRow, isOwn && styles.msgRowOwn]}>
        {!isOwn && (
          <Avatar
            uri={item.sender?.avatar_url}
            name={item.sender?.full_name}
            size={28}
          />
        )}
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{item.content}</Text>
          <View style={styles.msgMeta}>
            <Text style={[styles.msgTime, isOwn && styles.msgTimeOwn]}>
              {format(new Date(item.created_at), 'HH:mm')}
            </Text>
            {showReadStatus && (
              <Ionicons name="checkmark-done" size={12} color={COLORS.primary} />
            )}
            {showDelivered && (
              <Ionicons name="checkmark" size={12} color={COLORS.textLight} />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{otherUserName}</Text>
          <Text style={styles.headerSub}>Booking conversation</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Text style={styles.emptyChatText}>Send a message to start the conversation</Text>
              </View>
            }
          />
        )}

        <MessageInput
          value={text}
          onChangeText={setText}
          onSend={handleSend}
          sending={sending}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
  },
  headerInfo: { flex: 1 },
  headerName: { fontSize: FONTS.sizes.base, fontFamily: FONTS.semiBold, color: COLORS.text },
  headerSub: { fontSize: FONTS.sizes.xs, color: COLORS.textSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: SPACING.md, gap: SPACING.sm, flexGrow: 1 },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyChatText: { color: COLORS.textLight, fontSize: FONTS.sizes.sm },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.xs },
  msgRowOwn: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '75%', borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm, paddingHorizontal: SPACING.md,
  },
  bubbleOther: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderBottomLeftRadius: 4 },
  bubbleOwn: { backgroundColor: COLORS.primary, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: FONTS.sizes.base, color: COLORS.text, lineHeight: 20 },
  bubbleTextOwn: { color: COLORS.white },
  msgMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 3 },
  msgTime: { fontSize: 10, color: COLORS.textLight },
  msgTimeOwn: { color: 'rgba(255,255,255,0.7)' },
});
