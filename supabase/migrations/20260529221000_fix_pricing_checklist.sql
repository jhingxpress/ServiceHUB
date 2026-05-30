-- ============================================================
-- MIGRATION: Fix Pricing Checklist Completion
-- Reason:
--   1. compute_provider_checklist counted inactive service_options
--      toward has_pricing. We now require is_active = true.
--   2. The DB triggers already refresh checklist on service_options
--      changes, but the function definition was stale.
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
      LIMIT 1
    )) AS has_photos,
    (EXISTS (SELECT 1 FROM public.availability a WHERE a.provider_id = p.id)) AS has_schedule,
    (EXISTS (SELECT 1 FROM public.bookings b WHERE b.provider_id = p.id)) AS has_first_booking,
    0::INTEGER AS progress_percent
  FROM public.providers p
  WHERE p.id = p_provider_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
