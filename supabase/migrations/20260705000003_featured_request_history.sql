-- ============================================================
-- Sprint: Notification Reliability & Beta Polish
-- Date: 2026-07-05
-- ============================================================
--
-- Adds history tracking columns to featured_requests so that
-- approval date, rejection date, and expiry are stored even
-- after the provider's is_featured status expires.
--
-- Also adds a BEFORE UPDATE trigger to auto-populate
-- approved_at / rejected_at when admin changes the status.
-- ============================================================

-- ── 1. Add history columns to featured_requests ───────────────
ALTER TABLE public.featured_requests
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at    TIMESTAMPTZ;

-- ── 2. Trigger: auto-populate approved_at / rejected_at ───────
--
-- The trigger fires BEFORE UPDATE on featured_requests.
-- When status transitions to 'approved', it sets approved_at = NOW().
-- When status transitions to 'rejected', it sets rejected_at = NOW().
-- When approved, it also copies providers.featured_until → expires_at
-- so the history record retains the expiry even after the slot ends.
-- ── ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.featured_request_status_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    NEW.approved_at := NOW();
    NEW.rejected_at := NULL;
    -- Copy the provider's current featured_until as the expiry snapshot
    SELECT featured_until
    INTO   NEW.expires_at
    FROM   public.providers
    WHERE  id = NEW.provider_id;
  END IF;

  IF NEW.status = 'rejected' AND (OLD.status IS DISTINCT FROM 'rejected') THEN
    NEW.rejected_at := NOW();
    NEW.approved_at := NULL;
    NEW.expires_at  := NULL;
  END IF;

  IF NEW.status = 'cancelled' AND (OLD.status IS DISTINCT FROM 'cancelled') THEN
    NEW.approved_at := NULL;
    NEW.rejected_at := NULL;
    NEW.expires_at  := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS featured_request_status_audit_trigger ON public.featured_requests;

CREATE TRIGGER featured_request_status_audit_trigger
  BEFORE UPDATE ON public.featured_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.featured_request_status_audit();

-- ── 3. Back-fill approved_at for existing approved rows ───────
--
-- Uses created_at as a conservative approximation for rows that
-- pre-date this migration (better than leaving them NULL).
-- ── ────────────────────────────────────────────────────────────
UPDATE public.featured_requests
SET    approved_at = COALESCE(approved_at, created_at)
WHERE  status = 'approved'
  AND  approved_at IS NULL;

UPDATE public.featured_requests
SET    rejected_at = COALESCE(rejected_at, created_at)
WHERE  status = 'rejected'
  AND  rejected_at IS NULL;

-- ── 4. Back-fill expires_at from providers.featured_until ─────
--
-- For currently active approved requests, snapshot the expiry.
-- ── ────────────────────────────────────────────────────────────
UPDATE public.featured_requests fr
SET    expires_at = p.featured_until
FROM   public.providers p
WHERE  fr.provider_id = p.id
  AND  fr.status      = 'approved'
  AND  fr.expires_at  IS NULL
  AND  p.featured_until IS NOT NULL;
