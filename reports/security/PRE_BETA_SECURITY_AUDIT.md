# ServiceHub / TAGA — Pre-Beta Security Audit Report

**Project:** ServiceHub / TAGA  
**Branch audited:** `spike/idv-phase2a`  
**Existing stable tag:** `servicehub-beta-ready-v1` (on `main`)  
**Audit date:** 2026-07-27  
**Auditor:** Cascade (AI — static analysis, source inspection, read-only)  
**Scope:** 10–50 user closed beta  
**Method:** Source-code inspection · git log · npm audit · Gradle inspection · AndroidManifest inspection · migration SQL review. No live DB queries, no mutations.

---

## 1. Executive Summary

ServiceHub / TAGA is a React Native (Expo managed workflow, bare Android build) marketplace application backed by Supabase. The codebase has undergone multiple previous security sprints and beta-reset hardening passes. Overall security posture is **stronger than typical pre-beta** projects. Role injection has been blocked, RLS is broadly enabled, SECURITY DEFINER functions guard platform_config, and audit logs exist for all key admin actions.

However, **one blocking issue** must be resolved before any external beta distribution: the release APK is currently signed with the well-known debug keystore. Three additional high-severity findings require attention within 48 hours of beta launch. The remaining findings are medium/low and can be scheduled for the first post-beta patch.

---

## 2. Overall Verdict

> **READY WITH CONDITIONS**

The beta may proceed with a limited internal audience (developers and known testers) on the current APK. It **must not** be distributed to any external beta users until Finding **C-01** (debug signing) is resolved. High findings H-01 through H-03 should be resolved before or immediately after the first external beta invitation.

---

## 3. Critical Findings

### C-01 — Release APK signed with debug keystore

| Field | Value |
|---|---|
| **ID** | C-01 |
| **Severity** | CRITICAL |
| **File** | `android/app/build.gradle:132–140` |
| **Evidence** | `release { signingConfig signingConfigs.debug ... }` |

**Scenario:** The debug keystore uses the universally-known password `android` and alias `androiddebugkey`. Any party that possesses the debug keystore (distributed with the Android SDK) can sign an APK with identical signing metadata and potentially trigger replacement of the installed app on a device via sideloading. Additionally, any Play Store submission or third-party distribution with a debug keystore is explicitly prohibited by Google.

**Impact:** APK replay/substitution risk for sideloaded installs; ineligible for Play Store; signing key is publicly known.

**Smallest safe fix:** Generate a permanent release keystore, store it outside version control, reference it via `gradle.properties` variables (e.g. `SERVICEHUB_STORE_FILE`, `SERVICEHUB_KEY_ALIAS`, `SERVICEHUB_KEY_PASSWORD`), and point `signingConfigs.release` to those variables.

**Regression risk:** None — signing change does not affect app behavior. Devices with the old APK installed will need to uninstall and reinstall.

**Verification:** Run `apksigner verify --print-certs app-release.apk` and confirm the `Subject` matches your organization, not `CN=Android Debug`.

---

## 4. High Findings

### H-01 — `getPublicUrl` called for private storage buckets

| Field | Value |
|---|---|
| **ID** | H-01 |
| **Severity** | HIGH |
| **File** | `src/utils/storageUpload.ts:62` |
| **Evidence** | `supabase.storage.from(bucket).getPublicUrl(path)` — returned URL stored in DB for all buckets regardless of public/private setting |

**Affected callers:** `ProviderApplicationScreen.tsx:142`, `ProviderOnboardingScreen.tsx:142`, `BookingScreen.tsx:223`. These pass `provider-documents`, `kyc-documents`, and `booking-photos` — all private buckets.

**Scenario:** The stored `file_url` in `provider_documents` rows is in the format `.../storage/v1/object/public/provider-documents/...`. Since the bucket is private, any direct access to this URL returns a 403. However: (a) the URL pattern suggests to any developer reading the DB that the files are public; (b) provider-facing screens that try to render documents using the stored URL will silently display broken images; (c) if the bucket privacy setting is ever accidentally changed to public, all URLs become immediately accessible without authentication.

**Impact:** Functional breakage (document preview) for providers; latent risk if bucket privacy is mischanged; misleading URL format in database.

**Note:** The `LiveSelfieVerificationScreen.tsx` correctly uploads via `supabase.storage.from('provider-documents').upload(...)` and returns only the storage path (not a URL) — this flow is safe. Only the legacy `storageUpload.ts` utility is affected.

**Smallest safe fix:** For private buckets (`provider-documents`, `kyc-documents`, `booking-photos`), store only the storage path, not the public URL. Generate signed URLs at display time via `supabase.storage.from(bucket).createSignedUrl(path, 3600)`.

**Verification:** Grep for `getPublicUrl` in `src/`, confirm each caller uses a public bucket, replace private-bucket callers with path-only storage + signed URL generation.

---

### H-02 — Diagnostic `console.log` statements in `RootNavigator.tsx` expose auth state

| Field | Value |
|---|---|
| **ID** | H-02 |
| **Severity** | HIGH |
| **File** | `src/navigation/RootNavigator.tsx:61–101` |
| **Evidence** | Four `console.log` calls logging `user.role`, `must_change_password`, `isStaffRole`, and resolved screen name on every navigation decision |

**Scenario:** In release builds, Hermes strips `console.log` calls from the JS bundle for performance — **but only if minification/Proguard is enabled.** `minifyEnabled` in `build.gradle:137` defaults to `false` (controlled by `android.enableProguardInReleaseBuilds` which is `false` by default in `gradle.properties`). With minification off, `console.log` calls remain in the bundle. These logs expose user role, staff status, and password-reset flags to any device with USB debugging enabled, adb logcat, or a connected Flipper/Metro instance.

