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
import {
  Alert,
  View,
  TextInput,
  Keyboard,
  ScrollView,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type LayoutRectangle,
} from 'react-native';
import { create } from 'zustand';
import {
  cacheDirectory,
  deleteAsync,
  EncodingType,
  getInfoAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
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
import { MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH } from '@agiworkforce/cloud-contracts';
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
import { AttachmentPreview, type Attachment, type PreparingAttachment } from './AttachmentPreview';
import { SendPreview } from './SendPreview';
import { VoiceIntroHint, dismissVoiceIntroHint } from './VoiceIntroHint';
import { admitAttachments } from '@/src/features/chat/utils/attachmentValidation';
import { unreadableImagesNotice } from '@/src/features/chat/utils/unreadableImagesNotice';
import { SendButton } from './SendButton';
import { useComposerAttachmentScope } from '../useComposerAttachmentScope';
import type { ComposerAttachmentOperation } from '../utils/runComposerAttachmentPick';
import { wasCloudUploadDeclined } from '../utils/cloudUploadConsent';
import { ComposerFullScreenEditor } from './ComposerFullScreenEditor';
import { ModelSelectorButton } from './ModelSelectorButton';
import { HEADER_TEXT_SCALE_LIMIT } from './WorkModeSwitch';
import { ComposerEffortButton, ComposerEffortPanel, useComposerEffort } from './ComposerEffort';
import {
  COMPOSER_ACTION_CIRCLE_SIZE,
  COMPOSER_CONTROL_SIZE,
  COMPOSER_PLUS_SIZE,
} from './composerMetrics';
import { CommandPalette, type ChatCommand } from './CommandPalette';
import { FileMentionPalette } from './FileMentionPalette';
import { SkillMentionPalette } from '@/src/features/skills/SkillMentionPalette';
import { enableSkillCodeExecution } from '@/src/features/skills/skillRequirements';
import { useMobileSkillSelectionStore } from '@/src/features/skills/selectionStore';
import { trailingMention, withoutTrailingMention } from '@/src/features/chat/utils/fileMention';
import { MediaModeChip } from './MediaModeChip';
import { NEW_CHAT_STYLE_KEY, useChatViewStore } from '@/stores/chat/chatViewStore';
import { uploadWithRetry } from '@/src/features/chat/upload/uploadAttachment';
import { resolveUploadContext } from '@/src/features/chat/upload/uploadContext';
import {
  isUploadInFlight,
  useUploadLifecycleStore,
} from '@/src/features/chat/upload/uploadLifecycle';
import { useKeyboardVisible } from '@/src/features/chat/chrome/keyboardSafeComposer';
import { exitMediaMode, mediaModelIdForMode } from '@/src/features/chat/actions/mediaMode';
import {
  VoiceInputButton,
  type VoiceInputHandle,
  type DictationIntent,
} from '@/src/features/voice/components/VoiceInputButton';
import { showVoicePermissionAlert } from '@/src/features/voice/components/voicePermissionAlert';
import { Waveform } from '@/src/features/voice/components/Waveform';
import { HOLD_TO_TALK_THRESHOLD_MS } from '@/src/features/voice/holdToTalk';
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
import {
  mergePrefill,
  prefillComposer,
  useComposerPrefillStore,
} from '@/src/features/chat/store/composerPrefillStore';
import { useTheme, radii } from '@/src/ui/theme';
import { chatTypography, typeScale } from '@/src/ui/theme/tokens';
import { contentColumn } from '@/src/shared/layout/contentColumn';
import { getShortDisplayName, isFreeQuotaTurnModelId } from '@/src/features/model-picker/service';
import { useCloudLatestMessageMaxChars } from '@/src/features/chat/upload/messageLimits';
import { MAX_INPUT_LINES } from '@/lib/constants';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  getDraft,
  getDraftAttachments,
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
  PASTED_BLOCK_SEPARATOR,
  PASTED_TEXT_MIME_TYPE,
  isLargePaste,
  isPastedTextFileName,
  pastedBlocksToAttach,
  pastedTextFileName,
} from '@agiworkforce/utils/composer-paste';

type ComposerUploadPhase = 'uploading' | 'unsent' | 'settled';

const WRAPPED_CONTENT_IN_LINES = 1.5;
// The expand glyph sits 6pt inside the card's top-right corner, measured from
// the text block, which the card insets by its own padding.
const EXPAND_BUTTON_OFFSET = { top: -6, right: -4 } as const;
const CARD_BORDER_WIDTH = 1;
const CARD_PADDING = { left: 16, right: 10, top: 12, bottom: 4 } as const;
const DICTATION_CARD_PADDING = { horizontal: 6, vertical: 3 } as const;
const LIVE_TRANSCRIPT_MAX_LINES = 3;
const FIELD_HOLD_RETENTION = 20;

interface FieldHold {
  timer: ReturnType<typeof setTimeout> | null;
  engaged: boolean;
  outside: boolean;
}

function mergeTranscript(previous: string, transcript: string): string {
  const cleanedTranscript = cleanupVoiceDictation(transcript);
  if (!cleanedTranscript) return previous;
  if (detectVoiceCommand(cleanedTranscript)) return cleanedTranscript;
  return previous ? `${previous} ${cleanedTranscript}` : cleanedTranscript;
}

function attachmentIdentities(attachment: Attachment): string[] {
  if (attachment.pastedText !== undefined) return [`text:${attachment.id}`];
  if (attachment.assetId) return [`asset:${attachment.assetId}`];
  const identities = [`uri:${attachment.uri}`];
  if (attachment.pickerAssetId) identities.push(`picker:${attachment.pickerAssetId}`);
  if (typeof attachment.fileSize === 'number' && attachment.mimeType.startsWith('image/')) {
    identities.push(`photo:${attachment.fileName}:${attachment.fileSize}`);
  }
  return identities;
}

function draftAttachmentsFor(
  draftKey: string | undefined,
  draftProvenance: DraftProvenance | undefined,
): Attachment[] {
  return draftKey && draftProvenance ? getDraftAttachments(draftKey, draftProvenance) : [];
}

const LOCAL_FILE_URI = /^file:/i;

const PASTED_TEXT_FILE_PREFIX = 'pasted-text-';

function removePastedTextFiles(attachments: readonly Attachment[] | undefined): void {
  if (!cacheDirectory) return;
  const prefix = `${cacheDirectory}${PASTED_TEXT_FILE_PREFIX}`;
  for (const attachment of attachments ?? []) {
    if (attachment.uri.startsWith(prefix)) {
      void deleteAsync(attachment.uri, { idempotent: true }).catch(() => undefined);
    }
  }
}

