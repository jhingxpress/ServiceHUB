-- ============================================================
-- BACKFILL: Mark all existing chat_message notifications as read
--
-- Why:
--   Before fix 20260601*, no mechanism existed to mark
--   chat_message notifications as read when a chat was opened.
--   These accumulated indefinitely and inflated the Settings/
--   Profile badge even though the underlying messages were read.
--
--   The badge queries now exclude type='chat_message' (those are
--   tracked by the Messages tab badge via messages.is_read).
--   This migration clears the historical backlog so the badge
--   drops to the correct count immediately after deploy.
--
-- Safe to re-run: UPDATE is idempotent (WHERE is_read = false).
-- ============================================================

UPDATE public.notifications
SET is_read = true
WHERE type = 'chat_message'
  AND is_read = false;
