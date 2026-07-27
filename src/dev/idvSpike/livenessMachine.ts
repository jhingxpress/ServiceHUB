/**
 * Identity Verification — Phase 2A Liveness State Machine (pure, testable)
 *
 * ISOLATED DEV SPIKE ONLY.
 *
 * This module contains NO native dependencies. It consumes face samples
 * (produced on the JS thread from the ML Kit frame processor) and advances
 * a deterministic liveness sequence:
 *
 *   positioning → blink → turn_left → turn_right → hold_still → captured
 *
 * Keeping this logic pure means it can be unit-tested on CI without a device
 * or camera, and reused unchanged when the feature is integrated in Phase 3.
 *
 * YAW CONVENTION:
 *   FaceSample.yaw is the RAW yaw from the detector (before inversion).
 *   The state machine applies `cfg.invertYaw` internally via `normalizeYaw()`
 *   exactly once per sample, then uses the normalized value consistently.
 *
 *   Normalized yaw convention:
 *     negative = logical LEFT turn
 *     positive = logical RIGHT turn
 *     ~0       = neutral / facing forward
 *
 *   When `invertYaw` is true, the raw sign is flipped so that a physical
 *   left turn (which may report as positive on some front-camera devices)
 *   is treated as negative (logical left) by the state machine.
 */

import {
  LivenessStep,
  SpikeThresholds,
} from './spikeConfig';

/** Normalized, device-independent face sample fed into the machine. */
export interface FaceSample {
  /** Number of faces detected in the frame. */
  faceCount: number;
  /** Face center X as a fraction of frame width (0..1), or null if no face. */
  centerX: number | null;
  /** Face center Y as a fraction of frame height (0..1), or null if no face. */
  centerY: number | null;
  /** Face width as a fraction of frame width (0..1), or null if no face. */
  sizeRatio: number | null;
  /** Face height as a fraction of frame height (0..1), or null if unavailable. */
  heightRatio: number | null;
  /** Left eye open probability (0..1), or -1 if unavailable. */
  leftEyeOpen: number;
  /** Right eye open probability (0..1), or -1 if unavailable. */
  rightEyeOpen: number;
  /** Raw yaw angle in degrees from the detector (before inversion). */
  yaw: number;
  /**
   * Raw pitch angle in degrees from the detector.
   * ML Kit convention: positive = face tilted up (looking up); negative = tilted down.
   * 0 when unavailable.
   */
  pitch: number;
  /**
   * Raw roll angle in degrees from the detector (in-plane head tilt).
   * 0 when unavailable.
   */
  roll: number;
  /** Monotonic timestamp in ms. */
  timestamp: number;
}

export interface LivenessChecks {
  faceDetected: boolean;
  lighting: boolean;
  blink: boolean;
  leftTurn: boolean;
  rightTurn: boolean;
}

type BlinkPhase = 'need_open' | 'need_closed' | 'need_open_again' | 'done';

export interface LivenessState {
  step: LivenessStep;
  checks: LivenessChecks;
  blinkPhase: BlinkPhase;
  blinkHold: number;
  turnHold: number;
  awaitingNeutral: boolean;
  holdStillStartedAt: number | null;
  startedAt: number;
  /** Best-frame score captured during hold_still (higher is better). */
  bestScore: number;
  /** Set true on the transition into 'captured' to signal the UI to takePhoto. */
  shouldCapture: boolean;
  /** Human-readable hint for the current guidance message. */
  hint: string | null;
}

export function createInitialState(now: number): LivenessState {
  return {
    step: 'positioning',
    checks: {
      faceDetected: false,
      lighting: false,
      blink: false,
      leftTurn: false,
      rightTurn: false,
    },
    blinkPhase: 'need_open',
    blinkHold: 0,
    turnHold: 0,
    awaitingNeutral: false,
    holdStillStartedAt: null,
    startedAt: now,
    bestScore: 0,
    shouldCapture: false,
    hint: null,
  };
}

function singleFace(s: FaceSample): boolean {
  return s.faceCount === 1;
}

function centered(s: FaceSample, cfg: SpikeThresholds): boolean {
  if (s.centerX == null || s.centerY == null) return false;
  return (
    Math.abs(s.centerX - 0.5) <= cfg.faceCenteredToleranceX &&
    Math.abs(s.centerY - 0.5) <= cfg.faceCenteredToleranceY
  );
}

function sizeOk(s: FaceSample, cfg: SpikeThresholds): boolean {
  if (s.sizeRatio == null) return false;
  return s.sizeRatio >= cfg.minFaceSizeRatio && s.sizeRatio <= cfg.maxFaceSizeRatio;
}

function eyesOpen(s: FaceSample, cfg: SpikeThresholds): boolean {
  return s.leftEyeOpen >= cfg.eyeOpenThreshold && s.rightEyeOpen >= cfg.eyeOpenThreshold;
}

