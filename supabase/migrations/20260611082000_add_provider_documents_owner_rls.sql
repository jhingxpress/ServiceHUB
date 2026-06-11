-- ============================================================
-- Add missing provider_documents owner RLS policies
-- Confirmed live DB only had admin SELECT policy.
-- These 4 owner policies were defined in schema.sql but never
-- migrated, so they were missing in the live database.
-- ============================================================

-- Provider can read their own documents
DROP POLICY IF EXISTS "Provider docs read own" ON public.provider_documents;
CREATE POLICY "Provider docs read own" ON public.provider_documents
  FOR SELECT USING (auth.uid() = provider_id);

-- Provider can insert their own documents
DROP POLICY IF EXISTS "Provider docs insert own" ON public.provider_documents;
CREATE POLICY "Provider docs insert own" ON public.provider_documents
  FOR INSERT WITH CHECK (auth.uid() = provider_id);

-- Provider can update their own documents
DROP POLICY IF EXISTS "Provider docs update own" ON public.provider_documents;
CREATE POLICY "Provider docs update own" ON public.provider_documents
  FOR UPDATE USING (auth.uid() = provider_id);

-- Provider can delete their own documents
DROP POLICY IF EXISTS "Provider docs delete own" ON public.provider_documents;
CREATE POLICY "Provider docs delete own" ON public.provider_documents
  FOR DELETE USING (auth.uid() = provider_id);
