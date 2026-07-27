-- ============================================================
-- SECURITY: Scope chat-media upload policy to booking participants
-- Finding:  M-04 — Pre-Beta Security Audit 2026-07-27
-- Date:     2026-07-28
-- ============================================================
-- The previous "Chat media sender upload" policy allowed any
-- authenticated user to upload to any path inside the chat-media
-- bucket. This migration replaces it with a policy that requires
-- the uploader to be a participant (customer or provider) in the
-- booking whose UUID matches the first folder segment of the path.
--
-- Ownership model:
--   Path structure : {booking_id}/{filename}
--   Read  policy   : participant in booking — unchanged
--   Write policy   : participant in booking — FIXED HERE
--   Delete policy  : sender owns message — unchanged
--
-- The read policy already used (storage.foldername(name))[1] = b.id::text
-- with booking-participant check. The write policy now matches it.
--
-- DO NOT apply this migration automatically.
-- Review against live DB state before deploying.
-- ============================================================

DO $$ BEGIN
  DROP POLICY IF EXISTS "Chat media sender upload" ON storage.objects;
  CREATE POLICY "Chat media sender upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'chat-media'
      AND NOT public.has_dangerous_extension(name)
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id::text = (storage.foldername(name))[1]
          AND (b.customer_id = auth.uid() OR b.provider_id = auth.uid())
      )
    );
EXCEPTION WHEN OTHERS THEN RAISE; END $$;

-- ============================================================
-- OLD POLICY (for reference)
-- ============================================================
-- CREATE POLICY "Chat media sender upload" ON storage.objects
--   FOR INSERT TO authenticated
--   WITH CHECK (
--     bucket_id = 'chat-media'
--     AND NOT public.has_dangerous_extension(name)
--   );
-- Gap: no folder / booking-participant constraint.
-- Any authenticated user could write to any chat-media path.

-- ============================================================
-- ROLLBACK SQL
-- ============================================================
-- DROP POLICY IF EXISTS "Chat media sender upload" ON storage.objects;
-- CREATE POLICY "Chat media sender upload" ON storage.objects
--   FOR INSERT TO authenticated
--   WITH CHECK (
--     bucket_id = 'chat-media'
--     AND NOT public.has_dangerous_extension(name)
--   );

-- ============================================================
-- READ AND DELETE POLICIES (unchanged — shown for context)
-- ============================================================
-- READ  "Chat media participant read":
--   SELECT WHERE EXISTS (
--     SELECT 1 FROM public.bookings b
--     WHERE (storage.foldername(name))[1] = b.id::text
--       AND (b.customer_id = auth.uid() OR b.provider_id = auth.uid()))
--
-- DELETE "Chat media sender delete":
--   DELETE WHERE EXISTS (
--     SELECT 1 FROM public.messages
--     WHERE image_url LIKE '%' || name AND sender_id = auth.uid())
