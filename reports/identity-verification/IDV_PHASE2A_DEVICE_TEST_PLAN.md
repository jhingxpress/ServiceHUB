# IDV Phase 2A — Physical Android Device Test Plan

Scope: `LiveSelfieVerificationScreen` + `livenessMachine` + `remoteFlags` on `spike/idv-phase2a`.
All tests marked **[DEVICE]** require a physical Android phone with a front camera.
Tests marked **[HOST]** can be verified on emulator/CI or by code inspection.

Prereqs: debug or release APK built from this branch; Supabase project reachable;
feature flag `identity_live_selfie_enabled` toggled via `platform_config`
(or `EXPO_PUBLIC_IDV_LIVE_SELFIE=1` for local override).

## 1. Feature flag gating

| # | Test | Type | Steps | Expected |
|---|------|------|-------|----------|
| 1.1 | Flag OFF shows legacy flow | [DEVICE] | Ensure flag disabled; open provider onboarding → Verification Documents | Manual "Take Verification Selfie" upload widget shown; no guided capture |
| 1.2 | Flag ON shows guided capture | [DEVICE] | Enable flag; reopen onboarding | "Start Guided Verification" button shown |
| 1.3 | Flag RPC failure falls back safely | [HOST] | Block network / revoke EXECUTE; open onboarding | Flag resolves disabled; legacy flow shown; no crash |
| 1.4 | Local override works | [DEVICE] | Build with `EXPO_PUBLIC_IDV_LIVE_SELFIE=1`, flag off server-side | Guided capture shown |

## 2. Camera & permission

| # | Test | Type | Steps | Expected |
|---|------|------|-------|----------|
| 2.1 | Permission grant flow | [DEVICE] | Fresh install → start guided verification | Permission prompt; after grant camera preview appears |
| 2.2 | Permission denied | [DEVICE] | Deny camera permission | "Camera Permission Required" screen with Grant/Cancel |
| 2.3 | Permission revoked mid-flow | [DEVICE] | Grant, start, then revoke in system settings, background/foreground app | Camera pauses; re-prompt or error path, no crash |
| 2.4 | No front camera | [DEVICE] | Emulator/device without front camera | "No Front Camera" screen with Go Back |
| 2.5 | Background/resume | [DEVICE] | Start sequence, press home, return | Camera reactivates; sequence timer continues (may timeout → retry offered) |

## 3. Liveness sequence

| # | Test | Type | Steps | Expected |
|---|------|------|-------|----------|
| 3.1 | Full happy path | [DEVICE] | Center face → blink → turn left → center → turn right → hold still | Auto-advances through all steps; photo captured; review screen shown |
| 3.2 | Yaw direction correctness | [DEVICE] | Turn head physically LEFT | `turn_left` step completes (checks.leftTurn=true). If it fails, set `invertYaw: true` in `livenessConfig.ts` and retest — do NOT edit thresholds |
| 3.3 | Turn-right after neutral gate | [DEVICE] | After left turn, immediately turn right without centering | "Return to center" hint; right turn not counted until neutral |
| 3.4 | Blink detection | [DEVICE] | Blink naturally; also try slow blink | Sequence advances; very slow/partial blinks may require retry (acceptable) |
| 3.5 | Multiple faces | [DEVICE] | Have a second person enter frame | "Only one person should be visible"; no progress until cleared |
| 3.6 | Poor lighting | [DEVICE] | Dim room / backlit face | "Move to a brighter area"; positioning blocked |
| 3.7 | Distance/framing | [DEVICE] | Too far → too close → centered | Directional hints ("Move closer…", "Move slightly farther away.", "Center your face") guide user correctly |
| 3.8 | Head tilt | [DEVICE] | Tilt head up/down/sideways beyond ~15°/12° | "Hold your phone at eye level." / "Keep your head level." |
| 3.9 | Timeout | [DEVICE] | Stay in sequence >45s without completing | Step → failed; "Timed out" + Try Again / manual fallback offered |
| 3.10 | Threshold tuning | [DEVICE] | If sequence is flaky, adjust `LIVENESS_THRESHOLDS` (not spikeConfig) | Document final values in this file |

## 4. Capture, review, upload

