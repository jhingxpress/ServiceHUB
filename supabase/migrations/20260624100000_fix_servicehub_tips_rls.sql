-- ============================================================
-- SECURITY FIX: Restrict servicehub_tips INSERT to status='pending'
-- Sprint Security Audit — Finding H-03
-- Date: 2026-06-24
-- ============================================================
--
-- Vulnerability:
--   "Users create own tips" used WITH CHECK (auth.uid() = user_id),
--   which only enforced ownership. It did NOT restrict the `status`
--   column, allowing any authenticated user to INSERT a tip row
--   with status='paid' directly — bypassing the PayMongo checkout
--   flow entirely.
--
--   Impact: Fake 'paid' tip records in DB, analytics inflation.
--   No financial harm (tips grant no privileges), but data integrity
--   is compromised and admin tip dashboards would be inaccurate.
--
-- Fix:
--   Drop the permissive insert policy and replace with one that
--   enforces status='pending' on all client-side inserts.
--
--   Legitimate paid status updates come exclusively from the
--   paymongo-webhook Edge Function via the service role key,
--   which bypasses RLS — unaffected by this change.
--
-- Protected systems (unchanged):
--   - create-servicehub-tip-checkout Edge Function (service role)
--   - paymongo-webhook Edge Function (service role)
--   - "Users view own tips" SELECT policy
--   - "Admins view all tips" SELECT policy
--   - paymongo_checkout_id, checkout_url, paid_at columns
-- ============================================================

DROP POLICY IF EXISTS "Users create own tips" ON public.servicehub_tips;

CREATE POLICY "Users create own tips"
  ON public.servicehub_tips FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
  );
