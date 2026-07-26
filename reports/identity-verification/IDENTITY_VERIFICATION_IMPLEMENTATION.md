# TAGA Identity Verification — Upgrade Plan (Phase 1: Audit Only)

**Date:** 2026-07-26
**Project:** ServiceHub / TAGA (`C:\Users\jhing\CascadeProjects\ServiceHub`)
**Status:** PHASE 1 — AUDIT ONLY. No production code has been modified.
**Author:** Cascade

> This document is the required Phase 1 deliverable. It audits the existing
> identity-verification system, recommends technology, and proposes an
> incremental implementation plan that **extends** the current workflow.
> Implementation must not begin until this plan is reviewed and approved.

---

## 0. Executive Summary

TAGA already has a working, private, admin-reviewed identity verification flow
built into **provider onboarding** (`ProviderOnboardingScreen`, Step 3). It
captures ID front, ID back, and a selfie-with-ID using the device camera via
`expo-image-picker`, stores them in the private `provider-documents` Supabase
Storage bucket, records them in the `provider_documents` table, and lets admins
review and approve/reject in `ProviderDetailScreen`, with an audit trail in
`provider_verification_logs`.

The upgrade will **extend** this exact flow — same tables, same bucket, same
admin screen, same statuses — by adding:

1. On-device **image quality checks** for ID front/back (blur, brightness, glare, framing, resolution).
2. A new **live selfie liveness** step (blink + left/right head turn + automatic best-frame capture) replacing the manual selfie-with-ID upload, while keeping a **manual-review fallback**.
3. **Structured evidence** (quality results, liveness results, best-selfie path, optional liveness video, optional face-match score) attached to the existing verification records.
4. An enriched **admin evidence dashboard** and expanded audit logging.
5. Optional, **feature-flagged** face comparison and liveness video (disabled by default).

**Admin remains the sole decision-maker. No AI auto-approval.**

---

## 1. Existing System Audit

### 1.1 Active Provider Verification Flow

**File:** `src/screens/provider/ProviderOnboardingScreen.tsx` (1,661 lines)
**Registered in:** `src/navigation/ProviderNavigator.tsx:166` (`ProviderOnboarding` route) — this is the **active** flow.

Step 3 ("Verification Documents") contains two sections:

- **Identity Verification (Required):**
  - `ID Type` dropdown (`PH_ID_TYPES` — Philippine government IDs).
  - `Upload Front Valid ID` — camera capture only (`pickCamera` → `launchCameraAsync`, quality 0.85).
  - `Upload Back Valid ID` — camera capture only.
  - `Upload Selfie With Valid ID` — camera capture only.
- **Professional Verification (At least 1):**
  - Permit/certificate uploads (camera or gallery via `pickFile`).

Relevant local state (`ProviderOnboardingScreen.tsx:88-118`):

- `UploadState = 'idle' | 'uploading' | 'success' | 'failed'`
- `ValidIdDoc { idType, front, back }`, each side `{ uri, uploadedUrl, state, error }`
- `selfie { uri, uploadedUrl, state, error }`

Capture + upload handlers:

- `pickCamera()` (`:456`) — requests camera permission, `launchCameraAsync`, validates via `validateImagePickerAsset(asset, 'provider-documents')`.
- `doValidIdSideUpload(side, uri, mime)` (`:487`) — uploads to `provider-documents`, deletes any prior `valid_id`/`side` row, inserts a new `provider_documents` row (`status: 'pending'`).
- `doSelfieUpload(uri, mime)` (`:527`) — same, `document_type: 'selfie_with_id'`.
- `retry*` / `remove*` helpers for each artifact.
- `validateStep3()` (`:405`) — requires idType, front URL, back URL, selfie URL, and ≥1 supporting doc.
- `handleSubmit()` (`:639`) — upserts `providers` with `status: 'pending_review'` and consent timestamps.

**Storage path convention (current):**
- `"{userId}/valid_id_front_{timestamp}.{ext}"`
- `"{userId}/valid_id_back_{timestamp}.{ext}"`
- `"{userId}/selfie_with_id_{timestamp}.{ext}"`
- `"{userId}/{permitKey}_{timestamp}.{ext}"`

### 1.2 Upload Service

**Inline in `ProviderOnboardingScreen.tsx`:**
- `uploadWithRetry(uri, path, mime, maxRetries=2)` (`:128`) — `fetch(uri)` → `arrayBuffer` → `supabase.storage.from('provider-documents').upload(path, buf, { contentType, upsert:true })` → returns `getPublicUrl(path).publicUrl`.
- `getMimeType(uri, assetMime)` (`:120`).

**File validation:** `src/utils/fileValidation.ts`
- `validateImagePickerAsset(asset, bucket)` → `validateFileForUpload(...)`.
- Checks: dangerous extension blocklist, allowed MIME (`jpeg/jpg/png/webp`), MIME↔extension consistency, per-bucket size limit (`provider-documents` = 15 MB).

**Other upload util:** `src/utils/storageUpload.ts` (referenced by search; general helper).

> **Finding (minor):** `uploadWithRetry` stores the `getPublicUrl` string in
> `file_url` even though `provider-documents` is a **private** bucket. The public
> URL will not resolve without signing. The admin screen compensates by
> re-signing (`createSignedUrl`). Storing the object **path** instead of a public
> URL would be cleaner, but changing it now risks breaking existing records.
> Recommendation: keep storing as-is for backward compatibility; new evidence
> columns should store the **object path** and always be signed on read.

### 1.3 Admin Review Flow

**File:** `src/screens/admin/ProviderDetailScreen.tsx` (1,405 lines)

