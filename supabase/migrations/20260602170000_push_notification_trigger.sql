-- ============================================================
-- Push Notification Delivery — pg_net trigger
-- Calls the send-push-notification Edge Function on each
-- notification INSERT via pg_net HTTP POST.
--
-- PREREQUISITES:
--   1. Enable pg_net extension: CREATE EXTENSION IF NOT EXISTS pg_net;
--   2. Update platform_config: UPDATE public.platform_config
--        SET value = 'https://<YOUR-PROJECT-REF>.supabase.co/functions/v1/send-push-notification'
--        WHERE key = 'push_notification_url';
--   3. Store your service_role key as a vault secret named 'supabase_service_role_key'
--      OR hardcode it in the trigger (not recommended for production).
-- ============================================================

-- 1. Enable pg_net (requires Supabase Pro or manual enablement)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Trigger function: calls edge function for push delivery
CREATE OR REPLACE FUNCTION public.trigger_push_notification()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE
  v_url TEXT;
  v_service_role_key TEXT;
BEGIN
  -- Read function URL from config (must be set after deployment)
  SELECT value INTO v_url FROM public.platform_config WHERE key = 'push_notification_url';

  IF v_url IS NULL OR v_url LIKE 'REPLACE%' THEN
    -- Not configured yet — skip silently
    RETURN NEW;
  END IF;

  -- Read service role key (set via: INSERT INTO vault.secrets ...)
  BEGIN
    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key';
  EXCEPTION WHEN OTHERS THEN
    v_service_role_key := current_setting('app.supabase_service_role_key', true);
  END;

  IF v_service_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fire-and-forget HTTP POST to edge function
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
  -- Never block notification insertion on push delivery failure
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger on notifications table
DROP TRIGGER IF EXISTS notifications_send_push ON public.notifications;
CREATE TRIGGER notifications_send_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_push_notification();

-- ============================================================
-- SECURITY FOUNDATIONS (Phase 3)
-- ============================================================

-- 4. Rate limiting table for anti-spam
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, action, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_action ON public.rate_limits (user_id, action, window_start);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Users can read own rate limits"
  ON public.rate_limits FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Audit log table for moderation actions
CREATE TABLE IF NOT EXISTS public.moderation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  target_user_id UUID REFERENCES auth.users(id),
  target_provider_id UUID,
  action TEXT NOT NULL,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_log_admin ON public.moderation_log (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_log_target ON public.moderation_log (target_user_id, created_at DESC);

ALTER TABLE public.moderation_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Admins can read moderation log"
  ON public.moderation_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Admins can insert moderation log"
  ON public.moderation_log FOR INSERT TO authenticated
  WITH CHECK (
    admin_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
