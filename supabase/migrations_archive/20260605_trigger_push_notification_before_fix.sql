-- ============================================================
-- ARCHIVE: trigger_push_notification() BEFORE FIX
-- Date: 2026-06-05
-- Reason: Exits early at v_service_role_key IS NULL
--         because vault.secrets fails with permission error.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_push_notification()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE
  v_url TEXT;
  v_service_role_key TEXT;
BEGIN
  SELECT value INTO v_url FROM public.platform_config WHERE key = 'push_notification_url';

  IF v_url IS NULL OR v_url LIKE 'REPLACE%' THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key';
  EXCEPTION WHEN OTHERS THEN
    v_service_role_key := current_setting('app.supabase_service_role_key', true);
  END;

  IF v_service_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title',   NEW.title,
      'body',    NEW.body,
      'data',    COALESCE(NEW.data, '{}'::jsonb)
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
