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
| Android minSdkVersion | **26** (raised from 23 for spike — see §2A.1.1) |

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
  └─ Android: minSdk 21                          ✅ (raised to 26)

react-native-vision-camera-face-detector 1.7.2
  ├─ requires react-native-vision-camera >= 4.0  ✅ (4.5.3)
  ├─ requires react-native-worklets-core          ✅ (1.3.3)
  ├─ Android: ML Kit face detection (bundled)    ✅
  ├─ Android: minSdk 26                          ✅ (raised from 23)
  └─ API: useFaceDetector hook + detectFaces()    ✅

react-native-worklets-core 1.3.3
  ├─ requires react-native >= 0.69               ✅ (0.74.5)
  ├─ babel plugin: react-native-worklets-core/plugin ✅ (added)
  └─ must be BEFORE reanimated/plugin             ✅ (ordered)
```

### minSdkVersion Change (23 → 26)

**File:** `android/build.gradle:6`
**Change:** Fallback value for `android.minSdkVersion` changed from `'23'` to `'26'`.

**Reason:** `react-native-vision-camera-face-detector` 1.7.2 declares
`minSdkVersion 26` in its AndroidManifest. The project's previous `minSdk 23`
caused a manifest merger failure during `assembleDebug`.

**Impact:** The eventual app would support **Android 8.0 (Oreo) and above**
only. Devices running Android 7.x (Nougat, API 24–25) and below would no longer
be supported. As of 2026, Android 8.0+ covers >95% of active devices per
Google's distribution dashboard.

**Isolation:** This change is on the `spike/idv-phase2a` branch only. It does
NOT affect the `main` branch. If the spike is rolled back, `minSdkVersion`
reverts to 23.

**No `tools:overrideLibrary` used.** The fix is a clean minSdk raise, not a
manifest override.

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
| `android/build.gradle` | Raised minSdkVersion fallback from 23 to 26 | Required by face-detector's minSdk 26; means Android 8.0+ only |

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

---

## Phase 2B — Controlled Production Integration

### §2B.0 Spike Results Summary

**Status:** ✅ Passed on real OPPO A94 device

| Check | Result |
|---|---|
| Debug Android build | ✅ Succeeded |
| Vision Camera | ✅ Works |
| ML Kit face detection | ✅ Works |
| Single-face detection | ✅ Exactly one face |
| Good-lighting check | ✅ Passed |
| Blink detection | ✅ Passed |
| Left turn detection | ✅ Passed |
| Right turn detection | ✅ Passed |
| Hold-still state | ✅ Passed |
| Best selfie frame capture | ✅ Auto-captured |
| Liveness state-machine tests | ✅ 37/37 passed |
| TypeScript | ✅ 0 errors |
| Bouncy Castle conflict | ✅ None |
| minSdkVersion | 26 (required by detector) |

---

### §2B.1 Integration Audit and Exact Plan

#### §2B.1.1 Existing Production Flow — Current State

**Onboarding screen:** `src/screens/provider/ProviderOnboardingScreen.tsx` (1661 lines)

The current 4-step onboarding flow:

1. **Step 1 — Business:** Business name, address, city, province, mobile, email, description, GPS
2. **Step 2 — Category:** Select primary service category
3. **Step 3 — Documents:**
   - ID type selection (dropdown: `PH_ID_TYPES`)
   - ID front (camera capture → upload → `provider_documents` row)
   - ID back (camera capture → upload → `provider_documents` row)
   - **Selfie with ID** (camera capture → upload → `provider_documents` row)
   - Supporting documents (permits, camera or gallery)
4. **Step 4 — Review:** Summary + consent checkboxes → submit

**Selfie insertion point:** Lines 1118–1142 in `renderStep3()`. The selfie section:
- Uses `selfie` state: `useState<ValidIdSide>({ uri, uploadedUrl, state, error })`
- `pickAndUploadSelfie()` → calls `pickCamera()` → `doSelfieUpload(uri, mimeType)`
- `doSelfieUpload()` (line 527): uploads to `provider-documents` bucket at path `{userId}/selfie_with_id_{timestamp}.{ext}`, then inserts a `provider_documents` row with `document_type: 'selfie_with_id'`, `category_type: 'valid_id'`
- `retrySelfie()`, `removeSelfie()` for error handling
- Validation in `validateStep3()` (line 410): `if (!selfie.uploadedUrl) return 'Please take a selfie holding your Government ID.'`

**Admin screen:** `src/screens/admin/ProviderDetailScreen.tsx` (1405 lines)

- `loadData()` fetches providers, `provider_documents`, `provider_verification_logs`, featured data, platform fees
- Documents displayed with signed URLs (1-hour expiry) via `createSignedUrl()`
- Per-document actions: Approve / Reject / Resubmit (writes to `provider_verification_logs`)
- Provider-level actions: Approve / Reject / Suspend (writes to `provider_verification_logs`)
- Moderation timeline shows all log entries

#### §2B.1.2 Existing Database Schema

**`provider_documents` table** (migration `20260526120946`):

```sql
CREATE TABLE public.provider_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'valid_id', 'government_id',
    'barangay_clearance', 'business_permit',
    'dti_registration', 'bir_registration', 'tesda_certificate',
    'professional_cert', 'other_supporting'
  )),
  category_type TEXT NOT NULL DEFAULT 'permit_certificate'
    CHECK (category_type IN ('valid_id', 'permit_certificate')),
  id_type TEXT,
  side TEXT CHECK (side IN ('front', 'back')),
  file_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);
