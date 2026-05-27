-- Create provider_documents table with side column for front/back ID uploads
CREATE TABLE public.provider_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'valid_id', 'government_id',
    'barangay_clearance', 'business_permit',
    'dti_registration', 'bir_registration', 'tesda_certificate',
    'professional_cert', 'other_supporting'
  )),
  category_type TEXT NOT NULL DEFAULT 'permit_certificate'
    CHECK (category_type IN ('valid_id', 'permit_certificate')),
  id_type TEXT,
  side TEXT CHECK (side IN ('front', 'back')),
  file_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

-- Create index on provider_id for faster lookups
CREATE INDEX idx_provider_documents_provider_id ON public.provider_documents(provider_id);
CREATE INDEX idx_provider_documents_status ON public.provider_documents(status);
