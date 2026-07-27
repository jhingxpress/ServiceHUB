-- ============================================================
-- Phase 2C Migration Test Script
--
-- This script simulates the migration against test data to verify
-- correctness. Run in an isolated database or Supabase SQL Editor
-- against a test/branch database — NOT against production.
--
-- Test data: one valid_id, one police_clearance, one selfie_with_id
-- Expected result after migrations:
--   - valid_id unchanged
--   - police_clearance unchanged
--   - selfie_with_id becomes verification_selfie
--   - verification_mode becomes legacy_manual
--   - no data loss
-- ============================================================

-- ============================================================
-- §A. SETUP — Create test table and seed data
-- ============================================================

-- Create a test table mimicking the production schema
-- (includes all columns from original migration + Sprint 3.3 fix)
DROP TABLE IF EXISTS test_provider_documents;
DROP TABLE IF EXISTS test_platform_config;

CREATE TABLE test_platform_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE test_provider_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'valid_id', 'government_id',
    'barangay_clearance', 'police_clearance', 'nbi_clearance',
    'business_permit', 'dti_registration', 'bir_registration',
    'sec_registration', 'tesda_certificate', 'nc_certificate',
    'prc_license', 'employment_certificate',
    'professional_cert', 'selfie_with_id', 'other_supporting'
  )),
  category_type TEXT NOT NULL DEFAULT 'permit_certificate'
    CHECK (category_type IN ('valid_id', 'permit_certificate')),
  id_type TEXT,
  side TEXT CHECK (side IN ('front', 'back')),
  file_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

-- Seed test data
INSERT INTO test_provider_documents (provider_id, document_type, category_type, file_url, status, side) VALUES
  ('test-provider-1', 'valid_id', 'valid_id', 'test-provider-1/valid_id_front.jpg', 'approved', 'front'),
  ('test-provider-1', 'police_clearance', 'permit_certificate', 'test-provider-1/police_clearance.pdf', 'pending', NULL),
  ('test-provider-1', 'selfie_with_id', 'valid_id', 'test-provider-1/selfie_with_id_123.jpg', 'pending', NULL);

-- ============================================================
-- §B. PRE-MIGRATION SNAPSHOT
-- ============================================================

-- Snapshot before migration
SELECT '=== PRE-MIGRATION ===' AS phase;

SELECT 'before_row_count' AS check_name, COUNT(*) AS value
FROM test_provider_documents;

SELECT 'before_selfie_with_id' AS check_name, COUNT(*) AS value
FROM test_provider_documents
WHERE document_type = 'selfie_with_id';

SELECT 'before_valid_id' AS check_name, COUNT(*) AS value
FROM test_provider_documents
WHERE document_type = 'valid_id';

SELECT 'before_police_clearance' AS check_name, COUNT(*) AS value
FROM test_provider_documents
WHERE document_type = 'police_clearance';

