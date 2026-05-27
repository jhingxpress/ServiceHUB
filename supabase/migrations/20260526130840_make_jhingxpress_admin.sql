-- Update jhingxpress@gmail.com to admin role
UPDATE public.users
SET role = 'admin'
WHERE email = 'jhingxpress@gmail.com';
