-- ============================================================
-- HOTFIX: Deduplicate provider_views + create daily dedup index
-- Sprint 5.2A Hotfix — Provider Views Daily Dedup Index
-- Date: 2026-06-21
-- ============================================================
--
-- Why this replaces the prior attempt:
--   The corrected index expression ((viewed_at AT TIME ZONE 'UTC')::date)
--   resolved ERROR 42P17 (immutability), but the index creation then
--   failed with ERROR 23505: historical duplicate rows already exist
--   in provider_views from the old WITH CHECK (true) era. The index
--   could not be built until duplicates are removed.
--
-- Deduplication strategy:
--   Keep the OLDEST row per (viewer_id, provider_id, UTC day).
--   Delete all rows where ROW_NUMBER() > 1 in that partition,
--   ordered by viewed_at ASC so the earliest record is retained.
--   This is the safest choice — it preserves the first recorded view
--   and removes later duplicate inserts caused by the spam vector.
--
-- Impact on analytics:
--   provider_analytics.profile_views was incremented once per insert
--   (via SECURITY DEFINER trigger). Deleting duplicate rows from
--   provider_views does NOT retroactively decrement the counter —
--   the trigger only fires on INSERT, not DELETE. Historical counts
--   in provider_analytics reflect the inflated total but are not
--   recalculated here (out of scope for this hotfix).
--
-- Scope:
--   The RLS policies from 20260621000000 already applied and are
--   NOT repeated here. Only dedup + index creation are performed.
--
-- Protected systems (unchanged):
--   - provider_analytics triggers (fire on INSERT only)
--   - provider_performance, provider_stats
--   - bookings, payments, reviews, chat, notifications
--   - analytics screens, historical analytics
-- ============================================================

-- 1. Remove duplicate rows — keep oldest per viewer+provider+day
DELETE FROM public.provider_views
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY
          viewer_id,
          provider_id,
          ((viewed_at AT TIME ZONE 'UTC')::date)
        ORDER BY viewed_at ASC
      ) AS rn
    FROM public.provider_views
  ) ranked
  WHERE rn > 1
);

-- 2. Create the daily dedup index (now safe — no duplicates remain)
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_views_daily_dedup
  ON public.provider_views (viewer_id, provider_id, ((viewed_at AT TIME ZONE 'UTC')::date));
