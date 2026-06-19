-- ============================================================
-- Migration: Fix servicehub_tips user_id NOT NULL contradiction
-- Date: 2026-06-19
-- ============================================================
--
-- Problem:
--   user_id was declared NOT NULL with ON DELETE SET NULL.
--   When a customer account is deleted, Postgres attempts to
--   SET user_id = NULL on their tip rows, but the NOT NULL
--   constraint rejects the write — causing the account DELETE
--   to fail entirely.
--
-- Fix:
--   Drop the NOT NULL constraint on user_id.
--   The foreign key and ON DELETE SET NULL behavior are preserved.
--   When a customer is deleted, user_id becomes NULL and the tip
--   row survives — keeping historical revenue intact.
--
-- Unchanged:
--   - FOREIGN KEY REFERENCES auth.users(id)
--   - ON DELETE SET NULL behavior
--   - amount, status, paid_at, paymongo_checkout_id columns
--   - All indexes
--   - All RLS policies
-- ============================================================

ALTER TABLE public.servicehub_tips
  ALTER COLUMN user_id DROP NOT NULL;
