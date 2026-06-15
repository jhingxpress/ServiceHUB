-- ============================================================
-- SPRINT 3.7 — Featured Provider Payments
-- Creates featured_payments table to record PayMongo TEST
-- checkout sessions and payment events.
--
-- Design principles:
--  * TEST MODE ONLY — no automatic featured approval.
--  * Admin approval remains required after payment.
--  * Service-role-only writes (webhook); providers can read own.
--  * Idempotent: ON CONFLICT guards prevent duplicate rows.
--  * Schema is intentionally generic so the same table can
--    later support tips, renewals, and subscription plans.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.featured_payments (
  id                    UUID          DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Owning provider
  provider_id           UUID          NOT NULL
                          REFERENCES public.providers(id) ON DELETE CASCADE,

  -- Link to the corresponding featured_requests row (nullable so the
  -- payment record can outlive a deleted/rejected request)
  featured_request_id   UUID
                          REFERENCES public.featured_requests(id) ON DELETE SET NULL,

  -- Payment amount and currency
  amount                NUMERIC       NOT NULL,
  currency              TEXT          NOT NULL DEFAULT 'PHP',

  -- PayMongo identifiers
  paymongo_checkout_id  TEXT,
  paymongo_payment_id   TEXT,

  -- Convenience: stored so the app can re-open an unpaid checkout
  checkout_url          TEXT,

  -- Payment lifecycle status
  status                TEXT          NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),

  -- Timestamps
  created_at            TIMESTAMPTZ   DEFAULT NOW(),
  paid_at               TIMESTAMPTZ
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_featured_payments_provider
  ON public.featured_payments (provider_id);

CREATE INDEX IF NOT EXISTS idx_featured_payments_status
  ON public.featured_payments (status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_featured_payments_checkout_id
  ON public.featured_payments (paymongo_checkout_id)
  WHERE paymongo_checkout_id IS NOT NULL;

-- ============================================================
-- Comments
-- ============================================================
COMMENT ON TABLE  public.featured_payments IS
  'PayMongo TEST checkout sessions for Featured Provider promotions.';

COMMENT ON COLUMN public.featured_payments.status IS
  'pending=checkout created; paid=payment confirmed by webhook; failed=checkout expired/cancelled; refunded=manually refunded.';

COMMENT ON COLUMN public.featured_payments.checkout_url IS
  'PayMongo checkout URL stored for re-opening unpaid sessions.';

COMMENT ON COLUMN public.featured_payments.paymongo_checkout_id IS
  'PayMongo checkout_session id (cs_xxxxx). Used to match webhook events.';

COMMENT ON COLUMN public.featured_payments.paymongo_payment_id IS
  'PayMongo payment id recorded when webhook confirms payment.';

-- ============================================================
-- Row-Level Security
-- ============================================================
ALTER TABLE public.featured_payments ENABLE ROW LEVEL SECURITY;

-- Provider: read own payment records only
DROP POLICY IF EXISTS "featured_payments provider select" ON public.featured_payments;
CREATE POLICY "featured_payments provider select"
  ON public.featured_payments
  FOR SELECT
  USING (auth.uid() = provider_id);

-- Provider: cannot insert directly — inserts are done by the
-- create-featured-checkout Edge Function using the service role key.

-- Admin: full read access
DROP POLICY IF EXISTS "featured_payments admin select" ON public.featured_payments;
CREATE POLICY "featured_payments admin select"
  ON public.featured_payments
  FOR SELECT
  USING (public.is_admin());

-- Admin: update (e.g. manual refund)
DROP POLICY IF EXISTS "featured_payments admin update" ON public.featured_payments;
CREATE POLICY "featured_payments admin update"
  ON public.featured_payments
  FOR UPDATE
  USING (public.is_admin());

-- ============================================================
-- Verification
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'featured_payments'
  ) THEN
    RAISE EXCEPTION 'featured_payments table was not created';
  END IF;
  RAISE NOTICE 'featured_payments table OK';
END $$;
