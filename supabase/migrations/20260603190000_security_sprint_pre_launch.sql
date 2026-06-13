-- ============================================================
-- SECURITY SPRINT — Pre-Soft Launch Hardening
-- Date: 2026-06-03
-- Phase 1-5: Rate limiting, Upload security, Storage audit,
--            RLS audit, Admin moderation
-- ============================================================

-- ============================================================
-- PHASE 1 — RATE LIMITING & ANTI-SPAM
-- ============================================================

-- 1.1 LOGIN ATTEMPT TRACKING
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON public.login_attempts (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON public.login_attempts (ip_address, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_account_locked(p_email TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.login_attempts
  WHERE email = p_email AND success = false AND created_at > now() - interval '15 minutes';
  RETURN v_count >= 10;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_login_attempt(
  p_email TEXT, p_ip TEXT DEFAULT NULL, p_ua TEXT DEFAULT NULL, p_success BOOLEAN DEFAULT false
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.login_attempts (email, ip_address, user_agent, success)
  VALUES (p_email, p_ip, p_ua, p_success);
END;
$$;

-- 1.2 REGISTRATION RATE LIMITING
CREATE TABLE IF NOT EXISTS public.registration_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT, user_agent TEXT, email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_registration_attempts_ip ON public.registration_attempts (ip_address, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_registration_rate_limited(p_ip TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.registration_attempts
  WHERE ip_address = p_ip AND created_at > now() - interval '1 hour';
  RETURN v_count >= 5;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_registration_attempt(
  p_ip TEXT DEFAULT NULL, p_ua TEXT DEFAULT NULL, p_email TEXT DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.registration_attempts (ip_address, user_agent, email)
  VALUES (p_ip, p_ua, p_email);
END;
$$;

-- 1.3 BOOKING DAILY LIMIT (20/day)
CREATE OR REPLACE FUNCTION public.enforce_booking_daily_limit()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE v_today_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_today_count FROM public.bookings
  WHERE customer_id = NEW.customer_id AND created_at > date_trunc('day', now());
  IF v_today_count >= 20 THEN
    RAISE EXCEPTION 'Daily booking limit reached (20/day).';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS bookings_daily_limit ON public.bookings;
CREATE TRIGGER bookings_daily_limit BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_daily_limit();

-- 1.4 MESSAGE PER-MINUTE LIMIT (60/min)
CREATE OR REPLACE FUNCTION public.enforce_message_minute_rate_limit()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE v_minute_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_minute_count FROM public.messages
  WHERE sender_id = NEW.sender_id AND created_at > now() - interval '1 minute';
  IF v_minute_count >= 60 THEN
    RAISE EXCEPTION 'Rate limit: 60 messages per minute exceeded.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS messages_minute_rate_limit ON public.messages;
CREATE TRIGGER messages_minute_rate_limit BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_minute_rate_limit();

-- 1.5 REVIEW DUPLICATE + DAILY LIMIT
CREATE OR REPLACE FUNCTION public.enforce_review_limits()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE v_exists BOOLEAN; v_today_count INTEGER;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.reviews WHERE booking_id = NEW.booking_id) INTO v_exists;
  IF v_exists THEN RAISE EXCEPTION 'Duplicate review for this booking.'; END IF;
  SELECT COUNT(*) INTO v_today_count FROM public.reviews
  WHERE customer_id = NEW.customer_id AND created_at > date_trunc('day', now());
  IF v_today_count >= 10 THEN RAISE EXCEPTION 'Daily review limit reached (10/day).'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS reviews_limits ON public.reviews;
CREATE TRIGGER reviews_limits BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_limits();

-- ============================================================
-- PHASE 2 — FILE UPLOAD SECURITY (DB-side enforcement)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_allowed_file_type(mime_type TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN mime_type = ANY(ARRAY['image/jpeg','image/jpg','image/png','image/webp']);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.has_dangerous_extension(filename TEXT)
RETURNS BOOLEAN AS $$
DECLARE v_ext TEXT;
BEGIN
  v_ext := lower(split_part(filename, '.', array_length(string_to_array(filename, '.'), 1)));
  RETURN v_ext = ANY(ARRAY[
    'exe','apk','zip','rar','js','html','htm','php','sh','bat',
    'cmd','com','dll','jar','py','rb','pl','cgi','asp','aspx',
    'jsp','war','ear','bin','msi','dmg','pkg','deb','rpm'
  ]);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.is_allowed_file_size(p_bucket TEXT, p_size BIGINT)
RETURNS BOOLEAN AS $$
BEGIN RETURN CASE p_bucket
  WHEN 'avatars' THEN p_size <= 5242880
  WHEN 'chat-media' THEN p_size <= 5242880
  WHEN 'review-media' THEN p_size <= 5242880
  WHEN 'service-images' THEN p_size <= 10485760
  WHEN 'provider-documents' THEN p_size <= 15728640
  WHEN 'provider-profile-images' THEN p_size <= 5242880
  WHEN 'provider-cover-images' THEN p_size <= 5242880
  WHEN 'kyc-documents' THEN p_size <= 15728640
  WHEN 'booking-photos' THEN p_size <= 5242880
  ELSE false
END; END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- PHASE 3 — STORAGE BUCKET SECURITY
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars','avatars',true,5242880,ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('chat-media','chat-media',false,5242880,ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('review-media','review-media',true,5242880,ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('service-images','service-images',true,10485760,ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('provider-documents','provider-documents',false,15728640,ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('provider-profile-images','provider-profile-images',true,5242880,ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('provider-cover-images','provider-cover-images',true,5242880,ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('kyc-documents','kyc-documents',false,15728640,ARRAY['image/jpeg','image/jpg','image/png','image/webp']),
  ('booking-photos','booking-photos',false,5242880,ARRAY['image/jpeg','image/jpg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop and recreate all storage policies for consistency
DO $$ BEGIN DROP POLICY IF EXISTS "Avatars public read" ON storage.objects;
  CREATE POLICY "Avatars public read" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id='avatars');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Avatars owner upload" ON storage.objects;
  CREATE POLICY "Avatars owner upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id='avatars' AND (storage.foldername(name))[1]=auth.uid()::text
    AND NOT public.has_dangerous_extension(name));
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Avatars owner delete" ON storage.objects;
  CREATE POLICY "Avatars owner delete" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id='avatars' AND (storage.foldername(name))[1]=auth.uid()::text);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Chat media participant read" ON storage.objects;
  CREATE POLICY "Chat media participant read" ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id='chat-media' AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE (storage.foldername(name))[1] = b.id::text
        AND (b.customer_id = auth.uid() OR b.provider_id = auth.uid())));
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Chat media sender upload" ON storage.objects;
  CREATE POLICY "Chat media sender upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id='chat-media'
    AND NOT public.has_dangerous_extension(name));
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Chat media sender delete" ON storage.objects;
  CREATE POLICY "Chat media sender delete" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id='chat-media' AND EXISTS (
      SELECT 1 FROM public.messages WHERE image_url LIKE '%' || name AND sender_id = auth.uid()));
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Review media public read" ON storage.objects;
  CREATE POLICY "Review media public read" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id='review-media');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Review media owner upload" ON storage.objects;
  CREATE POLICY "Review media owner upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id='review-media' AND (storage.foldername(name))[1]=auth.uid()::text
    AND NOT public.has_dangerous_extension(name));
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Review media owner delete" ON storage.objects;
  CREATE POLICY "Review media owner delete" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id='review-media' AND (storage.foldername(name))[1]=auth.uid()::text);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Service images public read" ON storage.objects;
  CREATE POLICY "Service images public read" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id='service-images');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service images provider upload" ON storage.objects;
  CREATE POLICY "Service images provider upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id='service-images' AND (storage.foldername(name))[1]=auth.uid()::text
    AND NOT public.has_dangerous_extension(name));
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Service images provider delete" ON storage.objects;
  CREATE POLICY "Service images provider delete" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id='service-images' AND (storage.foldername(name))[1]=auth.uid()::text);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Provider docs owner read" ON storage.objects;
  CREATE POLICY "Provider docs owner read" ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id='provider-documents' AND (storage.foldername(name))[1]=auth.uid()::text);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Provider docs admin read" ON storage.objects;
  CREATE POLICY "Provider docs admin read" ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id='provider-documents' AND public.is_admin());
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Provider docs owner upload" ON storage.objects;
  CREATE POLICY "Provider docs owner upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id='provider-documents' AND (storage.foldername(name))[1]=auth.uid()::text
    AND NOT public.has_dangerous_extension(name));
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Provider docs owner delete" ON storage.objects;
  CREATE POLICY "Provider docs owner delete" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id='provider-documents' AND (storage.foldername(name))[1]=auth.uid()::text);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Provider profile public read" ON storage.objects;
  CREATE POLICY "Provider profile public read" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id='provider-profile-images');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Provider profile owner upload" ON storage.objects;
  CREATE POLICY "Provider profile owner upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id='provider-profile-images' AND (storage.foldername(name))[1]=auth.uid()::text
    AND NOT public.has_dangerous_extension(name));
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Provider profile owner delete" ON storage.objects;
  CREATE POLICY "Provider profile owner delete" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id='provider-profile-images' AND (storage.foldername(name))[1]=auth.uid()::text);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Provider cover public read" ON storage.objects;
  CREATE POLICY "Provider cover public read" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id='provider-cover-images');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Provider cover owner upload" ON storage.objects;
  CREATE POLICY "Provider cover owner upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id='provider-cover-images' AND (storage.foldername(name))[1]=auth.uid()::text
    AND NOT public.has_dangerous_extension(name));
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Provider cover owner delete" ON storage.objects;
  CREATE POLICY "Provider cover owner delete" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id='provider-cover-images' AND (storage.foldername(name))[1]=auth.uid()::text);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "KYC owner read" ON storage.objects;
  CREATE POLICY "KYC owner read" ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id='kyc-documents' AND (storage.foldername(name))[1]=auth.uid()::text);
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "KYC admin read" ON storage.objects;
  CREATE POLICY "KYC admin read" ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id='kyc-documents' AND public.is_admin());
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "KYC owner upload" ON storage.objects;
  CREATE POLICY "KYC owner upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id='kyc-documents' AND (storage.foldername(name))[1]=auth.uid()::text
    AND NOT public.has_dangerous_extension(name));
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "KYC owner delete" ON storage.objects;
  CREATE POLICY "KYC owner delete" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id='kyc-documents' AND (storage.foldername(name))[1]=auth.uid()::text);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Booking photos participant read" ON storage.objects;
  CREATE POLICY "Booking photos participant read" ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id='booking-photos' AND ((storage.foldername(name))[1]=auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.bookings WHERE customer_id::text=(storage.foldername(name))[1] AND provider_id=auth.uid())));
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Booking photos customer upload" ON storage.objects;
  CREATE POLICY "Booking photos customer upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id='booking-photos' AND (storage.foldername(name))[1]=auth.uid()::text
    AND NOT public.has_dangerous_extension(name));
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Booking photos owner delete" ON storage.objects;
  CREATE POLICY "Booking photos owner delete" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id='booking-photos' AND (storage.foldername(name))[1]=auth.uid()::text);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ============================================================
