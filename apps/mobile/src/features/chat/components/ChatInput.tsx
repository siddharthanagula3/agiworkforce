import { LoadingIndicator } from '@/components/ui/LoadingIndicator';
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
} from 'react';
import { Alert, View, TextInput, Keyboard } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Plus,
  AudioLines,
  ArrowUp,
  Maximize2,
  Square,
  X,
  Pencil,
  Telescope,
  Terminal,
  Sparkles,
  Clock,
} from 'lucide-react-native';
import {
  canUseBillingPlanCapability,
  getModelMetadataById,
  isAutoModeModelId,
  resolveWorkUsageRecovery,
  summarizeSendPreview,
  type SendPreviewInput,
  type WorkUsageRecovery,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { AttachmentPreview, type Attachment } from './AttachmentPreview';
import { SendPreview } from './SendPreview';
import { VoiceIntroHint, dismissVoiceIntroHint } from './VoiceIntroHint';
import { validateAttachments } from '@/src/features/chat/utils/attachmentValidation';
import { SendButton } from './SendButton';
import { useComposerAttachmentScope } from '../useComposerAttachmentScope';
import type { ComposerAttachmentOperation } from '../utils/runComposerAttachmentPick';
import { ComposerFullScreenEditor } from './ComposerFullScreenEditor';
import { ModelSelectorButton } from './ModelSelectorButton';
import { ComposerEffortButton, ComposerEffortPanel, useComposerEffort } from './ComposerEffort';
import {
  COMPOSER_ACTION_CIRCLE_SIZE,
  COMPOSER_CONTROL_SIZE,
  COMPOSER_PLUS_SIZE,
} from './composerMetrics';
import { CommandPalette, type ChatCommand } from './CommandPalette';
import { FileMentionPalette } from './FileMentionPalette';
import { trailingMention, withoutTrailingMention } from '@/src/features/chat/utils/fileMention';
import { MediaModeChip } from './MediaModeChip';
import { NEW_CHAT_STYLE_KEY, useChatViewStore } from '@/stores/chat/chatViewStore';
import { uploadWithRetry } from '@/src/features/chat/upload/uploadAttachment';
import { resolveUploadContext } from '@/src/features/chat/upload/uploadContext';
import { useUploadLifecycleStore } from '@/src/features/chat/upload/uploadLifecycle';
import { useKeyboardVisible } from '@/src/features/chat/chrome/keyboardSafeComposer';
import { exitMediaMode, mediaModelIdForMode } from '@/src/features/chat/actions/mediaMode';
import {
  VoiceInputButton,
  type VoiceInputHandle,
  type DictationIntent,
} from '@/src/features/voice/components/VoiceInputButton';
import { showVoicePermissionAlert } from '@/src/features/voice/components/voicePermissionAlert';
import { Waveform } from '@/src/features/voice/components/Waveform';
import * as Haptics from 'expo-haptics';
import { useModelStore } from '@/src/features/model-picker/store';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useChatStore } from '@/stores/chatStore';
import { WorkUsageCard } from './WorkUsageCard';
import { useTierStore } from '@/src/features/billing/store';
import { NATIVE_PURCHASES_AVAILABLE } from '@/src/features/billing/nativePurchaseAvailability';
import { useAuthStore } from '@/src/features/auth/store';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useTheme, radii } from '@/src/ui/theme';
import { chatTypography, typeScale } from '@/src/ui/theme/tokens';
import { contentColumn } from '@/src/shared/layout/contentColumn';
import { getShortDisplayName } from '@/src/features/model-picker/service';
import { MAX_INPUT_LINES } from '@/lib/constants';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  getDraft,
  setDraft,
  clearDraft,
  type DraftProvenance,
} from '@/src/features/chat/draftStore';
import { draftIdentityKey } from '@/src/features/chat/draftIdentity';
import type { VoiceMeteringEvent } from '@/src/features/voice/services/voice';
import {
  cleanupVoiceDictation,
  detectVoiceCommand,
  meteringToAmplitude,
} from '@agiworkforce/utils/voice';
import { useCapability } from '@/src/lib/Capabilities';
import {
  LARGE_PASTE_THRESHOLD,
  PASTED_TEXT_MIME_TYPE,
  isLargePaste,
  isPastedTextFileName,
  pastedTextFileName,
} from '@agiworkforce/utils/composer-paste';

type ComposerUploadPhase = 'uploading' | 'unsent' | 'settled';

const STACK_LAYOUT_MIN_HEIGHT = 34;

function mergeTranscript(previous: string, transcript: string): string {
  const cleanedTranscript = cleanupVoiceDictation(transcript);
  if (!cleanedTranscript) return previous;
  if (detectVoiceCommand(cleanedTranscript)) return cleanedTranscript;
  return previous ? `${previous} ${cleanedTranscript}` : cleanedTranscript;
}

function attachmentIdentity(attachment: Attachment): string {
  if (attachment.pastedText !== undefined) return `text:${attachment.id}`;
  return attachment.assetId ? `asset:${attachment.assetId}` : `uri:${attachment.uri}`;
}

interface QueuedFollowUp {
  id: string;
  text: string;
  attachments: Attachment[];
}

