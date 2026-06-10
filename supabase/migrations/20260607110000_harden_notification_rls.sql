-- ============================================================
-- SECURITY: Harden public.notifications RLS policies
--
-- Vulnerability: "Notifications system insert" used WITH CHECK (true),
-- allowing ANY authenticated user to insert notifications for any
-- other user, which also triggers push delivery.
--
-- Fix:
-- 1. Remove the permissive insert policy.
--    All legitimate notification inserts come from SECURITY DEFINER
--    triggers which bypass RLS automatically — they are unaffected.
-- 2. Add admin-only insert policy for broadcast / admin use cases.
-- 3. Add user delete own notifications policy (quality-of-life).
-- ============================================================

-- 1. Drop the vulnerable blanket insert policy
DROP POLICY IF EXISTS "Notifications system insert" ON public.notifications;

-- 2. Admin-only direct insert (broadcasts, system announcements)
DROP POLICY IF EXISTS "Notifications admin insert" ON public.notifications;
CREATE POLICY "Notifications admin insert" ON public.notifications
  FOR INSERT
  WITH CHECK (public.is_admin());

-- 3. Allow users to delete their own notifications (e.g. clear inbox)
DROP POLICY IF EXISTS "Notifications user delete" ON public.notifications;
CREATE POLICY "Notifications user delete" ON public.notifications
  FOR DELETE
  USING (auth.uid() = user_id);
