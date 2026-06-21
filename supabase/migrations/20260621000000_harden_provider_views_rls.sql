-- ============================================================
-- SECURITY: Harden provider_views RLS + add daily dedup index
-- Sprint 5.2A — Security Remediation (H-01)
-- Date: 2026-06-21
-- ============================================================
--
-- Vulnerability:
--   "provider_views_insert" used WITH CHECK (true), allowing any
--   authenticated user to:
--     1. Insert viewer_id = any UUID (identity spoofing)
--     2. Insert viewer_id = provider_id (self-view inflation)
--     3. Insert unlimited rows for the same viewer+provider (spam)
--   All three vectors directly inflate provider_analytics.profile_views
--   via the on_provider_view_insert SECURITY DEFINER trigger.
--
-- Fix:
--   1. Drop the permissive insert policy.
--   2. Replace with ownership + self-view-prevention policy.
--   3. Add a UNIQUE INDEX on (viewer_id, provider_id, (viewed_at AT TIME ZONE 'UTC')::date)
--      to enforce one view per viewer+provider per calendar day (UTC).
--      The AT TIME ZONE 'UTC' cast is IMMUTABLE (fixed timezone), which
--      PostgreSQL requires for index expressions. Duplicate inserts
--      silently fail in analytics.ts (wrapped in try/catch) — no UI impact.
--
-- Protected systems (unchanged):
--   - provider_analytics triggers (still fire on every valid insert)
--   - provider_performance, provider_stats
--   - bookings, payments, reviews, chat, notifications
--   - analytics screens, historical analytics
-- ============================================================

-- 1. Drop the permissive insert policy
DROP POLICY IF EXISTS provider_views_insert ON public.provider_views;

-- 2. Replacement: ownership + self-view prevention
CREATE POLICY provider_views_insert
  ON public.provider_views
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = viewer_id          -- viewer must be the authenticated caller
    AND viewer_id != provider_id    -- provider cannot view their own profile
  );

-- 3. Daily dedup: one view per viewer+provider per calendar day (UTC)
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_views_daily_dedup
  ON public.provider_views (viewer_id, provider_id, ((viewed_at AT TIME ZONE 'UTC')::date));