async function pastedTextFileAttachment(chip: Attachment): Promise<Attachment> {
  if (!cacheDirectory) throw new Error(`"${chip.fileName}" could not be prepared on this device.`);
  const text = chip.pastedText ?? '';
  const uri = `${cacheDirectory}${PASTED_TEXT_FILE_PREFIX}${chip.id}.txt`;
  await writeAsStringAsync(uri, text, { encoding: EncodingType.UTF8 });
  return {
    id: `${chip.id}-file`,
    uri,
    mimeType: PASTED_TEXT_MIME_TYPE,
    fileName: chip.fileName,
    fileSize: new TextEncoder().encode(text).length,
  };
}

async function preparePastedTextFiles(
  chips: readonly Attachment[],
  staged: readonly Attachment[],
  planTier: string,
): Promise<Attachment[] | null> {
  const files: Attachment[] = [];
  try {
    for (const chip of chips) files.push(await pastedTextFileAttachment(chip));
  } catch (error) {
    removePastedTextFiles(files);
    throw error;
  }
  const { accepted, rejected } = admitAttachments(staged, files, 'cloud', planTier);
  if (rejected.length === 0) return accepted;
  removePastedTextFiles(files);
  Alert.alert(
    rejected.length === 1 ? 'Attachment not added' : 'Some attachments not added',
    rejected.map((r) => r.reason).join('\n'),
  );
  return null;
}

function pastedTextUploadFailure(files: readonly Attachment[]): string | null {
  const { uploads } = useUploadLifecycleStore.getState();
  for (const file of files) {
    const entry = uploads[file.id];
    if (entry?.phase === 'failed' && entry.error) return entry.error;
  }
  return null;
}

const TRAILING_WORD = /\S+\s*$/;
const AUTOCORRECT_COMMIT_WINDOW_MS = 500;

/**
 * iOS commits a pending autocorrect candidate on the last word after the send
 * press, so the field can report the sent text with that word replaced.
 */
function isSentTextOrItsCorrection(current: string, sent: string): boolean {
  if (current === sent) return true;
  const sentWord = TRAILING_WORD.exec(sent)?.[0].trim();
  const currentWord = TRAILING_WORD.exec(current)?.[0].trim();
  if (!sentWord || !currentWord || currentWord.length < 2) return false;
  if (current.replace(TRAILING_WORD, '') !== sent.replace(TRAILING_WORD, '')) return false;
  return currentWord[0]!.toLowerCase() === sentWord[0]!.toLowerCase();
}

function textAfterSentText(current: string, sent: string): string | null {
  if (isSentTextOrItsCorrection(current, sent)) return '';
  if (current.startsWith(sent)) return current.slice(sent.length).trimStart();
  const sentWords = sent.trim().split(/\s+/).length;
  if (sentWords < 2) return null;
  const head = new RegExp(`^\\s*(?:\\S+\\s+){${sentWords - 1}}\\S+`).exec(current)?.[0];
  if (head === undefined || !isSentTextOrItsCorrection(head, sent)) return null;
  return current.slice(head.length).trimStart();
}

/**
 * React Native drops a value set from JS while a newer keystroke is still on
 * its way from the native field (the event-count check in setTextAndSelection
 * on iOS and Android), so after a send the field can keep reporting the sent
 * words with the new typing after them until JS catches up with the typing.
 * Each such echo restarts the window.
 */
const SENT_TEXT_ECHO_WINDOW_MS = 5_000;

interface SentTextEcho {
  text: string;
  at: number;
  exact: boolean;
  handedTo?: string;
  handed?: string;
  handedOver?: 'mirrored' | 'cleared';
}

function sentTextEcho(sentText: string): SentTextEcho | null {
  return sentText.trim() ? { text: sentText, at: Date.now(), exact: false } : null;
}

function textAfterEcho(current: string, echo: SentTextEcho): string | null {
  if (!echo.exact) return textAfterSentText(current, echo.text);
  return current.startsWith(echo.text) ? current.slice(echo.text.length).trimStart() : null;
}

function typedAfterSentEcho(
  next: string,
  current: string,
  echo: SentTextEcho,
  now: number,
): string | null {
  const elapsed = now - echo.at;
  if (elapsed > SENT_TEXT_ECHO_WINDOW_MS || textAfterEcho(current, echo) !== null) return null;
  const typedOn = textAfterEcho(next, echo);
  if (typedOn === null || typedOn) return typedOn;
  if (echo.exact) return next.length > echo.text.length ? '' : null;
  const ranOn = next.startsWith(echo.text) ? next.slice(echo.text.length) : '';
  if (ranOn && !/\s$/.test(ranOn)) return ranOn;
  return elapsed <= AUTOCORRECT_COMMIT_WINDOW_MS ? '' : null;
}

export type ComposerSendOutcome = void | boolean | 'declined' | { openedConversationId: string };

function openedConversationIdOf(outcome: ComposerSendOutcome): string | undefined {
  return typeof outcome === 'object' && outcome !== null ? outcome.openedConversationId : undefined;
}

interface ComposerHandOver {
  take?: () => string;
  typed: string;
  focus: boolean;
}

const useComposerHandOverStore = create<{ pending: Record<string, ComposerHandOver> }>(() => ({
  pending: {},
}));

function updateHandOver(
  conversationId: string,
  change: (earlier: ComposerHandOver | undefined) => ComposerHandOver | undefined,
): ComposerHandOver | undefined {
  const earlier = useComposerHandOverStore.getState().pending[conversationId];
  const next = change(earlier);
  useComposerHandOverStore.setState((state) => {
    const { [conversationId]: _replaced, ...rest } = state.pending;
    return { pending: next ? { ...rest, [conversationId]: next } : rest };
  });
  return earlier;
}

function offerHandOver(conversationId: string, focus: boolean, take: () => string): void {
  updateHandOver(conversationId, () => ({ take, typed: '', focus }));
}

function forwardHandOver(conversationId: string, typed: string): void {
  if (!typed) return;
  updateHandOver(conversationId, (earlier) => ({
    ...(earlier?.take ? { take: earlier.take } : {}),
    typed: `${earlier?.typed ?? ''}${typed}`,
    focus: earlier?.focus ?? false,
  }));
}

function withdrawHandOverTake(conversationId: string): ComposerHandOver | undefined {
  return updateHandOver(conversationId, (earlier) =>
    earlier ? { typed: earlier.typed, focus: earlier.focus } : undefined,
  );
}

async function missingLocalFileIds(attachments: readonly Attachment[]): Promise<Set<string>> {
  const missing = new Set<string>();
  await Promise.all(
    attachments
      .filter((a) => !a.assetId && a.pastedText === undefined && LOCAL_FILE_URI.test(a.uri))
      .map(async (a) => {
        try {
          if (!(await getInfoAsync(a.uri)).exists) missing.add(a.id);
        } catch {
          missing.add(a.id);
        }
      }),
  );
  return missing;
}

