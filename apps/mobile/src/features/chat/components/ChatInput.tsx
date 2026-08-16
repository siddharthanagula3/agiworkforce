import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
} from 'react';
import { Alert, View, TextInput, Pressable, Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Plus,
  AudioLines,
  ArrowUp,
  Maximize2,
  Square,
  X,
  Telescope,
  Terminal,
  Paintbrush,
  Sparkles,
} from 'lucide-react-native';
import {
  canUseBillingPlanCapability,
  getModelMetadataById,
  summarizeSendPreview,
  type SendPreviewInput,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { AttachmentPreview, type Attachment } from './AttachmentPreview';
import { SendPreview } from './SendPreview';
import { validateAttachments } from '@/src/features/chat/utils/attachmentValidation';
import { SendButton } from './SendButton';
import { ComposerFullScreenEditor } from './ComposerFullScreenEditor';
import { ModelSelectorButton } from './ModelSelectorButton';
import { CommandPalette, type ChatCommand } from './CommandPalette';
import { MediaModeChip } from './MediaModeChip';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { exitMediaMode, mediaModelIdForMode } from '@/src/features/chat/actions/mediaMode';
import { VoiceInputButton } from '@/src/features/voice/components/VoiceInputButton';
import { Waveform } from '@/src/features/voice/components/Waveform';
import * as VoiceService from '@/src/features/voice/services/voice';
import * as Haptics from 'expo-haptics';
import { useModelStore } from '@/src/features/model-picker/store';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { useTierStore } from '@/src/features/billing/store';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useTheme, radii } from '@/src/ui/theme';
import { getShortDisplayName } from '@/src/features/model-picker/service';
import { MAX_INPUT_LINES } from '@/lib/constants';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  getDraft,
  setDraft,
  clearDraft,
  type DraftProvenance,
} from '@/src/features/chat/draftStore';
import type { VoiceMeteringEvent } from '@/src/features/voice/services/voice';
import { cleanupVoiceDictation, detectVoiceCommand } from '@agiworkforce/utils/voice';

const LARGE_PASTE_THRESHOLD = 10_000;

const STACK_LAYOUT_MIN_HEIGHT = 34;

function mergeTranscript(previous: string, transcript: string): string {
  const cleanedTranscript = cleanupVoiceDictation(transcript);
  if (!cleanedTranscript) return previous;
  if (detectVoiceCommand(cleanedTranscript)) return cleanedTranscript;
  return previous ? `${previous} ${cleanedTranscript}` : cleanedTranscript;
}

export interface ChatInputHandle {
  addAttachments: (items: Attachment[]) => void;
  focus?: () => void;
}

interface ChatInputProps {
  onSend: (text: string, attachments?: Attachment[]) => void | boolean | Promise<void | boolean>;
  isStreaming?: boolean;
  onStop?: () => void;
  onOpenModelPicker?: () => void;
  onOpenVoiceMode?: () => void;
  onOpenCompare?: () => void;
  onOpenExport?: () => void;
  onOpenAddToChat?: () => void;
  isOnline?: boolean;
  queueSize?: number;
  attachRef?: React.RefObject<ChatInputHandle | null>;
  attachmentPrivacyShortLabel?: string;
  sendPreview?: SendPreviewInput;
  isThreadActive?: boolean;
  initialText?: string;
  draftKey?: string;
  draftProvenance?: DraftProvenance;
  selectedSkillName?: string;
  onClearSelectedSkill?: () => void;
}

