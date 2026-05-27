-- Create provider_verification_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.provider_verification_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add policy for admins to update providers
CREATE POLICY "Admins can update providers"
ON public.providers FOR UPDATE
TO authenticated
USING (
  auth.jwt() ->> 'role' = 'admin'
);

-- Add policy for admins to insert verification logs
CREATE POLICY "Admins can insert verification logs"
ON public.provider_verification_logs FOR INSERT
TO authenticated
WITH CHECK (
  auth.jwt() ->> 'role' = 'admin'
);
