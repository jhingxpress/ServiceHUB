-- ============================================================
-- Make chat-media bucket public
--
-- Root cause: getPublicUrl() generates /object/public/... URLs
-- which Supabase Storage only serves when the bucket has
-- public = true.  With public = false the URL returns HTTP 400
-- ("The bucket public is not found or not public"), causing
-- React Native <Image> to receive an error and display a gray
-- placeholder.
--
-- Security: storage paths are {booking_id (UUID)}/{timestamp}.ext
-- — not guessable.  INSERT / DELETE RLS policies are unaffected;
-- only authenticated participants can upload or delete.  Public
-- read access is acceptable for chat media given the opaque paths.
-- ============================================================

UPDATE storage.buckets
SET    public = true
WHERE  id = 'chat-media';
