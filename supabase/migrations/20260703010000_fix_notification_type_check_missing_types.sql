-- ============================================================
-- BUG FIX: notifications_type_check missing types
-- Date: 2026-07-03
-- ============================================================
--
-- Root cause:
--   BookingRequestsScreen.tsx and ProviderBookingDetailScreen.tsx call
--   createNotification({ type: `booking_${status}` }) for every status
--   transition, producing 'booking_on_the_way', 'booking_arrived', and
--   'booking_in_progress'. None of these were ever added to the
--   notifications_type_check constraint (last updated in
--   20260602200000_fix_chat_message_type.sql), so these inserts have
--   been silently failing (createNotification swallows errors).
--
--   The booking status DB trigger (create_booking_status_notification,
--   20260602160000) already creates an in-app notification for
--   on_the_way/arrived under the 'provider_on_the_way' /
--   'provider_arrived' type names, so customers were still notified —
--   but the frontend's redundant insert for these statuses was a
--   silent no-op. This migration simply widens the constraint so the
--   check passes; it does not change any application logic.
--
--   Additionally adds 'featured_approved', which is sent via push today
--   (notify-featured-approved Edge Function) but has never had a
--   corresponding in-app notification row.
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
    'booking_on_the_way',
    'booking_arrived',
    'booking_in_progress',
    'booking_completed',
    'booking_reminder',
    'provider_on_the_way',
    'provider_arrived',
    -- Messages
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
    -- Featured provider
    'featured_approved',
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
