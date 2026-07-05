-- ============================================================
-- Sprint: Platform Fee Reminder & Overdue Automation
-- Date: 2026-07-05
-- ============================================================
--
-- Adds:
--   provider_platform_fees.reminder_sent_at    — when the reminder was sent
--   provider_platform_fees.overdue_notified_at — when the overdue alert was sent
--   process_platform_fee_reminders()           — daily SQL function (in-app notifications)
--   pg_cron job — runs daily at 01:00 UTC (09:00 Manila)
--
-- Push notifications are handled by the Edge Function
-- notify-platform-fee-reminders, scheduled separately via
-- the Supabase Dashboard → Edge Functions → Scheduled Invocations.
-- ============================================================

-- ── 1. Tracking columns ───────────────────────────────────────
ALTER TABLE public.provider_platform_fees
  ADD COLUMN IF NOT EXISTS reminder_sent_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS overdue_notified_at TIMESTAMPTZ;

-- Index for quick scan of un-notified unpaid fees
CREATE INDEX IF NOT EXISTS idx_ppf_reminder
  ON public.provider_platform_fees (status, due_date, reminder_sent_at)
  WHERE status = 'unpaid';

CREATE INDEX IF NOT EXISTS idx_ppf_overdue_notif
  ON public.provider_platform_fees (status, due_date, overdue_notified_at)
  WHERE status = 'unpaid';

-- ── 2. process_platform_fee_reminders() ──────────────────────
--
-- Idempotent daily function:
--   • platform_fee_reminder  — status='unpaid', due within 7 days, reminder not yet sent
--   • platform_fee_overdue   — status='unpaid', past due date, overdue alert not yet sent
--
-- Returns JSONB with counts and per-provider details so the
-- Edge Function can send push notifications without a second DB round-trip.
-- ── ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_platform_fee_reminders()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reminder_count     INT    := 0;
  v_overdue_count      INT    := 0;
  v_reminded_providers JSONB  := '[]'::JSONB;
  v_overdue_providers  JSONB  := '[]'::JSONB;
  v_fee                RECORD;
  v_notif_body         TEXT;
BEGIN

  -- ── Reminder: unpaid, due within 7 days, reminder not yet sent ───────────────
  FOR v_fee IN
    SELECT id, provider_id, platform_fee, due_date
    FROM   public.provider_platform_fees
    WHERE  status           = 'unpaid'
      AND  reminder_sent_at IS NULL
      AND  due_date         > NOW()
      AND  due_date        <= NOW() + INTERVAL '7 days'
    ORDER BY due_date ASC
  LOOP
    v_notif_body :=
      'A platform fee of ₱' || v_fee.platform_fee::TEXT ||
      ' is due on '        || TO_CHAR(v_fee.due_date AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY') ||
      '. Please settle your balance before the due date.';

    BEGIN
      -- In-app notification
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_fee.provider_id,
        'platform_fee_reminder',
        'Platform Fee Due Soon',
        v_notif_body,
        jsonb_build_object(
          'fee_id',   v_fee.id,
          'due_date', v_fee.due_date::TEXT
        )
      );

      -- Mark as reminded (idempotency gate)
      UPDATE public.provider_platform_fees
      SET    reminder_sent_at = NOW(),
             updated_at       = NOW()
      WHERE  id = v_fee.id;

      -- Collect for push dispatch
      v_reminded_providers := v_reminded_providers || jsonb_build_array(
        jsonb_build_object(
          'provider_id', v_fee.provider_id,
          'title',       'Platform Fee Due Soon',
          'body',        v_notif_body
        )
      );

      v_reminder_count := v_reminder_count + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[process_platform_fee_reminders] reminder failed for fee %: %', v_fee.id, SQLERRM;
    END;
  END LOOP;

  -- ── Overdue: unpaid, past due date, overdue alert not yet sent ───────────────
  FOR v_fee IN
    SELECT id, provider_id, platform_fee, due_date
    FROM   public.provider_platform_fees
    WHERE  status                = 'unpaid'
      AND  overdue_notified_at   IS NULL
      AND  due_date             < NOW()
    ORDER BY due_date ASC
  LOOP
    v_notif_body :=
      'A platform fee of ₱' || v_fee.platform_fee::TEXT ||
      ' was due on '        || TO_CHAR(v_fee.due_date AT TIME ZONE 'Asia/Manila', 'Mon DD, YYYY') ||
      '. Please pay immediately to avoid account review.';

    BEGIN
      -- In-app notification
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        v_fee.provider_id,
        'platform_fee_overdue',
        'Platform Fee Overdue',
        v_notif_body,
        jsonb_build_object(
          'fee_id',   v_fee.id,
          'due_date', v_fee.due_date::TEXT
        )
      );

      -- Mark as overdue-notified (idempotency gate)
      UPDATE public.provider_platform_fees
      SET    overdue_notified_at = NOW(),
             updated_at          = NOW()
      WHERE  id = v_fee.id;

      -- Collect for push dispatch
      v_overdue_providers := v_overdue_providers || jsonb_build_array(
        jsonb_build_object(
          'provider_id', v_fee.provider_id,
          'title',       'Platform Fee Overdue',
          'body',        v_notif_body
        )
      );

      v_overdue_count := v_overdue_count + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[process_platform_fee_reminders] overdue failed for fee %: %', v_fee.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'reminder_count',     v_reminder_count,
    'overdue_count',      v_overdue_count,
    'reminded_providers', v_reminded_providers,
    'overdue_providers',  v_overdue_providers
  );
END;
$$;

COMMENT ON FUNCTION public.process_platform_fee_reminders() IS
  'Sends in-app reminder/overdue notifications for unpaid platform fees and marks '
  'reminder_sent_at / overdue_notified_at to prevent duplicate delivery. '
  'Push notifications are handled by the notify-platform-fee-reminders Edge Function.';

-- ── 3. pg_cron — daily in-app notification job ───────────────
--
-- Runs at 01:00 UTC (09:00 Manila time) every day.
-- Handles in-app notifications only. Push is handled by the
-- notify-platform-fee-reminders Edge Function (deploy separately).
-- ── ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'platform-fee-reminders') THEN
    PERFORM cron.unschedule('platform-fee-reminders');
  END IF;
END $$;

SELECT cron.schedule(
  'platform-fee-reminders',
  '0 1 * * *',
  'SELECT public.process_platform_fee_reminders()'
);

-- ── 4. Sanity check ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = 'provider_platform_fees'
      AND  column_name  = 'reminder_sent_at'
  ) THEN
    RAISE EXCEPTION 'reminder_sent_at column not found — migration failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'platform-fee-reminders') THEN
    RAISE EXCEPTION 'pg_cron job not created — ensure pg_cron extension is enabled';
  END IF;
  RAISE NOTICE 'platform_fee_reminders migration OK';
END $$;
