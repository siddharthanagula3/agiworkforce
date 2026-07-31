/**
 * Voice Companion Mode — full-screen screen.
 *
 * Flow: idle → Listen (STT via on-device capture) → Think (selected local model)
 *       → Speak (on-device TTS) → loop back to Listen.
 *
 * Supports hands-free turn-taking (auto-relisten, recognizer finalizes on
 * silence) and push-to-talk (hold the orb to talk, release to send) via the
 * shared useVoiceConversation hook. The preference persists in settings.
 *
 * Design: pulsing terracotta orb, dark gradient background.
 * All processing is on-device. No audio leaves the device.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Alert, View, Pressable, StatusBar, useWindowDimensions, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { X, MicOff, Mic, Volume2, Hand } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { Waveform } from '@/src/features/voice/components/Waveform';
import { PerformanceChip } from '@/src/features/chat/components/PerformanceChip';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { useSettingsStore } from '@/stores/settingsStore';
import * as VoiceOutput from '@/src/features/voice/services/voiceOutput';
import { colors } from '@/src/ui/theme';
import { getDisplayName } from '@/src/features/model-picker/service';
import {
  createMessageIdSet,
  findNewAssistantResponse,
} from '@/src/features/voice/utils/assistantResponse';
import {
  useVoiceConversation,
  voiceCaptureErrorMessage,
  type VoiceConversationPhase as Phase,
} from '@/src/features/voice/hooks/useVoiceConversation';

// ---------------------------------------------------------------------------
// Phase state
// ---------------------------------------------------------------------------

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Tap to speak',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
};

const PHASE_SUBLABEL: Record<Phase, string> = {
  idle: 'Voice companion — on-device',
  listening: 'Speak naturally',
  thinking: 'Processing on-device',
  speaking: 'AI is responding',
};

function phaseLabel(phase: Phase, pttMode: boolean): string {
  if (pttMode && phase === 'idle') return 'Hold to talk';
  return PHASE_LABEL[phase];
}

function phaseSublabel(phase: Phase, pttMode: boolean): string {
  if (pttMode && phase === 'listening') return 'Release to send';
  return PHASE_SUBLABEL[phase];
}

// terracotta for all phases (brand colour for voice companion)
const ORB_COLOR = colors.terraCotta;

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

function DarkGradientBg() {
  const { width, height } = useWindowDimensions();
  return (
    <Svg
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0 }}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id="voiceBg" cx="50%" cy="42%" r="55%" fx="50%" fy="42%">
          <Stop offset="0%" stopColor={colors.voiceCompanionBgStart} stopOpacity="1" />
          <Stop offset="45%" stopColor={colors.voiceCompanionBgMid} stopOpacity="1" />
          <Stop offset="100%" stopColor={colors.voiceCompanionBgEnd} stopOpacity="1" />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#voiceBg)" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Pulsing orb
// ---------------------------------------------------------------------------

function TerraCottaOrb({
  phase,
  audioLevel,
  label,
  hint,
  onPress,
  onPressIn,
  onPressOut,
}: {
  phase: Phase;
  audioLevel: number;
  label: string;
  hint: string;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
}) {
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.15);
  // Exponential moving average of the mic level. Raw metering is noisy at
  // ~10-20Hz; feeding it straight into an animation reads as the orb shaking.
  const smoothedLevel = useRef(0);

  // Phase-driven animations. `audioLevel` is deliberately NOT a dependency:
  // including it restarted these withRepeat loops on every metering tick, so
  // the idle and thinking pulses never completed a cycle.
  useEffect(() => {
    if (phase === 'thinking') {
      scale.value = withRepeat(
        withSequence(withTiming(1.18, { duration: 750 }), withTiming(0.92, { duration: 750 })),
        -1,
        true,
      );
      glowOpacity.value = withRepeat(withTiming(0.55, { duration: 750 }), -1, true);
    } else if (phase !== 'listening' && phase !== 'speaking') {
      // idle — gentle slow pulse
      scale.value = withRepeat(
        withSequence(withTiming(1.06, { duration: 2000 }), withTiming(0.97, { duration: 2000 })),
        -1,
        true,
      );
      glowOpacity.value = withRepeat(
        withSequence(withTiming(0.3, { duration: 2000 }), withTiming(0.1, { duration: 2000 })),
        -1,
        true,
      );
    }
  }, [phase, scale, glowOpacity]);

  // Amplitude-reactive animation, only while the mic/playback is actually live.
  useEffect(() => {
    if (phase !== 'listening' && phase !== 'speaking') {
      smoothedLevel.current = 0;
      return;
    }
    // Weight history heavily so single-frame spikes cannot snap the orb.
    smoothedLevel.current = smoothedLevel.current * 0.75 + audioLevel * 0.25;
    const level = smoothedLevel.current;
    // withTiming rather than withSpring: a spring re-targeted every tick never
    // settles, and its overshoot is what made the orb visibly jitter.
    scale.value = withTiming(1 + level * 0.28, { duration: 110, easing: Easing.out(Easing.quad) });
    glowOpacity.value = withTiming(0.25 + level * 0.4, { duration: 110 });
  }, [phase, audioLevel, scale, glowOpacity]);

  const orbStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [{ scale: scale.value * 1.5 }],
  }));

  return (
    <Pressable
      testID="voice-companion-orb"
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityHint={hint}
    >
      <View style={styles.orbWrapper}>
        {/* Outer glow */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 160,
              height: 160,
              borderRadius: 80,
              backgroundColor: ORB_COLOR,
            },
            glowStyle,
          ]}
        />
        {/* Main orb */}
        <Animated.View style={[styles.orb, orbStyle]}>
          <Waveform
            color={colors.white}
            active={phase === 'listening' || phase === 'speaking'}
            audioLevel={audioLevel}
            barCount={5}
            maxHeight={38}
            minHeight={6}
            barWidth={4}
            gap={5}
          />
        </Animated.View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function VoiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const insets = useSafeAreaInsets();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const selectedVoiceId = useSettingsStore((s) => s.selectedVoiceId);
  const speechRate = useSettingsStore((s) => s.speechRate);
  const pttMode = useSettingsStore((s) => s.voicePushToTalk);
  const setVoicePushToTalk = useSettingsStore((s) => s.setVoicePushToTalk);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const createConversation = useChatStore((s) => s.createConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);

  const [lastResponseMs, setLastResponseMs] = useState<number | undefined>(undefined);

  const convIdRef = useRef<string | null>(null);

  // Ensure a conversation is ready for the session
  useEffect(() => {
    createConversation('Voice session')
      .then((id) => {
        convIdRef.current = id;
      })
      .catch(() => {
        // ignore — surfaced as a send failure if it never resolves
      });
  }, [createConversation]);

  const sendVoiceMessage = useCallback(
    async (text: string) => {
      let convId = convIdRef.current;
      if (!convId) {
        // The eager creation in the mount effect failed or hasn't resolved —
        // retry on demand instead of failing the whole voice turn.
        convId = await createConversation('Voice session');
        convIdRef.current = convId;
      }
      const previousMessageIds = createMessageIdSet(useChatStore.getState().messages[convId] ?? []);
      const accepted = await sendMessage(convId, text, selectedModel);
      if (!accepted) {
        // A pre-flight gate blocked the send (sign-in, model/mode mismatch,
        // queue full, …). The store's error is the real reason — throw it so
        // the voice UI shows it instead of a misleading "Sent to chat."
        throw new Error(useChatStore.getState().error ?? 'Message was not sent. Please try again.');
      }
      return findNewAssistantResponse(
        useChatStore.getState().messages[convId] ?? [],
        previousMessageIds,
      );
    },
    [createConversation, sendMessage, selectedModel],
  );

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
    enabled: true,
    pttMode,
    hapticsEnabled,
    sendMessage: sendVoiceMessage,
    speak: (text, callbacks) =>
      VoiceOutput.speak(text, {
        voice: selectedVoiceId ?? undefined,
        rate: speechRate,
        ...callbacks,
      }),
    stopSpeaking: () => VoiceOutput.stop().catch(() => {}),
    onCaptureError: (err) => {
      Alert.alert('Voice unavailable', voiceCaptureErrorMessage(err));
    },
    onSttComplete: (ms) => setLastResponseMs(ms),
  });

  const handlePttToggle = useCallback(() => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVoicePushToTalk(!pttMode);
  }, [hapticsEnabled, pttMode, setVoicePushToTalk]);

  const handleClose = useCallback(() => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    void endConversation();
    if (params.returnTo === '/(app)/settings/voice') {
      router.replace('/(app)/settings/voice' as Parameters<typeof router.replace>[0]);
      return;
    }
    if (router.canGoBack()) router.back();
  }, [hapticsEnabled, endConversation, params.returnTo, router]);

  const modelLabel = getDisplayName(selectedModel);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <DarkGradientBg />

      {/* Close button */}
      <Pressable
        onPress={handleClose}
        style={[styles.closeBtn, { top: insets.top + 10 }]}
        accessibilityLabel="Close voice companion"
        accessibilityRole="button"
      >
        <X size={20} color={colors.textSecondary} />
      </Pressable>

      {/* Main content */}
      <View style={styles.content}>
        <Text style={styles.sublabel}>{phaseSublabel(phase, pttMode)}</Text>

        <TerraCottaOrb
          phase={phase}
          audioLevel={audioLevel}
          label={phaseLabel(phase, pttMode)}
          hint={pttMode ? 'Hold to talk, release to send' : 'Tap to start or stop listening'}
          onPress={pttMode ? undefined : handleOrbPress}
          onPressIn={pttMode ? handleOrbPressIn : undefined}
          onPressOut={pttMode ? handleOrbPressOut : undefined}
        />

        <Text style={[styles.phaseLabel, { color: ORB_COLOR }]}>{phaseLabel(phase, pttMode)}</Text>

        {/* Model badge */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.modelBadge}>
          <Text style={styles.modelLabel}>{modelLabel.toUpperCase()}</Text>
          <Text style={styles.onDeviceBadge}>ON-DEVICE</Text>
        </Animated.View>

        {/* Performance chip */}
        {lastResponseMs !== undefined && (
          <Animated.View entering={FadeIn.duration(300)}>
            <PerformanceChip
              model="on-device STT"
              tier="Tier 2"
              firstTokenLatencyMs={lastResponseMs}
            />
          </Animated.View>
        )}

        {/* Transcript preview */}
        {transcriptPreview ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.transcriptBox}>
            <Text style={styles.transcriptText} numberOfLines={3}>
              {transcriptPreview}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      {/* Bottom controls */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + 20 }]}>
        {/* Mute */}
        <Pressable
          onPress={toggleMute}
          style={[
            styles.controlBtn,
            { backgroundColor: muted ? colors.dangerSurface : colors.voiceControlSurface },
          ]}
          accessibilityLabel={muted ? 'Unmute' : 'Mute microphone'}
          accessibilityRole="button"
        >
          {muted ? (
            <MicOff size={22} color={colors.agentError} />
          ) : (
            <Mic size={22} color={colors.textSecondary} />
          )}
        </Pressable>

        {/* Push-to-talk mode toggle */}
        <Pressable
          testID="voice-companion-ptt-toggle"
          onPress={handlePttToggle}
          style={[
            styles.controlBtn,
            { backgroundColor: pttMode ? colors.purpleSurface : colors.voiceControlSurface },
          ]}
          accessibilityLabel={pttMode ? 'Switch to hands-free mode' : 'Switch to push-to-talk mode'}
          accessibilityRole="button"
          accessibilityState={{ selected: pttMode }}
        >
          <Hand size={22} color={pttMode ? colors.agentThinking : colors.textSecondary} />
        </Pressable>

        {/* TTS indicator — static, shows TTS is always on-device */}
        <View style={styles.controlBtn}>
          <Volume2 size={22} color={colors.terraCotta} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.voiceCompanionBgEnd,
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.voiceControlSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  sublabel: {
    color: colors.textMuted,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  orbWrapper: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.terraCotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseLabel: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  modelBadge: {
    alignItems: 'center',
    gap: 2,
  },
  modelLabel: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  onDeviceBadge: {
    color: colors.terraCotta,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    opacity: 0.7,
  },
  transcriptBox: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: colors.voiceTranscriptSurface,
    borderWidth: 1,
    borderColor: colors.voiceAccentBorder,
    maxWidth: '90%',
  },
  transcriptText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingTop: 8,
  },
  controlBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.voiceControlSurface,
  },
});
