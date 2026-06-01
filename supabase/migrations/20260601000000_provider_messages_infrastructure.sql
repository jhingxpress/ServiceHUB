-- ============================================================
-- PROVIDER MESSAGES INFRASTRUCTURE
-- Adds indexes and RPC function for efficient provider inbox queries.
-- No schema changes to messages/bookings tables.
-- ============================================================

-- 1. PARTIAL INDEX: unread messages by receiver
-- Critical for fast unread count queries in inbox + badge.
-- Only indexes rows where is_read = false, so it stays small
-- even with millions of messages.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_messages_unread
ON public.messages(receiver_id, created_at DESC)
WHERE is_read = false;

-- 2. INDEX: messages by booking for last-message LATERAL subquery
-- Existing idx_messages_booking covers booking_id alone.
-- Adding (booking_id, created_at DESC) speeds up "latest message per booking".
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_messages_booking_created
ON public.messages(booking_id, created_at DESC);

-- 3. RPC FUNCTION: get_provider_conversations
-- Returns a single result set of all conversations for a provider,
-- avoiding N+1 queries. Each row = one booking thread with:
--   - customer info
--   - latest message + timestamp
--   - unread count
--   - service name
-- Security: caller can only query their own provider_id (auth.uid() check).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_provider_conversations(p_provider_id UUID)
RETURNS TABLE (
  booking_id UUID,
  customer_id UUID,
  customer_name TEXT,
  customer_avatar TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count BIGINT,
  service_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Prevent callers from reading other providers' conversations
  IF auth.uid() <> p_provider_id THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.customer_id,
    u.full_name::TEXT,
    u.avatar_url::TEXT,
    m.content::TEXT,
    m.created_at,
    COALESCE(unread.count, 0)::BIGINT,
    s.name::TEXT
  FROM public.bookings b
  JOIN public.users u ON u.id = b.customer_id
  LEFT JOIN public.services s ON s.id = b.service_id
  LEFT JOIN LATERAL (
    SELECT msg.content, msg.created_at
    FROM public.messages msg
    WHERE msg.booking_id = b.id
    ORDER BY msg.created_at DESC
    LIMIT 1
  ) m ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS count
    FROM public.messages msg
    WHERE msg.booking_id = b.id
      AND msg.receiver_id = p_provider_id
      AND msg.is_read = false
  ) unread ON true
  WHERE b.provider_id = p_provider_id
    AND b.status IN ('accepted', 'on_the_way', 'arrived', 'in_progress', 'completed')
    AND m.created_at IS NOT NULL          -- only bookings that have messages
  ORDER BY m.created_at DESC NULLS LAST;
END;
$$;

-- 4. GRANT EXECUTE to authenticated users
GRANT EXECUTE ON FUNCTION public.get_provider_conversations(UUID) TO authenticated;