- `extractStoragePath(fullUrl)` (`:20`) — parses bucket + path from a stored URL; supports `provider-documents` and legacy `kyc-documents`.
- `loadData()` (`:226`) — loads `providers` (+ legacy `kyc_documents` JSON), `provider_documents`, `provider_verification_logs`, featured/fee data. Generates **1-hour signed URLs** for every document (`createSignedUrl(path, 3600)`).
- `convertKycDocs()` (`:129`) — maps the legacy `kyc_documents` JSON blob into the unified `DocRecord` shape for display.
- `handleDocAction(docId, 'approved'|'rejected'|'pending')` (`:405`) — per-document status update + `provider_verification_logs` entry.
- `performAction()` (`:427`) — provider-level `approve` / `reject` / `suspend`:
  - approve → `status:'approved', is_verified:true, is_available:true, approved_at, approved_by`.
  - reject → `status:'rejected', is_verified:false, rejected_by, rejection_reason`.
  - suspend → `adminSuspendProvider(...)`.
  - Always writes a `provider_verification_logs` row.

**Document display labels:** `getDocumentLabel()` (`:148`), `ID_TYPE_LABELS`, `DOC_LABELS`.

### 1.4 Legacy (Dead) Flow

**File:** `src/screens/provider/ProviderApplicationScreen.tsx` — **NOT registered** in any navigator (dead code). Uploads to the `kyc-documents` bucket and writes a `kyc_documents` JSON blob on `providers`. The admin screen still reads legacy `kyc_documents` for backward compatibility, so **do not delete legacy read paths**. The screen file itself can be quarantined later (out of scope for this upgrade).

### 1.5 Data Model (Existing)

**`public.provider_documents`** (`supabase/schema.sql:146`):

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `provider_id` | UUID FK → providers(id) CASCADE | |
| `document_type` | TEXT CHECK | includes `valid_id`, `selfie_with_id`*, permits |
| `category_type` | TEXT CHECK | `valid_id` \| `permit_certificate` |
| `id_type` | TEXT | e.g. selected PH ID |
| `side` | TEXT CHECK | `front` \| `back` |
| `file_url` | TEXT | stored public URL (bucket is private) |
| `status` | TEXT CHECK | `pending` \| `approved` \| `rejected` |
| `uploaded_at` | TIMESTAMPTZ | |
| `reviewed_at` | TIMESTAMPTZ | |
| `reviewed_by` | UUID FK → users(id) SET NULL | |

> *Note: `selfie_with_id` is used by the app code and mapped by the admin
> screen, and the check constraint was adjusted in
> `20260615120000_fix_document_type_check_constraint.sql`. Verify the live
> constraint includes `selfie_with_id` before Phase 4.

**`public.provider_verification_logs`** (`supabase/schema.sql:263`):

| Column | Type |
|--------|------|
| `id` | UUID PK |
| `provider_id` | UUID FK → providers(id) CASCADE |
| `action` | TEXT |
| `performed_by` | UUID FK → users(id) SET NULL |
| `notes` | TEXT |
| `created_at` | TIMESTAMPTZ |

**Provider-level fields (relevant):** `providers.status` (`draft|pending_review|approved|rejected|suspended`), `is_verified`, `is_available`, `rejection_reason`, `approved_at/by`, `rejected_by`, `accepted_verification_policy_at`, `accepted_terms_at`, `accepted_privacy_at`.

**Types:** `src/types/index.ts` — `DocumentStatus`, `DocumentCategoryType`, `DocumentSide`, `DocumentType`, `ProviderStatus`, `ProviderDocument`.

**Config store:** `public.platform_config` (key/value, **service_role read only**) — ideal for **server-side feature flags** (`20260602150000_user_push_tokens.sql:57`).

### 1.6 Storage Buckets & RLS

**`provider-documents`** (private) — `supabase/schema.sql:1369`:
- Bucket `public = false`.
- Policies on `storage.objects`:
  - Providers INSERT/SELECT/UPDATE/DELETE **only** within their own folder: `(storage.foldername(name))[1] = auth.uid()::text`.
  - Admins SELECT all; Admins DELETE any (role check via `users.role = 'admin'`).

**`provider_documents` table RLS** (`20260611082000_...` + schema):
- Owner read/insert/update/delete (`auth.uid() = provider_id`).
- Admin read/update policies (`20260526134219_...`, `20260604_fix_provider_documents_admin_rls.sql`).

**`kyc-documents`** (legacy) — still referenced by admin read path.

### 1.7 Build & Runtime Environment

- **Expo SDK 51**, **React Native 0.74.5**, React 18.2.0 (`package.json`).
- **Prebuilt/bare workflow**: `android/` folder with `gradlew` exists → **local Gradle release build is the deploy path** (`cd android && .\gradlew assembleRelease`). `expo-dev-client` is installed → custom native modules + config plugins are supported **without EAS**.
- Current camera capability: `expo-image-picker` only (single-shot capture, no frame processing, no face detection).
- Existing permissions (`app.json`): `CAMERA`, location, `READ_MEDIA_IMAGES`, `POST_NOTIFICATIONS`.
- Edge Functions infra present (Deno): `supabase/functions/*` (e.g. `verify-recaptcha`, `send-push-notification`) → suitable home for server-side face comparison behind a flag.

---

## 2. Recommended Technology Stack

All choices prioritize: on-device processing, local Gradle compatibility (no EAS
requirement), zero per-use cost for basic checks, no private keys in the APK,
and minimal disruption to the existing flow.

### 2.1 Camera + Frame Processing

- **`react-native-vision-camera` v4.x** — CameraX-based, supports **frame processors** for real-time analysis, photo capture, and (optional) video recording. Compatible with RN 0.74.5 / Expo 51 via config plugin + local Gradle.
- **`react-native-worklets-core`** — required peer for frame processors; add `react-native-worklets-core/plugin` to `babel.config.js`.

### 2.2 Face Tracking / Liveness (on-device, free)

