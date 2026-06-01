-- ============================================================
-- SPRINT 4B — FIX REVIEWS SCHEMA & STORAGE
-- ============================================================

-- 1. DEFENSIVE: ensure reviews has all frontend columns
-- ============================================================
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS comment TEXT;

-- 2. DEFENSIVE: ensure review_media columns match frontend
-- ============================================================
-- (schema already uses file_url and media_type check; no change needed)

-- 3. CREATE review-media STORAGE BUCKET
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-media', 'review-media', true)
ON CONFLICT (id) DO NOTHING;

-- 4. RLS POLICIES FOR review-media BUCKET
-- ============================================================

-- Anyone can read review media
DO $$
BEGIN
  CREATE POLICY "Anyone can read review media"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'review-media');
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

-- Authenticated customers can upload review media
DO $$
BEGIN
  CREATE POLICY "Customers can upload review media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'review-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

-- Customers can delete their own review media
DO $$
BEGIN
  CREATE POLICY "Customers can delete own review media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'review-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;
