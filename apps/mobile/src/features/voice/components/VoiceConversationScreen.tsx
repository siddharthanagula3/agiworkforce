import { useCallback, useEffect } from 'react';
import { Alert, Keyboard, View, Pressable, StatusBar, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated';
import { X, MicOff, Mic, PhoneOff, Hand } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Stop, Rect, Circle } from 'react-native-svg';
import { Text } from '@/components/ui/text';
import { Waveform } from './Waveform';
import { colors } from '@/src/ui/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import { useModelStore } from '@/src/features/model-picker/store';
import * as TTS from '@/src/features/voice/services/tts';
import {
  useVoiceConversation,
  voiceCaptureErrorMessage,
  type VoiceConversationPhase as ConversationPhase,
} from '@/src/features/voice/hooks/useVoiceConversation';

/**
 * Full-screen voice conversation mode.
 * Resembles ChatGPT Advanced Voice — centered waveform, status text,
 * mute, push-to-talk toggle, and end-call buttons. Swipe down or X to dismiss.
 *
 * Two interaction modes (persisted in settings):
 *  - hands-free (default): tap to talk, auto-relisten after the AI speaks
 *  - push-to-talk: hold the orb to talk, release to send
 */

interface VoiceConversationScreenProps {
  /** Whether the full-screen overlay is visible */
  visible: boolean;
  /** Close the voice conversation screen */
  onClose: () => void;
  /** Send transcribed user text to the chat engine and return real assistant text when available. */
  onSendMessage: (text: string) => Promise<string | null | undefined>;
}

const PHASE_CONFIG: Record<ConversationPhase, { label: string; color: string; sublabel: string }> =
  {
    idle: {
      label: 'Tap to speak',
      color: colors.textMuted,
      sublabel: 'Voice conversation mode',
    },
    listening: {
      label: 'Listening...',
      color: colors.agentActive,
      sublabel: 'Speak naturally',
    },
    thinking: {
      label: 'Thinking...',
      color: colors.agentThinking,
      sublabel: 'Processing your message',
    },
    speaking: {
      label: 'Speaking...',
      color: colors.teal,
      sublabel: 'AI is responding',
    },
  };

function phaseConfig(phase: ConversationPhase, pttMode: boolean) {
  const config = PHASE_CONFIG[phase];
  if (!pttMode) return config;
  if (phase === 'idle') return { ...config, label: 'Hold to talk', sublabel: 'Push-to-talk mode' };
  if (phase === 'listening') return { ...config, sublabel: 'Release to send' };
  return config;
}

function GradientBackground() {
  const { width, height } = useWindowDimensions();
  return (
    <Svg
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0 }}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id="voiceBg" cx="50%" cy="45%" r="60%" fx="50%" fy="45%">
          <Stop offset="0%" stopColor={colors.voiceConversationBgStart} stopOpacity="1" />
          <Stop offset="40%" stopColor={colors.voiceConversationBgMid} stopOpacity="1" />
          <Stop offset="100%" stopColor={colors.voiceConversationBgEnd} stopOpacity="1" />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#voiceBg)" />
    </Svg>
  );
}

