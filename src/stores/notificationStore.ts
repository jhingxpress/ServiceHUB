import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

interface NotificationState {
  unreadCount: number;
  isSubscribed: boolean;
  subscriptionChannel: RealtimeChannel | null;

  fetchUnreadCount: (userId: string) => Promise<void>;
  markAsRead: (notificationId: string, userId: string) => Promise<void>;
  markAllRead: (userId: string) => Promise<void>;
  subscribeToNotifications: (userId: string) => void;
  unsubscribeFromNotifications: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  unreadCount: 0,
  isSubscribed: false,
  subscriptionChannel: null,

  fetchUnreadCount: async (userId: string) => {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) {
      console.error('[NotificationStore] fetchUnreadCount error:', error.message);
      return;
    }
    set({ unreadCount: count ?? 0 });
  },

  markAsRead: async (notificationId: string, userId: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);
    if (error) {
      console.error('[NotificationStore] markAsRead error:', error.message);
      return;
    }
    set((state) => ({ unreadCount: Math.max(0, state.unreadCount - 1) }));
  },

  markAllRead: async (userId: string) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) {
      console.error('[NotificationStore] markAllRead error:', error.message);
      return;
    }
    set({ unreadCount: 0 });
  },

  subscribeToNotifications: (userId: string) => {
    const { isSubscribed, subscriptionChannel } = get();
    if (isSubscribed && subscriptionChannel) return;

    // Initial fetch
    get().fetchUnreadCount(userId);

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          get().fetchUnreadCount(userId);
        }
      )
      .subscribe();

    set({ isSubscribed: true, subscriptionChannel: channel });
  },

  unsubscribeFromNotifications: () => {
    const { subscriptionChannel } = get();
    if (subscriptionChannel) {
      supabase.removeChannel(subscriptionChannel);
    }
    set({ isSubscribed: false, subscriptionChannel: null, unreadCount: 0 });
  },
}));

/** Display helper: 0→hidden, 1-99→exact, >99→"99+" */
export function formatBadgeCount(count: number): string | null {
  if (count <= 0) return null;
  if (count > 99) return '99+';
  return String(count);
}
