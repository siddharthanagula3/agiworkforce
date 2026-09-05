'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  useSyncExternalStore,
  memo,
} from 'react';
import {
  Plus,
  X,
  Clock,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Check,
  Image as ImageIcon,
  Video,
  FileText,
  Terminal,
  Folder,
  FolderOpen,
  Telescope,
  ListChecks,
  LibraryBig,
  Monitor,
  Brain,
} from '@agiworkforce/icons';
import { cn } from '@shared/lib/utils';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import { SlashCommandMenu, type SlashCommandMenuHandle } from './SlashCommandMenu';
import { useSettingsModal } from '@features/settings/components/SettingsModalProvider';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { SendButton } from './SendButton';
import { ComposerInput } from './ComposerInput';
import { ComposerFooter } from './ComposerFooter';
import { OfficialConnectorLogo } from '@/features/connectors/components/OfficialConnectorLogo';
import { DragDropOverlay } from './DragDropOverlay';
import { VoiceInputButton } from './VoiceInputButton';
import { VoiceEntryButton } from './VoiceEntryButton';
import { DictationStrip } from './DictationStrip';
import { useDictation } from '@features/chat/hooks/use-dictation';
import { AttachmentPreview } from './AttachmentPreview';
import { AnchoredComposerMenu } from './AnchoredComposerMenu';
import { ComposerPlusMenu, PluginsGlyph } from './ComposerPlusMenu';
import { getAcceptAttribute, useAttachments } from '@features/chat/hooks/use-attachments';
import { isChatImageMimeType } from '@/lib/chat-attachment-policy';
import { useSkillsList, type SkillItem } from '@features/chat/hooks/use-skills-list';
import { useMediaModelAvailability } from '@features/chat/hooks/use-media-model-availability';
import {
  useChatStore,
  DEFAULT_COMPOSER_TOGGLES,
  PENDING_CONVERSATION_KEY,
  selectDraftContent,
  selectParkedSends,
  firstParkedSend,
  type ComposerToggleState,
} from '@shared/stores/web-chat-store';
import { useModelStore } from '@shared/stores/model-store';
import {
  getAllowedAutoModesForTier,
  getModelMetadata,
  getSelectableModels,
  isModelAllowedForTier,
  isAutoModeModelId,
} from '@shared/config/llm';
import { useThinkingStore } from '@shared/stores/thinking-store';
import { useStyleStore, getStyleInstruction } from '@features/chat/stores/style-store';
import { containsSecrets } from '@/lib/security/secrets-audit';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  canUseBillingPlanCapability,
  getModels,
  isExecutableVideoModel,
  isFreeBillingPlanTier,
  type CloudWorkMode,
  type SendPreviewPresentation,
} from '@agiworkforce/types';
import { isWebSearchAvailable } from '@/lib/web-search-support';
import { isMemoryCapabilityEnabled } from '@/lib/runtime/memory-capability';
import {
  BUILT_IN_SLASH_COMMANDS,
  decideComposerPaste,
  matchMentionQuery,
  useCapability,
} from '@agiworkforce/unified-chat';
import type {
  ComposerAttachmentPasteDecision,
  ComposerEditorHandle,
  ComposerMentionCommit,
  ComposerMentionConfig,
} from '@agiworkforce/unified-chat/composer-editor';
import {
  clearPendingDraft,
  parkPendingDraft,
  restorablePendingDraft,
} from '@features/chat/lib/pending-composer-draft';
import { modelSupportsResearch } from '@features/chat/lib/research-capability-gate';
import { useCoworkFolderStore, supportsDirectoryPicker } from '@shared/stores/cowork-folder-store';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH } from '@agiworkforce/cloud-contracts';
import { buildAgiWorkGoalInput, type AgiWorkGoalInput } from '@/features/chat/utils/agiwork-plan';
import {
  getImageAspectOptionsForModel,
  IMAGE_MODEL_DEFAULT,
  IMAGE_MODELS,
  isImageAspectRatioSupported,
  type ImageAspectRatio,
} from '../../lib/imageGenerationOptions';
import { getVideoAspectOptionsForModel, getVideoQualityOptionsForModel } from '@agiworkforce/types';
import {
  consumePendingMcpContextSelection,
  MCP_CONTEXT_SELECTED_EVENT,
  type McpContextSelection,
} from '@/features/connectors/lib/mcp-context-selection';
import { useConnectors } from '@/features/connectors/hooks/use-connectors';
import { CONNECTORS } from '@/features/connectors/data/connectors';

export {
  getImageAspectOptionsForModel,
  IMAGE_MODEL_DEFAULT,
  IMAGE_MODELS,
  isImageAspectRatioSupported,
  type ImageAspectOption,
  type ImageAspectRatio,
  type ImageModelOption,
} from '../../lib/imageGenerationOptions';

/**
 * AUDIT-FIX CMP-32: the composer had no `maxLength`, no character counter and
 * no budget warning, so an over-long message was only rejected server-side
 * after the user had written it. This is the SAME ceiling the managed-cloud
 * message contract enforces (`ManagedCloudCreateMessageRequestSchema`), not a
 * second hand-picked number.
 */
const COMPOSER_MAX_CHARS = MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH;
/** Show the counter only once the message is long enough for it to matter. */
const COMPOSER_COUNTER_THRESHOLD = Math.floor(COMPOSER_MAX_CHARS * 0.75);

export type ComposerWorkMode = CloudWorkMode;

type ComposerSendArgs = [
  content: string,
  attachments?: File[],
  skillId?: string,
  meta?: ComposerSendMeta,
];

interface QueuedFollowUp {
  id: string;
  conversationId: string | null;
  args: ComposerSendArgs;
  preview: string;
  toolsLabel: string | null;
}

const WORK_MODE_LABELS: Record<ComposerWorkMode, string> = {
  chat: 'Chat',
  agiwork: 'AGI Work',
};

const WORK_MODE_TITLES: Record<ComposerWorkMode, string> = {
  chat: 'Chat: quick questions and conversation',
  agiwork: 'AGI Work: multi-step tasks with tools, files, and reviewable deliverables',
};

/**
 * Placeholder copy per work mode.
 *
 * AUDIT-FIX shell-nav-ia-gap-03: the Chat | AGI Work toggle was fully wired
 * (mode → send meta → conversation creation) but the textarea placeholder
 * branched only on isTurnActive/imageMode/videoMode, so flipping to AGI Work
 * changed nothing the user could read inside the input. claude.ai's equivalent
 * Chat/Cowork axis re-writes its prompt on toggle; this is that missing signal.
 * `chat` is null so the caller-supplied `placeholder` prop still wins there.
 */
const WORK_MODE_PLACEHOLDERS: Record<ComposerWorkMode, string | null> = {
  chat: null,
  agiwork: 'Describe a multi-step task and what it should deliver',
};

/**
 * While a response runs the field is for the next turn, not for a rule about
 * when it will be sent. The queueing behaviour is unchanged; the chip on the
 * send control is what says a message is waiting.
 */
const TURN_ACTIVE_PLACEHOLDER = 'Follow up';

/**
 * The chip on the send control already says a message is waiting, so this row
 * only has to name which message and keep its Edit and Cancel reachable.
 */
const QUEUED_ROW_LEAD = 'Queued';

const WORK_BAR_LABELS = {
  project: 'Project',
  files: 'Files',
  plugins: 'Plugins',
  desktop: 'Open desktop app',
} as const;

const WORK_BAR_CONNECTOR_MARKS = 3;
const CONNECTOR_MARK_FALLBACK_BG = 'from-muted to-muted';
const DESKTOP_APP_HREF = '/download';
const WORK_BAR_ITEM_CLASS =
  'flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50';
const WORK_BAR_ITEM_ACTIVE_CLASS = 'text-foreground';
const WORK_BAR_GLYPH_CLASS = 'h-3.5 w-3.5 shrink-0';

// One shared empty array for "this conversation has no disabled connectors",
// so the store selector returns a stable reference and cannot loop under
// useSyncExternalStore (mirrors EMPTY_MESSAGES in the chat store).
const EMPTY_DISABLED_CONNECTOR_IDS: string[] = [];
const EMPTY_PALETTE_FOLDERS: ComposerProjectPicker['projects'] = [];

export interface ComposerSendMeta {
  /** Active mode at send time. 'agiwork' = project-scoped work chat. */
  workMode: ComposerWorkMode;
  /** Project scoping the send (threads into conversation creation). */
  projectId: string | null;
  webSearchEnabled?: boolean;
  thinkingEnabled?: boolean;
  codeExecutionEnabled?: boolean;
  officeCreationEnabled?: boolean;
  /** Deep Research mode: server injects research system prompt and forces web search. */
  researchEnabled?: boolean;
  /** Resolved Response-Style instruction (preset or custom) from StyleSelector. */
  styleInstruction?: string;
  /** Exact server-catalog skill name; the server resolves and loads its body. */
  skillName?: string;
  /** Explicit user-selected MCP Prompt/Resources for this one turn. */
  mcpContext?: McpContextSelection;
  /** CAP-048: structured AGI Work goal captured by the composer. */
  agiWorkGoal?: AgiWorkGoalInput;
  /** Connector ids switched off for this conversation; their tools are not offered to the model. */
  disabledConnectorIds?: string[];
  /** Per-chat Memory override. False skips injecting and writing account memories for this turn. */
  memoryEnabled?: boolean;
}

interface ChatComposerProps {
  onSend: (
    content: string,
    attachments?: File[],
    skillId?: string,
    meta?: ComposerSendMeta,
  ) => void | false | typeof SEND_GUARD_BLOCKED;
  /**
   * Conversation this composer is currently editing for (`null` on the
   * new-chat surface).
   *
   * AUDIT-FIX STR-8/BUG-15: the follow-up queue captures this at queue time, so
   * a message composed for chat A can never be flushed into chat B by the
   * `isTurnActive` true->false edge that navigating away produces.
   * AUDIT-FIX STR-23: the half-typed input is parked under this id and restored
   * per conversation, instead of following the user into the next chat.
   */
  conversationId?: string | null;
  isLoading?: boolean;
  /**
   * True while an SSE stream is actively generating output.
   * Combined with isLoading so Stop remains available for the entire turn and
   * typed follow-ups queue until the stream finishes.
   */
  isGenerating?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Pre-fill the textarea with this text (e.g. from empty-state pills). */
  prefillText?: string;
  /** Callback fired after prefillText has been consumed and applied. */
  onPrefillConsumed?: () => void;
  /** Files dropped onto the message area that should be added as attachments. */
  droppedFiles?: File[] | null;
  /** Callback fired after droppedFiles have been consumed and added to attachments. */
  onDroppedFilesConsumed?: () => void;
  /** Fires when the input transitions between empty and non-empty (debounced 500ms on clear). */
  onTypingChange?: (isTyping: boolean) => void;
  /** Called when the user clicks the stop button. */
  onStop?: () => void;
  /**
   * Enters conversational voice mode. When supplied, the trailing round button
   * carries voice entry while the field is empty and hands the slot back to
   * Send the moment it has text.
   */
  onEnterVoiceMode?: () => void;
  /** Increment to clear composer state after a parent-owned deferred send. */
  clearSignal?: number;
  /** Larger, centered composer presentation used on the empty new-chat state. */
  emptyState?: boolean;
  /**
   * Per-file privacy label rendered as a chip on each attachment thumbnail
   * (e.g. "Local", "BYOK", "Managed"). Sourced from the host's SendPreview
   * presentation.
   */
  attachmentPrivacyShortLabel?: string;
  /**
   * Compact, on-demand outbound-route disclosure shown below the input. This
   * preserves the Local/BYOK/Managed trust boundary without a persistent banner
   * above the textarea.
   */
  sendPreviewPresentation?: SendPreviewPresentation;
  /** Opens the upgrade plan dialog from locked model/usage upgrade affordances. */
  onUpgradeRequest?: () => void;
  /** Persists a model switch for the active conversation before it becomes current. */
  onModelChange?: (modelId: string) => Promise<boolean>;
  /**
   * Called when the user submits in image-generation mode.
   * The composer clears its state regardless; the parent owns the async flow and
   * message injection.
   */
  onGenerateImage?: (
    prompt: string,
    options: { aspectRatio: ImageAspectRatio; modelId: string },
  ) => void;
  /**
   * Called when the user submits in video-generation mode. Same contract as
   * `onGenerateImage`: the composer clears its state, the parent owns the async
   * task (POST + status polling) and the message injection.
   */
  onGenerateVideo?: (
    prompt: string,
    options?: {
      modelId?: string;
      aspectRatio?: string;
      resolution?: string;
      durationSecs?: number;
    },
  ) => void;
  /** Website free-plan state. The server owns the unpublished usage ceiling. */
  freeTrial?: {
    enabled: boolean;
    limitReached: boolean;
  };
  onSetTemporaryChat?: (isTemporary: boolean) => Promise<boolean>;
  /**
   * "Project or folder" picker (Claude-composer parity). Provided only by hosts
   * with real project data for a NEW chat (web /chat empty state). Selecting a
   * project scopes the next created conversation (the host threads it into
   * createConversation → POST projectId). On working-directory-capable surfaces
   * (desktop) the same picker also offers a local folder; a chat is scoped to a
   * project OR a folder, never both. Absent prop = no picker rendered.
   */
  projectPicker?: ComposerProjectPicker;
  suppressAutoFocus?: boolean;
}

export interface ComposerProjectPicker {
  /** Real projects from the host's project store (id + display name). */
  projects: Array<{ id: string; name: string }>;
  activeProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onCreateProject: () => void;
}

export interface VideoModelOption {
  id: string;
  label: string;
  provider: string;
}

// Video-generation models for the in-composer picker, derived entirely from the
// canonical executable-video contract. Deployment-specific provider keys,
// release policy, durable storage, and schema readiness are applied by the
// authenticated availability handshake below. Adding a provider or model must
// remain a catalog/adapter change, never another composer allowlist edit.
export const VIDEO_MODELS: VideoModelOption[] = getModels({ modelTypes: ['video'] })
  .filter(isExecutableVideoModel)
  .map((model) => ({ id: model.id, label: model.name, provider: model.provider }));

// Default = first video model in catalog order, same contract as images.
const VIDEO_MODEL_DEFAULT = VIDEO_MODELS[0]?.id ?? '';

function splitSlashCommand(value: string): { token: string; argument: string } | null {
  const match = /^\/([A-Za-z0-9][A-Za-z0-9_-]*)(?:[ \t]+([\s\S]*))?$/.exec(value);
  if (!match) return null;
  return { token: match[1] ?? '', argument: (match[2] ?? '').trim() };
}

/** The text a command should leave behind once its token is consumed. */
function stripSlashCommandToken(value: string): string {
  const parsed = splitSlashCommand(value);
  if (parsed) return parsed.argument;
  // The menu opens on anything the draft predicate accepts, which includes a
  // lone `/` that `splitSlashCommand` cannot parse, since it wants a token.
  // Returning the whole value for those wrote the slash straight back on
  // commit, so the menu closed and the token stayed in the message. A draft
  // with no parseable token has no argument to keep either.
  return isSlashCommandDraft(value) ? '' : value;
}

const SLASH_COMMAND_PREFIX = '/';
const SLASH_COMMAND_ARGUMENT_SEPARATOR = ' ';

/**
 * The command menu opens for a bare, unspaced `/token` measured against the
 * WHOLE message, so deleting back into shape reopens it. Both input arms read
 * this one predicate, since a second copy is how the two would drift.
 */
function isSlashCommandDraft(value: string): boolean {
  return (
    value.startsWith(SLASH_COMMAND_PREFIX) && !value.includes(SLASH_COMMAND_ARGUMENT_SEPARATOR)
  );
}

function slashCommandQuery(value: string): string {
  return value.slice(SLASH_COMMAND_PREFIX.length);
}

const VOICE_TRANSCRIPT_SEPARATOR = ' ';
const COMPOSER_CARET_END = 'end';
const MENTION_INDEX_FIRST = 0;
const KEY_ARROW_DOWN = 'ArrowDown';
const KEY_ARROW_UP = 'ArrowUp';
const KEY_ENTER = 'Enter';
const KEY_TAB = 'Tab';
/** Focus after the commit that caused it has been painted, not during it. */
const FOCUS_AFTER_COMMIT_MS = 0;
/** Dictation settles its own transcript before the caret is moved. */
const FOCUS_AFTER_TRANSCRIPT_MS = 50;

const COMPOSER_AUTO_HEIGHT = 'auto';
const COMPOSER_MAX_HEIGHT_PX = 240;
/**
 * An existing chat's one-row rest state: 36px content row + the card's 8px
 * top/bottom padding lands on the 52px rest-height parity target at 1543px.
 */
const COMPOSER_RESTING_HEIGHT_PX = 36;
/** The home composer's own row, its second row (mode toggle) sits below it. */
const COMPOSER_RESTING_HEIGHT_EMPTY_PX = 40;
/** M11: the mobile step of the same box the `sm:` utilities carry. */
const COMPOSER_RESTING_HEIGHT_COMPACT_PX = 36;
const COMPOSER_COMPACT_MEDIA_QUERY = '(max-width: 639px)';
const COMPOSER_AUTOFOCUS_MEDIA_QUERY = '(min-width: 768px) and (pointer: fine)';
const RESTORED_DRAFT_NOTICE = "Couldn't send. Restored here so you can try again.";
const RESTORED_BLOCKED_SEND_NOTICE =
  'Your previous message was still starting, so this one is back here. Send it again.';

/**
 * Distinct from a plain `false`: an earlier send (not this composer's own)
 * still owns the module-scope send-pending flag, so `handleSubmit` must skip
 * `setSendPendingFlag(false)` along with the clear -- flipping it here would
 * hide the "Sending..." state of the send that is still actually in flight.
 * A ceremony intercept still returns plain `false`, since nothing else in
 * that case holds the flag.
 */
export const SEND_GUARD_BLOCKED = 'guard-blocked' as const;

/**
 * The legacy textarea's resting height is pinned in JS, so the `sm:` step its
 * classes carry can never reach it; this is the one density value that cannot
 * be a responsive class. jsdom has no `matchMedia`, which resolves to the
 * desktop non-empty number the existing first-paint test measures.
 */
function composerRestingHeightPx(emptyState: boolean): number {
  const compact = window.matchMedia?.(COMPOSER_COMPACT_MEDIA_QUERY).matches === true;
  if (compact) return COMPOSER_RESTING_HEIGHT_COMPACT_PX;
  return emptyState ? COMPOSER_RESTING_HEIGHT_EMPTY_PX : COMPOSER_RESTING_HEIGHT_PX;
}

/**
 * `Blob.text()` is not universally present; jsdom is the case that matters
 * here; and the undo copy is only worth what the read returns, so a failed
 * read degrades to an empty banner rather than throwing inside a paste.
 */
function readPastedText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsText(file);
  });
}

