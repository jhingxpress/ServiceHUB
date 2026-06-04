-- ============================================================
-- ServiceHub Pre-Beta Database Cleanup
-- Generated: 2026-06-04
-- Phase 1: Audit counts
-- Phase 2: Backup & identify preserved accounts
-- Phase 3: Safe cleanup execution
-- ============================================================

-- ============================================================
-- PHASE 1 – AUDIT COUNTS
-- Run these first. Do NOT proceed to Phase 3 until counts are reviewed.
-- ============================================================

-- 1.1 Auth users (Supabase identities)
SELECT 'auth.users' AS table_name, COUNT(*) AS row_count FROM auth.users;

-- 1.2 Public users (app profiles)
SELECT 'public.users' AS table_name, COUNT(*) AS row_count FROM public.users;

-- 1.3 Providers
SELECT 'public.providers' AS table_name, COUNT(*) AS row_count FROM public.providers;

-- 1.4 Services
SELECT 'public.services' AS table_name, COUNT(*) AS row_count FROM public.services;

-- 1.5 Service options
SELECT 'public.service_options' AS table_name, COUNT(*) AS row_count FROM public.service_options;

-- 1.6 Service images
SELECT 'public.service_images' AS table_name, COUNT(*) AS row_count FROM public.service_images;

-- 1.7 Bookings
SELECT 'public.bookings' AS table_name, COUNT(*) AS row_count FROM public.bookings;

-- 1.8 Messages
SELECT 'public.messages' AS table_name, COUNT(*) AS row_count FROM public.messages;

-- 1.9 Reviews
SELECT 'public.reviews' AS table_name, COUNT(*) AS row_count FROM public.reviews;

-- 1.10 Review media
SELECT 'public.review_media' AS table_name, COUNT(*) AS row_count FROM public.review_media;

-- 1.11 Notifications
SELECT 'public.notifications' AS table_name, COUNT(*) AS row_count FROM public.notifications;

-- 1.12 Favorite providers (saved providers)
SELECT 'public.favorite_providers' AS table_name, COUNT(*) AS row_count FROM public.favorite_providers;

-- 1.13 Provider documents
SELECT 'public.provider_documents' AS table_name, COUNT(*) AS row_count FROM public.provider_documents;

-- 1.14 Provider gallery
SELECT 'public.provider_gallery' AS table_name, COUNT(*) AS row_count FROM public.provider_gallery;

-- 1.15 Provider badges
SELECT 'public.provider_badges' AS table_name, COUNT(*) AS row_count FROM public.provider_badges;

-- 1.16 Provider stats
SELECT 'public.provider_stats' AS table_name, COUNT(*) AS row_count FROM public.provider_stats;

-- 1.17 Provider verification logs
SELECT 'public.provider_verification_logs' AS table_name, COUNT(*) AS row_count FROM public.provider_verification_logs;

-- 1.18 Availability
SELECT 'public.availability' AS table_name, COUNT(*) AS row_count FROM public.availability;

-- 1.19 Payments
SELECT 'public.payments' AS table_name, COUNT(*) AS row_count FROM public.payments;

-- 1.20 Disputes
SELECT 'public.disputes' AS table_name, COUNT(*) AS row_count FROM public.disputes;

-- 1.21 Reports
SELECT 'public.reports' AS table_name, COUNT(*) AS row_count FROM public.reports;

-- 1.22 User push tokens
SELECT 'public.user_push_tokens' AS table_name, COUNT(*) AS row_count FROM public.user_push_tokens;


-- ============================================================
-- PHASE 2 – BACKUP & PRESERVED ACCOUNTS IDENTIFICATION
-- Run these BEFORE any deletion.
-- ============================================================

-- 2.1 Identify admin / super admin accounts (PRESERVE)
SELECT
  au.id AS auth_user_id,
  pu.email,
  pu.role,
  pu.status,
  pu.created_at,
  (pu.role = 'admin') AS is_admin,
  (pu.role = 'provider' AND p.status = 'approved') AS is_approved_provider
