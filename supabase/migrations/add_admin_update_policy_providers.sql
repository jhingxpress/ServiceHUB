-- ============================================================
-- Migration: Add Admin UPDATE Policy for Providers Table
-- ============================================================
-- Purpose: Allow admin users to update provider records for approval/rejection
-- Date: 2026-05-27
-- ============================================================

-- Drop existing policy if it exists (for idempotency)
DROP POLICY IF EXISTS "Providers admin update" ON public.providers;

-- Create new policy allowing admins to update any provider record
CREATE POLICY "Providers admin update" ON public.providers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Verify policy was created
SELECT 
  schemaname, 
  tablename, 
  policyname, 
  permissive, 
  roles, 
  cmd, 
  qual, 
  with_check
FROM pg_policies
WHERE tablename = 'providers' AND policyname = 'Providers admin update';
