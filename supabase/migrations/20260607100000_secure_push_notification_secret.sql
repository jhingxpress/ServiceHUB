-- ============================================================
-- SECURITY: Secure send-push-notification Edge Function
--
-- Adds shared-secret enforcement so only the trusted DB trigger
-- can invoke the Edge Function. Direct / anonymous HTTP callers
-- will be rejected with 401.
--
-- Setup steps (must be done after applying this migration):
-- 1. Generate a strong random secret (e.g. openssl rand -hex 32).
-- 2. Set it as a Supabase Edge Function secret:
--      supabase secrets set PUSH_NOTIFICATION_SECRET=<value>
-- 3. Update platform_config with the same value:
--      UPDATE public.platform_config
--      SET value = '<value>'
--      WHERE key = 'push_notification_secret';
-- ============================================================

-- 1. Add the secret slot to platform_config (placeholder until admin sets it)
INSERT INTO public.platform_config (key, value)
VALUES ('push_notification_secret', 'REPLACE_WITH_YOUR_PUSH_SECRET')
ON CONFLICT (key) DO NOTHING;

-- 2. Rewrite trigger_push_notification to include x-push-secret header
CREATE OR REPLACE FUNCTION public.trigger_push_notification()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE
  v_url        TEXT;
  v_auth_key   TEXT;
  v_push_secret TEXT;
BEGIN
  SELECT value INTO v_url
  FROM public.platform_config
  WHERE key = 'push_notification_url';

  IF v_url IS NULL OR v_url LIKE 'REPLACE%' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_auth_key
  FROM public.platform_config
  WHERE key = 'supabase_anon_key';

  IF v_auth_key IS NULL OR v_auth_key LIKE 'REPLACE%' THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_push_secret
  FROM public.platform_config
  WHERE key = 'push_notification_secret';

  -- Build headers — include x-push-secret if configured
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

  INSERT INTO public.push_notification_log (
    notification_id, url, headers, body
  ) VALUES (
    NEW.id,
    v_url,
    jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer [redacted]',
      'x-push-secret', CASE WHEN v_push_secret IS NOT NULL THEN '[redacted]' ELSE NULL END
    ),
    jsonb_build_object(
      'user_id',         NEW.user_id,
      'title',           NEW.title,
      'body',            NEW.body,
      'notification_id', NEW.id
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
