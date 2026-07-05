-- ============================================================
-- Phase 1: TAGA Provider Platform Fee System
-- Date: 2026-07-05
-- ============================================================
--
-- Creates:
--   platform_fee_schedule         — approved fee tier lookup table
--   provider_platform_fees        — one row per completed booking (append-only)
--   calculate_platform_fee()      — SQL function: amount → fee
--   is_admin_or_staff()           — RLS helper
--   get_provider_fee_balance()    — RPC: returns balance summary for a provider
--   create_platform_fee_on_completion() — trigger fired AFTER booking → completed
--   RLS policies for both new tables
--   Extended notifications_type_check for platform fee notification types
--
-- NOT in this phase:
--   Payment collection, PayMongo, manual proof, suspensions, PDF statements
-- ============================================================

-- ============================================================
-- 1. PLATFORM FEE SCHEDULE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.platform_fee_schedule (
  id          UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  min_amount  DECIMAL(10,2) NOT NULL,
  max_amount  DECIMAL(10,2),                    -- NULL = no upper bound
  fee_amount  DECIMAL(10,2) NOT NULL,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   DEFAULT NOW()
);

-- Seed approved brackets (idempotent — safe to re-run)
INSERT INTO public.platform_fee_schedule (min_amount, max_amount, fee_amount) VALUES
  (    1.00,    199.00,   5.00),
  (  200.00,    500.00,  10.00),
  (  501.00,   1000.00,  30.00),
  ( 1001.00,   3000.00,  50.00),
  ( 3001.00,   5000.00, 100.00),
  ( 5001.00,   8000.00, 150.00),
  ( 8001.00,  12000.00, 200.00),
  (12001.00,  16000.00, 250.00),
  (16001.00,       NULL, 300.00)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. PROVIDER PLATFORM FEES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.provider_platform_fees (
  id             UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id    UUID          NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  booking_id     UUID          NOT NULL REFERENCES public.bookings(id)  ON DELETE RESTRICT,
  booking_amount DECIMAL(10,2) NOT NULL,
  platform_fee   DECIMAL(10,2) NOT NULL,
  status         TEXT          NOT NULL DEFAULT 'unpaid'
                   CHECK (status IN ('unpaid', 'paid', 'waived', 'disputed')),
  due_date       TIMESTAMPTZ   NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ   DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   DEFAULT NOW(),

  -- One fee per booking — prevents duplicates at the DB level
  UNIQUE (booking_id)
);

CREATE INDEX IF NOT EXISTS idx_ppf_provider
  ON public.provider_platform_fees(provider_id);
CREATE INDEX IF NOT EXISTS idx_ppf_status
  ON public.provider_platform_fees(status);
CREATE INDEX IF NOT EXISTS idx_ppf_due_date
  ON public.provider_platform_fees(due_date);
CREATE INDEX IF NOT EXISTS idx_ppf_provider_status
  ON public.provider_platform_fees(provider_id, status);

-- ============================================================
-- 3. CALCULATE PLATFORM FEE (pure lookup — no side effects)
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_platform_fee(
  p_booking_amount DECIMAL
)
RETURNS DECIMAL STABLE SECURITY DEFINER
LANGUAGE sql AS $$
  SELECT fee_amount
  FROM   public.platform_fee_schedule
  WHERE  is_active = TRUE
    AND  p_booking_amount >= min_amount
    AND  (max_amount IS NULL OR p_booking_amount <= max_amount)
  ORDER  BY min_amount DESC
  LIMIT  1;
$$;

-- ============================================================
-- 4. IS_ADMIN_OR_STAFF HELPER (used in RLS)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS BOOLEAN STABLE SECURITY DEFINER
LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   public.users
    WHERE  id   = auth.uid()
      AND  role IN ('admin', 'moderator', 'support_agent', 'operations_staff')
  );
$$;

-- ============================================================
-- 5. TRIGGER: CREATE FEE ON BOOKING COMPLETION
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_platform_fee_on_completion()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_amount DECIMAL(10,2);
  v_fee    DECIMAL(10,2);