- **`react-native-vision-camera-face-detector` v1.7.x** — wraps **Google ML Kit Face Detection** (on-device, free, no API key). Provides per-frame:
  - `leftEyeOpenProbability`, `rightEyeOpenProbability` → **blink detection**.
  - `yawAngle` (head turn L/R), `pitchAngle`, `rollAngle` → **head-turn + centering**.
  - Face bounding box + landmarks → **framing / size / single-face** checks.

> This directly satisfies: single-face check, centering, face size, blink,
> left/right turn, and best-frame scoring — **entirely on-device**.

### 2.3 ID Document Quality (on-device)

Prefer lightweight, dependency-minimal heuristics computed from a downscaled
frame/photo (throttled), to avoid heavy native deps:

- **Blur:** variance-of-Laplacian (or Sobel/Tenengrad) on a grayscale downscale. Low variance ⇒ blurry.
- **Brightness / exposure:** mean luminance + clipped-pixel ratio (too dark / overexposed).
- **Glare:** count of saturated bright specular regions (very high luminance clusters).
- **Framing / edges:** detect the document quad within the frame (contour/edge heuristic) to confirm the whole ID is inside the frame and one document is present.
- **Resolution:** enforce a minimum captured resolution (from `expo-image-manipulator` / photo metadata).

Implementation options (choose during Phase 2 spike):
- **A) Pure JS/worklet heuristics** on downscaled pixel buffers (no extra native module). Lowest risk for local Gradle; adequate for blur/brightness/glare.
- **B) `react-native-vision-camera` frame processor plugin** for pixel access + a small native helper if edge detection needs OpenCV.
- **C) OpenCV** (`react-native-fast-opencv` or a custom module) **only if** contour-based edge detection proves necessary. Higher build complexity — gate behind the Phase 2 spike.

Recommendation: **start with (A)** for blur/brightness/glare/resolution; add
document-edge detection incrementally. Keep thresholds tolerant and configurable.

### 2.4 Best-Frame Selfie Capture

- Buffer the last N face-detection results + frames during "Hold still"; score each by (face centered, both eyes open, neutral yaw/pitch, low blur, good brightness, single face) and capture the highest-scoring frame via VisionCamera `takePhoto`/snapshot. No shutter button.

### 2.5 Optional — Liveness Video (feature-flagged, default OFF)

- VisionCamera video recording during the blink/head-turn sequence, **no microphone**, short clip, uploaded to a **private** bucket. Behind `platform_config` flag `idv_liveness_video_enabled`. Architecture prepared but disabled for first beta.

### 2.6 Optional — Face Comparison (feature-flagged, default OFF)

- **Server-side only**, in a Supabase **Edge Function**, behind `platform_config` flag `idv_face_match_enabled`. Candidate providers:
  - **AWS Rekognition `CompareFaces`** — pay-per-call, no model hosting, mature.
  - **Azure Face API** (note: gated access approval required).
  - Self-hosted model (e.g. InsightFace) — higher ops burden.
- Keys live in **Edge Function secrets / Supabase Vault** — never in the APK.
- Output: similarity score + advisory recommendation. **Never auto-approves.** Thresholds configurable in `platform_config`.

### 2.7 Consent + Retention

- New **consent screen** before capture, versioned; store acceptance timestamp + version on the verification record.
- Retention rules stored in `platform_config`; enforced by a scheduled Edge Function (like the existing `expire-featured-providers`). No auto-deletion of production evidence until approved.

### 2.8 Known Build Risks (must validate in Phase 2 spike)

- `react-native-vision-camera-face-detector` has a **reported Bouncy Castle (`bcprov-jdk18on`) JAR creation error** under local Gradle on some setups (see StackOverflow, RN 0.74.5 / Expo 51). Mitigation: pin compatible versions, clear Gradle jars cache, or use an alternative ML Kit binding. **Validate before committing to this library.**
- Frame processors require the worklets babel plugin and a native rebuild.

---

## 3. Architecture & Threat Model

### 3.1 High-Level Flow

```
Consent → Select ID type
      → Capture ID front  → on-device quality gate → upload (provider-documents)
      → Capture ID back   → on-device quality gate → upload
      → Live selfie: face positioning → blink → left turn → right turn → hold still
                     → auto best-frame → upload best selfie
      → (optional) liveness video upload (flagged)
      → (optional) server face-match (flagged, advisory)
      → Submit evidence package → provider.status = 'pending_review'
      → Admin reviews evidence → approve / reject / request resubmission
```

### 3.2 Trust Boundaries

- **On-device (untrusted for decisions):** all capture, quality, liveness. Results are *advisory metadata*, never authoritative for approval.
- **Supabase (trusted):** RLS-enforced storage/tables; signed URLs for admin reads.
- **Edge Functions (trusted):** face comparison + retention; hold all third-party secrets.
- **Admin (authoritative):** final decision.

### 3.3 Threats & Mitigations

| Threat | Mitigation |
|--------|-----------|
| Spoofed liveness (photo of a photo) | Multi-action liveness (blink + 2 turns), best-frame scoring, optional video + face-match; admin final review |
| Cross-user file access | Existing per-folder RLS (`foldername[1] = auth.uid()`); admin-only signed reads |
| Public exposure of PII images | Private buckets only; short-lived signed URLs; no public URLs |
| Secret leakage in APK | No AI keys client-side; face-match/keys in Edge Functions/Vault |
| Path traversal / spoofed files | Keep `fileValidation` (MIME/ext/size); server-validated paths; sanitize filenames |
| Abuse / spam attempts | Rate-limit verification attempts (reuse `rate_limits` table); single active session; expire abandoned attempts |
| Metadata leakage (EXIF/GPS) | Strip metadata via `expo-image-manipulator` re-encode before upload |
| Admin over-access to sensitive data | Log admin access to verification records (audit) |

