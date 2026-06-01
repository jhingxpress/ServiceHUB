-- ============================================================
-- REVIEWS PHOTO_URLS COLUMN
-- ============================================================

-- Add photo_urls array column to reviews table
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}'::TEXT[];

-- Update existing reviews to have empty array instead of null
UPDATE public.reviews SET photo_urls = '{}'::TEXT[] WHERE photo_urls IS NULL;

-- Ensure the column has a non-null default for new rows
ALTER TABLE public.reviews
  ALTER COLUMN photo_urls SET DEFAULT '{}'::TEXT[];

-- Make it NOT NULL after backfill
ALTER TABLE public.reviews
  ALTER COLUMN photo_urls SET NOT NULL;
