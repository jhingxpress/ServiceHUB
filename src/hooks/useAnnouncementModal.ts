import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { Notification } from '../types';
import { PriorityType } from '../components/modals/AnnouncementModal';

const PRIORITY_TYPES: Set<string> = new Set(['announcement', 'maintenance', 'policy_update']);
const DISMISS_KEY_PREFIX = 'dismissed_announcement_';
const HOURS_24_MS = 24 * 60 * 60 * 1000;

interface ModalState {
  visible: boolean;
  title: string;
  message: string;
  type: PriorityType;
  notificationId: string;
}

async function isDismissed(notificationId: string): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(`${DISMISS_KEY_PREFIX}${notificationId}`);
    return value === 'true';
  } catch {
    return false;
  }
}

async function markDismissed(notificationId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${DISMISS_KEY_PREFIX}${notificationId}`, 'true');
  } catch (e) {
    console.error('[AnnouncementModal] Failed to save dismiss flag:', e);
  }
}

function isPriorityType(type: string): type is PriorityType {
  return PRIORITY_TYPES.has(type);
}

function isWithin24Hours(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() <= HOURS_24_MS;
}

export function useAnnouncementModal() {
  const { user } = useAuthStore();
  const [modal, setModal] = useState<ModalState>({
    visible: false,
    title: '',
    message: '',
    type: 'announcement',
    notificationId: '',
  });

  const isShowingRef = useRef(false);
  const pendingRef = useRef<Notification | null>(null);

  const showModal = useCallback((notification: Notification) => {
    if (isShowingRef.current) {
      pendingRef.current = notification;
      return;
    }
    isShowingRef.current = true;
    setModal({
      visible: true,
      title: notification.title,
      message: notification.body,
      type: notification.type as PriorityType,
      notificationId: notification.id,
    });
  }, []);

  const closeModal = useCallback(async () => {
    const { notificationId } = modal;
    if (notificationId) {
      await markDismissed(notificationId);
    }
    isShowingRef.current = false;
    setModal((prev) => ({ ...prev, visible: false }));

    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) {
      setTimeout(() => {
        isShowingRef.current = false;
        showModal(pending);
      }, 300);
    }
  }, [modal.notificationId, showModal]);

  useEffect(() => {
    if (!user) return;

    const checkUnreadPriority = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_read', false)
        .in('type', Array.from(PRIORITY_TYPES))
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[AnnouncementModal] Fetch unread error:', error.message);
        return;
      }

      const notifications = (data ?? []) as Notification[];
      for (const n of notifications) {
        if (isWithin24Hours(n.created_at) && !(await isDismissed(n.id))) {
          showModal(n);
          break;
        }
      }
    };

    checkUnreadPriority();

    const channel = supabase
      .channel(`announcements-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const n = payload.new as Notification;
          if (!isPriorityType(n.type)) return;
          if (await isDismissed(n.id)) return;
          showModal(n);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, showModal]);

  return {
    visible: modal.visible,
    title: modal.title,
    message: modal.message,
    type: modal.type,
    closeModal,
  };
}
