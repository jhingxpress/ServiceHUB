-- Add staff operational roles to the users table
-- Admin remains full-access. Staff roles are: moderator, support_agent, operations_staff.

-- Update role constraint if it exists; otherwise add it.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('customer', 'provider', 'admin', 'moderator', 'support_agent', 'operations_staff'));

-- Add is_active flag for staff accounts (reusable for any user).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Add staff employment status (admin-only field).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS employment_status text DEFAULT 'active';
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_employment_status_check;
ALTER TABLE public.users ADD CONSTRAINT users_employment_status_check
  CHECK (employment_status IN ('active', 'suspended', 'inactive', 'resigned'));

-- Add admin-only internal notes for staff accounts.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS internal_notes text;

-- Staff action audit log
CREATE TABLE IF NOT EXISTS public.staff_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_table text,
  target_record_id uuid,
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_action_log ENABLE ROW LEVEL SECURITY;

-- Helper: true for admin or any staff role
CREATE OR REPLACE FUNCTION public.is_admin_or_staff_user(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = user_id
      AND role IN ('admin', 'moderator', 'support_agent', 'operations_staff')
  );
$$;

-- Helper: true for admin only
CREATE OR REPLACE FUNCTION public.is_admin_user(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = user_id AND role = 'admin'
  );
$$;

-- Policies for staff_action_log
DROP POLICY IF EXISTS staff_action_log_admin_select ON public.staff_action_log;
CREATE POLICY staff_action_log_admin_select
  ON public.staff_action_log FOR SELECT
  USING (public.is_admin_user(auth.uid()));

DROP POLICY IF EXISTS staff_action_log_staff_select_own ON public.staff_action_log;
CREATE POLICY staff_action_log_staff_select_own
  ON public.staff_action_log FOR SELECT
  USING (staff_id = auth.uid());

DROP POLICY IF EXISTS staff_action_log_staff_insert ON public.staff_action_log;
CREATE POLICY staff_action_log_staff_insert
  ON public.staff_action_log FOR INSERT
  WITH CHECK (staff_id = auth.uid() AND public.is_admin_or_staff_user(auth.uid()));

-- Allow staff (and admin) to read user profiles for operational support
DROP POLICY IF EXISTS users_staff_read ON public.users;
CREATE POLICY users_staff_read
  ON public.users FOR SELECT
  USING (public.is_admin_or_staff_user(auth.uid()) OR auth.uid() = id);

-- Allow staff to update their own profile only (admin handled by existing admin policy)
DROP POLICY IF EXISTS users_staff_update_own ON public.users;
CREATE POLICY users_staff_update_own
  ON public.users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Allow staff to read providers for monitoring / applications
DROP POLICY IF EXISTS providers_staff_read ON public.providers;
CREATE POLICY providers_staff_read
  ON public.providers FOR SELECT
  USING (public.is_admin_or_staff_user(auth.uid()));

-- Allow staff to read bookings for support and monitoring
DROP POLICY IF EXISTS bookings_staff_read ON public.bookings;
CREATE POLICY bookings_staff_read
  ON public.bookings FOR SELECT
  USING (public.is_admin_or_staff_user(auth.uid()));

-- Allow staff to read reports and disputes
DROP POLICY IF EXISTS reports_staff_read ON public.reports;
CREATE POLICY reports_staff_read
  ON public.reports FOR SELECT
  USING (public.is_admin_or_staff_user(auth.uid()));

DROP POLICY IF EXISTS disputes_staff_read ON public.disputes;
CREATE POLICY disputes_staff_read
  ON public.disputes FOR SELECT
  USING (public.is_admin_or_staff_user(auth.uid()));

-- Allow staff to read and update booking incident reports
DROP POLICY IF EXISTS booking_incident_reports_staff_read ON public.booking_incident_reports;
CREATE POLICY booking_incident_reports_staff_read
  ON public.booking_incident_reports FOR SELECT
  USING (public.is_admin_or_staff_user(auth.uid()));

DROP POLICY IF EXISTS booking_incident_reports_staff_update ON public.booking_incident_reports;
CREATE POLICY booking_incident_reports_staff_update
  ON public.booking_incident_reports FOR UPDATE
  USING (public.is_admin_or_staff_user(auth.uid()));

-- Allow staff to read provider documents for verification review
DROP POLICY IF EXISTS provider_documents_staff_read ON public.provider_documents;
CREATE POLICY provider_documents_staff_read
  ON public.provider_documents FOR SELECT
  USING (public.is_admin_or_staff_user(auth.uid()));

-- Indexes for audit log lookups
CREATE INDEX IF NOT EXISTS idx_staff_action_log_staff_id ON public.staff_action_log(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_action_log_created_at ON public.staff_action_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_action_log_action ON public.staff_action_log(action);

-- Escalations table: staff can escalate a case/record to admin review
CREATE TABLE IF NOT EXISTS public.escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  target_table text,
  target_record_id uuid,
  target_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
  reason text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_escalations_created_by ON public.escalations(created_by);
CREATE INDEX IF NOT EXISTS idx_escalations_assigned_to ON public.escalations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_escalations_status ON public.escalations(status);
CREATE INDEX IF NOT EXISTS idx_escalations_created_at ON public.escalations(created_at DESC);

-- Escalation policies: staff can create and view own escalations; admin can view/update all
DROP POLICY IF EXISTS escalations_admin_all ON public.escalations;
CREATE POLICY escalations_admin_all
  ON public.escalations FOR ALL
  USING (public.is_admin_user(auth.uid()))
  WITH CHECK (public.is_admin_user(auth.uid()));

DROP POLICY IF EXISTS escalations_staff_insert ON public.escalations;
CREATE POLICY escalations_staff_insert
  ON public.escalations FOR INSERT
  WITH CHECK (public.is_admin_or_staff_user(auth.uid()));

DROP POLICY IF EXISTS escalations_staff_select_own ON public.escalations;
CREATE POLICY escalations_staff_select_own
  ON public.escalations FOR SELECT
  USING (created_by = auth.uid());

-- Trigger: ensure staff accounts have a valid staff role and are active by default
CREATE OR REPLACE FUNCTION public.enforce_staff_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('moderator', 'support_agent', 'operations_staff') THEN
    IF NEW.is_active IS NULL THEN
      NEW.is_active := true;
    END IF;
    IF NEW.employment_status IS NULL THEN
      NEW.employment_status := 'active';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_staff_role ON public.users;
CREATE TRIGGER trg_enforce_staff_role
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_staff_role();

-- Trigger: enforce admin-only changes to role, employment_status, and internal_notes
CREATE OR REPLACE FUNCTION public.enforce_admin_only_user_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admin can change the role column
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT public.is_admin_user(auth.uid()) THEN
      RAISE EXCEPTION 'Only admin can change user roles';
    END IF;
  END IF;

  -- Only admin can change employment_status or internal_notes
  IF OLD.employment_status IS DISTINCT FROM NEW.employment_status
     OR OLD.internal_notes IS DISTINCT FROM NEW.internal_notes THEN
    IF NOT public.is_admin_user(auth.uid()) THEN
      RAISE EXCEPTION 'Only admin can change employment status or internal notes';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_admin_only_user_fields ON public.users;
CREATE TRIGGER trg_enforce_admin_only_user_fields
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_admin_only_user_fields();
