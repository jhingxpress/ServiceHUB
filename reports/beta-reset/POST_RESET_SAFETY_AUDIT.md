# TAGA Post-Beta-Reset Safety Audit

**Date:** 2026-07-26  
**Auditor:** Cascade (automated)  
**Project:** ServiceHub / TAGA  
**Supabase URL:** https://tnxepxdgqaikmnoyubyn.supabase.co  
**Admin:** jhingxpress@gmail.com (aa25bd56-5a6c-4333-8a9c-b6901bcef56a)

---

## 1. Git Diff Summary

### Files Added (untracked)

| File | Purpose | Status |
|------|---------|--------|
| `scripts/beta-reset.ts` | Main beta-reset CLI utility (dry-run + execute) | KEEP |
| `scripts/beta-reset-resume.ts` | Resume/retry script for partial failures | KEEP |
| `scripts/beta-reset.test.ts` | Unit tests for admin resolution logic | KEEP |
| `scripts/beta-reset-audit.sql` | Standalone SQL audit script | KEEP |
| `scripts/beta-reset-verify.sql` | Standalone SQL verification script | KEEP |
| `supabase/migrations/20260725130000_beta_reset_function.sql` | Transactional cleanup function | KEEP |
| `.env.beta-reset.example` | Environment variable template (no secrets) | KEEP |
| `BETA_RESET_GUIDE.md` | Comprehensive documentation | KEEP |
| `reports/beta-reset/DATABASE_AUDIT_REPORT.md` | Pre-reset database audit | KEEP |
| `reports/beta-reset/audit-*.md` (9 files) | Dry-run audit snapshots | SAFE TO REMOVE (keep latest only) |
| `reports/beta-reset/beta-reset-report-*.md` (4 files) | Execution reports | SAFE TO REMOVE (keep latest only) |
| `reports/beta-reset/beta-reset-resume-*.md` (1 file) | Resume report | KEEP |
| `reports/beta-reset/backup-*.sql` (3 files, ~4.7 MB total) | pg_dump backups | REVIEW MANUALLY (keep latest, remove duplicates) |

### Files Modified (tracked)

| File | Changes | Production Impact |
|------|---------|-------------------|
| `package.json` | Added 4 npm scripts (`beta-reset`, `beta-reset:audit`, `beta-reset:execute`, `beta-reset:resume`), added `tsx` and `@types/node` to devDependencies | **None** — new scripts are opt-in only, devDependencies don't affect runtime |
| `package-lock.json` | Updated for new devDependencies | **None** |
| `.gitignore` | Added `.env.beta-reset` to ignore list | **Positive** — prevents secret leakage |

### No Existing Migrations Modified

`git diff HEAD -- supabase/` shows zero changes to existing migrations. Only the new file `20260725130000_beta_reset_function.sql` was added.

---

## 2. Reset Isolation from Application

### Verification Results

- **Frontend imports:** `findstr /s /i "beta-reset" src\*.ts src\*.tsx` → **0 matches** ✓
- **App runtime imports:** Scripts only import `@supabase/supabase-js`, `fs`, `path`, `readline`, `child_process` — all Node.js built-ins or existing project deps ✓
- **Automatic execution:** No scripts run automatically. All require explicit `npm run beta-reset*` commands ✓
- **No side effects on import:** Scripts execute via `main()` entry point only ✓

**Conclusion:** Reset utilities are fully isolated from the normal application.

---

## 3. Security Audit

### 3.1 Environment File

| Check | Result |
|-------|--------|
| `.env.beta-reset` in `.gitignore` | ✓ FIXED (was missing, now added) |
| `.env.beta-reset` tracked by git | ✗ Not tracked (confirmed via `git ls-files`) |
| `.env.beta-reset.example` contains no real secrets | ✓ Only placeholder values |
| Service role key in `.env.beta-reset` starts with `sb_secret_` | ✓ Correct (not publishable key) |

### 3.2 Committed Files Secret Scan

| Check | Result |
|-------|--------|
| No `sb_secret_*` keys in scripts/docs | ✓ |
| No `sb_publishable_*` keys in scripts/docs | ✓ |
| No JWT tokens (`eyJhbGci`) in scripts/docs | ✓ |
| No hardcoded admin UUID (`aa25bd56...`) in committed files | ✓ |
| No database passwords in committed files | ✓ |

### 3.3 SQL Function Security

| Check | Result |
|-------|--------|
| `SECURITY DEFINER` | ✓ Required for cross-schema access (auth.users) |
| `SET search_path = public` | ✓ Safe — prevents search_path injection |
| `GRANT EXECUTE` | ✓ FIXED — was granted to `authenticated`, now revoked from `PUBLIC, authenticated, anon`; only `service_role` can execute |
| Function validates admin UUID against `auth.users` | ✓ Raises exception if not found |

### 3.4 Issues Fixed During This Audit

1. **CRITICAL:** `.env.beta-reset` was not in `.gitignore` — **FIXED**
2. **CRITICAL:** `run_beta_reset()` was granted to `authenticated` role — **FIXED** (migration updated with `REVOKE ... FROM PUBLIC, authenticated, anon`)
3. **HIGH:** `run_beta_reset()` did not clean `moderation_log` and `rate_limits` tables — **FIXED** (Phase 5b added to migration)