| # | Test | Type | Steps | Expected |
|---|------|------|-------|----------|
| 4.1 | Auto-capture | [DEVICE] | Complete hold_still | Photo captured automatically → review screen (no manual shutter) |
| 4.2 | Review → Use This Photo | [DEVICE] | Confirm photo in review | Upload begins; onboarding selfie widget shows success |
| 4.3 | Review → Retake | [DEVICE] | Tap Retake | Sequence restarts from positioning; attempt_count increments |
| 4.4 | Upload success | [DEVICE] | Complete upload on good network | `provider_documents` row: `document_type=verification_selfie`, `verification_mode=live_liveness`, `liveness_status=passed`, all liveness columns populated; `file_url` = storage path |
| 4.5 | Upload failure | [DEVICE] | Enable airplane mode at capture completion | Error phase; Retry re-uploads SAME captured photo (no recapture needed) |
| 4.6 | Camera-null edge | [DEVICE] | (Hard to force) if camera dies mid-sequence | Error phase instead of silent hang (fixed in d32efe1) |

## 5. Manual fallback

| # | Test | Type | Steps | Expected |
|---|------|------|-------|----------|
| 5.1 | Fallback from liveness UI | [DEVICE] | Tap "Take Photo Manually" mid-sequence | "Opening camera…" state → system camera → photo → upload |
| 5.2 | Fallback from error | [DEVICE] | Trigger error, tap "Take Photo Manually" | Same flow |
| 5.3 | Fallback DB record | [DEVICE] | Complete manual fallback | `liveness_status=manual_review`, `manual_review_required=true`, `verification_mode=manual_review`, `capture_quality_score=0` |
| 5.4 | Fallback cancel | [DEVICE] | Open picker, cancel | Returns to liveness sequence, no error state |

## 6. Onboarding integration

| # | Test | Type | Steps | Expected |
|---|------|------|-------|----------|
| 6.1 | Resume after capture | [DEVICE] | Complete live selfie, kill app, reopen onboarding | Selfie shows "success" with signed-URL preview (fixed in d32efe1); no broken image |
| 6.2 | Remove & retake | [DEVICE] | Remove verification selfie, restart | Pending `verification_selfie`/`selfie_with_id` rows deleted; new capture works; no duplicates |
| 6.3 | Duplicate prevention | [DEVICE] | Upload live selfie twice via retake | Only ONE `verification_selfie` row per provider (delete-then-insert) |
| 6.4 | Flag ON but legacy doc exists | [DEVICE] | Provider has old `selfie_with_id` doc | Migration renamed it; onboarding finds `verification_selfie` |
| 6.5 | Submit application | [DEVICE] | Complete all steps, submit | Application submitted; admin sees Verification Selfie card |

## 7. Admin review

| # | Test | Type | Steps | Expected |
|---|------|------|-------|----------|
| 7.1 | Liveness card display | [DEVICE] | Admin opens provider with live selfie | "Verification Selfie" section: capture method, check items (Face detected/One person/Blink/Head movement/Quality), quality score, captured-at, attempts, device |
| 7.2 | Manual review flag | [DEVICE] | Provider used manual fallback | "Manual Fallback Used" warning shown; decision still admin's |
| 7.3 | Signed doc preview | [DEVICE] | Admin taps document thumbnail | Signed URL loads image (private bucket) |
| 7.4 | Legacy doc compat | [DEVICE] | Provider with pre-migration `selfie_with_id` row | After migration shows as `verification_selfie` / Legacy Manual |

## 8. Network & edge cases

| # | Test | Type | Steps | Expected |
|---|------|------|-------|----------|
| 8.1 | Network loss mid-sequence | [DEVICE] | Disable data during liveness | Sequence continues (on-device); upload fails gracefully → retry path |
| 8.2 | Signed URL expiry | [DEVICE] | Leave review screen >1h, return | Onboarding reload regenerates signed URL (3600s) — preview may need reload; acceptable |
| 8.3 | Low-end device perf | [DEVICE] | Budget Android (2GB RAM) | targetFps=5 keeps UI responsive; no thermal shutdown |
| 8.4 | Rotation/resize | [DEVICE] | Rotate device during sequence | Oval overlay recenters; sequence unaffected or restarts cleanly |

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Tester | | | ☐ Pass ☐ Fail |
| Reviewer | | | |

Known device-dependent unknowns to resolve during testing:
- `invertYaw` value (start false; flip if left/right reversed)
- Whether `pitch`/`roll` signs match ML Kit convention on target devices
- Real-world `sizeRatio`/`heightRatio` ranges for typical arm's-length selfies
