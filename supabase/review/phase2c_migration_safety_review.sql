-- ============================================================
-- Phase 2C Migration Safety Review
-- Pre-migration, post-migration, and rollback verification SQL
--
-- Run these against the live Supabase SQL Editor BEFORE and AFTER
-- applying the migrations. Do NOT run the migrations automatically.
-- ============================================================

-- ============================================================
-- §1. PRE-MIGRATION VERIFICATION QUERIES
-- Run these BEFORE applying either migration.
-- ============================================================

-- 1a. Check current document_type CHECK constraint
SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = con.namespace
WHERE rel.relname = 'provider_documents'
  AND con.contype = 'c'
ORDER BY con.conname;

-- 1b. Check existing document_type values in production
SELECT document_type, COUNT(*) AS row_count
FROM public.provider_documents
GROUP BY document_type
ORDER BY document_type;

-- 1c. Check for any existing selfie_liveness rows (should be zero in prod)
SELECT COUNT(*) AS selfie_liveness_count
FROM public.provider_documents
WHERE document_type = 'selfie_liveness';

-- 1d. Check for selfie_with_id rows (these will be migrated)
SELECT COUNT(*) AS selfie_with_id_count,
       COUNT(DISTINCT provider_id) AS unique_providers
FROM public.provider_documents
WHERE document_type = 'selfie_with_id';

-- 1e. Check existing statuses of selfie_with_id rows
SELECT status, COUNT(*) AS count
FROM public.provider_documents
WHERE document_type = 'selfie_with_id'
GROUP BY status;

-- 1f. Check if platform_config table exists and has the flag
SELECT key, value
FROM public.platform_config
WHERE key = 'identity_live_selfie_enabled';

-- 1g. Check existing grants on platform_config
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'platform_config'
  AND table_schema = 'public';

-- 1h. Check if get_feature_flags function already exists
SELECT proname, prosecdef, proconfig
FROM pg_proc
WHERE proname = 'get_feature_flags';

-- 1i. Check existing column list on provider_documents
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'provider_documents'
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- 1j. Snapshot row counts for rollback verification
SELECT 'provider_documents' AS table_name, COUNT(*) AS row_count
FROM public.provider_documents
UNION ALL
SELECT 'platform_config', COUNT(*)
FROM public.platform_config;


-- ============================================================
-- §2. POST-MIGRATION VERIFICATION QUERIES
-- Run these AFTER applying both migrations.
-- ============================================================

-- 2a. Verify no selfie_with_id rows remain
SELECT COUNT(*) AS remaining_selfie_with_id
FROM public.provider_documents
WHERE document_type = 'selfie_with_id';
-- Expected: 0

-- 2b. Verify no selfie_liveness rows exist
SELECT COUNT(*) AS selfie_liveness_count
FROM public.provider_documents
WHERE document_type = 'selfie_liveness';
-- Expected: 0

-- 2c. Verify verification_selfie rows exist with correct mode
SELECT document_type, verification_mode, COUNT(*) AS count
FROM public.provider_documents
WHERE document_type = 'verification_selfie'
GROUP BY document_type, verification_mode;
-- Expected: verification_selfie / legacy_manual / (same count as pre-migration selfie_with_id)

-- 2d. Verify total row count unchanged (no rows deleted)
SELECT COUNT(*) AS total_rows
FROM public.provider_documents;
-- Expected: same as pre-migration 1j

-- 2e. Verify valid_id rows unchanged
SELECT document_type, COUNT(*) AS count
FROM public.provider_documents
WHERE document_type = 'valid_id'
GROUP BY document_type;
-- Expected: same count as before

-- 2f. Verify police_clearance rows unchanged
SELECT document_type, COUNT(*) AS count
FROM public.provider_documents
WHERE document_type = 'police_clearance'
GROUP BY document_type;
-- Expected: same count as before

-- 2g. Verify all document_type values are in the new CHECK
SELECT DISTINCT document_type
FROM public.provider_documents
ORDER BY document_type;
-- All values must be in the allowed list

-- 2h. Verify verification_mode values
SELECT verification_mode, COUNT(*) AS count
FROM public.provider_documents
GROUP BY verification_mode
ORDER BY verification_mode;
-- Expected: legacy_manual for old rows, NULL for non-selfie rows

