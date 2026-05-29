-- ============================================================
-- ServiceHub Database Schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'provider', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
  city TEXT,
  province TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'construct-outline',
  color TEXT NOT NULL DEFAULT '#6366F1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROVIDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.providers (
  id UUID REFERENCES public.users(id) ON DELETE CASCADE PRIMARY KEY,
  -- Business information
  business_name TEXT,
  owner_name TEXT,
  business_address TEXT,
  city TEXT,
  province TEXT,
  business_email TEXT,
  business_phone TEXT,
  service_description TEXT,
  service_area TEXT,
  years_of_experience INTEGER DEFAULT 0,
  -- Legacy bio field (kept for compatibility)
  bio TEXT,
  -- Single service category per provider
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  hourly_rate DECIMAL(10,2),
  location TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  -- Onboarding & verification status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'suspended')),
  is_verified BOOLEAN DEFAULT FALSE,
  is_available BOOLEAN DEFAULT TRUE,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  -- Legacy KYC (kept for compatibility)
  kyc_status TEXT DEFAULT 'not_submitted' CHECK (kyc_status IN ('not_submitted', 'pending', 'approved', 'rejected')),
  kyc_documents JSONB DEFAULT '{}'::JSONB,
  kyc_rejection_reason TEXT,
  -- Storefront
  provider_type TEXT NOT NULL DEFAULT 'individual' CHECK (provider_type IN ('individual', 'business')),
  cover_photo TEXT,
  business_logo TEXT,
  member_since TIMESTAMPTZ DEFAULT NOW(),
  response_rate INTEGER DEFAULT 0 CHECK (response_rate >= 0 AND response_rate <= 100),
  service_radius_km INTEGER DEFAULT 10 CHECK (service_radius_km > 0 AND service_radius_km <= 100),
  -- Stats
  rating DECIMAL(3,2) DEFAULT 0.00,
  total_reviews INTEGER DEFAULT 0,
  completed_jobs INTEGER DEFAULT 0,
  total_earnings DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SERVICES (Sub-services under a provider's single category)
-- Each provider has ONE category; multiple sub-services under it
-- ============================================================
CREATE TABLE IF NOT EXISTS public.services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  -- Base price; detailed pricing is in service_options
  base_price DECIMAL(10,2) DEFAULT 0.00,
  duration_minutes INTEGER DEFAULT 60,
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SERVICE OPTIONS (Price variants per sub-service)
-- e.g. Aircon Cleaning → Window Type ₱500, Split Type ₱1200
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROVIDER DOCUMENTS (Onboarding verification documents)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.provider_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'valid_id', 'government_id',
    'barangay_clearance', 'business_permit',
    'dti_registration', 'bir_registration', 'tesda_certificate',
    'professional_cert', 'other_supporting'
  )),
  category_type TEXT NOT NULL DEFAULT 'permit_certificate'
    CHECK (category_type IN ('valid_id', 'permit_certificate')),
  id_type TEXT,
  side TEXT CHECK (side IN ('front', 'back')),
  file_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- ============================================================
-- SERVICE IMAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.service_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROVIDER GALLERY
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

-- ============================================================
-- PROVIDER BADGES
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

-- ============================================================
-- FAVORITE PROVIDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.favorite_providers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (customer_id, provider_id)
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'booking_submitted',
    'booking_accepted',
    'booking_rejected',
    'provider_on_the_way',
    'provider_arrived',
    'service_completed',
    'review_reminder',
    'document_approved',
    'document_rejected',
    'verification_approved',
    'verification_rejected'
  )),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}'::JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROVIDER STATS (denormalized for fast reads)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.provider_stats (
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE PRIMARY KEY,
  completed_jobs INTEGER DEFAULT 0,
  total_reviews INTEGER DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0.00,
  response_rate INTEGER DEFAULT 0 CHECK (response_rate >= 0 AND response_rate <= 100),
  favorite_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROVIDER VERIFICATION LOGS (Admin action audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.provider_verification_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BOOKINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  service_option_id UUID REFERENCES public.service_options(id) ON DELETE SET NULL,
  service_option_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending','accepted','on_the_way','arrived','in_progress','completed','cancelled','rejected','disputed')
  ),
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  location TEXT NOT NULL,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  provider_latitude DECIMAL(10,7),
  provider_longitude DECIMAL(10,7),
  notes TEXT,
  photo_urls JSONB DEFAULT '[]'::JSONB,
  total_amount DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE UNIQUE NOT NULL,
  customer_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  comment TEXT,
  is_visible BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill: add is_visible if table was created before this field