BEGIN
  -- Only fire on status transition → completed
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_amount := COALESCE(NEW.total_amount, 0);

  -- Skip if booking has no amount (cash payment amount not recorded)
  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  v_fee := public.calculate_platform_fee(v_amount);

  IF v_fee IS NOT NULL AND v_fee > 0 THEN
    -- ON CONFLICT DO NOTHING is the second line of defence against duplicates
    INSERT INTO public.provider_platform_fees (
      provider_id, booking_id, booking_amount, platform_fee, status, due_date
    ) VALUES (
      NEW.provider_id,
      NEW.id,
      v_amount,
      v_fee,
      'unpaid',
      NOW() + INTERVAL '30 days'
    )
    ON CONFLICT (booking_id) DO NOTHING;

    -- Notify provider (non-fatal — INSERT may fail if type constraint changes)
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        NEW.provider_id,
        'platform_fee_added',
        'TAGA Platform Fee',
        'A platform fee of ₱' || v_fee::TEXT ||
          ' has been recorded for your completed booking.',
        jsonb_build_object(
          'booking_id', NEW.id,
          'fee',        v_fee,
          'due_date',   (NOW() + INTERVAL '30 days')::TEXT
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log but do not rollback the fee creation
      RAISE WARNING '[platform_fee] notification insert failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_completed_platform_fee ON public.bookings;

CREATE TRIGGER booking_completed_platform_fee
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.create_platform_fee_on_completion();

-- ============================================================
-- 6. RPC: GET PROVIDER FEE BALANCE
--    Callable by the provider (own data) or admin/staff
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_provider_fee_balance(
  p_provider_id UUID
)
RETURNS TABLE (
  total_unpaid      DECIMAL(10,2),
  oldest_due_date   TIMESTAMPTZ,
  days_since_oldest INTEGER,
  balance_status    TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_caller UUID;
  v_role   TEXT;
  v_total  DECIMAL(10,2);
  v_oldest TIMESTAMPTZ;
  v_days   INTEGER;
  v_status TEXT;
BEGIN
  v_caller := auth.uid();

  SELECT role INTO v_role
  FROM   public.users
  WHERE  id = v_caller;

  -- Access control: own data OR admin/staff
  IF v_caller <> p_provider_id
     AND v_role NOT IN ('admin', 'moderator', 'support_agent', 'operations_staff')
  THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT
    COALESCE(SUM(platform_fee), 0),
    MIN(due_date)
  INTO v_total, v_oldest
  FROM public.provider_platform_fees
  WHERE provider_id = p_provider_id
    AND status      = 'unpaid';

  v_days := CASE
    WHEN v_oldest IS NULL THEN 0
    ELSE GREATEST(
           0,
           (EXTRACT(EPOCH FROM (NOW() - v_oldest)) / 86400.0)::INTEGER
         )
  END;

  v_status := CASE
    WHEN v_total = 0  THEN 'clear'
    WHEN v_days <= 30 THEN 'clear'
    WHEN v_days <= 45 THEN 'warning'
    WHEN v_days <= 60 THEN 'overdue'
    ELSE                   'review'
  END;

  RETURN QUERY SELECT v_total, v_oldest, v_days, v_status;
END;
$$;

-- ============================================================
-- 7. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.platform_fee_schedule   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_platform_fees  ENABLE ROW LEVEL SECURITY;

-- platform_fee_schedule: authenticated users can read active tiers
DROP POLICY IF EXISTS "ppf_schedule_read" ON public.platform_fee_schedule;
CREATE POLICY "ppf_schedule_read" ON public.platform_fee_schedule
  FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = TRUE);

-- platform_fee_schedule: only admin can manage tiers
DROP POLICY IF EXISTS "ppf_schedule_admin" ON public.platform_fee_schedule;
CREATE POLICY "ppf_schedule_admin" ON public.platform_fee_schedule
  FOR ALL
  USING (public.is_admin());

-- provider_platform_fees: providers read ONLY their own fees
DROP POLICY IF EXISTS "ppf_provider_read_own" ON public.provider_platform_fees;
CREATE POLICY "ppf_provider_read_own" ON public.provider_platform_fees
  FOR SELECT
  USING (auth.uid() = provider_id);

-- provider_platform_fees: admin and staff read ALL
DROP POLICY IF EXISTS "ppf_admin_staff_read" ON public.provider_platform_fees;
CREATE POLICY "ppf_admin_staff_read" ON public.provider_platform_fees
  FOR SELECT
  USING (public.is_admin_or_staff());

-- provider_platform_fees: only admin can update fees (mark paid / waived)
-- INSERT is handled exclusively by SECURITY DEFINER trigger (bypasses RLS)
DROP POLICY IF EXISTS "ppf_admin_update" ON public.provider_platform_fees;
CREATE POLICY "ppf_admin_update" ON public.provider_platform_fees
  FOR UPDATE
  USING (public.is_admin());

-- ============================================================
-- 8. EXTEND notifications_type_check FOR PLATFORM FEE TYPES
-- ============================================================
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- Booking lifecycle
    'booking_submitted',
    'booking_accepted',
    'booking_rejected',
    'booking_cancelled',
    'booking_on_the_way',
    'booking_arrived',
    'booking_in_progress',
    'booking_completed',
    'booking_reminder',
    'provider_on_the_way',
    'provider_arrived',
    -- Messages
    'chat_message',
    'new_message',
    -- Legacy
    'service_completed',
    -- Reviews
    'review_received',
    'review_reminder',
    -- Provider verification
    'verification_approved',
    'verification_rejected',
    'document_approved',
    'document_rejected',
    -- Featured provider
    'featured_approved',
    -- Disputes
    'dispute_opened',
    'dispute_updated',
    'dispute_resolved',
    -- Admin broadcasts
    'announcement',
    'maintenance',
    'policy_update',
    'marketing',
    -- Generic
    'system',
    -- Platform fees (Phase 1)
    'platform_fee_added',
    'platform_fee_reminder',
    'platform_fee_overdue'
  ));