---

## 4. Exact Files To Modify / Add (proposed for later phases)

> No files are changed in Phase 1. This is the planned surface area.

### 4.1 Client — Modify

- `src/screens/provider/ProviderOnboardingScreen.tsx` — replace the three manual capture widgets in Step 3 with the new guided-capture + liveness components; keep the same upload targets and `provider_documents` writes; keep manual-review fallback.
- `src/utils/fileValidation.ts` — add optional min-resolution + (new) private liveness bucket name(s).
- `src/types/index.ts` — add new enums/interfaces (liveness state, quality result, verification status extensions).
- `app.json` — add VisionCamera plugin + (if video) `RECORD_AUDIO` is **not** added (no mic); ensure `CAMERA` present (already is).
- `babel.config.js` — add `react-native-worklets-core/plugin`.
- `package.json` — add `react-native-vision-camera`, `react-native-worklets-core`, face detector, `expo-image-manipulator`.

### 4.2 Client — Add (new modules/components)

- `src/features/identity/` (new):
  - `IdvConsentScreen.tsx`
  - `IdCaptureScreen.tsx` (front/back guided capture + quality gate)
  - `LiveSelfieScreen.tsx` (liveness sequence + progress checklist)
  - `components/QualityChecklist.tsx`, `components/LivenessOverlay.tsx`
  - `hooks/useIdQuality.ts`, `hooks/useLiveness.ts`
  - `services/idvService.ts` (evidence assembly + uploads)
  - `lib/imageQuality.ts` (blur/brightness/glare/resolution)
  - `lib/frameScoring.ts` (best-frame selection)

### 4.3 Admin — Modify

- `src/screens/admin/ProviderDetailScreen.tsx` — add an "Identity Verification" evidence panel: ID front/back, best selfie, liveness summary (blink/left/right/passed|failed|manual_review), optional video viewer, optional AI advisory, and actions (approve / reject / request new ID / request new selfie / request full resubmission / notes). Reuse existing signed-URL + logging patterns.

### 4.4 Backend — Add

- `supabase/migrations/2026XXXX_identity_verification.sql` — extend schema (see §5).
- `supabase/functions/idv-face-match/` (flagged) — server-side compare.
- `supabase/functions/idv-retention/` (flagged) — retention sweeps.
- `platform_config` seed keys for feature flags + thresholds + retention.

---

## 5. Database Migration Plan (proposed)

Principle: **extend, don't duplicate.** Prefer new columns on existing tables +
one new `verification_media` table only where the current schema cannot cleanly
hold multi-artifact evidence.

### 5.1 Extend `provider_documents`

Add nullable, backward-compatible columns:

- `quality_score NUMERIC` , `quality_results JSONB` (blur/brightness/glare/framing/resolution booleans + values)
- `capture_method TEXT` (`camera_auto` | `camera_manual` | `gallery`)

### 5.2 New table `provider_verification_sessions` (one per attempt)

Holds the liveness + evidence summary and status machine, linked to `provider_id`:

- `id UUID PK`, `provider_id UUID FK`, `id_type TEXT`
- `status TEXT` — `draft | capture_in_progress | submitted | under_review | approved | rejected | resubmission_requested | manual_review_required | expired`
- `liveness_state TEXT` — `not_started | in_progress | passed | failed | manual_review`
- `blink_detected BOOL`, `left_turn_detected BOOL`, `right_turn_detected BOOL`
- `best_selfie_path TEXT` (object path, always signed on read)
- `liveness_video_path TEXT NULL` (flagged)
- `face_match_score NUMERIC NULL`, `ai_recommendation TEXT NULL`, `risk_flags JSONB`
- `id_front_document_id UUID FK → provider_documents`, `id_back_document_id UUID FK`, `selfie_document_id UUID FK NULL`
- `consent_accepted_at TIMESTAMPTZ`, `consent_version TEXT`
- `submitted_at`, `reviewed_at`, `reviewed_by`, `admin_notes TEXT`, `resubmission_reason TEXT`
- `created_at`, `updated_at`

### 5.3 Optional `verification_media` (only if needed)

If multiple best-frame candidates / video segments must be retained, add a
child table `verification_media(session_id, kind, path, meta JSONB, created_at)`.
Otherwise, the path columns on the session suffice — **prefer session columns**.

### 5.4 Admin audit

- Extend `provider_verification_logs` usage with new `action` values: `idv_submitted`, `request_new_id`, `request_new_selfie`, `request_resubmission`, `idv_admin_viewed` (access logging).

### 5.5 Feature flags / config (in `platform_config`)

- `idv_liveness_video_enabled = 'false'`
- `idv_face_match_enabled = 'false'`
- `idv_face_match_threshold = '0.80'`
- `idv_quality_strictness = 'lenient'`
- `idv_retention_*` keys

### 5.6 Migration safety

- All new columns **nullable**; no changes to existing constraints except (verified) allowing `selfie_with_id` in the `document_type` check if not already present.
- Additive only; no destructive changes. Existing records remain valid (session rows are created only for new attempts).

---

## 6. Storage & RLS Plan

- **Reuse `provider-documents`** for ID front/back and best selfie (already private, per-folder RLS). Keep the existing `{userId}/...` path convention; add descriptive prefixes: `{userId}/idv/{sessionId}/id_front_*`, `.../id_back_*`, `.../selfie_best_*`.
- **New private bucket `idv-liveness-video`** (only if video enabled) — same per-folder RLS pattern; admin-only signed read; short retention.
- **Reads:** always via `createSignedUrl` (short TTL). Never `getPublicUrl`. New evidence stores **object paths**, not public URLs.
- **RLS additions:** owner + admin policies on `provider_verification_sessions` mirroring `provider_documents`; storage policies for the new video bucket cloned from `provider-documents`.
- **Hardening:** strip EXIF via re-encode before upload; enforce MIME/size (existing `fileValidation`); rate-limit attempts (`rate_limits`); expire abandoned sessions; log admin access.

