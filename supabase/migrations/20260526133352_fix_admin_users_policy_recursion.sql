-- Drop the recursive policy that causes infinite recursion
DROP POLICY IF EXISTS "Admins can read all users" ON public.users;

-- Create a new policy that checks admin role from auth.user metadata
-- This avoids recursion by not querying the users table
CREATE POLICY "Admins can read all users"
ON public.users FOR SELECT
TO authenticated
USING (
  auth.jwt() ->> 'role' = 'admin'
);