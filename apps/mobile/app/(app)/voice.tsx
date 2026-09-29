import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Alert,
  View,
  StatusBar,
  useWindowDimensions,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
} from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { ArrowUp, X, MicOff, Mic, Volume2, Hand } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { VoiceOrb } from '@/src/features/voice/components/VoiceOrb';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import { DEFAULT_LOCAL_MODEL_ID } from '@/src/features/model-picker/service';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useTierStore } from '@/src/features/billing/store';
import { resolveNewConversationModel } from '@/src/features/chat/utils/newConversationModel';
import { useSettingsStore } from '@/stores/settingsStore';
import * as VoiceOutput from '@/src/features/voice/services/voiceOutput';
import { VoiceCaptureError, transcribeAudioFile } from '@/src/features/voice/services/voiceInput';
import { showVoicePermissionAlert } from '@/src/features/voice/components/voicePermissionAlert';
import { activeSpeechLanguage, speechSettings } from '@/src/features/voice/services/speechSettings';
import { colors, motion, zIndex } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { CapabilityUnavailable, useCapability } from '@/src/lib/capabilities';
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
  idle: 'Speech stays on this device',
  listening: 'Speak naturally',
  thinking: '',
  speaking: 'AI is responding',
};

function phaseLabel(phase: Phase, pttMode: boolean): string {
  if (pttMode && phase === 'idle') return 'Hold to talk';
  return PHASE_LABEL[phase];
}

// Speech in and out is on-device; the reply comes from whichever model is
// selected, so the label follows that model rather than claiming either one.
function phaseSublabel(phase: Phase, pttMode: boolean, cloudModel: boolean): string {
  if (pttMode && phase === 'listening') return 'Release to send';
  if (phase === 'thinking') return cloudModel ? 'Sending to AGI Cloud' : 'Answering on this device';
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
    <PressableBox
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
    </PressableBox>
  );
}

