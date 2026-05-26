-- ============================================================
-- ServiceHub Database Schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'provider', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE public.categories (
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
CREATE TABLE public.providers (
  id UUID REFERENCES public.users(id) ON DELETE CASCADE PRIMARY KEY,
  bio TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  hourly_rate DECIMAL(10,2),
  location TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  is_verified BOOLEAN DEFAULT FALSE,
  is_available BOOLEAN DEFAULT TRUE,
  kyc_status TEXT DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'approved', 'rejected')),
  kyc_documents JSONB,
  rating DECIMAL(3,2) DEFAULT 0.00,
  total_reviews INTEGER DEFAULT 0,
  total_earnings DECIMAL(10,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SERVICES
-- ============================================================
CREATE TABLE public.services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- BOOKINGS
-- ============================================================
CREATE TABLE public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending','accepted','rejected','in_progress','completed','cancelled','disputed')
  ),
  scheduled_date DATE NOT NULL,
  scheduled_time TIME NOT NULL,
  location TEXT NOT NULL,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  notes TEXT,
  photo_urls JSONB DEFAULT '[]'::JSONB,
  total_amount DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE public.reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE UNIQUE NOT NULL,
  customer_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PAYMENTS
-- ============================================================
CREATE TABLE public.payments (
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
CREATE TABLE public.messages (
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
CREATE TABLE public.availability (
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
CREATE TABLE public.disputes (
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
CREATE INDEX idx_bookings_customer ON public.bookings(customer_id);
CREATE INDEX idx_bookings_provider ON public.bookings(provider_id);
CREATE INDEX idx_bookings_status ON public.bookings(status);
CREATE INDEX idx_messages_booking ON public.messages(booking_id);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_reviews_provider ON public.reviews(provider_id);
CREATE INDEX idx_services_provider ON public.services(provider_id);
CREATE INDEX idx_providers_category ON public.providers(category_id);
CREATE INDEX idx_providers_kyc ON public.providers(kyc_status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- Users: read own profile; update own profile
CREATE POLICY "Users read own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- Categories: public read
CREATE POLICY "Categories public read" ON public.categories FOR SELECT USING (true);

-- Providers: public read approved; provider edits own
CREATE POLICY "Providers public read" ON public.providers FOR SELECT USING (true);
CREATE POLICY "Providers insert own" ON public.providers FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Providers update own" ON public.providers FOR UPDATE USING (auth.uid() = id);

-- Services: public read active; provider manages own
CREATE POLICY "Services public read" ON public.services FOR SELECT USING (is_active = true);
CREATE POLICY "Services provider insert" ON public.services FOR INSERT WITH CHECK (auth.uid() = provider_id);
CREATE POLICY "Services provider update" ON public.services FOR UPDATE USING (auth.uid() = provider_id);
CREATE POLICY "Services provider delete" ON public.services FOR DELETE USING (auth.uid() = provider_id);

-- Bookings: customer sees own; provider sees own; admin sees all
CREATE POLICY "Bookings customer read" ON public.bookings FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Bookings provider read" ON public.bookings FOR SELECT USING (auth.uid() = provider_id);
CREATE POLICY "Bookings customer insert" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Bookings customer cancel" ON public.bookings FOR UPDATE USING (auth.uid() = customer_id);
CREATE POLICY "Bookings provider update" ON public.bookings FOR UPDATE USING (auth.uid() = provider_id);

-- Reviews: public read; customer inserts own
CREATE POLICY "Reviews public read" ON public.reviews FOR SELECT USING (true);
CREATE POLICY "Reviews customer insert" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = customer_id);

-- Messages: only sender or receiver can read
CREATE POLICY "Messages read" ON public.messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Messages insert" ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Messages update read" ON public.messages FOR UPDATE USING (auth.uid() = receiver_id);

-- Availability: public read; provider manages own
CREATE POLICY "Availability public read" ON public.availability FOR SELECT USING (true);
CREATE POLICY "Availability provider manage" ON public.availability FOR ALL USING (auth.uid() = provider_id);

-- Payments: only involved parties
CREATE POLICY "Payments read" ON public.payments FOR SELECT USING (auth.uid() = customer_id OR auth.uid() = provider_id);

-- Disputes: involved parties
CREATE POLICY "Disputes read" ON public.disputes FOR SELECT USING (auth.uid() = raised_by);
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

CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER providers_updated_at BEFORE UPDATE ON public.providers FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
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

CREATE TRIGGER reviews_update_rating
  AFTER INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_provider_rating();

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

CREATE TRIGGER booking_completed_payment
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.create_payment_on_completion();

-- ============================================================
-- SEED DATA: Categories
-- ============================================================
INSERT INTO public.categories (name, description, icon, color) VALUES
  ('Cleaning', 'Home and office cleaning services', 'sparkles-outline', '#3B82F6'),
  ('Plumbing', 'Pipe, drainage and water system repairs', 'water-outline', '#06B6D4'),
  ('Electrical', 'Wiring, installations and repairs', 'flash-outline', '#F59E0B'),
  ('Carpentry', 'Furniture, woodwork and repairs', 'hammer-outline', '#8B5CF6'),
  ('Painting', 'Interior and exterior painting', 'color-palette-outline', '#EC4899'),
  ('Landscaping', 'Garden and lawn maintenance', 'leaf-outline', '#10B981'),
  ('AC Repair', 'Air conditioning service and repair', 'thermometer-outline', '#0EA5E9'),
  ('Moving', 'Packing and moving services', 'cube-outline', '#F97316'),
  ('Tutoring', 'Academic and skill tutoring', 'school-outline', '#6366F1'),
  ('Pet Care', 'Pet grooming and sitting', 'paw-outline', '#EF4444');

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
-- INSERT INTO public.services (provider_id, category_id, name, description, price, duration_minutes) VALUES
--   ('<uuid-3>', (SELECT id FROM categories WHERE name = 'Plumbing'), 'Pipe Repair', 'Fix leaking pipes and drainage issues', 450.00, 60),
--   ('<uuid-3>', (SELECT id FROM categories WHERE name = 'Plumbing'), 'Water Heater Installation', 'Install and set up water heaters', 800.00, 120);

-- ============================================================
-- SEED DATA: Test Bookings
-- ============================================================
-- INSERT INTO public.bookings (customer_id, provider_id, service_id, status, scheduled_date, scheduled_time, location, total_amount) VALUES
--   ('<uuid-2>', '<uuid-3>', (SELECT id FROM services WHERE name = 'Pipe Repair'), 'completed', 
--    CURRENT_DATE + INTERVAL '1 day', '09:00:00', '123 Main St, Manila', 450.00);

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
-- Run these in Supabase Dashboard > Storage or via SQL:
-- Note: Storage policies are managed separately in the Storage tab

-- Create buckets (run in Supabase Dashboard Storage tab):
-- 1. bucket: 'avatars' - public: false
-- 2. bucket: 'booking-photos' - public: false
-- 3. bucket: 'kyc-documents' - public: false

-- Storage policies (run in Storage tab policy editor):
-- avatars bucket:
--   - SELECT: public read (true)
--   - INSERT: authenticated users can upload to their own folder
--   - UPDATE: authenticated users can update their own files
--   - DELETE: authenticated users can delete their own files

-- booking-photos bucket:
--   - SELECT: only customer and provider of the booking
--   - INSERT: customer and provider of the booking
--   - UPDATE: customer and provider of the booking
--   - DELETE: customer and provider of the booking

-- kyc-documents bucket:
--   - SELECT: admin and the provider
--   - INSERT: provider to their own folder
--   - UPDATE: provider to their own folder
--   - DELETE: admin only

-- Example storage folder structure:
-- avatars/
--   {user_id}/
--     profile.jpg
-- booking-photos/
--   {booking_id}/
--     photo1.jpg
--     photo2.jpg
-- kyc-documents/
--   {provider_id}/
--     id-front.jpg
--     id-back.jpg
--     business-permit.pdf

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
  p.id, u.full_name, u.email, p.bio, p.location, p.kyc_status, p.created_at,
  c.name as category_name
FROM providers p
JOIN users u ON u.id = p.id
LEFT JOIN categories c ON p.category_id = c.id
WHERE p.kyc_status = 'pending'
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