/** Outcome of resolving a slash command against the current capability set. */
type SlashCommandOutcome =
  | { status: 'unavailable'; notice: string }
  | {
      status: 'applied';
      /** Message body once the command token is consumed. */
      content: string;
      /** Per-conversation toggles the command turns on. */
      toggles: Partial<ComposerToggleState>;
      /** Extended thinking lives in its own store, so it is reported separately. */
      enableThinking?: boolean;
    };

/**
 * Sending the first message of a brand-new chat flips `isEmptyChat` in
 * WebChatPage the instant a client-only conversation id is claimed --
 * synchronously, before the attachment upload that triggered the send even
 * starts -- which unmounts this composer and mounts a second instance in the
 * other branch of that page's ternary. A component-local `useState` for "is a
 * send in flight" is wiped out by that remount before it ever paints,
 * reopening the exact gap it exists to close. Module scope survives the
 * remount; `sendPendingListeners` exists so the mounted instance re-renders
 * when an earlier, already-unmounted instance changed the flag.
 */
let sendPendingFlag = false;
const sendPendingListeners = new Set<() => void>();
function setSendPendingFlag(next: boolean): void {
  if (sendPendingFlag === next) return;
  sendPendingFlag = next;
  for (const listener of sendPendingListeners) listener();
}
function subscribeSendPendingFlag(listener: () => void): () => void {
  sendPendingListeners.add(listener);
  return () => sendPendingListeners.delete(listener);
}
function getSendPendingFlag(): boolean {
  return sendPendingFlag;
}
/** Test-only: the flag is module scope by design (see above), so a suite
 *  that renders more than one send must reset it between cases itself. */
export function resetSendPendingFlagForTests(): void {
  setSendPendingFlag(false);
}

