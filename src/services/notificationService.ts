import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import Constants from 'expo-constants';

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
  console.log('[PUSH AUDIT] registerPushToken called');
  console.log('[PUSH AUDIT] userId', userId);

  const env = Constants.expoConfig?.extra?.eas?.projectId ?? 'unknown';
  const appOwnership = Constants.appOwnership ?? 'unknown';
  const executionEnv = Constants.executionEnvironment ?? 'unknown';
  console.log('[PUSH] executionEnvironment:', executionEnv, '| appOwnership:', appOwnership, '| projectId:', env);

  if (!Device.isDevice) {
    console.log('[PUSH] Simulator detected — skipping push token registration');
    return null;
  }
  console.log('[PUSH] Device.isDevice = true');

  await setupNotificationChannels();

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  console.log('[PUSH AUDIT] existingStatus', existingStatus);
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    console.log('[PUSH] Requesting notification permissions...');
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    console.log('[PUSH AUDIT] finalStatus', finalStatus);
  }

  if (finalStatus !== 'granted') {
    console.log('[PUSH] Permission denied — aborting token registration');
    return null;
  }

  let token: string;
  try {
    console.log('[PUSH] Calling getExpoPushTokenAsync...');
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });
    token = tokenData.data;
    console.log('[PUSH AUDIT] token', token);
  } catch (err) {
    console.error('[PUSH] Failed to get push token:', err instanceof Error ? err.message : String(err));
    return null;
  }

  const cachedToken = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
  const deviceId = await getDeviceId();
  console.log('[PUSH] cachedToken:', cachedToken, '| newToken:', token, '| deviceId:', deviceId);

  // Only upsert if token changed
  if (cachedToken !== token) {
    console.log('[PUSH] Saving token to DB');
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
      console.error('[PUSH] Failed to save push token to DB:', error.message);
    } else {
      console.log('[PUSH] Token saved to DB successfully');
      await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    }
  } else {
    console.log('[PUSH] Token unchanged — skipping DB upsert');
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
    console.error('[Notifications] Failed to remove push token');
  } else {
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
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

// ─────────────────────────────────────────────
// Create a notification in the database
// Safe error handling - does not throw, only logs
// ─────────────────────────────────────────────
export async function createNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data ?? {},
    });
    if (error) {
      console.error('[Notification] Failed to create notification:', error.message);
    }
  } catch (err) {
    console.error('[Notification] Unexpected error creating notification:', err instanceof Error ? err.message : String(err));
  }
}