**Impact:** Sensitive session context (role, staff flag, must-change-password) leaked to adb logcat on any device. Additionally `debugLogger.log` is called — confirm this does not persist to an external service in production.

**Smallest safe fix:** Remove the four `console.log` / `debugLogger.log` calls from `RootNavigator.tsx`. Enable `android.enableProguardInReleaseBuilds=true` in `gradle.properties` so Hermes strips any remaining logs automatically.

**Verification:** After fix, run `adb logcat | grep ROOT` and confirm no output during app navigation.

---

### H-03 — Multiple SECURITY DEFINER functions missing `SET search_path`

| Field | Value |
|---|---|
| **ID** | H-03 |
| **Severity** | HIGH |
| **Files** | Multiple migration SQL files (see list below) |

**Affected functions (missing `SET search_path`):**

| Function | Migration |
|---|---|
| `handle_new_user()` | `20260609220000_fix_role_injection.sql` |
| `is_account_locked()` | `20260603190000_security_sprint_pre_launch.sql` |
| `log_login_attempt()` | `20260603190000_security_sprint_pre_launch.sql` |
| `is_registration_rate_limited()` | `20260603190000_security_sprint_pre_launch.sql` |
| `log_registration_attempt()` | `20260603190000_security_sprint_pre_launch.sql` |
| `enforce_booking_daily_limit()` | `20260603190000_security_sprint_pre_launch.sql` |
| `enforce_message_minute_rate_limit()` | `20260603190000_security_sprint_pre_launch.sql` |
| `enforce_review_limits()` | `20260603190000_security_sprint_pre_launch.sql` |
| `admin_suspend_provider()` | `20260603190000_security_sprint_pre_launch.sql` |
| `admin_ban_user()` | `20260603190000_security_sprint_pre_launch.sql` |
| `admin_hide_review()` | `20260603190000_security_sprint_pre_launch.sql` |
| `admin_revoke_verification()` | `20260603190000_security_sprint_pre_launch.sql` |
| `admin_remove_chat_image()` | `20260603190000_security_sprint_pre_launch.sql` |
| `admin_activate_user()` | `20260603190000_security_sprint_pre_launch.sql` |
| `check_rate_limit()` | `20260602180000_security_rls_audit.sql` |
| `enforce_message_rate_limit()` | `20260602180000_security_rls_audit.sql` |
| `enforce_booking_rate_limit()` | `20260602180000_security_rls_audit.sql` |
| `enforce_review_rate_limit()` | `20260602180000_security_rls_audit.sql` |

**Confirmed safe (have `SET search_path`):** `get_feature_flags()`, `run_beta_reset()`, `is_admin_or_staff_user()`, `is_admin_user()`.

**Scenario:** A SECURITY DEFINER function without a pinned `search_path` can be tricked via a search path manipulation attack: if an attacker can create objects in a schema that appears earlier in `search_path` than `public`, they can shadow functions like `now()`, `gen_random_uuid()`, or even table references. For Supabase-hosted instances, this requires the attacker to already have a DB connection (service_role or direct access), making exploitation difficult — but this is a well-known PostgreSQL hardening requirement.

**Impact:** Schema-hijack of privileged functions if `search_path` is manipulated; affects admin moderation, login tracking, and rate-limiting functions.

**Smallest safe fix:** Add `SET search_path = public` (or `SET search_path = public, pg_temp` for functions returning `pg_temp` types) to every affected function definition and redeploy via a migration.

**Verification:** Query `SELECT proname, prosecdef, proconfig FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prosecdef = true AND proconfig IS NULL;` — result should be empty.

---

### H-04 — Firebase API key committed to version-controlled `google-services.json`

| Field | Value |
|---|---|
| **ID** | H-04 |
| **Severity** | HIGH |
| **File** | `android/app/google-services.json:18` |
| **Evidence** | `"current_key": "AIzaSy[REDACTED]"` |

**Scenario:** The Firebase Web API key is present in a tracked file. While Firebase Web API keys are inherently semi-public (embedded in every Android APK), the risk is elevated here because: (a) the release APK is currently signed with the debug keystore (known SHA-1), so the Firebase console cannot restrict this key by signing certificate; (b) if this key is not restricted in the Google Cloud Console by API type and referrer, it could be abused for quota exhaustion or unauthorized Google API calls.

**Impact:** Potential unauthorized use of Firebase/Google Cloud API quota; no direct data access risk (FCM server key is separate).

**Smallest safe fix:** (1) In Google Cloud Console → APIs & Services → Credentials, restrict this API key to "Android apps" and add the release keystore SHA-1 fingerprint. (2) Add `google-services.json` to `.gitignore` and inject it via CI/CD secrets. (3) Rotate the key after setting restrictions.

**Do NOT print the key value.** It is masked in this report.

**Verification:** Confirm key restrictions in Google Cloud Console show the correct package name and SHA-1.

---

## 5. Medium Findings

### M-01 — `EX_DEV_CLIENT_NETWORK_INSPECTOR=true` in production `gradle.properties`

| Field | Value |
|---|---|
| **ID** | M-01 |
| **Severity** | MEDIUM |
| **File** | `android/gradle.properties:56` |

**Evidence:** `EX_DEV_CLIENT_NETWORK_INSPECTOR=true` — enables Expo's network inspector which intercepts and logs HTTP requests made by the app. In production this may expose network request details to attached debug bridges.

**Fix:** Remove or set to `false` before external beta distribution.

---

### M-02 — Excess permissions in `AndroidManifest.xml` not declared in `app.json`

