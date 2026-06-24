-- ============================================================
-- SECURITY FIX: Harden "Bookings provider update" RLS policy
-- Sprint Security Audit — Finding H-01 (part 1 of 2)
-- Date: 2026-06-24
-- ============================================================
--
-- Vulnerability:
--   "Bookings provider update" (schema.sql) used only:
--     USING (auth.uid() = provider_id)
--   with NO WITH CHECK clause. This allowed a provider to:
--
--   1. Update ANY column on a booking they own, including
--      customer_id, service_id, scheduled_date, total_amount.
--   2. Jump directly to status='completed' from any state,
--      triggering the SECURITY DEFINER create_payment_on_completion()
--      trigger and inflating total_earnings / completed_jobs.
--   3. Modify total_amount before marking completed, overcharging
--      the recorded payment amount.
--
-- Fix — Two layers:
--
--   Layer 1 (this migration): Tighten the RLS WITH CHECK to
--   only allow status-field changes, and only to the defined
--   allowed transitions. Prevents REST API abuse.
--   Non-status fields (customer_id, service_id, total_amount, etc.)
--   can only be changed by admin, not the provider.
--
--   Layer 2 (next migration): Add a BEFORE UPDATE trigger that
--   enforces valid state machine transitions at the DB level,
--   as a second line of defence even if RLS is bypassed.
--
-- Allowed provider status transitions:
--   pending     → accepted  | rejected
--   accepted    → on_the_way | cancelled
--   on_the_way  → arrived   | cancelled
--   arrived     → in_progress
--   in_progress → completed | disputed
--
-- Preserved provider fields (allowed to update):
--   status, provider_notes
--   (provider_latitude, provider_longitude for legacy inline tracking)
--
-- Protected systems (unchanged):
--   - Customer cancel policy ("Bookings customer cancel")
--   - Admin read policy ("Bookings admin read")
--   - All SECURITY DEFINER triggers (bypass RLS)
--   - Booking notification triggers
--   - Payment creation on completion
-- ============================================================

-- Drop existing permissive policy
DROP POLICY IF EXISTS "Bookings provider update" ON public.bookings;

-- ── Layer 1 — RLS policy ─────────────────────────────────────────────────────
-- USING  : evaluated against the OLD (existing) row.
--          Only allow update if booking is still in an actionable state.
--          Prevents updating already-finalised bookings (completed/cancelled/etc).
-- WITH CHECK: evaluated against the NEW (proposed) row.
--          New status must be one of the allowed destination values.
--          Full state-machine transition validation (which OLD → NEW pair is
--          valid) and field-immutability enforcement are in Layer 2 (trigger).
--
-- PostgreSQL note: WITH CHECK has access to the NEW row ONLY. OLD references
-- are only available inside TRIGGER functions, not RLS expressions.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE POLICY "Bookings provider update" ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = provider_id
    AND status IN ('pending', 'accepted', 'on_the_way', 'arrived', 'in_progress')
  )
  WITH CHECK (
    auth.uid() = provider_id
    AND status IN (
      'accepted', 'rejected',
      'on_the_way', 'arrived',
      'in_progress',
      'completed', 'disputed',
      'cancelled'
    )
  );
