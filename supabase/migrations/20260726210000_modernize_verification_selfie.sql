-- ============================================================
-- Phase 2C: Modernize verification selfie
--
-- 1. Add 'verification_mode' column (legacy_manual, live_liveness, manual_review)
-- 2. Rename document_type 'selfie_with_id' → 'verification_selfie' (in-place)
-- 3. Backfill verification_mode for existing rows
-- 4. Update document_type CHECK to consolidate all allowed types
--
-- All changes are additive. No destructive migration.
-- Old records with document_type='selfie_with_id' are renamed in-place.
-- Old records get verification_mode='legacy_manual'.
-- No rows are deleted. No statuses, paths, IDs, or audit history change.
--
-- This migration also consolidates the document_type CHECK constraint
-- to include ALL types from the 20260615120000 fix plus verification_selfie,
-- and removes the dev-only 'selfie_liveness' that was never used in production.
--
-- Rollback:
--   UPDATE provider_documents SET document_type='selfie_with_id'
--     WHERE document_type='verification_selfie';
--   ALTER TABLE public.provider_documents DROP COLUMN IF EXISTS verification_mode;
--   (re-add old CHECK constraint with selfie_with_id and all Sprint 3.3 types)
-- ============================================================

BEGIN;

-- 1. Add verification_mode column (nullable, additive)
ALTER TABLE public.provider_documents
  ADD COLUMN IF NOT EXISTS verification_mode TEXT
    CHECK (verification_mode IS NULL OR verification_mode IN ('legacy_manual', 'live_liveness', 'manual_review'));

-- 2. Transition CHECK: allow BOTH selfie_with_id AND verification_selfie
--    This lets us rename rows without violating the constraint.
ALTER TABLE public.provider_documents DROP CONSTRAINT IF EXISTS provider_documents_document_type_check;
ALTER TABLE public.provider_documents ADD CONSTRAINT provider_documents_document_type_check
  CHECK (document_type IN (
    'valid_id', 'government_id',
    'barangay_clearance', 'police_clearance', 'nbi_clearance',
    'business_permit', 'dti_registration', 'bir_registration',
    'sec_registration', 'tesda_certificate', 'nc_certificate',
    'prc_license', 'employment_certificate',
    'professional_cert',
    'selfie_with_id',
    'verification_selfie',
    'other_supporting'
  ));

-- 3. Rename existing selfie_with_id rows to verification_selfie (in-place, no delete)
UPDATE public.provider_documents
SET document_type = 'verification_selfie'
WHERE document_type = 'selfie_with_id';

-- 4. Backfill: set verification_mode for existing verification_selfie rows
UPDATE public.provider_documents
SET verification_mode = 'legacy_manual'
WHERE document_type = 'verification_selfie'
  AND verification_mode IS NULL;

-- 5. Final CHECK: remove selfie_with_id (no longer used) and selfie_liveness (dev-only)
--    Preserve ALL types from 20260615120000 fix
ALTER TABLE public.provider_documents DROP CONSTRAINT IF EXISTS provider_documents_document_type_check;
ALTER TABLE public.provider_documents ADD CONSTRAINT provider_documents_document_type_check
  CHECK (document_type IN (
    -- Government / valid ID types
    'valid_id',
    'government_id',
    -- Barangay / police / NBI clearances
    'barangay_clearance',
    'police_clearance',
    'nbi_clearance',
    -- Business registration documents
    'business_permit',
    'dti_registration',
    'bir_registration',
    'sec_registration',
    -- Technical / professional certifications
    'tesda_certificate',
    'nc_certificate',
    'prc_license',
    -- Employment & professional documents
    'employment_certificate',
    'professional_cert',
    -- Verification selfie (replaces selfie_with_id)
    'verification_selfie',
    -- Legacy catch-all (retained for existing rows)
    'other_supporting'
  ));

COMMIT;
