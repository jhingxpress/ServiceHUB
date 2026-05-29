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
-- 7. REMOVE CUSTOMER KYC (frictionless onboarding policy)
-- ============================================================

-- Drop customer KYC columns from users table
ALTER TABLE public.users
DROP COLUMN IF EXISTS kyc_status,
DROP COLUMN IF EXISTS kyc_documents,
DROP COLUMN IF EXISTS kyc_rejection_reason;

-- Add customer status and location fields
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS province TEXT;

-- Update provider KYC comments
COMMENT ON COLUMN public.providers.kyc_status IS 'DEPRECATED: Provider-only legacy field';
COMMENT ON COLUMN public.providers.kyc_documents IS 'DEPRECATED: Provider-only legacy field';
COMMENT ON COLUMN public.providers.kyc_rejection_reason IS 'DEPRECATED: Provider-only legacy field';
COMMENT ON COLUMN public.providers.bio IS 'DEPRECATED: Use service_description instead';

-- Drop provider kyc index
DROP INDEX IF EXISTS idx_providers_kyc;

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

DROP POLICY IF EXISTS "Service images public read" ON public.service_images;
CREATE POLICY "Service images public read" ON public.service_images FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service images provider insert" ON public.service_images;
CREATE POLICY "Service images provider insert" ON public.service_images FOR INSERT
  WITH CHECK (auth.uid() = (SELECT provider_id FROM public.services WHERE id = service_id));
DROP POLICY IF EXISTS "Service images provider delete" ON public.service_images;
CREATE POLICY "Service images provider delete" ON public.service_images FOR DELETE
  USING (auth.uid() = (SELECT provider_id FROM public.services WHERE id = service_id));

-- Provider Gallery: public read; provider manages own
ALTER TABLE public.provider_gallery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider gallery public read" ON public.provider_gallery;
CREATE POLICY "Provider gallery public read" ON public.provider_gallery FOR SELECT USING (true);
DROP POLICY IF EXISTS "Provider gallery provider insert" ON public.provider_gallery;
CREATE POLICY "Provider gallery provider insert" ON public.provider_gallery FOR INSERT
  WITH CHECK (auth.uid() = provider_id);
DROP POLICY IF EXISTS "Provider gallery provider delete" ON public.provider_gallery;
CREATE POLICY "Provider gallery provider delete" ON public.provider_gallery FOR DELETE
  USING (auth.uid() = provider_id);

-- Provider Badges: public read; admin manages
ALTER TABLE public.provider_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider badges public read" ON public.provider_badges;
CREATE POLICY "Provider badges public read" ON public.provider_badges FOR SELECT USING (true);
DROP POLICY IF EXISTS "Provider badges admin manage" ON public.provider_badges;
CREATE POLICY "Provider badges admin manage" ON public.provider_badges FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- Favorite Providers: customer manages own; provider reads own
ALTER TABLE public.favorite_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Favorites customer manage" ON public.favorite_providers;
CREATE POLICY "Favorites customer manage" ON public.favorite_providers FOR ALL
  USING (auth.uid() = customer_id);
DROP POLICY IF EXISTS "Favorites provider read" ON public.favorite_providers;
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
-- 14. REJECTED FIELDS ON PROVIDERS
-- ============================================================

ALTER TABLE public.providers
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- ============================================================
-- 15. NOTIFICATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'booking_submitted', 'booking_accepted', 'booking_rejected',
    'provider_on_the_way', 'provider_arrived', 'service_completed',
    'review_reminder', 'document_approved', 'document_rejected',
    'verification_approved', 'verification_rejected'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}'::JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = FALSE;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notifications user read" ON public.notifications;
CREATE POLICY "Notifications user read" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Notifications user update" ON public.notifications;
CREATE POLICY "Notifications user update" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Notifications system insert" ON public.notifications;
CREATE POLICY "Notifications system insert" ON public.notifications FOR INSERT WITH CHECK (true);