export function ChatInput({
  onSend,
  isStreaming,
  onStop,
  onOpenModelPicker,
  onOpenVoiceMode,
  onOpenCompare,
  onOpenExport,
  onOpenAddToChat,
  isOnline = true,
  queueSize = 0,
  attachRef,
  attachmentPrivacyShortLabel,
  sendPreview,
  isThreadActive = false,
  initialText,
  draftKey,
  draftProvenance,
  selectedSkillName,
  onClearSelectedSkill,
}: ChatInputProps) {
  const [text, setText] = useState(() =>
    draftKey && !draftProvenance ? '' : getDraft(draftKey, draftProvenance) || (initialText ?? ''),
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceResetSignal, setVoiceResetSignal] = useState(0);
  const [isMultiline, setIsMultiline] = useState(false);
  const [expandedEditorVisible, setExpandedEditorVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const transcriptionRunRef = useRef(0);
  const sendPendingRef = useRef(false);
  const draftIdentity =
    draftProvenance?.scope === 'cloud'
      ? `${draftKey ?? ''}:cloud:${draftProvenance.ownerId}`
      : `${draftKey ?? ''}:${draftProvenance?.scope ?? 'unowned'}`;
  const previousDraftIdentityRef = useRef(draftIdentity);

  const selectedModel = useModelStore((s) => s.selectedModel);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const chatFeatures = useChatStore((s) => s.features);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const subscriptionTier = useTierStore((s) => s.tier);
  const grantedCapabilities = useTierStore((s) => s.grantedCapabilities);
  const codeExecutionAvailable = useTierStore((s) => s.codeExecutionAvailable);
  const { colors: themeColors } = useTheme();
  const insets = useSafeAreaInsets();

  const modelName = getShortDisplayName(selectedModel, subscriptionTier);
  const selectedModelMetadata = getModelMetadataById(selectedModel);
  const mediaMode = useChatViewStore((s) => s.mediaMode);
  const mediaModelId = mediaModelIdForMode(mediaMode);
  const mediaModelName = mediaModelId
    ? (getModelMetadataById(mediaModelId)?.name ?? mediaModelId)
    : null;
  const handleExitMediaMode = useCallback(() => {
    exitMediaMode();
  }, []);
  const isSignedInCloudChat = appMode === 'cloud' && isClerkSignedIn;
  const researchActive =
    isSignedInCloudChat &&
    FEATURES.research &&
    chatFeatures.research &&
    selectedModelMetadata?.capabilities.research === true &&
    selectedModelMetadata.capabilities.search === true &&
    grantedCapabilities.includes('canUseDeepResearch');
  const codeExecutionActive =
    isSignedInCloudChat &&
    FEATURES.codeExecution &&
    chatFeatures.codeExecution &&
    selectedModelMetadata?.capabilities.codeExecution === true &&
    codeExecutionAvailable &&
    grantedCapabilities.includes('canUseCloudExecution');
  const activeToolStatuses = [
    ...(researchActive
      ? [
          {
            key: 'research',
            label: 'Research',
            accessibilityLabel: 'Deep Research active',
            Icon: Telescope,
          },
        ]
      : []),
    ...(codeExecutionActive
      ? [
          {
            key: 'code',
            label: 'Code',
            accessibilityLabel: 'Code execution active',
            Icon: Terminal,
          },
        ]
      : []),
  ];

  const applyTranscript = useCallback((transcript: string) => {
    if (!cleanupVoiceDictation(transcript)) {
      return;
    }
    setText((prev) => mergeTranscript(prev, transcript));
    inputRef.current?.focus();
  }, []);

  useImperativeHandle(
    attachRef,
    () => ({
      focus: () => {
        inputRef.current?.focus();
      },
      addAttachments: (items: Attachment[]) => {
        const { accepted, rejected } = validateAttachments(items, appMode);
        if (accepted.length > 0) setAttachments((prev) => [...prev, ...accepted]);
        if (rejected.length > 0) {
          Alert.alert(
            rejected.length === 1 ? 'Attachment not added' : 'Some attachments not added',
            rejected.map((r) => r.reason).join('\n'),
          );
        }
      },
    }),
    [appMode],
  );

  useLayoutEffect(() => {
    if (previousDraftIdentityRef.current !== draftIdentity) {
      previousDraftIdentityRef.current = draftIdentity;
      setText(draftKey && !draftProvenance ? '' : getDraft(draftKey, draftProvenance));
      setAttachments([]);
      return;
    }
    if (!draftKey || !draftProvenance) return;
    setDraft(draftKey, text, draftProvenance);
  }, [draftIdentity, draftKey, draftProvenance, text]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const sendComposerMessage = useCallback(
    (sourceText: string) => {
      if (sendPendingRef.current) return;
      const trimmed = sourceText.trim();
      if (!trimmed && attachments.length === 0) return;
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      const pastedBlocks = attachments
        .map((a) => a.pastedText)
        .filter((t): t is string => Boolean(t));
      const fileAttachments = attachments.filter((a) => !a.pastedText);
      const outgoing = [...pastedBlocks, trimmed].filter(Boolean).join('\n\n');

      const sentText = sourceText;
      const sentAttachmentIds = new Set(attachments.map((a) => a.id));
      sendPendingRef.current = true;

      Promise.resolve(onSend(outgoing, fileAttachments.length > 0 ? fileAttachments : undefined))
        .then((accepted) => {
          if (accepted === false) return;
          clearDraft(draftKey, draftProvenance);
          setText((current) => (current === sentText ? '' : current));
          setAttachments((current) => current.filter((a) => !sentAttachmentIds.has(a.id)));
        })
        .catch(() => {
          // Send failed before acceptance — keep the draft.
        })
        .finally(() => {
          sendPendingRef.current = false;
        });
    },
    [attachments, onSend, hapticsEnabled, draftKey, draftProvenance],
  );

  const handleSend = useCallback(() => {
    sendComposerMessage(text);
  }, [sendComposerMessage, text]);

  const handleChangeText = useCallback(
    (next: string) => {
      const inserted = next.length - text.length;
      if (inserted >= LARGE_PASTE_THRESHOLD) {
        let prefix = 0;
        while (prefix < text.length && prefix < next.length && text[prefix] === next[prefix]) {
          prefix++;
        }
        let suffix = 0;
        while (
          suffix < text.length - prefix &&
          suffix < next.length - prefix &&
          text[text.length - 1 - suffix] === next[next.length - 1 - suffix]
        ) {
          suffix++;
        }
        const pasted = next.slice(prefix, next.length - suffix);
        if (pasted.length >= LARGE_PASTE_THRESHOLD) {
          const id = `pasted-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          setAttachments((prev) => [
            ...prev,
            {
              id,
              uri: `pasted-text://${id}`,
              mimeType: 'text/plain',
              fileName: 'Pasted text',
              fileSize: pasted.length,
              pastedText: pasted,
            },
          ]);
          return;
        }
      }
      setText(next);
    },
    [text],
  );

  const handleExpandPastedText = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (!target?.pastedText) return prev;
      const pasted = target.pastedText;
      setText((t) => (t ? `${t}\n\n${pasted}` : pasted));
      return prev.filter((a) => a.id !== id);
    });
    inputRef.current?.focus();
  }, []);

  const handleAttach = useCallback((newAttachments: Attachment[]) => {
    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleTranscription = useCallback(
    (transcribedText: string) => {
      setIsRecording(false);
      setAudioLevel(0);
      applyTranscript(transcribedText);
    },
    [applyTranscript],
  );

  const resetRecordingUi = useCallback(() => {
    setIsRecording(false);
    setAudioLevel(0);
  }, []);

  const handleRecordingStart = useCallback(() => {
    setIsRecording(true);
  }, []);

  const handleRecordingStop = useCallback(() => {
    resetRecordingUi();
  }, [resetRecordingUi]);

  const handleMetering = useCallback((event: VoiceMeteringEvent) => {
    const normalized = Math.max(0, Math.min(1, (event.metering + 60) / 60));
    setAudioLevel(normalized);
  }, []);

  const handleDictationCancel = useCallback(() => {
    transcriptionRunRef.current += 1;
    resetRecordingUi();
    setIsTranscribing(false);
    setVoiceResetSignal((value) => value + 1);
    VoiceService.cancelRecording().catch(() => {
      // ignore cleanup errors
    });
  }, [resetRecordingUi]);

  const finishDictation = useCallback(
    async ({ send }: { send: boolean }) => {
      resetRecordingUi();
      if (!VoiceService.isRecording()) {
        setVoiceResetSignal((value) => value + 1);
        return;
      }
      const run = transcriptionRunRef.current + 1;
      transcriptionRunRef.current = run;
      setIsTranscribing(true);
      try {
        const uri = await VoiceService.stopRecording();
        if (transcriptionRunRef.current !== run) return;
        const result = await VoiceService.transcribe(uri);
        if (transcriptionRunRef.current !== run) return;
        const transcript = result.text.trim();
        if (transcript) {
          if (send) {
            const merged = mergeTranscript(text, transcript);
            setText(merged);
            sendComposerMessage(merged);
          } else {
            applyTranscript(transcript);
          }
        }
      } catch {
        // Transcription failed or was aborted — the composer keeps what it had.
      } finally {
        if (transcriptionRunRef.current === run) {
          setIsTranscribing(false);
          setVoiceResetSignal((value) => value + 1);
        }
      }
    },
    [applyTranscript, resetRecordingUi, sendComposerMessage, text],
  );

  const handleDictationStop = useCallback(() => {
    void finishDictation({ send: false });
  }, [finishDictation]);

  const handleDictationSend = useCallback(() => {
    void finishDictation({ send: true });
  }, [finishDictation]);

  const handleVoiceError = useCallback(
    (message: string) => {
      resetRecordingUi();
      setVoiceResetSignal((value) => value + 1);
      Alert.alert('Voice input unavailable', message);
    },
    [resetRecordingUi],
  );

  useEffect(() => {
    if (text.length === 0) setIsMultiline(false);
  }, [text]);

  const hasContent = text.trim().length > 0 || attachments.length > 0;
  const stacked = isMultiline && !isRecording && !isTranscribing;

  const showCommandPalette = text.startsWith('/') && !isStreaming;

  const availableCommands: ChatCommand[] = [
    ...(FEATURES.imageGen ? (['/image'] as const) : []),
    ...(onOpenVoiceMode ? (['/voice'] as const) : []),
    ...(onOpenCompare ? (['/compare'] as const) : []),
    ...(onOpenExport ? (['/export'] as const) : []),
  ];

  const handleSelectCommand = useCallback(
    (command: ChatCommand) => {
      if (command === '/image') {
        setText('/image ');
        inputRef.current?.focus();
        return;
      }
      setText('');
      if (command === '/voice') onOpenVoiceMode?.();
      if (command === '/compare') onOpenCompare?.();
      if (command === '/export') onOpenExport?.();
    },
    [onOpenCompare, onOpenExport, onOpenVoiceMode],
  );

  const sendButtonState = isStreaming
    ? ('streaming' as const)
    : !isOnline && hasContent
      ? ('queued' as const)
      : ('idle' as const);

  const handleSendButtonPress = useCallback(() => {
    if (isStreaming) {
      onStop?.();
    } else {
      handleSend();
    }
  }, [isStreaming, onStop, handleSend]);

  const handlePlusPress = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Keyboard.dismiss();
    onOpenAddToChat?.();
  }, [hapticsEnabled, onOpenAddToChat]);

  const handleExpandEditor = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpandedEditorVisible(true);
  }, [hapticsEnabled]);

  const handleExpandedSend = useCallback(() => {
    setExpandedEditorVisible(false);
    handleSendButtonPress();
  }, [handleSendButtonPress]);

  const sendPreviewPresentation = useMemo(() => {
    if (!sendPreview) return undefined;
    return summarizeSendPreview({
      ...sendPreview,
      messageBody: text,
      attachmentCount: attachments.length,
      attachmentSummaries: attachments.map((item) => ({
        name: item.fileName,
        mimeType: item.mimeType,
      })),
    });
  }, [sendPreview, text, attachments]);

  const queueLabel = queueSize > 0 ? ` (${queueSize} queued)` : '';
  const placeholder = isStreaming
    ? `Reply to ${modelName}...`
    : !isOnline
      ? `Offline — message will send on reconnect${queueLabel}`
      :
        mediaMode === 'image'
        ? 'Describe the image to create'
        : mediaMode === 'video'
          ? 'Describe the video to create'
          : isThreadActive
            ? 'Reply to AGI'
            : "What's on your mind?";

  return (
    <View
      className="px-4 pt-2"
      style={{ paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom + 6, 16) }}
    >
      {/* "What will be sent" disclosure — the destination stays visible above
          the composer before every send, and expands to the full payload
          explanation on demand. Mirrors the web composer's compact SendPreview
          (ChatComposerNew.tsx). Hidden during voice capture, where the row
          below morphs into the recording UI and there is no draft to describe. */}
      {sendPreviewPresentation && !isRecording && !isTranscribing ? (
        <SendPreview presentation={sendPreviewPresentation} variant="compact" />
      ) : null}

      {/* Media mode is a MODEL swap, so it needs a standing indicator and an
          explicit exit — otherwise the next text question silently goes to an
          image/video model. Hidden during capture for the same reason as the
          disclosure above. */}
      {mediaMode !== 'text' && !isRecording && !isTranscribing ? (
        <MediaModeChip mode={mediaMode} modelName={mediaModelName} onExit={handleExitMediaMode} />
      ) : null}

      {selectedSkillName && !isRecording && !isTranscribing ? (
        <View
          accessible
          accessibilityLabel={`Skill ${selectedSkillName} selected for the next Cloud message`}
          testID="chat.composer.skill"
          style={{
            minHeight: 32,
            marginBottom: 8,
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingLeft: 10,
            paddingRight: 4,
            borderRadius: radii.full,
            borderWidth: 1,
            borderColor: themeColors.accentBorder,
            backgroundColor: themeColors.accentSurface,
          }}
        >
          <Sparkles size={13} color={themeColors.teal} />
          <Text
            numberOfLines={1}
            style={{ maxWidth: 220, color: themeColors.textSecondary, fontSize: 12 }}
          >
            {selectedSkillName}
          </Text>
          <Pressable
            onPress={onClearSelectedSkill}
            accessibilityRole="button"
            accessibilityLabel="Clear selected Skill"
            hitSlop={8}
            style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={14} color={themeColors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {/* Attachment preview strip */}
      <AttachmentPreview
        attachments={attachments}
        onRemove={handleRemoveAttachment}
        onExpandPastedText={handleExpandPastedText}
        privacyShortLabel={attachmentPrivacyShortLabel}
      />

      {/* Command palette -- shown when input starts with "/" */}
      <CommandPalette
        visible={showCommandPalette}
        query={text}
        availableCommands={availableCommands}
        onSelectCommand={handleSelectCommand}
      />

      {/* Model and Connectors live in the "+" sheet (AddToChatSheet), not as a
          secondary chip row above the composer -- founder decision 2026-07-29.
          Connectors was already in that sheet, so the old row duplicated it. */}
      {activeToolStatuses.length > 0 && !isRecording && !isTranscribing ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
            marginBottom: 8,
          }}
          accessibilityLabel="Active chat tools"
        >
          {activeToolStatuses.map(({ key, label, accessibilityLabel, Icon }) => (
            <View
              key={key}
              accessible
              accessibilityLabel={accessibilityLabel}
              style={{
                minHeight: 24,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                borderRadius: radii.full,
                borderWidth: 1,
                borderColor: themeColors.accentBorder,
                backgroundColor: themeColors.accentSurface,
              }}
            >
              <Icon size={12} color={themeColors.teal} strokeWidth={1.8} />
              <Text
                style={{
                  color: themeColors.textSecondary,
                  fontSize: 11,
                  lineHeight: 14,
                  fontWeight: '500',
                  includeFontPadding: false,
                }}
              >
                {label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Main composer row -- [+] outside-left, single-line pill with the
          mic inside its right edge, circular send/stop/voice button
          outside-right. Matches the ChatGPT mobile composer structure.
          While dictating, the SAME row morphs in place into the reference's
          four controls (IMG_0686): cancel (X), a live waveform, a stop square,
          and an outboard send arrow. Nothing overlays the composer. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: stacked ? 'flex-end' : 'center',
          gap: 8,
        }}
      >
        {/* Left button -- [+] Add to Chat, or cancel-dictation while recording.
            While stacked it moves inside the card, onto the controls row.
            Cancel is enabled for the WHOLE dictation, transcribing included
            (IMG_0687): it was previously disabled the moment capture stopped,
            which stranded a mis-heard long dictation with no way out. */}
        {stacked ? null : isRecording || isTranscribing ? (
          <Pressable
            onPress={handleDictationCancel}
            style={{
              width: 40,
              height: 40,
              borderRadius: radii.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: themeColors.inputSurface,
            }}
            hitSlop={6}
            testID="chat.composer.dictation-cancel"
            accessibilityLabel="Cancel recording"
            accessibilityHint="Discards the dictation without adding it to the message"
            accessibilityRole="button"
          >
            <X size={20} color={themeColors.textPrimary} />
          </Pressable>
        ) : null}

        {/* Pill -- text input + mic, inside the rounded border. When stacked it
            becomes a card: square-ish corners, text on its own full-width row,
            and a controls row underneath. */}
        <View
          style={{
            flex: 1,
            flexDirection: stacked ? 'column' : 'row',
            alignItems: stacked ? 'stretch' : 'center',
            backgroundColor: themeColors.surfaceElevated,
            borderRadius: stacked ? radii['2xl'] : radii.full,
            borderWidth: 1,
            borderColor: themeColors.composerBorder,
            paddingLeft: stacked ? 16 : 6,
            paddingRight: stacked ? 10 : 6,
            paddingVertical: stacked ? 10 : 4,
            minHeight: 44,
          }}
        >
          {/* Expand to a full-screen editor. Pinned inside the card's top-right
              corner and shown only while stacked, matching the reference's
              appearance threshold (IMG_0672) — a one-line pill has nothing to
              expand. The stacked TextInput reserves room for it on the right so
              the first line never runs underneath the glyph. */}
          {stacked ? (
            <Pressable
              onPress={handleExpandEditor}
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 28,
                height: 28,
                borderRadius: radii.full,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              hitSlop={10}
              testID="chat.composer.expand"
              accessibilityLabel="Expand message"
              accessibilityHint="Opens the message in a full-screen editor"
              accessibilityRole="button"
            >
              <Maximize2 size={16} color={themeColors.textMuted} />
            </Pressable>
          ) : null}

          {/* [+] sits INSIDE the pill on the left, matching ChatGPT
              (IMG_0674, references-2/voice-03). It previously sat outside as a
              separate 40pt circle, which is Claude's arrangement, not
              ChatGPT's — and the founder chose ChatGPT style. Hidden while the
              pill is showing recording/transcribing state, and while stacked,
              where the plus moves to the controls row beneath the text. */}
          {!stacked && !isRecording && !isTranscribing ? (
            <Pressable
              testID="chat.composer.plus"
              onPress={handlePlusPress}
              style={{
                width: 32,
                height: 32,
                borderRadius: radii.full,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              hitSlop={8}
              accessibilityLabel="Add to chat"
              accessibilityHint="Opens attachment, mode, and feature options"
              accessibilityRole="button"
            >
              <Plus size={20} color={themeColors.textMuted} />
            </Pressable>
          ) : null}

          {/* Dictation state, in place of the input: one live waveform that
              FREEZES while the recognizer resolves the transcript. It replaces
              the old spinner-plus-timer pair — the reference row carries
              neither a clock nor a second moving indicator (IMG_0686/0687), and
              the frozen bars already say capture has ended. The label stays for
              a truthful "still working" signal, muted and text-only. */}
          {isRecording || isTranscribing ? (
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                minHeight: 24,
              }}
              accessibilityRole="alert"
              accessibilityLabel={isRecording ? 'Recording in progress' : 'Transcribing'}
              testID={isRecording ? 'chat.composer.recording' : 'chat.composer.transcribing'}
            >
              <View style={{ flex: 1, alignItems: 'flex-start', overflow: 'hidden' }}>
                <Waveform
                  color={isRecording ? themeColors.textSecondary : themeColors.textMuted}
                  active={isRecording}
                  audioLevel={audioLevel}
                  barCount={isRecording ? 18 : 10}
                  maxHeight={20}
                  minHeight={3}
                  barWidth={2.5}
                  gap={3}
                />
              </View>
              {isTranscribing ? (
                <Text numberOfLines={1} style={{ color: themeColors.textMuted, fontSize: 13 }}>
                  Transcribing
                </Text>
              ) : null}
            </View>
          ) : null}

          <TextInput
            ref={inputRef}
            testID="chat.composer.input"
            style={{
              ...(stacked ? { alignSelf: 'stretch', paddingRight: 28 } : { flex: 1 }),
              color: themeColors.textPrimary,
              fontSize: 15,
              paddingVertical: 0,
              minHeight: 24,
              maxHeight: 160,
              display: isRecording || isTranscribing ? 'none' : 'flex',
            }}
            placeholder={placeholder}
            placeholderTextColor={themeColors.textMuted}
            value={text}
            onChangeText={handleChangeText}
            onContentSizeChange={(event) => {
              if (event.nativeEvent.contentSize.height > STACK_LAYOUT_MIN_HEIGHT) {
                setIsMultiline(true);
              }
            }}
            multiline
            numberOfLines={MAX_INPUT_LINES}
            selectionColor={themeColors.teal}
            returnKeyType="default"
            blurOnSubmit={false}
            accessible={true}
            accessibilityLabel="Message input"
            accessibilityHint="Type your message to the AI assistant"
          />

          {/* Kept mounted while recording -- VoiceInputButton owns the live
              capture session; unmounting it mid-recording would kill it. That
              also rules out moving it between parents when the layout stacks,
              so the controls row below re-parents nothing: this wrapper simply
              becomes a full-width row that hosts [+] alongside the mic. */}
          <View
            testID="chat.composer.mic"
            style={{
              display: isRecording || isTranscribing ? 'none' : 'flex',
              ...(stacked
                ? {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 8,
                    marginLeft: -6,
                  }
                : null),
            }}
          >
            {stacked ? (
              <>
                <Pressable
                  testID="chat.composer.plus.stacked"
                  onPress={handlePlusPress}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: radii.full,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: themeColors.inputSurface,
                  }}
                  hitSlop={6}
                  accessibilityLabel="Add to chat"
                  accessibilityHint="Opens attachment, mode, and feature options"
                  accessibilityRole="button"
                >
                  <Plus size={18} color={themeColors.textMuted} />
                </Pressable>
                {/* The model answering this chat, on the control row beside [+]
                    — Claude's arrangement (IMG_0730); ChatGPT puts the same
                    text-only label next to the mic (IMG_0689). It lives here
                    rather than in a chip row above the composer, which the
                    founder rejected on 2026-07-29, and rather than in the
                    compact pill, where it would eat the single-line input's
                    width — the exact complaint the restack fixed. */}
                {/* Hidden in a media mode: the model is fixed by the registry
                    slot for that output kind, so a picker here would imply a
                    choice that does not apply to this turn. The MediaModeChip
                    above names the model instead. */}
                {onOpenModelPicker && mediaMode === 'text' ? (
                  <ModelSelectorButton onPress={onOpenModelPicker} />
                ) : null}
                <View style={{ flex: 1 }} />
              </>
            ) : null}
            <VoiceInputButton
              onTranscription={handleTranscription}
              onRecordingStart={handleRecordingStart}
              onRecordingStop={handleRecordingStop}
              onMetering={handleMetering}
              onLongPress={onOpenVoiceMode}
              onError={handleVoiceError}
              resetSignal={voiceResetSignal}
              disabled={isStreaming}
            />
          </View>
        </View>

        {/* Right controls -- while dictating this is a PAIR, the second half of
            the reference's four-control row (IMG_0686). The stop square ends
            capture and drops the transcript into the composer for review; the
            outboard arrow stops, transcribes and SENDS in one tap, so a spoken
            message no longer needs a stop-then-review-then-send round trip.
            Both dim while the transcript resolves; cancel (left) stays live. */}
        {isRecording || isTranscribing ? (
          <>
            <Pressable
              onPress={isRecording ? handleDictationStop : undefined}
              disabled={!isRecording}
              style={{
                width: 40,
                height: 40,
                borderRadius: radii.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: themeColors.inputSurface,
                opacity: isRecording ? 1 : 0.5,
              }}
              hitSlop={6}
              testID="chat.composer.dictation-stop"
              accessibilityLabel="Stop recording"
              accessibilityHint="Stops recording and transcribes it into the message"
              accessibilityRole="button"
            >
              {/* A stop square, not a send arrow. This control ends capture and
                  drops the transcript into the composer for review — it does not
                  send. Drawn as an up-arrow it read as "send", so the row looked
                  like it offered only cancel-or-send and users could not find a
                  way to stop. ChatGPT shows a stop square in the same slot. */}
              <Square size={14} color={themeColors.textPrimary} fill={themeColors.textPrimary} />
            </Pressable>
            <Pressable
              onPress={isRecording ? handleDictationSend : undefined}
              disabled={!isRecording}
              style={{
                width: 40,
                height: 40,
                borderRadius: radii.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: themeColors.textPrimary,
                opacity: isRecording ? 1 : 0.5,
              }}
              hitSlop={6}
              testID="chat.composer.dictation-send"
              accessibilityLabel="Send recording"
              accessibilityHint="Stops recording, transcribes it, and sends the message"
              accessibilityRole="button"
            >
              <ArrowUp size={18} color={themeColors.surfaceElevated} />
            </Pressable>
          </>
        ) : (
          <View testID="chat.composer.send">
            {sendButtonState === 'idle' && !hasContent && onOpenVoiceMode ? (
              <Pressable
                onPress={onOpenVoiceMode}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radii.full,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: themeColors.textPrimary,
                }}
                hitSlop={6}
                accessibilityLabel="Start voice mode"
                accessibilityHint="Opens hands-free voice conversation"
                accessibilityRole="button"
              >
                <AudioLines size={18} color={themeColors.surfaceElevated} />
              </Pressable>
            ) : (
              <SendButton
                state={sendButtonState}
                onPress={handleSendButtonPress}
                disabled={!hasContent && !isStreaming}
              />
            )}
          </View>
        )}
      </View>

      {/* Full-screen editing of the same draft. Rendered from the composer (not
          the screen) so it shares this component's text state, send handler and
          large-paste behaviour with no plumbing through the host. */}
      <ComposerFullScreenEditor
        visible={expandedEditorVisible}
        value={text}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        sendState={sendButtonState}
        canSend={hasContent || isStreaming === true}
        onClose={() => setExpandedEditorVisible(false)}
        onSend={handleExpandedSend}
      />
    </View>
  );
}
