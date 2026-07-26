-- ============================================================
-- TAGA Closed Beta Reset — Database Audit
-- Run this in the Supabase SQL Editor BEFORE any cleanup.
-- ============================================================

-- ============================================================
-- 1. ALL TABLES in public schema
-- ============================================================
SELECT
  t.table_name,
  pg_size_pretty(pg_total_relation_size('public.' || t.table_name)) AS total_size
FROM information_schema.tables t
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;

-- ============================================================
-- 2. FOREIGN KEY RELATIONSHIPS (dependency graph)
-- ============================================================
SELECT
  tc.table_name AS child_table,
  kcu.column_name AS child_column,
  ccu.table_name AS parent_table,
  ccu.column_name AS parent_column,
  rc.delete_rule AS on_delete
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
  AND rc.constraint_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY ccu.table_name, tc.table_name;

-- ============================================================
-- 3. TABLES THAT REFERENCE users (directly or via providers)
-- ============================================================
SELECT DISTINCT
  tc.table_name AS table_name,
  kcu.column_name AS column_name,
  ccu.table_name AS references_table,
  rc.delete_rule AS on_delete
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
  AND rc.constraint_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND (ccu.table_name IN ('users', 'providers') OR ccu.table_name = 'auth.users')
ORDER BY tc.table_name;

-- ============================================================
-- 4. TABLES THAT REFERENCE bookings
-- ============================================================
SELECT DISTINCT
  tc.table_name AS table_name,
  kcu.column_name AS column_name,
  rc.delete_rule AS on_delete
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints rc
  ON rc.constraint_name = tc.constraint_name
  AND rc.constraint_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'bookings'
ORDER BY tc.table_name;

-- ============================================================
-- 5. TABLES THAT CONTAIN UPLOADED IMAGE/FILE PATHS
-- ============================================================
SELECT
  t.table_name,
  c.column_name,
  c.data_type
FROM information_schema.columns c
JOIN information_schema.tables t
  ON c.table_name = t.table_name
  AND c.table_schema = t.table_schema
WHERE c.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND (c.column_name LIKE '%url%' OR c.column_name LIKE '%photo%' OR c.column_name LIKE '%image%' OR c.column_name LIKE '%file%' OR c.column_name LIKE '%avatar%' OR c.column_name LIKE '%logo%' OR c.column_name LIKE '%cover%' OR c.column_name LIKE '%document%')
ORDER BY t.table_name, c.column_name;

-- ============================================================
-- 6. STORAGE BUCKETS
-- ============================================================
SELECT id, name, public, created_at
FROM storage.buckets
ORDER BY name;

-- ============================================================
-- 7. ROW COUNTS PER TABLE (current state)
-- ============================================================
SELECT 'auth.users' AS table_name, COUNT(*) AS row_count FROM auth.users
UNION ALL SELECT 'public.users', COUNT(*) FROM public.users
UNION ALL SELECT 'public.providers', COUNT(*) FROM public.providers
UNION ALL SELECT 'public.categories', COUNT(*) FROM public.categories
UNION ALL SELECT 'public.provider_categories', COUNT(*) FROM public.provider_categories
UNION ALL SELECT 'public.services', COUNT(*) FROM public.services
UNION ALL SELECT 'public.service_options', COUNT(*) FROM public.service_options
UNION ALL SELECT 'public.service_images', COUNT(*) FROM public.service_images
UNION ALL SELECT 'public.service_groups', COUNT(*) FROM public.service_groups
UNION ALL SELECT 'public.service_templates', COUNT(*) FROM public.service_templates
UNION ALL SELECT 'public.bookings', COUNT(*) FROM public.bookings
UNION ALL SELECT 'public.booking_incident_reports', COUNT(*) FROM public.booking_incident_reports
UNION ALL SELECT 'public.provider_live_locations', COUNT(*) FROM public.provider_live_locations
UNION ALL SELECT 'public.reviews', COUNT(*) FROM public.reviews
UNION ALL SELECT 'public.review_media', COUNT(*) FROM public.review_media
UNION ALL SELECT 'public.messages', COUNT(*) FROM public.messages
UNION ALL SELECT 'public.payments', COUNT(*) FROM public.payments
UNION ALL SELECT 'public.disputes', COUNT(*) FROM public.disputes
UNION ALL SELECT 'public.reports', COUNT(*) FROM public.reports
UNION ALL SELECT 'public.notifications', COUNT(*) FROM public.notifications
UNION ALL SELECT 'public.favorite_providers', COUNT(*) FROM public.favorite_providers
UNION ALL SELECT 'public.user_push_tokens', COUNT(*) FROM public.user_push_tokens
UNION ALL SELECT 'public.saved_locations', COUNT(*) FROM public.saved_locations
UNION ALL SELECT 'public.servicehub_tips', COUNT(*) FROM public.servicehub_tips
UNION ALL SELECT 'public.provider_documents', COUNT(*) FROM public.provider_documents
UNION ALL SELECT 'public.provider_gallery', COUNT(*) FROM public.provider_gallery
UNION ALL SELECT 'public.provider_portfolio', COUNT(*) FROM public.provider_portfolio
UNION ALL SELECT 'public.provider_badges', COUNT(*) FROM public.provider_badges
UNION ALL SELECT 'public.provider_stats', COUNT(*) FROM public.provider_stats
UNION ALL SELECT 'public.provider_verification_logs', COUNT(*) FROM public.provider_verification_logs
UNION ALL SELECT 'public.provider_views', COUNT(*) FROM public.provider_views
UNION ALL SELECT 'public.provider_performance', COUNT(*) FROM public.provider_performance
UNION ALL SELECT 'public.provider_score', COUNT(*) FROM public.provider_score
UNION ALL SELECT 'public.provider_analytics', COUNT(*) FROM public.provider_analytics
UNION ALL SELECT 'public.provider_checklist', COUNT(*) FROM public.provider_checklist
UNION ALL SELECT 'public.availability', COUNT(*) FROM public.availability
UNION ALL SELECT 'public.featured_requests', COUNT(*) FROM public.featured_requests
UNION ALL SELECT 'public.featured_payments', COUNT(*) FROM public.featured_payments
UNION ALL SELECT 'public.platform_fee_schedule', COUNT(*) FROM public.platform_fee_schedule
UNION ALL SELECT 'public.provider_platform_fees', COUNT(*) FROM public.provider_platform_fees
UNION ALL SELECT 'public.platform_fee_payments', COUNT(*) FROM public.platform_fee_payments
UNION ALL SELECT 'public.platform_config', COUNT(*) FROM public.platform_config
UNION ALL SELECT 'public.staff_action_log', COUNT(*) FROM public.staff_action_log
UNION ALL SELECT 'public.escalations', COUNT(*) FROM public.escalations
ORDER BY table_name;

