-- ============================================================
-- TAGA Closed Beta Reset — Utility Function
-- Date: 2026-07-25
-- ============================================================
--
-- Creates a reusable, transactional SQL function that deletes
-- all non-admin user data while preserving the admin account
-- and all platform configuration / seed data.
--
-- The function is SECURITY DEFINER so it can be called via RPC
-- with the service_role key (bypassing RLS).
--
-- Usage:
--   SELECT public.run_beta_reset('<admin-uuid>'::uuid);
--
-- Returns JSONB with pre/post counts per table.
-- ============================================================

CREATE OR REPLACE FUNCTION public.run_beta_reset(p_admin_uuid UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts JSONB := '{}'::JSONB;
  v_deleted JSONB := '{}'::JSONB;
  v_post_counts JSONB := '{}'::JSONB;
  v_admin_email TEXT;
BEGIN
  -- ── Validate admin UUID ──────────────────────────────────
  -- Primary validation: auth.users (the authoritative source)
  SELECT email INTO v_admin_email FROM auth.users WHERE id = p_admin_uuid;
  IF v_admin_email IS NULL THEN
    RAISE EXCEPTION 'Admin UUID % not found in auth.users', p_admin_uuid;
  END IF;

  -- ── Capture pre-delete counts ────────────────────────────
  SELECT jsonb_build_object(
    'auth_users',            (SELECT COUNT(*) FROM auth.users),
    'public_users',          (SELECT COUNT(*) FROM public.users),
    'providers',             (SELECT COUNT(*) FROM public.providers),
    'services',              (SELECT COUNT(*) FROM public.services),
    'service_options',       (SELECT COUNT(*) FROM public.service_options),
    'service_images',        (SELECT COUNT(*) FROM public.service_images),
    'bookings',              (SELECT COUNT(*) FROM public.bookings),
    'booking_incident_reports',(SELECT COUNT(*) FROM public.booking_incident_reports),
    'provider_live_locations',(SELECT COUNT(*) FROM public.provider_live_locations),
    'reviews',               (SELECT COUNT(*) FROM public.reviews),
    'review_media',          (SELECT COUNT(*) FROM public.review_media),
    'messages',              (SELECT COUNT(*) FROM public.messages),
    'payments',              (SELECT COUNT(*) FROM public.payments),
    'disputes',              (SELECT COUNT(*) FROM public.disputes),
    'reports',               (SELECT COUNT(*) FROM public.reports),
    'notifications',         (SELECT COUNT(*) FROM public.notifications),
    'favorite_providers',    (SELECT COUNT(*) FROM public.favorite_providers),
    'user_push_tokens',      (SELECT COUNT(*) FROM public.user_push_tokens),
    'saved_locations',       (SELECT COUNT(*) FROM public.saved_locations),
    'servicehub_tips',       (SELECT COUNT(*) FROM public.servicehub_tips),
    'provider_documents',    (SELECT COUNT(*) FROM public.provider_documents),
    'provider_gallery',      (SELECT COUNT(*) FROM public.provider_gallery),
    'provider_portfolio',    (SELECT COUNT(*) FROM public.provider_portfolio),
    'provider_badges',       (SELECT COUNT(*) FROM public.provider_badges),
    'provider_stats',        (SELECT COUNT(*) FROM public.provider_stats),
    'provider_verification_logs',(SELECT COUNT(*) FROM public.provider_verification_logs),
    'provider_views',        (SELECT COUNT(*) FROM public.provider_views),
    'provider_performance',  (SELECT COUNT(*) FROM public.provider_performance),
    'provider_score',        (SELECT COUNT(*) FROM public.provider_score),
    'provider_analytics',    (SELECT COUNT(*) FROM public.provider_analytics),
    'provider_checklist',    (SELECT COUNT(*) FROM public.provider_checklist),
    'availability',          (SELECT COUNT(*) FROM public.availability),
    'provider_categories',   (SELECT COUNT(*) FROM public.provider_categories),
    'featured_requests',     (SELECT COUNT(*) FROM public.featured_requests),
    'featured_payments',     (SELECT COUNT(*) FROM public.featured_payments),
    'provider_platform_fees',(SELECT COUNT(*) FROM public.provider_platform_fees),
    'platform_fee_payments', (SELECT COUNT(*) FROM public.platform_fee_payments),
    'staff_action_log',      (SELECT COUNT(*) FROM public.staff_action_log),
    'escalations',           (SELECT COUNT(*) FROM public.escalations),
    'moderation_log',        (SELECT COUNT(*) FROM public.moderation_log),
    'rate_limits',           (SELECT COUNT(*) FROM public.rate_limits)
  ) INTO v_counts;

  -- ── Phase 1: Handle RESTRICT constraints ─────────────────
  -- provider_platform_fees.booking_id has ON DELETE RESTRICT
  -- Must delete fees BEFORE deleting bookings

  DELETE FROM public.platform_fee_payments
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.provider_platform_fees
  WHERE provider_id != p_admin_uuid;

  -- ── Phase 2: Handle NO ACTION references ──────────────────
  -- booking_incident_reports.reviewed_by has no ON DELETE clause
  -- (defaults to NO ACTION) — must NULL it before deleting users

  UPDATE public.booking_incident_reports
  SET reviewed_by = NULL
  WHERE reviewed_by IS NOT NULL AND reviewed_by != p_admin_uuid;

  -- ── Phase 3: Delete booking-related data (bottom-up) ─────

  DELETE FROM public.booking_incident_reports
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.provider_live_locations
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.review_media
  WHERE review_id IN (
    SELECT id FROM public.reviews
    WHERE customer_id != p_admin_uuid OR provider_id != p_admin_uuid
  );

  DELETE FROM public.reviews
  WHERE customer_id != p_admin_uuid OR provider_id != p_admin_uuid;

  DELETE FROM public.messages
  WHERE sender_id != p_admin_uuid OR receiver_id != p_admin_uuid;

  DELETE FROM public.payments
  WHERE customer_id != p_admin_uuid OR provider_id != p_admin_uuid;

  DELETE FROM public.disputes
  WHERE raised_by != p_admin_uuid;

  DELETE FROM public.reports
  WHERE COALESCE(reporter_id, '00000000-0000-0000-0000-000000000000'::uuid) != p_admin_uuid
    AND COALESCE(reported_user_id, '00000000-0000-0000-0000-000000000000'::uuid) != p_admin_uuid;

  DELETE FROM public.bookings
  WHERE customer_id != p_admin_uuid OR provider_id != p_admin_uuid;

  -- ── Phase 4: Delete provider-related data (bottom-up) ────

  DELETE FROM public.service_images
  WHERE service_id IN (
    SELECT id FROM public.services WHERE provider_id != p_admin_uuid
  );

  DELETE FROM public.service_options
  WHERE service_id IN (
    SELECT id FROM public.services WHERE provider_id != p_admin_uuid
  );

  DELETE FROM public.services
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.provider_views
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.provider_performance
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.provider_score
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.provider_analytics
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.provider_checklist
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.provider_portfolio
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.provider_gallery
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.provider_documents
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.provider_badges
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.provider_stats
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.provider_verification_logs
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.availability
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.featured_payments
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.featured_requests
  WHERE provider_id != p_admin_uuid;

  DELETE FROM public.provider_categories
  WHERE provider_id != p_admin_uuid;

  -- ── Phase 5: Delete user-related data ────────────────────

  DELETE FROM public.notifications
  WHERE user_id != p_admin_uuid;

  DELETE FROM public.favorite_providers
  WHERE customer_id != p_admin_uuid OR provider_id != p_admin_uuid;

  DELETE FROM public.saved_locations
  WHERE customer_id != p_admin_uuid;

  DELETE FROM public.user_push_tokens
  WHERE user_id != p_admin_uuid;

  DELETE FROM public.servicehub_tips
  WHERE user_id IS NOT NULL AND user_id != p_admin_uuid;

  DELETE FROM public.staff_action_log
  WHERE staff_id != p_admin_uuid;

  DELETE FROM public.escalations
  WHERE created_by != p_admin_uuid;

  -- ── Phase 5b: Clean FK-blocking tables ───────────────────
  -- moderation_log: admin_id and target_user_id reference auth.users(id) with NO ACTION
  -- rate_limits: user_id references auth.users(id) ON DELETE CASCADE
  -- Both must be cleaned before auth.users deletion to avoid FK violations

  DELETE FROM public.moderation_log
  WHERE admin_id != p_admin_uuid
     OR (target_user_id IS NOT NULL AND target_user_id != p_admin_uuid);

  -- NULL out remaining rows where admin_id = admin but target_user_id is non-admin
  UPDATE public.moderation_log
  SET target_user_id = NULL
  WHERE target_user_id IS NOT NULL AND target_user_id != p_admin_uuid;

  DELETE FROM public.rate_limits
  WHERE user_id != p_admin_uuid;

  -- ── Phase 6: Delete core user records ────────────────────
  -- (auth.users is handled separately via Auth Admin API)

  DELETE FROM public.providers
  WHERE id != p_admin_uuid;

  DELETE FROM public.users
  WHERE id != p_admin_uuid;

  -- ── Capture post-delete counts ───────────────────────────
  SELECT jsonb_build_object(
    'auth_users',            (SELECT COUNT(*) FROM auth.users),
    'public_users',          (SELECT COUNT(*) FROM public.users),
    'providers',             (SELECT COUNT(*) FROM public.providers),
    'services',              (SELECT COUNT(*) FROM public.services),
    'service_options',       (SELECT COUNT(*) FROM public.service_options),
    'service_images',        (SELECT COUNT(*) FROM public.service_images),
    'bookings',              (SELECT COUNT(*) FROM public.bookings),
    'booking_incident_reports',(SELECT COUNT(*) FROM public.booking_incident_reports),
    'provider_live_locations',(SELECT COUNT(*) FROM public.provider_live_locations),
    'reviews',               (SELECT COUNT(*) FROM public.reviews),
    'review_media',          (SELECT COUNT(*) FROM public.review_media),
    'messages',              (SELECT COUNT(*) FROM public.messages),
    'payments',              (SELECT COUNT(*) FROM public.payments),
    'disputes',              (SELECT COUNT(*) FROM public.disputes),
    'reports',               (SELECT COUNT(*) FROM public.reports),
    'notifications',         (SELECT COUNT(*) FROM public.notifications),
    'favorite_providers',    (SELECT COUNT(*) FROM public.favorite_providers),
    'user_push_tokens',      (SELECT COUNT(*) FROM public.user_push_tokens),
    'saved_locations',       (SELECT COUNT(*) FROM public.saved_locations),
    'servicehub_tips',       (SELECT COUNT(*) FROM public.servicehub_tips),
    'provider_documents',    (SELECT COUNT(*) FROM public.provider_documents),
    'provider_gallery',      (SELECT COUNT(*) FROM public.provider_gallery),
    'provider_portfolio',    (SELECT COUNT(*) FROM public.provider_portfolio),
    'provider_badges',       (SELECT COUNT(*) FROM public.provider_badges),
    'provider_stats',        (SELECT COUNT(*) FROM public.provider_stats),
    'provider_verification_logs',(SELECT COUNT(*) FROM public.provider_verification_logs),
    'provider_views',        (SELECT COUNT(*) FROM public.provider_views),
    'provider_performance',  (SELECT COUNT(*) FROM public.provider_performance),
    'provider_score',        (SELECT COUNT(*) FROM public.provider_score),
    'provider_analytics',    (SELECT COUNT(*) FROM public.provider_analytics),
    'provider_checklist',    (SELECT COUNT(*) FROM public.provider_checklist),
    'availability',          (SELECT COUNT(*) FROM public.availability),
    'provider_categories',   (SELECT COUNT(*) FROM public.provider_categories),
    'featured_requests',     (SELECT COUNT(*) FROM public.featured_requests),
    'featured_payments',     (SELECT COUNT(*) FROM public.featured_payments),
    'provider_platform_fees',(SELECT COUNT(*) FROM public.provider_platform_fees),
    'platform_fee_payments', (SELECT COUNT(*) FROM public.platform_fee_payments),
    'staff_action_log',      (SELECT COUNT(*) FROM public.staff_action_log),
    'escalations',           (SELECT COUNT(*) FROM public.escalations),
    'moderation_log',        (SELECT COUNT(*) FROM public.moderation_log),
    'rate_limits',           (SELECT COUNT(*) FROM public.rate_limits)
  ) INTO v_post_counts;

  -- ── Compute deleted counts ───────────────────────────────
  SELECT jsonb_build_object(
    'public_users',          (v_counts->>'public_users')::int - (v_post_counts->>'public_users')::int,
    'providers',             (v_counts->>'providers')::int - (v_post_counts->>'providers')::int,
    'services',              (v_counts->>'services')::int - (v_post_counts->>'services')::int,
    'service_options',       (v_counts->>'service_options')::int - (v_post_counts->>'service_options')::int,
    'service_images',        (v_counts->>'service_images')::int - (v_post_counts->>'service_images')::int,
    'bookings',              (v_counts->>'bookings')::int - (v_post_counts->>'bookings')::int,
    'booking_incident_reports',(v_counts->>'booking_incident_reports')::int - (v_post_counts->>'booking_incident_reports')::int,
    'provider_live_locations',(v_counts->>'provider_live_locations')::int - (v_post_counts->>'provider_live_locations')::int,
    'reviews',               (v_counts->>'reviews')::int - (v_post_counts->>'reviews')::int,
    'review_media',          (v_counts->>'review_media')::int - (v_post_counts->>'review_media')::int,
    'messages',              (v_counts->>'messages')::int - (v_post_counts->>'messages')::int,
    'payments',              (v_counts->>'payments')::int - (v_post_counts->>'payments')::int,
    'disputes',              (v_counts->>'disputes')::int - (v_post_counts->>'disputes')::int,
    'reports',               (v_counts->>'reports')::int - (v_post_counts->>'reports')::int,
    'notifications',         (v_counts->>'notifications')::int - (v_post_counts->>'notifications')::int,
    'favorite_providers',    (v_counts->>'favorite_providers')::int - (v_post_counts->>'favorite_providers')::int,
    'user_push_tokens',      (v_counts->>'user_push_tokens')::int - (v_post_counts->>'user_push_tokens')::int,
    'saved_locations',       (v_counts->>'saved_locations')::int - (v_post_counts->>'saved_locations')::int,
    'servicehub_tips',       (v_counts->>'servicehub_tips')::int - (v_post_counts->>'servicehub_tips')::int,
    'provider_documents',    (v_counts->>'provider_documents')::int - (v_post_counts->>'provider_documents')::int,
    'provider_gallery',      (v_counts->>'provider_gallery')::int - (v_post_counts->>'provider_gallery')::int,
    'provider_portfolio',    (v_counts->>'provider_portfolio')::int - (v_post_counts->>'provider_portfolio')::int,
    'provider_badges',       (v_counts->>'provider_badges')::int - (v_post_counts->>'provider_badges')::int,
    'provider_stats',        (v_counts->>'provider_stats')::int - (v_post_counts->>'provider_stats')::int,
    'provider_verification_logs',(v_counts->>'provider_verification_logs')::int - (v_post_counts->>'provider_verification_logs')::int,
    'provider_views',        (v_counts->>'provider_views')::int - (v_post_counts->>'provider_views')::int,
    'provider_performance',  (v_counts->>'provider_performance')::int - (v_post_counts->>'provider_performance')::int,
    'provider_score',        (v_counts->>'provider_score')::int - (v_post_counts->>'provider_score')::int,
    'provider_analytics',    (v_counts->>'provider_analytics')::int - (v_post_counts->>'provider_analytics')::int,
    'provider_checklist',    (v_counts->>'provider_checklist')::int - (v_post_counts->>'provider_checklist')::int,
    'availability',          (v_counts->>'availability')::int - (v_post_counts->>'availability')::int,
    'provider_categories',   (v_counts->>'provider_categories')::int - (v_post_counts->>'provider_categories')::int,
    'featured_requests',     (v_counts->>'featured_requests')::int - (v_post_counts->>'featured_requests')::int,
    'featured_payments',     (v_counts->>'featured_payments')::int - (v_post_counts->>'featured_payments')::int,
    'provider_platform_fees',(v_counts->>'provider_platform_fees')::int - (v_post_counts->>'provider_platform_fees')::int,
    'platform_fee_payments', (v_counts->>'platform_fee_payments')::int - (v_post_counts->>'platform_fee_payments')::int,
    'staff_action_log',      (v_counts->>'staff_action_log')::int - (v_post_counts->>'staff_action_log')::int,
    'escalations',           (v_counts->>'escalations')::int - (v_post_counts->>'escalations')::int,
    'moderation_log',        (v_counts->>'moderation_log')::int - (v_post_counts->>'moderation_log')::int,
    'rate_limits',           (v_counts->>'rate_limits')::int - (v_post_counts->>'rate_limits')::int
  ) INTO v_deleted;

  -- ── Return summary ───────────────────────────────────────
  RETURN jsonb_build_object(
    'admin_uuid',     p_admin_uuid,
    'admin_email',    v_admin_email,
    'pre_counts',     v_counts,
    'deleted_counts', v_deleted,
    'post_counts',    v_post_counts,
    'status',         'success'
  );
END;
$$;

-- Grant execute only to service_role (used by beta-reset script).
-- Do NOT grant to authenticated or anon — this function deletes all non-admin data.
REVOKE EXECUTE ON FUNCTION public.run_beta_reset(UUID) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.run_beta_reset(UUID) TO service_role;
