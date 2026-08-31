'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import {
  Plus,
  X,
  Clock,
  Paperclip,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Check,
  Camera,
  EyeOff,
  ImagePlus,
  Image as ImageIcon,
  Video,
  FileText,
  Terminal,
  Folder,
  FolderOpen,
  Telescope,
  ListChecks,
  Monitor,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import { SlashCommandMenu, type SlashCommandMenuHandle } from './SlashCommandMenu';
import { useSettingsModal } from '@features/settings/components/SettingsModalProvider';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { SendButton } from './SendButton';
import { ComposerFooter } from './ComposerFooter';
import { DragDropOverlay } from './DragDropOverlay';
import { VoiceInputButton } from './VoiceInputButton';
import { AttachmentPreview } from './AttachmentPreview';
import { AnchoredComposerMenu } from './AnchoredComposerMenu';
import { getAcceptAttribute, useAttachments } from '@features/chat/hooks/use-attachments';
import { isChatImageMimeType } from '@/lib/chat-attachment-policy';
import { MANAGED_CLOUD_STATUS } from '@/lib/legal-constants';
import { useSkillsList, type SkillItem } from '@features/chat/hooks/use-skills-list';
import { useMediaModelAvailability } from '@features/chat/hooks/use-media-model-availability';
import {
  useChatStore,
  DEFAULT_COMPOSER_TOGGLES,
  PENDING_CONVERSATION_KEY,
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
import Link from 'next/link';
import {
  canUseBillingPlanCapability,
  getModels,
  isExecutableVideoModel,
  type CloudWorkMode,
  type SendPreviewPresentation,
} from '@agiworkforce/types';
import { isWebSearchAvailable, providerSupportsWebSearch } from '@/lib/web-search-support';
import {
  BUILT_IN_SLASH_COMMANDS,
  decideComposerPaste,
  matchMentionQuery,
  SendPreview,
  useCapability,
} from '@agiworkforce/unified-chat';
import { useCoworkFolderStore, supportsDirectoryPicker } from '@shared/stores/cowork-folder-store';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH } from '@agiworkforce/cloud-contracts';
import { ComposerFeedbackDialog } from './ComposerFeedbackDialog';
import { CameraCaptureDialog } from './CameraCaptureDialog';
import {
  BrowserControlRequirementDialog,
  BROWSER_CONTROL_MENU,
  BROWSER_CONTROL_TEST_IDS,
  COMPUTER_USE_ON_WEB,
} from '@features/chat/components/computer-use';
import { buildAgiWorkGoalInput, type AgiWorkGoalInput } from '@/features/chat/utils/agiwork-plan';
import { AI_ACCURACY_DISCLAIMER } from '@/lib/compliance/ai-act';
import {
  getImageAspectOptionsForModel,
  IMAGE_MODEL_DEFAULT,
  IMAGE_MODELS,
  isImageAspectRatioSupported,
  type ImageAspectRatio,
} from '../../lib/imageGenerationOptions';
// Video aspect/quality options come from the shared model catalog, not a
// web-local copy — Mobile and Desktop read the same source, so a model that
// publishes no 4k size cannot offer it on one surface and hide it on another.
import { getVideoAspectOptionsForModel, getVideoQualityOptionsForModel } from '@agiworkforce/types';
import {
  consumePendingMcpContextSelection,
  MCP_CONTEXT_SELECTED_EVENT,
  type McpContextSelection,
} from '@/features/connectors/lib/mcp-context-selection';

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

/** Composer work mode — claude.ai Chat/Cowork parity ("AGI Work" here). */
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

export const AGI_WORK_MATURITY_LABEL = 'Alpha';
export const AGI_WORK_MATURITY_TITLE = `AGI Work runs on Managed Cloud, which is in ${MANAGED_CLOUD_STATUS}. Runs can fail or stall, and behaviour may change.`;
const AGI_WORK_MATURITY_INLINE_ID = 'agi-work-maturity-inline';
const AGI_WORK_MATURITY_MENU_ID = 'agi-work-maturity-menu';

/**
 * `aria-hidden` because the badge sits inside the AGI Work button: leaving it
 * in the accessibility tree would rename the control from "AGI Work" to
 * "AGI Work Alpha". Assistive tech gets the disclosure from the sibling
 * `AgiWorkMaturityDescription` via `aria-describedby` instead.
 */
function AgiWorkMaturityBadge() {
  return (
    <span
      aria-hidden="true"
      data-testid="agi-work-maturity-badge"
      title={AGI_WORK_MATURITY_TITLE}
      className="ml-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1 text-[12px] font-medium uppercase leading-4 tracking-wide text-amber-800 dark:text-amber-300"
    >
      {AGI_WORK_MATURITY_LABEL}
    </span>
  );
}

function AgiWorkMaturityDescription({ id }: { id: string }) {
  return (
    <span id={id} className="sr-only">
      {AGI_WORK_MATURITY_TITLE}
    </span>
  );
}

const WORK_MODE_TITLES: Record<ComposerWorkMode, string> = {
  chat: 'Chat — quick questions and conversation',
  agiwork: 'AGI Work — multi-step tasks with tools, files, and reviewable deliverables',
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
}

