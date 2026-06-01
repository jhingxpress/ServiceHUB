-- ============================================================
-- SPRINT 4A — STORAGE BUCKETS: avatars + booking-photos
-- ============================================================

-- 1. CREATE avatars BUCKET (public read for profile photos)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. CREATE booking-photos BUCKET (private, only provider/customer access)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('booking-photos', 'booking-photos', false)
ON CONFLICT (id) DO NOTHING;

-- 3. RLS POLICIES FOR avatars BUCKET
-- ============================================================

-- Anyone (authenticated or anon) can read avatar images
DO $$
BEGIN
  CREATE POLICY "Anyone can read avatars"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

-- Authenticated users can upload their own avatar
DO $$
BEGIN
  CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

-- Users can update their own avatar
DO $$
BEGIN
  CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

-- Users can delete their own avatar
DO $$
BEGIN
  CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

-- 4. RLS POLICIES FOR booking-photos BUCKET
-- ============================================================

-- Booking participants can read booking photos
DO $$
BEGIN
  CREATE POLICY "Booking participants can read booking photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'booking-photos'
    AND EXISTS (
      SELECT 1 FROM bookings
      WHERE id = (storage.foldername(name))[1]::uuid
        AND (customer_id = auth.uid() OR provider_id = auth.uid())
    )
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

-- Customers can upload booking photos
DO $$
BEGIN
  CREATE POLICY "Customers can upload booking photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'booking-photos'
    AND EXISTS (
      SELECT 1 FROM bookings
      WHERE id = (storage.foldername(name))[1]::uuid
        AND customer_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;
