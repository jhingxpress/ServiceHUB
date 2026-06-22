-- Sprint 6.2: Live Booking Tracking
-- One row per active booking — stores the provider's latest GPS coordinates.

CREATE TABLE IF NOT EXISTS public.provider_live_locations (
  id           uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   uuid             NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_id  uuid             NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  latitude     double precision NOT NULL,
  longitude    double precision NOT NULL,
  updated_at   timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT uq_pll_booking UNIQUE (booking_id)
);

CREATE INDEX idx_pll_booking_id  ON public.provider_live_locations (booking_id);
CREATE INDEX idx_pll_provider_id ON public.provider_live_locations (provider_id);
CREATE INDEX idx_pll_updated_at  ON public.provider_live_locations (updated_at);

ALTER TABLE public.provider_live_locations ENABLE ROW LEVEL SECURITY;

-- Provider: insert own location
CREATE POLICY "pll_provider_insert"
  ON public.provider_live_locations
  FOR INSERT TO authenticated
  WITH CHECK (provider_id = auth.uid());

-- Provider: update own location
CREATE POLICY "pll_provider_update"
  ON public.provider_live_locations
  FOR UPDATE TO authenticated
  USING  (provider_id = auth.uid())
  WITH CHECK (provider_id = auth.uid());

-- Provider: read own records
CREATE POLICY "pll_provider_select"
  ON public.provider_live_locations
  FOR SELECT TO authenticated
  USING (provider_id = auth.uid());

-- Customer: read location only for bookings they own
CREATE POLICY "pll_customer_select"
  ON public.provider_live_locations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings
      WHERE bookings.id = booking_id
        AND bookings.customer_id = auth.uid()
    )
  );