FROM auth.users au
JOIN public.users pu ON au.id = pu.id
LEFT JOIN public.providers p ON pu.id = p.id
WHERE pu.role = 'admin'
   OR pu.email ILIKE '%admin%'
   OR pu.email ILIKE '%super%'
ORDER BY pu.role, pu.email;

-- 2.2 Identify beta test accounts to preserve
SELECT
  au.id AS auth_user_id,
  pu.email,
  pu.role,
  pu.status,
  pu.created_at
FROM auth.users au
JOIN public.users pu ON au.id = pu.id
WHERE pu.email IN (
  'genecorbeta09@gmail.com',
  'brixsea09@gmail.com'
)
ORDER BY pu.email;

-- 2.3 Identify all other accounts (CANDIDATES FOR DELETION)
SELECT
  au.id AS auth_user_id,
  pu.email,
  pu.role,
  pu.status,
  pu.created_at,
  (SELECT COUNT(*) FROM public.bookings b WHERE b.customer_id = pu.id OR b.provider_id = pu.id) AS booking_count,
  (SELECT COUNT(*) FROM public.messages m WHERE m.sender_id = pu.id OR m.receiver_id = pu.id) AS message_count,
  (SELECT COUNT(*) FROM public.reviews r WHERE r.customer_id = pu.id OR r.provider_id = pu.id) AS review_count,
  (SELECT COUNT(*) FROM public.notifications n WHERE n.user_id = pu.id) AS notification_count
FROM auth.users au
JOIN public.users pu ON au.id = pu.id
WHERE pu.email NOT IN (
  'genecorbeta09@gmail.com',
  'brixsea09@gmail.com'
)
AND pu.role != 'admin'
ORDER BY pu.created_at DESC;


-- ============================================================
-- PHASE 3 – SAFE CLEANUP EXECUTION
-- ============================================================
-- IMPORTANT: This phase deletes data. Run Phase 1 & 2 first.
-- Verify the preserved account IDs before executing.
-- The IDs below are PLACEHOLDERS. Replace with actual UUIDs from Phase 2.

BEGIN;

-- 3.1 Set preserved account IDs
-- REPLACE THESE WITH ACTUAL UUIDs FROM Phase 2.2 and Phase 2.1
DO $$
DECLARE
  preserved_ids UUID[] := ARRAY[
    -- Admin accounts (fill from Phase 2.1)
    '00000000-0000-0000-0000-000000000001'::UUID,
    -- Beta customer: genecorbeta09@gmail.com
    '00000000-0000-0000-0000-000000000002'::UUID,
    -- Beta provider: brixsea09@gmail.com
    '00000000-0000-0000-0000-000000000003'::UUID
  ];
