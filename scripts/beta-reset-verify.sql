-- ============================================================
-- TAGA Closed Beta Reset — Post-Cleanup Verification
-- Run this in the Supabase SQL Editor AFTER cleanup.
-- ============================================================

-- ============================================================
-- 1. REMAINING AUTH USERS (should be 1)
-- ============================================================
SELECT
  au.id AS auth_user_id,
  au.email,
  pu.full_name,
  pu.role,
  pu.status
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
ORDER BY pu.role, au.email;

-- ============================================================
-- 2. REMAINING PUBLIC USERS (should be 1 — admin only)
-- ============================================================
SELECT id, email, full_name, role, status
FROM public.users
ORDER BY role, email;

-- ============================================================
-- 3. ADMIN VERIFICATION
-- ============================================================
SELECT
  (SELECT COUNT(*) FROM auth.users) AS remaining_auth_users,
  (SELECT COUNT(*) FROM public.users) AS remaining_public_users,
  (SELECT COUNT(*) FROM public.users WHERE role = 'admin') AS remaining_admins,
  (SELECT email FROM public.users WHERE role = 'admin') AS admin_email,
  (SELECT COUNT(*) FROM public.users WHERE role != 'admin') AS non_admin_users_remaining;

-- ============================================================
-- 4. POST-CLEANUP ROW COUNTS (user data tables should be 0 or admin-only)
-- ============================================================
SELECT 'providers' AS table_name, COUNT(*) AS row_count FROM public.providers
UNION ALL SELECT 'services', COUNT(*) FROM public.services
UNION ALL SELECT 'service_options', COUNT(*) FROM public.service_options
UNION ALL SELECT 'service_images', COUNT(*) FROM public.service_images
UNION ALL SELECT 'bookings', COUNT(*) FROM public.bookings
UNION ALL SELECT 'booking_incident_reports', COUNT(*) FROM public.booking_incident_reports
UNION ALL SELECT 'provider_live_locations', COUNT(*) FROM public.provider_live_locations
UNION ALL SELECT 'reviews', COUNT(*) FROM public.reviews
UNION ALL SELECT 'review_media', COUNT(*) FROM public.review_media
UNION ALL SELECT 'messages', COUNT(*) FROM public.messages
UNION ALL SELECT 'payments', COUNT(*) FROM public.payments
UNION ALL SELECT 'disputes', COUNT(*) FROM public.disputes
UNION ALL SELECT 'reports', COUNT(*) FROM public.reports
UNION ALL SELECT 'notifications', COUNT(*) FROM public.notifications
UNION ALL SELECT 'favorite_providers', COUNT(*) FROM public.favorite_providers
UNION ALL SELECT 'user_push_tokens', COUNT(*) FROM public.user_push_tokens
UNION ALL SELECT 'saved_locations', COUNT(*) FROM public.saved_locations
UNION ALL SELECT 'servicehub_tips', COUNT(*) FROM public.servicehub_tips
UNION ALL SELECT 'provider_documents', COUNT(*) FROM public.provider_documents
UNION ALL SELECT 'provider_gallery', COUNT(*) FROM public.provider_gallery
UNION ALL SELECT 'provider_portfolio', COUNT(*) FROM public.provider_portfolio
UNION ALL SELECT 'provider_badges', COUNT(*) FROM public.provider_badges
UNION ALL SELECT 'provider_stats', COUNT(*) FROM public.provider_stats
UNION ALL SELECT 'provider_verification_logs', COUNT(*) FROM public.provider_verification_logs
UNION ALL SELECT 'provider_views', COUNT(*) FROM public.provider_views
UNION ALL SELECT 'provider_performance', COUNT(*) FROM public.provider_performance
UNION ALL SELECT 'provider_score', COUNT(*) FROM public.provider_score
UNION ALL SELECT 'provider_analytics', COUNT(*) FROM public.provider_analytics
UNION ALL SELECT 'provider_checklist', COUNT(*) FROM public.provider_checklist
UNION ALL SELECT 'availability', COUNT(*) FROM public.availability
UNION ALL SELECT 'provider_categories', COUNT(*) FROM public.provider_categories
UNION ALL SELECT 'featured_requests', COUNT(*) FROM public.featured_requests
UNION ALL SELECT 'featured_payments', COUNT(*) FROM public.featured_payments
UNION ALL SELECT 'provider_platform_fees', COUNT(*) FROM public.provider_platform_fees
UNION ALL SELECT 'platform_fee_payments', COUNT(*) FROM public.platform_fee_payments
UNION ALL SELECT 'staff_action_log', COUNT(*) FROM public.staff_action_log
UNION ALL SELECT 'escalations', COUNT(*) FROM public.escalations
ORDER BY table_name;