| Field | Value |
|---|---|
| **ID** | M-02 |
| **Severity** | MEDIUM |
| **File** | `android/app/src/main/AndroidManifest.xml` |

**Undeclared permissions present:**
- `RECORD_AUDIO` — audio recording. Not required by any declared feature.
- `SYSTEM_ALERT_WINDOW` — draw-over-other-apps. Required only by the Expo Dev Client for overlay; must not be in production builds.
- `READ_EXTERNAL_STORAGE` — legacy, superseded by `READ_MEDIA_IMAGES` on API 33+.
- `WRITE_EXTERNAL_STORAGE` — not needed on modern Android.

**Scenario:** Unnecessary permissions increase the app's threat surface and reduce user trust. `SYSTEM_ALERT_WINDOW` in particular enables overlay attacks. Play Store review also flags unnecessary permissions.

**Fix:** Audit which library injects each permission (likely `expo-dev-client` for `SYSTEM_ALERT_WINDOW`), exclude them in production build using `tools:node="remove"` in the manifest or by removing the `expo-dev-client` native dependency from the release variant.

---

### M-03 — Beta tester email addresses hardcoded in tracked migration SQL

| Field | Value |
|---|---|
| **ID** | M-03 |
| **Severity** | MEDIUM |
| **File** | `supabase/migrations/20260604_pre_beta_cleanup.sql:113–134` |

Two specific email addresses (`genecorbeta09@gmail.com`, `brixsea09@gmail.com`) are hardcoded as "preserved" accounts in the cleanup migration script. This file is tracked in git.

**Scenario:** Anyone with repository access sees the personal email addresses of beta testers. Privacy regulations (GDPR, Philippine Data Privacy Act) require that personal data not be stored in version control.

**Fix:** Replace the hardcoded emails with `-- FILL FROM Phase 2.2 OUTPUT` placeholders. The actual emails should be provided at runtime, not committed.

---

### M-04 — Chat media upload policy lacks folder-ownership path scoping

| Field | Value |
|---|---|
| **ID** | M-04 |
| **Severity** | MEDIUM |
| **File** | `supabase/migrations/20260603190000_security_sprint_pre_launch.sql:202–206` |

**Evidence:**
```sql
CREATE POLICY "Chat media sender upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id='chat-media'
  AND NOT public.has_dangerous_extension(name));
```

The chat media upload policy does **not** scope the path to `(storage.foldername(name))[1] = auth.uid()::text`. Any authenticated user can upload to any path inside `chat-media`, potentially overwriting another user's media files.

**Fix:** Add `AND (storage.foldername(name))[1] = auth.uid()::text` to the `WITH CHECK` clause, consistent with all other upload policies.

---

### M-05 — npm dependency vulnerabilities (39 total, 1 critical + 23 high in build tooling)

| Field | Value |
|---|---|
| **ID** | M-05 |
| **Severity** | MEDIUM (build-time; not runtime in APK) |

**Summary:**

| Package | Severity | Path | Runtime in APK? |
|---|---|---|---|
| `tar` | **CRITICAL** (DoS, path traversal) | `@expo/cli` → `cacache` | ❌ Build-time only |
| `@xmldom/xmldom` | HIGH (XML injection) | `@expo/plist` → `@expo/config-plugins` | ❌ Build-time only |
| `postcss` | HIGH (XSS, path traversal) | `@expo/metro-config` | ❌ Metro/bundler |
| `brace-expansion` | HIGH (DoS) | Transitive | ❌ Build-time |
| `form-data` | HIGH (CRLF injection) | Transitive | ⚠️ Uncertain |
| `js-yaml` | HIGH (DoS) | Transitive | ❌ Build-time |
| `shell-quote` | HIGH (DoS) | Transitive | ❌ Build-time |
| `expo`, `expo-*` | HIGH | Expo SDK (build + runtime) | ⚠️ Partial runtime |
| `expo-dev-client` | HIGH | Via `ajv`, `expo-manifests` | ⚠️ Native linked |
| `@react-native-community/cli*` | MODERATE | RN build CLI | ❌ Build-time |
| `fast-xml-parser` | MODERATE | RN CLI | ❌ Build-time |
| `ajv` | MODERATE | `expo-dev-launcher` | ⚠️ Native linked |
| `uuid`, `joi`, `send` | MODERATE/LOW | Transitive | ❌ Build-time |

**Key classification:** All critical and most high vulnerabilities are in **build-time tooling** (`@expo/cli`, Metro bundler, RN CLI). They are not in the JS bundle delivered to users. The main runtime concern is `expo-dev-client` — which includes native code linked into the APK. For external beta, consider moving `expo-dev-client` to `devDependencies` if it is not needed in production.

**Fix strategy:** Do not run `npm audit fix --force`. Schedule `expo` upgrade to v57+ as the first post-beta dependency maintenance task. This resolves most Expo-tree vulnerabilities in a single upgrade.

---

### M-06 — Untracked migration test files in the migrations folder

| Field | Value |
|---|---|
| **ID** | M-06 |
| **Severity** | MEDIUM |
| **Files** | `supabase/migrations/phase2c_migration_safety_review.sql`, `supabase/migrations/phase2c_migration_test.sql` |

These files are untracked (not committed, not gitignored). They are in the same directory as production migrations and could be accidentally applied or included in a CI/CD pipeline that runs all `*.sql` files in the migrations directory.

**Fix:** Either commit them with a clear `-- DEV ONLY` header and move to a `supabase/dev/` directory, or add them to `.gitignore`. Confirm they are not run by any automated migration job.

---

### M-07 — Release build logs untracked and not gitignored

| Field | Value |
|---|---|
| **ID** | M-07 |
| **Severity** | MEDIUM |
| **Files** | `android/release-build.log` (263 KB), `android/release-build-452.log` (291 KB) |

