-- ============================================================
-- FIX: Expand provider_documents document_type CHECK constraint
-- Sprint 3.3.1 — 2026-06-15
--
-- Problem:
--   provider_documents_document_type_check was created in
--   20260526120946_add_side_to_provider_documents.sql with 9 allowed
--   values. Sprint 3.3 introduced selfie_with_id and 6 new permit
--   types (police_clearance, nbi_clearance, nc_certificate,
--   prc_license, sec_registration, employment_certificate) that are
--   not in the original constraint, causing CHECK violations on every
--   document upload for these new types.
--
-- Fix:
--   Drop the old constraint and recreate it with the complete list.
--   other_supporting is retained for backward compatibility with
--   existing production rows that used it before Sprint 3.3.
-- ============================================================

ALTER TABLE public.provider_documents
  DROP CONSTRAINT IF EXISTS provider_documents_document_type_check;

ALTER TABLE public.provider_documents
  ADD CONSTRAINT provider_documents_document_type_check
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
    -- Identity selfie (Sprint 3.3)
    'selfie_with_id',
    -- Legacy catch-all (retained for existing rows)
    'other_supporting'
  ));
