/**
 * Identity Verification — Phase 2A Spike Configuration
 *
 * ISOLATED DEV SPIKE ONLY. Not wired into the production onboarding flow.
 *
 * All liveness thresholds are centralized here so they can be tuned during the
 * spike without touching detection logic. Initial values are intentionally
 * TOLERANT for first-run testing on real devices.
 *
 * NOTE on yaw sign: ML Kit reports yaw (Euler Y) in degrees. With the FRONT
 * camera the preview is mirrored, so the sign of a "left" vs "right" turn can
 * appear inverted depending on device/orientation. Thresholds below are written
 * for the common case; if left/right feel swapped on your device, flip
 * `invertYaw` to true rather than editing the thresholds.
 */

export interface SpikeThresholds {
  /** Throttle face analysis to this many frames per second (responsiveness). */
  targetFps: number;

  /** Horizontal centering tolerance as a fraction of frame width (0..0.5). */
  faceCenteredToleranceX: number;
  /** Vertical centering tolerance as a fraction of frame height (0..0.5). */
  faceCenteredToleranceY: number;

  /** Minimum face width as a fraction of frame width (face must be big enough). */
  minFaceSizeRatio: number;
  /** Maximum face width as a fraction of frame width (avoid too-close). */
  maxFaceSizeRatio: number;

  /** Eye-open probability at/above which an eye is considered OPEN. */
  eyeOpenThreshold: number;
  /** Eye-open probability at/below which an eye is considered CLOSED. */
  eyeClosedThreshold: number;
  /** Consecutive qualifying samples required to confirm a blink phase. */
  blinkConfirmFrames: number;

  /** Yaw (deg) beyond which a LEFT turn is registered (sign per invertYaw). */
  leftYawThreshold: number;
  /** Yaw (deg) beyond which a RIGHT turn is registered (sign per invertYaw). */
  rightYawThreshold: number;
  /** Absolute yaw (deg) within which the head is considered NEUTRAL/centered. */
  neutralYawTolerance: number;
  /** Consecutive qualifying samples required to confirm a head turn. */
  turnConfirmFrames: number;
  /** Flip yaw sign if left/right are swapped on your device. */
  invertYaw: boolean;

  /** Duration (ms) the face must remain stable during "Hold still". */
  stableFrameDurationMs: number;
  /** Number of samples collected during hold-still for best-frame scoring. */
  bestFrameSampleCount: number;

  /** Overall capture timeout (ms) before the sequence fails and offers retry. */
  captureTimeoutMs: number;
}

/**
 * Tolerant defaults for first-device testing. Tighten later in Phase 3.
 */
export const SPIKE_THRESHOLDS: SpikeThresholds = {
  targetFps: 5,

  faceCenteredToleranceX: 0.22,
  faceCenteredToleranceY: 0.24,

  minFaceSizeRatio: 0.22,
  maxFaceSizeRatio: 0.95,

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

/** Liveness sequence steps in required order. */
export type LivenessStep =
  | 'positioning'
  | 'blink'
  | 'turn_left'
  | 'turn_right'
  | 'hold_still'
  | 'captured'
  | 'failed';

export const STEP_INSTRUCTIONS: Record<LivenessStep, string> = {
  positioning: 'Center your face',
  blink: 'Blink once',
  turn_left: 'Turn your head slightly left',
  turn_right: 'Turn your head slightly right',
  hold_still: 'Hold still',
  captured: 'Selfie captured',
  failed: 'Verification could not be completed',
};
