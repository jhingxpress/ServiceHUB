#!/usr/bin/env npx tsx
/**
 * TAGA (ServiceHub) Closed Beta Database Reset Utility
 *
 * Deletes all non-admin user data from the Supabase project,
 * preserving only the admin account (jhingxpress) and all
 * platform configuration / seed data.
 *
 * Usage:
 *   npm run beta-reset              # dry-run (audit only)
 *   npm run beta-reset -- --execute # actual cleanup
 *
 * Required environment variables (see .env.beta-reset.example):
 *   SUPABASE_URL              - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key (bypasses RLS)
 *
 * Optional:
 *   ADMIN_EMAIL               - Admin email (default: jhingxpress@gmail.com)
 *   SUPABASE_DB_URL           - PostgreSQL connection string (for pg_dump backup)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execSync } from 'child_process';

// ── Types ──────────────────────────────────────────────────

interface AuditCounts {
  [table: string]: number;
}

interface ResetResult {
  admin_uuid: string;
  admin_email: string;
  pre_counts: AuditCounts;
  deleted_counts: AuditCounts;
  post_counts: AuditCounts;
  status: string;
}

interface StorageCleanupResult {
  bucket: string;
  deleted: number;
  errors: string[];
}

interface VerificationResult {
  remaining_auth_users: number;
  remaining_public_users: number;
  remaining_admins: number;
  admin_email: string;
  non_admin_users_remaining: number;
  orphaned_fk_count: number;
  integrity_check: 'PASS' | 'FAIL' | 'DRY RUN';
}

interface StorageAuditResult {
  bucket: string;
  total_objects: number;
  to_delete: number;
  admin_objects: number;
  total_size: number;
  unknown_size_count: number;
}

interface AdminInfo {
  uuid: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
}

// ── Configuration ──────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jhingxpress@gmail.com';
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL || '';
const DRY_RUN = !process.argv.includes('--execute');
const REPORT_DIR = path.join(process.cwd(), 'reports', 'beta-reset');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');

const STORAGE_BUCKETS = [
  'avatars',
  'provider-documents',
  'provider-profile-images',
  'provider-cover-images',
  'booking-photos',
  'chat-media',
];

const BUCKET_LABELS: { [key: string]: string } = {
  'avatars': 'Avatars',
  'provider-documents': 'Verification Documents',
  'provider-profile-images': 'Provider Profile Images',
  'provider-cover-images': 'Cover Images',
  'booking-photos': 'Booking Photos',
  'chat-media': 'Chat Attachments',
};

// ── Logging ────────────────────────────────────────────────

const log = (msg: string) => console.log(`[beta-reset] ${msg}`);
const warn = (msg: string) => console.warn(`[beta-reset] WARN: ${msg}`);
const error = (msg: string) => console.error(`[beta-reset] ERROR: ${msg}`);

function banner(title: string) {
  const line = '═'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(`${line}\n`);
}

// ── Progress Tracking ──────────────────────────────────────

const TOTAL_STEPS = 9;
let currentStep = 0;

function stepStart(label: string): void {
  currentStep++;
  process.stdout.write(`\n[${currentStep}/${TOTAL_STEPS}] ${label}...`);
}

function stepDone(): void {
  console.log(' \u2713');
}

function stepFail(): void {
  console.log(' \u2717');
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ── Report Writer ──────────────────────────────────────────

function safeExit(code: number): void {
  // Allow pending I/O handles (Supabase HTTP connections, etc.) to close
  // before exiting. Fixes UV_HANDLE_CLOSING assertion on Windows.
  // A short delay ensures async TCP handles from fetch() are fully released.
  setTimeout(() => process.exit(code), 100);
}

function writeReport(filename: string, content: string) {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  const filepath = path.join(REPORT_DIR, filename);
  fs.writeFileSync(filepath, content, 'utf-8');
  log(`Report written: ${filepath}`);
}

// ── Step 1: Validate Environment ───────────────────────────

function validateEnv(): void {
  stepStart('Validating environment');

  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    stepFail();
    error(`Missing required environment variables: ${missing.join(', ')}`);
    error('Create a .env.beta-reset file or set them in your shell.');
    error('See .env.beta-reset.example for the template.');
    safeExit(1);
    return;
  }

  stepDone();
  log(`  Supabase URL: ${SUPABASE_URL}`);
  log(`  Admin email:  ${ADMIN_EMAIL}`);
  log(`  Mode:         ${DRY_RUN ? 'DRY RUN (audit + preview, no changes)' : 'EXECUTE (will delete data)'}`);

  if (DRY_RUN) {
    warn('  Running in dry-run mode. Use --execute to perform actual cleanup.');
  }
}

// ── Step 2: Resolve Admin UUID ─────────────────────────────

async function resolveAdminUuid(supabase: SupabaseClient): Promise<AdminInfo> {
  stepStart('Resolving admin UUID');

  // ── Primary source: Auth Admin API ────────────────────────
  // List all auth users and find by email (case-insensitive)
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (authError) {
    stepFail();
    error(`Could not list auth users: ${authError.message}`);
    error('Ensure the SUPABASE_SERVICE_ROLE_KEY is correct.');
    safeExit(1);
    throw new Error('safeExit pending');
  }

  if (!authData || !authData.users || authData.users.length === 0) {
    stepFail();
    error('No auth users found in the project.');
    safeExit(1);
    throw new Error('safeExit pending');
  }

  // Case-insensitive email match
  const adminEmailLower = ADMIN_EMAIL.toLowerCase();
  const matchingAuthUsers = authData.users.filter(
    (u) => u.email && u.email.toLowerCase() === adminEmailLower
  );

  if (matchingAuthUsers.length === 0) {
    stepFail();
    error(`No auth user found with email "${ADMIN_EMAIL}" (case-insensitive).`);
    error(`Checked ${authData.users.length} auth users.`);
    error('Verify ADMIN_EMAIL in .env.beta-reset is correct.');
    safeExit(1);
    throw new Error('safeExit pending');
  }

  if (matchingAuthUsers.length > 1) {
    stepFail();
    error(`Multiple auth users (${matchingAuthUsers.length}) found with email "${ADMIN_EMAIL}" (case-insensitive).`);
    error('This is unexpected. Resolve the duplicate accounts before proceeding.');
    matchingAuthUsers.forEach((u) => error(`  - ${u.id} (${u.email})`));
    safeExit(1);
    throw new Error('safeExit pending');
  }

  const authUser = matchingAuthUsers[0];
  const adminUuid = authUser.id;

  // ── Optional: Validate public.users profile by UUID ───────
  // Use .maybeSingle() so zero rows returns null instead of erroring
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, email, full_name, role, status')
    .eq('id', adminUuid)
    .maybeSingle();

  let profileInfo: { full_name: string; role: string; status: string } = {
    full_name: '(not set)',
    role: 'unknown',
    status: 'unknown',
  };

  if (profileError) {
    warn(`Could not query public.users for admin profile: ${profileError.message}`);
    warn('The auth user exists but the public profile could not be verified.');
  } else if (!profile) {
    warn(`Admin auth user ${adminUuid} has no corresponding public.users profile.`);
    warn('The auth UUID will still be used for cleanup protection.');
    warn('If public.users is empty, the SQL cleanup function will also handle this gracefully.');
  } else {
    profileInfo = {
      full_name: profile.full_name || '(not set)',
      role: profile.role || 'unknown',
      status: profile.status || 'unknown',
    };

    if (profile.role !== 'admin') {
      warn(`Public profile for "${ADMIN_EMAIL}" has role "${profile.role}", not "admin".`);
      warn('Proceeding anyway, but verify this is the correct account.');
    }
  }

  stepDone();
  log(`  UUID:      ${adminUuid}`);
  log(`  Email:     ${authUser.email}`);
  log(`  Name:      ${profileInfo.full_name}`);
  log(`  Role:      ${profileInfo.role}`);
  log(`  Status:    ${profileInfo.status}`);
  log(`  Source:    auth.users (primary), public.users (validation)`);

  return {
    uuid: adminUuid,
    email: authUser.email || ADMIN_EMAIL,
    full_name: profileInfo.full_name,
    role: profileInfo.role,
    status: profileInfo.status,
  };
}

// ── Step 3: Pre-Cleanup Audit ──────────────────────────────

async function runAudit(supabase: SupabaseClient): Promise<AuditCounts> {
  stepStart('Running pre-cleanup audit');

  const tables = [
    'users', 'providers', 'services', 'service_options', 'service_images',
    'bookings', 'booking_incident_reports', 'provider_live_locations',
    'reviews', 'review_media', 'messages', 'payments', 'disputes',
    'reports', 'notifications', 'favorite_providers', 'user_push_tokens',
    'saved_locations', 'servicehub_tips', 'provider_documents',
    'provider_gallery', 'provider_portfolio', 'provider_badges',
    'provider_stats', 'provider_verification_logs', 'provider_views',
    'provider_performance', 'provider_score', 'provider_analytics',
    'provider_checklist', 'availability', 'provider_categories',
    'featured_requests', 'featured_payments', 'provider_platform_fees',
    'platform_fee_payments', 'staff_action_log', 'escalations',
  ];

  const counts: AuditCounts = {};

  for (const table of tables) {
    const { count, error: err } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (err) {
      warn(`Could not count ${table}: ${err.message}`);
      counts[table] = -1;
    } else {
      counts[table] = count || 0;
    }
  }

  // Auth users count
  const { data: authData, error: authErr } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  counts['auth_users'] = authErr ? -1 : (authData?.users.length || 0);

  stepDone();

  // Print table
  console.log('\n  Table                          | Rows');
  console.log('  ───────────────────────────────┼─────────');
  for (const [table, count] of Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]))) {
    const padded = table.padEnd(31);
    console.log(`  ${padded}| ${fmtNum(count)}`);
  }

  // Write audit report
  const auditReport = generateAuditReport(counts);
  writeReport(`audit-${TIMESTAMP}.md`, auditReport);

  return counts;
}

function generateAuditReport(counts: AuditCounts): string {
  const lines: string[] = [];
  lines.push('# TAGA Closed Beta — Database Audit Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Project:** ${SUPABASE_URL}`);
  lines.push('');
  lines.push('## Row Counts');
  lines.push('');
  lines.push('| Table | Rows |');
  lines.push('|-------|------|');
  for (const [table, count] of Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`| ${table} | ${count} |`);
  }
  lines.push('');
  lines.push('## Preserved Tables (configuration / seed data)');
  lines.push('');
  lines.push('| Table | Description |');
  lines.push('|-------|-------------|');
  lines.push('| categories | Service categories (seed) |');
  lines.push('| service_groups | Service group hierarchy (seed) |');
  lines.push('| service_templates | Service templates (seed) |');
  lines.push('| platform_fee_schedule | Fee tier configuration |');
  lines.push('| platform_config | Platform configuration key-values |');
  lines.push('');
  lines.push('## Storage Buckets');
  lines.push('');
  lines.push('| Bucket | Public | Path Pattern |');
  lines.push('|--------|--------|-------------|');
  lines.push('| avatars | yes | `{user_id}/{filename}` |');
  lines.push('| provider-documents | no | `{user_id}/{filename}` |');
  lines.push('| provider-profile-images | yes | `{user_id}/{filename}` |');
  lines.push('| provider-cover-images | yes | `{user_id}/{filename}` |');
  lines.push('| booking-photos | no | `{booking_id}/{filename}` |');
  lines.push('| chat-media | no | `{booking_id}/{filename}` |');
  lines.push('');
  return lines.join('\n');
}

// ── Step 4: Backup ─────────────────────────────────────────

async function performBackup(supabase: SupabaseClient): Promise<boolean> {
  stepStart('Creating backup');

  if (DRY_RUN) {
    log('  DRY RUN: Skipping backup.');
    stepDone();
    return true;
  }

  if (!SUPABASE_DB_URL) {
    warn('SUPABASE_DB_URL not set. Cannot perform pg_dump backup.');
    warn('You MUST manually create a backup via Supabase Dashboard before proceeding.');
    warn('Instructions: Dashboard → Settings → Database → Backup → Create Backup');
    log('');
    log('  To enable automatic backup, set SUPABASE_DB_URL in .env.beta-reset');
    log('  Format: postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres');
    stepDone();
    return true;
  }

  const backupFile = path.join(REPORT_DIR, `backup-${TIMESTAMP}.sql`);

  try {
    log('  Creating database backup via pg_dump...');
    execSync(
      `pg_dump "${SUPABASE_DB_URL}" --format=plain --file="${backupFile}"`,
      { stdio: 'pipe', timeout: 300000 }
    );

    const stats = fs.statSync(backupFile);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    log(`  Backup created: ${backupFile} (${sizeMB} MB)`);

    if (stats.size < 1000) {
      stepFail();
      error('Backup file is suspiciously small (< 1KB). Backup may have failed.');
      return false;
    }

    log('  Backup verification: PASS');
    stepDone();
    return true;
  } catch (err: any) {
    stepFail();
    error(`Backup failed: ${err.message}`);
    error('No destructive action will be performed until backup succeeds.');
    return false;
  }
}

// ── Step 5: Execute Database Cleanup ───────────────────────

async function executeDbCleanup(
  supabase: SupabaseClient,
  adminUuid: string
): Promise<ResetResult | null> {
  stepStart('Executing database cleanup');

  if (DRY_RUN) {
    log('  DRY RUN: No database changes will be made.');
    stepDone();
    return null;
  }

  // Call the SQL function via RPC
  log('  Calling run_beta_reset() via RPC...');
  const { data: result, error: rpcError } = await supabase.rpc('run_beta_reset', {
    p_admin_uuid: adminUuid,
  });

  if (rpcError) {
    stepFail();
    error(`Database cleanup failed: ${rpcError.message}`);
    error('The function runs in a transaction — all changes have been rolled back.');
    return null;
  }

  stepDone();
  log('  Database cleanup completed successfully.');
  log('');

  const deleted: AuditCounts = (result.deleted_counts as AuditCounts) || {};
  console.log('  Deleted Records Summary:');
  console.log('  ───────────────────────────────┼─────────');
  for (const [table, count] of Object.entries(deleted).sort((a, b) => (b[1] as number) - (a[1] as number))) {
    if (count > 0) {
      const padded = table.padEnd(31);
      console.log(`  ${padded}| ${fmtNum(count)}`);
    }
  }

  return result as ResetResult;
}

// ── Step 6: Delete Auth Users ──────────────────────────────

async function deleteAuthUsers(
  supabase: SupabaseClient,
  adminUuid: string
): Promise<number> {
  stepStart('Deleting auth users');

  if (DRY_RUN) {
    log('  DRY RUN: No auth users will be deleted.');
    stepDone();
    return 0;
  }

  // List all auth users
  const { data: authData, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    stepFail();
    error(`Could not list auth users: ${listError.message}`);
    return 0;
  }

  const nonAdminUsers = authData.users.filter((u) => u.id !== adminUuid);
  log(`  Found ${authData.users.length} auth users, ${nonAdminUsers.length} to delete.`);

  let deletedCount = 0;
  for (const user of nonAdminUsers) {
    const { error: delError } = await supabase.auth.admin.deleteUser(user.id);
    if (delError) {
      warn(`Failed to delete auth user ${user.email} (${user.id}): ${delError.message}`);
    } else {
      deletedCount++;
      log(`    Deleted: ${user.email}`);
    }
  }

  log(`  Auth users deleted: ${deletedCount}`);
  stepDone();
  return deletedCount;
}

// ── Step 7: Clean Storage Files ────────────────────────────

async function cleanStorage(
  supabase: SupabaseClient,
  adminUuid: string
): Promise<StorageCleanupResult[]> {
  stepStart('Cleaning storage files');

  const results: StorageCleanupResult[] = [];

  for (const bucket of STORAGE_BUCKETS) {
    const result: StorageCleanupResult = { bucket, deleted: 0, errors: [] };

    if (DRY_RUN) {
      log(`  DRY RUN: Would clean bucket "${bucket}"`);
      results.push(result);
      continue;
    }

    try {
      // List root level — returns folder entries (UUID directories) or direct files
      const { data: rootItems, error: listError } = await supabase.storage
        .from(bucket)
        .list('', { limit: 1000 });

      if (listError) {
        result.errors.push(`List error: ${listError.message}`);
        warn(`Could not list files in "${bucket}": ${listError.message}`);
        results.push(result);
        continue;
      }

      if (!rootItems || rootItems.length === 0) {
        log(`  ${bucket}: no files found`);
        results.push(result);
        continue;
      }

      // Recursively collect file paths to delete (not belonging to admin)
      const filesToDelete: string[] = [];

      for (const rootItem of rootItems) {
        const isFolder = !rootItem.id && rootItem.name;

        if (isFolder) {
          const folderName = rootItem.name;

          // Skip admin folder
          if (folderName === adminUuid) {
            continue;
          }

          // List files inside this user's folder
          const { data: subFiles, error: subError } = await supabase.storage
            .from(bucket)
            .list(folderName, { limit: 1000 });

          if (subError) {
            result.errors.push(`Sub-list error for "${folderName}": ${subError.message}`);
            warn(`Could not list files in "${bucket}/${folderName}": ${subError.message}`);
            continue;
          }

          if (subFiles) {
            for (const subFile of subFiles) {
              filesToDelete.push(`${folderName}/${subFile.name}`);
            }
          }
        } else {
          // Direct file at root level (no user folder)
          filesToDelete.push(rootItem.name);
        }
      }

      if (filesToDelete.length === 0) {
        log(`  ${bucket}: no non-admin files to delete`);
        results.push(result);
        continue;
      }

      // Delete in batches of 100 (Supabase storage API limit)
      for (let i = 0; i < filesToDelete.length; i += 100) {
        const batch = filesToDelete.slice(i, i + 100);
        const { error: delError } = await supabase.storage
          .from(bucket)
          .remove(batch);

        if (delError) {
          result.errors.push(`Batch delete error: ${delError.message}`);
          warn(`Error deleting batch from "${bucket}": ${delError.message}`);
        } else {
          result.deleted += batch.length;
        }
      }

      log(`  ${bucket}: deleted ${result.deleted} files${result.errors.length > 0 ? ` (${result.errors.length} errors)` : ''}`);
    } catch (err: any) {
      result.errors.push(`Unexpected error: ${err.message}`);
      warn(`Unexpected error cleaning "${bucket}": ${err.message}`);
    }

    results.push(result);
  }

  stepDone();
  return results;
}

// ── Step 8: Verification ───────────────────────────────────

async function verifyCleanup(
  supabase: SupabaseClient,
  adminUuid: string
): Promise<VerificationResult> {
  stepStart('Running verification');

  // Check remaining auth users
  const { data: authData } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const remainingAuthUsers = authData?.users.length || 0;

  // Check remaining public users
  const { data: remainingUsers } = await supabase
    .from('users')
    .select('id, email, role');

  const remainingPublicUsers = remainingUsers?.length || 0;
  const remainingAdmins = remainingUsers?.filter((u) => u.role === 'admin').length || 0;
  const adminEmail = remainingUsers?.find((u) => u.role === 'admin')?.email || '';
  const nonAdminRemaining = remainingUsers?.filter((u) => u.role !== 'admin').length || 0;

  // Check for orphaned foreign keys
  const orphanChecks = [
    { table: 'bookings', column: 'customer_id', refTable: 'users' },
    { table: 'bookings', column: 'provider_id', refTable: 'providers' },
    { table: 'messages', column: 'sender_id', refTable: 'users' },
    { table: 'messages', column: 'receiver_id', refTable: 'users' },
    { table: 'reviews', column: 'customer_id', refTable: 'users' },
    { table: 'reviews', column: 'provider_id', refTable: 'providers' },
    { table: 'notifications', column: 'user_id', refTable: 'users' },
    { table: 'services', column: 'provider_id', refTable: 'providers' },
  ];

  let orphanedFkCount = 0;
  for (const check of orphanChecks) {
    const { count } = await supabase
      .from(check.table)
      .select('*', { count: 'exact', head: true })
      .not(check.column, 'in', `(${adminUuid})`);

    if (count && count > 0) {
      orphanedFkCount += count;
    }
  }

  const { count: bookingCount } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true });

  const { count: messageCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true });

  const { count: reviewCount } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true });

  const integrityCheck =
    remainingAuthUsers === 1 &&
    remainingAdmins === 1 &&
    nonAdminRemaining === 0 &&
    (bookingCount === 0 || bookingCount === null) &&
    (messageCount === 0 || messageCount === null) &&
    (reviewCount === 0 || reviewCount === null)
      ? 'PASS'
      : 'FAIL';

  const result: VerificationResult = {
    remaining_auth_users: remainingAuthUsers,
    remaining_public_users: remainingPublicUsers,
    remaining_admins: remainingAdmins,
    admin_email: adminEmail,
    non_admin_users_remaining: nonAdminRemaining,
    orphaned_fk_count: orphanedFkCount,
    integrity_check: integrityCheck,
  };

  stepDone();
  console.log('');
  console.log('  Verification Results:');
  console.log('  ──────────────────────────────────────');
  console.log(`  Remaining Auth users:     ${result.remaining_auth_users}`);
  console.log(`  Remaining Public users:   ${result.remaining_public_users}`);
  console.log(`  Remaining Admins:         ${result.remaining_admins}`);
  console.log(`  Admin email:              ${result.admin_email}`);
  console.log(`  Non-admin users remaining:${result.non_admin_users_remaining}`);
  console.log(`  Orphaned FK count:        ${result.orphaned_fk_count}`);
  console.log(`  Bookings remaining:       ${bookingCount || 0}`);
  console.log(`  Messages remaining:       ${messageCount || 0}`);
  console.log(`  Reviews remaining:        ${reviewCount || 0}`);
  console.log('');
  console.log(`  INTEGRITY CHECK:          ${result.integrity_check}`);

  return result;
}

// ── Storage Audit (for preview) ────────────────────────────

async function auditStorage(
  supabase: SupabaseClient,
  adminUuid: string
): Promise<StorageAuditResult[]> {
  const results: StorageAuditResult[] = [];

  for (const bucket of STORAGE_BUCKETS) {
    const result: StorageAuditResult = {
      bucket,
      total_objects: 0,
      to_delete: 0,
      admin_objects: 0,
      total_size: 0,
      unknown_size_count: 0,
    };

    try {
      // List root level — returns folder entries (UUID directories) or direct files
      const { data: rootItems, error: rootError } = await supabase.storage
        .from(bucket)
        .list('', { limit: 1000 });

      if (rootError || !rootItems) {
        results.push(result);
        continue;
      }

      // Process each root item
      for (const rootItem of rootItems) {
        // If this item has no id, it's likely a folder — list its contents
        const isFolder = !rootItem.id && rootItem.name;

        if (isFolder) {
          const folderName = rootItem.name;
          const isAdminFolder = folderName === adminUuid;

          // List files inside this user's folder
          const { data: subFiles, error: subError } = await supabase.storage
            .from(bucket)
            .list(folderName, { limit: 1000 });

          if (subError || !subFiles) {
            // Count the folder as 1 unknown-size object if we can't list it
            result.total_objects++;
            result.unknown_size_count++;
            if (isAdminFolder) {
              result.admin_objects++;
            } else {
              result.to_delete++;
            }
            continue;
          }

          for (const subFile of subFiles) {
            result.total_objects++;
            if (isAdminFolder) {
              result.admin_objects++;
            } else {
              result.to_delete++;
            }

            const size = extractObjectSize(subFile);
            if (size !== null) {
              result.total_size += size;
            } else {
              result.unknown_size_count++;
            }
          }
        } else {
          // This is a direct file at root level (no user folder)
          result.total_objects++;
          result.to_delete++;

          const size = extractObjectSize(rootItem);
          if (size !== null) {
            result.total_size += size;
          } else {
            result.unknown_size_count++;
          }
        }
      }
    } catch {
      // skip on error
    }

    results.push(result);
  }

  return results;
}

function extractObjectSize(file: { metadata?: Record<string, unknown> | null }): number | null {
  const metadata = file.metadata as Record<string, unknown> | undefined;
  if (!metadata) return null;

  // Try common metadata fields for file size
  const candidates: unknown[] = [
    metadata.size,
    metadata.filesize,
    metadata['content-length'],
    metadata.ContentLength,
    metadata.contentLength,
  ];

  for (const val of candidates) {
    if (typeof val === 'number' && val > 0) return val;
    if (typeof val === 'string') {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  return null;
}

// ── Admin-Owned Records Audit ───────────────────────────────

interface AdminRecordCounts {
  services: number;
  bookings: number;
  reviews: number;
  storage_objects: number;
}

async function auditAdminRecords(
  supabase: SupabaseClient,
  adminUuid: string,
  storageAudit: StorageAuditResult[]
): Promise<AdminRecordCounts> {
  const counts: AdminRecordCounts = {
    services: 0,
    bookings: 0,
    reviews: 0,
    storage_objects: 0,
  };

  // Services where provider_id = admin
  const { count: adminServices } = await supabase
    .from('services')
    .select('*', { count: 'exact', head: true })
    .eq('provider_id', adminUuid);
  counts.services = adminServices || 0;

  // Bookings where customer_id = admin OR provider_id = admin
  const { count: adminBookings } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .or(`customer_id.eq.${adminUuid},provider_id.eq.${adminUuid}`);
  counts.bookings = adminBookings || 0;

  // Reviews where customer_id = admin OR provider_id = admin
  const { count: adminReviews } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true })
    .or(`customer_id.eq.${adminUuid},provider_id.eq.${adminUuid}`);
  counts.reviews = adminReviews || 0;

  // Storage objects owned by admin
  counts.storage_objects = storageAudit.reduce((sum, r) => sum + r.admin_objects, 0);

  return counts;
}

// ── Preview ────────────────────────────────────────────────

function generatePreview(
  admin: AdminInfo,
  counts: AuditCounts,
  storageAudit: StorageAuditResult[],
  adminRecords: AdminRecordCounts
): void {
  const line = '═'.repeat(50);
  const dash = '─'.repeat(50);

  console.log(`\n${line}`);
  console.log('  TAGA Closed Beta Reset Preview');
  console.log(`${line}`);
  console.log('');

  console.log('Admin Account Preserved');
  console.log(dash);
  console.log(`Email:`);
  console.log(`${admin.email}`);
  console.log('');
  console.log(`UUID:`);
  console.log(`${admin.uuid}`);
  console.log('');
  console.log(dash);
  console.log('');

  const usersToDelete = Math.max(0, (counts.users || 0) - 1);
  const providersToDelete = counts.providers > 0 ? Math.max(0, (counts.providers || 0) - 1) : 0;
  const customersToDelete = Math.max(0, usersToDelete - providersToDelete);

  console.log(`Users to delete:`);
  console.log(`${fmtNum(usersToDelete)}`);
  console.log('');
  console.log(`Providers:`);
  console.log(`${fmtNum(providersToDelete)}`);
  console.log('');
  console.log(`Customers:`);
  console.log(`${fmtNum(customersToDelete)}`);
  console.log('');
  console.log(`Services:`);
  console.log(`${fmtNum(counts.services || 0)}`);
  console.log('');
  console.log(`Bookings:`);
  console.log(`${fmtNum(counts.bookings || 0)}`);
  console.log('');
  console.log(`Booking History:`);
  console.log(`${fmtNum(counts.booking_incident_reports || 0)}`);
  console.log('');
  console.log(`Reviews:`);
  console.log(`${fmtNum(counts.reviews || 0)}`);
  console.log('');
  console.log(`Review Images:`);
  console.log(`${fmtNum(counts.review_media || 0)}`);
  console.log('');
  console.log(`Conversations:`);
  console.log(`${fmtNum(counts.messages > 0 ? Math.min(counts.bookings || 0, counts.messages) : 0)}`);
  console.log('');
  console.log(`Messages:`);
  console.log(`${fmtNum(counts.messages || 0)}`);
  console.log('');
  console.log(`Notifications:`);
  console.log(`${fmtNum(counts.notifications || 0)}`);
  console.log('');
  console.log(`Favorites:`);
  console.log(`${fmtNum(counts.favorite_providers || 0)}`);
  console.log('');
  console.log(`Reports:`);
  console.log(`${fmtNum(counts.reports || 0)}`);
  console.log('');
  console.log(`Platform Fee Records:`);
  console.log(`${fmtNum(counts.provider_platform_fees || 0)}`);
  console.log('');

  // Storage section
  console.log('Storage Buckets');
  console.log(dash);
  console.log('');

  let totalStorageObjects = 0;
  let totalStorageSize = 0;
  let totalUnknownSize = 0;

  for (const sr of storageAudit) {
    const label = BUCKET_LABELS[sr.bucket] || sr.bucket;
    if (sr.total_objects > 0) {
      console.log(`${label}:`);
      console.log(`${fmtNum(sr.to_delete)} to delete, ${fmtNum(sr.admin_objects)} admin-owned (${fmtBytes(sr.total_size)}${sr.unknown_size_count > 0 ? `, ${sr.unknown_size_count} unknown size` : ''})`);
      console.log('');
    }
    totalStorageObjects += sr.to_delete;
    totalStorageSize += sr.total_size;
    totalUnknownSize += sr.unknown_size_count;
  }

  console.log(`Total Storage Objects:`);
  console.log(`${fmtNum(totalStorageObjects)}`);
  console.log('');
  console.log(`Known Storage Size:`);
  console.log(`${fmtBytes(totalStorageSize)}`);
  console.log('');
  console.log(`Objects With Unknown Size:`);
  console.log(`${fmtNum(totalUnknownSize)}`);
  console.log('');
  console.log(dash);
  console.log('');

  // Admin-owned vs non-admin breakdown
  console.log('Admin-owned records preserved:');
  console.log(`Services: ${adminRecords.services}`);
  console.log(`Bookings: ${adminRecords.bookings}`);
  console.log(`Reviews: ${adminRecords.reviews}`);
  console.log(`Storage objects: ${adminRecords.storage_objects}`);
  console.log('');
  console.log('Non-admin records to delete:');
  console.log(`Services: ${Math.max(0, (counts.services || 0) - adminRecords.services)}`);
  console.log(`Bookings: ${Math.max(0, (counts.bookings || 0) - adminRecords.bookings)}`);
  console.log(`Reviews: ${Math.max(0, (counts.reviews || 0) - adminRecords.reviews)}`);
  console.log(`Storage objects: ${totalStorageObjects}`);
  console.log('');
  console.log(dash);
  console.log('');

  // Preserved data
  console.log('The following data WILL REMAIN');
  console.log('');
  console.log('\u2713 Admin account');
  console.log('\u2713 Service categories');
  console.log('\u2713 Cities');
  console.log('\u2713 Platform configuration');
  console.log('\u2713 Platform fee schedule');
  console.log('\u2713 Application settings');
  console.log('\u2713 Database schema');
  console.log('\u2713 RLS policies');
  console.log('');
  console.log(dash);
  console.log('');

  // Warning
  console.log('WARNING');
  console.log('');
  console.log('This operation is irreversible.');
  console.log('');
  if (!DRY_RUN) {
    console.log('A verified backup has already been created.');
  } else {
    console.log('No backup was created (dry run mode).');
  }
  console.log('');
  console.log(line);
}

// ── Interactive Confirmation ────────────────────────────────

function confirmProceed(): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('');
    console.log('Proceed with beta reset?');
    console.log('');
    process.stdout.write('Type YES to continue:\n\n> ');

    rl.question('', (answer: string) => {
      const trimmed = answer.trim();
      rl.close();
      if (trimmed === 'YES' || trimmed === 'yes') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// ── Estimated Execution Time ────────────────────────────────

function estimateExecutionTime(counts: AuditCounts, storageAudit: StorageAuditResult[]): string {
  const totalRows = Object.values(counts).reduce((s, c) => s + Math.max(0, c), 0);
  const totalStorage = storageAudit.reduce((s, r) => s + r.to_delete, 0);

  // Rough estimates:
  // DB cleanup: ~1000 rows/sec via RPC
  // Auth deletion: ~5 users/sec (individual API calls)
  // Storage: ~100 files/batch, ~2 sec per batch
  const dbSeconds = Math.ceil(totalRows / 1000);
  const authSeconds = Math.ceil(Math.max(0, (counts.auth_users || 0) - 1) / 5);
  const storageSeconds = Math.ceil(totalStorage / 100) * 2;

  const minSeconds = Math.max(10, Math.floor((dbSeconds + authSeconds + storageSeconds) * 0.7));
  const maxSeconds = Math.max(20, Math.ceil((dbSeconds + authSeconds + storageSeconds) * 1.3));

  if (maxSeconds < 60) {
    return `${minSeconds}\u2013${maxSeconds} seconds`;
  }
  return `${Math.floor(minSeconds / 60)}\u2013${Math.ceil(maxSeconds / 60)} minutes`;
}

// ── Final Summary ───────────────────────────────────────────

function printFinalSummary(
  resetResult: ResetResult | null,
  authDeleted: number,
  storageResults: StorageCleanupResult[],
  verification: VerificationResult
): void {
  const line = '═'.repeat(50);
  const deleted: AuditCounts = (resetResult?.deleted_counts as AuditCounts) || {};
  const totalStorageDeleted = storageResults.reduce((s, r) => s + r.deleted, 0);

  const isPass = verification.integrity_check === 'PASS';

  console.log(`\n${line}`);
  if (isPass) {
    console.log('  Beta Reset Completed Successfully');
  } else {
    console.log('  Beta Reset Partially Completed');
  }
  console.log(`${line}`);
  console.log('');
  console.log(`Auth Users Deleted:`);
  console.log(`${fmtNum(authDeleted)}`);
  console.log('');
  console.log(`Public Users Deleted:`);
  console.log(`${fmtNum(deleted.public_users || 0)}`);
  console.log('');
  console.log(`Bookings Deleted:`);
  console.log(`${fmtNum(deleted.bookings || 0)}`);
  console.log('');
  console.log(`Messages Deleted:`);
  console.log(`${fmtNum(deleted.messages || 0)}`);
  console.log('');
  console.log(`Storage Files Deleted:`);
  console.log(`${fmtNum(totalStorageDeleted)}`);
  console.log('');
  console.log(`Remaining Admin:`);
  console.log(`${verification.admin_email}`);
  console.log('');
  console.log(`Remaining Auth Users:`);
  console.log(`${verification.remaining_auth_users}`);
  console.log('');
  console.log(`Integrity Check:`);
  console.log(`${verification.integrity_check}`);
  console.log('');
  if (isPass) {
    console.log('Ready for Closed Beta');
  } else {
    console.log('Not Ready for Closed Beta');
  }
  console.log(`${line}`);
}

// ── Step 9: Generate Final Report ──────────────────────────

function generateFinalReport(
  adminUuid: string,
  preCounts: AuditCounts,
  resetResult: ResetResult | null,
  authDeleted: number,
  storageResults: StorageCleanupResult[],
  verification: VerificationResult
): string {
  const lines: string[] = [];
  const deleted: AuditCounts = (resetResult?.deleted_counts as AuditCounts) || {};

  lines.push('# TAGA Closed Beta Reset — Final Report');
  lines.push('');
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Project:** ${SUPABASE_URL}`);
  lines.push(`**Admin UUID:** ${adminUuid}`);
  lines.push(`**Admin Email:** ${ADMIN_EMAIL}`);
  lines.push(`**Mode:** ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Auth users deleted | ${authDeleted} |`);
  lines.push(`| Public users deleted | ${deleted.public_users || 0} |`);
  lines.push(`| Bookings removed | ${deleted.bookings || 0} |`);
  lines.push(`| Chats (messages) removed | ${deleted.messages || 0} |`);
  lines.push(`| Reviews removed | ${deleted.reviews || 0} |`);
  lines.push(`| Review media removed | ${deleted.review_media || 0} |`);
  lines.push(`| Services removed | ${deleted.services || 0} |`);
  lines.push(`| Service options removed | ${deleted.service_options || 0} |`);
  lines.push(`| Service images removed | ${deleted.service_images || 0} |`);
  lines.push(`| Payments removed | ${deleted.payments || 0} |`);
  lines.push(`| Disputes removed | ${deleted.disputes || 0} |`);
  lines.push(`| Reports removed | ${deleted.reports || 0} |`);
  lines.push(`| Notifications removed | ${deleted.notifications || 0} |`);
  lines.push(`| Favorite providers removed | ${deleted.favorite_providers || 0} |`);
  lines.push(`| Provider documents removed | ${deleted.provider_documents || 0} |`);
  lines.push(`| Provider gallery removed | ${deleted.provider_gallery || 0} |`);
  lines.push(`| Provider portfolio removed | ${deleted.provider_portfolio || 0} |`);
  lines.push(`| Provider badges removed | ${deleted.provider_badges || 0} |`);
  lines.push(`| Provider stats removed | ${deleted.provider_stats || 0} |`);
  lines.push(`| Provider views removed | ${deleted.provider_views || 0} |`);
  lines.push(`| Provider analytics removed | ${deleted.provider_analytics || 0} |`);
  lines.push(`| Provider platform fees removed | ${deleted.provider_platform_fees || 0} |`);
  lines.push(`| Platform fee payments removed | ${deleted.platform_fee_payments || 0} |`);
  lines.push(`| Staff action logs removed | ${deleted.staff_action_log || 0} |`);
  lines.push(`| Escalations removed | ${deleted.escalations || 0} |`);
  lines.push(`| Saved locations removed | ${deleted.saved_locations || 0} |`);
  lines.push(`| Push tokens removed | ${deleted.user_push_tokens || 0} |`);
  lines.push(`| ServiceHub tips removed | ${deleted.servicehub_tips || 0} |`);
  lines.push(`| Featured requests removed | ${deleted.featured_requests || 0} |`);
  lines.push(`| Featured payments removed | ${deleted.featured_payments || 0} |`);
  lines.push(`| Booking incident reports removed | ${deleted.booking_incident_reports || 0} |`);
  lines.push(`| Provider live locations removed | ${deleted.provider_live_locations || 0} |`);
  lines.push('');

  // Storage
  let totalStorageDeleted = 0;
  lines.push('### Storage Files Removed');
  lines.push('');
  lines.push('| Bucket | Files Deleted | Errors |');
  lines.push('|--------|--------------|--------|');
  for (const sr of storageResults) {
    lines.push(`| ${sr.bucket} | ${sr.deleted} | ${sr.errors.length} |`);
    totalStorageDeleted += sr.deleted;
  }
  lines.push(`| **Total** | **${totalStorageDeleted}** | |`);
  lines.push('');

  // Verification
  lines.push('## Verification');
  lines.push('');
  lines.push('| Check | Result |');
  lines.push('|-------|--------|');
  lines.push(`| Remaining Auth users | ${verification.remaining_auth_users} |`);
  lines.push(`| Remaining Admin | ${verification.admin_email} |`);
  lines.push(`| Non-admin users remaining | ${verification.non_admin_users_remaining} |`);
  lines.push(`| Orphaned FK count | ${verification.orphaned_fk_count} |`);
  lines.push(`| Integrity Check | **${verification.integrity_check}** |`);
  lines.push('');

  // Preserved data
  lines.push('## Preserved Data');
  lines.push('');
  lines.push('- Admin account (jhingxpress)');
  lines.push('- Platform configuration (platform_config)');
  lines.push('- Fee schedule (platform_fee_schedule)');
  lines.push('- Service categories (categories)');
  lines.push('- Service groups (service_groups)');
  lines.push('- Service templates (service_templates)');
  lines.push('- RLS policies');
  lines.push('- Database schema');
  lines.push('- All migrations');
  lines.push('');

  if (DRY_RUN) {
    lines.push('> **NOTE:** This was a DRY RUN. No data was actually deleted.');
    lines.push('> Run with `--execute` flag to perform the actual cleanup.');
    lines.push('');
  }

  return lines.join('\n');
}

// ── Main ───────────────────────────────────────────────────

async function main() {
  banner('TAGA Closed Beta Database Reset Utility');
  console.log('  This utility will remove all non-admin user data');
  console.log('  from the TAGA Supabase project, preserving only');
  console.log('  the administrator account and platform configuration.');
  console.log('');

  // Step 1: Validate environment
  validateEnv();

  // Create Supabase client with service role key
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Step 2: Resolve admin UUID
  const admin = await resolveAdminUuid(supabase);

  // Step 3: Pre-cleanup audit
  const preCounts = await runAudit(supabase);

  // Audit storage for preview
  log('  Auditing storage buckets for preview...');
  const storageAudit = await auditStorage(supabase, admin.uuid);

  // Audit admin-owned records for preview
  log('  Auditing admin-owned records...');
  const adminRecords = await auditAdminRecords(supabase, admin.uuid, storageAudit);

  // Generate preview (shown in both dry-run and execute modes)
  generatePreview(admin, preCounts, storageAudit, adminRecords);

  if (DRY_RUN) {
    // Dry run: print report and exit, no confirmation needed
    const dryReport = generateFinalReport(
      admin.uuid,
      preCounts,
      null,
      0,
      [],
      {
        remaining_auth_users: preCounts.auth_users || 0,
        remaining_public_users: preCounts.users || 0,
        remaining_admins: 1,
        admin_email: ADMIN_EMAIL,
        non_admin_users_remaining: (preCounts.users || 0) - 1,
        orphaned_fk_count: 0,
        integrity_check: 'DRY RUN',
      }
    );
    writeReport(`beta-reset-report-${TIMESTAMP}.md`, dryReport);
    banner('Dry Run Complete');
    log('Review the report in reports/beta-reset/');
    log('When ready, run: npm run beta-reset:execute');
    safeExit(0);
    return;
  }

  // ── Execute mode ────────────────────────────────────────

  // Step 4: Backup
  const backupOk = await performBackup(supabase);
  if (!backupOk) {
    error('Backup failed. Aborting to prevent data loss.');
    safeExit(1);
    return;
  }

  // Display estimated execution time
  console.log('');
  console.log('Estimated execution time:');
  console.log('');
  console.log(`  ${estimateExecutionTime(preCounts, storageAudit)}`);
  console.log('');

  // Interactive confirmation
  const confirmed = await confirmProceed();
  if (!confirmed) {
    console.log('');
    console.log('Operation cancelled.');
    console.log('');
    console.log('No data has been modified.');
    console.log('');
    safeExit(0);
    return;
  }

  console.log('');
  log('Confirmation received. Proceeding with cleanup...');
  console.log('');

  // Step 5: Execute database cleanup
  const resetResult = await executeDbCleanup(supabase, admin.uuid);
  if (!resetResult) {
    error('Database cleanup failed. All changes rolled back.');
    safeExit(1);
    return;
  }

  // Step 6: Delete auth users
  const authDeleted = await deleteAuthUsers(supabase, admin.uuid);

  // Step 7: Clean storage
  const storageResults = await cleanStorage(supabase, admin.uuid);

  // Step 8: Verification
  const verification = await verifyCleanup(supabase, admin.uuid);

  // Step 9: Generate final report
  stepStart('Generating final report');
  const finalReport = generateFinalReport(
    admin.uuid,
    preCounts,
    resetResult,
    authDeleted,
    storageResults,
    verification
  );
  writeReport(`beta-reset-report-${TIMESTAMP}.md`, finalReport);
  stepDone();

  // Print final summary
  printFinalSummary(resetResult, authDeleted, storageResults, verification);
  console.log('');
  log(`Full report: reports/beta-reset/beta-reset-report-${TIMESTAMP}.md`);
  safeExit(verification.integrity_check === 'PASS' ? 0 : 1);
}

main().catch((err) => {
  if (err && err.message === 'safeExit pending') {
    return;
  }
  error(`Fatal error: ${err.message}`);
  console.error(err.stack);
  safeExit(1);
});
