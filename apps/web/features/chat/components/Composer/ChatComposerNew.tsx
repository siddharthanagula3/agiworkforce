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
  FileText,
  Terminal,
  Folder,
  FolderOpen,
  Telescope,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { isBillingPolicyReady } from '@shared/stores/billing-policy';
import { SlashCommandMenu, type SlashCommandMenuHandle } from './SlashCommandMenu';
import { BUILT_IN_SLASH_COMMANDS } from '@features/chat/commands/slash-command-registry';
import { useSettingsModal } from '@features/settings/components/SettingsModalProvider';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { SendButton } from './SendButton';
import { ComposerFooter } from './ComposerFooter';
import { DragDropOverlay } from './DragDropOverlay';
import { VoiceInputButton } from './VoiceInputButton';
import { AttachmentPreview } from './AttachmentPreview';
import { getAcceptAttribute, useAttachments } from '@features/chat/hooks/use-attachments';
import { isChatImageMimeType } from '@/lib/chat-attachment-policy';
import { useSkillsList, type SkillItem } from '@features/chat/hooks/use-skills-list';
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
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  canUseBillingPlanCapability,
  getModels,
  type CloudWorkMode,
  type SendPreviewPresentation,
} from '@agiworkforce/types';
import { isWebSearchAvailable, providerSupportsWebSearch } from '@/lib/web-search-support';
import { SendPreview, useCapability } from '@agiworkforce/unified-chat';
import { useCoworkFolderStore, supportsDirectoryPicker } from '@shared/stores/cowork-folder-store';
import { FREE_TRIAL_MODELS } from '@/lib/free-trial-config';
import { MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH } from '@agiworkforce/cloud-contracts';
import { ComposerFeedbackDialog } from './ComposerFeedbackDialog';

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

const WORK_MODE_TITLES: Record<ComposerWorkMode, string> = {
  chat: 'Chat — quick questions and conversation',
  agiwork: 'AGI Work — multi-step tasks with tools, files, and reviewable deliverables',
};

