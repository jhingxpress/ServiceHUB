-- ============================================================
-- FIX: RLS — Add customer and provider self-read policies for reviews
-- Root cause: Only "Reviews public read" (is_visible = true) existed.
--   1. Customers could not read their OWN review if is_visible = false
--      (e.g., if admin hides a review temporarily). Queries returning
--      no row cause ReviewDetailScreen to show "Review not found."
--   2. Providers had no policy to SELECT reviews where provider_id
--      = auth.uid(), blocking ProviderServicePreviewScreen reviews query.
-- ============================================================

-- 1. Customer can always read their own submitted reviews
DROP POLICY IF EXISTS "Reviews customer read own" ON public.reviews;
CREATE POLICY "Reviews customer read own" ON public.reviews
FOR SELECT TO authenticated
USING (auth.uid() = customer_id);

-- 2. Provider can always read reviews about themselves
DROP POLICY IF EXISTS "Reviews provider read own" ON public.reviews;
CREATE POLICY "Reviews provider read own" ON public.reviews
FOR SELECT TO authenticated
USING (auth.uid() = provider_id);
