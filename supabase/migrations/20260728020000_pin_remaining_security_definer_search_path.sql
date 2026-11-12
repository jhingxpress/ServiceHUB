-- ============================================================
-- SECURITY: Pin search_path on ALL remaining SECURITY DEFINER
-- functions that still lack an explicit search_path.
--
-- Follow-up to 20260728000000_harden_security_definer_search_path.sql.
-- That migration re-created the 20 functions listed in audit finding
-- H-03 (PRE_BETA_SECURITY_AUDIT.md, 2026-07-27) with pinned search_path.
--
-- Gap found during Phase 2A stabilization: SECURITY DEFINER functions
-- created AFTER the audit's function list — most notably the platform
-- fee functions (20260705*) and other trigger/RPC helpers — were never
-- pinned. This migration closes that gap comprehensively.
--
-- Approach: instead of re-creating each function body (error-prone),
-- pin search_path directly via ALTER FUNCTION ... SET search_path.
-- This preserves bodies, signatures, grants, and trigger bindings
-- exactly, and is fully idempotent.
--
-- Verification (should return 0 rows after applying):
--   SELECT p.proname
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prosecdef
--     AND NOT EXISTS (
--       SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
--     );
--
-- Rollback: not applicable per-function; to revert, run
--   ALTER FUNCTION <name>(<args>) RESET search_path;
-- for any function that should not be pinned (none expected).
--
-- DO NOT apply this migration automatically.
-- Review against live DB state before deploying.
-- ============================================================

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS identity_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) AS c WHERE c LIKE 'search_path=%'
        )
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
      fn.proname,
      fn.identity_args
    );
    RAISE NOTICE 'Pinned search_path on public.%(%)', fn.proname, fn.identity_args;
  END LOOP;
END $$;
