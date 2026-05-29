-- ============================================================
-- MIGRATION: Fix RLS infinite recursion on public.users
-- Date: 2026-05-29
-- Issue: 42P17 infinite recursion detected in policy for relation "users"
-- ============================================================

-- Root Cause:
-- Multiple RLS policies contain self-referential subqueries:
--   EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
-- When evaluating a policy on public.users, the subquery itself is subject to
-- the same RLS policies, causing infinite recursion.
--
-- Fix: Create a SECURITY DEFINER helper function public.is_admin() that
-- bypasses RLS, then replace all recursive subqueries with public.is_admin().

-- 1. Create helper function (idempotent)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- 2. Fix policies on public.users
DROP POLICY IF EXISTS "Admins read all users" ON public.users;
CREATE POLICY "Admins read all users" ON public.users FOR SELECT USING (
  public.is_admin()
);

-- 3. Fix policies on public.providers
DROP POLICY IF EXISTS "Providers admin update" ON public.providers;
CREATE POLICY "Providers admin update" ON public.providers FOR UPDATE USING (
  public.is_admin()
) WITH CHECK (
  public.is_admin()
);

-- Also fix the soft-delete read policy if it still has the old recursive form
DROP POLICY IF EXISTS "Providers public read" ON public.providers;
CREATE POLICY "Providers public read" ON public.providers FOR SELECT USING (
    (status = 'approved' AND deleted_at IS NULL)
    OR auth.uid() = id
    OR public.is_admin()
);

-- 4. Fix policies on public.provider_verification_logs
DROP POLICY IF EXISTS "Verification logs read" ON public.provider_verification_logs;
CREATE POLICY "Verification logs read" ON public.provider_verification_logs
  FOR SELECT USING (auth.uid() = provider_id OR public.is_admin());

DROP POLICY IF EXISTS "Verification logs insert" ON public.provider_verification_logs;
CREATE POLICY "Verification logs insert" ON public.provider_verification_logs
  FOR INSERT WITH CHECK (public.is_admin());

-- 5. Fix policies on public.services
DROP POLICY IF EXISTS "Services public read" ON public.services;
CREATE POLICY "Services public read" ON public.services FOR SELECT USING (
  deleted_at IS NULL AND (
    EXISTS (SELECT 1 FROM public.providers WHERE id = provider_id AND deleted_at IS NULL)
    OR auth.uid() = provider_id
    OR public.is_admin()
  )
);

-- 6. Fix policies on public.bookings
DROP POLICY IF EXISTS "Bookings admin read" ON public.bookings;
CREATE POLICY "Bookings admin read" ON public.bookings FOR SELECT USING (
  public.is_admin()
);

-- 7. Fix policies on public.messages
DROP POLICY IF EXISTS "Messages read" ON public.messages;
CREATE POLICY "Messages read" ON public.messages FOR SELECT USING (
  auth.uid() = sender_id OR auth.uid() = receiver_id OR public.is_admin()
);

-- 8. Fix policies on public.provider_badges
DROP POLICY IF EXISTS "Provider badges admin manage" ON public.provider_badges;
CREATE POLICY "Provider badges admin manage" ON public.provider_badges FOR ALL
  USING (public.is_admin());

-- 9. Fix policies on public.payments
DROP POLICY IF EXISTS "Payments read" ON public.payments;
CREATE POLICY "Payments read" ON public.payments FOR SELECT USING (
  auth.uid() = customer_id OR auth.uid() = provider_id OR public.is_admin()
);

-- 10. Fix policies on public.disputes
DROP POLICY IF EXISTS "Disputes read" ON public.disputes;
CREATE POLICY "Disputes read" ON public.disputes FOR SELECT USING (
  auth.uid() = raised_by OR public.is_admin()
);

-- 11. Fix policies on public.reports
DROP POLICY IF EXISTS "Reports admin read" ON public.reports;
CREATE POLICY "Reports admin read" ON public.reports FOR SELECT USING (
  public.is_admin()
);

DROP POLICY IF EXISTS "Reports admin update" ON public.reports;
CREATE POLICY "Reports admin update" ON public.reports FOR UPDATE USING (
  public.is_admin()
);

-- ============================================================
-- VERIFY
-- ============================================================

-- Confirm no remaining recursive patterns in pg_policies
SELECT schemaname, tablename, policyname, permissive, cmd, qual
FROM pg_policies
WHERE qual ILIKE '%users%' AND qual ILIKE '%admin%'
  AND qual ILIKE '%auth.uid()%'
  AND tablename != 'users';
