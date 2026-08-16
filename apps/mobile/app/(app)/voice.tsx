
import { useState, useCallback, useEffect, useRef } from 'react';
import { Alert, View, Pressable, StatusBar, useWindowDimensions, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { X, MicOff, Mic, Volume2, Hand } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { VoiceOrb } from '@/src/features/voice/components/VoiceOrb';
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

const PHASE_LABEL_COLOR = colors.terraCotta;

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

function CompanionOrb({
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
        <VoiceOrb phase={phase} audioLevel={audioLevel} size={120} glow />
      </View>
    </Pressable>
  );
}

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
        convId = await createConversation('Voice session');
        convIdRef.current = convId;
      }
      const previousMessageIds = createMessageIdSet(useChatStore.getState().messages[convId] ?? []);
      const accepted = await sendMessage(convId, text, selectedModel);
      if (!accepted) {
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

        <CompanionOrb
          phase={phase}
          audioLevel={audioLevel}
          label={phaseLabel(phase, pttMode)}
          hint={pttMode ? 'Hold to talk, release to send' : 'Tap to start or stop listening'}
          onPress={pttMode ? undefined : handleOrbPress}
          onPressIn={pttMode ? handleOrbPressIn : undefined}
          onPressOut={pttMode ? handleOrbPressOut : undefined}
        />

        <Text style={[styles.phaseLabel, { color: PHASE_LABEL_COLOR }]}>
          {phaseLabel(phase, pttMode)}
        </Text>

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
