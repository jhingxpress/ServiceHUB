-- ============================================================
-- SPRINT 4B — NOTIFICATION TRIGGERS
-- Fix missing notifications for messages and reviews
-- ============================================================

-- 1. MESSAGE NOTIFICATIONS
-- Notify receiver when a new message is sent
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_message_notification()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.receiver_id,
    'new_message',
    'New Message',
    'You have a new message',
    jsonb_build_object('booking_id', NEW.booking_id, 'message_id', NEW.id, 'sender_id', NEW.sender_id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_create_notification ON public.messages;
CREATE TRIGGER messages_create_notification
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.create_message_notification();

-- 2. REVIEW RECEIVED NOTIFICATION
-- Notify provider when a new review is submitted
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_review_notification()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.provider_id,
    'review_received',
    'New Review Received',
    'A customer left you a ' || NEW.rating || '-star review',
    jsonb_build_object('review_id', NEW.id, 'booking_id', NEW.booking_id, 'rating', NEW.rating)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reviews_create_notification ON public.reviews;
CREATE TRIGGER reviews_create_notification
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.create_review_notification();

-- 3. UPDATE NOTIFICATION TYPE CHECK CONSTRAINT
-- Defensive: ensure new types are allowed
-- ============================================================
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
  'new_message',
  'review_received',
  'verification_approved',
  'verification_rejected',
  'system'
));
