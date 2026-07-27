/**
 * Production Live Selfie Verification Screen
 *
 * Clean, user-facing liveness verification with no developer diagnostics.
 * Runs the proven liveness state machine and auto-captures the best frame.
 *
 * Flow:
 *   Center face → Blink → Turn left → Turn right → Hold still → Auto-capture
 *   → Review photo → Upload → onComplete callback
 *
 * Fallback: "Submit for manual selfie review" captures a normal selfie
 * and marks liveness_status as 'manual_review' (never 'passed').
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
  ActivityIndicator,
  Image,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
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
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS, SPACING, BORDER_RADIUS } from '../../constants/theme';
import {
  LIVENESS_THRESHOLDS,
  LivenessThresholds,
  STEP_INSTRUCTIONS,
  PROGRESS_STEPS,
} from '../../config/livenessConfig';
import { getDevicePlatform } from '../../config/remoteFlags';
import {
  advance,
  createInitialState,
  FaceSample,
  LivenessState,
} from '../../dev/idvSpike/livenessMachine';

const createRunOnJS =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Worklets as any).createRunOnJS ?? (Worklets as any).createRunInJsFn;

const SCREEN_WIDTH = Dimensions.get('window').width;
const OVAL_WIDTH = SCREEN_WIDTH * 0.65;
const OVAL_HEIGHT = OVAL_WIDTH * 1.35;

export interface LivenessResult {
  status: 'passed' | 'manual_review';
  storagePath: string;
  livenessData: {
    liveness_status: 'passed' | 'manual_review';
    blink_detected: boolean;
    left_turn_detected: boolean;
    right_turn_detected: boolean;
    capture_quality_score: number;
    liveness_captured_at: string;
    manual_review_required: boolean;
    attempt_count: number;
    device_platform: string;
    liveness_details: Record<string, unknown>;
  };
}

interface Props {
  visible: boolean;
  userId: string;
  onComplete: (result: LivenessResult) => void;
  onCancel: () => void;
}

type Phase = 'camera_permission' | 'liveness' | 'review' | 'uploading' | 'error' | 'manual_fallback';

export default function LiveSelfieVerificationScreen({
  visible,
  userId,
  onComplete,
  onCancel,
}: Props) {
  const cfg = LIVENESS_THRESHOLDS;
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const cameraRef = useRef<Camera>(null);

  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<Phase>('liveness');
  const [livenessState, setLivenessState] = useState<LivenessState>(() =>
    createInitialState(Date.now())
  );
  const [capturedPath, setCapturedPath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(1);

  const capturingRef = useRef(false);
  const phaseRef = useRef<Phase>('liveness');
  phaseRef.current = phase;

  const faceDetectionOptions = useRef<FaceDetectionOptions>({
    performanceMode: 'fast',
    classificationMode: 'all',
    landmarkMode: 'none',
    contourMode: 'none',
    trackingEnabled: false,
    autoScale: false,
  }).current;

  const { detectFaces } = useFaceDetector(faceDetectionOptions);

  useEffect(() => {
    if (visible && !hasPermission) requestPermission();
  }, [visible, hasPermission, requestPermission]);

  useEffect(() => {
    if (!visible) {
      setIsActive(false);
      setPhase('liveness');
      setLivenessState(createInitialState(Date.now()));
      setCapturedPath(null);
      setErrorMessage(null);
      setAttemptCount(1);
      capturingRef.current = false;
    } else {
      setLivenessState(prev => ({ ...prev, startedAt: Date.now() }));
      setIsActive(true);
    }
  }, [visible]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        if (phaseRef.current === 'liveness') setIsActive(true);
      } else {
        setIsActive(false);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    return () => setIsActive(false);
  }, []);

  const uploadSelfie = useCallback(
    async (photoPath: string, livenessData: LivenessResult['livenessData']): Promise<string> => {
      const ext = photoPath.split('.').pop()?.toLowerCase() ?? 'jpg';
      const storagePath = `${userId}/verification_selfie_${Date.now()}.${ext}`;

      const uri = photoPath.includes('://') ? photoPath : `file://${photoPath}`;
      const response = await fetch(uri);
      if (!response.ok) throw new Error(`Fetch error: HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('provider-documents')
        .upload(storagePath, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) throw uploadError;

      return storagePath;
    },
    [userId]
  );

  const handleComplete = useCallback(
    async (photoPath: string, livenessData: LivenessResult['livenessData']) => {
      setPhase('uploading');
      try {
        const storagePath = await uploadSelfie(photoPath, livenessData);
        setIsActive(false);
        onComplete({
          status: livenessData.liveness_status as 'passed' | 'manual_review',
          storagePath,
          livenessData,
        });
      } catch {
        setErrorMessage('Selfie upload failed. Please check your connection and try again.');
        setPhase('error');
      }
    },
    [uploadSelfie, onComplete]
  );

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
      const photoUri = photo.path.includes('://') ? photo.path : `file://${photo.path}`;
      setCapturedPath(photoUri);
      setIsActive(false);
      setPhase('review');
    } catch {
      setErrorMessage('Capture failed. Tap Retry to try again.');
      setPhase('error');
    }
  }, []);

  const onFaces = useMemo(
    () =>
      createRunOnJS(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (faces: any[], frameWidth: number, frameHeight: number) => {
          const now = Date.now();
          const count = Array.isArray(faces) ? faces.length : 0;
          let sample: FaceSample;

          if (count >= 1) {
            const f = faces.reduce((a, b) =>
              (b?.bounds?.width ?? 0) > (a?.bounds?.width ?? 0) ? b : a
            );
            const b = f.bounds ?? { x: 0, y: 0, width: 0, height: 0 };
            const centerX = frameWidth > 0 ? (b.x + b.width / 2) / frameWidth : null;
            const centerY = frameHeight > 0 ? (b.y + b.height / 2) / frameHeight : null;
            const sizeRatio = frameWidth > 0 ? b.width / frameWidth : null;
            const heightRatio = frameHeight > 0 ? b.height / frameHeight : null;
            const rawYaw = typeof f.yawAngle === 'number' ? f.yawAngle : 0;
            const rawPitch = typeof f.pitchAngle === 'number' ? f.pitchAngle : 0;
            const rawRoll = typeof f.rollAngle === 'number' ? f.rollAngle : 0;
            const le = typeof f.leftEyeOpenProbability === 'number' ? f.leftEyeOpenProbability : -1;
            const re = typeof f.rightEyeOpenProbability === 'number' ? f.rightEyeOpenProbability : -1;

            sample = {
              faceCount: count,
              centerX,
              centerY,
              sizeRatio,
              heightRatio,
              leftEyeOpen: le,
              rightEyeOpen: re,
              yaw: rawYaw,
              pitch: rawPitch,
              roll: rawRoll,
              timestamp: now,
            };
          } else {
            sample = {
              faceCount: 0,
              centerX: null,
              centerY: null,
              sizeRatio: null,
              heightRatio: null,
              leftEyeOpen: -1,
              rightEyeOpen: -1,
              yaw: 0,
              pitch: 0,
              roll: 0,
              timestamp: now,
            };
          }

          setLivenessState((prev) => {
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
    setErrorMessage(null);
    capturingRef.current = false;
    setLivenessState(createInitialState(Date.now()));
    setPhase('liveness');
    setIsActive(true);
  }, []);

  const handleRetry = useCallback(() => {
    setAttemptCount((c) => c + 1);
    startSequence();
  }, [startSequence]);

  const handleUsePhoto = useCallback(() => {
    if (!capturedPath) return;
    handleComplete(capturedPath, {
      liveness_status: 'passed',
      blink_detected: livenessState.checks.blink,
      left_turn_detected: livenessState.checks.leftTurn,
      right_turn_detected: livenessState.checks.rightTurn,
      capture_quality_score: livenessState.bestScore,
      liveness_captured_at: new Date().toISOString(),
      manual_review_required: false,
      attempt_count: attemptCount,
      device_platform: getDevicePlatform(),
      liveness_details: {
        checks: {
          faceDetected: livenessState.checks.faceDetected,
          lighting: livenessState.checks.lighting,
          blink: livenessState.checks.blink,
          leftTurn: livenessState.checks.leftTurn,
          rightTurn: livenessState.checks.rightTurn,
        },
        bestScore: livenessState.bestScore,
      },
    });
  }, [capturedPath, livenessState, attemptCount, handleComplete]);

  const handleManualFallback = useCallback(async () => {
    setIsActive(false);
    setPhase('manual_fallback');
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setErrorMessage('Camera permission is required for manual selfie review.');
        setPhase('error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) {
        setPhase('liveness');
        setIsActive(true);
        return;
      }
      const photoPath = result.assets[0].uri;
      handleComplete(photoPath, {
        liveness_status: 'manual_review',
        blink_detected: false,
        left_turn_detected: false,
        right_turn_detected: false,
        capture_quality_score: 0,
        liveness_captured_at: new Date().toISOString(),
        manual_review_required: true,
        attempt_count: attemptCount,
        device_platform: getDevicePlatform(),
        liveness_details: {
          fallback: 'manual_selfie_review',
        },
      });
    } catch {
      setErrorMessage('Unable to capture manual selfie. Please try again.');
      setPhase('error');
    }
  }, [attemptCount, handleComplete]);

  if (!visible) return null;

  // ── Camera Permission Gate ──────────────────────────────
  if (!hasPermission) {
    return (
      <Modal visible={visible} animationType="slide" statusBarTranslucent>
        <SafeAreaView style={styles.container}>
          <View style={styles.centerContent}>
            <Ionicons name="camera-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.permissionTitle}>Camera Permission Required</Text>
            <Text style={styles.permissionBody}>
              Please allow camera access to capture your verification selfie.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
              <Text style={styles.primaryBtnText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onCancel}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  if (device == null) {
    return (
      <Modal visible={visible} animationType="slide" statusBarTranslucent>
        <SafeAreaView style={styles.container}>
          <View style={styles.centerContent}>
            <Ionicons name="camera-outline" size={48} color={COLORS.textLight} />
            <Text style={styles.permissionTitle}>No Front Camera</Text>
            <Text style={styles.permissionBody}>
              This device does not have a usable front camera.
            </Text>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onCancel}>
              <Text style={styles.secondaryBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  // ── Uploading Phase ─────────────────────────────────────
  if (phase === 'uploading') {
    return (
      <Modal visible={visible} animationType="slide" statusBarTranslucent>
        <SafeAreaView style={styles.container}>
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.uploadingText}>Uploading verification selfie...</Text>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  // ── Error Phase ─────────────────────────────────────────
  if (phase === 'error') {
    return (
      <Modal visible={visible} animationType="slide" statusBarTranslucent>
        <SafeAreaView style={styles.container}>
          <View style={styles.centerContent}>
            <Ionicons name="alert-circle-outline" size={48} color={COLORS.error} />
            <Text style={styles.errorTitle}>Guided Capture Couldn't Be Completed</Text>
            <Text style={styles.errorBody}>{'You can try the guided capture again, or take a selfie manually.\nYour application will still be reviewed by an administrator.'}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleRetry}>
              <Text style={styles.primaryBtnText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={handleManualFallback}>
              <Text style={styles.secondaryBtnText}>Take Photo Manually</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tertiaryBtn} onPress={onCancel}>
              <Text style={styles.tertiaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  // ── Review Phase ────────────────────────────────────────
  if (phase === 'review' && capturedPath) {
    return (
      <Modal visible={visible} animationType="slide" statusBarTranslucent>
        <SafeAreaView style={styles.container}>
          <View style={styles.reviewHeader}>
            <Text style={styles.reviewTitle}>Review Your Verification Selfie</Text>
          </View>
          <View style={styles.reviewImageContainer}>
            <Image
              source={{ uri: capturedPath }}
              style={styles.reviewImage}
              resizeMode="cover"
            />
          </View>
          <Text style={styles.reviewHelperText}>
            Please confirm that your face is clear, centered, and fully visible before continuing.
          </Text>
          <View style={styles.reviewChecks}>
            {[
              'Face detected',
              'Photo quality passed',
              'Face centered correctly',
              'Capture sequence completed',
              'Ready for administrator review',
            ].map((label) => (
              <View key={label} style={styles.reviewCheckRow}>
                <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                <Text style={styles.reviewCheckText}>{label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.reviewActions}>
            <TouchableOpacity style={styles.retakeBtn} onPress={handleRetry}>
              <Ionicons name="refresh" size={18} color={COLORS.text} />
              <Text style={styles.retakeBtnText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.usePhotoBtn} onPress={handleUsePhoto}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.white} />
              <Text style={styles.usePhotoBtnText}>Use This Photo</Text>
            </TouchableOpacity>
            <Text style={styles.reviewFooterText}>This photo will be submitted for administrator review.</Text>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  // ── Liveness Phase ──────────────────────────────────────
  const currentInstruction =
    livenessState.hint ?? STEP_INSTRUCTIONS[livenessState.step] ?? 'Center your face in the oval';

  const completedSteps = new Set<string>();
  if (livenessState.checks.faceDetected) completedSteps.add('positioning');
  if (livenessState.checks.blink) completedSteps.add('blink');
  if (livenessState.checks.leftTurn) completedSteps.add('turn_left');
  if (livenessState.checks.rightTurn) completedSteps.add('turn_right');
  if (livenessState.step === 'captured') completedSteps.add('hold_still');

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <SafeAreaView style={styles.container}>
        <View style={styles.cameraContainer}>
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={isActive}
            photo={true}
            frameProcessor={phase === 'liveness' ? frameProcessor : undefined}
          />

          {/* Oval face guide overlay */}
          <View style={styles.ovalOverlay} pointerEvents="none">
            <View style={styles.oval} />
          </View>

          {/* Top bar: instruction + progress */}
          <View style={styles.topBar} pointerEvents="none">
            <Text style={styles.instructionText}>{currentInstruction}</Text>
            <View style={styles.progressRow}>
              {PROGRESS_STEPS.map((item) => {
                const done = completedSteps.has(item.step);
                const isCurrent = livenessState.step === item.step;
                return (
                  <View key={item.step} style={styles.progressItem}>
                    <View
                      style={[
                        styles.progressDot,
                        done && styles.progressDotDone,
                        isCurrent && !done && styles.progressDotActive,
                      ]}
                    >
                      {done && <Ionicons name="checkmark" size={10} color={COLORS.white} />}
                    </View>
                    <Text style={[styles.progressLabel, done && styles.progressLabelDone, isCurrent && !done && styles.progressLabelActive]}>
                      {item.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Bottom controls */}
          <View style={styles.bottomBar}>
            {livenessState.step === 'failed' && (
              <Text style={styles.failedText}>
                {livenessState.hint ?? 'Capture could not be completed. Please try again.'}
              </Text>
            )}

            {livenessState.step === 'failed' && (
              <TouchableOpacity style={styles.primaryBtn} onPress={handleRetry}>
                <Text style={styles.primaryBtnText}>Try Again</Text>
              </TouchableOpacity>
            )}

            {livenessState.step !== 'failed' && livenessState.step !== 'captured' && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={handleManualFallback}>
                <Text style={styles.secondaryBtnText}>Take Photo Manually</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.tertiaryBtn} onPress={onCancel}>
              <Text style={styles.tertiaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  permissionTitle: {
    color: COLORS.white,
    fontSize: FONTS.sizes.xxl,
    fontFamily: FONTS.semiBold,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  permissionBody: {
    color: COLORS.textLight,
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  ovalOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  oval: {
    width: OVAL_WIDTH,
    height: OVAL_HEIGHT,
    borderRadius: OVAL_WIDTH / 2,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    backgroundColor: 'transparent',
  },
  topBar: {
    position: 'absolute',
    top: SPACING.xxxl + SPACING.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.40)',
  },
  instructionText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.xxl,
    fontFamily: FONTS.bold,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowRadius: 8,
    marginBottom: SPACING.md,
  },
  progressRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  progressItem: {
    alignItems: 'center',
    gap: 4,
  },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDotActive: {
    borderColor: COLORS.primary,
  },
  progressDotDone: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success,
  },
  progressLabel: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 9,
    fontFamily: FONTS.regular,
  },
  progressLabelActive: {
    color: COLORS.white,
    fontFamily: FONTS.semiBold,
  },
  progressLabelDone: {
    color: COLORS.success,
  },
  bottomBar: {
    position: 'absolute',
    bottom: SPACING.xxxl,
    left: SPACING.lg,
    right: SPACING.lg,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  failedText: {
    color: COLORS.error,
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.semiBold,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.sm,
    minWidth: 240,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: COLORS.white,
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.lg,
  },
  secondaryBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.sm,
    minWidth: 240,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: COLORS.white,
    fontFamily: FONTS.medium,
    fontSize: FONTS.sizes.base,
  },
  tertiaryBtn: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
  },
  tertiaryBtnText: {
    color: COLORS.textLight,
    fontFamily: FONTS.regular,
    fontSize: FONTS.sizes.sm,
  },
  uploadingText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.lg,
    fontFamily: FONTS.medium,
    marginTop: SPACING.lg,
  },
  errorTitle: {
    color: COLORS.error,
    fontSize: FONTS.sizes.xxl,
    fontFamily: FONTS.semiBold,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  errorBody: {
    color: COLORS.textLight,
    fontSize: FONTS.sizes.base,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  reviewHeader: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  reviewTitle: {
    color: COLORS.white,
    fontSize: FONTS.sizes.xl,
    fontFamily: FONTS.bold,
    textAlign: 'center',
  },
  reviewImageContainer: {
    flex: 1,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  reviewImage: {
    width: '100%',
    height: '100%',
  },
  reviewHelperText: {
    color: COLORS.textLight,
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
  },
  reviewFooterText: {
    color: COLORS.textLight,
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    paddingTop: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  reviewChecks: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  reviewCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  reviewCheckText: {
    color: COLORS.white,
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.medium,
  },
  reviewActions: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  retakeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  retakeBtnText: {
    color: COLORS.white,
    fontFamily: FONTS.medium,
    fontSize: FONTS.sizes.base,
  },
  usePhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.success,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  usePhotoBtnText: {
    color: COLORS.white,
    fontFamily: FONTS.semiBold,
    fontSize: FONTS.sizes.base,
  },
  reviewNote: {
    color: COLORS.textLight,
    fontSize: FONTS.sizes.sm,
    fontFamily: FONTS.regular,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
  },
});
