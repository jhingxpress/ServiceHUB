-- ============================================================
-- SPRINT 4B — DENORMALIZE CUSTOMER NAME INTO REVIEWS
-- Fix: Provider storefront/profile shows 'Customer' because
--      RLS prevents reading users table FK join on reviews.
-- ============================================================

-- 1. ADD customer name columns to reviews
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_avatar_url TEXT;

-- 2. BACKFILL existing reviews from users table
UPDATE public.reviews r
SET
  customer_name = u.full_name,
  customer_avatar_url = u.avatar_url
FROM public.users u
WHERE r.customer_id = u.id
  AND (r.customer_name IS NULL OR r.customer_name = '');

-- 3. FUNCTION: auto-populate customer fields on review insert
CREATE OR REPLACE FUNCTION public.populate_review_customer_fields()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  SELECT full_name, avatar_url
  INTO NEW.customer_name, NEW.customer_avatar_url
  FROM public.users
  WHERE id = NEW.customer_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. TRIGGER: run before insert on reviews
DROP TRIGGER IF EXISTS reviews_populate_customer ON public.reviews;
CREATE TRIGGER reviews_populate_customer
  BEFORE INSERT ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.populate_review_customer_fields();
