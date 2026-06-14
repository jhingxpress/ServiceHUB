-- ============================================================
-- SPRINT 3.2 — Featured Provider Request Flow
-- Creates featured_requests table for providers to request
-- Featured Provider status. Uses query-based admin alert pattern
-- (same as disputes/reports). Does NOT modify notifications table.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.featured_requests (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected')),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- One active pending request per provider at a time
-- A new request can only be submitted after the previous one is resolved
CREATE UNIQUE INDEX IF NOT EXISTS idx_featured_requests_provider_pending
  ON public.featured_requests (provider_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_featured_requests_status
  ON public.featured_requests (status);

ALTER TABLE public.featured_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- Ownership model: providers.id = auth.uid() (verified from
-- existing policies: "Providers public read" uses auth.uid() = id,
-- and all provider screens query providers with .eq('id', user.id))
-- Therefore: auth.uid() = provider_id is the correct ownership check.
-- ============================================================

-- Provider: insert their own request
DROP POLICY IF EXISTS "featured_requests provider insert" ON public.featured_requests;
CREATE POLICY "featured_requests provider insert" ON public.featured_requests
  FOR INSERT
  WITH CHECK (auth.uid() = provider_id);

-- Provider: read their own requests
DROP POLICY IF EXISTS "featured_requests provider select" ON public.featured_requests;
CREATE POLICY "featured_requests provider select" ON public.featured_requests
  FOR SELECT
  USING (auth.uid() = provider_id);

-- Admin: read all pending/resolved requests
DROP POLICY IF EXISTS "featured_requests admin select" ON public.featured_requests;
CREATE POLICY "featured_requests admin select" ON public.featured_requests
  FOR SELECT
  USING (public.is_admin());

-- Admin: approve or reject requests
DROP POLICY IF EXISTS "featured_requests admin update" ON public.featured_requests;
CREATE POLICY "featured_requests admin update" ON public.featured_requests
  FOR UPDATE
  USING (public.is_admin());
