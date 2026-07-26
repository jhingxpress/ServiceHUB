# TAGA Closed Beta Database Reset Guide

## Overview

This guide walks you through the complete beta reset process for the TAGA (ServiceHub) Supabase project. The reset removes all non-admin user data while preserving the admin account (`jhingxpress`) and all platform configuration/seed data.

## Prerequisites

1. **Supabase Dashboard access** — you need the Service Role key
2. **Node.js 18+** — for running the TypeScript utility
3. **pg_dump** (optional) — for automatic database backup
4. **Supabase CLI** (optional) — for applying the SQL migration

## Files Created

| File | Purpose |
|------|---------|
| `scripts/beta-reset.ts` | Main TypeScript utility (orchestrates all steps) |
| `scripts/beta-reset-audit.sql` | Standalone SQL audit queries |
| `scripts/beta-reset-verify.sql` | Standalone SQL verification queries |
| `supabase/migrations/20260725130000_beta_reset_function.sql` | SQL function for transactional cleanup |
| `.env.beta-reset.example` | Environment variable template |

## Setup

### 1. Install Dependencies

```bash
npm install
```

This installs `tsx` (TypeScript runner) and `@types/node` added to `devDependencies`.

### 2. Create Environment File

```bash
cp .env.beta-reset.example .env.beta-reset
```

Edit `.env.beta-reset` and fill in:

```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_EMAIL=jhingxpress@gmail.com
SUPABASE_DB_URL=postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```

- **SUPABASE_URL**: Found in Dashboard → Settings → API → Project URL
- **SUPABASE_SERVICE_ROLE_KEY**: Found in Dashboard → Settings → API → service_role key
- **SUPABASE_DB_URL** (optional): Found in Dashboard → Settings → Database → Connection string. Enables automatic `pg_dump` backup.

### 3. Apply the SQL Migration

The `run_beta_reset()` function must exist in the database before running the utility.

**Option A — Supabase CLI:**
```bash
supabase db push
```

**Option B — Supabase SQL Editor:**
1. Open Supabase Dashboard → SQL Editor
2. Copy the contents of `supabase/migrations/20260725130000_beta_reset_function.sql`
3. Paste and click Run

## Execution

### Step 1: Dry Run (Audit Only)

```bash
npm run beta-reset
```

This will:
- Validate your environment configuration
- Resolve the admin UUID from the database
- Run a full audit of all table row counts
- Generate an audit report in `reports/beta-reset/`
- **No data will be deleted**

Review the generated report before proceeding.

### Step 2: Manual Backup (if not using auto-backup)

If `SUPABASE_DB_URL` is not set, create a manual backup:

1. Go to Supabase Dashboard → Settings → Database
2. Click "Create Backup" or use `pg_dump` manually:
   ```bash
   pg_dump "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres" > backup.sql
   ```
3. Verify the backup file is non-trivial in size (> 100KB)

### Step 3: Execute the Reset

```bash
npm run beta-reset:execute
```

This will:
1. **Validate** environment and resolve admin UUID
2. **Audit** pre-cleanup state (row counts per table)
3. **Backup** the database via `pg_dump` (if `SUPABASE_DB_URL` is set)
4. **Delete** all non-admin data via the `run_beta_reset()` SQL function (transactional)
5. **Delete** auth users via Supabase Auth Admin API
6. **Clean** storage files from all buckets (non-admin files only)
7. **Verify** post-cleanup state
8. **Generate** a final report in `reports/beta-reset/`

### Step 4: Post-Cleanup Verification

Run the standalone verification SQL in the Supabase SQL Editor:

1. Open Supabase Dashboard → SQL Editor
2. Copy the contents of `scripts/beta-reset-verify.sql`
3. Paste and click Run
4. Verify:
   - `remaining_auth_users` = 1
   - `remaining_admins` = 1
   - `non_admin_users_remaining` = 0
   - `integrity_check` = PASS

## What Gets Deleted

