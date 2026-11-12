-- ============================================================
-- SECURITY: Make chat-media bucket private; restrict reads to
-- booking participants and admins.
--
-- Finding: chat-media exposure (pre-merge review, TASK 003)
-- Date:    2026-07-29
--
-- Problems addressed:
--   1. storage.buckets.public = true  →  /object/public/ URLs are
--      served WITHOUT any auth or RLS check. Every stored
--      messages.image_url was a permanent bearer URL.
--   2. Policy "Chat media read authenticated" granted SELECT on
--      storage.objects to ANY authenticated user — allowing
--      enumeration/download of ALL chat media via the Storage API,
--      regardless of booking participation.
--
-- After this migration:
--   - Public URLs stop working immediately.
--   - storage.objects SELECT requires booking participation
--     (foldername[1] = booking id, customer_id or provider_id)
--     or admin role.
--   - Clients render images via short-lived signed URLs
--     (createSignedUrl), which ChatRoomScreen already generates.
--   - New uploads store the raw object path in messages.image_url;
--     legacy public URLs remain readable because path extraction
--     handles /object/public/, /object/sign/, and raw paths.
--
-- Upload authorization is unchanged: "Chat media upload by
-- participants" and "Chat media sender upload" (both booking-
-- scoped) remain in place.
--
-- Rollback:
--   UPDATE storage.buckets SET public = true WHERE id = 'chat-media';
--   (re-create "Chat media read authenticated" SELECT policy)
--   NOTE: rollback restores the exposure; only use for emergency
--   compatibility while clients are updated.
--
-- DO NOT apply this migration automatically.
-- Deploy only after the client build storing object paths is live.
-- ============================================================

BEGIN;

-- 1. Make the bucket private (public URLs stop resolving).
UPDATE storage.buckets
SET public = false
WHERE id = 'chat-media';

-- 2. Drop the broad authenticated-read policy.
DROP POLICY IF EXISTS "Chat media read authenticated" ON storage.objects;

-- 3. Recreate the participant-scoped read policy idempotently,
--    extended to admins for moderation.
DROP POLICY IF EXISTS "Chat media participant read" ON storage.objects;
CREATE POLICY "Chat media participant read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE (storage.foldername(name))[1] = b.id::text
          AND (b.customer_id = auth.uid() OR b.provider_id = auth.uid())
      )
    )
  );

-- 4. Ensure the booking-participant upload policy exists
--    (idempotent; "Chat media sender upload" from 20260728010000
--    is equivalent and intentionally left in place).
DROP POLICY IF EXISTS "Chat media upload by participants" ON storage.objects;
CREATE POLICY "Chat media upload by participants" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.bookings
        WHERE customer_id = auth.uid() OR provider_id = auth.uid()
      )
    )
  );

COMMIT;