---

## 7. UI Flow (client)

Liveness sequence (exact copy, per requirements):

```
Center your face
→ Blink once
→ Turn your head slightly left
→ Turn your head slightly right
→ Hold still
→ Selfie captured automatically
```

Progress checklist:

```
Identity Verification
✓ Face detected
✓ Good lighting
✓ Blink detected
✓ Left turn detected
✓ Right turn detected
⏳ Selecting best selfie...
```

Then: `Verification capture complete` → `Uploading securely...`

- No shutter button during liveness. **"Please look back at the camera" is not used.**
- ID capture uses auto-capture when framed + stable, with **manual capture/retry** always available.
- Include: retry button, clear failure reason, progress indicator, accessible text, loading/upload states, timeout handling, camera-permission handling.
- **Manual-review fallback:** "Try again" and "Submit for manual selfie review" → captures a normal selfie, sets session `manual_review_required`, `liveness_state = manual_review` (never `passed`), sends to admin.

---

## 8. Backend Flow

1. Client creates a `provider_verification_sessions` row (`draft` → `capture_in_progress`).
2. Uploads ID front/back → `provider_documents` (+ quality JSON), links IDs on session.
3. Runs liveness on-device; sets blink/left/right/liveness_state + best selfie upload.
4. (flagged) uploads liveness video; (flagged) calls `idv-face-match` Edge Function → writes advisory score.
5. Client sets session `submitted`; provider `status = 'pending_review'`; log `idv_submitted`.
6. Admin loads evidence (signed URLs), reviews, and acts; every action logged; `idv_admin_viewed` recorded on open.

---

## 9. Admin Review Flow

New evidence panel in `ProviderDetailScreen`:

- **Applicant info** (existing).
- **ID Document:** type, front, back, quality result.
- **Selfie Verification:** best selfie, blink/left/right, liveness passed|failed|manual_review, optional "View liveness video".
- **AI Assistance (if enabled):** similarity score, quality score, risk flags, recommendation (advisory).
- **Admin Actions:** Approve, Reject, Request new ID, Request new selfie, Request complete resubmission, Add internal notes.
- Every action → `provider_verification_logs` (+ status transitions on session/provider).

---

## 10. Testing Plan

- **Quality:** good/bad lighting, blurred ID, glare, missing corners, wrong orientation, low resolution, finger occlusion, two documents.
- **Face positioning:** multiple faces, face too small/large, partial face, sunglasses, off-center start.
- **Liveness:** blink success/failure, slow/fast head turns, tolerant thresholds, no random-motion false positives.
- **Best-frame:** verify neutral, eyes-open, single-face frame is selected.
- **Fallback:** manual-review path sets correct statuses and reaches admin.
- **Resilience:** camera-permission denial, upload interruption/resume, app backgrounding, timeouts, low-end Android.
- **Security:** RLS isolation (user A cannot read user B), admin signed access, no public URLs, no secrets in APK.
- **Compatibility:** existing provider onboarding + admin approval still work; legacy `kyc_documents` still viewable.
- **Automated:** `npm run typecheck`; existing tests; new unit tests for `imageQuality`, `frameScoring`, liveness state machine; **local `cd android && .\gradlew assembleRelease` must succeed.**

---

## 11. Privacy & Retention

- **Consent screen** before capture explaining: why ID + selfie are collected, that live face actions are analyzed, that a selfie may be compared with the ID portrait (if enabled), what is stored, who reviews it, retention duration, and correction/deletion requests.
- **Configurable retention** (in `platform_config`) for: abandoned attempts, rejected attempts, approved attempts, liveness videos, audit logs.
- **No automatic deletion** of production evidence until the retention policy is explicitly approved.
- Do **not** upload every analyzed frame — only the selected best frame (and optional short video).

---

## 12. Rollback Plan

- All schema changes are **additive & nullable** → safe to leave in place; feature can be disabled without a DB rollback.
- **Feature flag kill-switch:** set `idv_*` flags off → new capture/liveness paths disabled; onboarding falls back to the current manual capture behavior (kept intact behind the flag).
- **Client rollback:** the new capture components are isolated under `src/features/identity/`; reverting Step 3 to call the existing `pickCamera`/upload handlers restores the current flow with no data loss.
- **Native rollback:** if VisionCamera/face-detector cannot build locally, revert `package.json`/`app.json`/`babel.config.js` additions and rebuild; `expo-image-picker` flow remains functional.
- **Storage:** new objects live under `{userId}/idv/...`; removing the feature leaves existing records untouched.

---

## 13. Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Face-detector Bouncy Castle JAR build failure (local Gradle) | High | Phase 2 spike to validate build; pin versions / clear cache / alternative binding |
| On-device quality checks too strict → user drop-off | Medium | Lenient, configurable thresholds; always allow manual capture/retry |
| Liveness false negatives on low-end devices | Medium | Tolerant angles; throttled analysis; manual-review fallback |
| New Architecture / worklets incompatibility | Medium | Keep New Arch off (SDK 51 default); validate worklets plugin |
| Face-match cost/privacy/legal | Medium | Server-side only, flagged OFF by default, documented cost/limits |
| PII exposure | High | Private buckets, signed URLs, EXIF stripping, access logging |
| Scope creep vs. beta timeline | Medium | Phase gating; ship quality + liveness first; defer video/face-match |

---

## 14. Phase Plan & Acceptance Mapping