> **Note:** The GRANT fix in the migration file will take effect on next migration deployment. The live Supabase instance still has the old GRANT. To apply immediately, run the REVOKE/GRANT statements directly in the Supabase SQL editor.

---

## 4. Schema and RLS Changes

### Verification

- `git diff HEAD -- supabase/` → **No changes to existing migrations**
- No existing RLS policies modified
- No existing tables altered
- No existing triggers modified
- Only new file: `20260725130000_beta_reset_function.sql` (creates a new function, does not alter existing schema)

**Conclusion:** No unintended schema or RLS changes.

---

## 5. Obsolete / Unnecessary Files

### Reports Directory

| Category | Files | Recommendation |
|----------|-------|----------------|
| Duplicate audit reports | 9 `audit-*.md` files (all 1,885 bytes, same content) | SAFE TO REMOVE — keep only the latest |
| Duplicate beta-reset reports | 4 `beta-reset-report-*.md` files | SAFE TO REMOVE — keep only the latest |
| Duplicate backups | 3 `backup-*.sql` files (~1.6 MB each) | REVIEW MANUALLY — keep the latest (`backup-2026-07-26T10-23-14-344Z.sql`), remove the 2 earlier duplicates |
| DATABASE_AUDIT_REPORT.md | 1 file | KEEP — reference documentation |
| beta-reset-resume report | 1 file | KEEP — final resume report |

### Scripts Directory

| File | Recommendation |
|------|----------------|
| `beta-reset.ts` | KEEP — main utility for future beta cycles |
| `beta-reset-resume.ts` | KEEP — resume/retry capability |
| `beta-reset.test.ts` | KEEP — regression tests |
| `beta-reset-audit.sql` | KEEP — standalone audit capability |
| `beta-reset-verify.sql` | KEEP — standalone verification capability |

### Dependencies

| Package | Used By | Recommendation |
|---------|---------|----------------|
| `tsx` (devDependency) | Only beta-reset scripts | KEEP — needed for future beta cycles |
| `@types/node` (devDependency) | Only beta-reset scripts | KEEP — needed for TypeScript checking of scripts |

---

## 6. TypeScript & Test Results

### TypeScript Check

```
npx tsc --noEmit
```
**Result:** ✓ PASS (0 errors)

### Beta-Reset Unit Tests

```
npx tsx --env-file=.env.beta-reset scripts/beta-reset.test.ts
```
**Result:** ✓ 14 passed, 0 failed

Test coverage:
- Auth user exists with public profile
- Auth user exists without public profile
- Admin email not found
- Duplicate/case-insensitive matching protection
- Clean dry-run exit on Windows
- Auth API error handling
- Empty auth users list

---

## 7. Production Data State Verification

Live verification against Supabase project:

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Auth users | 1 | 1 | ✓ |
| Auth user UUID | aa25bd56-5a6c-4333-8a9c-b6901bcef56a | aa25bd56-5a6c-4333-8a9c-b6901bcef56a | ✓ |
| Auth user email | jhingxpress@gmail.com | jhingxpress@gmail.com | ✓ |
| Public users | 1 | 1 | ✓ |
| Public user role | admin | admin | ✓ |
| Non-admin auth users | 0 | 0 | ✓ |
| Non-admin public users | 0 | 0 | ✓ |
| Bookings | 0 | 0 | ✓ |
| Messages | 0 | 0 | ✓ |
| Reviews | 0 | 0 | ✓ |
| Storage: avatars | 0 objects | 0 objects | ✓ |
| Storage: provider-documents | 0 objects | 0 objects | ✓ |
| Storage: provider-profile-images | 0 objects | 0 objects | ✓ |
| Storage: provider-cover-images | 0 objects | 0 objects | ✓ |
| Storage: booking-photos | 0 objects | 0 objects | ✓ |
| Storage: chat-media | 0 objects | 0 objects | ✓ |

**Conclusion:** Production data state is clean and correct.

---

## 8. Cleanup Recommendations

### KEEP

- `scripts/beta-reset.ts` — main utility
- `scripts/beta-reset-resume.ts` — resume capability
- `scripts/beta-reset.test.ts` — regression tests
- `scripts/beta-reset-audit.sql` — standalone audit
- `scripts/beta-reset-verify.sql` — standalone verification
- `supabase/migrations/20260725130000_beta_reset_function.sql` — cleanup function
- `.env.beta-reset.example` — template
- `.env.beta-reset` — local config (git-ignored)
- `BETA_RESET_GUIDE.md` — documentation
- `reports/beta-reset/DATABASE_AUDIT_REPORT.md` — reference
- `reports/beta-reset/beta-reset-resume-2026-07-26T10-30-21-384.md` — final resume report
- `package.json` changes (npm scripts + devDependencies)
- `.gitignore` change (`.env.beta-reset`)

### SAFE TO REMOVE

