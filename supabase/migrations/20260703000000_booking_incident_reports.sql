-- ============================================================
-- BOOKING INCIDENT REPORTS
-- Date: 2026-07-03
-- ============================================================
--
-- Purpose:
--   Allow providers to report problems encountered on a booking
--   AFTER arriving at the service location (or later in the
--   lifecycle). This is NOT a booking status change, NOT a
--   cancellation, and NOT dispute resolution — it is a simple
--   incident record attached to the booking for future
--   moderation / dispute handling support.
--
--   The existing booking state machine
--   (see 20260624120000_booking_state_machine_trigger.sql) is
--   NOT modified by this migration. Booking history remains
--   unchanged. No automatic penalties, cancellations, or blame
--   are applied.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.booking_incident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN (
    'customer_not_present',
    'wrong_address',
    'customer_refused_service',
    'unsafe_location',
    'other'
  )),
  notes TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  photo_url TEXT, -- reserved for future use
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_incident_reports_booking ON public.booking_incident_reports(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_incident_reports_provider ON public.booking_incident_reports(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_incident_reports_status ON public.booking_incident_reports(status);

ALTER TABLE public.booking_incident_reports ENABLE ROW LEVEL SECURITY;

-- Providers can view their own incident reports
DROP POLICY IF EXISTS "Providers view own incident reports" ON public.booking_incident_reports;
CREATE POLICY "Providers view own incident reports"
  ON public.booking_incident_reports FOR SELECT
  USING (provider_id = auth.uid());

-- Providers can only submit a report for a booking they own, and only
-- once the booking has reached 'arrived' or a later lifecycle state.
DROP POLICY IF EXISTS "Providers insert own incident reports" ON public.booking_incident_reports;
CREATE POLICY "Providers insert own incident reports"
  ON public.booking_incident_reports FOR INSERT
  WITH CHECK (
    provider_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_id
        AND b.provider_id = auth.uid()
        AND b.status IN ('arrived', 'in_progress', 'completed')
    )
  );

-- Admins can view and update (review/dismiss) all incident reports
DROP POLICY IF EXISTS "Admins manage incident reports" ON public.booking_incident_reports;
CREATE POLICY "Admins manage incident reports"
  ON public.booking_incident_reports FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
