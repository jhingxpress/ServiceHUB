-- ============================================================
-- SECURITY: Pin search_path on all SECURITY DEFINER functions
-- Finding:  H-03 — Pre-Beta Security Audit 2026-07-27
-- Date:     2026-07-28
-- ============================================================
-- Adds SET search_path = public, pg_temp to every SECURITY DEFINER
-- function that was missing an explicit search_path declaration.
-- Without a pinned search_path, a privileged function can be tricked
-- via schema injection into resolving objects from an attacker-
-- controlled schema instead of public.
--
-- All function bodies are preserved exactly from their source
-- migrations. Only the SET search_path option is added.
--
-- Triggers that call these functions do NOT need to be recreated;
-- CREATE OR REPLACE preserves trigger bindings automatically.
--
-- DO NOT apply this migration automatically.
-- Review against live DB state before deploying.
-- ============================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. handle_new_user()  [auth trigger — role injection guard]
-- Source: 20260609220000_fix_role_injection.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (
    id, email, full_name, phone, role, status, city, province,
    avatar_url, email_verified,
    accepted_terms_at, accepted_privacy_at, accepted_terms_version
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' = 'provider' THEN 'provider'
      ELSE 'customer'
    END,
    'active',
    COALESCE(NEW.raw_user_meta_data->>'city', NULL),
    COALESCE(NEW.raw_user_meta_data->>'province', NULL),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', NULL),
    (NEW.email_confirmed_at IS NOT NULL),
    (NEW.raw_user_meta_data->>'accepted_terms_at')::timestamptz,
    (NEW.raw_user_meta_data->>'accepted_privacy_at')::timestamptz,
    COALESCE(NEW.raw_user_meta_data->>'accepted_terms_version', NULL)
  )
  ON CONFLICT (id) DO UPDATE SET
    email         = EXCLUDED.email,
    full_name     = EXCLUDED.full_name,
    avatar_url    = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
    email_verified = EXCLUDED.email_verified,
    accepted_terms_at      = COALESCE(EXCLUDED.accepted_terms_at,      public.users.accepted_terms_at),
    accepted_privacy_at    = COALESCE(EXCLUDED.accepted_privacy_at,    public.users.accepted_privacy_at),
    accepted_terms_version = COALESCE(EXCLUDED.accepted_terms_version, public.users.accepted_terms_version),
    updated_at    = NOW();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 2. is_account_locked(p_email TEXT)