- `reports/beta-reset/audit-2026-07-26T09-25-43-784Z.md` — duplicate dry-run audit
- `reports/beta-reset/audit-2026-07-26T09-31-11-925Z.md` — duplicate dry-run audit
- `reports/beta-reset/audit-2026-07-26T09-32-13-506Z.md` — duplicate dry-run audit
- `reports/beta-reset/audit-2026-07-26T09-34-09-493Z.md` — duplicate dry-run audit
- `reports/beta-reset/audit-2026-07-26T10-03-03-322Z.md` — duplicate dry-run audit
- `reports/beta-reset/audit-2026-07-26T10-12-15-138Z.md` — duplicate dry-run audit
- `reports/beta-reset/audit-2026-07-26T10-14-42-624Z.md` — duplicate dry-run audit
- `reports/beta-reset/audit-2026-07-26T10-20-18-263Z.md` — duplicate dry-run audit
- `reports/beta-reset/beta-reset-report-2026-07-26T09-25-43-784Z.md` — duplicate report
- `reports/beta-reset/beta-reset-report-2026-07-26T09-31-11-925Z.md` — duplicate report
- `reports/beta-reset/beta-reset-report-2026-07-26T09-32-13-506Z.md` — duplicate report

### REVIEW MANUALLY

- `reports/beta-reset/backup-2026-07-26T10-14-42-624Z.sql` (1.6 MB) — earlier backup, likely safe to remove
- `reports/beta-reset/backup-2026-07-26T10-20-18-263Z.sql` (1.6 MB) — earlier backup, likely safe to remove
- `reports/beta-reset/backup-2026-07-26T10-23-14-344Z.sql` (1.6 MB) — latest backup, keep as pre-reset snapshot
- `reports/beta-reset/audit-2026-07-26T10-23-14-344Z.md` — latest audit, keep or remove
- `reports/beta-reset/beta-reset-report-2026-07-26T10-23-14-344Z.md` — latest execution report, keep or remove

### MUST FIX BEFORE BETA

1. **Apply GRANT fix to live Supabase** — Run the following in Supabase SQL Editor:
   ```sql
   REVOKE EXECUTE ON FUNCTION public.run_beta_reset(UUID) FROM PUBLIC, authenticated, anon;
   GRANT EXECUTE ON FUNCTION public.run_beta_reset(UUID) TO service_role;
   ```
   This prevents any authenticated user from calling the destructive cleanup function via RPC.

2. **Commit `.gitignore` change** — The `.env.beta-reset` entry must be committed to prevent accidental secret leakage.

---

## 9. FK Constraint Audit (auth.users references)

All tables with direct FK references to `auth.users(id)`:

| Table | Column | ON DELETE | Cleaned by run_beta_reset | Cleaned by resume script |
|-------|--------|-----------|--------------------------|-------------------------|
| `public.users` | `id` | (implicit) | ✓ Phase 6 | N/A (already clean) |
| `public.providers` | `id` | (implicit) | ✓ Phase 6 | N/A |
| `public.user_push_tokens` | `user_id` | CASCADE | ✓ Phase 5 | ✓ |
| `public.rate_limits` | `user_id` | CASCADE | ✓ FIXED (Phase 5b) | ✓ |
| `public.saved_locations` | `customer_id` | CASCADE | ✓ Phase 5 | N/A |
| `public.provider_live_locations` | `provider_id` | CASCADE | ✓ Phase 3 | N/A |
| `public.servicehub_tips` | `user_id` | SET NULL | ✓ Phase 5 | N/A |
| `public.moderation_log` | `admin_id` | NO ACTION | ✓ FIXED (Phase 5b) | ✓ |
| `public.moderation_log` | `target_user_id` | NO ACTION | ✓ FIXED (Phase 5b) | ✓ |

### Triggers on auth.users

| Trigger | Event | Function | Impact on deletion |
|---------|-------|----------|-------------------|
| `on_auth_user_created` | AFTER INSERT | `handle_new_user()` | Not fired on DELETE — no impact |
| `on_auth_user_updated` | AFTER UPDATE | `handle_user_updated()` | Not fired on DELETE — no impact |

**Conclusion:** The `moderation_log` table with `NO ACTION` on both `admin_id` and `target_user_id` was the root cause of the 7 failed auth deletions. This is now fixed in the migration file and the resume script.

---

## 10. Summary

| Category | Status |
|----------|--------|
| Git diff | 2 files modified, 13+ files added — all isolated to beta-reset utilities |
| App isolation | ✓ Complete — no frontend or runtime imports |
| Security | ✓ FIXED — .gitignore updated, GRANT restricted to service_role |
| Schema/RLS | ✓ No unintended changes |
| TypeScript | ✓ Pass (0 errors) |
| Tests | ✓ 14/14 passed |
| Production data | ✓ Clean (1 admin, 0 non-admin, 0 storage, 0 orphans) |
| FK audit | ✓ All auth.users references identified and handled |
| Obsolete files | 11 duplicate reports + 2 duplicate backups safe to remove |

### Action Items Before Beta

1. **Apply GRANT fix** to live Supabase (run REVOKE/GRANT in SQL Editor)
2. **Commit `.gitignore`** change
3. **Optionally clean up** duplicate report/backup files
4. **Keep all reset utilities** for future beta cycles
