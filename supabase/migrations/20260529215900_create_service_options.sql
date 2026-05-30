-- ============================================================
-- MIGRATION: Create public.service_options table
-- Timestamp: 20260529215900 (deliberately before 20260529220500)
-- Reason: 20260529220500_provider_business_platform.sql references
--         public.service_options inside compute_provider_checklist().
--         This migration ensures the table exists before that function
--         is created, preventing the SQLSTATE 42P01 failure.
-- ============================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.service_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id UUID REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index
CREATE INDEX IF NOT EXISTS idx_service_options_service ON public.service_options(service_id);

-- 3. Enable RLS
ALTER TABLE public.service_options ENABLE ROW LEVEL SECURITY;

-- 4. Policies (idempotent)
DROP POLICY IF EXISTS "Service options public read" ON public.service_options;
CREATE POLICY "Service options public read"
  ON public.service_options FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service options provider insert" ON public.service_options;
CREATE POLICY "Service options provider insert"
  ON public.service_options FOR INSERT
  WITH CHECK (auth.uid() = (SELECT provider_id FROM public.services WHERE id = service_id));

DROP POLICY IF EXISTS "Service options provider update" ON public.service_options;
CREATE POLICY "Service options provider update"
  ON public.service_options FOR UPDATE
  USING (auth.uid() = (SELECT provider_id FROM public.services WHERE id = service_id));

DROP POLICY IF EXISTS "Service options provider delete" ON public.service_options;
CREATE POLICY "Service options provider delete"
  ON public.service_options FOR DELETE
  USING (auth.uid() = (SELECT provider_id FROM public.services WHERE id = service_id));
