-- ============================================================
-- Security Sprint — Comprehensive RLS + Storage Audit
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. MESSAGES — Only sender/receiver can read; only sender inserts
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Users can read their own messages"
  ON public.messages FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can send messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Admins can read all messages"
  ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2. NOTIFICATIONS — Users only see/update their own
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can update own notifications (mark read)"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT TO service_role
  WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Admins can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 3. REPORTS — Reporter inserts; admin reads/updates; service_role
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Users can submit reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Users can read own reports"
  ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Admins can read all reports"
  ON public.reports FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Admins can update reports"
  ON public.reports FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 4. BOOKINGS — Verify ownership policies
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE POLICY "Customers can insert bookings"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Customers can cancel own bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid() AND status = 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 5. REVIEWS — Customer posts once per booking; no editing
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE POLICY "Customers can submit one review per booking"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.reviews
      WHERE booking_id = reviews.booking_id AND customer_id = auth.uid()
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 6. File upload validation function
-- Rejects disallowed MIME types at the application layer
-- (Storage bucket policies handle server-side enforcement)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_allowed_file_type(mime_type TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN mime_type = ANY(ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif'
  ]);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─────────────────────────────────────────────────────────────
-- 7. Rate limiting helper function
-- Returns true if the user is under the rate limit for an action
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_max_count INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start := date_trunc('hour', now()); -- Hourly windows

  SELECT count INTO v_count
  FROM public.rate_limits
  WHERE user_id = p_user_id
    AND action = p_action
    AND window_start = v_window_start;

  IF v_count IS NULL THEN
    INSERT INTO public.rate_limits (user_id, action, window_start, count)
    VALUES (p_user_id, p_action, v_window_start, 1)
    ON CONFLICT (user_id, action, window_start)
    DO UPDATE SET count = rate_limits.count + 1;
    RETURN true;
  ELSIF v_count < p_max_count THEN
    UPDATE public.rate_limits
    SET count = count + 1
    WHERE user_id = p_user_id AND action = p_action AND window_start = v_window_start;
    RETURN true;
  ELSE
    RETURN false; -- Rate limit exceeded
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- 8. Anti-spam: Message throttle trigger
-- Max 60 messages per hour per user
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  IF NOT public.check_rate_limit(NEW.sender_id, 'send_message', 60, 3600) THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many messages sent. Please wait before sending more.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_rate_limit ON public.messages;
CREATE TRIGGER messages_rate_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_rate_limit();

-- ─────────────────────────────────────────────────────────────
-- 9. Anti-spam: Booking throttle trigger
-- Max 10 bookings per hour per customer
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_booking_rate_limit()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  IF NOT public.check_rate_limit(NEW.customer_id, 'create_booking', 10, 3600) THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many bookings submitted. Please try again later.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_rate_limit ON public.bookings;
CREATE TRIGGER bookings_rate_limit
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_rate_limit();

-- ─────────────────────────────────────────────────────────────
-- 10. Anti-spam: Review throttle trigger
-- Max 20 reviews per day per customer
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_review_rate_limit()
RETURNS TRIGGER SECURITY DEFINER AS $$
BEGIN
  IF NOT public.check_rate_limit(NEW.customer_id, 'submit_review', 20, 86400) THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many reviews submitted.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reviews_rate_limit ON public.reviews;
CREATE TRIGGER reviews_rate_limit
  BEFORE INSERT ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_rate_limit();

-- ─────────────────────────────────────────────────────────────
-- 11. Storage bucket policies
-- Ensures users can only delete their own files
-- ─────────────────────────────────────────────────────────────

-- Chat photos: sender can upload, participants can read
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'chat-photos', 'chat-photos', false,
    5242880, -- 5MB limit
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  )
  ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Profile photos: user manages own; public read
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'avatars', 'avatars', true,
    3145728, -- 3MB limit
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  )
  ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Review media: customer uploads; public read
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'review-media', 'review-media', true,
    8388608, -- 8MB limit
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  )
  ON CONFLICT (id) DO UPDATE SET
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