export interface ChatInputHandle {
  addAttachments: (items: Attachment[]) => void;
  captureAttachmentOperation: (
    executionMode: 'local' | 'cloud',
  ) => ComposerAttachmentOperation | null;
  focus?: () => void;
  restoreText?: (text: string) => void;
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
  conversationId?: string;
  draftProvenance?: DraftProvenance;
  selectedSkillName?: string;
  onClearSelectedSkill?: () => void;
  exhaustedUsageRecovery?: WorkUsageRecovery | null;
  onMultilineChange?: (multiline: boolean) => void;
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
  conversationId,
  draftProvenance,
  selectedSkillName,
  onClearSelectedSkill,
  exhaustedUsageRecovery = null,
  onMultilineChange,
}: ChatInputProps) {
  const voiceAllowed = useCapability('canUseVoice');
  const [text, setText] = useState(() =>
    draftKey && !draftProvenance ? '' : getDraft(draftKey, draftProvenance) || (initialText ?? ''),
  );
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachmentsRef = useRef<Attachment[]>(attachments);
  attachmentsRef.current = attachments;
  const keyboardVisible = useKeyboardVisible();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceResetSignal, setVoiceResetSignal] = useState(0);
  const [voiceStartSignal, setVoiceStartSignal] = useState(0);
  const [isMultiline, setIsMultiline] = useState(false);
  const [expandedEditorVisible, setExpandedEditorVisible] = useState(false);
  const [queuedFollowUps, setQueuedFollowUps] = useState<QueuedFollowUp[]>([]);
  const inputRef = useRef<TextInput>(null);
  const voiceControlRef = useRef<VoiceInputHandle | null>(null);
  const textRef = useRef(text);
  textRef.current = text;
  const sendPendingRef = useRef(false);
  const heldSendRef = useRef<string | null>(null);
  const [sendHeld, setSendHeld] = useState(false);
  const [effortOpenForModel, setEffortOpenForModel] = useState<string | null>(null);
  const queuedFollowUpsRef = useRef<QueuedFollowUp[]>(queuedFollowUps);
  queuedFollowUpsRef.current = queuedFollowUps;
  const queuedFollowUpSeqRef = useRef(0);
  const wasStreamingRef = useRef(isStreaming === true);
  const draftIdentity = draftIdentityKey(draftKey, draftProvenance);
  const previousDraftIdentityRef = useRef(draftIdentity);
  const previousDraftTargetRef = useRef<{ key?: string; provenance?: DraftProvenance }>({
    key: draftKey,
    provenance: draftProvenance,
  });

  const selectedModel = useModelStore((s) => s.selectedModel);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const autoCorrectEnabled = useLocalSettingsStore((s) => s.autoCorrectEnabled);
  const chatFeatures = useChatStore((s) => s.features);
  const failureCode = useChatStore((s) => s.failureCode?.code ?? null);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const captureAttachmentScope = useComposerAttachmentScope(
    draftIdentity,
    draftProvenance,
    appMode,
  );
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const subscriptionTier = useTierStore((s) => s.tier);
  const grantedCapabilities = useTierStore((s) => s.grantedCapabilities);
  const codeExecutionAvailable = useTierStore((s) => s.codeExecutionAvailable);
  const { colors: themeColors } = useTheme();
  const insets = useSafeAreaInsets();

  const modelName = getShortDisplayName(selectedModel, subscriptionTier);
  const selectedModelMetadata = getModelMetadataById(selectedModel);
  const unreadableImages =
    !isAutoModeModelId(selectedModel) &&
    selectedModelMetadata?.capabilities.vision === false &&
    attachments.some((attachment) => attachment.mimeType.startsWith('image/'));
  const mediaMode = useChatViewStore((s) => s.mediaMode);
  const composerEffort = useComposerEffort(selectedModel, conversationId);
  const workMode = useChatViewStore((s) => s.workMode);
  const runCodeOn = useChatViewStore(
    (s) => s.runCodeByConversation[s.styleConversationId ?? NEW_CHAT_STYLE_KEY] === true,
  );
  const mediaModelId = mediaModelIdForMode(mediaMode);
  const mediaModelName = mediaModelId
    ? (getModelMetadataById(mediaModelId)?.name ?? mediaModelId)
    : null;
  const handleExitMediaMode = useCallback(() => {
    exitMediaMode();
  }, []);
  const isSignedInCloudChat = appMode === 'cloud' && isClerkSignedIn;
  const agiWorkActive =
    appMode === 'cloud' &&
    workMode === 'agiwork' &&
    canUseBillingPlanCapability(subscriptionTier, 'agi_work');
  const usageBlocked = agiWorkActive && exhaustedUsageRecovery !== null;
  const workUsageRecovery = agiWorkActive
    ? (resolveWorkUsageRecovery(failureCode, subscriptionTier) ?? exhaustedUsageRecovery)
    : null;
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
    runCodeOn &&
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
            label: 'Run code',
            accessibilityLabel: 'Run code on',
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

  const addAttachments = useCallback(
    (items: Attachment[], isCurrent: () => boolean = () => true) => {
      if (!isCurrent()) return;
      const { accepted, rejected } = validateAttachments(items, appMode);
      const seen = new Set(attachmentsRef.current.map(attachmentIdentity));
      const fresh: Attachment[] = [];
      const duplicates: string[] = [];
      for (const item of accepted) {
        const identity = attachmentIdentity(item);
        if (seen.has(identity)) {
          duplicates.push(item.fileName);
          continue;
        }
        seen.add(identity);
        fresh.push(item);
      }
      if (fresh.length > 0) {
        setAttachments((prev) => {
          if (!isCurrent()) return prev;
          const currentIdentities = new Set(prev.map(attachmentIdentity));
          return [
            ...prev,
            ...fresh.filter((item) => !currentIdentities.has(attachmentIdentity(item))),
          ];
        });
      }
      if (!isCurrent()) return;
      if (duplicates.length > 0) {
        Alert.alert(
          duplicates.length === 1 ? 'Already attached' : 'Some files are already attached',
          `${duplicates.join('\n')}\n\nEach file is attached once.`,
        );
      }
      if (rejected.length > 0 && isCurrent()) {
        Alert.alert(
          rejected.length === 1 ? 'Attachment not added' : 'Some attachments not added',
          rejected.map((r) => r.reason).join('\n'),
        );
      }
    },
    [appMode],
  );

  useImperativeHandle(
    attachRef,
    () => ({
      focus: () => {
        inputRef.current?.focus();
      },
      restoreText: (restored: string) => {
        setText((current) => (current.trim() ? `${current}\n\n${restored}` : restored));
      },
      addAttachments,
      captureAttachmentOperation: (executionMode: 'local' | 'cloud') => {
        const scope = captureAttachmentScope(executionMode);
        return scope
          ? {
              isCurrent: scope.isCurrent,
              addAttachments: (items: Attachment[]) => addAttachments(items, scope.isCurrent),
            }
          : null;
      },
    }),
    [addAttachments, captureAttachmentScope],
  );

  useLayoutEffect(() => {
    if (previousDraftIdentityRef.current !== draftIdentity) {
      previousDraftIdentityRef.current = draftIdentity;
      const stranded = queuedFollowUpsRef.current;
      const previousTarget = previousDraftTargetRef.current;
      if (stranded.length > 0 && previousTarget.key && previousTarget.provenance) {
        const parked = getDraft(previousTarget.key, previousTarget.provenance);
        setDraft(
          previousTarget.key,
          [...stranded.map((item) => item.text), parked].filter(Boolean).join('\n\n'),
          previousTarget.provenance,
        );
      }
      previousDraftTargetRef.current = { key: draftKey, provenance: draftProvenance };
      queuedFollowUpsRef.current = [];
      setQueuedFollowUps([]);
      heldSendRef.current = null;
      setSendHeld(false);
      setText(draftKey && !draftProvenance ? '' : getDraft(draftKey, draftProvenance));
      setAttachments([]);
      return;
    }
    if (!draftKey || !draftProvenance) return;
    setDraft(draftKey, text, draftProvenance);
  }, [draftIdentity, draftKey, draftProvenance, text]);

  const uploads = useUploadLifecycleStore((state) => state.uploads);
  const attachmentUploadPhase = useMemo<ComposerUploadPhase>(() => {
    const entries = attachments.map((a) => uploads[a.id]).filter(Boolean);
    if (entries.some((entry) => entry.phase === 'uploading')) return 'uploading';
    if (entries.some((entry) => entry.phase === 'failed' || entry.phase === 'canceled'))
      return 'unsent';
    return 'settled';
  }, [attachments, uploads]);

  const sendComposerMessage = useCallback(
    (sourceText: string) => {
      if (sendPendingRef.current || usageBlocked) return;
      const trimmed = sourceText.trim();
      if (!trimmed && attachments.length === 0) return;
      if (attachmentUploadPhase === 'uploading') {
        heldSendRef.current = sourceText;
        setSendHeld(true);
        return;
      }
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      const pastedBlocks = attachments
        .map((a) => a.pastedText)
        .filter((t): t is string => Boolean(t));
      const fileAttachments = attachments.filter((a) => !a.pastedText);
      const outgoing = [...pastedBlocks, trimmed].filter(Boolean).join('\n\n');

      if (isStreaming) {
        queuedFollowUpSeqRef.current += 1;
        const queued: QueuedFollowUp = {
          id: `followup-${queuedFollowUpSeqRef.current}`,
          text: outgoing,
          attachments: fileAttachments,
        };
        queuedFollowUpsRef.current = [...queuedFollowUpsRef.current, queued];
        setQueuedFollowUps(queuedFollowUpsRef.current);
        clearDraft(draftKey, draftProvenance);
        setText('');
        setAttachments([]);
        return;
      }

      const sentText = sourceText;
      const sentAttachmentIds = new Set(attachments.map((a) => a.id));
      const markSendFailed = () => {
        setAttachments((current) =>
          current.map((a) => (sentAttachmentIds.has(a.id) ? { ...a, sendFailed: true } : a)),
        );
      };
      sendPendingRef.current = true;
      setAttachments((current) =>
        current.map((a) => (a.sendFailed ? { ...a, sendFailed: false } : a)),
      );

      Promise.resolve(
        onSend(
          outgoing,
          fileAttachments.length > 0
            ? fileAttachments.map(({ sendFailed: _sendFailed, ...rest }) => rest)
            : undefined,
        ),
      )
        .then((accepted) => {
          if (accepted === false) {
            markSendFailed();
            return;
          }
          clearDraft(draftKey, draftProvenance);
          setText((current) => (current === sentText ? '' : current));
          setAttachments((current) => current.filter((a) => !sentAttachmentIds.has(a.id)));
        })
        .catch(markSendFailed)
        .finally(() => {
          sendPendingRef.current = false;
        });
    },
    [
      attachments,
      attachmentUploadPhase,
      onSend,
      hapticsEnabled,
      draftKey,
      draftProvenance,
      isStreaming,
      usageBlocked,
    ],
  );

  // A send pressed while a file is still going up waits for it rather than
  // reaching the model without it. An upload that ends any other way drops the
  // held send and leaves the attachment showing why.
  useEffect(() => {
    if (attachmentUploadPhase === 'uploading') return;
    const held = heldSendRef.current;
    if (held === null) return;
    heldSendRef.current = null;
    setSendHeld(false);
    if (attachmentUploadPhase === 'unsent') return;
    sendComposerMessage(held);
  }, [attachmentUploadPhase, sendComposerMessage]);

  // Editing after pressing send takes the message back: what goes out is only
  // ever the text the reader last looked at and chose to send.
  useEffect(() => {
    if (heldSendRef.current === null || heldSendRef.current === text) return;
    heldSendRef.current = null;
    setSendHeld(false);
  }, [text]);

  const handleSend = useCallback(() => {
    sendComposerMessage(text);
  }, [sendComposerMessage, text]);

  const returnQueuedToComposer = useCallback((item: QueuedFollowUp) => {
    setText((current) => (current ? `${item.text}\n\n${current}` : item.text));
    if (item.attachments.length > 0) {
      setAttachments((current) => [
        ...item.attachments.map((attachment) => ({ ...attachment, sendFailed: true })),
        ...current,
      ]);
    }
  }, []);

  const cancelQueuedFollowUp = useCallback((id: string) => {
    queuedFollowUpsRef.current = queuedFollowUpsRef.current.filter((item) => item.id !== id);
    setQueuedFollowUps(queuedFollowUpsRef.current);
  }, []);

  const editQueuedFollowUp = useCallback((item: QueuedFollowUp) => {
    queuedFollowUpsRef.current = queuedFollowUpsRef.current.filter(
      (queued) => queued.id !== item.id,
    );
    setQueuedFollowUps(queuedFollowUpsRef.current);
    setText((current) =>
      current
        ? `${item.text}

${current}`
        : item.text,
    );
    if (item.attachments.length > 0) {
      setAttachments((current) => [...item.attachments, ...current]);
    }
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const streaming = isStreaming === true;
    if (wasStreamingRef.current && !streaming) {
      const [next, ...rest] = queuedFollowUpsRef.current;
      if (next) {
        queuedFollowUpsRef.current = rest;
        setQueuedFollowUps(rest);
        Promise.resolve(
          onSend(next.text, next.attachments.length > 0 ? next.attachments : undefined),
        )
          .then((accepted) => {
            if (accepted === false) returnQueuedToComposer(next);
          })
          .catch(() => returnQueuedToComposer(next));
      }
    }
    wasStreamingRef.current = streaming;
  }, [isStreaming, onSend, returnQueuedToComposer]);

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
        if (isLargePaste(pasted)) {
          const id = `pasted-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          setText(next.slice(0, prefix) + next.slice(next.length - suffix));
          setAttachments((prev) => [
            ...prev,
            {
              id,
              uri: `pasted-text://${id}`,
              mimeType: PASTED_TEXT_MIME_TYPE,
              fileName: pastedTextFileName(
                prev.filter((attachment) => isPastedTextFileName(attachment.fileName ?? ''))
                  .length + 1,
              ),
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

  const handleRemoveAttachment = useCallback((id: string) => {
    useUploadLifecycleStore.getState().clear(id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleRetryUpload = useCallback(
    (id: string) => {
      const target = attachments.find((a) => a.id === id);
      if (!target) return;
      const accountEpoch = captureCloudAccountEpoch();
      if (!isCloudAccountEpochCurrent(accountEpoch)) return;
      void uploadWithRetry(
        { uri: target.uri, name: target.fileName, type: target.mimeType },
        target.fileName,
        target.id,
        resolveUploadContext(conversationId),
      )
        .then((result) => {
          if (!result || !isCloudAccountEpochCurrent(accountEpoch)) return;
          // A resumed upload owns a Cloud asset, so the next send reuses it
          // instead of uploading the same bytes again.
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id
                ? {
                    ...a,
                    assetId: result.id,
                    uri: result.url,
                    fileSize: result.byteCount,
                    sendFailed: false,
                  }
                : a,
            ),
          );
        })
        .catch(() => {
          if (!isCloudAccountEpochCurrent(accountEpoch)) return;
          useUploadLifecycleStore
            .getState()
            .settle(id, 'failed', 'Could not upload this file. Check your connection and retry.');
        });
    },
    [attachments, conversationId],
  );

  const handleDictationFailure = useCallback(() => {
    Alert.alert("Didn't catch that", "Audio isn't saved, so say it again.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Try again', onPress: () => setVoiceStartSignal((value) => value + 1) },
    ]);
  }, []);

  const handleTranscription = useCallback(
    (transcribedText: string, intent: DictationIntent) => {
      setIsRecording(false);
      setIsTranscribing(false);
      setAudioLevel(0);
      if (!cleanupVoiceDictation(transcribedText)) {
        handleDictationFailure();
        return;
      }
      if (intent === 'send') {
        const merged = mergeTranscript(textRef.current, transcribedText);
        textRef.current = merged;
        setText(merged);
        sendComposerMessage(merged);
      } else applyTranscript(transcribedText);
    },
    [applyTranscript, handleDictationFailure, sendComposerMessage],
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
    setAudioLevel(meteringToAmplitude(event.metering));
  }, []);

  const handleDictationCancel = useCallback(() => {
    voiceControlRef.current?.cancel();
    resetRecordingUi();
    setIsTranscribing(false);
  }, [resetRecordingUi]);

  const handleDictationStop = useCallback(() => {
    voiceControlRef.current?.stop('insert');
  }, []);

  const handleDictationSend = useCallback(() => {
    voiceControlRef.current?.stop('send');
  }, []);

  const handleVoiceError = useCallback(
    (message: string, permissionDenied?: boolean) => {
      resetRecordingUi();
      setVoiceResetSignal((value) => value + 1);
      if (permissionDenied) showVoicePermissionAlert(message);
      else Alert.alert('Voice input unavailable', message);
    },
    [resetRecordingUi],
  );

  useEffect(() => {
    if (text.length === 0) setIsMultiline(false);
  }, [text]);

  const hasContent = text.trim().length > 0 || attachments.length > 0;
  const dictating = isRecording || isTranscribing;
  const effortValue =
    appMode === 'cloud' && mediaMode === 'text' && composerEffort.steps.length > 1
      ? composerEffort.value
      : undefined;
  const effortPanelOpen =
    effortValue !== undefined && !dictating && effortOpenForModel === selectedModel;
  const multiline = isMultiline && !dictating && !effortPanelOpen;

  useEffect(() => {
    onMultilineChange?.(multiline);
  }, [onMultilineChange, multiline]);

  useEffect(() => () => onMultilineChange?.(false), [onMultilineChange]);

  const showCommandPalette = text.startsWith('/') && !isStreaming;
  const mentionQuery = appMode === 'cloud' && isClerkSignedIn ? trailingMention(text) : null;

  const availableCommands: ChatCommand[] = [
    ...(FEATURES.imageGen &&
    (NATIVE_PURCHASES_AVAILABLE ||
      (grantedCapabilities.includes('canUseImages') &&
        canUseBillingPlanCapability(subscriptionTier, 'image_generation')))
      ? (['/image'] as const)
      : []),
    ...(onOpenVoiceMode && voiceAllowed ? (['/voice'] as const) : []),
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
    : (!isOnline && hasContent) || sendHeld
      ? ('queued' as const)
      : ('idle' as const);

  const canQueueFollowUp = isStreaming === true && hasContent && !isRecording && !isTranscribing;

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

  const handleEffortPress = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setEffortOpenForModel(selectedModel);
  }, [hapticsEnabled, selectedModel]);

  const handleEffortDone = useCallback(() => setEffortOpenForModel(null), []);

  const handleExpandEditor = useCallback(() => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setExpandedEditorVisible(true);
  }, [hapticsEnabled]);

  const handleExpandedSend = useCallback(() => {
    setExpandedEditorVisible(false);
    if (canQueueFollowUp) {
      handleSend();
      return;
    }
    handleSendButtonPress();
  }, [canQueueFollowUp, handleSend, handleSendButtonPress]);

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
  const placeholder = !isOnline
    ? `Offline, message will send on reconnect${queueLabel}`
    : mediaMode === 'image'
      ? 'Describe the image to create'
      : mediaMode === 'video'
        ? 'Describe the video to create'
        : isThreadActive || isStreaming
          ? 'Reply to AGI'
          : agiWorkActive
            ? 'Work with AGI'
            : "What's on your mind?";

  return (
    <View
      testID="chat.composer"
      className="px-4 pt-2"
      style={{
        ...contentColumn('reading'),
        paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom + 6, 16),
      }}
    >
      {/* "What will be sent" disclosure, the destination stays visible above
          the composer before every send, and expands to the full payload
          explanation on demand. Mirrors the web composer's compact SendPreview
          (ChatComposerNew.tsx). Hidden during voice capture, where the row
          below morphs into the recording UI and there is no draft to describe. */}
      {sendPreviewPresentation && !isRecording && !isTranscribing ? (
        <SendPreview presentation={sendPreviewPresentation} variant="compact" />
      ) : null}

      {/* Media mode is a MODEL swap, so it needs a standing indicator and an
          explicit exit, otherwise the next text question silently goes to an
          image/video model. Hidden during capture for the same reason as the
          disclosure above. */}
      {workUsageRecovery && !isRecording && !isTranscribing ? (
        <WorkUsageCard recovery={workUsageRecovery} />
      ) : null}

      {mediaMode !== 'text' && !isRecording && !isTranscribing ? (
        <MediaModeChip mode={mediaMode} modelName={mediaModelName} onExit={handleExitMediaMode} />
      ) : null}

      {selectedSkillName && !isRecording && !isTranscribing ? (
        <View
          accessible
          accessibilityLabel={`Skill ${selectedSkillName} selected for the next Cloud message`}
          testID="chat.composer.skill"
          style={{
            minHeight: 44,
            maxWidth: '100%',
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
            style={{
              maxWidth: 220,
              flexShrink: 1,
              color: themeColors.textSecondary,
              fontSize: typeScale.caption,
            }}
          >
            {selectedSkillName}
          </Text>
          <PressableBox
            onPress={onClearSelectedSkill}
            accessibilityRole="button"
            accessibilityLabel="Clear selected Skill"
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={14} color={themeColors.textMuted} />
          </PressableBox>
        </View>
      ) : null}

      <AttachmentPreview
        attachments={attachments}
        onRemove={handleRemoveAttachment}
        onExpandPastedText={handleExpandPastedText}
        onRetryUpload={handleRetryUpload}
        privacyShortLabel={attachmentPrivacyShortLabel}
      />

      {unreadableImages ? (
        <Text
          accessibilityRole="alert"
          style={{
            marginHorizontal: 16,
            marginBottom: 6,
            fontSize: typeScale.caption,
            color: themeColors.agentWarning,
          }}
        >
          {`${selectedModelMetadata?.name ?? modelName} cannot read images. Choose a model that can, or remove the images before sending.`}
        </Text>
      ) : null}

      {mentionQuery !== null ? (
        <FileMentionPalette
          destinationKey={draftIdentity}
          query={mentionQuery}
          onSelect={(attachment) => {
            setText((current) => withoutTrailingMention(current));
            addAttachments([attachment]);
          }}
        />
      ) : null}

      <CommandPalette
        visible={showCommandPalette}
        query={text}
        availableCommands={availableCommands}
        onSelectCommand={handleSelectCommand}
      />

      {/* Connectors live in the "+" sheet (AddToChatSheet) and the model on the
          composer's controls row, not in a secondary chip row above the
          composer -- founder decisions 2026-07-29 and 2026-11-12. */}
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
                  fontSize: typeScale.caption,
                  lineHeight: 16,
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

      {queuedFollowUps.length > 0 && !isRecording && !isTranscribing ? (
        <View style={{ gap: 6, marginBottom: 8 }}>
          {queuedFollowUps.map((item, index) => (
            <View
              key={item.id}
              testID="chat.composer.queued-followup"
              accessibilityLabel={`Queued message ${index + 1} of ${queuedFollowUps.length}: ${item.text}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minHeight: 28,
                paddingLeft: 10,
                paddingRight: 4,
                borderRadius: radii.full,
                borderWidth: 1,
                borderColor: themeColors.composerBorder,
                backgroundColor: themeColors.surfaceElevated,
              }}
            >
              <Clock size={12} color={themeColors.textMuted} strokeWidth={1.8} />
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  color: themeColors.textSecondary,
                  fontSize: typeScale.caption,
                  includeFontPadding: false,
                }}
              >
                {item.text}
              </Text>
              <PressableBox
                onPress={() => editQueuedFollowUp(item)}
                testID={`chat.composer.queued-followup-edit.${item.id}`}
                accessibilityLabel="Edit queued message"
                accessibilityHint="Takes this message out of the queue and puts it back in the message box"
                accessibilityRole="button"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radii.full,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Pencil size={13} color={themeColors.textMuted} />
              </PressableBox>
              <PressableBox
                onPress={() => cancelQueuedFollowUp(item.id)}
                testID={`chat.composer.queued-followup-cancel.${item.id}`}
                accessibilityLabel="Cancel queued message"
                accessibilityHint="Removes this message from the queue so it is not sent"
                accessibilityRole="button"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radii.full,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={14} color={themeColors.textMuted} />
              </PressableBox>
            </View>
          ))}
        </View>
      ) : null}

      {/* Main composer -- a card with the text on top and one controls row
          underneath: [+], the model, effort, the mic and send. ChatGPT, Claude and
          Perplexity all rest in this shape (founder's screenshots, 2026-11-12).
          While dictating, the card morphs in place into the reference's four
          controls (IMG_0686): cancel (X), a live waveform, a stop square, and
          an outboard send arrow. Nothing overlays the composer. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {/* Cancel is enabled for the WHOLE dictation, transcribing included
            (IMG_0687): it was previously disabled the moment capture stopped,
            which stranded a mis-heard long dictation with no way out. */}
        {dictating ? (
          <PressableBox
            onPress={handleDictationCancel}
            style={{
              width: 44,
              height: 44,
              borderRadius: radii.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: themeColors.inputSurface,
            }}
            testID="chat.composer.dictation-cancel"
            accessibilityLabel="Cancel recording"
            accessibilityHint="Discards the dictation without adding it to the message"
            accessibilityRole="button"
          >
            <X size={20} color={themeColors.textPrimary} />
          </PressableBox>
        ) : null}

        <View
          style={{
            flex: 1,
            flexDirection: dictating ? 'row' : 'column',
            alignItems: dictating ? 'center' : 'stretch',
            backgroundColor: themeColors.surfaceElevated,
            borderRadius: dictating ? radii.full : radii['2xl'],
            borderWidth: 1,
            borderColor: themeColors.composerBorder,
            paddingLeft: dictating ? 6 : 16,
            paddingRight: dictating ? 6 : 10,
            paddingTop: dictating ? 3 : 12,
            paddingBottom: dictating ? 3 : 4,
            minHeight: 44,
          }}
        >
          {/* Expand to a full-screen editor. Pinned inside the card's top-right
              corner and shown only once the text wraps, matching the
              reference's appearance threshold (IMG_0672), one line has nothing
              to expand. The wrapped TextInput reserves room for it on the right
              so the first line never runs underneath the glyph. */}
          {multiline ? (
            <PressableBox
              onPress={handleExpandEditor}
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 44,
                height: 44,
                borderRadius: radii.full,
                alignItems: 'center',
                justifyContent: 'center',
              }}
              testID="chat.composer.expand"
              accessibilityLabel="Expand message"
              accessibilityHint="Opens the message in a full-screen editor"
              accessibilityRole="button"
            >
              <Maximize2 size={16} color={themeColors.textMuted} />
            </PressableBox>
          ) : null}

          {/* Dictation state, in place of the input: a live waveform while
              recording, then a centred "Transcribing" label while the
              recognizer resolves the transcript (IMG_0686/0687). */}
          {isRecording ? (
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 24,
              }}
              accessibilityRole="alert"
              accessibilityLabel="Recording in progress"
              testID="chat.composer.recording"
            >
              <View style={{ flex: 1, alignItems: 'flex-start', overflow: 'hidden' }}>
                <Waveform
                  color={themeColors.textSecondary}
                  active
                  audioLevel={audioLevel}
                  barCount={18}
                  maxHeight={20}
                  minHeight={3}
                  barWidth={2.5}
                  gap={3}
                />
              </View>
            </View>
          ) : isTranscribing ? (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 24,
              }}
              accessibilityRole="alert"
              accessibilityLabel="Transcribing"
              testID="chat.composer.transcribing"
            >
              <Text
                numberOfLines={1}
                style={{
                  color: themeColors.textMuted,
                  fontSize: typeScale.footnote,
                  textAlign: 'center',
                }}
              >
                Transcribing
              </Text>
            </View>
          ) : null}

          {effortPanelOpen && effortValue ? (
            <ComposerEffortPanel
              steps={composerEffort.steps}
              value={effortValue}
              onChange={composerEffort.select}
              onDone={handleEffortDone}
            />
          ) : null}

          <TextInput
            ref={inputRef}
            testID="chat.composer.input"
            style={{
              alignSelf: 'stretch',
              paddingRight: multiline ? 44 : 0,
              color: themeColors.textPrimary,
              ...chatTypography.body,
              paddingVertical: 0,
              minHeight: multiline ? 44 : 24,
              maxHeight: 160,
              display: dictating || effortPanelOpen ? 'none' : 'flex',
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
            autoCorrect={autoCorrectEnabled}
            spellCheck={autoCorrectEnabled}
            numberOfLines={MAX_INPUT_LINES}
            selectionColor={themeColors.teal}
            returnKeyType="default"
            blurOnSubmit={false}
            accessible={true}
            accessibilityLabel="Message input"
            accessibilityHint="Type your message to the AI assistant"
          />

          {/* Kept mounted while recording -- VoiceInputButton owns the live
              capture session; unmounting it mid-recording would kill it, so
              the controls row hides during dictation instead of unmounting
              and its other controls render around the mic without moving it. */}
          <View
            testID="chat.composer.mic"
            style={
              dictating || effortPanelOpen
                ? { display: 'none' }
                : {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    marginTop: 4,
                    marginLeft: -12,
                    marginRight: -6,
                  }
            }
          >
            {dictating ? null : (
              <>
                {onOpenAddToChat ? (
                  <PressableBox
                    testID="chat.composer.plus"
                    onPress={handlePlusPress}
                    style={({ pressed }) => ({
                      width: COMPOSER_CONTROL_SIZE,
                      height: COMPOSER_CONTROL_SIZE,
                      borderRadius: radii.full,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: pressed ? themeColors.surfaceHover : themeColors.transparent,
                    })}
                    accessibilityLabel="Add to chat"
                    accessibilityHint="Opens attachment, mode, and feature options"
                    accessibilityRole="button"
                  >
                    <Plus
                      size={COMPOSER_PLUS_SIZE}
                      strokeWidth={1.75}
                      color={themeColors.textSecondary}
                    />
                  </PressableBox>
                ) : null}
                {/* The model answering this chat, beside [+] as Claude and
                    Perplexity place it, and the only way to the model picker
                    (founder, 2026-11-12). Not a chip row above the composer,
                    which the founder rejected on 2026-07-29. Hidden in a media
                    mode: the model is fixed by the registry slot for that
                    output kind, and the MediaModeChip above names it. */}
                {onOpenModelPicker && mediaMode === 'text' ? (
                  <ModelSelectorButton onPress={onOpenModelPicker} />
                ) : null}
                <View style={{ flex: 1 }} />
                {effortValue ? (
                  <ComposerEffortButton effort={effortValue} onPress={handleEffortPress} />
                ) : null}
              </>
            )}
            {voiceAllowed ? (
              <VoiceInputButton
                controlRef={voiceControlRef}
                scopeKey={JSON.stringify([draftIdentity, appMode, selectedModel])}
                onProcessingChange={setIsTranscribing}
                onTranscription={handleTranscription}
                onRecordingStart={handleRecordingStart}
                onRecordingStop={handleRecordingStop}
                onMetering={handleMetering}
                onLongPress={onOpenVoiceMode}
                onError={handleVoiceError}
                onFailure={handleDictationFailure}
                resetSignal={voiceResetSignal}
                startSignal={voiceStartSignal}
                disabled={isStreaming}
              />
            ) : null}
            {dictating ? null : (
              <>
                {/* Queue, not send: firing a second turn now would abort the
                    one still streaming. Kept beside the stop button so ending
                    the reply stays one tap away. */}
                {canQueueFollowUp ? (
                  <View testID="chat.composer.queue">
                    <SendButton
                      state="queued"
                      onPress={handleSend}
                      accessibilityLabel="Queue message"
                    />
                  </View>
                ) : null}
                <View testID="chat.composer.send">
                  {sendButtonState === 'idle' && !hasContent && onOpenVoiceMode ? (
                    <VoiceIntroHint />
                  ) : null}
                  {sendButtonState === 'idle' && !hasContent && onOpenVoiceMode ? (
                    <PressableBox
                      onPress={() => {
                        dismissVoiceIntroHint();
                        onOpenVoiceMode();
                      }}
                      style={{
                        width: COMPOSER_CONTROL_SIZE,
                        height: COMPOSER_CONTROL_SIZE,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      accessibilityLabel="Start voice mode"
                      accessibilityHint="Opens hands-free voice conversation"
                      accessibilityRole="button"
                    >
                      <View
                        style={{
                          width: COMPOSER_ACTION_CIRCLE_SIZE,
                          height: COMPOSER_ACTION_CIRCLE_SIZE,
                          borderRadius: radii.full,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: themeColors.textPrimary,
                        }}
                      >
                        <AudioLines size={18} color={themeColors.surfaceElevated} />
                      </View>
                    </PressableBox>
                  ) : (
                    <SendButton
                      state={sendButtonState}
                      onPress={handleSendButtonPress}
                      disabled={(!hasContent || usageBlocked) && !isStreaming}
                      {...(sendHeld
                        ? { accessibilityLabel: 'Sending when the upload finishes' }
                        : {})}
                    />
                  )}
                </View>
              </>
            )}
          </View>
        </View>

        {/* While dictating, the second half of the reference's four-control
            row (IMG_0686). The stop square ends capture and drops the
            transcript into the composer for review; the outboard arrow stops,
            transcribes and SENDS in one tap, so a spoken message no longer
            needs a stop-then-review-then-send round trip. While the transcript
            resolves the stop slot turns into a spinner and send dims
            (IMG_0687); cancel (left) stays live. */}
        {dictating ? (
          <>
            {isTranscribing ? (
              <View
                testID="chat.composer.transcribing-spinner"
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radii.full,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: themeColors.inputSurface,
                }}
              >
                <LoadingIndicator size="small" />
              </View>
            ) : (
              <PressableBox
                onPress={handleDictationStop}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: radii.full,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: themeColors.inputSurface,
                }}
                testID="chat.composer.dictation-stop"
                accessibilityLabel="Stop recording"
                accessibilityHint="Stops recording and transcribes it into the message"
                accessibilityRole="button"
              >
                {/* A stop square, not a send arrow. This control ends capture and
                    drops the transcript into the composer for review, it does not
                    send. ChatGPT shows a stop square in the same slot. */}
                <Square size={14} color={themeColors.textPrimary} fill={themeColors.textPrimary} />
              </PressableBox>
            )}
            <PressableBox
              onPress={isRecording ? handleDictationSend : undefined}
              disabled={!isRecording}
              style={{
                width: 44,
                height: 44,
                borderRadius: radii.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: themeColors.textPrimary,
                opacity: isRecording ? 1 : 0.5,
              }}
              testID="chat.composer.dictation-send"
              accessibilityLabel="Send recording"
              accessibilityHint="Stops recording, transcribes it, and sends the message"
              accessibilityRole="button"
            >
              <ArrowUp size={18} color={themeColors.surfaceElevated} />
            </PressableBox>
          </>
        ) : null}
      </View>

      {/* Full-screen editing of the same draft. Rendered from the composer (not
          the screen) so it shares this component's text state, send handler and
          large-paste behaviour with no plumbing through the host. */}
      <ComposerFullScreenEditor
        visible={expandedEditorVisible}
        value={text}
        onChangeText={handleChangeText}
        placeholder={placeholder}
        sendState={canQueueFollowUp ? 'queued' : sendButtonState}
        canSend={(hasContent && !usageBlocked) || isStreaming === true}
        onClose={() => setExpandedEditorVisible(false)}
        onSend={handleExpandedSend}
      />
    </View>
  );
}
