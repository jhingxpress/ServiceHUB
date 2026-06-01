-- ============================================================
-- CONSOLIDATE: Notification type constraint + message trigger type
-- Fixes two regressions introduced by 20260531180000:
--   1. Constraint dropped 'review_reminder', 'document_approved',
--      'document_rejected', 'chat_message' — all still used in app.
--   2. create_message_notification() used 'new_message' type but
--      NotificationCenterScreen icon map and TypeScript union both
--      reference 'chat_message'. Align trigger to match frontend.
-- Also drops orphaned create_chat_notification() (no trigger calls it).
-- ============================================================

-- 1. Align message notification function to 'chat_message'
CREATE OR REPLACE FUNCTION public.create_message_notification()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE
  sender_name TEXT;
BEGIN
  SELECT full_name INTO sender_name
  FROM public.users
  WHERE id = NEW.sender_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.receiver_id,
    'chat_message',
    'New Message',
    COALESCE(sender_name, 'Someone') || ' sent you a message',
    jsonb_build_object(
      'booking_id', NEW.booking_id,
      'message_id', NEW.id,
      'sender_id', NEW.sender_id,
      'sender_name', sender_name
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Drop orphaned legacy function (no trigger calls it after 20260531180000)
DROP FUNCTION IF EXISTS public.create_chat_notification();

-- 3. Final consolidated constraint — every type referenced in the app
ALTER TABLE public.notifications
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check
CHECK (type IN (
  'booking_submitted',
  'booking_accepted',
  'booking_rejected',
  'provider_on_the_way',
  'provider_arrived',
  'service_completed',
  'review_reminder',
  'document_approved',
  'document_rejected',
  'verification_approved',
  'verification_rejected',
  'chat_message',
  'review_received',
  'system'
));
