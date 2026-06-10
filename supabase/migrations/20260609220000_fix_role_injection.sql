-- ============================================================
-- SECURITY FIX: Block admin role injection via handle_new_user
-- Date: 2026-06-09
-- ============================================================
--
-- Vulnerability (Finding 1.1):
--   handle_new_user trusted raw_user_meta_data->>'role' without
--   validation. Any caller could POST directly to the Supabase Auth
--   signup endpoint with {"data": {"role": "admin"}} and receive
--   immediate admin privileges, bypassing the UI's TypeScript
--   constraint (which is client-side only).
--
-- Fix:
--   Allowlist only 'provider'. Any other value — including 'admin'
--   or any arbitrary string — is forced to 'customer'.
--
-- Provider onboarding impact: NONE.
--   RoleSelectionScreen passes role='provider' via signUp options.data.
--   The trigger still maps 'provider' → 'provider'. The email signup
--   provider flow is fully preserved.
--
-- Google Sign-In impact: NONE.
--   Google OAuth user_metadata never contains a 'role' field. The
--   ELSE branch defaults to 'customer', which is the correct starting
--   state. ProfileCompletionScreen then elevates role via UPDATE.
--
-- Admin account impact: NONE.
--   Admin roles are set exclusively via direct DB UPDATE (e.g.
--   20260605060000_set_admin_role.sql). New signups can never
--   self-assign admin.
--
-- Preserved fields from 20260605020000_fix_signup_rls_via_trigger.sql:
--   All other logic (consent fields, email_verified, ON CONFLICT clause)
--   is carried forward unchanged.
-- ============================================================

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger already exists from prior migrations; recreating defensively.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
