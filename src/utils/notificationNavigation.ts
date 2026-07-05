import { supabase } from '../lib/supabase';
import { Notification } from '../types';

/**
 * Resolves the correct screen to navigate to when a notification is tapped,
 * performing any additional lookups required (e.g. sender name for chat,
 * provider name for review). Safe no-op on any lookup failure — falls back
 * to the Notification Detail screen so the tap always does something.
 *
 * `navigation` is intentionally typed loosely since this helper is shared
 * between the Customer and Provider stacks (different ParamLists).
 */
export async function navigateFromNotification(
  notification: Notification,
  navigation: { navigate: (screen: string, params?: unknown) => void }
): Promise<void> {
  const data = (notification.data ?? {}) as Record<string, unknown>;
  const bookingId = typeof data.booking_id === 'string' ? data.booking_id : undefined;

  try {
    switch (notification.type) {
      case 'booking_submitted': {
        navigation.navigate('ProviderTabs', { screen: 'Requests' });
        return;
      }

      case 'booking_accepted':
      case 'booking_rejected':
      case 'booking_cancelled':
      case 'booking_in_progress':
      case 'booking_reminder': {
        if (bookingId) navigation.navigate('BookingDetail', { bookingId });
        return;
      }

      case 'booking_on_the_way':
      case 'provider_on_the_way':
      case 'booking_arrived':
      case 'provider_arrived': {
        if (!bookingId) return;
        const { data: booking } = await supabase
          .from('bookings')
          .select('latitude, longitude, provider:providers!bookings_provider_id_fkey(business_name)')
          .eq('id', bookingId)
          .maybeSingle();
        const providerName =
          (booking?.provider as unknown as { business_name: string | null } | null)?.business_name ??
          'Provider';
        navigation.navigate('LiveTracking', {
          bookingId,
          providerName,
          customerLat: booking?.latitude ?? undefined,
          customerLng: booking?.longitude ?? undefined,
        });
        return;
      }

      case 'booking_completed':
      case 'service_completed': {
        if (!bookingId) return;
        const { data: existingReview } = await supabase
          .from('reviews')
          .select('id')
          .eq('booking_id', bookingId)
          .maybeSingle();
        if (existingReview) {
          navigation.navigate('BookingDetail', { bookingId });
          return;
        }
        const { data: booking } = await supabase
          .from('bookings')
          .select('provider_id, provider:providers!bookings_provider_id_fkey(business_name)')
          .eq('id', bookingId)
          .maybeSingle();
        if (!booking?.provider_id) {
          navigation.navigate('BookingDetail', { bookingId });
          return;
        }
        const providerName =
          (booking.provider as unknown as { business_name: string | null } | null)?.business_name ??
          'Provider';
        navigation.navigate('ReviewService', {
          bookingId,
          providerId: booking.provider_id,
          providerName,
        });
        return;
      }

      case 'new_message':
      case 'chat_message': {
        if (!bookingId) return;
        const senderId = typeof data.sender_id === 'string' ? data.sender_id : undefined;
        let otherUserName = 'User';
        let otherUserAvatar: string | null = null;
        if (senderId) {
          const { data: sender } = await supabase
            .from('users')
            .select('full_name, avatar_url')
            .eq('id', senderId)
            .maybeSingle();
          otherUserName = sender?.full_name ?? 'User';
          otherUserAvatar = sender?.avatar_url ?? null;
        }
        navigation.navigate('ChatRoom', {
          bookingId,
          otherUserId: senderId ?? '',
          otherUserName,
          otherUserAvatar,
        });
        return;
      }

      case 'review_received': {
        navigation.navigate('ProviderReviews');
        return;
      }

      case 'featured_approved': {
        navigation.navigate('ProviderTabs', { screen: 'Dashboard' } as never);
        return;
      }

      case 'platform_fee_added':
      case 'platform_fee_reminder':
      case 'platform_fee_overdue':
      case 'platform_fee_paid': {
        navigation.navigate('PlatformFeeBalance');
        return;
      }

      case 'announcement':
      case 'maintenance':
      case 'policy_update':
      case 'marketing':
      case 'system':
      case 'dispute_opened':
      case 'dispute_updated':
      case 'dispute_resolved':
      case 'verification_approved':
      case 'verification_rejected':
      case 'document_approved':
      case 'document_rejected':
      case 'review_reminder':
      default: {
        navigation.navigate('NotificationDetail', { notification });
        return;
      }
    }
  } catch (err) {
    console.error('[notificationNavigation] Failed to resolve navigation:', err);
    navigation.navigate('NotificationDetail', { notification });
  }
}
