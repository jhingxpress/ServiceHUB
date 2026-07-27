/**
 * Production liveness thresholds for identity verification.
 *
 * Copied from the Phase 2A spike config with production-safe defaults.
 * The state machine (`livenessMachine.ts`) is imported directly from
 * the spike directory — it is pure JS with no native dependencies.
 *
 * YAW CONVENTION:
 *   FaceSample.yaw is the RAW yaw from the detector (before inversion).
 *   The state machine applies `invertYaw` internally via `normalizeYaw()`.
 *
 *   Normalized yaw convention:
 *     negative = logical LEFT turn
 *     positive = logical RIGHT turn
 *     ~0       = neutral / facing forward
 */

export interface LivenessThresholds {
  targetFps: number;
  faceCenteredToleranceX: number;
  faceCenteredToleranceY: number;
  minFaceSizeRatio: number;
  maxFaceSizeRatio: number;
  /** Minimum face height as a fraction of frame height (rejects distant/poorly-framed faces). */
  minFaceHeightRatio: number;
  /** Maximum face height as a fraction of frame height (rejects too-close faces). */
  maxFaceHeightRatio: number;
  /**
   * Maximum absolute pitch angle (degrees) during positioning and hold-still.
   * ML Kit convention: positive = face tilted up; negative = tilted down.
   */
  maxPitchAngle: number;
  /** Maximum absolute roll angle (degrees) during positioning and hold-still. */
  maxRollAngle: number;
  eyeOpenThreshold: number;
  eyeClosedThreshold: number;
  blinkConfirmFrames: number;
  leftYawThreshold: number;
  rightYawThreshold: number;
  neutralYawTolerance: number;
  turnConfirmFrames: number;
  invertYaw: boolean;
  stableFrameDurationMs: number;
  bestFrameSampleCount: number;
  captureTimeoutMs: number;
}

export const LIVENESS_THRESHOLDS: LivenessThresholds = {
  targetFps: 5,
  faceCenteredToleranceX: 0.22,
  faceCenteredToleranceY: 0.24,
  minFaceSizeRatio: 0.32,
  maxFaceSizeRatio: 0.55,
  minFaceHeightRatio: 0.35,
  maxFaceHeightRatio: 0.80,
  maxPitchAngle: 15,
  maxRollAngle: 12,
  eyeOpenThreshold: 0.6,
  eyeClosedThreshold: 0.35,
  blinkConfirmFrames: 1,
  leftYawThreshold: 12,
  rightYawThreshold: 12,
  neutralYawTolerance: 10,
  turnConfirmFrames: 2,
  invertYaw: false,
  stableFrameDurationMs: 700,
  bestFrameSampleCount: 8,
  captureTimeoutMs: 45000,
};

export type LivenessStep =
  | 'positioning'
  | 'blink'
  | 'turn_left'
  | 'turn_right'
  | 'hold_still'
  | 'captured'
  | 'failed';

export const STEP_INSTRUCTIONS: Record<LivenessStep, string> = {
  positioning: 'Center your face in the oval',
  blink: 'Blink once',
  turn_left: 'Turn your head slightly left',
  turn_right: 'Turn your head slightly right',
  hold_still: 'Hold still',
  captured: 'Selfie captured',
  failed: 'Verification could not be completed',
};

export const PROGRESS_STEPS: { step: LivenessStep; label: string }[] = [
  { step: 'positioning', label: 'Position' },
  { step: 'blink', label: 'Blink' },
  { step: 'turn_left', label: 'Left' },
  { step: 'turn_right', label: 'Right' },
  { step: 'hold_still', label: 'Still' },
];