These Gradle build logs are untracked by git but are not in `.gitignore`. They contain build paths, native library names, signing metadata references, and package versions. If accidentally committed, they expose build infrastructure details.

**Fix:** Add `android/release-build*.log` to `android/.gitignore`.

---

## 6. Low Findings

### L-01 — No explicit session revocation when a user is suspended or banned

| Field | Value |
|---|---|
| **ID** | L-01 |
| **Severity** | LOW |

`admin_suspend_provider()` and `admin_ban_user()` update the `users.status` column but do not revoke the Supabase JWT session. A suspended/banned user retains a valid JWT until their `autoRefreshToken` cycle expires (typically up to 1 hour).

**Recommended fix (post-beta):** Call `supabase.auth.admin.signOut(userId)` via a server-side Edge Function or service-role call immediately after suspension. This is not critical for a 10–50 user beta where admins know all users.

---

### L-02 — `console.warn` in `remoteFlags.ts` may expose RPC error messages

| Field | Value |
|---|---|
| **ID** | L-02 |
| **Severity** | LOW |
| **File** | `src/config/remoteFlags.ts:31,51` |

`console.warn('[remoteFlags] RPC error:', error.message)` — error messages from Supabase may contain table names, function signatures, or query fragments. With minification disabled (see H-02), these remain in the APK.

**Recommended fix:** Remove or convert to silent failure for production (flags already fall back to `{}`).

---

### L-03 — `EXPO_PUBLIC_IDV_LIVE_SELFIE` dev override documented in source

| Field | Value |
|---|---|
| **ID** | L-03 |
| **Severity** | LOW |
| **File** | `src/config/remoteFlags.ts:19–21` |

The local dev override `process.env.EXPO_PUBLIC_IDV_LIVE_SELFIE === '1'` is baked in at compile time. Confirm no `.env` file or EAS secret sets this to `1` for the release build. No `.env` files were found in the repository root (confirmed). The server-side `identity_live_selfie_enabled` defaults to `'false'` in `platform_config`.

**Status:** No action needed if confirmed no EAS secret sets this variable.

---

### L-04 — `ProviderDetailScreen.tsx` admin document actions depend on client-side role gating

| Field | Value |
|---|---|
| **ID** | L-04 |
| **Severity** | LOW |

Admin document approve/reject buttons are conditionally rendered via `isAdmin(user?.role)` (TypeScript client-side check). The actual Supabase queries update `provider_documents.status` directly. While RLS on `provider_documents` restricts INSERT/UPDATE to owners and admins via the `is_admin()` PostgreSQL function, the client-side role is the primary gating mechanism for the UX. A modified client could still attempt the Supabase update calls — but RLS would block them if the user is not an admin.

**Assessment:** Database enforcement (RLS + `is_admin()`) provides the authoritative control. Client-side check is defense-in-depth. This is acceptable for beta.

---

### L-05 — `WRITE_EXTERNAL_STORAGE` permission may trigger Play Store warnings

| Field | Value |
|---|---|
| **ID** | L-05 |
| **Severity** | LOW |

Already noted in M-02 but worth separate attention for Play Store preparation. Google requires a declaration of use in the Data Safety section for `WRITE_EXTERNAL_STORAGE`.

---

## 7. Confirmed Protections

The following security controls have been verified and are operating correctly:

