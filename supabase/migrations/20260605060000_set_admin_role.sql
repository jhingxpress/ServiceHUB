-- Set jhingxpress@gmail.com as admin for beta testing
-- This is a data migration, not a schema change.

UPDATE public.users
SET role = 'admin',
    updated_at = now()
WHERE email = 'jhingxpress@gmail.com';