-- 2i. Verify statuses preserved for migrated rows
SELECT status, COUNT(*) AS count
FROM public.provider_documents
WHERE document_type = 'verification_selfie'
GROUP BY status;
-- Expected: same status distribution as pre-migration 1e

-- 2j. Verify storage paths preserved
SELECT id, file_url, best_selfie_storage_path
FROM public.provider_documents
WHERE document_type = 'verification_selfie'
LIMIT 5;
-- file_url should be unchanged from original selfie_with_id rows

-- 2k. Verify feature flag is false
SELECT key, value
FROM public.platform_config
WHERE key = 'identity_live_selfie_enabled';
-- Expected: identity_live_selfie_enabled / false

-- 2l. Verify get_feature_flags function properties
SELECT proname, prosecdef, proconfig
FROM pg_proc
WHERE proname = 'get_feature_flags';
-- Expected: prosecdef = true, proconfig includes 'search_path=public, pg_temp'

-- 2m. Verify function grants
SELECT routine_name, grantee, privilege_type
FROM information_schema.role_routine_grants
WHERE routine_name = 'get_feature_flags'
  AND routine_schema = 'public';
-- Expected: authenticated / EXECUTE
-- NOT expected: anon, PUBLIC

-- 2n. Verify no table-level SELECT on platform_config
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'platform_config'
  AND table_schema = 'public'
  AND privilege_type = 'SELECT';
-- Expected: empty or only service_role/postgres (NOT authenticated, anon, PUBLIC)

-- 2o. Verify new columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'provider_documents'
  AND table_schema = 'public'
  AND column_name IN ('verification_mode', 'liveness_status', 'blink_detected',
    'left_turn_detected', 'right_turn_detected', 'capture_quality_score',
    'best_selfie_storage_path', 'liveness_captured_at', 'manual_review_required',
    'liveness_details', 'attempt_count', 'device_platform')
ORDER BY column_name;

-- 2p. Verify CHECK constraint allows all required types
SELECT con.conname, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'provider_documents'
  AND con.conname = 'provider_documents_document_type_check';


-- ============================================================
-- §3. ROLLBACK SQL
-- Run these ONLY if you need to revert the migrations.
-- ============================================================

-- Rollback Phase 2C (20260726210000)
BEGIN;

-- 3a. Rename verification_selfie back to selfie_with_id
UPDATE public.provider_documents
SET document_type = 'selfie_with_id'
WHERE document_type = 'verification_selfie';

-- 3b. Restore the document_type CHECK constraint from 20260615120000
--     (includes selfie_with_id and all Sprint 3.3 types, excludes verification_selfie and selfie_liveness)
ALTER TABLE public.provider_documents DROP CONSTRAINT IF EXISTS provider_documents_document_type_check;
ALTER TABLE public.provider_documents ADD CONSTRAINT provider_documents_document_type_check
  CHECK (document_type IN (
    'valid_id',
    'government_id',
    'barangay_clearance',
    'police_clearance',
    'nbi_clearance',
    'business_permit',
    'dti_registration',
    'bir_registration',
    'sec_registration',
    'tesda_certificate',
    'nc_certificate',
    'prc_license',
    'employment_certificate',
    'professional_cert',
    'selfie_with_id',
    'other_supporting'
  ));

-- 3c. Drop verification_mode column
ALTER TABLE public.provider_documents DROP COLUMN IF EXISTS verification_mode;

COMMIT;

-- Rollback Phase 2B (20260726200000)
BEGIN;

-- 3d. Drop the get_feature_flags function
DROP FUNCTION IF EXISTS public.get_feature_flags();

-- 3e. Drop liveness columns
ALTER TABLE public.provider_documents DROP COLUMN IF EXISTS
  liveness_status, blink_detected, left_turn_detected,
  right_turn_detected, capture_quality_score, best_selfie_storage_path,
  liveness_captured_at, manual_review_required, liveness_details,
  attempt_count, device_platform;

-- 3f. Remove the feature flag seed (optional — safe to leave)
DELETE FROM public.platform_config
WHERE key = 'identity_live_selfie_enabled';

COMMIT;