BEGIN
  RAISE NOTICE 'Preserved IDs: %', preserved_ids;

  -- 3.2 Delete push tokens for non-preserved users
  DELETE FROM public.user_push_tokens
  WHERE user_id NOT IN (SELECT unnest(preserved_ids));
  RAISE NOTICE 'Deleted push tokens';

  -- 3.3 Delete reports (orphaned after user deletion; clean proactively)
  DELETE FROM public.reports
  WHERE reporter_id NOT IN (SELECT unnest(preserved_ids))
     OR reported_user_id NOT IN (SELECT unnest(preserved_ids));
  RAISE NOTICE 'Deleted reports';

  -- 3.4 Delete review media
  DELETE FROM public.review_media
  WHERE review_id IN (
    SELECT id FROM public.reviews
    WHERE customer_id NOT IN (SELECT unnest(preserved_ids))
  );
  RAISE NOTICE 'Deleted review media';

  -- 3.5 Delete reviews
  DELETE FROM public.reviews
  WHERE customer_id NOT IN (SELECT unnest(preserved_ids));
  RAISE NOTICE 'Deleted reviews';

  -- 3.6 Delete messages
  DELETE FROM public.messages
  WHERE sender_id NOT IN (SELECT unnest(preserved_ids))
     OR receiver_id NOT IN (SELECT unnest(preserved_ids));
  RAISE NOTICE 'Deleted messages';

  -- 3.7 Delete payments
  DELETE FROM public.payments
  WHERE customer_id NOT IN (SELECT unnest(preserved_ids))
     OR provider_id NOT IN (SELECT unnest(preserved_ids));
  RAISE NOTICE 'Deleted payments';

  -- 3.8 Delete disputes
  DELETE FROM public.disputes
  WHERE raised_by NOT IN (SELECT unnest(preserved_ids));
  RAISE NOTICE 'Deleted disputes';

  -- 3.9 Delete notifications
  DELETE FROM public.notifications
  WHERE user_id NOT IN (SELECT unnest(preserved_ids));
  RAISE NOTICE 'Deleted notifications';

  -- 3.10 Delete favorite providers
  DELETE FROM public.favorite_providers
  WHERE customer_id NOT IN (SELECT unnest(preserved_ids))
     OR provider_id IN (
       SELECT id FROM public.providers
       WHERE id NOT IN (SELECT unnest(preserved_ids))
     );
  RAISE NOTICE 'Deleted favorite providers';

  -- 3.11 Delete provider verification logs
  DELETE FROM public.provider_verification_logs
  WHERE provider_id IN (
    SELECT id FROM public.providers
    WHERE id NOT IN (SELECT unnest(preserved_ids))
  );
  RAISE NOTICE 'Deleted provider verification logs';

  -- 3.12 Delete provider badges
  DELETE FROM public.provider_badges
  WHERE provider_id IN (
    SELECT id FROM public.providers
    WHERE id NOT IN (SELECT unnest(preserved_ids))
  );
  RAISE NOTICE 'Deleted provider badges';

  -- 3.13 Delete provider gallery
  DELETE FROM public.provider_gallery
  WHERE provider_id IN (
    SELECT id FROM public.providers
    WHERE id NOT IN (SELECT unnest(preserved_ids))
  );
  RAISE NOTICE 'Deleted provider gallery';

  -- 3.14 Delete provider documents
  DELETE FROM public.provider_documents
  WHERE provider_id IN (
    SELECT id FROM public.providers
    WHERE id NOT IN (SELECT unnest(preserved_ids))
  );
  RAISE NOTICE 'Deleted provider documents';

  -- 3.15 Delete provider stats
  DELETE FROM public.provider_stats
  WHERE provider_id IN (
    SELECT id FROM public.providers
    WHERE id NOT IN (SELECT unnest(preserved_ids))
  );
  RAISE NOTICE 'Deleted provider stats';

  -- 3.16 Delete service images
  DELETE FROM public.service_images
  WHERE service_id IN (
    SELECT id FROM public.services
    WHERE provider_id IN (
      SELECT id FROM public.providers
      WHERE id NOT IN (SELECT unnest(preserved_ids))
    )
  );
  RAISE NOTICE 'Deleted service images';

  -- 3.17 Delete service options
  DELETE FROM public.service_options
  WHERE service_id IN (
    SELECT id FROM public.services
    WHERE provider_id IN (
      SELECT id FROM public.providers
      WHERE id NOT IN (SELECT unnest(preserved_ids))
    )
  );
  RAISE NOTICE 'Deleted service options';

  -- 3.18 Delete services
  DELETE FROM public.services
  WHERE provider_id IN (
    SELECT id FROM public.providers
    WHERE id NOT IN (SELECT unnest(preserved_ids))
  );
  RAISE NOTICE 'Deleted services';

  -- 3.19 Delete availability
  DELETE FROM public.availability
  WHERE provider_id IN (
    SELECT id FROM public.providers
    WHERE id NOT IN (SELECT unnest(preserved_ids))
  );
  RAISE NOTICE 'Deleted availability';

  -- 3.20 Delete bookings
  DELETE FROM public.bookings
  WHERE customer_id NOT IN (SELECT unnest(preserved_ids))
     OR provider_id IN (
       SELECT id FROM public.providers
       WHERE id NOT IN (SELECT unnest(preserved_ids))
     );
  RAISE NOTICE 'Deleted bookings';

  -- 3.21 Delete providers
  DELETE FROM public.providers
  WHERE id NOT IN (SELECT unnest(preserved_ids));
  RAISE NOTICE 'Deleted providers';

  -- 3.22 Delete public users
  DELETE FROM public.users
  WHERE id NOT IN (SELECT unnest(preserved_ids));
  RAISE NOTICE 'Deleted public users';

  -- 3.23 Delete auth users
  DELETE FROM auth.users
  WHERE id NOT IN (SELECT unnest(preserved_ids));
  RAISE NOTICE 'Deleted auth users';

