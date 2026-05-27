-- Add policy for admins to read all provider documents
CREATE POLICY "Admins can read all provider documents"
ON public.provider_documents FOR SELECT
TO authenticated
USING (
  auth.jwt() ->> 'role' = 'admin'
);
