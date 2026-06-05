-- ============================================================
-- FIX: trigger_push_notification exits early because
-- v_service_role_key is NULL. Also, the Supabase API gateway
-- requires an Authorization header for Edge Functions.
--
-- Changes:
-- 1. Remove the NULL service_role_key guard.
-- 2. Read supabase_anon_key from platform_config for the
--    Authorization header (anon key is already public).
-- 3. Add push_notification_log table for diagnostics.
-- ============================================================

-- 1. Diagnostic table
CREATE TABLE IF NOT EXISTS public.push_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  url TEXT,
  headers JSONB,
  body JSONB,
  error TEXT,
  http_status INTEGER
);

-- 2. Config slot for the anon key (USER MUST UPDATE THIS)
INSERT INTO public.platform_config (key, value)
VALUES ('supabase_anon_key', 'REPLACE_WITH_YOUR_ANON_KEY')
ON CONFLICT (key) DO NOTHING;

-- 3. Rewrite trigger function
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
      'user_id', NEW.user_id,
      'title',   NEW.title,
      'body',    NEW.body,
      'data',    COALESCE(NEW.data, '{}'::jsonb)
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
