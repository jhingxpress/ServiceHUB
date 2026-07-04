-- Migration: block public Forgot Password for staff accounts
-- Reuses the existing Supabase Auth reset flow by adding a pre-check
-- that detects staff roles before sending the reset email.

-- Returns true if the email belongs to a staff account.
-- Used by the Forgot Password screen to show a generic admin-contact message.
CREATE OR REPLACE FUNCTION public.is_staff_email(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE email = lower(p_email)
      AND role IN ('moderator', 'support_agent', 'operations_staff')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_staff_email(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.is_staff_email(TEXT) TO authenticated;
