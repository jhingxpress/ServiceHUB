-- ============================================================
-- MIGRATION: Provider Business Profile System
-- 1. Add business profile columns to providers
-- 2. Create storage buckets for profile/cover images
-- 3. Update checklist schema: has_published_profile -> has_business_profile
-- 4. Update compute/refresh checklist functions
-- 5. Add provider update trigger for checklist auto-refresh
-- ============================================================

-- ============================================================
-- 1. ADD BUSINESS PROFILE COLUMNS TO providers
-- ============================================================

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS cover_photo_url TEXT;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS business_headline TEXT;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS business_description TEXT;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS certifications TEXT;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false;

-- ============================================================
-- 2. CREATE STORAGE BUCKETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('provider-profile-images', 'provider-profile-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('provider-cover-images', 'provider-cover-images', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. STORAGE RLS POLICIES
-- ============================================================

-- Profile images: providers can upload their own
DO $$
BEGIN
  CREATE POLICY "Providers can upload profile images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'provider-profile-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

DO $$
BEGIN
  CREATE POLICY "Public can read profile images"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'provider-profile-images');
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

DO $$
BEGIN
  CREATE POLICY "Providers can delete their own profile images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'provider-profile-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

-- Cover images: providers can upload their own
DO $$
BEGIN
  CREATE POLICY "Providers can upload cover images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'provider-cover-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

DO $$
BEGIN
  CREATE POLICY "Public can read cover images"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'provider-cover-images');
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

DO $$
BEGIN
  CREATE POLICY "Providers can delete their own cover images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'provider-cover-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

-- ============================================================
-- 4. UPDATE provider_checklist TABLE SCHEMA
-- ============================================================

ALTER TABLE public.provider_checklist
  DROP COLUMN IF EXISTS has_published_profile;

ALTER TABLE public.provider_checklist
  ADD COLUMN IF NOT EXISTS has_business_profile BOOLEAN DEFAULT false;

-- ============================================================
-- 5. DROP AND RECREATE compute_provider_checklist
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
  has_business_profile BOOLEAN,
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
    (
      p.profile_photo_url IS NOT NULL
      AND p.cover_photo_url IS NOT NULL
      AND COALESCE(TRIM(p.business_name), '') <> ''
      AND COALESCE(TRIM(p.business_headline), '') <> ''
      AND COALESCE(TRIM(p.business_description), '') <> ''
      AND COALESCE(TRIM(p.service_area), '') <> ''
    ) AS has_business_profile,
    0::INTEGER AS progress_percent
  FROM public.providers p
  WHERE p.id = p_provider_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. RECREATE refresh_provider_checklist (6 items)
-- ============================================================
CREATE FUNCTION public.refresh_provider_checklist(p_provider_id UUID)
RETURNS void AS $$
DECLARE
  v_is_approved BOOLEAN;
  v_has_first_service BOOLEAN;
  v_has_pricing BOOLEAN;
  v_has_photos BOOLEAN;
  v_has_schedule BOOLEAN;
  v_has_business_profile BOOLEAN;
  v_progress INTEGER;
BEGIN
  SELECT * INTO v_is_approved, v_has_first_service, v_has_pricing, v_has_photos, v_has_schedule, v_has_business_profile
  FROM public.compute_provider_checklist(p_provider_id);

  -- 6 onboarding items; cap at 100%
  v_progress := LEAST(100, (
    (CASE WHEN v_is_approved THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_first_service THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_pricing THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_photos THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_schedule THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_business_profile THEN 1 ELSE 0 END)
  ) * 100 / 6);

  INSERT INTO public.provider_checklist (
    provider_id, is_approved, has_first_service, has_pricing,
    has_photos, has_schedule, has_business_profile, progress_percent
  )
  VALUES (
    p_provider_id, v_is_approved, v_has_first_service, v_has_pricing,
    v_has_photos, v_has_schedule, v_has_business_profile, v_progress
  )
  ON CONFLICT (provider_id) DO UPDATE SET
    is_approved = EXCLUDED.is_approved,
    has_first_service = EXCLUDED.has_first_service,
    has_pricing = EXCLUDED.has_pricing,
    has_photos = EXCLUDED.has_photos,
    has_schedule = EXCLUDED.has_schedule,
    has_business_profile = EXCLUDED.has_business_profile,
    progress_percent = EXCLUDED.progress_percent,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. RECREATE auto-publish function and trigger
-- ============================================================
CREATE FUNCTION public.auto_publish_provider()
RETURNS TRIGGER AS $$
BEGIN
  -- If all onboarding steps are complete, auto-publish to marketplace
  IF NEW.is_approved
     AND NEW.has_first_service
     AND NEW.has_pricing
     AND NEW.has_photos
     AND NEW.has_schedule
     AND NEW.has_business_profile
     AND (SELECT marketplace_status FROM public.providers WHERE id = NEW.provider_id) != 'live'
  THEN
    UPDATE public.providers
    SET marketplace_status = 'live'
    WHERE id = NEW.provider_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_auto_publish_provider
  AFTER INSERT OR UPDATE ON public.provider_checklist
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_publish_provider();

-- ============================================================
-- 8. TRIGGER: Refresh checklist when provider profile fields change
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_refresh_checklist_on_provider_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.profile_photo_url IS DISTINCT FROM NEW.profile_photo_url
     OR OLD.cover_photo_url IS DISTINCT FROM NEW.cover_photo_url
     OR OLD.business_name IS DISTINCT FROM NEW.business_name
     OR OLD.business_headline IS DISTINCT FROM NEW.business_headline
     OR OLD.business_description IS DISTINCT FROM NEW.business_description
     OR OLD.service_area IS DISTINCT FROM NEW.service_area
     OR OLD.profile_completed IS DISTINCT FROM NEW.profile_completed
     OR OLD.marketplace_status IS DISTINCT FROM NEW.marketplace_status
  THEN
    PERFORM public.refresh_provider_checklist(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_refresh_checklist_on_provider_update ON public.providers;
CREATE TRIGGER trg_refresh_checklist_on_provider_update
  AFTER UPDATE ON public.providers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_checklist_on_provider_update();

-- ============================================================
-- 9. REFRESH ALL CHECKLISTS
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.providers LOOP
    PERFORM public.refresh_provider_checklist(r.id);
  END LOOP;
END $$;
