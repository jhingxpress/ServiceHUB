-- ============================================================
-- FIX MIGRATION: Replace ps.total_bookings with dynamic count
-- Problem: public.provider_stats does NOT contain a
--          total_bookings column.
--
--          compute_provider_score() references ps.total_bookings
--          to calculate completion_rate, causing:
--          ERROR: column ps.total_bookings does not exist (42703)
--
-- Fix:    Derive total_bookings dynamically from public.bookings
--          using a CTE, then use that value for completion_rate.
--          The rest of the score logic is preserved exactly.
-- ============================================================

CREATE OR REPLACE FUNCTION public.compute_provider_score(p_provider_id UUID)
RETURNS TABLE (
  score INTEGER,
  color_tier TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH
  booking_counts AS (
    SELECT COUNT(*)::INTEGER AS total_bookings
    FROM public.bookings
    WHERE provider_id = p_provider_id
  ),
  metrics AS (
    SELECT
      COALESCE(ps.response_rate, 0) AS response_rate,
      COALESCE(
        CASE
          WHEN bc.total_bookings > 0 THEN
            (ps.completed_jobs::DECIMAL / NULLIF(bc.total_bookings, 0) * 100)::INTEGER
          ELSE 0
        END, 0
      ) AS completion_rate,
      COALESCE(ps.average_rating * 20, 0)::INTEGER AS rating_score,
      COALESCE(ps.completed_jobs, 0) AS completed_jobs
    FROM public.provider_stats ps
    CROSS JOIN booking_counts bc
    WHERE ps.provider_id = p_provider_id
  )
  SELECT
    LEAST(100, GREATEST(0, ROUND((
      metrics.response_rate * 0.30 +
      metrics.completion_rate * 0.30 +
      metrics.rating_score * 0.25 +
      LEAST(metrics.completed_jobs * 2, 100) * 0.15
    ))::INTEGER)) AS score,
    CASE
      WHEN score >= 90 THEN 'green'
      WHEN score >= 75 THEN 'yellow'
      ELSE 'red'
    END AS color_tier
  FROM metrics;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-seed scores so existing providers get corrected values
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.providers LOOP
    PERFORM public.refresh_provider_score(r.id);
  END LOOP;
END $$;
