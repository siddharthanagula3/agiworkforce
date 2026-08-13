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

/** A single text insertion at least this large (a paste, never typing) is
 *  converted into a compact "Pasted text" attachment instead of flooding the
 *  composer — matching ChatGPT/Claude mobile. */
const LARGE_PASTE_THRESHOLD = 10_000;

/**
 * Measured content height, in points, past which the composer restacks. One
 * line of the composer's 15pt text measures ~20pt, two measure ~38pt, so this
 * sits in the gap between them with room for font-scaling wobble.
 */
const STACK_LAYOUT_MIN_HEIGHT = 34;

/**
 * Fold a dictation transcript into the composer's existing text.
 *
 * Shared by both dictation exits (stop-into-composer and stop-and-send) so a
 * message sent in one tap is composed exactly like one the user reviews first.
 * Returns `previous` unchanged when the transcript cleans up to nothing.
 */
function mergeTranscript(previous: string, transcript: string): string {
  const cleanedTranscript = cleanupVoiceDictation(transcript);
  if (!cleanedTranscript) return previous;
  // A command ("make this shorter") targets the draft that is already there,
  // so it replaces the text instead of being appended to it.
  if (detectVoiceCommand(cleanedTranscript)) return cleanedTranscript;
  return previous ? `${previous} ${cleanedTranscript}` : cleanedTranscript;
}

/**
 * Imperative surface the composer exposes to its host screen.
 *
 * `focus` is optional so a host that only ever pushes attachments can keep a
 * narrower ref type; the composer always provides it.
 */
