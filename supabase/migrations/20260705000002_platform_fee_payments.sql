-- ============================================================
-- Phase 2a: Provider Platform Fee Payment Sessions
-- Date: 2026-07-05
-- ============================================================
--
-- Adds:
--   provider_platform_fees.paid_at       — timestamp when fee was marked paid
--   platform_fee_payments                — one row per checkout session
--   RLS policies for platform_fee_payments
--   notifications_type_check extended with 'platform_fee_paid'
-- ============================================================

-- ── 1. Add paid_at to provider_platform_fees ─────────────────
ALTER TABLE public.provider_platform_fees
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- ── 2. Platform Fee Payment Sessions ─────────────────────────
--   One row per PayMongo checkout attempt.
--   platform_fee_ids is the array of provider_platform_fees.id rows being paid.
CREATE TABLE IF NOT EXISTS public.platform_fee_payments (
  id                   UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id          UUID          NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  platform_fee_ids     UUID[]        NOT NULL,
  total_amount         DECIMAL(10,2) NOT NULL,
  status               TEXT          NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
  paymongo_checkout_id TEXT          UNIQUE,
  paymongo_payment_id  TEXT,
  checkout_url         TEXT,
  payment_method       TEXT,
  paid_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ   DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pfp_provider
  ON public.platform_fee_payments(provider_id);
CREATE INDEX IF NOT EXISTS idx_pfp_checkout
  ON public.platform_fee_payments(paymongo_checkout_id)
  WHERE paymongo_checkout_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pfp_status
  ON public.platform_fee_payments(status);

-- ── 3. RLS ────────────────────────────────────────────────────
ALTER TABLE public.platform_fee_payments ENABLE ROW LEVEL SECURITY;

-- Providers read their own sessions only
DROP POLICY IF EXISTS "pfp_provider_read" ON public.platform_fee_payments;
CREATE POLICY "pfp_provider_read" ON public.platform_fee_payments
  FOR SELECT
  USING (auth.uid() = provider_id);

-- Admin and staff read all
DROP POLICY IF EXISTS "pfp_admin_staff_read" ON public.platform_fee_payments;
CREATE POLICY "pfp_admin_staff_read" ON public.platform_fee_payments
  FOR SELECT
  USING (public.is_admin_or_staff());

-- Only admin may update (manual reconciliation)
-- INSERTs and webhook UPDATEs are done via SECURITY DEFINER edge functions (service role)
DROP POLICY IF EXISTS "pfp_admin_update" ON public.platform_fee_payments;
CREATE POLICY "pfp_admin_update" ON public.platform_fee_payments
  FOR UPDATE
  USING (public.is_admin());

-- ── 4. Extend notifications_type_check ────────────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- Booking lifecycle
    'booking_submitted',
    'booking_accepted',
    'booking_rejected',
    'booking_cancelled',
    'booking_on_the_way',
    'booking_arrived',
    'booking_in_progress',
    'booking_completed',
    'booking_reminder',
    'provider_on_the_way',
    'provider_arrived',
    -- Messages
    'chat_message',
    'new_message',
    -- Legacy
    'service_completed',
    -- Reviews
    'review_received',
    'review_reminder',
    -- Provider verification
    'verification_approved',
    'verification_rejected',
    'document_approved',
    'document_rejected',
    -- Featured provider
    'featured_approved',
    -- Disputes
    'dispute_opened',
    'dispute_updated',
    'dispute_resolved',
    -- Admin broadcasts
    'announcement',
    'maintenance',
    'policy_update',
    'marketing',
    -- Generic
    'system',
    -- Platform fees (Phase 1)
    'platform_fee_added',
    'platform_fee_reminder',
    'platform_fee_overdue',
    -- Platform fee payment (Phase 2)
    'platform_fee_paid'
  ));
