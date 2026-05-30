-- ============================================================
-- MIGRATION: Auto-refresh provider checklist/score + dedupe guard
-- Reason:
--   1. provider_checklist never updates after a service is inserted
--      because nothing calls refresh_provider_checklist() at runtime.
--   2. provider_score never updates after bookings/reviews change.
--   3. Nothing prevents a provider from inserting the same service
--      name twice.
-- ============================================================

-- ============================================================
-- 1. UNIQUE INDEX: prevent duplicate service names per provider
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_services_provider_name_unique
  ON public.services (provider_id, LOWER(name))
  WHERE deleted_at IS NULL;

-- ============================================================
-- 2. TRIGGER: refresh provider_checklist on services change
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_refresh_checklist_on_service_change()
RETURNS TRIGGER AS $$
DECLARE
  v_provider_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_provider_id := OLD.provider_id;
  ELSE
    v_provider_id := NEW.provider_id;
  END IF;

  IF v_provider_id IS NOT NULL THEN
    PERFORM public.refresh_provider_checklist(v_provider_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS services_after_change ON public.services;
CREATE TRIGGER services_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_checklist_on_service_change();

-- ============================================================
-- 3. TRIGGER: refresh provider_checklist on service_options change
--    (affects has_pricing flag)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_refresh_checklist_on_option_change()
RETURNS TRIGGER AS $$
DECLARE
  v_service_id UUID;
  v_provider_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_service_id := OLD.service_id;
  ELSE
    v_service_id := NEW.service_id;
  END IF;

  SELECT provider_id INTO v_provider_id
  FROM public.services
  WHERE id = v_service_id;

  IF v_provider_id IS NOT NULL THEN
    PERFORM public.refresh_provider_checklist(v_provider_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_options_after_change ON public.service_options;
CREATE TRIGGER service_options_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.service_options
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_checklist_on_option_change();

-- ============================================================
-- 4. TRIGGER: refresh provider_checklist + score on bookings change
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_refresh_on_booking_change()
RETURNS TRIGGER AS $$
DECLARE
  v_provider_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_provider_id := OLD.provider_id;
  ELSE
    v_provider_id := NEW.provider_id;
  END IF;

  IF v_provider_id IS NOT NULL THEN
    PERFORM public.refresh_provider_checklist(v_provider_id);
    PERFORM public.refresh_provider_score(v_provider_id);
    PERFORM public.refresh_provider_performance(v_provider_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_after_change ON public.bookings;
CREATE TRIGGER bookings_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_on_booking_change();

-- ============================================================
-- 5. TRIGGER: refresh provider_score on reviews change
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_refresh_score_on_review_change()
RETURNS TRIGGER AS $$
DECLARE
  v_provider_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_provider_id := OLD.provider_id;
  ELSE
    v_provider_id := NEW.provider_id;
  END IF;

  IF v_provider_id IS NOT NULL THEN
    PERFORM public.refresh_provider_score(v_provider_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reviews_after_change ON public.reviews;
CREATE TRIGGER reviews_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_score_on_review_change();
