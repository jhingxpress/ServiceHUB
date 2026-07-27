-- ============================================================
-- Phase 2B: Add liveness verification columns to provider_documents
-- and create a SECURITY DEFINER RPC for client-safe feature flags.
--
-- All columns are additive and nullable so existing rows are unaffected.
-- No new tables. No RLS changes to provider_documents (existing policies
-- already cover the new columns).
--
-- IMPORTANT: The document_type CHECK constraint is NOT modified here.
-- It will be updated in the Phase 2C migration (20260726210000) which
-- consolidates all allowed types including verification_selfie.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.get_feature_flags();
--   ALTER TABLE public.provider_documents DROP COLUMN IF EXISTS
--     liveness_status, blink_detected, left_turn_detected,
--     right_turn_detected, capture_quality_score, best_selfie_storage_path,
--     liveness_captured_at, manual_review_required, liveness_details,
--     attempt_count, device_platform;
-- ============================================================

BEGIN;

-- 1. Add nullable liveness columns to provider_documents
ALTER TABLE public.provider_documents
  ADD COLUMN IF NOT EXISTS liveness_status TEXT
    CHECK (liveness_status IS NULL OR liveness_status IN ('passed', 'manual_review', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS blink_detected BOOLEAN,
  ADD COLUMN IF NOT EXISTS left_turn_detected BOOLEAN,
  ADD COLUMN IF NOT EXISTS right_turn_detected BOOLEAN,
  ADD COLUMN IF NOT EXISTS capture_quality_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS best_selfie_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS liveness_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_review_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS liveness_details JSONB,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS device_platform TEXT;

-- 2. Seed the feature flag (default: disabled)
INSERT INTO public.platform_config (key, value)
VALUES ('identity_live_selfie_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- 3. Create a SECURITY DEFINER function that returns ONLY allowlisted
--    client-safe feature flags. This avoids granting any SELECT on
--    platform_config to authenticated users — the function runs with
--    the owner's privileges and returns only explicitly allowlisted keys.
CREATE OR REPLACE FUNCTION public.get_feature_flags()
RETURNS TABLE(key TEXT, value TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT key, value
  FROM public.platform_config
  WHERE key IN (
    'identity_live_selfie_enabled'
  );
$$;

-- 4. Revoke default EXECUTE from PUBLIC (PostgreSQL grants this by default)
--    and grant only to authenticated. postgres and service_role retain access.
REVOKE EXECUTE ON FUNCTION public.get_feature_flags() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_feature_flags() TO authenticated;

-- 5. Revoke any accidental table-level access (defensive — should already be absent)
--    Also explicitly revoke from anon and PUBLIC to ensure no broad access.
REVOKE SELECT ON public.platform_config FROM authenticated, anon, PUBLIC;

COMMIT;
