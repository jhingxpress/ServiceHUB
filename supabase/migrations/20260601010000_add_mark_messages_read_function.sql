-- ============================================================
-- Add mark_messages_read RPC function
-- Fixes: ChatRoomScreen markAsRead only updated is_read but
--        not delivery_status, leaving messages half-marked.
--        This function atomically updates both fields.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_messages_read(p_booking_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.messages
  SET is_read = true, delivery_status = 'read'
  WHERE booking_id = p_booking_id
    AND receiver_id = p_user_id
    AND is_read = false;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.mark_messages_read(UUID, UUID) TO authenticated;
