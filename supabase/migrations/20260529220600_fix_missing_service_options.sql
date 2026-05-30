-- ============================================================
-- FIX MIGRATION: Create missing public.service_options table
-- Problem: 20260529220500_provider_business_platform.sql
--        references public.service_options, but the table was
--        never created via migration in this environment.
-- Action: Idempotently create table + index + RLS + policies,
--         then recreate dependent functions.
-- ============================================================

-- 1. Create the missing table (matches schema.sql exactly)
CREATE TABLE IF NOT EXISTS public.service_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index
CREATE INDEX IF NOT EXISTS idx_service_options_service ON public.service_options(service_id);

-- 3. RLS
ALTER TABLE public.service_options ENABLE ROW LEVEL SECURITY;

-- 4. Policies (idempotent)
DROP POLICY IF EXISTS "Service options public read" ON public.service_options;
CREATE POLICY "Service options public read"
  ON public.service_options FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service options provider insert" ON public.service_options;
CREATE POLICY "Service options provider insert"
  ON public.service_options FOR INSERT
  WITH CHECK (auth.uid() = (SELECT provider_id FROM public.services WHERE id = service_id));

DROP POLICY IF EXISTS "Service options provider update" ON public.service_options;
CREATE POLICY "Service options provider update"
  ON public.service_options FOR UPDATE
  USING (auth.uid() = (SELECT provider_id FROM public.services WHERE id = service_id));

DROP POLICY IF EXISTS "Service options provider delete" ON public.service_options;
CREATE POLICY "Service options provider delete"
  ON public.service_options FOR DELETE
  USING (auth.uid() = (SELECT provider_id FROM public.services WHERE id = service_id));

-- 5. Recreate functions that depend on public.service_options
--    (they may have failed to create in the previous migration)

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

-- 6. Re-seed checklist for all providers (idempotent via ON CONFLICT)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.providers LOOP
    PERFORM public.refresh_provider_checklist(r.id);
  END LOOP;
END $$;