function CenterOrb({ phase, audioLevel }: { phase: ConversationPhase; audioLevel: number }) {
  const orbScale = useSharedValue(1);
  const orbGlow = useSharedValue(0.2);

  useEffect(() => {
    if (phase === 'thinking') {
      orbScale.value = withRepeat(
        withSequence(withTiming(1.15, { duration: 800 }), withTiming(0.95, { duration: 800 })),
        -1,
        true,
      );
      orbGlow.value = withRepeat(withTiming(0.5, { duration: 800 }), -1, true);
    } else if (phase === 'listening' || phase === 'speaking') {
      const targetScale = 1 + audioLevel * 0.3;
      orbScale.value = withSpring(targetScale, { damping: 10, stiffness: 200 });
      orbGlow.value = withSpring(0.3 + audioLevel * 0.4, { damping: 10 });
    } else {
      orbScale.value = withSpring(1, { damping: 15 });
      orbGlow.value = withSpring(0.2, { damping: 15 });
    }
  }, [phase, audioLevel, orbScale, orbGlow]);

  const orbAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbScale.value }],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    opacity: orbGlow.value,
    transform: [{ scale: orbScale.value * 1.4 }],
  }));

  const config = PHASE_CONFIG[phase];

  return (
    <View className="items-center justify-center" style={{ width: 280, height: 280 }}>
      {/* Outer thin-stroke ring — matches talk-mode.png reference */}
      <Svg width={280} height={280} style={{ position: 'absolute' }} pointerEvents="none">
        <Circle cx={140} cy={140} r={130} stroke={colors.borderLight} strokeWidth={1} fill="none" />
      </Svg>

      {/* Outer glow */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: 180,
            height: 180,
            borderRadius: 90,
            backgroundColor: config.color,
          },
          glowAnimatedStyle,
        ]}
      />
      {/* Main orb */}
      <Animated.View
        style={[
          {
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: config.color,
            alignItems: 'center',
            justifyContent: 'center',
          },
          orbAnimatedStyle,
        ]}
      >
        <Waveform
          color={colors.white}
          active={phase === 'listening' || phase === 'speaking'}
          audioLevel={audioLevel}
          barCount={5}
          maxHeight={40}
          minHeight={6}
          barWidth={4}
          gap={5}
        />
      </Animated.View>
    </View>
  );
}

