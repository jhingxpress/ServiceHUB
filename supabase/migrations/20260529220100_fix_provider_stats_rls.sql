-- ============================================================
-- MIGRATION: Fix provider_stats RLS for trigger writes
-- Date: 2026-05-29
-- Issue: Provider registration fails with 42501 (RLS violation)
-- ============================================================

-- Root Cause:
-- provider_stats has RLS enabled with only a SELECT policy.
-- Triggers that INSERT/UPDATE provider_stats run as the invoking user
-- (SECURITY INVOKER by default), so they lack write permissions.
--
-- Fix: Add SECURITY DEFINER to all trigger functions that write
-- to provider_stats, allowing them to bypass RLS as the table owner.

-- 1. sync_provider_stats() — fires on providers INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.sync_provider_stats()
RETURNS TRIGGER
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.provider_stats (
    provider_id, completed_jobs, total_reviews, average_rating, response_rate
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.completed_jobs, 0),
    COALESCE(NEW.total_reviews, 0),
    COALESCE(NEW.rating, 0.00),
    COALESCE(NEW.response_rate, 0)
  )
  ON CONFLICT (provider_id) DO UPDATE SET
    completed_jobs = EXCLUDED.completed_jobs,
    total_reviews = EXCLUDED.total_reviews,
    average_rating = EXCLUDED.average_rating,
    response_rate = EXCLUDED.response_rate,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. sync_favorite_count() — fires on favorite_providers INSERT/DELETE
CREATE OR REPLACE FUNCTION public.sync_favorite_count()
RETURNS TRIGGER
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.provider_stats
    SET favorite_count = (SELECT COUNT(*) FROM public.favorite_providers WHERE provider_id = NEW.provider_id),
        updated_at = NOW()
    WHERE provider_id = NEW.provider_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.provider_stats
    SET favorite_count = (SELECT COUNT(*) FROM public.favorite_providers WHERE provider_id = OLD.provider_id),
        updated_at = NOW()
    WHERE provider_id = OLD.provider_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. update_provider_response_time() — fires on messages INSERT
CREATE OR REPLACE FUNCTION public.update_provider_response_time()
RETURNS TRIGGER
SECURITY DEFINER
AS $$
DECLARE
  target_provider_id UUID;
  new_avg INTEGER;
BEGIN
  IF NEW.sender_id = (SELECT customer_id FROM public.bookings WHERE id = NEW.booking_id) THEN
    target_provider_id := (SELECT provider_id FROM public.bookings WHERE id = NEW.booking_id);
    new_avg := public.calculate_provider_response_time(target_provider_id);
    UPDATE public.provider_stats
    SET average_response_minutes = new_avg, updated_at = NOW()
    WHERE provider_id = target_provider_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- VERIFY (diagnostic SELECT removed — run manually in SQL Editor if needed)
-- Confirms: sync_provider_stats, sync_favorite_count,
--           update_provider_response_time are SECURITY DEFINER
-- ============================================================