-- Snapshot file_url for selfie row (to verify it's preserved)
SELECT 'before_selfie_file_url' AS check_name, file_url AS value
FROM test_provider_documents
WHERE document_type = 'selfie_with_id';

-- Snapshot status for selfie row
SELECT 'before_selfie_status' AS check_name, status AS value
FROM test_provider_documents
WHERE document_type = 'selfie_with_id';

-- ============================================================
-- §C. APPLY MIGRATION 2B (adapted for test table)
-- ============================================================

-- Add liveness columns
ALTER TABLE test_provider_documents
  ADD COLUMN IF NOT EXISTS liveness_status TEXT
    CHECK (liveness_status IS NULL OR liveness_status IN ('passed', 'manual_review', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS blink_detected BOOLEAN,
  ADD COLUMN IF NOT EXISTS left_turn_detected BOOLEAN,
  ADD COLUMN IF NOT EXISTS right_turn_detected BOOLEAN,
  ADD COLUMN IF NOT EXISTS capture_quality_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS best_selfie_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS liveness_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_review_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS liveness_details JSONB,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS device_platform TEXT;

-- Seed feature flag
INSERT INTO test_platform_config (key, value)
VALUES ('identity_live_selfie_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- §D. APPLY MIGRATION 2C (adapted for test table)
-- ============================================================

-- Add verification_mode
ALTER TABLE test_provider_documents
  ADD COLUMN IF NOT EXISTS verification_mode TEXT
    CHECK (verification_mode IS NULL OR verification_mode IN ('legacy_manual', 'live_liveness', 'manual_review'));

-- Rename selfie_with_id → verification_selfie
UPDATE test_provider_documents
SET document_type = 'verification_selfie'
WHERE document_type = 'selfie_with_id';

-- Backfill verification_mode
UPDATE test_provider_documents
SET verification_mode = 'legacy_manual'
WHERE document_type = 'verification_selfie'
  AND verification_mode IS NULL;

-- Update CHECK constraint
ALTER TABLE test_provider_documents DROP CONSTRAINT IF EXISTS test_provider_documents_document_type_check;
ALTER TABLE test_provider_documents ADD CONSTRAINT test_provider_documents_document_type_check
  CHECK (document_type IN (
    'valid_id', 'government_id',
    'barangay_clearance', 'police_clearance', 'nbi_clearance',
    'business_permit', 'dti_registration', 'bir_registration',
    'sec_registration', 'tesda_certificate', 'nc_certificate',
    'prc_license', 'employment_certificate',
    'professional_cert', 'verification_selfie', 'other_supporting'
  ));

-- ============================================================
-- §E. POST-MIGRATION VERIFICATION
-- ============================================================

SELECT '=== POST-MIGRATION ===' AS phase;

-- Total row count unchanged
SELECT 'after_row_count' AS check_name, COUNT(*) AS value
FROM test_provider_documents;
-- Expected: 3

-- No selfie_with_id rows remain
SELECT 'after_selfie_with_id' AS check_name, COUNT(*) AS value
FROM test_provider_documents
WHERE document_type = 'selfie_with_id';
-- Expected: 0

-- verification_selfie exists with correct mode
SELECT 'after_verification_selfie' AS check_name, COUNT(*) AS value
FROM test_provider_documents
WHERE document_type = 'verification_selfie' AND verification_mode = 'legacy_manual';
-- Expected: 1

-- valid_id unchanged
SELECT 'after_valid_id' AS check_name, COUNT(*) AS value
FROM test_provider_documents
WHERE document_type = 'valid_id';
-- Expected: 1

-- police_clearance unchanged
SELECT 'after_police_clearance' AS check_name, COUNT(*) AS value
FROM test_provider_documents
WHERE document_type = 'police_clearance';
-- Expected: 1

-- file_url preserved for migrated row
SELECT 'after_selfie_file_url' AS check_name, file_url AS value
FROM test_provider_documents
WHERE document_type = 'verification_selfie';
-- Expected: test-provider-1/selfie_with_id_123.jpg

-- status preserved for migrated row
SELECT 'after_selfie_status' AS check_name, status AS value
FROM test_provider_documents
WHERE document_type = 'verification_selfie';
-- Expected: pending

-- verification_mode for non-selfie rows is NULL
SELECT 'after_valid_id_mode' AS check_name, verification_mode AS value
FROM test_provider_documents
WHERE document_type = 'valid_id';
-- Expected: NULL

-- Feature flag is false
SELECT 'after_feature_flag' AS check_name, value AS value
FROM test_platform_config
WHERE key = 'identity_live_selfie_enabled';
-- Expected: false

-- All document types in final state
SELECT document_type, verification_mode, status, file_url
FROM test_provider_documents
ORDER BY document_type;

-- ============================================================
-- §F. CLEANUP
-- ============================================================

DROP TABLE IF EXISTS test_provider_documents;
DROP TABLE IF EXISTS test_platform_config;
