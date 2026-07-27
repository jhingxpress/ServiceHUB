import {
  advance,
  createInitialState,
  FaceSample,
  LivenessState,
  normalizeYaw,
  scoreFrame,
} from '../livenessMachine';
import { SPIKE_THRESHOLDS, SpikeThresholds } from '../spikeConfig';

const cfg: SpikeThresholds = { ...SPIKE_THRESHOLDS };

function makeFaceSample(overrides: Partial<FaceSample> = {}): FaceSample {
  return {
    faceCount: 1,
    centerX: 0.5,
    centerY: 0.5,
    sizeRatio: 0.4,
    leftEyeOpen: 0.9,
    rightEyeOpen: 0.9,
    yaw: 0,
    timestamp: 1000,
    ...overrides,
  };
}

function runSequence(
  samples: FaceSample[],
  startState?: LivenessState
): LivenessState {
  let state = startState ?? createInitialState(1000);
  for (const s of samples) {
    state = advance(state, s, cfg, s.timestamp);
  }
  return state;
}

describe('livenessMachine', () => {
  describe('createInitialState', () => {
    it('starts at positioning step', () => {
      const state = createInitialState(1000);
      expect(state.step).toBe('positioning');
      expect(state.shouldCapture).toBe(false);
    });
  });

  describe('positioning', () => {
    it('advances to blink when face is centered, sized, neutral, and lit', () => {
      const state = runSequence([makeFaceSample()]);
      expect(state.step).toBe('blink');
      expect(state.checks.faceDetected).toBe(true);
    });

    it('stays at positioning if face is too small', () => {
      const state = runSequence([makeFaceSample({ sizeRatio: 0.1 })]);
      expect(state.step).toBe('positioning');
      expect(state.hint).toBe('Move closer');
    });

    it('stays at positioning if face is too large', () => {
      const state = runSequence([makeFaceSample({ sizeRatio: 0.99 })]);
      expect(state.step).toBe('positioning');
      expect(state.hint).toBe('Move farther away');
    });

    it('stays at positioning if face is off-center', () => {
      const state = runSequence([makeFaceSample({ centerX: 0.9 })]);
      expect(state.step).toBe('positioning');
      expect(state.hint).toBe('Center your face');
    });

    it('stays at positioning if yaw is too large', () => {
      const state = runSequence([makeFaceSample({ yaw: 20 })]);
      expect(state.step).toBe('positioning');
    });

    it('stays at positioning if lighting is poor (eye prob -1)', () => {
      const state = runSequence([
        makeFaceSample({ leftEyeOpen: -1, rightEyeOpen: -1 }),
      ]);
      expect(state.step).toBe('positioning');
      expect(state.hint).toBe('Move to a brighter area');
    });

    it('coaches when multiple faces detected', () => {
      const state = runSequence([makeFaceSample({ faceCount: 2 })]);
      expect(state.step).toBe('positioning');
      expect(state.hint).toBe('Only one person should be visible');
    });

    it('coaches when no face detected', () => {
      const state = runSequence([makeFaceSample({ faceCount: 0, centerX: null, centerY: null, sizeRatio: null })]);
      expect(state.step).toBe('positioning');
      expect(state.hint).toBe('Center your face');
    });
  });

  describe('blink', () => {
    it('completes open → closed → open sequence', () => {
      const state0 = createInitialState(1000);
      // Pass positioning
      const state1 = advance(state0, makeFaceSample(), cfg, 1000);
      expect(state1.step).toBe('blink');

      // Eyes open (need_open → need_closed)
      const state2 = advance(state1, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), cfg, 1100);
      expect(state2.blinkPhase).toBe('need_closed');

      // Eyes closed (need_closed → need_open_again)
      const state3 = advance(state2, makeFaceSample({ leftEyeOpen: 0.2, rightEyeOpen: 0.2 }), cfg, 1200);
      expect(state3.blinkPhase).toBe('need_open_again');

      // Eyes open again (need_open_again → done, advance to turn_left)
      const state4 = advance(state3, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), cfg, 1300);
      expect(state4.blinkPhase).toBe('done');
      expect(state4.step).toBe('turn_left');
      expect(state4.checks.blink).toBe(true);
    });

    it('resets blink hold if eyes not open during need_open', () => {
      const state0 = createInitialState(1000);
      const state1 = advance(state0, makeFaceSample(), cfg, 1000);
      // Eyes closed during need_open — should not advance
      const state2 = advance(state1, makeFaceSample({ leftEyeOpen: 0.2, rightEyeOpen: 0.2 }), cfg, 1100);
      expect(state2.blinkPhase).toBe('need_open');
      expect(state2.blinkHold).toBe(0);
    });
  });

  describe('turn_left', () => {
    it('advances to turn_right after sufficient left yaw', () => {
      const state0 = createInitialState(1000);
      const state1 = advance(state0, makeFaceSample(), cfg, 1000); // positioning → blink
      const state2 = advance(state1, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), cfg, 1100); // blink need_open → need_closed
      const state3 = advance(state2, makeFaceSample({ leftEyeOpen: 0.2, rightEyeOpen: 0.2 }), cfg, 1200); // blink need_closed → need_open_again
      const state4 = advance(state3, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), cfg, 1300); // blink done → turn_left

      // Need turnConfirmFrames=2 consecutive left yaw samples
      const state5 = advance(state4, makeFaceSample({ yaw: -15 }), cfg, 1400);
      expect(state5.step).toBe('turn_left');
      expect(state5.turnHold).toBe(1);

      const state6 = advance(state5, makeFaceSample({ yaw: -15 }), cfg, 1500);
      expect(state6.step).toBe('turn_right');
      expect(state6.checks.leftTurn).toBe(true);
      expect(state6.awaitingNeutral).toBe(true);
    });

    it('resets turn hold if yaw not sustained', () => {
      const state0 = createInitialState(1000);
      const state1 = advance(state0, makeFaceSample(), cfg, 1000);
      const state2 = advance(state1, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), cfg, 1100);
      const state3 = advance(state2, makeFaceSample({ leftEyeOpen: 0.2, rightEyeOpen: 0.2 }), cfg, 1200);
      const state4 = advance(state3, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), cfg, 1300);

      const state5 = advance(state4, makeFaceSample({ yaw: -15 }), cfg, 1400);
      const state6 = advance(state5, makeFaceSample({ yaw: 0 }), cfg, 1500);
      expect(state6.step).toBe('turn_left');
      expect(state6.turnHold).toBe(0);
    });
  });

  describe('turn_right', () => {
    it('requires neutral before accepting right turn', () => {
      const state0 = createInitialState(1000);
      const state1 = advance(state0, makeFaceSample(), cfg, 1000);
      const state2 = advance(state1, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), cfg, 1100);
      const state3 = advance(state2, makeFaceSample({ leftEyeOpen: 0.2, rightEyeOpen: 0.2 }), cfg, 1200);
      const state4 = advance(state3, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), cfg, 1300);
      const state5 = advance(state4, makeFaceSample({ yaw: -15 }), cfg, 1400);
      const state6 = advance(state5, makeFaceSample({ yaw: -15 }), cfg, 1500);

      // Now in turn_right with awaitingNeutral=true
      // Right yaw while awaiting neutral should NOT count
      const state7 = advance(state6, makeFaceSample({ yaw: 15 }), cfg, 1600);
      expect(state7.step).toBe('turn_right');
      expect(state7.awaitingNeutral).toBe(true);
      expect(state7.turnHold).toBe(0);

      // Neutral clears the flag
      const state8 = advance(state7, makeFaceSample({ yaw: 0 }), cfg, 1700);
      expect(state8.awaitingNeutral).toBe(false);

      // Now right yaw counts
      const state9 = advance(state8, makeFaceSample({ yaw: 15 }), cfg, 1800);
      expect(state9.turnHold).toBe(1);

      const state10 = advance(state9, makeFaceSample({ yaw: 15 }), cfg, 1900);
      expect(state10.step).toBe('hold_still');
      expect(state10.checks.rightTurn).toBe(true);
    });
  });

  describe('hold_still and capture', () => {
    function reachHoldStill(): LivenessState {
      const state0 = createInitialState(1000);
      const s1 = advance(state0, makeFaceSample(), cfg, 1000); // → blink
      const s2 = advance(s1, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), cfg, 1100); // need_closed
      const s3 = advance(s2, makeFaceSample({ leftEyeOpen: 0.2, rightEyeOpen: 0.2 }), cfg, 1200); // need_open_again
      const s4 = advance(s3, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), cfg, 1300); // → turn_left
      const s5 = advance(s4, makeFaceSample({ yaw: -15 }), cfg, 1400);
      const s6 = advance(s5, makeFaceSample({ yaw: -15 }), cfg, 1500); // → turn_right
      const s7 = advance(s6, makeFaceSample({ yaw: 0 }), cfg, 1600); // neutral
      const s8 = advance(s7, makeFaceSample({ yaw: 15 }), cfg, 1700);
      const s9 = advance(s8, makeFaceSample({ yaw: 15 }), cfg, 1800); // → hold_still
      return s9;
    }

    it('enters captured after stable duration', () => {
      let state = reachHoldStill();
      expect(state.step).toBe('hold_still');

      // Stable for stableFrameDurationMs (700ms)
      state = advance(state, makeFaceSample({ timestamp: 2000 }), cfg, 2000);
      expect(state.step).toBe('hold_still');
      expect(state.holdStillStartedAt).toBe(2000);

      state = advance(state, makeFaceSample({ timestamp: 2500 }), cfg, 2500);
      expect(state.step).toBe('hold_still'); // 500ms < 700ms

      state = advance(state, makeFaceSample({ timestamp: 2710 }), cfg, 2710);
      expect(state.step).toBe('captured');
      expect(state.shouldCapture).toBe(true);
    });

    it('resets hold still if face becomes unstable', () => {
      let state = reachHoldStill();
      state = advance(state, makeFaceSample({ timestamp: 2000 }), cfg, 2000);
      expect(state.holdStillStartedAt).toBe(2000);

      // Yaw away from neutral — unstable
      state = advance(state, makeFaceSample({ yaw: 20, timestamp: 2100 }), cfg, 2100);
      expect(state.holdStillStartedAt).toBe(null);
      expect(state.step).toBe('hold_still');
    });

    it('shouldCapture is only true once on entry to captured', () => {
      let state = reachHoldStill();
      state = advance(state, makeFaceSample({ timestamp: 2000 }), cfg, 2000);
      state = advance(state, makeFaceSample({ timestamp: 2710 }), cfg, 2710);
      expect(state.shouldCapture).toBe(true);

      // Subsequent samples should not re-trigger
      state = advance(state, makeFaceSample({ timestamp: 2800 }), cfg, 2800);
      expect(state.step).toBe('captured');
      expect(state.shouldCapture).toBe(false);
    });
  });

  describe('timeout', () => {
    it('fails after captureTimeoutMs', () => {
      const state0 = createInitialState(1000);
      const sample = makeFaceSample({ timestamp: 50000 }); // > 45000ms timeout
      const state1 = advance(state0, sample, cfg, 50000);
      expect(state1.step).toBe('failed');
      expect(state1.hint).toContain('Timed out');
    });
  });

  describe('terminal states', () => {
    it('captured state is stable', () => {
      const state0 = createInitialState(1000);
      const capturedState: LivenessState = {
        ...state0,
        step: 'captured',
        shouldCapture: true,
      };
      const state1 = advance(capturedState, makeFaceSample(), cfg, 2000);
      expect(state1.step).toBe('captured');
      expect(state1.shouldCapture).toBe(false);
    });

    it('failed state is stable', () => {
      const state0 = createInitialState(1000);
      const failedState: LivenessState = {
        ...state0,
        step: 'failed',
      };
      const state1 = advance(failedState, makeFaceSample(), cfg, 2000);
      expect(state1.step).toBe('failed');
    });
  });

  describe('scoreFrame', () => {
    it('returns 0 for no face', () => {
      expect(scoreFrame(makeFaceSample({ faceCount: 0 }), cfg)).toBe(0);
    });

    it('returns positive score for a good face', () => {
      const score = scoreFrame(makeFaceSample(), cfg);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('rewards centered face over off-center', () => {
      const centered = scoreFrame(makeFaceSample({ centerX: 0.5, centerY: 0.5 }), cfg);
      const offCenter = scoreFrame(makeFaceSample({ centerX: 0.8, centerY: 0.8 }), cfg);
      expect(centered).toBeGreaterThan(offCenter);
    });

    it('rewards eyes open over eyes closed', () => {
      const open = scoreFrame(makeFaceSample({ leftEyeOpen: 0.95, rightEyeOpen: 0.95 }), cfg);
      const closed = scoreFrame(makeFaceSample({ leftEyeOpen: 0.1, rightEyeOpen: 0.1 }), cfg);
      expect(open).toBeGreaterThan(closed);
    });

    it('rewards neutral yaw over extreme yaw', () => {
      const neutral = scoreFrame(makeFaceSample({ yaw: 0 }), cfg);
      const extreme = scoreFrame(makeFaceSample({ yaw: 40 }), cfg);
      expect(neutral).toBeGreaterThan(extreme);
    });
  });

  describe('normalizeYaw', () => {
    it('returns raw yaw when invertYaw is false', () => {
      expect(normalizeYaw(15, false)).toBe(15);
      expect(normalizeYaw(-15, false)).toBe(-15);
    });

    it('flips sign when invertYaw is true', () => {
      expect(normalizeYaw(15, true)).toBe(-15);
      expect(normalizeYaw(-15, true)).toBe(15);
    });

    it('leaves zero unchanged', () => {
      expect(normalizeYaw(0, false)).toBe(0);
      expect(normalizeYaw(0, true)).toBe(0);
    });
  });

  describe('invertYaw = false (default)', () => {
    it('raw negative yaw = logical LEFT turn', () => {
      const state0 = createInitialState(1000);
      const s1 = advance(state0, makeFaceSample(), cfg, 1000);
      const s2 = advance(s1, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), cfg, 1100);
      const s3 = advance(s2, makeFaceSample({ leftEyeOpen: 0.2, rightEyeOpen: 0.2 }), cfg, 1200);
      const s4 = advance(s3, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), cfg, 1300);

      const s5 = advance(s4, makeFaceSample({ yaw: -15 }), cfg, 1400);
      expect(s5.step).toBe('turn_left');
      expect(s5.turnHold).toBe(1);

      const s6 = advance(s5, makeFaceSample({ yaw: -15 }), cfg, 1500);
      expect(s6.step).toBe('turn_right');
      expect(s6.checks.leftTurn).toBe(true);
    });

    it('raw positive yaw = logical RIGHT turn (after left + neutral)', () => {
      const state0 = createInitialState(1000);
      const s1 = advance(state0, makeFaceSample(), cfg, 1000);
      const s2 = advance(s1, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), cfg, 1100);
      const s3 = advance(s2, makeFaceSample({ leftEyeOpen: 0.2, rightEyeOpen: 0.2 }), cfg, 1200);
      const s4 = advance(s3, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), cfg, 1300);
      const s5 = advance(s4, makeFaceSample({ yaw: -15 }), cfg, 1400);
      const s6 = advance(s5, makeFaceSample({ yaw: -15 }), cfg, 1500);
      const s7 = advance(s6, makeFaceSample({ yaw: 0 }), cfg, 1600);

      const s8 = advance(s7, makeFaceSample({ yaw: 15 }), cfg, 1700);
      expect(s8.step).toBe('turn_right');
      expect(s8.turnHold).toBe(1);

      const s9 = advance(s8, makeFaceSample({ yaw: 15 }), cfg, 1800);
      expect(s9.step).toBe('hold_still');
      expect(s9.checks.rightTurn).toBe(true);
    });
  });

  describe('invertYaw = true', () => {
    const invCfg: SpikeThresholds = { ...cfg, invertYaw: true };

    function reachTurnLeftInv(): LivenessState {
      const s0 = createInitialState(1000);
      const s1 = advance(s0, makeFaceSample(), invCfg, 1000);
      const s2 = advance(s1, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), invCfg, 1100);
      const s3 = advance(s2, makeFaceSample({ leftEyeOpen: 0.2, rightEyeOpen: 0.2 }), invCfg, 1200);
      const s4 = advance(s3, makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), invCfg, 1300);
      return s4;
    }

    it('raw positive yaw = logical LEFT turn (inverted)', () => {
      let state = reachTurnLeftInv();
      expect(state.step).toBe('turn_left');

      // raw +15 → normalized -15 → logical LEFT
      state = advance(state, makeFaceSample({ yaw: 15 }), invCfg, 1400);
      expect(state.step).toBe('turn_left');
      expect(state.turnHold).toBe(1);

      state = advance(state, makeFaceSample({ yaw: 15 }), invCfg, 1500);
      expect(state.step).toBe('turn_right');
      expect(state.checks.leftTurn).toBe(true);
    });

    it('raw negative yaw = logical RIGHT turn (inverted, after left + neutral)', () => {
      let state = reachTurnLeftInv();

      // Complete left turn with raw +15 (inverted to -15)
      state = advance(state, makeFaceSample({ yaw: 15 }), invCfg, 1400);
      state = advance(state, makeFaceSample({ yaw: 15 }), invCfg, 1500);
      expect(state.step).toBe('turn_right');
      expect(state.awaitingNeutral).toBe(true);

      // Return to neutral (raw 0 → normalized 0)
      state = advance(state, makeFaceSample({ yaw: 0 }), invCfg, 1600);
      expect(state.awaitingNeutral).toBe(false);

      // raw -15 → normalized +15 → logical RIGHT
      state = advance(state, makeFaceSample({ yaw: -15 }), invCfg, 1700);
      expect(state.step).toBe('turn_right');
      expect(state.turnHold).toBe(1);

      state = advance(state, makeFaceSample({ yaw: -15 }), invCfg, 1800);
      expect(state.step).toBe('hold_still');
      expect(state.checks.rightTurn).toBe(true);
    });

    it('neutral requirement between turns is enforced under inversion', () => {
      let state = reachTurnLeftInv();

      // Complete left turn
      state = advance(state, makeFaceSample({ yaw: 15 }), invCfg, 1400);
      state = advance(state, makeFaceSample({ yaw: 15 }), invCfg, 1500);
      expect(state.awaitingNeutral).toBe(true);

      // Right yaw (raw -15) while awaiting neutral should NOT count
      state = advance(state, makeFaceSample({ yaw: -15 }), invCfg, 1600);
      expect(state.step).toBe('turn_right');
      expect(state.awaitingNeutral).toBe(true);
      expect(state.turnHold).toBe(0);

      // Neutral clears the flag
      state = advance(state, makeFaceSample({ yaw: 0 }), invCfg, 1700);
      expect(state.awaitingNeutral).toBe(false);

      // Now right yaw counts
      state = advance(state, makeFaceSample({ yaw: -15 }), invCfg, 1800);
      expect(state.turnHold).toBe(1);
    });

    it('positioning neutral-yaw check works under inversion', () => {
      // raw yaw 0 → normalized 0 → neutral → passes positioning
      const s1 = advance(createInitialState(1000), makeFaceSample({ yaw: 0 }), invCfg, 1000);
      expect(s1.step).toBe('blink');

      // raw yaw +20 → normalized -20 → NOT neutral → stays at positioning
      const s2 = advance(createInitialState(1000), makeFaceSample({ yaw: 20 }), invCfg, 1000);
      expect(s2.step).toBe('positioning');

      // raw yaw -20 → normalized +20 → NOT neutral → stays at positioning
      const s3 = advance(createInitialState(1000), makeFaceSample({ yaw: -20 }), invCfg, 1000);
      expect(s3.step).toBe('positioning');
    });

    it('hold-still neutral-yaw check works under inversion', () => {
      // Reach hold_still using inverted yaw values
      let state = reachTurnLeftInv();
      state = advance(state, makeFaceSample({ yaw: 15 }), invCfg, 1400);  // logical left
      state = advance(state, makeFaceSample({ yaw: 15 }), invCfg, 1500);  // → turn_right
      state = advance(state, makeFaceSample({ yaw: 0 }), invCfg, 1600);   // neutral
      state = advance(state, makeFaceSample({ yaw: -15 }), invCfg, 1700); // logical right
      state = advance(state, makeFaceSample({ yaw: -15 }), invCfg, 1800); // → hold_still
      expect(state.step).toBe('hold_still');

      // Stable with raw yaw 0 (normalized 0) — should start hold timer
      state = advance(state, makeFaceSample({ yaw: 0, timestamp: 2000 }), invCfg, 2000);
      expect(state.holdStillStartedAt).toBe(2000);

      // Unstable with raw yaw +20 (normalized -20) — should reset
      state = advance(state, makeFaceSample({ yaw: 20, timestamp: 2100 }), invCfg, 2100);
      expect(state.holdStillStartedAt).toBe(null);
      expect(state.step).toBe('hold_still');

      // Stable again and hold for duration → captured
      state = advance(state, makeFaceSample({ yaw: 0, timestamp: 2200 }), invCfg, 2200);
      expect(state.holdStillStartedAt).toBe(2200);
      state = advance(state, makeFaceSample({ yaw: 0, timestamp: 2910 }), invCfg, 2910);
      expect(state.step).toBe('captured');
      expect(state.shouldCapture).toBe(true);
    });

    it('full happy-path sequence works end-to-end with invertYaw', () => {
      const samples: FaceSample[] = [
        // positioning (raw 0 → neutral)
        makeFaceSample({ yaw: 0, timestamp: 1000 }),
        // blink: open → closed → open
        makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9, timestamp: 1100 }),
        makeFaceSample({ leftEyeOpen: 0.2, rightEyeOpen: 0.2, timestamp: 1200 }),
        makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9, timestamp: 1300 }),
        // logical turn left: raw +15 → normalized -15
        makeFaceSample({ yaw: 15, timestamp: 1400 }),
        makeFaceSample({ yaw: 15, timestamp: 1500 }),
        // return to neutral: raw 0
        makeFaceSample({ yaw: 0, timestamp: 1600 }),
        // logical turn right: raw -15 → normalized +15
        makeFaceSample({ yaw: -15, timestamp: 1700 }),
        makeFaceSample({ yaw: -15, timestamp: 1800 }),
        // hold still (stable for 700ms)
        makeFaceSample({ yaw: 0, timestamp: 2000 }),
        makeFaceSample({ yaw: 0, timestamp: 2500 }),
        makeFaceSample({ yaw: 0, timestamp: 2710 }),
      ];

      let state = createInitialState(1000);
      for (const s of samples) {
        state = advance(state, s, invCfg, s.timestamp);
      }
      expect(state.step).toBe('captured');
      expect(state.shouldCapture).toBe(true);
      expect(state.checks.faceDetected).toBe(true);
      expect(state.checks.blink).toBe(true);
      expect(state.checks.leftTurn).toBe(true);
      expect(state.checks.rightTurn).toBe(true);
      expect(state.bestScore).toBeGreaterThan(0);
    });
  });

  describe('full happy-path sequence', () => {
    it('completes the entire liveness sequence end-to-end', () => {
      const samples: FaceSample[] = [
        // positioning
        makeFaceSample({ timestamp: 1000 }),
        // blink: open → closed → open
        makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9, timestamp: 1100 }),
        makeFaceSample({ leftEyeOpen: 0.2, rightEyeOpen: 0.2, timestamp: 1200 }),
        makeFaceSample({ leftEyeOpen: 0.9, rightEyeOpen: 0.9, timestamp: 1300 }),
        // turn left (2 frames)
        makeFaceSample({ yaw: -15, timestamp: 1400 }),
        makeFaceSample({ yaw: -15, timestamp: 1500 }),
        // return to neutral
        makeFaceSample({ yaw: 0, timestamp: 1600 }),
        // turn right (2 frames)
        makeFaceSample({ yaw: 15, timestamp: 1700 }),
        makeFaceSample({ yaw: 15, timestamp: 1800 }),
        // hold still (stable for 700ms)
        makeFaceSample({ timestamp: 2000 }),
        makeFaceSample({ timestamp: 2500 }),
        makeFaceSample({ timestamp: 2710 }),
      ];

      const finalState = runSequence(samples);
      expect(finalState.step).toBe('captured');
      expect(finalState.shouldCapture).toBe(true);
      expect(finalState.checks.faceDetected).toBe(true);
      expect(finalState.checks.blink).toBe(true);
      expect(finalState.checks.leftTurn).toBe(true);
      expect(finalState.checks.rightTurn).toBe(true);
      expect(finalState.bestScore).toBeGreaterThan(0);
    });
  });
});