function eyesClosed(s: FaceSample, cfg: SpikeThresholds): boolean {
  return (
    s.leftEyeOpen >= 0 &&
    s.rightEyeOpen >= 0 &&
    s.leftEyeOpen <= cfg.eyeClosedThreshold &&
    s.rightEyeOpen <= cfg.eyeClosedThreshold
  );
}

function lightingOk(s: FaceSample): boolean {
  // ML Kit returns -1 for eye-open probability when it cannot classify,
  // which strongly correlates with poor lighting / low confidence.
  return s.leftEyeOpen >= 0 && s.rightEyeOpen >= 0;
}

function neutralYaw(yaw: number, cfg: SpikeThresholds): boolean {
  return Math.abs(yaw) <= cfg.neutralYawTolerance;
}

function heightOk(s: FaceSample, cfg: SpikeThresholds): boolean {
  if (s.heightRatio == null) return true; // unavailable → skip check
  return s.heightRatio >= cfg.minFaceHeightRatio && s.heightRatio <= cfg.maxFaceHeightRatio;
}

function pitchOk(s: FaceSample, cfg: SpikeThresholds): boolean {
  return Math.abs(s.pitch) <= cfg.maxPitchAngle;
}

function rollOk(s: FaceSample, cfg: SpikeThresholds): boolean {
  return Math.abs(s.roll) <= cfg.maxRollAngle;
}

/**
 * Normalize raw yaw using the invertYaw flag.
 * Returns yaw where negative = logical LEFT, positive = logical RIGHT.
 */
export function normalizeYaw(rawYaw: number, invertYaw: boolean): number {
  const result = invertYaw ? -rawYaw : rawYaw;
  return result === 0 ? 0 : result; // normalize -0 to +0
}

/** Best-frame score: rewards centered, eyes-open, neutral yaw/pitch/roll, well-sized single face. */
export function scoreFrame(s: FaceSample, cfg: SpikeThresholds): number {
  if (!singleFace(s) || s.centerX == null || s.sizeRatio == null) return 0;
  const ny = normalizeYaw(s.yaw, cfg.invertYaw);
  const centerScore = 1 - Math.min(1, Math.hypot(s.centerX - 0.5, (s.centerY ?? 0.5) - 0.5) * 2);
  const eyeScore = Math.max(0, Math.min(1, (s.leftEyeOpen + s.rightEyeOpen) / 2));
  const yawScore   = 1 - Math.min(1, Math.abs(ny) / 45);
  const sizeMid    = (cfg.minFaceSizeRatio + cfg.maxFaceSizeRatio) / 2;
  const sizeScore  = 1 - Math.min(1, Math.abs(s.sizeRatio - sizeMid) / sizeMid);
  const pitchScore = 1 - Math.min(1, Math.abs(s.pitch) / cfg.maxPitchAngle);
  const rollScore  = 1 - Math.min(1, Math.abs(s.roll) / cfg.maxRollAngle);
  return (
    centerScore * 0.30 +
    eyeScore    * 0.25 +
    yawScore    * 0.20 +
    sizeScore   * 0.10 +
    pitchScore  * 0.10 +
    rollScore   * 0.05
  );
}

/**
 * Advance the state machine by one sample. Returns a NEW state object.
 * `shouldCapture` is set true exactly once, on entry to 'captured'.
 */