interface QueuedFollowUp {
  id: string;
  text: string;
  attachments: Attachment[];
}

function storedDraftText(queued: readonly QueuedFollowUp[], draft: string): string {
  return [...queued.map((item) => item.text), draft].filter((part) => part.trim()).join('\n\n');
}

export interface ChatInputHandle {
  addAttachments: (items: Attachment[]) => void;
  captureAttachmentOperation: (
    executionMode: 'local' | 'cloud',
  ) => ComposerAttachmentOperation | null;
  focus?: () => void;
  restoreText?: (text: string) => void;
  retrySend?: () => void;
  handOverTypingTo?: (conversationId: string) => void;
}

interface ChatInputProps {
  onSend: (
    text: string,
    attachments?: Attachment[],
  ) => ComposerSendOutcome | Promise<ComposerSendOutcome>;
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
  onRefusedSendChange?: (refused: boolean) => void;
  onHasTextChange?: (hasText: boolean) => void;
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
  onRefusedSendChange,
  onHasTextChange,
}: ChatInputProps) {
  const voiceAllowed = useCapability('canUseVoice');
  const [text, setText] = useState(() =>
    draftKey && !draftProvenance ? '' : getDraft(draftKey, draftProvenance) || (initialText ?? ''),
  );
  const [attachments, setAttachments] = useState<Attachment[]>(() =>
    draftAttachmentsFor(draftKey, draftProvenance),
  );
  const [refusedSend, setRefusedSend] = useState(false);
  const [preparingAttachments, setPreparingAttachments] = useState<PreparingAttachment[]>([]);
  const preparingSeqRef = useRef(0);
  const attachmentsRef = useRef<Attachment[]>(attachments);
  attachmentsRef.current = attachments;
  const keyboardVisible = useKeyboardVisible();
  const keyboardVisibleRef = useRef(keyboardVisible);
  keyboardVisibleRef.current = keyboardVisible;
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [voiceResetSignal, setVoiceResetSignal] = useState(0);
  const [voiceStartSignal, setVoiceStartSignal] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [voiceHoldAvailable, setVoiceHoldAvailable] = useState(false);
  const [textFrame, setTextFrame] = useState<LayoutRectangle | null>(null);
  const [fieldHoldActive, setFieldHoldActive] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const fieldHoldRef = useRef<FieldHold | null>(null);
  const liveTranscriptScrollRef = useRef<ScrollView>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [singleLineHeight, setSingleLineHeight] = useState(0);
  const [expandedEditorVisible, setExpandedEditorVisible] = useState(false);
  const [queuedFollowUps, setQueuedFollowUps] = useState<QueuedFollowUp[]>([]);
  const inputRef = useRef<TextInput>(null);
  const voiceControlRef = useRef<VoiceInputHandle | null>(null);
  // Change events and the Send tap that queued while JS was busy reach the
  // handlers of one render before React draws again, so the latest field text
  // lives in a ref, and every change to the text goes through updateText,
  // which builds it from that ref rather than from the drawn text.
  const textRef = useRef(text);
  const updateText = useCallback((next: string | ((current: string) => string)) => {
    const value = typeof next === 'function' ? next(textRef.current) : next;
    textRef.current = value;
    setText(value);
  }, []);
  const [caretRequest, setCaretRequest] = useState<{ start: number; end: number }>();
  const sendPendingRef = useRef(false);
  const clearedSendRef = useRef<SentTextEcho | null>(null);
  const handOverSourceRef = useRef<{ text: string; identity: string; focus: boolean } | null>(null);
  const handOverTargetRef = useRef<string | null>(null);
  const sendComposerMessageRef = useRef<(sourceText: string) => void>(() => undefined);
  const heldSendRef = useRef<string | null>(null);
  const [sendHeld, setSendHeld] = useState(false);
  const [effortOpenForModel, setEffortOpenForModel] = useState<string | null>(null);
  const queuedFollowUpsRef = useRef<QueuedFollowUp[]>(queuedFollowUps);
  queuedFollowUpsRef.current = queuedFollowUps;
  const queuedFollowUpSeqRef = useRef(0);
  const preparedPastedFilesRef = useRef(new Map<string, Attachment>());
  const wasStreamingRef = useRef(isStreaming === true);
  const draftIdentity = draftIdentityKey(draftKey, draftProvenance);
  const previousDraftIdentityRef = useRef(draftIdentity);
  const mountedRef = useRef(true);

  const selectedModel = useModelStore((s) => s.selectedModel);
  const cloudLatestMessageMaxChars = useCloudLatestMessageMaxChars();
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
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const selectSkill = useMobileSkillSelectionStore((s) => s.selectSkill);
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

  const applyTranscript = useCallback(
    (transcript: string) => {
      if (!cleanupVoiceDictation(transcript)) {
        return;
      }
      updateText((prev) => mergeTranscript(prev, transcript));
      inputRef.current?.focus();
    },
    [updateText],
  );

  const addAttachments = useCallback(
    (items: Attachment[], isCurrent: () => boolean = () => true) => {
      if (!isCurrent()) return;
      const seen = new Set(attachmentsRef.current.flatMap(attachmentIdentities));
      const unique: Attachment[] = [];
      const duplicates: string[] = [];
      for (const item of items) {
        const identities = attachmentIdentities(item);
        if (identities.some((identity) => seen.has(identity))) {
          duplicates.push(item.fileName);
          continue;
        }
        for (const identity of identities) seen.add(identity);
        unique.push(item);
      }
      const { accepted: fresh, rejected } = admitAttachments(
        attachmentsRef.current,
        unique,
        appMode,
        subscriptionTier,
      );
      if (fresh.length > 0) {
        attachmentsRef.current = [...attachmentsRef.current, ...fresh];
        setAttachments((prev) => {
          if (!isCurrent()) return prev;
          const currentIdentities = new Set(prev.flatMap(attachmentIdentities));
          return [
            ...prev,
            ...fresh.filter(
              (item) =>
                !attachmentIdentities(item).some((identity) => currentIdentities.has(identity)),
            ),
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
    [appMode, subscriptionTier],
  );

  useImperativeHandle(
    attachRef,
    () => ({
      focus: () => {
        inputRef.current?.focus();
      },
      restoreText: (restored: string) => {
        updateText((current) => (current.trim() ? `${current}\n\n${restored}` : restored));
      },
      retrySend: () => sendComposerMessageRef.current(textRef.current),
      handOverTypingTo: (openedConversationId: string) => {
        const source = handOverSourceRef.current;
        if (!source || !openedConversationId || openedConversationId === conversationId) return;
        handOverTargetRef.current = openedConversationId;
        offerHandOver(openedConversationId, source.focus, () => {
          if (
            handOverSourceRef.current !== source ||
            previousDraftIdentityRef.current !== source.identity
          ) {
            return '';
          }
          const typed = textRef.current;
          clearedSendRef.current = {
            text: clearedSendRef.current?.text ?? source.text,
            at: Date.now(),
            exact: clearedSendRef.current?.exact ?? true,
            handedTo: openedConversationId,
            handed: typed,
            handedOver: 'mirrored',
          };
          return typed;
        });
      },
      addAttachments,
      captureAttachmentOperation: (executionMode: 'local' | 'cloud') => {
        const scope = captureAttachmentScope(executionMode);
        return scope
          ? {
              isCurrent: scope.isCurrent,
              addAttachments: (items: Attachment[]) => addAttachments(items, scope.isCurrent),
              beginPreparing: () => {
                preparingSeqRef.current += 1;
                const id = `preparing-${preparingSeqRef.current}`;
                setPreparingAttachments((current) => [...current, { id, failed: false }]);
                return {
                  settle: () =>
                    setPreparingAttachments((current) => current.filter((item) => item.id !== id)),
                  fail: () =>
                    setPreparingAttachments((current) =>
                      current.map((item) => (item.id === id ? { ...item, failed: true } : item)),
                    ),
                };
              },
            }
          : null;
      },
    }),
    [addAttachments, captureAttachmentScope, conversationId, updateText],
  );

  const markMissingRestoredFiles = useCallback(
    (restored: readonly Attachment[], identity: string) => {
      if (!restored.some((a) => LOCAL_FILE_URI.test(a.uri))) return;
      void missingLocalFileIds(restored).then((missing) => {
        if (missing.size === 0 || previousDraftIdentityRef.current !== identity) return;
        setAttachments((prev) =>
          prev.map((a) => (missing.has(a.id) ? { ...a, unavailable: true } : a)),
        );
      });
    },
    [],
  );

  useLayoutEffect(() => {
    if (previousDraftIdentityRef.current !== draftIdentity) {
      previousDraftIdentityRef.current = draftIdentity;
      clearedSendRef.current = null;
      queuedFollowUpsRef.current = [];
      setQueuedFollowUps([]);
      heldSendRef.current = null;
      setSendHeld(false);
      const restoredText = draftKey && !draftProvenance ? '' : getDraft(draftKey, draftProvenance);
      updateText(restoredText);
      setCaretRequest(undefined);
      const restored = draftAttachmentsFor(draftKey, draftProvenance);
      setAttachments(restored);
      markMissingRestoredFiles(restored, draftIdentity);
      setPreparingAttachments([]);
      setRefusedSend(false);
      return;
    }
    if (!draftKey || !draftProvenance) return;
    if (clearedSendRef.current?.handedOver === 'mirrored') return;
    const draftAttachments = [
      ...queuedFollowUps.flatMap((item) => item.attachments),
      ...attachments,
    ];
    const storedText = storedDraftText(queuedFollowUps, text);
    if (draftAttachments.length > 0) {
      setDraft(draftKey, storedText, draftProvenance, draftAttachments);
    } else {
      setDraft(draftKey, storedText, draftProvenance);
    }
  }, [
    attachments,
    draftIdentity,
    draftKey,
    draftProvenance,
    markMissingRestoredFiles,
    queuedFollowUps,
    text,
    updateText,
  ]);

  // The field's own layout effect has already sent the requested caret with
  // the text it belongs to, so the request ends with that commit. Kept any
  // longer, React Native would send it again whenever the person moves the
  // caret, and the caret would jump back.
  useLayoutEffect(() => {
    if (caretRequest) setCaretRequest(undefined);
  }, [caretRequest]);

  useEffect(() => {
    markMissingRestoredFiles(attachmentsRef.current, previousDraftIdentityRef.current);
  }, [markMissingRestoredFiles]);

  useEffect(() => {
    mountedRef.current = true;
    const prepared = preparedPastedFilesRef.current;
    return () => {
      mountedRef.current = false;
      removePastedTextFiles([...prepared.values()]);
      prepared.clear();
    };
  }, []);

  useEffect(() => {
    if (!text.trim() && attachments.length === 0) setRefusedSend(false);
  }, [attachments.length, text]);

  useEffect(() => {
    onRefusedSendChange?.(refusedSend);
  }, [onRefusedSendChange, refusedSend]);

  useEffect(() => () => onRefusedSendChange?.(false), [onRefusedSendChange]);

  const prefillKey = conversationId ?? draftKey ?? '';
  const pendingPrefill = useComposerPrefillStore((state) => state.pending[prefillKey]);

  useEffect(() => {
    if (pendingPrefill === undefined) return;
    updateText((current) => mergePrefill(current, pendingPrefill));
    useComposerPrefillStore.getState().consume(prefillKey);
    inputRef.current?.focus();
  }, [pendingPrefill, prefillKey, updateText]);

  const handOver = useComposerHandOverStore((state) =>
    conversationId ? state.pending[conversationId] : undefined,
  );

  useEffect(() => {
    if (!conversationId || !handOver) return;
    const taken = updateHandOver(conversationId, () => undefined);
    if (!taken) return;
    const arrived = `${taken.take?.() ?? ''}${taken.typed}`;
    if (arrived) {
      updateText((current) => `${current}${arrived}`);
      const end = textRef.current.length;
      setCaretRequest({ start: end, end });
    }
    if (taken.focus || arrived) inputRef.current?.focus();
  }, [conversationId, handOver, updateText]);

  const hasText = text.trim().length > 0;

  useEffect(() => {
    onHasTextChange?.(hasText);
  }, [hasText, onHasTextChange]);

  useEffect(() => () => onHasTextChange?.(false), [onHasTextChange]);

  const uploads = useUploadLifecycleStore((state) => state.uploads);
  const attachmentUploadPhase = useMemo<ComposerUploadPhase>(() => {
    const entries = attachments.map((a) => uploads[a.id]).filter(Boolean);
    if (entries.some(isUploadInFlight)) return 'uploading';
    if (entries.some((entry) => entry.phase === 'failed' || entry.phase === 'canceled'))
      return 'unsent';
    return 'settled';
  }, [attachments, uploads]);

  const sendComposerMessage = useCallback(
    (sourceText: string) => {
      if (sendPendingRef.current || usageBlocked) return;
      const trimmed = sourceText.trim();
      if (!trimmed && attachments.length === 0) return;
      const missing = attachments.filter((a) => a.unavailable);
      if (missing.length > 0) {
        Alert.alert(
          missing.length === 1 ? 'File no longer available' : 'Files no longer available',
          `${missing.map((a) => a.fileName).join('\n')}\n\nRemove ${missing.length === 1 ? 'it' : 'them'} or attach again, then send.`,
        );
        return;
      }
      if (attachmentUploadPhase === 'uploading') {
        heldSendRef.current = sourceText;
        setSendHeld(true);
        return;
      }
      const pastedChips = attachments.filter((a) => a.pastedText);
      const attachedChipIndexes =
        appMode === 'cloud'
          ? pastedBlocksToAttach(
              pastedChips.map((chip) => chip.pastedText ?? ''),
              trimmed,
              isFreeQuotaTurnModelId(selectedModel)
                ? MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH
                : cloudLatestMessageMaxChars,
            )
          : new Set<number>();
      const chipsToAttach = pastedChips.filter((_, index) => attachedChipIndexes.has(index));
      const attachedChipIds = new Set(chipsToAttach.map((chip) => chip.id));
      for (const [chipId, file] of preparedPastedFilesRef.current) {
        if (attachedChipIds.has(chipId)) continue;
        preparedPastedFilesRef.current.delete(chipId);
        removePastedTextFiles([file]);
      }
      const unpreparedChips = chipsToAttach.filter(
        (chip) => !preparedPastedFilesRef.current.has(chip.id),
      );
      if (unpreparedChips.length > 0) {
        sendPendingRef.current = true;
        const staged = [
          ...attachments.filter((a) => !a.pastedText),
          ...preparedPastedFilesRef.current.values(),
        ];
        void preparePastedTextFiles(unpreparedChips, staged, subscriptionTier)
          .then((prepared) => {
            sendPendingRef.current = false;
            if (!prepared) return;
            unpreparedChips.forEach((chip, index) =>
              preparedPastedFilesRef.current.set(chip.id, prepared[index]!),
            );
            if (textRef.current !== sourceText) return;
            sendComposerMessageRef.current(sourceText);
          })
          .catch(() => {
            sendPendingRef.current = false;
            Alert.alert(
              'Pasted text not attached',
              'Your message is still here. Try sending again.',
            );
          });
        return;
      }

      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      const pastedFiles = chipsToAttach.flatMap((chip) => {
        const file = preparedPastedFilesRef.current.get(chip.id);
        preparedPastedFilesRef.current.delete(chip.id);
        return file ? [file] : [];
      });
      const fileAttachments = [...attachments.filter((a) => !a.pastedText), ...pastedFiles];
      const outgoing = [
        ...pastedChips
          .filter((_, index) => !attachedChipIndexes.has(index))
          .map((chip) => chip.pastedText),
        trimmed,
      ]
        .filter(Boolean)
        .join(PASTED_BLOCK_SEPARATOR);

      if (isStreaming) {
        queuedFollowUpSeqRef.current += 1;
        const queued: QueuedFollowUp = {
          id: `followup-${queuedFollowUpSeqRef.current}`,
          text: outgoing,
          attachments: fileAttachments,
        };
        queuedFollowUpsRef.current = [...queuedFollowUpsRef.current, queued];
        setQueuedFollowUps(queuedFollowUpsRef.current);
        clearedSendRef.current = sentTextEcho(sourceText);
        updateText('');
        setCaretRequest(undefined);
        setAttachments([]);
        return;
      }

      const sentText = sourceText;
      const sentDraftIdentity = previousDraftIdentityRef.current;
      const sentAttachmentIds = new Set(attachments.map((a) => a.id));
      const unsentBeforeIds = new Set(attachments.filter((a) => a.sendFailed).map((a) => a.id));
      const markSendFailed = () => {
        setRefusedSend(true);
        setAttachments((current) =>
          current.map((a) => (sentAttachmentIds.has(a.id) ? { ...a, sendFailed: true } : a)),
        );
      };
      const restoreUnsentMarks = () => {
        setAttachments((current) =>
          current.map((a) => (unsentBeforeIds.has(a.id) ? { ...a, sendFailed: true } : a)),
        );
      };
      const restoreSentText = () => {
        if (mountedRef.current && previousDraftIdentityRef.current === sentDraftIdentity) {
          clearedSendRef.current = null;
          updateText((current) => (current.trim() ? `${sentText}\n\n${current}` : sentText));
          return;
        }
        if (!draftKey || !draftProvenance) return;
        const kept = getDraft(draftKey, draftProvenance);
        setDraft(
          draftKey,
          kept.trim() ? `${sentText}\n\n${kept}` : sentText,
          draftProvenance,
          draftAttachmentsFor(draftKey, draftProvenance),
        );
      };
      const releaseHandOver = () => {
        const target = handOverTargetRef.current;
        if (target) withdrawHandOverTake(target);
        if (clearedSendRef.current?.handedOver) {
          clearedSendRef.current = null;
          updateText('');
        }
      };
      const outgoingAttachments =
        fileAttachments.length > 0
          ? fileAttachments.map(({ sendFailed: _sendFailed, ...rest }) => rest)
          : undefined;
      sendPendingRef.current = true;
      setAttachments((current) =>
        current.map((a) => (a.sendFailed ? { ...a, sendFailed: false } : a)),
      );
      clearedSendRef.current = sentTextEcho(sentText);
      updateText('');
      setCaretRequest(undefined);
      handOverSourceRef.current = {
        text: sentText,
        identity: sentDraftIdentity,
        focus: inputRef.current?.isFocused() === true || keyboardVisibleRef.current,
      };
      handOverTargetRef.current = null;

      let pendingSend: Promise<ComposerSendOutcome>;
      try {
        pendingSend = Promise.resolve(onSend(outgoing, outgoingAttachments));
      } catch (error) {
        pendingSend = Promise.reject(error);
      }
      pendingSend
        .then((outcome) => {
          if (outcome === false || outcome === 'declined') {
            if (outcome === 'declined' || wasCloudUploadDeclined(outgoingAttachments)) {
              restoreUnsentMarks();
            } else {
              const pastedFailure = pastedTextUploadFailure(pastedFiles);
              if (pastedFailure) Alert.alert('Pasted text not sent', pastedFailure);
              markSendFailed();
            }
            releaseHandOver();
            restoreSentText();
            return;
          }
          clearDraft(draftKey, draftProvenance);
          setRefusedSend(false);
          if (previousDraftIdentityRef.current !== sentDraftIdentity) return;
          const openedConversationId = openedConversationIdOf(outcome);
          if (openedConversationId && openedConversationId !== conversationId) {
            const typedAfterSend = textRef.current;
            const echo = clearedSendRef.current;
            if (echo?.handedOver && echo.handedTo === openedConversationId) {
              clearedSendRef.current = {
                ...echo,
                at: Date.now(),
                handed: typedAfterSend,
                handedOver: 'cleared',
              };
              inputRef.current?.blur();
            } else {
              const offered = withdrawHandOverTake(openedConversationId);
              clearedSendRef.current = {
                text: echo?.text ?? sentText,
                at: Date.now(),
                exact: echo?.exact ?? true,
                handedTo: openedConversationId,
                handed: typedAfterSend,
              };
              prefillComposer(openedConversationId, typedAfterSend);
              if (!offered?.focus) inputRef.current?.blur();
            }
            updateText('');
          }
          setAttachments((current) => current.filter((a) => !sentAttachmentIds.has(a.id)));
        })
        .catch(() => {
          markSendFailed();
          releaseHandOver();
          restoreSentText();
        })
        .finally(() => {
          sendPendingRef.current = false;
          const target = handOverTargetRef.current;
          if (target) withdrawHandOverTake(target);
          handOverSourceRef.current = null;
          handOverTargetRef.current = null;
          removePastedTextFiles(fileAttachments);
          for (const file of pastedFiles) useUploadLifecycleStore.getState().clear(file.id);
        });
    },
    [
      appMode,
      attachments,
      attachmentUploadPhase,
      cloudLatestMessageMaxChars,
      subscriptionTier,
      onSend,
      hapticsEnabled,
      conversationId,
      draftKey,
      draftProvenance,
      isStreaming,
      selectedModel,
      usageBlocked,
      updateText,
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

  sendComposerMessageRef.current = sendComposerMessage;

  const handleSend = useCallback(() => {
    sendComposerMessage(textRef.current);
  }, [sendComposerMessage]);

  const returnQueuedToComposer = useCallback(
    (item: QueuedFollowUp, unsent: boolean) => {
      if (unsent) setRefusedSend(true);
      updateText((current) => (current ? `${item.text}\n\n${current}` : item.text));
      if (item.attachments.length > 0) {
        setAttachments((current) => [
          ...item.attachments.map((attachment) =>
            unsent ? { ...attachment, sendFailed: true } : attachment,
          ),
          ...current,
        ]);
      }
    },
    [updateText],
  );

  const cancelQueuedFollowUp = useCallback((id: string) => {
    removePastedTextFiles(queuedFollowUpsRef.current.find((item) => item.id === id)?.attachments);
    queuedFollowUpsRef.current = queuedFollowUpsRef.current.filter((item) => item.id !== id);
    setQueuedFollowUps(queuedFollowUpsRef.current);
  }, []);

  const editQueuedFollowUp = useCallback(
    (item: QueuedFollowUp) => {
      queuedFollowUpsRef.current = queuedFollowUpsRef.current.filter(
        (queued) => queued.id !== item.id,
      );
      setQueuedFollowUps(queuedFollowUpsRef.current);
      updateText((current) =>
        current
          ? `${item.text}

${current}`
          : item.text,
      );
      if (item.attachments.length > 0) {
        setAttachments((current) => [...item.attachments, ...current]);
      }
      inputRef.current?.focus();
    },
    [updateText],
  );

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
            if (accepted === false || accepted === 'declined') {
              returnQueuedToComposer(
                next,
                accepted !== 'declined' && !wasCloudUploadDeclined(next.attachments),
              );
              return;
            }
            removePastedTextFiles(next.attachments);
          })
          .catch(() => returnQueuedToComposer(next, true));
      }
    }
    wasStreamingRef.current = streaming;
  }, [isStreaming, onSend, returnQueuedToComposer]);

  const handleChangeText = useCallback(
    (next: string) => {
      const current = textRef.current;
      const echo = clearedSendRef.current;
      clearedSendRef.current = null;
      if (echo !== null) {
        const now = Date.now();
        if (
          echo.handedOver &&
          echo.handedTo !== undefined &&
          now - echo.at <= SENT_TEXT_ECHO_WINDOW_MS
        ) {
          const shown = textAfterEcho(next, echo) ?? next;
          const handed = echo.handed ?? '';
          const mirrored = echo.handedOver === 'mirrored';
          let fresh = shown;
          if (mirrored) fresh = shown.length > handed.length ? shown.slice(handed.length) : '';
          else if (handed && shown.startsWith(handed)) fresh = shown.slice(handed.length);
          forwardHandOver(echo.handedTo, fresh);
          clearedSendRef.current = { ...echo, at: now, handed: shown };
          if (mirrored) updateText(shown);
          return;
        }
        let typedOn = typedAfterSentEcho(next, current, echo, now);
        if (
          typedOn === null &&
          echo.handedTo !== undefined &&
          echo.handed &&
          now - echo.at <= SENT_TEXT_ECHO_WINDOW_MS &&
          next.startsWith(echo.handed)
        ) {
          typedOn = next;
        }
        if (typedOn !== null) {
          const head = next.slice(0, next.length - typedOn.length);
          const seen: SentTextEcho = {
            ...echo,
            text: head.trim() ? head : echo.text,
            at: now,
            exact: true,
          };
          if (echo.handedTo === undefined) {
            clearedSendRef.current = seen;
            updateText(typedOn);
            setCaretRequest({ start: typedOn.length, end: typedOn.length });
            return;
          }
          const handed = echo.handed ?? '';
          const stillPending =
            useComposerPrefillStore.getState().pending[echo.handedTo] !== undefined;
          prefillComposer(
            echo.handedTo,
            stillPending || !typedOn.startsWith(handed) ? typedOn : typedOn.slice(handed.length),
          );
          clearedSendRef.current = { ...seen, handed: typedOn || handed };
          return;
        }
      }
      const inserted = next.length - current.length;
      if (inserted >= LARGE_PASTE_THRESHOLD) {
        let prefix = 0;
        while (
          prefix < current.length &&
          prefix < next.length &&
          current[prefix] === next[prefix]
        ) {
          prefix++;
        }
        let suffix = 0;
        while (
          suffix < current.length - prefix &&
          suffix < next.length - prefix &&
          current[current.length - 1 - suffix] === next[next.length - 1 - suffix]
        ) {
          suffix++;
        }
        const pasted = next.slice(prefix, next.length - suffix);
        if (isLargePaste(pasted)) {
          const id = `pasted-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          updateText(next.slice(0, prefix) + next.slice(next.length - suffix));
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
      updateText(next);
    },
    [updateText],
  );

  const discardPreparedPastedFile = useCallback((chipId: string) => {
    const prepared = preparedPastedFilesRef.current.get(chipId);
    if (!prepared) return;
    preparedPastedFilesRef.current.delete(chipId);
    removePastedTextFiles([prepared]);
  }, []);

  const handleExpandPastedText = useCallback(
    (id: string) => {
      discardPreparedPastedFile(id);
      const pasted = attachmentsRef.current.find((a) => a.id === id)?.pastedText;
      if (pasted) {
        updateText((t) => (t ? `${t}\n\n${pasted}` : pasted));
        setAttachments((prev) => prev.filter((a) => a.id !== id));
      }
      inputRef.current?.focus();
    },
    [discardPreparedPastedFile, updateText],
  );

  const handleRemoveAttachment = useCallback(
    (id: string) => {
      discardPreparedPastedFile(id);
      removePastedTextFiles(attachmentsRef.current.filter((a) => a.id === id));
      useUploadLifecycleStore.getState().clear(id);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    },
    [discardPreparedPastedFile],
  );

  const handleDismissPreparing = useCallback((id: string) => {
    setPreparingAttachments((current) => current.filter((item) => item.id !== id));
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
    setLiveTranscript('');
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
      setLiveTranscript('');
      if (!cleanupVoiceDictation(transcribedText)) {
        handleDictationFailure();
        return;
      }
      if (intent === 'send') {
        const merged = mergeTranscript(textRef.current, transcribedText);
        updateText(merged);
        sendComposerMessage(merged);
      } else applyTranscript(transcribedText);
    },
    [applyTranscript, handleDictationFailure, sendComposerMessage, updateText],
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

  const handleProcessingChange = useCallback((processing: boolean) => {
    setIsTranscribing(processing);
    if (!processing) setLiveTranscript('');
  }, []);

  const handleDictationCancel = useCallback(() => {
    voiceControlRef.current?.cancel();
    resetRecordingUi();
    setIsTranscribing(false);
    setLiveTranscript('');
  }, [resetRecordingUi]);

  const endFieldHold = useCallback(() => {
    const hold = fieldHoldRef.current;
    if (hold?.timer) clearTimeout(hold.timer);
    fieldHoldRef.current = null;
    setFieldHoldActive(false);
    return hold;
  }, []);

  useEffect(
    () => () => {
      const hold = fieldHoldRef.current;
      if (hold?.timer) clearTimeout(hold.timer);
    },
    [],
  );

  const handleFieldHoldGrant = useCallback(() => {
    const hold: FieldHold = { timer: null, engaged: false, outside: false };
    hold.timer = setTimeout(() => {
      hold.timer = null;
      if (fieldHoldRef.current !== hold || hold.outside) return;
      hold.engaged = true;
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      voiceControlRef.current?.hold();
    }, HOLD_TO_TALK_THRESHOLD_MS);
    fieldHoldRef.current = hold;
    setFieldHoldActive(true);
  }, [hapticsEnabled]);

  const handleFieldHoldMove = useCallback(
    (event: GestureResponderEvent) => {
      const hold = fieldHoldRef.current;
      if (!hold || !textFrame) return;
      const { locationX, locationY } = event.nativeEvent;
      hold.outside =
        locationX < -FIELD_HOLD_RETENTION ||
        locationY < -FIELD_HOLD_RETENTION ||
        locationX > textFrame.width + FIELD_HOLD_RETENTION ||
        locationY > textFrame.height + FIELD_HOLD_RETENTION;
    },
    [textFrame],
  );

  const handleFieldHoldRelease = useCallback(() => {
    const hold = endFieldHold();
    if (!hold) return;
    if (hold.engaged) {
      if (hold.outside) handleDictationCancel();
      else voiceControlRef.current?.stop('insert');
      return;
    }
    if (!hold.outside) inputRef.current?.focus();
  }, [endFieldHold, handleDictationCancel]);

  const handleFieldHoldTerminate = useCallback(() => {
    if (endFieldHold()?.engaged) handleDictationCancel();
  }, [endFieldHold, handleDictationCancel]);

  const handleInputFocus = useCallback(() => setInputFocused(true), []);
  const handleInputBlur = useCallback(() => setInputFocused(false), []);

  useEffect(() => {
    if (voiceHoldAvailable) setInputFocused(inputRef.current?.isFocused() === true);
  }, [voiceHoldAvailable]);

  const handleTextBlockLayout = useCallback((event: LayoutChangeEvent) => {
    const frame = event.nativeEvent.layout;
    if (frame.width > 0 && frame.height > 0) setTextFrame(frame);
  }, []);

  const handleDictationStop = useCallback(() => {
    voiceControlRef.current?.stop('insert');
  }, []);

  const handleDictationSend = useCallback(() => {
    voiceControlRef.current?.stop('send');
  }, []);

  const handleVoiceError = useCallback(
    (message: string, permissionDenied?: boolean) => {
      resetRecordingUi();
      setLiveTranscript('');
      setVoiceResetSignal((value) => value + 1);
      if (permissionDenied) showVoicePermissionAlert(message);
      else Alert.alert('Voice input unavailable', message);
    },
    [resetRecordingUi],
  );

  const isMultiline =
    text.length > 0 &&
    singleLineHeight > 0 &&
    contentHeight > singleLineHeight * WRAPPED_CONTENT_IN_LINES;

  const hasContent = text.trim().length > 0 || attachments.length > 0;
  const dictating = isRecording || isTranscribing;
  const effortValue =
    appMode === 'cloud' && mediaMode === 'text' && composerEffort.steps.length > 1
      ? composerEffort.value
      : undefined;
  const effortPanelOpen =
    effortValue !== undefined && !dictating && effortOpenForModel === selectedModel;
  const multiline = isMultiline && !dictating && !effortPanelOpen;
  const livePreview =
    dictating && cleanupVoiceDictation(liveTranscript) ? mergeTranscript(text, liveTranscript) : '';
  const holdToTalkOffered = voiceAllowed && voiceHoldAvailable;
  const holdToTalkReady =
    textFrame !== null &&
    holdToTalkOffered &&
    !keyboardVisible &&
    !inputFocused &&
    !dictating &&
    !effortPanelOpen;
  const fieldHoldOverlayFrame =
    textFrame && (fieldHoldActive || (holdToTalkReady && text.length === 0)) ? textFrame : null;

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
        updateText('/image ');
        inputRef.current?.focus();
        return;
      }
      updateText('');
      if (command === '/voice') onOpenVoiceMode?.();
      if (command === '/compare') onOpenCompare?.();
      if (command === '/export') onOpenExport?.();
    },
    [onOpenCompare, onOpenExport, onOpenVoiceMode, updateText],
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
            : holdToTalkReady
              ? 'Type or hold to talk'
              : "What's on your mind?";

  const attachmentStrip = (
    <AttachmentPreview
      attachments={attachments}
      onRemove={handleRemoveAttachment}
      onExpandPastedText={handleExpandPastedText}
      onRetryUpload={handleRetryUpload}
      privacyShortLabel={attachmentPrivacyShortLabel}
      preparing={preparingAttachments}
      onDismissPreparing={handleDismissPreparing}
      numberImages={mediaMode !== 'text'}
    />
  );

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

      {dictating ? attachmentStrip : null}

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
          {unreadableImagesNotice({
            selectedModelId: selectedModel,
            selectedModelName: selectedModelMetadata?.name ?? modelName,
            executionMode: appMode,
            subscriptionTier,
            message: text,
            attachments,
          })}
        </Text>
      ) : null}

      {mentionQuery !== null && FEATURES.skills && clerkUserId ? (
        <SkillMentionPalette
          query={mentionQuery}
          onSelect={(skill) => {
            updateText((current) => withoutTrailingMention(current));
            selectSkill({
              ownerId: clerkUserId,
              name: skill.name,
              ...(skill.requiredTools ? { requiredTools: skill.requiredTools } : {}),
            });
            enableSkillCodeExecution(skill.requiredTools);
          }}
        />
      ) : null}

      {mentionQuery !== null ? (
        <FileMentionPalette
          destinationKey={draftIdentity}
          query={mentionQuery}
          onSelect={(attachment) => {
            updateText((current) => withoutTrailingMention(current));
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
          alignItems: livePreview ? 'flex-end' : 'center',
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
          testID="chat.composer.card"
          style={{
            flex: 1,
            flexDirection: dictating && !livePreview ? 'row' : 'column',
            alignItems: dictating && !livePreview ? 'center' : 'stretch',
            backgroundColor: themeColors.surfaceElevated,
            borderRadius: dictating && !livePreview ? radii.full : radii['2xl'],
            borderWidth: CARD_BORDER_WIDTH,
            borderColor: themeColors.composerBorder,
            paddingLeft: dictating ? DICTATION_CARD_PADDING.horizontal : CARD_PADDING.left,
            paddingRight: dictating ? DICTATION_CARD_PADDING.horizontal : CARD_PADDING.right,
            paddingTop: dictating ? DICTATION_CARD_PADDING.vertical : CARD_PADDING.top,
            paddingBottom: dictating ? DICTATION_CARD_PADDING.vertical : CARD_PADDING.bottom,
            minHeight: 44,
          }}
        >
          {livePreview ? (
            <ScrollView
              ref={liveTranscriptScrollRef}
              testID="chat.composer.live-transcript"
              accessible={isTranscribing || undefined}
              accessibilityRole={isTranscribing ? 'alert' : undefined}
              accessibilityLabel={isTranscribing ? `Transcribing, ${livePreview}` : undefined}
              accessibilityLiveRegion={isTranscribing ? 'polite' : undefined}
              style={{
                maxHeight:
                  (singleLineHeight || chatTypography.body.lineHeight) * LIVE_TRANSCRIPT_MAX_LINES,
                marginLeft: CARD_PADDING.left - DICTATION_CARD_PADDING.horizontal,
                marginRight: CARD_PADDING.right - DICTATION_CARD_PADDING.horizontal,
                marginTop: CARD_PADDING.top - DICTATION_CARD_PADDING.vertical,
                marginBottom: isRecording ? 0 : CARD_PADDING.top - DICTATION_CARD_PADDING.vertical,
              }}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() =>
                liveTranscriptScrollRef.current?.scrollToEnd({ animated: false })
              }
            >
              <Text
                maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
                style={{ color: themeColors.textPrimary, ...chatTypography.body }}
              >
                {livePreview}
              </Text>
            </ScrollView>
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
          ) : isTranscribing && !livePreview ? (
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

          {/* Attachments sit inside the card, above the text, as they do in
              ChatGPT and Claude (founder, 2026-11-14). The dictation pill has
              no room for them, so they stay above it while recording. */}
          {dictating || effortPanelOpen ? null : attachmentStrip}

          <View
            onLayout={handleTextBlockLayout}
            style={{
              alignSelf: 'stretch',
              display: dictating || effortPanelOpen ? 'none' : 'flex',
            }}
          >
            {/* Android 14 scales large text sizes non-linearly, so one line's
                height is read from the platform rather than multiplied out. */}
            <Text
              testID="chat.composer.line-probe"
              numberOfLines={1}
              maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              onLayout={(event) => setSingleLineHeight(event.nativeEvent.layout.height)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                opacity: 0,
                ...chatTypography.body,
              }}
            >
              I
            </Text>
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
              }}
              placeholder={placeholder}
              placeholderTextColor={themeColors.textMuted}
              maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
              value={text}
              selection={caretRequest}
              onChangeText={handleChangeText}
              onFocus={holdToTalkOffered ? handleInputFocus : undefined}
              onBlur={holdToTalkOffered ? handleInputBlur : undefined}
              onContentSizeChange={(event) =>
                setContentHeight(event.nativeEvent.contentSize.height)
              }
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
            {/* Expand to a full-screen editor. Pinned to the text block's
              top-right corner and shown only once the text wraps, matching the
              reference's appearance threshold (IMG_0672), one line has nothing
              to expand. The wrapped TextInput reserves room for it on the right
              so the first line never runs underneath the glyph. */}
            {multiline ? (
              <PressableBox
                onPress={handleExpandEditor}
                style={{
                  position: 'absolute',
                  top: EXPAND_BUTTON_OFFSET.top,
                  right: EXPAND_BUTTON_OFFSET.right,
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
          </View>

          {/* Hold the empty field to talk. It lies over the field so the
              platform's own long press (loupe, paste menu) never starts, and it
              stays mounted at the field's frame until release, because the
              field itself is hidden once dictation begins. */}
          {fieldHoldOverlayFrame ? (
            <View
              testID="chat.composer.hold-to-talk"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              onStartShouldSetResponder={() => true}
              onResponderTerminationRequest={() => fieldHoldRef.current?.engaged !== true}
              onResponderGrant={handleFieldHoldGrant}
              onResponderMove={handleFieldHoldMove}
              onResponderRelease={handleFieldHoldRelease}
              onResponderTerminate={handleFieldHoldTerminate}
              style={{
                position: 'absolute',
                left: fieldHoldOverlayFrame.x - CARD_BORDER_WIDTH,
                top: fieldHoldOverlayFrame.y - CARD_BORDER_WIDTH,
                width: fieldHoldOverlayFrame.width,
                height: fieldHoldOverlayFrame.height,
              }}
            />
          ) : null}

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
                onProcessingChange={handleProcessingChange}
                onTranscription={handleTranscription}
                onPartialTranscript={setLiveTranscript}
                onHoldAvailableChange={setVoiceHoldAvailable}
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
