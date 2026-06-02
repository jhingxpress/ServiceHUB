-- ============================================================
-- Admin Review Moderation
-- ============================================================

-- 1. Add is_hidden column to reviews for soft-hide by admin
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- 2. Index for fast admin filtering
CREATE INDEX IF NOT EXISTS idx_reviews_is_hidden ON public.reviews (is_hidden);

-- 3. Allow admins to update and delete reviews (hard-delete moderation)
DO $$
BEGIN
  CREATE POLICY "Admins can update any review"
  ON public.reviews FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

DO $$
BEGIN
  CREATE POLICY "Admins can delete any review"
  ON public.reviews FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

-- 4. Visible reviews filter: customer-facing queries should exclude hidden reviews
-- (providers and customers query reviews — their existing SELECT policies remain;
--  the is_hidden flag is used in UI filters and may be enforced via RLS below)

DO $$
BEGIN
  CREATE POLICY "Admins can read all reviews"
  ON public.reviews FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;