-- Source: 20260603190000_security_sprint_pre_launch.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_account_locked(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.login_attempts
  WHERE email = p_email AND success = false AND created_at > now() - interval '15 minutes';
  RETURN v_count >= 10;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 3. log_login_attempt(...)
-- Source: 20260603190000_security_sprint_pre_launch.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_login_attempt(
  p_email TEXT, p_ip TEXT DEFAULT NULL, p_ua TEXT DEFAULT NULL, p_success BOOLEAN DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.login_attempts (email, ip_address, user_agent, success)
  VALUES (p_email, p_ip, p_ua, p_success);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 4. is_registration_rate_limited(p_ip TEXT)
-- Source: 20260603190000_security_sprint_pre_launch.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_registration_rate_limited(p_ip TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.registration_attempts
  WHERE ip_address = p_ip AND created_at > now() - interval '1 hour';
  RETURN v_count >= 5;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 5. log_registration_attempt(...)
-- Source: 20260603190000_security_sprint_pre_launch.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_registration_attempt(
  p_ip TEXT DEFAULT NULL, p_ua TEXT DEFAULT NULL, p_email TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.registration_attempts (ip_address, user_agent, email)
  VALUES (p_ip, p_ua, p_email);
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 6. enforce_booking_daily_limit()  [BEFORE INSERT trigger]
-- Source: 20260603190000_security_sprint_pre_launch.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_booking_daily_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_today_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_today_count FROM public.bookings
  WHERE customer_id = NEW.customer_id AND created_at > date_trunc('day', now());
  IF v_today_count >= 20 THEN
    RAISE EXCEPTION 'Daily booking limit reached (20/day).';
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 7. enforce_message_minute_rate_limit()  [BEFORE INSERT trigger]
-- Source: 20260603190000_security_sprint_pre_launch.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_message_minute_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_minute_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_minute_count FROM public.messages
  WHERE sender_id = NEW.sender_id AND created_at > now() - interval '1 minute';
  IF v_minute_count >= 60 THEN
    RAISE EXCEPTION 'Rate limit: 60 messages per minute exceeded.';
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 8. enforce_review_limits()  [BEFORE INSERT trigger]
-- Source: 20260603190000_security_sprint_pre_launch.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_review_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_exists BOOLEAN; v_today_count INTEGER;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.reviews WHERE booking_id = NEW.booking_id) INTO v_exists;
  IF v_exists THEN RAISE EXCEPTION 'Duplicate review for this booking.'; END IF;
  SELECT COUNT(*) INTO v_today_count FROM public.reviews
  WHERE customer_id = NEW.customer_id AND created_at > date_trunc('day', now());
  IF v_today_count >= 10 THEN RAISE EXCEPTION 'Daily review limit reached (10/day).'; END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 9. admin_suspend_provider(...)
-- Source: 20260603190000_security_sprint_pre_launch.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_suspend_provider(
  p_provider_id UUID, p_reason TEXT DEFAULT NULL, p_admin_id UUID DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.providers SET is_available=false, updated_at=now() WHERE id=p_provider_id;
  UPDATE public.users SET status='suspended', updated_at=now() WHERE id=p_provider_id;
  INSERT INTO public.moderation_log (admin_id, target_type, target_id, action, reason, metadata)
  VALUES (p_admin_id, 'provider', p_provider_id, 'suspend_provider', p_reason, jsonb_build_object('type','provider'));
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 10. admin_ban_user(...)
-- Source: 20260603190000_security_sprint_pre_launch.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_ban_user(
  p_user_id UUID, p_reason TEXT DEFAULT NULL, p_admin_id UUID DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.users SET status='banned', updated_at=now() WHERE id=p_user_id;
  UPDATE public.providers SET is_available=false, updated_at=now() WHERE id=p_user_id;
  INSERT INTO public.moderation_log (admin_id, target_type, target_id, action, reason, metadata)
  VALUES (p_admin_id, 'user', p_user_id, 'ban_user', p_reason, jsonb_build_object('type','user'));
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 11. admin_hide_review(...)
-- Source: 20260603190000_security_sprint_pre_launch.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_hide_review(
  p_review_id UUID, p_reason TEXT DEFAULT NULL, p_admin_id UUID DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.reviews SET is_hidden=true, updated_at=now() WHERE id=p_review_id;
  INSERT INTO public.moderation_log (admin_id, target_type, target_id, action, reason, metadata)
  VALUES (p_admin_id, 'review', p_review_id, 'hide_review', p_reason, jsonb_build_object('type','review'));
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 12. admin_revoke_verification(...)
-- Source: 20260603190000_security_sprint_pre_launch.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_revoke_verification(
  p_provider_id UUID, p_reason TEXT DEFAULT NULL, p_admin_id UUID DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.providers SET status='pending_review', updated_at=now() WHERE id=p_provider_id;
  UPDATE public.provider_documents SET status='rejected' WHERE provider_id=p_provider_id;
  INSERT INTO public.moderation_log (admin_id, target_type, target_id, action, reason, metadata)
  VALUES (p_admin_id, 'provider', p_provider_id, 'revoke_verification', p_reason, jsonb_build_object('type','provider'));
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 13. admin_remove_chat_image(...)
-- Source: 20260603190000_security_sprint_pre_launch.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_remove_chat_image(
  p_message_id UUID, p_reason TEXT DEFAULT NULL, p_admin_id UUID DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_image_url TEXT; v_booking_id UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT image_url, booking_id INTO v_image_url, v_booking_id
  FROM public.messages WHERE id=p_message_id;
  IF v_image_url IS NOT NULL THEN
    UPDATE public.messages SET image_url=NULL, content='[Image removed by moderator]', updated_at=now()
    WHERE id=p_message_id;
  END IF;
  INSERT INTO public.moderation_log (admin_id, target_type, target_id, action, reason, metadata)
  VALUES (p_admin_id, 'message', p_message_id, 'remove_chat_image', p_reason,
    jsonb_build_object('image_url',v_image_url,'booking_id',v_booking_id));
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 14. admin_activate_user(...)
-- Source: 20260603190000_security_sprint_pre_launch.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_activate_user(
  p_user_id UUID, p_admin_id UUID DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.users SET status='active', updated_at=now() WHERE id=p_user_id;
  UPDATE public.providers SET is_available=true, updated_at=now() WHERE id=p_user_id;
  INSERT INTO public.moderation_log (admin_id, target_type, target_id, action, metadata)
  VALUES (p_admin_id, 'user', p_user_id, 'activate_user', jsonb_build_object('type','user'));
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 15. check_rate_limit(...)
-- Source: 20260602180000_security_rls_audit.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_max_count INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start := date_trunc('hour', now());

  SELECT count INTO v_count
  FROM public.rate_limits
  WHERE user_id = p_user_id
    AND action = p_action
    AND window_start = v_window_start;

  IF v_count IS NULL THEN
    INSERT INTO public.rate_limits (user_id, action, window_start, count)
    VALUES (p_user_id, p_action, v_window_start, 1)
    ON CONFLICT (user_id, action, window_start)
    DO UPDATE SET count = rate_limits.count + 1;
    RETURN true;
  ELSIF v_count < p_max_count THEN
    UPDATE public.rate_limits
    SET count = count + 1
    WHERE user_id = p_user_id AND action = p_action AND window_start = v_window_start;
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 16. enforce_message_rate_limit()  [BEFORE INSERT trigger]
-- Source: 20260602180000_security_rls_audit.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.check_rate_limit(NEW.sender_id, 'send_message', 60, 3600) THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many messages sent. Please wait before sending more.';
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 17. enforce_booking_rate_limit()  [BEFORE INSERT trigger]
-- Source: 20260602180000_security_rls_audit.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_booking_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.check_rate_limit(NEW.customer_id, 'create_booking', 10, 3600) THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many bookings submitted. Please try again later.';
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 18. enforce_review_rate_limit()  [BEFORE INSERT trigger]
-- Source: 20260602180000_security_rls_audit.sql
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_review_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.check_rate_limit(NEW.customer_id, 'submit_review', 20, 86400) THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many reviews submitted.';
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- ROLLBACK SQL
-- To revert: re-run the original function definitions from:
--   20260609220000_fix_role_injection.sql        (function 1)
--   20260603190000_security_sprint_pre_launch.sql (functions 2-14)
--   20260602180000_security_rls_audit.sql         (functions 15-18)
-- Trigger bindings do not need to be recreated.
-- ============================================================

-- ============================================================
-- GRANT VERIFICATION SQL (run after applying to confirm)
-- ============================================================
-- SELECT proname, prosecdef, proconfig
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
--   AND prosecdef = true
-- ORDER BY proname;
--
-- All rows should have proconfig containing:
--   search_path=public, pg_temp
-- No rows with prosecdef = true should have proconfig IS NULL.
