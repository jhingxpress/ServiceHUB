-- ============================================================
-- ServiceHub Provider Earnings Data Integrity Fix
-- Date: 2026-06-05
-- Critical: Fixes broken provider earnings and completed_jobs flow
-- ============================================================

-- 0. Deduplicate payments before adding unique constraint
-- ============================================================
DELETE FROM public.payments
WHERE id NOT IN (
  SELECT MIN(id)
  FROM public.payments
  GROUP BY booking_id
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_booking_unique
ON public.payments(booking_id);

-- 1. Unified booking completion handler (replaces separate payment + earnings triggers)
--    Uses GET DIAGNOSTICS to detect whether payment was newly inserted.
--    Eliminates trigger ordering race condition.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_booking_completion()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE
  did_insert BOOLEAN := FALSE;
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- 1a. Insert payment (idempotent via unique booking_id)
    INSERT INTO public.payments (booking_id, customer_id, provider_id, amount, status, payment_method)
    VALUES (
      NEW.id,
      NEW.customer_id,
      NEW.provider_id,
      COALESCE(NEW.total_amount, 0),
      'completed',
      'cash_on_service'
    )
    ON CONFLICT (booking_id) DO NOTHING;

    GET DIAGNOSTICS did_insert = ROW_COUNT;

    -- 1b. Only increment earnings if payment was newly inserted.
    --     If conflict occurred (already processed), skip to prevent double-count.
    IF did_insert THEN
      UPDATE public.providers
      SET
        completed_jobs = COALESCE(completed_jobs, 0) + 1,
        total_earnings = COALESCE(total_earnings, 0) + COALESCE(NEW.total_amount, 0)
      WHERE id = NEW.provider_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1c. Drop old separate triggers and create unified trigger
-- ============================================================
DROP TRIGGER IF EXISTS bookings_update_earnings ON public.bookings;
DROP TRIGGER IF EXISTS booking_completed_payment ON public.bookings;
CREATE TRIGGER bookings_handle_completion
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.handle_booking_completion();

-- 3. Add total_earnings to provider_stats (denormalized cache)
-- ============================================================
ALTER TABLE public.provider_stats
ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(10,2) DEFAULT 0.00;

-- 4. Update provider_stats sync trigger to include total_earnings
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_provider_stats()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.provider_stats (
    provider_id, completed_jobs, total_reviews, average_rating, response_rate, total_earnings
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.completed_jobs, 0),
    COALESCE(NEW.total_reviews, 0),
    COALESCE(NEW.rating, 0.00),
    COALESCE(NEW.response_rate, 0),
    COALESCE(NEW.total_earnings, 0.00)
  )
  ON CONFLICT (provider_id) DO UPDATE SET
    completed_jobs = EXCLUDED.completed_jobs,
    total_reviews = EXCLUDED.total_reviews,
    average_rating = EXCLUDED.average_rating,
    response_rate = EXCLUDED.response_rate,
    total_earnings = EXCLUDED.total_earnings,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Backfill providers.completed_jobs & providers.total_earnings from bookings
-- ============================================================
WITH provider_booking_stats AS (
  SELECT
    provider_id,
    COUNT(*) AS jobs,
    COALESCE(SUM(total_amount), 0) AS earnings
  FROM public.bookings
  WHERE status = 'completed'
  GROUP BY provider_id
)
UPDATE public.providers p
SET
  completed_jobs = COALESCE(s.jobs, 0),
  total_earnings = COALESCE(s.earnings, 0)
FROM provider_booking_stats s
WHERE p.id = s.provider_id;

-- 6. Backfill provider_stats from providers (now that providers has correct data)
-- ============================================================
INSERT INTO public.provider_stats (
  provider_id, completed_jobs, total_reviews, average_rating, response_rate, favorite_count, total_earnings
)
SELECT
  p.id,
  COALESCE(p.completed_jobs, 0),
  COALESCE(p.total_reviews, 0),
  COALESCE(p.rating, 0.00),
  COALESCE(p.response_rate, 0),
  (SELECT COUNT(*) FROM public.favorite_providers WHERE provider_id = p.id),
  COALESCE(p.total_earnings, 0.00)
FROM public.providers p
WHERE NOT EXISTS (
  SELECT 1 FROM public.provider_stats ps WHERE ps.provider_id = p.id
)
ON CONFLICT (provider_id) DO UPDATE SET
  completed_jobs = EXCLUDED.completed_jobs,
  total_reviews = EXCLUDED.total_reviews,
  average_rating = EXCLUDED.average_rating,
  response_rate = EXCLUDED.response_rate,
  favorite_count = EXCLUDED.favorite_count,
  total_earnings = EXCLUDED.total_earnings,
  updated_at = NOW();

-- 7. Update existing provider_stats rows that already exist but may be stale
-- ============================================================
UPDATE public.provider_stats ps
SET
  completed_jobs = COALESCE(p.completed_jobs, 0),
  total_reviews = COALESCE(p.total_reviews, 0),
  average_rating = COALESCE(p.rating, 0.00),
  response_rate = COALESCE(p.response_rate, 0),
  total_earnings = COALESCE(p.total_earnings, 0.00),
  updated_at = NOW()
FROM public.providers p
WHERE ps.provider_id = p.id;

-- 8. Zero-out providers with NO completed bookings (remove stale manual values)
-- ============================================================
UPDATE public.providers
SET
  completed_jobs = 0,
  total_earnings = 0
WHERE id NOT IN (
  SELECT DISTINCT provider_id FROM public.bookings WHERE status = 'completed'
);

-- 9. Backfill existing cash_on_service payments from 'pending' to 'completed'
-- ============================================================
UPDATE public.payments
SET status = 'completed'
WHERE status = 'pending'
  AND payment_method = 'cash_on_service';