-- ============================================================
-- 16. PROVIDER STATS TABLE (denormalized for fast reads)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.provider_stats (
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE PRIMARY KEY,
  completed_jobs INTEGER DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0.00,
  response_rate INTEGER DEFAULT 0 CHECK (response_rate >= 0 AND response_rate <= 100),
  favorite_count INTEGER DEFAULT 0,
  average_response_minutes INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_stats_rating ON public.provider_stats(average_rating DESC);

ALTER TABLE public.provider_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Provider stats public read" ON public.provider_stats;
CREATE POLICY "Provider stats public read" ON public.provider_stats FOR SELECT USING (true);

-- Add missing is_visible column to reviews (schema was updated after initial migration)
ALTER TABLE public.reviews
ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT TRUE;

-- ============================================================
-- 17. HAVERSINE DISTANCE FUNCTION FOR GPS DISCOVERY
-- ============================================================

CREATE OR REPLACE FUNCTION public.haversine_distance(
  lat1 DECIMAL, lon1 DECIMAL, lat2 DECIMAL, lon2 DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
  R DECIMAL := 6371;
  dLat DECIMAL;
  dLon DECIMAL;
  a DECIMAL;
  c DECIMAL;
BEGIN
  dLat := RADIANS(lat2 - lat1);
  dLon := RADIANS(lon2 - lon1);
  a := SIN(dLat/2) * SIN(dLat/2) +
       COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
       SIN(dLon/2) * SIN(dLon/2);
  c := 2 * ATAN2(SQRT(a), SQRT(1-a));
  RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- 18. FIX PROVIDER STATUS CHANGE TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_provider_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    NEW.is_verified = TRUE;
    NEW.approved_at = NOW();
    NEW.rejected_at = NULL;
    NEW.rejection_reason = NULL;
  ELSIF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
    NEW.is_verified = FALSE;
    NEW.rejected_at = NOW();
    NEW.approved_at = NULL;
  ELSIF NEW.status = 'suspended' AND OLD.status != 'suspended' THEN
    NEW.is_verified = FALSE;
    NEW.approved_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS providers_status_change ON public.providers;
CREATE TRIGGER providers_status_change
  BEFORE UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.handle_provider_status_change();

-- ============================================================
-- 19. PROVIDER STATS SYNC TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_provider_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.provider_stats (
    provider_id, completed_jobs, total_reviews, average_rating, response_rate
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.completed_jobs, 0),
    COALESCE(NEW.total_reviews, 0),
    COALESCE(NEW.rating, 0.00),
    COALESCE(NEW.response_rate, 0)
  )
  ON CONFLICT (provider_id) DO UPDATE SET
    completed_jobs = EXCLUDED.completed_jobs,
    total_reviews = EXCLUDED.total_reviews,
    average_rating = EXCLUDED.average_rating,
    response_rate = EXCLUDED.response_rate,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS providers_sync_stats ON public.providers;
CREATE TRIGGER providers_sync_stats
  AFTER INSERT OR UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.sync_provider_stats();

CREATE OR REPLACE FUNCTION public.sync_favorite_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.provider_stats
    SET favorite_count = (SELECT COUNT(*) FROM public.favorite_providers WHERE provider_id = NEW.provider_id),
        updated_at = NOW()
    WHERE provider_id = NEW.provider_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.provider_stats
    SET favorite_count = (SELECT COUNT(*) FROM public.favorite_providers WHERE provider_id = OLD.provider_id),
        updated_at = NOW()
    WHERE provider_id = OLD.provider_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS favorites_sync_count ON public.favorite_providers;
CREATE TRIGGER favorites_sync_count
  AFTER INSERT OR DELETE ON public.favorite_providers
  FOR EACH ROW EXECUTE FUNCTION public.sync_favorite_count();

-- ============================================================
-- 20. BOOKING NOTIFICATION TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_booking_notification()
RETURNS TRIGGER AS $$
DECLARE
  cust_name TEXT;
  prov_name TEXT;
BEGIN
  SELECT full_name INTO cust_name FROM public.users WHERE id = NEW.customer_id;
  SELECT COALESCE(business_name, u.full_name) INTO prov_name
  FROM public.providers p LEFT JOIN public.users u ON p.id = u.id
  WHERE p.id = NEW.provider_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.provider_id, 'booking_submitted',
      'New Booking Request',
      cust_name || ' requested a booking for ' || NEW.scheduled_date,
      jsonb_build_object('booking_id', NEW.id, 'status', NEW.status)
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status != OLD.status THEN
    IF NEW.status = 'accepted' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'booking_accepted', 'Booking Accepted',
        prov_name || ' accepted your booking request', jsonb_build_object('booking_id', NEW.id));
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'booking_rejected', 'Booking Rejected',
        'Your booking request was declined', jsonb_build_object('booking_id', NEW.id));
    ELSIF NEW.status = 'on_the_way' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'provider_on_the_way', 'Provider On The Way',
        prov_name || ' is on the way to your location', jsonb_build_object('booking_id', NEW.id));
    ELSIF NEW.status = 'arrived' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'provider_arrived', 'Provider Arrived',
        prov_name || ' has arrived at your location', jsonb_build_object('booking_id', NEW.id));
    ELSIF NEW.status = 'completed' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (NEW.customer_id, 'service_completed', 'Service Completed',
        'Your service is complete. Please leave a review!', jsonb_build_object('booking_id', NEW.id));
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_create_notification ON public.bookings;
CREATE TRIGGER bookings_create_notification
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.create_booking_notification();

