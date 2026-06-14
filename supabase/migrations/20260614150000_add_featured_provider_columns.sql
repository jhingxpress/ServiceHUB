-- ============================================================
-- Migration: Add Featured Provider Columns
-- Date: 2026-06-14
-- ============================================================

-- Add is_featured flag and featured_until expiry to providers table
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.providers.is_featured IS 'Whether this provider is currently featured/promoted on the platform';
COMMENT ON COLUMN public.providers.featured_until IS 'Expiry date for featured status. If null and is_featured=true, feature is permanent until manually disabled.';
