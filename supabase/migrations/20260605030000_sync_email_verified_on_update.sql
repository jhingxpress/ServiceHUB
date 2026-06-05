-- ============================================================
-- Fix: Sync public.users.email_verified when auth.users.email_confirmed_at changes
-- Date: 2026-06-05
-- ============================================================
--
-- Root cause: handle_new_user only fires on INSERT into auth.users.
-- When a user verifies their email later, email_confirmed_at is updated
-- but public.users.email_verified remains false (stale from initial signup).
-- This causes the app to show EmailVerificationBanner and block actions
-- via useEmailVerificationGuard even though the user IS verified.
--
-- Fix: Add an AFTER UPDATE trigger on auth.users that syncs
-- email_confirmed_at -> public.users.email_verified automatically.
--
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_user_updated()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email_confirmed_at IS DISTINCT FROM OLD.email_confirmed_at THEN
    UPDATE public.users
    SET email_verified = (NEW.email_confirmed_at IS NOT NULL),
        updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_updated();
