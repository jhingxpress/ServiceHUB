-- ============================================================
-- SECURITY: Harden public.reviews INSERT RLS policy
--
-- Vulnerability: "Reviews customer insert" only checked
-- auth.uid() = customer_id, allowing any authenticated customer
-- to insert a review for ANY booking_id / provider_id combination
-- (even bookings they don't own, or incomplete bookings).
--
-- The DB trigger validate_review_booking_status blocks the
-- 'not completed' case, but does NOT verify booking ownership.
-- A malicious customer could craft a payload with someone else's
-- completed booking_id to leave fake reviews on any provider.
--
-- Fix: tighten the RLS policy so the INSERT is only allowed when:
--   1. auth.uid() matches customer_id in the payload (self-insert)
--   2. the booking belongs to that customer
--   3. the booking status is 'completed'
--
-- The existing trigger (validate_review_booking_status) is kept as
-- a second line of defence in case RLS is bypassed via service role.
-- ============================================================

DROP POLICY IF EXISTS "Reviews customer insert" ON public.reviews;
CREATE POLICY "Reviews customer insert" ON public.reviews
  FOR INSERT
  WITH CHECK (
    auth.uid() = customer_id
    AND EXISTS (
      SELECT 1
      FROM public.bookings
      WHERE id          = booking_id
        AND customer_id = auth.uid()
        AND status      = 'completed'
    )
  );
