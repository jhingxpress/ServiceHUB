-- ============================================================
-- CHAT MEDIA COLUMNS
-- Add image_url and message_type to messages table.
-- Backward compatible: existing rows default to message_type='text'.
-- content is now nullable so image-only messages don't require text.
-- ============================================================

-- 1. Add message_type with default 'text' for existing rows
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text'
CHECK (message_type IN ('text', 'image'));

-- 2. Add image_url for photo attachments
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 3. Make content nullable so image messages don't require text
ALTER TABLE public.messages
ALTER COLUMN content DROP NOT NULL;

-- 4. Index for fast image message lookups in inbox
CREATE INDEX IF NOT EXISTS idx_messages_type_booking
ON public.messages(booking_id, message_type, created_at DESC);