interface ChatComposerProps {
  onSend: (
    content: string,
    attachments?: File[],
    skillId?: string,
    meta?: {
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
      /**
       * Resolved Response-Style instruction: the ONE style value this composer
       * emits (AUDIT-FIX CMP-6/CMP-7). It composes the selected style with the
       * new length axis and is never empty.
       *
       * The separate `styleMode` hint this meta used to carry is gone: the send
       * path (`useChatStream`) always preferred `styleInstruction` and dropped
       * `styleMode` on the floor, so emitting it only created a second, silently
       * ignored vocabulary. `styleMode` survives in `SendReplayMetadata` purely
       * to replay messages recorded before this change.
       */
      styleInstruction?: string;
      /** Exact server-catalog skill name; the server resolves and loads its body. */
      skillName?: string;
    },
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
   * presentation. PLAN.md section 5: "Add per-file privacy labels".
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
  /**
   * Called when the user submits in image-generation mode.
   * The composer clears its state regardless; the parent owns the async flow and
   * message injection.
   */
  onGenerateImage?: (
    prompt: string,
    options: { aspectRatio: ImageAspectRatio; modelId: string },
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

// ---------------------------------------------------------------------------
// Image mode types and constants
// ---------------------------------------------------------------------------

export type ImageAspectRatio = 'auto' | '1:1' | '3:4' | '9:16' | '4:3' | '16:9';

export interface ImageAspectOption {
  id: ImageAspectRatio;
  label: string;
  /** Maps to the /api/media/image/generate `size` enum. */
  size: '1024x1024' | '1024x1792' | '1792x1024';
}

export const IMAGE_ASPECT_OPTIONS: ImageAspectOption[] = [
  { id: 'auto', label: 'Auto', size: '1024x1024' },
  { id: '1:1', label: 'Square 1:1', size: '1024x1024' },
  { id: '3:4', label: 'Portrait 3:4', size: '1024x1792' },
  { id: '9:16', label: 'Story 9:16', size: '1024x1792' },
  { id: '4:3', label: 'Landscape 4:3', size: '1792x1024' },
  { id: '16:9', label: 'Widescreen 16:9', size: '1792x1024' },
];

export interface ImageModelOption {
  id: string;
  label: string;
  provider: 'google' | 'openai' | 'stability';
}

// Map the catalog's declarative `imageApi` backend → the provider enum the
// /api/media/image/generate route accepts. This is the ONLY place the two
// vocabularies meet; everything else is data. An image model with no imageApi
// route adapter is excluded from the picker.
const IMAGE_API_TO_PROVIDER: Record<string, ImageModelOption['provider']> = {
  gemini: 'google',
  imagen: 'google',
  openai: 'openai',
  stability: 'stability',
};

// Image-generation models for the in-composer picker, derived entirely from the
// canonical models.json catalog (single source of truth) — never hardcoded.
// Adding a new image model is a model-registry curation edit (set modelType:'image'
// + imageApi); it then shows up here and routes correctly with ZERO code change.
export const IMAGE_MODELS: ImageModelOption[] = getModels({ modelTypes: ['image'] })
  .map((m) => {
    const provider = m.imageApi ? IMAGE_API_TO_PROVIDER[m.imageApi] : undefined;
    return provider ? { id: m.id, label: m.name, provider } : null;
  })
  .filter((m): m is ImageModelOption => m !== null);

// Default = the first image model in catalog order (the founder controls the
// default purely by ordering the curation file — no id referenced in code).
const IMAGE_MODEL_DEFAULT = IMAGE_MODELS[0]?.id ?? '';

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
  freeTrial,
  onGenerateImage,
  projectPicker,
  onSetTemporaryChat,
}: ChatComposerProps) => {
  const isTurnActive = isLoading || isGenerating;
  const [message, setMessage] = useState('');
  const [localNotice, setLocalNotice] = useState<string | null>(null);
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
  const pendingQueueRef = useRef<{
    conversationId: string | null;
    args: Parameters<typeof onSend>;
  } | null>(null);
  const wasLoadingRef = useRef(false);
  const [queuedPreview, setQueuedPreview] = useState<string | null>(null);
  /** Human-readable list of tools the queued follow-up will carry (CMP-16). */
  const [queuedToolsLabel, setQueuedToolsLabel] = useState<string | null>(null);
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
  const [isFocused, setIsFocused] = useState(false);
  const { skills: availableSkills, loading: skillsLoading, error: skillsError } = useSkillsList();
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  // Cowork folder — local-only; handle is never forwarded to any API route.
  const folderName = useCoworkFolderStore((s) => s.folderName);
  const pickFolder = useCoworkFolderStore((s) => s.pickFolder);
  const clearFolder = useCoworkFolderStore((s) => s.clearFolder);
  const canPickFolder = supportsDirectoryPicker();
  const router = useRouter();
  const isFreeTrial = freeTrial?.enabled ?? false;

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
  const canUseAgiWork =
    billingPolicyReady && !isFreeTrial && canUseBillingPlanCapability(subscriptionTier, 'agi_work');
  const canUseImageGeneration =
    billingPolicyReady &&
    !isFreeTrial &&
    canUseBillingPlanCapability(subscriptionTier, 'image_generation');

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
    selectedSkillName,
  } = composerToggles;
  const setWorkMode = useCallback(
    (mode: ComposerWorkMode) => setComposerToggles({ workMode: mode }),
    [setComposerToggles],
  );
  const setImageMode = useCallback(
    (enabled: boolean) => setComposerToggles({ imageMode: enabled }),
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

  // Image generation mode state (imageMode itself is per-conversation, above)
  const [imageAspectRatio, setImageAspectRatio] = useState<ImageAspectRatio>('auto');
  const [imageModelId, setImageModelId] = useState<string>(IMAGE_MODEL_DEFAULT);
  const [showImageAspectMenu, setShowImageAspectMenu] = useState(false);
  const [showImageModelMenu, setShowImageModelMenu] = useState(false);
  const [showCompatibleModels, setShowCompatibleModels] = useState(false);

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
  // plain web search. Current Claude Haiku 4.5, for example, has
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
  // open-weight model (kimi-k3/deepseek/qwen/glm, codeExecution:false) gets an honest
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
  const projectPickerRef = useRef<HTMLDivElement>(null);
  const mentionsRef = useRef<HTMLDivElement>(null);
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
    // remount that used to wipe them no longer touches them. The per-send
    // resets below are the ones that genuinely belong to a single send: the
    // skill selection and image mode are one-shot composer modes.
    setComposerToggles({ selectedSkillName: null, imageMode: false });
    setLocalNotice(null);
    setImageAspectRatio('auto');
    setImageModelId(IMAGE_MODEL_DEFAULT);
    setShowCompatibleModels(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
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

  const addChatAttachments = useCallback(
    (files: File[]) => {
      setLocalNotice(null);
      addFiles(files);
    },
    [addFiles],
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
      const items = e.clipboardData?.items;
      if (!items) return;
      const pasted: File[] = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (!item || item.kind !== 'file') continue;
        const file = item.getAsFile();
        if (file) pasted.push(file);
      }
      if (pasted.length === 0) return;
      // Only swallow the event once a real file paste was captured, so pasting
      // text still inserts text.
      e.preventDefault();
      addChatAttachments(pasted);
    },
    [addChatAttachments, disabled, trialExhausted],
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
    textarea.style.height = 'auto';
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 52), 240);
    textarea.style.height = `${newHeight}px`;
  }, [message]);

  // Close popover on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
      }
      if (mentionsRef.current && !mentionsRef.current.contains(e.target as Node)) {
        setShowMentions(false);
      }
      if (projectPickerRef.current && !projectPickerRef.current.contains(e.target as Node)) {
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
  const pickerLabel = activePickerProject?.name ?? pickerFolderName ?? 'Project or folder';
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

    // @mention detection
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        setShowMentions(true);
        setMentionQuery(textAfterAt);
        setMentionStartIndex(lastAtIndex);
        return;
      }
    }
    setShowMentions(false);
  }, []);

  const filteredSkills = availableSkills
    .filter(
      (skill) =>
        skill.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        skill.description.toLowerCase().includes(mentionQuery.toLowerCase()),
    )
    .slice(0, 12);

  const handleMentionSelect = useCallback(
    (skill: SkillItem) => {
      if (mentionStartIndex === -1) return;
      const before = message.substring(0, mentionStartIndex);
      const cursorPos = textareaRef.current?.selectionStart || message.length;
      const after = message.substring(cursorPos);
      const newMessage = `${before}@${skill.name} ${after}`;
      setMessage(newMessage);
      setSelectedSkillName(skill.name);
      setShowMentions(false);
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [message, mentionStartIndex, setSelectedSkillName],
  );

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

    // Image generation mode: delegate entirely to parent via onGenerateImage.
    // Image generation is not part of the streaming chat turn, so it is not
    // queued — it simply waits until the current turn is idle.
    if (sendImageMode) {
      if (isTurnActive) return;
      const prompt = outgoingContent.trim();
      if (!prompt) return;
      onGenerateImage?.(prompt, { aspectRatio: imageAspectRatio, modelId: imageModelId });
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
      pendingQueueRef.current = { conversationId, args: sendArgs };
      setQueuedPreview(outgoingContent.trim() || 'Attachment');
      // AUDIT-FIX CMP-16: publish the queued turn's tools immediately; the sync
      // effect above only fires on a subsequent toggle change.
      setQueuedToolsLabel(activeToolLabels.length > 0 ? activeToolLabels.join(' · ') : null);
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
    isTurnActive,
    disabled,
    hasAttachmentConflict,
    trialExhausted,
    onUpgradeRequest,
    imageMode,
    imageAspectRatio,
    imageModelId,
    onGenerateImage,
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
      const pending = pendingQueueRef.current;
      if (pending) {
        pendingQueueRef.current = null;
        setQueuedPreview(null);
        setQueuedToolsLabel(null);
        if (pending.conversationId === conversationId) {
          onSend(...pending.args);
        } else {
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

  const cancelQueuedMessage = useCallback(() => {
    pendingQueueRef.current = null;
    setQueuedPreview(null);
    setQueuedToolsLabel(null);
  }, []);

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
    const pending = pendingQueueRef.current;
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
    setQueuedToolsLabel(activeToolLabels.length > 0 ? activeToolLabels.join(' · ') : null);
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

      // Plain Enter sends; Shift+Enter inserts a newline (the ChatGPT/Claude chat
      // convention). Cmd/Ctrl+Enter also sends. Never submit while a picker owns
      // Enter (slash/mentions) or mid-IME-composition (e.g. CJK candidates).
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !e.nativeEvent.isComposing &&
        !showMentions &&
        !showSlashMenu
      ) {
        e.preventDefault();
        handleSubmit();
      }

      if (e.key === 'Escape') {
        setShowMentions(false);
        setShowOverflowMenu(false);
        setShowSlashMenu(false);
      }
    },
    [handleSubmit, showMentions, showSlashMenu],
  );

  const hasContent = Boolean(message.trim() || attachments.length > 0);
  const composerDisabled = disabled || trialExhausted;

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
    <div className="chat-composer-container relative w-full pb-4 safe-area-bottom-additive sticky bottom-0 z-20 bg-background/95 backdrop-blur-sm md:static md:bg-transparent md:backdrop-blur-none">
      <DragDropOverlay onDrop={handleFileDrop} />

      {localNotice && (
        <div
          role="alert"
          className="mb-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-400/40 dark:bg-amber-950/40 dark:text-amber-100"
        >
          {localNotice}
        </div>
      )}

      {queuedPreview && (
        <div
          className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 py-2 text-xs text-muted-foreground"
          data-testid="queued-followup"
        >
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            Queued · sends when the current response finishes: {queuedPreview}
            {/* AUDIT-FIX CMP-16: say which toggles the queued turn will carry —
                they are editable while it waits (the "+" menu stays open during
                streaming), so the user can see and change them. */}
            {queuedToolsLabel && (
              <span className="ml-1 text-[var(--chat-text-muted)]">· {queuedToolsLabel}</span>
            )}
          </span>
          <button
            type="button"
            onClick={cancelQueuedMessage}
            className="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Cancel queued message"
          >
            Cancel
          </button>
        </div>
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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-400">
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
          'relative border bg-[var(--chat-bg-elevated)] shadow-sm backdrop-blur-sm transition-all duration-200',
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
            onClose={() => setShowSlashMenu(false)}
          />
        )}

        {/* @Mention Dropdown */}
        {showMentions && (
          <div
            ref={mentionsRef}
            className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-border/60 bg-popover/95 shadow-xl backdrop-blur-xl"
          >
            <div className="p-1.5">
              <div className="mb-1.5 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
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
                filteredSkills.map((skill) => (
                  <button
                    key={skill.name}
                    onClick={() => handleMentionSelect(skill)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <span className="text-[10px] font-bold">
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
            </div>
          </div>
        )}

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
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={
                isTurnActive && !imageMode
                  ? 'Reply — sends when the current response finishes'
                  : imageMode
                    ? 'Describe or edit an image'
                    : placeholder
              }
              // Type-ahead: the textarea stays enabled while a turn streams so the
              // user can compose a follow-up (queued + auto-sent on completion).
              // Image mode has no streaming turn to type ahead of, so it stays gated.
              disabled={composerDisabled || (imageMode && isTurnActive)}
              className={cn(
                'relative z-10 max-h-[240px] w-full resize-none overflow-y-auto border-0 bg-transparent px-2 leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-50',
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
                  'absolute bottom-0 right-2 z-20 text-[10px] tabular-nums',
                  charCounterExceeded ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {messageLength.toLocaleString()} / {COMPOSER_MAX_CHARS.toLocaleString()} characters
                {charCounterExceeded ? ' · limit reached' : ''}
              </p>
            )}
          </div>

          {/* AUDIT-FIX CMP-9: a typed command is applied on send, so say so
              before the user presses Enter. */}
          {pendingSlashCommand && (
            <p className="px-2 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">{pendingSlashCommand.label}</span> runs
              on send
              {pendingSlashCommand.argument ? ` with: ${pendingSlashCommand.argument}` : ''}
            </p>
          )}

          {/* Control cluster — row 2, a single non-wrapping line (flex-nowrap). */}
          <div className="flex min-w-0 flex-nowrap items-center gap-1 sm:gap-2">
            {/* + Overflow Menu Button */}
            <div className={cn('relative shrink-0')} ref={overflowRef}>
              <button
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
                    ? 'bg-[var(--chat-accent-primary)]/15 text-[var(--chat-accent-primary)]'
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
                    className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
                  >
                    {overflowActiveCount}
                  </span>
                )}
              </button>

              {/* + Menu Popover */}
              {showOverflowMenu && (
                <div className="absolute bottom-full left-0 z-50 mb-2 w-64 rounded-xl border border-border/60 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
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
                                  {mode === 'chat' ? 'Chat' : 'AGI Work'}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="my-1 border-t border-border/40" />
                        </div>
                      )}

                      {/* 1. Add photos and files */}
                      <button
                        type="button"
                        onClick={() => {
                          fileInputRef.current?.click();
                          closeMenu();
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
                      >
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 text-left">Add photos &amp; files</span>
                      </button>

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
                          if (!canUseImageGeneration) {
                            onUpgradeRequest?.();
                            return;
                          }
                          setImageMode(true);
                          setTimeout(() => textareaRef.current?.focus(), 0);
                        }}
                        title={
                          canUseImageGeneration
                            ? undefined
                            : 'Image generation is available on Pro and above.'
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
                        {!canUseImageGeneration && (
                          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            Upgrade
                          </span>
                        )}
                      </button>

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
                            <span className="text-[10px] text-muted-foreground">Not supported</span>
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
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
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
                              ? "Deep Research isn't available for this model. Switch to Claude, Gemini, or an Auto mode."
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
                      />

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
                </div>
              )}
            </div>

            {primaryOverflowActive && PrimaryOverflowIcon && (
              <div
                role="status"
                aria-label={`Active options: ${overflowActiveOptions
                  .map((option) => option.label)
                  .join(', ')}`}
                title={overflowActiveOptions.map((option) => option.label).join(', ')}
                className="flex h-8 min-w-0 shrink items-center gap-1.5 rounded-full border border-[var(--chat-accent-primary)]/25 bg-[var(--chat-accent-primary)]/10 px-2 text-[11px] font-medium text-[var(--chat-accent-primary)]"
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
              Chat/Cowork parity, sitting immediately right of "+" (reference:
              docs/design/ui-ux-reference-2026-07). Backed: 'agiwork' reveals
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
                    title={WORK_MODE_TITLES[mode]}
                    className={cn(
                      'flex h-7 items-center rounded-full px-3 transition-colors',
                      workMode === mode
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                      (isTurnActive || composerDisabled) && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    {mode === 'chat' ? 'Chat' : 'AGI Work'}
                  </button>
                ))}
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
                    setImageModelId(IMAGE_MODEL_DEFAULT);
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
                    type="button"
                    onClick={() => {
                      setShowImageAspectMenu((p) => !p);
                      setShowImageModelMenu(false);
                    }}
                    className="flex h-8 items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/60 hover:text-foreground"
                    aria-label="Select aspect ratio"
                  >
                    {IMAGE_ASPECT_OPTIONS.find((o) => o.id === imageAspectRatio)?.label ?? 'Auto'}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {showImageAspectMenu && (
                    <div className="absolute bottom-full left-0 z-50 mb-1 w-44 rounded-xl border border-border/60 bg-popover/95 p-1 shadow-xl backdrop-blur-xl">
                      {IMAGE_ASPECT_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setImageAspectRatio(opt.id);
                            setShowImageAspectMenu(false);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors',
                            imageAspectRatio === opt.id
                              ? 'bg-primary/10 text-primary'
                              : 'hover:bg-muted/60',
                          )}
                        >
                          <span className="flex-1 text-left">{opt.label}</span>
                          {imageAspectRatio === opt.id && (
                            <Check className="h-3 w-3 shrink-0 text-primary" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Model selector. In normal mode the full ComposerFooter sits inline beside
              the send button. In image mode the image-model picker takes its place —
              both use `ml-auto` so they right-align and push the mic + send to the
              right edge of the toolbar. In the flex-nowrap control row the footer is
              the only shrinkable item (min-w-0), so it truncates instead of wrapping. */}
            {!imageMode && (
              <ComposerFooter
                inline
                className="ml-auto min-w-0"
                showModelSelector
                lockModelSelector={false}
                showStyleSelector={!isFreeTrial}
                onUpgradeRequest={onUpgradeRequest}
              />
            )}

            {imageMode && (
              <div className="relative ml-auto shrink-0">
                <button
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
                    {IMAGE_MODELS.find((m) => m.id === imageModelId)?.label ??
                      'No image model available'}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
                {showImageModelMenu && (
                  <div className="absolute bottom-full right-0 z-50 mb-1 w-52 rounded-xl border border-border/60 bg-popover/95 p-1 shadow-xl backdrop-blur-xl">
                    {IMAGE_MODELS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setImageModelId(m.id);
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
                  </div>
                )}
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
              disabled={composerDisabled || (sendButtonMode !== 'stop' && hasAttachmentConflict)}
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
                ? 'border-[var(--chat-accent-primary)]/40 bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary)]'
                : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            )}
          >
            <button
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
              aria-label={canUseAgiWork ? 'Project or folder' : 'Project'}
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

          {showProjectPicker && (
            <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-border/60 bg-popover/95 p-1.5 shadow-xl backdrop-blur-xl">
              <input
                type="text"
                value={projectQuery}
                onChange={(e) => setProjectQuery(e.target.value)}
                placeholder="Search projects..."
                aria-label="Search projects"
                autoFocus
                className="mb-1.5 w-full rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-[var(--chat-accent-primary)]/40"
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
                  title={
                    canPickFolder ? undefined : 'Folder access is not supported in this browser'
                  }
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
                  router.push('/projects');
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted/60"
              >
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left">View all projects</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Compact route disclosure + disclaimer · both sit below the composer
          instead of consuming a full banner above the textarea. The destination
          remains visible before send and expands to the complete payload/tool
          explanation only when requested. */}
      <div className="mt-2 flex min-h-5 flex-wrap items-center justify-center gap-x-1 gap-y-0.5 text-[11px] text-muted-foreground">
        {sendPreviewPresentation ? (
          <>
            <SendPreview presentation={sendPreviewPresentation} variant="compact" />
            <span aria-hidden="true">·</span>
          </>
        ) : null}
        <span>AGI can make mistakes. Check important info.</span>
        <span aria-hidden="true">·</span>
        <Link
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Privacy
        </Link>
        <span aria-hidden="true">·</span>
        <ComposerFeedbackDialog conversationId={conversationId} />
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
