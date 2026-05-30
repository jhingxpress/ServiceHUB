-- ============================================================
-- FIX MIGRATION: Create missing Provider Business Platform objects
-- Problem: 20260529220500_provider_business_platform.sql failed
--        early and never created its tables/policies/functions.
--        20260529220600 only fixed service_options.
-- Action: Idempotently create ALL remaining objects:
--         5 tables, 1 column, RLS, 18 policies, 5 functions,
--         then seed existing providers.
-- ============================================================

-- ============================================================
-- 1. TABLES (all CREATE TABLE IF NOT EXISTS)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_checklist (
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE PRIMARY KEY,
  is_approved BOOLEAN DEFAULT FALSE,
  has_first_service BOOLEAN DEFAULT FALSE,
  has_pricing BOOLEAN DEFAULT FALSE,
  has_photos BOOLEAN DEFAULT FALSE,
  has_schedule BOOLEAN DEFAULT FALSE,
  has_first_booking BOOLEAN DEFAULT FALSE,
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.provider_portfolio (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  caption TEXT,
  photo_type TEXT NOT NULL DEFAULT 'completed' CHECK (photo_type IN ('before', 'after', 'completed', 'certificate', 'equipment')),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.provider_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  viewer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.provider_performance (
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE PRIMARY KEY,
  profile_views INTEGER DEFAULT 0,
  total_bookings INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0.00,
  response_rate INTEGER DEFAULT 0 CHECK (response_rate >= 0 AND response_rate <= 100),
  completion_rate INTEGER DEFAULT 0 CHECK (completion_rate >= 0 AND completion_rate <= 100),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.provider_score (
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE PRIMARY KEY,
  score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  color_tier TEXT DEFAULT 'red' CHECK (color_tier IN ('green', 'yellow', 'red')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. SCHEMA ENHANCEMENT (column added in original migration)
-- ============================================================
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS home_visit_fee DECIMAL(10,2) DEFAULT 0.00;

-- ============================================================
-- 3. ENABLE RLS (idempotent)
-- ============================================================
ALTER TABLE public.provider_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_score ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. RLS POLICIES: provider_checklist
-- ============================================================
DROP POLICY IF EXISTS provider_checklist_select_own ON public.provider_checklist;
CREATE POLICY provider_checklist_select_own
  ON public.provider_checklist FOR SELECT
  TO authenticated
  USING (provider_id = auth.uid());

DROP POLICY IF EXISTS provider_checklist_select_all ON public.provider_checklist;
CREATE POLICY provider_checklist_select_all
  ON public.provider_checklist FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS provider_checklist_update_own ON public.provider_checklist;
CREATE POLICY provider_checklist_update_own
  ON public.provider_checklist FOR UPDATE
  TO authenticated
  USING (provider_id = auth.uid())
  WITH CHECK (provider_id = auth.uid());

DROP POLICY IF EXISTS provider_checklist_admin_all ON public.provider_checklist;
CREATE POLICY provider_checklist_admin_all
  ON public.provider_checklist FOR ALL
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- 5. RLS POLICIES: provider_portfolio
-- ============================================================
DROP POLICY IF EXISTS provider_portfolio_select ON public.provider_portfolio;
CREATE POLICY provider_portfolio_select
  ON public.provider_portfolio FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS provider_portfolio_manage_own ON public.provider_portfolio;
CREATE POLICY provider_portfolio_manage_own
  ON public.provider_portfolio FOR ALL
  TO authenticated
  USING (provider_id = auth.uid())
  WITH CHECK (provider_id = auth.uid());

DROP POLICY IF EXISTS provider_portfolio_admin_all ON public.provider_portfolio;
CREATE POLICY provider_portfolio_admin_all
  ON public.provider_portfolio FOR ALL
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- 6. RLS POLICIES: provider_views
-- ============================================================
DROP POLICY IF EXISTS provider_views_insert ON public.provider_views;
CREATE POLICY provider_views_insert
  ON public.provider_views FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS provider_views_select_own ON public.provider_views;
CREATE POLICY provider_views_select_own
  ON public.provider_views FOR SELECT
  TO authenticated
  USING (provider_id = auth.uid());

DROP POLICY IF EXISTS provider_views_admin_all ON public.provider_views;
CREATE POLICY provider_views_admin_all
  ON public.provider_views FOR ALL
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- 7. RLS POLICIES: provider_performance
-- ============================================================
DROP POLICY IF EXISTS provider_performance_select ON public.provider_performance;
CREATE POLICY provider_performance_select
  ON public.provider_performance FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS provider_performance_update_own ON public.provider_performance;
CREATE POLICY provider_performance_update_own
  ON public.provider_performance FOR UPDATE
  TO authenticated
  USING (provider_id = auth.uid())
  WITH CHECK (provider_id = auth.uid());

DROP POLICY IF EXISTS provider_performance_admin_all ON public.provider_performance;
CREATE POLICY provider_performance_admin_all
  ON public.provider_performance FOR ALL
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- 8. RLS POLICIES: provider_score
-- ============================================================
DROP POLICY IF EXISTS provider_score_select ON public.provider_score;
CREATE POLICY provider_score_select
  ON public.provider_score FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS provider_score_update_own ON public.provider_score;
CREATE POLICY provider_score_update_own
  ON public.provider_score FOR UPDATE
  TO authenticated
  USING (provider_id = auth.uid())
  WITH CHECK (provider_id = auth.uid());

DROP POLICY IF EXISTS provider_score_admin_all ON public.provider_score;
CREATE POLICY provider_score_admin_all
  ON public.provider_score FOR ALL
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- 9. FUNCTIONS (CREATE OR REPLACE — idempotent)
-- ============================================================

CREATE OR REPLACE FUNCTION public.compute_provider_checklist(p_provider_id UUID)
RETURNS TABLE (
  is_approved BOOLEAN,
  has_first_service BOOLEAN,
  has_pricing BOOLEAN,
  has_photos BOOLEAN,
  has_schedule BOOLEAN,
  has_first_booking BOOLEAN,
  progress_percent INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (p.status = 'approved') AS is_approved,
    (EXISTS (SELECT 1 FROM public.services s WHERE s.provider_id = p.id)) AS has_first_service,
    (EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.provider_id = p.id
        AND (s.price > 0 OR EXISTS (SELECT 1 FROM public.service_options so WHERE so.service_id = s.id))
    )) AS has_pricing,
    (EXISTS (
      SELECT 1 FROM public.provider_gallery pg WHERE pg.provider_id = p.id
      UNION ALL
      SELECT 1 FROM public.provider_portfolio pp WHERE pp.provider_id = p.id
      LIMIT 1
    )) AS has_photos,
    (EXISTS (SELECT 1 FROM public.availability a WHERE a.provider_id = p.id)) AS has_schedule,
    (EXISTS (SELECT 1 FROM public.bookings b WHERE b.provider_id = p.id)) AS has_first_booking,
    0::INTEGER AS progress_percent
  FROM public.providers p
  WHERE p.id = p_provider_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.refresh_provider_checklist(p_provider_id UUID)
RETURNS void AS $$
DECLARE
  v_is_approved BOOLEAN;
  v_has_first_service BOOLEAN;
  v_has_pricing BOOLEAN;
  v_has_photos BOOLEAN;
  v_has_schedule BOOLEAN;
  v_has_first_booking BOOLEAN;
  v_progress INTEGER;
BEGIN
  SELECT * INTO v_is_approved, v_has_first_service, v_has_pricing, v_has_photos, v_has_schedule, v_has_first_booking
  FROM public.compute_provider_checklist(p_provider_id);

  v_progress := (
    (CASE WHEN v_is_approved THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_first_service THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_pricing THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_photos THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_schedule THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_first_booking THEN 1 ELSE 0 END)
  ) * 100 / 6;

  INSERT INTO public.provider_checklist (
    provider_id, is_approved, has_first_service, has_pricing,
    has_photos, has_schedule, has_first_booking, progress_percent
  )
  VALUES (
    p_provider_id, v_is_approved, v_has_first_service, v_has_pricing,
    v_has_photos, v_has_schedule, v_has_first_booking, v_progress
  )
  ON CONFLICT (provider_id) DO UPDATE SET
    is_approved = EXCLUDED.is_approved,
    has_first_service = EXCLUDED.has_first_service,
    has_pricing = EXCLUDED.has_pricing,
    has_photos = EXCLUDED.has_photos,
    has_schedule = EXCLUDED.has_schedule,
    has_first_booking = EXCLUDED.has_first_booking,
    progress_percent = EXCLUDED.progress_percent,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.compute_provider_score(p_provider_id UUID)
RETURNS TABLE (
  score INTEGER,
  color_tier TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH metrics AS (
    SELECT
      COALESCE(ps.response_rate, 0) AS response_rate,
      COALESCE(
        CASE
          WHEN ps.total_bookings > 0 THEN
            (ps.completed_jobs::DECIMAL / NULLIF(ps.total_bookings, 0) * 100)::INTEGER
          ELSE 0
        END, 0
      ) AS completion_rate,
      COALESCE(ps.average_rating * 20, 0)::INTEGER AS rating_score,
      COALESCE(ps.completed_jobs, 0) AS completed_jobs
    FROM public.provider_stats ps
    WHERE ps.provider_id = p_provider_id
  )
  SELECT
    LEAST(100, GREATEST(0, ROUND((
      metrics.response_rate * 0.30 +
      metrics.completion_rate * 0.30 +
      metrics.rating_score * 0.25 +
      LEAST(metrics.completed_jobs * 2, 100) * 0.15
    ))::INTEGER)) AS score,
    CASE
      WHEN score >= 90 THEN 'green'
      WHEN score >= 75 THEN 'yellow'
      ELSE 'red'
    END AS color_tier
  FROM metrics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.refresh_provider_score(p_provider_id UUID)
RETURNS void AS $$
DECLARE
  v_score INTEGER;
  v_tier TEXT;
BEGIN
  SELECT score, color_tier INTO v_score, v_tier
  FROM public.compute_provider_score(p_provider_id);

  INSERT INTO public.provider_score (provider_id, score, color_tier)
  VALUES (p_provider_id, v_score, v_tier)
  ON CONFLICT (provider_id) DO UPDATE SET
    score = EXCLUDED.score,
    color_tier = EXCLUDED.color_tier,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.refresh_provider_performance(p_provider_id UUID)
RETURNS void AS $$
DECLARE
  v_profile_views INTEGER;
  v_total_bookings INTEGER;
  v_conversion_rate DECIMAL(5,2);
  v_response_rate INTEGER;
  v_completion_rate INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_profile_views
  FROM public.provider_views
  WHERE provider_id = p_provider_id;

  SELECT COUNT(*) INTO v_total_bookings
  FROM public.bookings
  WHERE provider_id = p_provider_id;

  SELECT COALESCE(response_rate, 0) INTO v_response_rate
  FROM public.provider_stats
  WHERE provider_id = p_provider_id;

  SELECT
    CASE
      WHEN COUNT(*) > 0 THEN
        (COUNT(*) FILTER (WHERE status IN ('completed'))::DECIMAL / NULLIF(COUNT(*), 0) * 100)::INTEGER
      ELSE 0
    END INTO v_completion_rate
  FROM public.bookings
  WHERE provider_id = p_provider_id;

  v_conversion_rate := CASE
    WHEN v_profile_views > 0 THEN LEAST(100, (v_total_bookings::DECIMAL / v_profile_views * 100))::DECIMAL(5,2)
    ELSE 0.00
  END;

  INSERT INTO public.provider_performance (
    provider_id, profile_views, total_bookings,
    conversion_rate, response_rate, completion_rate
  )
  VALUES (
    p_provider_id, v_profile_views, v_total_bookings,
    v_conversion_rate, v_response_rate, v_completion_rate
  )
  ON CONFLICT (provider_id) DO UPDATE SET
    profile_views = EXCLUDED.profile_views,
    total_bookings = EXCLUDED.total_bookings,
    conversion_rate = EXCLUDED.conversion_rate,
    response_rate = EXCLUDED.response_rate,
    completion_rate = EXCLUDED.completion_rate,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. SEED: Initialize checklist/performance/score for existing providers
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.providers LOOP
    PERFORM public.refresh_provider_checklist(r.id);
    PERFORM public.refresh_provider_performance(r.id);
    PERFORM public.refresh_provider_score(r.id);
  END LOOP;
END $$;