ALTER TABLE public.reviews
ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT TRUE;

-- ============================================================
-- REVIEW MEDIA (Photos and videos attached to reviews)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.review_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id UUID REFERENCES public.reviews(id) ON DELETE CASCADE NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  customer_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','refunded','failed')),
  payment_method TEXT,
  transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MESSAGES (Chat)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  delivery_status TEXT DEFAULT 'sent' CHECK (delivery_status IN ('sent', 'delivered', 'read')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROVIDER AVAILABILITY
-- ============================================================
CREATE TABLE IF NOT EXISTS public.availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL DEFAULT '08:00:00',
  end_time TIME NOT NULL DEFAULT '18:00:00',
  is_available BOOLEAN DEFAULT TRUE,
  UNIQUE (provider_id, day_of_week)
);

-- ============================================================
-- DISPUTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.disputes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE NOT NULL,
  raised_by UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
  resolution TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON public.bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider ON public.bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_messages_booking ON public.messages(booking_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_reviews_provider ON public.reviews(provider_id);
CREATE INDEX IF NOT EXISTS idx_services_provider ON public.services(provider_id);
CREATE INDEX IF NOT EXISTS idx_service_options_service ON public.service_options(service_id);
CREATE INDEX IF NOT EXISTS idx_review_media_review ON public.review_media(review_id);
CREATE INDEX IF NOT EXISTS idx_providers_category ON public.providers(category_id);
CREATE INDEX IF NOT EXISTS idx_providers_status ON public.providers(status);
CREATE INDEX IF NOT EXISTS idx_provider_documents_provider ON public.provider_documents(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_documents_status ON public.provider_documents(status);
CREATE INDEX IF NOT EXISTS idx_verification_logs_provider ON public.provider_verification_logs(provider_id);
CREATE INDEX IF NOT EXISTS idx_service_images_service ON public.service_images(service_id);
CREATE INDEX IF NOT EXISTS idx_provider_gallery_provider ON public.provider_gallery(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_badges_provider ON public.provider_badges(provider_id);
CREATE INDEX IF NOT EXISTS idx_favorites_customer ON public.favorite_providers(customer_id);
CREATE INDEX IF NOT EXISTS idx_favorites_provider ON public.favorite_providers(provider_id);
CREATE INDEX IF NOT EXISTS idx_providers_location ON public.providers USING btree (latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND status = 'approved';
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_provider_stats_rating ON public.provider_stats(average_rating DESC);

-- ============================================================
-- FUNCTIONS: Haversine distance for GPS discovery
-- ============================================================
CREATE OR REPLACE FUNCTION public.haversine_distance(
  lat1 DECIMAL, lon1 DECIMAL, lat2 DECIMAL, lon2 DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
  R DECIMAL := 6371; -- Earth radius in km
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
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_verification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_stats ENABLE ROW LEVEL SECURITY;

-- Users: read own profile; update own profile
DROP POLICY IF EXISTS "Users read own profile" ON public.users;
CREATE POLICY "Users read own profile" ON public.users FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users update own profile" ON public.users;
CREATE POLICY "Users update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users insert own profile" ON public.users;
CREATE POLICY "Users insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- Categories: public read
DROP POLICY IF EXISTS "Categories public read" ON public.categories;
CREATE POLICY "Categories public read" ON public.categories FOR SELECT USING (true);

-- Providers: public read approved; provider edits own; admin can update all
DROP POLICY IF EXISTS "Providers public read" ON public.providers;
CREATE POLICY "Providers public read" ON public.providers FOR SELECT USING (true);
DROP POLICY IF EXISTS "Providers insert own" ON public.providers;
CREATE POLICY "Providers insert own" ON public.providers FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Providers update own" ON public.providers;
CREATE POLICY "Providers update own" ON public.providers FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Providers admin update" ON public.providers;
CREATE POLICY "Providers admin update" ON public.providers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- Provider documents: provider manages own; admin reads all
DROP POLICY IF EXISTS "Provider docs read own" ON public.provider_documents;
CREATE POLICY "Provider docs read own" ON public.provider_documents
  FOR SELECT USING (auth.uid() = provider_id);
DROP POLICY IF EXISTS "Provider docs insert own" ON public.provider_documents;
CREATE POLICY "Provider docs insert own" ON public.provider_documents
  FOR INSERT WITH CHECK (auth.uid() = provider_id);
DROP POLICY IF EXISTS "Provider docs update own" ON public.provider_documents;
CREATE POLICY "Provider docs update own" ON public.provider_documents
  FOR UPDATE USING (auth.uid() = provider_id);
DROP POLICY IF EXISTS "Provider docs delete own" ON public.provider_documents;
CREATE POLICY "Provider docs delete own" ON public.provider_documents
  FOR DELETE USING (auth.uid() = provider_id);

-- Verification logs: provider reads own; admin inserts
DROP POLICY IF EXISTS "Verification logs read" ON public.provider_verification_logs;
CREATE POLICY "Verification logs read" ON public.provider_verification_logs
  FOR SELECT USING (auth.uid() = provider_id OR
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
DROP POLICY IF EXISTS "Verification logs insert" ON public.provider_verification_logs;
CREATE POLICY "Verification logs insert" ON public.provider_verification_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Services: public read active; provider manages own
DROP POLICY IF EXISTS "Services public read" ON public.services;
CREATE POLICY "Services public read" ON public.services FOR SELECT USING (true);
DROP POLICY IF EXISTS "Services provider insert" ON public.services;
CREATE POLICY "Services provider insert" ON public.services FOR INSERT WITH CHECK (auth.uid() = provider_id);
DROP POLICY IF EXISTS "Services provider update" ON public.services;
CREATE POLICY "Services provider update" ON public.services FOR UPDATE USING (auth.uid() = provider_id);
DROP POLICY IF EXISTS "Services provider delete" ON public.services;
CREATE POLICY "Services provider delete" ON public.services FOR DELETE USING (auth.uid() = provider_id);

-- Service Options: public read; provider manages own via service
DROP POLICY IF EXISTS "Service options public read" ON public.service_options;
CREATE POLICY "Service options public read" ON public.service_options FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service options provider insert" ON public.service_options;
CREATE POLICY "Service options provider insert" ON public.service_options FOR INSERT
  WITH CHECK (auth.uid() = (SELECT provider_id FROM public.services WHERE id = service_id));
DROP POLICY IF EXISTS "Service options provider update" ON public.service_options;
CREATE POLICY "Service options provider update" ON public.service_options FOR UPDATE
  USING (auth.uid() = (SELECT provider_id FROM public.services WHERE id = service_id));
DROP POLICY IF EXISTS "Service options provider delete" ON public.service_options;
CREATE POLICY "Service options provider delete" ON public.service_options FOR DELETE
  USING (auth.uid() = (SELECT provider_id FROM public.services WHERE id = service_id));

-- Bookings: customer sees own; provider sees own; admin sees all
DROP POLICY IF EXISTS "Bookings customer read" ON public.bookings;
CREATE POLICY "Bookings customer read" ON public.bookings FOR SELECT USING (auth.uid() = customer_id);
DROP POLICY IF EXISTS "Bookings provider read" ON public.bookings;
CREATE POLICY "Bookings provider read" ON public.bookings FOR SELECT USING (auth.uid() = provider_id);
DROP POLICY IF EXISTS "Bookings customer insert" ON public.bookings;
CREATE POLICY "Bookings customer insert" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = customer_id);
DROP POLICY IF EXISTS "Bookings customer cancel" ON public.bookings;
CREATE POLICY "Bookings customer cancel" ON public.bookings FOR UPDATE USING (auth.uid() = customer_id);
DROP POLICY IF EXISTS "Bookings provider update" ON public.bookings;
CREATE POLICY "Bookings provider update" ON public.bookings FOR UPDATE USING (auth.uid() = provider_id);

-- Reviews: public read visible; customer inserts own
DROP POLICY IF EXISTS "Reviews public read" ON public.reviews;
CREATE POLICY "Reviews public read" ON public.reviews FOR SELECT USING (is_visible = true);
DROP POLICY IF EXISTS "Reviews customer insert" ON public.reviews;
CREATE POLICY "Reviews customer insert" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = customer_id);
DROP POLICY IF EXISTS "Reviews customer update" ON public.reviews;
CREATE POLICY "Reviews customer update" ON public.reviews FOR UPDATE USING (auth.uid() = customer_id);

-- Review Media: public read; customer manages own
DROP POLICY IF EXISTS "Review media public read" ON public.review_media;
CREATE POLICY "Review media public read" ON public.review_media FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.reviews WHERE id = review_id AND is_visible = true)
);
DROP POLICY IF EXISTS "Review media customer insert" ON public.review_media;
CREATE POLICY "Review media customer insert" ON public.review_media FOR INSERT
  WITH CHECK (auth.uid() = (SELECT customer_id FROM public.reviews WHERE id = review_id));
DROP POLICY IF EXISTS "Review media customer delete" ON public.review_media;
CREATE POLICY "Review media customer delete" ON public.review_media FOR DELETE
  USING (auth.uid() = (SELECT customer_id FROM public.reviews WHERE id = review_id));

-- Messages: only sender or receiver can read
DROP POLICY IF EXISTS "Messages read" ON public.messages;
CREATE POLICY "Messages read" ON public.messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
DROP POLICY IF EXISTS "Messages insert" ON public.messages;
CREATE POLICY "Messages insert" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
DROP POLICY IF EXISTS "Messages update read" ON public.messages;
CREATE POLICY "Messages update read" ON public.messages FOR UPDATE USING (auth.uid() = receiver_id);

-- Service Images: public read; provider manages own
DROP POLICY IF EXISTS "Service images public read" ON public.service_images;
CREATE POLICY "Service images public read" ON public.service_images FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service images provider insert" ON public.service_images;
CREATE POLICY "Service images provider insert" ON public.service_images FOR INSERT
  WITH CHECK (auth.uid() = (SELECT provider_id FROM public.services WHERE id = service_id));
DROP POLICY IF EXISTS "Service images provider delete" ON public.service_images;
CREATE POLICY "Service images provider delete" ON public.service_images FOR DELETE
  USING (auth.uid() = (SELECT provider_id FROM public.services WHERE id = service_id));

-- Provider Gallery: public read; provider manages own
DROP POLICY IF EXISTS "Provider gallery public read" ON public.provider_gallery;
CREATE POLICY "Provider gallery public read" ON public.provider_gallery FOR SELECT USING (true);
DROP POLICY IF EXISTS "Provider gallery provider insert" ON public.provider_gallery;
CREATE POLICY "Provider gallery provider insert" ON public.provider_gallery FOR INSERT
  WITH CHECK (auth.uid() = provider_id);
DROP POLICY IF EXISTS "Provider gallery provider delete" ON public.provider_gallery;
CREATE POLICY "Provider gallery provider delete" ON public.provider_gallery FOR DELETE
  USING (auth.uid() = provider_id);

-- Provider Badges: public read; admin manages
DROP POLICY IF EXISTS "Provider badges public read" ON public.provider_badges;
CREATE POLICY "Provider badges public read" ON public.provider_badges FOR SELECT USING (true);
DROP POLICY IF EXISTS "Provider badges admin manage" ON public.provider_badges;
CREATE POLICY "Provider badges admin manage" ON public.provider_badges FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- Favorite Providers: customer manages own; provider reads own
DROP POLICY IF EXISTS "Favorites customer manage" ON public.favorite_providers;
CREATE POLICY "Favorites customer manage" ON public.favorite_providers FOR ALL
  USING (auth.uid() = customer_id);
DROP POLICY IF EXISTS "Favorites provider read" ON public.favorite_providers;
CREATE POLICY "Favorites provider read" ON public.favorite_providers FOR SELECT
  USING (auth.uid() = provider_id);

-- Notifications: user manages own
DROP POLICY IF EXISTS "Notifications user read" ON public.notifications;
CREATE POLICY "Notifications user read" ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Notifications user update" ON public.notifications;
CREATE POLICY "Notifications user update" ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Notifications system insert" ON public.notifications;
CREATE POLICY "Notifications system insert" ON public.notifications FOR INSERT
  WITH CHECK (true);

-- Provider Stats: public read; provider read own
DROP POLICY IF EXISTS "Provider stats public read" ON public.provider_stats;
CREATE POLICY "Provider stats public read" ON public.provider_stats FOR SELECT USING (true);

-- Availability: public read; provider manages own
DROP POLICY IF EXISTS "Availability public read" ON public.availability;
CREATE POLICY "Availability public read" ON public.availability FOR SELECT USING (true);
DROP POLICY IF EXISTS "Availability provider manage" ON public.availability;
CREATE POLICY "Availability provider manage" ON public.availability FOR ALL USING (auth.uid() = provider_id);

-- Payments: only involved parties
DROP POLICY IF EXISTS "Payments read" ON public.payments;
CREATE POLICY "Payments read" ON public.payments FOR SELECT USING (auth.uid() = customer_id OR auth.uid() = provider_id);

-- Disputes: involved parties
DROP POLICY IF EXISTS "Disputes read" ON public.disputes;
CREATE POLICY "Disputes read" ON public.disputes FOR SELECT USING (auth.uid() = raised_by);
DROP POLICY IF EXISTS "Disputes insert" ON public.disputes;
CREATE POLICY "Disputes insert" ON public.disputes FOR INSERT WITH CHECK (auth.uid() = raised_by);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS providers_updated_at ON public.providers;
CREATE TRIGGER providers_updated_at BEFORE UPDATE ON public.providers FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
DROP TRIGGER IF EXISTS bookings_updated_at ON public.bookings;
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'customer')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update provider rating after new review
CREATE OR REPLACE FUNCTION public.update_provider_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.providers
  SET
    rating = (SELECT AVG(rating)::DECIMAL(3,2) FROM public.reviews WHERE provider_id = NEW.provider_id),
    total_reviews = (SELECT COUNT(*) FROM public.reviews WHERE provider_id = NEW.provider_id)
  WHERE id = NEW.provider_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reviews_update_rating ON public.reviews;
CREATE TRIGGER reviews_update_rating
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_provider_rating();

-- Auto-set timestamps and is_verified on provider status transitions
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

-- Auto-send welcome message when booking is accepted
CREATE OR REPLACE FUNCTION public.send_welcome_message()
RETURNS TRIGGER AS $$
DECLARE
  prov_id UUID;
  cust_id UUID;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status != 'accepted' THEN
    SELECT provider_id, customer_id INTO prov_id, cust_id
    FROM public.bookings WHERE id = NEW.id;

    INSERT INTO public.messages (booking_id, sender_id, receiver_id, content)
    VALUES (
      NEW.id,
      prov_id,
      cust_id,
      'Hi! I have accepted your booking. Let me know if you have any questions before we start.'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS booking_accepted_welcome ON public.bookings;
CREATE TRIGGER booking_accepted_welcome
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.send_welcome_message();

-- Mark messages as read when user opens chat
CREATE OR REPLACE FUNCTION public.mark_messages_read(p_booking_id UUID, p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.messages
  SET is_read = true, delivery_status = 'read'
  WHERE booking_id = p_booking_id
    AND receiver_id = p_user_id
    AND is_read = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create payment record when booking is completed
CREATE OR REPLACE FUNCTION public.create_payment_on_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO public.payments (booking_id, customer_id, provider_id, amount, status, payment_method)
    VALUES (
      NEW.id,
      NEW.customer_id,
      NEW.provider_id,
      COALESCE(NEW.total_amount, 0),
      'pending',
      'cash_on_service'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS booking_completed_payment ON public.bookings;
CREATE TRIGGER booking_completed_payment
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.create_payment_on_completion();

-- Enforce: only completed bookings can be reviewed
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

DROP TRIGGER IF EXISTS reviews_validate_booking_status ON public.reviews;
CREATE TRIGGER reviews_validate_booking_status
  BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_review_booking_status();

-- Update provider badges after provider stats change
CREATE OR REPLACE FUNCTION public.update_provider_badges()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_verified = TRUE THEN
    INSERT INTO public.provider_badges (provider_id, badge_type)
    VALUES (NEW.id, 'verified_provider')
    ON CONFLICT (provider_id, badge_type) DO NOTHING;
  END IF;

  IF NEW.completed_jobs >= 100 THEN
    INSERT INTO public.provider_badges (provider_id, badge_type)
    VALUES (NEW.id, '100_plus_jobs')
    ON CONFLICT (provider_id, badge_type) DO NOTHING;
  END IF;

  IF NEW.completed_jobs >= 50 THEN
    INSERT INTO public.provider_badges (provider_id, badge_type)
    VALUES (NEW.id, '50_plus_jobs')
    ON CONFLICT (provider_id, badge_type) DO NOTHING;
  END IF;

  IF NEW.rating >= 4.5 AND NEW.total_reviews >= 10 THEN
    INSERT INTO public.provider_badges (provider_id, badge_type)
    VALUES (NEW.id, 'top_rated')
    ON CONFLICT (provider_id, badge_type) DO NOTHING;
  END IF;

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

-- Update provider response rate when booking status changes
CREATE OR REPLACE FUNCTION public.update_provider_response_rate()
RETURNS TRIGGER AS $$
DECLARE
  total_requests INTEGER;
  accepted_count INTEGER;
  new_rate INTEGER;
BEGIN
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

-- Sync provider_stats when provider main fields change
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

-- Sync favorite_count on provider_stats when favorites change
CREATE OR REPLACE FUNCTION public.sync_favorite_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.provider_stats
    SET favorite_count = (
      SELECT COUNT(*) FROM public.favorite_providers WHERE provider_id = NEW.provider_id
    ), updated_at = NOW()
    WHERE provider_id = NEW.provider_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.provider_stats
    SET favorite_count = (
      SELECT COUNT(*) FROM public.favorite_providers WHERE provider_id = OLD.provider_id
    ), updated_at = NOW()
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

-- Create notifications on booking status changes
CREATE OR REPLACE FUNCTION public.create_booking_notification()
RETURNS TRIGGER AS $$
DECLARE
  cust_name TEXT;
  prov_name TEXT;
BEGIN
  -- Get names
  SELECT full_name INTO cust_name FROM public.users WHERE id = NEW.customer_id;
  SELECT COALESCE(business_name, u.full_name) INTO prov_name
  FROM public.providers p LEFT JOIN public.users u ON p.id = u.id
  WHERE p.id = NEW.provider_id;

  IF TG_OP = 'INSERT' THEN
    -- Notify provider: new booking
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
      VALUES (
        NEW.customer_id, 'booking_accepted',
        'Booking Accepted',
        prov_name || ' accepted your booking request',
        jsonb_build_object('booking_id', NEW.id)
      );
    ELSIF NEW.status = 'rejected' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        NEW.customer_id, 'booking_rejected',
        'Booking Rejected',
        'Your booking request was declined',
        jsonb_build_object('booking_id', NEW.id)
      );
    ELSIF NEW.status = 'on_the_way' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        NEW.customer_id, 'provider_on_the_way',
        'Provider On The Way',
        prov_name || ' is on the way to your location',
        jsonb_build_object('booking_id', NEW.id)
      );
    ELSIF NEW.status = 'arrived' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        NEW.customer_id, 'provider_arrived',
        'Provider Arrived',
        prov_name || ' has arrived at your location',
        jsonb_build_object('booking_id', NEW.id)
      );
    ELSIF NEW.status = 'completed' THEN
      INSERT INTO public.notifications (user_id, type, title, body, data)
      VALUES (
        NEW.customer_id, 'service_completed',
        'Service Completed',
        'Your service is complete. Please leave a review!',
        jsonb_build_object('booking_id', NEW.id)
      );
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
-- SEED DATA: Categories
-- ============================================================
INSERT INTO public.categories (name, description, icon, color) VALUES
  ('Aircon Services',    'Air conditioning installation, cleaning, repair and maintenance', 'thermometer-outline',   '#0EA5E9'),
  ('Plumbing Services',  'Pipe, drainage, water heater and fixture repairs',              'water-outline',          '#06B6D4'),
  ('Electrical Services','Wiring, panel upgrades, outlet and lighting installations',     'flash-outline',          '#F59E0B'),
  ('Cleaning Services',  'Home, office and deep-cleaning services',                       'sparkles-outline',       '#3B82F6'),
  ('Mechanic Services',  'Vehicle repair, diagnostics and maintenance',                   'car-outline',            '#6366F1'),
  ('Rider Services',     'Motorcycle delivery and courier services',                      'bicycle-outline',        '#10B981'),
  ('Car Rental Services','Self-drive and chauffeured vehicle rental',                     'car-sport-outline',      '#F97316'),
  ('Carpentry',          'Furniture making, woodwork and repairs',                        'hammer-outline',         '#8B5CF6'),
  ('Painting Services',  'Interior and exterior residential painting',                    'color-palette-outline',  '#EC4899'),
  ('Landscaping',        'Garden design, lawn care and maintenance',                      'leaf-outline',           '#059669'),
  ('LPG Delivery',       'Propane and LPG tank delivery and refilling services',          'flame-outline',          '#F97316'),
  ('Water Delivery',     'Drinking water and bulk water delivery services',               'water-outline',          '#0EA5E9'),
  ('Towing Services',    'Vehicle towing, roadside assistance and recovery',              'trail-sign-outline',     '#EF4444'),
  ('Welding Services',   'Metal fabrication, repair and welding work',                    'construct-outline',      '#F59E0B'),
  ('Construction',       'General construction, renovation and repair services',          'business-outline',       '#6366F1'),
  ('Courier Services',   'Package delivery, document courier and logistics',              'cube-outline',           '#10B981')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- SEED DATA: Test Users (requires auth.users entries first)
-- ============================================================
-- NOTE: These insert into public.users. Create auth.users via Supabase Auth first.
-- After creating auth users, run these with their actual UUIDs:

-- INSERT INTO public.users (id, email, full_name, phone, role) VALUES
--   ('<uuid-1>', 'admin@servicehub.com', 'Admin User', '+639123456789', 'admin'),
--   ('<uuid-2>', 'customer@example.com', 'Jane Doe', '+639234567890', 'customer'),
--   ('<uuid-3>', 'provider@example.com', 'John Smith', '+639345678901', 'provider');

-- ============================================================
-- SEED DATA: Test Providers (after users exist)
-- ============================================================
-- INSERT INTO public.providers (id, bio, category_id, hourly_rate, location, is_verified, kyc_status) VALUES
--   ('<uuid-3>', 'Experienced plumber with 10 years in residential and commercial plumbing.', 
--    (SELECT id FROM categories WHERE name = 'Plumbing'), 500.00, 'Manila, Philippines', true, 'approved');

-- ============================================================
-- SEED DATA: Test Services
-- ============================================================
-- INSERT INTO public.services (provider_id, name, description, base_price, duration_minutes) VALUES
--   ('<uuid-3>', 'Pipe Repair', 'Fix leaking pipes and drainage issues', 450.00, 60),
--   ('<uuid-3>', 'Water Heater Installation', 'Install and set up water heaters', 800.00, 120);

-- ============================================================
-- SEED DATA: Test Bookings
-- ============================================================
-- INSERT INTO public.bookings (customer_id, provider_id, service_id, status, scheduled_date, scheduled_time, location, total_amount) VALUES
--   ('<uuid-2>', '<uuid-3>', (SELECT id FROM services WHERE name = 'Pipe Repair'), 'completed', 
--    CURRENT_DATE + INTERVAL '1 day', '09:00:00', '123 Main St, Manila', 450.00);

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

-- Create provider-documents bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('provider-documents', 'provider-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for provider-documents bucket

-- Policy: Authenticated users can upload to their own folder
CREATE POLICY "Providers can upload to their own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'provider-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Providers can read their own files
CREATE POLICY "Providers can read their own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'provider-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Admins can read all provider documents
CREATE POLICY "Admins can read all provider documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'provider-documents'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Policy: Providers can update their own files
CREATE POLICY "Providers can update their own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'provider-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'provider-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Providers can delete their own files
CREATE POLICY "Providers can delete their own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'provider-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Admins can delete any provider document
CREATE POLICY "Admins can delete any provider document"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'provider-documents'
  AND EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ============================================================
-- EXAMPLE QUERIES
-- ============================================================

-- Get all categories with service count
SELECT 
  c.id, c.name, c.icon, c.color,
  COUNT(s.id) as service_count
FROM categories c
LEFT JOIN services s ON s.category_id = c.id
GROUP BY c.id
ORDER BY c.name;

-- Get top-rated providers in a category
SELECT 
  p.id, u.full_name, p.bio, p.hourly_rate, p.rating, p.total_reviews,
  c.name as category_name
FROM providers p
JOIN users u ON u.id = p.id
JOIN categories c ON p.category_id = c.id
WHERE c.name = 'Plumbing'
  AND p.is_verified = true
  AND p.is_available = true
ORDER BY p.rating DESC, p.total_reviews DESC
LIMIT 10;

-- Get a customer's booking history with provider info
SELECT 
  b.id, b.status, b.scheduled_date, b.scheduled_time, b.location, b.total_amount,
  s.name as service_name,
  u.full_name as provider_name, u.avatar_url as provider_avatar
FROM bookings b
JOIN services s ON s.id = b.service_id
JOIN providers p ON p.id = b.provider_id
JOIN users u ON u.id = p.id
WHERE b.customer_id = auth.uid()
ORDER BY b.created_at DESC;

-- Get provider's active jobs
SELECT 
  b.id, b.status, b.scheduled_date, b.scheduled_time, b.location,
  u.full_name as customer_name, u.phone as customer_phone,
  s.name as service_name
FROM bookings b
JOIN users u ON u.id = b.customer_id
JOIN services s ON s.id = b.service_id
WHERE b.provider_id = auth.uid()
  AND b.status IN ('accepted', 'in_progress')
ORDER BY b.scheduled_date ASC;

-- Get chat messages for a booking
SELECT 
  m.id, m.content, m.is_read, m.created_at,
  u.full_name as sender_name
FROM messages m
JOIN users u ON u.id = m.sender_id
WHERE m.booking_id = '<booking-uuid>'
ORDER BY m.created_at ASC;

-- Get provider's earnings summary
SELECT 
  SUM(b.total_amount) as total_earnings,
  COUNT(b.id) as total_bookings,
  AVG(b.total_amount) as avg_booking_value
FROM bookings b
WHERE b.provider_id = auth.uid()
  AND b.status = 'completed';

-- Get reviews for a provider
SELECT 
  r.rating, r.comment, r.created_at,
  u.full_name as customer_name
FROM reviews r
JOIN users u ON u.id = r.customer_id
WHERE r.provider_id = '<provider-uuid>'
ORDER BY r.created_at DESC;

-- Admin: Get pending provider applications
SELECT
  p.id, u.full_name, u.email, p.business_name, p.city, p.province, p.status, p.created_at,
  c.name as category_name
FROM providers p
JOIN users u ON u.id = p.id
LEFT JOIN categories c ON p.category_id = c.id
WHERE p.status = 'pending_review'
ORDER BY p.created_at DESC;

-- Admin: Get platform statistics
SELECT 
  (SELECT COUNT(*) FROM users WHERE role = 'customer') as total_customers,
  (SELECT COUNT(*) FROM users WHERE role = 'provider') as total_providers,
  (SELECT COUNT(*) FROM providers WHERE is_verified = true) as verified_providers,
  (SELECT COUNT(*) FROM bookings) as total_bookings,
  (SELECT COUNT(*) FROM bookings WHERE status = 'completed') as completed_bookings,
  (SELECT SUM(total_amount) FROM bookings WHERE status = 'completed') as total_revenue;

-- Search providers by location and category
SELECT 
  p.id, u.full_name, p.bio, p.hourly_rate, p.rating,
  p.location, c.name as category_name
FROM providers p
JOIN users u ON u.id = p.id
JOIN categories c ON p.category_id = c.id
WHERE p.is_verified = true
  AND p.is_available = true
  AND p.location ILIKE '%Manila%'
  AND c.name = 'Cleaning'
ORDER BY p.rating DESC;

-- Get provider availability schedule
SELECT 
  day_of_week, start_time, end_time, is_available
FROM availability
WHERE provider_id = '<provider-uuid>'
ORDER BY day_of_week;