- **Phase 1 (this doc):** audit + plan — **await approval.**
- **Phase 2:** ID quality (framing/blur/brightness/glare/resolution, auto+manual capture, retry copy).
- **Phase 3:** live selfie (positioning, blink, L/R turns, best-frame auto-capture, checklist, retry, manual fallback).
- **Phase 4:** backend (session records, secure upload, structured results, RLS, signed admin access, audit logging).
- **Phase 5:** admin dashboard (viewers, liveness summary, optional video, advisory, actions, notes/history).
- **Phase 6:** face comparison (flagged, after approval).
- **Phase 7:** testing matrix (§10) incl. local release build.

Acceptance criteria (1–20 in the task) are covered as follows: existing
front/back/data preserved (§1, §5.6, §12); pre-submit quality checks (§2.3, §7);
automatic blink/turn/best-frame with no shutter and no "look back" copy (§2.2,
§2.4, §7); manual-review fallback (§7); complete admin evidence with admin as
final decision-maker (§9); private media + per-user isolation + no APK secrets
(§6, §3); TypeScript/tests/new tests/local Gradle build (§10).

---

## 15. Open Questions For Approval

1. **Face-match provider** preference (AWS Rekognition vs Azure vs self-host) — or keep OFF for beta and only prepare schema?
2. **Liveness video** for beta — prepare-but-disabled (recommended) or enable now?
3. **ID edge detection** — accept JS/worklet heuristics first, or require OpenCV-grade contour detection in Phase 2?
4. Confirm we may add native deps (VisionCamera + face detector) given the known Bouncy Castle build risk, contingent on a successful Phase 2 build spike.
5. Retention durations for abandoned/rejected/approved/video/audit.

> **Awaiting approval before any Phase 2 implementation. No production code
> changed in Phase 1.**

---

# Phase 2A: Isolated Native Camera + ML Kit Spike

**Date:** 2026-07-26
**Branch:** `spike/idv-phase2a`
**Status:** FILES PREPARED — awaiting user to run install, build, and device tests.

> **No production verification flow has been modified.** All spike code is in
> `src/dev/idvSpike/` and is only reachable via `EXPO_PUBLIC_IDV_SPIKE=1` env var.
> Rolling back is as simple as `git checkout main` and deleting untracked files.

---

## 2A.1 Dependency Compatibility Analysis

### Target Environment

| Component | Version |
|---|---|
| React Native | 0.74.5 |
| Expo SDK | 51 |
| Gradle | 8.8 |
| JDK | 17 (Eclipse Adoptium) |
| AGP | (per android/build.gradle) |
| Hermes | Enabled |
| New Architecture | Disabled |
| AndroidX + Jetifier | Enabled |

### Selected Native Packages

| Package | Pinned Version | Rationale |
|---|---|---|
| `react-native-vision-camera` | **4.5.3** | Latest V4 stable (Jul 2024). V4 is archived but maintained for RN 0.74.x. V5 requires RN 0.85+ and Nitro modules — incompatible with our stack. |
| `react-native-worklets-core` | **1.3.3** | Latest 1.x stable (May 2024). Required by vision-camera v4 for frame processors. 1.4+ changes APIs; 1.3.3 is the safest match for VC 4.5.x. |
| `react-native-vision-camera-face-detector` | **1.7.2** | Latest V4-compatible face detector (Jul 2024). Uses `useFaceDetector` hook + `detectFaces` frame processor plugin backed by Google ML Kit. v2.x targets VC V5. |

### Compatibility Matrix

```
react-native-vision-camera 4.5.3
  ├─ requires react-native-worklets-core >= 1.0  ✅ (1.3.3)
  ├─ requires react-native >= 0.69               ✅ (0.74.5)
  ├─ requires JDK 17                             ✅
  └─ Android: minSdk 21                          ✅ (project default)

react-native-vision-camera-face-detector 1.7.2
  ├─ requires react-native-vision-camera >= 4.0  ✅ (4.5.3)
  ├─ requires react-native-worklets-core          ✅ (1.3.3)
  ├─ Android: ML Kit face detection (bundled)    ✅
  └─ API: useFaceDetector hook + detectFaces()    ✅

react-native-worklets-core 1.3.3
  ├─ requires react-native >= 0.69               ✅ (0.74.5)
  ├─ babel plugin: react-native-worklets-core/plugin ✅ (added)
  └─ must be BEFORE reanimated/plugin             ✅ (ordered)
```

### Known Build Risk: Bouncy Castle JAR Conflict

**Risk:** The ML Kit face detection dependency may transitively include
`org.bouncycastle:bcprov-jdk15on` which conflicts with another library in the
Gradle resolution graph, causing a `DuplicatePlatformClasses` or
`DependencyResolution` error during `assembleDebug`/`assembleRelease`.

**Mitigation plan if encountered:**
1. Record the exact error and conflicting dependency paths.
2. Add a targeted `exclude` in `android/app/build.gradle` for the Bouncy Castle
   group from the face-detector dependency only.
3. If exclusion fails, try forcing a specific Bouncy Castle version via
   `resolutionStrategy`.
4. Do NOT broadly upgrade Gradle, AGP, or other dependencies.
5. If all else fails, evaluate alternative ML Kit bindings
   (e.g., `vision-camera-face-detector-v4` by matrix2305).

---

## 2A.2 Files Added / Modified

### New Files (Spike — all in `src/dev/idvSpike/`)

| File | Purpose |
|---|---|
| `src/dev/idvSpike/spikeConfig.ts` | Centralized configurable thresholds + step instructions |
| `src/dev/idvSpike/livenessMachine.ts` | Pure, unit-testable liveness state machine (no native deps) |
| `src/dev/idvSpike/IdvSpikeScreen.tsx` | Isolated React Native screen: camera preview, face detection, liveness sequence, auto-capture |
| `src/dev/idvSpike/__tests__/livenessMachine.test.ts` | Jest unit tests covering all state machine transitions |
| `jest.config.js` | Minimal jest config for ts-jest test runner |
| `reports/identity-verification/IDENTITY_VERIFICATION_IMPLEMENTATION.md` | This document (Phase 2A section appended) |