-- ============================================================
-- 21. BACKFILL PROVIDER STATS
-- ============================================================

INSERT INTO public.provider_stats (provider_id, completed_jobs, total_reviews, average_rating, response_rate)
SELECT id, COALESCE(completed_jobs, 0), COALESCE(total_reviews, 0), COALESCE(rating, 0.00), COALESCE(response_rate, 0)
FROM public.providers
ON CONFLICT (provider_id) DO NOTHING;

-- ============================================================
-- 22. REPORTS & MODERATION TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reported_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL CHECK (report_type IN (
    'fake_provider', 'fake_customer', 'spam', 'harassment', 'fraud',
    'no_show', 'inappropriate_content', 'other'
  )),
  description TEXT NOT NULL,
  evidence_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved', 'dismissed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user ON public.reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports(created_at DESC);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Reports reporter read" ON public.reports;
CREATE POLICY "Reports reporter read" ON public.reports FOR SELECT USING (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "Reports admin read" ON public.reports;
CREATE POLICY "Reports admin read" ON public.reports FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);
DROP POLICY IF EXISTS "Reports reporter insert" ON public.reports;
CREATE POLICY "Reports reporter insert" ON public.reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
DROP POLICY IF EXISTS "Reports admin update" ON public.reports;
CREATE POLICY "Reports admin update" ON public.reports FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================================
-- 23. SOFT DELETE COLUMNS + PROVIDER STATUS + RESPONSE METRICS
-- ============================================================
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS current_status TEXT NOT NULL DEFAULT 'offline' CHECK (current_status IN ('online', 'busy', 'offline'));
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_providers_current_status ON public.providers(current_status);
CREATE INDEX IF NOT EXISTS idx_providers_deleted_at ON public.providers(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON public.users(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_services_deleted_at ON public.services(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================
-- 24. RESPONSE TIME CALCULATION FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_provider_response_time(p_provider_id UUID)
RETURNS INTEGER AS $$
DECLARE
  avg_minutes INTEGER;
BEGIN
  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (provider_reply.created_at - customer_first.created_at)) / 60), 0)::INTEGER
  INTO avg_minutes
  FROM public.bookings b
  JOIN LATERAL (
    SELECT m.created_at
    FROM public.messages m
    WHERE m.booking_id = b.id
      AND m.sender_id = b.customer_id
      AND LENGTH(TRIM(m.content)) > 0
    ORDER BY m.created_at ASC
    LIMIT 1
  ) customer_first ON true
  JOIN LATERAL (
    SELECT m.created_at
    FROM public.messages m
    WHERE m.booking_id = b.id
      AND m.sender_id = b.provider_id
      AND m.created_at > customer_first.created_at
      AND LENGTH(TRIM(m.content)) > 0
    ORDER BY m.created_at ASC
    LIMIT 1
  ) provider_reply ON true
  WHERE b.provider_id = p_provider_id
    AND b.status IN ('accepted', 'on_the_way', 'arrived', 'in_progress', 'completed');

  RETURN avg_minutes;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_provider_response_time()
