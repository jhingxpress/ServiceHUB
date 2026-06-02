-- ============================================================
-- Fix Accept Booking Workflow
-- 1. Create missing send_welcome_message trigger
-- 2. Drop duplicate notification triggers to prevent double inserts
-- ============================================================

-- 1. CREATE missing trigger: send_welcome_message on bookings UPDATE to 'accepted'
--    The function send_welcome_message() was defined in 20260529220200_fix_trigger_rls.sql
--    but the trigger itself was never attached to the bookings table.
DROP TRIGGER IF EXISTS bookings_send_welcome_message ON public.bookings;
CREATE TRIGGER bookings_send_welcome_message
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  WHEN (NEW.status = 'accepted' AND OLD.status != 'accepted')
  EXECUTE FUNCTION public.send_welcome_message();

-- 2. DROP duplicate notification triggers
--    architecture_renovation.sql created 'bookings_create_notification' which uses
--    create_booking_notification() — this handles accepted/rejected/etc.
--    notification_types_update.sql created 'bookings_status_notification' which uses
--    create_booking_status_notification() — this ALSO handles accepted/rejected/etc.
--    Having both causes DUPLICATE notifications for every status change.
--    We keep the newer bookings_status_notification (more comprehensive) and drop the old one.
DROP TRIGGER IF EXISTS bookings_create_notification ON public.bookings;
