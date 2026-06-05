-- ============================================================
-- Fix: Signup RLS violation on public.users
-- Date: 2026-06-05
-- ============================================================
--
-- Root cause: supabase.auth.signUp() with email confirmation enabled
-- does NOT return a session. The client-side upsert in authStore.ts
-- runs unauthenticated, so auth.uid() is NULL and all INSERT/UPDATE
-- policies on public.users reject the operation.
--
-- Fix: Move consent-field writes into the handle_new_user trigger.
-- Pass consent data via signUp options.data (raw_user_meta_data).
-- The trigger runs as SECURITY DEFINER (bypasses RLS) and populates
-- the columns automatically. No RLS weakening required.
--
-- ============================================================

-- Update handle_new_user to read consent fields from auth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
    COALESCE(NEW.raw_user_meta_data->>'role', 'customer'),
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
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
    email_verified = EXCLUDED.email_verified,
    accepted_terms_at = COALESCE(EXCLUDED.accepted_terms_at, public.users.accepted_terms_at),
    accepted_privacy_at = COALESCE(EXCLUDED.accepted_privacy_at, public.users.accepted_privacy_at),
    accepted_terms_version = COALESCE(EXCLUDED.accepted_terms_version, public.users.accepted_terms_version),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger is attached (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