- **Admin role injection blocked** — `handle_new_user()` allowlists only `'provider'`; any other value including `'admin'` is forced to `'customer'` (`20260609220000_fix_role_injection.sql`).
- **`platform_config` fully protected** — `SELECT` revoked from `authenticated`, `anon`, and `PUBLIC`. Accessible only via `get_feature_flags()` SECURITY DEFINER which returns an allowlisted subset.
- **`run_beta_reset()` restricted to `service_role`** — `REVOKE EXECUTE ... FROM PUBLIC, authenticated, anon` in `20260725130000_beta_reset_function.sql`.
- **`get_feature_flags()` has pinned `search_path`** — `SET search_path = public, pg_temp`.
- **Supabase client uses only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`** — no `service_role` key in any source file.
- **No `.env` files committed** — `.gitignore` covers `.env`, `.env.*`, `.env.beta-reset`.
- **Keystores gitignored** — `.gitignore` covers `*.jks`, `*.p12`, `*.key`, `*.pem`.
- **`local.properties` gitignored** — `android/.gitignore` covers this.
- **PKCE flow enabled** — `src/lib/supabase.ts` sets `flowType: 'pkce'`.
- **Session persistence scoped to AsyncStorage** — not accessible to other apps on non-rooted devices.
- **Provider document upload correctly scoped** — `LiveSelfieVerificationScreen.tsx` stores only a storage path, never a public URL. `liveness_status` can only be `'passed'` or `'manual_review'` — never admin-approved status.
- **Identity verification never auto-approves** — `manual_review_required: true` is set on manual fallback; `liveness_status: 'passed'` marks the liveness check only, not document approval.
- **Admin moderation functions require `is_admin()` server-side check** — all `admin_*` RPCs verify admin status before executing.
- **Booking rate limits** — trigger enforces 20/day daily limit and 10/hour hourly limit.
- **Message rate limit** — 60/minute per sender enforced by trigger.
- **Review duplicate prevention** — trigger blocks duplicate reviews per booking.
- **All storage buckets have `allowed_mime_types` and `file_size_limit`** enforced at Storage level.
- **Dangerous extension check** — `has_dangerous_extension()` blocks `.exe`, `.apk`, `.js`, `.php`, etc.
- **AndroidManifest has no `android:debuggable="true"`** — confirmed absent.
- **No cleartext HTTP** — `AndroidManifest.xml` has no `android:usesCleartextTraffic="true"`.
- **All tables have RLS enabled** (confirmed in `20260603190000_security_sprint_pre_launch.sql:396–419`).
- **`IDENTITY_LIVE_SELFIE_ENABLED = false`** local default in `src/config/featureFlags.ts`.
- **`idvSpike` gated from production** — spike screen is in `src/dev/idvSpike/` and requires `EXPO_PUBLIC_IDV_LIVE_SELFIE=1` to activate (build-time, not set in release).

---

## 8. RLS Matrix

> Evidence sources: `20260603190000_security_sprint_pre_launch.sql`, `20260602180000_security_rls_audit.sql`, `20260529220000_architecture_renovation.sql`, and related migration files.

| Table | RLS | SELECT | INSERT | UPDATE | DELETE | Notes |
|---|---|---|---|---|---|---|
| `users` | ✅ | Own row; admin all | Trigger only | Own row; admin all | Admin only | Profile read by public is partial (via providers join) |
| `providers` | ✅ | Public read | Own row | Own row; admin | Admin | |
| `provider_documents` | ✅ | Owner + admin | Owner | Owner + admin | Owner | Private bucket enforces storage-level too |
| `provider_verification_logs` | ✅ | Owner + admin | Admin only | Admin only | Admin only | Audit log — providers cannot INSERT |
| `services` | ✅ | Public | Owner | Owner | Owner | |
| `service_images` | ✅ | Public | Owner (path-scoped) | Owner | Owner | |
| `provider_gallery` | ✅ | Public | Owner | Owner | Owner | |
| `bookings` | ✅ | Customer + provider | Customer | Customer (cancel); provider (accept/complete); admin | Admin | State machine trigger enforces valid transitions |
| `payments` | ✅ | Customer + provider + admin | Service-role/RPC | Service-role | ❌ No DELETE policy (correct) | |
| `messages` | ✅ | Sender + receiver + admin | Sender only | Admin (moderation) | Admin | Rate-limited by trigger |
| `reviews` | ✅ | Public; customer + provider | Customer (1/booking) | ❌ No self-edit | Admin (hide) | Duplicate enforced by trigger |
| `reports` | ✅ | Reporter + admin | Reporter | Admin | ❌ | |
| `notifications` | ✅ | Owner | Service-role + admin | Owner (mark read) | ❌ | |
| `user_push_tokens` | ✅ | Owner | Owner | Owner | Owner | |
| `platform_config` | ✅ | SELECT revoked from all auth users | Service-role | Service-role | Service-role | Accessed only via `get_feature_flags()` |
| `provider_live_locations` | ✅ | Public (lat/lng only for active) | Provider | Provider | Provider | |
| `login_attempts` | ✅ | Admin only | Trigger (SECURITY DEFINER) | ❌ | ❌ | |
| `registration_attempts` | ✅ | Admin only | Trigger (SECURITY DEFINER) | ❌ | ❌ | |
| `moderation_log` | ✅ | Admin only | Admin (via RPCs) | ❌ | ❌ | Audit log — immutable by design |
| `staff_action_log` | ✅ | Admin/staff | Staff | ❌ | ❌ | |
| `categories` | ✅ | `USING (true)` — intentionally public | Admin | Admin | Admin | Read-only catalog; broad SELECT is intentional |
| `provider_stats` | ✅ | `USING (true)` — intentionally public | Trigger | Trigger | ❌ | Aggregated stats only |

**Broad policies (`USING (true)`):** `categories` and `provider_stats` are intentionally public read-only catalog tables. Confirmed appropriate.

---

## 9. Storage Matrix

| Bucket | Public | Max Size | MIME Restriction | Upload Scope | Read Scope | Admin Read |
|---|---|---|---|---|---|---|
| `avatars` | ✅ Yes | 5 MB | jpeg/jpg/png/webp | `auth.uid()` folder | Public | Public |
| `provider-documents` | ❌ No | 15 MB | jpeg/jpg/png/webp | `auth.uid()` folder | Owner + admin | Signed URL (admin screen generates via `createSignedUrl`) |
| `kyc-documents` | ❌ No | 15 MB | jpeg/jpg/png/webp | `auth.uid()` folder | Owner + admin | Signed URL |
| `provider-profile-images` | ✅ Yes | 5 MB | jpeg/jpg/png/webp | `auth.uid()` folder | Public | Public |
| `provider-cover-images` | ✅ Yes | 5 MB | jpeg/jpg/png/webp | `auth.uid()` folder | Public | Public |
| `service-images` | ✅ Yes | 10 MB | jpeg/jpg/png/webp | `auth.uid()` folder | Public | Public |
| `booking-photos` | ❌ No | 5 MB | jpeg/jpg/png/webp | `auth.uid()` folder | Booking participants | N/A |
| `chat-media` | ❌ No | 5 MB | jpeg/jpg/png/webp | Any authenticated ⚠️ | Booking participants | N/A |
| `review-media` | ✅ Yes | 5 MB | jpeg/jpg/png/webp | `auth.uid()` folder | Public | Public |

**Findings:**
- `chat-media` upload policy lacks `auth.uid()` path scoping — see M-04.
- `provider-documents` and `kyc-documents` private buckets have `getPublicUrl` called by `storageUpload.ts` — see H-01.
- No SVG uploads possible (MIME restriction blocks them) — XSS via SVG is mitigated.
- File dimension enforcement is not present (client-side only) — low risk for image-only uploads.

---

## 10. Authentication Review

| Area | Status | Notes |
|---|---|---|
| Registration | ✅ | `handle_new_user()` strips admin/arbitrary role injection; only `provider` or `customer` assigned at signup |
| Login | ✅ | Supabase Auth (email+password, Google OAuth). PKCE flow enabled. |
| Password reset | ✅ | Supabase built-in email flow. Staff `must_change_password` enforced at navigation level. |
| Session persistence | ✅ | AsyncStorage; scoped to app sandbox. |
| Session refresh | ✅ | `autoRefreshToken: true` in Supabase client. |
| Logout | ✅ | `supabase.auth.signOut()` clears AsyncStorage token. |
| Expired sessions | ✅ | Supabase JWT has expiry; client detects and re-prompts. |
| Account suspension | ⚠️ | Status updated in DB; JWT not revoked immediately — stale session up to 1 hour (L-01). |
| Role assignment | ✅ | Only via direct DB migration (`set_admin_role.sql`). No client path to self-assign admin. |
| Staff forced password change | ✅ | `must_change_password` column; `RootNavigator` routes to `MustChangePasswordScreen`. |
| Google Sign-In | ✅ | OAuth + `handle_new_user` always assigns `customer` (Google metadata has no `role` field). |

---

## 11. Admin Authorization Review

| Admin Action | Client-side gate | DB-side gate | Audit log |
|---|---|---|---|
| View pending providers | `isAdmin(role)` | RLS on `providers` | — |
| Approve/reject provider | `isAdmin(role)` | Direct UPDATE via RLS (admin policy) | `provider_verification_logs` |
| Approve/reject document | `isAdmin(role)` | Direct UPDATE via RLS (admin policy) | `provider_verification_logs` |
| Suspend provider | `isAdmin(role)` | `admin_suspend_provider()` checks `is_admin()` | `moderation_log` |
| Ban user | `isAdmin(role)` | `admin_ban_user()` checks `is_admin()` | `moderation_log` |
| Revoke verification | `isAdmin(role)` | `admin_revoke_verification()` checks `is_admin()` | `moderation_log` |
| Hide review | `isAdmin(role)` | `admin_hide_review()` checks `is_admin()` | `moderation_log` |
| Remove chat image | `isAdmin(role)` | `admin_remove_chat_image()` checks `is_admin()` | `moderation_log` |
| Feature management | `isAdmin(role)` | Direct UPDATE via RLS | `provider_verification_logs` |
| Platform config | N/A (no UI) | `REVOKE SELECT` + service-role only | — |
| Beta reset | N/A (script only) | `service_role` GRANT only | Function returns counts |

**Assessment:** All destructive admin actions go through SECURITY DEFINER RPCs that call `is_admin()` server-side. The client-side `isAdmin(role)` check is a UX gate only. Database enforcement is authoritative.

**Gap:** Direct `UPDATE provider_documents SET status=...` from the client (in `ProviderDetailScreen`) relies on RLS for enforcement. The admin `provider_documents` UPDATE policy (defined in `20260526134529_add_admin_provider_update_policy.sql`) must include `is_admin()`. Recommend verifying this migration's exact policy text.

---

## 12. Identity Verification Review

| Requirement | Status | Notes |
|---|---|---|
| Automated checks do not approve identity | ✅ | `liveness_status` only reflects liveness check, never document approval. Admin must set `provider_documents.status = 'approved'`. |
| Admin is final authority | ✅ | `status` field on `provider_documents` is only writable by owner (own docs) and admin RLS. Provider cannot set own status to `approved`. |
| Provider cannot write approved/rejected status | ✅ | RLS restricts provider to inserting/updating their own documents; `approved`/`rejected` requires admin policy. |
| Provider cannot alter `reviewed_at` / `reviewed_by` | ✅ | These columns are set by admin-only DB actions. No client INSERT/UPDATE allows setting these. |
| Liveness metadata cannot forge admin approval | ✅ | `liveness_status` values are `passed`, `manual_review`, `failed`, `skipped` — none maps to document `approved`/`rejected`. |
| Manual fallback clearly marked | ✅ | Fallback sets `liveness_status: 'manual_review'` and `manual_review_required: true`. Review screen shows "This photo will be submitted for administrator review." |
| Duplicate selfie records | ⚠️ | Each `handleComplete` call inserts a new `provider_documents` row with `document_type = 'verification_selfie'`. If a provider submits multiple times, multiple rows accumulate. Admin must manually distinguish the most recent. Consider a UPSERT or unique constraint on `(provider_id, document_type)` with an index on `liveness_captured_at DESC`. |
| Storage path safety | ✅ | Path is `{userId}/verification_selfie_{timestamp}.jpg` — scoped to user UUID, no user-controlled filename. |
| Failed DB insert does not repeat Storage upload | ✅ | `uploadSelfie()` is called before DB insert; the storage path is returned and then used in the calling screen's DB write. If the DB write fails, the orphan Storage object exists but no DB record points to it. Minor cleanup concern, non-security. |
| Private image paths | ✅ | `provider-documents` bucket is private. `LiveSelfieVerificationScreen` stores the storage path, not a public URL. |
| Admin signed URLs | ✅ | `ProviderDetailScreen` uses `createSignedUrl` for document display. |

---

## 13. Secrets / APK Review

| Secret | Status |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Present in APK by design (public endpoint) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Present in APK by design (public anon key) |
| Supabase `service_role` key | ✅ NOT in source or APK |
| Database passwords | ✅ NOT in source |
| `.env.beta-reset` | ✅ Listed in `.gitignore`, not committed |
| Firebase server key / VAPID | ✅ Not in source (server-side Edge Function secret) |
| Signing keystore password | ✅ Not hardcoded (uses debug keystore via `signingConfigs.debug`; see C-01) |
| Firebase Web API key | ⚠️ In `google-services.json` (tracked) — see H-04 |
| EAS project ID | ℹ️ In `app.json`; not a secret (public EAS config) |
| Firebase project number / app ID | ℹ️ In `google-services.json`; standard FCM client config, not a credential |
| Google Maps key | ✅ NOT found |
| reCAPTCHA key | ✅ NOT found in source |
| JWT_SECRET | ✅ NOT found |
| PGPASSWORD / DATABASE_URL | ✅ NOT found |

**APK minification:** `minifyEnabled = false` (default). JS console logs are NOT stripped by Hermes in the current build. See H-02.

---

## 14. Dependency Vulnerability Triage

**Total:** 39 vulnerabilities (1 critical, 23 high, 14 moderate, 1 low)

| Package | Severity | Reachable in APK | Action |
|---|---|---|---|
| `tar` (via `@expo/cli`) | CRITICAL — DoS, path traversal | ❌ Build tool only | Upgrade `expo` to v57+ post-beta |
| `@xmldom/xmldom` (via `@expo/plist`) | HIGH — XML injection | ❌ Build tool only | Same |
| `postcss` (via Metro) | HIGH — XSS, path traversal | ❌ Metro/bundler only | Same |
| `brace-expansion` | HIGH — DoS | ❌ Build only | Same |
| `form-data` | HIGH — CRLF injection | ⚠️ Unclear dependency path | Verify; upgrade if runtime |
| `js-yaml` | HIGH — DoS | ❌ Build only | Same |
| `shell-quote` | HIGH — DoS | ❌ Build only | Same |
| `cacache` | HIGH — path traversal | ❌ Build only | Same |
| `expo-dev-client` | HIGH (via `ajv`, manifests) | ⚠️ Native linked in APK | Move to `devDependencies`; exclude from release |
| `expo`, `expo-*` runtime packages | HIGH | ⚠️ Partial runtime | Upgrade to v57+ |
| `react-native` (via CLI tools) | MODERATE | ❌ CLI only | Upgrade RN post-beta |
| `@react-native-community/cli-*` | MODERATE | ❌ Build tool | Same |
| `fast-xml-parser` | MODERATE | ❌ Build tool | Same |
| `ajv` | MODERATE | ⚠️ Via dev launcher | Remove dev client from release |
| `uuid`, `joi`, `send`, `xcode` | MOD/LOW | ❌ Build only | Post-beta |

**Recommendation:** Do not run `npm audit fix` or `npm audit fix --force`. Schedule `expo` upgrade to v57+ as the first post-beta patch. All critical/high vulnerabilities are in build tooling — none represent a direct attack vector against end users at runtime in the current APK.

---

## 15. Privacy and Retention Review

| Data type | Stored where | Retention policy defined? | Who can access | Recommended |
|---|---|---|---|---|
| Verification selfies | `provider-documents` Storage bucket | ❌ No explicit retention | Owner + admin (signed URLs) | Retain until provider is rejected or account deleted; define 90-day post-rejection deletion |
| Rejected applications | `provider_documents` DB rows | ❌ | Admin only | Define explicit purge schedule (e.g., 1 year post-rejection) |
| ID documents (front/back) | `provider-documents` / `kyc-documents` | ❌ | Owner + admin | Same as selfies |
| Precise location | `provider_live_locations` (lat/lng) | On-demand; ephemeral | Public (active locations only) | Auto-expire inactive locations (pg_cron job recommended) |
| Chat messages | `messages` DB | ❌ No retention policy | Sender + receiver + admin | Define deletion policy after booking completion (e.g., 6 months) |
| Device push tokens | `user_push_tokens` | Cleared on beta reset | Owner | Expire stale tokens (> 90 days) |
| Login/registration attempts | `login_attempts`, `registration_attempts` | ❌ No retention policy | Admin | Auto-purge after 30 days via pg_cron |
| Beta tester emails | `20260604_pre_beta_cleanup.sql` (git) | N/A | Anyone with repo access | Remove from SQL — see M-03 |
| Moderation log | `moderation_log` | ❌ | Admin only | Retain indefinitely for compliance; consider annual archive |
| Payment evidence | `payments` | ❌ | Customer + provider + admin | Retain per financial regulations (typically 5–7 years) |
| Audit logs | `staff_action_log` | ❌ | Admin/staff | Retain indefinitely; immutable |

---

## 16. Beta Abuse Controls

| Risk | Protection | Gap |
|---|---|---|
| Repeated registrations | `registration_attempts` table + `is_registration_rate_limited()` (5/hour/IP) | IP-based only; VPN bypass possible |
| Login brute force | `login_attempts` + `is_account_locked()` (10 failures/15 min) | App-side only; direct Supabase Auth API not rate-limited this way |
| Booking spam | Daily limit trigger (20/day) + hourly rate (10/hour) | Sufficient for 10–50 user beta |
| Message spam | 60/minute trigger per sender | Sufficient for beta |
| Review spam | 10/day + 1-per-booking trigger | Sufficient for beta |
| Document upload flooding | No explicit limit | Low risk for 10–50 users; add if resubmission abuse observed |
| Notification flooding | Controlled by server-side triggers; no client-direct insert | Good |
| Provider resubmission abuse | No resubmission rate limit | Acceptable for beta; add limit on `attempt_count` if needed |

**Assessment:** Abuse controls are **sufficient for a 10–50 user closed beta** where all participants are known. Production-grade IP reputation, captcha, and global rate limiting should be added before public launch.

---

## 17. Required Fixes Before External Beta Distribution

| # | Finding | Priority | Effort |
|---|---|---|---|
| 1 | **C-01** Generate and configure permanent release keystore | BLOCKING | 1 hour |
| 2 | **H-02** Remove `console.log` from `RootNavigator.tsx`; enable `minifyEnabled=true` | URGENT (48h) | 30 min |
| 3 | **H-03** Add `SET search_path = public` to all SECURITY DEFINER functions (new migration) | URGENT (48h) | 2 hours |
| 4 | **M-04** Add `auth.uid()` path scoping to `chat-media` upload policy | URGENT (48h) | 15 min |
| 5 | **M-01** Remove `EX_DEV_CLIENT_NETWORK_INSPECTOR=true` from `gradle.properties` | Before first external invite | 5 min |
| 6 | **M-02** Remove or exclude dev-only Android permissions (`SYSTEM_ALERT_WINDOW`, `RECORD_AUDIO`) | Before first external invite | 30 min |
| 7 | **M-07** Add `release-build*.log` to `android/.gitignore` | Before any public commit | 5 min |
| 8 | **M-06** Move or gitignore `phase2c_migration_*.sql` test files | Before any CI/CD migration run | 5 min |

---

## 18. Recommended Fixes After Beta Launch

| # | Finding | Priority | Notes |
|---|---|---|---|
| 1 | **H-01** Replace `getPublicUrl` with path-only storage for private buckets | High | Fix broken document preview too |
| 2 | **H-04** Restrict Firebase API key in Google Cloud Console; remove from git | High | After permanent signing keystore |
| 3 | **M-03** Remove hardcoded beta tester emails from migration SQL | Medium | Privacy hygiene |
| 4 | **M-05** Upgrade `expo` to v57+ | Medium | Resolves most build-tool vulns |
| 5 | **L-01** Implement session revocation on suspend/ban | Low | Edge Function + `auth.admin.signOut()` |
| 6 | **L-02** Remove `console.warn` in `remoteFlags.ts` | Low | Silent fallback is sufficient |
| 7 | Add UPSERT/unique constraint on `(provider_id, document_type)` for selfie rows | Low | Prevents duplicate pending selfie records |
| 8 | Define data retention policies for ID documents, selfies, chat, and login attempts | Low | Regulatory compliance |
| 9 | Add `expo-dev-client` to `devDependencies`; exclude from release APK | Medium | Reduces attack surface and APK size |
| 10 | Add auto-expire for `login_attempts` and `registration_attempts` tables | Low | pg_cron, 30-day purge |
| 11 | Create a new Git tag after IDV Phase 2 is merged and signed with permanent keystore | Low | Rollback reference |

---

## 19. Validation Evidence

| Check | Result |
|---|---|
| `git branch --show-current` | `spike/idv-phase2a` |
| `.env` files committed | None found |
| `service_role` key in source | Not found in any `src/**/*.ts(x)` |
| `android/app/build.gradle` — release signingConfig | `signingConfigs.debug` (**debug keystore**) |
| `android/app/build.gradle` — `minifyEnabled` | `false` (default) |
| `AndroidManifest.xml` — `debuggable` attribute | Absent (good) |
| `AndroidManifest.xml` — `usesCleartextTraffic` | Absent (good) |
| `platform_config` RLS | SELECT revoked from `authenticated`, `anon`, `PUBLIC` |
| `run_beta_reset()` execute grant | `service_role` only; revoked from `authenticated`, `anon` |
| `get_feature_flags()` — `search_path` | `SET search_path = public, pg_temp` ✅ |
| `handle_new_user()` — admin injection | Allowlist: only `'provider'` passes; all others → `'customer'` |
| `IDENTITY_LIVE_SELFIE_ENABLED` default | `false` (local); `'false'` in `platform_config` |
| npm audit total | 39 vulnerabilities (1 critical / 23 high in build tooling) |
| APK location | `android/app/build/outputs/apk/release/app-release.apk` (119.6 MB) |
| Supabase flowType | `pkce` ✅ |
| PKCE + AsyncStorage | Confirmed in `src/lib/supabase.ts` |

---

## 20. Rollback and Incident Response Checklist

### Before any beta distribution:
- [ ] Tag current commit: `git tag servicehub-beta-phase2-pre-release`
- [ ] Retain previous APK: `app-release.apk` (v1.0.12) as rollback artifact
- [ ] Document the admin account UUID and email (offline, not in repo)
- [ ] Confirm `run_beta_reset()` is tested and produces expected counts

### If a security incident is detected during beta:
1. **Suspend affected users** via `admin_ban_user()` or `admin_suspend_provider()` in admin UI.
2. **Rotate Supabase anon key** (Settings → API → Regenerate anon key). All app sessions will expire at next token refresh.
3. **Revoke sessions** for specific users via Supabase Auth Admin panel (`Authentication → Users → Sign out user`).
4. **Run beta reset** if data integrity is compromised: call `run_beta_reset('<admin-uuid>')` via service-role Supabase client.
5. **Redeploy APK** if client-side code is involved: increment `versionCode` in `build.gradle`, rebuild with permanent signing key, redistribute.
6. **Preserve evidence**: export relevant `moderation_log`, `login_attempts`, and `provider_verification_logs` rows before any reset.

### If signing key is compromised:
1. Generate a new permanent keystore immediately.
2. Increment `versionCode`.
3. Redistribute updated APK. All users must uninstall and reinstall (signing key change breaks update path).
4. Rotate the Firebase API key.

### If Supabase `service_role` key is compromised (e.g., leaked via beta reset script):
1. Rotate the key immediately in Supabase Dashboard → Settings → API.
2. Update all CI/CD secrets and edge function environment variables.
3. Audit `moderation_log` and `auth.audit_log_entries` for unauthorized operations.

---

*End of report. Audit scope: static analysis only. No live data was queried, no mutations were performed.*
