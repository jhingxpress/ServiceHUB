-- ============================================================
-- Migration: Add isolated analytics triggers
-- Sprint 4.0B — Safe Isolated Architecture
-- ============================================================

-- ── Phase 3: Profile Views Trigger ──
-- After INSERT on provider_views → increment provider_analytics.profile_views
CREATE OR REPLACE FUNCTION public.increment_provider_analytics_views()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.provider_analytics (provider_id, profile_views)
  VALUES (NEW.provider_id, 1)
  ON CONFLICT (provider_id)
  DO UPDATE SET
    profile_views = public.provider_analytics.profile_views + 1,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_provider_view_insert ON public.provider_views;
CREATE TRIGGER on_provider_view_insert
  AFTER INSERT ON public.provider_views
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_provider_analytics_views();

-- ── PHASE 4: Booking Request Trigger ──
-- After INSERT on bookings → increment provider_analytics.booking_requests
CREATE OR REPLACE FUNCTION public.increment_provider_analytics_bookings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.provider_analytics (provider_id, booking_requests)
  VALUES (NEW.provider_id, 1)
  ON CONFLICT (provider_id)
  DO UPDATE SET
    booking_requests = public.provider_analytics.booking_requests + 1,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_booking_insert_analytics ON public.bookings;
CREATE TRIGGER on_booking_insert_analytics
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_provider_analytics_bookings();
