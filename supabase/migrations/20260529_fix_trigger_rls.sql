-- ============================================================
-- MIGRATION: Fix RLS for all system trigger functions
-- Date: 2026-05-29
-- Issue: Automated triggers fail with 42501 (RLS violation)
-- ============================================================

-- Root Cause:
-- Multiple trigger functions that INSERT/UPDATE system-maintained tables
-- run as SECURITY INVOKER by default, meaning they execute with the
-- privileges of the end-user who triggered them. Users lack write
-- permissions on tables like providers, provider_badges, payments,
-- messages, and notifications in certain contexts.
--
-- Fix: Convert all system-level trigger functions to SECURITY DEFINER
-- so they execute with the table owner's privileges, bypassing RLS
-- for automated denormalization, notification, and payment creation.

-- Note: BEFORE triggers that only modify NEW.* fields (handle_updated_at,
-- handle_provider_status_change) and validation-only triggers
-- (validate_review_booking_status) are intentionally left as SECURITY
-- INVOKER because they do not execute separate SQL DML statements.

-- 1. update_provider_rating() — fires on reviews INSERT/UPDATE/DELETE
--    Writes: UPDATE public.providers (rating, total_reviews)
--    Risk: Customer writing review lacks UPDATE on provider row.
CREATE OR REPLACE FUNCTION public.update_provider_rating()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE
  target_provider_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_provider_id := OLD.provider_id;
  ELSE
    target_provider_id := NEW.provider_id;
  END IF;

  UPDATE public.providers
  SET
    rating = COALESCE((
      SELECT AVG(rating)::DECIMAL(3,2)
      FROM public.reviews
      WHERE provider_id = target_provider_id AND is_visible = true
    ), 0),
    total_reviews = COALESCE((
      SELECT COUNT(*)
      FROM public.reviews
      WHERE provider_id = target_provider_id AND is_visible = true
    ), 0)
  WHERE id = target_provider_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 2. send_welcome_message() — fires on bookings UPDATE to 'accepted'
