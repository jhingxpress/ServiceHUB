-- ============================================================
-- Migration: ServiceHub Tip System
-- Sprint 4.0
-- Date: 2026-06-16
-- ============================================================

-- ── Table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.servicehub_tips (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount                INTEGER NOT NULL CHECK (amount >= 2000 AND amount <= 1000000), -- centavos: ₱20–₱10,000
  currency              TEXT NOT NULL DEFAULT 'PHP',
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  paymongo_checkout_id  TEXT,
  paymongo_payment_id   TEXT,
  checkout_url          TEXT,
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_servicehub_tips_user_id    ON public.servicehub_tips(user_id);
CREATE INDEX IF NOT EXISTS idx_servicehub_tips_status     ON public.servicehub_tips(status);
CREATE INDEX IF NOT EXISTS idx_servicehub_tips_created_at ON public.servicehub_tips(created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.servicehub_tips ENABLE ROW LEVEL SECURITY;

-- Users can view their own tips
CREATE POLICY "Users view own tips"
  ON public.servicehub_tips FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can create their own tips
CREATE POLICY "Users create own tips"
  ON public.servicehub_tips FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all tips
CREATE POLICY "Admins view all tips"
  ON public.servicehub_tips FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role (Edge Functions) bypass RLS
-- (service_role key already bypasses RLS in Supabase)
