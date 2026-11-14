import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  type Ref,
} from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  cancelAnimation,
} from 'react-native-reanimated';
import { Mic, Loader } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '@/src/ui/theme';
import { motion } from '@/src/ui/theme/tokens';
import { useSettingsStore } from '@/stores/settingsStore';
import * as VoiceService from '@/src/features/voice/services/voice';
import type { VoiceMeteringEvent } from '@/src/features/voice/services/voice';
import { VoiceCaptureError } from '@/src/features/voice/services/voiceInput';
import { VoiceOnboardingSheet } from './VoiceOnboardingSheet';

import {
  captureCloudAccountEpoch,
  subscribeCloudAccountEpochChange,
} from '@/src/features/auth/services/cloudAccountSession';

export type DictationIntent = 'insert' | 'send';
export interface VoiceInputHandle {
  stop: (intent?: DictationIntent) => void;
  cancel: () => void;
}

interface VoiceInputButtonProps {
  onTranscription: (text: string, intent: DictationIntent) => void;
  onRecordingStart?: () => void;
  onRecordingStop?: () => void;
  onProcessingChange?: (processing: boolean) => void;
  onMetering?: (event: VoiceMeteringEvent) => void;
  onLongPress?: () => void;
  onError?: (error: string, permissionDenied?: boolean) => void;
  onFailure?: () => void;
  controlRef?: Ref<VoiceInputHandle>;
  scopeKey?: string;
  resetSignal?: number;
  startSignal?: number;
  disabled?: boolean;
}

type VoiceState = 'idle' | 'starting' | 'recording' | 'ptt' | 'processing';
interface RecordingAttempt {
  controller: AbortController;
  ready: Promise<VoiceService.RecordingSession>;
  scope: object;
  account: ReturnType<typeof captureCloudAccountEpoch>;
  finishing: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const PTT_THRESHOLD_MS = 300;
const LONG_PRESS_DELAY_MS = 600;

export function VoiceInputButton(props: VoiceInputButtonProps) {
  const {
    onLongPress,
    controlRef,
    scopeKey = '',
    resetSignal = 0,
    startSignal = 0,
    disabled = false,
  } = props;
  const colors = useThemeColors();
  const [state, setState] = useState<VoiceState>('idle');
  const [introVisible, setIntroVisible] = useState(false);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const voiceInputEnabled = useSettingsStore((s) => s.voiceEnabled);
  const dictationOnboardingSeen = useSettingsStore((s) => s.dictationOnboardingSeen);
  const current = useRef({ props, scopeKey, disabled, voiceInputEnabled, hapticsEnabled });
  current.current = { props, scopeKey, disabled, voiceInputEnabled, hapticsEnabled };
  const scope = useRef({ key: scopeKey, resetSignal, token: {} });
  if (scope.current.key !== scopeKey || scope.current.resetSignal !== resetSignal) {
    scope.current = { key: scopeKey, resetSignal, token: {} };
  }
  const mounted = useRef(true);
  const active = useRef<RecordingAttempt | null>(null);
  const stateRef = useRef<VoiceState>('idle');
  const pressStartRef = useRef(0);
  const isLongPressRef = useRef(false);
  const isPTTRef = useRef(false);
  const pttTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);
  const spinRotation = useSharedValue(0);

