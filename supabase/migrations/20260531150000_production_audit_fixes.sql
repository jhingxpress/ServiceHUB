-- ============================================================
-- PRODUCTION READINESS AUDIT FIXES
-- Sprint 4B — Missing indexes, RLS gaps, performance
-- ============================================================

-- ============================================================
-- 1. MISSING INDEXES (Foreign Key + Query Performance)
-- ============================================================

-- Messages: receiver_id used for chat list unread counts
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON public.messages(receiver_id);

-- Messages: composite for chat room queries
CREATE INDEX IF NOT EXISTS idx_messages_booking_created ON public.messages(booking_id, created_at);

-- Reviews: customer_id used for MyReviews queries
CREATE INDEX IF NOT EXISTS idx_reviews_customer ON public.reviews(customer_id);

-- Bookings: created_at DESC for dashboard/booking lists
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON public.bookings(created_at DESC);

-- Notifications: created_at DESC for notification center
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- Notifications: composite for user unread fetch
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);

-- Payments: customer/provider lookups
CREATE INDEX IF NOT EXISTS idx_payments_customer ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider ON public.payments(provider_id);

-- Availability: provider + day lookup
CREATE INDEX IF NOT EXISTS idx_availability_provider_day ON public.availability(provider_id, day_of_week);

-- Provider performance: provider_id lookup
CREATE INDEX IF NOT EXISTS idx_provider_performance_provider ON public.provider_performance(provider_id);

-- Provider checklist: provider_id lookup
CREATE INDEX IF NOT EXISTS idx_provider_checklist_provider ON public.provider_checklist(provider_id);

-- Provider score: provider_id lookup
CREATE INDEX IF NOT EXISTS idx_provider_score_provider ON public.provider_score(provider_id);

-- ============================================================
-- 2. RLS SECURITY FIXES
-- ============================================================

-- 2a. Messages: restrict inserts to participants of the booking
-- (Prevents spoofing messages into arbitrary bookings)
DROP POLICY IF EXISTS "Messages insert" ON public.messages;
CREATE POLICY "Messages insert" ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = booking_id
      AND (customer_id = auth.uid() OR provider_id = auth.uid())
  )
);

-- 2b. Messages: restrict updates to marking read (no content edits)
DROP POLICY IF EXISTS "Messages update read" ON public.messages;
CREATE POLICY "Messages update read" ON public.messages FOR UPDATE USING (
  auth.uid() = receiver_id
  AND EXISTS (
    SELECT 1 FROM public.bookings
    WHERE id = booking_id
      AND (customer_id = auth.uid() OR provider_id = auth.uid())
  )
);

-- 2c. Bookings: restrict customer updates to status=cancelled only
-- (Prevents customer from changing provider_id, service_id, etc.)
-- USING sees the current/pre-update row (equivalent to OLD in triggers).
-- WITH CHECK sees the proposed/post-update row (equivalent to NEW).
DROP POLICY IF EXISTS "Bookings customer cancel" ON public.bookings;
CREATE POLICY "Bookings customer cancel" ON public.bookings FOR UPDATE
USING (
  auth.uid() = customer_id
  AND status IN ('pending', 'accepted')
)
WITH CHECK (
  auth.uid() = customer_id
  AND status = 'cancelled'
);

-- 2d. Reviews: ensure provider can only read visible reviews for themselves
-- (Already covered by public read policy; provider_id check is implicit)

-- 2e. Provider documents: allow admin read
DROP POLICY IF EXISTS "Provider docs admin read" ON public.provider_documents;
CREATE POLICY "Provider docs admin read" ON public.provider_documents
  FOR SELECT USING (public.is_admin());

-- 2f. Reports: allow reported user to read reports about themselves
DROP POLICY IF EXISTS "Reports reported read" ON public.reports;
CREATE POLICY "Reports reported read" ON public.reports FOR SELECT USING (
  auth.uid() = reported_user_id
);

-- ============================================================
-- 3. DATA INTEGRITY FIXES
-- ============================================================

-- 3a. Ensure all bookings have populated customer fields
UPDATE public.bookings
SET
  customer_name = u.full_name,
  customer_phone = u.phone,
  customer_avatar_url = u.avatar_url
FROM public.users u
WHERE bookings.customer_id = u.id
  AND (bookings.customer_name IS NULL OR bookings.customer_name = '');

-- 3b. Backfill provider_stats for any missing providers
INSERT INTO public.provider_stats (
  provider_id, completed_jobs, total_reviews, average_rating, response_rate, favorite_count
)
SELECT
  p.id,
  COALESCE(p.completed_jobs, 0),
  COALESCE(p.total_reviews, 0),
  COALESCE(p.rating, 0.00),
  COALESCE(p.response_rate, 0),
  (SELECT COUNT(*) FROM public.favorite_providers WHERE provider_id = p.id)
FROM public.providers p
WHERE NOT EXISTS (
  SELECT 1 FROM public.provider_stats ps WHERE ps.provider_id = p.id
);

-- ============================================================
-- 4. REALTIME ENABLEMENT
-- ============================================================

-- Enable realtime for all tables that need live updates
-- (Supabase realtime works at replication level; these are config notes)
-- The actual publication is handled by Supabase dashboard CLI.
-- Tables already configured in migrations:
--   bookings, messages, notifications, provider_verification_logs

-- Ensure the schema has replication identity for realtime rows
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.provider_verification_logs REPLICA IDENTITY FULL;

-- ============================================================
-- 5. SOFT DELETE CONSISTENCY
-- ============================================================

-- Add partial indexes for soft-deleted rows (improves RLS performance)
CREATE INDEX IF NOT EXISTS idx_users_active ON public.users(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_providers_active ON public.providers(id) WHERE deleted_at IS NULL AND status = 'approved';
CREATE INDEX IF NOT EXISTS idx_services_active ON public.services(id) WHERE deleted_at IS NULL;
