# IDV Phase 2A — Device Test Results (TASK 004)

**Status: ALL TESTS NOT TESTED — physical device validation has NOT been performed.**
No emulator or debug-build result is claimed as device validation.
A physical Android device with a front camera and a signed-in provider
test account is required. See `IDV_PHASE2A_DEVICE_TEST_PLAN.md` for steps.

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1.1 | Flag OFF shows legacy flow | NOT TESTED | |
| 1.2 | Flag ON shows guided capture | NOT TESTED | Requires server flag or `EXPO_PUBLIC_IDV_LIVE_SELFIE=1` build |
| 1.3 | Flag RPC failure falls back safely | NOT TESTED | |
| 1.4 | Local override works | NOT TESTED | |
| 2.1 | Permission grant flow | NOT TESTED | |
| 2.2 | Permission denied | NOT TESTED | |
| 2.3 | Permission revoked mid-flow | NOT TESTED | |
| 2.4 | No front camera | NOT TESTED | |
| 2.5 | Background/resume | NOT TESTED | |
| 3.1 | Full happy path | NOT TESTED | **PRIORITY** |
| 3.2 | Yaw direction / invertYaw | NOT TESTED | **PRIORITY** — determines `invertYaw` value |
| 3.3 | Turn-right neutral gate | NOT TESTED | |
| 3.4 | Blink detection | NOT TESTED | **PRIORITY** |
| 3.5 | Multiple faces | NOT TESTED | |
| 3.6 | Poor lighting | NOT TESTED | |
| 3.7 | Distance/framing hints | NOT TESTED | |
| 3.8 | Head tilt rejection | NOT TESTED | |
| 3.9 | 45s timeout → failed | NOT TESTED | |
| 3.10 | Threshold tuning | NOT TESTED | Record final values here when done |
| 4.1 | Auto-capture on hold_still | NOT TESTED | **PRIORITY** |
| 4.2 | Review → Use This Photo | NOT TESTED | |
| 4.3 | Review → Retake | NOT TESTED | |
| 4.4 | Upload success + DB row | NOT TESTED | **PRIORITY** — verify all liveness columns |
| 4.5 | Upload failure retry | NOT TESTED | Airplane-mode test |
| 4.6 | Camera-null edge | NOT TESTED | Fixed in d32efe1; hard to force |
| 5.1 | Fallback from liveness UI | NOT TESTED | **PRIORITY** |
| 5.2 | Fallback from error | NOT TESTED | |
| 5.3 | Fallback DB record | NOT TESTED | `manual_review` / `manual_review_required=true` |
| 5.4 | Fallback cancel | NOT TESTED | |
| 6.1 | Resume after capture | NOT TESTED | Signed-URL preview (fixed d32efe1) |
| 6.2 | Remove & retake | NOT TESTED | |
| 6.3 | Duplicate prevention | NOT TESTED | One `verification_selfie` row max |
| 6.4 | Legacy doc compat | NOT TESTED | Requires migrated prod data |
| 6.5 | Submit application | NOT TESTED | |
| 7.1 | Liveness card in admin | NOT TESTED | |
| 7.2 | Manual review flag shown | NOT TESTED | |
| 7.3 | Signed doc preview (admin) | NOT TESTED | |
| 7.4 | Legacy doc compat (admin) | NOT TESTED | |
| 8.1 | Network loss mid-sequence | NOT TESTED | |
| 8.2 | Signed URL expiry (>1h) | NOT TESTED | |
| 8.3 | Low-end device perf | NOT TESTED | |
| 8.4 | Rotation/resize | NOT TESTED | |

**BLOCKED items:** none technically blocked — all require a physical
device + test accounts. Estimated effort: one focused session
(~2–3 hours) covering priorities 3.x, 4.x, 5.x first.
