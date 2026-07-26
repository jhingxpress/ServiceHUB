/**
 * TAGA Beta Reset — Resume / Retry Script
 *
 * Used after a partial beta-reset execution where:
 *   - Database cleanup RPC succeeded (public tables cleaned)
 *   - Some auth users failed to delete (FK constraints)
 *   - Some storage objects were not deleted (recursive listing bug)
 *
 * This script ONLY:
 *   1. Cleans remaining FK-blocking tables (moderation_log, rate_limits)
 *   2. Retries deleting remaining non-admin auth users
 *   3. Recursively re-audits and cleans storage
 *   4. Runs strict verification
 *
 * It does NOT rerun the database cleanup RPC.
 * It does NOT alter schema, RLS, policies, or platform config.
 *
 * Usage:  npm run beta-reset:resume
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ── Environment ─────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'jhingxpress@gmail.com';
const REPORT_DIR = path.join(process.cwd(), 'reports', 'beta-reset');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -1);

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

const log = (msg: string) => console.log(`[resume] ${msg}`);
const warn = (msg: string) => console.warn(`[resume] WARN: ${msg}`);
const error = (msg: string) => console.error(`[resume] ERROR: ${msg}`);

function banner(title: string) {
  const line = '═'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(`${line}\n`);
}

function safeExit(code: number): void {
  setTimeout(() => process.exit(code), 100);
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ── Types ──────────────────────────────────────────────────

interface AuthUser {
  id: string;
  email: string;
}

interface StorageBucketAudit {
  bucket: string;
  total_objects: number;
  to_delete: number;
  admin_objects: number;
  total_size: number;
  unknown_size_count: number;
  files: { name: string; path: string; size: number | null }[];
}

interface DeleteResult {
  email: string;
  uuid: string;
  success: boolean;
  error?: string;
}

// ── Step 1: Validate Environment ───────────────────────────

function validateEnv(): void {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    error(`Missing required environment variables: ${missing.join(', ')}`);
    error('Ensure .env.beta-reset is correct.');
    safeExit(1);
  }
}

// ── Step 2: Resolve Admin UUID ─────────────────────────────

async function resolveAdminUuid(supabase: SupabaseClient): Promise<AuthUser> {
  log('Resolving admin UUID...');

  const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (authError) {
    error(`Could not list auth users: ${authError.message}`);
    safeExit(1);
    throw new Error('exit');
  }

  const adminEmailLower = ADMIN_EMAIL.toLowerCase();
  const matching = (authData.users || []).filter(
    (u) => u.email && u.email.toLowerCase() === adminEmailLower
  );

  if (matching.length === 0) {
    error(`Admin email "${ADMIN_EMAIL}" not found in auth.users.`);
    safeExit(1);
    throw new Error('exit');
  }

  if (matching.length > 1) {
    error(`Multiple auth users found with email "${ADMIN_EMAIL}".`);
    safeExit(1);
    throw new Error('exit');
  }

  const admin = { id: matching[0].id, email: matching[0].email || ADMIN_EMAIL };
  log(`  Admin: ${admin.email} (${admin.id})`);
  return admin;
}

// ── Step 3: Clean FK-Blocking Tables ───────────────────────

async function cleanFkBlockingTables(
  supabase: SupabaseClient,
  adminUuid: string
): Promise<{ moderation_log: number; rate_limits: number }> {
  log('Cleaning FK-blocking tables (moderation_log, rate_limits)...');

  // moderation_log: admin_id and target_user_id reference auth.users(id) with NO ACTION
  // Must delete/NULL these rows before auth.users deletion can succeed
  let modLogDeleted = 0;

  // Delete rows where target_user_id is a non-admin user
  const { error: modTargetErr } = await supabase
    .from('moderation_log')
    .delete()
    .neq('target_user_id', adminUuid);

  if (modTargetErr) {
    warn(`Could not delete moderation_log by target_user_id: ${modTargetErr.message}`);
  }

  // Delete rows where admin_id is a non-admin user
  const { error: modAdminErr, count: modCount } = await supabase
    .from('moderation_log')
    .delete({ count: 'exact' })
    .neq('admin_id', adminUuid);

  if (modAdminErr) {
    warn(`Could not delete moderation_log by admin_id: ${modAdminErr.message}`);
  } else {
    modLogDeleted = modCount || 0;
  }

  // Also NULL out any remaining rows where admin_id = admin but target_user_id references deleted users
  const { error: modNullErr } = await supabase
    .from('moderation_log')
    .update({ target_user_id: null })
    .not('target_user_id', 'is', null)
    .neq('target_user_id', adminUuid);

  if (modNullErr) {
    warn(`Could not NULL moderation_log.target_user_id: ${modNullErr.message}`);
  }

  log(`  moderation_log: ${modLogDeleted} rows deleted`);

  // rate_limits: user_id references auth.users(id) ON DELETE CASCADE
  // Should auto-clean, but let's be explicit
  const { error: rlErr, count: rlCount } = await supabase
    .from('rate_limits')
    .delete({ count: 'exact' })
    .neq('user_id', adminUuid);

  if (rlErr) {
    warn(`Could not delete rate_limits: ${rlErr.message}`);
  }

  const rlDeleted = rlCount || 0;
  log(`  rate_limits: ${rlDeleted} rows deleted`);

  return { moderation_log: modLogDeleted, rate_limits: rlDeleted };
}

// ── Step 4: Delete Remaining Auth Users ────────────────────

async function deleteRemainingAuthUsers(
  supabase: SupabaseClient,
  adminUuid: string
): Promise<{ deleted: number; failed: DeleteResult[]; total: number }> {
  log('Deleting remaining non-admin auth users...');

  const { data: authData, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    error(`Could not list auth users: ${listError.message}`);
    return { deleted: 0, failed: [], total: 0 };
  }

  const nonAdminUsers = (authData.users || []).filter((u) => u.id !== adminUuid);
  log(`  Found ${nonAdminUsers.length} non-admin auth users to delete.`);

  let deletedCount = 0;
  const failed: DeleteResult[] = [];

  for (const user of nonAdminUsers) {
    log(`  Attempting: ${user.email} (${user.id})...`);

    const { error: delError } = await supabase.auth.admin.deleteUser(user.id);

    if (delError) {
      // Capture the full error details
      const errDetail: DeleteResult = {
        email: user.email || '(unknown)',
        uuid: user.id,
        success: false,
        error: delError.message,
      };

      // Try to extract more details from the error object
      const anyErr = delError as any;
      if (anyErr.code) errDetail.error += ` [code: ${anyErr.code}]`;
      if (anyErr.details) errDetail.error += ` [details: ${anyErr.details}]`;
      if (anyErr.hint) errDetail.error += ` [hint: ${anyErr.hint}]`;
      if (anyErr.status) errDetail.error += ` [status: ${anyErr.status}]`;

      warn(`    FAILED: ${errDetail.error}`);
      failed.push(errDetail);
    } else {
      deletedCount++;
      log(`    Deleted: ${user.email}`);
    }
  }

  log(`  Auth users deleted: ${deletedCount}/${nonAdminUsers.length}`);
  if (failed.length > 0) {
    warn(`  Auth users failed: ${failed.length}`);
  }

  return { deleted: deletedCount, failed, total: nonAdminUsers.length };
}

// ── Step 5: Recursive Storage Audit ────────────────────────

function extractObjectSize(file: { metadata?: Record<string, unknown> | null }): number | null {
  const metadata = file.metadata as Record<string, unknown> | undefined;
  if (!metadata) return null;

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

async function auditStorageBucket(
  supabase: SupabaseClient,
  bucket: string,
  adminUuid: string
): Promise<StorageBucketAudit> {
  const result: StorageBucketAudit = {
    bucket,
    total_objects: 0,
    to_delete: 0,
    admin_objects: 0,
    total_size: 0,
    unknown_size_count: 0,
    files: [],
  };

  try {
    const { data: rootItems, error: rootError } = await supabase.storage
      .from(bucket)
      .list('', { limit: 1000 });

    if (rootError || !rootItems) {
      return result;
    }

    for (const rootItem of rootItems) {
      const isFolder = !rootItem.id && rootItem.name;

      if (isFolder) {
        const folderName = rootItem.name;
        const isAdminFolder = folderName === adminUuid;

        const { data: subFiles, error: subError } = await supabase.storage
          .from(bucket)
          .list(folderName, { limit: 1000 });

        if (subError || !subFiles) {
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
          const filePath = `${folderName}/${subFile.name}`;
          const size = extractObjectSize(subFile);

          if (isAdminFolder) {
            result.admin_objects++;
          } else {
            result.to_delete++;
            result.files.push({
              name: subFile.name,
              path: filePath,
              size,
            });
          }

          if (size !== null) {
            result.total_size += size;
          } else {
            result.unknown_size_count++;
          }
        }
      } else {
        // Direct file at root level
        result.total_objects++;
        result.to_delete++;

        const size = extractObjectSize(rootItem);
        result.files.push({
          name: rootItem.name,
          path: rootItem.name,
          size,
        });

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

  return result;
}

async function auditAllStorage(
  supabase: SupabaseClient,
  adminUuid: string
): Promise<StorageBucketAudit[]> {
  log('Recursively auditing all storage buckets...');
  const results: StorageBucketAudit[] = [];

  for (const bucket of STORAGE_BUCKETS) {
    const audit = await auditStorageBucket(supabase, bucket, adminUuid);
    results.push(audit);

    const label = BUCKET_LABELS[bucket] || bucket;
    log(`  ${label}: ${audit.total_objects} total, ${audit.to_delete} to delete, ${audit.admin_objects} admin-owned (${fmtBytes(audit.total_size)}${audit.unknown_size_count > 0 ? `, ${audit.unknown_size_count} unknown` : ''})`);
  }

  return results;
}

// ── Step 6: Delete Remaining Storage ───────────────────────

async function deleteRemainingStorage(
  supabase: SupabaseClient,
  audits: StorageBucketAudit[]
): Promise<{ deleted: number; errors: string[] }> {
  log('Deleting remaining non-admin storage objects...');

  let totalDeleted = 0;
  const allErrors: string[] = [];

  for (const audit of audits) {
    if (audit.files.length === 0) {
      log(`  ${audit.bucket}: no non-admin files to delete.`);
      continue;
    }

    // Delete in batches of 100 (Supabase storage API limit)
    let bucketDeleted = 0;
    for (let i = 0; i < audit.files.length; i += 100) {
      const batch = audit.files.slice(i, i + 100).map((f) => f.path);

      const { error: delError } = await supabase.storage
        .from(audit.bucket)
        .remove(batch);

      if (delError) {
        const errMsg = `${audit.bucket} batch delete error: ${delError.message}`;
        allErrors.push(errMsg);
        warn(`  ${errMsg}`);
      } else {
        bucketDeleted += batch.length;
      }
    }

    totalDeleted += bucketDeleted;
    log(`  ${audit.bucket}: deleted ${bucketDeleted} files`);
  }

  log(`  Total storage files deleted: ${totalDeleted}`);
  if (allErrors.length > 0) {
    warn(`  Storage errors: ${allErrors.length}`);
  }

  return { deleted: totalDeleted, errors: allErrors };
}

// ── Step 7: Strict Verification ────────────────────────────

interface VerificationResult {
  remaining_auth_users: number;
  remaining_public_users: number;
  remaining_admins: number;
  admin_email: string;
  admin_uuid_match: boolean;
  non_admin_auth_users: number;
  non_admin_public_users: number;
  orphaned_fk_count: number;
  remaining_bookings: number;
  remaining_messages: number;
  remaining_reviews: number;
  remaining_storage_objects: number;
  admin_storage_objects: number;
  non_admin_storage_objects: number;
  integrity_check: 'PASS' | 'FAIL';
  failures: string[];
}

async function strictVerification(
  supabase: SupabaseClient,
  adminUuid: string,
  storageAudits: StorageBucketAudit[]
): Promise<VerificationResult> {
  log('Running strict verification...');

  const failures: string[] = [];

  // 1. Remaining auth users
  const { data: authData } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const remainingAuthUsers = authData?.users.length || 0;
  const nonAdminAuthUsers = (authData?.users || []).filter((u) => u.id !== adminUuid).length;

  // 2. Remaining public users
  const { data: remainingUsers } = await supabase
    .from('users')
    .select('id, email, role');

  const remainingPublicUsers = remainingUsers?.length || 0;
  const remainingAdmins = remainingUsers?.filter((u) => u.role === 'admin').length || 0;
  const adminRecord = remainingUsers?.find((u) => u.role === 'admin');
  const adminEmail = adminRecord?.email || '';
  const nonAdminPublicUsers = remainingUsers?.filter((u) => u.role !== 'admin').length || 0;
  const adminUuidMatch = adminRecord?.id === adminUuid;

  // 3. Orphaned FK checks
  const orphanChecks = [
    { table: 'bookings', column: 'customer_id' },
    { table: 'bookings', column: 'provider_id' },
    { table: 'messages', column: 'sender_id' },
    { table: 'messages', column: 'receiver_id' },
    { table: 'reviews', column: 'customer_id' },
    { table: 'reviews', column: 'provider_id' },
    { table: 'notifications', column: 'user_id' },
    { table: 'services', column: 'provider_id' },
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

  // 4. Remaining bookings/messages/reviews
  const { count: bookingCount } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true });

  const { count: messageCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true });

  const { count: reviewCount } = await supabase
    .from('reviews')
    .select('*', { count: 'exact', head: true });

  // 5. Storage
  const remainingStorageObjects = storageAudits.reduce((s, a) => s + a.total_objects, 0);
  const adminStorageObjects = storageAudits.reduce((s, a) => s + a.admin_objects, 0);
  const nonAdminStorageObjects = storageAudits.reduce((s, a) => s + a.to_delete, 0);

  // 6. Check all conditions
  if (remainingAuthUsers !== 1) failures.push(`Remaining Auth users = ${remainingAuthUsers} (expected 1)`);
  if (remainingPublicUsers !== 1) failures.push(`Remaining public users = ${remainingPublicUsers} (expected 1)`);
  if (remainingAdmins !== 1) failures.push(`Remaining admins = ${remainingAdmins} (expected 1)`);
  if (nonAdminAuthUsers !== 0) failures.push(`Non-admin Auth users = ${nonAdminAuthUsers} (expected 0)`);
  if (nonAdminPublicUsers !== 0) failures.push(`Non-admin public users = ${nonAdminPublicUsers} (expected 0)`);
  if (orphanedFkCount !== 0) failures.push(`Orphaned FK count = ${orphanedFkCount} (expected 0)`);
  if (nonAdminStorageObjects !== 0) failures.push(`Non-admin storage objects = ${nonAdminStorageObjects} (expected 0)`);
  if (!adminUuidMatch) failures.push(`Admin UUID mismatch: public.users.id = ${adminRecord?.id}, expected ${adminUuid}`);
  if (adminEmail !== ADMIN_EMAIL) failures.push(`Admin email mismatch: ${adminEmail} (expected ${ADMIN_EMAIL})`);

  const integrityCheck = failures.length === 0 ? 'PASS' : 'FAIL';

  const result: VerificationResult = {
    remaining_auth_users: remainingAuthUsers,
    remaining_public_users: remainingPublicUsers,
    remaining_admins: remainingAdmins,
    admin_email: adminEmail,
    admin_uuid_match: adminUuidMatch,
    non_admin_auth_users: nonAdminAuthUsers,
    non_admin_public_users: nonAdminPublicUsers,
    orphaned_fk_count: orphanedFkCount,
    remaining_bookings: bookingCount || 0,
    remaining_messages: messageCount || 0,
    remaining_reviews: reviewCount || 0,
    remaining_storage_objects: remainingStorageObjects,
    admin_storage_objects: adminStorageObjects,
    non_admin_storage_objects: nonAdminStorageObjects,
    integrity_check: integrityCheck,
    failures,
  };

  return result;
}

// ── Step 8: Print Summary ──────────────────────────────────

function printSummary(
  admin: AuthUser,
  fkCleanup: { moderation_log: number; rate_limits: number },
  authResult: { deleted: number; failed: DeleteResult[]; total: number },
  storageAudits: StorageBucketAudit[],
  storageCleanup: { deleted: number; errors: string[] },
  verification: VerificationResult
): void {
  const line = '═'.repeat(60);
  const dash = '─'.repeat(60);

  console.log(`\n${line}`);

  if (verification.integrity_check === 'PASS') {
    console.log('  Beta Reset Completed Successfully');
    console.log(`${line}`);
  } else {
    console.log('  Beta Reset Partially Completed');
    console.log(`${line}`);
  }

  console.log('');
  console.log('FK-Blocking Table Cleanup:');
  console.log(`  moderation_log rows deleted: ${fkCleanup.moderation_log}`);
  console.log(`  rate_limits rows deleted: ${fkCleanup.rate_limits}`);
  console.log('');

  console.log('Auth Users:');
  console.log(`  Attempted: ${authResult.total}`);
  console.log(`  Deleted:   ${authResult.deleted}`);
  console.log(`  Failed:    ${authResult.failed.length}`);
  console.log('');

  if (authResult.failed.length > 0) {
    console.log('Failed Auth Deletions:');
    for (const f of authResult.failed) {
      console.log(`  ✗ ${f.email} (${f.uuid})`);
      console.log(`    Error: ${f.error}`);
    }
    console.log('');
  }

  console.log('Storage Cleanup:');
  for (const audit of storageAudits) {
    const label = BUCKET_LABELS[audit.bucket] || audit.bucket;
    console.log(`  ${label}: ${audit.total_objects} total, ${audit.to_delete} non-admin, ${audit.admin_objects} admin-owned`);
  }
  console.log(`  Files deleted: ${storageCleanup.deleted}`);
  if (storageCleanup.errors.length > 0) {
    console.log(`  Errors: ${storageCleanup.errors.length}`);
  }
  console.log('');

  console.log('Verification Results:');
  console.log(dash);
  console.log(`  Remaining Auth users:        ${verification.remaining_auth_users} (expected 1)`);
  console.log(`  Remaining public users:      ${verification.remaining_public_users} (expected 1)`);
  console.log(`  Remaining admins:            ${verification.remaining_admins} (expected 1)`);
  console.log(`  Admin email:                 ${verification.admin_email}`);
  console.log(`  Admin UUID match:            ${verification.admin_uuid_match}`);
  console.log(`  Non-admin Auth users:        ${verification.non_admin_auth_users} (expected 0)`);
  console.log(`  Non-admin public users:      ${verification.non_admin_public_users} (expected 0)`);
  console.log(`  Orphaned FK count:           ${verification.orphaned_fk_count} (expected 0)`);
  console.log(`  Bookings remaining:          ${verification.remaining_bookings}`);
  console.log(`  Messages remaining:          ${verification.remaining_messages}`);
  console.log(`  Reviews remaining:           ${verification.remaining_reviews}`);
  console.log(`  Total storage objects:       ${verification.remaining_storage_objects}`);
  console.log(`  Admin storage objects:       ${verification.admin_storage_objects}`);
  console.log(`  Non-admin storage objects:   ${verification.non_admin_storage_objects} (expected 0)`);
  console.log('');

  if (verification.failures.length > 0) {
    console.log('Verification Failures:');
    for (const f of verification.failures) {
      console.log(`  ✗ ${f}`);
    }
    console.log('');
  }

  console.log(`  INTEGRITY CHECK:  ${verification.integrity_check}`);
  console.log('');

  if (verification.integrity_check === 'PASS') {
    console.log('Ready for Closed Beta');
  } else {
    console.log('Not Ready for Closed Beta');
  }

  console.log(`${line}`);
}

// ── Step 9: Write Report ───────────────────────────────────

function writeReport(
  admin: AuthUser,
  fkCleanup: { moderation_log: number; rate_limits: number },
  authResult: { deleted: number; failed: DeleteResult[]; total: number },
  storageAudits: StorageBucketAudit[],
  storageCleanup: { deleted: number; errors: string[] },
  verification: VerificationResult
): string {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  const lines: string[] = [];
  lines.push('# TAGA Beta Reset — Resume Report');
  lines.push('');
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Project:** ${SUPABASE_URL}`);
  lines.push(`**Admin UUID:** ${admin.id}`);
  lines.push(`**Admin Email:** ${admin.email}`);
  lines.push('');
  lines.push('## FK-Blocking Table Cleanup');
  lines.push('');
  lines.push('| Table | Rows Deleted |');
  lines.push('|-------|-------------|');
  lines.push(`| moderation_log | ${fkCleanup.moderation_log} |`);
  lines.push(`| rate_limits | ${fkCleanup.rate_limits} |`);
  lines.push('');
  lines.push('## Auth User Deletion');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Attempted | ${authResult.total} |`);
  lines.push(`| Deleted | ${authResult.deleted} |`);
  lines.push(`| Failed | ${authResult.failed.length} |`);
  lines.push('');

  if (authResult.failed.length > 0) {
    lines.push('### Failed Deletions');
    lines.push('');
    lines.push('| Email | UUID | Error |');
    lines.push('|-------|------|-------|');
    for (const f of authResult.failed) {
      lines.push(`| ${f.email} | ${f.uuid} | ${f.error} |`);
    }
    lines.push('');
  }

  lines.push('## Storage Audit (Post-Resume)');
  lines.push('');
  lines.push('| Bucket | Total | Non-Admin | Admin | Size | Unknown |');
  lines.push('|--------|-------|-----------|-------|------|---------|');
  for (const a of storageAudits) {
    lines.push(`| ${a.bucket} | ${a.total_objects} | ${a.to_delete} | ${a.admin_objects} | ${fmtBytes(a.total_size)} | ${a.unknown_size_count} |`);
  }
  lines.push('');
  lines.push(`**Storage files deleted:** ${storageCleanup.deleted}`);
  lines.push(`**Storage errors:** ${storageCleanup.errors.length}`);
  lines.push('');

  lines.push('## Verification');
  lines.push('');
  lines.push('| Check | Result | Expected |');
  lines.push('|-------|--------|----------|');
  lines.push(`| Remaining Auth users | ${verification.remaining_auth_users} | 1 |`);
  lines.push(`| Remaining public users | ${verification.remaining_public_users} | 1 |`);
  lines.push(`| Remaining admins | ${verification.remaining_admins} | 1 |`);
  lines.push(`| Admin email | ${verification.admin_email} | ${ADMIN_EMAIL} |`);
  lines.push(`| Admin UUID match | ${verification.admin_uuid_match} | true |`);
  lines.push(`| Non-admin Auth users | ${verification.non_admin_auth_users} | 0 |`);
  lines.push(`| Non-admin public users | ${verification.non_admin_public_users} | 0 |`);
  lines.push(`| Orphaned FK count | ${verification.orphaned_fk_count} | 0 |`);
  lines.push(`| Non-admin storage objects | ${verification.non_admin_storage_objects} | 0 |`);
  lines.push(`| **Integrity Check** | **${verification.integrity_check}** | **PASS** |`);
  lines.push('');

  if (verification.failures.length > 0) {
    lines.push('### Failures');
    lines.push('');
    for (const f of verification.failures) {
      lines.push(`- ✗ ${f}`);
    }
    lines.push('');
  }

  const content = lines.join('\n');
  const filename = `beta-reset-resume-${TIMESTAMP}.md`;
  const filepath = path.join(REPORT_DIR, filename);
  fs.writeFileSync(filepath, content, 'utf-8');
  log(`Report written: ${filepath}`);

  return filepath;
}

// ── Main ───────────────────────────────────────────────────

async function main() {
  banner('TAGA Beta Reset — Resume / Retry');

  console.log('  This script will:');
  console.log('  1. Clean FK-blocking tables (moderation_log, rate_limits)');
  console.log('  2. Retry deleting remaining non-admin auth users');
  console.log('  3. Recursively re-audit and clean storage');
  console.log('  4. Run strict verification');
  console.log('');
  console.log('  Database cleanup RPC will NOT be re-run.');
  console.log('  Schema, RLS, and platform config will NOT be touched.');
  console.log('');

  // Validate environment
  validateEnv();

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Step 1: Resolve admin
  const admin = await resolveAdminUuid(supabase);

  // Step 2: Clean FK-blocking tables
  const fkCleanup = await cleanFkBlockingTables(supabase, admin.id);

  // Step 3: Delete remaining auth users
  const authResult = await deleteRemainingAuthUsers(supabase, admin.id);

  // Step 4: Recursive storage audit
  const storageAudits = await auditAllStorage(supabase, admin.id);

  // Step 5: Delete remaining non-admin storage
  const storageCleanup = await deleteRemainingStorage(supabase, storageAudits);

  // Step 6: Re-audit storage after cleanup
  const postStorageAudits = await auditAllStorage(supabase, admin.id);

  // Step 7: Strict verification
  const verification = await strictVerification(supabase, admin.id, postStorageAudits);

  // Step 8: Print summary
  printSummary(admin, fkCleanup, authResult, postStorageAudits, storageCleanup, verification);

  // Step 9: Write report
  const reportPath = writeReport(admin, fkCleanup, authResult, postStorageAudits, storageCleanup, verification);

  // Exit with appropriate code
  if (verification.integrity_check === 'PASS') {
    log('Resume completed. Integrity check PASSED.');
    safeExit(0);
  } else {
    error('Resume completed. Integrity check FAILED.');
    error('See report for details.');
    safeExit(1);
  }
}

main().catch((err) => {
  if (err && err.message === 'exit') return;
  error(`Fatal error: ${err.message}`);
  console.error(err.stack);
  safeExit(1);
});