```

**`provider_verification_logs` table** (schema.sql line 263):

```sql
CREATE TABLE IF NOT EXISTS public.provider_verification_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID REFERENCES public.providers(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**`platform_config` table** (migration `20260602150000`):

```sql
CREATE TABLE IF NOT EXISTS public.platform_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS: service_role SELECT only
```

**Storage bucket `provider-documents`:** Private (`public = false`)

Existing storage policies:
- Upload: `auth.uid()::text = (storage.foldername(name))[1]` — user uploads to `{userId}/...`
- Read own: same folder check
- Admin read: `role = 'admin'` in users table
- Update own: same folder check
- Delete own: same folder check

#### §2B.1.3 Feature Flag — Current State

**File:** `src/config/featureFlags.ts` (7 lines)

```typescript
export const BETA_MODE = false;
export const ENABLE_GOOGLE_SIGNIN = true;
```

Currently uses hardcoded constants only. No server-side flag loading.

**`platform_config` table** exists but is RLS-locked to `service_role` only — the client cannot read it with the anon key. This is by design for sensitive config like push notification URLs.

#### §2B.1.4 Exact Integration Plan

##### A. Database Migration (additive, nullable columns)

**New migration file:** `supabase/migrations/20260726200000_add_liveness_to_provider_documents.sql`

Add nullable columns to `provider_documents` so existing rows are unaffected:

```sql
ALTER TABLE public.provider_documents
  ADD COLUMN IF NOT EXISTS liveness_status TEXT
    CHECK (liveness_status IN ('passed', 'manual_review', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS blink_detected BOOLEAN,
  ADD COLUMN IF NOT EXISTS left_turn_detected BOOLEAN,
  ADD COLUMN IF NOT EXISTS right_turn_detected BOOLEAN,
  ADD COLUMN IF NOT EXISTS capture_quality_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS best_selfie_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS liveness_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS manual_review_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS liveness_details JSONB,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS device_platform TEXT;
```

Also extend the `document_type` CHECK constraint to include `'selfie_liveness'`:

```sql
ALTER TABLE public.provider_documents DROP CONSTRAINT IF EXISTS provider_documents_document_type_check;
ALTER TABLE public.provider_documents ADD CONSTRAINT provider_documents_document_type_check
  CHECK (document_type IN (
    'valid_id', 'government_id',
    'barangay_clearance', 'business_permit',
    'dti_registration', 'bir_registration', 'tesda_certificate',
    'professional_cert', 'other_supporting',
    'selfie_liveness'
  ));
```

**No new tables.** No RLS changes needed — existing `provider_documents` policies already cover the new columns (owner can insert/update own rows, admin can read all).

**Seed the feature flag:**

```sql
INSERT INTO public.platform_config (key, value)
VALUES ('identity_live_selfie_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
```

**Add a new RLS policy to allow authenticated users to read the flag:**

```sql
DO $$
BEGIN
  CREATE POLICY "Authenticated can read feature flags"
  ON public.platform_config FOR SELECT
  TO authenticated
  USING (key LIKE '%_enabled' OR key LIKE '%_flag');
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'Policy already exists, skipping';
END $$;
```

This exposes only feature-flag keys (ending in `_enabled` or `_flag`), not sensitive config like URLs.

##### B. Feature Flag Loader

**New file:** `src/config/remoteFlags.ts`

- `loadRemoteFlag(key: string): Promise<boolean>` — queries `platform_config` for the key, returns `value === 'true'`
- `useRemoteFlag(key: string): { enabled: boolean; loading: boolean }` — hook that loads on mount
- Local dev override: `EXPO_PUBLIC_IDV_LIVE_SELFIE=1` env var bypasses server check for development
- Production behavior: controlled by `platform_config.identity_live_selfie_enabled` server-side
- Default: `false` (disabled)

**Modify:** `src/config/featureFlags.ts` — add `IDENTITY_LIVE_SELFIE_ENABLED = false` as local default.

##### C. Production Live-Selfie Screen

**New file:** `src/screens/provider/LiveSelfieVerificationScreen.tsx`

Clean, production-ready UI built on the proven spike code:

- **No developer diagnostics:** No FPS, yaw, eye probabilities, step names, or raw scores
- **Oval face guide:** Centered oval overlay for face positioning
- **One instruction at a time:** Maps state machine steps to user-friendly text:
  - `positioning` → "Center your face in the oval"
  - `blink` → "Blink once"
  - `turn_left` → "Turn your head slightly left"
  - `turn_right` → "Turn your head slightly right"
  - `hold_still` → "Hold still"
  - `captured` → "Selfie captured"
- **Compact progress indicator:** 5 dots (positioning, blink, left, right, hold) — filled when complete
- **Automatic advance:** No manual shutter during liveness
- **Correction guidance:** Shows hints from state machine:
  - "Center your face"
  - "Move closer"
  - "Move farther away"
  - "Move to a brighter area"
  - "Only one person should be visible"
  - "Keep both eyes visible"
  - "Remove sunglasses"
  - "Hold the phone steadily"
- **Retry button:** Resets state machine to initial
- **Manual fallback button:** "Submit for manual selfie review" — captures a normal selfie, marks `liveness_status = 'manual_review'`
- **Upload progress:** Shows uploading state with spinner
- **Selfie review:** Shows captured photo with "Use this photo" / "Retake" buttons before submission
- **Never uses:** "Please look back at the camera"

**Reuses from spike:**
- `livenessMachine.ts` (state machine — unchanged)
- `spikeConfig.ts` (thresholds — will be moved to a production config location)

**New config file:** `src/config/livenessConfig.ts` — production copy of thresholds with `invertYaw` defaulting to `false`.

##### D. Integration into ProviderOnboardingScreen

**Modify:** `src/screens/provider/ProviderOnboardingScreen.tsx`

Changes are minimal and behind the feature flag:

1. **Import** `useRemoteFlag` and `LiveSelfieVerificationScreen`
2. **Add flag hook:** `const { enabled: liveSelfieEnabled, loading: flagLoading } = useRemoteFlag('identity_live_selfie_enabled')`
3. **In `renderStep3()` selfie section (lines 1118–1142):**
   - If `liveSelfieEnabled` is `true`: render a "Start Live Selfie Verification" button that opens `LiveSelfieVerificationScreen` as a modal or navigates to it
   - If `liveSelfieEnabled` is `false`: render the existing manual selfie capture UI (unchanged)
   - If `flagLoading`: show a brief spinner
4. **On liveness completion callback:** Set `selfie` state with the uploaded URL and liveness metadata, same as current `doSelfieUpload` but with additional liveness fields
5. **`doSelfieUpload` enhancement:** When liveness data is present, include the new columns in the `provider_documents` insert
6. **`validateStep3()`:** Unchanged — still checks `selfie.uploadedUrl`

**The manual selfie flow remains fully intact as fallback.** When the flag is off, the screen behaves exactly as it does today.

##### E. Admin Review Enhancements

**Modify:** `src/screens/admin/ProviderDetailScreen.tsx`

1. **Extend `DocRecord` interface** to include optional liveness fields:
   ```typescript
   interface DocRecord {
     // ... existing fields ...
     liveness_status?: string | null;
     blink_detected?: boolean | null;
     left_turn_detected?: boolean | null;
     right_turn_detected?: boolean | null;
     capture_quality_score?: number | null;
     manual_review_required?: boolean | null;
     liveness_captured_at?: string | null;
     attempt_count?: number | null;
     device_platform?: string | null;
   }
   ```

2. **In the documents section** (after line 838), when a document has `liveness_status`:
   - Show a "Liveness Verification" card with:
     - Status badge (Passed / Manual Review / Failed)
     - Blink: ✓/✗
     - Left turn: ✓/✗
     - Right turn: ✓/✗
     - Capture quality: score/1.0
     - Manual review flag
     - Captured at timestamp
     - Attempt count
     - Device platform

3. **Admin actions extension** — add to the action grid:
   - "Request New Selfie" — updates provider status with rejection reason "New selfie required", logs to `provider_verification_logs` with action `selfie_resubmission_requested`
   - "Request Full Resubmission" — existing reject flow with specific note

4. **All actions continue to write to `provider_verification_logs`** — no new audit table needed.

##### F. Storage Path Convention

- Liveness selfie: `{userId}/selfie_liveness_{timestamp}.jpg`
- Manual fallback selfie: `{userId}/selfie_with_id_{timestamp}.jpg` (existing path pattern)
- No public URLs stored — only the object path in `best_selfie_storage_path`
- Admin views via signed URLs (existing pattern in `ProviderDetailScreen`)

##### G. Security Checklist

- ✅ No service-role key in APK — client uses anon key only
- ✅ No database URL in APK — `EXPO_PUBLIC_SUPABASE_URL` is the project URL, not a direct DB connection
- ✅ No private AI-provider keys in APK
- ✅ Verification files remain private — `provider-documents` bucket is `public = false`
- ✅ Users access only their own files — storage policy checks `(storage.foldername(name))[1] = auth.uid()::text`
- ✅ Admins access via signed URLs — existing `createSignedUrl` pattern with 1-hour expiry
- ✅ No raw biometric values logged in production — liveness_details JSON stores only pass/fail booleans and score, not raw yaw/eye values
- ✅ No camera frames persisted other than the chosen evidence frame — only `takePhoto` result is uploaded
- ✅ Temporary files cleaned — camera temp files are in app cache, not explicitly persisted

#### §2B.1.5 Files to be Modified/Created

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260726200000_add_liveness_to_provider_documents.sql` | **Create** | Add nullable liveness columns + seed flag + RLS policy |
| `src/config/remoteFlags.ts` | **Create** | Server-side feature flag loader + hook |
| `src/config/featureFlags.ts` | **Modify** | Add `IDENTITY_LIVE_SELFIE_ENABLED` default |
| `src/config/livenessConfig.ts` | **Create** | Production liveness thresholds (copy of spike config) |
| `src/screens/provider/LiveSelfieVerificationScreen.tsx` | **Create** | Production live-selfie screen (clean UI) |
| `src/screens/provider/ProviderOnboardingScreen.tsx` | **Modify** | Conditional selfie flow behind flag |
| `src/screens/admin/ProviderDetailScreen.tsx` | **Modify** | Show liveness data in admin review |
| `src/types/index.ts` | **Modify** | Add liveness fields to `ProviderDocument` interface |
| `src/dev/idvSpike/livenessMachine.ts` | **Reuse** | State machine (imported, not copied) |
| `reports/identity-verification/IDENTITY_VERIFICATION_IMPLEMENTATION.md` | **Modify** | This document |

**Files NOT modified (production safety):**
- `App.tsx`
- `src/navigation/ProviderNavigator.tsx` (unless navigation route needed)
- `android/build.gradle` (already at minSdk 26 on spike branch)
- `android/app/src/main/AndroidManifest.xml`
- `app.json`
- `babel.config.js`
- `package.json` (native deps already installed on spike branch)

#### §2B.1.6 Rollback Steps

1. **Set feature flag to false:** `UPDATE platform_config SET value = 'false' WHERE key = 'identity_live_selfie_enabled'` — instantly reverts all users to manual selfie flow
2. **Revert code:** `git checkout main -- src/screens/provider/ProviderOnboardingScreen.tsx src/screens/admin/ProviderDetailScreen.tsx src/config/featureFlags.ts src/types/index.ts` — removes all integration code
3. **Delete new files:** `src/config/remoteFlags.ts`, `src/config/livenessConfig.ts`, `src/screens/provider/LiveSelfieVerificationScreen.tsx`
4. **Database columns are nullable and additive** — no need to drop them. They will be ignored by the reverted code.
5. **If full DB rollback needed:** `ALTER TABLE public.provider_documents DROP COLUMN IF EXISTS liveness_status, blink_detected, left_turn_detected, right_turn_detected, capture_quality_score, best_selfie_storage_path, liveness_captured_at, manual_review_required, liveness_details, attempt_count, device_platform;`
6. **No storage bucket changes** — no rollback needed for storage.

#### §2B.1.7 Test Plan

| Test | Type | Description |
|---|---|---|
| Feature flag disabled uses manual flow | Unit | Mock `useRemoteFlag` returns `false`, verify manual selfie UI renders |
| Feature flag enabled opens live selfie | Unit | Mock `useRemoteFlag` returns `true`, verify live selfie button renders |
| Successful liveness saves correct result | Unit | Run state machine to captured, verify liveness_status='passed', all checks true |
| Retry resets state | Unit | Start liveness, trigger retry, verify state resets to positioning |
| Manual fallback records manual_review | Unit | Trigger manual fallback, verify liveness_status='manual_review', never 'passed' |
| Upload failure preserves retry | Unit | Mock upload failure, verify error state with retry button |
| Admin signed URL generation | Unit | Mock `createSignedUrl`, verify URL generated for liveness document |
| Unauthorized users cannot access media | Unit | Verify storage RLS policies reject non-owner access |
| Existing onboarding still works | Unit | Full onboarding flow with flag=false, verify all 4 steps complete |
| Liveness state machine | Unit | Existing 37 tests in `livenessMachine.test.ts` (unchanged) |

#### §2B.1.8 Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Feature flag RLS exposes sensitive config | Low | Policy restricts to keys matching `%_enabled` or `%_flag` pattern only |
| Liveness screen crashes on older devices | Medium | Feature flag defaults to false; can be enabled per-deployment |
| Storage path conflicts with existing selfie | Low | New `selfie_liveness` document_type, distinct path pattern |
| Admin screen becomes too complex | Low | Liveness card only renders when `liveness_status` is non-null |
| Migration fails on live DB | Low | All columns are `ADD COLUMN IF NOT EXISTS`, constraints use `DROP CONSTRAINT IF EXISTS` first |

---

> **Phase 2B.1 audit complete. No production code has been modified.
> Awaiting user review and approval before proceeding to Phase 2B.2 implementation.**

---

### §2B.2 Implementation Report

#### §2B.2.1 Files Changed

| File | Action | Lines |
|---|---|---|
| `supabase/migrations/20260726200000_add_liveness_to_provider_documents.sql` | **Created** | 71 lines |
| `src/config/remoteFlags.ts` | **Created** | 79 lines |
| `src/config/livenessConfig.ts` | **Created** | 82 lines |
| `src/config/featureFlags.ts` | **Modified** | +4 lines |
| `src/types/index.ts` | **Modified** | +12 lines (DocumentType + ProviderDocument) |
| `src/screens/provider/LiveSelfieVerificationScreen.tsx` | **Created** | 482 lines |
| `src/screens/provider/ProviderOnboardingScreen.tsx` | **Modified** | +~60 lines (imports, state, conditional UI, modal, upload) |
| `src/screens/admin/ProviderDetailScreen.tsx` | **Modified** | +~120 lines (DocRecord fields, liveness label, liveness card) |
| `src/dev/idvSpike/__tests__/livenessIntegration.test.ts` | **Created** | 226 lines (19 new tests) |
| `reports/identity-verification/IDENTITY_VERIFICATION_IMPLEMENTATION.md` | **Modified** | This section |

#### §2B.2.2 Migration Contents

**File:** `supabase/migrations/20260726200000_add_liveness_to_provider_documents.sql`

1. **Additive nullable columns** on `provider_documents`:
   - `liveness_status` TEXT with CHECK constraint (`passed`, `manual_review`, `failed`, `skipped`)
   - `blink_detected` BOOLEAN
   - `left_turn_detected` BOOLEAN
   - `right_turn_detected` BOOLEAN
   - `capture_quality_score` DOUBLE PRECISION
   - `best_selfie_storage_path` TEXT (object path only, never public URL)
   - `liveness_captured_at` TIMESTAMPTZ
   - `manual_review_required` BOOLEAN DEFAULT false
   - `liveness_details` JSONB (pass/fail booleans + score, no raw biometrics)
   - `attempt_count` INTEGER DEFAULT 1
   - `device_platform` TEXT

2. **Extended `document_type` CHECK** to include `'selfie_liveness'`

3. **Seeded feature flag:** `identity_live_selfie_enabled` = `'false'` in `platform_config`

4. **SECURITY DEFINER RPC** `get_feature_flags()` — returns only allowlisted keys from `platform_config`. Currently allowlisted: `identity_live_selfie_enabled`. Future flags can be added to the `IN (...)` list.

5. **GRANT EXECUTE** on `get_feature_flags()` to `authenticated` only

6. **REVOKE SELECT** on `platform_config` from `authenticated` and `anon` (defensive)

#### §2B.2.3 Feature Flag Security Model

**Approach:** SECURITY DEFINER RPC (preferred approach #1 from user's security adjustment)

```
Client (anon key) → supabase.rpc('get_feature_flags') → SECURITY DEFINER function
  → SELECT key, value FROM platform_config WHERE key IN ('identity_live_selfie_enabled')
  → Returns only allowlisted rows
```

- **No table-level SELECT** granted to `authenticated` or `anon` on `platform_config`
- The function runs with the **owner's privileges** (service_role-level access)
- Only **explicitly allowlisted keys** are returned — sensitive config like `push_notification_url` is never exposed
- **Local dev override:** `EXPO_PUBLIC_IDV_LIVE_SELFIE=1` env var bypasses the RPC for development
- **Production default:** `false` (disabled) — must be explicitly set to `'true'` in `platform_config` to enable
- The `useRemoteFlag` hook caches results in-memory to avoid repeated RPC calls

#### §2B.2.4 Test Results

| Test Suite | Tests | Result |
|---|---|---|
| `livenessMachine.test.ts` | 37 | ✅ All passed |
| `livenessIntegration.test.ts` | 19 | ✅ All passed |
| **Total** | **56** | **✅ All passed** |

New integration tests cover:
- Feature flag defaults
- Full successful liveness sequence (positioning → blink → left → right → hold → captured)
- Liveness checks set correctly on success
- Retry resets state
- Manual fallback never sets 'passed'
- Upload failure preserves retry
- normalizeYaw (invertYaw false/true, -0 normalization)
- scoreFrame (no face, well-centered, off-center penalty)
- Timeout behavior
- Multiple faces / no face hints
- Existing onboarding compatibility (importable, config thresholds match)

**TypeScript:** `npx tsc --noEmit` → 0 errors

#### §2B.2.5 Android Build Result

`.\gradlew assembleDebug` — ✅ **BUILD SUCCESSFUL** in 50s

#### §2B.2.6 Known Limitations

1. **No face comparison:** The system verifies liveness (real person, present) but does not compare the selfie to the ID photo. Admin remains the final decision-maker.
2. **No liveness video:** Only a single best-frame photo is captured and stored. No video is recorded or persisted.
3. **Feature flag default false:** The live selfie flow is disabled by default. Must be explicitly enabled in `platform_config` for production use.
4. **minSdkVersion 26:** Android 8.0+ only (required by face detector library).
5. **invertYaw device-specific:** If left/right turns appear swapped on a specific device, `invertYaw` in `livenessConfig.ts` should be flipped to `true`.
6. **Manual fallback always available:** Users can always choose "Submit for Manual Review" which captures a normal selfie and marks `liveness_status = 'manual_review'`.
7. **No automatic merge to main:** Code is on `spike/idv-phase2a` branch. Merge requires explicit review.

#### §2B.2.7 Rollback Steps

1. **Instant rollback (no code change):** Set `platform_config.identity_live_selfie_enabled` to `'false'` — all users revert to manual selfie flow immediately
2. **Code rollback:** `git checkout main -- src/screens/provider/ProviderOnboardingScreen.tsx src/screens/admin/ProviderDetailScreen.tsx src/config/featureFlags.ts src/types/index.ts`
3. **Delete new files:** `src/config/remoteFlags.ts`, `src/config/livenessConfig.ts`, `src/screens/provider/LiveSelfieVerificationScreen.tsx`, `src/dev/idvSpike/__tests__/livenessIntegration.test.ts`
4. **Database columns are nullable/additive** — no need to drop them; reverted code ignores them
5. **Full DB rollback if needed:**
   ```sql
   DROP FUNCTION IF EXISTS public.get_feature_flags();
   ALTER TABLE public.provider_documents DROP COLUMN IF EXISTS
     liveness_status, blink_detected, left_turn_detected,
     right_turn_detected, capture_quality_score, best_selfie_storage_path,
     liveness_captured_at, manual_review_required, liveness_details,
     attempt_count, device_platform;
   ```
6. **No storage bucket changes** — no rollback needed for storage

---

> **Phase 2B.2 implementation complete. Stopping for review.
> No production database has been modified. Feature flag defaults to false.**

---

### §2C Implementation Report — Modernized Verification Selfie

#### §2C.1 Objective

Modernize the existing provider identity verification system from the legacy "Selfie with ID" experience into a professional AI-assisted Verification Selfie workflow, comparable to modern banking/fintech eKYC applications.

Key changes:
- Retire `selfie_with_id` document type → replace with `verification_selfie`
- Add `verification_mode` column (`legacy_manual`, `live_liveness`, `manual_review`)
- Remove legacy sample image (person holding ID)
- Clean, modern UI with no developer diagnostics
- Preserve existing onboarding, admin review, audit logging, and storage

#### §2C.2 Files Changed

| File | Action | Summary |
|---|---|---|
| `supabase/migrations/20260726210000_modernize_verification_selfie.sql` | **Created** | Rename document_type, add verification_mode, backfill old records |
| `src/types/index.ts` | **Modified** | Replace `selfie_with_id`/`selfie_liveness` with `verification_selfie`, add `verification_mode` |
| `src/screens/provider/ProviderOnboardingScreen.tsx` | **Modified** | Remove sample image, rename to "Verification Selfie", update text/instructions, add `verification_mode` to upload |
| `src/screens/provider/LiveSelfieVerificationScreen.tsx` | **Modified** | Storage path renamed to `verification_selfie_{timestamp}` |
| `src/screens/admin/ProviderDetailScreen.tsx` | **Modified** | Add `verification_mode` to DocRecord, update labels, update liveness card with mode display |
| `src/dev/idvSpike/__tests__/livenessIntegration.test.ts` | **Modified** | Add 19 new tests for migration compatibility, duplicates, flag on/off, admin review, signed URLs, security |

#### §2C.3 Migration SQL

**File:** `supabase/migrations/20260726210000_modernize_verification_selfie.sql`

1. **Add `verification_mode` column** — nullable, CHECK constraint (`legacy_manual`, `live_liveness`, `manual_review`)
2. **Rename existing rows:** `UPDATE provider_documents SET document_type='verification_selfie' WHERE document_type='selfie_with_id'`
3. **Backfill verification_mode:** `UPDATE ... SET verification_mode='legacy_manual' WHERE document_type='verification_selfie' AND verification_mode IS NULL`
4. **Update CHECK constraint:** Remove `selfie_with_id` and `selfie_liveness`, add `verification_selfie`
5. **Ensure liveness_status CHECK** includes `skipped`

**No destructive migration.** All columns are additive/nullable. Old rows are renamed in-place (UPDATE, not DELETE+INSERT).

#### §2C.4 Updated TypeScript Models

```typescript
export type DocumentType =
  | 'valid_id'
  | 'government_id'
  | 'verification_selfie'  // replaces selfie_with_id and selfie_liveness
  | 'barangay_clearance'
  | ...

export interface ProviderDocument {
  // ... existing fields ...
  verification_mode?: 'legacy_manual' | 'live_liveness' | 'manual_review' | null;
  liveness_status?: 'passed' | 'manual_review' | 'failed' | 'skipped' | null;
  // ... other liveness fields ...
}
```

#### §2C.5 Updated Onboarding Flow

**Before:** Valid ID Front → Valid ID Back → Selfie with ID (sample image shown) → Submit

**After:** Valid ID Front → Valid ID Back → Verification Selfie (no sample image, instructions only) → Submit

Changes in `ProviderOnboardingScreen.tsx`:
- Section title: "Upload Selfie With Valid ID" → "Verification Selfie"
- Removed sample image (`sample-selfie-id.png`) and tap-to-preview
- New instructional text: "Your identity will be verified automatically."
- Step list: Center face, Blink, Turn left, Turn right, Hold still
- "Your selfie will be captured automatically."
- Validation message: "Please complete your verification selfie."
- Review checklist: "Selfie with ID" → "Verification Selfie"
- Upload path: `selfie_with_id_{timestamp}` → `verification_selfie_{timestamp}`
- Insert: `document_type='verification_selfie'`, `verification_mode` set based on flow
- Delete: cleans up both legacy `selfie_with_id` and new `verification_selfie` rows

#### §2C.6 Updated Admin Review

`ProviderDetailScreen.tsx`:
- `DOC_LABELS`: `selfie_liveness` → `verification_selfie: 'Verification Selfie'`
- `KYC_DOC_TYPE_MAP`: `selfie_with_id` maps to `verification_selfie`
- Verification checklist: "Selfie with ID" → "Verification Selfie"
- Liveness card title: "Liveness Verification" → "Verification Selfie"
- Added `verification_mode` display with labels: Legacy Manual / Live Liveness / Manual Review
- Liveness card now finds docs by `liveness_status != null OR verification_mode != null`
- Shows verification mode even when liveness_status is null (legacy records)

#### §2C.7 Updated Verification Screen

`LiveSelfieVerificationScreen.tsx`:
- No developer diagnostics (FPS, yaw, eye probability, state names, scores, raw ML values)
- Clean UI: oval face guide, instruction text, progress dots, controls
- Storage path: `verification_selfie_{timestamp}.jpg`
- Manual fallback: captures normal selfie, sets `liveness_status='manual_review'`
- Auto-capture: only when all checks pass (single face, centered, eyes open, blink, left turn, right turn, neutral, stable, good lighting)

#### §2C.8 Test Results

| Test Suite | Tests | Result |
|---|---|---|
| `livenessMachine.test.ts` | 37 | ✅ All passed |
| `livenessIntegration.test.ts` | 38 | ✅ All passed |
| **Total** | **75** | **✅ All passed** |

New Phase 2C tests cover:
- Migration compatibility (selfie_with_id → verification_selfie, selfie_liveness → verification_selfie)
- verification_mode values (3 allowed types)
- Old records get legacy_manual, remain valid (no destructive backfill)
- No duplicate verification documents (delete-before-insert)
- Feature flag OFF → legacy manual flow, verification_mode=legacy_manual
- Feature flag ON → live liveness flow
- Successful liveness → verification_mode=live_liveness
- Manual fallback → verification_mode=manual_review
- Admin review: verification_mode display, finding liveness docs, conditional card rendering
- Signed URLs: storage path stored, not public URL
- Unauthorized access: no direct SELECT on platform_config, only allowlisted keys returned

**TypeScript:** `npx tsc --noEmit` → 0 errors

#### §2C.9 Android Build Result

`.\gradlew assembleDebug` — ✅ **BUILD SUCCESSFUL** in 43s

#### §2C.10 Known Limitations

1. **No face comparison:** Verifies liveness only. Admin remains final decision-maker.
2. **No liveness video:** Single best-frame photo only.
3. **Feature flag default false:** Disabled by default. Must be explicitly enabled.
4. **minSdkVersion 26:** Android 8.0+ only.
5. **Legacy `ProviderApplicationScreen.tsx`** still references `selfie_with_id` as a KYC JSON field name — this is the old `kyc_documents` blob format, not the `provider_documents` table. The admin screen's `KYC_DOC_TYPE_MAP` maps it to `verification_selfie` for display. No change needed in that file.
6. **No automatic merge to main.**

#### §2C.11 Rollback Steps

1. **Instant rollback:** Set `identity_live_selfie_enabled` to `false` → reverts to manual flow
2. **Code rollback:** Revert all modified files to pre-2C state
3. **DB rollback:**
   ```sql
   UPDATE provider_documents SET document_type='selfie_with_id'
     WHERE document_type='verification_selfie';
   ALTER TABLE public.provider_documents DROP COLUMN IF EXISTS verification_mode;
   -- Re-add old CHECK constraint with selfie_with_id
   ```
4. **No storage changes** — no rollback needed

---

> **Phase 2C implementation complete. Stopping for review.
> No production database has been modified. Feature flag defaults to false.
> Legacy manual selfie flow preserved as fallback.**

---

### §2C-UX Identity Verification UX Improvement

#### Objective

Clarify that the automated capture system performs **pre-submission quality and liveness checks only**. It does **not** approve identities. Final identity verification remains a **manual administrator decision**.

No database changes. No API changes. No storage changes. No migration changes. Only wording, labels, helper text, section organization, and user/admin presentation.

#### Files Modified

| File | Changes |
|---|---|
| `src/screens/provider/ProviderOnboardingScreen.tsx` | Updated step subheading, section note, selfie caption, submit note |
| `src/screens/provider/LiveSelfieVerificationScreen.tsx` | Updated camera permission text, uploading text, review title, review note, failure message, manual fallback button |
| `src/screens/admin/ProviderDetailScreen.tsx` | Reorganized liveness card into three sections: Capture Method, Automated Capture Checks, Administrator Review |
| `reports/identity-verification/IDENTITY_VERIFICATION_IMPLEMENTATION.md` | This section |

#### Application Side Changes

**Step 3 subheading:**
- Before: "All identity documents must be captured live with your camera."
- After: "Your photos will be automatically checked for quality before they are submitted for review."

**Identity Verification section note:**
- Added: "Before your application is submitted, we'll automatically check that your photos are clear and complete to help speed up the review process."

**Verification Selfie caption:**
- Before: "Your identity will be verified automatically."
- After: "Your selfie will be checked for photo quality and capture completeness."

**Verification Selfie hint:**
- Before: "Please follow the on-screen instructions."
- After: "This does not approve your identity — an administrator will review your application."

**Submit note:**
- Before: "Your application will be reviewed by our team within 1–3 business days. You'll be notified once approved."
- After: "Your application will be reviewed by our team within 1–3 business days. The automated checks only help ensure photo quality — final approval is always decided by an administrator."

#### Live Verification Screen Changes

- Camera permission: "verify your identity" → "capture your verification selfie"
- Uploading: "Uploading selfie..." → "Uploading verification selfie..."
- Review title: "Review Your Selfie" → "Review Your Verification Selfie"
- Review note added: "Your application will be submitted for administrator review."
- Failure message: "Verification could not be completed" → "Capture could not be completed. Please try again."
- Manual fallback button: "Submit for Manual Review" → "Submit Manual Selfie Instead"

#### Admin Panel Changes

The liveness card was reorganized from a flat list into three clearly separated sections:

**1. Capture Method**
- Legacy Manual / Live Guided Selfie / Manual Review
- (Renamed from "Verification Mode" → "Capture Method")
- (Renamed "Live Liveness" → "Live Guided Selfie")

**2. Automated Capture Checks**
- ✓/✗ Face detected
- ✓/✗ One person detected
- ✓/✗ Blink completed
- ✓/✗ Head movement completed
- ✓/✗ Image quality passed
- Quality score (if available)
- Manual fallback used (if applicable)
- Captured at, attempts, device (metadata)

**3. Administrator Review**
- Decision status: Pending Review / Approved / Rejected
- Helper text: "The automated checks above only verify photo capture quality. Final identity verification is your responsibility as administrator."

This clearly separates automatic capture checks from human identity review.

#### AI Terminology Removed

The following terms were **removed** or **never used**:
- AI Verified
- AI Approved
- Identity Verified by AI
- AI Authentication
- Automatic Identity Approval
- "Your identity will be verified automatically"

Replaced with:
- Automated Capture Check
- Photo Quality Check
- Guided Selfie Capture
- Live Selfie Capture
- Capture Completed
- Ready for Administrator Review

#### Administrator Responsibilities (Unchanged)

The administrator remains responsible for:
- Approving providers
- Rejecting providers
- Requesting new verification photos
- Suspending verification

The automated system only provides additional evidence to assist the administrator.

#### Build Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npm test` | ✅ 75/75 passed |
| `.\gradlew assembleDebug` | ✅ BUILD SUCCESSFUL in 2m 27s |

---

> **Phase 2C-UX implementation complete. No database changes.
> Automated checks are clearly separated from administrator review.
> No AI approval terminology used anywhere in the application.**
