-- ============================================================
-- FIX: Provider Documents Admin RLS Policy
-- Date: 2026-06-04
--
-- Problem:
--   Migration 20260526134219_add_admin_provider_documents_policy.sql
--   created a broken admin policy using auth.jwt() ->> 'role' = 'admin'.
--   Supabase JWTs do NOT include the public.users.role column by default,
--   so this policy always evaluated to FALSE and blocked admin access.
--
--   Additionally, the production audit fixes migration (20260531150000)
--   added a correct policy using public.is_admin(), but used a different
--   policy name, leaving the broken policy in place.
--
-- Fix:
--   1. Drop the broken policy by its exact name.
--   2. Ensure the correct admin read policy using public.is_admin() exists.
-- ============================================================

-- Drop the broken policy (checks non-existent JWT claim)
DROP POLICY IF EXISTS "Admins can read all provider documents" ON public.provider_documents;

-- Drop and recreate the correct policy using public.is_admin()
DROP POLICY IF EXISTS "Provider docs admin read" ON public.provider_documents;
CREATE POLICY "Provider docs admin read"
  ON public.provider_documents
  FOR SELECT
  TO authenticated
  USING (public.is_admin());
