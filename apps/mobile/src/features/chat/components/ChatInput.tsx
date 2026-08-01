import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  View,
  TextInput,
  Pressable,
  Keyboard,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Plus,
  AudioLines,
  ArrowUp,
  Square,
  X,
  Telescope,
  Terminal,
  Paintbrush,
} from 'lucide-react-native';
import { canUseBillingPlanCapability, getModelMetadataById } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { AttachmentPreview, type Attachment } from './AttachmentPreview';
import { validateAttachments } from '@/src/features/chat/utils/attachmentValidation';
import { SendButton } from './SendButton';
import { CommandPalette, type ChatCommand } from './CommandPalette';
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
import { formatClock } from '@/src/lib/time';

/** A single text insertion at least this large (a paste, never typing) is
 *  converted into a compact "Pasted text" attachment instead of flooding the
 *  composer — matching ChatGPT/Claude mobile. */
const LARGE_PASTE_THRESHOLD = 10_000;

interface ChatInputProps {
  /**
   * Send handler. May return (a promise of) a boolean: `false` means the send
   * was REJECTED by a pre-flight gate (auth, egress, upload consent…) and the
   * composer keeps the draft; anything else means the message was accepted
   * and the draft clears. The composer never clears optimistically on tap.
   */
  onSend: (text: string, attachments?: Attachment[]) => void | boolean | Promise<void | boolean>;
  isStreaming?: boolean;
  onStop?: () => void;
  onOpenModelPicker?: () => void;
  onOpenVoiceMode?: () => void;
  onOpenCompare?: () => void;
  onOpenExport?: () => void;
  onOpenAddToChat?: () => void;
  /** When false, send button shows queued state and placeholder reflects offline status */
  isOnline?: boolean;
  /** Number of messages currently waiting in the offline queue */
  queueSize?: number;
  /** Ref to imperatively add attachments from outside (e.g. AddToChatSheet pickers) */
  attachRef?: React.RefObject<{ addAttachments: (items: Attachment[]) => void } | null>;
  /**
   * Per-file privacy label rendered as a chip on attachment thumbnails.
   * Sourced from the host's SendPreviewPresentation. PLAN.md section 5:
   * "Add per-file privacy labels".
   */
  attachmentPrivacyShortLabel?: string;
  /** When true, composer placeholder reads "Reply to AGI" instead of "Ask anything..." */
  isThreadActive?: boolean;
  /**
   * Pre-fill text for the composer on first render (e.g. from a conversation
   * starter or URL prompt param). Only applied once — subsequent changes to
   * this prop are ignored after mount.
   */
  initialText?: string;
  /**
   * When set, the composer text is persisted under this key (per conversation,
   * or "new-chat" for the home composer) and restored on remount, so a
   * half-typed message survives navigation / backgrounding. Cleared on send.
   */
  draftKey?: string;
  /** Trust-boundary owner for a persisted draft. Required whenever draftKey is set. */
  draftProvenance?: DraftProvenance;
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
  isThreadActive = false,
  initialText,
  draftKey,
  draftProvenance,
}: ChatInputProps) {
  // Seed from a saved draft (if any) first, else the one-time initialText prop.
  const [text, setText] = useState(() =>
    draftKey && !draftProvenance ? '' : getDraft(draftKey, draftProvenance) || (initialText ?? ''),
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceResetSignal, setVoiceResetSignal] = useState(0);
  // Once the message no longer fits one line, the composer restacks: the text
  // takes the full width and [+] / mic drop to a row beneath it. Keeping the
  // single row would squeeze long text into a ~278pt column between the two
  // 40pt buttons while the pill grew tall — the "width goes very large but
  // only the middle" report. Both ChatGPT and Claude restack the same way.
  const [isMultiline, setIsMultiline] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
  const imageGenerationActive =
    isSignedInCloudChat &&
    FEATURES.imageGen &&
    chatFeatures.imageGen &&
    grantedCapabilities.includes('canUseImages') &&
    canUseBillingPlanCapability(subscriptionTier, 'image_generation');
  const activeToolStatuses = [
    // Web search has no user toggle -- it is on for every capable signed-in
    // cloud model, so a permanent "Search" chip is noise rather than status.
    // The chips below all require an explicit toggle in the "+" sheet, so
    // they still tell the user something they chose.
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
    ...(imageGenerationActive
      ? [
          {
            key: 'image',
            label: 'Image',
            accessibilityLabel: 'Image generation active',
            Icon: Paintbrush,
          },
        ]
      : []),
  ];

  const applyTranscript = useCallback((transcript: string) => {
    const cleanedTranscript = cleanupVoiceDictation(transcript);
    if (!cleanedTranscript) {
      return;
    }

    const isCommand = detectVoiceCommand(cleanedTranscript);
    setText((prev) => {
      if (isCommand) {
        return cleanedTranscript;
      }

      return prev ? `${prev} ${cleanedTranscript}` : cleanedTranscript;
    });
    inputRef.current?.focus();
  }, []);

  // Expose addAttachments to parent via ref so pickers can forward results
  useImperativeHandle(
    attachRef,
    () => ({
      addAttachments: (items: Attachment[]) => {
        // Validate up front so an unsupported/oversized file is rejected with a
        // specific reason instead of silently becoming an empty stub at send time.
        const { accepted, rejected } = validateAttachments(items);
        if (accepted.length > 0) setAttachments((prev) => [...prev, ...accepted]);
        if (rejected.length > 0) {
          Alert.alert(
            rejected.length === 1 ? 'Attachment not added' : 'Some attachments not added',
            rejected.map((r) => r.reason).join('\n'),
          );
        }
      },
    }),
    [],
  );

  // Clean up duration interval on unmount to prevent leak if user navigates away while recording
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  // Persist the in-progress draft so it survives unmount / backgrounding.
  // MMKV writes are synchronous + memory-mapped, so per-change persistence is cheap.
  useLayoutEffect(() => {
    if (previousDraftIdentityRef.current !== draftIdentity) {
      previousDraftIdentityRef.current = draftIdentity;
      // Router can reuse the composer instance for another conversation,
      // Local/Cloud scope, or Clerk account. Never carry the prior identity's
      // in-memory text or attachments across that boundary. A layout effect
      // resets before paint so account A's text cannot flash for account B.
      setText(draftKey && !draftProvenance ? '' : getDraft(draftKey, draftProvenance));
      setAttachments([]);
      return;
    }
    if (!draftKey || !draftProvenance) return;
    setDraft(draftKey, text, draftProvenance);
  }, [draftIdentity, draftKey, draftProvenance, text]);

  // Collapse the home-indicator inset while the keyboard is up — with the
  // KeyboardAvoidingView pushing the composer above the keyboard, keeping the
  // full bottom safe-area padding leaves a dead ~34pt band between the send
  // row and the keyboard (ChatGPT/Claude collapse it the same way).
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

  const handleSend = useCallback(() => {
    if (sendPendingRef.current) return;
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    // Pasted-text attachments are composer UX, not server files — fold their
    // content back into the outgoing message so the model always sees it.
    const pastedBlocks = attachments
      .map((a) => a.pastedText)
      .filter((t): t is string => Boolean(t));
    const fileAttachments = attachments.filter((a) => !a.pastedText);
    const outgoing = [...pastedBlocks, trimmed].filter(Boolean).join('\n\n');

    const sentText = text;
    const sentAttachmentIds = new Set(attachments.map((a) => a.id));
    sendPendingRef.current = true;

    // Draft-safe send: the composer clears only once the send is ACCEPTED
    // (user message committed after all pre-flight gates). A handler that
    // resolves `false` or throws keeps the draft intact — never clear
    // optimistically on tap.
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
  }, [text, attachments, onSend, hapticsEnabled, draftKey, draftProvenance]);

  /**
   * A very large block dropped into the composer (paste) becomes a compact
   * "Pasted text" attachment — like ChatGPT/Claude mobile — instead of 10k+
   * chars of composer scrollback. Only a single-update JUMP past the
   * threshold converts (a paste); gradual typing never does. The content is
   * folded back into the message at send time, and the chip can be expanded
   * back inline (see handleExpandPastedText).
   */
  const handleChangeText = useCallback(
    (next: string) => {
      const inserted = next.length - text.length;
      if (inserted >= LARGE_PASTE_THRESHOLD) {
        // Isolate the pasted block: strip the longest common prefix/suffix
        // shared with the previous text so typed text stays in the input.
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
          return; // keep the pre-paste text in the input
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
      setRecordingDurationMs(0);
      setAudioLevel(0);
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      applyTranscript(transcribedText);
    },
    [applyTranscript],
  );

  const resetRecordingUi = useCallback(() => {
    setIsRecording(false);
    setRecordingDurationMs(0);
    setAudioLevel(0);
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const handleRecordingStart = useCallback(() => {
    setIsRecording(true);
    setRecordingDurationMs(0);
    recordingStartTimeRef.current = Date.now();
    durationIntervalRef.current = setInterval(() => {
      setRecordingDurationMs(Date.now() - recordingStartTimeRef.current);
    }, 100);
  }, []);

  const handleRecordingStop = useCallback(() => {
    resetRecordingUi();
  }, [resetRecordingUi]);

  const handleMetering = useCallback((event: VoiceMeteringEvent) => {
    const normalized = Math.max(0, Math.min(1, (event.metering + 60) / 60));
    setAudioLevel(normalized);
  }, []);

  const handleOverlayCancel = useCallback(() => {
    resetRecordingUi();
    setVoiceResetSignal((value) => value + 1);
    if (VoiceService.isRecording()) {
      VoiceService.cancelRecording().catch(() => {
        // ignore cleanup errors
      });
    }
  }, [resetRecordingUi]);

  const handleOverlaySend = useCallback(async () => {
    resetRecordingUi();
    // Always bump voiceResetSignal on the way out — including when the
    // recording session already ended before Send was tapped (e.g. no
    // microphone on the iOS Simulator, or a race with the OS audio session).
    // The old early-return here skipped the signal entirely, leaving
    // VoiceInputButton's internal state stuck on "recording" (red mic icon,
    // "Tap to stop recording" a11y label) with no way to recover short of
    // tapping it again and hitting the "No recording in progress" error path,
    // whose handler happens to reset the signal as a side effect.
    if (!VoiceService.isRecording()) {
      setVoiceResetSignal((value) => value + 1);
      return;
    }
    setIsTranscribing(true);
    try {
      const uri = await VoiceService.stopRecording();
      const result = await VoiceService.transcribe(uri);
      if (result.text.trim()) {
        applyTranscript(result.text.trim());
      }
    } catch {
      // ignore transcription errors from overlay send
    } finally {
      setIsTranscribing(false);
      setVoiceResetSignal((value) => value + 1);
    }
  }, [applyTranscript, resetRecordingUi]);

  const handleVoiceError = useCallback(
    (message: string) => {
      resetRecordingUi();
      setVoiceResetSignal((value) => value + 1);
      Alert.alert('Voice input unavailable', message);
    },
    [resetRecordingUi],
  );

  const hasContent = text.trim().length > 0 || attachments.length > 0;
  // Recording and transcribing keep the compact row: both render short,
  // fixed-height content and morph the row's buttons in place.
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
    onOpenAddToChat?.();
  }, [hapticsEnabled, onOpenAddToChat]);

  const queueLabel = queueSize > 0 ? ` (${queueSize} queued)` : '';
  const placeholder = isStreaming
    ? `Reply to ${modelName}...`
    : !isOnline
      ? `Offline — message will send on reconnect${queueLabel}`
      : isThreadActive
        ? 'Reply to AGI'
        : "What's on your mind?";

  return (
    <View
      className="px-4 pt-2"
      style={{ paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom + 6, 16) }}
    >
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
          While recording, the SAME row morphs in place (ChatGPT reference):
          left button becomes cancel (X), the pill shows a live waveform +
          timer (then a "Transcribing" spinner), and the right circle becomes
          the accept arrow. Nothing overlays the composer. */}
      <View
        style={{
          flexDirection: 'row',
          // A tall composer should keep the send button on the baseline of its
          // last line rather than floating halfway up the card.
          alignItems: stacked ? 'flex-end' : 'center',
          gap: 8,
        }}
      >
        {/* Left button -- [+] Add to Chat, or cancel-recording while recording.
            While stacked it moves inside the card, onto the controls row. */}
        {stacked ? null : isRecording || isTranscribing ? (
          <Pressable
            onPress={isRecording ? handleOverlayCancel : undefined}
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
            accessibilityLabel="Cancel recording"
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
          {/* [+] sits INSIDE the pill on the left, matching ChatGPT
              (IMG_0674, references-2/voice-03). It previously sat outside as a
              separate 40pt circle, which is Claude's arrangement, not
              ChatGPT's — and the founder chose ChatGPT style. Hidden while the
              pill is showing recording/transcribing state, and while stacked,
              where the plus moves to the controls row beneath the text. */}
          {!stacked && !isRecording && !isTranscribing ? (
            <Pressable
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

          {/* Live waveform + timer while recording (in place of the input) */}
          {isRecording ? (
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                minHeight: 24,
              }}
              accessibilityRole="alert"
              accessibilityLabel="Recording in progress"
              testID="chat.composer.recording"
            >
              <View style={{ flex: 1, alignItems: 'flex-start' }}>
                <Waveform
                  color={themeColors.textSecondary}
                  active
                  audioLevel={audioLevel}
                  barCount={24}
                  maxHeight={20}
                  minHeight={3}
                  barWidth={2.5}
                  gap={3}
                />
              </View>
              <Text
                style={{
                  color: themeColors.textMuted,
                  fontSize: 13,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatClock(recordingDurationMs)}
              </Text>
            </View>
          ) : null}

          {/* Transcribing state -- shown after accept, while STT runs */}
          {!isRecording && isTranscribing ? (
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                minHeight: 24,
              }}
              accessibilityRole="alert"
              accessibilityLabel="Transcribing"
              testID="chat.composer.transcribing"
            >
              <ActivityIndicator size="small" color={themeColors.textMuted} />
              <Text style={{ color: themeColors.textMuted, fontSize: 15 }}>Transcribing</Text>
            </View>
          ) : null}

          <TextInput
            ref={inputRef}
            testID="chat.composer.input"
            style={{
              // `flex: 1` means width in the compact row but height in the
              // stacked column, where it would collapse the input to the
              // card's minHeight and scroll the text behind a 2-line window.
              // Stretch for width and let the content drive height instead.
              ...(stacked ? { alignSelf: 'stretch' } : { flex: 1 }),
              color: themeColors.textPrimary,
              fontSize: 15,
              paddingVertical: 0,
              minHeight: 24,
              maxHeight: 160,
              // Kept mounted (draft + focus state survive) but hidden while
              // the pill shows the recording/transcribing state.
              display: isRecording || isTranscribing ? 'none' : 'flex',
            }}
            placeholder={placeholder}
            placeholderTextColor={themeColors.textMuted}
            value={text}
            onChangeText={handleChangeText}
            // Measure the rendered text rather than counting characters, so
            // wrapped long words and pasted newlines are both caught. The 4pt
            // band above one line's height debounces sub-pixel jitter that
            // would otherwise flip the layout back and forth on every keystroke.
            onContentSizeChange={(event) => {
              const height = event.nativeEvent.contentSize.height;
              setIsMultiline((current) => (current ? height > 30 : height > 34));
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

        {/* Right circle -- state slot: idle+empty opens voice mode (the
            ChatGPT reference's waveform button), idle+content sends,
            streaming stops. */}
        <View testID="chat.composer.send">
          {isRecording || isTranscribing ? (
            <Pressable
              onPress={isRecording ? handleOverlaySend : undefined}
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
              accessibilityLabel="Stop recording"
              accessibilityHint="Stops recording and transcribes it into the message"
              accessibilityRole="button"
            >
              {/* A stop square, not a send arrow. This control ends capture and
                  drops the transcript into the composer for review — it does not
                  send. Drawn as an up-arrow it read as "send", so the row looked
                  like it offered only cancel-or-send and users could not find a
                  way to stop. ChatGPT shows a stop square in the same slot. */}
              <Square
                size={14}
                color={themeColors.surfaceElevated}
                fill={themeColors.surfaceElevated}
              />
            </Pressable>
          ) : sendButtonState === 'idle' && !hasContent && onOpenVoiceMode ? (
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
      </View>
    </View>
  );
}
