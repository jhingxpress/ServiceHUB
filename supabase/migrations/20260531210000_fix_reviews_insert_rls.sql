-- ============================================================
-- FIX: Reviews INSERT RLS — enforce booking ownership
-- Root cause: previous policy only checked auth.uid() = customer_id,
-- allowing any authenticated user to insert a review against a
-- completed booking UUID they do not own.
-- Fix: add EXISTS check so booking.customer_id must equal auth.uid().
-- ============================================================

DROP POLICY IF EXISTS "Reviews customer insert" ON public.reviews;

CREATE POLICY "Reviews customer insert"
ON public.reviews
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = customer_id
  AND EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = booking_id
      AND customer_id = auth.uid()
  )
);