  const changeState = useCallback((next: VoiceState) => {
    stateRef.current = next;
    if (mounted.current) setState(next);
  }, []);
  const clearPTTTimer = useCallback(() => {
    if (pttTimerRef.current !== null) clearTimeout(pttTimerRef.current);
    pttTimerRef.current = null;
  }, []);
  const owns = useCallback((attempt: RecordingAttempt) => {
    const account = captureCloudAccountEpoch();
    return (
      mounted.current &&
      active.current === attempt &&
      !attempt.controller.signal.aborted &&
      scope.current.token === attempt.scope &&
      current.current.voiceInputEnabled &&
      useSettingsStore.getState().voiceEnabled &&
      !current.current.disabled &&
      account?.ownerId === attempt.account?.ownerId &&
      account?.epoch === attempt.account?.epoch
    );
  }, []);
  const cancelActiveRecording = useCallback(() => {
    clearPTTTimer();
    const attempt = active.current;
    active.current = null;
    attempt?.controller.abort();
    if (attempt) void attempt.ready.then((session) => session.cancel()).catch(() => undefined);
    pressStartRef.current = 0;
    isPTTRef.current = false;
    changeState('idle');
    if (attempt) {
      current.current.props.onRecordingStop?.();
      current.current.props.onProcessingChange?.(false);
    }
  }, [changeState, clearPTTTimer]);
  const reportError = useCallback((error: unknown) => {
    if (error instanceof VoiceCaptureError && error.code === 'aborted') return;
    if (error instanceof VoiceCaptureError && error.code === 'mic-permission-denied') {
      current.current.props.onError?.(
        'Voice input needs microphone and speech access. You can keep typing instead.',
        true,
      );
    } else if (
      error instanceof VoiceCaptureError &&
      error.code === 'on-device-recognition-unavailable'
    ) {
      current.current.props.onError?.(error.message);
    } else current.current.props.onFailure?.();
  }, []);
  const fail = useCallback(
    (attempt: RecordingAttempt, error: unknown) => {
      if (!owns(attempt)) return;
      active.current = null;
      attempt.controller.abort();
      changeState('idle');
      current.current.props.onRecordingStop?.();
      current.current.props.onProcessingChange?.(false);
      reportError(error);
    },
    [changeState, owns, reportError],
  );

  const finish = useCallback(
    async (intent: DictationIntent = 'insert') => {
      const attempt = active.current;
      if (!attempt || attempt.finishing || !owns(attempt)) return;
      attempt.finishing = true;
      isPTTRef.current = false;
      changeState('processing');
      if (current.current.hapticsEnabled)
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      current.current.props.onRecordingStop?.();
      current.current.props.onProcessingChange?.(true);
      try {
        const session = await attempt.ready;
        if (!owns(attempt)) return;
        await session.stop();
        const result = await session.result;
        if (!owns(attempt)) return;
        active.current = null;
        changeState('idle');
        current.current.props.onProcessingChange?.(false);
        if (result.text.trim()) current.current.props.onTranscription(result.text.trim(), intent);
        else current.current.props.onFailure?.();
      } catch (error) {
        fail(attempt, error);
      }
    },
    [changeState, fail, owns],
  );

  const startRecording = useCallback(
    (ptt: boolean) => {
      if (
        active.current ||
        !mounted.current ||
        current.current.disabled ||
        !current.current.voiceInputEnabled ||
        !useSettingsStore.getState().voiceEnabled
      )
        return;
      const controller = new AbortController();
      const attempt: RecordingAttempt = {
        controller,
        scope: scope.current.token,
        account: captureCloudAccountEpoch(),
        finishing: false,
        ready: VoiceService.startRecording((event) => {
          if (owns(attempt)) current.current.props.onMetering?.(event);
        }, controller.signal),
      };
      active.current = attempt;
      isPTTRef.current = ptt;
      changeState('starting');
      void attempt.ready
        .then((session) => {
          if (!owns(attempt)) {
            void session.cancel();
            return;
          }
          void session.result.catch((error) => fail(attempt, error));
          if (attempt.finishing) return;
          changeState(ptt ? 'ptt' : 'recording');
          if (current.current.hapticsEnabled)
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          current.current.props.onRecordingStart?.();
        })
        .catch((error) => fail(attempt, error));
    },
    [changeState, fail, owns],
  );

