-- ============================================================
-- REPAIR: get_provider_conversations + create_message_notification
--
-- Why this file exists:
--   Migration 20260601050000_chat_media_rpc_and_trigger.sql failed with:
--     ERROR: cannot change return type of existing function (SQLSTATE 42P13)
--   on public.get_provider_conversations(UUID).
--
-- Root cause:
--   CREATE OR REPLACE FUNCTION cannot change a function's return type.
--   The original function (from 20260601000000) returned 8 columns.
--   The replacement added last_message_type TEXT as a 9th column.
--   PostgreSQL treats a different RETURNS TABLE shape as a different
--   return type entirely — CREATE OR REPLACE is forbidden in that case.
--
-- Fix:
--   DROP the old function first (no DB-level dependents; only app RPC
--   calls reference it), then CREATE the new definition.
--
-- Also applies:
--   create_message_notification trigger update — this was in the same
--   migration file that rolled back, so it was never applied either.
--   CREATE OR REPLACE is safe here (return type is still TRIGGER).
-- ============================================================

-- ============================================================
-- 1. REPLACE get_provider_conversations
--    Must DROP first because return type changes (8 → 9 columns).
-- ============================================================
DROP FUNCTION IF EXISTS public.get_provider_conversations(UUID);

CREATE FUNCTION public.get_provider_conversations(p_provider_id UUID)
RETURNS TABLE (
  booking_id        UUID,
  customer_id       UUID,
  customer_name     TEXT,
  customer_avatar   TEXT,
  last_message      TEXT,
  last_message_type TEXT,
  last_message_at   TIMESTAMPTZ,
  unread_count      BIGINT,
  service_name      TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Prevent callers from reading other providers' conversations.
  IF auth.uid() <> p_provider_id THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.customer_id,
    u.full_name::TEXT,
    u.avatar_url::TEXT,
    COALESCE(m.content, '')::TEXT,
    COALESCE(m.message_type, 'text')::TEXT,
    m.created_at,
    COALESCE(unread.count, 0)::BIGINT,
    s.name::TEXT
  FROM public.bookings b
  JOIN public.users u ON u.id = b.customer_id
  LEFT JOIN public.services s ON s.id = b.service_id
  LEFT JOIN LATERAL (
    SELECT msg.content, msg.message_type, msg.created_at
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
    AND m.created_at IS NOT NULL
  ORDER BY m.created_at DESC NULLS LAST;
END;
$$;

-- Re-grant EXECUTE (grant is removed when function is dropped)
GRANT EXECUTE ON FUNCTION public.get_provider_conversations(UUID) TO authenticated;

-- ============================================================
-- 2. UPDATE create_message_notification trigger
--    Return type is still TRIGGER — CREATE OR REPLACE is safe.
--    This was rolled back with the original 050000 migration.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_message_notification()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE
  sender_name TEXT;
  body_text   TEXT;
BEGIN
  SELECT full_name INTO sender_name
  FROM public.users
  WHERE id = NEW.sender_id;

  IF NEW.message_type = 'image' THEN
    body_text := COALESCE(sender_name, 'Someone') || ' sent you a photo';
  ELSE
    body_text := COALESCE(sender_name, 'Someone') || ' sent you a message';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.receiver_id,
    'chat_message',
    'New Message',
    body_text,
    jsonb_build_object(
      'booking_id',   NEW.booking_id,
      'message_id',   NEW.id,
      'sender_id',    NEW.sender_id,
      'sender_name',  sender_name,
      'message_type', NEW.message_type
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