### Modified Files (Minimal, reversible)

| File | Change | Impact |
|---|---|---|
| `package.json` | Added 3 native deps + 3 dev deps (jest, ts-jest, @types/jest) + test scripts | Only takes effect after `npm install` |
| `babel.config.js` | Added `react-native-worklets-core/plugin` before reanimated/plugin | Required for frame processors; no effect without the npm package |
| `index.ts` | Conditional dev-only entry: if `EXPO_PUBLIC_IDV_SPIKE=1`, loads spike screen; otherwise loads `App` unchanged | Production flow completely unaffected when env var is unset |

### Unmodified Files (Production verification flow — NOT touched)

- `src/screens/provider/ProviderOnboardingScreen.tsx`
- `src/screens/provider/ProviderDetailScreen.tsx`
- `src/navigation/ProviderNavigator.tsx`
- `App.tsx`
- `android/app/src/main/AndroidManifest.xml` (CAMERA permission already present)
- `app.json` (CAMERA permission already listed)
- No Supabase migrations, RLS policies, or storage bucket changes.

---

## 2A.3 Liveness Sequence Design

The spike implements the exact required sequence:

```
positioning → blink → turn_left → turn_right → hold_still → captured
```

1. **Positioning:** Single face detected, centered, adequate size, neutral yaw, sufficient lighting (eye-open probability available).
2. **Blink:** Eyes open → eyes closed → eyes open (configurable confirmation frames).
3. **Turn Left:** Yaw ≤ -leftYawThreshold for `turnConfirmFrames` consecutive samples.
4. **Turn Right:** Must return to neutral first, then yaw ≥ rightYawThreshold for `turnConfirmFrames` samples.
5. **Hold Still:** Centered + sized + neutral + eyes-open for `stableFrameDurationMs`.
6. **Captured:** `shouldCapture` flag set once → UI calls `takePhoto()` → camera stops.

**Configurable thresholds** (all in `spikeConfig.ts`):
- `targetFps: 5` — frame processor throttle
- `eyeOpenThreshold: 0.6`, `eyeClosedThreshold: 0.35`
- `leftYawThreshold: 12°`, `rightYawThreshold: 12°`
- `neutralYawTolerance: 10°`
- `stableFrameDurationMs: 700`
- `captureTimeoutMs: 45000`
- `invertYaw: false` — flip if left/right appear swapped on device

**Privacy:** No biometric values are logged or persisted. Live metrics are on-screen only.

---

## 2A.4 Runbook — Exact Commands for User to Execute

### Step 1: Install Dependencies

```powershell
# From project root: C:\Users\jhing\CascadeProjects\ServiceHub
npm install
```

> This installs the 3 native packages + jest/ts-jest. Node_modules will be
> updated. No Gradle build runs yet.

### Step 2: Run Unit Tests (No Device Needed)

```powershell
npm run test:idv-spike
```

> Expected: All tests in `livenessMachine.test.ts` pass (20+ test cases covering
> positioning, blink, turn left/right, hold still, capture, timeout, terminal
> states, scoreFrame, invertYaw, and full happy-path sequence).

### Step 3: Prebuild Native Android Project

```powershell
npx expo prebuild --platform android --clean
```

> This regenerates `android/` native project files with the new native deps
> linked. The `--clean` flag removes the existing `android/` folder and
> regenerates from scratch.

### Step 4: Debug Build

```powershell
cd android
.\gradlew assembleDebug
```

> Expected: `android/app/build/outputs/apk/debug/app-debug.apk` is produced.
>
> **If Bouncy Castle conflict occurs:** Record the full error, then try adding
> to `android/app/build.gradle` inside `dependencies { }`:
> ```
> implementation("react-native-vision-camera-face-detector") {
>   exclude group: 'org.bouncycastle', module: 'bcprov-jdk15on'
> }
> ```
> Re-run `.\gradlew assembleDebug`.

### Step 5: Release Build

```powershell
cd android
.\gradlew assembleRelease
```

> Expected: `android/app/build/outputs/apk/release/app-release.apk` (may need
> signing config — if unsigned, the file will be `app-release-unsigned.apk`).

### Step 6: Install on Device and Run Spike

```powershell
# Install debug APK to connected device
adb install android\app\build\outputs\apk\debug\app-debug.apk

# Launch with spike env var
# Option A: Set env var before starting Metro
$env:EXPO_PUBLIC_IDV_SPIKE=1
npx expo start --dev-client

# Option B: Or build with the env var baked in
$env:EXPO_PUBLIC_IDV_SPIKE=1
npx expo prebuild --platform android --clean
cd android
.\gradlew assembleDebug
```

> When `EXPO_PUBLIC_IDV_SPIKE=1`, the app launches directly into
> `IdvSpikeScreen` — no navigation, no login, no production screens.

### Step 7: Device Test Checklist

On the device, verify each item:

