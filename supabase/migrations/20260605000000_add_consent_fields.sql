-- ============================================================
-- ServiceHub Legal Consent & Compliance Migration
-- Date: 2026-06-05
-- ============================================================

-- Add consent tracking fields to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS accepted_privacy_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS accepted_terms_version TEXT;

-- Add consent tracking fields to providers table
ALTER TABLE public.providers
ADD COLUMN IF NOT EXISTS accepted_verification_policy_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS accepted_privacy_at TIMESTAMPTZ;

-- Add comment documentation for audit trail
COMMENT ON COLUMN public.users.accepted_terms_at IS 'Timestamp when user accepted Terms of Service';
COMMENT ON COLUMN public.users.accepted_privacy_at IS 'Timestamp when user accepted Privacy Policy';
COMMENT ON COLUMN public.users.accepted_terms_version IS 'Version of Terms accepted at registration (e.g. 1.0)';
COMMENT ON COLUMN public.providers.accepted_verification_policy_at IS 'Timestamp when provider accepted Verification Policy';
COMMENT ON COLUMN public.providers.accepted_terms_at IS 'Timestamp when provider accepted Terms of Service';
COMMENT ON COLUMN public.providers.accepted_privacy_at IS 'Timestamp when provider accepted Privacy Policy';
