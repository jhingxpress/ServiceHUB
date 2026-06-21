-- ============================================================
-- SECURITY: Prevent duplicate pending reports
-- Sprint 5.2B — Integrity Hardening (M-04)
-- Date: 2026-06-21
-- ============================================================
--
-- Vulnerability:
--   The reports table had no uniqueness constraint. Any authenticated
--   user could submit unlimited reports against the same target,
--   flooding the admin moderation queue with duplicate pending reports.
--
-- Fix (lowest-risk approach — option 1):
--   Add a UNIQUE partial index on (reporter_id, reported_user_id)
--   filtered to rows WHERE status = 'pending'.
--
--   Effect:
--   - Only one pending report per reporter+target pair at a time.
--   - Once admin resolves, dismisses, or marks investigating, the user
--     can legitimately re-report the same target (index no longer applies
--     to the resolved/dismissed row).
--   - Zero impact on existing non-pending reports.
--   - Zero impact on admin moderation workflow.
--   - ReportScreen.tsx error handler (lines 69-72) already catches
--     insert errors and shows an alert — no UI change needed.
--
-- Protected systems (unchanged):
--   - Admin report read/update workflow
--   - Existing resolved/dismissed/investigating reports
--   - reporter_id / reported_user_id queries
--   - moderation log
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_no_duplicate_pending
  ON public.reports (reporter_id, reported_user_id)
  WHERE status = 'pending';
