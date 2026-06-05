-- ============================================================
-- Fix: refresh_provider_checklist fails when provider is deleted
-- Date: 2026-06-05
-- ============================================================
--
-- Problem: When a provider is cascade-deleted (e.g. via public.users
-- ON DELETE CASCADE), the services_after_change trigger fires and
-- calls refresh_provider_checklist() for a provider_id that no longer
-- exists in public.providers, causing FK violation.
--
-- Fix: Add an existence check before INSERT.
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_provider_checklist(p_provider_id UUID)
RETURNS void AS $$
DECLARE
  v_is_approved BOOLEAN;
  v_has_first_service BOOLEAN;
  v_has_pricing BOOLEAN;
  v_has_photos BOOLEAN;
  v_has_schedule BOOLEAN;
  v_has_business_profile BOOLEAN;
  v_has_first_booking BOOLEAN;
  v_progress INTEGER;
  v_provider_exists BOOLEAN;
BEGIN
  -- Skip if provider no longer exists (e.g. cascade delete in progress)
  SELECT EXISTS(SELECT 1 FROM public.providers WHERE id = p_provider_id)
    INTO v_provider_exists;

  IF NOT v_provider_exists THEN
    RETURN;
  END IF;

  SELECT * INTO v_is_approved, v_has_first_service, v_has_pricing, v_has_photos, v_has_schedule, v_has_first_booking
  FROM public.compute_provider_checklist(p_provider_id);

  v_progress := (
    (CASE WHEN v_is_approved THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_first_service THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_pricing THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_photos THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_schedule THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_business_profile THEN 1 ELSE 0 END) +
    (CASE WHEN v_has_first_booking THEN 1 ELSE 0 END)
  ) * 100 / 7;

  INSERT INTO public.provider_checklist (
    provider_id, is_approved, has_first_service, has_pricing,
    has_photos, has_schedule, has_business_profile, has_first_booking, progress_percent
  )
  VALUES (
    p_provider_id, v_is_approved, v_has_first_service, v_has_pricing,
    v_has_photos, v_has_schedule, v_has_business_profile, v_has_first_booking, v_progress
  )
  ON CONFLICT (provider_id) DO UPDATE SET
    is_approved = EXCLUDED.is_approved,
    has_first_service = EXCLUDED.has_first_service,
    has_pricing = EXCLUDED.has_pricing,
    has_photos = EXCLUDED.has_photos,
    has_schedule = EXCLUDED.has_schedule,
    has_business_profile = EXCLUDED.has_business_profile,
    has_first_booking = EXCLUDED.has_first_booking,
    progress_percent = EXCLUDED.progress_percent,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
