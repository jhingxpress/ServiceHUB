-- ============================================================
-- FIX: Pass notification_id to Edge Function so it can update
-- push_delivered and push_delivered_at on the notifications table.
-- Also ensures the trigger body matches the Edge Function's expected payload.
-- ============================================================

-- 1. Drop the old trigger (it will be recreated with the updated function)
DROP TRIGGER IF EXISTS notifications_send_push ON public.notifications;

-- 2. Rewrite trigger function to include notification_id in the payload
CREATE OR REPLACE FUNCTION public.trigger_push_notification()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE
  v_url TEXT;
  v_auth_key TEXT;
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

  INSERT INTO public.push_notification_log (
    notification_id, url, headers, body
  ) VALUES (
    NEW.id,
    v_url,
    jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_auth_key
    ),
    jsonb_build_object(
      'notification_id', NEW.id,
      'user_id', NEW.user_id,
      'title',   NEW.title,
      'body',    NEW.body,
      'data',    COALESCE(NEW.data, '{}'::jsonb)
    )
  );

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_auth_key
    ),
    body := jsonb_build_object(
      'notification_id', NEW.id,
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

-- 3. Recreate the trigger
CREATE TRIGGER notifications_send_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_push_notification();
