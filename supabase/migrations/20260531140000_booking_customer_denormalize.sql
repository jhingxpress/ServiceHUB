-- ============================================================
-- SPRINT 4B — DENORMALIZE CUSTOMER NAME INTO BOOKINGS
-- Fix: Provider booking detail shows '?' + 'Customer' because
--      RLS prevents providers from reading users table FK join.
-- ============================================================

-- 1. ADD customer name columns to bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS customer_avatar_url TEXT;

-- 2. BACKFILL existing bookings from users table
UPDATE public.bookings b
SET
  customer_name = u.full_name,
  customer_phone = u.phone,
  customer_avatar_url = u.avatar_url
FROM public.users u
WHERE b.customer_id = u.id
  AND (b.customer_name IS NULL OR b.customer_name = '');

-- 3. FUNCTION: auto-populate customer fields on booking insert
CREATE OR REPLACE FUNCTION public.populate_booking_customer_fields()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  SELECT full_name, phone, avatar_url
  INTO NEW.customer_name, NEW.customer_phone, NEW.customer_avatar_url
  FROM public.users
  WHERE id = NEW.customer_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. TRIGGER: run before insert on bookings
DROP TRIGGER IF EXISTS bookings_populate_customer ON public.bookings;
CREATE TRIGGER bookings_populate_customer
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.populate_booking_customer_fields();