export function VoiceConversationScreen({
  visible,
  onClose,
  onSendMessage,
}: VoiceConversationScreenProps) {
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const selectedVoiceId = useSettingsStore((s) => s.selectedVoiceId);
  const speechRate = useSettingsStore((s) => s.speechRate);
  const pttMode = useSettingsStore((s) => s.voicePushToTalk);
  const setVoicePushToTalk = useSettingsStore((s) => s.setVoicePushToTalk);
  const selectedModel = useModelStore((s) => s.selectedModel);

  // The overlay is absolutely positioned, not a Modal, so the composer's
  // TextInput can keep (or regain, via a late transcript focus) keyboard
  // focus underneath it. Voice mode must never show the keyboard.
  useEffect(() => {
    if (visible) Keyboard.dismiss();
  }, [visible]);

  const {
    phase,
    muted,
    audioLevel,
    transcriptPreview,
    handleOrbPress,
    handleOrbPressIn,
    handleOrbPressOut,
    toggleMute,
    endConversation,
  } = useVoiceConversation({
    enabled: visible,
    pttMode,
    hapticsEnabled,
    sendMessage: onSendMessage,
    speak: (text, callbacks) =>
      TTS.speak(text, {
        voice: selectedVoiceId ?? undefined,
        rate: speechRate,
        ...callbacks,
      }),
    stopSpeaking: () => TTS.stop(),
    onCaptureError: (err) => {
      Alert.alert('Voice unavailable', voiceCaptureErrorMessage(err));
    },
  });

  const handlePttToggle = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setVoicePushToTalk(!pttMode);
  }, [hapticsEnabled, pttMode, setVoicePushToTalk]);

  const handleEndCall = useCallback(async () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    await endConversation();
    onClose();
  }, [hapticsEnabled, endConversation, onClose]);

  const handleClose = useCallback(async () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await endConversation();
    onClose();
  }, [hapticsEnabled, endConversation, onClose]);

  if (!visible) return null;

  const config = phaseConfig(phase, pttMode);

  return (
    <Animated.View
      testID="voice-conversation-screen"
      // dampingRatio(1) = critically damped: the fastest settle with zero
      // overshoot, independent of whatever stiffness/mass springify() uses
      // by default. The previous `.damping(18)` only pinned one side of the
      // spring equation — on a full-screen translateY the residual
      // underdamped oscillation was visible as a "jiggle" right as the
      // sheet finished sliding in/out.
      entering={reducedMotion ? undefined : SlideInDown.springify().dampingRatio(1)}
      exiting={reducedMotion ? undefined : SlideOutDown.springify().dampingRatio(1)}
      className="absolute inset-0 z-50"
      style={{ backgroundColor: colors.voiceConversationBgEnd }}
    >
      <StatusBar barStyle="light-content" />

      {/* Radial gradient background — matches talk-mode.png dark purple/blue glow */}
      <GradientBackground />

      {/* Close button */}
      <Pressable
        onPress={handleClose}
        className="absolute z-10 p-2 rounded-full active:opacity-80"
        style={{
          top: insets.top + 12,
          right: 16,
          backgroundColor: colors.voiceControlSurface,
        }}
        accessibilityLabel="Close voice conversation"
        accessibilityRole="button"
      >
        <X size={22} color={colors.textSecondary} />
      </Pressable>

      {/* Main content */}
      <View
        className="flex-1 items-center justify-center"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        {/* Status sublabel */}
        <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 16 }}>
          {config.sublabel}
        </Text>

        {/* Center orb — tap (hands-free) or hold (push-to-talk) to interact */}
        <Pressable
          testID="voice-conversation-orb"
          onPress={pttMode ? undefined : handleOrbPress}
          onPressIn={pttMode ? handleOrbPressIn : undefined}
          onPressOut={pttMode ? handleOrbPressOut : undefined}
          accessibilityLabel={config.label}
          accessibilityRole="button"
          accessibilityHint={
            pttMode
              ? 'Hold to talk, release to send'
              : 'Tap to start, stop, or interrupt voice conversation'
          }
        >
          <CenterOrb phase={phase} audioLevel={audioLevel} />
        </Pressable>

        {/* Phase label */}
        <Text className="text-lg font-medium mt-6" style={{ color: config.color }}>
          {config.label}
        </Text>

        {/* Active model name — mirrors "Bot: Main" label in talk-mode.png */}
        <Animated.View entering={FadeIn.duration(400)} className="mt-2 items-center">
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 12,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
            }}
          >
            {selectedModel}
          </Text>
        </Animated.View>

        {/* Transcript preview */}
        {transcriptPreview ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            className="mt-4 mx-8 px-4 py-2 rounded-xl"
            style={{ backgroundColor: colors.voiceTranscriptSurface }}
          >
            <Text
              style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center' }}
              numberOfLines={3}
            >
              {transcriptPreview}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      {/* Bottom controls */}
      <View
        className="flex-row items-center justify-center gap-12 pb-4"
        style={{ paddingBottom: insets.bottom + 24 }}
      >
        {/* Mute button */}
        <Pressable
          onPress={toggleMute}
          className="w-14 h-14 rounded-full items-center justify-center active:opacity-80"
          style={{ backgroundColor: muted ? colors.dangerSurface : colors.voiceControlSurface }}
          accessibilityLabel={muted ? 'Unmute microphone' : 'Mute microphone'}
          accessibilityRole="button"
        >
          {muted ? (
            <MicOff size={24} color={colors.agentError} />
          ) : (
            <Mic size={24} color={colors.textPrimary} />
          )}
        </Pressable>

        {/* End call button */}
        <Pressable
          testID="voice-conversation-end-call"
          onPress={handleEndCall}
          className="w-16 h-16 rounded-full items-center justify-center active:opacity-80"
          style={{ backgroundColor: colors.agentError }}
          accessibilityLabel="End voice conversation"
          accessibilityRole="button"
        >
          <PhoneOff size={26} color={colors.white} />
        </Pressable>

        {/* Push-to-talk mode toggle */}
        <Pressable
          testID="voice-conversation-ptt-toggle"
          onPress={handlePttToggle}
          className="w-14 h-14 rounded-full items-center justify-center active:opacity-80"
          style={{ backgroundColor: pttMode ? colors.purpleSurface : colors.voiceControlSurface }}
          accessibilityLabel={pttMode ? 'Switch to hands-free mode' : 'Switch to push-to-talk mode'}
          accessibilityRole="button"
          accessibilityState={{ selected: pttMode }}
        >
          <Hand size={24} color={pttMode ? colors.agentThinking : colors.textPrimary} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
