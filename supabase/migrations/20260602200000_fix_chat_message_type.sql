-- ============================================================
-- FIX: Restore 'chat_message' to notifications_type_check
-- ============================================================
-- Root cause of two Sprint 2 regressions:
--   1. "Chat messages do not send"
--   2. "Accept Booking fails"
--
-- Sprint 2 migration 20260602160000 removed 'chat_message' from
-- the notifications_type_check constraint, replacing it with
-- 'new_message'. However, ALL client code references 'chat_message':
--   - NotificationCenterScreen icon map
--   - ChatRoomScreen markChatNotificationsRead query
--   - CustomerNavigator / ProviderNavigator badge exclusion filter
--   - TypeScript Notification type union
--   - create_message_notification() trigger function
--
-- Effect:
--   INSERT message → messages_create_notification trigger →
--   create_message_notification() → INSERT notification type='chat_message'
--   → CHECK constraint violation → exception → message INSERT rolls back.
--
--   For Accept Booking: the bookings_send_welcome_message trigger
--   (20260602190000) inserts a message on accept → same chain →
--   booking UPDATE rolls back → "Accept Booking fails".
--
-- Fix: Re-add 'chat_message' to the constraint alongside 'new_message'
--      (keep both so either name works going forward).
-- ============================================================

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- Booking lifecycle
    'booking_submitted',
    'booking_accepted',
    'booking_rejected',
    'booking_cancelled',
    'booking_completed',
    'booking_reminder',
    'provider_on_the_way',
    'provider_arrived',
    -- Messages (both names: 'chat_message' is used by all client code,
    -- 'new_message' was introduced in Sprint 2 migration 160000)
    'chat_message',
    'new_message',
    -- Legacy type still referenced by some triggers
    'service_completed',
    -- Reviews
    'review_received',
    'review_reminder',
    -- Provider verification
    'verification_approved',
    'verification_rejected',
    'document_approved',
    'document_rejected',
    -- Disputes
    'dispute_opened',
    'dispute_updated',
    'dispute_resolved',
    -- Admin broadcasts
    'announcement',
    'maintenance',
    'policy_update',
    'marketing',
    -- Generic
    'system'
  ));