export interface ChatInputHandle {
  addAttachments: (items: Attachment[]) => void;
  /**
   * Put the keyboard back on the composer. Voice mode needs this: leaving
   * inline voice via "Ask AGI" must land the user in a FOCUSED composer, not
   * merely on a screen that happens to contain one.
   */
  focus?: () => void;
}

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
  /**
   * Ref to drive the composer from outside: add attachments (e.g. AddToChatSheet
   * pickers) or focus the text field (e.g. returning from inline voice).
   */
  attachRef?: React.RefObject<ChatInputHandle | null>;
  /**
   * Per-file privacy label rendered as a chip on attachment thumbnails.
   * Sourced from the host's SendPreviewPresentation. PLAN.md section 5:
   * "Add per-file privacy labels".
   */
  attachmentPrivacyShortLabel?: string;
  /**
   * Route half of the "what will be sent" disclosure: the host supplies the
   * boundary it resolved (provider mode, the model the send will ACTUALLY use,
   * any destination host / tool list). The composer completes it with the
   * payload half it alone knows — the live draft length and the staged
   * attachments — and renders the compact SendPreview above the input.
   *
   * Omit it and no disclosure renders (e.g. the Compare screen, which states
   * its boundary in its own header).
   */
  sendPreview?: SendPreviewInput;
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
  /** Included Managed Cloud Skill attached to the next message only. */
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
  // Seed from a saved draft (if any) first, else the one-time initialText prop.
  const [text, setText] = useState(() =>
    draftKey && !draftProvenance ? '' : getDraft(draftKey, draftProvenance) || (initialText ?? ''),
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceResetSignal, setVoiceResetSignal] = useState(0);
  // Once the message no longer fits one line, the composer restacks: the text
  // takes the full width and [+] / mic drop to a row beneath it. Keeping the
  // single row would squeeze long text into a ~278pt column between the two
  // 40pt buttons while the pill grew tall — the "width goes very large but
  // only the middle" report. Both ChatGPT and Claude restack the same way.
  //
  // Latches on from the height measurement and clears only when the composer
  // empties (see the effect below). See `onContentSizeChange` for why the
  // release has to be driven by the text rather than by another measurement.
  const [isMultiline, setIsMultiline] = useState(false);
  // Full-screen editing of the current message (PAR-M05). No text of its own —
  // it renders this composer's `text`/`handleChangeText`.
  const [expandedEditorVisible, setExpandedEditorVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);
  /**
   * Monotonic id for the in-flight stop -> transcribe run. Cancel bumps it, so
   * a transcript that resolves after the user abandoned the dictation is
   * discarded instead of landing in the composer (or, worse, being sent).
   */
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
  // In a media mode the composer shows the MEDIA model that will serve the
  // request, not the chat model — the chat selection is left untouched so
  // leaving the mode costs nothing. See actions/mediaMode.ts.
  const mediaMode = useChatViewStore((s) => s.mediaMode);
  const mediaModelId = mediaModelIdForMode(mediaMode);
  // Read the name from the CATALOG, not `getShortDisplayName`. That helper only
  // knows models the mobile picker can select (local + cloud chat); media slot
  // models are not selectable there, so it returned UNKNOWN_MODEL_LABEL and
  // the chip read "Video Not set".
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
    // Web search has no user toggle -- it is on for every capable signed-in
    // cloud model, so a permanent "Search" chip is noise rather than status.
    // The chips below all require an explicit toggle in the "+" sheet, so
    // they still tell the user something they chose.
    //
    // Image is deliberately NOT in this list any more. It used to be, back when
    // `features.imageGen` was a switch in the + sheet. That switch became the
    // Image MODE (2026-08-06), so the flag now sits permanently at its `true`
    // default with no way to turn it off — the chip rendered on every signed-in
    // Cloud chat and told the user nothing they had chosen. Image mode is shown
    // by MediaModeChip, which also names the model and offers a way out.
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

  // Expose addAttachments to parent via ref so pickers can forward results,
  // plus focus() so a host can hand the keyboard back to the composer.
  useImperativeHandle(
    attachRef,
    () => ({
      focus: () => {
        inputRef.current?.focus();
      },
      addAttachments: (items: Attachment[]) => {
        // Validate up front so an unsupported/oversized file is rejected with a
        // specific reason instead of silently becoming an empty stub at send time.
        //
        // The size ceiling depends on where the send will put the file, and
        // `appMode` decides that exactly: `guardedFetch` refuses every
        // our-cloud host in Local mode (lib/egressGuard.ts:170-176), so the
        // 12 MiB presign contract binds if and only if we are in Cloud. Apply
        // it here, at attach time, so the composer cannot stage a file the
        // upload will deterministically refuse — that refusal used to be
        // retried three times and then reported as a connection problem.
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
    // The handle must be rebuilt when the boundary changes, or a composer
    // mounted in Local would keep capping cloud attachments at the 25 MB
    // device ceiling after the user flips to Cloud. Hosts read `ref.current`
    // at call time, so the rebuilt handle is the one the pickers use.
    [appMode],
  );

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

  /**
   * Send `sourceText` plus the current attachments.
   *
   * The text is passed in rather than read from state so the one-tap dictation
   * send (stop -> transcribe -> send, PAR-M22) can hand over the transcript it
   * just merged instead of racing the `setText` that puts it on screen.
   */
  const sendComposerMessage = useCallback(
    (sourceText: string) => {
      if (sendPendingRef.current) return;
      const trimmed = sourceText.trim();
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

      const sentText = sourceText;
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
    },
    [attachments, onSend, hapticsEnabled, draftKey, draftProvenance],
  );

  const handleSend = useCallback(() => {
    sendComposerMessage(text);
  }, [sendComposerMessage, text]);

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
      setAudioLevel(0);
      applyTranscript(transcribedText);
    },
    [applyTranscript],
  );

  const resetRecordingUi = useCallback(() => {
    setIsRecording(false);
    setAudioLevel(0);
  }, []);

  // No elapsed-time state: the reference dictation row has no clock
  // (IMG_0686/0687), and the 10Hz interval that fed one re-rendered the whole
  // composer for a readout no decision depended on.
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

  /**
   * Abandon the dictation. Stays live through the transcribing state
   * (IMG_0687): a mis-heard 40-second dictation has to be droppable while the
   * recognizer is still resolving it, not only while the mic is open.
   */
  const handleDictationCancel = useCallback(() => {
    // Invalidate any in-flight stop -> transcribe run FIRST, so a transcript
    // that lands after this tap is discarded instead of appearing in (or being
    // sent from) a composer the user already walked away from.
    transcriptionRunRef.current += 1;
    resetRecordingUi();
    setIsTranscribing(false);
    setVoiceResetSignal((value) => value + 1);
    // Aborts the capture session and rejects the pending stopRecording() await,
    // so the recognizer is never left running behind a dismissed UI. A no-op
    // when no session is active.
    VoiceService.cancelRecording().catch(() => {
      // ignore cleanup errors
    });
  }, [resetRecordingUi]);

  /**
   * End dictation. `send: false` is the stop square — it drops the transcript
   * into the composer for review. `send: true` is the outboard arrow: stop,
   * transcribe and send in one tap (PAR-M22 / IMG_0686), with no round trip
   * through a composer the user has already finished dictating into.
   */
  const finishDictation = useCallback(
    async ({ send }: { send: boolean }) => {
      resetRecordingUi();
      // Always bump voiceResetSignal on the way out — including when the
      // recording session already ended before this control was tapped (e.g. no
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
            // Put it on screen before sending so a send REJECTED by a pre-flight
            // gate (auth, egress, upload consent) leaves the dictated words in
            // the composer rather than losing them with no record anywhere.
            setText(merged);
            sendComposerMessage(merged);
          } else {
            applyTranscript(transcript);
          }
        }
      } catch {
        // Transcription failed or was aborted — the composer keeps what it had.
      } finally {
        // A cancel that superseded this run already reset the UI; re-running
        // the exit here would flip "Transcribing" back on for a frame.
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

  // The only release for the stacked layout. Driven by the text instead of by
  // a second height reading, which is what would reintroduce the oscillation,
  // and placed here rather than in `handleChangeText` so it also covers send,
  // slash-command clears, draft switches, and dictation cancel — every path
  // that empties the composer, not just typing.
  useEffect(() => {
    if (text.length === 0) setIsMultiline(false);
  }, [text]);

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
    /**
     * Dismiss the keyboard BEFORE the sheet opens.
     *
     * Tapping [+] with the keyboard up left it raised over the sheet: the
     * bottom sheet animates to its 75% snap point behind the keyboard, so only
     * the "Add to Chat" header cleared the top of the keys and every row —
     * attachments, Model, Create — was unreachable. The composer's TextInput
     * keeps focus otherwise, and nothing in the sheet takes focus to displace
     * it, so the keyboard never yields on its own.
     */
    Keyboard.dismiss();
    onOpenAddToChat?.();
  }, [hapticsEnabled, onOpenAddToChat]);

  const handleExpandEditor = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpandedEditorVisible(true);
  }, [hapticsEnabled]);

  // Collapse before running the send so a rejected send (auth/egress gate)
  // leaves the draft in the composer the user is looking at, not behind a
  // modal that has already been dismissed for them.
  const handleExpandedSend = useCallback(() => {
    setExpandedEditorVisible(false);
    handleSendButtonPress();
  }, [handleSendButtonPress]);

  /**
   * Payload disclosure. The host owns the route (boundary, model, tools); this
   * component owns what is staged to leave the device right now, so the two
   * halves are joined here rather than the host guessing at the draft.
   * Recomputed on every keystroke on purpose — the char count is part of the
   * disclosure, and this component already re-renders on each one.
   */
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
      : // In a media mode every send is a generation request, so the prompt asks
        // for a subject rather than a message.
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
          // A tall composer should keep the send button on the baseline of its
          // last line rather than floating halfway up the card.
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
              // `flex: 1` means width in the compact row but height in the
              // stacked column, where it would collapse the input to the
              // card's minHeight and scroll the text behind a 2-line window.
              // Stretch for width and let the content drive height instead.
              ...(stacked ? { alignSelf: 'stretch', paddingRight: 28 } : { flex: 1 }),
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
            // wrapped long words and pasted newlines are both caught.
            //
            // ONE-WAY ON PURPOSE. This measurement is only ever allowed to
            // *enter* the stacked layout; `isMultiline` is cleared from the
            // empty-composer effect above, never from a height reading. That
            // asymmetry is what stops the composer shaking.
            //
            // The height being measured depends on the input's width, and the
            // width depends on the layout this measurement chooses:
            //   compact  -> pill - 12 padding - 34 plus - 34 mic = pill - 80
            //   stacked  -> pill - 16 - 10 - 28 expand glyph     = pill - 54
            // Stacking hands the text 26pt more room. So any string that wraps
            // to two lines at the narrow width but fits on one at the wide one
            // used to oscillate forever: compact measures ~38 -> stack, stacked
            // measures ~20 -> unstack, repeat, at layout framerate. A symmetric
            // hysteresis band cannot fix that — it damps sub-pixel jitter, not
            // a 26pt swing in the measuring stick itself.
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
                // Secondary weight now that it shares the row with send: the
                // filled circle belongs to the action that actually sends.
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
