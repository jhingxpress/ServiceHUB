-- ============================================================
-- Fix: Staff roles created via create-staff Edge Function
-- Date: 2026-07-04
-- ============================================================
--
-- Issue 1: handle_new_user() forced every non-provider signup to 'customer',
--          so staff accounts (moderator/support_agent/operations_staff)
--          created by the admin Edge Function ended up with role = 'customer'.
--
-- Fix: Allowlist the new staff roles in handle_new_user().
--
-- Issue 2: The Edge Function uses the service role key to upsert public.users.
--          The enforce_admin_only_user_fields trigger rejected role changes
--          because auth.uid() is the service role, not an admin user.
--
-- Fix: Allow the service role key to change role, employment_status, and
-- internal_notes by checking the JWT role claim.
--
-- Preserved: customer/provider signup flows and email/OAuth behavior.
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
      WHEN NEW.raw_user_meta_data->>'role' IN ('provider', 'moderator', 'support_agent', 'operations_staff')
        THEN NEW.raw_user_meta_data->>'role'
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

-- Helper: true for admin users or calls made with the service_role/supabase_admin keys
CREATE OR REPLACE FUNCTION public.is_admin_or_service_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin_user(auth.uid())
    OR COALESCE(auth.jwt()->>'role', '') = 'service_role'
    OR COALESCE(auth.jwt()->>'role', '') = 'supabase_admin';
$$;

CREATE OR REPLACE FUNCTION public.enforce_admin_only_user_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT public.is_admin_or_service_role() THEN
      RAISE EXCEPTION 'Only admin can change user roles';
    END IF;
  END IF;

  IF OLD.employment_status IS DISTINCT FROM NEW.employment_status
     OR OLD.internal_notes IS DISTINCT FROM NEW.internal_notes THEN
    IF NOT public.is_admin_or_service_role() THEN
      RAISE EXCEPTION 'Only admin can change employment status or internal notes';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