interface ChatComposerProps {
  onSend: (
    content: string,
    attachments?: File[],
    skillId?: string,
    meta?: ComposerSendMeta,
  ) => void | false;
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
  /**
   * Persists the "Temporary chat" privacy flag for the ACTIVE conversation.
   *
   * AUDIT-FIX CMP-3: the toggle used to call the chat store's
   * `updateConversation` — a local Zustand map update with NO network call —
   * while the server reads `is_temporary` from the database to decide
   * auto-memory extraction and persistence, and `conversations` is excluded
   * from the store's `partialize` so the flag was also lost on reload. A user
   * who switched a live chat to "Temporary" was still having it remembered.
   *
   * Hosts must resolve `true` only once the write is durable. When this prop is
   * absent the control is NOT rendered: a privacy switch with no backing is
   * worse than no switch.
   */
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

/**
 * AUDIT-FIX CMP-9: split a leading `/token` off the composer text.
 *
 * The registry documents the argument form (`/search latest AI news`) but the
 * composer only ever recognised a bare token — the slash menu closed on the
 * first space and nothing else parsed the line, so the documented form was
 * unreachable and sent as literal text. These helpers let both the menu path
 * and the send path read the same shape.
 */
function splitSlashCommand(value: string): { token: string; argument: string } | null {
  const match = /^\/([A-Za-z0-9][A-Za-z0-9_-]*)(?:[ \t]+([\s\S]*))?$/.exec(value);
  if (!match) return null;
  return { token: match[1] ?? '', argument: (match[2] ?? '').trim() };
}

/** The text a command should leave behind once its token is consumed. */
function stripSlashCommandToken(value: string): string {
  return splitSlashCommand(value)?.argument ?? value;
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

/** Toggle row used in the + menu for connected send options. */
function MenuToggleRow({
  icon: Icon,
  label,
  checked,
  onToggle,
  disabled,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Native tooltip — used to explain WHY a row is disabled (e.g. no search path). */
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={title}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted/60',
      )}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 text-left">{label}</span>
      {checked && <Check className="h-3.5 w-3.5 text-foreground" />}
    </button>
  );
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
}: ChatComposerProps) => {
  const isTurnActive = isLoading || isGenerating;
  const [message, setMessage] = useState('');
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
  // Follow-up queue (claude.ai / ChatGPT parity): a message composed while the
  // current turn is still streaming is captured here and auto-sent when the turn
  // finishes, so the user never has to wait or manually re-send. Snapshotting the
  // exact onSend arguments (incl. the toggle/skill/project meta) at queue time
  // avoids sending with stale options if the user changes a toggle afterward.
  //
  // AUDIT-FIX STR-8/BUG-15: the snapshot now carries the conversation it was
  // composed FOR. The flush effect below fires on any isTurnActive true->false
  // edge -- including the one caused by navigating to another chat -- and used
  // to call `onSend` with no conversation id, so the host resolved it to
  // whatever chat had become active and a message written for A was sent into B.
  //
  // COMPOSER-005: the queue used to be a single slot, so a second send while a
  // follow-up was already waiting silently destroyed the first — a typed message
  // vanished with nothing on screen saying so. It is a list now; the flush still
  // releases exactly one message per finished turn, because the server's
  // per-conversation concurrency guard has not changed.
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
  // Settings-modal opener for the plus-menu Skills/Connectors/Plugins entries
  // (founder directive 2026-07-10: entries open the modal pane, no inline lists).
  const { openSettings } = useSettingsModal();
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
  // Cowork folder — local-only; handle is never forwarded to any API route.
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

  /**
   * AUDIT-FIX CMP-11/CMP-14: client gates now read the SAME canonical billing
   * catalog the server enforces.
   *
   * AGI Work was gated on `!isFreeTrial` (i.e. any tier that is not the website
   * free trial), while `request-processor.ts` requires
   * `canUseBillingPlanCapability(planTier, 'agi_work')` — PRO_TIERS. A
   * **basic**-tier user therefore got a fully enabled Chat | AGI Work toggle and
   * a hard `agi_work_plan_required` error on send. "Create image" had no tier
   * check at all while `/api/media/image/generate` rejects non-Pro with 403,
   * so the user composed a whole prompt and failed after a round trip.
   */
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

  /**
   * AUDIT-FIX CMP-1/CMP-2/CMP-5: the composer's send options now live in the
   * chat store, keyed by conversation.
   *
   * They were `useState` here, and `WebChatPage` renders this component in the
   * two opposite branches of an `isEmptyChat ? ... : ...` ternary — so sending
   * the first message unmounted one instance and mounted the other, resetting
   * work mode, Deep Research, Run code, Office files, style, image
   * mode and the selected skill with nothing on screen saying so. A chat
   * started in AGI Work silently became a plain chat from message 2, and
   * `applyWorkMode` server-side only ever applied to turn 1.
   *
   * Store-backed state survives that unmount/remount, and keying it by
   * conversation stops the toggles leaking from one chat into the next.
   */
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

  // "Project or folder" picker state (rendered only when the host passes
  // projectPicker — see the prop doc). The project selection lives in the
  // host's store; only the open/search UI state is local.
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

  // Platform capabilities (PLATFORM axis — does this surface expose the action at
  // all). Sourced from the shared capability matrix via the CapabilityProvider;
  // never branch on `platform === 'desktop'` or probe browser APIs. These gate
  // RENDERING (absent on web), composing with the model/tier gates below.
  const canUseWorkingDirectory = useCapability('canUseWorkingDirectory');
  const canTakeScreenshotCap = useCapability('canTakeScreenshot');
  const canUseCameraCap = useCapability('canUseCamera');

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

  /**
   * Aspect/quality choices come from the model registry, so the picker is
   * truthful per model: a model that publishes no 4k size never offers it,
   * while models with broader envelopes expose their catalog-owned ratios.
   *
   * Like the image ratio above, the effective values are DERIVED during render
   * rather than corrected by an effect — a model switch must not leave an
   * unsupported tuple staged for even one frame, because that frame is what
   * the send would use.
   */
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
  /**
   * AUDIT-FIX MEDIA-VIDEO-01 (confirms VOICE-MEDIA-010): staged attachments
   * were silently destroyed by an image/video send.
   *
   * `hasAttachmentConflict` above only asks whether the selected TEXT model can
   * read the file, so it never fired in a media mode. Meanwhile the media send
   * paths build their request from prompt + generation options only —
   * `onGenerateImage`/`onGenerateVideo` carry no attachment field, and
   * `ManagedMediaVideoGenerationRequestSchema` has no `source_image` — and then
   * `clearComposerState()` wiped the file with nothing on screen saying so.
   *
   * Until a real reference-image contract exists end to end, the honest
   * behaviour is to refuse the staging rather than accept and discard it:
   * `addChatAttachments` below rejects new files while a media mode is active,
   * and anything already staged when the mode is entered blocks the send behind
   * the explicit banner instead of disappearing.
   */
  const mediaModeActive = imageMode || videoMode;
  const mediaModeNoun = imageMode ? 'Image' : 'Video';
  const mediaAttachmentConflict = mediaModeActive && attachments.length > 0;
  const compatibleModels = getSelectableModels().filter(
    (model) =>
      model.capabilities.vision &&
      (isFreeTrial || subscriptionTier === 'free'
        ? FREE_TRIAL_MODELS.includes(model.id)
        : isModelAllowedForTier(model.id, subscriptionTier)),
  );
  // Plain search can use either a provider-native path or AGI's generic
  // function-tool fallback. `/api/me` exposes only whether that fallback is
  // configured; the shared helper combines it with the selected model's real
  // native-search/tool capabilities so Web/Desktop/Mobile cannot drift.
  const providerCanWebSearch = providerSupportsWebSearch(selectedModelMeta?.provider);
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
  // Deep Research is its own capability field in models.json, distinct from
  // plain web search. A search-only catalog entry can have
  // search:true/research:false, so the two controls cannot share one flag.
  // Gating on modelSupportsSearch alone both wrongly exposes Research for
  // search-only models and wrongly blocks it for research-only models.
  // Deep Research forces web_search on server-side (applyResearchMode), so it needs
  // the same provider search path — gate it the same way to avoid a cosmetic toggle.
  const modelSupportsResearch =
    isAutoSelected || ((selectedModelCaps?.research ?? false) && providerCanWebSearch);
  const modelSupportsThinkingCap = selectedModelCaps?.thinking ?? false;
  // Same both-signals rule as web search above: the catalog capability is
  // necessary but not sufficient. Native-tier providers (anthropic/google/
  // openai) run code on their own provider-hosted interpreter, so the catalog
  // flag alone is enough for them. Everyone else executes via E2B, which the
  // server only offers when the deployment's cut-over flag is on
  // (AGI_E2B_EXECUTION=1, surfaced via /api/me feature_flags.code_execution) —
  // gate those on BOTH signals so the "Run code" toggle is never a cosmetic
  // dead control. The server's real gate is the inline check in
  // request-processor.ts (~line 1239, `resolvedModelCaps?.codeExecution ?? true`);
  // that check is deliberately MORE permissive than this one for models absent
  // from the catalog (defaults to allowed, so a missing catalog entry never
  // silently drops the tool), so this is not a byte-for-byte mirror — this
  // client-side gate stays conservative (defaults to unavailable) so the
  // toggle is never rendered as a control the model may not actually honor.
  // Mirrored exactly by packages/ui/unified-chat/src/lib/codeExecutionAvailability.ts
  // (desktop/mobile), which shares this file's 3-signal formula.
  const deploymentCodeExecution = useBillingStore((s) => s.featureFlags?.code_execution ?? false);
  const providerHasNativeCodeExecution = ['anthropic', 'google', 'openai'].includes(
    (selectedModelMeta?.provider ?? '').toLowerCase(),
  );
  // Two honest paths (mirrors packages/ui/unified-chat isCodeExecutionAvailable):
  // native-tier providers run code on their own interpreter (catalog codeExecution
  // cap decides); everyone else uses the model-agnostic platform E2B sandbox, which
  // only needs tool-calling + the E2B deployment flag — so a tools-capable
  // open-weight model with `codeExecution:false` gets an honest
  // Run-code toggle when E2B is live, never a cosmetic dead control.
  const modelSupportsCodeExecution =
    isAutoSelected ||
    ((selectedModelCaps?.codeExecution ?? false) && providerHasNativeCodeExecution) ||
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
    if (researchEnabled && !modelSupportsResearch) setComposerToggles({ researchEnabled: false });
  }, [billingPolicyReady, researchEnabled, modelSupportsResearch, setComposerToggles]);

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

  // Incognito / temporary chat — wired to the live web-chat-store
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const isIncognito = useChatStore((s) => {
    const id = s.activeConversationId;
    return id ? (s.conversations.find((c) => c.id === id)?.isTemporary ?? false) : false;
  });
  const [isSavingIncognito, setIsSavingIncognito] = useState(false);
  const handleIncognitoToggle = useCallback(async () => {
    if (!activeConversationId || !onSetTemporaryChat) return;
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
  }, [activeConversationId, isIncognito, onSetTemporaryChat]);
  const canToggleIncognito =
    Boolean(activeConversationId) &&
    Boolean(onSetTemporaryChat) &&
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
  // UI-16: every remaining composer popover is portaled through
  // AnchoredComposerMenu for the reason documented in that file — the composer
  // sits inside overflow-hidden shell columns, so an `absolute` popover taller
  // than the space above it is silently cut off and its rows stop taking
  // pointer events. Each needs its own trigger to anchor from, and the project
  // picker needs a content ref too because its outside-click test can no longer
  // rely on DOM containment.
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

  const clearComposerState = useCallback(() => {
    setMessage('');
    // AUDIT-FIX STR-23: a sent/cleared composer must not leave a stale parked
    // draft that reappears when the user returns to this conversation.
    clearDraftContent(conversationId);
    clearAttachments();
    // Deep Research and style are persistent options. Managed Web search is an
    // ambient capability and is re-derived from the selected model/deployment.
    // Do not reset those values in the after-send clear.
    //
    // AUDIT-FIX CMP-1/CMP-2: that intent is now actually honoured — the toggles
    // live in the chat store keyed by conversation, so the empty→non-empty
    // remount that used to wipe them no longer touches them.
    //
    // A skill genuinely IS a one-shot choice, so it still clears here. Image and
    // video mode are NOT: this used to drop them on every send, so generating a
    // second image meant reopening the menu and re-picking the mode and model
    // each time, and the composer appeared to snap back to a text model the
    // instant you pressed send. Observed by the founder on both modes. Every
    // comparable product keeps you in the mode until you leave it, and there is
    // already an explicit way out — the × on the mode pill, which clears the
    // mode and its model together.
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
      textareaRef.current.style.height = 'auto';
    }
    // `availableImageModels`/`availableVideoModels` are gone from these deps
    // because the clear no longer reads them — the media model now survives a
    // send, so there is nothing here to reset it to.
  }, [clearAttachments, clearDraftContent, conversationId, setComposerToggles]);

  useEffect(() => {
    if (!isFreeTrial || !researchEnabled) return;
    setComposerToggles({ researchEnabled: false });
  }, [isFreeTrial, researchEnabled, setComposerToggles]);

  useEffect(() => {
    if (clearSignal === undefined || clearSignal === lastClearSignalRef.current) return;
    lastClearSignalRef.current = clearSignal;
    clearComposerState();
  }, [clearComposerState, clearSignal]);

  // Handle prefillText prop · when the parent passes a new non-empty prefillText, copy it
  // into the local message and notify the parent it was consumed. This runs in an EFFECT,
  // not during render: onPrefillConsumed is a PARENT (WebChatPage) state setter, and calling
  // it during this component's render triggers React's "Cannot update a component while
  // rendering a different component" warning (the recurring dev-overlay "1 Issue").
  const [prevPrefill, setPrevPrefill] = useState(prefillText);
  useEffect(() => {
    if (prefillText && prefillText.length > 0 && prefillText !== prevPrefill) {
      setPrevPrefill(prefillText);
      setMessage(prefillText);
      onPrefillConsumed?.();
    }
  }, [prefillText, prevPrefill, onPrefillConsumed]);

  /**
   * AUDIT-FIX MEDIA-VIDEO-01: every attachment entry point on this surface
   * funnels through here (the + menu's file input, drag-and-drop, paste,
   * screenshot capture and the camera dialog), so this is the one place that
   * can refuse a file the media send paths would only throw away. Refusing out
   * loud is the point — the previous behaviour accepted the file, showed it in
   * the preview strip, and then destroyed it on send.
   */
  const addChatAttachments = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      if (imageMode || videoMode) {
        const noun = imageMode ? 'Image' : 'Video';
        setLocalNotice(
          `${noun} generation works from your prompt only — attached files are not sent to the ${noun.toLowerCase()} model. Leave ${noun.toLowerCase()} mode first if you want to send ${files.length === 1 ? 'this file' : 'these files'} to the chat model.`,
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

  /**
   * AUDIT-FIX CMP-15: paste-to-attach. The web composer had no `onPaste`
   * handler anywhere in its directory, so pasting a screenshot was silently
   * ignored while drag-and-drop worked — the single most common way people
   * attach a screenshot. Mirrors the shape already proven in
   * packages/ui/unified-chat/src/components/ChatInput.tsx.
   */
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [browserControlOpen, setBrowserControlOpen] = useState(false);

  /**
   * AUDIT-FIX CMP-10: capture the screen and attach the frame.
   *
   * Same contract as the shared `AttachmentMenu`'s `onScreenshot(file)` path
   * (packages/ui/unified-chat) — the web composer was the drifted copy that
   * rendered the row with no handler at all. Render-gated by
   * `canTakeScreenshot`, so this never runs on a surface without screen
   * capture; a cancelled picker resolves by rejection and leaves no notice.
   */
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
      // User cancelled the picker or denied permission — not an error state.
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setIsCapturingScreenshot(false);
    }
  }, [addChatAttachments]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (disabled || trialExhausted) return;
      // COMPOSER-002/UI-81: the paste decision itself is shared, so the same
      // clipboard produces the same attachment on web, the unified composer and
      // the extension. `text` leaves the event alone so ordinary text still
      // inserts as text.
      const decision = decideComposerPaste(e.clipboardData, {
        existingFileNames: attachments.map((file) => file.name),
      });
      if (decision.kind === 'text') return;
      e.preventDefault();
      addChatAttachments(decision.kind === 'files' ? decision.files : [decision.file]);
      // A long paste turning into a file is a reasonable default and a
      // surprising one: the composer emptied and a chip appeared, with Remove
      // as the only affordance and nothing saying what had happened. Say it,
      // and keep the text so the choice is reversible.
      if (decision.kind === 'attachment') {
        setPastedTextUndo({
          fileName: decision.file.name,
          text: e.clipboardData.getData('text/plain'),
        });
      }
    },
    [addChatAttachments, attachments, disabled, trialExhausted],
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
    if (message.length === 0) {
      textarea.style.height = '52px';
      return;
    }
    textarea.style.height = 'auto';
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 52), 240);
    textarea.style.height = `${newHeight}px`;
  }, [message]);

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

  const closeMenu = useCallback(() => {
    setShowOverflowMenu(false);
  }, []);

  // ---------------------------------------------------------------------------
  // "Project or folder" picker — derived state and handlers
  // ---------------------------------------------------------------------------
  const activePickerProject = projectPicker
    ? (projectPicker.projects.find((p) => p.id === projectPicker.activeProjectId) ?? null)
    : null;
  // The folder half of the chip label only exists on working-directory surfaces;
  // on web the cowork folder store is never populated through this control.
  const pickerFolderName = canUseAgiWork && canUseWorkingDirectory ? folderName : null;
  const pickerHasSelection = Boolean(activePickerProject || pickerFolderName);
  const pickerPlaceholder = canUseAgiWork ? 'Project or folder' : 'Project';
  const pickerLabel = activePickerProject?.name ?? pickerFolderName ?? pickerPlaceholder;
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

  // Switching back to Chat clears the scope selection: what the chip shows is
  // exactly what the next send carries — no hidden project sticking to a
  // "Chat"-labeled composer.
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

  // Handle input change: detect @mention and /command.
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setMessage(value);

    // Slash command detection: only when message starts with /
    if (value.startsWith('/') && !value.includes(' ')) {
      setShowSlashMenu(true);
      setSlashQuery(value.slice(1));
      setShowMentions(false);
      return;
    }
    setShowSlashMenu(false);

    const mention = matchMentionQuery(value, cursorPos);
    if (mention) {
      setShowMentions(true);
      setMentionQuery(mention.query);
      setMentionStartIndex(mention.startIndex);
      setMentionIndex(0);
      return;
    }
    setShowMentions(false);
  }, []);

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

  // Projects only join the mention menu on the surface state where the scope
  // chip is rendered — elsewhere `onSelectProject` is cleared again on send, so
  // an @project row would be a control the viewer sees do nothing.
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
   * AUDIT-FIX CMP-8/CMP-9: resolve a slash command against what the selected
   * model and plan can ACTUALLY do, and say so when they can't.
   *
   * The previous implementation unconditionally called `setMessage('')` and
   * then switched on only `search|think|image|code` with no `default` branch —
   * so a custom command defined in settings did nothing except wipe whatever
   * the user had typed, and its `template` field was never read by any composer
   * code. `/think` and `/code` also set flags that the capability effects above
   * immediately cleared for unsupported models, so the command silently did
   * nothing at all.
   */
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
          // browser/terminal/database are capability-gated to desktop and never
          // reach the web menu (filterSlashCommandsByCapability). Anything else
          // that lands here is unknown — say so instead of wiping the input.
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
      setMessage(commitSlashCommand(outcome));
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [resolveSlashCommand, commitSlashCommand],
  );

  const handleSkillSelect = useCallback(
    (skillName: string) => {
      const skill = availableSkills.find((candidate) => candidate.name === skillName);
      if (!skill) return;
      setSelectedSkillName(skill.name);
      // AUDIT-FIX CMP-8: keep whatever the user already typed after the
      // command token instead of wiping the input (see handleSlashSelect).
      setMessage((prev) => stripSlashCommandToken(prev));
      setShowSlashMenu(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [availableSkills, setSelectedSkillName],
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

  /**
   * AUDIT-FIX CMP-9: a fully typed command (`/search latest AI news`) that the
   * send path should honour. Only an EXACT match against a universal built-in
   * or a user-defined command counts — a message that merely begins with a
   * slash is ordinary text and is sent verbatim.
   *
   * The built-in ids come from the canonical registry; commands carrying a
   * `requiredCapability` are desktop-local and never reachable here.
   */
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
        setMessage(outgoingContent);
        return;
      }
    }

    // Warn — do not block — when the outgoing text looks like it contains a
    // credential.
    //
    // The scanner existed (`lib/security/secret-patterns`) but was only wired
    // into the support-handoff transcript path, so a user pasting an API key
    // straight into chat got no signal at all before it left the device.
    //
    // Deliberately non-blocking and one-shot: the check is a synchronous regex
    // pass, false positives are possible, and refusing to send someone's own
    // message is a worse failure than warning about it. The second send goes
    // through.
    if (!secretWarningAcknowledgedRef.current && containsSecrets(outgoingContent)) {
      secretWarningAcknowledgedRef.current = true;
      setLocalNotice(
        'This message looks like it contains an API key or credential. Send again to continue, or edit it first.',
      );
      return;
    }

    // Image generation mode: delegate entirely to parent via onGenerateImage.
    // Image generation is not part of the streaming chat turn, so it is not
    // queued — it simply waits until the current turn is idle.
    if (sendImageMode) {
      if (isTurnActive) return;
      // AUDIT-FIX MEDIA-VIDEO-01: never let this branch run with files staged —
      // it builds its request from prompt + generation options only, so
      // `clearComposerState()` below would destroy them. `sendImageMode` can
      // also be turned on by a typed `/image` command at this exact point,
      // which is why the guard lives here and not only on the render banner.
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

    // Follow-up while the current turn is still streaming: queue this message and
    // flush it when the turn finishes (see the active-turn transition effect below).
    // Only the latest queued message is kept. This is the honest counterpart to the
    // server's per-conversation concurrency guard — the client never fires a second
    // concurrent turn; it waits for the first to settle.
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

    const result = onSend(...sendArgs);

    if (result === false) return;
    clearComposerState();
  }, [
    message,
    attachments,
    selectedSkillName,
    selectedMcpContext,
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
    activeToolLabels,
  ]);

  /**
   * AUDIT-FIX STR-23: the composer input is per-conversation. Park the outgoing
   * conversation's half-typed text under its own id and restore the incoming
   * one's, so a private draft can never follow the user into another chat.
   * Runs only on an actual conversation change (the ref guard), so it never
   * fights normal typing.
   */
  const draftConversationRef = useRef<string | null>(conversationId);
  useEffect(() => {
    if (draftConversationRef.current === conversationId) return;
    const previousConversationId = draftConversationRef.current;
    draftConversationRef.current = conversationId;
    const outgoing = messageRef.current;
    if (outgoing.trim()) {
      setDraftContent(outgoing, previousConversationId);
    } else {
      clearDraftContent(previousConversationId);
    }
    setMessage(useChatStore.getState().getDraftContent(conversationId));
  }, [conversationId, setDraftContent, clearDraftContent]);

  // Flush a queued follow-up when the active turn finishes (true→false).
  //
  // Declared AFTER the draft-parking effect above on purpose: navigating away
  // mid-turn fires both in the same commit, and the discard branch below must
  // run against the draft the parking effect has already written, not before it.
  useEffect(() => {
    if (wasLoadingRef.current && !isTurnActive) {
      const queue = queuedFollowUpsRef.current;
      // Exactly one message is released per finished turn — the rest stay
      // queued for the next edge — so the client still never fires two
      // concurrent turns at one conversation.
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
              'Your queued message was not sent — you switched chats before the reply finished.',
              savedAsDraft
                ? 'It was saved as a draft in the original chat.'
                : 'Nothing was sent anywhere.',
              queuedAttachments && queuedAttachments.length > 0
                ? 'Its attachments were not kept — re-attach them to send it.'
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

  /**
   * Pull a queued message back into the composer to change it. The slot is kept
   * (`editingQueuedIdRef`) so re-sending replaces it in place rather than
   * shuffling it to the back of the queue, and the attachments come back with
   * the text — dropping them would be the same silent data loss this row fixes.
   */
  const editQueuedMessage = useCallback(
    (id: string) => {
      const target = queuedFollowUpsRef.current.find((item) => item.id === id);
      if (!target) return;
      editingQueuedIdRef.current = id;
      setMessage(target.args[0]);
      const attachmentsToRestore = target.args[1];
      if (attachmentsToRestore && attachmentsToRestore.length > 0) {
        addChatAttachments([...attachmentsToRestore]);
      }
      textareaRef.current?.focus();
    },
    [addChatAttachments],
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

  /**
   * Derive the SendButton mode. While a turn streams the button always offers
   * 'stop' (Stop stays reachable); a follow-up composed during streaming is
   * queued via Enter and shown as a pending chip, then auto-sent on completion
   * (see handleSubmit + the flush effect above) — so the button never needs a
   * separate 'queue' state, which would have hidden Stop.
   */
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
  if (isIncognito) {
    overflowActiveOptions.push({ label: 'Temporary chat', Icon: EyeOff });
  }
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
              setMessage((current) => current + pastedTextUndo.text);
              setPastedTextUndo(null);
              textareaRef.current?.focus();
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
                {index === 0
                  ? 'Queued · sends when the current response finishes: '
                  : `Queued ${index + 1} of ${queuedFollowUps.length}: `}
                {queued.preview}
                {/* AUDIT-FIX CMP-16: say which toggles the queued turn will carry —
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

      {/* Working Folder Chip — desktop-only capability; absent on web/mobile.
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

      {/* Main Input Container */}
      <div
        id="chat-composer"
        className={cn(
          'relative border bg-[var(--chat-input-bg)] shadow-sm backdrop-blur-sm transition-all duration-200',
          emptyState ? 'rounded-[26px]' : 'rounded-2xl',
          isFocused
            ? 'border-[var(--chat-accent-primary)]/40 shadow-md ring-2 ring-[var(--chat-accent-primary)]/30'
            : 'border-[var(--chat-glass-border)]',
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
          anchorRef={textareaRef}
          open={showMentions}
          label="Mention suggestions"
          onRequestClose={() => setShowMentions(false)}
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
            // Column layout: the textarea sits full-width on row 1, and the control
            // cluster below is a SINGLE flex-nowrap row so the Send button can never
            // drop to a second line. A previous flex-wrap+order layout wrapped inside
            // a conversation once the sidebar narrowed the column: flex-wrap breaks
            // lines on each item's CONTENT size, so min-w-0 alone can't stop it — only
            // flex-nowrap forces one line, while the min-w-0 chain lets the model
            // pill/hint shrink to fit within it.
            'flex flex-col gap-2 p-2 sm:p-3',
            emptyState && 'px-4 py-3 sm:px-5',
          )}
        >
          {/* Textarea wrapper — row 1, full width */}
          <div className={cn('relative w-full', emptyState ? 'min-h-[40px]' : 'min-h-[52px]')}>
            <textarea
              ref={textareaRef}
              data-composer-textarea
              /* Paragraph direction follows the first strong character, so an
                 Arabic or Hebrew draft aligns and edits right-to-left instead
                 of being laid out as an LTR paragraph. */
              dir="auto"
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={
                isTurnActive && !imageMode && !videoMode
                  ? 'Reply — sends when the current response finishes'
                  : imageMode
                    ? 'Describe or edit an image'
                    : videoMode
                      ? 'Describe the video you want'
                      : // AUDIT-FIX shell-nav-ia-gap-03: the work-mode axis now
                        // reaches the input itself. Gated on `canUseAgiWork` for
                        // the same reason the send does (`workMode: canUseAgiWork
                        // ? workMode : 'chat'`) — a stale toggle on a downgraded
                        // plan must not promise a mode the send will not use.
                        ((canUseAgiWork ? WORK_MODE_PLACEHOLDERS[workMode] : null) ?? placeholder)
              }
              // Type-ahead: the textarea stays enabled while a turn streams so the
              // user can compose a follow-up (queued + auto-sent on completion).
              // Image mode has no streaming turn to type ahead of, so it stays gated.
              disabled={composerDisabled || ((imageMode || videoMode) && isTurnActive)}
              className={cn(
                'relative z-10 max-h-[240px] w-full resize-none overflow-y-auto border-0 bg-transparent px-2 leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
                emptyState
                  ? 'min-h-[40px] py-1.5 text-[18px] md:text-[18px]'
                  : 'min-h-[52px] py-3 text-sm md:text-[15px]',
              )}
              rows={1}
              maxLength={COMPOSER_MAX_CHARS}
              aria-label="Message input"
              aria-describedby={showCharCounter ? 'composer-char-counter' : undefined}
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
                {messageLength.toLocaleString()} / {COMPOSER_MAX_CHARS.toLocaleString()} characters
                {charCounterExceeded ? ' · limit reached' : ''}
              </p>
            )}
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

          {/* Control cluster — row 2, a single non-wrapping line (flex-nowrap). */}
          <div className="flex min-w-0 flex-nowrap items-center gap-1 sm:gap-2">
            {/* + Overflow Menu Button */}
            <div className={cn('relative shrink-0')} ref={overflowRef}>
              <button
                ref={overflowTriggerRef}
                onClick={() => {
                  const next = !showOverflowMenu;
                  setShowOverflowMenu(next);
                }}
                // AUDIT-FIX CMP-16: the textarea deliberately stays enabled
                // while a turn streams so a follow-up can be typed ahead and
                // queued — but the "+" menu was disabled, so that queued
                // message could not have its tools set. Only the composer-level
                // disabled states gate it now; the individual rows inside the
                // menu keep their own capability gates.
                disabled={composerDisabled}
                className={cn(
                  'relative flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                  hasOverflowActive
                    ? 'bg-[var(--chat-accent-primary)]/15 text-[var(--chat-accent-primary-text)]'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  composerDisabled && 'cursor-not-allowed opacity-50',
                )}
                aria-label={
                  hasOverflowActive
                    ? `More options — ${overflowActiveCount} active`
                    : 'More options'
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
                the clip removed its FIRST row — "Add photos & files" — leaving
                the product with no reachable way to attach a file. */}
              <AnchoredComposerMenu
                anchorRef={overflowTriggerRef}
                open={showOverflowMenu}
                label="More composer options"
                onRequestClose={() => setShowOverflowMenu(false)}
                align="start"
                contentRef={overflowMenuRef}
                className="w-64 p-1.5"
              >
                {
                  <>
                    {/* 0. Work mode (Chat | AGI Work) — shown in the menu ONLY
                        below sm, where the inline segmented toggle is hidden to
                        free composer-row width for the model selector. Keeps
                        work-mode fully switchable on the narrow (mobile)
                        composer instead of dropping the control. */}
                    {projectPicker && !imageMode && canUseAgiWork && (
                      <div className="chat-composer-mode-in-menu sm:hidden">
                        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
                          <span className="flex-1 text-left text-sm">Mode</span>
                          <div className="flex items-center rounded-full border border-[var(--chat-glass-border)] bg-muted/40 p-0.5 text-xs font-medium">
                            {(['chat', 'agiwork'] as const).map((mode) => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => handleWorkModeChange(mode)}
                                disabled={isTurnActive || composerDisabled}
                                aria-pressed={workMode === mode}
                                aria-describedby={
                                  mode === 'agiwork' ? AGI_WORK_MATURITY_MENU_ID : undefined
                                }
                                title={WORK_MODE_TITLES[mode]}
                                className={cn(
                                  'flex h-7 items-center rounded-full px-3 transition-colors',
                                  workMode === mode
                                    ? 'bg-background text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground',
                                  (isTurnActive || composerDisabled) &&
                                    'cursor-not-allowed opacity-50',
                                )}
                              >
                                {mode === 'chat' ? (
                                  'Chat'
                                ) : (
                                  <>
                                    AGI Work
                                    <AgiWorkMaturityBadge />
                                  </>
                                )}
                              </button>
                            ))}
                            <AgiWorkMaturityDescription id={AGI_WORK_MATURITY_MENU_ID} />
                          </div>
                        </div>
                        <div className="my-1 border-t border-border/40" />
                      </div>
                    )}

                    {/* 1. Add photos and files.

                        AUDIT-FIX MEDIA-VIDEO-01: this row was available
                        unconditionally in image/video mode, where the send path
                        cannot carry an attachment and `clearComposerState()`
                        destroyed it. Disabled with the reason on the row rather
                        than hidden, so the affordance does not vanish without
                        explanation the moment a media mode is entered. */}
                    <button
                      type="button"
                      onClick={() => {
                        fileInputRef.current?.click();
                        closeMenu();
                      }}
                      disabled={mediaModeActive}
                      title={
                        mediaModeActive
                          ? `${mediaModeNoun} generation works from your prompt only. Leave ${mediaModeNoun.toLowerCase()} mode to attach files.`
                          : undefined
                      }
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                        mediaModeActive ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted/60',
                      )}
                    >
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 text-left">Add photos &amp; files</span>
                      {mediaModeActive && (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Not used here
                        </span>
                      )}
                    </button>

                    {hostCanGenerateImage && (
                      <>
                        {/* 2. Create image.

                        AUDIT-FIX CMP-11: this row had NO tier check in the
                        composer while /api/media/image/generate rejects
                        non-Pro with 403 — the user composed a whole prompt and
                        failed after a round trip, with `onUpgradeRequest`
                        available and never called. Deep Research one row below
                        was already gated correctly; this now matches it. */}
                        <button
                          type="button"
                          onClick={() => {
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
                                  ? (mediaAvailabilityError ??
                                      'Could not check image model availability.')
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
                            setTimeout(() => textareaRef.current?.focus(), 0);
                          }}
                          title={
                            !billingPolicyReady
                              ? billingPolicyError
                                ? 'Your plan could not be verified. Click to retry.'
                                : 'Checking your plan.'
                              : mediaAvailabilityStatus === 'loading'
                                ? 'Checking configured image providers.'
                                : mediaAvailabilityStatus === 'error'
                                  ? 'Image provider availability could not be checked. Click to retry.'
                                  : availableImageModels.length === 0
                                    ? 'This deployment is not ready for image generation.'
                                    : !canUseImageGeneration
                                      ? 'Image generation is available on Pro and above.'
                                      : undefined
                          }
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60',
                            imageMode && 'text-primary',
                          )}
                        >
                          <ImagePlus
                            className={cn(
                              'h-4 w-4',
                              imageMode ? 'text-primary' : 'text-muted-foreground',
                            )}
                          />
                          <span className="flex-1 text-left">Create image</span>
                          {!billingPolicyReady ? (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {billingPolicyError ? 'Retry' : 'Checking'}
                            </span>
                          ) : mediaAvailabilityStatus !== 'ready' ||
                            availableImageModels.length === 0 ? (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {mediaAvailabilityStatus === 'loading' ? 'Checking' : 'Unavailable'}
                            </span>
                          ) : !canUseImageGeneration ? (
                            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-primary">
                              Upgrade
                            </span>
                          ) : null}
                        </button>
                      </>
                    )}

                    {hostCanGenerateVideo && (
                      <>
                        {/* 2b. Create video.

                        /api/media/video/generate has been implemented and
                        entitled (billing-catalog: max_15x + enterprise) all
                        along, and MessageBubble already renders the in-flight
                        shimmer and the finished player — but nothing in the
                        product ever started one, so every state below the
                        composer was unreachable. Same component, same gating
                        idiom, same upgrade affordance as "Create image" one row
                        above; only the capability key differs. */}
                        <button
                          type="button"
                          onClick={() => {
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
                                  ? (mediaAvailabilityError ??
                                      'Could not check video model availability.')
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
                            setTimeout(() => textareaRef.current?.focus(), 0);
                          }}
                          title={
                            !billingPolicyReady
                              ? billingPolicyError
                                ? 'Your plan could not be verified. Click to retry.'
                                : 'Checking your plan.'
                              : mediaAvailabilityStatus === 'loading'
                                ? 'Checking configured video providers.'
                                : mediaAvailabilityStatus === 'error'
                                  ? 'Video provider availability could not be checked. Click to retry.'
                                  : availableVideoModels.length === 0
                                    ? 'This deployment is not ready for video generation.'
                                    : !canUseVideoGeneration
                                      ? 'Video generation is available on Max 15x and Enterprise.'
                                      : undefined
                          }
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60',
                            videoMode && 'text-primary',
                          )}
                        >
                          <Video
                            className={cn(
                              'h-4 w-4',
                              videoMode ? 'text-primary' : 'text-muted-foreground',
                            )}
                          />
                          <span className="flex-1 text-left">Create video</span>
                          {!billingPolicyReady ? (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {billingPolicyError ? 'Retry' : 'Checking'}
                            </span>
                          ) : mediaAvailabilityStatus !== 'ready' ||
                            availableVideoModels.length === 0 ? (
                            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {mediaAvailabilityStatus === 'loading' ? 'Checking' : 'Unavailable'}
                            </span>
                          ) : !canUseVideoGeneration ? (
                            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-primary">
                              Upgrade
                            </span>
                          ) : null}
                        </button>
                      </>
                    )}

                    {/* 3. Take a screenshot — desktop-only capability. Render-gated
                        so it is ABSENT (not merely disabled) on web/mobile.

                        AUDIT-FIX CMP-10: this rendered an icon and a label with
                        NO onClick — it did nothing and did not even close the
                        menu. The shared AttachmentMenu already implements the
                        real behaviour (capture → attach as a File); this is now
                        the same contract, driven by the same capability flag. */}
                    {canTakeScreenshotCap && (
                      <button
                        type="button"
                        disabled={isCapturingScreenshot}
                        onClick={() => {
                          void handleTakeScreenshot();
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60',
                          isCapturingScreenshot && 'cursor-not-allowed opacity-50',
                        )}
                      >
                        <Camera className="h-4 w-4" />
                        <span className="flex-1 text-left">
                          {isCapturingScreenshot ? 'Capturing…' : 'Take a screenshot'}
                        </span>
                      </button>
                    )}

                    {/* Take a photo — webcam capture, gated on the shared
                        `canUseCamera` flag so the matrix stays load-bearing
                        rather than decorative. The dialog owns the permission
                        prompt and the preview; nothing is captured until the
                        shutter is pressed. */}
                    {canUseCameraCap && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowOverflowMenu(false);
                          setCameraOpen(true);
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                      >
                        <Camera className="h-4 w-4" />
                        <span className="flex-1 text-left">Take a photo</span>
                      </button>
                    )}

                    {/* 4. Select working folder — desktop-only capability (local
                        File System Access). Render-gated: ABSENT on web/mobile.
                        The browser-API `canPickFolder` check is NOT the platform
                        gate; it only disables when the desktop browser lacks the
                        API. When the unified "Project or folder" picker is
                        present, folder selection lives there ("Choose a
                        different folder") — this legacy row only renders on
                        surfaces without the picker so the control never
                        appears twice. */}
                    {!projectPicker && canUseWorkingDirectory && (
                      <button
                        type="button"
                        disabled={!canPickFolder}
                        title={
                          canPickFolder
                            ? folderName
                              ? `Working folder: ${folderName}`
                              : undefined
                            : 'Folder access is not supported in this browser'
                        }
                        onClick={() => {
                          pickFolder();
                          closeMenu();
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                          !canPickFolder && 'cursor-not-allowed opacity-50',
                          canPickFolder && folderName
                            ? 'text-amber-300 hover:bg-muted/60'
                            : 'hover:bg-muted/60',
                        )}
                      >
                        {folderName ? (
                          <FolderOpen className="h-4 w-4 shrink-0 text-amber-400" />
                        ) : (
                          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="flex-1 text-left">
                          {folderName ? folderName : 'Add working folder'}
                        </span>
                        {folderName && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearFolder();
                            }}
                            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                            aria-label="Clear working folder"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                        {!canPickFolder && (
                          <span className="text-[12px] text-muted-foreground">Not supported</span>
                        )}
                      </button>
                    )}

                    {/* Divider */}
                    <div className="my-1 border-t border-border/30" />

                    {/* 5. Skills -- entry point that opens the settings modal at
                        the Skills pane (founder directive 2026-07-10: the plus-menu
                        holds ENTRIES, not inline lists — the lists live in the
                        settings modal). Per-message skill selection stays available
                        via the @mention dropdown in the textarea. */}
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        openSettings('skills');
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60',
                        selectedSkillName && 'text-primary',
                      )}
                    >
                      <Sparkles
                        className={cn(
                          'h-4 w-4',
                          selectedSkillName ? 'text-primary' : 'text-muted-foreground',
                        )}
                      />
                      <span className="flex-1 text-left">{selectedSkillName ?? 'Skills'}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>

                    {/* 6. Connectors -- entry point that opens the settings modal
                        at the Connectors pane. An inline connect toggle here would
                        imply a mid-chat capability that does not exist (per-
                        conversation connector enablement has no runtime backing),
                        so the honest surface is the settings pane — no fake
                        toggles, no inline list. */}
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        openSettings('connectors');
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                    >
                      {/* Simple connector icon */}
                      <svg
                        className="h-4 w-4 text-muted-foreground"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        aria-hidden="true"
                      >
                        <circle cx="3.5" cy="8" r="2" />
                        <circle cx="12.5" cy="8" r="2" />
                        <path d="M5.5 8h5" />
                      </svg>
                      <span className="flex-1 text-left">Connectors</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>

                    {/* 7. Plugins -- entry point that opens the settings modal at
                        the Plugins pane. */}
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        openSettings('plugins');
                      }}
                      // Was the ONLY row in this menu carrying
                      // `text-muted-foreground`, so a fully-wired entry
                      // rendered greyed-out beside Skills and Connectors and
                      // read as disabled. Matches its siblings now.
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                    >
                      <svg
                        className="h-4 w-4"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        aria-hidden="true"
                      >
                        <rect x="2" y="2" width="5" height="5" rx="1" />
                        <rect x="9" y="2" width="5" height="5" rx="1" />
                        <rect x="2" y="9" width="5" height="5" rx="1" />
                        <path d="M11.5 9v6M9 11.5h6" />
                      </svg>
                      <span className="flex-1 text-left">Plugins</span>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>

                    {/* Divider */}
                    <div className="my-1 border-t border-border/30" />

                    {/* 8. Deep Research toggle */}
                    <MenuToggleRow
                      icon={Telescope}
                      label="Deep Research"
                      checked={researchEnabled}
                      onToggle={() => {
                        handleResearchToggle();
                        closeMenu();
                      }}
                      disabled={disabled || isFreeTrial || !modelSupportsResearch}
                      title={
                        isFreeTrial
                          ? 'Upgrade to use Deep Research'
                          : !modelSupportsResearch
                            ? "Deep Research isn't available for this model. Choose Auto or a model that supports Deep Research."
                            : undefined
                      }
                    />

                    {/* 8a. Code execution toggle */}
                    <MenuToggleRow
                      icon={Terminal}
                      label="Run code"
                      checked={codeExecutionEnabled}
                      onToggle={() => {
                        handleCodeExecutionToggle();
                        closeMenu();
                      }}
                      disabled={disabled || !modelSupportsCodeExecution}
                      title={
                        !modelSupportsCodeExecution
                          ? "Run code isn't available for this model on this deployment. Choose Auto or a model that can run code."
                          : undefined
                      }
                    />

                    {/* 8a-ii. Computer use — an explainer, never a toggle. */}
                    <button
                      type="button"
                      data-testid={BROWSER_CONTROL_TEST_IDS.menuRow}
                      title={COMPUTER_USE_ON_WEB.tooltip}
                      onClick={() => {
                        setBrowserControlOpen(true);
                        closeMenu();
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                    >
                      <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 text-left">{COMPUTER_USE_ON_WEB.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {BROWSER_CONTROL_MENU.badge}
                      </span>
                    </button>

                    {/* 8b. Managed Office creation — server-owned DOCX/PPTX bytes,
                        persisted through the same generated-file pipeline as sandbox output. */}
                    <MenuToggleRow
                      icon={FileText}
                      label="Create Office files"
                      checked={officeCreationEnabled}
                      onToggle={() => {
                        handleOfficeCreationToggle();
                        closeMenu();
                      }}
                      disabled={disabled || !modelSupportsOfficeCreation}
                      title={
                        !modelSupportsOfficeCreation
                          ? "Office file creation isn't available for this model."
                          : undefined
                      }
                    />

                    {/* 8c. Incognito / temporary chat toggle. AUDIT-FIX CMP-3:
                        render-gated on the host actually providing a persistence
                        path — an unbacked privacy switch is worse than none. */}
                    {activeConversationId && onSetTemporaryChat && (
                      <MenuToggleRow
                        icon={EyeOff}
                        label={isSavingIncognito ? 'Temporary chat · saving…' : 'Temporary chat'}
                        checked={isIncognito}
                        onToggle={() => {
                          void handleIncognitoToggle();
                          closeMenu();
                        }}
                        disabled={!canToggleIncognito}
                      />
                    )}
                  </>
                }
              </AnchoredComposerMenu>
            </div>

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

            {/* Work-mode segmented toggle (Chat | AGI Work) — claude.ai
              Chat/Cowork parity, sitting immediately right of "+".
              Backed: 'agiwork' reveals
              the below-composer "Project or folder" picker and the selection
              threads through send meta → createConversation → server project
              context. Hidden below sm (relocated into the + menu "Mode" row)
              so the nowrap control row never squeezes out Send. */}
            {projectPicker && !imageMode && canUseAgiWork && (
              <div className="chat-composer-mode-inline hidden shrink-0 items-center rounded-full border border-[var(--chat-glass-border)] bg-muted/40 p-0.5 text-xs font-medium sm:flex">
                {(['chat', 'agiwork'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleWorkModeChange(mode)}
                    disabled={isTurnActive || composerDisabled}
                    aria-pressed={workMode === mode}
                    aria-describedby={mode === 'agiwork' ? AGI_WORK_MATURITY_INLINE_ID : undefined}
                    title={WORK_MODE_TITLES[mode]}
                    className={cn(
                      'flex h-7 items-center rounded-full px-3 transition-colors',
                      workMode === mode
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                      (isTurnActive || composerDisabled) && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    {mode === 'chat' ? (
                      'Chat'
                    ) : (
                      <>
                        AGI Work
                        <AgiWorkMaturityBadge />
                      </>
                    )}
                  </button>
                ))}
                <AgiWorkMaturityDescription id={AGI_WORK_MATURITY_INLINE_ID} />
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
                    independent — a resolution can exist in landscape and not in
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
                      {videoQualityOptions.find((o) => o.id === effectiveVideoResolution)?.label ??
                        effectiveVideoResolution}
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

            {/* Model selector. In normal mode the full ComposerFooter sits inline beside
              the send button. In image mode the image-model picker takes its place —
              both use `ml-auto` so they right-align and push the mic + send to the
              right edge of the toolbar. In the flex-nowrap control row the footer is
              the only shrinkable item (min-w-0), so it truncates instead of wrapping.

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
                className="ml-auto min-w-0"
                showModelSelector
                lockModelSelector={false}
                showStyleSelector={!isFreeTrial}
                onUpgradeRequest={onUpgradeRequest}
                onModelChange={onModelChange}
              />
            )}

            {imageMode && (
              <div className="relative ml-auto shrink-0">
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
                        imageModelId === m.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60',
                      )}
                    >
                      <span className="flex-1 text-left">{m.label}</span>
                      {imageModelId === m.id && <Check className="h-3 w-3 shrink-0 text-primary" />}
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
                generation the send button ran — a stale model label. */}
            {videoMode && (
              <div className="relative ml-auto shrink-0">
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
                        videoModelId === m.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60',
                      )}
                    >
                      <span className="flex-1 text-left">{m.label}</span>
                      {videoModelId === m.id && <Check className="h-3 w-3 shrink-0 text-primary" />}
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
                onTranscript={(text) => {
                  setMessage((prev) => {
                    const separator = prev.trim() ? ' ' : '';
                    return prev + separator + text;
                  });
                  setTimeout(() => textareaRef.current?.focus(), 50);
                }}
                disabled={composerDisabled}
              />
            </div>

            {/* Send / Stop Button */}
            <SendButton
              mode={sendButtonMode}
              hasContent={hasContent}
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
          </div>
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

      {/* Project scope row. Paid AGI Work can select a project or local folder;
          Free keeps ordinary project-scoped chat and never exposes the folder/
          Cowork boundary. */}
      {projectPicker && (workMode === 'agiwork' || !canUseAgiWork) && !imageMode && (
        <div className="relative mt-2 flex items-center gap-2" ref={projectPickerRef}>
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
              aria-label={pickerHasSelection ? `${pickerPlaceholder}: ${pickerLabel}` : pickerLabel}
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

            {/* Local folder — working-directory surfaces (desktop) only.
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
      {canUseAgiWork && workMode === 'agiwork' && !imageMode && !videoMode && (
        <div className="mt-2">
          {agiWorkFieldsOpen ? (
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
          ) : (
            <button
              type="button"
              onClick={() => setAgiWorkFieldsOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[12px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <ListChecks className="h-3 w-3" />
              {tAgiWork('agiWork.compose.scopeAdd')}
              {agiWorkConstraints.trim() || agiWorkDeliverable.trim() ? (
                <span
                  aria-hidden
                  className="ml-0.5 h-1.5 w-1.5 rounded-full bg-[var(--chat-accent-primary)]"
                />
              ) : null}
            </button>
          )}
        </div>
      )}

      {/* Compact route disclosure + disclaimer · both sit below the composer
          instead of consuming a full banner above the textarea. The destination
          remains visible before send and expands to the complete payload/tool
          explanation only when requested. */}
      <div className="mt-2 flex min-h-5 flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-[12px] text-muted-foreground">
        {/* Standing web-search indicator. Search is ambient by design (the manual
            toggle was removed), which left nothing on screen saying whether the
            current turn can search — `webSearchEnabled` reached the user only
            through the transient queued-follow-up chip and the collapsed send
            preview. It is derived, not a control, so it is text and not a
            button. */}
        {/* Each entry carries its own leading separator inside one flex item, so
            a wrapped row can never end on a dangling "·" — which is exactly
            what happened at 390px, where the row broke after the route
            disclosure. */}
        {[
          billingPolicyReady ? (
            <span
              key="web-search"
              data-testid="web-search-indicator"
              data-active={webSearchEnabled ? 'true' : 'false'}
              title={
                webSearchEnabled
                  ? 'This model can search the web when the question needs current information.'
                  : 'This model has no web-search path, so this turn answers from its training data.'
              }
            >
              {webSearchEnabled ? 'Web search on' : 'Web search off'}
            </span>
          ) : null,
          sendPreviewPresentation ? (
            <SendPreview
              key="send-preview"
              presentation={sendPreviewPresentation}
              variant="compact"
            />
          ) : null,
          /* Accuracy caveat, in the position ChatGPT and Claude both use. The
             explicit Article 50(1) "you are interacting with an AI system"
             sentence was removed on 2026-08-14 in reliance on the regulation's
             obviousness carve-out, which counsel has NOT reviewed — see
             ARTICLE_50_1_WEB_CARVE_OUT in lib/compliance/ai-act.ts. This
             disclaimer is what deliberately stayed; do not trim it too. */
          <span key="accuracy" data-testid="ai-accuracy-disclaimer">
            {AI_ACCURACY_DISCLAIMER}
          </span>,
          <Link
            key="privacy"
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            data-inline-link="true"
            className="underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Privacy
          </Link>,
          <ComposerFeedbackDialog key="feedback" conversationId={conversationId} />,
        ]
          .filter(Boolean)
          .map((entry, index) => {
            const key = (entry as { key: string }).key;
            // Measured on 2026-08-30: neither chatgpt.com nor claude.ai puts
            // anything below its composer at 390px. This footer ran to three
            // rows and made the composer 136px against ChatGPT's 87px. Privacy
            // is a route reachable from settings and several pages, and
            // Feedback has a second entry point in the transcript, so a phone
            // loses no reach by dropping them here. The accuracy disclaimer
            // stays on every width - see the Article 50(1) note above.
            const deskOnly = key === 'privacy' || key === 'feedback';
            return (
              <span
                key={key}
                className={cn(
                  'items-center gap-x-1 whitespace-nowrap',
                  deskOnly ? 'hidden sm:inline-flex' : 'inline-flex',
                )}
              >
                {index > 0 && <span aria-hidden="true">·</span>}
                {entry}
              </span>
            );
          })}

        {/* Webcam capture. Owns its own permission prompt, live preview, and
            stream teardown; the captured frame joins the same attachment
            pipeline as a screenshot or a dropped image. */}
        <CameraCaptureDialog
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onCapture={(file) => addChatAttachments([file])}
        />

        <BrowserControlRequirementDialog
          open={browserControlOpen}
          onClose={() => setBrowserControlOpen(false)}
          subscriptionTier={subscriptionTier}
          planKnown={billingPolicyReady}
        />
      </div>
    </div>
  );
};

/**
 * ChatComposerNew with memoization optimization.
 *
 * + menu matches Claude's structure:
 *   Add files/photos; Skills / Connectors / Plugins entries that open the
 *   settings modal at their pane (no inline lists); Use style flyout.
 *
 * Removed from + menu: Focus Mode, Agent Mode, Tools group, Browse Directory,
 * automatic Web search, and reasoning effort (owned by the model picker).
 * Work mode returned as the BACKED (Chat | AGI Work) segmented toggle plus the
 * below-composer "Project or folder" picker (projectPicker prop): the host
 * supplies real projects, the selection threads through send meta into
 * createConversation (conversation project_id), and the server injects the
 * project's instructions/knowledge manifest — so neither control is cosmetic.
 */
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
    // AUDIT-FIX CMP-3: the presence of this handler decides whether the
    // "Temporary chat" control renders at all, so it must defeat memoisation.
    prev.onSetTemporaryChat === next.onSetTemporaryChat
  );
});

ChatComposerNew.displayName = 'ChatComposerNew';
