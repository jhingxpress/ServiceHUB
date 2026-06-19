-- ============================================================
-- Migration: Create provider_analytics table (isolated analytics layer)
-- Sprint 4.0B — Safe Isolated Architecture
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_analytics (
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE PRIMARY KEY,
  profile_views INTEGER NOT NULL DEFAULT 0,
  booking_requests INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.provider_analytics IS 'Isolated provider analytics metrics. DO NOT mix with provider_stats or provider_performance.';
COMMENT ON COLUMN public.provider_analytics.profile_views IS 'Count of customer profile views (fed by provider_views insertions)';
COMMENT ON COLUMN public.provider_analytics.booking_requests IS 'Count of booking requests received (fed by bookings insertions)';

-- RLS
ALTER TABLE public.provider_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider analytics public read" ON public.provider_analytics;

-- Provider can read own analytics only
DROP POLICY IF EXISTS "Provider analytics owner select" ON public.provider_analytics;
CREATE POLICY "Provider analytics owner select" ON public.provider_analytics FOR SELECT USING (auth.uid() = provider_id);

-- Admin full access
DROP POLICY IF EXISTS "Provider analytics admin all" ON public.provider_analytics;
CREATE POLICY "Provider analytics admin all" ON public.provider_analytics FOR ALL USING (public.is_admin());