  useImperativeHandle(
    controlRef,
    () => ({
      stop: (intent) => {
        void finish(intent);
      },
      cancel: cancelActiveRecording,
    }),
    [finish, cancelActiveRecording],
  );
  useLayoutEffect(() => {
    cancelActiveRecording();
  }, [scopeKey, resetSignal, cancelActiveRecording]);
  useEffect(() => {
    if (!voiceInputEnabled || disabled) cancelActiveRecording();
  }, [voiceInputEnabled, disabled, cancelActiveRecording]);
  useEffect(() => subscribeCloudAccountEpochChange(cancelActiveRecording), [cancelActiveRecording]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelActiveRecording();
    };
  }, [cancelActiveRecording]);
  const handledStartSignalRef = useRef(startSignal);
  useEffect(() => {
    if (startSignal === handledStartSignalRef.current) return;
    handledStartSignalRef.current = startSignal;
    startRecording(false);
  }, [startSignal, startRecording]);

  const handlePressIn = useCallback(() => {
    if (current.current.disabled || stateRef.current === 'processing') return;
    clearPTTTimer();
    pressStartRef.current = Date.now();
    isLongPressRef.current = false;
    if (stateRef.current !== 'idle' || !dictationOnboardingSeen) return;
    pttTimerRef.current = setTimeout(() => {
      pttTimerRef.current = null;
      if (!isLongPressRef.current && pressStartRef.current > 0) startRecording(true);
    }, PTT_THRESHOLD_MS);
  }, [clearPTTTimer, dictationOnboardingSeen, startRecording]);
  const handlePressOut = useCallback(() => {
    clearPTTTimer();
    const holdMs = Date.now() - pressStartRef.current;
    pressStartRef.current = 0;
    if (isLongPressRef.current) return;
    if (active.current) {
      if (stateRef.current === 'recording' || isPTTRef.current) void finish();
      return;
    }
    if (!dictationOnboardingSeen) setIntroVisible(true);
    else if (holdMs < PTT_THRESHOLD_MS) startRecording(false);
  }, [clearPTTTimer, dictationOnboardingSeen, finish, startRecording]);
  const handleLongPress = useCallback(() => {
    if (!current.current.props.onLongPress) return;
    isLongPressRef.current = true;
    cancelActiveRecording();
    if (current.current.hapticsEnabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    current.current.props.onLongPress();
  }, [cancelActiveRecording]);
  const handleIntroContinue = useCallback(() => {
    setIntroVisible(false);
    startRecording(false);
  }, [startRecording]);
  const handleIntroDismiss = useCallback(() => setIntroVisible(false), []);

  useEffect(() => {
    if (state === 'recording' || state === 'ptt') {
      ringOpacity.value = withRepeat(withTiming(0.55, { duration: motion.pulse }), -1, true);
      ringScale.value = withRepeat(withTiming(1.6, { duration: motion.pulse }), -1, true);
    } else {
      cancelAnimation(ringOpacity);
      cancelAnimation(ringScale);
      ringOpacity.value = withSpring(0, { damping: 15 });
      ringScale.value = withSpring(1, { damping: 15 });
    }
  }, [state, ringOpacity, ringScale]);
  useEffect(() => {
    if (state === 'processing')
      spinRotation.value = withRepeat(withTiming(360, { duration: motion.pulse }), -1, false);
    else {
      cancelAnimation(spinRotation);
      spinRotation.value = 0;
    }
  }, [state, spinRotation]);
  const ringAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));
  const spinAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinRotation.value}deg` }],
  }));
  const isActive = state === 'recording' || state === 'ptt';
  const isProcessing = state === 'processing' || state === 'starting';
  const isDisabled = disabled || isProcessing;
  if (!voiceInputEnabled) return null;

  const iconColor = isActive
    ? colors.agentError
    : isProcessing
      ? colors.teal
      : colors.textSecondary;

  const accessibilityLabel =
    state === 'recording'
      ? 'Tap to stop recording'
      : state === 'ptt'
        ? 'Release to transcribe'
        : state === 'starting'
          ? 'Starting voice input...'
          : state === 'processing'
            ? 'Processing voice...'
            : 'Tap to record, hold for push-to-talk';

  return (
    <View className="relative items-center justify-center">
      {isActive && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: colors.agentError,
            },
            ringAnimatedStyle,
          ]}
        />
      )}

      <AnimatedPressable
        testID="voice-input-button"
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onLongPress={onLongPress ? handleLongPress : undefined}
        delayLongPress={LONG_PRESS_DELAY_MS}
        disabled={isDisabled}
        style={[
          {
            width: 44,
            height: 44,
            padding: 6,
            borderRadius: 8,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.transparent,
          },
          isDisabled ? { opacity: 0.5 } : undefined,
        ]}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Tap to start or stop recording. Hold for instant push-to-talk. Long press for voice conversation mode."
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled, busy: isProcessing }}
      >
        {isProcessing ? (
          <Animated.View style={spinAnimatedStyle}>
            <Loader size={24} color={iconColor} />
          </Animated.View>
        ) : (
          <Mic size={24} color={iconColor} />
        )}
      </AnimatedPressable>

      {introVisible ? (
        <VoiceOnboardingSheet
          visible
          mode="on-device"
          purpose="dictation"
          onContinue={handleIntroContinue}
          onDismiss={handleIntroDismiss}
        />
      ) : null}
    </View>
  );
}
