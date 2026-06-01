-- Add chat_message to notifications type enum
-- First drop the existing check constraint and recreate with chat_message included

DO $$
BEGIN
  -- Drop the existing unnamed check constraint on notifications.type
  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

  -- Add the new check constraint with chat_message included
  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
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
      'verification_rejected',
      'chat_message'
    ));
END $$;

-- Create function to insert notification on new message
CREATE OR REPLACE FUNCTION public.create_chat_notification()
RETURNS TRIGGER SECURITY DEFINER AS $$
DECLARE
  sender_name TEXT;
BEGIN
  -- Get sender name
  SELECT full_name INTO sender_name
  FROM public.users
  WHERE id = NEW.sender_id;

  -- Notify receiver about new chat message
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.receiver_id,
    'chat_message',
    'New Message',
    COALESCE(sender_name, 'Someone') || ' sent you a message',
    jsonb_build_object(
      'message_id', NEW.id,
      'booking_id', NEW.booking_id,
      'sender_id', NEW.sender_id,
      'sender_name', sender_name
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to messages table
DROP TRIGGER IF EXISTS messages_create_notification ON public.messages;
CREATE TRIGGER messages_create_notification
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.create_chat_notification();