export default function VoiceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string; audioUri?: string }>();
  const insets = useSafeAreaInsets();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const voiceAllowed = useCapability('canUseVoice');
  const voiceInputEnabled = useSettingsStore((s) => s.voiceEnabled) && voiceAllowed;
  const pttMode = useSettingsStore((s) => s.voicePushToTalk);
  const setVoicePushToTalk = useSettingsStore((s) => s.setVoicePushToTalk);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const subscriptionTier = useTierStore((s) => s.tier);
  const installedModelIds = useModelInstallStore((s) => s.installedModelIds);
  const readySystemModelIds = useModelInstallStore((s) => s.readySystemModelIds);
  const defaultLocalModelDownloading = useModelInstallStore(
    (s) => s.jobs[DEFAULT_LOCAL_MODEL_ID]?.status === 'downloading',
  );
  const modelForSend = resolveNewConversationModel({
    selectedModel,
    mode: appMode,
    subscriptionTier,
    installedModelIds,
    readySystemModelIds,
    defaultLocalModelDownloading,
  });
  const createConversation = useChatStore((s) => s.createConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const sessionMessages = useChatStore((s) => (conversationId ? s.messages[conversationId] : null));
  const visibleSessionMessages = sessionMessages?.filter(
    (message) =>
      (message.role === 'user' || message.role === 'assistant') && message.content.trim(),
  );

  const [lastResponseMs, setLastResponseMs] = useState<number | undefined>(undefined);
  const [fileTranscription, setFileTranscription] = useState<string | null>(null);
  const [fileSendError, setFileSendError] = useState(false);
  const [retryingFileSend, setRetryingFileSend] = useState(false);
  const [typedDraft, setTypedDraft] = useState('');
  const [sendingTyped, setSendingTyped] = useState(false);
  const [typedError, setTypedError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);

  const conversationPromiseRef = useRef<Promise<string> | null>(null);
  const transcribedUriRef = useRef<string | null>(null);

  const getConversationId = useCallback(() => {
    if (!conversationPromiseRef.current) {
      conversationPromiseRef.current = createConversation('Voice session')
        .then((id) => {
          setConversationId(id);
          return id;
        })
        .catch((error: unknown) => {
          conversationPromiseRef.current = null;
          throw error;
        });
    }
    return conversationPromiseRef.current;
  }, [createConversation]);

  const sendVoiceMessage = useCallback(
    async (text: string) => {
      if (!modelForSend) throw new Error('No model is available for this voice session.');
      const convId = await getConversationId();
      const previousMessageIds = createMessageIdSet(useChatStore.getState().messages[convId] ?? []);
      const accepted = await sendMessage(convId, text, modelForSend);
      if (!accepted) {
        throw new Error(useChatStore.getState().error ?? 'Message was not sent. Please try again.');
      }
      return findNewAssistantResponse(
        useChatStore.getState().messages[convId] ?? [],
        previousMessageIds,
      );
    },
    [getConversationId, modelForSend, sendMessage],
  );

  const {
    phase,
    muted,
    audioLevel,
    transcriptPreview,
    submitText,
    handleOrbPress,
    handleOrbPressIn,
    handleOrbPressOut,
    toggleMute,
    endConversation,
  } = useVoiceConversation({
    enabled: voiceAllowed,
    pttMode,
    hapticsEnabled,
    sendMessage: sendVoiceMessage,
    speak: (text, callbacks) => VoiceOutput.speak(text, { ...speechSettings(), ...callbacks }),
    stopSpeaking: () => VoiceOutput.stop().catch(() => {}),
    onCaptureError: (err) => {
      const message = voiceCaptureErrorMessage(err);
      if (err instanceof VoiceCaptureError && err.code === 'mic-permission-denied') {
        showVoicePermissionAlert(message);
      } else {
        Alert.alert('Voice unavailable', message);
      }
    },
    onSttComplete: (ms) => setLastResponseMs(ms),
  });
  const currentPreview = transcriptPreview || fileTranscription;
  const showCurrentPreview =
    currentPreview &&
    !visibleSessionMessages?.some(
      (message) => message.role === 'user' && message.content.trim() === currentPreview.trim(),
    );

  // "Transcribe with AGI" hands over a recording; transcribe that file and send
  // it as the first turn instead of opening a microphone the user did not ask for.
  useEffect(() => {
    const audioUri = params.audioUri;
    if (!voiceAllowed || !audioUri || transcribedUriRef.current === audioUri) return;
    transcribedUriRef.current = audioUri;
    setFileSendError(false);
    setFileTranscription('Transcribing the recording…');
    transcribeAudioFile(audioUri, { lang: activeSpeechLanguage() })
      .then(async ({ text }) => {
        const trimmed = text.trim();
        if (!trimmed) {
          setFileTranscription('No speech was found in that recording.');
          return;
        }
        setFileTranscription(trimmed);
        await sendVoiceMessage(trimmed).catch(() => {
          setFileSendError(true);
        });
      })
      .catch((err: unknown) => {
        setFileTranscription(voiceCaptureErrorMessage(err));
      });
  }, [params.audioUri, sendVoiceMessage, voiceAllowed]);

  const handleRetryFileSend = useCallback(async () => {
    if (!fileTranscription || retryingFileSend) return;
    setRetryingFileSend(true);
    try {
      await sendVoiceMessage(fileTranscription);
      setFileSendError(false);
    } catch {
      setFileSendError(true);
    } finally {
      setRetryingFileSend(false);
    }
  }, [fileTranscription, retryingFileSend, sendVoiceMessage]);

  const handlePttToggle = useCallback(() => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVoicePushToTalk(!pttMode);
  }, [hapticsEnabled, pttMode, setVoicePushToTalk]);

  const handleSendTyped = useCallback(async () => {
    const text = typedDraft.trim();
    if (!text || sendingTyped) return;
    setSendingTyped(true);
    setTypedError(null);
    setTypedDraft('');
    try {
      if (!(await submitText(text))) {
        setTypedDraft(text);
        setTypedError('Message was not sent. Try again.');
      }
    } catch {
      setTypedDraft(text);
      setTypedError('Message was not sent. Try again.');
    } finally {
      setSendingTyped(false);
    }
  }, [sendingTyped, submitText, typedDraft]);

  const handleClose = useCallback(() => {
    if (hapticsEnabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    void endConversation();
    if (params.returnTo === '/(app)/settings/voice') {
      router.replace('/(app)/settings/voice' as Parameters<typeof router.replace>[0]);
      return;
    }
    if (router.canGoBack()) router.back();
  }, [hapticsEnabled, endConversation, params.returnTo, router]);

  const modelLabel = modelForSend ? getDisplayName(modelForSend) : 'Unavailable';
  const isCloudModel = appMode === 'cloud';

  if (!voiceAllowed) {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <CapabilityUnavailable label="Voice mode" onDismiss={handleClose} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <DarkGradientBg />

      {/* Close button */}
      <PressableBox
        onPress={handleClose}
        style={[styles.closeBtn, { top: insets.top + 10 }]}
        accessibilityLabel="Close voice companion"
        accessibilityRole="button"
      >
        <X size={20} color={colors.textSecondary} />
      </PressableBox>

      <KeyboardAvoidingView
        style={styles.keyboardContent}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Main content */}
        <View style={styles.content}>
          <Text style={styles.sublabel}>{phaseSublabel(phase, pttMode, isCloudModel)}</Text>

          {!isTyping ? (
            <CompanionOrb
              phase={phase}
              audioLevel={audioLevel}
              label={voiceInputEnabled ? phaseLabel(phase, pttMode) : 'Voice Input is off'}
              hint={
                voiceInputEnabled
                  ? pttMode
                    ? 'Hold to talk, release to send'
                    : 'Tap to start or stop listening'
                  : 'Turn Voice Input on in Settings, Voice'
              }
              onPress={!voiceInputEnabled || pttMode ? undefined : handleOrbPress}
              onPressIn={voiceInputEnabled && pttMode ? handleOrbPressIn : undefined}
              onPressOut={voiceInputEnabled && pttMode ? handleOrbPressOut : undefined}
            />
          ) : null}

          <Text style={[styles.phaseLabel, { color: PHASE_LABEL_COLOR }]}>
            {voiceInputEnabled ? phaseLabel(phase, pttMode) : 'Voice Input is off'}
          </Text>

          {!voiceInputEnabled ? (
            <Text testID="voice-input-disabled-notice" style={styles.sublabel}>
              Turn Voice Input on in Settings, Voice to speak to AGI.
            </Text>
          ) : null}

          {/* Model badge */}
          <Animated.View entering={FadeIn.duration(motion.moved)} style={styles.modelBadge}>
            <Text style={styles.modelLabel}>{modelLabel.toUpperCase()}</Text>
            <Text testID="voice-processing-badge" style={styles.onDeviceBadge}>
              {isCloudModel ? 'REPLIES FROM AGI CLOUD' : 'ON-DEVICE'}
            </Text>
          </Animated.View>

          {/* Transcription latency, only for a capture the user chose to stop */}
          {lastResponseMs !== undefined && (
            <Animated.View entering={FadeIn.duration(motion.moved)}>
              <Text testID="voice-stt-latency" style={styles.latencyLabel}>
                {`Transcribed in ${lastResponseMs} ms`}
              </Text>
            </Animated.View>
          )}

          {visibleSessionMessages?.length || showCurrentPreview ? (
            <Animated.View entering={FadeIn.duration(motion.quick)} style={styles.transcriptBox}>
              <ScrollView
                testID="voice-session-transcript"
                style={styles.transcriptScroll}
                contentContainerStyle={styles.transcriptContent}
                showsVerticalScrollIndicator
              >
                {visibleSessionMessages?.map((message) => (
                  <View key={message.id} style={styles.transcriptTurn}>
                    <Text style={styles.transcriptSpeaker}>
                      {message.role === 'user' ? 'You' : 'AGI'}
                    </Text>
                    <Text style={styles.transcriptText}>{message.content}</Text>
                  </View>
                ))}
                {showCurrentPreview ? (
                  <Text testID="voice-transcript-preview" style={styles.transcriptText}>
                    {currentPreview}
                  </Text>
                ) : null}
              </ScrollView>
              {fileSendError ? (
                <>
                  <Text style={styles.fileSendError}>
                    The recording was transcribed, but could not be sent.
                  </Text>
                  <PressableBox
                    onPress={() => void handleRetryFileSend()}
                    disabled={retryingFileSend}
                    accessibilityRole="button"
                    accessibilityLabel="Retry sending transcription"
                    style={styles.retryFileSend}
                  >
                    <Text style={styles.retryFileSendText}>
                      {retryingFileSend ? 'Sending…' : 'Retry sending'}
                    </Text>
                  </PressableBox>
                </>
              ) : null}
            </Animated.View>
          ) : null}
        </View>

        <View style={styles.composer}>
          <TextInput
            value={typedDraft}
            onChangeText={(text) => {
              setTypedDraft(text);
              setTypedError(null);
            }}
            onFocus={() => setIsTyping(true)}
            onBlur={() => setIsTyping(false)}
            onSubmitEditing={() => void handleSendTyped()}
            placeholder="Type a message"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Type a message"
            autoCorrect
            multiline={false}
            returnKeyType="send"
            editable={!sendingTyped}
            style={styles.composerInput}
          />
          <PressableBox
            onPress={() => void handleSendTyped()}
            disabled={!typedDraft.trim() || sendingTyped}
            accessibilityRole="button"
            accessibilityLabel="Send typed message"
            accessibilityState={{ disabled: !typedDraft.trim() || sendingTyped }}
            style={[styles.sendButton, (!typedDraft.trim() || sendingTyped) && styles.sendDisabled]}
          >
            <ArrowUp size={20} color={colors.voiceCompanionBgEnd} />
          </PressableBox>
        </View>
        {typedError ? (
          <Text accessibilityLiveRegion="polite" style={styles.typedError}>
            {typedError}
          </Text>
        ) : null}

        {/* Bottom controls */}
        {!isTyping ? (
          <View style={[styles.controls, { paddingBottom: insets.bottom + 20 }]}>
            {/* Mute */}
            <PressableBox
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
            </PressableBox>

            {/* Push-to-talk mode toggle */}
            <PressableBox
              testID="voice-companion-ptt-toggle"
              onPress={handlePttToggle}
              style={[
                styles.controlBtn,
                { backgroundColor: pttMode ? colors.purpleSurface : colors.voiceControlSurface },
              ]}
              accessibilityLabel={
                pttMode ? 'Switch to hands-free mode' : 'Switch to push-to-talk mode'
              }
              accessibilityRole="button"
              accessibilityState={{ selected: pttMode }}
            >
              <Hand size={22} color={pttMode ? colors.agentThinking : colors.textSecondary} />
            </PressableBox>

            {/* TTS indicator, static, shows TTS is always on-device */}
            <View style={styles.controlBtn}>
              <Volume2 size={22} color={colors.terraCotta} />
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.voiceCompanionBgEnd,
  },
  keyboardContent: {
    flex: 1,
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    zIndex: zIndex.control,
    width: 44,
    height: 44,
    borderRadius: 22,
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
    fontSize: typeScale.footnote,
    letterSpacing: 0.3,
  },
  orbWrapper: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseLabel: {
    fontSize: typeScale.title3,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  modelBadge: {
    alignItems: 'center',
    gap: 2,
  },
  modelLabel: {
    color: colors.textMuted,
    fontSize: typeScale.caption,
    letterSpacing: 1.2,
  },
  latencyLabel: {
    color: colors.textMuted,
    fontSize: typeScale.caption,
  },
  onDeviceBadge: {
    color: colors.terraCotta,
    fontSize: typeScale.caption,
    fontWeight: '700',
    letterSpacing: 1.4,
    opacity: 0.7,
  },
  transcriptBox: {
    marginTop: 4,
    borderRadius: 14,
    backgroundColor: colors.voiceTranscriptSurface,
    borderWidth: 1,
    borderColor: colors.voiceAccentBorder,
    width: '100%',
  },
  transcriptScroll: {
    flexGrow: 0,
    maxHeight: 220,
  },
  transcriptContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  transcriptTurn: {
    gap: 3,
  },
  transcriptSpeaker: {
    color: colors.terraCotta,
    fontSize: typeScale.caption,
    fontWeight: '700',
  },
  transcriptText: {
    color: colors.textSecondary,
    fontSize: typeScale.footnote,
    lineHeight: 20,
  },
  fileSendError: {
    color: colors.agentError,
    fontSize: typeScale.caption,
    textAlign: 'center',
    marginTop: 8,
  },
  retryFileSend: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  retryFileSendText: {
    color: colors.textPrimary,
    fontSize: typeScale.footnote,
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingTop: 8,
  },
  composer: {
    minHeight: 52,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingLeft: 16,
    paddingRight: 6,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.voiceAccentBorder,
    backgroundColor: colors.voiceControlSurface,
    flexDirection: 'row',
    alignItems: 'center',
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    color: colors.textPrimary,
    fontSize: typeScale.callout,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.textPrimary,
  },
  sendDisabled: {
    opacity: 0.4,
  },
  typedError: {
    color: colors.agentError,
    fontSize: typeScale.footnote,
    marginHorizontal: 28,
    marginBottom: 8,
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