--    Writes: INSERT INTO public.messages
--    Risk: System auto-message should succeed regardless of who accepts.
CREATE OR REPLACE FUNCTION public.send_welcome_message()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE
  prov_id UUID;
  cust_id UUID;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
    SELECT provider_id, customer_id INTO prov_id, cust_id
    FROM public.bookings WHERE id = NEW.id;

    INSERT INTO public.messages (booking_id, sender_id, receiver_id, content)
    VALUES (
      NEW.id,
      prov_id,
      cust_id,
      'Hi! I have accepted your booking. Let me know if you have any questions before we start.'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. create_payment_on_completion() — fires on bookings UPDATE to 'completed'
--    Writes: INSERT INTO public.payments
--    Risk: payments table has NO INSERT policy; any user triggering this
--    would be blocked.
CREATE OR REPLACE FUNCTION public.create_payment_on_completion()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO public.payments (booking_id, customer_id, provider_id, amount, status, payment_method)
    VALUES (
      NEW.id,
      NEW.customer_id,
      NEW.provider_id,
      COALESCE(NEW.total_amount, 0),
      'pending',
      'cash_on_service'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. update_provider_badges() — fires on providers UPDATE
--    Writes: INSERT INTO public.provider_badges
--    Risk: provider_badges has only admin ALL policy; provider lacks INSERT.
CREATE OR REPLACE FUNCTION public.update_provider_badges()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  IF NEW.is_verified = TRUE THEN
    INSERT INTO public.provider_badges (provider_id, badge_type)
    VALUES (NEW.id, 'verified_provider')
    ON CONFLICT (provider_id, badge_type) DO NOTHING;
  END IF;

  IF NEW.completed_jobs >= 100 THEN
    INSERT INTO public.provider_badges (provider_id, badge_type)
    VALUES (NEW.id, '100_plus_jobs')
    ON CONFLICT (provider_id, badge_type) DO NOTHING;
  END IF;

  IF NEW.completed_jobs >= 50 THEN
    INSERT INTO public.provider_badges (provider_id, badge_type)
    VALUES (NEW.id, '50_plus_jobs')
    ON CONFLICT (provider_id, badge_type) DO NOTHING;
  END IF;

  IF NEW.rating >= 4.5 AND NEW.total_reviews >= 10 THEN
    INSERT INTO public.provider_badges (provider_id, badge_type)
    VALUES (NEW.id, 'top_rated')
    ON CONFLICT (provider_id, badge_type) DO NOTHING;
  END IF;

  IF NEW.response_rate >= 90 THEN
    INSERT INTO public.provider_badges (provider_id, badge_type)
    VALUES (NEW.id, 'fast_responder')
    ON CONFLICT (provider_id, badge_type) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. update_provider_response_rate() — fires on bookings UPDATE
--    Writes: UPDATE public.providers (response_rate)
--    Risk: Customer changing booking status lacks UPDATE on provider row.
CREATE OR REPLACE FUNCTION public.update_provider_response_rate()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE
  total_requests INTEGER;
  accepted_count INTEGER;
  new_rate INTEGER;
BEGIN
  IF OLD.status = 'pending' AND NEW.status != 'pending' THEN
    SELECT COUNT(*) INTO total_requests
    FROM public.bookings
    WHERE provider_id = NEW.provider_id;

    SELECT COUNT(*) INTO accepted_count
    FROM public.bookings
    WHERE provider_id = NEW.provider_id AND status IN ('accepted', 'on_the_way', 'arrived', 'in_progress', 'completed');

    IF total_requests > 0 THEN
      new_rate := (accepted_count::FLOAT / total_requests::FLOAT * 100)::INTEGER;
      UPDATE public.providers
      SET response_rate = new_rate
      WHERE id = NEW.provider_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. create_booking_notification() — fires on bookings INSERT/UPDATE
--    Writes: INSERT INTO public.notifications
--    Risk: Currently allowed by open insert policy, but system function
--    should be resilient to future policy changes.
CREATE OR REPLACE FUNCTION public.create_booking_notification()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE
  cust_name TEXT;
  prov_name TEXT;
BEGIN
  SELECT full_name INTO cust_name FROM public.users WHERE id = NEW.customer_id;
  SELECT COALESCE(business_name, u.full_name) INTO prov_name
  FROM public.providers p LEFT JOIN public.users u ON p.id = u.id
  WHERE p.id = NEW.provider_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.provider_id, 'booking_submitted',
      'New Booking Request',
      cust_name || ' requested a booking for ' || NEW.scheduled_date,
      jsonb_build_object('booking_id', NEW.id, 'status', NEW.status)
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
    IF NEW.status = 'accepted' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        NEW.customer_id, 'booking_accepted',
        'Booking Accepted',
        prov_name || ' accepted your booking request',
        jsonb_build_object('booking_id', NEW.id)
      );
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        NEW.customer_id, 'booking_rejected',
        'Booking Rejected',
        'Your booking request was declined',
        jsonb_build_object('booking_id', NEW.id)
      );
    ELSIF NEW.status = 'on_the_way' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        NEW.customer_id, 'provider_on_the_way',
        'Provider On The Way',
        prov_name || ' is on the way to your location',
        jsonb_build_object('booking_id', NEW.id)
      );
    ELSIF NEW.status = 'arrived' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        NEW.customer_id, 'provider_arrived',
        'Provider Arrived',
        prov_name || ' has arrived at your location',
        jsonb_build_object('booking_id', NEW.id)
      );
    ELSIF NEW.status = 'completed' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        NEW.customer_id, 'service_completed',
        'Service Completed',
        'Your service is complete. Please leave a review!',
        jsonb_build_object('booking_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. handle_provider_verification_notification() — fires on providers UPDATE
--    Writes: INSERT INTO public.notifications
--    Risk: Admin has INSERT, but system notification should always succeed.
CREATE OR REPLACE FUNCTION public.handle_provider_verification_notification()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  IF OLD.status = 'pending_review' AND NEW.status = 'approved' THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.id,
      'verification_approved',
      'Application Approved',
      'Your provider application has been approved. You may now publish services and receive bookings.',
      jsonb_build_object('provider_id', NEW.id, 'status', NEW.status, 'review_timestamp', NOW())
    );
  ELSIF OLD.status = 'pending_review' AND NEW.status = 'rejected' THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.id,
      'verification_rejected',
      'Application Rejected',
      'Your provider application was rejected. Please review the feedback and resubmit your documents.',
      jsonb_build_object('provider_id', NEW.id, 'status', NEW.status, 'review_timestamp', NOW())
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
