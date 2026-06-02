-- ============================================================
-- FIX: Remove recursive reviews RLS policy
-- Root cause: "Customers can submit one review per booking" 
-- contains NOT EXISTS (SELECT 1 FROM public.reviews ...) inside
-- a policy ON public.reviews, causing infinite recursion.
-- The UNIQUE constraint on reviews.booking_id already prevents
-- duplicate reviews. This policy adds nothing except a fatal bug.
-- ============================================================

DROP POLICY IF EXISTS "Customers can submit one review per booking" ON public.reviews;
