-- ============================================================
-- CHAT MEDIA STORAGE
-- Bucket: chat-media
-- Path: chat-media/{booking_id}/{filename}
-- Policies: authenticated read; participant-restricted upload.
-- ============================================================

-- 1. Create bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', false)
ON CONFLICT (id) DO NOTHING;

-- 2. SELECT policy — any authenticated user can view chat images
-- (chat content is between authenticated participants)
DO $$
BEGIN
  CREATE POLICY "Chat media read authenticated"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'chat-media');
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

-- 3. INSERT policy — only booking participants can upload
-- Path segment [1] is booking_id; verify user is customer or provider
DO $$
BEGIN
  CREATE POLICY "Chat media upload by participants"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.bookings
        WHERE customer_id = auth.uid() OR provider_id = auth.uid()
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

-- 4. DELETE policy — sender can delete their own uploads
-- NOTE: storage.objects.owner is UUID; compare directly against auth.uid() (also UUID).
-- Do NOT cast auth.uid()::text — that causes "operator does not exist: uuid = text".
DO $$
BEGIN
  CREATE POLICY "Chat media delete by sender"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND owner = auth.uid()
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;
