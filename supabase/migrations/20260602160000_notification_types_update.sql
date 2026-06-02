-- ============================================================
-- Notification Types — Expand constraint + delivery tracking
-- ============================================================

-- 1. Drop old constraint and re-add with all types
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
    -- Messages
    'new_message',
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

-- 2. Add push_delivered column for tracking delivery status
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_delivered BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_delivered_at TIMESTAMPTZ;

-- 3. Index for fast unread counts (already read queries)
CREATE INDEX IF NOT EXISTS idx_notifications_user_read
  ON public.notifications (user_id, is_read)
  WHERE is_read = false;

-- 4. Booking cancelled / completed triggers (supplement existing ones)
CREATE OR REPLACE FUNCTION public.create_booking_status_notification()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE
  v_customer_id UUID;
  v_provider_id UUID;
  v_service_name TEXT;
  v_notif_type TEXT;
  v_customer_title TEXT;
  v_customer_body TEXT;
  v_provider_title TEXT;
  v_provider_body TEXT;
BEGIN
  -- Only fire on meaningful status transitions
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT customer_id, provider_id INTO v_customer_id, v_provider_id FROM public.bookings WHERE id = NEW.id;
  SELECT name INTO v_service_name FROM public.services WHERE id = NEW.service_id;

  CASE NEW.status
    WHEN 'accepted' THEN
      v_notif_type := 'booking_accepted';
      v_customer_title := 'Booking Accepted!';
      v_customer_body := 'Your booking for ' || COALESCE(v_service_name, 'a service') || ' has been accepted.';
    WHEN 'cancelled' THEN
      v_notif_type := 'booking_cancelled';
      v_customer_title := 'Booking Cancelled';
      v_customer_body := 'Your booking has been cancelled.';
      v_provider_title := 'Booking Cancelled';
      v_provider_body := 'A booking has been cancelled by the customer.';
    WHEN 'completed' THEN
      v_notif_type := 'booking_completed';
      v_customer_title := 'Service Completed';
      v_customer_body := COALESCE(v_service_name, 'Your service') || ' has been marked as completed.';
    WHEN 'on_the_way' THEN
      v_notif_type := 'provider_on_the_way';
      v_customer_title := 'Provider On the Way';
      v_customer_body := 'Your service provider is heading to you now.';
    WHEN 'arrived' THEN
      v_notif_type := 'provider_arrived';
      v_customer_title := 'Provider Arrived';
      v_customer_body := 'Your service provider has arrived.';
    WHEN 'rejected' THEN
      v_notif_type := 'booking_rejected';
      v_customer_title := 'Booking Not Available';
      v_customer_body := 'Unfortunately your booking could not be accepted.';
    ELSE
      RETURN NEW;
  END CASE;

  -- Notify customer
  IF v_customer_title IS NOT NULL AND v_customer_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_customer_id, v_notif_type, v_customer_title, v_customer_body,
      jsonb_build_object('booking_id', NEW.id, 'status', NEW.status)
    );
  END IF;

  -- Notify provider (for cancellations)
  IF v_provider_title IS NOT NULL AND v_provider_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_provider_id, v_notif_type, v_provider_title, v_provider_body,
      jsonb_build_object('booking_id', NEW.id, 'status', NEW.status)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_status_notification ON public.bookings;
CREATE TRIGGER bookings_status_notification
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.create_booking_status_notification();

-- 5. Dispute opened notification trigger
CREATE OR REPLACE FUNCTION public.create_dispute_notification()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE
  v_customer_id UUID;
  v_provider_id UUID;
BEGIN
  SELECT customer_id, provider_id INTO v_customer_id, v_provider_id
  FROM public.bookings WHERE id = NEW.booking_id;

  -- Notify the other party
  IF NEW.raised_by = v_customer_id THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_provider_id, 'dispute_opened',
      'Dispute Opened',
      'A customer has opened a dispute for a booking.',
      jsonb_build_object('dispute_id', NEW.id, 'booking_id', NEW.booking_id)
    );
  ELSE
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_customer_id, 'dispute_opened',
      'Dispute Opened',
      'A provider has opened a dispute for a booking.',
      jsonb_build_object('dispute_id', NEW.id, 'booking_id', NEW.booking_id)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS disputes_create_notification ON public.disputes;
CREATE TRIGGER disputes_create_notification
  AFTER INSERT ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.create_dispute_notification();
