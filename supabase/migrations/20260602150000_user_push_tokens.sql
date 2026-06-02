-- ============================================================
-- Push Notification Infrastructure — user_push_tokens
-- ============================================================

-- 1. Create push token table (multiple devices per user)
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  expo_push_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_id)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.user_push_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_token   ON public.user_push_tokens (expo_push_token);

-- 3. Enable RLS
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies
DO $$
BEGIN
  CREATE POLICY "Users can manage own push tokens"
  ON public.user_push_tokens FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

DO $$
BEGIN
  CREATE POLICY "Service role can read all push tokens"
  ON public.user_push_tokens FOR SELECT
  TO service_role
  USING (true);
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

DO $$
BEGIN
  CREATE POLICY "Service role can delete invalid tokens"
  ON public.user_push_tokens FOR DELETE
  TO service_role
  USING (true);
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;

-- 5. Platform config table (stores edge function URL for pg_net triggers)
CREATE TABLE IF NOT EXISTS public.platform_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with the edge function URL pattern (user must update this with their project ref)
-- Example: https://<project-ref>.supabase.co/functions/v1/send-push-notification
INSERT INTO public.platform_config (key, value)
VALUES ('push_notification_url', 'REPLACE_WITH_SUPABASE_FUNCTIONS_URL/send-push-notification')
ON CONFLICT (key) DO NOTHING;

-- Allow only service_role to read config
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Service role can read platform config"
  ON public.platform_config FOR SELECT
  TO service_role
  USING (true);
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;