- [ ] **Camera permission:** App requests camera permission on launch.
- [ ] **Front camera preview:** Live camera preview is visible (front camera).
- [ ] **Face detection:** When one face is in frame, `faces:1` appears in metrics.
- [ ] **Multiple faces:** When 2+ faces are visible, coaching message "Only one person should be visible" appears.
- [ ] **Yaw angle:** Turning head left/right changes the `yaw:` value in metrics.
- [ ] **Eye probabilities:** `eyeL:` and `eyeR:` show values between 0.00–1.00 when face is well-lit.
- [ ] **Lighting detection:** In poor lighting, eye probabilities show `n/a` and hint says "Move to a brighter area".
- [ ] **Blink detection:** Complete a natural blink → checklist shows "Blink detected ✓".
- [ ] **Left turn:** Turn head left → checklist shows "Left turn detected ✓".
- [ ] **Right turn:** Return to center, then turn right → checklist shows "Right turn detected ✓".
- [ ] **Hold still:** Remain centered and face-forward → "Selecting best selfie..." appears.
- [ ] **Auto-capture:** After ~700ms stable → "Selfie captured (best frame)" appears.
- [ ] **Camera stop/release:** After capture, camera preview freezes/stops (isActive=false).
- [ ] **Background/foreground:** Press home button → camera stops. Return to app → camera resumes (if sequence still running).
- [ ] **Retry:** Tap "Retry" → sequence resets and camera restarts.
- [ ] **Timeout:** If no action for 45s → "Timed out. Please try again." appears.
- [ ] **Frame responsiveness:** UI remains responsive during face detection (no jank at 5fps throttle).

### Step 8: Record Results

Fill in the template below (§2A.5) and paste into this document.

### Step 9: Rollback (if needed)

```powershell
# Discard all spike changes and return to main
git checkout main

# Or if you want to keep the branch but reset:
git stash
git checkout main
```

> The spike branch `spike/idv-phase2a` remains available for future reference.

---

## 2A.5 Deliverable Template (Fill After Device Tests)

### Build Results

| Build | Status | APK Path | Notes |
|---|---|---|---|
| Debug (`assembleDebug`) | [PASS/FAIL] | | |
| Release (`assembleRelease`) | [PASS/FAIL] | | |

### Unit Test Results

```
# Paste jest output summary here
# Expected: Tests: X passed, X total
```

### Device Test Results

| Test Item | Result | Notes |
|---|---|---|
| Camera permission | [PASS/FAIL] | |
| Front camera preview | [PASS/FAIL] | |
| Face detection (1 face) | [PASS/FAIL] | |
| Multiple faces coaching | [PASS/FAIL] | |
| Yaw angle values | [PASS/FAIL] | |
| Eye open probabilities | [PASS/FAIL] | |
| Lighting detection | [PASS/FAIL] | |
| Blink detection | [PASS/FAIL] | |
| Left turn detection | [PASS/FAIL] | |
| Right turn detection | [PASS/FAIL] | |
| Hold still + auto-capture | [PASS/FAIL] | |
| Camera stop/release | [PASS/FAIL] | |
| Background/foreground safety | [PASS/FAIL] | |
| Retry | [PASS/FAIL] | |
| Timeout | [PASS/FAIL] | |
| Frame responsiveness | [PASS/FAIL] | |

### Bouncy Castle Conflict

- [ ] Not encountered
- [ ] Encountered — error recorded below:

```
# Paste full Gradle error here
```

- Resolution attempted: [describe]
- Outcome: [resolved/unresolved]

### Performance Observations

- Frame processor FPS: [observed]
- UI responsiveness: [smooth/janky/delayed]
- Camera warm-up time: [seconds]
- Time to first face detection: [seconds]

### Known Limitations

1. [List any issues discovered]

### Recommendation

- [ ] **PROCEED** — All spike goals met, no blocking issues.
- [ ] **PROCEED WITH CHANGES** — Mostly working, but note required adjustments:
  1. [List changes needed]
- [ ] **DO NOT PROCEED** — Blocking issues found:
  1. [List blocking issues]

---

## 2A.6 Architecture Notes

### Liveness State Machine (`livenessMachine.ts`)

The state machine is **pure and deterministic** — it has zero native dependencies
and can be unit-tested on CI without a device or camera. It consumes normalized
`FaceSample` objects (produced by the JS-thread callback from the frame processor)
and returns a new `LivenessState` on each call.

```
FaceSample → advance(prevState, sample, cfg, now) → newState
```

Key design decisions:
- **No mutation:** `advance()` always returns a new state object.
- **`shouldCapture` flag:** Set `true` exactly once, on entry to `captured`. The UI layer checks this and calls `takePhoto()`.
- **`awaitingNeutral` between turns:** Prevents the right turn from being triggered by residual left yaw.
- **`scoreFrame()`:** Scores frames during hold-still for best-frame selection (centered + eyes-open + neutral + well-sized).
- **`invertYaw` config:** Handles front-camera mirroring differences across devices.

### Spike Screen (`IdvSpikeScreen.tsx`)

- Uses `useCameraDevice('front')` + `useCameraPermission()` from vision-camera.
- Uses `useFaceDetector()` from the face detector package with `classificationMode: 'all'` for eye-open probabilities.
- Frame processor runs via `useFrameProcessor` + `runAtTargetFps(5)` for throttling.
- Face results are passed to JS via `Worklets.createRunOnJS()` callback.
- `AppState` listener stops camera on background, resumes on foreground.
- `stopListeners()` called on unmount to release Android orientation listener.
- No Supabase, no upload, no face comparison, no liveness video.

### Entry Point Guard (`index.ts`)

```typescript
const isSpike = process.env.EXPO_PUBLIC_IDV_SPIKE === '1';
if (isSpike) {
  registerRootComponent(IdvSpikeScreen);
} else {
  registerRootComponent(App);
}
```

When `EXPO_PUBLIC_IDV_SPIKE` is not set (production), `App` loads normally —
zero impact on the existing app.

---

## 2A.7 Babel Configuration

```javascript
plugins: [
  ['react-native-worklets-core/plugin', { globals: ['__camera'] }],
  'react-native-reanimated/plugin',  // must be last
]
```

The worklets plugin must appear **before** the reanimated plugin. The `__camera`
global is used by vision-camera's frame processor runtime.

---

> **End of Phase 2A documentation. Awaiting user to execute runbook steps 1–8
> and fill in §2A.5 deliverable template with results.**
