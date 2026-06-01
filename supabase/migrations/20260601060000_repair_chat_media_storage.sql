-- ============================================================
-- REPAIR: chat-media storage policies
--
-- Why this file exists:
--   Migration 20260601040000_chat_media_storage.sql failed on the
--   DELETE policy with:
--     ERROR: operator does not exist: uuid = text (SQLSTATE 42883)
--   Cause: storage.objects.owner is type UUID; casting auth.uid()
--   to ::text before comparison has no matching operator.
--
-- This repair migration is idempotent and safe to run regardless
-- of whether the original migration was fully, partially, or not
-- applied. It uses DROP POLICY IF EXISTS before each CREATE to
-- guarantee the final state is correct.
--
-- Root cause fix:
--   WRONG:  owner = auth.uid()::text   (UUID = TEXT → error)
--   RIGHT:  owner = auth.uid()         (UUID = UUID → ok)
-- ============================================================

-- 1. Ensure bucket exists (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', false)
ON CONFLICT (id) DO NOTHING;

-- 2. DROP + CREATE each policy so the final state is always correct,
--    regardless of partial-apply state of the original migration.

-- SELECT policy
DROP POLICY IF EXISTS "Chat media read authenticated" ON storage.objects;
CREATE POLICY "Chat media read authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'chat-media');

-- INSERT policy (participant-restricted by booking_id folder)
DROP POLICY IF EXISTS "Chat media upload by participants" ON storage.objects;
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

-- DELETE policy — FIXED: owner is UUID, compare directly (no ::text cast)
DROP POLICY IF EXISTS "Chat media delete by sender" ON storage.objects;
CREATE POLICY "Chat media delete by sender"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-media'
  AND owner = auth.uid()
);
