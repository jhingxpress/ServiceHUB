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
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import ImageView from 'react-native-image-viewing';
import { supabase } from '../../lib/supabase';
import { validateImagePickerAsset } from '../../utils/fileValidation';
import { uploadImageToStorage } from '../../utils/storageUpload';
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
  content: string | null;
  image_url: string | null;
  message_type: 'text' | 'image';
  is_read: boolean;
  created_at: string;
  sender?: { full_name: string | null; avatar_url: string | null };
}

type NavProp = NativeStackNavigationProp<CustomerStackParamList>;
type RouteType = RouteProp<CustomerStackParamList, 'ChatRoom'>;

export default function ChatRoomScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const { bookingId, otherUserId, otherUserName, otherUserAvatar } = route.params;
  const { user } = useAuthStore();
  const flatListRef = useRef<FlatList>(null);
  const channelRef = useRef<any>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(true);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerImages, setViewerImages] = useState<{ uri: string }[]>([]);

  const markAsRead = useCallback(async () => {
    if (!user) return;
    console.log('[ChatRoom] markAsRead START bookingId=', bookingId, 'userId=', user.id);
    const { error } = await supabase
      .rpc('mark_messages_read', {
        p_booking_id: bookingId,
        p_user_id: user.id,
      });
    if (error) {
      console.error('[ChatRoom] markAsRead error:', error.code, error.message);
    } else {
      console.log('[ChatRoom] markAsRead SUCCESS bookingId=', bookingId);
    }
  }, [bookingId, user]);

  const markChatNotificationsRead = useCallback(async () => {
    if (!user) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('type', 'chat_message')
      .eq('is_read', false)
      .filter('data->>booking_id', 'eq', bookingId);
    if (error) console.error('[ChatRoom] markChatNotificationsRead error:', error.message);
  }, [bookingId, user]);

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('id, booking_id, sender_id, receiver_id, content, image_url, message_type, is_read, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Chat fetch error:', error);
    }
    setMessages((data ?? []) as Message[]);
    setLoading(false);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
  }, [bookingId]);

  useEffect(() => {
    fetchMessages();
    markAsRead();
    markChatNotificationsRead();

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

  useFocusEffect(
    useCallback(() => {
      console.log('[ChatRoom] focus → re-marking as read');
      markAsRead();
      markChatNotificationsRead();
    }, [markAsRead, markChatNotificationsRead])
  );

  const handleSend = async () => {
    if (!text.trim() || !user) return;
    const content = text.trim();

    setText('');

    // Optimistic update — show immediately
    const optimisticMsg: Message = {
      id: `temp-${Date.now()}`,
      booking_id: bookingId,
      sender_id: user.id,
      receiver_id: otherUserId,
      content,
      image_url: null,
      message_type: 'text',
      is_read: false,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

    setSending(true);
    const payload = {
      booking_id: bookingId,
      sender_id: user.id,
      receiver_id: otherUserId,
      content,
      message_type: 'text',
    };
    console.log('[ChatRoom] Sending payload:', payload);
    const { data, error } = await supabase
      .from('messages')
      .insert(payload)
      .select('id, booking_id, sender_id, receiver_id, content, image_url, message_type, is_read, created_at')
      .single();

    if (error) {
      setText(content);
      // Revert optimistic message
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      console.error('[ChatRoom] Send error', { code: error.code, message: error.message, details: error.details, hint: error.hint });
    } else if (data) {
      // Replace optimistic with real message
      setMessages((prev) => prev.map((m) => (m.id === optimisticMsg.id ? (data as Message) : m)));
      console.log('[ChatRoom] Send success', { id: data.id, booking_id: data.booking_id, created_at: data.created_at });
    }
    setSending(false);
  };

  const openImageViewer = (imageUrl: string, allImageUrls: string[]) => {
    const idx = allImageUrls.indexOf(imageUrl);
    setViewerImages(allImageUrls.map((uri) => ({ uri })));
    setViewerIndex(idx >= 0 ? idx : 0);
    setViewerVisible(true);
  };

  const pickImage = async (source: 'camera' | 'gallery') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission denied', 'We need access to send photos.');
      return;
    }

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.7,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.7,
          });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      const validation = validateImagePickerAsset(asset, 'chat-media');
      if (!validation.valid) {
        Alert.alert('Invalid Image', validation.error);
        return;
      }
      await uploadAndSendImage(asset.uri);
    }
  };

  const uploadAndSendImage = async (uri: string) => {
    if (!user) return;

    setUploadingImage(true);

    const tempId = `temp-img-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      booking_id: bookingId,
      sender_id: user.id,
      receiver_id: otherUserId,
      content: null,
      image_url: uri,
      message_type: 'image',
      is_read: false,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const cleanUri = uri.split('?')[0];
      const rawExt = cleanUri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const fileExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(rawExt)
        ? rawExt
        : 'jpg';
      const mimeType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${bookingId}/${fileName}`;

      const publicUrl = await uploadImageToStorage(
        'chat-media',
        filePath,
        uri,
        mimeType
      );

      const { data: insertData, error: insertError } = await supabase
        .from('messages')
        .insert({
          booking_id: bookingId,
          sender_id: user.id,
          receiver_id: otherUserId,
          content: null,
          image_url: publicUrl,
          message_type: 'image',
        })
        .select('id, booking_id, sender_id, receiver_id, content, image_url, message_type, is_read, created_at')
        .single();

      if (insertError) throw insertError;

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...insertData, sender: m.sender } : m))
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Image upload failed';
      Alert.alert('Upload Failed', message);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleAttachment = () => {
    Alert.alert(
      'Send Photo',
      undefined,
      [
        { text: 'Camera', onPress: () => pickImage('camera') },
        { text: 'Gallery', onPress: () => pickImage('gallery') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isOwn = item.sender_id === user?.id;
    const isImage = item.message_type === 'image';
    const allImageUrls = messages
      .filter((m) => m.message_type === 'image' && m.image_url)
      .map((m) => m.image_url!);

    return (
      <View style={[styles.msgRow, isOwn && styles.msgRowOwn]}>
        {!isOwn && (
          <Avatar
            uri={otherUserAvatar ?? null}
            name={otherUserName}
            size={28}
          />
        )}
        <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
          {isImage && item.image_url ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => openImageViewer(item.image_url!, allImageUrls)}
            >
              <Image
                source={{ uri: item.image_url }}
                style={styles.chatImage}
                resizeMode="cover"
                onLoad={() =>
                  console.log('[ChatRoom] Image loaded:', item.image_url)
                }
                onError={(e) =>
                  console.log('[ChatRoom] Image failed:', item.image_url, e.nativeEvent)
                }
              />
            </TouchableOpacity>
          ) : (
            <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>{item.content}</Text>
          )}
          <View style={styles.msgMeta}>
            <Text style={[styles.msgTime, isOwn && styles.msgTimeOwn]}>
              {format(new Date(item.created_at), 'HH:mm')}
            </Text>
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

        {uploadingImage && (
          <View style={styles.uploadOverlay}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.uploadText}>Sending photo…</Text>
          </View>
        )}
        <MessageInput
          value={text}
          onChangeText={setText}
          onSend={handleSend}
          onAttachment={handleAttachment}
          sending={sending || uploadingImage}
        />
      </KeyboardAvoidingView>
        <ImageView
          images={viewerImages}
          imageIndex={viewerIndex}
          visible={viewerVisible}
          onRequestClose={() => setViewerVisible(false)}
          swipeToCloseEnabled
          doubleTapToZoomEnabled
          HeaderComponent={({ imageIndex }) => (
            <View style={styles.imageViewerHeader}>
              <TouchableOpacity
                style={styles.imageViewerCloseBtn}
                onPress={() => setViewerVisible(false)}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.imageViewerCounter}>
                {imageIndex + 1} / {viewerImages.length}
              </Text>
            </View>
          )}
        />
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
  chatImage: {
    width: 200,
    height: 200,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
  },
  uploadOverlay: {
    position: 'absolute',
    bottom: 70,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    flexDirection: 'row',
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    zIndex: 10,
  },
  uploadText: { fontSize: FONTS.sizes.sm, color: COLORS.textSecondary },
  imageViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    width: '100%',
  },
  imageViewerCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewerCounter: {
    fontSize: FONTS.sizes.base,
    color: '#fff',
    fontFamily: FONTS.semiBold,
  },
});
