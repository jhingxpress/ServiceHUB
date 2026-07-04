-- ============================================================
-- Add must_change_password flag for staff accounts
-- Date: 2026-07-04
-- ============================================================

-- 1. Add the column to public.users
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- 2. Update handle_new_user to set the flag for staff roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_is_staff BOOLEAN;
BEGIN
  v_role := CASE
    WHEN NEW.raw_user_meta_data->>'role' IN ('provider', 'moderator', 'support_agent', 'operations_staff')
      THEN NEW.raw_user_meta_data->>'role'
    ELSE 'customer'
  END;

  v_is_staff := v_role IN ('moderator', 'support_agent', 'operations_staff');

  INSERT INTO public.users (
    id, email, full_name, phone, role, status, city, province,
    avatar_url, email_verified,
    accepted_terms_at, accepted_privacy_at, accepted_terms_version,
    must_change_password
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    v_role,
    'active',
    COALESCE(NEW.raw_user_meta_data->>'city', NULL),
    COALESCE(NEW.raw_user_meta_data->>'province', NULL),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', NULL),
    (NEW.email_confirmed_at IS NOT NULL),
    (NEW.raw_user_meta_data->>'accepted_terms_at')::timestamptz,
    (NEW.raw_user_meta_data->>'accepted_privacy_at')::timestamptz,
    COALESCE(NEW.raw_user_meta_data->>'accepted_terms_version', NULL),
    v_is_staff
  )
  ON CONFLICT (id) DO UPDATE SET
    email         = EXCLUDED.email,
    full_name     = EXCLUDED.full_name,
    avatar_url    = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
    email_verified = EXCLUDED.email_verified,
    accepted_terms_at      = COALESCE(EXCLUDED.accepted_terms_at,      public.users.accepted_terms_at),
    accepted_privacy_at    = COALESCE(EXCLUDED.accepted_privacy_at,    public.users.accepted_privacy_at),
    accepted_terms_version = COALESCE(EXCLUDED.accepted_terms_version, public.users.accepted_terms_version),
    must_change_password   = COALESCE(EXCLUDED.must_change_password, public.users.must_change_password),
    updated_at    = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
