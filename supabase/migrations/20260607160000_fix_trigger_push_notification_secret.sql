-- ============================================================
-- FIX: Live DB is still running the pre-secret trigger function
-- from 20260606160000. This migration applies the x-push-secret
-- header that the redeployed Edge Function now requires.
--
-- Also restores the EXCEPTION WHEN OTHERS guard that was
-- accidentally dropped in 20260607100000, so push failures
-- never block notification inserts.
-- ============================================================

-- Drop trigger first (avoids any lock issue during function replacement)
DROP TRIGGER IF EXISTS notifications_send_push ON public.notifications;

-- Rewrite the trigger function
CREATE OR REPLACE FUNCTION public.trigger_push_notification()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE
  v_url         TEXT;
  v_auth_key    TEXT;
  v_push_secret TEXT;
BEGIN
  -- Read endpoint URL
  SELECT value INTO v_url
  FROM public.platform_config
  WHERE key = 'push_notification_url';

  IF v_url IS NULL OR v_url LIKE 'REPLACE%' THEN
    RETURN NEW;
  END IF;

  -- Read anon key (used as the Bearer token the API gateway requires)
  SELECT value INTO v_auth_key
  FROM public.platform_config
  WHERE key = 'supabase_anon_key';

  IF v_auth_key IS NULL OR v_auth_key LIKE 'REPLACE%' THEN
    RETURN NEW;
  END IF;

  -- Read shared secret (set in both Supabase Secrets and platform_config)
  SELECT value INTO v_push_secret
  FROM public.platform_config
  WHERE key = 'push_notification_secret';

  -- Log before HTTP call so we always have a record even if http fails
  INSERT INTO public.push_notification_log (
    notification_id, url, headers, body
  ) VALUES (
    NEW.id,
    v_url,
    jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer [redacted]',
      'x-push-secret', CASE
        WHEN v_push_secret IS NOT NULL AND v_push_secret NOT LIKE 'REPLACE%'
        THEN '[redacted]'
        ELSE NULL
      END
    ),
    jsonb_build_object(
      'user_id',         NEW.user_id,
      'title',           NEW.title,
      'body',            NEW.body,
      'notification_id', NEW.id
    )
  );

  -- Fire the HTTP call with x-push-secret header when secret is configured
  PERFORM net.http_post(
    url := v_url,
    headers := CASE
      WHEN v_push_secret IS NOT NULL AND v_push_secret NOT LIKE 'REPLACE%'
      THEN jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_auth_key,
        'x-push-secret', v_push_secret
      )
      ELSE jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_auth_key
      )
    END,
    body := jsonb_build_object(
      'user_id',         NEW.user_id,
      'title',           NEW.title,
      'body',            NEW.body,
      'data',            COALESCE(NEW.data, '{}'::jsonb),
      'notification_id', NEW.id
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Push delivery failure must never block the notification insert
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger
CREATE TRIGGER notifications_send_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_push_notification();
