-- ============================================================
-- ServiceHub Architecture Renovation Migration
-- Date: 2026-05-29
-- ============================================================

-- ============================================================
-- 1. PROVIDER TYPE & STOREFRONT FIELDS
-- ============================================================

-- Add provider_type (individual or business)
ALTER TABLE public.providers
ADD COLUMN IF NOT EXISTS provider_type TEXT NOT NULL DEFAULT 'individual'
CHECK (provider_type IN ('individual', 'business'));

-- Add storefront fields
ALTER TABLE public.providers
ADD COLUMN IF NOT EXISTS cover_photo TEXT,
ADD COLUMN IF NOT EXISTS business_logo TEXT,
ADD COLUMN IF NOT EXISTS member_since TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS response_rate INTEGER DEFAULT 0 CHECK (response_rate >= 0 AND response_rate <= 100),
ADD COLUMN IF NOT EXISTS service_radius_km INTEGER DEFAULT 10 CHECK (service_radius_km > 0 AND service_radius_km <= 100);

-- Add spatial index support for GPS queries
CREATE INDEX IF NOT EXISTS idx_providers_location ON public.providers USING btree (latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND status = 'approved';

-- ============================================================
-- 2. BOOKING WORKFLOW UPGRADE
-- ============================================================

-- Add on_the_way and arrived statuses
ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_status_check CHECK (
  status IN ('pending', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled', 'rejected', 'disputed')
);

-- Add provider location tracking per booking
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS provider_latitude DECIMAL(10,7),
ADD COLUMN IF NOT EXISTS provider_longitude DECIMAL(10,7);

-- Add index for booking status + provider for active jobs queries
CREATE INDEX IF NOT EXISTS idx_bookings_status_provider ON public.bookings(status, provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status_customer ON public.bookings(status, customer_id);

-- ============================================================
-- 3. SERVICE IMAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_images_service ON public.service_images(service_id);

-- ============================================================
-- 4. PROVIDER GALLERY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.provider_gallery (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  caption TEXT,
  is_before_after BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_gallery_provider ON public.provider_gallery(provider_id);

-- ============================================================
-- 5. PROVIDER BADGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.provider_badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  badge_type TEXT NOT NULL CHECK (badge_type IN (
    'verified_provider',
    'fast_responder',
    'top_rated',
    '100_plus_jobs',
    '50_plus_jobs',
    'new_provider'
  )),
  awarded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (provider_id, badge_type)
);

CREATE INDEX IF NOT EXISTS idx_provider_badges_provider ON public.provider_badges(provider_id);

-- ============================================================
-- 6. FAVORITE PROVIDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.favorite_providers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (customer_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_customer ON public.favorite_providers(customer_id);
CREATE INDEX IF NOT EXISTS idx_favorites_provider ON public.favorite_providers(provider_id);

-- ============================================================
-- 7. CLEAN UP DUPLICATE/LEGACY PROVIDER FIELDS
-- ============================================================

-- Remove legacy KYC fields from providers (use users table KYC instead)
-- Note: These are kept but deprecated - we won't drop them to preserve data
-- Instead, add a comment
COMMENT ON COLUMN public.providers.kyc_status IS 'DEPRECATED: Use users.kyc_status instead';
COMMENT ON COLUMN public.providers.kyc_documents IS 'DEPRECATED: Use users.kyc_documents instead';
COMMENT ON COLUMN public.providers.kyc_rejection_reason IS 'DEPRECATED: Use users.kyc_rejection_reason instead';
COMMENT ON COLUMN public.providers.bio IS 'DEPRECATED: Use service_description instead';

-- ============================================================
-- 8. ENFORCE REVIEW RULE: ONLY COMPLETED BOOKINGS CAN BE REVIEWED
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_review_booking_status()
RETURNS TRIGGER AS $$
DECLARE
  booking_status TEXT;
BEGIN
  SELECT status INTO booking_status
  FROM public.bookings
  WHERE id = NEW.booking_id;

  IF booking_status != 'completed' THEN
    RAISE EXCEPTION 'Reviews can only be created for completed bookings. Booking status: %', booking_status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS reviews_validate_booking_status ON public.reviews;

CREATE TRIGGER reviews_validate_booking_status
  BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_review_booking_status();

-- ============================================================
-- 9. AUTO-AWARD BADGES FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_provider_badges()
RETURNS TRIGGER AS $$
BEGIN
  -- Verified Provider badge
  IF NEW.is_verified = TRUE THEN
    INSERT INTO public.provider_badges (provider_id, badge_type)
    VALUES (NEW.id, 'verified_provider')
    ON CONFLICT (provider_id, badge_type) DO NOTHING;
  END IF;

  -- 100+ Jobs badge
  IF NEW.completed_jobs >= 100 THEN
    INSERT INTO public.provider_badges (provider_id, badge_type)
    VALUES (NEW.id, '100_plus_jobs')
    ON CONFLICT (provider_id, badge_type) DO NOTHING;
  END IF;

  -- 50+ Jobs badge
  IF NEW.completed_jobs >= 50 THEN
    INSERT INTO public.provider_badges (provider_id, badge_type)
    VALUES (NEW.id, '50_plus_jobs')
    ON CONFLICT (provider_id, badge_type) DO NOTHING;
  END IF;

  -- Top Rated badge (4.5+ rating with 10+ reviews)
  IF NEW.rating >= 4.5 AND NEW.total_reviews >= 10 THEN
    INSERT INTO public.provider_badges (provider_id, badge_type)
    VALUES (NEW.id, 'top_rated')
    ON CONFLICT (provider_id, badge_type) DO NOTHING;
  END IF;

  -- Fast Responder badge (response_rate >= 90)
  IF NEW.response_rate >= 90 THEN
    INSERT INTO public.provider_badges (provider_id, badge_type)
    VALUES (NEW.id, 'fast_responder')
    ON CONFLICT (provider_id, badge_type) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS providers_update_badges ON public.providers;

CREATE TRIGGER providers_update_badges
  AFTER UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.update_provider_badges();

-- ============================================================
-- 10. UPDATE RESPONSE RATE FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_provider_response_rate()
RETURNS TRIGGER AS $$
DECLARE
  total_requests INTEGER;
  accepted_count INTEGER;
  new_rate INTEGER;
BEGIN
  -- Only calculate when status changes from pending
  IF OLD.status = 'pending' AND NEW.status != 'pending' THEN
    SELECT COUNT(*) INTO total_requests
    FROM public.bookings
    WHERE provider_id = NEW.provider_id;

    SELECT COUNT(*) INTO accepted_count
    FROM public.bookings
    WHERE provider_id = NEW.provider_id AND status IN ('accepted', 'on_the_way', 'arrived', 'in_progress', 'completed');

    IF total_requests > 0 THEN
      new_rate := (accepted_count::FLOAT / total_requests::FLOAT * 100)::INTEGER;
      UPDATE public.providers
      SET response_rate = new_rate
      WHERE id = NEW.provider_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_update_response_rate ON public.bookings;

CREATE TRIGGER bookings_update_response_rate
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_provider_response_rate();

-- ============================================================
-- 11. RLS POLICIES FOR NEW TABLES
-- ============================================================

-- Service Images: public read; provider manages own
ALTER TABLE public.service_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service images public read" ON public.service_images FOR SELECT USING (true);
CREATE POLICY "Service images provider insert" ON public.service_images FOR INSERT
  WITH CHECK (auth.uid() = (SELECT provider_id FROM public.services WHERE id = service_id));
CREATE POLICY "Service images provider delete" ON public.service_images FOR DELETE
  USING (auth.uid() = (SELECT provider_id FROM public.services WHERE id = service_id));

-- Provider Gallery: public read; provider manages own
ALTER TABLE public.provider_gallery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider gallery public read" ON public.provider_gallery FOR SELECT USING (true);
CREATE POLICY "Provider gallery provider insert" ON public.provider_gallery FOR INSERT
  WITH CHECK (auth.uid() = provider_id);
CREATE POLICY "Provider gallery provider delete" ON public.provider_gallery FOR DELETE
  USING (auth.uid() = provider_id);

-- Provider Badges: public read; admin manages
ALTER TABLE public.provider_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Provider badges public read" ON public.provider_badges FOR SELECT USING (true);
CREATE POLICY "Provider badges admin manage" ON public.provider_badges FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- Favorite Providers: customer manages own; provider reads own
ALTER TABLE public.favorite_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Favorites customer manage" ON public.favorite_providers FOR ALL
  USING (auth.uid() = customer_id);
CREATE POLICY "Favorites provider read" ON public.favorite_providers FOR SELECT
  USING (auth.uid() = provider_id);

-- ============================================================
-- 12. BACKFILL EXISTING PROVIDERS
-- ============================================================

-- Set member_since for existing providers based on created_at
UPDATE public.providers
SET member_since = created_at
WHERE member_since IS NULL;

-- Award badges to existing providers based on current stats
INSERT INTO public.provider_badges (provider_id, badge_type)
SELECT id, 'verified_provider'
FROM public.providers
WHERE is_verified = TRUE
ON CONFLICT (provider_id, badge_type) DO NOTHING;

INSERT INTO public.provider_badges (provider_id, badge_type)
SELECT id, '100_plus_jobs'
FROM public.providers
WHERE completed_jobs >= 100
ON CONFLICT (provider_id, badge_type) DO NOTHING;

INSERT INTO public.provider_badges (provider_id, badge_type)
SELECT id, '50_plus_jobs'
FROM public.providers
WHERE completed_jobs >= 50
ON CONFLICT (provider_id, badge_type) DO NOTHING;

INSERT INTO public.provider_badges (provider_id, badge_type)
SELECT id, 'top_rated'
FROM public.providers
WHERE rating >= 4.5 AND total_reviews >= 10
ON CONFLICT (provider_id, badge_type) DO NOTHING;

-- ============================================================
-- 13. SEED ADDITIONAL CATEGORIES
-- ============================================================

INSERT INTO public.categories (name, description, icon, color) VALUES
  ('LPG Delivery', 'Propane and LPG tank delivery and refilling services', 'flame-outline', '#F97316'),
  ('Water Delivery', 'Drinking water and bulk water delivery services', 'water-outline', '#0EA5E9'),
  ('Towing Services', 'Vehicle towing, roadside assistance and recovery', 'trail-sign-outline', '#EF4444'),
  ('Welding Services', 'Metal fabrication, repair and welding work', 'construct-outline', '#F59E0B'),
  ('Construction', 'General construction, renovation and repair services', 'business-outline', '#6366F1'),
  ('Courier Services', 'Package delivery, document courier and logistics', 'cube-outline', '#10B981'),
  ('Electrical Services', 'Wiring, panel upgrades, outlet and lighting installations', 'flash-outline', '#F59E0B'),
  ('Aircon Services', 'Air conditioning installation, cleaning, repair and maintenance', 'thermometer-outline', '#0EA5E9')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 14. VERIFY MIGRATION
-- ============================================================

SELECT 'Migration complete' AS status;
