-- ============================================================
-- Migration: Automatic Featured Provider Expiration
-- Sprint 3.7.1
-- Date: 2026-06-16
--
-- Prerequisites:
--   pg_cron extension must be enabled in the Supabase dashboard:
--   Project Settings → Database → Extensions → pg_cron → Enable
--
-- What this creates:
--   1. expire_featured_providers() — SQL function that downgrades
--      providers whose featured_until has passed.
--   2. pg_cron job — runs the function daily at 00:05 UTC.
--
-- Notifications (expired + expiring-soon push alerts) are handled
-- by the expire-featured-providers Edge Function, which can be
-- invoked separately or triggered from pg_cron via pg_net.
-- ============================================================

-- ── 1. Expiration SQL function ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_featured_providers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expired_ids  UUID[];
  v_expired_count INT := 0;
BEGIN
  -- Atomically downgrade overdue featured providers and capture IDs
  WITH expired AS (
    UPDATE public.providers
    SET
      is_featured   = false,
      featured_until = NULL
    WHERE
      is_featured    = true
      AND featured_until IS NOT NULL
      AND featured_until < NOW()
    RETURNING id
  )
  SELECT
    COUNT(*),
    ARRAY_AGG(id)
  INTO v_expired_count, v_expired_ids
  FROM expired;

  -- Log each expiration in provider_verification_logs
  IF v_expired_count > 0 THEN
    INSERT INTO public.provider_verification_logs (
      provider_id, action, performed_by, notes
    )
    SELECT
      unnest(v_expired_ids),
      'featured_expired_auto',
      NULL,
      'Featured status automatically expired by scheduled pg_cron job.';
  END IF;

  RETURN jsonb_build_object(
    'expired_count', v_expired_count,
    'expired_ids',   COALESCE(to_json(v_expired_ids)::jsonb, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.expire_featured_providers() IS
  'Downgrades providers whose featured_until has passed. Called daily by pg_cron.';

-- ── 2. Schedule via pg_cron ───────────────────────────────────────────────────
-- Unschedule previous version if it exists (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-featured-providers') THEN
    PERFORM cron.unschedule('expire-featured-providers');
  END IF;
END $$;

-- Run at 00:05 UTC daily (5 min offset avoids midnight contention)
SELECT cron.schedule(
  'expire-featured-providers',
  '5 0 * * *',
  'SELECT public.expire_featured_providers()'
);

-- ── 3. Verification ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-featured-providers') THEN
    RAISE EXCEPTION 'pg_cron job was not created — ensure pg_cron extension is enabled';
  END IF;
  RAISE NOTICE 'expire-featured-providers cron job OK';
END $$;