RETURNS TRIGGER AS $$
DECLARE
  target_provider_id UUID;
  new_avg INTEGER;
BEGIN
  IF NEW.sender_id = (SELECT customer_id FROM public.bookings WHERE id = NEW.booking_id) THEN
    target_provider_id := (SELECT provider_id FROM public.bookings WHERE id = NEW.booking_id);
    new_avg := public.calculate_provider_response_time(target_provider_id);
    UPDATE public.provider_stats
    SET average_response_minutes = new_avg, updated_at = NOW()
    WHERE provider_id = target_provider_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_update_response_time ON public.messages;
CREATE TRIGGER messages_update_response_time
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_provider_response_time();

-- ============================================================
-- 25. RLS POLICY FIXES: Soft delete + Admin read all users
-- ============================================================

-- Users: enforce soft delete for own reads; admin can read all
DROP POLICY IF EXISTS "Users read own profile" ON public.users;
CREATE POLICY "Users read own profile" ON public.users FOR SELECT USING (
  auth.uid() = id AND deleted_at IS NULL
);
DROP POLICY IF EXISTS "Admins read all users" ON public.users;
CREATE POLICY "Admins read all users" ON public.users FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Providers: enforce soft delete for public reads; self and admin exempt
DROP POLICY IF EXISTS "Providers public read" ON public.providers;
CREATE POLICY "Providers public read" ON public.providers FOR SELECT USING (
    (status = 'approved' AND deleted_at IS NULL)
    OR auth.uid() = id
    OR EXISTS (
        SELECT 1
        FROM public.users
        WHERE id = auth.uid()
        AND role = 'admin'
    )
);

-- Services: enforce soft delete for public reads; self and admin exempt
DROP POLICY IF EXISTS "Services public read" ON public.services;
CREATE POLICY "Services public read" ON public.services FOR SELECT USING (
  deleted_at IS NULL AND (
    EXISTS (SELECT 1 FROM public.providers WHERE id = provider_id AND deleted_at IS NULL)
    OR auth.uid() = provider_id
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  )
);

-- Bookings: add admin read
DROP POLICY IF EXISTS "Bookings admin read" ON public.bookings;
CREATE POLICY "Bookings admin read" ON public.bookings FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Payments: add admin read
DROP POLICY IF EXISTS "Payments read" ON public.payments;
CREATE POLICY "Payments read" ON public.payments FOR SELECT USING (
  auth.uid() = customer_id OR auth.uid() = provider_id
  OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Messages: add admin read
DROP POLICY IF EXISTS "Messages read" ON public.messages;
CREATE POLICY "Messages read" ON public.messages FOR SELECT USING (
  auth.uid() = sender_id OR auth.uid() = receiver_id
  OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Disputes: add admin read
DROP POLICY IF EXISTS "Disputes read" ON public.disputes;
CREATE POLICY "Disputes read" ON public.disputes FOR SELECT USING (
  auth.uid() = raised_by
  OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================================
-- 26. PROVIDER VERIFICATION NOTIFICATIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_provider_verification_notification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'pending_review' AND NEW.status = 'approved' THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.id,
      'verification_approved',
      'Application Approved',
      'Your provider application has been approved. You may now publish services and receive bookings.',
      jsonb_build_object('provider_id', NEW.id, 'status', NEW.status, 'review_timestamp', NOW())
    );
  ELSIF OLD.status = 'pending_review' AND NEW.status = 'rejected' THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      NEW.id,
      'verification_rejected',
      'Application Rejected',
      'Your provider application was rejected. Please review the feedback and resubmit your documents.',
      jsonb_build_object('provider_id', NEW.id, 'status', NEW.status, 'review_timestamp', NOW())
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS providers_verification_notification ON public.providers;
CREATE TRIGGER providers_verification_notification
  AFTER UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.handle_provider_verification_notification();

-- ============================================================
-- 27. VERIFY MIGRATION
-- ============================================================

SELECT 'Migration complete' AS status;
