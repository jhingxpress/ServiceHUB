import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const EAS_PROJECT_ID = '8fcfed4e-bbe6-4787-a1c1-88ae62fbf65d';
const DEVICE_ID_KEY = 'servicehub_device_id';
const PUSH_TOKEN_KEY = 'servicehub_push_token';

// ─────────────────────────────────────────────
// Foreground notification display behaviour
// ─────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ─────────────────────────────────────────────
// Android notification channels
// ─────────────────────────────────────────────
export async function setupNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Promise.all([
    Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E31C3D',
      sound: 'default',
      enableVibrate: true,
    }),
    Notifications.setNotificationChannelAsync('bookings', {
      name: 'Bookings',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync('disputes', {
      name: 'Disputes',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync('general', {
      name: 'General',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    }),
    Notifications.setNotificationChannelAsync('announcements', {
      name: 'Announcements',
      importance: Notifications.AndroidImportance.DEFAULT,
    }),
  ]);
}

// ─────────────────────────────────────────────
// Get or create a stable device ID
// ─────────────────────────────────────────────
async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// ─────────────────────────────────────────────
// Register push token for a user
// Call on login / app resume when user is authenticated
// ─────────────────────────────────────────────
export async function registerPushToken(userId: string): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('[Notifications] Simulator detected — skipping push token registration');
    return null;
  }

  await setupNotificationChannels();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Notifications] Permission denied');
    return null;
  }

  let token: string;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });
    token = tokenData.data;
  } catch (err) {
    console.error('[Notifications] Failed to get push token:', err);
    return null;
  }

  const cachedToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  const deviceId = await getDeviceId();

  // Only upsert if token changed
  if (cachedToken !== token) {
    const { error } = await supabase
      .from('user_push_tokens')
      .upsert(
        {
          user_id: userId,
          device_id: deviceId,
          platform: Platform.OS as 'ios' | 'android' | 'web',
          expo_push_token: token,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_id' }
      );

    if (error) {
      console.error('[Notifications] Failed to save push token:', error.message);
    } else {
      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
      console.log('[Notifications] Push token registered:', token.slice(0, 30) + '...');
    }
  }

  return token;
}

// ─────────────────────────────────────────────
// Remove push token for this device on logout
// ─────────────────────────────────────────────
export async function removePushToken(userId: string): Promise<void> {
  const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) return;

  const { error } = await supabase
    .from('user_push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('device_id', deviceId);

  if (error) {
    console.error('[Notifications] Failed to remove push token:', error.message);
  } else {
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    console.log('[Notifications] Push token removed for device:', deviceId);
  }
}

// ─────────────────────────────────────────────
// Notification listeners (attach in App.tsx root)
// ─────────────────────────────────────────────
export type NotificationHandler = (notification: Notifications.Notification) => void;
export type ResponseHandler = (response: Notifications.NotificationResponse) => void;

export function addForegroundListener(handler: NotificationHandler): () => void {
  const sub = Notifications.addNotificationReceivedListener(handler);
  return () => sub.remove();
}

export function addTapListener(handler: ResponseHandler): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(handler);
  return () => sub.remove();
}

// ─────────────────────────────────────────────
// Get the last notification that opened the app
// Useful for deep linking on cold start
// ─────────────────────────────────────────────
export async function getLastNotificationResponse(): Promise<Notifications.NotificationResponse | null> {
  return Notifications.getLastNotificationResponseAsync();
}

// ─────────────────────────────────────────────
// Set app badge count (iOS)
// ─────────────────────────────────────────────
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}