-- DEFENSIVE: Ensure tables exist (some only in schema.sql)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.review_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id UUID REFERENCES public.reviews(id) ON DELETE CASCADE NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS public.availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL DEFAULT '08:00:00',
  end_time TIME NOT NULL DEFAULT '18:00:00',
  is_available BOOLEAN DEFAULT TRUE,
  UNIQUE (provider_id, day_of_week)
);

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

-- Defensive policies for review_media (newly created table, no prior policies)
DO $$ BEGIN DROP POLICY IF EXISTS "Review media public read" ON public.review_media;
  CREATE POLICY "Review media public read" ON public.review_media FOR SELECT TO authenticated, anon
  USING (EXISTS (SELECT 1 FROM public.reviews WHERE id = review_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Review media owner insert" ON public.review_media;
  CREATE POLICY "Review media owner insert" ON public.review_media FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.reviews WHERE id = review_id AND customer_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Review media owner delete" ON public.review_media;
  CREATE POLICY "Review media owner delete" ON public.review_media FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reviews WHERE id = review_id AND customer_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- PHASE 4 — RLS SECURITY AUDIT FIXES
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_verification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_attempts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Admins read login attempts" ON public.login_attempts FOR SELECT TO authenticated
  USING (public.is_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Admins read registration attempts" ON public.registration_attempts FOR SELECT TO authenticated
  USING (public.is_admin()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Payments customer read" ON public.payments;
  CREATE POLICY "Payments customer read" ON public.payments FOR SELECT TO authenticated USING (customer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Payments provider read" ON public.payments;
  CREATE POLICY "Payments provider read" ON public.payments FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.bookings WHERE id = booking_id AND provider_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Payments admin read" ON public.payments;
  CREATE POLICY "Payments admin read" ON public.payments FOR SELECT TO authenticated USING (public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Disputes participant read" ON public.disputes;
  CREATE POLICY "Disputes participant read" ON public.disputes FOR SELECT TO authenticated USING (
    raised_by = auth.uid() OR EXISTS (
      SELECT 1 FROM public.bookings WHERE id = booking_id AND (customer_id = auth.uid() OR provider_id = auth.uid()))
    OR public.is_admin());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN DROP POLICY IF EXISTS "Availability provider manage" ON public.availability;
  CREATE POLICY "Availability provider manage" ON public.availability FOR ALL TO authenticated
  USING (provider_id = auth.uid()) WITH CHECK (provider_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Defensive: categories and provider_stats policies (schema.sql may not have been applied)
DO $$ BEGIN DROP POLICY IF EXISTS "Categories public read" ON public.categories;
  CREATE POLICY "Categories public read" ON public.categories FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN DROP POLICY IF EXISTS "Provider stats public read" ON public.provider_stats;
  CREATE POLICY "Provider stats public read" ON public.provider_stats FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- PHASE 5 — ADMIN MODERATION ENHANCEMENTS
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='moderation_log' AND column_name='target_type')
    THEN ALTER TABLE public.moderation_log ADD COLUMN target_type TEXT; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='moderation_log' AND column_name='target_id')
    THEN ALTER TABLE public.moderation_log ADD COLUMN target_id UUID; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='moderation_log' AND column_name='reason')
    THEN ALTER TABLE public.moderation_log ADD COLUMN reason TEXT; END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_moderation_log_action ON public.moderation_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_log_target ON public.moderation_log (target_type, target_id);

-- Defensive: reviews and messages need updated_at for moderation functions
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Admin moderation function: suspend provider
CREATE OR REPLACE FUNCTION public.admin_suspend_provider(
  p_provider_id UUID, p_reason TEXT DEFAULT NULL, p_admin_id UUID DEFAULT auth.uid()
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.providers SET status='suspended', is_available=false, updated_at=now() WHERE id=p_provider_id;
  UPDATE public.users SET status='suspended', updated_at=now() WHERE id=p_provider_id;
  INSERT INTO public.moderation_log (admin_id, target_type, target_id, action, reason, metadata)
  VALUES (p_admin_id, 'provider', p_provider_id, 'suspend_provider', p_reason, jsonb_build_object('type','provider'));
END;
$$;

-- Admin moderation function: ban user
CREATE OR REPLACE FUNCTION public.admin_ban_user(
  p_user_id UUID, p_reason TEXT DEFAULT NULL, p_admin_id UUID DEFAULT auth.uid()
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.users SET status='banned', updated_at=now() WHERE id=p_user_id;
  UPDATE public.providers SET status='banned', is_available=false, updated_at=now() WHERE id=p_user_id;
  INSERT INTO public.moderation_log (admin_id, target_type, target_id, action, reason, metadata)
  VALUES (p_admin_id, 'user', p_user_id, 'ban_user', p_reason, jsonb_build_object('type','user'));
END;
$$;

-- Admin moderation function: hide review
CREATE OR REPLACE FUNCTION public.admin_hide_review(
  p_review_id UUID, p_reason TEXT DEFAULT NULL, p_admin_id UUID DEFAULT auth.uid()
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.reviews SET is_hidden=true, updated_at=now() WHERE id=p_review_id;
  INSERT INTO public.moderation_log (admin_id, target_type, target_id, action, reason, metadata)
  VALUES (p_admin_id, 'review', p_review_id, 'hide_review', p_reason, jsonb_build_object('type','review'));
END;
$$;

-- Admin moderation function: revoke provider verification
CREATE OR REPLACE FUNCTION public.admin_revoke_verification(
  p_provider_id UUID, p_reason TEXT DEFAULT NULL, p_admin_id UUID DEFAULT auth.uid()
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE public.providers SET status='pending_review', updated_at=now() WHERE id=p_provider_id;
  UPDATE public.provider_documents SET status='rejected' WHERE provider_id=p_provider_id;
  INSERT INTO public.moderation_log (admin_id, target_type, target_id, action, reason, metadata)
  VALUES (p_admin_id, 'provider', p_provider_id, 'revoke_verification', p_reason, jsonb_build_object('type','provider'));
END;
$$;

-- Admin moderation function: remove chat image
CREATE OR REPLACE FUNCTION public.admin_remove_chat_image(
  p_message_id UUID, p_reason TEXT DEFAULT NULL, p_admin_id UUID DEFAULT auth.uid()
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_image_url TEXT; v_booking_id UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT image_url, booking_id INTO v_image_url, v_booking_id
  FROM public.messages WHERE id=p_message_id;
  IF v_image_url IS NOT NULL THEN
    UPDATE public.messages SET image_url=NULL, content='[Image removed by moderator]', updated_at=now()
    WHERE id=p_message_id;
  END IF;
  INSERT INTO public.moderation_log (admin_id, target_type, target_id, action, reason, metadata)
  VALUES (p_admin_id, 'message', p_message_id, 'remove_chat_image', p_reason,
    jsonb_build_object('image_url',v_image_url,'booking_id',v_booking_id));
END;
$$;
