-- ============================================================
-- MIGRATION: Marketplace Onboarding Redesign
-- 1. Add marketplace_status and business_status to providers
-- 2. Replace has_first_booking with has_published_profile in checklist
-- 3. Update compute_provider_checklist for 5-step onboarding (20% each)
-- 4. Auto-publish when all prerequisites are met
-- 5. Update provider_checklist table schema
-- ============================================================

-- ============================================================
-- 1. ADD COLUMNS TO providers
-- ============================================================
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS marketplace_status TEXT DEFAULT 'hidden'
    CHECK (marketplace_status IN ('live', 'hidden'));

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS business_status TEXT DEFAULT 'available'
    CHECK (business_status IN ('available', 'busy', 'vacation_mode', 'closed'));

COMMENT ON COLUMN public.providers.marketplace_status IS 'live = visible in marketplace, hidden = not searchable';
COMMENT ON COLUMN public.providers.business_status IS 'Provider availability: available, busy, vacation_mode, closed';

-- ============================================================
-- 2. ADD has_published_profile TO provider_checklist
-- ============================================================
ALTER TABLE public.provider_checklist
  ADD COLUMN IF NOT EXISTS has_published_profile BOOLEAN DEFAULT false;

-- ============================================================
-- 3. DROP and RECREATE compute_provider_checklist
--    (CREATE OR REPLACE fails when OUT parameter row type changes)
-- ============================================================

-- Drop dependent trigger first
DROP TRIGGER IF EXISTS trg_auto_publish_provider ON public.provider_checklist;

-- Drop dependent function
DROP FUNCTION IF EXISTS public.auto_publish_provider();

-- Drop function that depends on compute_provider_checklist
DROP FUNCTION IF EXISTS public.refresh_provider_checklist(UUID);

-- Drop the function whose return type is changing
DROP FUNCTION IF EXISTS public.compute_provider_checklist(UUID);

-- Recreate compute_provider_checklist with new signature
CREATE FUNCTION public.compute_provider_checklist(p_provider_id UUID)
RETURNS TABLE (
  is_approved BOOLEAN,
  has_first_service BOOLEAN,
  has_pricing BOOLEAN,
  has_photos BOOLEAN,
  has_schedule BOOLEAN,
  has_published_profile BOOLEAN,
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
        AND (
          s.price > 0
          OR EXISTS (
            SELECT 1 FROM public.service_options so
            WHERE so.service_id = s.id AND so.is_active = true
          )
        )
    )) AS has_pricing,
    (EXISTS (
      SELECT 1 FROM public.provider_gallery pg WHERE pg.provider_id = p.id
      UNION ALL
      SELECT 1 FROM public.provider_portfolio pp WHERE pp.provider_id = p.id
      UNION ALL
      SELECT 1 FROM public.service_images si
      JOIN public.services sv ON sv.id = si.service_id
      WHERE sv.provider_id = p.id
      LIMIT 1
    )) AS has_photos,
    (EXISTS (
      SELECT 1 FROM public.availability a
      WHERE a.provider_id = p.id AND a.is_available = true
    )) AS has_schedule,
    (p.marketplace_status = 'live') AS has_published_profile,
    0::INTEGER AS progress_percent
  FROM public.providers p
  WHERE p.id = p_provider_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. RECREATE refresh_provider_checklist (5 items = 20% each)
-- ============================================================
CREATE FUNCTION public.refresh_provider_checklist(p_provider_id UUID)
RETURNS void AS $$
DECLARE
  v_is_approved BOOLEAN;
  v_has_first_service BOOLEAN;
  v_has_pricing BOOLEAN;
  v_has_photos BOOLEAN;
  v_has_schedule BOOLEAN;
  v_has_published_profile BOOLEAN;
  v_progress INTEGER;
BEGIN
  SELECT * INTO v_is_approved, v_has_first_service, v_has_pricing, v_has_photos, v_has_schedule, v_has_published_profile
  FROM public.compute_provider_checklist(p_provider_id);

  -- 5 steps, each worth 20%
  v_progress := (
    (CASE WHEN v_is_approved THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_first_service THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_pricing THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_photos THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_schedule THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_published_profile THEN 1 ELSE 0 END)
  ) * 100 / 5;

  INSERT INTO public.provider_checklist (
    provider_id, is_approved, has_first_service, has_pricing,
    has_photos, has_schedule, has_published_profile, progress_percent
  )
  VALUES (
    p_provider_id, v_is_approved, v_has_first_service, v_has_pricing,
    v_has_photos, v_has_schedule, v_has_published_profile, v_progress
  )
  ON CONFLICT (provider_id) DO UPDATE SET
    is_approved = EXCLUDED.is_approved,
    has_first_service = EXCLUDED.has_first_service,
    has_pricing = EXCLUDED.has_pricing,
    has_photos = EXCLUDED.has_photos,
    has_schedule = EXCLUDED.has_schedule,
    has_published_profile = EXCLUDED.has_published_profile,
    progress_percent = EXCLUDED.progress_percent,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. RECREATE auto-publish function and trigger
-- ============================================================
CREATE FUNCTION public.auto_publish_provider()
RETURNS TRIGGER AS $$
BEGIN
  -- If all onboarding steps except publishing are complete, auto-publish
  IF NEW.is_approved
     AND NEW.has_first_service
     AND NEW.has_pricing
     AND NEW.has_photos
     AND NEW.has_schedule
     AND NOT NEW.has_published_profile
  THEN
    UPDATE public.providers
    SET marketplace_status = 'live'
    WHERE id = NEW.provider_id;

    -- Refresh checklist again so has_published_profile becomes true
    PERFORM public.refresh_provider_checklist(NEW.provider_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_auto_publish_provider
  AFTER INSERT OR UPDATE ON public.provider_checklist
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_publish_provider();

-- ============================================================
-- 6. BACKFILL: Set marketplace_status = 'live' for providers already complete
-- ============================================================
UPDATE public.providers p
SET marketplace_status = 'live'
WHERE p.status = 'approved'
  AND EXISTS (SELECT 1 FROM public.services s WHERE s.provider_id = p.id)
  AND EXISTS (
    SELECT 1 FROM public.services s
    WHERE s.provider_id = p.id
      AND (s.price > 0 OR EXISTS (SELECT 1 FROM public.service_options so WHERE so.service_id = s.id AND so.is_active = true))
  )
  AND EXISTS (
    SELECT 1 FROM public.provider_gallery pg WHERE pg.provider_id = p.id
    UNION ALL
    SELECT 1 FROM public.provider_portfolio pp WHERE pp.provider_id = p.id
    UNION ALL
    SELECT 1 FROM public.service_images si JOIN public.services sv ON sv.id = si.service_id WHERE sv.provider_id = p.id
    LIMIT 1
  )
  AND EXISTS (SELECT 1 FROM public.availability a WHERE a.provider_id = p.id AND a.is_available = true);

-- Refresh all checklists after backfill
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.providers LOOP
    PERFORM public.refresh_provider_checklist(r.id);
  END LOOP;
END $$;
