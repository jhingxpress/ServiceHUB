-- ============================================================
-- FIX: booking-photos storage RLS policies
-- Root cause: previous policies used (storage.foldername(name))[1]::uuid
-- expecting first folder = booking UUID. Actual upload path was
-- bookings/{providerId}/... so the UUID cast always failed.
-- Fix: align path structure with avatars/review-media pattern:
--   upload path  → {customer_id}/{timestamp}.{ext}
--   SELECT check → first folder = auth.uid() OR provider of that customer's booking
--   INSERT check → first folder = auth.uid()
-- ============================================================

-- Drop old broken policies
DROP POLICY IF EXISTS "Booking participants can read booking photos" ON storage.objects;
DROP POLICY IF EXISTS "Customers can upload booking photos" ON storage.objects;

-- SELECT: customer who uploaded (first folder = their uid) OR
--         provider of any booking belonging to that customer
DO $$
BEGIN
  CREATE POLICY "Booking photo read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'booking-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.bookings
        WHERE customer_id::text = (storage.foldername(name))[1]
          AND provider_id = auth.uid()
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

-- INSERT: only the customer uploads their own folder
DO $$
BEGIN
  CREATE POLICY "Booking photo upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'booking-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

-- DELETE: customer can remove their own photos
DO $$
BEGIN
  CREATE POLICY "Booking photo delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'booking-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;