-- ============================================================
-- 5. PRESERVED CONFIGURATION / SEED DATA
-- ============================================================
SELECT 'categories' AS table_name, COUNT(*) AS row_count FROM public.categories
UNION ALL SELECT 'service_groups', COUNT(*) FROM public.service_groups
UNION ALL SELECT 'service_templates', COUNT(*) FROM public.service_templates
UNION ALL SELECT 'platform_fee_schedule', COUNT(*) FROM public.platform_fee_schedule
UNION ALL SELECT 'platform_config', COUNT(*) FROM public.platform_config
ORDER BY table_name;

-- ============================================================
-- 6. ORPHANED FOREIGN KEY CHECK
-- Checks for any rows in user-data tables that reference
-- non-existent users (should return 0 rows)
-- ============================================================
SELECT 'orphaned_bookings_customer' AS check_name, COUNT(*) AS count
FROM public.bookings b
LEFT JOIN public.users u ON b.customer_id = u.id
WHERE u.id IS NULL
UNION ALL
SELECT 'orphaned_bookings_provider', COUNT(*)
FROM public.bookings b
LEFT JOIN public.providers p ON b.provider_id = p.id
WHERE p.id IS NULL
UNION ALL
SELECT 'orphaned_messages_sender', COUNT(*)
FROM public.messages m
LEFT JOIN public.users u ON m.sender_id = u.id
WHERE u.id IS NULL
UNION ALL
SELECT 'orphaned_messages_receiver', COUNT(*)
FROM public.messages m
LEFT JOIN public.users u ON m.receiver_id = u.id
WHERE u.id IS NULL
UNION ALL
SELECT 'orphaned_reviews_customer', COUNT(*)
FROM public.reviews r
LEFT JOIN public.users u ON r.customer_id = u.id
WHERE u.id IS NULL
UNION ALL
SELECT 'orphaned_reviews_provider', COUNT(*)
FROM public.reviews r
LEFT JOIN public.providers p ON r.provider_id = p.id
WHERE p.id IS NULL
UNION ALL
SELECT 'orphaned_notifications_user', COUNT(*)
FROM public.notifications n
LEFT JOIN public.users u ON n.user_id = u.id
WHERE u.id IS NULL
UNION ALL
SELECT 'orphaned_services_provider', COUNT(*)
FROM public.services s
LEFT JOIN public.providers p ON s.provider_id = p.id
WHERE p.id IS NULL;

-- ============================================================
-- 7. RLS POLICIES PRESERVED
-- ============================================================
SELECT COUNT(*) AS total_rls_policies FROM pg_policies WHERE schemaname = 'public';

-- ============================================================
-- 8. SCHEMA TABLES PRESERVED
-- ============================================================
SELECT COUNT(*) AS total_tables
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- ============================================================
-- 9. STORAGE OBJECT COUNTS (should be 0 or admin-only)
-- ============================================================
SELECT
  bucket_id,
  COUNT(*) AS object_count
FROM storage.objects
GROUP BY bucket_id
ORDER BY bucket_id;

-- ============================================================
-- 10. INTEGRITY SUMMARY
-- ============================================================
SELECT
  CASE
    WHEN (SELECT COUNT(*) FROM auth.users) = 1
     AND (SELECT COUNT(*) FROM public.users WHERE role = 'admin') = 1
     AND (SELECT COUNT(*) FROM public.users WHERE role != 'admin') = 0
     AND (SELECT COUNT(*) FROM public.bookings) = 0
     AND (SELECT COUNT(*) FROM public.messages) = 0
     AND (SELECT COUNT(*) FROM public.reviews) = 0
    THEN 'PASS'
    ELSE 'FAIL'
  END AS integrity_check;
