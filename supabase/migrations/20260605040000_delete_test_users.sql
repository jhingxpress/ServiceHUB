-- ============================================================
-- Delete test users for re-testing
-- Date: 2026-06-05
-- ============================================================
--
-- IMPORTANT: auth.users is a protected system table.
-- Run this in the Supabase SQL Editor while connected as postgres
-- or service_role, OR delete users via Supabase Dashboard → Auth → Users.
--
-- These emails are being removed to allow fresh registration testing.
-- ============================================================

-- 1. Delete dependent profiles first (public.users)
--    This handles both CASCADE and non-CASCADE FK setups safely.
DELETE FROM public.users
WHERE email IN (
  'ymircorbz@gmail.com',
  'maereprtty2@gmail.com',
  'opnnetflix2020@gmail.com',
  'ymirasia037@gmail.com',
  'dsppo.plansopns.pnp@gmail.com',
  'corbetaraj@gmail.com',
  'corbetaeugenio@gmail.com',
  'amarykristen02@gmail.com',
  'amarykristen03@gmail.com',
  'amarykristen@gmail.com',
  'pristontalephp@gmail.com',
  'arnoldcorbeta1976@gmail.com'
);

-- 2. Delete from auth.users
--    NOTE: This requires elevated privileges. If this fails in the SQL Editor,
--    use the Supabase Dashboard → Auth → Users panel instead.
DELETE FROM auth.users
WHERE email IN (
  'ymircorbz@gmail.com',
  'maereprtty2@gmail.com',
  'opnnetflix2020@gmail.com',
  'ymirasia037@gmail.com',
  'dsppo.plansopns.pnp@gmail.com',
  'corbetaraj@gmail.com',
  'corbetaeugenio@gmail.com',
  'amarykristen02@gmail.com',
  'amarykristen03@gmail.com',
  'amarykristen@gmail.com',
  'pristontalephp@gmail.com',
  'arnoldcorbeta1976@gmail.com'
);