const ChatComposerNewComponent = ({
  onSend,
  conversationId = null,
  isLoading = false,
  isGenerating = false,
  placeholder = 'Ask anything. Type / for commands',
  disabled = false,
  prefillText,
  onPrefillConsumed,
  droppedFiles,
  onDroppedFilesConsumed,
  onTypingChange,
  onStop,
  onEnterVoiceMode,
  clearSignal,
  emptyState = false,
  attachmentPrivacyShortLabel,
  sendPreviewPresentation,
  onUpgradeRequest,
  onModelChange,
  freeTrial,
  onGenerateImage,
  onGenerateVideo,
  projectPicker,
  onSetTemporaryChat,
  suppressAutoFocus = false,
}: ChatComposerProps) => {
  const isTurnActive = isLoading || isGenerating;
  const [message, setMessage] = useState('');
  /**
   * True from the moment `handleSubmit` hands a real chat send to `onSend`
   * until the parent-visible turn actually starts (`isTurnActive`) or the
   * send is handed back through one of the composer's existing restoration
   * channels (prefillText, droppedFiles, the parked-draft store slot). Covers
   * the gap between pressing Send and the turn appearing -- attachment
   * upload plus conversation creation happen in that gap with no other
   * visible signal, so the composer otherwise looks identical to its idle
   * state for the whole window.
   */
  const isSendPending = useSyncExternalStore(
    subscribeSendPendingFlag,
    getSendPendingFlag,
    getSendPendingFlag,
  );
  useEffect(() => {
    if (isTurnActive) setSendPendingFlag(false);
  }, [isTurnActive]);
  // A composer that mounts on the bare landing surface (no conversation
  // claimed yet) never carries a real in-flight send of its own -- the
  // remount that DOES carry one forward (see the module comment above) always
  // arrives with the client-only conversation id already attached. Without
  // this, a send that fails before its content is ever handed back through
  // prefillText/droppedFiles (a message that already reached the transcript
  // needs no hand-back -- see `abandonSend`'s `survived` check) leaves the
  // flag set with nothing left to clear it, permanently disabling Send.
  useEffect(() => {
    if (emptyState && conversationId === null) setSendPendingFlag(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [pastedTextUndo, setPastedTextUndo] = useState<{ fileName: string; text: string } | null>(
    null,
  );
  // Reset per message so each new draft gets its own warning.
  const secretWarningAcknowledgedRef = useRef(false);
  // CAP-048: optional AGI Work scope fields. Lightweight inline inputs shown
  // only in AGI Work mode; the composed message is the objective itself.
  const [agiWorkConstraints, setAgiWorkConstraints] = useState('');
  const [agiWorkDeliverable, setAgiWorkDeliverable] = useState('');
  const [agiWorkFieldsOpen, setAgiWorkFieldsOpen] = useState(false);
  const { t: tAgiWork } = useTranslation('v3');
  /**
   * AUDIT-FIX STR-23: mirror of `message` readable from effects without adding
   * it to their dependency arrays -- used to park the outgoing conversation's
   * half-typed text on a conversation switch.
   */
  const messageRef = useRef(message);
  messageRef.current = message;
  const setDraftContent = useChatStore((state) => state.setDraftContent);
  const clearDraftContent = useChatStore((state) => state.clearDraftContent);
  const parkedDraft = useChatStore(selectDraftContent(conversationId));
  const parkedSends = useChatStore(selectParkedSends);
  const clearParkedSend = useChatStore((state) => state.clearParkedSend);
  const parkedSend = useMemo(() => firstParkedSend(parkedSends), [parkedSends]);
  /** Fingerprint of the parked send this composer is currently holding. */
  const restoredParkedSendRef = useRef<string | null>(null);
  const [queuedFollowUps, setQueuedFollowUps] = useState<QueuedFollowUp[]>([]);
  const queuedFollowUpsRef = useRef<QueuedFollowUp[]>(queuedFollowUps);
  queuedFollowUpsRef.current = queuedFollowUps;
  /** Set while a queued message is being edited, so re-sending replaces its slot. */
  const editingQueuedIdRef = useRef<string | null>(null);
  const wasLoadingRef = useRef(false);
  const {
    attachments,
    previews,
    addFiles,
    removeFile,
    clearAll: clearAttachments,
  } = useAttachments({
    onError: (message) => setLocalNotice(message),
  });
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  // The Connectors row's own submenu (list of connected connectors, each with
  // an enable/disable checkbox). Collapsed whenever the plus-menu closes, so
  // it never reopens already expanded.
  const [connectorsSubmenuOpen, setConnectorsSubmenuOpen] = useState(false);
  useEffect(() => {
    if (!showOverflowMenu) setConnectorsSubmenuOpen(false);
  }, [showOverflowMenu]);
  // Settings-modal opener for the plus-menu Skills/Connectors/Plugins entries
  // (founder directive 2026-07-10: entries open the modal pane, no inline lists).
  const { openSettings } = useSettingsModal();
  const {
    connectedIds: connectedConnectorIds,
    sources: connectorSources,
    customNames: connectorCustomNames,
    loading: connectorsLoading,
  } = useConnectors();
  // AUDIT-FIX CMP-8: user-defined commands are read here so `template` is
  // actually applied (it was previously never read by any composer code).
  const customCommands = useSettingsStore((s) => s.customCommands);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const { skills: availableSkills, loading: skillsLoading, error: skillsError } = useSkillsList();
  const [selectedMcpContext, setSelectedMcpContext] = useState<McpContextSelection | null>(null);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const folderName = useCoworkFolderStore((s) => s.folderName);
  const pickFolder = useCoworkFolderStore((s) => s.pickFolder);
  const clearFolder = useCoworkFolderStore((s) => s.clearFolder);
  const canPickFolder = supportsDirectoryPicker();
  const router = useRouter();
  const isFreeTrial = freeTrial?.enabled ?? false;

  useEffect(() => {
    const apply = (selection: McpContextSelection | null) => {
      if (!selection) return;
      setSelectedMcpContext((current) => ({
        ...(current ?? {}),
        ...(selection.prompt ? { prompt: selection.prompt } : {}),
        ...(selection.resources
          ? {
              resources: [...(current?.resources ?? []), ...selection.resources]
                .filter(
                  (resource, index, all) =>
                    all.findIndex(
                      (candidate) =>
                        candidate.connectorId === resource.connectorId &&
                        candidate.uri === resource.uri,
                    ) === index,
                )
                .slice(0, 4),
            }
          : {}),
      }));
    };
    apply(consumePendingMcpContextSelection());
    const listener = (event: Event) => {
      const selected = consumePendingMcpContextSelection();
      apply(selected ?? (event as CustomEvent<McpContextSelection>).detail);
    };
    window.addEventListener(MCP_CONTEXT_SELECTED_EVENT, listener);
    return () => window.removeEventListener(MCP_CONTEXT_SELECTED_EVENT, listener);
  }, []);

  const subscriptionTier = useBillingStore((s) => s.subscription?.tier ?? 'free');
  const billingPolicyReady = useBillingStore(isBillingPolicyReady);
  const billingPolicyError = useBillingStore((s) => s.error);
  const refreshBillingPolicy = useBillingStore((s) => s.refreshUser);
  const canUseAgiWork =
    billingPolicyReady && !isFreeTrial && canUseBillingPlanCapability(subscriptionTier, 'agi_work');
  const canUseImageGeneration =
    billingPolicyReady &&
    !isFreeTrial &&
    canUseBillingPlanCapability(subscriptionTier, 'image_generation');
  // Video is a narrower entitlement than image (billing-catalog.ts:
  // video_generation → ['max_15x', 'enterprise']), so it gets its own read of
  // the same canonical catalog rather than riding the image flag.
  const canUseVideoGeneration =
    billingPolicyReady &&
    !isFreeTrial &&
    canUseBillingPlanCapability(subscriptionTier, 'video_generation');
  // A host must own the actual media turn. ChatComposerNew is also used by the
  // project-detail handoff composer, which deliberately has no generation
  // callbacks; rendering media controls there would accept and then discard a
  // prompt through optional chaining.
  const hostCanGenerateImage = typeof onGenerateImage === 'function';
  const hostCanGenerateVideo = typeof onGenerateVideo === 'function';

  const toggleBucketKey = conversationId ?? PENDING_CONVERSATION_KEY;
  const storedComposerToggles = useChatStore(
    (s) => s.composerTogglesByConversation[toggleBucketKey],
  );
  const setComposerTogglesInStore = useChatStore((s) => s.setComposerToggles);
  // Fallback is memoised (never rebuilt inside the selector) so the subscription
  // returns a stable reference and cannot loop under useSyncExternalStore.
  const composerToggles = useMemo<ComposerToggleState>(
    () => storedComposerToggles ?? { ...DEFAULT_COMPOSER_TOGGLES },
    [storedComposerToggles],
  );
  const setComposerToggles = useCallback(
    (updates: Partial<ComposerToggleState>) => {
      setComposerTogglesInStore(updates, conversationId);
    },
    [setComposerTogglesInStore, conversationId],
  );
  const {
    workMode,
    webSearchEnabled,
    researchEnabled,
    codeExecutionEnabled,
    officeCreationEnabled,
    imageMode,
    videoMode,
    selectedSkillName,
  } = composerToggles;
  const setWorkMode = useCallback(
    (mode: ComposerWorkMode) => setComposerToggles({ workMode: mode }),
    [setComposerToggles],
  );
  // The two media modes are mutually exclusive: the send path checks image
  // first, so leaving both on would silently send a video prompt to the image
  // route. Entering one always leaves the other.
  const setImageMode = useCallback(
    (enabled: boolean) => setComposerToggles({ imageMode: enabled, videoMode: false }),
    [setComposerToggles],
  );
  const setVideoMode = useCallback(
    (enabled: boolean) => setComposerToggles({ videoMode: enabled, imageMode: false }),
    [setComposerToggles],
  );
  const setSelectedSkillName = useCallback(
    (name: string | null) => setComposerToggles({ selectedSkillName: name }),
    [setComposerToggles],
  );

  // Per-conversation connector opt-out (persisted, unlike the toggles above --
  // see `disabledConnectorIdsByConversation` in the chat store).
  const disabledConnectorIds = useChatStore(
    (s) => s.disabledConnectorIdsByConversation[toggleBucketKey] ?? EMPTY_DISABLED_CONNECTOR_IDS,
  );
  const setConnectorEnabledInStore = useChatStore((s) => s.setConnectorEnabled);
  const setConnectorEnabled = useCallback(
    (connectorId: string, enabled: boolean) =>
      setConnectorEnabledInStore(connectorId, enabled, conversationId),
    [setConnectorEnabledInStore, conversationId],
  );

  // Per-conversation Memory opt-out (persisted, mirrors the connector opt-out
  // above -- see `memoryDisabledByConversation` in the chat store). The
  // settings-level switch is the global default; this overrides it for one
  // conversation only.
  const memoryEnabledForChat = useChatStore(
    (s) => s.memoryDisabledByConversation[toggleBucketKey] !== true,
  );
  const setMemoryEnabledInStore = useChatStore((s) => s.setMemoryEnabled);
  const setMemoryEnabledForChat = useCallback(
    (enabled: boolean) => setMemoryEnabledInStore(enabled, conversationId),
    [setMemoryEnabledInStore, conversationId],
  );
  const [memoryCapabilityEnabled, setMemoryCapabilityEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    isMemoryCapabilityEnabled().then((enabled) => {
      if (!cancelled) setMemoryCapabilityEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const connectedConnectorOptions = useMemo(
    () =>
      Array.from(connectedConnectorIds)
        .map((id) => {
          const known = CONNECTORS.find((connector) => connector.id === id);
          const label =
            connectorSources[id] === 'custom'
              ? (connectorCustomNames[id] ?? id)
              : (known?.name ?? id);
          return {
            id,
            label,
            name: label,
            iconBg: known?.iconBg ?? CONNECTOR_MARK_FALLBACK_BG,
            iconText: label.slice(0, 1).toUpperCase(),
            ...(known ? { description: known.capabilitySummary } : {}),
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label)),
    [connectedConnectorIds, connectorSources, connectorCustomNames],
  );

  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [projectQuery, setProjectQuery] = useState('');

  // Entering with a preselected project (sidebar "New chat in project" /
  // project-page handoff → ?projectId= → host store) lands eligible accounts in
  // AGI Work. Free/basic accounts keep ordinary project-scoped chat; AGI Work
  // needs the `agi_work` plan capability (AUDIT-FIX CMP-14), which is exactly
  // what the server enforces.
  const pickerActiveProjectId = projectPicker?.activeProjectId ?? null;
  useEffect(() => {
    if (!billingPolicyReady) return;
    // The CURRENT mode is read imperatively, never as a dependency: reacting to
    // `workMode` would make this effect immediately undo a deliberate switch
    // back to Chat while a project is still selected.
    const current = useChatStore.getState().getComposerToggles(conversationId).workMode;
    if (!canUseAgiWork) {
      if (current !== 'chat') setWorkMode('chat');
    } else if (pickerActiveProjectId && current !== 'agiwork') {
      setWorkMode('agiwork');
    }
  }, [billingPolicyReady, canUseAgiWork, pickerActiveProjectId, setWorkMode, conversationId]);

  const canUseWorkingDirectory = useCapability('canUseWorkingDirectory');
  const canTakeScreenshotCap = useCapability('canTakeScreenshot');

  // Image generation mode state (imageMode itself is per-conversation, above)
  const [imageAspectRatio, setImageAspectRatio] = useState<ImageAspectRatio>('auto');
  const [imageModelId, setImageModelId] = useState<string>(IMAGE_MODEL_DEFAULT);
  const [showImageAspectMenu, setShowImageAspectMenu] = useState(false);
  const [showImageModelMenu, setShowImageModelMenu] = useState(false);
  const [showCompatibleModels, setShowCompatibleModels] = useState(false);
  const {
    status: mediaAvailabilityStatus,
    error: mediaAvailabilityError,
    admissionFor: mediaAdmissionFor,
    retry: retryMediaAvailability,
  } = useMediaModelAvailability();
  const availableImageModels = useMemo(
    () =>
      mediaAvailabilityStatus === 'ready'
        ? IMAGE_MODELS.filter((model) => mediaAdmissionFor(model.id)?.state === 'enabled')
        : [],
    [mediaAdmissionFor, mediaAvailabilityStatus],
  );
  const availableVideoModels = useMemo(
    () =>
      mediaAvailabilityStatus === 'ready'
        ? VIDEO_MODELS.filter((model) => mediaAdmissionFor(model.id)?.state === 'enabled')
        : [],
    [mediaAdmissionFor, mediaAvailabilityStatus],
  );
  const imageAspectOptions = useMemo(
    () => getImageAspectOptionsForModel(imageModelId),
    [imageModelId],
  );
  // A model switch can invalidate the previous ratio. Derive the safe value
  // during render (no state-setting effect or transient unsupported send), and
  // also reset it in the model-selection event below for a truthful label.
  const effectiveImageAspectRatio: ImageAspectRatio = imageAspectOptions.some(
    (option) => option.id === imageAspectRatio,
  )
    ? imageAspectRatio
    : 'auto';

  // Video generation mode state (videoMode itself is per-conversation, above).
  const [videoModelId, setVideoModelId] = useState<string>(VIDEO_MODEL_DEFAULT);
  const [showVideoModelMenu, setShowVideoModelMenu] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState<string>('16:9');
  const [videoResolution, setVideoResolution] = useState<string>('720p');
  const [showVideoAspectMenu, setShowVideoAspectMenu] = useState(false);
  const [showVideoQualityMenu, setShowVideoQualityMenu] = useState(false);

  const videoAspectOptions = useMemo(
    () => getVideoAspectOptionsForModel(videoModelId),
    [videoModelId],
  );
  const effectiveVideoAspectRatio =
    videoAspectOptions.find((option) => option.id === videoAspectRatio)?.id ??
    videoAspectOptions[0]?.id ??
    '16:9';
  const videoQualityOptions = useMemo(
    () => getVideoQualityOptionsForModel(videoModelId, effectiveVideoAspectRatio),
    [videoModelId, effectiveVideoAspectRatio],
  );
  const effectiveVideoQuality =
    videoQualityOptions.find((option) => option.id === videoResolution) ?? videoQualityOptions[0];
  const effectiveVideoResolution = effectiveVideoQuality?.id ?? '720p';
  // Some output tuples narrow the model-wide duration list. The composer has
  // no independent duration picker, so selecting one of those tuples must
  // carry its required duration; otherwise the route applies its 4s default
  // and rejects the visible 1080p/4K selection as an impossible combination.
  const effectiveVideoDurationSecs = effectiveVideoQuality?.durationSecs?.[0];

  // Catalog entries are candidates, not proof of this deployment's keys and
  // durable storage. Once the server handshake resolves, keep each selection
  // on an admitted model or an honest empty state.
  useEffect(() => {
    if (mediaAvailabilityStatus !== 'ready') return;
    if (!availableImageModels.some((model) => model.id === imageModelId)) {
      setImageModelId(availableImageModels[0]?.id ?? '');
      setImageAspectRatio('auto');
    }
  }, [availableImageModels, imageModelId, mediaAvailabilityStatus]);

  useEffect(() => {
    if (mediaAvailabilityStatus !== 'ready') return;
    if (!availableVideoModels.some((model) => model.id === videoModelId)) {
      setVideoModelId(availableVideoModels[0]?.id ?? '');
    }
  }, [availableVideoModels, mediaAvailabilityStatus, videoModelId]);

  const trialExhausted = isFreeTrial && (freeTrial?.limitReached ?? false);

  // Capability gating: enable/disable composer affordances based on the SELECTED
  // model's capabilities so a user never sends an input the model can't handle
  // (e.g. an image to a text-only model, or web search to a no-search model).
  const composerSelectedModelId = useModelStore((s) => s.selectedModelId);
  const setComposerSelectedModelId = useModelStore((s) => s.setSelectedModelId);
  const isAutoSelected = isAutoModeModelId(composerSelectedModelId);
  const selectedModelMeta = getModelMetadata(composerSelectedModelId);
  const selectedModelCaps = selectedModelMeta?.capabilities;
  const modelSupportsVision = selectedModelCaps?.vision ?? false;
  const modelCanAcceptImages = isAutoModeModelId(composerSelectedModelId) || modelSupportsVision;
  /**
   * AUDIT-FIX CMP-27: the conflict check used to be `type.startsWith('image/')`
   * only, while the file input accepts the FULL chat-attachment allowlist. A
   * PDF therefore got no capability gate at all and failed at the provider.
   *
   * Two honest classes: binary attachments (images and PDFs) travel as
   * provider media/document blocks and need a multimodal model; text and code
   * files are inlined as text and every model can read them.
   */
  const binaryAttachments = attachments.filter(
    (file) => isChatImageMimeType(file.type) || file.type === 'application/pdf',
  );
  const hasImageAttachments = binaryAttachments.some((file) => isChatImageMimeType(file.type));
  const hasDocumentAttachments = binaryAttachments.some((file) => file.type === 'application/pdf');
  const hasAttachmentConflict = binaryAttachments.length > 0 && !modelCanAcceptImages;
  const attachmentConflictKind: 'image' | 'document' | 'mixed' =
    hasImageAttachments && hasDocumentAttachments
      ? 'mixed'
      : hasDocumentAttachments
        ? 'document'
        : 'image';
  const mediaModeActive = imageMode || videoMode;
  const mediaModeNoun = imageMode ? 'Image' : 'Video';
  const mediaAttachmentConflict = mediaModeActive && attachments.length > 0;
  const compatibleModels = getSelectableModels().filter(
    (model) =>
      model.capabilities.vision &&
      (isFreeTrial || isFreeBillingPlanTier(subscriptionTier)
        ? FREE_TRIAL_MODELS.includes(model.id)
        : isModelAllowedForTier(model.id, subscriptionTier)),
  );
  const genericWebSearchConfigured = useBillingStore(
    (s) => s.featureFlags?.generic_web_search ?? false,
  );
  // Auto is a routing alias, not a catalog model, so it has no provider or
  // capability row until the server resolves the turn. The configured generic
  // backend is the route-independent guarantee that every Auto candidate can
  // still receive the platform web_search tool.
  const modelSupportsSearch = isAutoModeModelId(composerSelectedModelId)
    ? genericWebSearchConfigured
    : isWebSearchAvailable({
        provider: selectedModelMeta?.provider,
        modelSupportsNativeSearch: selectedModelCaps?.search,
        modelSupportsTools: selectedModelCaps?.tools,
        genericBackendConfigured: genericWebSearchConfigured,
      });
  const researchAvailableForModel =
    isAutoSelected || modelSupportsResearch(selectedModelCaps, selectedModelMeta?.contextWindow);
  const modelSupportsThinkingCap = selectedModelCaps?.thinking ?? false;
  const deploymentCodeExecution = useBillingStore((s) => s.featureFlags?.code_execution ?? false);
  // Whether this model can run code is a registry capability
  // (selectedModelCaps.codeExecution, curated per-model in models.curation.json),
  // never a provider-name allowlist: request-processor.ts gates the server turn
  // on `resolvedModelCaps?.codeExecution === true` alone, and the catalog
  // marks codeExecution true for at least one live model outside the
  // previously hardcoded three-provider list, so that allowlist here hid the
  // control for a model the server would have honored.
  const modelSupportsCodeExecution =
    isAutoSelected ||
    (selectedModelCaps?.codeExecution ?? false) ||
    ((selectedModelCaps?.tools ?? false) && deploymentCodeExecution);
  const modelSupportsOfficeCreation = isAutoSelected || (selectedModelCaps?.tools ?? false);

  // Managed Web search is ambient (ChatGPT automatic-search behavior). Keep it
  // on whenever the selected model/deployment has an honest search path, and
  // turn it off only when no such path exists.
  useEffect(() => {
    if (!billingPolicyReady) return;
    if (webSearchEnabled !== modelSupportsSearch) {
      setComposerToggles({ webSearchEnabled: modelSupportsSearch });
    }
  }, [billingPolicyReady, webSearchEnabled, modelSupportsSearch, setComposerToggles]);

  // Clear Research if the model loses research support.
  useEffect(() => {
    if (!billingPolicyReady) return;
    if (researchEnabled && !researchAvailableForModel) {
      setComposerToggles({ researchEnabled: false });
    }
  }, [billingPolicyReady, researchEnabled, researchAvailableForModel, setComposerToggles]);

  // If the user switches to a model that can't execute code, clear the toggle.
  useEffect(() => {
    if (!billingPolicyReady) return;
    if (codeExecutionEnabled && !modelSupportsCodeExecution)
      setComposerToggles({ codeExecutionEnabled: false });
  }, [billingPolicyReady, codeExecutionEnabled, modelSupportsCodeExecution, setComposerToggles]);

  useEffect(() => {
    if (!billingPolicyReady) return;
    if (officeCreationEnabled && !modelSupportsOfficeCreation)
      setComposerToggles({ officeCreationEnabled: false });
  }, [billingPolicyReady, officeCreationEnabled, modelSupportsOfficeCreation, setComposerToggles]);

  // AUDIT-FIX CMP-11: image mode is Pro-only server-side; a downgrade (or a
  // stale per-conversation flag) must not leave the composer in a mode whose
  // send is guaranteed to 403.
  useEffect(() => {
    if (!billingPolicyReady) return;
    if (imageMode && !canUseImageGeneration) setComposerToggles({ imageMode: false });
  }, [billingPolicyReady, imageMode, canUseImageGeneration, setComposerToggles]);

  // Same guarantee for video, whose server gate is narrower still (Max 15x /
  // Enterprise). A stale per-conversation flag must not survive a downgrade
  // into a send that is guaranteed to 403.
  useEffect(() => {
    if (!billingPolicyReady) return;
    if (videoMode && !canUseVideoGeneration) setComposerToggles({ videoMode: false });
  }, [billingPolicyReady, videoMode, canUseVideoGeneration, setComposerToggles]);

  // A deployment can lose a provider key/storage independently of the user's
  // tier. Do not leave a persisted media mode active once the no-store server
  // handshake proves that it has no executable model.
  useEffect(() => {
    if (mediaAvailabilityStatus !== 'ready') return;
    if (imageMode && (!hostCanGenerateImage || availableImageModels.length === 0)) {
      setComposerToggles({ imageMode: false });
    }
    if (videoMode && (!hostCanGenerateVideo || availableVideoModels.length === 0)) {
      setComposerToggles({ videoMode: false });
    }
  }, [
    availableImageModels.length,
    availableVideoModels.length,
    imageMode,
    hostCanGenerateImage,
    hostCanGenerateVideo,
    mediaAvailabilityStatus,
    setComposerToggles,
    videoMode,
  ]);

  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const pendingTemporaryChat = useChatStore((s) => s.pendingTemporaryChat);
  const setPendingTemporaryChat = useChatStore((s) => s.setPendingTemporaryChat);
  const isIncognito = useChatStore((s) => {
    const id = s.activeConversationId;
    return id
      ? (s.conversations.find((c) => c.id === id)?.isTemporary ?? false)
      : s.pendingTemporaryChat;
  });
  const [isSavingIncognito, setIsSavingIncognito] = useState(false);
  const handleIncognitoToggle = useCallback(async () => {
    // No conversation exists yet: arm the flag createConversation reads at
    // creation. Nothing to save server-side until that POST happens.
    if (!activeConversationId) {
      setPendingTemporaryChat(!pendingTemporaryChat);
      return;
    }
    if (!onSetTemporaryChat) return;
    setIsSavingIncognito(true);
    try {
      // AUDIT-FIX CMP-3: the host performs the PATCH and writes the SERVER's
      // value back into the store, so the checkmark can only appear once the
      // database actually holds the flag.
      const saved = await onSetTemporaryChat(!isIncognito);
      if (!saved) {
        setLocalNotice(
          'Could not change temporary chat. This conversation is still being saved normally.',
        );
      }
    } finally {
      setIsSavingIncognito(false);
    }
  }, [
    activeConversationId,
    isIncognito,
    onSetTemporaryChat,
    pendingTemporaryChat,
    setPendingTemporaryChat,
  ]);
  const canToggleIncognito =
    (activeConversationId ? Boolean(onSetTemporaryChat) : true) &&
    !isTurnActive &&
    !disabled &&
    !isSavingIncognito;

  // Thinking / effort store
  // Styles and response length live on the account, not just in localStorage,
  // so they follow the user to another device. The store renders immediately
  // from its local cache and reconciles here once per mount.
  const hydrateStylesFromServer = useStyleStore((s) => s.hydrateFromServer);
  useEffect(() => {
    void hydrateStylesFromServer();
  }, [hydrateStylesFromServer]);

  const responseStyle = useStyleStore((s) => s.style);
  const responseLength = useStyleStore((s) => s.length);
  const activeCustomStyleId = useStyleStore((s) => s.activeCustomStyleId);
  const thinkingEnabled = useThinkingStore((s) => s.enabled);
  const setThinkingEnabled = useThinkingStore((s) => s.setEnabled);

  // Thinking is persisted across model switches. Clear that preference when the
  // newly selected explicit model cannot reason, otherwise the next request is
  // rejected before the model gets a chance to answer. Auto remains eligible
  // because its final model is chosen server-side for each task.
  useEffect(() => {
    if (
      thinkingEnabled &&
      !isAutoModeModelId(composerSelectedModelId) &&
      !modelSupportsThinkingCap
    ) {
      setThinkingEnabled(false);
    }
  }, [composerSelectedModelId, modelSupportsThinkingCap, setThinkingEnabled, thinkingEnabled]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /**
   * Null unless the editor arm is mounted, which is what makes every write
   * below a single path: `setMessage` keeps the mirror (counter, hasContent,
   * secrets audit, drafts) authoritative on both arms, and the handle call is
   * a no-op on the legacy one.
   */
  const composerEditorRef = useRef<ComposerEditorHandle | null>(null);
  const mentionCommitRef = useRef<ComposerMentionCommit | null>(null);
  /**
   * The mention popover anchors to the input row rather than to the textarea,
   * because the editor arm has no textarea to measure. Same box either way;
   * the input is `w-full` inside it.
   */
  const composerRowRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  // The "+" trigger and its portaled menu. The menu is no longer a DOM
  // descendant of `overflowRef` (see AnchoredComposerMenu), so the
  // outside-click handler has to consult both or every click inside the menu
  // would read as a click outside it and close the menu mid-interaction.
  const overflowTriggerRef = useRef<HTMLButtonElement>(null);
  const overflowMenuRef = useRef<HTMLDivElement>(null);
  const projectPickerRef = useRef<HTMLDivElement>(null);
  const mentionsRef = useRef<HTMLDivElement>(null);
  const projectPickerTriggerRef = useRef<HTMLButtonElement>(null);
  const projectPickerMenuRef = useRef<HTMLDivElement>(null);
  const imageAspectTriggerRef = useRef<HTMLButtonElement>(null);
  const imageModelTriggerRef = useRef<HTMLButtonElement>(null);
  const videoAspectTriggerRef = useRef<HTMLButtonElement>(null);
  const videoQualityTriggerRef = useRef<HTMLButtonElement>(null);
  const videoModelTriggerRef = useRef<HTMLButtonElement>(null);
  const slashMenuRef = useRef<SlashCommandMenuHandle>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasTypingRef = useRef(false);
  const lastClearSignalRef = useRef(clearSignal);

  // Track empty <-> non-empty transitions with 500ms debounce on clearing
  useEffect(() => {
    const hasContent = message.trim().length > 0;

    if (hasContent && !wasTypingRef.current) {
      wasTypingRef.current = true;
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      onTypingChange?.(true);
    } else if (!hasContent && wasTypingRef.current) {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
      typingTimerRef.current = setTimeout(() => {
        wasTypingRef.current = false;
        onTypingChange?.(false);
        typingTimerRef.current = null;
      }, 500);
    }
  }, [message, onTypingChange]);

  // Cleanup typing timer on unmount
  useEffect(() => {
    const timer = typingTimerRef;
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  /**
   * Every external write to the message goes through one of these three. The
   * mirror stays authoritative on both arms; the counter, `hasContent`, the
   * secrets audit and the draft store all read it; and the handle call
   * replays the same text into the uncontrolled editor when that arm is
   * mounted. `setText` and `clear` also purge undo history, so Cmd+Z cannot
   * resurrect a sent message or another conversation's draft.
   *
   * Each one moves `messageRef` too. The render-time assignment alone is a
   * commit behind, and the composer is frequently unmounted by the same commit
   * that clears it; sending the first message of a new chat swaps the
   * empty-state instance for the in-conversation one; so the unmount would
   * park text the user had already sent.
   */
  const writeComposerMessage = useCallback((next: string) => {
    messageRef.current = next;
    setMessage(next);
    composerEditorRef.current?.setText(next);
  }, []);

  // The server-rendered textarea is a real, natively interactive form
  // control, so a click, a typed draft and even Enter can land in the DOM
  // before hydration attaches the controlled onChange. Once it does, the
  // next render would otherwise force the DOM value back to the still-empty
  // `message` state and erase what was typed. Adopt it instead.
  useLayoutEffect(() => {
    const node = textareaRef.current;
    if (!node || !node.value || messageRef.current) return;
    writeComposerMessage(node.value);
    const end = node.value.length;
    node.setSelectionRange(end, end);
  }, [writeComposerMessage]);

  const appendComposerMessage = useCallback((suffix: string) => {
    messageRef.current += suffix;
    setMessage((current) => current + suffix);
    composerEditorRef.current?.appendText(suffix);
  }, []);

  const focusComposer = useCallback(() => {
    const editor = composerEditorRef.current;
    if (editor) {
      editor.focus();
      return;
    }
    textareaRef.current?.focus();
  }, []);

  const focusComposerEnd = useCallback(() => {
    const editor = composerEditorRef.current;
    if (editor) {
      editor.focus(COMPOSER_CARET_END);
      return;
    }
    const node = textareaRef.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  const appendDictatedText = useCallback(
    (text: string) => {
      const separator = messageRef.current.trim() ? VOICE_TRANSCRIPT_SEPARATOR : '';
      appendComposerMessage(separator + text);
    },
    [appendComposerMessage],
  );

  const handleDictationInsert = useCallback(
    (text: string) => {
      appendDictatedText(text);
      setTimeout(focusComposerEnd, FOCUS_AFTER_TRANSCRIPT_MS);
    },
    [appendDictatedText, focusComposerEnd],
  );

  const dictationSendRef = useRef(false);
  const handleDictationSend = useCallback(
    (text: string) => {
      dictationSendRef.current = true;
      appendDictatedText(text);
    },
    [appendDictatedText],
  );

  const dictation = useDictation({
    onInsert: handleDictationInsert,
    onSend: handleDictationSend,
  });

  const takeIdleFocus = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia(COMPOSER_AUTOFOCUS_MEDIA_QUERY).matches) return;
    const active = document.activeElement;
    if (active && active !== document.body) {
      if (active.closest('[role="dialog"], [role="menu"]')) return;
      const tag = active.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (active as HTMLElement).isContentEditable)
        return;
    }
    focusComposer();
  }, [focusComposer]);

  useEffect(() => {
    if (suppressAutoFocus) return;
    takeIdleFocus();
  }, [suppressAutoFocus, takeIdleFocus]);

  const wasTurnActiveRef = useRef(isTurnActive);
  useEffect(() => {
    const wasTurnActive = wasTurnActiveRef.current;
    wasTurnActiveRef.current = isTurnActive;
    if (wasTurnActive && !isTurnActive) takeIdleFocus();
  }, [isTurnActive, takeIdleFocus]);

  const clearComposerState = useCallback(() => {
    messageRef.current = '';
    setMessage('');
    composerEditorRef.current?.clear();
    // AUDIT-FIX STR-23: a sent/cleared composer must not leave a stale parked
    // draft that reappears when the user returns to this conversation.
    clearDraftContent(conversationId);
    if (!conversationId) clearPendingDraft();
    // The blocked send this composer was holding has now left, by a send or by
    // an explicit clear. Releasing it by fingerprint is what makes the handback
    // exactly-once: a different send parked behind it is untouched.
    const restoredFingerprint = restoredParkedSendRef.current;
    if (restoredFingerprint) {
      restoredParkedSendRef.current = null;
      clearParkedSend(restoredFingerprint);
    }
    clearAttachments();
    setComposerToggles({ selectedSkillName: null });
    setSelectedMcpContext(null);
    setLocalNotice(null);
    // A new draft gets its own secret warning.
    secretWarningAcknowledgedRef.current = false;
    // The AGI Work scope fields belong to a single send, like the skill pick.
    setAgiWorkConstraints('');
    setAgiWorkDeliverable('');
    setAgiWorkFieldsOpen(false);
    // Aspect ratio and the chosen media model ride with the mode above: a user
    // shooting a sequence at 16:9 on a catalog-selected video model should stay
    // there, not have both snap back to defaults between sends. The mode pill's
    // × restores them.
    setShowCompatibleModels(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = COMPOSER_AUTO_HEIGHT;
    }
  }, [clearAttachments, clearDraftContent, clearParkedSend, conversationId, setComposerToggles]);

  useEffect(() => {
    if (!isFreeTrial || !researchEnabled) return;
    setComposerToggles({ researchEnabled: false });
  }, [isFreeTrial, researchEnabled, setComposerToggles]);

  useEffect(() => {
    if (clearSignal === undefined || clearSignal === lastClearSignalRef.current) return;
    lastClearSignalRef.current = clearSignal;
    clearComposerState();
    if (!suppressAutoFocus) takeIdleFocus();
  }, [clearComposerState, clearSignal, suppressAutoFocus, takeIdleFocus]);

  const addChatAttachments = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      if (imageMode || videoMode) {
        const noun = imageMode ? 'Image' : 'Video';
        setLocalNotice(
          `${noun} generation works from your prompt only. Attached files are not sent to the ${noun.toLowerCase()} model. Leave ${noun.toLowerCase()} mode first if you want to send ${files.length === 1 ? 'this file' : 'these files'} to the chat model.`,
        );
        return;
      }
      setLocalNotice(null);
      addFiles(files);
    },
    [addFiles, imageMode, videoMode],
  );

  const handleFileDrop = useCallback(
    (files: File[]) => {
      addChatAttachments(files);
    },
    [addChatAttachments],
  );

  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);

  const handleTakeScreenshot = useCallback(async () => {
    setShowOverflowMenu(false);
    setIsCapturingScreenshot(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement('video');
      video.srcObject = stream;
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          void video.play();
          resolve();
        };
      });
      // Let the first frame paint before grabbing it.
      await new Promise<void>((resolve) => setTimeout(resolve, 150));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        setLocalNotice('Could not capture the screen on this device.');
        return;
      }
      context.drawImage(video, 0, 0);
      video.srcObject = null;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((result) => resolve(result), 'image/png'),
      );
      if (!blob) {
        setLocalNotice('Could not capture the screen on this device.');
        return;
      }
      addChatAttachments([new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' })]);
    } catch {
      // noop
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setIsCapturingScreenshot(false);
    }
  }, [addChatAttachments]);

  const attachmentNames = useMemo(() => attachments.map((file) => file.name), [attachments]);

  /**
   * A long paste turning into a file is a reasonable default and a surprising
   * one: the composer emptied and a chip appeared, with Remove as the only
   * affordance and nothing saying what had happened. Say it, and keep the text
   * so the choice is reversible.
   *
   * The editor arm cannot hand over the clipboard; ProseMirror owns the event
   * and reports only the decision; but the attachment IS the pasted text, so
   * the undo copy is recovered from the file itself.
   */
  const applyComposerPasteDecision = useCallback(
    (decision: ComposerAttachmentPasteDecision, plainText?: string) => {
      addChatAttachments(decision.kind === 'files' ? decision.files : [decision.file]);
      if (decision.kind !== 'attachment') return;
      const { file } = decision;
      if (plainText !== undefined) {
        setPastedTextUndo({ fileName: file.name, text: plainText });
        return;
      }
      void readPastedText(file).then((text) => setPastedTextUndo({ fileName: file.name, text }));
    },
    [addChatAttachments],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (disabled || trialExhausted) return;
      // COMPOSER-002/UI-81: the paste decision itself is shared, so the same
      // clipboard produces the same attachment on web, the unified composer and
      // the extension. `text` leaves the event alone so ordinary text still
      // inserts as text.
      const decision = decideComposerPaste(e.clipboardData, {
        existingFileNames: attachmentNames,
      });
      if (decision.kind === 'text') return;
      e.preventDefault();
      applyComposerPasteDecision(decision, e.clipboardData.getData('text/plain'));
    },
    [applyComposerPasteDecision, attachmentNames, disabled, trialExhausted],
  );

  const handleEditorPasteDecision = useCallback(
    (decision: ComposerAttachmentPasteDecision) => {
      if (disabled || trialExhausted) return;
      applyComposerPasteDecision(decision);
    },
    [applyComposerPasteDecision, disabled, trialExhausted],
  );

  const handleEditorDropFiles = useCallback(
    (files: readonly File[]) => {
      handleFileDrop([...files]);
    },
    [handleFileDrop],
  );

  // Handle droppedFiles prop · same derived-state-from-props pattern as prefillText.
  // When the parent passes files dropped onto the message area, feed them into the
  // attachment hook and notify the parent so it can clear the pending state.
  // This is an effect, not a render-time state update: render-phase updates can
  // loop under concurrent React and produced act warnings in every unit test.
  const lastDroppedFilesRef = useRef<File[] | null>(null);
  useEffect(() => {
    if (
      !droppedFiles ||
      droppedFiles.length === 0 ||
      droppedFiles === lastDroppedFilesRef.current
    ) {
      return;
    }
    lastDroppedFilesRef.current = droppedFiles;
    handleFileDrop(droppedFiles);
    onDroppedFilesConsumed?.();
    setSendPendingFlag(false);
  }, [droppedFiles, handleFileDrop, onDroppedFilesConsumed]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // On a narrow first paint the empty-state flex layout can temporarily make
    // an `auto`-height textarea report the 240px container ceiling as its
    // scrollHeight. Once the user types, the next measurement corrects itself,
    // but the initial mobile composer has already consumed most of the screen.
    // Empty content never needs measurement, so keep its stable one-line height
    // and reserve scrollHeight reads for real text.
    const resting = composerRestingHeightPx(Boolean(emptyState));
    if (message.length === 0) {
      textarea.style.height = `${resting}px`;
      return;
    }
    textarea.style.height = COMPOSER_AUTO_HEIGHT;
    const newHeight = Math.min(Math.max(textarea.scrollHeight, resting), COMPOSER_MAX_HEIGHT_PX);
    textarea.style.height = `${newHeight}px`;
  }, [message, emptyState]);

  // Close popover on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      // The "+" menu is portaled to document.body, so "inside" means inside
      // the trigger wrapper OR inside the menu content.
      const insideOverflow =
        overflowRef.current?.contains(target) || overflowMenuRef.current?.contains(target);
      if (!insideOverflow) {
        setShowOverflowMenu(false);
      }
      if (mentionsRef.current && !mentionsRef.current.contains(e.target as Node)) {
        setShowMentions(false);
      }
      const insideProjectPicker =
        projectPickerRef.current?.contains(target) ||
        projectPickerMenuRef.current?.contains(target);
      if (projectPickerRef.current && !insideProjectPicker) {
        setShowProjectPicker(false);
      }
    }
    // The composer textarea's onKeyDown only fires while the textarea has focus; once the
    // "+" menu opens, focus moves into the popover, so Escape must be handled at the
    // document level to close the menu (otherwise it stays open until an outside click).
    function handleEscapeKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setShowOverflowMenu(false);
      setShowMentions(false);
      setShowProjectPicker(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, []);

  const handleResearchToggle = useCallback(() => {
    setComposerToggles({ researchEnabled: !researchEnabled });
  }, [researchEnabled, setComposerToggles]);

  const handleCodeExecutionToggle = useCallback(() => {
    setComposerToggles({ codeExecutionEnabled: !codeExecutionEnabled });
  }, [codeExecutionEnabled, setComposerToggles]);

  const handleOfficeCreationToggle = useCallback(() => {
    setComposerToggles({ officeCreationEnabled: !officeCreationEnabled });
  }, [officeCreationEnabled, setComposerToggles]);

  const handleMemoryToggle = useCallback(() => {
    setMemoryEnabledForChat(!memoryEnabledForChat);
  }, [memoryEnabledForChat, setMemoryEnabledForChat]);

  const closeMenu = useCallback(() => {
    setShowOverflowMenu(false);
  }, []);

  const handleCreateImageFromMenu = useCallback(() => {
    closeMenu();
    if (!billingPolicyReady) {
      if (billingPolicyError) {
        setLocalNotice("Couldn't verify your plan. Retrying…");
        void refreshBillingPolicy();
      } else {
        setLocalNotice('Checking your plan…');
      }
      return;
    }
    if (mediaAvailabilityStatus !== 'ready') {
      setLocalNotice(
        mediaAvailabilityStatus === 'error'
          ? (mediaAvailabilityError ?? 'Could not check image model availability.')
          : 'Checking image model availability…',
      );
      if (mediaAvailabilityStatus === 'error') retryMediaAvailability();
      return;
    }
    if (availableImageModels.length === 0) {
      setLocalNotice('This deployment is not ready for image generation.');
      return;
    }
    if (!canUseImageGeneration) {
      onUpgradeRequest?.();
      return;
    }
    setImageMode(true);
    setTimeout(focusComposer, FOCUS_AFTER_COMMIT_MS);
  }, [
    closeMenu,
    billingPolicyReady,
    billingPolicyError,
    refreshBillingPolicy,
    mediaAvailabilityStatus,
    mediaAvailabilityError,
    retryMediaAvailability,
    availableImageModels,
    canUseImageGeneration,
    onUpgradeRequest,
    setImageMode,
    focusComposer,
  ]);

  const handleCreateVideoFromMenu = useCallback(() => {
    closeMenu();
    if (!billingPolicyReady) {
      if (billingPolicyError) {
        setLocalNotice("Couldn't verify your plan. Retrying…");
        void refreshBillingPolicy();
      } else {
        setLocalNotice('Checking your plan…');
      }
      return;
    }
    if (mediaAvailabilityStatus !== 'ready') {
      setLocalNotice(
        mediaAvailabilityStatus === 'error'
          ? (mediaAvailabilityError ?? 'Could not check video model availability.')
          : 'Checking video model availability…',
      );
      if (mediaAvailabilityStatus === 'error') retryMediaAvailability();
      return;
    }
    if (availableVideoModels.length === 0) {
      setLocalNotice('This deployment is not ready for video generation.');
      return;
    }
    if (!canUseVideoGeneration) {
      onUpgradeRequest?.();
      return;
    }
    setVideoMode(true);
    setTimeout(focusComposer, FOCUS_AFTER_COMMIT_MS);
  }, [
    closeMenu,
    billingPolicyReady,
    billingPolicyError,
    refreshBillingPolicy,
    mediaAvailabilityStatus,
    mediaAvailabilityError,
    retryMediaAvailability,
    availableVideoModels,
    canUseVideoGeneration,
    onUpgradeRequest,
    setVideoMode,
    focusComposer,
  ]);

  const activePickerProject = projectPicker
    ? (projectPicker.projects.find((p) => p.id === projectPicker.activeProjectId) ?? null)
    : null;
  // The folder half of the chip label only exists on working-directory surfaces;
  // on web the cowork folder store is never populated through this control.
  const pickerFolderName = canUseAgiWork && canUseWorkingDirectory ? folderName : null;
  const pickerHasSelection = Boolean(activePickerProject || pickerFolderName);
  const pickerPlaceholder = canUseAgiWork ? 'Project or folder' : 'Project';
  const pickerLabel = activePickerProject?.name ?? pickerFolderName ?? pickerPlaceholder;
  const workScopeBarVisible = canUseAgiWork && workMode === 'agiwork';
  const filteredPickerProjects = projectPicker
    ? projectPicker.projects.filter((p) =>
        p.name.toLowerCase().includes(projectQuery.trim().toLowerCase()),
      )
    : [];

  const closeProjectPicker = useCallback(() => {
    setShowProjectPicker(false);
    setProjectQuery('');
  }, []);

  const handlePickProject = useCallback(
    (projectId: string) => {
      projectPicker?.onSelectProject(projectId);
      // A chat is scoped to a project OR a local folder, never both.
      clearFolder();
      closeProjectPicker();
    },
    [projectPicker, clearFolder, closeProjectPicker],
  );

  const handleClearPickerSelection = useCallback(() => {
    projectPicker?.onSelectProject(null);
    clearFolder();
  }, [projectPicker, clearFolder]);

  const handlePickFolderFromPicker = useCallback(() => {
    closeProjectPicker();
    void pickFolder().then(() => {
      // Only displace the project selection when a folder was actually chosen
      // (pickFolder resolves without setting state if the user cancels).
      if (useCoworkFolderStore.getState().folderName) {
        projectPicker?.onSelectProject(null);
      }
    });
  }, [closeProjectPicker, pickFolder, projectPicker]);

  const handleWorkModeChange = useCallback(
    (mode: ComposerWorkMode) => {
      setWorkMode(mode);
      if (mode === 'chat') {
        projectPicker?.onSelectProject(null);
        clearFolder();
        closeProjectPicker();
      }
    },
    [setWorkMode, projectPicker, clearFolder, closeProjectPicker],
  );

  const syncSlashMenu = useCallback((value: string) => {
    if (isSlashCommandDraft(value)) {
      setShowSlashMenu(true);
      setSlashQuery(slashCommandQuery(value));
      return true;
    }
    setShowSlashMenu(false);
    return false;
  }, []);

  // Handle input change: detect @mention and /command.
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart || 0;
      setMessage(value);

      if (syncSlashMenu(value)) {
        setShowMentions(false);
        return;
      }

      const mention = matchMentionQuery(value, cursorPos);
      if (mention) {
        setShowMentions(true);
        setMentionQuery(mention.query);
        setMentionStartIndex(mention.startIndex);
        setMentionIndex(MENTION_INDEX_FIRST);
        return;
      }
      setShowMentions(false);
    },
    [syncSlashMenu],
  );

  /**
   * The editor arm's mirror. Mentions are owned by the suggestion plugin on
   * this arm; it is the only thing that knows where the caret is; so the
   * slash predicate is all that crosses here.
   */
  const handleComposerTextChange = useCallback(
    (value: string) => {
      setMessage(value);
      syncSlashMenu(value);
    },
    [syncSlashMenu],
  );

  const mentionMatches = useCallback(
    (haystack: string) => {
      return haystack.toLowerCase().includes(mentionQuery.toLowerCase());
    },
    [mentionQuery],
  );

  const filteredSkills = useMemo(
    () =>
      availableSkills
        .filter((skill) => mentionMatches(skill.name) || mentionMatches(skill.description))
        .slice(0, 12),
    [availableSkills, mentionMatches],
  );

  const projectScopeSelectable = Boolean(
    projectPicker && (workMode === 'agiwork' || !canUseAgiWork) && !imageMode,
  );

  const filteredMentionProjects = useMemo(
    () =>
      projectScopeSelectable && projectPicker
        ? projectPicker.projects.filter((project) => mentionMatches(project.name)).slice(0, 8)
        : [],
    [projectScopeSelectable, projectPicker, mentionMatches],
  );

  const mentionItems = useMemo(
    () => [
      ...filteredSkills.map((skill) => ({ kind: 'skill' as const, skill })),
      ...filteredMentionProjects.map((project) => ({ kind: 'project' as const, project })),
    ],
    [filteredSkills, filteredMentionProjects],
  );

  const activeMentionIndex =
    mentionItems.length === 0 ? -1 : Math.min(mentionIndex, mentionItems.length - 1);

  const replaceMentionToken = useCallback(() => {
    // On the editor arm the suggestion plugin owns the range: it is the only
    // thing that knows where the query sits once paragraph breaks are in play.
    // It restores focus itself, at the caret the removal collapsed to;
    // focusComposer would drag the caret to the end of the document.
    const commit = mentionCommitRef.current;
    if (commit) {
      commit.removeQuery();
      mentionCommitRef.current = null;
      setShowMentions(false);
      return;
    }
    if (mentionStartIndex === -1) return;
    const before = message.substring(0, mentionStartIndex);
    const cursorPos = textareaRef.current?.selectionStart || message.length;
    const after = message.substring(cursorPos);
    // The `@query` is only a picker affordance and must not leak into the
    // user's prompt. Keep the text on either side while normalizing only the
    // whitespace at the removed token boundary.
    const left = before.replace(/[ \t]+$/, '');
    const right = after.replace(/^[ \t]+/, '');
    const newMessage = left && right ? `${left} ${right}` : left || right;
    const nextCursor = left ? left.length + (right ? 1 : 0) : 0;
    setMessage(newMessage);
    setShowMentions(false);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  }, [message, mentionStartIndex]);

  const handleMentionSelect = useCallback(
    (skill: SkillItem) => {
      replaceMentionToken();
      setSelectedSkillName(skill.name);
    },
    [replaceMentionToken, setSelectedSkillName],
  );

  const handleMentionProjectSelect = useCallback(
    (projectId: string) => {
      replaceMentionToken();
      projectPicker?.onSelectProject(projectId);
      clearFolder();
    },
    [replaceMentionToken, projectPicker, clearFolder],
  );

  const commitActiveMention = useCallback(() => {
    const item = mentionItems[activeMentionIndex];
    if (!item) return;
    if (item.kind === 'skill') handleMentionSelect(item.skill);
    else handleMentionProjectSelect(item.project.id);
  }, [mentionItems, activeMentionIndex, handleMentionSelect, handleMentionProjectSelect]);

  /**
   * The editor arm's mention menu. The suggestion plugin owns the trigger and
   * the range; this only mirrors its query into the AnchoredComposerMenu state
   * the textarea arm already drives, and answers whether the menu took a key.
   *
   * That answer is load-bearing. The plugin consumes a key from the keymap only
   * when this returns true, so an open-but-empty menu can never swallow the
   * Enter that was meant to send. Escape deliberately falls through to the
   * document-level closers, exactly as it does on the textarea arm.
   *
   * Rebuilt every render rather than memoized: the editor reads it live at
   * keystroke time, and a missed dependency here would be a stale commit.
   */
  const composerMention: ComposerMentionConfig = {
    menu: {
      onOpen: (state) => {
        mentionCommitRef.current = state.commit;
        setMentionQuery(state.query);
        setMentionIndex(MENTION_INDEX_FIRST);
        setShowMentions(true);
      },
      onUpdate: (state) => {
        mentionCommitRef.current = state.commit;
        setMentionQuery(state.query);
        setShowMentions(true);
      },
      onClose: () => {
        mentionCommitRef.current = null;
        setShowMentions(false);
      },
      onKeyDown: (event) => {
        if (!showMentions || mentionItems.length === 0) return false;
        if (event.key === KEY_ARROW_DOWN) {
          setMentionIndex((prev) =>
            prev >= mentionItems.length - 1 ? MENTION_INDEX_FIRST : prev + 1,
          );
          return true;
        }
        if (event.key === KEY_ARROW_UP) {
          setMentionIndex((prev) =>
            prev <= MENTION_INDEX_FIRST ? mentionItems.length - 1 : prev - 1,
          );
          return true;
        }
        if ((event.key === KEY_ENTER && !event.shiftKey) || event.key === KEY_TAB) {
          commitActiveMention();
          return true;
        }
        return false;
      },
    },
  };

  const resolveSlashCommand = useCallback(
    (commandId: string, argument: string): SlashCommandOutcome => {
      const custom = customCommands.find((c) => c.id === commandId || c.name === commandId);
      if (custom) {
        const template = custom.template.trim();
        // `{{input}}` lets a template place the typed argument; templates
        // without it get the argument appended so nothing the user typed is
        // thrown away.
        const content = template.includes('{{input}}')
          ? template.replaceAll('{{input}}', argument)
          : [template, argument].filter(Boolean).join('\n\n');
        return { status: 'applied', content, toggles: {} };
      }

      switch (commandId) {
        case 'search':
          if (!modelSupportsSearch) {
            return {
              status: 'unavailable',
              notice:
                '/search needs a model that can search the web. Switch to Auto or a search-capable model, then try again.',
            };
          }
          return {
            status: 'applied',
            content: argument,
            toggles: { webSearchEnabled: true },
          };
        case 'think':
          if (!isAutoModeModelId(composerSelectedModelId) && !modelSupportsThinkingCap) {
            return {
              status: 'unavailable',
              notice:
                '/think needs a model with extended reasoning. Switch to Auto or a reasoning model, then try again.',
            };
          }
          return { status: 'applied', content: argument, toggles: {}, enableThinking: true };
        case 'image':
          if (!hostCanGenerateImage) {
            return {
              status: 'unavailable',
              notice: 'Image generation is not available from this chat.',
            };
          }
          if (mediaAvailabilityStatus !== 'ready' || availableImageModels.length === 0) {
            return {
              status: 'unavailable',
              notice:
                mediaAvailabilityStatus === 'error'
                  ? (mediaAvailabilityError ?? 'Could not check image model availability.')
                  : 'No image model is currently available in this deployment.',
            };
          }
          if (!canUseImageGeneration) {
            return {
              status: 'unavailable',
              notice: 'Image generation is available on Pro and above.',
            };
          }
          return { status: 'applied', content: argument, toggles: { imageMode: true } };
        case 'code':
          if (!modelSupportsCodeExecution) {
            return {
              status: 'unavailable',
              notice:
                '/code needs a model that can run code on this deployment. Switch models, then try again.',
            };
          }
          return { status: 'applied', content: argument, toggles: { codeExecutionEnabled: true } };
        default:
          return {
            status: 'unavailable',
            notice: `"/${commandId}" isn't available on this surface.`,
          };
      }
    },
    [
      customCommands,
      modelSupportsSearch,
      modelSupportsThinkingCap,
      modelSupportsCodeExecution,
      canUseImageGeneration,
      composerSelectedModelId,
      hostCanGenerateImage,
      mediaAvailabilityStatus,
      mediaAvailabilityError,
      availableImageModels.length,
    ],
  );

  /** Commit a resolved command's effects. Returns the new message body. */
  const commitSlashCommand = useCallback(
    (outcome: Extract<SlashCommandOutcome, { status: 'applied' }>) => {
      if (Object.keys(outcome.toggles).length > 0) setComposerToggles(outcome.toggles);
      if (outcome.enableThinking) setThinkingEnabled(true);
      return outcome.content;
    },
    [setComposerToggles, setThinkingEnabled],
  );

  const handleSlashSelect = useCallback(
    (commandId: string) => {
      setShowSlashMenu(false);
      const outcome = resolveSlashCommand(commandId, stripSlashCommandToken(messageRef.current));
      if (outcome.status === 'unavailable') {
        // AUDIT-FIX CMP-8: a command that will not run must not clear the input.
        setLocalNotice(outcome.notice);
        return;
      }
      setLocalNotice(null);
      writeComposerMessage(commitSlashCommand(outcome));
      setTimeout(focusComposer, FOCUS_AFTER_COMMIT_MS);
    },
    [resolveSlashCommand, commitSlashCommand, writeComposerMessage, focusComposer],
  );

  const handleSkillSelect = useCallback(
    (skillName: string) => {
      const skill = availableSkills.find((candidate) => candidate.name === skillName);
      if (!skill) return;
      setSelectedSkillName(skill.name);
      // AUDIT-FIX CMP-8: keep whatever the user already typed after the
      // command token instead of wiping the input (see handleSlashSelect).
      writeComposerMessage(stripSlashCommandToken(messageRef.current));
      setShowSlashMenu(false);
      setTimeout(focusComposer, FOCUS_AFTER_COMMIT_MS);
    },
    [availableSkills, setSelectedSkillName, writeComposerMessage, focusComposer],
  );

  /**
   * AUDIT-FIX CMP-16: what the NEXT send (immediate or queued) will actually
   * carry. One list drives the queued-follow-up chip and the send-preview
   * summary, so they can never describe different tool sets.
   */
  const activeToolLabels = useMemo(() => {
    const labels: string[] = [];
    if (canUseAgiWork && workMode === 'agiwork') labels.push('AGI Work');
    if (webSearchEnabled) labels.push('Web search');
    if (researchEnabled) labels.push('Deep Research');
    if (codeExecutionEnabled) labels.push('Run code');
    if (officeCreationEnabled) labels.push('Office files');
    if (thinkingEnabled) labels.push('Extended thinking');
    if (selectedSkillName) labels.push(`/${selectedSkillName}`);
    if (selectedMcpContext?.prompt) labels.push(`Prompt: ${selectedMcpContext.prompt.name}`);
    if (selectedMcpContext?.resources?.length) {
      labels.push(
        `${selectedMcpContext.resources.length} connector resource${selectedMcpContext.resources.length === 1 ? '' : 's'}`,
      );
    }
    return labels;
  }, [
    canUseAgiWork,
    workMode,
    webSearchEnabled,
    researchEnabled,
    codeExecutionEnabled,
    officeCreationEnabled,
    thinkingEnabled,
    selectedSkillName,
    selectedMcpContext,
  ]);

  const handleStop = useCallback(() => {
    onStop?.();
  }, [onStop]);

  const pendingSlashCommand = useMemo(() => {
    const parsed = splitSlashCommand(message);
    if (!parsed) return null;
    const token = parsed.token.toLowerCase();
    const builtIn = BUILT_IN_SLASH_COMMANDS.find(
      (command) => command.id === token && !command.requiredCapability,
    );
    if (builtIn) {
      return { commandId: builtIn.id, label: builtIn.label, argument: parsed.argument };
    }
    const custom = customCommands.find((command) => command.name.toLowerCase() === token);
    if (custom) {
      return { commandId: custom.id, label: `/${custom.name}`, argument: parsed.argument };
    }
    return null;
  }, [message, customCommands]);
  const pendingSlashOutcome = useMemo(
    () =>
      pendingSlashCommand
        ? resolveSlashCommand(pendingSlashCommand.commandId, pendingSlashCommand.argument)
        : null,
    [pendingSlashCommand, resolveSlashCommand],
  );

  const handleSubmit = useCallback(() => {
    if (!message.trim() && attachments.length === 0) return;
    if (disabled) return;
    if (hasAttachmentConflict) return;
    if (trialExhausted) {
      onUpgradeRequest?.();
      return;
    }

    /**
     * AUDIT-FIX CMP-9: apply a typed command at SEND time.
     *
     * `/search latest AI news` is the form the registry itself documents in
     * every `example`, but the slash menu closed on the first space and nothing
     * else parsed the line, so the whole string was sent as literal text and
     * the command never ran. Resolving here means the typed form and the menu
     * form go through exactly the same capability checks.
     */
    let outgoingContent = message;
    let sendWebSearchEnabled = webSearchEnabled;
    let sendCodeExecutionEnabled = codeExecutionEnabled;
    let sendThinkingEnabled = thinkingEnabled;
    let sendImageMode = imageMode;
    if (pendingSlashCommand) {
      const outcome = resolveSlashCommand(
        pendingSlashCommand.commandId,
        pendingSlashCommand.argument,
      );
      if (outcome.status === 'unavailable') {
        setLocalNotice(outcome.notice);
        return;
      }
      outgoingContent = commitSlashCommand(outcome);
      sendWebSearchEnabled = outcome.toggles.webSearchEnabled ?? sendWebSearchEnabled;
      sendCodeExecutionEnabled = outcome.toggles.codeExecutionEnabled ?? sendCodeExecutionEnabled;
      sendImageMode = outcome.toggles.imageMode ?? sendImageMode;
      sendThinkingEnabled = outcome.enableThinking === true || sendThinkingEnabled;
      if (!outgoingContent.trim() && attachments.length === 0) {
        // The command was applied (its toggle is now on and visible in the "+"
        // badge); there is simply nothing to send yet.
        writeComposerMessage(outgoingContent);
        return;
      }
    }

    if (!secretWarningAcknowledgedRef.current && containsSecrets(outgoingContent)) {
      secretWarningAcknowledgedRef.current = true;
      setLocalNotice(
        'This message looks like it contains an API key or credential. Send again to continue, or edit it first.',
      );
      return;
    }

    if (sendImageMode) {
      if (isTurnActive) return;
      if (attachments.length > 0) {
        setLocalNotice(
          'Image generation works from your prompt only. Remove the attached files, or leave image mode to send them to the chat model.',
        );
        return;
      }
      const prompt = outgoingContent.trim();
      if (!prompt) return;
      if (!onGenerateImage) {
        setLocalNotice('Image generation is not available from this composer.');
        return;
      }
      if (
        mediaAvailabilityStatus !== 'ready' ||
        !imageModelId ||
        mediaAdmissionFor(imageModelId)?.state !== 'enabled'
      ) {
        setLocalNotice(
          mediaAvailabilityStatus === 'error'
            ? (mediaAvailabilityError ?? 'Could not check image model availability.')
            : 'No image model is currently available in this deployment.',
        );
        return;
      }
      onGenerateImage(prompt, {
        aspectRatio: effectiveImageAspectRatio,
        modelId: imageModelId,
      });
      clearComposerState();
      return;
    }

    // Video generation mode: same delegation contract as image. The task runs
    // for a minute or more behind a status poll, so it is deliberately not part
    // of the streaming turn and is not queued.
    if (videoMode) {
      if (isTurnActive) return;
      // AUDIT-FIX MEDIA-VIDEO-01: same contract as image above. The video
      // request schema has no reference-image field at all, so an attachment
      // here has nowhere to go and must not be swallowed by the send.
      if (attachments.length > 0) {
        setLocalNotice(
          'Video generation works from your prompt only. Remove the attached files, or leave video mode to send them to the chat model.',
        );
        return;
      }
      const prompt = outgoingContent.trim();
      if (!prompt) return;
      if (!onGenerateVideo) {
        setLocalNotice('Video generation is not available from this composer.');
        return;
      }
      if (
        mediaAvailabilityStatus !== 'ready' ||
        !videoModelId ||
        mediaAdmissionFor(videoModelId)?.state !== 'enabled'
      ) {
        setLocalNotice(
          mediaAvailabilityStatus === 'error'
            ? (mediaAvailabilityError ?? 'Could not check video model availability.')
            : 'No video model is currently available in this deployment.',
        );
        return;
      }
      // Carry the picked model so the picker is a real control: the route at
      // /api/media/video/generate already validates a caller-supplied model
      // (modelType must be 'video', must be live, provider must be executable)
      // and falls back to the catalog's video_generation slot when omitted.
      // Send the DERIVED tuple, not the raw state: a model switch can leave an
      // unsupported ratio/quality staged, and the derived values are the ones
      // the pills are showing.
      onGenerateVideo(prompt, {
        ...(videoModelId ? { modelId: videoModelId } : {}),
        aspectRatio: effectiveVideoAspectRatio,
        resolution: effectiveVideoResolution,
        ...(effectiveVideoDurationSecs !== undefined
          ? { durationSecs: effectiveVideoDurationSecs }
          : {}),
      });
      clearComposerState();
      return;
    }

    const sendArgs: Parameters<typeof onSend> = [
      outgoingContent,
      attachments.length > 0 ? attachments : undefined,
      selectedSkillName ?? undefined,
      {
        workMode: canUseAgiWork ? workMode : 'chat',
        projectId: pickerActiveProjectId,
        webSearchEnabled: sendWebSearchEnabled,
        thinkingEnabled:
          sendThinkingEnabled &&
          (isAutoModeModelId(composerSelectedModelId) || modelSupportsThinkingCap),
        codeExecutionEnabled: sendCodeExecutionEnabled,
        officeCreationEnabled,
        researchEnabled,
        // AUDIT-FIX CMP-6/CMP-7: ONE style value reaches the server. The old
        // `styleMode` hint was always dropped in favour of `styleInstruction`
        // (see useChatStream), so sending it was pure noise; the instruction is
        // now composed from the single style store plus the new length axis and
        // is never empty, so out-of-the-box turns finally carry real guidance.
        styleInstruction: getStyleInstruction(responseStyle, activeCustomStyleId, responseLength),
        skillName: selectedSkillName ?? undefined,
        mcpContext: selectedMcpContext ?? undefined,
        disabledConnectorIds: disabledConnectorIds.length > 0 ? disabledConnectorIds : undefined,
        memoryEnabled: memoryEnabledForChat,
        // CAP-048: attach the structured goal on an AGI Work send. The objective
        // is the composed message; the optional scope fields ride alongside.
        agiWorkGoal:
          canUseAgiWork && workMode === 'agiwork'
            ? buildAgiWorkGoalInput(outgoingContent, {
                constraints: agiWorkConstraints,
                deliverable: agiWorkDeliverable,
              })
            : undefined,
      },
    ];

    if (isTurnActive) {
      // AUDIT-FIX STR-8/BUG-15: capture the TARGET conversation alongside the
      // arguments so the flush can prove it is still delivering to the chat the
      // message was written for.
      const editingId = editingQueuedIdRef.current;
      editingQueuedIdRef.current = null;
      const queued: QueuedFollowUp = {
        id: editingId ?? globalThis.crypto.randomUUID(),
        conversationId: conversationId ?? null,
        args: sendArgs,
        preview: outgoingContent.trim() || 'Attachment',
        // AUDIT-FIX CMP-16: publish the queued turn's tools immediately; the sync
        // effect above only fires on a subsequent toggle change.
        toolsLabel: activeToolLabels.length > 0 ? activeToolLabels.join(' · ') : null,
      };
      setQueuedFollowUps((current) => {
        const index = editingId ? current.findIndex((item) => item.id === editingId) : -1;
        if (index === -1) return [...current, queued];
        const next = [...current];
        next[index] = queued;
        return next;
      });
      clearComposerState();
      return;
    }

    setSendPendingFlag(true);
    const result = onSend(...sendArgs);

    if (result === SEND_GUARD_BLOCKED) return;
    if (result === false) {
      setSendPendingFlag(false);
      return;
    }
    clearComposerState();
  }, [
    message,
    attachments,
    selectedSkillName,
    selectedMcpContext,
    disabledConnectorIds,
    memoryEnabledForChat,
    isTurnActive,
    disabled,
    hasAttachmentConflict,
    trialExhausted,
    onUpgradeRequest,
    imageMode,
    effectiveImageAspectRatio,
    imageModelId,
    mediaAdmissionFor,
    mediaAvailabilityError,
    mediaAvailabilityStatus,
    onGenerateImage,
    videoMode,
    videoModelId,
    effectiveVideoAspectRatio,
    effectiveVideoResolution,
    effectiveVideoDurationSecs,
    onGenerateVideo,
    conversationId,
    workMode,
    canUseAgiWork,
    pickerActiveProjectId,
    pendingSlashCommand,
    resolveSlashCommand,
    commitSlashCommand,
    // Ambient search plus research/style settings are read directly in the
    // body; keeping them here prevents the send callback from closing over a
    // stale capability projection.
    webSearchEnabled,
    researchEnabled,
    responseStyle,
    responseLength,
    activeCustomStyleId,
    thinkingEnabled,
    composerSelectedModelId,
    modelSupportsThinkingCap,
    codeExecutionEnabled,
    officeCreationEnabled,
    agiWorkConstraints,
    agiWorkDeliverable,
    onSend,
    clearComposerState,
    writeComposerMessage,
    activeToolLabels,
  ]);

  useEffect(() => {
    if (!dictationSendRef.current) return;
    dictationSendRef.current = false;
    if (!message.trim() && attachments.length === 0) return;
    handleSubmit();
  }, [message, attachments.length, handleSubmit]);

  /**
   * AUDIT-FIX STR-23: the composer input is per-conversation. Park the outgoing
   * conversation's half-typed text under its own id and restore the incoming
   * one's, so a private draft can never follow the user into another chat.
   *
   * Parking is the cleanup rather than the next run's first act because the
   * outgoing composer usually does not survive to see the change: the
   * empty-state and in-conversation composers are separate positions in the
   * page's tree, so opening a new chat unmounts one and mounts the other, and
   * an effect body only ever runs on the instance that stays. The mount then
   * reads the draft back. Session-only by design; the store does not persist
   * `draftsByConversation`, so a reload still starts on an empty composer.
   */
  useEffect(() => {
    const parked = useChatStore.getState().getDraftContent(conversationId);
    // A saved conversation owns its draft outright. The unsaved surface does
    // not. Its slot is shared by every new chat, so it is only the same draft
    // when the user stepped back to it. See pending-composer-draft.
    writeComposerMessage(conversationId ? parked : restorablePendingDraft(parked));
    return () => {
      const outgoing = messageRef.current;
      if (outgoing.trim()) {
        setDraftContent(outgoing, conversationId);
      } else {
        clearDraftContent(conversationId);
      }
      // Only ever park text, never the absence of it. The new chat the user
      // opened in between leaves this surface empty on its way out, and
      // parking that would wipe the draft the step back is coming for. A sent
      // draft is discarded explicitly instead, in clearComposerState.
      if (!conversationId && outgoing.trim()) parkPendingDraft(outgoing);
    };
  }, [conversationId, setDraftContent, clearDraftContent, writeComposerMessage]);

  // Handle prefillText prop · when the parent passes a new non-empty prefillText, copy it
  // into the local message and notify the parent it was consumed. This runs in an EFFECT,
  // not during render: onPrefillConsumed is a PARENT (WebChatPage) state setter, and calling
  // it during this component's render triggers React's "Cannot update a component while
  // rendering a different component" warning (the recurring dev-overlay "1 Issue").
  const consumedPrefillRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!prefillText || prefillText.length === 0 || prefillText === consumedPrefillRef.current) {
      return;
    }
    consumedPrefillRef.current = prefillText;
    writeComposerMessage(prefillText);
    onPrefillConsumed?.();
    setSendPendingFlag(false);
  }, [prefillText, onPrefillConsumed, writeComposerMessage]);

  /**
   * A draft can also be parked while this composer is on screen; a send that
   * never reached a model hands the text back that way. Reading it only on
   * mount was why a failed send looked like the message had simply vanished:
   * the same instance stays mounted for an existing chat, and a brand-new chat
   * mounts its replacement BEFORE the save fails. Never overwrite live typing.
   *
   * Only a draft that ARRIVES while this composer is on screen is a handback.
   * One that was already parked when it mounted belongs to the surface the
   * user just left, and on the unsaved surface that is the previous new chat's
   * text; restoring it here would hand it forward and undo the rule the mount
   * path applies.
   */
  const seenParkedDraftRef = useRef(parkedDraft);
  useEffect(() => {
    if (parkedDraft === seenParkedDraftRef.current) return;
    seenParkedDraftRef.current = parkedDraft;
    setSendPendingFlag(false);
    if (!parkedDraft || messageRef.current.trim()) return;
    writeComposerMessage(parkedDraft);
    setLocalNotice(RESTORED_DRAFT_NOTICE);
    clearDraftContent(conversationId);
  }, [clearDraftContent, conversationId, parkedDraft, writeComposerMessage]);

  /**
   * A send the guard refused is parked in the store under its own fingerprint,
   * never under a conversation id, so this runs on EVERY mount and on every
   * `conversationId` change as well as when the slot itself changes. That is
   * the point: the block happens while a first turn is still creating its
   * conversation, and both the placeholder rename and the empty-state to
   * in-conversation swap land between the block and the moment a composer can
   * hold the text. Whichever instance is on screen when the dust settles reads
   * the slot and hands it back.
   *
   * Declared AFTER the conversation-draft effect so a rename cannot overwrite
   * what this restores: React runs effect bodies in declaration order within a
   * commit, and that one writes the incoming conversation's (empty) draft.
   *
   * The slot is not emptied here. It is released in `clearComposerState`, once
   * the restored text has actually left through a send or an explicit clear,
   * so a remount in between finds it still waiting.
   */
  useEffect(() => {
    if (!parkedSend) {
      restoredParkedSendRef.current = null;
      return;
    }
    const live = messageRef.current.trim();
    if (live && live !== parkedSend.content.trim()) {
      // The user typed something else in the meantime. Theirs is newer, so the
      // parked copy is stale and holding it would ambush a later remount.
      clearParkedSend(parkedSend.fingerprint);
      restoredParkedSendRef.current = null;
      return;
    }
    restoredParkedSendRef.current = parkedSend.fingerprint;
    // Only when THIS effect is the one putting the text back: the module-scope
    // pending flag is shared, and `live` already equal to `parkedSend.content`
    // means the guard's own caller never cleared the composer in the first
    // place (see `SEND_GUARD_BLOCKED` in WebChatPage's `handleSend`) -- an
    // earlier send this one collided with can still genuinely be in flight,
    // and clearing the flag here would hide its "Sending..." state instead of
    // this send's.
    if (live) return;
    setSendPendingFlag(false);
    writeComposerMessage(parkedSend.content);
    setLocalNotice(RESTORED_BLOCKED_SEND_NOTICE);
  }, [clearParkedSend, conversationId, parkedSend, writeComposerMessage]);

  // Flush a queued follow-up when the active turn finishes (true→false).
  //
  // Navigating away mid-turn fires this and the draft effect above in the same
  // commit, and the discard branch below must run against the draft that is
  // already parked. It does: parking is that effect's cleanup, and React runs
  // every cleanup in a commit before any effect body.
  useEffect(() => {
    if (wasLoadingRef.current && !isTurnActive) {
      const queue = queuedFollowUpsRef.current;
      const deliverable = queue.filter((item) => item.conversationId === (conversationId ?? null));
      const stranded = queue.filter((item) => item.conversationId !== (conversationId ?? null));
      const next = deliverable[0];
      const remaining = deliverable.slice(1);
      setQueuedFollowUps(remaining);
      queuedFollowUpsRef.current = remaining;
      if (next) onSend(...next.args);
      for (const pending of stranded) {
        {
          // AUDIT-FIX STR-8/BUG-15: this edge was produced by navigating away,
          // not by the queued turn finishing. Sending now would deliver a
          // message composed for another chat into the one on screen. Park the
          // text back on ITS conversation's draft (AUDIT-FIX STR-23) and say so
          // out loud -- silently dropping it would be its own data loss.
          const [queuedContent, queuedAttachments] = pending.args;
          const savedAsDraft = typeof queuedContent === 'string' && queuedContent.trim().length > 0;
          if (savedAsDraft) {
            // Merge, never overwrite: the draft-parking effect may have just
            // stored text the user typed after queueing this one.
            const parked = useChatStore.getState().getDraftContent(pending.conversationId);
            setDraftContent(
              parked ? `${queuedContent}\n\n${parked}` : queuedContent,
              pending.conversationId,
            );
          }
          // Say exactly what happened: attachments are File handles and cannot
          // be parked in a draft, so claiming "saved" for them would be a lie.
          setLocalNotice(
            [
              'Your queued message was not sent: you switched chats before the reply finished.',
              savedAsDraft
                ? 'It was saved as a draft in the original chat.'
                : 'Nothing was sent anywhere.',
              queuedAttachments && queuedAttachments.length > 0
                ? 'Its attachments were not kept. Re-attach them to send it.'
                : null,
            ]
              .filter(Boolean)
              .join(' '),
          );
        }
      }
    }
    wasLoadingRef.current = isTurnActive;
  }, [isTurnActive, onSend, conversationId, setDraftContent]);

  const cancelQueuedMessage = useCallback((id: string) => {
    if (editingQueuedIdRef.current === id) editingQueuedIdRef.current = null;
    setQueuedFollowUps((current) => current.filter((item) => item.id !== id));
  }, []);

  const editQueuedMessage = useCallback(
    (id: string) => {
      const target = queuedFollowUpsRef.current.find((item) => item.id === id);
      if (!target) return;
      editingQueuedIdRef.current = id;
      writeComposerMessage(target.args[0]);
      const attachmentsToRestore = target.args[1];
      if (attachmentsToRestore && attachmentsToRestore.length > 0) {
        addChatAttachments([...attachmentsToRestore]);
      }
      focusComposer();
    },
    [addChatAttachments, writeComposerMessage, focusComposer],
  );

  /**
   * AUDIT-FIX CMP-16: a queued follow-up is now a first-class message.
   *
   * The "+" menu and mic used to be disabled during streaming while the
   * textarea deliberately stayed enabled for type-ahead, so a queued message
   * could be written but could not have its tools set or be dictated, and
   * nothing on screen said which toggles it would carry. The controls are
   * enabled above; this keeps the queued snapshot in step with them (the
   * snapshot still exists so a queue flush can never pick up options from a
   * different conversation) and publishes the resulting tool list.
   */
  useEffect(() => {
    // Only the most recently queued message follows the visible toggles: those
    // controls describe what the composer would send NOW, and rewriting an
    // older queued message's options from them would silently change a choice
    // the user already made for it.
    const pending = queuedFollowUpsRef.current.at(-1);
    if (!pending) return;
    const meta = pending.args[3];
    if (!meta) return;
    pending.args[3] = {
      ...meta,
      workMode: canUseAgiWork ? workMode : 'chat',
      webSearchEnabled,
      researchEnabled,
      codeExecutionEnabled,
      officeCreationEnabled,
      thinkingEnabled:
        thinkingEnabled && (isAutoModeModelId(composerSelectedModelId) || modelSupportsThinkingCap),
      styleInstruction: getStyleInstruction(responseStyle, activeCustomStyleId, responseLength),
    };
    const toolsLabel = activeToolLabels.length > 0 ? activeToolLabels.join(' · ') : null;
    setQueuedFollowUps((current) =>
      current.map((item, index) => (index === current.length - 1 ? { ...item, toolsLabel } : item)),
    );
  }, [
    activeToolLabels,
    canUseAgiWork,
    workMode,
    webSearchEnabled,
    researchEnabled,
    codeExecutionEnabled,
    officeCreationEnabled,
    thinkingEnabled,
    composerSelectedModelId,
    modelSupportsThinkingCap,
    responseStyle,
    responseLength,
    activeCustomStyleId,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Forward navigation keys to SlashCommandMenu when open
      if (showSlashMenu) {
        const consumed = slashMenuRef.current?.handleKey(e.key);
        if (consumed) {
          e.preventDefault();
          return;
        }
      }

      // The mention menu only owns navigation keys while it actually has rows
      // to navigate; an empty menu must never swallow Enter and strand a
      // message the user meant to send.
      if (showMentions && mentionItems.length > 0 && !e.nativeEvent.isComposing) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionIndex((prev) => (prev >= mentionItems.length - 1 ? 0 : prev + 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionIndex((prev) => (prev <= 0 ? mentionItems.length - 1 : prev - 1));
          return;
        }
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
          e.preventDefault();
          commitActiveMention();
          return;
        }
      }

      // Plain Enter sends; Shift+Enter inserts a newline (the ChatGPT/Claude chat
      // convention). Cmd/Ctrl+Enter also sends. Never submit while a picker owns
      // Enter (slash) or mid-IME-composition (e.g. CJK candidates).
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !showSlashMenu) {
        e.preventDefault();
        handleSubmit();
      }

      if (e.key === 'Escape') {
        setShowMentions(false);
        setShowOverflowMenu(false);
        setShowSlashMenu(false);
      }
    },
    [handleSubmit, showMentions, showSlashMenu, mentionItems.length, commitActiveMention],
  );

  const hasContent = Boolean(message.trim() || attachments.length > 0);
  const composerDisabled = disabled || trialExhausted;
  const selectedMediaModelUnavailable =
    (imageMode && mediaAdmissionFor(imageModelId)?.state !== 'enabled') ||
    (videoMode && mediaAdmissionFor(videoModelId)?.state !== 'enabled');

  // AUDIT-FIX CMP-32: length feedback against the real contract ceiling.
  const messageLength = message.length;
  const showCharCounter = messageLength >= COMPOSER_COUNTER_THRESHOLD;
  const charCounterExceeded = messageLength >= COMPOSER_MAX_CHARS;

  const sendButtonMode = isTurnActive ? 'stop' : 'send';

  /**
   * + button indicator.
   *
   * The count is derived from the same explicit options that remain in this
   * menu, so the tint, badge, accessible name, and row checkmarks cannot
   * disagree. Automatic search and model-owned reasoning deliberately do not
   * count here because neither is a + menu setting.
   */
  const overflowActiveOptions: Array<{ label: string; Icon: React.ElementType }> = [];
  if (selectedSkillName) {
    overflowActiveOptions.push({ label: `Skill: ${selectedSkillName}`, Icon: Sparkles });
  }
  if (researchEnabled) {
    overflowActiveOptions.push({ label: 'Deep Research', Icon: Telescope });
  }
  if (codeExecutionEnabled) {
    overflowActiveOptions.push({ label: 'Run code', Icon: Terminal });
  }
  if (officeCreationEnabled) {
    overflowActiveOptions.push({ label: 'Office files', Icon: FileText });
  }
  // Temporary chat deliberately does not join this chip: the founder keeps
  // the composer face to plus, mode pill, Style, model trigger, mic, send,
  // and the state already surfaces in the page header instead.
  const overflowActiveCount = overflowActiveOptions.length;
  const hasOverflowActive = overflowActiveCount > 0;
  const primaryOverflowActive = overflowActiveOptions[0];
  const PrimaryOverflowIcon = primaryOverflowActive?.Icon;

  // AUDIT-FIX GOV-39: safe-area-bottom-additive keeps the send button clear of
  // the iOS home indicator. layout.tsx sets viewportFit:'cover', which makes a
  // missing inset worse rather than neutral.
  return (
    <div className="chat-composer-container relative w-full pb-4 safe-area-bottom-additive sticky bottom-0 z-20 bg-[var(--chat-bg)] backdrop-blur-sm md:static md:bg-transparent md:backdrop-blur-none">
      <DragDropOverlay onDrop={handleFileDrop} />

      {localNotice && (
        <div
          role="alert"
          className="mb-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {localNotice}
        </div>
      )}

      {pastedTextUndo && (
        <div
          role="status"
          data-testid="pasted-text-notice"
          className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
        >
          <span>
            That paste was long, so it was attached as {pastedTextUndo.fileName} instead of filling
            the message box.
          </span>
          <button
            type="button"
            data-testid="pasted-text-undo"
            className="font-medium text-foreground underline underline-offset-2 transition-colors hover:no-underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              const index = attachments.findIndex((file) => file.name === pastedTextUndo.fileName);
              if (index >= 0) removeFile(index);
              appendComposerMessage(pastedTextUndo.text);
              setPastedTextUndo(null);
              focusComposer();
            }}
          >
            Put it back in the message
          </button>
          <button
            type="button"
            aria-label="Dismiss paste notice"
            className="ml-auto text-muted-foreground transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setPastedTextUndo(null)}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {queuedFollowUps.length > 0 && (
        <ul aria-label="Queued messages" className="mb-2 flex flex-col gap-1.5">
          {queuedFollowUps.map((queued, index) => (
            <li
              key={queued.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
              data-testid="queued-followup"
            >
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                {queuedFollowUps.length > 1
                  ? `${QUEUED_ROW_LEAD} ${index + 1} of ${queuedFollowUps.length}: `
                  : `${QUEUED_ROW_LEAD}: `}
                {queued.preview}
                {/* AUDIT-FIX CMP-16: say which toggles the queued turn will carry.
                    they are editable while it waits (the "+" menu stays open during
                    streaming), so the user can see and change them. */}
                {queued.toolsLabel && (
                  <span className="ml-1 text-[var(--chat-text-muted)]">· {queued.toolsLabel}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => editQueuedMessage(queued.id)}
                className="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Edit queued message: ${queued.preview}`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => cancelQueuedMessage(queued.id)}
                className="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`Cancel queued message: ${queued.preview}`}
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}

      {trialExhausted && (
        <div
          role="alert"
          className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <span>Free usage limit reached. Upgrade to continue.</span>
          <button
            type="button"
            onClick={onUpgradeRequest}
            className="shrink-0 rounded-sm font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 dark:text-amber-200 dark:hover:text-amber-50"
          >
            Upgrade
          </button>
        </div>
      )}

      {/* Selected Skill Badge */}
      {selectedSkillName && (
        <div className="mb-2 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300">
            /{selectedSkillName}
            <button
              onClick={() => setSelectedSkillName(null)}
              className="rounded-full p-0.5 hover:bg-emerald-500/20"
              aria-label={`Remove ${selectedSkillName} skill`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        </div>
      )}

      {selectedMcpContext && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {selectedMcpContext.prompt ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-600/30 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-700 dark:text-sky-300">
              Prompt: {selectedMcpContext.prompt.name}
            </span>
          ) : null}
          {(selectedMcpContext.resources ?? []).map((resource) => (
            <span
              key={`${resource.connectorId}:${resource.uri}`}
              className="inline-flex max-w-64 items-center gap-1.5 truncate rounded-full border border-sky-600/30 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-700 dark:text-sky-300"
            >
              Resource: {resource.name ?? resource.uri}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setSelectedMcpContext(null)}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted"
            aria-label="Remove selected connector context"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Working Folder Chip, desktop-only capability; absent on web/mobile.
          When the unified "Project or folder" picker is present its chip shows
          the folder selection instead, so this standalone chip only renders on
          surfaces without the picker. */}
      {!projectPicker && canUseWorkingDirectory && folderName && (
        <div className="mb-2 flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-300">
            <FolderOpen className="h-3 w-3 shrink-0" />
            {folderName}
            <button
              type="button"
              onClick={clearFolder}
              className="rounded-full p-0.5 hover:bg-amber-500/20"
              aria-label="Clear working folder"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        </div>
      )}

      {/* Attachments */}
      <AttachmentPreview
        previews={previews}
        onRemove={removeFile}
        className="mb-2"
        privacyShortLabel={attachmentPrivacyShortLabel}
      />

      {/* AUDIT-FIX MEDIA-VIDEO-01: files that were staged BEFORE the user
          entered image/video mode (the + menu switches mode without touching
          the attachment list). The send is blocked rather than silently
          dropping them; both ways out are one click. */}
      {mediaAttachmentConflict && (
        <div
          role="alert"
          className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
          data-testid="media-attachment-conflict"
        >
          <p className="text-foreground">
            {attachments.length === 1 ? 'The attached file is' : 'The attached files are'} not used
            here: {mediaModeNoun.toLowerCase()} generation works from your prompt only.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={clearAttachments}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              {attachments.length === 1 ? 'Remove attachment' : 'Remove attachments'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (imageMode) setImageMode(false);
                else setVideoMode(false);
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
            >
              Leave {mediaModeNoun.toLowerCase()} mode
            </button>
          </div>
        </div>
      )}

      {hasAttachmentConflict && (
        <div
          role="alert"
          className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
        >
          <p className="text-foreground">
            {attachmentConflictKind === 'image'
              ? "The selected model can't read the attached image. Switch to Auto, choose an image-capable model, or remove the image."
              : attachmentConflictKind === 'document'
                ? "The selected model can't read the attached document. Switch to Auto, choose a document-capable model, or remove the file."
                : "The selected model can't read the attached image and document. Switch to Auto, choose a multimodal model, or remove the files."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const autoModelId = getAllowedAutoModesForTier(subscriptionTier)[0];
                if (autoModelId) setComposerSelectedModelId(autoModelId);
              }}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              Use Auto
            </button>
            <button
              type="button"
              onClick={() => {
                clearAttachments();
                setShowCompatibleModels(false);
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
            >
              Remove attachments
            </button>
            <button
              type="button"
              onClick={() => setShowCompatibleModels((open) => !open)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium"
            >
              Choose a compatible model
            </button>
          </div>
          {showCompatibleModels && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border bg-popover p-1">
              {/* AUDIT-FIX CMP-28: an empty bordered box with no message was
                  rendered when the user's tier has no multimodal model. Say
                  what happened and offer the only action that helps. */}
              {compatibleModels.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  <p>No model on your plan can read this attachment.</p>
                  {onUpgradeRequest && (
                    <button
                      type="button"
                      onClick={onUpgradeRequest}
                      className="mt-1 font-medium text-primary underline underline-offset-2"
                    >
                      See plans with multimodal models
                    </button>
                  )}
                </div>
              )}
              {compatibleModels.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  aria-label={`Use ${model.name}`}
                  onClick={() => {
                    setComposerSelectedModelId(model.id);
                    setShowCompatibleModels(false);
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                >
                  {model.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Input Container. One card shape and no permanent shadow at every
          state (rest, empty, focus): a shadow only ever appears on focus. */}
      <div
        id="chat-composer"
        className={cn(
          'relative z-10 rounded-2xl border bg-[var(--chat-input-bg)] backdrop-blur-sm transition-all duration-200',
          isFocused
            ? 'border-[var(--chat-border-strong)] shadow-md ring-2 ring-[var(--chat-focus-ring)]'
            : 'border-[var(--chat-border-strong)] shadow-none',
        )}
      >
        {/* Slash Command Menu */}
        {showSlashMenu && (
          <SlashCommandMenu
            ref={slashMenuRef}
            query={slashQuery}
            onSelect={handleSlashSelect}
            onSkillSelect={handleSkillSelect}
            skills={availableSkills}
            imageCommandAvailable={
              hostCanGenerateImage &&
              mediaAvailabilityStatus === 'ready' &&
              availableImageModels.length > 0
            }
            codeCommandAvailable={modelSupportsCodeExecution}
            onClose={() => setShowSlashMenu(false)}
          />
        )}

        {/* @Mention Dropdown */}
        <AnchoredComposerMenu
          anchorRef={composerRowRef}
          open={showMentions}
          label="Mention suggestions"
          // Typing opens this one, and the user is still typing: the query keeps
          // narrowing after it appears. Arrows and Enter reach the menu through
          // the input's own key handler, so focus never has to live here.
          autoFocusFirstItem={false}
          // The menu returns focus to its anchor, which is the input ROW, not a
          // focusable node; so say where focus actually belongs. Both arms
          // resolve to their own input.
          onRequestClose={() => {
            setShowMentions(false);
            focusComposer();
          }}
          contentRef={mentionsRef}
          className="w-72"
        >
          <div className="p-1.5" role="listbox" aria-label="Mentions">
            <div className="mb-1.5 px-3 py-1 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
              Skills
            </div>
            {skillsLoading ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Loading skills…</p>
            ) : skillsError ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Skills are temporarily unavailable.
              </p>
            ) : filteredSkills.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No matching skills.</p>
            ) : (
              filteredSkills.map((skill, i) => (
                <button
                  key={skill.name}
                  type="button"
                  role="option"
                  aria-selected={i === activeMentionIndex}
                  onMouseEnter={() => setMentionIndex(i)}
                  onClick={() => handleMentionSelect(skill)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                    i === activeMentionIndex ? 'bg-muted/70' : 'hover:bg-muted/60',
                  )}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <span className="text-[12px] font-bold">
                      {skill.name.substring(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{skill.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {skill.description}
                    </div>
                  </div>
                </button>
              ))
            )}

            {projectScopeSelectable && (
              <>
                <div className="mb-1.5 mt-2 border-t border-border/40 px-3 pt-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                  Projects
                </div>
                {filteredMentionProjects.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No matching projects.</p>
                ) : (
                  filteredMentionProjects.map((project, i) => {
                    const index = filteredSkills.length + i;
                    return (
                      <button
                        key={project.id}
                        type="button"
                        role="option"
                        aria-selected={index === activeMentionIndex}
                        onMouseEnter={() => setMentionIndex(index)}
                        onClick={() => handleMentionProjectSelect(project.id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                          index === activeMentionIndex ? 'bg-muted/70' : 'hover:bg-muted/60',
                        )}
                      >
                        <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {project.name}
                        </span>
                      </button>
                    );
                  })
                )}
              </>
            )}
          </div>
        </AnchoredComposerMenu>

        <div
          className={cn(
            'flex flex-col gap-1.5 p-1.5 sm:gap-2 sm:p-2',
            // Home's textbox is a step taller than an ongoing chat's, so its
            // vertical padding is tighter by the same step: both cards rest at
            // the same one-row height.
            emptyState && 'px-3 py-1.5 sm:px-5 sm:py-1.5',
          )}
        >
          {/* Rest-state row: one line (plus, textbox, right cluster) while the
              composer is wide enough. items-end keeps the plus/model/mic/send
              controls pinned to the textbox's last line as it autosizes
              taller; below the container's narrow width the textbox takes a
              row of its own and the controls drop under it.

              `flex-row` is load-bearing, not decoration: globals.css turns
              every `[class*='composer']` into a column below 641px, so any
              flex element named for the composer has to say which way it
              runs. */}
          <span className="sr-only" role="status" aria-live="polite">
            {dictation.announcement}
          </span>

          {dictation.isActive && (
            <DictationStrip
              status={dictation.status}
              bars={dictation.bars}
              error={dictation.error}
              reducedMotion={dictation.reducedMotion}
              emptyState={Boolean(emptyState)}
              onCancel={dictation.cancel}
              onStop={dictation.stop}
              onSend={dictation.send}
              onRetry={dictation.retry}
            />
          )}

          <div
            className={cn(
              'chat-composer-row min-w-0 flex-row items-end gap-1 sm:gap-2',
              dictation.isActive ? 'hidden' : 'flex',
            )}
          >
            {/* Textbox, grows to a cap then scrolls internally; the card
                itself never changes width while it grows. */}
            <div
              ref={composerRowRef}
              className={cn(
                'chat-composer-field relative min-w-0 flex-1 min-h-[36px]',
                emptyState ? 'sm:min-h-[40px]' : 'sm:min-h-[36px]',
              )}
            >
              <ComposerInput
                textareaRef={textareaRef}
                editorRef={composerEditorRef}
                value={message}
                onChange={handleInputChange}
                onTextChange={handleComposerTextChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onPasteDecision={handleEditorPasteDecision}
                onDropFiles={handleEditorDropFiles}
                onSubmit={handleSubmit}
                onFocusChange={setIsFocused}
                existingFileNames={attachmentNames}
                mention={composerMention}
                isSlashMenuActive={() => showSlashMenu}
                onSlashMenuKey={(key) => slashMenuRef.current?.handleKey(key) ?? false}
                placeholder={
                  isTurnActive && !imageMode && !videoMode
                    ? TURN_ACTIVE_PLACEHOLDER
                    : imageMode
                      ? 'Describe or edit an image'
                      : videoMode
                        ? 'Describe the video you want'
                        : // AUDIT-FIX shell-nav-ia-gap-03: the work-mode axis now
                          ((canUseAgiWork ? WORK_MODE_PLACEHOLDERS[workMode] : null) ?? placeholder)
                }
                // Type-ahead: the textarea stays enabled while a turn streams so the
                // user can compose a follow-up (queued + auto-sent on completion).
                // Image mode has no streaming turn to type ahead of, so it stays gated.
                disabled={composerDisabled || ((imageMode || videoMode) && isTurnActive)}
                emptyState={Boolean(emptyState)}
                maxLength={COMPOSER_MAX_CHARS}
                ariaDescribedBy={showCharCounter ? 'composer-char-counter' : undefined}
              />
              {/* AUDIT-FIX CMP-32: character budget. Silent before it matters,
                  explicit once the message approaches the contract ceiling. */}
              {showCharCounter && (
                <p
                  id="composer-char-counter"
                  role="status"
                  className={cn(
                    'absolute bottom-0 right-2 z-20 text-[12px] tabular-nums',
                    charCounterExceeded ? 'text-danger' : 'text-muted-foreground',
                  )}
                >
                  {messageLength.toLocaleString()} / {COMPOSER_MAX_CHARS.toLocaleString()}{' '}
                  characters
                  {charCounterExceeded ? ' · limit reached' : ''}
                </p>
              )}
            </div>

            {/* `flex-nowrap` is load-bearing: the field owns the first line, so
                these controls must share one line rather than wrapping a third
                row onto a phone. `chat-composer-leading-end` carries the auto
                right margin that pushes the rest to the right edge. */}
            <div className="chat-composer-controls flex w-full min-w-0 flex-row flex-nowrap items-center gap-1 sm:gap-2">
              <div className="chat-composer-leading-end flex shrink-0 flex-row items-center gap-1 sm:gap-2">
                {/* + Overflow Menu Button */}
                <div className="relative shrink-0" ref={overflowRef}>
                  <button
                    ref={overflowTriggerRef}
                    onClick={() => {
                      const next = !showOverflowMenu;
                      setShowOverflowMenu(next);
                    }}
                    disabled={composerDisabled}
                    className={cn(
                      'relative flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full transition-colors',
                      hasOverflowActive
                        ? 'bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary-text)]'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                      composerDisabled && 'cursor-not-allowed opacity-50',
                    )}
                    aria-label={
                      hasOverflowActive
                        ? `Add attachments and tools: ${overflowActiveCount} active`
                        : 'Add attachments and tools'
                    }
                    aria-pressed={hasOverflowActive}
                    aria-expanded={showOverflowMenu}
                  >
                    <Plus className="h-5 w-5" />
                    {/* AUDIT-FIX CMP-13: the active state used to be a colour tint
                  only (WCAG 1.4.1). The count badge repeats it as shape and
                  text; the label above repeats it for screen readers. */}
                    {hasOverflowActive && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[12px] font-bold text-primary-foreground"
                      >
                        {overflowActiveCount}
                      </span>
                    )}
                  </button>

                  {/* + Menu Popover.

                Portaled and viewport-clamped (see AnchoredComposerMenu): as an
                `absolute bottom-full` child it was clipped by the chat shell's
                overflow-hidden column, and at ordinary laptop viewport heights
                the clip removed its FIRST row, "Add photos & files", leaving
                the product with no reachable way to attach a file. */}
                  <ComposerPlusMenu
                    anchorRef={overflowTriggerRef}
                    contentRef={overflowMenuRef}
                    open={showOverflowMenu}
                    onRequestClose={() => setShowOverflowMenu(false)}
                    closeMenu={closeMenu}
                    workPalette={workScopeBarVisible}
                    onAddFiles={() => {
                      fileInputRef.current?.click();
                      closeMenu();
                    }}
                    mediaModeActive={mediaModeActive}
                    mediaModeNoun={mediaModeNoun}
                    billingPolicyReady={billingPolicyReady}
                    billingPolicyError={Boolean(billingPolicyError)}
                    mediaAvailabilityStatus={mediaAvailabilityStatus}
                    hostCanGenerateImage={hostCanGenerateImage}
                    imageModelsAvailable={availableImageModels.length > 0}
                    canUseImageGeneration={canUseImageGeneration}
                    imageMode={imageMode}
                    onCreateImage={handleCreateImageFromMenu}
                    hostCanGenerateVideo={hostCanGenerateVideo}
                    videoModelsAvailable={availableVideoModels.length > 0}
                    canUseVideoGeneration={canUseVideoGeneration}
                    videoMode={videoMode}
                    onCreateVideo={handleCreateVideoFromMenu}
                    canTakeScreenshot={canTakeScreenshotCap}
                    isCapturingScreenshot={isCapturingScreenshot}
                    onTakeScreenshot={() => {
                      void handleTakeScreenshot();
                    }}
                    showWorkingFolderRow={!projectPicker && canUseWorkingDirectory}
                    canPickFolder={canPickFolder}
                    folderName={folderName}
                    onPickFolder={() => {
                      pickFolder();
                      closeMenu();
                    }}
                    onClearFolder={clearFolder}
                    selectedSkillName={selectedSkillName}
                    onOpenSettings={openSettings}
                    connectorsSubmenuOpen={connectorsSubmenuOpen}
                    onToggleConnectorsSubmenu={() => setConnectorsSubmenuOpen((open) => !open)}
                    connectorsLoading={connectorsLoading}
                    connectors={connectedConnectorOptions}
                    disabledConnectorIds={disabledConnectorIds}
                    onSetConnectorEnabled={setConnectorEnabled}
                    webSearchEnabled={webSearchEnabled}
                    showScopeRow={workScopeBarVisible && !mediaModeActive}
                    scopeOpen={agiWorkFieldsOpen}
                    scopeDisabled={isTurnActive || composerDisabled}
                    onToggleScope={() => {
                      setAgiWorkFieldsOpen((open) => !open);
                      closeMenu();
                    }}
                    researchEnabled={researchEnabled}
                    researchDisabled={disabled || isFreeTrial || !researchAvailableForModel}
                    researchTitle={
                      isFreeTrial
                        ? 'Upgrade to use Deep Research'
                        : !researchAvailableForModel
                          ? "Deep Research isn't available for this model. Choose Auto or a model that supports Deep Research."
                          : undefined
                    }
                    onToggleResearch={() => {
                      handleResearchToggle();
                      closeMenu();
                    }}
                    codeExecutionEnabled={codeExecutionEnabled}
                    codeExecutionDisabled={disabled || !modelSupportsCodeExecution}
                    codeExecutionTitle={
                      !modelSupportsCodeExecution
                        ? "Run code isn't available for this model on this deployment. Choose Auto or a model that can run code."
                        : undefined
                    }
                    onToggleCodeExecution={() => {
                      handleCodeExecutionToggle();
                      closeMenu();
                    }}
                    officeCreationEnabled={officeCreationEnabled}
                    officeCreationDisabled={disabled || !modelSupportsOfficeCreation}
                    officeCreationTitle={
                      !modelSupportsOfficeCreation
                        ? "Office file creation isn't available for this model."
                        : undefined
                    }
                    onToggleOfficeCreation={() => {
                      handleOfficeCreationToggle();
                      closeMenu();
                    }}
                    memoryEnabled={memoryCapabilityEnabled && memoryEnabledForChat}
                    memoryDisabled={disabled || !memoryCapabilityEnabled}
                    memoryTitle={
                      !memoryCapabilityEnabled
                        ? 'Turn on Memory in Settings > Capabilities to use it here.'
                        : undefined
                    }
                    onToggleMemory={() => {
                      handleMemoryToggle();
                      closeMenu();
                    }}
                    showTemporaryChat={!activeConversationId || Boolean(onSetTemporaryChat)}
                    temporaryChatSaving={isSavingIncognito}
                    isIncognito={isIncognito}
                    canToggleIncognito={canToggleIncognito}
                    onToggleIncognito={() => {
                      void handleIncognitoToggle();
                      closeMenu();
                    }}
                    sendPreviewPresentation={sendPreviewPresentation}
                    skills={availableSkills}
                    onSelectSkill={handleSkillSelect}
                    folders={projectPicker?.projects ?? EMPTY_PALETTE_FOLDERS}
                    onSelectFolder={handlePickProject}
                  />
                </div>

                {/* Chat | AGI Work sits on the face at every width and in an
                existing chat, so the "+" menu carries no Mode row. */}
                {projectPicker && canUseAgiWork && !imageMode && !videoMode && (
                  <div
                    data-testid="composer-work-mode"
                    className="chat-composer-mode-inline flex shrink-0 flex-row items-center self-center rounded-full border border-[var(--chat-border-strong)] bg-muted/40 p-px text-xs font-medium"
                  >
                    {(['chat', 'agiwork'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleWorkModeChange(mode)}
                        disabled={isTurnActive || composerDisabled}
                        aria-pressed={workMode === mode}
                        title={WORK_MODE_TITLES[mode]}
                        className={cn(
                          'flex h-6 items-center rounded-full px-1.5 transition-colors',
                          workMode === mode
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                          (isTurnActive || composerDisabled) && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        {WORK_MODE_LABELS[mode]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Per-chat Memory-off marker: visible without opening the menu,
                silent when memory is on (the common case). */}
              {memoryCapabilityEnabled && !memoryEnabledForChat && (
                <span
                  data-testid="memory-indicator"
                  data-active="false"
                  title="Memory is off for this conversation. This turn neither reads nor saves account memories."
                  className="inline-flex shrink-0 items-center self-center text-[var(--chat-text-muted)]"
                >
                  <Brain className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">Memory off</span>
                </span>
              )}

              {primaryOverflowActive && PrimaryOverflowIcon && (
                <div
                  role="status"
                  aria-label={`Active options: ${overflowActiveOptions
                    .map((option) => option.label)
                    .join(', ')}`}
                  title={overflowActiveOptions.map((option) => option.label).join(', ')}
                  className="flex h-8 min-w-0 shrink items-center gap-1.5 rounded-full border border-[var(--chat-accent-primary)]/25 bg-[var(--chat-accent-primary)]/10 px-2 text-[12px] font-medium text-[var(--chat-accent-primary-text)]"
                >
                  <PrimaryOverflowIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden max-w-24 truncate sm:inline">
                    {primaryOverflowActive.label}
                  </span>
                  {overflowActiveCount > 1 && (
                    <span aria-hidden="true" className="shrink-0 tabular-nums">
                      +{overflowActiveCount - 1}
                    </span>
                  )}
                </div>
              )}

              {/* Image-mode pills (only when the user is generating an image). */}
              {imageMode && (
                <div className={cn('flex shrink-0 items-center gap-1')}>
                  {/* Image pill: click to exit image mode */}
                  <button
                    type="button"
                    onClick={() => {
                      setImageMode(false);
                      setImageAspectRatio('auto');
                      setImageModelId(availableImageModels[0]?.id ?? '');
                    }}
                    className="flex h-8 items-center gap-1.5 rounded-full bg-primary/15 px-2.5 text-xs font-medium text-primary ring-1 ring-primary/30 transition-all hover:bg-primary/25"
                    aria-label="Exit image generation mode"
                    title="Click to exit image generation mode"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    <span>Image</span>
                    <X className="h-3 w-3 opacity-60" />
                  </button>

                  {/* Aspect ratio selector */}
                  <div className="relative">
                    <button
                      ref={imageAspectTriggerRef}
                      type="button"
                      onClick={() => {
                        setShowImageAspectMenu((p) => !p);
                        setShowImageModelMenu(false);
                      }}
                      className="flex h-8 items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground"
                      aria-label="Select aspect ratio"
                    >
                      {imageAspectOptions.find((option) => option.id === effectiveImageAspectRatio)
                        ?.label ?? 'Auto'}
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    <AnchoredComposerMenu
                      anchorRef={imageAspectTriggerRef}
                      open={showImageAspectMenu}
                      label="Image aspect ratio"
                      onRequestClose={() => setShowImageAspectMenu(false)}
                      className="w-44 p-1"
                    >
                      {imageAspectOptions.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setImageAspectRatio(opt.id);
                            setShowImageAspectMenu(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors',
                            effectiveImageAspectRatio === opt.id
                              ? 'bg-primary/10 text-primary'
                              : 'hover:bg-muted/60',
                          )}
                        >
                          <span className="flex-1 text-left">{opt.label}</span>
                          {effectiveImageAspectRatio === opt.id && (
                            <Check className="h-3 w-3 shrink-0 text-primary" />
                          )}
                        </button>
                      ))}
                    </AnchoredComposerMenu>
                  </div>
                </div>
              )}

              {/* Video-mode controls. Aspect/quality come from the selected
              model's catalog output tuples; restricted qualities carry their
              required duration on send. Exit resets the whole media choice. */}
              {videoMode && (
                <div className={cn('flex shrink-0 items-center gap-1')}>
                  <button
                    type="button"
                    onClick={() => {
                      setVideoMode(false);
                      setVideoModelId(availableVideoModels[0]?.id ?? '');
                      setVideoAspectRatio('16:9');
                      setVideoResolution('720p');
                      setShowVideoAspectMenu(false);
                      setShowVideoQualityMenu(false);
                    }}
                    className="flex h-8 items-center gap-1.5 rounded-full bg-primary/15 px-2.5 text-xs font-medium text-primary ring-1 ring-primary/30 transition-all hover:bg-primary/25"
                    aria-label="Exit video generation mode"
                    title="Click to exit video generation mode"
                  >
                    <Video className="h-3.5 w-3.5" />
                    <span>Video</span>
                    <X className="h-3 w-3 opacity-60" />
                  </button>

                  {/* Aspect ratio. Options come from the model's published
                    `videoGeneration.outputSizes`, so a model that offers only
                    landscape shows one entry rather than a lie. */}
                  {videoAspectOptions.length > 1 && (
                    <div className="relative">
                      <button
                        ref={videoAspectTriggerRef}
                        type="button"
                        onClick={() => {
                          setShowVideoAspectMenu((p) => !p);
                          setShowVideoQualityMenu(false);
                          setShowVideoModelMenu(false);
                        }}
                        className="flex h-8 items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground"
                        aria-label="Select video aspect ratio"
                      >
                        {effectiveVideoAspectRatio}
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      <AnchoredComposerMenu
                        anchorRef={videoAspectTriggerRef}
                        open={showVideoAspectMenu}
                        label="Video aspect ratio"
                        onRequestClose={() => setShowVideoAspectMenu(false)}
                        className="w-44 p-1"
                      >
                        {videoAspectOptions.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setVideoAspectRatio(opt.id);
                              setShowVideoAspectMenu(false);
                            }}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors',
                              effectiveVideoAspectRatio === opt.id
                                ? 'bg-primary/10 text-primary'
                                : 'hover:bg-muted/60',
                            )}
                          >
                            <span className="flex-1 text-left">{opt.label}</span>
                            {effectiveVideoAspectRatio === opt.id && (
                              <Check className="h-3 w-3 shrink-0 text-primary" />
                            )}
                          </button>
                        ))}
                      </AnchoredComposerMenu>
                    </div>
                  )}

                  {/* Quality. Scoped to the chosen aspect because the two are not
                    independent, a resolution can exist in landscape and not in
                    portrait. Durations a quality restricts are surfaced inline
                    so the 8s-only rule is visible BEFORE a failed send. */}
                  {videoQualityOptions.length > 1 && (
                    <div className="relative">
                      <button
                        ref={videoQualityTriggerRef}
                        type="button"
                        onClick={() => {
                          setShowVideoQualityMenu((p) => !p);
                          setShowVideoAspectMenu(false);
                          setShowVideoModelMenu(false);
                        }}
                        className="flex h-8 items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground"
                        aria-label="Select video quality"
                      >
                        {videoQualityOptions.find((o) => o.id === effectiveVideoResolution)
                          ?.label ?? effectiveVideoResolution}
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      <AnchoredComposerMenu
                        anchorRef={videoQualityTriggerRef}
                        open={showVideoQualityMenu}
                        label="Video quality"
                        onRequestClose={() => setShowVideoQualityMenu(false)}
                        className="w-52 p-1"
                      >
                        {videoQualityOptions.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setVideoResolution(opt.id);
                              setShowVideoQualityMenu(false);
                            }}
                            className={cn(
                              'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors',
                              effectiveVideoResolution === opt.id
                                ? 'bg-primary/10 text-primary'
                                : 'hover:bg-muted/60',
                            )}
                          >
                            <span className="flex-1 text-left">{opt.label}</span>
                            {opt.durationSecs && (
                              <span className="shrink-0 text-[12px] text-muted-foreground">
                                {opt.durationSecs.join('/')}s only
                              </span>
                            )}
                            {effectiveVideoResolution === opt.id && (
                              <Check className="h-3 w-3 shrink-0 text-primary" />
                            )}
                          </button>
                        ))}
                      </AnchoredComposerMenu>
                    </div>
                  )}
                </div>
              )}

              {/* Style and model selectors. In normal mode the full ComposerFooter
              sits inline beside the send button; in image mode the image-model
              picker takes its place. The textbox above carries the row's
              `flex-1`, so these right-cluster controls need no `ml-auto` of
              their own to reach the right edge.

              Video mode is excluded for the same reason as image mode, and it used
              not to be: the video pill above documents that video resolves its model
              from the catalog's `video_generation` slot rather
              than from this picker, but the picker still rendered, so entering video
              mode left an unrelated text-model label displayed beside
              "Describe the video you want". That label named a model which had no part
              in the generation the send button would actually run, which is exactly the
              stale-model-label class the capability-honesty rule forbids. Showing no
              model here is strictly better than showing the wrong one; surfacing the
              resolved video model as a read-only label is the follow-up. */}
              {!imageMode && !videoMode && (
                <ComposerFooter
                  inline
                  className="min-w-0 shrink"
                  showModelSelector
                  lockModelSelector={false}
                  showStyleSelector={!isFreeTrial}
                  onUpgradeRequest={onUpgradeRequest}
                  onModelChange={onModelChange}
                />
              )}

              {imageMode && (
                <div className="relative shrink-0">
                  <button
                    ref={imageModelTriggerRef}
                    type="button"
                    onClick={() => {
                      setShowImageModelMenu((p) => !p);
                      setShowImageAspectMenu(false);
                    }}
                    className="flex h-8 items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground"
                    aria-label="Select image model"
                  >
                    {/* AUDIT-FIX CMP-26: no hardcoded model name. The catalog is
                      the only source for image models (this file's own header
                      says so); when it yields none there is nothing to pick and
                      the honest label says exactly that. */}
                    <span className="max-w-[120px] truncate">
                      {availableImageModels.find((m) => m.id === imageModelId)?.label ??
                        (mediaAvailabilityStatus === 'loading'
                          ? 'Checking image models…'
                          : 'No image model available')}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </button>
                  <AnchoredComposerMenu
                    anchorRef={imageModelTriggerRef}
                    open={showImageModelMenu}
                    label="Image model"
                    onRequestClose={() => setShowImageModelMenu(false)}
                    align="end"
                    className="w-52 p-1"
                  >
                    {availableImageModels.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setImageModelId(m.id);
                          if (!isImageAspectRatioSupported(m.id, imageAspectRatio)) {
                            setImageAspectRatio('auto');
                          }
                          setShowImageModelMenu(false);
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors',
                          imageModelId === m.id
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted/60',
                        )}
                      >
                        <span className="flex-1 text-left">{m.label}</span>
                        {imageModelId === m.id && (
                          <Check className="h-3 w-3 shrink-0 text-primary" />
                        )}
                      </button>
                    ))}
                    {mediaAvailabilityStatus === 'error' && (
                      <button
                        type="button"
                        onClick={retryMediaAvailability}
                        className="w-full rounded-lg px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      >
                        Retry model availability
                      </button>
                    )}
                    {mediaAvailabilityStatus === 'ready' && availableImageModels.length === 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        This deployment is not ready for image generation.
                      </p>
                    )}
                  </AnchoredComposerMenu>
                </div>
              )}

              {/* Video model picker. Mirrors the image picker above and takes the
                place of the text-model ComposerFooter, which is hidden in video
                mode. Before this existed, entering video mode left the TEXT
                selector on screen, so "Describe the video you want" sat beside a
                text model that had no part in the
                generation the send button ran, a stale model label. */}
              {videoMode && (
                <div className="relative shrink-0">
                  <button
                    ref={videoModelTriggerRef}
                    type="button"
                    onClick={() => setShowVideoModelMenu((p) => !p)}
                    className="flex h-8 items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground"
                    aria-label="Select video model"
                  >
                    {/* Same contract as the image label: the catalog is the only
                      source, so an empty catalog says so instead of naming a
                      model that cannot run. */}
                    <span className="max-w-[120px] truncate">
                      {availableVideoModels.find((m) => m.id === videoModelId)?.label ??
                        (mediaAvailabilityStatus === 'loading'
                          ? 'Checking video models…'
                          : 'No video model available')}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </button>
                  <AnchoredComposerMenu
                    anchorRef={videoModelTriggerRef}
                    open={showVideoModelMenu}
                    label="Video model"
                    onRequestClose={() => setShowVideoModelMenu(false)}
                    align="end"
                    className="w-52 p-1"
                  >
                    {availableVideoModels.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setVideoModelId(m.id);
                          setShowVideoModelMenu(false);
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors',
                          videoModelId === m.id
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted/60',
                        )}
                      >
                        <span className="flex-1 text-left">{m.label}</span>
                        {videoModelId === m.id && (
                          <Check className="h-3 w-3 shrink-0 text-primary" />
                        )}
                      </button>
                    ))}
                    {mediaAvailabilityStatus === 'error' && (
                      <button
                        type="button"
                        onClick={retryMediaAvailability}
                        className="w-full rounded-lg px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      >
                        Retry model availability
                      </button>
                    )}
                    {mediaAvailabilityStatus === 'ready' && availableVideoModels.length === 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        This deployment is not ready for video generation.
                      </p>
                    )}
                  </AnchoredComposerMenu>
                </div>
              )}

              {/* Voice input is part of free chat and remains capability-neutral. */}
              <div className="relative shrink-0">
                {/* AUDIT-FIX CMP-16: dictation follows the textarea, which stays
                  enabled during streaming for type-ahead. Disabling the mic
                  meant a queued follow-up could be typed but never dictated. */}
                <VoiceInputButton
                  onStart={dictation.start}
                  active={dictation.isActive}
                  disabled={composerDisabled}
                />
              </div>

              {/* Trailing slot: voice entry while the field is empty, send once
                it has text, Stop while a turn is running. */}
              {onEnterVoiceMode && sendButtonMode !== 'stop' && !hasContent ? (
                <VoiceEntryButton onStart={onEnterVoiceMode} disabled={composerDisabled} />
              ) : (
                <SendButton
                  mode={sendButtonMode}
                  isSending={isSendPending}
                  hasContent={hasContent}
                  queuedCount={queuedFollowUps.length}
                  disabled={
                    composerDisabled ||
                    (sendButtonMode !== 'stop' &&
                      (hasAttachmentConflict ||
                        mediaAttachmentConflict ||
                        selectedMediaModelUnavailable))
                  }
                  onClick={sendButtonMode === 'stop' ? handleStop : handleSubmit}
                  className="shrink-0"
                />
              )}
            </div>
          </div>

          {/* AUDIT-FIX CMP-9: a typed command is applied on send, so say so
              before the user presses Enter. */}
          {pendingSlashCommand && pendingSlashOutcome && (
            <p className="px-2 text-[12px] text-muted-foreground" role="status">
              {pendingSlashOutcome.status === 'unavailable' ? (
                pendingSlashOutcome.notice
              ) : (
                <>
                  <span className="font-medium text-foreground">{pendingSlashCommand.label}</span>{' '}
                  runs on send
                  {pendingSlashCommand.argument ? ` with: ${pendingSlashCommand.argument}` : ''}
                </>
              )}
            </p>
          )}
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={getAcceptAttribute()}
          disabled={composerDisabled}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            handleFileDrop(files);
            e.target.value = '';
          }}
          aria-label="File upload"
        />
      </div>

      {/* Scope surface under the card. In AGI Work it is the attached bar the
          leaders use: project, files, the connected plugins, and the desktop
          app in one strip. Free has no work-mode axis, so it keeps the single
          project pill that is its only scope control. */}
      {projectPicker && (workMode === 'agiwork' || !canUseAgiWork) && !imageMode && (
        <div className="relative" ref={projectPickerRef}>
          {workScopeBarVisible ? (
            <div
              data-testid="composer-work-bar"
              className="-mt-3 flex flex-wrap items-center gap-1 rounded-b-2xl border border-t-0 border-[var(--chat-border-strong)] bg-[var(--chat-surface-hover)] px-2 pb-1.5 pt-4"
            >
              <button
                ref={projectPickerTriggerRef}
                type="button"
                onClick={() => {
                  setShowProjectPicker((prev) => !prev);
                  setProjectQuery('');
                }}
                disabled={isTurnActive || composerDisabled}
                className={cn(
                  WORK_BAR_ITEM_CLASS,
                  pickerHasSelection && WORK_BAR_ITEM_ACTIVE_CLASS,
                )}
                aria-label={
                  pickerHasSelection ? `${pickerPlaceholder}: ${pickerLabel}` : pickerLabel
                }
                aria-expanded={showProjectPicker}
                title={pickerHasSelection ? pickerLabel : undefined}
              >
                {pickerFolderName ? (
                  <FolderOpen className={WORK_BAR_GLYPH_CLASS} />
                ) : (
                  <Folder className={WORK_BAR_GLYPH_CLASS} />
                )}
                <span className="max-w-[180px] truncate">
                  {pickerHasSelection ? pickerLabel : WORK_BAR_LABELS.project}
                </span>
              </button>

              {pickerHasSelection && (
                <button
                  type="button"
                  onClick={handleClearPickerSelection}
                  className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  aria-label="Clear project or folder selection"
                >
                  <X className="h-3 w-3" />
                </button>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isTurnActive || composerDisabled}
                className={WORK_BAR_ITEM_CLASS}
              >
                <LibraryBig className={WORK_BAR_GLYPH_CLASS} />
                {WORK_BAR_LABELS.files}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowOverflowMenu(true);
                  setConnectorsSubmenuOpen(true);
                }}
                className={WORK_BAR_ITEM_CLASS}
              >
                {connectedConnectorOptions.length > 0 && (
                  <span className="flex shrink-0 items-center" aria-hidden="true">
                    {connectedConnectorOptions
                      .slice(0, WORK_BAR_CONNECTOR_MARKS)
                      .map((connector, index) => (
                        <OfficialConnectorLogo
                          key={connector.id}
                          connector={connector}
                          className={cn(
                            'h-4 w-4 rounded-full border-[var(--chat-input-bg)] shadow-none',
                            index > 0 && '-ml-1.5',
                          )}
                        />
                      ))}
                  </span>
                )}
                {!connectedConnectorOptions.length && (
                  <PluginsGlyph className={WORK_BAR_GLYPH_CLASS} />
                )}
                {WORK_BAR_LABELS.plugins}
              </button>

              <button
                type="button"
                onClick={() => router.push(DESKTOP_APP_HREF)}
                className={cn(WORK_BAR_ITEM_CLASS, 'ml-auto')}
              >
                <Monitor className={WORK_BAR_GLYPH_CLASS} />
                {WORK_BAR_LABELS.desktop}
              </button>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <div
                className={cn(
                  'flex h-8 min-w-0 items-center rounded-full border transition-all',
                  pickerHasSelection
                    ? 'border-[var(--chat-accent-primary)]/40 bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary-text)]'
                    : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                <button
                  ref={projectPickerTriggerRef}
                  type="button"
                  onClick={() => {
                    setShowProjectPicker((prev) => !prev);
                    setProjectQuery('');
                  }}
                  disabled={isTurnActive || composerDisabled}
                  className={cn(
                    'flex h-full min-w-0 items-center gap-1.5 pl-2.5 text-xs font-medium',
                    pickerHasSelection ? 'pr-1' : 'pr-2.5',
                    (isTurnActive || composerDisabled) && 'cursor-not-allowed opacity-50',
                  )}
                  aria-label={
                    pickerHasSelection ? `${pickerPlaceholder}: ${pickerLabel}` : pickerLabel
                  }
                  aria-expanded={showProjectPicker}
                  title={pickerHasSelection ? pickerLabel : undefined}
                >
                  {pickerFolderName ? (
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Folder className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="max-w-[220px] truncate">{pickerLabel}</span>
                  <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                </button>
                {pickerHasSelection && (
                  <button
                    type="button"
                    onClick={handleClearPickerSelection}
                    className="mr-1.5 shrink-0 rounded-full p-0.5 hover:bg-[var(--chat-accent-primary)]/20"
                    aria-label="Clear project or folder selection"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          )}

          <AnchoredComposerMenu
            anchorRef={projectPickerTriggerRef}
            open={showProjectPicker}
            label="Project or folder"
            onRequestClose={() => setShowProjectPicker(false)}
            contentRef={projectPickerMenuRef}
            className="w-72 p-1.5"
          >
            <input
              type="text"
              value={projectQuery}
              onChange={(e) => setProjectQuery(e.target.value)}
              placeholder="Search projects..."
              aria-label="Search projects"
              autoFocus
              className="mb-1.5 w-full rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[var(--chat-accent-primary)]/40"
            />
            <div className="max-h-56 overflow-y-auto">
              {filteredPickerProjects.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {projectPicker.projects.length === 0 ? 'No projects yet' : 'No projects found'}
                </div>
              )}
              {filteredPickerProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => handlePickProject(project.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                >
                  <span className="min-w-0 flex-1 truncate text-left">{project.name}</span>
                  {projectPicker.activeProjectId === project.id && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-foreground" />
                  )}
                </button>
              ))}
            </div>

            <div className="my-1 border-t border-border/30" />

            {/* Local folder, working-directory surfaces (desktop) only.
                Render-gated by the capability matrix so web never shows a
                folder option; canPickFolder only disables when the desktop
                browser shell lacks the File System Access API. */}
            {canUseAgiWork && canUseWorkingDirectory && (
              <button
                type="button"
                disabled={!canPickFolder}
                onClick={handlePickFolderFromPicker}
                title={canPickFolder ? undefined : 'Folder access is not supported in this browser'}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60',
                  !canPickFolder && 'cursor-not-allowed opacity-50',
                )}
              >
                <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left">Choose a different folder</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                closeProjectPicker();
                projectPicker.onCreateProject();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
            >
              <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-left">Create new project</span>
            </button>

            <button
              type="button"
              onClick={() => {
                closeProjectPicker();
                router.push('/chat/projects');
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
            >
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-left">View all projects</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </AnchoredComposerMenu>
        </div>
      )}

      {/* CAP-048 AGI Work goal intake. The composed message is the objective;
          these optional inline fields let the user pin down scope + deliverable
          without a modal wall. Shown only in paid AGI Work mode. */}
      {canUseAgiWork && workMode === 'agiwork' && !imageMode && !videoMode && agiWorkFieldsOpen && (
        <div className="mt-2">
          <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/30 p-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" />
                {tAgiWork('agiWork.compose.constraintsLabel')} ·{' '}
                {tAgiWork('agiWork.compose.deliverableLabel')}
              </span>
              <button
                type="button"
                onClick={() => setAgiWorkFieldsOpen(false)}
                className="rounded-md px-1.5 py-0.5 text-[12px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                {tAgiWork('agiWork.compose.scopeHide')}
              </button>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-muted-foreground">
                {tAgiWork('agiWork.compose.constraintsLabel')}
              </span>
              <input
                type="text"
                value={agiWorkConstraints}
                onChange={(e) => setAgiWorkConstraints(e.target.value.slice(0, 1000))}
                placeholder={tAgiWork('agiWork.compose.constraintsPlaceholder')}
                disabled={isTurnActive || composerDisabled}
                className="w-full rounded-lg border border-border/40 bg-background/60 px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[var(--chat-accent-primary)]/40"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-muted-foreground">
                {tAgiWork('agiWork.compose.deliverableLabel')}
              </span>
              <input
                type="text"
                value={agiWorkDeliverable}
                onChange={(e) => setAgiWorkDeliverable(e.target.value.slice(0, 1000))}
                placeholder={tAgiWork('agiWork.compose.deliverablePlaceholder')}
                disabled={isTurnActive || composerDisabled}
                className="w-full rounded-lg border border-border/40 bg-background/60 px-3 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[var(--chat-accent-primary)]/40"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

export const ChatComposerNew = memo(ChatComposerNewComponent, (prev, next) => {
  return (
    prev.onSend === next.onSend &&
    // AUDIT-FIX STR-8/STR-23: a conversation switch MUST re-render -- it swaps
    // the draft and decides where a queued follow-up may be delivered.
    prev.conversationId === next.conversationId &&
    prev.isLoading === next.isLoading &&
    prev.isGenerating === next.isGenerating &&
    prev.placeholder === next.placeholder &&
    prev.disabled === next.disabled &&
    prev.prefillText === next.prefillText &&
    prev.onPrefillConsumed === next.onPrefillConsumed &&
    prev.droppedFiles === next.droppedFiles &&
    prev.onDroppedFilesConsumed === next.onDroppedFilesConsumed &&
    prev.onTypingChange === next.onTypingChange &&
    prev.onStop === next.onStop &&
    prev.onEnterVoiceMode === next.onEnterVoiceMode &&
    prev.clearSignal === next.clearSignal &&
    prev.emptyState === next.emptyState &&
    prev.attachmentPrivacyShortLabel === next.attachmentPrivacyShortLabel &&
    prev.sendPreviewPresentation === next.sendPreviewPresentation &&
    prev.onUpgradeRequest === next.onUpgradeRequest &&
    prev.onModelChange === next.onModelChange &&
    prev.onGenerateImage === next.onGenerateImage &&
    prev.onGenerateVideo === next.onGenerateVideo &&
    prev.freeTrial?.enabled === next.freeTrial?.enabled &&
    prev.freeTrial?.limitReached === next.freeTrial?.limitReached &&
    prev.projectPicker?.projects === next.projectPicker?.projects &&
    prev.projectPicker?.activeProjectId === next.projectPicker?.activeProjectId &&
    prev.projectPicker?.onSelectProject === next.projectPicker?.onSelectProject &&
    prev.projectPicker?.onCreateProject === next.projectPicker?.onCreateProject &&
    // AUDIT-FIX CMP-3: without an active conversation the handler is unused
    // (the toggle is local-only), but once one exists its presence decides
    // whether the "Temporary chat" control can save, so it must defeat
    // memoisation.
    prev.onSetTemporaryChat === next.onSetTemporaryChat
  );
});

ChatComposerNew.displayName = 'ChatComposerNew';
