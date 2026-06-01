-- ============================================================
-- SPRINT 4A — CUSTOMER PROFILE & LOCATION FOUNDATION
-- ============================================================

-- 1. ADD CUSTOMER PROFILE FIELDS TO users TABLE
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7),
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- 2. ADD BOOKING LOCATION FIELDS TO bookings TABLE
-- ============================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_city TEXT,
  ADD COLUMN IF NOT EXISTS booking_province TEXT;

-- 3. UPDATE EXISTING ROWS (backfill city/province from users where possible)
-- ============================================================

UPDATE public.bookings b
SET booking_city = u.city,
    booking_province = u.province
FROM public.users u
WHERE b.customer_id = u.id
  AND b.booking_city IS NULL
  AND u.city IS NOT NULL;