export function advance(
  prev: LivenessState,
  s: FaceSample,
  cfg: SpikeThresholds,
  now: number
): LivenessState {
  // Terminal states are stable.
  if (prev.step === 'captured' || prev.step === 'failed') {
    return { ...prev, shouldCapture: false };
  }

  // Global timeout.
  if (now - prev.startedAt > cfg.captureTimeoutMs) {
    return { ...prev, step: 'failed', shouldCapture: false, hint: 'Timed out. Please try again.' };
  }

  const state: LivenessState = { ...prev, checks: { ...prev.checks }, shouldCapture: false };

  // Normalize yaw once: negative = logical LEFT, positive = logical RIGHT.
  const ny = normalizeYaw(s.yaw, cfg.invertYaw);

  // Require a single, well-lit face for any progress; otherwise coach the user.
  if (!singleFace(s)) {
    state.hint = s.faceCount > 1 ? 'Only one person should be visible' : 'Center your face';
    // Reset transient counters but keep completed checks.
    state.turnHold = 0;
    state.blinkHold = 0;
    if (state.step === 'hold_still') state.holdStillStartedAt = null;
    return state;
  }

  state.checks.lighting = lightingOk(s);
  if (!state.checks.lighting) {
    state.hint = 'Move to a brighter area';
  }

  switch (state.step) {
    case 'positioning': {
      const ok =
        centered(s, cfg) &&
        sizeOk(s, cfg) &&
        heightOk(s, cfg) &&
        neutralYaw(ny, cfg) &&
        pitchOk(s, cfg) &&
        rollOk(s, cfg) &&
        state.checks.lighting;
      if (!ok) {
        if (s.sizeRatio != null && s.sizeRatio < cfg.minFaceSizeRatio) {
          state.hint = 'Move closer to the camera.';
        } else if (s.sizeRatio != null && s.sizeRatio > cfg.maxFaceSizeRatio) {
          state.hint = 'Move slightly farther away.';
        } else if (s.heightRatio != null && s.heightRatio < cfg.minFaceHeightRatio) {
          state.hint = 'Move closer to the camera.';
        } else if (s.heightRatio != null && s.heightRatio > cfg.maxFaceHeightRatio) {
          state.hint = 'Move slightly farther away.';
        } else if (!pitchOk(s, cfg)) {
          // Unified pitch guidance — direction-neutral to avoid guessing the ML Kit sign.
          // ML Kit convention: +pitch = face tilted up; -pitch = tilted down.
          // Verify on-device; swap condition to directional if sign is confirmed.
          state.hint = 'Hold your phone at eye level.';
        } else if (!rollOk(s, cfg)) {
          state.hint = 'Keep your head level.';
        } else if (!centered(s, cfg)) {
          // Directional hints assume mirrored front-camera preview (standard Android).
          // If left/right feels reversed on device, swap the X conditions.
          if (s.centerX != null && s.centerX < 0.5 - cfg.faceCenteredToleranceX) {
            state.hint = 'Move slightly left.';
          } else if (s.centerX != null && s.centerX > 0.5 + cfg.faceCenteredToleranceX) {
            state.hint = 'Move slightly right.';
          } else if (s.centerY != null && s.centerY < 0.5 - cfg.faceCenteredToleranceY) {
            state.hint = 'Raise your phone slightly.';
          } else if (s.centerY != null && s.centerY > 0.5 + cfg.faceCenteredToleranceY) {
            state.hint = 'Lower your phone slightly.';
          } else {
            state.hint = 'Center your face.';
          }
        }
        break;
      }
      state.checks.faceDetected = true;
      state.step = 'blink';
      state.blinkPhase = 'need_open';
      state.blinkHold = 0;
      state.hint = null;
      break;
    }

    case 'blink': {
      // open → closed → open, with confirmation frames.
      if (state.blinkPhase === 'need_open') {
        if (eyesOpen(s, cfg)) {
          state.blinkHold += 1;
          if (state.blinkHold >= cfg.blinkConfirmFrames) {
            state.blinkPhase = 'need_closed';
            state.blinkHold = 0;
          }
        } else {
          state.blinkHold = 0;
        }
      } else if (state.blinkPhase === 'need_closed') {
        if (eyesClosed(s, cfg)) {
          state.blinkPhase = 'need_open_again';
        }
      } else if (state.blinkPhase === 'need_open_again') {
        if (eyesOpen(s, cfg)) {
          state.blinkPhase = 'done';
          state.checks.blink = true;
          state.step = 'turn_left';
          state.turnHold = 0;
          state.awaitingNeutral = false;
        }
      }
      break;
    }

    case 'turn_left': {
      const yawForLeft = ny <= -cfg.leftYawThreshold;
      if (yawForLeft) {
        state.turnHold += 1;
        if (state.turnHold >= cfg.turnConfirmFrames) {
          state.checks.leftTurn = true;
          state.step = 'turn_right';
          state.turnHold = 0;
          state.awaitingNeutral = true; // require neutral before accepting right
        }
      } else {
        state.turnHold = 0;
      }
      break;
    }

    case 'turn_right': {
      if (state.awaitingNeutral) {
        state.hint = 'Return to center';
        if (neutralYaw(ny, cfg)) {
          state.awaitingNeutral = false;
          state.hint = null;
        }
        break;
      }
      const yawForRight = ny >= cfg.rightYawThreshold;
      if (yawForRight) {
        state.turnHold += 1;
        if (state.turnHold >= cfg.turnConfirmFrames) {
          state.checks.rightTurn = true;
          state.step = 'hold_still';
          state.turnHold = 0;
          state.holdStillStartedAt = null;
          state.bestScore = 0;
        }
      } else {
        state.turnHold = 0;
      }
      break;
    }

    case 'hold_still': {
      const stable =
        centered(s, cfg) &&
        sizeOk(s, cfg) &&
        heightOk(s, cfg) &&
        neutralYaw(ny, cfg) &&
        eyesOpen(s, cfg) &&
        pitchOk(s, cfg) &&
        rollOk(s, cfg);
      if (!stable) {
        state.holdStillStartedAt = null;
        if (!pitchOk(s, cfg)) {
          state.hint = 'Hold your phone at eye level.';
        } else if (!rollOk(s, cfg)) {
          state.hint = 'Keep your head level.';
        } else if (!neutralYaw(ny, cfg)) {
          state.hint = 'Face forward and hold still.';
        } else {
          state.hint = 'Hold still.';
        }
        break;
      }
      if (state.holdStillStartedAt == null) state.holdStillStartedAt = now;
      state.bestScore = Math.max(state.bestScore, scoreFrame(s, cfg));
      if (now - state.holdStillStartedAt >= cfg.stableFrameDurationMs) {
        state.step = 'captured';
        state.shouldCapture = true; // signal UI to takePhoto once
        state.hint = null;
      }
      break;
    }

    default:
      break;
  }

  return state;
}
