/**
 * Identity Verification — Phase 2A Native Camera + ML Kit Spike Screen
 *
 * ISOLATED DEV SPIKE ONLY. This screen is NOT part of the production
 * ProviderOnboarding verification flow. It is reachable only via the guarded
 * dev entry in `index.ts` when EXPO_PUBLIC_IDV_SPIKE=1.
 *
 * Purpose (per Phase 2A spike goals):
 *   - Prove camera permission + front preview open
 *   - Prove exactly-one-face detection with bounds
 *   - Prove yaw (head-turn) + per-eye open probabilities are available
 *   - Prove frame processing stays responsive (throttled)
 *   - Prove camera stop/release + background/foreground safety
 *   - Run the liveness sequence and auto-capture one best frame (no shutter)
 *
 * PRIVACY: No biometric values are written to logs or persisted. Live metrics
 * are shown on-screen only for spike verification. No Supabase, no upload, no
 * face comparison, no liveness video (all deferred per Phase 2A constraints).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AppState,
  AppStateStatus,
  Platform,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
  runAtTargetFps,
  PhotoFile,
} from 'react-native-vision-camera';
import {
  useFaceDetector,
  FaceDetectionOptions,
} from 'react-native-vision-camera-face-detector';
import { Worklets } from 'react-native-worklets-core';

import { SPIKE_THRESHOLDS, STEP_INSTRUCTIONS } from './spikeConfig';
import {
  advance,
  createInitialState,
  FaceSample,
  LivenessState,
} from './livenessMachine';

// createRunOnJS is the documented API in worklets-core used by the face
// detector; fall back to the older name for version tolerance.
const createRunOnJS =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Worklets as any).createRunOnJS ?? (Worklets as any).createRunInJsFn;

const CHECK_LABELS: { key: keyof LivenessState['checks']; label: string }[] = [
  { key: 'faceDetected', label: 'Face detected' },
  { key: 'lighting', label: 'Good lighting' },
  { key: 'blink', label: 'Blink detected' },
  { key: 'leftTurn', label: 'Left turn detected' },
  { key: 'rightTurn', label: 'Right turn detected' },
];

export default function IdvSpikeScreen() {
  const cfg = SPIKE_THRESHOLDS;
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const cameraRef = useRef<Camera>(null);

  const [isActive, setIsActive] = useState(false);
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<LivenessState>(() => createInitialState(Date.now()));
  const [capturedPath, setCapturedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Live, on-screen-only readouts (never logged / persisted).
  const [live, setLive] = useState<{ faces: number; yaw: number; le: number; re: number }>(
    { faces: 0, yaw: 0, le: -1, re: -1 }
  );

  const capturingRef = useRef(false);
  const runningRef = useRef(false);
  runningRef.current = running;

  const faceDetectionOptions = useRef<FaceDetectionOptions>({
    performanceMode: 'fast',
    classificationMode: 'all', // required for eye-open probabilities
    landmarkMode: 'none',
    contourMode: 'none',
    trackingEnabled: false,
    autoMode: false, // we normalize by frame dims, not screen dims
    cameraFacing: 'front',
  }).current;

  const { detectFaces, stopListeners } = useFaceDetector(faceDetectionOptions);

  // Request permission on mount.
  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // Background/foreground safety: release camera when app is not active.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        if (runningRef.current) setIsActive(true);
      } else {
        setIsActive(false);
      }
    });
    return () => sub.remove();
  }, []);

  // Release camera on unmount + stop face detector orientation listeners.
  useEffect(() => {
    return () => {
      setIsActive(false);
      // stopListeners is required on Android to release the orientation listener.
      if (typeof stopListeners === 'function') stopListeners();
    };
  }, [stopListeners]);

  const takeBestPhoto = useCallback(async () => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    try {
      const cam = cameraRef.current;
      if (!cam) return;
      const photo: PhotoFile = await cam.takePhoto({
        flash: 'off',
        enableShutterSound: false,
      });
      setCapturedPath(photo.path);
      setIsActive(false); // prove stop/release after capture
      setRunning(false);
    } catch (e) {
      setError('Capture failed. Tap Retry to try again.');
    }
  }, []);

  // JS-thread handler invoked from the frame processor worklet.
  const onFaces = useMemo(
    () =>
      createRunOnJS(
        (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          faces: any[],
          frameWidth: number,
          frameHeight: number
        ) => {
          const now = Date.now();
          const count = Array.isArray(faces) ? faces.length : 0;
          let sample: FaceSample;

          if (count >= 1) {
            // Choose the largest face if more than one is present.
            const f = faces.reduce((a, b) =>
              (b?.bounds?.width ?? 0) > (a?.bounds?.width ?? 0) ? b : a
            );
            const b = f.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
            const centerX = frameWidth > 0 ? (b.x + b.width / 2) / frameWidth : null;
            const centerY = frameHeight > 0 ? (b.y + b.height / 2) / frameHeight : null;
            const sizeRatio = frameWidth > 0 ? b.width / frameWidth : null;
            const rawYaw = typeof f.yawAngle === 'number' ? f.yawAngle : 0;
            const yaw = cfg.invertYaw ? -rawYaw : rawYaw;
            const le = typeof f.leftEyeOpenProbability === 'number' ? f.leftEyeOpenProbability : -1;
            const re = typeof f.rightEyeOpenProbability === 'number' ? f.rightEyeOpenProbability : -1;

            sample = {
              faceCount: count,
              centerX,
              centerY,
              sizeRatio,
              leftEyeOpen: le,
              rightEyeOpen: re,
              yaw,
              timestamp: now,
            };
            setLive({ faces: count, yaw: Math.round(yaw), le, re });
          } else {
            sample = {
              faceCount: 0,
              centerX: null,
              centerY: null,
              sizeRatio: null,
              leftEyeOpen: -1,
              rightEyeOpen: -1,
              yaw: 0,
              timestamp: now,
            };
            setLive({ faces: 0, yaw: 0, le: -1, re: -1 });
          }

          setState((prev) => {
            const nextState = advance(prev, sample, cfg, now);
            if (nextState.shouldCapture) {
              takeBestPhoto();
            }
            return nextState;
          });
        }
      ),
    [cfg, takeBestPhoto]
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      runAtTargetFps(cfg.targetFps, () => {
        'worklet';
        const faces = detectFaces(frame);
        onFaces(faces, frame.width, frame.height);
      });
    },
    [detectFaces, onFaces, cfg.targetFps]
  );

  const startSequence = useCallback(() => {
    setCapturedPath(null);
    setError(null);
    capturingRef.current = false;
    setState(createInitialState(Date.now()));
    setRunning(true);
    setIsActive(true);
  }, []);

  const stopSequence = useCallback(() => {
    setRunning(false);
    setIsActive(false);
  }, []);

  // ── Render guards ────────────────────────────────────────
  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera permission required</Text>
        <Text style={styles.subtle}>This spike needs the front camera.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>No front camera found</Text>
        <Text style={styles.subtle}>This device has no usable front camera.</Text>
      </View>
    );
  }

  const currentInstruction =
    state.hint ?? STEP_INSTRUCTIONS[state.step] ?? 'Center your face';

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        photo={true}
        frameProcessor={running ? frameProcessor : undefined}
      />

      {/* Top: instruction */}
      <View style={styles.topBar} pointerEvents="none">
        <Text style={styles.instruction}>{currentInstruction}</Text>
        <Text style={styles.stepLabel}>step: {state.step}</Text>
      </View>

      {/* Checklist */}
      <View style={styles.checklist} pointerEvents="none">
        <Text style={styles.checkHeader}>Identity Verification (SPIKE)</Text>
        {CHECK_LABELS.map(({ key, label }) => {
          const done = state.checks[key];
          return (
            <Text key={key} style={[styles.checkItem, done && styles.checkDone]}>
              {done ? '\u2713' : '\u25CB'} {label}
            </Text>
          );
        })}
        {state.step === 'hold_still' && (
          <Text style={styles.checkItem}>{'\u23F3'} Selecting best selfie...</Text>
        )}
        {/* On-screen-only live metrics (not logged) */}
        <Text style={styles.metrics}>
          {`faces:${live.faces} yaw:${live.yaw}\u00B0 eyeL:${live.le < 0 ? 'n/a' : live.le.toFixed(2)} eyeR:${live.re < 0 ? 'n/a' : live.re.toFixed(2)}`}
        </Text>
      </View>

      {/* Result / controls */}
      <View style={styles.bottomBar}>
        {state.step === 'captured' && capturedPath && (
          <Text style={styles.result}>{'\u2713'} Selfie captured (best frame)</Text>
        )}
        {state.step === 'failed' && (
          <Text style={styles.resultFail}>{state.hint ?? 'Liveness failed'}</Text>
        )}
        {error && <Text style={styles.resultFail}>{error}</Text>}

        {!running && state.step !== 'captured' && (
          <TouchableOpacity style={styles.btn} onPress={startSequence}>
            <Text style={styles.btnText}>Start liveness sequence</Text>
          </TouchableOpacity>
        )}
        {running && (
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={stopSequence}>
            <Text style={styles.btnText}>Stop / release camera</Text>
          </TouchableOpacity>
        )}
        {(state.step === 'captured' || state.step === 'failed') && (
          <TouchableOpacity style={styles.btn} onPress={startSequence}>
            <Text style={styles.btnText}>Retry</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.env}>
          Platform: {Platform.OS} | active: {String(isActive)} | fps: {cfg.targetFps}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0b0b0b' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  subtle: { color: '#bbb', fontSize: 14, marginBottom: 20, textAlign: 'center' },
  topBar: { position: 'absolute', top: 48, left: 0, right: 0, alignItems: 'center' },
  instruction: { color: '#fff', fontSize: 24, fontWeight: '800', textShadowColor: '#000', textShadowRadius: 6 },
  stepLabel: { color: '#9ad', fontSize: 12, marginTop: 4 },
  checklist: {
    position: 'absolute', top: 120, left: 16, right: 16,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12, padding: 12,
  },
  checkHeader: { color: '#fff', fontWeight: '700', marginBottom: 6 },
  checkItem: { color: '#ddd', fontSize: 15, marginVertical: 2 },
  checkDone: { color: '#5bd75b', fontWeight: '700' },
  metrics: { color: '#8fd', fontSize: 12, marginTop: 8, fontVariant: ['tabular-nums'] },
  bottomBar: { position: 'absolute', bottom: 32, left: 16, right: 16, alignItems: 'center' },
  result: { color: '#5bd75b', fontSize: 16, fontWeight: '700', marginBottom: 12 },
  resultFail: { color: '#ff6b6b', fontSize: 15, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  btn: { backgroundColor: '#E31C3D', paddingVertical: 14, paddingHorizontal: 22, borderRadius: 12, marginTop: 8, minWidth: 240, alignItems: 'center' },
  btnSecondary: { backgroundColor: '#444' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  env: { color: '#888', fontSize: 11, marginTop: 12 },
});
