-- ============================================================
-- MIGRATION: Service Photo Upload System
-- 1. Update compute_provider_checklist to include service_images
--    in the has_photos check.
-- 2. Add auto-refresh trigger on service_images table.
-- 3. Create service-images storage bucket with policies.
-- ============================================================

-- ============================================================
-- 1. FIX compute_provider_checklist to check service_images
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
    (EXISTS (SELECT 1 FROM public.bookings b WHERE b.provider_id = p.id)) AS has_first_booking,
    0::INTEGER AS progress_percent
  FROM public.providers p
  WHERE p.id = p_provider_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. TRIGGER: refresh checklist on service_images changes
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_refresh_checklist_on_image_change()
RETURNS TRIGGER AS $$
DECLARE
  v_provider_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT provider_id INTO v_provider_id FROM public.services WHERE id = OLD.service_id;
  ELSE
    SELECT provider_id INTO v_provider_id FROM public.services WHERE id = NEW.service_id;
  END IF;

  IF v_provider_id IS NOT NULL THEN
    PERFORM public.refresh_provider_checklist(v_provider_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_images_after_change ON public.service_images;
CREATE TRIGGER service_images_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.service_images
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_checklist_on_image_change();

-- ============================================================
-- 3. STORAGE: service-images bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('service-images', 'service-images', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  CREATE POLICY "Providers can upload service images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'service-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

DO $$
BEGIN
  CREATE POLICY "Public can read service images"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'service-images');
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

DO $$
BEGIN
  CREATE POLICY "Providers can delete their own service images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'service-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;