-- ============================================================
-- 8. ADMIN ACCOUNT IDENTIFICATION
-- ============================================================
SELECT
  au.id AS auth_user_id,
  pu.email,
  pu.full_name,
  pu.role,
  pu.status,
  pu.created_at
FROM auth.users au
JOIN public.users pu ON au.id = pu.id
WHERE pu.role = 'admin'
ORDER BY pu.email;

-- ============================================================
-- 9. ALL USERS (candidates for deletion)
-- ============================================================
SELECT
  au.id AS auth_user_id,
  pu.email,
  pu.full_name,
  pu.role,
  pu.status,
  pu.created_at,
  (SELECT COUNT(*) FROM public.bookings b WHERE b.customer_id = pu.id OR b.provider_id = pu.id) AS booking_count,
  (SELECT COUNT(*) FROM public.messages m WHERE m.sender_id = pu.id OR m.receiver_id = pu.id) AS message_count,
  (SELECT COUNT(*) FROM public.reviews r WHERE r.customer_id = pu.id OR r.provider_id = pu.id) AS review_count
FROM auth.users au
JOIN public.users pu ON au.id = pu.id
ORDER BY pu.created_at DESC;

-- ============================================================
-- 10. STORAGE OBJECT COUNTS PER BUCKET
-- ============================================================
SELECT
  bucket_id,
  COUNT(*) AS object_count,
  pg_size_pretty(SUM(size)::bigint) AS total_size
FROM storage.objects
GROUP BY bucket_id
ORDER BY bucket_id;

-- ============================================================
-- 11. RLS POLICY COUNT (verify preserved after reset)
-- ============================================================
SELECT COUNT(*) AS total_rls_policies FROM pg_policies WHERE schemaname = 'public';

-- ============================================================
-- 12. SAFEST DELETION ORDER (dependency-ordered)
-- ============================================================
-- The deletion order is encoded in the run_beta_reset() function.
-- Summary of the order:
--
-- Phase 1: RESTRICT constraints
--   platform_fee_payments → provider_platform_fees
--
-- Phase 2: NO ACTION references
--   booking_incident_reports.reviewed_by → SET NULL
--
-- Phase 3: Booking-related (bottom-up)
--   booking_incident_reports → provider_live_locations →
--   review_media → reviews → messages → payments →
--   disputes → reports → bookings
--
-- Phase 4: Provider-related (bottom-up)
--   service_images → service_options → services →
--   provider_views → provider_performance → provider_score →
--   provider_analytics → provider_checklist → provider_portfolio →
--   provider_gallery → provider_documents → provider_badges →
--   provider_stats → provider_verification_logs → availability →
--   featured_payments → featured_requests → provider_categories
--
-- Phase 5: User-related
--   notifications → favorite_providers → saved_locations →
--   user_push_tokens → servicehub_tips → staff_action_log →
--   escalations
--
-- Phase 6: Core records
--   providers → public.users → auth.users (via Admin API)
