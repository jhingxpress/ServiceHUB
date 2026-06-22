-- Sprint 6.2A: Live Tracking Hardening
-- Adds provider DELETE policy (needed for app-level lifecycle cleanup)
-- and a callable stale-row cleanup function.

-- ── DELETE policy ──────────────────────────────────────────────────────────────
-- Provider may delete their own live location row (e.g. on booking complete/cancel).

CREATE POLICY "pll_provider_delete"
  ON public.provider_live_locations
  FOR DELETE TO authenticated
  USING (provider_id = auth.uid());

-- ── Stale row cleanup function ────────────────────────────────────────────────
-- Removes rows older than 24 hours (covers any orphans from crashes / missed deletes).
-- Call manually:  SELECT cleanup_stale_provider_live_locations();
-- Or schedule via pg_cron if available:
--   SELECT cron.schedule(
--     'cleanup-live-locations',
--     '0 * * * *',          -- every hour
--     $$SELECT cleanup_stale_provider_live_locations();$$
--   );

CREATE OR REPLACE FUNCTION public.cleanup_stale_provider_live_locations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.provider_live_locations
  WHERE updated_at < now() - interval '24 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Restrict execution to authenticated users and service_role.
REVOKE ALL ON FUNCTION public.cleanup_stale_provider_live_locations() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cleanup_stale_provider_live_locations() TO service_role;
