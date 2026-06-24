-- ============================================================
-- SECURITY FIX: Booking state machine + field immutability trigger
-- Sprint Security Audit — Finding H-01 (part 2 of 2)
-- Date: 2026-06-24
-- ============================================================
--
-- Purpose:
--   Layer 2 defence complementing the RLS policy change in
--   20260624110000_harden_booking_provider_update.sql.
--
--   Even with RLS hardened, this BEFORE UPDATE trigger provides:
--
--   1. STATE MACHINE ENFORCEMENT
--      Rejects any status change that does not follow the defined
--      directed acyclic graph of valid transitions. This catches:
--        - REST API calls where RLS WITH CHECK is insufficient
--        - Future service-role callers that bypass RLS
--        - Admin console mistakes
--
--   2. FIELD IMMUTABILITY ENFORCEMENT
--      Rejects any attempt (from any caller) to mutate
--      customer_id, provider_id, service_id, total_amount,
--      or scheduled_date on an existing booking.
--      These fields are set at booking creation and must
--      never change; price changes require a new booking.
--
-- Valid state machine transitions (provider-driven):
--
--   pending     → accepted       (provider accepts)
--   pending     → rejected       (provider declines)
--   accepted    → on_the_way     (provider departs)
--   accepted    → cancelled      (provider cancels after acceptance)
--   on_the_way  → arrived        (provider arrives at location)
--   on_the_way  → cancelled      (provider cancels en route, edge case)
--   arrived     → in_progress    (service begins)
--   in_progress → completed      (service finished)
--   in_progress → disputed       (dispute raised during service)
--
-- Customer-driven transitions (handled by "Bookings customer cancel" RLS):
--   pending     → cancelled
--   accepted    → cancelled
--
-- Terminal states (no further transitions allowed):
--   completed, cancelled, rejected, disputed
--
-- SECURITY DEFINER: Not needed — BEFORE triggers run with the
-- privileges of the trigger owner (table owner = postgres),
-- which already has table-level access regardless of RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_booking_state_machine()
RETURNS TRIGGER AS $$
BEGIN
  -- ── 1. Field immutability checks ────────────────────────────────────────────
  IF NEW.customer_id != OLD.customer_id THEN
    RAISE EXCEPTION 'Booking integrity violation: customer_id is immutable (booking_id=%)', OLD.id;
  END IF;

  IF NEW.provider_id != OLD.provider_id THEN
    RAISE EXCEPTION 'Booking integrity violation: provider_id is immutable (booking_id=%)', OLD.id;
  END IF;

  IF NEW.service_id != OLD.service_id THEN
    RAISE EXCEPTION 'Booking integrity violation: service_id is immutable (booking_id=%)', OLD.id;
  END IF;

  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
    RAISE EXCEPTION 'Booking integrity violation: total_amount is immutable after booking creation (booking_id=%). Create a new booking for price changes.', OLD.id;
  END IF;

  IF NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date THEN
    RAISE EXCEPTION 'Booking integrity violation: scheduled_date is immutable after booking creation (booking_id=%). Create a new booking for rescheduling.', OLD.id;
  END IF;

  -- ── 2. State machine transitions ─────────────────────────────────────────────
  -- Only enforce when status actually changes.
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Terminal states: block any further transitions
  IF OLD.status IN ('completed', 'cancelled', 'rejected', 'disputed') THEN
    RAISE EXCEPTION 'Booking state machine violation: cannot transition from terminal state "%" (booking_id=%)', OLD.status, OLD.id;
  END IF;

  -- Valid forward transitions
  IF NOT (
       (OLD.status = 'pending'      AND NEW.status IN ('accepted', 'rejected', 'cancelled'))
    OR (OLD.status = 'accepted'     AND NEW.status IN ('on_the_way', 'cancelled'))
    OR (OLD.status = 'on_the_way'   AND NEW.status IN ('arrived', 'cancelled'))
    OR (OLD.status = 'arrived'      AND NEW.status = 'in_progress')
    OR (OLD.status = 'in_progress'  AND NEW.status IN ('completed', 'disputed'))
  ) THEN
    RAISE EXCEPTION 'Booking state machine violation: transition "%" → "%" is not allowed (booking_id=%)',
      OLD.status, NEW.status, OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_enforce_state_machine ON public.bookings;

CREATE TRIGGER bookings_enforce_state_machine
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_booking_state_machine();

-- ============================================================
-- Verification: confirm trigger is present
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'bookings'
      AND trigger_name = 'bookings_enforce_state_machine'
  ) THEN
    RAISE EXCEPTION 'bookings_enforce_state_machine trigger was not created';
  END IF;
  RAISE NOTICE 'bookings_enforce_state_machine trigger OK';
END $$;
