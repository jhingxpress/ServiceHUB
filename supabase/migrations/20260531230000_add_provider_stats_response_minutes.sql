-- ============================================================
-- FIX: Add missing average_response_minutes to provider_stats
-- Root cause: provider_stats was pre-existing in the remote DB
-- before 20260529220000_architecture_renovation.sql ran.
-- CREATE TABLE IF NOT EXISTS was a no-op — the column was never
-- added. update_provider_response_time() trigger then fires on
-- every messages INSERT and throws 42703 (undefined_column).
-- Fix: idempotent ADD COLUMN IF NOT EXISTS.
-- ============================================================

ALTER TABLE public.provider_stats
  ADD COLUMN IF NOT EXISTS average_response_minutes INTEGER DEFAULT 0;
