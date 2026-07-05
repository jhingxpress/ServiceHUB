-- ============================================================
-- Fix: Remove redundant pg_cron job for platform fee reminders
-- Date: 2026-07-05
-- ============================================================
--
-- Context:
--   The previous migration (20260705000004) created a pg_cron job
--   that runs process_platform_fee_reminders() at 01:00 UTC.
--   It also deployed an Edge Function that calls the same SQL function
--   and then sends push notifications for the returned rows.
--
-- Problem:
--   The SQL function stamps reminder_sent_at / overdue_notified_at
--   before returning. When pg_cron runs first, it stamps the fields
--   but the returned rows are discarded. The Edge Function, scheduled
--   5 minutes later, then calls the SQL function again and gets 0 rows
--   because the idempotency gates are already set. Push notifications
--   never fire.
--
-- Fix:
--   Drop the pg_cron job. The Edge Function (notify-platform-fee-reminders)
--   becomes the sole scheduler. In a single invocation it calls the SQL
--   function (which creates in-app notifications and stamps the gates)
--   and then sends push notifications for the exact rows returned.
--
-- Migration is safe and idempotent: the Edge Function is already deployed
-- and handles both in-app and push layers in one transaction.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'platform-fee-reminders') THEN
    PERFORM cron.unschedule('platform-fee-reminders');
    RAISE NOTICE 'Dropped pg_cron job platform-fee-reminders';
  ELSE
    RAISE NOTICE 'pg_cron job platform-fee-reminders did not exist';
  END IF;
END $$;