END $$;

COMMIT;


-- ============================================================
-- PHASE 4 – POST-CLEANUP VERIFICATION
-- Run these after COMMIT to confirm the cleanup.
-- ============================================================

SELECT 'POST-CLEANUP COUNTS' AS phase;

SELECT 'auth.users' AS table_name, COUNT(*) AS row_count FROM auth.users;
SELECT 'public.users' AS table_name, COUNT(*) AS row_count FROM public.users;
SELECT 'public.providers' AS table_name, COUNT(*) AS row_count FROM public.providers;
SELECT 'public.bookings' AS table_name, COUNT(*) AS row_count FROM public.bookings;
SELECT 'public.messages' AS table_name, COUNT(*) AS row_count FROM public.messages;
SELECT 'public.reviews' AS table_name, COUNT(*) AS row_count FROM public.reviews;
SELECT 'public.review_media' AS table_name, COUNT(*) AS row_count FROM public.review_media;
SELECT 'public.notifications' AS table_name, COUNT(*) AS row_count FROM public.notifications;
SELECT 'public.favorite_providers' AS table_name, COUNT(*) AS row_count FROM public.favorite_providers;
SELECT 'public.services' AS table_name, COUNT(*) AS row_count FROM public.services;
SELECT 'public.service_options' AS table_name, COUNT(*) AS row_count FROM public.service_options;
SELECT 'public.payments' AS table_name, COUNT(*) AS row_count FROM public.payments;
SELECT 'public.disputes' AS table_name, COUNT(*) AS row_count FROM public.disputes;
SELECT 'public.reports' AS table_name, COUNT(*) AS row_count FROM public.reports;
SELECT 'public.user_push_tokens' AS table_name, COUNT(*) AS row_count FROM public.user_push_tokens;
SELECT 'public.availability' AS table_name, COUNT(*) AS row_count FROM public.availability;

-- Verify preserved accounts exist
SELECT 'PRESERVED ACCOUNTS' AS check_item,
       (SELECT COUNT(*) FROM auth.users WHERE email IN ('genecorbeta09@gmail.com', 'brixsea09@gmail.com')) AS beta_accounts,
       (SELECT COUNT(*) FROM auth.users au JOIN public.users pu ON au.id = pu.id WHERE pu.role = 'admin') AS admin_accounts;

-- Verify schema integrity
SELECT 'SCHEMA TABLES' AS check_item, COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema = 'public';
SELECT 'RLS POLICIES' AS check_item, COUNT(*) AS policy_count FROM pg_policies WHERE schemaname = 'public';
SELECT 'FUNCTIONS' AS check_item, COUNT(*) AS function_count FROM pg_proc WHERE pronamespace = 'public'::regnamespace;
SELECT 'TRIGGERS' AS check_item, COUNT(*) AS trigger_count FROM pg_trigger WHERE tgrelid::regclass::text LIKE 'public.%';