### User Data (all non-admin)
- `auth.users` (except admin)
- `public.users` (except admin)
- `public.providers` (except admin's provider record)
- `public.services`, `service_options`, `service_images`
- `public.bookings`, `booking_incident_reports`, `provider_live_locations`
- `public.reviews`, `review_media`
- `public.messages`, `payments`
- `public.disputes`, `reports`
- `public.notifications`, `favorite_providers`
- `public.user_push_tokens`, `saved_locations`
- `public.servicehub_tips` (non-admin user_id)
- `public.provider_documents`, `provider_gallery`, `provider_portfolio`
- `public.provider_badges`, `provider_stats`, `provider_verification_logs`
- `public.provider_views`, `provider_performance`, `provider_score`
- `public.provider_analytics`, `provider_checklist`
- `public.availability`, `provider_categories`
- `public.featured_requests`, `featured_payments`
- `public.provider_platform_fees`, `platform_fee_payments`
- `public.staff_action_log`, `escalations`

### Storage Files (all non-admin)
- `avatars` bucket — files not in admin's folder
- `provider-documents` bucket — files not in admin's folder
- `provider-profile-images` bucket — files not in admin's folder
- `provider-cover-images` bucket — files not in admin's folder
- `booking-photos` bucket — all files (all bookings deleted)
- `chat-media` bucket — all files (all bookings deleted)

## What Gets Preserved

- **Admin account**: `jhingxpress@gmail.com` (resolved by UUID, not just email)
- **Platform configuration**: `platform_config` table
- **Fee schedule**: `platform_fee_schedule` table
- **Categories**: `categories` table (hierarchical seed data)
- **Service catalog**: `service_groups`, `service_templates` tables
- **RLS policies**: All row-level security policies remain intact
- **Database schema**: No tables, columns, or constraints are modified
- **Migrations**: All migration history is preserved

## Deletion Order (Dependency Graph)

The cleanup follows a strict dependency-ordered sequence to avoid foreign key violations:

```
Phase 1: RESTRICT constraints
  └─ platform_fee_payments → provider_platform_fees
     (booking_id has ON DELETE RESTRICT, must delete fees before bookings)

Phase 2: NO ACTION references
  └─ booking_incident_reports.reviewed_by → SET NULL
     (no ON DELETE clause, defaults to NO ACTION)

Phase 3: Booking-related (bottom-up)
  └─ booking_incident_reports → provider_live_locations →
     review_media → reviews → messages → payments →
     disputes → reports → bookings

Phase 4: Provider-related (bottom-up)
  └─ service_images → service_options → services →
     provider_views → provider_performance → provider_score →
     provider_analytics → provider_checklist → provider_portfolio →
     provider_gallery → provider_documents → provider_badges →
     provider_stats → provider_verification_logs → availability →
     featured_payments → featured_requests → provider_categories

Phase 5: User-related
  └─ notifications → favorite_providers → saved_locations →
     user_push_tokens → servicehub_tips → staff_action_log →
     escalations

Phase 6: Core records
  └─ providers → public.users

Phase 7: Auth users (via Admin API, outside SQL transaction)
  └─ auth.users (except admin UUID)
```

## Code Quality Features

- **Idempotent**: Running multiple times produces the same result (DELETE WHERE != admin_uuid)
- **Transactional**: The SQL function runs in a single transaction — rollback on any error
- **Logging**: Console output at every step + written reports in `reports/beta-reset/`
- **Error handling**: Validates admin UUID exists before any deletion; aborts on backup failure
- **No hardcoded IDs**: Admin UUID is resolved at runtime from the email
- **No schema changes**: No ALTER TABLE, no DROP TABLE, no RLS modifications
- **Service role key**: Uses service_role to bypass RLS (required for cross-table deletion)

## Manual Steps (if needed)

### If auth.users deletion fails

The SQL function handles `public.*` tables, but `auth.users` must be deleted via the Auth Admin API. The TypeScript script handles this automatically. If it fails:

1. Go to Supabase Dashboard → Authentication → Users
2. Manually delete each non-admin user
3. Re-run `npm run beta-reset:execute` (idempotent — will clean up any remaining public data)

### If storage cleanup fails

The TypeScript script attempts to delete files from all 6 storage buckets. If it fails:

1. Go to Supabase Dashboard → Storage
2. Manually delete files in each bucket that don't belong to the admin user
3. The admin's files are in folders named with their UUID

### If the SQL function doesn't exist

Apply the migration manually via SQL Editor:
1. Copy `supabase/migrations/20260725130000_beta_reset_function.sql`
2. Paste in Supabase SQL Editor → Run

## Reusability

This utility is designed for repeated use across beta cycles:

1. Beta 1 ends → run `npm run beta-reset:execute`
2. Invite Beta 2 users
3. Beta 2 ends → run `npm run beta-reset:execute` again
4. Repeat

Each run:
- Resolves the admin UUID fresh (in case it changes)
- Captures pre/post counts
- Generates timestamped reports in `reports/beta-reset/`
- Is fully idempotent (safe to re-run if a previous run failed)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Missing required environment variables` | Create `.env.beta-reset` from `.env.beta-reset.example` |
| `Admin UUID not found` | Verify `ADMIN_EMAIL` is correct and the user exists in `public.users` |
| `function run_beta_reset does not exist` | Apply the SQL migration first (see Setup step 3) |
| `Backup failed` | Set `SUPABASE_DB_URL` or create manual backup via Dashboard |
| `RLS policy violation` | Ensure you're using the service_role key, not the anon key |
| `Storage deletion error` | Check bucket permissions; service_role should have full access |
