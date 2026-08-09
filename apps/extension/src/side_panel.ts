import { QueueFullError, type AgentActivityToolEntry } from '@agiworkforce/client-runtime';
import type { ManagedCloudAgentRunReference } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { getExtensionTokensCssAuto } from './tokens';
import { pageChipLabel } from './utils';
import {
  canUseBillingPlanCapability,
  formatUsageRemaining,
  formatUsageResetIn,
  getBillingPlanPricing,
  EFFORT_LABEL,
  isEntitledSubscriptionStatus,
  normalizeModelId,
  PROVIDER_DISPLAY,
  resolveModelEffort,
  type Effort,
  type ProviderId,
  type RoutingTaskType,
} from '@agiworkforce/types';
import { getExtensionSendQueue } from './sendQueue';
import {
  clearChildren,
  setText,
  createElementWith,
  setChild,
  appendSvgString,
} from './dom-helpers';
import {
  createBrowserConversationId,
  filterConversations,
  getActiveConversation,
  getConversation,
  listConversations,
  deleteConversation,
  persistConversationSeed,
  upsertConversation,
  startNewConversation,
  type ConversationEntry,
} from './features/background/conversation-history';
import {
  assignConversationOwner,
  claimConversationOwner,
  claimSelectedConversationOwner,
  restoreConversationOwnerIfCurrent,
  resolveBrowserConversationScope,
} from './features/background/conversation-session';
import {
  backgroundConversationId,
  takePendingResultConversation,
  OPEN_BROWSER_CONVERSATION_MESSAGE,
} from './features/background/background-results';
import { sanitizeHtml, renderMarkdown } from './features/side-panel/markdown';
import { el } from './features/side-panel/dom';
import { buildBubbleWithTools } from './features/side-panel/bubbles';
import {
  applyCanonicalAgentEvent,
  applyStreamFailure,
  hydrateStoredChatMessage,
  resolveComposerPrompt,
  selectModelHistory,
  shouldRebuildMessageDom,
  trimChatMessages,
  type SidePanelChatMessage,
} from './features/side-panel/chat-state';
import { setupVoiceInput } from './features/side-panel/voice';
import { markOnboardingComplete, isOnboardingComplete } from './features/side-panel/onboarding';
import { getChromeSurfaceAvailability } from './features/side-panel/surface-policy';
import {
  createActiveWebMCPPageIdentity,
  isWebMCPUpdateHintForActivePage,
  selectWebMCPToolsForActivePage,
  type ActiveWebMCPPageIdentity,
} from './features/side-panel/webmcp-tools';
import { ManagedCloudOwnerRequestFence } from './features/side-panel/managed-owner-request-fence';
import { ALLOWED_BRIDGE_HOSTS, validateBridgeUrl, sanitizePageText } from './background/policy';
import {
  FilePen,
  Loader2,
  Folder,
  Plug,
  ArrowUp,
  Clock,
  Trash2,
  MessageSquare,
  Monitor,
  Mic,
  Camera,
  FileImage,
  Zap,
  FileEdit,
  Square,
  Settings,
  Shield,
  X,
  Play,
  ChevronDown,
  Check,
  renderIcon,
} from './assets/icons';
import {
  buildComputerUsePanel,
  COMPUTER_USE_PANEL_CSS,
  type ComputerUsePanelAPI,
} from './features/side-panel/computerUsePanel';
import {
  loadPairingState,
  requestPairing,
  unpair,
  type PairingState,
} from './features/native-bridge/pairing';
import { isMemoryItem, MEMORY_STORAGE_KEY } from './background/memory-bridge';
import { mountInviteCodeModal } from './features/cloud-bridge/InviteCodeModal';
import {
  CONTEXT_HANDOFF_STORAGE_KEY,
  isPendingContextHandoff,
  mountContextHandoffPreview,
  type ContextHandoffActionResult,
  type ContextHandoffPreviewController,
} from './features/context-handoff';
import {
  getManagedCloudAuthContext,
  getManagedModelAccess,
  clearAuthToken,
  MANAGED_CHAT_MAX_ATTACHMENTS,
  MANAGED_CHAT_MAX_ATTACHMENT_BYTES,
  type ManagedModelAccess,
} from './features/cloud-bridge/freeTrialClient';
import { createManagedChatPortName } from './features/cloud-bridge/managedChatPort';
import {
  getClerkAccountProfile,
  isClerkExtensionAuthConfigured,
  observeClerkAuth,
  openClerkSignIn,
} from './features/cloud-bridge/clerkAuth';
import {
  formatManagedTierLabel,
  getManagedCapabilityLabel,
  getManagedModelBadgeLabel,
  getManagedEffortControlState,
  getManagedOutboundEffort,
  getManagedModelPickerOptions,
  reconcileManagedModelSelection,
  type ManagedModelPickerOption,
} from './features/cloud-bridge/managedModelPicker';
import {
  isManagedCloudBroadcastOwnedBy,
  normalizeManagedCloudOwner,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from './features/cloud-bridge/managedCloudAuthority';

const extensionSendQueue = getExtensionSendQueue();

// ── Drawer: shared storage keys ──────────────────────────────────────────────
/** Storage key matching inPagePanel/setup.ts IN_PAGE_PANEL_ENABLED_KEY */
const SP_IN_PAGE_PANEL_ENABLED_KEY = 'in_page_panel_enabled';
/** Storage key matching background.ts siteAllowlistCache + inPagePanel/setup.ts */
const SP_SITE_ALLOWLIST_KEY = 'agi_site_allowlist';

/** Session timer for the stats footer in the drawer */
let _drawerSessionStart = Date.now();
let _drawerSessionTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Module-level reference to the cloud account UI refresh function.
 * Populated by buildUI() after the inner function is created so that the
 * chrome.runtime.onMessage listener (which runs at module scope, outside
 * buildUI's closure) can call it to update account access after authentication
 * or plan changes.
 */
let refreshCloudAccountUI: (forceAuthRefresh?: boolean) => Promise<void> = async () => {
  /* no-op until buildUI() initialises the real implementation */
};

let refreshModelPickerUI: () => void = () => {
  /* no-op until buildUI() initialises the real implementation */
};
let refreshEffortUI: () => void = () => {
  /* no-op until buildUI() initialises the real implementation */
};

/**
 * Load a stored conversation into the panel by id.
 *
 * Background runs (scheduled tasks, prompt shortcuts) file their answers into
 * the same conversation store the History drawer reads. This hook lets the
 * module-scope message listener, the boot sequence, and the Workflows task
 * rows all open one of those results using the same restore path a history
 * entry uses. Real implementation is installed by buildUI().
 */
let openStoredConversation: (conversationId: string) => Promise<boolean> = async () => false;
let historyRestoreInProgress = false;
let historyRestoreToken = 0;
let managedModelAccess: ManagedModelAccess | null = null;
let cloudAccountRefreshGeneration = 0;
const scheduledTasksRequestFence = new ManagedCloudOwnerRequestFence();
const scheduledTaskCreateRequestFence = new ManagedCloudOwnerRequestFence();
let resetScheduledTaskDraftForOwnerTransition: () => void = () => {
  /* no-op until buildUI() creates the Workflows form */
};
let initialCloudAccountRefresh: Promise<void> = Promise.resolve();
type ManagedCloudChatState = 'loading' | 'ready' | 'signed_out' | 'unavailable';
type ManagedCloudGateAction =
  | 'none'
  | 'sign_in'
  | 'open_web'
  | 'upgrade'
  | 'billing'
  | 'usage'
  | 'retry';
let managedCloudChatState: ManagedCloudChatState = 'loading';
let managedCloudGateMessage = 'Checking your AGI Cloud account…';
let managedCloudGateAction: ManagedCloudGateAction = 'none';
let managedCloudGateActionLabel = '';

function setManagedCloudChatState(
  state: ManagedCloudChatState,
  options: {
    message?: string;
    action?: ManagedCloudGateAction;
    actionLabel?: string;
  } = {},
): void {
  managedCloudChatState = state;
  managedCloudGateMessage =
    options.message ??
    (state === 'signed_out'
      ? 'Sign in to use AGI Cloud chat.'
      : state === 'unavailable'
        ? 'AGI Cloud chat is unavailable.'
        : managedCloudGateMessage);
  managedCloudGateAction = options.action ?? 'none';
  managedCloudGateActionLabel = options.actionLabel ?? '';

  const gate = document.getElementById('sp-cloud-gate');
  const message = document.getElementById('sp-cloud-gate-message');
  const action = document.getElementById('sp-cloud-gate-action') as HTMLButtonElement | null;
  const input = document.getElementById('sp-input') as HTMLTextAreaElement | null;

  gate?.classList.toggle('visible', state !== 'ready');
  if (message) message.textContent = managedCloudGateMessage;
  if (action) {
    action.hidden = managedCloudGateAction === 'none';
    action.textContent = managedCloudGateActionLabel;
    action.dataset['action'] = managedCloudGateAction;
  }
  if (input) {
    input.disabled = state !== 'ready';
    if (state === 'ready') input.placeholder = 'Ask anything... (/ for commands)';
    else if (state === 'signed_out') input.placeholder = 'Sign in to chat';
    else if (state === 'unavailable') input.placeholder = 'AGI Cloud access required';
  }
  updateSendButton();
}

/**
 * Side-panel UI message shape.
 *
 * File-local type for the Chrome extension side panel renderer.
 * Kept local because the extension renderer only needs a subset of the
 * canonical chat contract. Field mapping to canonical ChatMessage:
 *   - `id`        → canonical `id`
 *   - `role`      → canonical `role`
 *   - `content`   → canonical `content`
 *   - `timestamp` → canonical `createdAt` (here as Unix ms instead of ISO string)
 *   - `streaming` → canonical `isStreaming`
 */
type ChatMessage = SidePanelChatMessage;

interface ChatChunk {
  type: 'CHAT_CHUNK';
  owner: ManagedCloudOwner;
  clientInstanceId: string;
  id: string;
  text: string;
  done: boolean;
  error?: string;
  agentEvent?: AgentEventEnvelope;
  durableReplay?: true;
  cloudRun?: ManagedCloudAgentRunReference;
  routing?: {
    modelKey: string;
    taskType: RoutingTaskType;
    reason: string;
    effort?: Effort;
  };
}

export interface SharedSidePanelContext {
  messages: ChatMessage[];
  pendingPageContext: string | null;
  isStreaming: boolean;
  currentStreamId: string | null;
  streamTimeoutHandle: ReturnType<typeof setTimeout> | null;
  /** Track how many messages have already been rendered to avoid full DOM rebuilds. */
  lastRenderedCount: number;
  needsMessageRebuild: boolean;
  isConnected: boolean;
  /**
   * Whether extended thinking is enabled for the next outgoing message.
   * Persisted to chrome.storage.local as 'agi_thinking_enabled'.
   * The Managed Cloud gateway owns provider-specific reasoning translation.
   */
  thinkingEnabled: boolean;
  /** Per-turn Auto Economy override controlled by the Quick composer toggle. */
  quickMode: boolean;
  /** Model picker state and last successful Auto route are conversation scoped. */
  conversationId: string;
  conversationScope: string | null;
  /** Invalidates delayed boot/history continuations after the user changes state. */
  conversationGeneration: number;
  /** Exact account/session incarnation that owns all visible Managed Cloud state. */
  managedCloudOwner: ManagedCloudOwner | null;
  selectedModel: string;
  currentModelKey?: string;
  previousTaskType?: RoutingTaskType;
  /** Conversation-scoped reasoning preference, validated against the routed model. */
  reasoningEffort?: Effort;
}

function createSharedSidePanelContext(): SharedSidePanelContext {
  return {
    messages: [],
    pendingPageContext: null,
    isStreaming: false,
    currentStreamId: null,
    streamTimeoutHandle: null,
    lastRenderedCount: 0,
    needsMessageRebuild: false,
    isConnected: false,
    thinkingEnabled: false,
    quickMode: false,
    conversationId: createBrowserConversationId(),
    conversationScope: null,
    conversationGeneration: 0,
    managedCloudOwner: null,
    selectedModel: 'auto',
  };
}

const _ctx: SharedSidePanelContext = createSharedSidePanelContext();
const SIDE_PANEL_CLIENT_INSTANCE_ID = crypto.randomUUID();
let managedChatKeepalivePort: chrome.runtime.Port | null = null;
let managedChatKeepaliveTimer: ReturnType<typeof setInterval> | null = null;
let contextHandoffPreview: ContextHandoffPreviewController | null = null;
let activeContextHandoffId: string | null = null;
let conversationScopePromise: Promise<string> | null = null;

async function getConversationScope(): Promise<string> {
  if (_ctx.conversationScope) return _ctx.conversationScope;
  conversationScopePromise ??= resolveBrowserConversationScope(SIDE_PANEL_CLIENT_INSTANCE_ID);
  const scope = await conversationScopePromise;
  _ctx.conversationScope ??= scope;
  return _ctx.conversationScope;
}

function persistCurrentConversationOwner(): void {
  const owner = _ctx.managedCloudOwner;
  if (!owner) return;
  const conversationId = _ctx.conversationId;
  const generation = _ctx.conversationGeneration;
  void getConversationScope()
    .then((scope) => {
      if (_ctx.conversationId !== conversationId || _ctx.conversationGeneration !== generation) {
        return;
      }
      if (!sameManagedCloudOwner(_ctx.managedCloudOwner, owner)) return;
      return assignConversationOwner(scope, owner, conversationId);
    })
    .catch((error) => {
      console.warn('[SidePanel] Failed to persist window conversation owner:', error);
    });
}

const ROUTING_TASK_TYPES: ReadonlySet<RoutingTaskType> = new Set([
  'coding',
  'reasoning',
  'general',
  'agentic',
  'multimodal',
  'research',
  'computer-use',
  'image_generation',
  'creative_writing',
  'long_context',
  'simple_chat',
]);

function applyRoutingContinuation(routing: ChatChunk['routing']): boolean {
  if (!routing) return false;
  if (
    typeof routing.modelKey !== 'string' ||
    routing.modelKey.length === 0 ||
    routing.modelKey.length > 200 ||
    !ROUTING_TASK_TYPES.has(routing.taskType) ||
    typeof routing.reason !== 'string' ||
    routing.reason.length === 0 ||
    routing.reason.length > 500
  ) {
    console.warn('[SidePanel] Ignored malformed Managed Cloud routing metadata');
    return false;
  }
  const nextEffort = resolveModelEffort(routing.modelKey, routing.effort);
  if (routing.effort !== undefined && nextEffort !== routing.effort) {
    console.warn('[SidePanel] Ignored unsupported Managed Cloud effort metadata');
    return false;
  }
  const changed =
    _ctx.currentModelKey !== routing.modelKey ||
    _ctx.previousTaskType !== routing.taskType ||
    _ctx.reasoningEffort !== nextEffort;
  _ctx.currentModelKey = routing.modelKey;
  _ctx.previousTaskType = routing.taskType;
  _ctx.reasoningEffort = nextEffort;
  refreshEffortUI();
  return changed;
}

function managedOutboundEffortPayload(usePersistedSelection = false): { effort?: Effort } {
  if (_ctx.quickMode && !usePersistedSelection) return {};
  const routingSelection = _ctx.selectedModel;
  const effort = getManagedOutboundEffort(
    routingSelection,
    _ctx.currentModelKey,
    _ctx.reasoningEffort,
  );
  return effort === undefined ? {} : { effort };
}

function managedOutboundRoutingPayload(): {
  effort?: Effort;
  currentModelKey?: string;
  previousTaskType?: RoutingTaskType;
} {
  if (_ctx.quickMode) return {};
  return {
    ...managedOutboundEffortPayload(),
    ...(_ctx.currentModelKey ? { currentModelKey: _ctx.currentModelKey } : {}),
    ...(_ctx.previousTaskType ? { previousTaskType: _ctx.previousTaskType } : {}),
  };
}

// Provider display order in the grouped picker.
const PROVIDER_GROUP_ORDER: ProviderId[] = [
  'anthropic',
  'openai',
  'google',
  'deepseek',
  'xai',
  'perplexity',
  'qwen',
  'moonshot',
  'zhipu',
  'ollama',
  'lmstudio',
  'custom-openai-compatible',
  'agi-cloud',
];

function getModelBadgeLabel(modelId: string): string {
  return getManagedModelBadgeLabel(modelId);
}
interface WebMCPToolEntry {
  name: string;
  description: string;
}
let discoveredTools: WebMCPToolEntry[] = [];

let isRecording = false;
let recordingActionCount = 0;

/**
 * Pending image attachments added via the composer + menu.
 * Each entry is a data-URL (base64 PNG/JPEG) to be prepended to the
 * next outgoing message. Cleared after send.
 */
const pendingAttachments: string[] = [];
const cloudRunsByStreamId = new Map<string, ManagedCloudAgentRunReference>();
/** Snapshot request-only Quick state per stream; UI toggles may change mid-run. */
const quickModeByStreamId = new Map<string, boolean>();
/** Exact account/session incarnation captured when each stream was admitted. */
const ownerByStreamId = new Map<string, ManagedCloudOwner>();

/**
 * Hostname of the active browser tab, shown in the persistent context chip.
 * Updated whenever the side panel receives focus or a tab-changed message.
 */
let currentPageHostname = '';
let activeWebMCPPage: ActiveWebMCPPageIdentity | null = null;
let webMCPPageGeneration = 0;

type SidePanelTab = 'chat' | 'workflows' | 'computer-use';

const MAX_STORED_MESSAGES = 50;

function trimLiveMessages(): void {
  if (trimChatMessages(_ctx.messages, MAX_STORED_MESSAGES) > 0) {
    _ctx.lastRenderedCount = 0;
    _ctx.needsMessageRebuild = true;
  }
}

function serializeMessagesForHistory() {
  return _ctx.messages
    .filter((message) => !message.error)
    .slice(-MAX_STORED_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      ...(message.role === 'assistant' && message.agentEvents
        ? { agentEvents: message.agentEvents }
        : {}),
      ...(message.role === 'assistant' && message.cloudAgentRun
        ? { cloudAgentRun: message.cloudAgentRun }
        : {}),
      ...(message.role === 'assistant' && message.cloudApprovalDecisions
        ? { cloudApprovalDecisions: message.cloudApprovalDecisions }
        : {}),
      ...(message.role === 'assistant' && message.cloudApprovalError
        ? { cloudApprovalError: message.cloudApprovalError }
        : {}),
      ...(message.role === 'assistant' && message.managedQuickMode
        ? { managedQuickMode: true }
        : {}),
    }));
}

function persistMessages(): Promise<void> {
  const owner = _ctx.managedCloudOwner;
  if (!owner) return Promise.resolve();
  persistCurrentConversationOwner();
  return upsertConversation(owner, _ctx.conversationId, serializeMessagesForHistory(), {
    selectedModel: _ctx.selectedModel,
    currentModelKey: _ctx.currentModelKey,
    previousTaskType: _ctx.previousTaskType,
    effort: _ctx.reasoningEffort,
  }).then(() => undefined);
}

function saveMessages(): void {
  void persistMessages().catch((err) => {
    console.warn('[SidePanel] Failed to persist messages:', err);
  });
}

async function loadMessages(): Promise<void> {
  const ownerAtStart = _ctx.managedCloudOwner;
  if (!ownerAtStart) return;
  const expectedGeneration = _ctx.conversationGeneration;
  const scope = await getConversationScope();
  if (
    _ctx.conversationGeneration !== expectedGeneration ||
    !sameManagedCloudOwner(_ctx.managedCloudOwner, ownerAtStart)
  )
    return;
  const lastActive = await getActiveConversation(ownerAtStart);
  if (
    _ctx.conversationGeneration !== expectedGeneration ||
    !sameManagedCloudOwner(_ctx.managedCloudOwner, ownerAtStart)
  )
    return;
  const conversationOwner = await claimConversationOwner(scope, ownerAtStart, lastActive?.id);
  if (
    _ctx.conversationGeneration !== expectedGeneration ||
    !sameManagedCloudOwner(_ctx.managedCloudOwner, ownerAtStart)
  )
    return;
  const ownedConversation = await getConversation(ownerAtStart, conversationOwner.conversationId);
  if (
    _ctx.conversationGeneration !== expectedGeneration ||
    !sameManagedCloudOwner(_ctx.managedCloudOwner, ownerAtStart)
  )
    return;
  let active =
    ownedConversation ??
    (conversationOwner.seedConversationId && conversationOwner.seedConversationId === lastActive?.id
      ? lastActive
      : undefined);
  _ctx.conversationId = conversationOwner.conversationId;
  if (!active) return;
  if (
    !ownedConversation &&
    conversationOwner.seedConversationId &&
    active.id === conversationOwner.seedConversationId
  ) {
    const persistedSeed = await persistConversationSeed(
      ownerAtStart,
      conversationOwner.conversationId,
      active,
    );
    if (
      _ctx.conversationGeneration !== expectedGeneration ||
      !sameManagedCloudOwner(_ctx.managedCloudOwner, ownerAtStart)
    )
      return;
    if (persistedSeed) active = persistedSeed;
  }
  _ctx.selectedModel = normalizeModelId(active.routing.selectedModel) ?? 'auto';
  _ctx.currentModelKey = active.routing.currentModelKey;
  _ctx.previousTaskType = active.routing.previousTaskType;
  const effortModel =
    _ctx.selectedModel === 'auto' || _ctx.selectedModel.startsWith('auto-')
      ? _ctx.currentModelKey
      : _ctx.selectedModel;
  _ctx.reasoningEffort = effortModel
    ? resolveModelEffort(effortModel, active.routing.effort)
    : undefined;
  refreshModelPickerUI();
  refreshEffortUI();
  _ctx.messages.push(
    ...active.messages
      .slice(-MAX_STORED_MESSAGES)
      .map((message) =>
        hydrateStoredChatMessage(
          message,
          `h-${message.timestamp}-${crypto.randomUUID().slice(0, 6)}`,
        ),
      ),
  );
  _ctx.lastRenderedCount = 0;
  _ctx.needsMessageRebuild = true;
  resumeLatestStoredManagedRun(expectedGeneration);
}

function resumeLatestStoredManagedRun(expectedGeneration: number): void {
  const ownerAtAdmission = _ctx.managedCloudOwner;
  if (!ownerAtAdmission) return;
  const resumable = [..._ctx.messages]
    .reverse()
    .find(
      (message) =>
        message.role === 'assistant' &&
        message.cloudAgentRun &&
        (message.cloudAgentRun.state === undefined ||
          message.cloudAgentRun.state === 'queued' ||
          message.cloudAgentRun.state === 'running'),
    );
  if (resumable?.cloudAgentRun) {
    resumable.streaming = true;
    queueMicrotask(() => {
      if (
        _ctx.conversationGeneration !== expectedGeneration ||
        !sameManagedCloudOwner(_ctx.managedCloudOwner, ownerAtAdmission) ||
        !resumable.cloudAgentRun
      )
        return;
      resumeManagedCloudRun(
        resumable.id,
        resumable.cloudAgentRun,
        resumable.content,
        resumable.managedQuickMode === true,
      );
    });
  }
}

function clearStoredMessages(): void {
  historyRestoreToken += 1;
  _ctx.conversationGeneration += 1;
  _ctx.conversationId = createBrowserConversationId();
  persistCurrentConversationOwner();
  _ctx.selectedModel = 'auto';
  _ctx.currentModelKey = undefined;
  _ctx.previousTaskType = undefined;
  _ctx.reasoningEffort = undefined;
  refreshModelPickerUI();
  refreshEffortUI();
  chrome.storage.local.remove('agi_model').catch(() => {});
  const owner = _ctx.managedCloudOwner;
  if (!owner) return;
  startNewConversation(owner).catch((err) => {
    console.warn('[SidePanel] Failed to clear stored messages:', err);
  });
}

function resetConversationView(): void {
  _ctx.messages.length = 0;
  _ctx.lastRenderedCount = 0;
  _ctx.needsMessageRebuild = true;
  _ctx.pendingPageContext = null;
  clearStoredMessages();
  updateContextButton();
  updateSendButton();
  renderMessages();
}

/**
 * Revoke all renderer-owned Managed Cloud state before exposing a new Clerk
 * account/session. The background is then told to abort every operation owned
 * by the prior incarnation and cancel durable runs with their captured token.
 */
async function transitionManagedCloudOwner(nextOwner: ManagedCloudOwner | null): Promise<boolean> {
  const previousOwner = _ctx.managedCloudOwner;
  if (
    (previousOwner === null && nextOwner === null) ||
    sameManagedCloudOwner(previousOwner, nextOwner)
  ) {
    return false;
  }

  historyRestoreToken += 1;
  _ctx.conversationGeneration += 1;
  scheduledTasksRequestFence.invalidate();
  scheduledTaskCreateRequestFence.invalidate();
  resetScheduledTaskDraftForOwnerTransition();
  clearWorkflowsTaskRows();
  if (_ctx.currentStreamId) cancelCurrentManagedStream(false);
  stopManagedChatKeepalive();
  if (_ctx.streamTimeoutHandle) {
    clearTimeout(_ctx.streamTimeoutHandle);
    _ctx.streamTimeoutHandle = null;
  }
  _ctx.managedCloudOwner = nextOwner ? { ...nextOwner } : null;
  _ctx.messages.length = 0;
  _ctx.lastRenderedCount = 0;
  _ctx.needsMessageRebuild = true;
  _ctx.isStreaming = false;
  _ctx.currentStreamId = null;
  _ctx.pendingPageContext = null;
  _ctx.conversationId = createBrowserConversationId();
  _ctx.selectedModel = 'auto';
  _ctx.currentModelKey = undefined;
  _ctx.previousTaskType = undefined;
  _ctx.reasoningEffort = undefined;
  cloudRunsByStreamId.clear();
  quickModeByStreamId.clear();
  ownerByStreamId.clear();
  refreshModelPickerUI();
  refreshEffortUI();
  updateContextButton();
  updateSendButton();
  removeThinking();
  renderMessages();

  if (previousOwner) {
    try {
      await chrome.runtime.sendMessage({
        type: 'MANAGED_CLOUD_AUTH_CHANGED',
        previousOwner,
      });
    } catch {
      // A restarting service worker has no surviving in-memory operation map.
    }
  }
  return true;
}

function injectStyles(): void {
  // M-08 audit 2026-05-19: switched from `document.createElement('style')` +
  // textContent + appendChild (which CSP `style-src 'self'` blocks) to
  // Constructable Stylesheets (`new CSSStyleSheet().replaceSync(...)` +
  // `document.adoptedStyleSheets`). Constructable sheets are a DOM API, not
  // CSS-source delivery, so they bypass style-src entirely. Chrome 73+
  // supports them; manifest minimum_chrome_version is 132 so we're safe.
  const cssText = `
    /* ── AGI design tokens (dark) ── */
    ${getExtensionTokensCssAuto()}

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    button:focus-visible,
    [role="button"]:focus-visible {
      outline: 2px solid var(--agi-ext-focus);
      outline-offset: 2px;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--agi-ext-bg);
      color: var(--agi-ext-text);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-size: 13px;
    }

    /* ── Explicit Chrome → Desktop context handoff ── */
    .sp-context-handoff-overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      background: color-mix(in srgb, var(--agi-ext-bg) 88%, transparent);
      backdrop-filter: blur(4px);
    }
    .sp-context-handoff-dialog {
      width: min(100%, 440px);
      max-height: calc(100vh - 32px);
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      border: 1px solid var(--agi-ext-border);
      border-radius: 12px;
      background: var(--agi-ext-surface);
      box-shadow: 0 18px 48px color-mix(in srgb, black 38%, transparent);
    }
    .sp-context-handoff-dialog h2 { font-size: 16px; color: var(--agi-ext-text); }
    .sp-context-handoff-dialog p { line-height: 1.45; color: var(--agi-ext-text-muted); }
    .sp-context-handoff-destination { color: var(--agi-ext-text) !important; font-weight: 600; }
    .sp-context-handoff-preview {
      max-height: 220px;
      overflow: auto;
      padding: 10px;
      border: 1px solid var(--agi-ext-border);
      border-radius: 8px;
      background: var(--agi-ext-bg);
      color: var(--agi-ext-text);
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      user-select: text;
    }
    .sp-context-handoff-source { font-size: 11px; overflow-wrap: anywhere; }
    .sp-context-handoff-redaction { color: var(--agi-ext-accent) !important; font-size: 12px; }
    .sp-context-handoff-status { min-height: 18px; font-size: 12px; }
    .sp-context-handoff-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .sp-context-handoff-actions button {
      min-height: 34px;
      padding: 7px 11px;
      border: 1px solid var(--agi-ext-border);
      border-radius: 7px;
      cursor: pointer;
      color: var(--agi-ext-text);
      background: var(--agi-ext-hover);
    }
    .sp-context-handoff-actions button:disabled { cursor: wait; opacity: 0.55; }
    .sp-context-handoff-actions button:focus-visible {
      outline: 2px solid var(--agi-ext-focus);
      outline-offset: 2px;
    }
    .sp-context-handoff-approve {
      border-color: var(--agi-ext-accent) !important;
      background: var(--agi-ext-accent) !important;
      color: var(--agi-ext-bg) !important;
      font-weight: 600;
    }

    /* ── Header ── */
    #sp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: var(--agi-ext-surface);
      border-bottom: 1px solid var(--agi-ext-border);
      flex-shrink: 0;
      gap: 8px;
    }
    #sp-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    #sp-logo {
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      /* currentColor for the 11 gray spokes; amber spoke is hard-wired in SVG */
      color: var(--agi-ext-text-muted);
    }
    #sp-logo svg {
      width: 24px;
      height: 24px;
      display: block;
    }
    #sp-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--agi-ext-text);
      white-space: nowrap;
    }
    #sp-model-badge {
      font-size: 10px;
      color: var(--agi-ext-accent);
      background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent);
      border-radius: 4px;
      padding: 1px 6px;
      /*
       * A Chrome side panel is ~320-500px and cannot be widened. Model ids run
       * long ("gemini-3.5-flash-lite", "mcp"-namespaced routes), and with only
       * white-space:nowrap this badge held its full intrinsic width and pushed
       * #sp-header-right — which is flex-shrink:0 — off the panel edge, taking
       * the header icon buttons with it. Truncate here so the actions survive.
       */
      white-space: nowrap;
      min-width: 0;
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #sp-header-right {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .sp-icon-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--agi-ext-text-muted);
      border-radius: 7px;
      width: 30px;
      height: 30px;
      padding: 0;
      font-size: 13px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s, background 0.15s;
    }
    .sp-icon-btn:hover { color: var(--agi-ext-text); background: var(--agi-ext-hover); }

    /* ── Messages area ── */
    #sp-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scroll-behavior: smooth;
    }
    #sp-messages::-webkit-scrollbar { width: 4px; }
    #sp-messages::-webkit-scrollbar-track { background: transparent; }
    #sp-messages::-webkit-scrollbar-thumb { background: var(--agi-ext-border); border-radius: 4px; }

    /* ── Empty state — Claude-style calm centered ── */
    #sp-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      padding: 40px 20px 16px;
      gap: 10px;
      text-align: center;
    }
    #sp-empty.hidden { display: none; }
    #sp-empty-icon {
      display: none;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
      opacity: 0.7;
    }
    #sp-empty-headline {
      display: none;
      font-size: 16px;
      font-weight: 600;
      color: var(--agi-ext-text);
      letter-spacing: -0.015em;
    }
    #sp-empty-subtext {
      display: none;
      font-size: 12px;
      color: var(--agi-ext-text-muted);
      line-height: 1.55;
      max-width: 220px;
    }

    /* ── Inline prompt chips under the composer (design-spec §8.2) ── */
    #sp-prompt-chips {
      /* Slash commands remain available from the composer. Keep the empty
         surface visually quiet, matching the chat-first reference panels. */
      display: none;
      flex-wrap: nowrap;
      gap: 6px;
      overflow: hidden;
      padding: 6px 10px 0;
    }
    #sp-prompt-chips.hidden { display: none; }
    .sp-cmd-chip {
      display: inline-flex;
      align-items: center;
      height: 28px;
      padding: 0 10px;
      font-size: 11px;
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text-muted);
      border-radius: 999px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      border: 1px solid var(--agi-ext-border);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .sp-cmd-chip:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }

    /* ── Restricted-page notice; chat remains available ── */
    #sp-blocked {
      display: none;
      flex: none;
      align-items: flex-start;
      gap: 10px;
      order: -1;
      padding: 10px 12px;
      border: 1px solid var(--agi-ext-border);
      border-radius: 10px;
      background: var(--agi-ext-surface);
    }
    #sp-blocked.visible { display: flex; }
    #sp-blocked-shield {
      width: 20px;
      height: 20px;
      flex: 0 0 20px;
      opacity: 0.65;
    }
    .sp-blocked-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    #sp-blocked-title { font-size: 12px; font-weight: 600; color: var(--agi-ext-text); }
    #sp-blocked-desc { font-size: 11px; color: var(--agi-ext-text-muted); line-height: 1.45; }

    /* ── Message bubbles ── */
    .sp-msg {
      display: flex;
      flex-direction: column;
      max-width: 88%;
      gap: 3px;
    }
    .sp-msg-user {
      align-self: flex-end;
      align-items: flex-end;
    }
    .sp-msg-assistant {
      align-self: flex-start;
      align-items: flex-start;
    }
    .sp-bubble {
      padding: 8px 11px;
      border-radius: 12px;
      line-height: 1.55;
      font-size: 13px;
      word-break: break-word;
      white-space: pre-wrap;
    }
    .sp-bubble-user {
      background: color-mix(in srgb, var(--agi-ext-accent) 18%, transparent);
      color: var(--agi-ext-text);
      border-bottom-right-radius: 3px;
    }
    .sp-bubble-assistant {
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text);
      border: 1px solid var(--agi-ext-border);
      border-bottom-left-radius: 3px;
    }
    .sp-bubble-error {
      background: var(--agi-ext-danger-bg);
      border-color: var(--agi-ext-danger-border);
      color: var(--agi-ext-danger);
    }
    /* Failure footer: the reason plus a way to act on it. Previously the
       reason was concatenated into the message text as "Error: <string>". */
    .sp-bubble-error-footer {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid var(--agi-ext-danger-border);
    }
    .sp-bubble-error-text {
      font-size: 11px;
      line-height: 1.45;
      color: var(--agi-ext-danger);
      overflow-wrap: anywhere;
    }
    .sp-bubble-retry-btn {
      flex-shrink: 0;
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 600;
      color: var(--agi-ext-text);
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: 999px;
      cursor: pointer;
    }
    .sp-bubble-retry-btn:hover:not(:disabled) { background: var(--agi-ext-hover); }
    .sp-bubble-retry-btn:disabled { opacity: 0.5; cursor: default; }
    /* ── Bubble action row (timestamp + copy) ── */
    .sp-bubble-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      min-height: 16px;
    }
    .sp-msg-user .sp-bubble-actions { justify-content: flex-end; }
    .sp-timestamp {
      font-size: 10px;
      color: var(--agi-ext-text-muted);
      opacity: 0.5;
      padding: 0 3px;
    }
    .sp-copy-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      color: var(--agi-ext-text-muted);
      cursor: pointer;
      padding: 2px;
      border-radius: 3px;
      opacity: 0;
      transition: opacity 0.15s, color 0.15s, background 0.15s;
    }
    .sp-msg:hover .sp-copy-btn { opacity: 1; }
    /* Keyboard users tab to an opacity:0 control and cannot see where focus is;
       touch devices never hover at all, so Copy was unreachable there. */
    .sp-copy-btn:focus-visible { opacity: 1; }
    @media (hover: none) {
      .sp-copy-btn { opacity: 1; }
    }
    .sp-copy-btn:hover { color: var(--agi-ext-text); background: var(--agi-ext-hover); }
    .sp-copy-btn.copied { color: var(--agi-ext-success); opacity: 1; }

    /* ── Markdown rendering inside assistant bubbles ── */
    .sp-bubble-assistant code {
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: 3px;
      padding: 1px 4px;
      font-family: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', Consolas, monospace;
      font-size: 11px;
      color: var(--agi-ext-accent);
    }
    .sp-bubble-assistant pre {
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      padding: 10px;
      overflow-x: auto;
      margin: 4px 0;
      font-family: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', Consolas, monospace;
      font-size: 11px;
      color: var(--agi-ext-text);
      white-space: pre;
    }
    .sp-bubble-assistant pre code {
      background: none;
      border: none;
      padding: 0;
      color: inherit;
    }
    .sp-bubble-assistant strong { color: var(--agi-ext-text); font-weight: 600; }
    .sp-bubble-assistant em { color: var(--agi-ext-text-muted); font-style: italic; }
    .sp-bubble-assistant a { color: var(--agi-ext-accent); text-decoration: underline; }
    .sp-bubble-assistant ul, .sp-bubble-assistant ol {
      padding-left: 16px;
      margin: 4px 0;
    }
    .sp-bubble-assistant li { margin: 2px 0; }
    .sp-bubble-assistant h1, .sp-bubble-assistant h2, .sp-bubble-assistant h3 {
      font-weight: 600;
      color: var(--agi-ext-text);
      margin: 6px 0 3px;
    }
    .sp-bubble-assistant h1 { font-size: 15px; }
    .sp-bubble-assistant h2 { font-size: 14px; }
    .sp-bubble-assistant h3 { font-size: 13px; }
    .sp-bubble-assistant blockquote {
      border-left: 3px solid var(--agi-ext-accent);
      padding-left: 8px;
      color: var(--agi-ext-text-muted);
      margin: 4px 0;
    }
    .sp-bubble-assistant hr {
      border: none;
      border-top: 1px solid var(--agi-ext-border);
      margin: 6px 0;
    }

    /* ── Cursor blink for streaming ── */
    .sp-cursor::after {
      content: '▋';
      animation: sp-blink 0.7s steps(1) infinite;
      color: var(--agi-ext-accent);
      font-size: 12px;
    }
    @keyframes sp-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }

    /* ── Inline tool-call UI (design-spec §4) ── */
    .tool-call {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 13px;
      color: var(--agi-ext-text-muted);
    }
    .tool-call__bar {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 28px;
      padding: 0 4px;
      cursor: pointer;
      user-select: none;
      border-radius: 5px;
      transition: background 120ms ease;
    }
    .tool-call__bar:hover { background: var(--agi-ext-hover); }
    .tool-call__icon {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      color: var(--agi-ext-text-muted);
      opacity: 0.7;
    }
    .tool-call__icon svg { width: 14px; height: 14px; }
    .tool-call__label { color: var(--agi-ext-text-muted); font-weight: 400; font-size: 12px; }
    .tool-call__summary {
      color: var(--agi-ext-text-muted);
      opacity: 0.7;
      font-size: 11px;
      margin-left: 4px;
      max-width: 260px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tool-call__chevron {
      width: 12px;
      height: 12px;
      color: var(--agi-ext-text-muted);
      opacity: 0.6;
      margin-left: auto;
      transition: transform 160ms ease;
      flex-shrink: 0;
    }
    .tool-call__chevron svg { width: 12px; height: 12px; }
    .tool-call--open .tool-call__chevron { transform: rotate(90deg); }
    .tool-call__body {
      display: none;
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      padding: 10px 12px;
      font-family: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', Consolas, monospace;
      font-size: 11px;
      color: var(--agi-ext-text);
      overflow-x: auto;
      max-height: 320px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .tool-call--open .tool-call__body { display: block; }
    /* multi-step vertical guideline */
    .tool-call-stack {
      border-left: 1px solid var(--agi-ext-border);
      padding-left: 10px;
      margin-left: 6px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    /* spinner rotation for pending/running state */
    .tool-call--running .tool-call__icon { color: var(--agi-ext-text-muted); }
    .tool-call--running .tool-call__icon svg { animation: sp-spin 0.8s linear infinite; }
    @keyframes sp-spin { to { transform: rotate(360deg); } }
    .tool-call--error .tool-call__label { color: var(--agi-ext-danger); }
    .tool-call--error .tool-call__icon { color: var(--agi-ext-danger); }
    .tool-call--success .tool-call__icon { color: var(--agi-ext-success); }

    /* Canonical engine activity — inline, collapsed by default, progressively expandable. */
    .sp-agent-activity {
      width: min(100%, 420px);
      color: var(--agi-ext-text-muted);
      font-size: 12px;
    }
    .sp-agent-activity > summary {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 30px;
      padding: 0 4px;
      cursor: pointer;
      list-style: none;
      user-select: none;
      border-radius: 6px;
    }
    .sp-agent-activity > summary::-webkit-details-marker { display: none; }
    .sp-agent-activity > summary:hover { background: var(--agi-ext-hover); }
    .sp-agent-activity__chevron {
      margin-left: auto;
      transition: transform 160ms ease;
    }
    .sp-agent-activity[open] .sp-agent-activity__chevron { transform: rotate(90deg); }
    .sp-agent-activity__timeline {
      border-left: 1px solid var(--agi-ext-border);
      margin: 2px 0 6px 10px;
      padding: 2px 0 2px 12px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .sp-agent-step {
      min-width: 0;
      border-radius: 6px;
    }
    .sp-agent-step > summary,
    .sp-agent-step__row {
      display: flex;
      align-items: center;
      gap: 7px;
      min-height: 28px;
      padding: 0 5px;
      list-style: none;
    }
    .sp-agent-step > summary { cursor: pointer; }
    .sp-agent-step > summary::-webkit-details-marker { display: none; }
    .sp-agent-step > summary:hover { background: var(--agi-ext-hover); }
    .sp-agent-step__icon { flex: 0 0 14px; opacity: 0.78; }
    .sp-agent-step--running .sp-agent-step__icon { animation: sp-spin 0.8s linear infinite; }
    .sp-agent-step--failed .sp-agent-step__icon { color: var(--agi-ext-danger); }
    .sp-agent-step--completed .sp-agent-step__icon { color: var(--agi-ext-success); }
    .sp-agent-step__summary {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sp-agent-step__elapsed { font-size: 10px; opacity: 0.65; }
    .sp-agent-step__detail {
      margin: 0 5px 6px 26px;
      padding: 8px;
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      background: var(--agi-ext-bg);
      color: var(--agi-ext-text-muted);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: 260px;
      overflow-y: auto;
    }
    .sp-agent-step__sources { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
    .sp-agent-source {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      max-width: 100%;
      padding: 3px 7px;
      border: 1px solid var(--agi-ext-border);
      border-radius: 999px;
      color: var(--agi-ext-text-muted);
      text-decoration: none;
      background: var(--agi-ext-surface);
    }
    .sp-agent-source:hover { color: var(--agi-ext-text); border-color: var(--agi-ext-focus); }
    .sp-agent-artifact-link {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      margin-top: 8px;
      color: var(--agi-ext-accent);
      font-weight: 600;
      text-decoration: none;
      white-space: normal;
    }
    .sp-agent-artifact-link:hover { text-decoration: underline; }
    .sp-agent-artifact-unavailable {
      margin-top: 8px;
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      white-space: normal;
    }
    .sp-agent-approval {
      display: flex;
      flex-direction: column;
      gap: 7px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--agi-ext-border);
      white-space: normal;
    }
    .sp-agent-approval__summary { color: var(--agi-ext-text); line-height: 1.4; }
    .sp-agent-approval__recorded { color: var(--agi-ext-accent); font-size: 10px; }
    .sp-agent-approval__error { color: var(--agi-ext-danger); font-size: 10px; }
    .sp-agent-approval__actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .sp-agent-approval__button {
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text);
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      padding: 4px 9px;
    }
    .sp-agent-approval__button:hover { background: var(--agi-ext-hover); }
    .sp-agent-approval__button--approve {
      border-color: var(--agi-ext-accent);
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
    }
    .sp-agent-approval__button:focus-visible {
      outline: 2px solid var(--agi-ext-focus);
      outline-offset: 2px;
    }

    /* ── Thinking dots ── */
    .sp-thinking {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 12px;
      border-bottom-left-radius: 3px;
    }
    .sp-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--agi-ext-accent);
      animation: sp-bounce 1.2s infinite;
    }
    .sp-dot:nth-child(2) { animation-delay: 0.2s; }
    .sp-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes sp-bounce {
      0%, 100% { transform: translateY(0); opacity: 0.4; }
      50% { transform: translateY(-4px); opacity: 1; }
    }

    /* ── Context / voice toolbar ── */
    #sp-toolbar {
      /* Founder decision 2026-06-14: keep the primary surface pure chat.
         Capture, grouping, shortcuts, and tools remain available in the
         settings drawer instead of competing with the composer. */
      display: none;
      gap: 6px;
      padding: 6px 10px 0;
      flex-shrink: 0;
    }
    .sp-tool-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      padding: 4px 9px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .sp-tool-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    .sp-tool-btn.active { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 15%, transparent); }
    .sp-tool-btn.has-context { color: var(--agi-ext-success); border-color: var(--agi-ext-success-border); background: var(--agi-ext-success-bg); }

    /* ── Mic pulsing indicator ── */
    .sp-mic-pulse {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--agi-ext-danger);
      animation: sp-pulse 1s infinite;
    }
    @keyframes sp-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.4); opacity: 0.6; }
    }

    /* ── Shortcuts dropdown ── */
    .sp-shortcuts-wrapper { position: relative; }
    #sp-shortcuts-dropdown {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 0;
      margin-bottom: 4px;
      min-width: 240px;
      max-height: 260px;
      overflow-y: auto;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 8px;
      padding: 4px;
      z-index: 100;
      box-shadow: var(--agi-ext-shadow-panel);
    }
    #sp-shortcuts-dropdown.open { display: block; }
    .sp-shortcut-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.12s;
    }
    .sp-shortcut-item:hover { background: var(--agi-ext-hover); }
    .sp-shortcut-name { font-size: 12px; color: var(--agi-ext-text); flex: 1; }
    .sp-shortcut-actions {
      display: flex;
      gap: 4px;
    }
    .sp-shortcut-action-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 12px;
      padding: 2px 4px;
      border-radius: 3px;
      transition: background 0.12s;
    }
    .sp-shortcut-action-btn:hover { background: var(--agi-ext-overlay); }
    .sp-shortcuts-status {
      padding: 6px 10px;
      font-size: 11px;
      line-height: 1.4;
      border-top: 1px solid var(--agi-ext-border);
    }
    .sp-shortcuts-status[data-kind='error'] { color: var(--agi-ext-danger); }
    .sp-shortcuts-status[data-kind='success'] { color: var(--agi-ext-success); }
    .sp-shortcuts-status:empty { display: none; }

    .sp-shortcuts-empty {
      padding: 10px 8px;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      text-align: center;
    }
    .sp-save-shortcut-row {
      display: flex;
      gap: 4px;
      padding: 6px 4px 4px;
      border-top: 1px solid var(--agi-ext-border);
    }
    .sp-save-shortcut-input {
      flex: 1;
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: 4px;
      color: var(--agi-ext-text);
      font-size: 11px;
      padding: 4px 6px;
      outline: none;
    }
    .sp-save-shortcut-input:focus { border-color: var(--agi-ext-focus); }
    .sp-save-shortcut-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-save-shortcut-btn {
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      border: none;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      white-space: nowrap;
    }
    .sp-save-shortcut-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); }
    .sp-save-shortcut-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

    /* ── AI Tools dropdown ── */
    .sp-tools-wrapper {
      position: relative;
    }
    #sp-tools-dropdown {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 0;
      margin-bottom: 4px;
      min-width: 220px;
      max-height: 240px;
      overflow-y: auto;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 8px;
      padding: 4px;
      z-index: 100;
      box-shadow: var(--agi-ext-shadow-panel);
    }
    #sp-tools-dropdown.open { display: block; }
    #sp-tools-dropdown::-webkit-scrollbar { width: 4px; }
    #sp-tools-dropdown::-webkit-scrollbar-track { background: transparent; }
    #sp-tools-dropdown::-webkit-scrollbar-thumb { background: var(--agi-ext-border); border-radius: 4px; }
    .sp-tools-empty {
      padding: 10px 8px;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      text-align: center;
    }
    .sp-tool-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px 8px;
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.12s;
    }
    .sp-tool-item:hover { background: var(--agi-ext-hover); }
    .sp-tool-item-name {
      font-size: 12px;
      color: var(--agi-ext-text);
      font-weight: 500;
    }
    .sp-tool-item-desc {
      font-size: 10px;
      color: var(--agi-ext-text-muted);
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    /* ── Input row (composer §7) ── */
    #sp-input-area {
      padding: 6px 10px 8px;
      border-top: 1px solid var(--agi-ext-border);
      flex-shrink: 0;
    }
    #sp-cloud-gate {
      display: none;
      align-items: center;
      gap: 10px;
      margin: 0 0 6px;
      padding: 9px 10px;
      border: 1px solid var(--agi-ext-border);
      border-radius: 10px;
      background: var(--agi-ext-surface);
    }
    #sp-cloud-gate.visible { display: flex; }
    #sp-cloud-gate-copy {
      flex: 1;
      min-width: 0;
    }
    #sp-cloud-gate-title {
      color: var(--agi-ext-text);
      font-size: 11px;
      font-weight: 600;
      line-height: 1.3;
    }
    #sp-cloud-gate-message {
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      line-height: 1.4;
      margin-top: 2px;
    }
    #sp-cloud-gate-action {
      flex-shrink: 0;
      border: 0;
      border-radius: 7px;
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      cursor: pointer;
      font: inherit;
      font-size: 10px;
      font-weight: 600;
      padding: 6px 9px;
    }
    #sp-cloud-gate-action:hover { opacity: 0.88; }
    #sp-cloud-gate-action:disabled { cursor: wait; opacity: 0.6; }
    /* outer composer shell */
    #sp-composer-shell {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 18px;
      min-height: 106px;
      padding: 10px 10px 7px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    #sp-composer-shell:focus-within {
      border-color: color-mix(in srgb, var(--agi-ext-accent) 50%, transparent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--agi-ext-accent) 18%, transparent);
    }
    #sp-composer-shell.dragover {
      border-color: color-mix(in srgb, var(--agi-ext-accent) 80%, transparent);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--agi-ext-accent) 35%, transparent);
    }
    #sp-input-row {
      display: flex;
      gap: 6px;
      align-items: flex-end;
    }
    #sp-input {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--agi-ext-text);
      font-size: 14px;
      padding: 3px 4px;
      resize: none;
      outline: none;
      font-family: inherit;
      line-height: 1.5;
      max-height: 120px;
      min-height: 52px;
      overflow-y: auto;
    }
    #sp-input::placeholder { color: var(--agi-ext-text-muted); opacity: 0.78; }
    /* Slash-command autocomplete. Anchored above the composer because the panel
       is short and a downward menu would fall outside the viewport. */
    #sp-slash-menu {
      display: none;
      flex-direction: column;
      gap: 1px;
      margin-bottom: 6px;
      padding: 4px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 10px;
      box-shadow: var(--agi-ext-modal-shadow);
      max-height: 214px;
      overflow-y: auto;
    }
    #sp-slash-menu.visible { display: flex; }
    .sp-slash-item {
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: 7px 9px;
      border-radius: 7px;
      cursor: pointer;
      border: none;
      background: transparent;
      text-align: left;
      font-family: inherit;
    }
    .sp-slash-item:hover, .sp-slash-item.active { background: var(--agi-ext-hover); }
    .sp-slash-item.active { outline: 1px solid var(--agi-ext-focus); outline-offset: -1px; }
    .sp-slash-name { color: var(--agi-ext-text); font-size: 13px; font-weight: 600; }
    .sp-slash-hint { color: var(--agi-ext-text-muted); font-size: 11.5px; line-height: 1.35; }
    #sp-send-btn {
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      border: none;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s, transform 0.1s;
    }
    #sp-send-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); transform: scale(1.05); }
    #sp-send-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    #sp-send-btn:disabled { background: var(--agi-ext-overlay); color: var(--agi-ext-border-strong); cursor: not-allowed; transform: none; }
    #sp-send-btn[data-mode="stop"] { background: var(--agi-ext-danger); }
    #sp-send-btn[data-mode="stop"]:hover { background: color-mix(in srgb, var(--agi-ext-danger) 80%, black); }

    /* ── Attachment + button and menu ── */
    .sp-attach-wrapper { position: relative; flex-shrink: 0; }
    .sp-attach-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: var(--agi-ext-text-muted);
      font-size: 18px;
      font-weight: 300;
      line-height: 1;
      cursor: pointer;
      flex-shrink: 0;
      transition: color 0.15s, background 0.15s;
    }
    .sp-attach-btn:hover { color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    #sp-attach-menu {
      display: none;
      position: absolute;
      bottom: calc(100% + 6px);
      left: 0;
      min-width: 190px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 8px;
      padding: 4px;
      z-index: 150;
      box-shadow: var(--agi-ext-shadow-panel);
    }
    #sp-attach-menu.open { display: block; }
    .sp-attach-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 12px;
      color: var(--agi-ext-text-muted);
      transition: background 0.12s, color 0.12s;
      user-select: none;
      width: 100%;
      border: 0;
      background: transparent;
      font-family: inherit;
      text-align: left;
    }
    .sp-attach-menu-item:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-attach-icon { font-size: 14px; flex-shrink: 0; }
    .sp-attach-file-input { display: none; }

    /* ── Attachment preview bar ── */
    #sp-attachment-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 4px 2px 6px;
    }
    .sp-attachment-chip {
      position: relative;
      display: inline-flex;
      border-radius: 6px;
      overflow: visible;
      border: 1px solid var(--agi-ext-border);
    }
    .sp-attachment-thumb {
      width: 48px;
      height: 48px;
      object-fit: cover;
      border-radius: 5px;
      display: block;
    }
    .sp-attachment-remove {
      position: absolute;
      top: -6px;
      right: -6px;
      width: 16px;
      height: 16px;
      background: var(--agi-ext-hover);
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: 50%;
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: background 0.12s, color 0.12s;
    }
    .sp-attachment-remove:hover { background: var(--agi-ext-danger-bg); color: var(--agi-ext-danger); border-color: var(--agi-ext-danger-border); }
    .sp-attachment-notice {
      flex: 1 1 100%;
      color: var(--agi-ext-danger);
      font-size: 11px;
      line-height: 1.4;
    }

    /* ── Composer bottom bar: persistent page-context chip ── */
    #sp-composer-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 2px 0;
      /* The Quick toggle beside the chip is flex-shrink:0, so without a bound
         here a long hostname pushed it off a ~320px side panel. */
      min-width: 0;
      overflow: hidden;
    }
    .sp-context-chip {
      /*
       * inline-block, NOT inline-flex. The chip's text is written straight onto
       * the element (contextBtn.textContent = hostname), and text-overflow does
       * not apply to the anonymous text of a flex container — so a long hostname
       * was hard-clipped mid-character instead of ellipsising. Nothing else is
       * ever appended here, so there is no flex layout to preserve.
       * flex-shrink lets it yield to the Quick toggle beside it rather than
       * pushing that control off the panel.
       */
      display: inline-block;
      vertical-align: middle;
      background: var(--agi-ext-overlay);
      border: 1px solid var(--agi-ext-border);
      border-radius: 12px;
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      font-weight: 500;
      padding: 2px 9px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
      white-space: nowrap;
      min-width: 0;
      flex-shrink: 1;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sp-context-chip::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--agi-ext-border-strong);
      flex-shrink: 0;
      transition: background 0.15s;
    }
    .sp-context-chip.has-context {
      color: var(--agi-ext-success);
      border-color: var(--agi-ext-success-border);
      background: var(--agi-ext-success-bg);
    }
    .sp-context-chip.has-context::before { background: var(--agi-ext-success); }
    .sp-context-chip:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    .sp-context-chip:hover::before { background: var(--agi-ext-accent); }
    .sp-context-chip.loading { opacity: 0.6; cursor: wait; }

    /* Autonomy chip (EXT-11). Reads the same agi_cu_ask_before_acting pref the
       background's authoritative gate reads — it reports that gate, it does not
       own it. Amber for the permissive state, matching how the reference
       products surface a permission mode: the risky setting is the one that
       gets the warning colour, not the safe one. */
    .sp-autonomy-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 22px;
      padding: 0 8px;
      font-size: 11px;
      font-weight: 600;
      border-radius: 999px;
      cursor: pointer;
      white-space: nowrap;
      background: var(--agi-ext-success-bg);
      border: 1px solid var(--agi-ext-success-border);
      color: var(--agi-ext-success);
    }
    .sp-autonomy-chip[data-mode='full'] {
      background: var(--agi-ext-warning-bg);
      border-color: var(--agi-ext-warning-border);
      color: var(--agi-ext-warning);
    }
    .sp-autonomy-chip:hover { filter: brightness(1.12); }
    .sp-autonomy-chip .agi-icon { flex-shrink: 0; }

    /* W5-06: quick mode toggle */
    #sp-quick-mode-toggle {
      display: inline-flex;
      align-items: center;
      background: var(--agi-ext-overlay);
      border: 1px solid var(--agi-ext-border);
      border-radius: 12px;
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      font-weight: 500;
      padding: 2px 8px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
      white-space: nowrap;
      flex-shrink: 0;
      user-select: none;
    }
    #sp-quick-mode-toggle:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); }
    #sp-quick-mode-toggle.sp-quick-mode-active {
      color: var(--agi-ext-accent);
      border-color: var(--agi-ext-accent);
      background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
    }
    #sp-quick-mode-toggle:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

    /* Catalog-driven reasoning effort. The popover opens upward so it remains
       usable in the short side-panel composer. */
    #sp-effort-control {
      position: relative;
      margin-left: auto;
      flex-shrink: 0;
    }
    #sp-effort-btn {
      display: inline-flex;
      align-items: center;
      height: 22px;
      padding: 0 8px;
      border: 1px solid var(--agi-ext-border);
      border-radius: 12px;
      background: var(--agi-ext-overlay);
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
    }
    #sp-effort-btn:hover,
    #sp-effort-btn[aria-expanded='true'] {
      color: var(--agi-ext-accent);
      border-color: var(--agi-ext-accent);
    }
    #sp-effort-btn[data-disabled='true'] { opacity: 0.72; }
    #sp-effort-popover {
      position: absolute;
      right: 0;
      bottom: calc(100% + 7px);
      z-index: 80;
      display: none;
      width: min(250px, calc(100vw - 24px));
      padding: 11px;
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: 10px;
      background: var(--agi-ext-surface);
      box-shadow: 0 10px 30px var(--agi-ext-modal-shadow);
    }
    #sp-effort-popover.open { display: block; }
    .sp-effort-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 9px;
      font-size: 11px;
      font-weight: 600;
      color: var(--agi-ext-text);
    }
    #sp-effort-value { color: var(--agi-ext-accent); }
    #sp-effort-slider { width: 100%; accent-color: var(--agi-ext-accent); cursor: pointer; }
    #sp-effort-slider:disabled { cursor: not-allowed; opacity: 0.45; }
    #sp-effort-scale {
      display: flex;
      justify-content: space-between;
      gap: 5px;
      margin-top: 4px;
      color: var(--agi-ext-text-muted);
      font-size: 9px;
    }
    #sp-effort-description {
      margin-top: 8px;
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      line-height: 1.35;
    }

    /* ── Offline onboarding screen (BLOCKER-02b) ── */
    #sp-offline-onboarding {
      display: none;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      text-align: center;
      padding: 32px 20px;
    }
    #sp-offline-onboarding.visible { display: flex; }
    #sp-offline-onboarding-icon {
      width: 48px;
      height: 48px;
      opacity: 0.5;
    }
    #sp-offline-onboarding-title { font-size: 14px; font-weight: 600; color: var(--agi-ext-text); }
    #sp-offline-onboarding-desc { font-size: 12px; color: var(--agi-ext-text-muted); line-height: 1.55; max-width: 220px; }
    #sp-offline-onboarding-cta {
      font-size: 12px;
      padding: 6px 14px;
      border-radius: 8px;
      border: 1px solid var(--agi-ext-accent);
      background: transparent;
      color: var(--agi-ext-accent);
      cursor: pointer;
      transition: background 0.12s;
    }
    #sp-offline-onboarding-cta:hover { background: color-mix(in srgb, var(--agi-ext-accent) 10%, transparent); }

    /* ── Settings bar (Phase 3: removed — bridge URL now in drawer) ── */

    /* ── Auth bar ── */
    #sp-auth-bar {
      /* Native Desktop pairing is optional for Managed Cloud chat and lives
         in the settings drawer. A red top-level "Offline" strip made the
         healthy public chat surface look unavailable. */
      display: none;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: var(--agi-ext-bg);
      border-bottom: 1px solid var(--agi-ext-border);
      flex-shrink: 0;
    }
    #sp-auth-input {
      flex: 1;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      color: var(--agi-ext-text);
      font-size: 11px;
      padding: 5px 9px;
      outline: none;
      font-family: inherit;
      transition: border-color 0.15s;
      min-width: 0;
    }
    #sp-auth-input:focus { border-color: var(--agi-ext-focus); }
    #sp-auth-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    #sp-auth-input::placeholder { color: var(--agi-ext-text-muted); opacity: 0.6; }
    #sp-auth-save-btn {
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      border: none;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 11px;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s;
      white-space: nowrap;
    }
    #sp-auth-save-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); }
    #sp-auth-save-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

    /* ── Connection status pill ── */
    #sp-status-pill {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      border-radius: 10px;
      padding: 3px 8px;
      flex-shrink: 0;
      font-weight: 500;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }
    #sp-status-pill.connected {
      background: var(--agi-ext-success-bg);
      color: var(--agi-ext-success);
      border: 1px solid var(--agi-ext-success-border);
    }
    #sp-status-pill.disconnected {
      background: var(--agi-ext-danger-bg);
      color: var(--agi-ext-danger);
      border: 1px solid var(--agi-ext-danger-border);
    }
    .sp-status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    #sp-status-pill.connected .sp-status-dot { background: var(--agi-ext-success); }
    #sp-status-pill.disconnected .sp-status-dot { background: var(--agi-ext-danger); }
    #sp-status-pill.cloud {
      background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
      color: var(--agi-ext-accent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent);
    }
    #sp-status-pill.cloud .sp-status-dot { background: var(--agi-ext-accent); }

    /* ── Bridge-offline notice (shown above composer when desktop not connected) ── */
    #sp-bridge-notice {
      display: none;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: color-mix(in srgb, var(--agi-ext-danger) 8%, transparent);
      border-top: 1px solid var(--agi-ext-danger-border);
      font-size: 11px;
      color: var(--agi-ext-danger);
      flex-shrink: 0;
    }
    #sp-bridge-notice.visible { display: flex; }
    #sp-bridge-notice-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--agi-ext-danger);
      flex-shrink: 0;
    }
    #sp-bridge-notice-text { flex: 1; line-height: 1.4; }
    #sp-bridge-notice-reconnect {
      background: none;
      border: 1px solid var(--agi-ext-danger-border);
      color: var(--agi-ext-danger);
      border-radius: 5px;
      padding: 2px 8px;
      font-size: 10px;
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      transition: background 0.12s;
    }
    #sp-bridge-notice-reconnect:hover {
      background: color-mix(in srgb, var(--agi-ext-danger) 12%, transparent);
    }
    /* Model picker dims when bridge is offline — selection is persisted but has no
       immediate effect until the desktop bridge is connected. */
    .sp-model-selector-wrap.bridge-offline #sp-model-selector-btn {
      opacity: 0.45;
      cursor: default;
      pointer-events: none;
    }

    /* ── Tab bar ── */
    #sp-tab-bar {
      display: flex;
      background: var(--agi-ext-surface);
      border-bottom: 1px solid var(--agi-ext-border);
      flex-shrink: 0;
    }
    .sp-tab {
      flex: 1;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--agi-ext-text-muted);
      font-size: 12px;
      font-weight: 500;
      padding: 9px 0;
      cursor: pointer;
      letter-spacing: 0.02em;
      transition: color 0.15s, border-color 0.15s;
    }
    .sp-tab:hover { color: var(--agi-ext-text); }
    .sp-tab.sp-tab-active { color: var(--agi-ext-accent); border-bottom-color: var(--agi-ext-accent); }
    #sp-chat-panel { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    #sp-chat-panel.sp-tab-hidden { display: none; }
    #sp-workflows { display: none; flex: 1; overflow-y: auto; padding: 12px 10px; flex-direction: column; gap: 16px; }
    #sp-workflows.sp-tab-visible { display: flex; }
    #sp-workflows::-webkit-scrollbar { width: 4px; }
    #sp-workflows::-webkit-scrollbar-track { background: transparent; }
    #sp-workflows::-webkit-scrollbar-thumb { background: var(--agi-ext-border); border-radius: 4px; }
    .sp-wf-section { background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .sp-wf-section-header { display: flex; align-items: center; justify-content: space-between; }
    .sp-wf-section-title { font-size: 11px; font-weight: 600; color: var(--agi-ext-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .sp-wf-empty { color: var(--agi-ext-text-muted); font-size: 11px; line-height: 1.55; padding: 4px 0; }
    .sp-wf-shortcuts-list { display: flex; flex-direction: column; gap: 6px; }
    .sp-wf-shortcut-item { display: flex; align-items: center; gap: 8px; padding: 7px 9px; background: var(--agi-ext-bg); border: 1px solid var(--agi-ext-border); border-radius: 7px; }
    .sp-wf-shortcut-icon { font-size: 14px; flex-shrink: 0; }
    .sp-wf-shortcut-info { flex: 1; min-width: 0; }
    .sp-wf-shortcut-name { font-size: 12px; font-weight: 500; color: var(--agi-ext-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sp-wf-shortcut-meta { font-size: 10px; color: var(--agi-ext-text-muted); margin-top: 1px; }
    .sp-wf-shortcut-btns { display: flex; gap: 4px; flex-shrink: 0; }
    .sp-wf-btn-replay { background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); color: var(--agi-ext-accent); font-size: 11px; padding: 3px 9px; border-radius: 5px; cursor: pointer; transition: background 0.12s; }
    .sp-wf-btn-replay:hover { background: color-mix(in srgb, var(--agi-ext-accent) 22%, transparent); }
    .sp-wf-btn-delete { background: none; border: 1px solid var(--agi-ext-border); color: var(--agi-ext-text-muted); font-size: 11px; padding: 3px 7px; border-radius: 5px; cursor: pointer; transition: color 0.12s, border-color 0.12s; }
    .sp-wf-btn-delete:hover { color: var(--agi-ext-danger); border-color: var(--agi-ext-danger-border); }
    .sp-wf-tasks-list { display: flex; flex-direction: column; gap: 6px; }
    .sp-wf-task-item { display: flex; align-items: center; gap: 8px; padding: 7px 9px; background: var(--agi-ext-bg); border: 1px solid var(--agi-ext-border); border-radius: 7px; }
    .sp-wf-task-info { flex: 1; min-width: 0; }
    .sp-wf-task-name { font-size: 12px; font-weight: 500; color: var(--agi-ext-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sp-wf-task-schedule-badge { display: inline-block; font-size: 9px; color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); border-radius: 3px; padding: 1px 5px; margin-top: 2px; }
    .sp-wf-task-toggle { appearance: none; width: 30px; height: 16px; border-radius: 8px; background: var(--agi-ext-hover); position: relative; cursor: pointer; transition: background 0.2s; flex-shrink: 0; }
    .sp-wf-task-toggle:checked { background: var(--agi-ext-accent); }
    .sp-wf-task-toggle::after { content: ''; position: absolute; width: 12px; height: 12px; border-radius: 50%; background: white; top: 2px; left: 2px; transition: transform 0.2s; }
    .sp-wf-task-toggle:checked::after { transform: translateX(14px); }
    .sp-wf-task-delete { background: none; border: 1px solid var(--agi-ext-border); color: var(--agi-ext-text-muted); font-size: 11px; padding: 3px 7px; border-radius: 5px; cursor: pointer; transition: color 0.12s, border-color 0.12s; }
    .sp-wf-task-delete:hover { color: var(--agi-ext-danger); border-color: var(--agi-ext-danger-border); }
    .sp-wf-task-result { background: none; border: 1px solid var(--agi-ext-border); color: var(--agi-ext-text-muted); font-size: 11px; padding: 3px 7px; border-radius: 5px; cursor: pointer; transition: color 0.12s, border-color 0.12s; }
    .sp-wf-task-result:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-focus); }
    .sp-wf-new-task-btn { background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); color: var(--agi-ext-accent); font-size: 11px; padding: 4px 10px; border-radius: 5px; cursor: pointer; transition: background 0.12s; }
    .sp-wf-new-task-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 22%, transparent); }
    .sp-wf-new-task-form { display: none; flex-direction: column; gap: 7px; padding: 10px; background: var(--agi-ext-bg); border: 1px solid var(--agi-ext-border); border-radius: 7px; }
    .sp-wf-new-task-form.open { display: flex; }
    .sp-wf-form-label { font-size: 10px; color: var(--agi-ext-text-muted); margin-bottom: 1px; }
    .sp-wf-form-input { background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: 5px; color: var(--agi-ext-text); font-size: 12px; padding: 5px 8px; outline: none; font-family: inherit; transition: border-color 0.15s; width: 100%; }
    .sp-wf-form-input:focus { border-color: var(--agi-ext-focus); }
    .sp-wf-form-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-wf-form-input::placeholder { color: var(--agi-ext-text-muted); opacity: 0.6; }
    .sp-wf-form-select { background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: 5px; color: var(--agi-ext-text); font-size: 12px; padding: 5px 8px; outline: none; font-family: inherit; width: 100%; }
    .sp-wf-form-select:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-wf-form-save-btn { background: var(--agi-ext-accent); color: var(--agi-ext-on-accent); border: none; border-radius: 5px; padding: 6px 14px; font-size: 12px; cursor: pointer; align-self: flex-end; transition: background 0.12s; }
    .sp-wf-form-save-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); }
    .sp-wf-form-save-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-wf-form-save-btn:disabled { cursor: wait; opacity: 0.6; }
    .sp-wf-form-cancel-btn { background: none; border: 1px solid var(--agi-ext-border); color: var(--agi-ext-text-muted); border-radius: 5px; padding: 6px 10px; font-size: 12px; cursor: pointer; align-self: flex-end; transition: color 0.12s; }
    .sp-wf-form-cancel-btn:hover { color: var(--agi-ext-text); }
    .sp-wf-form-actions { display: flex; gap: 6px; justify-content: flex-end; }
    .sp-wf-form-error { min-height: 15px; color: var(--agi-ext-danger); font-size: 11px; line-height: 1.35; }
    .sp-wf-create-shortcut-btn { background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); color: var(--agi-ext-accent); font-size: 11px; padding: 4px 10px; border-radius: 5px; cursor: pointer; transition: background 0.12s; }
    .sp-wf-create-shortcut-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 22%, transparent); }
    .sp-create-shortcut-overlay { display: none; position: fixed; inset: 0; background: var(--agi-ext-scrim); z-index: 9999; align-items: center; justify-content: center; }
    .sp-create-shortcut-overlay.open { display: flex; }
    .sp-create-shortcut-modal { background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: 10px; padding: 18px 18px 14px; width: 290px; max-width: 95vw; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 8px 32px var(--agi-ext-modal-shadow); }
    .sp-create-shortcut-header { display: flex; align-items: center; justify-content: space-between; }
    .sp-create-shortcut-title { font-size: 13px; font-weight: 600; color: var(--agi-ext-text); }
    .sp-create-shortcut-close { background: none; border: none; color: var(--agi-ext-text-muted); font-size: 16px; cursor: pointer; padding: 0 2px; line-height: 1; transition: color 0.12s; }
    .sp-create-shortcut-close:hover { color: var(--agi-ext-text); }
    .sp-create-shortcut-field { display: flex; flex-direction: column; gap: 4px; }
    .sp-create-shortcut-label { font-size: 10px; font-weight: 600; color: var(--agi-ext-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .sp-create-shortcut-input { background: var(--agi-ext-bg); border: 1px solid var(--agi-ext-border); border-radius: 5px; color: var(--agi-ext-text); font-size: 12px; padding: 6px 9px; outline: none; font-family: inherit; transition: border-color 0.15s; width: 100%; box-sizing: border-box; }
    .sp-create-shortcut-input:focus { border-color: var(--agi-ext-focus); }
    .sp-create-shortcut-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-create-shortcut-input::placeholder { color: var(--agi-ext-text-muted); opacity: 0.6; }
    .sp-create-shortcut-textarea { background: var(--agi-ext-bg); border: 1px solid var(--agi-ext-border); border-radius: 5px; color: var(--agi-ext-text); font-size: 12px; padding: 6px 9px; outline: none; font-family: inherit; transition: border-color 0.15s; width: 100%; box-sizing: border-box; resize: none; height: 70px; line-height: 1.4; }
    .sp-create-shortcut-textarea:focus { border-color: var(--agi-ext-focus); }
    .sp-create-shortcut-textarea:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-create-shortcut-textarea::placeholder { color: var(--agi-ext-text-muted); opacity: 0.6; }
    .sp-create-shortcut-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 2px; }
    .sp-create-shortcut-cancel { background: none; border: 1px solid var(--agi-ext-border); color: var(--agi-ext-text-muted); border-radius: 5px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: color 0.12s; }
    .sp-create-shortcut-cancel:hover { color: var(--agi-ext-text); }
    .sp-create-shortcut-save { background: var(--agi-ext-accent); color: var(--agi-ext-on-accent); border: none; border-radius: 5px; padding: 6px 14px; font-size: 12px; cursor: pointer; transition: background 0.12s; }
    .sp-create-shortcut-save:hover { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); }
    .sp-create-shortcut-save:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-wf-group-desc { font-size: 11px; color: var(--agi-ext-text-muted); line-height: 1.55; }
    .sp-wf-group-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .sp-wf-group-action-btn { display: flex; align-items: center; gap: 5px; background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: 6px; color: var(--agi-ext-text-muted); font-size: 11px; padding: 5px 11px; cursor: pointer; transition: color 0.15s, border-color 0.15s, background 0.15s; }
    .sp-wf-group-action-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    .sp-wf-group-action-btn.active { color: var(--agi-ext-success); border-color: var(--agi-ext-success-border); background: var(--agi-ext-success-bg); }
    .sp-wf-record-bar { display: flex; align-items: center; gap: 8px; }
    .sp-wf-record-btn { display: flex; align-items: center; gap: 6px; background: var(--agi-ext-danger); border: none; color: white; font-size: 12px; font-weight: 600; padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: background 0.15s, transform 0.1s; flex-shrink: 0; }
    .sp-wf-record-btn:hover { background: color-mix(in srgb, var(--agi-ext-danger) 85%, black); transform: scale(1.02); }
    .sp-wf-record-btn.recording { background: var(--agi-ext-danger-bg); border: 1px solid var(--agi-ext-danger); animation: sp-record-pulse 1.5s infinite; }
    .sp-wf-record-btn.recording:hover { background: var(--agi-ext-danger-bg); }
    @keyframes sp-record-pulse { 0%, 100% { box-shadow: 0 0 0 0 var(--agi-ext-transparent-shadow); } 50% { box-shadow: 0 0 0 6px var(--agi-ext-transparent-shadow); } }
    .sp-wf-record-dot { width: 8px; height: 8px; border-radius: 50%; background: white; flex-shrink: 0; }
    .sp-wf-record-btn.recording .sp-wf-record-dot { background: var(--agi-ext-danger); animation: sp-pulse 1s infinite; }
    .sp-wf-action-counter { font-size: 11px; color: var(--agi-ext-text-muted); flex: 1; }
    .sp-wf-action-counter strong { color: var(--agi-ext-text); }
    .sp-wf-capture-values { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 11px; color: var(--agi-ext-text-muted); cursor: pointer; }
    .sp-wf-capture-values input { cursor: pointer; }
    .sp-wf-save-dialog { display: none; flex-direction: column; gap: 6px; padding: 10px; background: var(--agi-ext-bg); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); border-radius: 8px; }
    .sp-wf-save-dialog.open { display: flex; }
    .sp-wf-save-dialog-title { font-size: 12px; font-weight: 600; color: var(--agi-ext-accent); }
    .sp-wf-count-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; font-size: 10px; font-weight: 600; background: color-mix(in srgb, var(--agi-ext-accent) 20%, transparent); color: var(--agi-ext-accent); border-radius: 9px; padding: 0 5px; }
    .sp-model-selector-wrap { position: relative; min-width: 0; }
    #sp-model-selector-btn { display: flex; align-items: center; gap: 4px; background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); border-radius: 5px; padding: 3px 8px; color: var(--agi-ext-accent); font-size: 10px; font-weight: 500; cursor: pointer; transition: background 0.12s, border-color 0.12s; white-space: nowrap; min-width: 0; max-width: 100%; overflow: hidden; }
    #sp-model-selector-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 22%, transparent); border-color: var(--agi-ext-accent); }
    #sp-model-selector-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    #sp-model-selector-btn .sp-chevron { font-size: 8px; transition: transform 0.15s; flex-shrink: 0; }
    #sp-model-selector-btn.open .sp-chevron { transform: rotate(180deg); }
    #sp-model-dropdown { display: none; position: absolute; top: 100%; left: 0; right: auto; margin-top: 4px; min-width: 200px; max-width: calc(100vw - 24px); max-height: 280px; overflow-y: auto; background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: 8px; padding: 4px; z-index: 200; box-shadow: 0 4px 16px var(--agi-ext-modal-shadow); }
    #sp-model-dropdown.open { display: block; }
    .sp-model-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 9px; border: 0; border-radius: 5px; cursor: pointer; background: transparent; transition: background 0.12s; font: inherit; font-size: 11px; color: var(--agi-ext-text-muted); text-align: left; }
    .sp-model-option:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-model-option.selected { color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); }
    .sp-model-option-check { width: 14px; text-align: center; font-size: 10px; flex-shrink: 0; }
    .sp-model-option-label { flex: 1; }

    /* ── Enhanced model picker ── */
    .sp-model-option-logo {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      flex-shrink: 0;
      object-fit: contain;
      display: block;
    }
    .sp-model-option-logo-placeholder {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      background: var(--agi-ext-hover);
      flex-shrink: 0;
    }
    .sp-model-option-text {
      display: flex;
      flex-direction: column;
      gap: 1px;
      flex: 1;
      min-width: 0;
    }
    .sp-model-option-name {
      font-size: 11px;
      color: inherit;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sp-model-option-sublabel {
      font-size: 9px;
      color: var(--agi-ext-text-muted);
      white-space: nowrap;
    }
    .sp-model-option.selected .sp-model-option-sublabel { color: var(--agi-ext-accent); opacity: 0.7; }
    .sp-model-option:hover .sp-model-option-sublabel { color: var(--agi-ext-text-muted); }

    /* ── Free-tier model gating: Upgrade badge on premium models ── */
    .sp-model-option.premium-gated { opacity: 0.75; }
    .sp-model-option.premium-gated:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); opacity: 1; cursor: pointer; }
    .sp-model-upgrade-tag {
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #fff;
      background: linear-gradient(90deg, #f59e0b, #f97316);
      border-radius: 3px;
      padding: 1px 5px;
      flex-shrink: 0;
      white-space: nowrap;
    }

    /* "Best (auto)" option — visually distinct row */
    .sp-model-option-auto {
      border-bottom: 1px solid var(--agi-ext-border);
      margin-bottom: 4px;
      padding-bottom: 10px;
    }
    .sp-model-option-auto .sp-model-option-name {
      font-weight: 600;
      color: var(--agi-ext-accent);
    }
    .sp-model-option-auto:hover .sp-model-option-name { color: var(--agi-ext-accent); opacity: 0.85; }
    .sp-model-auto-dot {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--agi-ext-accent), var(--agi-ext-accent-secondary));
      flex-shrink: 0;
    }

    /* Model picker header row with provider-count badge */
    .sp-model-picker-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 9px 4px;
      border-bottom: 1px solid var(--agi-ext-border);
      margin-bottom: 2px;
    }
    .sp-model-picker-title {
      font-size: 9px;
      font-weight: 600;
      color: var(--agi-ext-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .provider-count-badge {
      font-size: 10px;
      color: var(--agi-ext-text-muted);
      background: var(--agi-ext-hover);
      border: 1px solid var(--agi-ext-border);
      border-radius: 10px;
      padding: 1px 7px;
      font-weight: 500;
      white-space: nowrap;
      margin-left: auto;
    }

    /* Provider group header */
    .sp-model-group-header {
      font-size: 9px;
      font-weight: 600;
      color: var(--agi-ext-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 6px 9px 2px;
    }
    .sp-model-group-header:not(:first-child) {
      border-top: 1px solid var(--agi-ext-border);
      margin-top: 4px;
      padding-top: 8px;
    }

    /* Thinking toggle row at bottom of dropdown */
    .sp-thinking-toggle-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 9px 5px;
      border-top: 1px solid var(--agi-ext-border);
      margin-top: 4px;
    }
    .sp-thinking-toggle-label {
      flex: 1;
      font-size: 10px;
      color: var(--agi-ext-text-muted);
      user-select: none;
      cursor: pointer;
    }
    .sp-thinking-toggle-label.active { color: var(--agi-ext-accent); }
    .sp-thinking-toggle {
      appearance: none;
      width: 28px;
      height: 15px;
      border-radius: 8px;
      background: var(--agi-ext-hover);
      position: relative;
      cursor: pointer;
      transition: background 0.2s;
      flex-shrink: 0;
      border: none;
      outline: none;
    }
    .sp-thinking-toggle:checked { background: var(--agi-ext-accent); }
    .sp-thinking-toggle:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-thinking-toggle::after {
      content: '';
      position: absolute;
      width: 11px;
      height: 11px;
      border-radius: 50%;
      background: white;
      top: 2px;
      left: 2px;
      transition: transform 0.2s;
    }
    .sp-thinking-toggle:checked::after { transform: translateX(13px); }

    /* ── History dropdown ── */
    .sp-history-wrapper { position: relative; }
    #sp-history-dropdown {
      display: none;
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      width: 260px;
      max-height: 320px;
      overflow-y: auto;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 8px;
      padding: 4px;
      z-index: 200;
      box-shadow: 0 4px 16px var(--agi-ext-modal-shadow);
    }
    #sp-history-dropdown.open { display: block; }
    #sp-history-dropdown::-webkit-scrollbar { width: 4px; }
    #sp-history-dropdown::-webkit-scrollbar-track { background: transparent; }
    #sp-history-dropdown::-webkit-scrollbar-thumb { background: var(--agi-ext-border); border-radius: 4px; }
    .sp-history-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 8px 4px;
      border-bottom: 1px solid var(--agi-ext-border);
      margin-bottom: 2px;
    }
    .sp-history-title { font-size: 9px; font-weight: 600; color: var(--agi-ext-text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
    .sp-history-empty { padding: 12px 8px; color: var(--agi-ext-text-muted); font-size: 11px; text-align: center; }
    .sp-history-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 7px 8px;
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.12s;
    }
    .sp-history-item:hover { background: var(--agi-ext-hover); }
    .sp-history-item-text { flex: 1; min-width: 0; }
    .sp-history-item-title {
      font-size: 11px;
      color: var(--agi-ext-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sp-history-item-date { font-size: 9px; color: var(--agi-ext-text-muted); margin-top: 1px; }
    .sp-history-item-del {
      background: none;
      border: none;
      color: var(--agi-ext-text-muted);
      font-size: 12px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 3px;
      line-height: 1;
      flex-shrink: 0;
      transition: color 0.12s, background 0.12s;
    }
    .sp-history-item-del:hover { color: var(--agi-ext-danger); background: var(--agi-ext-danger-bg); }

    /* ── Phase 2: Tab bar hidden (Workflows / CU are drawer launchers now) ──
       Hidden on the chat view only. Workflows and Computer Use are entered from
       the drawer but had NO exit: switchTab hides #sp-input-area and #sp-toolbar,
       and this rule hid the one control that could call switchTab('chat'), so the
       panel was a dead end recoverable only by closing and reopening it. The tab
       bar comes back whenever we are off the chat view, so there is always a way
       home. */
    #sp-tab-bar { display: none; }
    #sp-tab-bar.sp-tab-bar-exit { display: flex; }

    /* ── Phase 2: Settings drawer ──────────────────────────────────────────── */
    #sp-drawer-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: var(--agi-ext-scrim);
      z-index: 1000;
    }
    #sp-drawer-overlay.open { display: block; }
    #sp-drawer {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      max-width: 100%;
      background: var(--agi-ext-bg);
      border-left: 1px solid var(--agi-ext-border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: translateX(100%);
      transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 1001;
    }
    #sp-drawer.open { transform: translateX(0); }
    #sp-drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-bottom: 1px solid var(--agi-ext-border);
      flex-shrink: 0;
    }
    #sp-drawer-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--agi-ext-text);
    }
    #sp-drawer-close {
      background: transparent;
      border: none;
      color: var(--agi-ext-text-muted);
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      transition: color 0.12s, background 0.12s;
    }
    #sp-drawer-close:hover { color: var(--agi-ext-text); background: var(--agi-ext-hover); }
    #sp-drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 0 0 8px;
    }
    #sp-drawer-body::-webkit-scrollbar { width: 4px; }
    #sp-drawer-body::-webkit-scrollbar-track { background: transparent; }
    #sp-drawer-body::-webkit-scrollbar-thumb { background: var(--agi-ext-border); border-radius: 4px; }
    /* Drawer sections */
    .sp-drawer-section {
      padding: 12px 14px;
      border-bottom: 1px solid var(--agi-ext-border);
    }
    .sp-drawer-section-title {
      font-size: 9px;
      font-weight: 700;
      color: var(--agi-ext-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 10px;
    }
    /* Launcher buttons (Workflows / Computer Use) */
    .sp-drawer-launcher-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 8px;
      padding: 10px 12px;
      color: var(--agi-ext-text-muted);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
      text-align: left;
      margin-bottom: 6px;
    }
    .sp-drawer-launcher-btn:last-child { margin-bottom: 0; }
    .sp-drawer-launcher-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    .sp-drawer-launcher-icon { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; background: var(--agi-ext-hover); }
    .sp-drawer-launcher-label { flex: 1; }
    .sp-drawer-launcher-desc { font-size: 10px; color: var(--agi-ext-text-muted); margin-top: 1px; font-weight: 400; }
    .sp-drawer-launcher-chevron { font-size: 10px; color: var(--agi-ext-text-muted); flex-shrink: 0; }
    /* Tools row */
    .sp-drawer-tools-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .sp-drawer-tool-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 7px;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      padding: 6px 11px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
      flex-shrink: 0;
    }
    .sp-drawer-tool-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    .sp-drawer-tool-btn.active { color: var(--agi-ext-success); border-color: var(--agi-ext-success-border); background: var(--agi-ext-success-bg); }
    /* History sub-list inside the drawer.
       CSP note (style-src 'self'): these rules used to be applied via
       element.style.cssText at runtime, which Chrome blocks on extension
       pages with a strict style-src — keep them here in the stylesheet. */
    #sp-drawer-history-list {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    #sp-drawer-history-list[hidden] { display: none; }
    #sp-drawer-history-search {
      width: 100%;
      margin-top: 7px;
      padding: 7px 9px;
      border: 1px solid var(--agi-ext-border);
      border-radius: 7px;
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text);
      font: inherit;
      font-size: 11px;
    }
    #sp-drawer-history-search::placeholder { color: var(--agi-ext-text-muted); }
    #sp-drawer-history-search:focus {
      border-color: var(--agi-ext-accent);
      outline: 2px solid color-mix(in srgb, var(--agi-ext-focus) 45%, transparent);
      outline-offset: 1px;
    }
    #sp-drawer-history-search[hidden] { display: none; }
    .sp-drawer-history-empty { font-size: 11px; color: var(--agi-ext-text-muted); padding: 4px 2px; }
    .sp-drawer-history-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border-radius: 5px;
      cursor: pointer;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      /* Button reset — the element is a <button> for keyboard access, so undo
         the UA defaults that would otherwise centre and re-font the row. */
      width: 100%;
      text-align: left;
      font: inherit;
      color: inherit;
    }
    .sp-drawer-history-text { flex: 1; min-width: 0; }
    .sp-drawer-history-title {
      font-size: 11px;
      color: var(--agi-ext-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sp-drawer-history-date { font-size: 9px; color: var(--agi-ext-text-muted); margin-top: 1px; }
    .sp-drawer-history-delete {
      background: none;
      border: none;
      color: var(--agi-ext-text-muted);
      font-size: 12px;
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 3px;
      line-height: 1;
      flex-shrink: 0;
    }
    /* Connection / pairing */
    .sp-drawer-pairing-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .sp-drawer-pairing-label { font-size: 12px; color: var(--agi-ext-text-muted); }
    .sp-drawer-pairing-fingerprint {
      font-size: 10px;
      font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
      color: var(--agi-ext-success);
      background: var(--agi-ext-success-bg);
      border: 1px solid var(--agi-ext-success-border);
      border-radius: 4px;
      padding: 1px 6px;
    }
    .sp-drawer-pairing-error {
      font-size: 11px;
      color: var(--agi-ext-danger);
      min-height: 16px;
      margin-bottom: 6px;
    }
    .sp-drawer-btn-row { display: flex; gap: 6px; }
    .sp-drawer-btn {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      padding: 5px 12px;
      cursor: pointer;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
    }
    .sp-drawer-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); }
    .sp-drawer-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .sp-drawer-btn-primary { background: var(--agi-ext-accent); color: var(--agi-ext-on-accent); border-color: var(--agi-ext-accent); }
    .sp-drawer-btn-primary:hover { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); color: var(--agi-ext-on-accent); border-color: var(--agi-ext-accent); }
    .sp-drawer-btn-danger { color: var(--agi-ext-danger); border-color: var(--agi-ext-danger-border); }
    .sp-drawer-btn-danger:hover { background: var(--agi-ext-danger-bg); color: var(--agi-ext-danger); border-color: var(--agi-ext-danger-border); }
    /* Allowlist */
    .sp-drawer-allowlist-help { font-size: 11px; color: var(--agi-ext-text-muted); line-height: 1.5; margin-bottom: 8px; }
    .sp-drawer-allowlist-current-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .sp-drawer-allowlist-origin {
      flex: 1;
      font-size: 11px;
      font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
      color: var(--agi-ext-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sp-drawer-allowlist-toggle-btn {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 5px;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      padding: 3px 10px;
      cursor: pointer;
      flex-shrink: 0;
      transition: color 0.12s, border-color 0.12s, background 0.12s;
    }
    .sp-drawer-allowlist-toggle-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); }
    .sp-drawer-allowlist-toggle-btn.is-remove { color: var(--agi-ext-danger); border-color: var(--agi-ext-danger-border); }
    .sp-drawer-allowlist-toggle-btn.is-remove:hover { background: var(--agi-ext-danger-bg); }
    .sp-drawer-allowlist-toggle-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .sp-drawer-allowlist-list { list-style: none; display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
    .sp-drawer-allowlist-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 8px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 5px;
      font-size: 11px;
    }
    .sp-drawer-allowlist-item.is-current { border-color: var(--agi-ext-accent); }
    .sp-drawer-allowlist-item-origin {
      flex: 1;
      font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
      color: var(--agi-ext-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sp-drawer-allowlist-item-remove {
      background: none;
      border: none;
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      cursor: pointer;
      padding: 1px 5px;
      border-radius: 3px;
      transition: color 0.12s, background 0.12s;
      flex-shrink: 0;
    }
    .sp-drawer-allowlist-item-remove:hover { color: var(--agi-ext-danger); background: var(--agi-ext-danger-bg); }
    .sp-drawer-allowlist-empty { font-size: 11px; color: var(--agi-ext-text-muted); padding: 4px 0; }
    /* Memory */
    .sp-drawer-memory-help { font-size: 11px; color: var(--agi-ext-text-muted); line-height: 1.5; margin-bottom: 8px; }
    .sp-drawer-memory-add-btn {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      padding: 5px 12px;
      cursor: pointer;
      transition: color 0.12s, border-color 0.12s;
      margin-bottom: 8px;
    }
    .sp-drawer-memory-add-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); }
    .sp-drawer-memory-editor { display: none; flex-direction: column; gap: 6px; margin-bottom: 8px; }
    .sp-drawer-memory-editor.open { display: flex; }
    .sp-drawer-memory-textarea {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      color: var(--agi-ext-text);
      font-size: 12px;
      padding: 6px 9px;
      outline: none;
      font-family: inherit;
      resize: none;
      height: 64px;
      line-height: 1.4;
      width: 100%;
      box-sizing: border-box;
    }
    .sp-drawer-memory-textarea:focus { border-color: var(--agi-ext-focus); }
    .sp-drawer-memory-textarea::placeholder { color: var(--agi-ext-text-muted); opacity: 0.6; }
    .sp-drawer-memory-editor-actions { display: flex; gap: 6px; justify-content: flex-end; }
    .sp-drawer-memory-list { list-style: none; display: flex; flex-direction: column; gap: 5px; }
    .sp-drawer-memory-item {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      padding: 7px 10px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .sp-drawer-memory-item-content { font-size: 11px; color: var(--agi-ext-text); line-height: 1.4; }
    .sp-drawer-memory-item-meta { font-size: 9px; color: var(--agi-ext-text-muted); }
    .sp-drawer-memory-item-row { display: flex; gap: 5px; margin-top: 2px; }
    .sp-drawer-memory-item-edit-btn {
      background: none; border: 1px solid var(--agi-ext-border); border-radius: 4px;
      color: var(--agi-ext-text-muted); font-size: 10px; padding: 2px 6px; cursor: pointer;
      transition: color 0.12s, border-color 0.12s;
    }
    .sp-drawer-memory-item-edit-btn:hover { color: var(--agi-ext-accent); border-color: var(--agi-ext-accent); }
    .sp-drawer-memory-item-delete-btn {
      background: none; border: 1px solid var(--agi-ext-border); border-radius: 4px;
      color: var(--agi-ext-text-muted); font-size: 10px; padding: 2px 6px; cursor: pointer;
      transition: color 0.12s, border-color 0.12s, background 0.12s;
    }
    .sp-drawer-memory-item-delete-btn:hover { color: var(--agi-ext-danger); border-color: var(--agi-ext-danger-border); }
    .sp-drawer-memory-item-delete-btn.is-confirm { color: white; background: var(--agi-ext-danger); border-color: var(--agi-ext-danger); }
    .sp-drawer-memory-item-textarea {
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: 5px;
      color: var(--agi-ext-text);
      font-size: 11px;
      padding: 5px 7px;
      outline: none;
      font-family: inherit;
      resize: none;
      height: 52px;
      line-height: 1.4;
      width: 100%;
      box-sizing: border-box;
    }
    .sp-drawer-memory-item-textarea:focus { border-color: var(--agi-ext-focus); }
    .sp-drawer-memory-empty { font-size: 11px; color: var(--agi-ext-text-muted); padding: 4px 0; }

    /* Respect the OS "reduce motion" setting. Five infinite animations (typing
       dots, spinners, pulse states) plus smooth scrolling ran unconditionally,
       which is a vestibular-trigger risk and an accessibility failure. Motion is
       reduced to near-zero rather than removed, so state changes still register. */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }
    /* In-page panel toggle */
    .sp-drawer-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .sp-drawer-toggle-label { font-size: 12px; color: var(--agi-ext-text-muted); }
    .sp-drawer-toggle-switch {
      appearance: none;
      width: 34px;
      height: 18px;
      border-radius: 9px;
      background: var(--agi-ext-hover);
      position: relative;
      cursor: pointer;
      transition: background 0.2s;
      flex-shrink: 0;
      border: none;
      outline: none;
    }
    .sp-drawer-toggle-switch:checked { background: var(--agi-ext-accent); }
    .sp-drawer-toggle-switch:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-drawer-toggle-switch::after {
      content: '';
      position: absolute;
      width: 13px;
      height: 13px;
      border-radius: 50%;
      background: #ffffff;
      /* Definition ring. The OFF track is --agi-ext-hover, which is #f0f0f0 in
         the light theme — a plain white knob on it was ~1.05:1 and the OFF
         state read as an empty pill. An outset ring costs no layout and
         reads on both grounds. */
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.28), 0 1px 2px rgba(0, 0, 0, 0.28);
      top: 2.5px;
      left: 2.5px;
      transition: transform 0.2s;
    }
    .sp-drawer-toggle-switch:checked::after { transform: translateX(16px); }
    /* Bridge URL inside drawer */
    .sp-drawer-bridge-row { display: flex; gap: 6px; margin-top: 4px; }
    .sp-drawer-bridge-input {
      flex: 1;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      color: var(--agi-ext-text);
      font-size: 11px;
      padding: 5px 8px;
      outline: none;
      font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
      transition: border-color 0.15s;
      min-width: 0;
    }
    .sp-drawer-bridge-input:focus { border-color: var(--agi-ext-focus); }
    .sp-drawer-bridge-input::placeholder { color: var(--agi-ext-text-muted); opacity: 0.6; }
    .sp-drawer-bridge-error { font-size: 10px; color: var(--agi-ext-danger); padding: 2px 0; margin-top: 2px; }
    /* Cloud unlock */
    .sp-drawer-cloud-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent);
      border-radius: 7px;
      color: var(--agi-ext-accent);
      font-size: 12px;
      font-weight: 500;
      padding: 8px 14px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    }
    .sp-drawer-cloud-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 20%, transparent); border-color: var(--agi-ext-accent); }

    /* ── AGI Cloud sign-in / quota UI ── */
    .sp-cloud-account {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sp-cloud-signed-in {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .sp-cloud-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--agi-ext-accent) 20%, transparent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 35%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      color: var(--agi-ext-accent);
      flex-shrink: 0;
    }
    .sp-cloud-user-info {
      flex: 1;
      min-width: 0;
    }
    .sp-cloud-user-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--agi-ext-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sp-cloud-user-tier {
      font-size: 10px;
      color: var(--agi-ext-text-muted);
    }
    .sp-cloud-signout-btn {
      background: transparent;
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: 5px;
      color: var(--agi-ext-text-muted);
      font-size: 10px;
      padding: 3px 7px;
      cursor: pointer;
      flex-shrink: 0;
      transition: color 0.15s, border-color 0.15s;
    }
    .sp-cloud-signout-btn:hover { color: var(--agi-ext-danger); border-color: var(--agi-ext-danger); }

    /* Quota bar */
    .sp-quota-bar-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .sp-quota-bar-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      color: var(--agi-ext-text-muted);
    }
    .sp-quota-bar-model {
      font-size: 9px;
      color: var(--agi-ext-text-muted);
      opacity: 0.7;
    }
    .sp-quota-bar-bg {
      height: 4px;
      border-radius: 2px;
      background: var(--agi-ext-border);
      overflow: hidden;
    }
    .sp-quota-bar-fill {
      height: 100%;
      border-radius: 2px;
      background: var(--agi-ext-accent);
      transition: width 0.3s ease;
    }
    .sp-quota-bar-fill.exhausted {
      background: var(--agi-ext-danger);
    }
    .sp-quota-upgrade-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .sp-quota-upgrade-btn {
      font-size: 10px;
      font-weight: 600;
      color: var(--agi-ext-accent);
      background: color-mix(in srgb, var(--agi-ext-accent) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 25%, transparent);
      border-radius: 5px;
      padding: 3px 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.12s;
    }
    .sp-quota-upgrade-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 18%, transparent); }
    .sp-cloud-link-hint {
      color: var(--agi-ext-text-muted);
      font-size: 9px;
      line-height: 1.4;
    }
    .sp-cloud-link-row {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .sp-cloud-link-btn {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 5px;
      color: var(--agi-ext-text-muted);
      cursor: pointer;
      font-size: 10px;
      padding: 4px 7px;
    }
    .sp-cloud-link-btn:hover {
      border-color: var(--agi-ext-accent);
      color: var(--agi-ext-accent);
    }

    /* Sign-in prompt (when not signed in) */
    .sp-cloud-signin-prompt {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sp-cloud-signin-desc {
      font-size: 11px;
      color: var(--agi-ext-text-muted);
      line-height: 1.45;
    }
    .sp-cloud-signin-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      background: var(--agi-ext-accent);
      border: none;
      border-radius: 7px;
      color: var(--agi-ext-on-accent);
      font-size: 12px;
      font-weight: 600;
      padding: 8px 14px;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .sp-cloud-signin-btn:hover { opacity: 0.88; }
    .sp-cloud-token-row {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .sp-cloud-token-input {
      flex: 1;
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: 6px;
      color: var(--agi-ext-text);
      font-size: 10px;
      font-family: 'SF Mono', Monaco, Consolas, monospace;
      padding: 5px 8px;
      outline: none;
      min-width: 0;
      transition: border-color 0.15s;
    }
    .sp-cloud-token-input:focus { border-color: var(--agi-ext-focus); }
    .sp-cloud-token-input::placeholder { color: var(--agi-ext-text-muted); opacity: 0.55; }
    .sp-cloud-token-save-btn {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: 6px;
      color: var(--agi-ext-text);
      font-size: 10px;
      font-weight: 600;
      padding: 5px 9px;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.12s;
    }
    .sp-cloud-token-save-btn:hover { background: var(--agi-ext-hover); }
    .sp-cloud-token-hint {
      font-size: 9px;
      color: var(--agi-ext-text-muted);
      opacity: 0.7;
      line-height: 1.4;
    }

    /* Quota badge in the chat header */
    #sp-quota-badge {
      display: none;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      font-weight: 600;
      border-radius: 10px;
      padding: 2px 7px;
      white-space: nowrap;
      cursor: pointer;
      transition: opacity 0.15s;
      /* Now a <button> for keyboard access — reset the UA chrome so it still
         renders as a badge. */
      border: none;
      background: none;
      font-family: inherit;
      color: inherit;
    }
    #sp-quota-badge.visible { display: flex; }
    #sp-quota-badge.has-prompts {
      background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
      color: var(--agi-ext-accent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 28%, transparent);
    }
    #sp-quota-badge.exhausted {
      background: var(--agi-ext-danger-bg);
      color: var(--agi-ext-danger);
      border: 1px solid var(--agi-ext-danger-border);
    }
    #sp-quota-badge:hover { opacity: 0.8; }

    /* Drawer footer */
    #sp-drawer-footer {
      padding: 10px 14px;
      border-top: 1px solid var(--agi-ext-border);
      flex-shrink: 0;
      background: var(--agi-ext-bg);
    }
    .sp-drawer-stats-row {
      display: flex;
      gap: 12px;
      margin-bottom: 8px;
    }
    .sp-drawer-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 6px;
      padding: 5px 10px;
      flex: 1;
    }
    .sp-drawer-stat-value { font-size: 14px; font-weight: 600; color: var(--agi-ext-text); }
    .sp-drawer-stat-label { font-size: 9px; color: var(--agi-ext-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .sp-drawer-about-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      color: var(--agi-ext-text-muted);
      gap: 4px;
    }
    .sp-drawer-about-url {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 140px;
      font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
    }
    /* ⋮ button in header */
    #sp-menu-btn {
      position: relative;
    }

    /* ── First-run onboarding carousel overlay ── */
    #sp-onboarding-overlay {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: var(--agi-ext-bg);
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
      overflow: hidden;
    }
    #sp-onboarding-overlay.visible { display: flex; }

    #sp-onboarding-header {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 10px 12px 6px;
      flex-shrink: 0;
    }
    #sp-onboarding-skip {
      background: transparent;
      border: none;
      cursor: pointer;
      color: var(--agi-ext-text-muted);
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 5px;
      transition: color 0.15s, background 0.15s;
    }
    #sp-onboarding-skip:hover { color: var(--agi-ext-text); background: var(--agi-ext-hover); }
    #sp-onboarding-skip:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

    #sp-onboarding-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* individual step panels */
    .sp-ob-step {
      display: none;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 20px 24px 0;
      gap: 0;
      overflow-y: auto;
    }
    .sp-ob-step.active { display: flex; }

    .sp-ob-hero {
      width: 80px;
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 18px;
      flex-shrink: 0;
    }
    .sp-ob-hero svg { width: 80px; height: 80px; display: block; }

    .sp-ob-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--agi-ext-text);
      text-align: center;
      margin-bottom: 16px;
      flex-shrink: 0;
    }

    /* Step 1 uses icon-text rows instead of a body paragraph */
    .sp-ob-rows {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
      max-width: 340px;
    }
    .sp-ob-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 10px;
      padding: 10px 12px;
    }
    .sp-ob-row-icon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 1px;
      color: var(--agi-ext-text-muted);
    }
    .sp-ob-row-icon svg { width: 16px; height: 16px; display: block; }
    .sp-ob-row-icon.danger { color: var(--agi-ext-danger); }
    .sp-ob-row-text {
      font-size: 12px;
      color: var(--agi-ext-text-muted);
      line-height: 1.5;
    }
    .sp-ob-row-text.danger { color: var(--agi-ext-danger); }
    .sp-ob-learn-more {
      color: var(--agi-ext-accent);
      text-decoration: underline;
      cursor: pointer;
      background: none;
      border: none;
      font-size: 12px;
      padding: 0;
      display: inline;
      font-family: inherit;
    }
    .sp-ob-learn-more:hover { opacity: 0.8; }
    .sp-ob-learn-more:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

    /* Steps 2-5 body text */
    .sp-ob-body {
      font-size: 12px;
      color: var(--agi-ext-text-muted);
      line-height: 1.6;
      text-align: center;
      max-width: 300px;
      flex-shrink: 0;
    }

    /* footer: step dots + nav buttons */
    #sp-onboarding-footer {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 14px 24px 22px;
      flex-shrink: 0;
    }

    .sp-ob-dots {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .sp-ob-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--agi-ext-border-strong);
      transition: background 0.2s, width 0.2s;
    }
    .sp-ob-dot.active {
      width: 18px;
      border-radius: 3px;
      background: var(--agi-ext-accent);
    }

    .sp-ob-nav {
      display: flex;
      gap: 8px;
      width: 100%;
      max-width: 300px;
    }
    .sp-ob-btn-back {
      flex: 1;
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid var(--agi-ext-border-strong);
      background: transparent;
      color: var(--agi-ext-text-muted);
      font-size: 12px;
      cursor: pointer;
      transition: background 0.12s, color 0.12s;
      font-family: inherit;
    }
    .sp-ob-btn-back:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-ob-btn-back:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-ob-btn-back[hidden] { display: none; }

    .sp-ob-btn-next {
      flex: 2;
      padding: 8px 14px;
      border-radius: 8px;
      border: none;
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.12s;
      font-family: inherit;
    }
    .sp-ob-btn-next:hover { background: color-mix(in srgb, var(--agi-ext-accent) 80%, black); }
    .sp-ob-btn-next:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
  `;
  // M-08 audit 2026-05-19: Constructable Stylesheet — CSP-compliant
  // because it's a DOM API call, not a <style> tag.
  if (
    typeof CSSStyleSheet === 'function' &&
    typeof (CSSStyleSheet.prototype as { replaceSync?: unknown }).replaceSync === 'function'
  ) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText + '\n' + COMPUTER_USE_PANEL_CSS);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } else {
    // Fallback path for environments without Constructable Stylesheets
    // (some JSDOM versions used in tests). Tests don't render the panel,
    // so missing styles here is acceptable.
    const fallback = document.createElement('style');
    fallback.textContent = cssText;
    document.head.appendChild(fallback);
  }
}

function scrollToBottom(): void {
  const msgs = document.getElementById('sp-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

function resolveManagedToolApproval(
  assistantMessageId: string,
  toolCallId: string,
  decision: 'approved' | 'rejected',
): void {
  const assistant = _ctx.messages.find(
    (message) => message.id === assistantMessageId && message.role === 'assistant',
  );
  const run = assistant?.cloudAgentRun;
  const owner = _ctx.managedCloudOwner;
  const pendingCalls =
    assistant?.agentActivity?.entries.filter(
      (entry): entry is AgentActivityToolEntry =>
        entry.kind === 'tool' &&
        entry.status === 'awaiting-approval' &&
        Boolean(entry.approval) &&
        !entry.approval?.decision,
    ) ?? [];
  if (
    !assistant ||
    !run ||
    !owner ||
    _ctx.isStreaming ||
    !pendingCalls.some((entry) => entry.toolCallId === toolCallId)
  ) {
    return;
  }

  assistant.cloudApprovalDecisions = {
    ...(assistant.cloudApprovalDecisions ?? {}),
    [toolCallId]: decision,
  };
  assistant.cloudApprovalError = undefined;
  saveMessages();
  _ctx.needsMessageRebuild = true;
  renderMessages();

  if (
    pendingCalls.some((entry) => assistant.cloudApprovalDecisions?.[entry.toolCallId] === undefined)
  ) {
    return;
  }

  const toolApprovals = pendingCalls.map((entry) => ({
    tool_call_id: entry.toolCallId,
    decision: assistant.cloudApprovalDecisions?.[entry.toolCallId] ?? ('rejected' as const),
  }));
  assistant.streaming = true;
  _ctx.currentStreamId = assistant.id;
  ownerByStreamId.set(assistant.id, { ...owner });
  _ctx.isStreaming = true;
  startManagedChatKeepalive();
  armManagedStreamInactivityWatchdog(assistant.id);
  updateSendButton();
  _ctx.needsMessageRebuild = true;
  renderMessages();

  chrome.runtime.sendMessage(
    {
      type: 'RESOLVE_CHAT_APPROVAL',
      owner,
      clientInstanceId: SIDE_PANEL_CLIENT_INSTANCE_ID,
      id: assistant.id,
      cloudRun: run,
      toolApprovals,
    },
    (response?: { success?: boolean; error?: string }) => {
      if (_ctx.currentStreamId !== assistant.id) return;
      if (chrome.runtime.lastError) {
        handleStreamError(
          assistant.id,
          chrome.runtime.lastError.message ?? 'Approval could not be continued.',
        );
      } else if (response?.success !== true) {
        handleStreamError(assistant.id, response?.error ?? 'Approval could not be continued.');
      }
    },
  );
}

/**
 * Button whose only content is an icon.
 *
 * EXT-06: these were emoji literals ("✕", "▶") sitting beside stroke-only
 * Lucide SVGs. Emoji render in the system emoji font at a different weight,
 * colour and baseline, so a row mixed two icon vocabularies.
 */
function iconButton(attrs: Record<string, string>, icon: string): HTMLElement {
  const button = el('button', attrs);
  button.appendChild(renderIcon(icon, 12));
  return button;
}

function renderMessages(): void {
  const container = document.getElementById('sp-messages')!;
  const chips = document.getElementById('sp-prompt-chips');
  const emptyEl = document.getElementById('sp-empty');
  const restrictedPage =
    document.getElementById('sp-blocked')?.classList.contains('visible') === true;

  if (_ctx.messages.length === 0) {
    if (chips) chips.classList.toggle('hidden', restrictedPage);
    if (emptyEl) emptyEl.classList.remove('hidden');
    // Remove all message nodes and reset counter
    container.querySelectorAll('.sp-msg, .sp-thinking-wrap').forEach((n) => n.remove());
    _ctx.lastRenderedCount = 0;
    _ctx.needsMessageRebuild = false;
    return;
  }

  if (chips) chips.classList.add('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');

  // Only append messages that haven't been rendered yet — avoids full DOM rebuild on each
  // streaming chunk and preserves browser focus/scroll state for already-rendered bubbles.
  if (
    shouldRebuildMessageDom({
      forceRebuild: _ctx.needsMessageRebuild,
      renderedCount: _ctx.lastRenderedCount,
      messageCount: _ctx.messages.length,
    })
  ) {
    // Messages were cleared — rebuild from scratch
    container.querySelectorAll('.sp-msg, .sp-thinking-wrap').forEach((n) => n.remove());
    _ctx.lastRenderedCount = 0;
    _ctx.needsMessageRebuild = false;
  }

  for (let i = _ctx.lastRenderedCount; i < _ctx.messages.length; i++) {
    const msg = _ctx.messages[i];
    if (msg) {
      container.appendChild(
        buildBubbleWithTools(msg, {
          approvalDecisions: msg.cloudApprovalDecisions,
          approvalError: msg.cloudApprovalError,
          onResolveApproval: (toolCallId, decision) =>
            resolveManagedToolApproval(msg.id, toolCallId, decision),
          onRetry: (messageId) => retryFailedMessage(messageId),
        }),
      );
    }
  }
  _ctx.lastRenderedCount = _ctx.messages.length;

  scrollToBottom();
}

function showThinking(): void {
  const container = document.getElementById('sp-messages')!;
  const chips = document.getElementById('sp-prompt-chips');
  if (chips) chips.classList.add('hidden');

  const wrap = el('div', { class: 'sp-msg sp-msg-assistant sp-thinking-wrap' });
  const thinking = el('div', { class: 'sp-thinking' });
  thinking.appendChild(el('div', { class: 'sp-dot' }));
  thinking.appendChild(el('div', { class: 'sp-dot' }));
  thinking.appendChild(el('div', { class: 'sp-dot' }));
  wrap.appendChild(thinking);
  container.appendChild(wrap);
  scrollToBottom();
}

function removeThinking(): void {
  document.querySelectorAll('.sp-thinking-wrap').forEach((n) => n.remove());
}

function updateStreamingBubble(id: string, fullText: string, done: boolean): void {
  const bubble = document.getElementById(`sp-bubble-${id}`);
  if (!bubble) return;
  bubble.innerHTML = sanitizeHtml(renderMarkdown(fullText));
  if (done) {
    bubble.classList.remove('sp-cursor');
  } else {
    bubble.classList.add('sp-cursor');
  }
  scrollToBottom();
}

async function capturePageContext(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      const tab = tabs[0];
      if (!tab?.id) {
        resolve(null);
        return;
      }
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: () => (document.body?.innerText ?? '').slice(0, 5000),
        },
        (results) => {
          if (chrome.runtime.lastError || !results?.[0]) {
            resolve(null);
          } else {
            const raw = typeof results[0].result === 'string' ? results[0].result : '';
            resolve(sanitizePageText(raw).slice(0, 5000));
          }
        },
      );
    });
  });
}

interface SlashCommandMeta {
  display: string;
  prompt: string;
  captureContext: boolean;
  /** One-line description shown in the autocomplete menu. */
  hint: string;
}

/**
 * The panel's slash commands, in menu order.
 *
 * Single source of truth: both `expandSlashCommand` (submit-time) and the
 * autocomplete menu read this. Four separate strings promised "/ for commands"
 * while nothing listened for the key, so the commands were undiscoverable
 * unless you already knew them.
 */
const SLASH_COMMANDS: Record<string, SlashCommandMeta> = {
  '/summarize': {
    display: '/summarize',
    prompt:
      'Summarize this page concisely. Include key points, main arguments, and any important details.',
    captureContext: true,
    hint: 'Key points and main arguments of this page',
  },
  '/tldr': {
    display: '/tldr',
    prompt: 'Give me a TL;DR of this page in 2-3 sentences.',
    captureContext: true,
    hint: 'Two or three sentences, nothing more',
  },
  '/explain': {
    display: '/explain',
    prompt: 'Explain the content of this page in simple terms. Break down any complex concepts.',
    captureContext: true,
    hint: 'Plain-language explanation of this page',
  },
  '/translate': {
    display: '/translate',
    prompt:
      'Translate the main content of this page to English. If already in English, translate to Spanish.',
    captureContext: true,
    hint: 'Translate the page — add a language to choose',
  },
  '/extract': {
    display: '/extract',
    prompt:
      'Extract the key structured data from this page: names, dates, numbers, prices, and any tabular information.',
    captureContext: true,
    hint: 'Pull out names, dates, numbers and tables',
  },
  '/code': {
    display: '/code',
    prompt:
      'Extract and explain all code snippets on this page. For each snippet, describe what it does and suggest improvements.',
    captureContext: true,
    hint: 'Find and explain code on this page',
  },
};

/** Commands whose name starts with `fragment` (`/tr` -> `/translate`). */
function matchSlashCommands(fragment: string): Array<[string, SlashCommandMeta]> {
  const q = fragment.trim().toLowerCase();
  if (!q.startsWith('/') || q.includes(' ')) return [];
  return Object.entries(SLASH_COMMANDS).filter(([name]) => name.startsWith(q));
}

function expandSlashCommand(
  raw: string,
): { display: string; prompt: string; captureContext: boolean } | null {
  const trimmed = raw.trim();
  const exact = SLASH_COMMANDS[trimmed];
  if (exact) return exact;

  // e.g. "/translate to French"
  for (const [cmd, meta] of Object.entries(SLASH_COMMANDS)) {
    if (trimmed.startsWith(cmd + ' ')) {
      const extra = trimmed.slice(cmd.length + 1).trim();
      return {
        display: trimmed,
        prompt: `${meta.prompt}\n\nAdditional instruction: ${extra}`,
        captureContext: meta.captureContext,
      };
    }
  }

  return null;
}

function requestStreamCancellation(streamId: string): void {
  const owner = ownerByStreamId.get(streamId);
  if (!owner) return;
  const cloudRun =
    cloudRunsByStreamId.get(streamId) ??
    _ctx.messages.find((message) => message.id === streamId)?.cloudAgentRun;
  chrome.runtime
    .sendMessage({
      type: 'CANCEL_STREAM',
      owner,
      clientInstanceId: SIDE_PANEL_CLIENT_INSTANCE_ID,
      id: streamId,
      ...(cloudRun ? { cloudRun } : {}),
    })
    .catch(() => {
      // The service worker may have restarted before receiving the cancellation.
    });
}

function stopManagedChatKeepalive(): void {
  if (managedChatKeepaliveTimer) {
    clearInterval(managedChatKeepaliveTimer);
    managedChatKeepaliveTimer = null;
  }
}

function ensureManagedChatKeepalivePort(): chrome.runtime.Port | null {
  if (managedChatKeepalivePort) return managedChatKeepalivePort;
  try {
    const port = chrome.runtime.connect({
      name: createManagedChatPortName(SIDE_PANEL_CLIENT_INSTANCE_ID),
    });
    managedChatKeepalivePort = port;
    port.onDisconnect.addListener(() => {
      if (managedChatKeepalivePort !== port) return;
      managedChatKeepalivePort = null;
      stopManagedChatKeepalive();
      const streamId = _ctx.currentStreamId;
      if (streamId) {
        const assistant = _ctx.messages.find((message) => message.id === streamId);
        const cloudRun = cloudRunsByStreamId.get(streamId) ?? assistant?.cloudAgentRun;
        if (assistant && cloudRun) {
          resumeManagedCloudRun(
            streamId,
            cloudRun,
            assistant.content,
            assistant.managedQuickMode === true,
          );
        } else {
          handleStreamError(streamId, 'The extension service restarted before the run was saved.');
        }
      }
    });
    return port;
  } catch {
    return null;
  }
}

function startManagedChatKeepalive(): void {
  stopManagedChatKeepalive();
  const sendHeartbeat = (): void => {
    const port = ensureManagedChatKeepalivePort();
    try {
      port?.postMessage({ type: 'MANAGED_CHAT_KEEPALIVE' });
    } catch {
      managedChatKeepalivePort = null;
    }
  };
  sendHeartbeat();
  managedChatKeepaliveTimer = setInterval(sendHeartbeat, 20_000);
}

function beginManagedStream(quickMode: boolean): string {
  const owner = _ctx.managedCloudOwner;
  if (!owner) throw new Error('Managed Cloud authority is unavailable.');
  const streamId = `stream-${crypto.randomUUID()}`;
  ownerByStreamId.set(streamId, { ...owner });
  quickModeByStreamId.set(streamId, quickMode);
  _ctx.currentStreamId = streamId;
  _ctx.isStreaming = true;
  startManagedChatKeepalive();
  updateSendButton();
  armManagedStreamInactivityWatchdog(streamId);
  showThinking();
  return streamId;
}

function armManagedStreamInactivityWatchdog(streamId: string): void {
  if (_ctx.streamTimeoutHandle) clearTimeout(_ctx.streamTimeoutHandle);
  _ctx.streamTimeoutHandle = setTimeout(() => {
    if (_ctx.isStreaming && _ctx.currentStreamId === streamId) {
      requestStreamCancellation(streamId);
      handleStreamError(streamId, 'No AGI Cloud activity was received for 90 seconds.');
    }
  }, 90_000);
}

function resumeManagedCloudRun(
  streamId: string,
  cloudRun: ManagedCloudAgentRunReference,
  alreadyVisibleText: string,
  quickMode = false,
): void {
  const owner = _ctx.managedCloudOwner;
  if (!owner) return;
  if (_ctx.isStreaming && _ctx.currentStreamId && _ctx.currentStreamId !== streamId) return;
  const assistant = _ctx.messages.find((message) => message.id === streamId);
  if (!assistant) return;
  assistant.streaming = true;
  assistant.cloudAgentRun = { ...cloudRun };
  cloudRunsByStreamId.set(streamId, { ...cloudRun });
  ownerByStreamId.set(streamId, { ...owner });
  quickModeByStreamId.set(streamId, quickMode);
  _ctx.currentStreamId = streamId;
  _ctx.isStreaming = true;
  startManagedChatKeepalive();
  armManagedStreamInactivityWatchdog(streamId);
  updateSendButton();
  renderMessages();
  chrome.runtime.sendMessage(
    {
      type: 'RESUME_CHAT_RUN',
      owner,
      clientInstanceId: SIDE_PANEL_CLIENT_INSTANCE_ID,
      id: streamId,
      cloudRun,
      alreadyVisibleText,
      ...(!quickMode && _ctx.currentModelKey && _ctx.previousTaskType
        ? {
            routing: {
              modelKey: _ctx.currentModelKey,
              taskType: _ctx.previousTaskType,
              reason: 'durable_resume',
              ...managedOutboundEffortPayload(true),
            },
          }
        : {}),
    },
    (response: { success?: boolean; error?: string }) => {
      if (_ctx.currentStreamId !== streamId) return;
      if (chrome.runtime.lastError) {
        handleStreamError(streamId, chrome.runtime.lastError.message ?? 'Resume failed.');
      } else if (response?.success !== true) {
        handleStreamError(streamId, response?.error ?? 'AGI Cloud run could not be resumed.');
      }
    },
  );
}

function cancelCurrentManagedStream(preservePartialOutput: boolean): void {
  const streamId = _ctx.currentStreamId;
  if (streamId) requestStreamCancellation(streamId);
  stopManagedChatKeepalive();
  if (_ctx.streamTimeoutHandle) {
    clearTimeout(_ctx.streamTimeoutHandle);
    _ctx.streamTimeoutHandle = null;
  }
  if (streamId) {
    const existing = _ctx.messages.find((message) => message.id === streamId);
    if (existing) existing.streaming = false;
    quickModeByStreamId.delete(streamId);
    ownerByStreamId.delete(streamId);
  }
  removeThinking();
  _ctx.isStreaming = false;
  _ctx.currentStreamId = null;
  updateSendButton();
  if (preservePartialOutput) {
    saveMessages();
    renderMessages();
  }
}

function sendMessage(text: string): void {
  const prompt = resolveComposerPrompt(text, pendingAttachments.length);
  const owner = _ctx.managedCloudOwner;
  if (!prompt || !owner || _ctx.isStreaming || historyRestoreInProgress) return;
  _ctx.conversationGeneration += 1;

  // Route through the shared priority send queue for backpressure /
  // cancellation parity with other surfaces. Drain immediately — current
  // behavior is direct send.
  try {
    extensionSendQueue.enqueue({ value: prompt, mode: 'prompt' });
  } catch (err) {
    if (err instanceof QueueFullError) {
      console.warn('[SidePanel] queue lane full:', err.lane);
      return;
    }
    throw err;
  }
  extensionSendQueue.dequeue();

  const slashCmd = expandSlashCommand(prompt);
  if (slashCmd?.captureContext) {
    // For context-requiring commands, auto-capture page context first
    const displayText = slashCmd.display;
    const actualPrompt = slashCmd.prompt;
    // Claim the inputs that belong to this turn before the asynchronous page
    // capture begins. Otherwise an attachment or manually selected context
    // added while capture is pending can be consumed by the wrong request.
    const pageContextAtAdmission = _ctx.pendingPageContext;
    _ctx.pendingPageContext = null;
    const attachmentsToSend = pendingAttachments.slice();
    pendingAttachments.length = 0;
    composerAttachmentNotice = null;
    updateContextButton();
    updateAttachmentPreview();

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: displayText,
      timestamp: Date.now(),
    };
    _ctx.messages.push(userMsg);
    trimLiveMessages();
    saveMessages();
    renderMessages();

    const streamId = beginManagedStream(_ctx.quickMode);

    capturePageContext()
      .then((capturedCtx) => {
        if (_ctx.currentStreamId !== streamId) return;
        const pageCtx = capturedCtx ?? pageContextAtAdmission;

        const history = selectModelHistory(_ctx.messages, userMsg.id);

        chrome.runtime.sendMessage(
          {
            type: 'CHAT_MESSAGE',
            owner,
            clientInstanceId: SIDE_PANEL_CLIENT_INSTANCE_ID,
            id: streamId,
            text: actualPrompt,
            pageContext: pageCtx ?? undefined,
            conversationHistory: history,
            // Round-2 audit P0 #3 (2026-05-21): forward the snapshot taken
            // above so the model can see the user's images / pastes.
            attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
            extendedThinking: _ctx.thinkingEnabled || undefined,
            modelSelection: _ctx.selectedModel,
            quickMode: _ctx.quickMode || undefined,
            ...managedOutboundRoutingPayload(),
          },
          (response?: { success?: boolean; error?: string }) => {
            if (chrome.runtime.lastError) {
              handleStreamError(streamId, chrome.runtime.lastError.message ?? 'Extension error');
            } else if (response?.success === false) {
              handleStreamError(streamId, response.error ?? 'Managed Cloud request was rejected.');
            }
          },
        );
      })
      .catch((err) => {
        console.error('[SidePanel] Failed to capture page context for chat:', err);
        if (_ctx.currentStreamId === streamId) {
          handleStreamError(streamId, 'Unable to capture page context.');
        }
      });
    return;
  }

  const userMsg: ChatMessage = {
    id: `u-${Date.now()}`,
    role: 'user',
    content: prompt,
    timestamp: Date.now(),
  };
  _ctx.messages.push(userMsg);
  trimLiveMessages();
  saveMessages();
  renderMessages();

  const pageCtx = _ctx.pendingPageContext;
  _ctx.pendingPageContext = null;
  // Round-2 audit P0 #3 fix (2026-05-21): snapshot before clearing so the
  // CHAT_MESSAGE payload below actually carries the user's attachments.
  const attachmentsToSend = pendingAttachments.slice();
  pendingAttachments.length = 0;
  composerAttachmentNotice = null;
  updateContextButton();
  updateAttachmentPreview();

  const streamId = beginManagedStream(_ctx.quickMode);

  // Build conversation history (exclude the message we're about to send)
  const history = selectModelHistory(_ctx.messages, userMsg.id);

  chrome.runtime.sendMessage(
    {
      type: 'CHAT_MESSAGE',
      owner,
      clientInstanceId: SIDE_PANEL_CLIENT_INSTANCE_ID,
      id: streamId,
      text: userMsg.content,
      pageContext: pageCtx ?? undefined,
      conversationHistory: history,
      // Round-2 audit P0 #3 (2026-05-21): forward the snapshot so attachments
      // actually reach the model.
      attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
      extendedThinking: _ctx.thinkingEnabled || undefined,
      modelSelection: _ctx.selectedModel,
      quickMode: _ctx.quickMode || undefined,
      ...managedOutboundRoutingPayload(),
    },
    (response?: { success?: boolean; error?: string }) => {
      if (chrome.runtime.lastError) {
        handleStreamError(streamId, chrome.runtime.lastError.message ?? 'Extension error');
      } else if (response?.success === false) {
        handleStreamError(streamId, response.error ?? 'Managed Cloud request was rejected.');
      }
    },
  );
}

/**
 * Re-send the request that produced a failed assistant message.
 *
 * A failed stream previously left a dead end: the provider error was rendered
 * as message text and the only way forward was to retype the prompt. The user
 * turn is still in history, so retrying means dropping the failed assistant
 * message and sending that turn again.
 */
function retryFailedMessage(messageId: string): void {
  if (_ctx.isStreaming) return;

  const failedIndex = _ctx.messages.findIndex((message) => message.id === messageId);
  if (failedIndex < 0) return;

  // The prompt to repeat is the nearest preceding user turn.
  let promptText = '';
  for (let i = failedIndex - 1; i >= 0; i--) {
    const candidate = _ctx.messages[i];
    if (candidate?.role === 'user') {
      promptText = candidate.content;
      break;
    }
  }
  if (!promptText) return;

  // Drop the failed assistant turn so the retry does not stack a second
  // failure underneath the first.
  _ctx.messages.splice(failedIndex, 1);
  _ctx.needsMessageRebuild = true;
  saveMessages();
  renderMessages();

  sendMessage(promptText);
}

function handleStreamError(id: string, errorText: string): void {
  if (_ctx.currentStreamId !== id) return;
  const streamUsedQuick = quickModeByStreamId.get(id) === true;
  quickModeByStreamId.delete(id);
  ownerByStreamId.delete(id);
  stopManagedChatKeepalive();
  if (_ctx.streamTimeoutHandle) {
    clearTimeout(_ctx.streamTimeoutHandle);
    _ctx.streamTimeoutHandle = null;
  }
  removeThinking();
  const existing = _ctx.messages.find((message) => message.id === id);
  const canRetryApproval = existing?.agentActivity?.entries.some(
    (entry) =>
      entry.kind === 'tool' &&
      entry.status === 'awaiting-approval' &&
      Boolean(entry.approval) &&
      !entry.approval?.decision,
  );
  if (existing && canRetryApproval) {
    existing.streaming = false;
    if (streamUsedQuick) existing.managedQuickMode = true;
    existing.cloudApprovalDecisions = undefined;
    existing.cloudApprovalError = errorText.slice(0, 500);
  } else {
    applyStreamFailure(_ctx.messages, id, errorText);
  }
  if (streamUsedQuick) {
    const failedTurn = _ctx.messages.find((message) => message.id === id);
    if (failedTurn) failedTurn.managedQuickMode = true;
  }
  trimLiveMessages();
  _ctx.isStreaming = false;
  _ctx.currentStreamId = null;
  updateSendButton();
  _ctx.needsMessageRebuild = true;
  saveMessages();
  renderMessages();
}

function updateConnectionStatus(): void {
  const pill = document.getElementById('sp-status-pill');
  if (!pill) return;
  if (_ctx.isConnected) {
    pill.className = 'connected';
    const dot = document.createElement('span');
    dot.className = 'sp-status-dot';
    pill.replaceChildren(dot, 'Desktop tools');
  } else {
    pill.className = 'disconnected';
    const dot = document.createElement('span');
    dot.className = 'sp-status-dot';
    pill.replaceChildren(dot, 'Desktop optional');
  }
  updateNativeBridgeAvailabilityUI();
}

/**
 * Native connectivity controls explicit Desktop/browser mechanics only.
 * Managed Cloud chat and its model picker remain available independently.
 */
function updateNativeBridgeAvailabilityUI(): void {
  const notice = document.getElementById('sp-bridge-notice');
  const availability = getChromeSurfaceAvailability({
    nativeConnected: _ctx.isConnected,
    restrictedPage: false,
  });

  if (notice) {
    notice.classList.toggle('visible', !availability.nativeTools);
  }
}

// Legacy Desktop-required onboarding is always hidden: native tools are optional.
function hideLegacyOfflineOnboarding(): void {
  const el2 = document.getElementById('sp-offline-onboarding');
  const msgsEl = document.getElementById('sp-messages');
  if (!el2) return;
  el2.classList.remove('visible');
  if (msgsEl) {
    msgsEl.querySelectorAll('.sp-msg, .sp-thinking-wrap, #sp-empty').forEach((n) => {
      (n as HTMLElement).style.display = '';
    });
  }
}

let contextBtn: HTMLButtonElement | null = null;

function updateContextButton(): void {
  // contextBtn is now the persistent composer-bar chip (sp-context-chip)
  if (!contextBtn) return;
  const hostname = currentPageHostname || 'page';
  if (_ctx.pendingPageContext) {
    contextBtn.classList.add('has-context');
    contextBtn.title = 'Page context attached — click to detach';
    contextBtn.textContent = hostname;
  } else {
    contextBtn.classList.remove('has-context');
    contextBtn.title = 'Attach page content to next message';
    contextBtn.textContent = hostname;
  }
}

function updateModelBadge(modelId: string): void {
  const badge = document.getElementById('sp-model-badge');
  if (!badge) return;
  const normalizedModelId = normalizeModelId(modelId) ?? modelId;
  badge.textContent = getModelBadgeLabel(normalizedModelId);
}

function updateSendButton(): void {
  const btn = document.getElementById('sp-send-btn') as HTMLButtonElement | null;
  if (!btn) return;
  if (_ctx.isStreaming) {
    btn.disabled = false;
    btn.setAttribute('data-mode', 'stop');
    btn.title = 'Stop generating';
    btn.setAttribute('aria-label', 'Stop response');
    clearChildren(btn);
    btn.appendChild(renderIcon(Square, 14));
  } else {
    btn.disabled = managedCloudChatState !== 'ready' || historyRestoreInProgress;
    btn.setAttribute('data-mode', 'send');
    btn.title = 'Send';
    btn.setAttribute('aria-label', 'Send message');
    clearChildren(btn);
    btn.appendChild(renderIcon(ArrowUp, 16));
  }
}

/**
 * Read a File as a data URL with a single Promise wrapper around FileReader.
 * Keeps the drop/paste path readable without sprinkling reader.onload chains
 * through the call sites. Resolves to null on read error so callers can
 * filter and move on instead of throwing through Promise.all.
 */
function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(typeof result === 'string' ? result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * The only data-URL shapes the managed transport will send. Mirrors
 * SUPPORTED_IMAGE_DATA_URL in `features/cloud-bridge/freeTrialClient.ts`:
 * anything outside this set makes createMultimodalUserContent throw, which the
 * user would only discover as a failed turn after pressing send.
 */
const COMPOSER_ATTACHMENT_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const COMPOSER_ATTACHMENT_ACCEPT = Array.from(COMPOSER_ATTACHMENT_MIME_TYPES).join(',');
const COMPOSER_ATTACHMENT_DATA_URL =
  /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/]+={0,2}$/i;

/** Decoded byte length of a base64 data URL, as the transport counts it. */
function composerAttachmentBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function pendingAttachmentBytes(): number {
  let total = 0;
  for (const dataUrl of pendingAttachments) total += composerAttachmentBytes(dataUrl);
  return total;
}

/** Rejection reason for the most recent intake attempt, shown next to the chips. */
let composerAttachmentNotice: string | null = null;

function attachmentBudgetLabel(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/**
 * The single append point for composer attachments. Every intake path — drag,
 * paste, the `+` menu file picker and the `+` menu screenshot — goes through
 * here so the composer can never hold more than `executeChromeManagedChat`
 * will accept (`assertAttachmentBudget`: at most MANAGED_CHAT_MAX_ATTACHMENTS
 * images totalling MANAGED_CHAT_MAX_ATTACHMENT_BYTES decoded bytes). Over-cap
 * intake used to be admitted here and rejected on the wire, which destroyed
 * the turn the user had already typed.
 */
function admitComposerAttachment(dataUrl: string): boolean {
  if (!COMPOSER_ATTACHMENT_DATA_URL.test(dataUrl)) {
    composerAttachmentNotice = 'Only PNG, JPEG, WebP, and GIF images can be attached.';
    return false;
  }
  if (pendingAttachments.length >= MANAGED_CHAT_MAX_ATTACHMENTS) {
    composerAttachmentNotice = `Only ${MANAGED_CHAT_MAX_ATTACHMENTS} images can be sent with one message.`;
    return false;
  }
  if (
    pendingAttachmentBytes() + composerAttachmentBytes(dataUrl) >
    MANAGED_CHAT_MAX_ATTACHMENT_BYTES
  ) {
    composerAttachmentNotice = `Attachments must total under ${attachmentBudgetLabel(MANAGED_CHAT_MAX_ATTACHMENT_BYTES)}.`;
    return false;
  }
  pendingAttachments.push(dataUrl);
  return true;
}

/**
 * Accept files from a drag-drop, paste or file-picker event and append their
 * data URLs to `pendingAttachments`. Files are pre-filtered on type and size so
 * an obviously doomed file is never read into memory; `admitComposerAttachment`
 * then enforces the transport's count and total-byte caps on append.
 *
 * Round-2 audit P0 #3 — chrome-ext composer drag-drop + paste-image wire,
 * 2026-05-21. Reuses the existing attachment preview UI; no schema work
 * needed because the wire path through CHAT_MESSAGE already snapshots
 * pendingAttachments per the round-3 fix in commit `38034fedb`.
 */
function acceptIncomingComposerFiles(files: File[] | FileList): void {
  const MAX_BYTES = 10 * 1024 * 1024;
  composerAttachmentNotice = null;
  const candidates = Array.from(files);
  const incoming: File[] = [];
  for (const file of candidates) {
    if (!COMPOSER_ATTACHMENT_MIME_TYPES.has(file.type.toLowerCase())) {
      composerAttachmentNotice = 'Only PNG, JPEG, WebP, and GIF images can be attached.';
      continue;
    }
    if (file.size > MAX_BYTES) {
      composerAttachmentNotice = `Each image must be under ${attachmentBudgetLabel(MAX_BYTES)}.`;
      continue;
    }
    incoming.push(file);
  }
  if (incoming.length === 0) {
    updateAttachmentPreview();
    return;
  }

  void Promise.all(incoming.map(readFileAsDataUrl)).then((results) => {
    for (const dataUrl of results) {
      if (dataUrl) admitComposerAttachment(dataUrl);
    }
    updateAttachmentPreview();
  });
}

function updateAttachmentPreview(): void {
  const bar = document.getElementById('sp-attachment-bar');
  if (!bar) return;
  clearChildren(bar);
  if (pendingAttachments.length === 0 && !composerAttachmentNotice) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'flex';
  for (let i = 0; i < pendingAttachments.length; i++) {
    const dataUrl = pendingAttachments[i]!;
    const chip = el('div', { class: 'sp-attachment-chip' });
    const thumb = el('img', {
      class: 'sp-attachment-thumb',
      src: dataUrl,
      alt: 'attachment',
      width: '48',
      height: '48',
    }) as HTMLImageElement;
    const removeBtn = el(
      'button',
      {
        class: 'sp-attachment-remove',
        title: 'Remove',
        'aria-label': `Remove attachment ${i + 1}`,
      },
      '×',
    );
    const idx = i;
    removeBtn.addEventListener('click', () => {
      pendingAttachments.splice(idx, 1);
      // Freeing a slot or bytes invalidates whatever the last rejection said.
      composerAttachmentNotice = null;
      updateAttachmentPreview();
    });
    chip.appendChild(thumb);
    chip.appendChild(removeBtn);
    bar.appendChild(chip);
  }
  if (composerAttachmentNotice) {
    bar.appendChild(
      el(
        'div',
        { class: 'sp-attachment-notice', role: 'status', 'aria-live': 'polite' },
        composerAttachmentNotice,
      ),
    );
  }
}

function updateToolsButton(): void {
  const btn = document.getElementById('sp-tools-btn');
  const dropdown = document.getElementById('sp-tools-dropdown');
  if (!btn || !dropdown) return;

  const count = discoveredTools.length;
  btn.replaceChildren(renderIcon(Plug, 14), document.createTextNode(` Tools (${count})`));

  if (count === 0) {
    btn.classList.remove('has-context');
    setChild(dropdown, {
      tag: 'div',
      className: 'sp-tools-empty',
      text: 'No tools discovered on this page',
    });
    return;
  }

  btn.classList.add('has-context');
  clearChildren(dropdown);
  for (const tool of discoveredTools) {
    const item = el('div', { class: 'sp-tool-item' });
    item.appendChild(el('div', { class: 'sp-tool-item-name' }, tool.name));
    if (tool.description) {
      // SECURITY (M-09 audit 2026-05-19): prefix tool descriptions with the
      // source hostname so users can distinguish extension-supplied copy
      // from page-supplied copy. Defends against page tool-poisoning
      // attempts that imitate extension UI prompts (Invariant Labs TPA).
      const prefixed = currentPageHostname
        ? `(from ${currentPageHostname}) ${tool.description}`
        : tool.description;
      item.appendChild(el('div', { class: 'sp-tool-item-desc' }, prefixed));
    }
    item.addEventListener('click', () => {
      const inputEl = document.getElementById('sp-input') as HTMLTextAreaElement | null;
      if (inputEl) {
        inputEl.value = `Use the ${tool.name} tool to `;
        inputEl.focus();
        autoResizeInput(inputEl);
      }
      dropdown.classList.remove('open');
    });
    dropdown.appendChild(item);
  }
}

function clearDiscoveredTools(): void {
  if (discoveredTools.length === 0) return;
  discoveredTools = [];
  updateToolsButton();
}

function applyWebMCPToolsUpdate(message: unknown): boolean {
  const tools = selectWebMCPToolsForActivePage(message, activeWebMCPPage);
  if (!tools) return false;
  discoveredTools = tools;
  updateToolsButton();
  return true;
}

function updateActivePageIdentity(tabId: unknown, url: string, forceInvalidate = false): void {
  let nextIdentity = createActiveWebMCPPageIdentity(tabId, url, webMCPPageGeneration);
  const identityChanged =
    nextIdentity?.tabId !== activeWebMCPPage?.tabId || nextIdentity?.url !== activeWebMCPPage?.url;
  if (forceInvalidate || identityChanged) {
    webMCPPageGeneration += 1;
    clearDiscoveredTools();
    nextIdentity = createActiveWebMCPPageIdentity(tabId, url, webMCPPageGeneration);
  }
  activeWebMCPPage = nextIdentity;
  currentPageHostname = pageChipLabel(url);
  setBlockedState(isRestrictedUrl(url));
  updateContextButton();
}

function refreshWebMCPToolsForActivePage(identity: ActiveWebMCPPageIdentity): void {
  void chrome.runtime
    .sendMessage({
      type: 'WEBMCP_DISCOVER_TOOLS',
      tabId: identity.tabId,
      pageGeneration: identity.pageGeneration,
    })
    .then((response: unknown) => {
      // The request may resolve after a tab switch/navigation. Attribution is
      // rechecked against the current identity before anything is displayed.
      applyWebMCPToolsUpdate(response);
    })
    .catch(() => {
      // Restricted/unallowlisted pages legitimately have no content script.
    });
}

function autoResizeInput(ta: HTMLTextAreaElement): void {
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
}

/**
 * Returns true for URLs where content scripts cannot run and page context is
 * unavailable: browser internal pages, extension pages, data: URIs, etc.
 */
function isRestrictedUrl(url: string): boolean {
  if (!url) return false;
  const RESTRICTED = ['chrome://', 'chrome-extension://', 'edge://', 'about:', 'data:', 'file:///'];
  return RESTRICTED.some((prefix) => url.startsWith(prefix));
}

/**
 * Toggles the restricted-page notice. Managed Cloud chat remains available;
 * only page context and browser automation are disabled.
 */
function setBlockedState(blocked: boolean): void {
  const blockedEl = document.getElementById('sp-blocked');
  const promptChips = document.getElementById('sp-prompt-chips');
  const inputEl = document.getElementById('sp-input') as HTMLTextAreaElement | null;

  if (!blockedEl) return;
  const availability = getChromeSurfaceAvailability({
    nativeConnected: _ctx.isConnected,
    restrictedPage: blocked,
  });

  if (blocked) {
    blockedEl.classList.add('visible');
    if (promptChips) promptChips.classList.add('hidden');
    _ctx.pendingPageContext = null;
  } else {
    blockedEl.classList.remove('visible');
    // Re-show prompt chips only if there are no messages yet
    if (promptChips && _ctx.messages.length === 0) promptChips.classList.remove('hidden');
  }
  if (inputEl) {
    inputEl.disabled = !availability.chat || managedCloudChatState !== 'ready';
    if (managedCloudChatState === 'ready') {
      inputEl.placeholder = availability.pageContext
        ? 'Ask anything... (/ for commands)'
        : 'Ask anything (page context unavailable)';
    }
  }
  updateContextButton();
  if (contextBtn) {
    contextBtn.disabled = !availability.pageContext;
    contextBtn.title = availability.pageContext
      ? 'Attach page content to next message'
      : 'Page context is unavailable on this browser page';
  }
  updateSendButton();
}

/**
 * Queries the active tab URL and updates the persistent context chip label.
 * Safe to call multiple times; falls back gracefully when tab API is unavailable.
 */
function refreshPageHostname(forceInvalidate = false): void {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) return;
      const tab = tabs[0];
      const url = tab?.url ?? '';
      updateActivePageIdentity(tab?.id, url, forceInvalidate);
      if (activeWebMCPPage) refreshWebMCPToolsForActivePage(activeWebMCPPage);
    });
  } catch {
    // chrome.tabs unavailable in test/SSR environment — ignore
  }
}

/**
 * Builds the first-run onboarding carousel overlay and appends it (hidden) to
 * document.body.  Call showOnboardingOverlay() after the async storage check
 * to reveal it.  The overlay sits at z-index 9999 so it covers the composer
 * and toolbar without needing to toggle their display state.
 *
 * Steps:
 *  0 — Beta disclosure ("I understand")
 *  1 — Automate repetitive tasks ("Next")
 *  2 — Tab group access ("Next")
 *  3 — Shortcuts ("Let's go" → dismisses)
 *  4 — Pin hint (inline inside carousel, same dismiss path)
 */
function buildOnboardingOverlay(onComplete: () => void): void {
  const TOTAL_STEPS = 5;
  let currentStep = 0;

  // ── Helper: SVG icons (inline, CSP-safe) ────────────────────────────────

  const flaskSvg = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M9 3h6M9 3v7l-4 8a2 2 0 0 0 1.8 2.9h10.4A2 2 0 0 0 19 18.9L15 10V3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="9.5" cy="16" r="0.75" fill="currentColor"/>
    <circle cx="13" cy="17.5" r="0.75" fill="currentColor"/>
  </svg>`;

  const eyeSvg = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
  </svg>`;

  const warnSvg = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="12" cy="17" r="0.75" fill="currentColor"/>
  </svg>`;

  // Hero SVG for step 1 (stacked browser windows with checklist glyph)
  const browserStackSvg = `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="6" y="18" width="56" height="42" rx="6" stroke="var(--agi-ext-border-strong)" stroke-width="1.5" fill="var(--agi-ext-surface)"/>
    <rect x="12" y="12" width="56" height="42" rx="6" stroke="var(--agi-ext-border-strong)" stroke-width="1.5" fill="var(--agi-ext-surface)"/>
    <rect x="18" y="8" width="56" height="42" rx="6" fill="var(--agi-ext-overlay)" stroke="var(--agi-ext-border-strong)" stroke-width="1.5"/>
    <line x1="18" y1="19" x2="74" y2="19" stroke="var(--agi-ext-border)" stroke-width="1"/>
    <circle cx="25" cy="14" r="2.5" fill="var(--agi-ext-accent)"/>
    <line x1="30" y1="26" x2="50" y2="26" stroke="var(--agi-ext-text-muted)" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="30" y1="33" x2="60" y2="33" stroke="var(--agi-ext-text-muted)" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="30" y1="40" x2="54" y2="40" stroke="var(--agi-ext-text-muted)" stroke-width="1.5" stroke-linecap="round"/>
    <polyline points="24,25 27,28 31,22" stroke="var(--agi-ext-accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="24,32 27,35 31,29" stroke="var(--agi-ext-accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <polyline points="24,39 27,42 31,36" stroke="var(--agi-ext-accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  // Hero SVG for step 2 (browser tab group)
  const tabGroupSvg = `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="8" y="28" width="64" height="42" rx="6" fill="var(--agi-ext-overlay)" stroke="var(--agi-ext-border-strong)" stroke-width="1.5"/>
    <rect x="10" y="14" width="22" height="16" rx="4" fill="var(--agi-ext-accent)" opacity="0.85"/>
    <rect x="34" y="18" width="18" height="12" rx="3" fill="var(--agi-ext-surface)" stroke="var(--agi-ext-border-strong)" stroke-width="1"/>
    <rect x="54" y="18" width="14" height="12" rx="3" fill="var(--agi-ext-surface)" stroke="var(--agi-ext-border-strong)" stroke-width="1"/>
    <text x="21" y="25" font-size="7" fill="var(--agi-ext-on-accent)" text-anchor="middle" font-family="-apple-system,sans-serif" font-weight="600">AGI</text>
    <line x1="16" y1="44" x2="64" y2="44" stroke="var(--agi-ext-border)" stroke-width="1"/>
    <rect x="14" y="50" width="52" height="8" rx="2" fill="var(--agi-ext-surface)"/>
    <rect x="14" y="62" width="40" height="4" rx="2" fill="var(--agi-ext-surface)"/>
  </svg>`;

  // Hero SVG for step 3 (the real Workflows shortcut surface)
  const shortcutMenuSvg = `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="10" y="16" width="60" height="48" rx="8" fill="var(--agi-ext-overlay)" stroke="var(--agi-ext-border-strong)" stroke-width="1.5"/>
    <text x="16" y="27" font-size="7" fill="var(--agi-ext-text-muted)" font-family="-apple-system,sans-serif" font-weight="600">WORKFLOWS</text>
    <rect x="14" y="32" width="52" height="13" rx="4" fill="var(--agi-ext-hover)"/>
    <circle cx="21" cy="38.5" r="3" fill="var(--agi-ext-accent)" opacity="0.22"/>
    <path d="M21.7 34.8 18.8 39h2l-.5 3.2 3-4.5h-2.1l.5-2.9z" fill="var(--agi-ext-accent)"/>
    <text x="27" y="41" font-size="7" fill="var(--agi-ext-text)" font-family="-apple-system,sans-serif">Saved shortcuts</text>
    <rect x="14" y="50" width="52" height="9" rx="4" fill="var(--agi-ext-surface)" stroke="var(--agi-ext-accent)" stroke-width="1"/>
    <text x="40" y="56.5" font-size="6.5" text-anchor="middle" fill="var(--agi-ext-accent)" font-family="-apple-system,sans-serif">+ Create shortcut</text>
  </svg>`;

  // Hero SVG for step 4 (extension card with pin icon highlighted)
  const pinHintSvg = `<svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="8" y="28" width="52" height="34" rx="6" fill="var(--agi-ext-overlay)" stroke="var(--agi-ext-border-strong)" stroke-width="1.5"/>
    <rect x="14" y="36" width="28" height="4" rx="2" fill="var(--agi-ext-surface)"/>
    <rect x="14" y="44" width="20" height="3" rx="1.5" fill="var(--agi-ext-surface)"/>
    <!-- pin icon in top-right of card, highlighted -->
    <circle cx="53" cy="35" r="10" fill="var(--agi-ext-accent)" opacity="0.15"/>
    <path d="M53 29l2 4h3l-2.5 3.5 1 4-3.5-2-3.5 2 1-4L48 33h3l2-4z" stroke="var(--agi-ext-accent)" stroke-width="1.2" stroke-linejoin="round" fill="none"/>
    <!-- arrow pointing to pin -->
    <path d="M44 50 Q42 42 48 37" stroke="var(--agi-ext-accent-secondary)" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <polyline points="46,36 48,37 47,39" stroke="var(--agi-ext-accent-secondary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  // ── Overlay container ────────────────────────────────────────────────────
  const overlay = el('div', {
    id: 'sp-onboarding-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Welcome to AGI — first-time setup',
  });

  // ── Skip button ─────────────────────────────────────────────────────────
  const header = el('div', { id: 'sp-onboarding-header' });
  const skipBtn = el(
    'button',
    { id: 'sp-onboarding-skip', 'aria-label': 'Skip onboarding' },
    'Skip',
  );
  header.appendChild(skipBtn);
  overlay.appendChild(header);

  // ── Steps container ──────────────────────────────────────────────────────
  const body = el('div', { id: 'sp-onboarding-body' });

  // Step 0: Beta disclosure
  const step0 = el('div', {
    class: 'sp-ob-step active',
    'data-step': '0',
    role: 'tabpanel',
    'aria-label': 'Step 1 of 5',
  });
  step0.appendChild(el('div', { class: 'sp-ob-title' }, 'This is a beta feature'));
  const rows0 = el('div', { class: 'sp-ob-rows' });

  // Row 1: flask
  const row0a = el('div', { class: 'sp-ob-row' });
  const row0aIcon = el('div', { class: 'sp-ob-row-icon', 'aria-hidden': 'true' });
  appendSvgString(row0aIcon, flaskSvg);
  const row0aText = el(
    'div',
    { class: 'sp-ob-row-text' },
    'This is an early beta with risks distinct from other AGI products. You are fully responsible for all actions taken with it.',
  );
  row0a.appendChild(row0aIcon);
  row0a.appendChild(row0aText);
  rows0.appendChild(row0a);

  // Row 2: eye
  const row0b = el('div', { class: 'sp-ob-row' });
  const row0bIcon = el('div', { class: 'sp-ob-row-icon', 'aria-hidden': 'true' });
  appendSvgString(row0bIcon, eyeSvg);
  const row0bText = el(
    'div',
    { class: 'sp-ob-row-text' },
    'AGI can take screenshots of the page when responding. For privacy, avoid using it on sensitive sites like health, banking, or dating platforms.',
  );
  row0b.appendChild(row0bIcon);
  row0b.appendChild(row0bText);
  rows0.appendChild(row0b);

  // Row 3: warning (danger text + learn more)
  const row0c = el('div', { class: 'sp-ob-row' });
  const row0cIcon = el('div', { class: 'sp-ob-row-icon danger', 'aria-hidden': 'true' });
  appendSvgString(row0cIcon, warnSvg);
  const row0cText = el('div', { class: 'sp-ob-row-text danger' });
  row0cText.appendChild(
    document.createTextNode(
      'Malicious actors can hide instructions in websites, emails, and documents that trick AI into taking harmful actions without your knowledge. ',
    ),
  );
  const learnMoreBtn = el('button', { class: 'sp-ob-learn-more' }, 'Learn more');
  learnMoreBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://agiworkforce.com/security' }).catch(() => {});
  });
  row0cText.appendChild(learnMoreBtn);
  row0c.appendChild(row0cIcon);
  row0c.appendChild(row0cText);
  rows0.appendChild(row0c);

  step0.appendChild(rows0);
  body.appendChild(step0);

  // Step 1: Value prop — automate repetitive tasks
  const step1 = el('div', {
    class: 'sp-ob-step',
    'data-step': '1',
    role: 'tabpanel',
    'aria-label': 'Step 2 of 5',
  });
  const step1Hero = el('div', { class: 'sp-ob-hero' });
  appendSvgString(step1Hero, browserStackSvg);
  step1.appendChild(step1Hero);
  step1.appendChild(el('div', { class: 'sp-ob-title' }, 'Automate your repetitive tasks'));
  step1.appendChild(
    el(
      'div',
      { class: 'sp-ob-body' },
      'AGI can take on multi-step work like QA testing, researching sales leads, and data entry across multiple sites. You can focus elsewhere knowing AGI is working in the background.',
    ),
  );
  body.appendChild(step1);

  // Step 2: Tab group access
  const step2 = el('div', {
    class: 'sp-ob-step',
    'data-step': '2',
    role: 'tabpanel',
    'aria-label': 'Step 3 of 5',
  });
  const step2Hero = el('div', { class: 'sp-ob-hero' });
  appendSvgString(step2Hero, tabGroupSvg);
  step2.appendChild(step2Hero);
  step2.appendChild(el('div', { class: 'sp-ob-title' }, 'AGI has tab group access'));
  step2.appendChild(
    el(
      'div',
      { class: 'sp-ob-body' },
      'When AGI is open in a tab group, it can access the URL, context, and information of all the tabs in that group.',
    ),
  );
  body.appendChild(step2);

  // Step 3: Shortcuts
  const step3 = el('div', {
    class: 'sp-ob-step',
    'data-step': '3',
    role: 'tabpanel',
    'aria-label': 'Step 4 of 5',
  });
  const step3Hero = el('div', { class: 'sp-ob-hero' });
  appendSvgString(step3Hero, shortcutMenuSvg);
  step3.appendChild(step3Hero);
  step3.appendChild(el('div', { class: 'sp-ob-title' }, 'Use Workflows to save time'));
  step3.appendChild(
    el(
      'div',
      { class: 'sp-ob-body' },
      'Shortcuts make repeated instructions one click away. Open Workflows from the AGI menu to create, run, and manage them.',
    ),
  );
  body.appendChild(step3);

  // Step 4: Pin hint
  const step4 = el('div', {
    class: 'sp-ob-step',
    'data-step': '4',
    role: 'tabpanel',
    'aria-label': 'Step 5 of 5',
  });
  const step4Hero = el('div', { class: 'sp-ob-hero' });
  appendSvgString(step4Hero, pinHintSvg);
  step4.appendChild(step4Hero);
  step4.appendChild(el('div', { class: 'sp-ob-title' }, 'Pin AGI for quick access'));
  step4.appendChild(
    el(
      'div',
      { class: 'sp-ob-body' },
      'Click the pin icon in the top-right corner of the extension window to keep AGI always one click away.',
    ),
  );
  body.appendChild(step4);

  overlay.appendChild(body);

  // ── Footer: progress dots + nav buttons ─────────────────────────────────
  const footer = el('div', { id: 'sp-onboarding-footer' });

  const dotsRow = el('div', {
    class: 'sp-ob-dots',
    role: 'tablist',
    'aria-label': 'Onboarding steps',
  });
  const dots: HTMLElement[] = [];
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const dot = el('div', {
      class: i === 0 ? 'sp-ob-dot active' : 'sp-ob-dot',
      role: 'tab',
      'aria-label': `Step ${i + 1}`,
    });
    dots.push(dot);
    dotsRow.appendChild(dot);
  }
  footer.appendChild(dotsRow);

  const navRow = el('div', { class: 'sp-ob-nav' });
  const backBtn = el(
    'button',
    { class: 'sp-ob-btn-back', 'aria-label': 'Back', hidden: '' },
    'Back',
  );
  const nextBtn = el(
    'button',
    { class: 'sp-ob-btn-next', 'aria-label': 'Continue — step 1 of 5' },
    'I understand',
  );
  navRow.appendChild(backBtn);
  navRow.appendChild(nextBtn);
  footer.appendChild(navRow);
  overlay.appendChild(footer);

  // ── Step labels for each step's primary button ───────────────────────────
  const stepLabels: string[] = ['I understand', 'Next', 'Next', "Let's go", 'Done'];
  const stepAriaLabels: string[] = [
    'Continue — step 1 of 5',
    'Continue — step 2 of 5',
    'Continue — step 3 of 5',
    'Continue — step 4 of 5',
    'Dismiss onboarding',
  ];

  // ── Navigation logic ─────────────────────────────────────────────────────
  function dismiss(): void {
    markOnboardingComplete();
    overlay.classList.remove('visible');
    onComplete();
  }

  function goToStep(step: number): void {
    const steps = body.querySelectorAll<HTMLElement>('.sp-ob-step');
    steps.forEach((s, i) => {
      s.classList.toggle('active', i === step);
    });
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === step);
    });
    currentStep = step;
    // Back button: hidden on step 0
    if (step === 0) {
      backBtn.setAttribute('hidden', '');
    } else {
      backBtn.removeAttribute('hidden');
    }
    // Primary button label
    nextBtn.textContent = stepLabels[step] ?? 'Next';
    nextBtn.setAttribute('aria-label', stepAriaLabels[step] ?? 'Continue');
    // Focus primary button on each step transition
    nextBtn.focus();
  }

  nextBtn.addEventListener('click', () => {
    if (currentStep < TOTAL_STEPS - 1) {
      goToStep(currentStep + 1);
    } else {
      dismiss();
    }
  });

  backBtn.addEventListener('click', () => {
    if (currentStep > 0) {
      goToStep(currentStep - 1);
    }
  });

  skipBtn.addEventListener('click', () => dismiss());

  // Esc key dismisses
  overlay.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
    }
  });

  document.body.appendChild(overlay);
}

/**
 * Reveals the onboarding carousel and focuses the primary button.
 * Called from the boot Promise.all once we confirm onboarding is incomplete.
 */
function showOnboardingOverlay(): void {
  const overlay = document.getElementById('sp-onboarding-overlay');
  if (!overlay) return;
  overlay.classList.add('visible');
  // Focus the primary CTA for keyboard users
  const nextBtn = overlay.querySelector<HTMLButtonElement>('.sp-ob-btn-next');
  if (nextBtn) {
    // Defer slightly so the overlay is painted before focus
    setTimeout(() => nextBtn.focus(), 50);
  }
}

function buildUI(): void {
  clearChildren(document.body);

  const header = el('div', { id: 'sp-header' });
  const headerLeft = el('div', { id: 'sp-header-left' });

  // L-11 audit 2026-05-19: replaced innerHTML SVG injection with
  // DOMParser-based import. Same end result — static SVG literal rendered
  // into the wrapper — but no HTML parser involved.
  const logoEl = el('div', { id: 'sp-logo' });
  // AGI brand mark: 12 spokes radiating from center (inner r=4.6, outer r=9).
  // Spoke at index 0 (12 o'clock) uses amber/terra accent; others inherit text
  // color via currentColor. Geometry mirrors packages/ui/ui/src/AgiMark.tsx.
  const logoSvg = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="AGI" role="img">
    <line x1="12" y1="7.4" x2="12" y2="3" stroke="var(--agi-ext-brand,#da7756)" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="14.3" y1="8.016" x2="16.5" y2="4.206" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="15.984" y1="9.7" x2="19.794" y2="7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="16.6" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="15.984" y1="14.3" x2="19.794" y2="16.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="14.3" y1="15.984" x2="16.5" y2="19.794" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="12" y1="16.6" x2="12" y2="21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="9.7" y1="15.984" x2="7.5" y2="19.794" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="8.016" y1="14.3" x2="4.206" y2="16.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="7.4" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="8.016" y1="9.7" x2="4.206" y2="7.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="9.7" y1="8.016" x2="7.5" y2="4.206" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
  appendSvgString(logoEl, logoSvg);
  headerLeft.appendChild(logoEl);

  const titleWrap = el('div', {});
  titleWrap.appendChild(el('div', { id: 'sp-title' }, 'AGI'));
  headerLeft.appendChild(titleWrap);

  const modelSelectorWrap = el('div', { class: 'sp-model-selector-wrap' });
  const modelSelectorBtn = el('button', {
    id: 'sp-model-selector-btn',
    type: 'button',
    'aria-label': 'Select model',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  });
  const modelBadge = document.createElement('span');
  modelBadge.id = 'sp-model-badge';
  modelBadge.textContent = 'AI Assistant';
  const chevron = document.createElement('span');
  chevron.className = 'sp-chevron';
  chevron.replaceChildren(renderIcon(ChevronDown, 12));
  modelSelectorBtn.replaceChildren(modelBadge, chevron);
  const modelDropdownEl = el('div', {
    id: 'sp-model-dropdown',
    role: 'menu',
    'aria-label': 'Available models',
  });

  /**
   * Provider ids that have a bundled SVG under icons/providers/. Kept in sync
   * with scripts/vendor-provider-icons.mjs output. Any provider id NOT in this
   * set resolves to the generic glyph up front so a missing icon never emits a
   * net::ERR_FILE_NOT_FOUND console error (an <img> onerror handler cannot
   * suppress the network error once the 404 request has been made).
   */
  const BUNDLED_PROVIDER_ICON_IDS: ReadonlySet<string> = new Set([
    'agi-cloud',
    'anthropic',
    'custom-openai-compatible',
    'deepseek',
    'google',
    'lmstudio',
    'managed_cloud',
    'mistral',
    'moonshot',
    'nvidia_nim',
    'ollama',
    'open_router',
    'openai',
    'perplexity',
    'qwen',
    'runway',
    'xai',
    'zhipu',
  ]);

  /** Generic provider glyph used when a provider has no bundled icon. */
  const GENERIC_PROVIDER_ICON_ID = 'custom-openai-compatible';

  /**
   * Resolves the chrome-extension URL for a provider logo SVG. Unknown
   * provider ids resolve to the generic glyph instead of a 404ing URL.
   * Falls back to undefined when chrome.runtime is unavailable (tests / SSR).
   */
  function resolveProviderLogoUrl(providerId: string): string | undefined {
    const iconId = BUNDLED_PROVIDER_ICON_IDS.has(providerId)
      ? providerId
      : GENERIC_PROVIDER_ICON_ID;
    try {
      return chrome.runtime.getURL(`icons/providers/${iconId}.svg`);
    } catch {
      return undefined;
    }
  }

  /**
   * Builds a single model-option row with:
   *  - 16px provider logo (or circle placeholder)
   *  - Model name
   *  - 1-line capability sub-label (Fastest / Balanced / Most capable)
   *  - Checkmark on the selected item
   */
  function buildModelOptionRow(m: ManagedModelPickerOption, isSelected: boolean): HTMLElement {
    const isAuto = m.value === 'auto';

    const classes = [
      'sp-model-option',
      isSelected ? 'selected' : '',
      isAuto ? 'sp-model-option-auto' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const opt = el('button', {
      class: classes,
      type: 'button',
      role: 'menuitemradio',
      'aria-checked': String(isSelected),
    });

    // Logo / dot
    if (isAuto) {
      opt.appendChild(el('div', { class: 'sp-model-auto-dot' }));
    } else if (m.provider) {
      const logoUrl = resolveProviderLogoUrl(m.provider);
      if (logoUrl) {
        const img = el('img', {
          class: 'sp-model-option-logo',
          src: logoUrl,
          alt: m.provider,
          width: '16',
          height: '16',
        }) as HTMLImageElement;
        img.addEventListener('error', () => {
          // Defensive: allowlisted icon unexpectedly missing from the bundle.
          // Retry once with the generic glyph, then degrade to a placeholder.
          const genericUrl = resolveProviderLogoUrl(GENERIC_PROVIDER_ICON_ID);
          if (genericUrl && img.src !== genericUrl) {
            img.src = genericUrl;
            return;
          }
          const ph = el('div', { class: 'sp-model-option-logo-placeholder' });
          img.replaceWith(ph);
        });
        opt.appendChild(img);
      } else {
        opt.appendChild(el('div', { class: 'sp-model-option-logo-placeholder' }));
      }
    } else {
      opt.appendChild(el('div', { class: 'sp-model-option-logo-placeholder' }));
    }

    // Text block: name + sub-label
    const textBlock = el('div', { class: 'sp-model-option-text' });
    textBlock.appendChild(el('span', { class: 'sp-model-option-name' }, m.label));
    if (m.capability) {
      const capabilityLabel = getManagedCapabilityLabel(m);
      if (capabilityLabel) {
        textBlock.appendChild(el('span', { class: 'sp-model-option-sublabel' }, capabilityLabel));
      }
    } else if (isAuto) {
      textBlock.appendChild(
        el('span', { class: 'sp-model-option-sublabel' }, 'Automatic provider selection'),
      );
    }
    opt.appendChild(textBlock);

    // Every rendered model came from authenticated server admission intersected
    // with this extension build's capability catalog, so there is no second,
    // stale client-side plan gate here.
    const checkCell = el('span', { class: 'sp-model-option-check' });
    if (isSelected) checkCell.appendChild(renderIcon(Check, 12));
    opt.appendChild(checkCell);
    opt.addEventListener('click', () => {
      if (_ctx.selectedModel !== m.value) {
        _ctx.conversationGeneration += 1;
        _ctx.currentModelKey = undefined;
        _ctx.previousTaskType = undefined;
        _ctx.reasoningEffort =
          _ctx.quickMode || m.value === 'auto' || m.value.startsWith('auto-')
            ? undefined
            : resolveModelEffort(m.value, _ctx.reasoningEffort);
      }
      _ctx.selectedModel = m.value;
      updateModelBadge(m.value);
      renderModelDropdown();
      refreshEffortUI();
      modelDropdownEl.classList.remove('open');
      modelSelectorBtn.classList.remove('open');
      modelSelectorBtn.setAttribute('aria-expanded', 'false');
      saveMessages();
    });

    return opt;
  }

  function renderModelDropdown(): void {
    clearChildren(modelDropdownEl);
    const modelOptions = getManagedModelPickerOptions(managedModelAccess);

    // 0. Provider count badge header
    const pickerHeader = el('div', { class: 'sp-model-picker-header' });
    pickerHeader.appendChild(el('span', { class: 'sp-model-picker-title' }, 'Select model'));
    // FIX (audit batch-222 [LOW] documentation drift, 2026-06-13): derive the
    // provider count from the actual model options instead of a hardcoded "13+".
    const providerCount = new Set(
      modelOptions
        .map((option) => option.provider)
        .filter((provider): provider is string => Boolean(provider)),
    ).size;
    const providerCountLabel =
      providerCount === 0
        ? 'Sign in for models'
        : `${providerCount} ${providerCount === 1 ? 'provider' : 'providers'}`;
    pickerHeader.appendChild(el('span', { class: 'provider-count-badge' }, providerCountLabel));
    modelDropdownEl.appendChild(pickerHeader);

    // 1. "Best (auto)" as the first option, visually distinct
    const autoOpt = modelOptions.find((model) => model.value === 'auto');
    if (autoOpt) {
      modelDropdownEl.appendChild(buildModelOptionRow(autoOpt, _ctx.selectedModel === 'auto'));
    }

    // 2. Collect non-auto options grouped by provider
    const nonAutoOptions = modelOptions.filter((model) => model.value !== 'auto');

    // Build an ordered map of provider -> options
    const grouped = new Map<string, ManagedModelPickerOption[]>();
    for (const m of nonAutoOptions) {
      const provKey = m.provider ?? '__unknown__';
      if (!grouped.has(provKey)) grouped.set(provKey, []);
      grouped.get(provKey)!.push(m);
    }

    // Render in canonical provider order, then any remainder
    const rendered = new Set<string>();
    for (const pid of PROVIDER_GROUP_ORDER) {
      const opts = grouped.get(pid);
      if (!opts || opts.length === 0) continue;
      rendered.add(pid);
      const provDisplay = PROVIDER_DISPLAY[pid];
      const headerLabel = provDisplay?.label ?? pid;
      modelDropdownEl.appendChild(el('div', { class: 'sp-model-group-header' }, headerLabel));
      for (const m of opts) {
        modelDropdownEl.appendChild(buildModelOptionRow(m, _ctx.selectedModel === m.value));
      }
    }

    // Any providers not in PROVIDER_GROUP_ORDER
    for (const [provKey, opts] of grouped.entries()) {
      if (rendered.has(provKey)) continue;
      modelDropdownEl.appendChild(
        el(
          'div',
          { class: 'sp-model-group-header' },
          provKey !== '__unknown__' ? provKey : 'Other',
        ),
      );
      for (const m of opts) {
        modelDropdownEl.appendChild(buildModelOptionRow(m, _ctx.selectedModel === m.value));
      }
    }

    // 3. Thinking toggle at the bottom
    const toggleRow = el('div', { class: 'sp-thinking-toggle-row' });
    const toggleLabel = el(
      'label',
      {
        class: `sp-thinking-toggle-label${_ctx.thinkingEnabled ? ' active' : ''}`,
        for: 'sp-thinking-toggle',
      },
      'Extended thinking',
    );
    const toggleInput = el('input', {
      id: 'sp-thinking-toggle',
      class: 'sp-thinking-toggle',
      type: 'checkbox',
      'aria-label': 'Extended thinking',
    }) as HTMLInputElement;
    toggleInput.checked = _ctx.thinkingEnabled;
    toggleInput.addEventListener('change', () => {
      _ctx.thinkingEnabled = toggleInput.checked;
      chrome.storage.local.set({ agi_thinking_enabled: _ctx.thinkingEnabled }).catch(() => {});
      if (_ctx.thinkingEnabled) {
        toggleLabel.classList.add('active');
      } else {
        toggleLabel.classList.remove('active');
      }
    });
    toggleRow.appendChild(toggleLabel);
    toggleRow.appendChild(toggleInput);
    modelDropdownEl.appendChild(toggleRow);
  }
  refreshModelPickerUI = () => {
    updateModelBadge(_ctx.selectedModel);
    renderModelDropdown();
    refreshEffortUI();
  };
  modelSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpenNow = modelDropdownEl.classList.toggle('open');
    modelSelectorBtn.classList.toggle('open', isOpenNow);
    modelSelectorBtn.setAttribute('aria-expanded', String(isOpenNow));
    if (isOpenNow) {
      modelDropdownEl.querySelector<HTMLButtonElement>('.sp-model-option.selected')?.focus();
    }
  });
  document.addEventListener('click', (e: MouseEvent) => {
    if (!modelSelectorWrap.contains(e.target as Node)) {
      modelDropdownEl.classList.remove('open');
      modelSelectorBtn.classList.remove('open');
      modelSelectorBtn.setAttribute('aria-expanded', 'false');
    }
  });
  chrome.storage.local.get(['agi_thinking_enabled'], (result) => {
    if (chrome.runtime.lastError) return;
    const storedThinking = result['agi_thinking_enabled'] as boolean | undefined;
    if (storedThinking !== undefined) {
      _ctx.thinkingEnabled = storedThinking;
    }
    updateModelBadge(_ctx.selectedModel);
    renderModelDropdown();
  });
  modelSelectorWrap.appendChild(modelSelectorBtn);
  modelSelectorWrap.appendChild(modelDropdownEl);
  headerLeft.appendChild(modelSelectorWrap);
  header.appendChild(headerLeft);

  const headerRight = el('div', { id: 'sp-header-right' });

  // ── Recent chats ──────────────────────────────────────────────────────────
  const historyBtn = el('button', {
    class: 'sp-icon-btn',
    id: 'sp-history-btn',
    title: 'Recent chats',
    'aria-label': 'Recent chats',
  });
  historyBtn.appendChild(renderIcon(Clock, 16));
  headerRight.appendChild(historyBtn);

  // ── ＋ new chat button ─────────────────────────────────────────────────────
  const newChatBtn = el('button', {
    class: 'sp-icon-btn',
    id: 'sp-new-chat-btn',
    title: 'New chat',
    'aria-label': 'New chat',
  });
  newChatBtn.appendChild(renderIcon(FilePen, 16));
  newChatBtn.addEventListener('click', () => {
    cancelCurrentManagedStream(false);
    resetConversationView();
    // The header is visible from Workflows / Computer Use too, where this used to
    // reset the transcript behind a display:none panel and look like a no-op.
    switchTab('chat');
  });
  headerRight.appendChild(newChatBtn);

  // ── Quota badge (cloud free-prompts remaining) ─────────────────────────────
  // Built in the drawer section block but inserted into the header here so it
  // appears between the new-chat button and the menu button.
  // `quotaBadgeEl` is defined later when the drawer is built; we use a late
  // reference via getElementById at reveal time so the element is available
  // after the initial DOM pass. For the header we create a placeholder span
  // that becomes the actual badge once the drawer code runs.
  // NOTE: quotaBadgeEl is declared via `let` in the drawer closure below and
  // appended to headerRight there. We reserve the slot here via a wrapper so
  // the layout order is correct.
  const quotaBadgeSlot = el('span', { id: 'sp-quota-badge-slot' });
  headerRight.appendChild(quotaBadgeSlot);

  // ── ⋮ menu button ─────────────────────────────────────────────────────────
  const menuBtn = el('button', {
    class: 'sp-icon-btn',
    id: 'sp-menu-btn',
    title: 'More',
    'aria-label': 'Open AGI menu',
  });
  menuBtn.textContent = '⋮';
  headerRight.appendChild(menuBtn);
  header.appendChild(headerRight);
  document.body.appendChild(header);

  // ── Helper: history load+restore (shared by drawer history section) ────────
  function formatHistoryDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  async function restoreHistoryEntry(conversationId: string): Promise<boolean> {
    const ownerAtStart = _ctx.managedCloudOwner;
    if (!ownerAtStart || _ctx.isStreaming || historyRestoreInProgress) return false;
    const restoreToken = ++historyRestoreToken;
    const restoreGeneration = _ctx.conversationGeneration;
    const restoreIsCurrent = (): boolean =>
      historyRestoreToken === restoreToken &&
      _ctx.conversationGeneration === restoreGeneration &&
      sameManagedCloudOwner(_ctx.managedCloudOwner, ownerAtStart) &&
      !_ctx.isStreaming;
    historyRestoreInProgress = true;
    updateSendButton();
    try {
      const entry = await getConversation(ownerAtStart, conversationId);
      if (!entry || !restoreIsCurrent()) return false;
      const scope = await getConversationScope();
      if (!restoreIsCurrent()) return false;
      const conversationOwner = await claimSelectedConversationOwner(scope, ownerAtStart, entry.id);
      if (!restoreIsCurrent()) {
        await restoreConversationOwnerIfCurrent(
          scope,
          ownerAtStart,
          conversationOwner.conversationId,
          _ctx.conversationId,
        );
        return false;
      }
      if (_ctx.streamTimeoutHandle) {
        clearTimeout(_ctx.streamTimeoutHandle);
        _ctx.streamTimeoutHandle = null;
      }
      _ctx.messages.length = 0;
      _ctx.lastRenderedCount = 0;
      _ctx.needsMessageRebuild = true;
      _ctx.isStreaming = false;
      _ctx.currentStreamId = null;
      _ctx.pendingPageContext = null;
      _ctx.conversationGeneration += 1;
      // Opening history is a read. Adopt the selected id directly unless the
      // atomic session-owner claim found another live window using it.
      _ctx.conversationId = conversationOwner.conversationId;
      _ctx.selectedModel = normalizeModelId(entry.routing.selectedModel) ?? 'auto';
      _ctx.currentModelKey = entry.routing.currentModelKey;
      _ctx.previousTaskType = entry.routing.previousTaskType;
      const effortModel =
        _ctx.selectedModel === 'auto' || _ctx.selectedModel.startsWith('auto-')
          ? _ctx.currentModelKey
          : _ctx.selectedModel;
      _ctx.reasoningEffort = effortModel
        ? resolveModelEffort(effortModel, entry.routing.effort)
        : undefined;
      _ctx.messages.push(
        ...entry.messages
          .slice(-MAX_STORED_MESSAGES)
          .map((message) =>
            hydrateStoredChatMessage(
              message,
              `h-${message.timestamp}-${crypto.randomUUID().slice(0, 6)}`,
            ),
          ),
      );
      refreshModelPickerUI();
      refreshEffortUI();
      updateContextButton();
      updateSendButton();
      renderMessages();
      scrollToBottom();
      const expectedGeneration = _ctx.conversationGeneration;
      if (conversationOwner.forked) {
        try {
          // A real cross-window collision owns a distinct durable branch so a
          // panel reload cannot discard the in-memory copy.
          await persistMessages();
        } catch (err) {
          console.warn('[SidePanel] failed to persist browser conversation branch:', err);
        }
      }
      resumeLatestStoredManagedRun(expectedGeneration);
      return true;
    } finally {
      historyRestoreInProgress = false;
      updateSendButton();
    }
  }

  // Install the module-scope hook so notification clicks, the boot sequence and
  // the Workflows task rows can open a stored background result through the
  // same restore path a history entry uses.
  openStoredConversation = async (conversationId: string): Promise<boolean> => {
    try {
      const restored = await restoreHistoryEntry(conversationId);
      if (!restored) return false;
      // Restoring while Workflows or Computer Use is showing would put the
      // conversation behind whatever tab the click came from.
      switchTab('chat');
      return true;
    } catch (err) {
      console.warn('[SidePanel] failed to open stored conversation:', err);
      return false;
    }
  };

  // #sp-settings-bar removed in Phase 3: the drawer's Bridge URL section
  // supersedes it. The bridge-url save logic is in the drawer (drawerSaveBridgeUrl).
  // bridgeUrlInput stub kept as an invisible element for legacy code that calls
  // document.getElementById('sp-bridge-url-input').
  const bridgeUrlInput = el('input', {
    id: 'sp-bridge-url-input',
    type: 'hidden',
  }) as HTMLInputElement;
  document.body.appendChild(bridgeUrlInput);

  // ── AGI menu drawer ────────────────────────────────────────────────────────
  // The popup has been retired. All pairing, allowlist, memory, cloud-unlock,
  // bridge-URL, tools, and chat-action controls live exclusively in this drawer.

  const drawerOverlay = el('div', { id: 'sp-drawer-overlay' });
  const drawer = el('div', {
    id: 'sp-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'AGI menu',
    // Closed on first paint, so it must start inert too — otherwise the very
    // first Tab press from the composer lands inside the hidden drawer.
    inert: '',
  });

  let drawerReturnFocus: HTMLElement = menuBtn;

  /**
   * Turn a Chrome extension-internals error into a sentence with a next step.
   *
   * These strings came straight from chrome.runtime and were shown verbatim:
   * "Autofill failed: Could not establish connection. Receiving end does not
   * exist." That describes the extension's message port, not anything the user
   * did or can fix, and it reads as a crash. The underlying conditions are all
   * ordinary and recoverable — the content script has not loaded on this tab
   * yet, or the page is one extensions may not touch.
   *
   * Unrecognised errors keep their original text rather than being swallowed by
   * a generic apology: an unknown failure the user can quote to support beats a
   * friendly sentence that hides it.
   */
  function explainExtensionFailure(message: string): string {
    if (/Receiving end does not exist|Could not establish connection/i.test(message)) {
      return "AGI isn't running on this page yet. Reload the tab, then try again.";
    }
    if (/Cannot access|extension manifest|chrome:\/\/|blocked by the extension/i.test(message)) {
      return "AGI can't run on this page. Chrome blocks extensions on its own pages and on the Web Store — open an ordinary site and try again.";
    }
    if (/The tab was closed|No tab with id/i.test(message)) {
      return 'That tab was closed before the action finished.';
    }
    return `Autofill failed: ${message}`;
  }

  function openDrawer(trigger: HTMLElement = menuBtn): void {
    drawerReturnFocus = trigger;
    drawerOverlay.classList.add('open');
    drawer.classList.add('open');
    // The drawer is hidden by translateX(100%), which moves it off-screen but
    // leaves every control focusable — Tab walked through ~30 invisible buttons
    // before reaching the composer. `inert` removes them from the tab order AND
    // the accessibility tree without touching the slide transition, which
    // visibility:hidden or display:none would break.
    drawer.removeAttribute('inert');
    // Refresh dynamic content when drawer opens
    void refreshDrawerPairingState();
    void refreshDrawerAllowlist();
    void refreshDrawerMemory();
    void refreshDrawerStats();
    void refreshDrawerTabInfo();
    drawerClose.focus();
  }
  function closeDrawer(): void {
    drawerOverlay.classList.remove('open');
    drawer.classList.remove('open');
    drawer.setAttribute('inert', '');
    drawerReturnFocus.focus();
  }

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (drawer.classList.contains('open')) {
      closeDrawer();
    } else {
      openDrawer(menuBtn);
    }
  });
  drawerOverlay.addEventListener('click', closeDrawer);
  drawer.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeDrawer();
    }
  });

  // ── Drawer header ──────────────────────────────────────────────────────────
  const drawerHeader = el('div', { id: 'sp-drawer-header' });
  drawerHeader.appendChild(el('div', { id: 'sp-drawer-title' }, 'AGI in Chrome'));
  const drawerClose = el('button', { id: 'sp-drawer-close', 'aria-label': 'Close AGI menu' });
  drawerClose.appendChild(renderIcon(X, 14));
  drawerClose.addEventListener('click', closeDrawer);
  drawerHeader.appendChild(drawerClose);
  drawer.appendChild(drawerHeader);

  const drawerBody = el('div', { id: 'sp-drawer-body' });

  // ── Section 0: Chat actions ────────────────────────────────────────────────
  const chatActionsSection = el('div', { class: 'sp-drawer-section' });
  chatActionsSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'Chat'));
  const chatActionsRow = el('div', { class: 'sp-drawer-tools-row' });

  // History button — opens the conversation history dropdown (now inside drawer)
  const drawerHistoryBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-history-btn',
    title: 'Conversation history',
  });
  drawerHistoryBtn.appendChild(renderIcon(Clock, 13));
  drawerHistoryBtn.appendChild(document.createTextNode(' History'));

  // History sub-list inside drawer (inline, not a floating dropdown).
  // Styled via stylesheet classes, NOT element.style.cssText — the manifest's
  // style-src 'self' CSP blocks runtime cssText on extension pages.
  const drawerHistoryList = el('div', { id: 'sp-drawer-history-list', hidden: '' });
  const drawerHistorySearch = el('input', {
    id: 'sp-drawer-history-search',
    type: 'search',
    placeholder: 'Search recent chats',
    'aria-label': 'Search recent chats',
    maxlength: '200',
    autocomplete: 'off',
    hidden: '',
  }) as HTMLInputElement;
  let drawerHistoryEntries: ConversationEntry[] = [];

  function renderDrawerHistory(entries: ConversationEntry[]): void {
    clearChildren(drawerHistoryList);
    const filteredEntries = filterConversations(entries, drawerHistorySearch.value);
    if (filteredEntries.length === 0) {
      const emptyLabel =
        entries.length === 0 ? 'No saved conversations' : 'No matching conversations';
      const empty = el('div', { class: 'sp-drawer-history-empty' }, emptyLabel);
      drawerHistoryList.appendChild(empty);
      return;
    }
    for (const entry of filteredEntries) {
      // A real <button>: these rows have a click handler, so as <div>s they were
      // unreachable by keyboard and had no focus ring. The global
      // button:focus-visible rule supplies the ring for free.
      const item = el('button', { class: 'sp-drawer-history-item', type: 'button' });
      const textCol = el('div', { class: 'sp-drawer-history-text' });
      const title = el('div', { class: 'sp-drawer-history-title' }, entry.title);
      const date = el('div', { class: 'sp-drawer-history-date' }, formatHistoryDate(entry.savedAt));
      textCol.appendChild(title);
      textCol.appendChild(date);
      item.appendChild(textCol);

      const delBtn = iconButton({ class: 'sp-drawer-history-delete', title: 'Delete' }, Trash2);
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const deletingCurrentConversation = entry.id === _ctx.conversationId;
        const deletionGeneration = _ctx.conversationGeneration;
        if (deletingCurrentConversation) cancelCurrentManagedStream(false);
        const owner = _ctx.managedCloudOwner;
        if (!owner) return;
        deleteConversation(owner, entry.id)
          .then(() => {
            if (
              deletingCurrentConversation &&
              _ctx.conversationId === entry.id &&
              _ctx.conversationGeneration === deletionGeneration
            ) {
              resetConversationView();
            }
          })
          .then(() => refreshDrawerHistory())
          .catch((err) => console.warn('[SidePanel] history delete failed:', err));
      });
      item.appendChild(delBtn);

      item.addEventListener('click', () => {
        void restoreHistoryEntry(entry.id).finally(() => {
          closeDrawer();
          // Restoring from Recent chats while in Workflows / Computer Use left the
          // other view on screen with the restored chat hidden behind it.
          switchTab('chat');
        });
      });
      drawerHistoryList.appendChild(item);
    }
  }

  async function refreshDrawerHistory(): Promise<void> {
    const owner = _ctx.managedCloudOwner;
    drawerHistoryEntries = owner ? await listConversations(owner) : [];
    renderDrawerHistory(drawerHistoryEntries);
  }

  drawerHistorySearch.addEventListener('input', () => {
    renderDrawerHistory(drawerHistoryEntries);
  });

  drawerHistoryBtn.addEventListener('click', () => {
    const isHidden = drawerHistoryList.hasAttribute('hidden');
    if (isHidden) {
      drawerHistoryList.removeAttribute('hidden');
      drawerHistorySearch.removeAttribute('hidden');
      refreshDrawerHistory()
        .then(() => drawerHistorySearch.focus())
        .catch((err) => console.warn('[SidePanel] history list failed:', err));
    } else {
      drawerHistoryList.setAttribute('hidden', '');
      drawerHistorySearch.setAttribute('hidden', '');
    }
  });
  chatActionsRow.appendChild(drawerHistoryBtn);

  historyBtn.addEventListener('click', () => {
    openDrawer(historyBtn);
    drawerHistoryList.removeAttribute('hidden');
    drawerHistorySearch.removeAttribute('hidden');
    refreshDrawerHistory()
      .then(() => drawerHistorySearch.focus())
      .catch((err) => console.warn('[SidePanel] history list failed:', err));
  });

  // Summarize button
  const drawerSummarizeBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-summarize-btn',
    title: 'Summarize current page',
  });
  drawerSummarizeBtn.appendChild(renderIcon(FileEdit, 13));
  drawerSummarizeBtn.appendChild(document.createTextNode(' Summarize'));
  drawerSummarizeBtn.addEventListener('click', () => {
    closeDrawer();
    if (!_ctx.isStreaming) sendMessage('/summarize');
  });
  chatActionsRow.appendChild(drawerSummarizeBtn);

  // Clear conversation button
  const drawerClearChatBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-clear-chat-btn',
    title: 'Clear conversation',
  });
  drawerClearChatBtn.appendChild(renderIcon(Trash2, 13));
  drawerClearChatBtn.appendChild(document.createTextNode(' Clear'));
  drawerClearChatBtn.addEventListener('click', () => {
    closeDrawer();
    cancelCurrentManagedStream(false);
    resetConversationView();
  });
  chatActionsRow.appendChild(drawerClearChatBtn);

  chatActionsSection.appendChild(chatActionsRow);
  chatActionsSection.appendChild(drawerHistorySearch);
  chatActionsSection.appendChild(drawerHistoryList);
  drawerBody.appendChild(chatActionsSection);

  // ── Section 1: Automation ──────────────────────────────────────────────────
  const viewsSection = el('div', { class: 'sp-drawer-section' });
  viewsSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'Automate'));

  const wfLaunchBtn = el('button', {
    class: 'sp-drawer-launcher-btn',
    id: 'sp-drawer-wf-btn',
    title: 'Open Workflows',
  });
  const wfIcon = el('div', { class: 'sp-drawer-launcher-icon' });
  wfIcon.appendChild(renderIcon(Zap, 14));
  const wfTextBlock = el('div', { class: 'sp-drawer-launcher-label' });
  wfTextBlock.appendChild(el('div', {}, 'Workflows'));
  wfTextBlock.appendChild(
    el('div', { class: 'sp-drawer-launcher-desc' }, 'Shortcuts and scheduled tasks'),
  );
  wfLaunchBtn.appendChild(wfIcon);
  wfLaunchBtn.appendChild(wfTextBlock);
  wfLaunchBtn.appendChild(el('span', { class: 'sp-drawer-launcher-chevron' }, '›'));
  wfLaunchBtn.addEventListener('click', () => {
    closeDrawer();
    switchTab('workflows');
  });
  viewsSection.appendChild(wfLaunchBtn);

  const cuLaunchBtn = el('button', {
    class: 'sp-drawer-launcher-btn',
    id: 'sp-drawer-cu-btn',
    title: 'Open Computer Use',
  });
  const cuIcon = el('div', { class: 'sp-drawer-launcher-icon' });
  cuIcon.appendChild(renderIcon(Monitor, 14));
  const cuTextBlock = el('div', { class: 'sp-drawer-launcher-label' });
  cuTextBlock.appendChild(el('div', {}, 'Computer Use'));
  cuTextBlock.appendChild(
    el('div', { class: 'sp-drawer-launcher-desc' }, 'Browser automation agent'),
  );
  cuLaunchBtn.appendChild(cuIcon);
  cuLaunchBtn.appendChild(cuTextBlock);
  cuLaunchBtn.appendChild(el('span', { class: 'sp-drawer-launcher-chevron' }, '›'));
  cuLaunchBtn.addEventListener('click', () => {
    closeDrawer();
    switchTab('computer-use');
  });
  viewsSection.appendChild(cuLaunchBtn);
  drawerBody.appendChild(viewsSection);

  // ── Section 2: Tools (Capture / Refresh / Group) ───────────────────────────
  const toolsSection = el('div', { class: 'sp-drawer-section' });
  toolsSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'Tools'));
  const toolsRow = el('div', { class: 'sp-drawer-tools-row' });

  const drawerCaptureBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-capture-btn',
    title: 'Capture page screenshot',
  });
  drawerCaptureBtn.appendChild(renderIcon(Camera, 13));
  drawerCaptureBtn.appendChild(document.createTextNode(' Capture'));
  drawerCaptureBtn.addEventListener('click', async () => {
    drawerCaptureBtn.textContent = ' Capturing…';
    (drawerCaptureBtn as HTMLButtonElement).disabled = true;
    try {
      const res = (await chrome.runtime.sendMessage({
        type: 'CAPTURE_SCREENSHOT',
        format: 'png',
        quality: 90,
      })) as { success: boolean; error?: string };
      if (res.success) {
        drawerCaptureBtn.textContent = ' Captured!';
        drawerCaptureBtn.classList.add('active');
        setTimeout(() => {
          drawerCaptureBtn.replaceChildren(
            renderIcon(Camera, 13),
            document.createTextNode(' Capture'),
          );
          drawerCaptureBtn.classList.remove('active');
          (drawerCaptureBtn as HTMLButtonElement).disabled = false;
        }, 1500);
      } else {
        throw new Error(res.error ?? 'Failed');
      }
    } catch {
      drawerCaptureBtn.textContent = ' Failed';
      setTimeout(() => {
        drawerCaptureBtn.replaceChildren(
          renderIcon(Camera, 13),
          document.createTextNode(' Capture'),
        );
        (drawerCaptureBtn as HTMLButtonElement).disabled = false;
      }, 1500);
    }
  });
  toolsRow.appendChild(drawerCaptureBtn);

  const drawerRefreshBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-refresh-btn',
    title: 'Refresh panel data',
  });
  drawerRefreshBtn.appendChild(renderIcon(Loader2, 13));
  drawerRefreshBtn.appendChild(document.createTextNode(' Refresh'));
  drawerRefreshBtn.addEventListener('click', async () => {
    (drawerRefreshBtn as HTMLButtonElement).disabled = true;
    try {
      await Promise.all([
        refreshDrawerPairingState(),
        refreshDrawerAllowlist(),
        refreshDrawerMemory(),
        refreshDrawerStats(),
        refreshDrawerTabInfo(),
      ]);
    } finally {
      (drawerRefreshBtn as HTMLButtonElement).disabled = false;
    }
  });
  toolsRow.appendChild(drawerRefreshBtn);

  // Group button mirrors the toolbar's sp-group-btn
  const drawerGroupBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-group-btn',
    title: 'Add current tab to group',
  });
  drawerGroupBtn.appendChild(renderIcon(Folder, 13));
  let drawerGrouped = false;
  const drawerGroupLabel = document.createTextNode(' Group');
  drawerGroupBtn.appendChild(drawerGroupLabel);
  drawerGroupBtn.addEventListener('click', () => {
    const msgType = drawerGrouped ? 'REMOVE_TAB_FROM_GROUP' : 'ADD_TAB_TO_GROUP';
    chrome.runtime.sendMessage(
      { type: msgType },
      (response: { success?: boolean; grouped?: boolean } | undefined) => {
        if (chrome.runtime.lastError || !response?.success) return;
        drawerGrouped = response.grouped ?? false;
        drawerGroupLabel.textContent = drawerGrouped ? ' Ungroup' : ' Group';
        drawerGroupBtn.classList.toggle('active', drawerGrouped);
      },
    );
  });
  toolsRow.appendChild(drawerGroupBtn);

  // EXT-07: manifest.json declares options_page, but nothing in the product
  // ever called chrome.runtime.openOptionsPage(), so the settings page was
  // reachable only via chrome://extensions → Details → Extension options.
  const drawerOptionsBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-options-btn',
    title: 'Open AGI settings',
  });
  drawerOptionsBtn.appendChild(renderIcon(Settings, 13));
  drawerOptionsBtn.appendChild(document.createTextNode(' Settings'));
  drawerOptionsBtn.addEventListener('click', () => {
    if (typeof chrome.runtime.openOptionsPage === 'function') {
      chrome.runtime.openOptionsPage();
      return;
    }
    // Older hosts without openOptionsPage still resolve the manifest entry.
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/options.html') });
  });
  toolsRow.appendChild(drawerOptionsBtn);

  toolsSection.appendChild(toolsRow);
  drawerBody.appendChild(toolsSection);

  // ── Section 3: Connection / Pairing ───────────────────────────────────────
  const pairingSection = el('div', { class: 'sp-drawer-section' });
  pairingSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'Desktop Pairing'));

  const pairingRow = el('div', { class: 'sp-drawer-pairing-row' });
  const pairingLabel = el(
    'span',
    { class: 'sp-drawer-pairing-label', id: 'sp-drawer-pairing-label' },
    'Not paired',
  );
  const pairingFingerprint = el('span', {
    class: 'sp-drawer-pairing-fingerprint',
    id: 'sp-drawer-pairing-fingerprint',
    hidden: '',
  });
  pairingRow.appendChild(pairingLabel);
  pairingRow.appendChild(pairingFingerprint);
  pairingSection.appendChild(pairingRow);

  const pairingError = el('div', {
    class: 'sp-drawer-pairing-error',
    id: 'sp-drawer-pairing-error',
  });
  pairingSection.appendChild(pairingError);

  const pairingBtnRow = el('div', { class: 'sp-drawer-btn-row' });
  const drawerPairBtn = el(
    'button',
    {
      class: 'sp-drawer-btn sp-drawer-btn-primary',
      id: 'sp-drawer-pair-btn',
    },
    'Pair with Desktop',
  );
  const drawerUnpairBtn = el(
    'button',
    {
      class: 'sp-drawer-btn sp-drawer-btn-danger',
      id: 'sp-drawer-unpair-btn',
      hidden: '',
    },
    'Unpair',
  );

  function applyDrawerPairingState(state: PairingState): void {
    pairingError.textContent = '';
    switch (state.phase) {
      case 'idle':
        pairingLabel.textContent = 'Not paired';
        pairingFingerprint.setAttribute('hidden', '');
        drawerPairBtn.textContent = 'Pair with Desktop';
        (drawerPairBtn as HTMLButtonElement).disabled = false;
        drawerPairBtn.removeAttribute('hidden');
        drawerUnpairBtn.setAttribute('hidden', '');
        break;
      case 'requesting':
        pairingLabel.textContent = 'Pairing…';
        pairingFingerprint.setAttribute('hidden', '');
        drawerPairBtn.textContent = 'Pairing…';
        (drawerPairBtn as HTMLButtonElement).disabled = true;
        drawerUnpairBtn.setAttribute('hidden', '');
        break;
      case 'paired':
        pairingLabel.textContent = 'Paired';
        if (state.fingerprint) {
          pairingFingerprint.textContent = state.fingerprint;
          pairingFingerprint.removeAttribute('hidden');
        } else {
          pairingFingerprint.setAttribute('hidden', '');
        }
        drawerPairBtn.setAttribute('hidden', '');
        drawerUnpairBtn.removeAttribute('hidden');
        break;
      case 'error':
        pairingLabel.textContent = 'Pairing failed';
        pairingFingerprint.setAttribute('hidden', '');
        if (state.error) pairingError.textContent = state.error;
        drawerPairBtn.textContent = 'Retry Pairing';
        (drawerPairBtn as HTMLButtonElement).disabled = false;
        drawerPairBtn.removeAttribute('hidden');
        drawerUnpairBtn.setAttribute('hidden', '');
        break;
    }
  }

  drawerPairBtn.addEventListener('click', async () => {
    applyDrawerPairingState({ phase: 'requesting', fingerprint: null, error: null });
    const next = await requestPairing();
    applyDrawerPairingState(next);
  });
  drawerUnpairBtn.addEventListener('click', async () => {
    const next = await unpair();
    applyDrawerPairingState(next);
  });

  pairingBtnRow.appendChild(drawerPairBtn);
  pairingBtnRow.appendChild(drawerUnpairBtn);
  pairingSection.appendChild(pairingBtnRow);
  drawerBody.appendChild(pairingSection);

  async function refreshDrawerPairingState(): Promise<void> {
    const state = await loadPairingState();
    applyDrawerPairingState(state);
  }

  // ── Section 4: In-Page Panel toggle ───────────────────────────────────────
  const inPageSection = el('div', { class: 'sp-drawer-section' });
  inPageSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'In-Page Panel'));
  const inPageRow = el('div', { class: 'sp-drawer-toggle-row' });
  inPageRow.appendChild(el('span', { class: 'sp-drawer-toggle-label' }, 'Page chat overlay'));
  const inPageToggle = el('input', {
    type: 'checkbox',
    class: 'sp-drawer-toggle-switch',
    id: 'sp-drawer-in-page-toggle',
    'aria-label': 'Toggle in-page panel',
  }) as HTMLInputElement;
  inPageToggle.checked = true; // default on
  chrome.storage.local.get(SP_IN_PAGE_PANEL_ENABLED_KEY, (result) => {
    if (chrome.runtime.lastError) return;
    const val = result[SP_IN_PAGE_PANEL_ENABLED_KEY] as boolean | undefined;
    inPageToggle.checked = val !== false;
  });
  inPageToggle.addEventListener('change', () => {
    chrome.storage.local
      .set({ [SP_IN_PAGE_PANEL_ENABLED_KEY]: inPageToggle.checked })
      .catch(() => {});
  });
  inPageRow.appendChild(inPageToggle);
  inPageSection.appendChild(inPageRow);
  drawerBody.appendChild(inPageSection);

  // ── Section 5: Site Allowlist ──────────────────────────────────────────────
  const allowlistSection = el('div', { class: 'sp-drawer-section' });
  allowlistSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'Site Allowlist'));
  allowlistSection.appendChild(
    el(
      'p',
      { class: 'sp-drawer-allowlist-help' },
      'Pages on these origins can run AGI automation in their tab. Add the current site, then reload it.',
    ),
  );

  const allowlistCurrentRow = el('div', { class: 'sp-drawer-allowlist-current-row' });
  const allowlistOriginLabel = el(
    'span',
    {
      class: 'sp-drawer-allowlist-origin',
      id: 'sp-drawer-allowlist-origin',
    },
    '—',
  );
  const allowlistToggleBtn = el(
    'button',
    {
      class: 'sp-drawer-allowlist-toggle-btn',
      id: 'sp-drawer-allowlist-toggle',
    },
    'Add',
  ) as HTMLButtonElement;
  (allowlistToggleBtn as HTMLButtonElement).disabled = true;
  allowlistCurrentRow.appendChild(allowlistOriginLabel);
  allowlistCurrentRow.appendChild(allowlistToggleBtn);
  allowlistSection.appendChild(allowlistCurrentRow);

  const allowlistList = el('ul', {
    class: 'sp-drawer-allowlist-list',
    id: 'sp-drawer-allowlist-list',
    'aria-label': 'Allowlisted origins',
  });
  const allowlistEmpty = el(
    'div',
    { class: 'sp-drawer-allowlist-empty', id: 'sp-drawer-allowlist-empty', hidden: '' },
    'No sites allowlisted yet.',
  );
  allowlistSection.appendChild(allowlistList);
  allowlistSection.appendChild(allowlistEmpty);
  drawerBody.appendChild(allowlistSection);

  async function drawerReadAllowlist(): Promise<string[]> {
    try {
      const res = await chrome.storage.local.get(SP_SITE_ALLOWLIST_KEY);
      const list = (res as Record<string, unknown>)[SP_SITE_ALLOWLIST_KEY];
      return Array.isArray(list) ? (list as string[]).filter((s) => typeof s === 'string') : [];
    } catch {
      return [];
    }
  }
  async function drawerWriteAllowlist(next: string[]): Promise<void> {
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const raw of next) {
      if (typeof raw !== 'string') continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      try {
        const u = new URL(trimmed);
        const origin = u.origin;
        if (!seen.has(origin)) {
          seen.add(origin);
          cleaned.push(origin);
        }
      } catch {
        /* drop malformed */
      }
    }
    cleaned.sort();
    await chrome.storage.local.set({ [SP_SITE_ALLOWLIST_KEY]: cleaned });
  }
  /**
   * Origin of the active tab, or null when there is nothing allowlistable.
   *
   * The allowlist governs which sites may run AGI automation in their tab, and
   * automation needs a content script. Browser-internal pages cannot host one,
   * so their origin is not a candidate — this used to return
   * `chrome-extension://<32-char id>` and offer an "Add" button for it, which
   * would have written a permanently inert entry.
   */
  function drawerCurrentTabOrigin(): Promise<string | null> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs[0]?.url;
        if (!url) return resolve(null);
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return resolve(null);
          }
          resolve(parsed.origin);
        } catch {
          resolve(null);
        }
      });
    });
  }
  async function renderDrawerAllowlistList(
    list: string[],
    currentOrigin: string | null,
  ): Promise<void> {
    clearChildren(allowlistList);
    if (list.length === 0) {
      allowlistEmpty.removeAttribute('hidden');
      return;
    }
    allowlistEmpty.setAttribute('hidden', '');
    for (const origin of list) {
      const li = el('li', {
        class: `sp-drawer-allowlist-item${origin === currentOrigin ? ' is-current' : ''}`,
      });
      const originSpan = el('span', { class: 'sp-drawer-allowlist-item-origin' }, origin);
      li.appendChild(originSpan);
      const removeBtn = el(
        'button',
        {
          type: 'button',
          class: 'sp-drawer-allowlist-item-remove',
          'aria-label': `Remove ${origin} from allowlist`,
        },
        'Remove',
      );
      removeBtn.addEventListener('click', async () => {
        const cur = await drawerReadAllowlist();
        await drawerWriteAllowlist(cur.filter((o) => o !== origin));
        await refreshDrawerAllowlist();
      });
      li.appendChild(removeBtn);
      allowlistList.appendChild(li);
    }
  }
  async function refreshDrawerAllowlist(): Promise<void> {
    const [list, origin] = await Promise.all([drawerReadAllowlist(), drawerCurrentTabOrigin()]);
    // Distinguish "no tab" from "this tab can never be automated"; both
    // disable the button, but only one of them is the user's mistake.
    allowlistOriginLabel.textContent = origin ?? 'No site to add on this page';
    (allowlistToggleBtn as HTMLButtonElement).disabled = !origin;
    if (origin) {
      const present = list.includes(origin);
      allowlistToggleBtn.textContent = present ? 'Remove' : 'Add';
      allowlistToggleBtn.classList.toggle('is-remove', present);
    } else {
      allowlistToggleBtn.textContent = 'Add';
      allowlistToggleBtn.classList.remove('is-remove');
    }
    await renderDrawerAllowlistList(list, origin);
  }
  allowlistToggleBtn.addEventListener('click', async () => {
    const origin = await drawerCurrentTabOrigin();
    if (!origin) return;
    const list = await drawerReadAllowlist();
    const present = list.includes(origin);
    await drawerWriteAllowlist(present ? list.filter((o) => o !== origin) : [...list, origin]);
    await refreshDrawerAllowlist();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SP_SITE_ALLOWLIST_KEY] && drawer.classList.contains('open')) {
      void refreshDrawerAllowlist();
    }
  });

  // ── Section 6: Memory ──────────────────────────────────────────────────────
  const DRAWER_DELETE_CONFIRM_MS = 3000;
  const memorySection = el('div', { class: 'sp-drawer-section' });
  memorySection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'Memory'));
  memorySection.appendChild(
    el(
      'p',
      { class: 'sp-drawer-memory-help' },
      'Saved facts and preferences reused across sessions. Stored on this device only.',
    ),
  );

  const memoryAddBtn = el(
    'button',
    {
      class: 'sp-drawer-memory-add-btn',
      id: 'sp-drawer-memory-add-btn',
    },
    'Add memory',
  );
  memorySection.appendChild(memoryAddBtn);

  const memoryEditor = el('div', {
    class: 'sp-drawer-memory-editor',
    id: 'sp-drawer-memory-editor',
  });
  const memoryTextarea = el('textarea', {
    class: 'sp-drawer-memory-textarea',
    id: 'sp-drawer-memory-textarea',
    placeholder: 'Enter a fact, preference, or pattern to remember…',
    rows: '3',
    maxlength: '2000',
  }) as HTMLTextAreaElement;
  const memoryEditorActions = el('div', { class: 'sp-drawer-memory-editor-actions' });
  const memorySaveBtn = el(
    'button',
    { class: 'sp-drawer-btn sp-drawer-btn-primary', id: 'sp-drawer-memory-save-btn' },
    'Save',
  );
  const memoryCancelBtn = el(
    'button',
    { class: 'sp-drawer-btn', id: 'sp-drawer-memory-cancel-btn' },
    'Cancel',
  );
  memoryEditorActions.appendChild(memorySaveBtn);
  memoryEditorActions.appendChild(memoryCancelBtn);
  memoryEditor.appendChild(memoryTextarea);
  memoryEditor.appendChild(memoryEditorActions);
  memorySection.appendChild(memoryEditor);

  const memoryList = el('ul', {
    class: 'sp-drawer-memory-list',
    id: 'sp-drawer-memory-list',
    'aria-label': 'Saved memories',
  });
  const memoryEmpty = el(
    'div',
    { class: 'sp-drawer-memory-empty', id: 'sp-drawer-memory-empty', hidden: '' },
    'No saved memories yet.',
  );
  memorySection.appendChild(memoryList);
  memorySection.appendChild(memoryEmpty);
  drawerBody.appendChild(memorySection);

  type DrawerMemoryMessageType = 'LIST_MEMORIES' | 'ADD_MEMORY' | 'UPDATE_MEMORY' | 'DELETE_MEMORY';
  async function sendDrawerMemoryMsg(
    type: DrawerMemoryMessageType,
    payload: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    try {
      const res = (await chrome.runtime.sendMessage({ type, ...payload })) as Record<
        string,
        unknown
      >;
      return res ?? {};
    } catch {
      return { success: false };
    }
  }
  function drawerFormatRelTime(iso: string): string {
    try {
      const diff = Date.now() - new Date(iso).getTime();
      if (diff < 60_000) return 'just now';
      const m = Math.floor(diff / 60_000);
      if (m < 60) return `${m} min ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h} h ago`;
      return `${Math.floor(h / 24)} d ago`;
    } catch {
      return '';
    }
  }

  type DrawerMemoryItem = { id: string; content: string; createdAt: string; updatedAt?: string };

  function buildDrawerMemoryItem(item: DrawerMemoryItem): HTMLLIElement {
    const li = el('li', { class: 'sp-drawer-memory-item' });
    li.dataset['id'] = item.id;
    const contentEl = el('span', { class: 'sp-drawer-memory-item-content' }, item.content);
    const metaEl = el(
      'span',
      { class: 'sp-drawer-memory-item-meta' },
      drawerFormatRelTime(item.updatedAt || item.createdAt),
    );
    const actionRow = el('div', { class: 'sp-drawer-memory-item-row' });

    const editBtn = el(
      'button',
      { type: 'button', class: 'sp-drawer-memory-item-edit-btn' },
      'Edit',
    );
    const deleteBtn = el(
      'button',
      { type: 'button', class: 'sp-drawer-memory-item-delete-btn' },
      'Delete',
    ) as HTMLButtonElement;

    let confirmTimer: ReturnType<typeof setTimeout> | null = null;
    deleteBtn.addEventListener('click', () => {
      if (deleteBtn.classList.contains('is-confirm')) {
        if (confirmTimer !== null) {
          clearTimeout(confirmTimer);
          confirmTimer = null;
        }
        sendDrawerMemoryMsg('DELETE_MEMORY', { id: item.id })
          .then(() => refreshDrawerMemory())
          .catch(() => {});
      } else {
        deleteBtn.classList.add('is-confirm');
        deleteBtn.textContent = 'Confirm?';
        confirmTimer = setTimeout(() => {
          deleteBtn.classList.remove('is-confirm');
          deleteBtn.textContent = 'Delete';
          confirmTimer = null;
        }, DRAWER_DELETE_CONFIRM_MS);
      }
    });

    editBtn.addEventListener('click', () => {
      if (li.querySelector('.sp-drawer-memory-item-textarea')) return;
      contentEl.hidden = true;
      editBtn.hidden = true;
      deleteBtn.hidden = true;
      const editArea = el('textarea', {
        class: 'sp-drawer-memory-item-textarea',
        rows: '2',
        maxlength: '2000',
      }) as HTMLTextAreaElement;
      editArea.value = item.content;
      const editSave = el(
        'button',
        { type: 'button', class: 'sp-drawer-btn sp-drawer-btn-primary' },
        'Save',
      );
      const editCancel = el('button', { type: 'button', class: 'sp-drawer-btn' }, 'Cancel');
      const editActions = el('div', { class: 'sp-drawer-memory-editor-actions' });
      editActions.appendChild(editSave);
      editActions.appendChild(editCancel);
      editSave.addEventListener('click', async () => {
        const txt = editArea.value.trim();
        if (!txt) return;
        (editSave as HTMLButtonElement).disabled = true;
        await sendDrawerMemoryMsg('UPDATE_MEMORY', { id: item.id, content: txt });
        await refreshDrawerMemory();
      });
      editCancel.addEventListener('click', () => {
        editArea.remove();
        editActions.remove();
        contentEl.hidden = false;
        editBtn.hidden = false;
        deleteBtn.hidden = false;
      });
      li.insertBefore(editArea, actionRow);
      li.insertBefore(editActions, actionRow);
      editArea.focus();
    });

    actionRow.appendChild(editBtn);
    actionRow.appendChild(deleteBtn);
    li.appendChild(contentEl);
    li.appendChild(metaEl);
    li.appendChild(actionRow);
    return li;
  }

  async function refreshDrawerMemory(): Promise<void> {
    const res = await sendDrawerMemoryMsg('LIST_MEMORIES');
    const raw = Array.isArray(res['memories']) ? (res['memories'] as unknown[]) : [];
    const items = raw.filter(isMemoryItem);
    clearChildren(memoryList);
    if (items.length === 0) {
      memoryEmpty.removeAttribute('hidden');
      return;
    }
    memoryEmpty.setAttribute('hidden', '');
    for (const item of items) {
      memoryList.appendChild(buildDrawerMemoryItem(item as DrawerMemoryItem));
    }
  }

  function showDrawerMemoryEditor(show: boolean): void {
    memoryEditor.classList.toggle('open', show);
    if (show) {
      memoryTextarea.value = '';
      memoryTextarea.focus();
    }
  }
  memoryAddBtn.addEventListener('click', () => showDrawerMemoryEditor(true));
  memoryCancelBtn.addEventListener('click', () => showDrawerMemoryEditor(false));
  memorySaveBtn.addEventListener('click', async () => {
    const content = memoryTextarea.value.trim();
    if (!content) return;
    (memorySaveBtn as HTMLButtonElement).disabled = true;
    await sendDrawerMemoryMsg('ADD_MEMORY', { content });
    showDrawerMemoryEditor(false);
    (memorySaveBtn as HTMLButtonElement).disabled = false;
    await refreshDrawerMemory();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[MEMORY_STORAGE_KEY] && drawer.classList.contains('open')) {
      void refreshDrawerMemory();
    }
  });

  // ── Section 7: Bridge URL ──────────────────────────────────────────────────
  const bridgeSection = el('div', { class: 'sp-drawer-section' });
  bridgeSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'Bridge URL'));
  const drawerBridgeInput = el('input', {
    class: 'sp-drawer-bridge-input',
    id: 'sp-drawer-bridge-input',
    type: 'text',
    placeholder: 'ws://localhost:8787',
    spellcheck: 'false',
  }) as HTMLInputElement;
  chrome.storage.local.get('agi_bridge_url', (result) => {
    if (chrome.runtime.lastError) return;
    const stored = result['agi_bridge_url'] as string | undefined;
    if (stored) drawerBridgeInput.value = stored;
  });
  const drawerBridgeRow = el('div', { class: 'sp-drawer-bridge-row' });
  drawerBridgeRow.appendChild(drawerBridgeInput);
  const drawerBridgeSaveBtn = el(
    'button',
    { class: 'sp-drawer-btn', id: 'sp-drawer-bridge-save-btn' },
    'Apply',
  );
  drawerBridgeRow.appendChild(drawerBridgeSaveBtn);
  bridgeSection.appendChild(drawerBridgeRow);
  const drawerBridgeError = el('div', { class: 'sp-drawer-bridge-error', hidden: '' });
  bridgeSection.appendChild(drawerBridgeError);
  drawerBody.appendChild(bridgeSection);

  function drawerSaveBridgeUrl(): void {
    const raw = (drawerBridgeInput as HTMLInputElement).value.trim();
    if (!raw) {
      chrome.storage.local.remove('agi_bridge_url');
    } else {
      const validated = validateBridgeUrl(raw);
      if (!validated) {
        const allowed = Array.from(ALLOWED_BRIDGE_HOSTS).join(', ');
        drawerBridgeError.textContent = `Only local URLs (${allowed}) are allowed`;
        drawerBridgeError.removeAttribute('hidden');
        setTimeout(() => drawerBridgeError.setAttribute('hidden', ''), 8000);
        return;
      }
      chrome.storage.local
        .set({ agi_bridge_url: raw })
        .catch((err: unknown) => console.warn('[SidePanel] drawer bridge save failed:', err));
    }
    drawerBridgeError.setAttribute('hidden', '');
    chrome.runtime
      .sendMessage({ type: 'BRIDGE_URL_CHANGED', url: raw })
      .catch((err: unknown) => console.warn('[SidePanel] drawer bridge notify failed:', err));
    // Also sync the old settings-bar input so both stay in sync
    const oldInput = document.getElementById('sp-bridge-url-input') as HTMLInputElement | null;
    if (oldInput) oldInput.value = raw;
  }
  drawerBridgeSaveBtn.addEventListener('click', drawerSaveBridgeUrl);
  drawerBridgeInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') drawerSaveBridgeUrl();
  });

  // ── Section 8: AGI Cloud (sign-in + free-trial quota) ────────────────────
  const cloudSection = el('div', { class: 'sp-drawer-section' });
  cloudSection.appendChild(el('div', { class: 'sp-drawer-section-title' }, 'AGI Cloud'));

  // Container that swaps between signed-in and signed-out views
  const cloudAccountEl = el('div', { class: 'sp-cloud-account', id: 'sp-cloud-account' });

  // ── Signed-out view ──────────────────────────────────────────────────────
  const signinPrompt = el('div', {
    class: 'sp-cloud-signin-prompt',
    id: 'sp-cloud-signin-prompt',
  });
  const signinDescription = el(
    'span',
    { class: 'sp-cloud-signin-desc' },
    'Sign in to use AGI Managed Cloud chat.',
  );
  signinPrompt.appendChild(signinDescription);

  const signinBtn = el('button', { class: 'sp-cloud-signin-btn', id: 'sp-cloud-signin-btn' });
  let signInAwaitingCompletion = false;
  signinBtn.textContent = 'Sign in to AGI Cloud';
  signinBtn.addEventListener('click', async () => {
    signinBtn.setAttribute('disabled', '');
    signinBtn.textContent = signInAwaitingCompletion ? 'Checking…' : 'Opening sign in…';
    try {
      if (signInAwaitingCompletion) {
        await refreshCloudAccountUI(true);
      } else {
        await openClerkSignIn();
        signInAwaitingCompletion = true;
        signinDescription.textContent =
          'Finish sign-in in the new tab, then return here and click Check sign-in.';
      }
    } catch (error) {
      signinDescription.textContent =
        error instanceof Error ? error.message : 'Unable to open AGI account sign-in.';
    } finally {
      signinBtn.removeAttribute('disabled');
      signinBtn.textContent = signInAwaitingCompletion ? 'Check sign-in' : 'Sign in to AGI Cloud';
    }
  });
  signinPrompt.appendChild(signinBtn);

  // ── Signed-in view ───────────────────────────────────────────────────────
  const signedInView = el('div', {
    class: 'sp-cloud-signed-in',
    id: 'sp-cloud-signed-in',
    style: 'display:none',
  });
  const avatarEl = el('div', { class: 'sp-cloud-avatar', id: 'sp-cloud-avatar' }, 'A');
  const userInfoEl = el('div', { class: 'sp-cloud-user-info' });
  const userLabelEl = el('div', {
    class: 'sp-cloud-user-label',
    id: 'sp-cloud-user-label',
  });
  userLabelEl.textContent = 'AGI Account';
  const userTierEl = el('div', { class: 'sp-cloud-user-tier', id: 'sp-cloud-user-tier' });
  userTierEl.textContent = 'Free tier';
  userInfoEl.appendChild(userLabelEl);
  userInfoEl.appendChild(userTierEl);
  const signoutBtn = el(
    'button',
    { class: 'sp-cloud-signout-btn', id: 'sp-cloud-signout-btn' },
    'Sign out',
  );
  signedInView.appendChild(avatarEl);
  signedInView.appendChild(userInfoEl);
  signedInView.appendChild(signoutBtn);

  // ── Paid-plan gate (Chrome is not part of Claude's free chat surfaces) ───
  const quotaWrap = el('div', {
    class: 'sp-quota-bar-wrap',
    id: 'sp-quota-bar-wrap',
    style: 'display:none',
  });
  const quotaLabelEl = el('span', { id: 'sp-quota-label' }, 'Chrome access requires a paid plan.');
  quotaWrap.appendChild(quotaLabelEl);

  // Upgrade row (shown when quota exhausted)
  const quotaUpgradeRow = el('div', {
    class: 'sp-quota-upgrade-row',
    id: 'sp-quota-upgrade-row',
    style: 'display:none',
  });
  const quotaExhaustedLabel = el(
    'span',
    { style: 'font-size:10px;color:var(--agi-ext-danger)' },
    'Free chat remains available on Web, Mobile, and Desktop.',
  );
  const quotaUpgradeBtn = el(
    'button',
    { class: 'sp-quota-upgrade-btn', id: 'sp-quota-upgrade-btn' },
    'Upgrade',
  );
  quotaUpgradeRow.appendChild(quotaExhaustedLabel);
  quotaUpgradeRow.appendChild(quotaUpgradeBtn);
  quotaWrap.appendChild(quotaUpgradeRow);

  cloudAccountEl.appendChild(signinPrompt);
  cloudAccountEl.appendChild(signedInView);
  cloudAccountEl.appendChild(quotaWrap);
  const cloudLinkHint = el(
    'div',
    { class: 'sp-cloud-link-hint', style: 'display:none' },
    'Cloud connectors open on Web. Browser page tools remain scoped to this extension.',
  );
  const cloudLinkRow = el('div', {
    class: 'sp-cloud-link-row',
    id: 'sp-cloud-link-row',
    style: 'display:none',
  });
  const manageUsageBtn = el('button', { class: 'sp-cloud-link-btn' }, 'Manage usage');
  manageUsageBtn.addEventListener('click', () => {
    void chrome.tabs.create({
      url: 'https://agiworkforce.com/settings/usage?from=chrome-extension',
    });
  });
  const connectAppsBtn = el('button', { class: 'sp-cloud-link-btn' }, 'Connect apps');
  connectAppsBtn.addEventListener('click', () => {
    void chrome.tabs.create({
      url: 'https://agiworkforce.com/connectors?from=chrome-extension',
    });
  });
  const teamsBtn = el('button', { class: 'sp-cloud-link-btn' }, 'Team & Enterprise');
  teamsBtn.addEventListener('click', () => {
    void chrome.tabs.create({ url: 'https://agiworkforce.com/teams?from=chrome-extension' });
  });
  cloudLinkRow.appendChild(manageUsageBtn);
  cloudLinkRow.appendChild(connectAppsBtn);
  cloudLinkRow.appendChild(teamsBtn);
  cloudAccountEl.appendChild(cloudLinkHint);
  cloudAccountEl.appendChild(cloudLinkRow);
  cloudSection.appendChild(cloudAccountEl);
  drawerBody.appendChild(cloudSection);

  // ── "Redeem a code" button — secondary to sign-in. AGI Cloud is public alpha
  // (open by default once signed in); this drawer only redeems an optional promo/
  // invite code for plan credits and offers a product-updates opt-in. ─────────────
  let drawerCloudModal: ReturnType<typeof mountInviteCodeModal> | null = null;
  const inviteCodeSection = el('div', { class: 'sp-drawer-section' });
  const drawerCloudBtn = el(
    'button',
    { class: 'sp-drawer-cloud-btn', id: 'sp-drawer-cloud-btn' },
    'Redeem a code',
  );
  drawerCloudBtn.addEventListener('click', () => {
    if (!drawerCloudModal) {
      drawerCloudModal = mountInviteCodeModal(document.body, {
        open: true,
        source: 'computer-use',
        defaultTab: 'invite',
        onClose: () => drawerCloudModal?.update({ open: false }),
        onRedeemed: (_inviteId) => {
          void refreshCloudAccountUI();
        },
      });
    } else {
      drawerCloudModal.show();
    }
  });
  inviteCodeSection.appendChild(drawerCloudBtn);
  drawerBody.appendChild(inviteCodeSection);

  // ── Quota badge in header (click opens drawer to cloud section) ──────────
  // Insert into the slot reserved in the header above.
  const quotaBadgeEl = el('button', {
    id: 'sp-quota-badge',
    type: 'button',
    title: 'AGI Cloud plan',
    'aria-label': 'AGI Cloud plan and usage — open menu',
  });
  quotaBadgeEl.addEventListener('click', () => {
    // Route through openDrawer rather than toggling classes by hand. The manual
    // version skipped the drawer's refresh calls AND its inert handling, so the
    // drawer opened stale and — once closed drawers became inert — completely
    // unusable. It also never recorded a focus-return target, stranding keyboard
    // users when the drawer closed.
    openDrawer(quotaBadgeEl);
  });
  // Attach to the slot created in the header section above
  const quotaSlot = document.getElementById('sp-quota-badge-slot');
  if (quotaSlot) quotaSlot.replaceWith(quotaBadgeEl);
  else document.body.appendChild(quotaBadgeEl);

  // ── Cloud UI state helpers ───────────────────────────────────────────────
  // Wire the module-level placeholder to the real implementation (which closes
  // over signinPrompt, signedInView, quotaWrap, quotaBadgeEl, etc.).
  refreshCloudAccountUI = async function (forceAuthRefresh = false): Promise<void> {
    const refreshGeneration = ++cloudAccountRefreshGeneration;
    const [authContext, accountProfile] = await Promise.all([
      getManagedCloudAuthContext(forceAuthRefresh),
      getClerkAccountProfile().catch(() => null),
    ]);
    if (refreshGeneration !== cloudAccountRefreshGeneration) return;
    const ownerChanged = await transitionManagedCloudOwner(authContext?.owner ?? null);
    if (refreshGeneration !== cloudAccountRefreshGeneration) return;
    const token = authContext?.token ?? null;
    const currentAccountProfile =
      authContext && sameManagedCloudOwner(accountProfile?.owner, authContext.owner)
        ? accountProfile
        : null;
    if (!token) {
      // Signed out
      managedModelAccess = null;
      _ctx.selectedModel = reconcileManagedModelSelection(_ctx.selectedModel, null);
      _ctx.currentModelKey = undefined;
      _ctx.previousTaskType = undefined;
      _ctx.reasoningEffort = undefined;
      signinDescription.textContent = isClerkExtensionAuthConfigured()
        ? signInAwaitingCompletion
          ? 'Finish sign-in in the new tab, then click Check sign-in.'
          : 'Sign in to use AGI Managed Cloud chat.'
        : 'AGI account sign-in is not configured in this build.';
      if (isClerkExtensionAuthConfigured()) signinBtn.removeAttribute('disabled');
      else signinBtn.setAttribute('disabled', '');
      signinPrompt.style.display = '';
      signedInView.style.display = 'none';
      quotaWrap.style.display = 'none';
      cloudLinkHint.style.display = 'none';
      cloudLinkRow.style.display = 'none';
      quotaBadgeEl.classList.remove('visible', 'has-prompts', 'exhausted');
      refreshModelPickerUI();
      setManagedCloudChatState('signed_out', {
        message: isClerkExtensionAuthConfigured()
          ? 'Sign in to start chatting in Chrome.'
          : 'Open AGI to finish account setup.',
        action: isClerkExtensionAuthConfigured() ? 'sign_in' : 'open_web',
        actionLabel: isClerkExtensionAuthConfigured() ? 'Sign in' : 'Open AGI',
      });
      return;
    }

    let access: ManagedModelAccess;
    try {
      access = await getManagedModelAccess(token);
    } catch (error) {
      if (refreshGeneration !== cloudAccountRefreshGeneration) return;
      managedModelAccess = null;
      _ctx.selectedModel = reconcileManagedModelSelection(_ctx.selectedModel, null);
      _ctx.currentModelKey = undefined;
      _ctx.previousTaskType = undefined;
      _ctx.reasoningEffort = undefined;
      refreshModelPickerUI();
      quotaWrap.style.display = 'none';
      cloudLinkHint.style.display = 'none';
      cloudLinkRow.style.display = 'none';
      quotaBadgeEl.classList.remove('visible', 'has-prompts', 'exhausted');

      if (error instanceof Error && error.message.includes('Authentication')) {
        await transitionManagedCloudOwner(null);
        await clearAuthToken();
        if (refreshGeneration !== cloudAccountRefreshGeneration) return;
        signinDescription.textContent = 'Your session expired. Sign in again to continue.';
        signinPrompt.style.display = '';
        signedInView.style.display = 'none';
        setManagedCloudChatState('signed_out', {
          message: 'Your session expired. Sign in again to continue.',
          action: 'sign_in',
          actionLabel: 'Sign in',
        });
        return;
      }

      signinPrompt.style.display = 'none';
      signedInView.style.display = '';
      userTierEl.textContent = 'Account unavailable';
      setManagedCloudChatState('unavailable', {
        message: 'We could not verify your AGI Cloud account.',
        action: 'retry',
        actionLabel: 'Retry',
      });
      return;
    }
    if (refreshGeneration !== cloudAccountRefreshGeneration) return;

    managedModelAccess = access;
    signInAwaitingCompletion = false;
    const reconciledSelection = reconcileManagedModelSelection(_ctx.selectedModel, access);
    if (reconciledSelection !== _ctx.selectedModel) {
      _ctx.conversationGeneration += 1;
      _ctx.selectedModel = reconciledSelection;
      _ctx.currentModelKey = undefined;
      _ctx.previousTaskType = undefined;
      _ctx.reasoningEffort = undefined;
    }
    refreshModelPickerUI();

    // Signed in with server-verified admission.
    signinPrompt.style.display = 'none';
    signedInView.style.display = '';
    cloudLinkHint.style.display = '';
    cloudLinkRow.style.display = 'flex';
    userLabelEl.textContent =
      currentAccountProfile?.displayName ?? currentAccountProfile?.email ?? 'AGI Account';
    userLabelEl.title = currentAccountProfile?.email ?? '';
    avatarEl.textContent = currentAccountProfile?.initials ?? 'A';
    userTierEl.textContent = formatManagedTierLabel(
      access.accountPlanTier ?? access.subscriptionTier,
    );

    const subscriptionNeedsAttention =
      Boolean(access.accountPlanTier && access.accountPlanTier.toLowerCase() !== 'free') &&
      !isEntitledSubscriptionStatus(access.subscriptionStatus);
    if (subscriptionNeedsAttention) {
      const subscriptionStatusLabel = (access.subscriptionStatus ?? 'inactive').replace('_', ' ');
      quotaWrap.style.display = '';
      quotaLabelEl.textContent =
        access.subscriptionStatus === 'past_due'
          ? 'Payment is past due. Update billing to restore Chrome access.'
          : access.subscriptionStatus === 'canceled'
            ? 'This subscription is canceled. Manage billing to restore Chrome access.'
            : `This subscription is ${subscriptionStatusLabel}. Manage billing to restore Chrome access.`;
      quotaExhaustedLabel.textContent = 'Paid Chrome access is paused.';
      quotaUpgradeBtn.textContent = 'Manage billing';
      quotaUpgradeRow.style.display = '';
      quotaBadgeEl.classList.add('visible', 'exhausted');
      quotaBadgeEl.classList.remove('has-prompts');
      quotaBadgeEl.textContent = 'Billing';
      setManagedCloudChatState('unavailable', {
        message:
          access.subscriptionStatus === 'past_due'
            ? 'Update billing to restore AGI in Chrome.'
            : `Your paid subscription is ${subscriptionStatusLabel}.`,
        action: 'billing',
        actionLabel: 'Manage billing',
      });
      return;
    }

    if (canUseBillingPlanCapability(access.subscriptionTier, 'developer_surfaces')) {
      quotaWrap.style.display = '';
      // Shared vocabulary: web and mobile state what is LEFT, this panel stated
      // what was USED — the same number reading as its own opposite depending on
      // which surface you looked at. The reset was a bare date here and a
      // relative countdown elsewhere. Both now come from @agiworkforce/types.
      const usage =
        typeof access.usagePercentage === 'number'
          ? formatUsageRemaining(100 - access.usagePercentage)
          : 'usage unavailable';
      const resets = formatUsageResetIn(access.usageResetAt ?? null);
      quotaLabelEl.textContent = resets ? `Cloud: ${usage} · ${resets}` : `Cloud: ${usage}`;
      quotaUpgradeRow.style.display = 'none';
      quotaBadgeEl.classList.add('visible', 'has-prompts');
      quotaBadgeEl.classList.remove('exhausted');
      // Canonical catalog label, not the raw tier id upper-cased — that printed
      // "MAX_15X" where every other surface says "Max 15x".
      quotaBadgeEl.textContent = getBillingPlanPricing(access.subscriptionTier).label;
      setManagedCloudChatState('ready');
      refreshPageHostname();
      if (ownerChanged) {
        refreshWorkflowsTasks();
        await loadMessages();
        if (refreshGeneration !== cloudAccountRefreshGeneration) return;
        renderMessages();
      }
      return;
    }

    quotaWrap.style.display = '';
    quotaLabelEl.textContent = 'AGI in Chrome requires Pro or higher.';
    quotaExhaustedLabel.textContent = 'Free chat remains available on Web, Mobile, and Desktop.';
    quotaUpgradeBtn.textContent = 'Upgrade';
    quotaUpgradeRow.style.display = '';

    quotaBadgeEl.classList.add('visible');
    quotaBadgeEl.classList.remove('has-prompts');
    quotaBadgeEl.classList.add('exhausted');
    quotaBadgeEl.textContent = 'Upgrade';
    setManagedCloudChatState('unavailable', {
      message: 'AGI in Chrome requires Pro or higher.',
      action: 'upgrade',
      actionLabel: 'View plans',
    });
  };

  // Sign-out handler
  signoutBtn.addEventListener('click', async () => {
    await transitionManagedCloudOwner(null);
    await clearAuthToken();
    await refreshCloudAccountUI();
  });

  // Upgrade button — open agiworkforce.com pricing
  quotaUpgradeBtn.addEventListener('click', () => {
    const url =
      quotaUpgradeBtn.textContent === 'Manage billing'
        ? 'https://agiworkforce.com/settings/billing?from=chrome-extension'
        : 'https://agiworkforce.com/pricing?from=chrome-extension&feature=developer_surfaces';
    chrome.tabs.create({ url }).catch(() => {});
  });

  if (isClerkExtensionAuthConfigured()) {
    void observeClerkAuth(() => {
      void refreshCloudAccountUI();
    }).catch((error) => {
      console.warn('[SidePanel] Clerk auth listener failed:', error);
    });
  } else {
    signinDescription.textContent = 'AGI account sign-in is not configured in this build.';
    signinBtn.setAttribute('disabled', '');
  }

  // Initial load
  initialCloudAccountRefresh = refreshCloudAccountUI();

  drawer.appendChild(drawerBody);

  // ── Drawer footer: stats + about ───────────────────────────────────────────
  const drawerFooter = el('div', { id: 'sp-drawer-footer' });
  const statsRow = el('div', { class: 'sp-drawer-stats-row' });
  const tabCountStat = el('div', { class: 'sp-drawer-stat' });
  const tabCountVal = el('div', { class: 'sp-drawer-stat-value', id: 'sp-drawer-tab-count' }, '-');
  tabCountStat.appendChild(tabCountVal);
  tabCountStat.appendChild(el('div', { class: 'sp-drawer-stat-label' }, 'Tabs'));
  const actionCountStat = el('div', { class: 'sp-drawer-stat' });
  const actionCountVal = el(
    'div',
    { class: 'sp-drawer-stat-value', id: 'sp-drawer-action-count' },
    '-',
  );
  actionCountStat.appendChild(actionCountVal);
  actionCountStat.appendChild(el('div', { class: 'sp-drawer-stat-label' }, 'Actions'));
  const sessionTimeStat = el('div', { class: 'sp-drawer-stat' });
  const sessionTimeVal = el(
    'div',
    { class: 'sp-drawer-stat-value', id: 'sp-drawer-session-time' },
    '0:00',
  );
  sessionTimeStat.appendChild(sessionTimeVal);
  sessionTimeStat.appendChild(el('div', { class: 'sp-drawer-stat-label' }, 'Session'));
  statsRow.appendChild(tabCountStat);
  statsRow.appendChild(actionCountStat);
  statsRow.appendChild(sessionTimeStat);
  drawerFooter.appendChild(statsRow);

  const aboutRow = el('div', { class: 'sp-drawer-about-row' });
  aboutRow.appendChild(el('span', {}, `v${chrome.runtime.getManifest().version}`));
  const aboutUrlSpan = el('span', { class: 'sp-drawer-about-url', id: 'sp-drawer-about-url' }, '—');
  aboutRow.appendChild(aboutUrlSpan);
  // The Chrome-internal tab id used to render here as "#1873492". It is a
  // process-local integer with no meaning to a user and no way to act on it —
  // debug telemetry in a shipped surface.
  drawerFooter.appendChild(aboutRow);
  drawer.appendChild(drawerFooter);

  async function refreshDrawerStats(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({});
      tabCountVal.textContent = String(tabs.length);
      const statsData = await chrome.storage.local.get('stats');
      const count = (statsData['stats'] as { actionCount?: number } | undefined)?.actionCount ?? 0;
      actionCountVal.textContent = String(count);
    } catch {
      /* ignore */
    }
  }
  async function refreshDrawerTabInfo(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab?.url) {
        try {
          const url = new URL(tab.url);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            // Browser-internal pages have no hostname worth showing; `hostname`
            // is the raw extension id there. Same reason as pageChipLabel().
            aboutUrlSpan.textContent = 'Browser page';
            aboutUrlSpan.removeAttribute('title');
          } else {
            const chars = [...`${url.hostname}${url.pathname}`];
            aboutUrlSpan.textContent =
              chars.length > 28 ? chars.slice(0, 28).join('') + '…' : chars.join('');
            aboutUrlSpan.title = tab.url;
          }
        } catch {
          aboutUrlSpan.textContent = 'Unknown';
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Session timer for drawer stats footer
  function startDrawerSessionTimer(): void {
    if (_drawerSessionTimer !== null) return;
    _drawerSessionStart = Date.now();
    const update = (): void => {
      const elapsed = Math.floor((Date.now() - _drawerSessionStart) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      const el2 = document.getElementById('sp-drawer-session-time');
      if (el2) el2.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    };
    update();
    _drawerSessionTimer = setInterval(update, 1000);
  }
  startDrawerSessionTimer();

  document.body.appendChild(drawerOverlay);
  document.body.appendChild(drawer);

  // Phase 3: #sp-settings-bar removed; bridge URL is managed exclusively via the
  // drawer's Bridge URL section (drawerSaveBridgeUrl). The hidden bridgeUrlInput
  // element is kept in the DOM so that the drawer's sync line (oldInput?.value = raw)
  // remains a silent no-op rather than a querySelector miss.

  const statusPill = el('div', { id: 'sp-status-pill', class: 'disconnected' });
  const statusDot0 = document.createElement('span');
  statusDot0.className = 'sp-status-dot';
  statusPill.replaceChildren(statusDot0, 'Offline');

  const authBar = el('div', { id: 'sp-auth-bar' });
  authBar.appendChild(statusPill);
  document.body.appendChild(authBar);

  const tabBar = el('div', { id: 'sp-tab-bar', role: 'tablist', 'aria-label': 'AGI views' });
  const chatTabBtn = el(
    'button',
    { class: 'sp-tab', 'data-tab': 'chat', role: 'tab', 'aria-selected': 'false' },
    'Chat',
  );
  const workflowsTabBtn = el(
    'button',
    { class: 'sp-tab', 'data-tab': 'workflows', role: 'tab', 'aria-selected': 'false' },
    'Workflows',
  );
  const cuTabBtn = el(
    'button',
    {
      class: 'sp-tab sp-tab-active',
      'data-tab': 'computer-use',
      role: 'tab',
      'aria-selected': 'true',
    },
    'Computer Use',
  );
  tabBar.appendChild(chatTabBtn);
  tabBar.appendChild(workflowsTabBtn);
  tabBar.appendChild(cuTabBtn);
  document.body.appendChild(tabBar);

  // Build computer-use panel (kept in module scope so event handlers can reach it)
  const cuPanel: ComputerUsePanelAPI = buildComputerUsePanel();

  function switchTab(tab: SidePanelTab): void {
    const chatPanelEl = document.getElementById('sp-chat-panel');
    const workflowsPanelEl = document.getElementById('sp-workflows');
    const inputAreaEl = document.getElementById('sp-input-area');
    const toolbarEl = document.getElementById('sp-toolbar');
    chatTabBtn.classList.toggle('sp-tab-active', tab === 'chat');
    workflowsTabBtn.classList.toggle('sp-tab-active', tab === 'workflows');
    cuTabBtn.classList.toggle('sp-tab-active', tab === 'computer-use');
    chatTabBtn.setAttribute('aria-selected', String(tab === 'chat'));
    workflowsTabBtn.setAttribute('aria-selected', String(tab === 'workflows'));
    cuTabBtn.setAttribute('aria-selected', String(tab === 'computer-use'));
    if (chatPanelEl) chatPanelEl.classList.toggle('sp-tab-hidden', tab !== 'chat');
    if (workflowsPanelEl) workflowsPanelEl.classList.toggle('sp-tab-visible', tab === 'workflows');
    cuPanel.panelEl.classList.toggle('sp-tab-visible', tab === 'computer-use');
    if (inputAreaEl) inputAreaEl.style.display = tab === 'chat' ? '' : 'none';
    if (toolbarEl) toolbarEl.style.display = tab === 'chat' ? '' : 'none';
    // Only route back to chat from Workflows / Computer Use.
    tabBar.classList.toggle('sp-tab-bar-exit', tab !== 'chat');
    if (tab === 'workflows') {
      refreshWorkflowsShortcuts();
      refreshWorkflowsTasks();
    }
    if (tab === 'computer-use') {
      cuPanel.refreshAuthChip();
    }
  }
  chatTabBtn.addEventListener('click', () => switchTab('chat'));
  workflowsTabBtn.addEventListener('click', () => switchTab('workflows'));
  cuTabBtn.addEventListener('click', () => switchTab('computer-use'));

  const chatPanel = el('div', { id: 'sp-chat-panel' });

  const msgsArea = el('div', {
    id: 'sp-messages',
    role: 'log',
    'aria-live': 'polite',
    'aria-relevant': 'additions',
  });
  // #sp-empty: composer-first empty state (design-spec §8); hidden when messages present
  const emptyState = el('div', { id: 'sp-empty' });
  const emptyIcon = el('div', { id: 'sp-empty-icon' });
  // L-11 audit 2026-05-19: see logo SVG above.
  const emptyIconSvg = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="40" height="40" aria-hidden="true">
    <rect width="40" height="40" rx="10" fill="url(#emGrad)" opacity="0.18"/>
    <circle cx="20" cy="15" r="5" stroke="url(#emGrad)" stroke-width="1.75"/>
    <path d="M10 32c0-5.523 4.477-8.5 10-8.5s10 2.977 10 8.5" stroke="url(#emGrad)" stroke-width="1.75" stroke-linecap="round"/>
    <defs><linearGradient id="emGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
      <stop stop-color="#21808d"/><stop offset="1" stop-color="#da7756"/>
    </linearGradient></defs>
  </svg>`;
  appendSvgString(emptyIcon, emptyIconSvg);
  emptyState.appendChild(emptyIcon);
  emptyState.appendChild(el('div', { id: 'sp-empty-headline' }, 'How can I help you today?'));
  emptyState.appendChild(
    el(
      'div',
      { id: 'sp-empty-subtext' },
      'Ask a question, summarize a page, or type / for commands.',
    ),
  );
  msgsArea.appendChild(emptyState);

  const blockedState = el('div', {
    id: 'sp-blocked',
    role: 'status',
    'aria-live': 'polite',
  });
  const svgNS = 'http://www.w3.org/2000/svg';
  const shield = document.createElementNS(svgNS, 'svg');
  shield.id = 'sp-blocked-shield';
  shield.setAttribute('viewBox', '0 0 24 24');
  shield.setAttribute('fill', 'none');
  shield.setAttribute('aria-hidden', 'true');
  const shieldPath = document.createElementNS(svgNS, 'path');
  shieldPath.setAttribute(
    'd',
    'M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6l-8-4z',
  );
  shieldPath.setAttribute('stroke', 'var(--agi-ext-text-muted)');
  shieldPath.setAttribute('stroke-width', '1.5');
  shieldPath.setAttribute('stroke-linejoin', 'round');
  const shieldLine = document.createElementNS(svgNS, 'line');
  shieldLine.setAttribute('x1', '12');
  shieldLine.setAttribute('y1', '8');
  shieldLine.setAttribute('x2', '12');
  shieldLine.setAttribute('y2', '13');
  shieldLine.setAttribute('stroke', 'var(--agi-ext-text-muted)');
  shieldLine.setAttribute('stroke-width', '1.5');
  shieldLine.setAttribute('stroke-linecap', 'round');
  const shieldCircle = document.createElementNS(svgNS, 'circle');
  shieldCircle.setAttribute('cx', '12');
  shieldCircle.setAttribute('cy', '16');
  shieldCircle.setAttribute('r', '0.75');
  shieldCircle.setAttribute('fill', 'var(--agi-ext-text-muted)');
  shield.appendChild(shieldPath);
  shield.appendChild(shieldLine);
  shield.appendChild(shieldCircle);
  blockedState.appendChild(shield);
  const blockedCopy = el('div', { class: 'sp-blocked-copy' });
  blockedCopy.appendChild(
    createElementWith({ tag: 'div', id: 'sp-blocked-title', text: 'Page access unavailable' }),
  );
  blockedCopy.appendChild(
    createElementWith({
      tag: 'div',
      id: 'sp-blocked-desc',
      text: "You can still chat, but AGI can't read or automate browser-internal pages.",
    }),
  );
  blockedState.appendChild(blockedCopy);
  msgsArea.appendChild(blockedState);

  // BLOCKER-02b: offline onboarding — shown when bridge is unreachable on first open
  const offlineOnboarding = el('div', { id: 'sp-offline-onboarding' });
  const offlineIcon = el('div', { id: 'sp-offline-onboarding-icon' });
  const offlineIconSvg = `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="40" height="40" aria-hidden="true">
    <rect width="40" height="40" rx="10" fill="url(#ofGrad)" opacity="0.18"/>
    <circle cx="20" cy="15" r="5" stroke="url(#ofGrad)" stroke-width="1.75"/>
    <path d="M10 32c0-5.523 4.477-8.5 10-8.5s10 2.977 10 8.5" stroke="url(#ofGrad)" stroke-width="1.75" stroke-linecap="round"/>
    <defs><linearGradient id="ofGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
      <stop stop-color="var(--agi-ext-text-muted)"/><stop offset="1" stop-color="var(--agi-ext-text-muted)"/>
    </linearGradient></defs>
  </svg>`;
  appendSvgString(offlineIcon, offlineIconSvg);
  offlineOnboarding.appendChild(offlineIcon);
  offlineOnboarding.appendChild(
    el('div', { id: 'sp-offline-onboarding-title' }, 'Desktop app not running'),
  );
  offlineOnboarding.appendChild(
    el(
      'div',
      { id: 'sp-offline-onboarding-desc' },
      'AGI runs locally. Open the AGI desktop app to connect, then refresh this panel.',
    ),
  );
  const offlineCta = el('button', { id: 'sp-offline-onboarding-cta' }, 'Download AGI Desktop');
  offlineCta.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://agi.build/download' }).catch(() => {});
  });
  offlineOnboarding.appendChild(offlineCta);
  msgsArea.appendChild(offlineOnboarding);

  chatPanel.appendChild(msgsArea);
  document.body.appendChild(chatPanel);

  const workflowsPanel = el('div', { id: 'sp-workflows' });

  const recordSection = el('div', { class: 'sp-wf-section' });
  const recordHeader = el('div', { class: 'sp-wf-section-header' });
  recordHeader.appendChild(el('div', { class: 'sp-wf-section-title' }, 'Recording'));
  recordSection.appendChild(recordHeader);
  const recordBar = el('div', { class: 'sp-wf-record-bar' });
  const recordBtn = el('button', { class: 'sp-wf-record-btn', id: 'sp-wf-record-btn' });
  const actionCounter = el('div', { class: 'sp-wf-action-counter', id: 'sp-wf-action-counter' });
  actionCounter.style.display = 'none';
  function setRecordBtnLabel(label: string): void {
    const dot = document.createElement('span');
    dot.className = 'sp-wf-record-dot';
    recordBtn.replaceChildren(dot, ` ${label}`);
  }
  function setActionCounterLabel(count: number): void {
    const strong = document.createElement('strong');
    strong.textContent = String(count);
    actionCounter.replaceChildren(strong, ' actions recorded');
  }
  setRecordBtnLabel('Record');
  recordBar.appendChild(recordBtn);
  recordBar.appendChild(actionCounter);
  recordSection.appendChild(recordBar);

  // Value-capture opt-in. The content script fully supports recording typed
  // values (password/cc/OTP fields redacted, API-key-shaped tokens scrubbed —
  // C-05), but the toggle to enable it was never built, so recordings were
  // selector-only and replayed shortcuts typed nothing into forms. This wires
  // the extension-page-only SET_RECORDING_VALUE_CAPTURE message.
  const captureRow = el('label', { class: 'sp-wf-capture-values' });
  const captureToggle = el('input', {
    type: 'checkbox',
    id: 'sp-wf-capture-values',
  }) as HTMLInputElement;
  captureRow.appendChild(captureToggle);
  captureRow.appendChild(
    el('span', {}, 'Capture typed values (passwords & sensitive fields redacted)'),
  );
  function syncCaptureValues(): void {
    chrome.runtime.sendMessage(
      { type: 'SET_RECORDING_VALUE_CAPTURE', enabled: captureToggle.checked },
      () => void chrome.runtime.lastError,
    );
  }
  captureToggle.addEventListener('change', syncCaptureValues);
  recordSection.appendChild(captureRow);

  const saveDialog = el('div', { class: 'sp-wf-save-dialog', id: 'sp-wf-save-dialog' });
  saveDialog.appendChild(el('div', { class: 'sp-wf-save-dialog-title' }, 'Save this recording'));
  const saveNameInput = el('input', {
    class: 'sp-wf-form-input',
    placeholder: 'Workflow name...',
    id: 'sp-wf-save-name',
  }) as HTMLInputElement;
  saveDialog.appendChild(saveNameInput);
  const saveDialogActions = el('div', { class: 'sp-wf-form-actions' });
  const saveCancelBtn = el('button', { class: 'sp-wf-form-cancel-btn' }, 'Discard');
  const saveConfirmBtn = el('button', { class: 'sp-wf-form-save-btn' }, 'Save');
  saveDialogActions.appendChild(saveCancelBtn);
  saveDialogActions.appendChild(saveConfirmBtn);
  saveDialog.appendChild(saveDialogActions);
  recordSection.appendChild(saveDialog);

  let recordingPollInterval: ReturnType<typeof setInterval> | null = null;
  function startRecordingPoll() {
    stopRecordingPoll();
    recordingPollInterval = setInterval(() => {
      chrome.runtime.sendMessage(
        { type: 'GET_RECORDED_ACTIONS' },
        (resp: { success?: boolean; actions?: unknown[] } | undefined) => {
          if (chrome.runtime.lastError || !resp?.success) return;
          recordingActionCount = resp.actions?.length ?? 0;
          setActionCounterLabel(recordingActionCount);
        },
      );
    }, 1500);
  }
  function stopRecordingPoll() {
    if (recordingPollInterval !== null) {
      clearInterval(recordingPollInterval);
      recordingPollInterval = null;
    }
  }
  recordBtn.addEventListener('click', () => {
    if (isRecording) {
      chrome.runtime.sendMessage({ type: 'STOP_RECORDING' }, () => {
        if (chrome.runtime.lastError) {
          setRecordBtnLabel('Error');
          setTimeout(() => setRecordBtnLabel('Stop'), 1500);
          return;
        }
        isRecording = false;
        stopRecordingPoll();
        recordBtn.classList.remove('recording');
        setRecordBtnLabel('Record');
        actionCounter.style.display = 'none';
        saveDialog.classList.add('open');
        saveNameInput.value = '';
        saveNameInput.focus();
      });
    } else {
      // Sync the value-capture choice to the active tab's content script before
      // recording begins (the toggle may have been set on a different tab).
      syncCaptureValues();
      chrome.runtime.sendMessage({ type: 'START_RECORDING' }, () => {
        if (chrome.runtime.lastError) {
          setRecordBtnLabel('Error');
          setTimeout(() => setRecordBtnLabel('Record'), 1500);
          return;
        }
        isRecording = true;
        recordingActionCount = 0;
        recordBtn.classList.add('recording');
        setRecordBtnLabel('Stop');
        actionCounter.style.display = '';
        setActionCounterLabel(0);
        saveDialog.classList.remove('open');
        startRecordingPoll();
      });
    }
  });
  saveCancelBtn.addEventListener('click', () => saveDialog.classList.remove('open'));
  saveConfirmBtn.addEventListener('click', () => {
    const name = saveNameInput.value.trim();
    if (!name) {
      saveNameInput.style.borderColor = 'var(--agi-ext-danger)';
      setTimeout(() => {
        saveNameInput.style.borderColor = '';
      }, 1500);
      return;
    }
    chrome.runtime.sendMessage(
      { type: 'GET_RECORDED_ACTIONS' },
      (recResp: { success?: boolean; actions?: unknown[] } | undefined) => {
        if (chrome.runtime.lastError || !recResp?.success) {
          const origPlaceholder = saveNameInput.placeholder;
          saveNameInput.placeholder = 'Failed to retrieve actions';
          saveNameInput.style.borderColor = 'var(--agi-ext-danger)';
          setTimeout(() => {
            saveNameInput.placeholder = origPlaceholder;
            saveNameInput.style.borderColor = '';
          }, 2000);
          return;
        }
        const recActions = recResp.actions ?? [];
        if (recActions.length === 0) {
          saveDialog.classList.remove('open');
          return;
        }
        chrome.runtime.sendMessage({ type: 'SAVE_SHORTCUT', name, actions: recActions }, () => {
          if (chrome.runtime.lastError) {
            const origPlaceholder = saveNameInput.placeholder;
            saveNameInput.placeholder = 'Failed to save shortcut';
            saveNameInput.style.borderColor = 'var(--agi-ext-danger)';
            setTimeout(() => {
              saveNameInput.placeholder = origPlaceholder;
              saveNameInput.style.borderColor = '';
            }, 2000);
            return;
          }
          saveDialog.classList.remove('open');
          refreshWorkflowsShortcuts();
        });
      },
    );
  });
  saveNameInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') saveConfirmBtn.click();
  });
  workflowsPanel.appendChild(recordSection);

  const shortcutsSection = el('div', { class: 'sp-wf-section' });
  const shortcutsSectionHeader = el('div', { class: 'sp-wf-section-header' });
  const shortcutsTitle = el('div', { class: 'sp-wf-section-title' });
  shortcutsTitle.appendChild(document.createTextNode('Saved Shortcuts '));
  shortcutsTitle.appendChild(
    createElementWith({
      tag: 'span',
      className: 'sp-wf-count-badge',
      id: 'sp-wf-shortcuts-count',
      text: '0',
    }),
  );
  shortcutsSectionHeader.appendChild(shortcutsTitle);
  const createShortcutBtn = el(
    'button',
    { class: 'sp-wf-create-shortcut-btn', id: 'sp-wf-create-shortcut-btn' },
    '+ Create shortcut',
  );
  shortcutsSectionHeader.appendChild(createShortcutBtn);
  shortcutsSection.appendChild(shortcutsSectionHeader);
  const wfShortcutsList = el('div', { class: 'sp-wf-shortcuts-list', id: 'sp-wf-shortcuts-list' });
  setChild(wfShortcutsList, {
    tag: 'div',
    className: 'sp-wf-empty',
    text: 'Record your first workflow or create a prompt shortcut',
  });
  shortcutsSection.appendChild(wfShortcutsList);
  workflowsPanel.appendChild(shortcutsSection);

  /* ── Create-shortcut modal overlay ── */
  const createShortcutOverlay = el('div', {
    class: 'sp-create-shortcut-overlay',
    id: 'sp-create-shortcut-overlay',
  });
  const createShortcutModal = el('div', { class: 'sp-create-shortcut-modal' });
  const modalHeader = el('div', { class: 'sp-create-shortcut-header' });
  modalHeader.appendChild(el('div', { class: 'sp-create-shortcut-title' }, 'Create shortcut'));
  const modalCloseBtn = el('button', { class: 'sp-create-shortcut-close', title: 'Close' }, '×');
  modalHeader.appendChild(modalCloseBtn);
  createShortcutModal.appendChild(modalHeader);

  const nameField = el('div', { class: 'sp-create-shortcut-field' });
  nameField.appendChild(el('div', { class: 'sp-create-shortcut-label' }, 'Name'));
  const scNameInput = el('input', {
    class: 'sp-create-shortcut-input',
    placeholder: 'e.g. Daily research',
    id: 'sp-sc-name',
  }) as HTMLInputElement;
  nameField.appendChild(scNameInput);
  createShortcutModal.appendChild(nameField);

  const promptField = el('div', { class: 'sp-create-shortcut-field' });
  promptField.appendChild(el('div', { class: 'sp-create-shortcut-label' }, 'Prompt'));
  const scPromptInput = el('textarea', {
    class: 'sp-create-shortcut-textarea',
    placeholder: 'Enter your prompt text...',
    id: 'sp-sc-prompt',
  }) as HTMLTextAreaElement;
  promptField.appendChild(scPromptInput);
  createShortcutModal.appendChild(promptField);

  const modalActions = el('div', { class: 'sp-create-shortcut-actions' });
  const scCancelBtn = el('button', { class: 'sp-create-shortcut-cancel' }, 'Cancel');
  const scSaveBtn = el('button', { class: 'sp-create-shortcut-save' }, 'Create shortcut');
  modalActions.appendChild(scCancelBtn);
  modalActions.appendChild(scSaveBtn);
  createShortcutModal.appendChild(modalActions);
  createShortcutOverlay.appendChild(createShortcutModal);
  document.body.appendChild(createShortcutOverlay);

  function openCreateShortcutModal(): void {
    scNameInput.value = '';
    scPromptInput.value = '';
    createShortcutOverlay.classList.add('open');
    setTimeout(() => scNameInput.focus(), 50);
  }
  function closeCreateShortcutModal(): void {
    createShortcutOverlay.classList.remove('open');
  }

  createShortcutBtn.addEventListener('click', openCreateShortcutModal);
  modalCloseBtn.addEventListener('click', closeCreateShortcutModal);
  scCancelBtn.addEventListener('click', closeCreateShortcutModal);
  createShortcutOverlay.addEventListener('click', (e: MouseEvent) => {
    if (e.target === createShortcutOverlay) closeCreateShortcutModal();
  });

  scSaveBtn.addEventListener('click', () => {
    const name = scNameInput.value.trim();
    const prompt = scPromptInput.value.trim();
    if (!name) {
      scNameInput.style.borderColor = 'var(--agi-ext-danger)';
      setTimeout(() => {
        scNameInput.style.borderColor = '';
      }, 1500);
      return;
    }
    if (!prompt) {
      scPromptInput.style.borderColor = 'var(--agi-ext-danger)';
      setTimeout(() => {
        scPromptInput.style.borderColor = '';
      }, 1500);
      return;
    }
    (scSaveBtn as HTMLButtonElement).disabled = true;
    scSaveBtn.textContent = 'Saving...';
    chrome.runtime.sendMessage({ type: 'SAVE_SHORTCUT', name, actions: [], prompt }, () => {
      (scSaveBtn as HTMLButtonElement).disabled = false;
      scSaveBtn.textContent = 'Create shortcut';
      if (chrome.runtime.lastError) {
        scNameInput.style.borderColor = 'var(--agi-ext-danger)';
        setTimeout(() => {
          scNameInput.style.borderColor = '';
        }, 2000);
        return;
      }
      closeCreateShortcutModal();
      refreshWorkflowsShortcuts();
    });
  });

  scNameInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeCreateShortcutModal();
  });
  scPromptInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeCreateShortcutModal();
  });

  const tasksSection = el('div', { class: 'sp-wf-section' });
  const tasksSectionHeader = el('div', { class: 'sp-wf-section-header' });
  const tasksTitle = el('div', { class: 'sp-wf-section-title' });
  tasksTitle.appendChild(document.createTextNode('Scheduled Tasks '));
  tasksTitle.appendChild(
    createElementWith({
      tag: 'span',
      className: 'sp-wf-count-badge',
      id: 'sp-wf-tasks-count',
      text: '0',
    }),
  );
  tasksSectionHeader.appendChild(tasksTitle);
  const newTaskBtn = el(
    'button',
    { class: 'sp-wf-new-task-btn', id: 'sp-wf-new-task-btn' },
    '+ New Task',
  );
  tasksSectionHeader.appendChild(newTaskBtn);
  tasksSection.appendChild(tasksSectionHeader);
  const wfTasksList = el('div', { class: 'sp-wf-tasks-list', id: 'sp-wf-tasks-list' });
  setChild(wfTasksList, { tag: 'div', className: 'sp-wf-empty', text: 'No scheduled tasks' });
  tasksSection.appendChild(wfTasksList);

  const newTaskForm = el('div', { class: 'sp-wf-new-task-form', id: 'sp-wf-new-task-form' });
  newTaskForm.appendChild(el('div', { class: 'sp-wf-form-label' }, 'Task Name'));
  const ntNameInput = el('input', {
    class: 'sp-wf-form-input',
    placeholder: 'e.g. Check news',
    id: 'sp-wf-nt-name',
  }) as HTMLInputElement;
  newTaskForm.appendChild(ntNameInput);
  newTaskForm.appendChild(el('div', { class: 'sp-wf-form-label' }, 'Prompt'));
  const ntPromptInput = el('input', {
    class: 'sp-wf-form-input',
    placeholder: 'What should the AI do?',
    id: 'sp-wf-nt-prompt',
  }) as HTMLInputElement;
  newTaskForm.appendChild(ntPromptInput);
  newTaskForm.appendChild(el('div', { class: 'sp-wf-form-label' }, 'Schedule'));
  const ntScheduleSelect = el('select', {
    class: 'sp-wf-form-select',
    id: 'sp-wf-nt-schedule',
  }) as HTMLSelectElement;
  for (const opt of [
    { value: 'hourly', label: 'Hourly' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
  ]) {
    ntScheduleSelect.appendChild(el('option', { value: opt.value }, opt.label));
  }
  newTaskForm.appendChild(ntScheduleSelect);
  const ntFormError = el('div', {
    class: 'sp-wf-form-error',
    id: 'sp-wf-nt-error',
    role: 'status',
    'aria-live': 'polite',
  });
  newTaskForm.appendChild(ntFormError);
  const ntFormActions = el('div', { class: 'sp-wf-form-actions' });
  const ntCancelBtn = el('button', { class: 'sp-wf-form-cancel-btn' }, 'Cancel');
  const ntSaveBtn = el(
    'button',
    { class: 'sp-wf-form-save-btn', id: 'sp-wf-nt-save' },
    'Create Task',
  );
  ntFormActions.appendChild(ntCancelBtn);
  ntFormActions.appendChild(ntSaveBtn);
  newTaskForm.appendChild(ntFormActions);
  tasksSection.appendChild(newTaskForm);
  workflowsPanel.appendChild(tasksSection);

  const resetNewTaskForm = (): void => {
    newTaskForm.classList.remove('open');
    ntNameInput.value = '';
    ntPromptInput.value = '';
    ntNameInput.style.borderColor = '';
    ntPromptInput.style.borderColor = '';
    ntFormError.textContent = '';
    ntSaveBtn.removeAttribute('disabled');
    ntSaveBtn.textContent = 'Create Task';
  };
  resetScheduledTaskDraftForOwnerTransition = resetNewTaskForm;

  newTaskBtn.addEventListener('click', () => {
    newTaskForm.classList.toggle('open');
    ntFormError.textContent = '';
    if (newTaskForm.classList.contains('open')) ntNameInput.focus();
  });
  ntCancelBtn.addEventListener('click', () => {
    scheduledTaskCreateRequestFence.invalidate();
    resetNewTaskForm();
  });
  ntSaveBtn.addEventListener('click', () => {
    const name = ntNameInput.value.trim();
    const prompt = ntPromptInput.value.trim();
    if (!name || !prompt) {
      if (!name) {
        ntNameInput.style.borderColor = 'var(--agi-ext-danger)';
        setTimeout(() => {
          ntNameInput.style.borderColor = '';
        }, 1500);
      }
      if (!prompt) {
        ntPromptInput.style.borderColor = 'var(--agi-ext-danger)';
        setTimeout(() => {
          ntPromptInput.style.borderColor = '';
        }, 1500);
      }
      return;
    }
    ntFormError.textContent = '';
    ntSaveBtn.setAttribute('disabled', 'true');
    ntSaveBtn.textContent = 'Creating…';
    const createRequest = scheduledTaskCreateRequestFence.begin(_ctx.managedCloudOwner);
    chrome.runtime.sendMessage(
      {
        type: 'CREATE_SCHEDULED_TASK',
        ...(createRequest.owner ? { owner: createRequest.owner } : {}),
        task: {
          name,
          prompt,
          enabled: true,
          scheduleType: ntScheduleSelect.value,
          scheduleValue: '',
        },
      },
      (response: { success?: boolean; error?: string } | undefined) => {
        if (!scheduledTaskCreateRequestFence.isCurrent(createRequest, _ctx.managedCloudOwner)) {
          return;
        }
        ntSaveBtn.removeAttribute('disabled');
        ntSaveBtn.textContent = 'Create Task';
        const runtimeError = chrome.runtime.lastError?.message;
        if (runtimeError || response?.success !== true) {
          ntFormError.textContent =
            runtimeError || response?.error || 'The scheduled task could not be created.';
          return;
        }
        resetNewTaskForm();
        refreshWorkflowsTasks();
      },
    );
  });

  const groupsSection = el('div', { class: 'sp-wf-section' });
  groupsSection.appendChild(
    (() => {
      const h = el('div', { class: 'sp-wf-section-header' });
      h.appendChild(el('div', { class: 'sp-wf-section-title' }, 'Tab Groups'));
      return h;
    })(),
  );
  groupsSection.appendChild(
    el('div', { class: 'sp-wf-group-desc' }, 'Organize tabs into groups for focused workflows.'),
  );
  const groupBtnsRow = el('div', { class: 'sp-wf-group-btns' });
  const wfGroupAddBtn = el('button', { class: 'sp-wf-group-action-btn' }, '+ Group Tab');
  const wfGroupRemoveBtn = el('button', { class: 'sp-wf-group-action-btn' }, '- Ungroup Tab');
  wfGroupAddBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage(
      { type: 'ADD_TAB_TO_GROUP' },
      (resp: { success?: boolean } | undefined) => {
        if (chrome.runtime.lastError || !resp?.success) return;
        wfGroupAddBtn.classList.add('active');
        wfGroupAddBtn.textContent = 'Grouped!';
        setTimeout(() => {
          wfGroupAddBtn.classList.remove('active');
          wfGroupAddBtn.textContent = '+ Group Tab';
        }, 1500);
      },
    );
  });
  wfGroupRemoveBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage(
      { type: 'REMOVE_TAB_FROM_GROUP' },
      (resp: { success?: boolean } | undefined) => {
        if (chrome.runtime.lastError || !resp?.success) return;
        wfGroupRemoveBtn.textContent = 'Removed!';
        setTimeout(() => {
          wfGroupRemoveBtn.textContent = '- Ungroup Tab';
        }, 1500);
      },
    );
  });
  groupBtnsRow.appendChild(wfGroupAddBtn);
  groupBtnsRow.appendChild(wfGroupRemoveBtn);
  groupsSection.appendChild(groupBtnsRow);
  workflowsPanel.appendChild(groupsSection);
  document.body.appendChild(workflowsPanel);

  // Computer Use panel — append after workflows; shown/hidden by switchTab()
  document.body.appendChild(cuPanel.panelEl);

  // Wire escalation events from content scripts / background into the panel UI.
  // The background relays 'agi:escalate' CustomEvents as runtime messages.
  chrome.runtime.onMessage.addListener((msg: unknown) => {
    if (!msg || typeof msg !== 'object') return;
    const m = msg as Record<string, unknown>;
    const runId = m['runId'];
    const runGeneration =
      typeof m['runGeneration'] === 'number' && Number.isSafeInteger(m['runGeneration'])
        ? m['runGeneration']
        : undefined;
    if (m['type'] === 'AGI_CU_STATE') {
      const status = m['status'];
      if (status === 'running' && typeof runId === 'string' && runGeneration !== undefined) {
        cuPanel.setRunState(true, runId, runGeneration);
        switchTab('computer-use');
      } else if (
        (status === 'stopped' || status === 'completed' || status === 'error') &&
        cuPanel.ownsRun(runId)
      ) {
        cuPanel.setRunState(false, runId as string);
      }
    } else if (m['type'] === 'AGI_CU_STEP') {
      if (!cuPanel.ownsRun(runId)) return;
      const step = m['step'] as Parameters<ComputerUsePanelAPI['appendStep']>[0];
      cuPanel.appendStep(step);
      // Auto-switch to Computer Use tab when the agent starts
      switchTab('computer-use');
    } else if (m['type'] === 'AGI_CU_USAGE') {
      if (!cuPanel.ownsRun(runId)) return;
      // Live step/token counts from the background agent loop. Guard the shape so
      // a malformed message can never render NaN into the usage meter.
      const usage = m['usage'] as Parameters<ComputerUsePanelAPI['updateUsageMeter']>[0];
      if (
        usage &&
        typeof usage.stepsUsed === 'number' &&
        typeof usage.maxSteps === 'number' &&
        typeof usage.totalTokens === 'number'
      ) {
        cuPanel.updateUsageMeter(usage);
      }
    } else if (m['type'] === 'AGI_CU_ESCALATE') {
      if (!cuPanel.ownsRun(runId)) return;
      const reason = typeof m['reason'] === 'string' ? m['reason'] : 'Fast-path autofill stalled.';
      cuPanel.showHandoffBanner(reason);
      switchTab('computer-use');
    } else if (m['type'] === 'AGI_CU_APPROVE_REQUEST') {
      if (!cuPanel.ownsRun(runId)) return;
      // Background is asking the panel to show an approval card for an action.
      // The panel resolves the card and replies with AGI_CU_APPROVE_RESPONSE.
      const requestId = typeof m['requestId'] === 'string' ? m['requestId'] : '';
      const toolName = typeof m['toolName'] === 'string' ? m['toolName'] : 'action';
      const description = typeof m['description'] === 'string' ? m['description'] : '';
      switchTab('computer-use');
      cuPanel.showApprovalCard(toolName, description, (allowed: boolean) => {
        void chrome.runtime.sendMessage({
          type: 'AGI_CU_APPROVE_RESPONSE',
          requestId,
          allowed,
        });
      });
    }
  });

  // ── "Run Autofill" button orchestration ───────────────────────────────────
  // Message flow (secure 3-context design):
  //   1. User clicks "Run Autofill" in the Computer Use tab controls bar.
  //   2. Side panel sends AGI_RUN_AUTOFILL to the content script of the
  //      active tab (DOM work only — no CDP).
  //   3. Content script returns { success, platform, autofill, escalation }.
  //   4. If escalation.shouldEscalate, side panel:
  //      a. Shows the handoff banner.
  //      b. Switches to the Computer Use tab.
  //      c. Sends AGI_START_COMPUTER_USE to the BACKGROUND (CDP-capable).
  //   5. Background validates the tab's origin against siteAllowlistCache,
  //      then starts runAgentLoop() and streams AGI_CU_STEP events back.
  cuPanel.onRunAutofill(() => {
    void (async () => {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTabId = activeTab?.id;
      if (!activeTabId) {
        cuPanel.showHandoffBanner('Could not determine the active tab. Please try again.', 'error');
        return;
      }

      let resp: Record<string, unknown> | null = null;
      try {
        resp = (await chrome.tabs.sendMessage(activeTabId, {
          type: 'AGI_RUN_AUTOFILL',
        })) as Record<string, unknown> | null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        cuPanel.showHandoffBanner(explainExtensionFailure(msg), 'error');
        return;
      }

      if (!resp || !resp['success']) {
        const errMsg = typeof resp?.['error'] === 'string' ? resp['error'] : 'Autofill failed';
        cuPanel.showHandoffBanner(String(errMsg), 'error');
        return;
      }

      const escalation = resp['escalation'] as
        | { shouldEscalate?: boolean; agentGoal?: string; triggers?: unknown[] }
        | undefined;

      if (!escalation?.shouldEscalate) {
        // Fast-path completed cleanly — no agent loop needed.
        cuPanel.showHandoffBanner('No agent escalation needed.', 'success');
        switchTab('computer-use');
        return;
      }

      // Fast-path stalled → hand off to the computer-use agent loop.
      const goal = typeof escalation.agentGoal === 'string' ? escalation.agentGoal : '';
      cuPanel.showHandoffBanner(
        `Fast-path autofill stalled (${String(escalation.triggers?.length ?? 0)} trigger(s)). ` +
          `Switching to computer use…`,
      );
      switchTab('computer-use');

      // Persist the "ask before acting" preference so the background can read it.
      await chrome.storage.local.set({
        agi_cu_ask_before_acting: cuPanel.isAskBeforeActing(),
      });

      // Bind the pending admission to an exact run id before sending. Stop,
      // Clear, and pagehide can now invalidate the start even while the worker
      // is still awaiting tab/auth/storage checks.
      const requestedRunId = `cu_run_${crypto.randomUUID()}`;
      cuPanel.setRunState(true, requestedRunId);

      let startResponse:
        | { success?: boolean; runId?: string; runGeneration?: number; error?: string }
        | undefined;
      try {
        startResponse = (await chrome.runtime.sendMessage({
          type: 'AGI_START_COMPUTER_USE',
          runId: requestedRunId,
          goal,
          tabId: activeTabId,
        })) as typeof startResponse;
      } catch (error) {
        if (!cuPanel.ownsRun(requestedRunId)) return;
        cuPanel.setRunState(false, requestedRunId);
        cuPanel.showHandoffBanner(
          error instanceof Error
            ? error.message
            : 'Computer use could not start. Please try again.',
          'error',
        );
        return;
      }

      // A Stop/Clear/pagehide during admission tombstoned this exact intent.
      // Its eventual response must not revive the controls or show a stale error.
      if (!cuPanel.ownsRun(requestedRunId)) return;
      if (startResponse?.success === true && startResponse.runId === requestedRunId) {
        cuPanel.setRunState(true, startResponse.runId, startResponse.runGeneration);
        return;
      }
      cuPanel.setRunState(false, requestedRunId);
      cuPanel.showHandoffBanner(
        startResponse?.error ?? 'Computer use could not start. Please try again.',
        'error',
      );
    })();
  });

  const toolbar = el('div', { id: 'sp-toolbar' });

  // Context button is now rendered as a persistent chip in the composer bar (see below).
  // The toolbar slot is intentionally empty for context; the chip is built inside inputArea.

  const micBtn = el('button', {
    class: 'sp-tool-btn',
    id: 'sp-mic-btn',
    title: 'Voice input',
    'aria-label': 'Voice input',
  });
  micBtn.appendChild(renderIcon(Mic, 16));
  toolbar.appendChild(micBtn);

  const groupBtn = el('button', {
    class: 'sp-tool-btn',
    id: 'sp-group-btn',
    title: 'Add current tab to group',
  });
  groupBtn.appendChild(renderIcon(Folder, 14));
  const groupBtnLabel = document.createTextNode(' Group');
  groupBtn.appendChild(groupBtnLabel);
  let isGrouped = false;
  groupBtn.addEventListener('click', () => {
    const msgType = isGrouped ? 'REMOVE_TAB_FROM_GROUP' : 'ADD_TAB_TO_GROUP';
    chrome.runtime.sendMessage(
      { type: msgType },
      (response: { success?: boolean; grouped?: boolean } | undefined) => {
        if (chrome.runtime.lastError || !response?.success) return;
        isGrouped = response.grouped ?? false;
        groupBtnLabel.textContent = isGrouped ? ' Ungroup' : ' Group';
        groupBtn.classList.toggle('has-context', isGrouped);
      },
    );
  });
  toolbar.appendChild(groupBtn);

  const shortcutsWrapper = el('div', { class: 'sp-shortcuts-wrapper' });
  const shortcutsBtn = el('button', {
    class: 'sp-tool-btn',
    id: 'sp-shortcuts-btn',
    title: 'Saved shortcuts',
  });
  shortcutsBtn.appendChild(renderIcon(Zap, 14));
  shortcutsBtn.appendChild(document.createTextNode(' Shortcuts'));

  const shortcutsDropdown = el('div', { id: 'sp-shortcuts-dropdown' });
  setChild(shortcutsDropdown, {
    tag: 'div',
    className: 'sp-shortcuts-empty',
    text: 'No saved shortcuts',
  });

  shortcutsBtn.addEventListener('click', () => {
    const isOpen = shortcutsDropdown.classList.toggle('open');
    if (isOpen) refreshShortcuts();
  });

  document.addEventListener('click', (e: MouseEvent) => {
    if (!shortcutsWrapper.contains(e.target as Node)) {
      shortcutsDropdown.classList.remove('open');
    }
  });

  shortcutsWrapper.appendChild(shortcutsDropdown);
  shortcutsWrapper.appendChild(shortcutsBtn);
  toolbar.appendChild(shortcutsWrapper);

  const toolsWrapper = el('div', { class: 'sp-tools-wrapper' });
  const toolsBtn = el('button', {
    class: 'sp-tool-btn',
    id: 'sp-tools-btn',
    title: 'WebMCP tools discovered on this page',
  });
  toolsBtn.appendChild(renderIcon(Plug, 14));
  toolsBtn.appendChild(document.createTextNode(' Tools (0)'));

  const toolsDropdown = el('div', { id: 'sp-tools-dropdown' });
  setChild(toolsDropdown, {
    tag: 'div',
    className: 'sp-tools-empty',
    text: 'No tools discovered on this page',
  });

  toolsBtn.addEventListener('click', () => {
    toolsDropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e: MouseEvent) => {
    if (!toolsWrapper.contains(e.target as Node)) {
      toolsDropdown.classList.remove('open');
    }
  });

  toolsWrapper.appendChild(toolsDropdown);
  toolsWrapper.appendChild(toolsBtn);
  toolbar.appendChild(toolsWrapper);

  document.body.appendChild(toolbar);

  const inputArea = el('div', { id: 'sp-input-area' });
  const cloudGate = el('div', {
    id: 'sp-cloud-gate',
    role: 'region',
    'aria-label': 'AGI Cloud access',
  });
  const cloudGateCopy = el('div', { id: 'sp-cloud-gate-copy' });
  cloudGateCopy.appendChild(el('div', { id: 'sp-cloud-gate-title' }, 'AGI Cloud'));
  cloudGateCopy.appendChild(
    el('div', { id: 'sp-cloud-gate-message', 'aria-live': 'polite' }, managedCloudGateMessage),
  );
  const cloudGateAction = el('button', {
    id: 'sp-cloud-gate-action',
    type: 'button',
    hidden: '',
  }) as HTMLButtonElement;
  cloudGateAction.addEventListener('click', async () => {
    const action = cloudGateAction.dataset['action'] as ManagedCloudGateAction | undefined;
    if (!action || action === 'none') return;
    cloudGateAction.disabled = true;
    try {
      if (action === 'sign_in') {
        await openClerkSignIn();
        setManagedCloudChatState('signed_out', {
          message: 'Finish sign-in in the new tab, then return here.',
          action: 'retry',
          actionLabel: 'Check sign-in',
        });
      } else if (action === 'open_web') {
        await chrome.tabs.create({ url: 'https://agiworkforce.com' });
      } else if (action === 'upgrade') {
        await chrome.tabs.create({
          url: 'https://agiworkforce.com/pricing?from=chrome-extension&feature=developer_surfaces',
        });
      } else if (action === 'billing') {
        await chrome.tabs.create({
          url: 'https://agiworkforce.com/settings/billing?from=chrome-extension',
        });
      } else if (action === 'usage') {
        await chrome.tabs.create({
          url: 'https://agiworkforce.com/settings/usage?from=chrome-extension',
        });
      } else if (action === 'retry') {
        await refreshCloudAccountUI(true);
      }
    } catch (error) {
      setManagedCloudChatState('unavailable', {
        message: error instanceof Error ? error.message : 'Unable to open AGI Cloud.',
        action: 'retry',
        actionLabel: 'Retry',
      });
    } finally {
      cloudGateAction.disabled = false;
    }
  });
  cloudGate.appendChild(cloudGateCopy);
  cloudGate.appendChild(cloudGateAction);

  const composerShell = el('div', { id: 'sp-composer-shell' });
  const inputRow = el('div', { id: 'sp-input-row' });

  const inputEl = el('textarea', {
    id: 'sp-input',
    placeholder: 'Type / for commands',
    rows: '1',
    name: 'message',
    'aria-label': 'Message AGI',
  }) as HTMLTextAreaElement;

  // ── Slash-command autocomplete ────────────────────────────────────────────
  // Registered BEFORE the send handler below so an open menu consumes Enter
  // instead of dispatching the raw "/su" text as a message.
  const slashMenu = el('div', {
    id: 'sp-slash-menu',
    role: 'listbox',
    'aria-label': 'Slash commands',
  });
  let slashMatches: Array<[string, SlashCommandMeta]> = [];
  let slashActive = 0;

  const slashOpen = (): boolean => slashMatches.length > 0;

  function renderSlashMenu(): void {
    slashMenu.textContent = '';
    if (!slashOpen()) {
      slashMenu.classList.remove('visible');
      inputEl.removeAttribute('aria-activedescendant');
      return;
    }
    slashMatches.forEach(([name, meta], i) => {
      const item = el('button', {
        class: `sp-slash-item${i === slashActive ? ' active' : ''}`,
        type: 'button',
        role: 'option',
        id: `sp-slash-opt-${i}`,
        'aria-selected': i === slashActive ? 'true' : 'false',
      });
      item.appendChild(el('span', { class: 'sp-slash-name' }, name));
      item.appendChild(el('span', { class: 'sp-slash-hint' }, meta.hint));
      // mousedown, not click: click fires after the textarea blurs.
      item.addEventListener('mousedown', (ev: Event) => {
        ev.preventDefault();
        acceptSlash(i);
      });
      slashMenu.appendChild(item);
    });
    slashMenu.classList.add('visible');
    inputEl.setAttribute('aria-activedescendant', `sp-slash-opt-${slashActive}`);
  }

  function closeSlashMenu(): void {
    slashMatches = [];
    slashActive = 0;
    renderSlashMenu();
  }

  function acceptSlash(index: number): void {
    const picked = slashMatches[index];
    if (!picked) return;
    // Trailing space so an argument can follow, e.g. "/translate to French".
    inputEl.value = `${picked[0]} `;
    closeSlashMenu();
    inputEl.focus();
    autoResizeInput(inputEl);
    updateSendButton();
  }

  function refreshSlashMenu(): void {
    slashMatches = matchSlashCommands(inputEl.value);
    if (slashActive >= slashMatches.length) slashActive = 0;
    renderSlashMenu();
  }

  inputEl.addEventListener('input', refreshSlashMenu);
  inputEl.addEventListener('blur', () => closeSlashMenu());
  inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!slashOpen()) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      slashActive = (slashActive + 1) % slashMatches.length;
      renderSlashMenu();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      slashActive = (slashActive - 1 + slashMatches.length) % slashMatches.length;
      renderSlashMenu();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation(); // keep the send handler below from firing
      acceptSlash(slashActive);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSlashMenu();
    }
  });

  inputEl.addEventListener('input', () => autoResizeInput(inputEl));
  inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = inputEl.value;
      inputEl.value = '';
      autoResizeInput(inputEl);
      sendMessage(text);
    }
  });

  // 2026-05-21 — paste-image support on the textarea. Captures clipboard image
  // items (screenshots, copied images) so users don't have to round-trip
  // through the +menu. Mirrors `packages/ui/unified-chat/ChatInput.tsx` and the
  // VS Code webview composer wire. Image-only kind, single readAsDataURL per
  // file; acceptIncomingComposerFiles applies the transport caps on append.
  inputEl.addEventListener('paste', (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pasted: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file && file.type.startsWith('image/')) pasted.push(file);
      }
    }
    if (pasted.length > 0) {
      e.preventDefault();
      acceptIncomingComposerFiles(pasted);
    }
  });

  const sendBtn = el('button', {
    id: 'sp-send-btn',
    title: 'Send (Cmd+Enter)',
    'aria-label': 'Send message',
    'data-mode': 'send',
  });
  sendBtn.appendChild(renderIcon(ArrowUp, 16));
  sendBtn.addEventListener('click', () => {
    if (sendBtn.getAttribute('data-mode') === 'stop') {
      cancelCurrentManagedStream(true);
      return;
    }
    const text = inputEl.value;
    inputEl.value = '';
    autoResizeInput(inputEl);
    sendMessage(text);
  });

  // + attachment button and 2-item popup menu
  const attachWrapper = el('div', { class: 'sp-attach-wrapper' });

  const attachBtn = el('button', {
    class: 'sp-attach-btn',
    id: 'sp-attach-btn',
    title: 'Add attachment',
    'aria-label': 'Add attachment',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  });
  setText(attachBtn, '+');

  const attachMenu = el('div', {
    id: 'sp-attach-menu',
    role: 'menu',
    'aria-label': 'Attachment options',
  });

  const screenshotItem = el('button', {
    class: 'sp-attach-menu-item',
    type: 'button',
    role: 'menuitem',
  });
  screenshotItem.appendChild(renderIcon(Camera, 16));
  screenshotItem.appendChild(document.createTextNode('Take a screenshot'));
  screenshotItem.addEventListener('click', () => {
    attachMenu.classList.remove('open');
    attachBtn.setAttribute('aria-expanded', 'false');
    chrome.runtime.sendMessage(
      { type: 'CAPTURE_SCREENSHOT', format: 'png', quality: 90 },
      (resp: { success?: boolean; data?: string } | undefined) => {
        if (chrome.runtime.lastError || !resp?.success || !resp.data) return;
        composerAttachmentNotice = null;
        admitComposerAttachment(resp.data);
        updateAttachmentPreview();
      },
    );
  });

  const fileItem = el('button', {
    class: 'sp-attach-menu-item',
    type: 'button',
    role: 'menuitem',
  });
  fileItem.appendChild(renderIcon(FileImage, 16));
  fileItem.appendChild(document.createTextNode('Add an image'));
  const fileInput = el('input', {
    type: 'file',
    // Narrower than image/* so the picker offers only what the wire accepts.
    accept: COMPOSER_ATTACHMENT_ACCEPT,
    class: 'sp-attach-file-input',
    id: 'sp-attach-file-input',
  }) as HTMLInputElement;
  fileInput.addEventListener('change', () => {
    const picked = fileInput.files;
    if (!picked || picked.length === 0) return;
    acceptIncomingComposerFiles(picked);
    fileInput.value = '';
  });
  fileItem.addEventListener('click', () => {
    attachMenu.classList.remove('open');
    attachBtn.setAttribute('aria-expanded', 'false');
    fileInput.click();
  });

  attachMenu.appendChild(screenshotItem);
  attachMenu.appendChild(fileItem);
  attachWrapper.appendChild(attachMenu);
  attachWrapper.appendChild(attachBtn);
  attachWrapper.appendChild(fileInput);

  attachBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = attachMenu.classList.toggle('open');
    attachBtn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) screenshotItem.focus();
  });
  document.addEventListener('click', (e: MouseEvent) => {
    if (!attachWrapper.contains(e.target as Node)) {
      attachMenu.classList.remove('open');
      attachBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Attachment preview bar (hidden until an attachment is added)
  const attachmentBar = el('div', { id: 'sp-attachment-bar' });
  attachmentBar.style.display = 'none';

  inputRow.appendChild(attachWrapper);
  inputRow.appendChild(inputEl);
  inputRow.appendChild(sendBtn);

  // Above the input row: the panel is short, so a downward menu would clip.
  composerShell.appendChild(slashMenu);
  composerShell.appendChild(inputRow);

  // Persistent page-context chip in the composer bottom bar
  const composerBar = el('div', { id: 'sp-composer-bar' });
  contextBtn = el('button', {
    class: 'sp-context-chip',
    id: 'sp-context-chip',
    title: 'Attach page content to next message',
  });
  contextBtn.textContent = currentPageHostname || 'page';
  contextBtn.addEventListener('click', async () => {
    if (_ctx.pendingPageContext) {
      _ctx.pendingPageContext = null;
      updateContextButton();
      return;
    }
    const chip = contextBtn!;
    const prevText = chip.textContent ?? '';
    chip.textContent = 'capturing…';
    chip.classList.add('loading');
    chip.disabled = true;
    const ctx = await capturePageContext();
    chip.disabled = false;
    chip.classList.remove('loading');
    if (ctx) {
      _ctx.pendingPageContext = ctx;
    } else {
      chip.textContent = prevText;
    }
    updateContextButton();
  });
  composerBar.appendChild(contextBtn);

  // ── Autonomy chip (EXT-11) ────────────────────────────────────────────────
  // The panel had no visible autonomy control: the ask-before-acting gate lived
  // only in the Computer Use tab, so from the composer there was no way to see
  // — let alone change — whether the agent would act without asking. This chip
  // reports and toggles the same `agi_cu_ask_before_acting` pref that
  // background.ts treats as authoritative; it does not own the gate.
  const autonomyChip = el('button', {
    class: 'sp-autonomy-chip',
    id: 'sp-autonomy-chip',
    type: 'button',
  }) as HTMLButtonElement;
  const autonomyLabel = el('span', { id: 'sp-autonomy-label' });
  autonomyChip.appendChild(renderIcon(Shield, 11));
  autonomyChip.appendChild(autonomyLabel);

  function renderAutonomyChip(askFirst: boolean): void {
    autonomyChip.setAttribute('data-mode', askFirst ? 'ask' : 'full');
    autonomyLabel.textContent = askFirst ? 'Ask first' : 'Full access';
    autonomyChip.title = askFirst
      ? 'Every browser action is confirmed before it runs. Click to allow the agent to act without asking.'
      : 'The agent can act in your browser without asking. Click to require confirmation for each action.';
    autonomyChip.setAttribute('aria-pressed', String(!askFirst));
    autonomyChip.setAttribute(
      'aria-label',
      askFirst ? 'Permission mode: ask before acting' : 'Permission mode: full access',
    );
  }

  // Default to the safe state until storage answers, matching the rule
  // background.ts applies: only an explicit stored `false` disables the gate.
  renderAutonomyChip(true);
  chrome.storage.local.get('agi_cu_ask_before_acting', (items) => {
    if (chrome.runtime.lastError) return;
    renderAutonomyChip(items['agi_cu_ask_before_acting'] !== false);
  });

  autonomyChip.addEventListener('click', () => {
    const askFirst = autonomyChip.getAttribute('data-mode') === 'ask';
    const next = !askFirst;
    renderAutonomyChip(next);
    void chrome.storage.local.set({ agi_cu_ask_before_acting: next });
  });

  // Keep the chip and the Computer Use checkbox from drifting apart — they are
  // two views of one stored value.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const change = changes['agi_cu_ask_before_acting'];
    if (!change) return;
    renderAutonomyChip(change.newValue !== false);
  });

  composerBar.appendChild(autonomyChip);

  // ── Catalog-driven reasoning effort ─────────────────────────────────────
  // Auto and Quick do not claim a provider effort ladder before the router has
  // returned a concrete model. The control remains openable in that state so
  // its disabled explanation is visible instead of presenting a dead mystery.
  const effortControl = el('div', { id: 'sp-effort-control' });
  const effortButton = el('button', {
    id: 'sp-effort-btn',
    type: 'button',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
  }) as HTMLButtonElement;
  const effortPopover = el('div', {
    id: 'sp-effort-popover',
    role: 'dialog',
    'aria-label': 'Reasoning effort',
    tabindex: '-1',
  });
  const effortHeading = el('div', { class: 'sp-effort-heading' });
  effortHeading.appendChild(el('span', {}, 'Reasoning effort'));
  const effortValue = el('span', { id: 'sp-effort-value' });
  effortHeading.appendChild(effortValue);
  const effortSlider = el('input', {
    id: 'sp-effort-slider',
    type: 'range',
    min: '0',
    max: '0',
    step: '1',
    value: '0',
    'aria-label': 'Reasoning effort',
  }) as HTMLInputElement;
  const effortScale = el('div', { id: 'sp-effort-scale' });
  const effortDescription = el('div', { id: 'sp-effort-description' });
  effortPopover.appendChild(effortHeading);
  effortPopover.appendChild(effortSlider);
  effortPopover.appendChild(effortScale);
  effortPopover.appendChild(effortDescription);
  effortControl.appendChild(effortButton);
  effortControl.appendChild(effortPopover);

  function renderEffortControl(): void {
    const routingSelection = _ctx.quickMode ? 'auto-economy' : _ctx.selectedModel;
    const state = getManagedEffortControlState(
      routingSelection,
      _ctx.quickMode ? undefined : _ctx.currentModelKey,
      _ctx.reasoningEffort,
    );
    const ready = state.status === 'ready' && state.effort !== undefined;
    const valueLabel = ready
      ? EFFORT_LABEL[state.effort!]
      : state.status === 'awaiting-route'
        ? 'Auto'
        : 'N/A';

    effortButton.textContent = `Advanced · ${valueLabel}`;
    effortButton.title = state.description;
    effortButton.dataset['disabled'] = String(!ready);
    effortButton.setAttribute(
      'aria-label',
      ready
        ? `Reasoning effort: ${valueLabel}`
        : `Reasoning effort unavailable. ${state.description}`,
    );
    effortValue.textContent = valueLabel;
    effortDescription.textContent = state.description;
    effortSlider.disabled = !ready;
    effortSlider.min = '0';
    effortSlider.max = String(Math.max(0, state.options.length - 1));
    const selectedIndex = ready ? Math.max(0, state.options.indexOf(state.effort!)) : 0;
    effortSlider.value = String(selectedIndex);
    effortSlider.setAttribute('aria-valuemin', '0');
    effortSlider.setAttribute('aria-valuemax', effortSlider.max);
    effortSlider.setAttribute('aria-valuenow', String(selectedIndex));
    effortSlider.setAttribute('aria-valuetext', valueLabel);
    clearChildren(effortScale);
    if (ready) {
      const firstEffort = state.options[0];
      const lastEffort = state.options[state.options.length - 1];
      if (firstEffort) effortScale.appendChild(el('span', {}, EFFORT_LABEL[firstEffort]));
      if (lastEffort && lastEffort !== firstEffort) {
        effortScale.appendChild(el('span', {}, EFFORT_LABEL[lastEffort]));
      }
    } else {
      effortScale.appendChild(el('span', {}, 'Available after a supported model is known'));
    }
  }

  refreshEffortUI = renderEffortControl;
  effortSlider.addEventListener('input', () => {
    const routingSelection = _ctx.quickMode ? 'auto-economy' : _ctx.selectedModel;
    const state = getManagedEffortControlState(
      routingSelection,
      _ctx.quickMode ? undefined : _ctx.currentModelKey,
      _ctx.reasoningEffort,
    );
    const selected = state.options[Number(effortSlider.value)];
    if (!selected) return;
    _ctx.reasoningEffort = selected;
    renderEffortControl();
    saveMessages();
  });
  effortButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = effortPopover.classList.toggle('open');
    effortButton.setAttribute('aria-expanded', String(open));
    if (open) (effortSlider.disabled ? effortPopover : effortSlider).focus();
  });
  effortPopover.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    effortPopover.classList.remove('open');
    effortButton.setAttribute('aria-expanded', 'false');
    effortButton.focus();
  });
  document.addEventListener('click', (event: MouseEvent) => {
    if (effortControl.contains(event.target as Node)) return;
    effortPopover.classList.remove('open');
    effortButton.setAttribute('aria-expanded', 'false');
  });
  renderEffortControl();
  composerBar.appendChild(effortControl);

  // W5-06: per-turn Auto Economy override for lower-latency replies.
  const quickModeToggle = el('button', {
    id: 'sp-quick-mode-toggle',
    title: 'Quick mode: prioritize lower latency for each reply',
    'data-active': 'false',
  });
  quickModeToggle.textContent = 'Quick';
  chrome.storage.local.get({ agi_quick_mode: false }, (items) => {
    const active = items['agi_quick_mode'] === true;
    _ctx.quickMode = active;
    quickModeToggle.setAttribute('data-active', active ? 'true' : 'false');
    quickModeToggle.classList.toggle('sp-quick-mode-active', active);
    refreshEffortUI();
  });
  quickModeToggle.addEventListener('click', () => {
    const current = quickModeToggle.getAttribute('data-active') === 'true';
    const next = !current;
    _ctx.quickMode = next;
    quickModeToggle.setAttribute('data-active', next ? 'true' : 'false');
    quickModeToggle.classList.toggle('sp-quick-mode-active', next);
    refreshEffortUI();
    chrome.runtime
      .sendMessage({ type: 'SET_QUICK_MODE', enabled: next })
      .then((response: { success?: boolean } | undefined) => {
        if (response?.success === true) return;
        _ctx.quickMode = current;
        refreshEffortUI();
        quickModeToggle.setAttribute('data-active', current ? 'true' : 'false');
        quickModeToggle.classList.toggle('sp-quick-mode-active', current);
      })
      .catch((err: unknown) => {
        _ctx.quickMode = current;
        refreshEffortUI();
        quickModeToggle.setAttribute('data-active', current ? 'true' : 'false');
        quickModeToggle.classList.toggle('sp-quick-mode-active', current);
        console.warn('[SidePanel] Failed to set quick mode:', err);
      });
  });
  composerBar.appendChild(quickModeToggle);

  const promptChipsRow = el('div', { id: 'sp-prompt-chips' });
  for (const cmd of ['/summarize', '/explain', '/extract', '/code']) {
    const chip = el('button', { class: 'sp-cmd-chip', type: 'button' }, cmd);
    chip.addEventListener('click', () => sendMessage(cmd));
    promptChipsRow.appendChild(chip);
  }

  composerShell.appendChild(composerBar);

  // Bridge-offline notice — shown at the top of the input area when the
  // desktop bridge is not connected. Includes a reconnect button that
  // triggers the same flow as the popup's manual reconnect.
  const bridgeNotice = el('div', { id: 'sp-bridge-notice' });
  const bridgeNoticeDot = el('span', { id: 'sp-bridge-notice-dot' });
  const bridgeNoticeText = el(
    'span',
    { id: 'sp-bridge-notice-text' },
    'Desktop tools are optional and currently disconnected',
  );
  const bridgeNoticeReconnect = el(
    'button',
    { id: 'sp-bridge-notice-reconnect', type: 'button' },
    'Reconnect',
  );
  bridgeNoticeReconnect.addEventListener('click', () => {
    chrome.runtime
      .sendMessage({ type: 'RECONNECT_NATIVE' })
      .catch((err: unknown) => console.warn('[SidePanel] RECONNECT_NATIVE failed:', err));
  });
  bridgeNotice.appendChild(bridgeNoticeDot);
  bridgeNotice.appendChild(bridgeNoticeText);
  bridgeNotice.appendChild(bridgeNoticeReconnect);

  inputArea.appendChild(cloudGate);
  inputArea.appendChild(bridgeNotice);
  inputArea.appendChild(attachmentBar);
  inputArea.appendChild(composerShell);
  inputArea.appendChild(promptChipsRow);
  document.body.appendChild(inputArea);
  setManagedCloudChatState(managedCloudChatState, {
    message: managedCloudGateMessage,
    action: managedCloudGateAction,
    actionLabel: managedCloudGateActionLabel,
  });

  // First-run onboarding carousel overlay — built hidden; revealed after the
  // async agi_onboarding_completed storage check in the boot Promise.all.
  // Callback re-runs probeBridgeStatus() so the correct post-onboarding state
  // (offline or connected) is shown as soon as the carousel is dismissed.
  buildOnboardingOverlay(() => {
    void probeBridgeStatus();
  });

  // 2026-05-21 — drag-drop image attachments onto the composer. Highlights
  // the shell while a Files drag is in flight; on drop we route through
  // acceptIncomingComposerFiles which handles the size cap, the image-type
  // filter and the transport's count and byte ceilings. Matches the VS Code
  // webview behaviour shipped in this same session.
  composerShell.addEventListener('dragover', (event: DragEvent) => {
    const types = event.dataTransfer?.types;
    if (!types) return;
    let hasFile = false;
    for (let i = 0; i < types.length; i++) {
      if (types[i] === 'Files') {
        hasFile = true;
        break;
      }
    }
    if (!hasFile) return;
    event.preventDefault();
    composerShell.classList.add('dragover');
  });
  composerShell.addEventListener('dragleave', (event: DragEvent) => {
    const relatedNode = event.relatedTarget as Node | null;
    if (relatedNode && composerShell.contains(relatedNode)) return;
    composerShell.classList.remove('dragover');
  });
  composerShell.addEventListener('drop', (event: DragEvent) => {
    if (!event.dataTransfer) return;
    event.preventDefault();
    composerShell.classList.remove('dragover');
    acceptIncomingComposerFiles(event.dataTransfer.files);
  });

  setupVoiceInput(micBtn, inputEl, autoResizeInput);
  renderMessages();

  // Claude-style front door: default to Chat. The panel is now the extension's
  // primary surface (opened on toolbar click), so it must read as a chat first.
  // Computer-Use still auto-activates when a CU event actually arrives.
  switchTab('chat');
}

function refreshShortcuts(): void {
  chrome.runtime.sendMessage(
    { type: 'LIST_SHORTCUTS' },
    (
      response:
        | {
            success?: boolean;
            shortcuts?: Array<{ id: string; name: string; actions: unknown[]; createdAt: number }>;
          }
        | undefined,
    ) => {
      if (chrome.runtime.lastError || !response?.success) return;
      const dropdown = document.getElementById('sp-shortcuts-dropdown');
      if (!dropdown) return;
      clearChildren(dropdown);

      // Every control in this dropdown previously returned silently on failure:
      // replay discarded its callback entirely, delete only acted on success,
      // and Save had three separate silent returns — including the common case
      // of pressing Save with nothing recorded. A click that does nothing and
      // says nothing is indistinguishable from a dead control.
      const statusEl = el('div', { class: 'sp-shortcuts-status', role: 'status' });
      const setStatus = (message: string, kind: 'error' | 'success'): void => {
        statusEl.textContent = message;
        statusEl.setAttribute('data-kind', kind);
      };
      const shortcuts = response.shortcuts ?? [];
      if (shortcuts.length === 0) {
        setChild(dropdown, {
          tag: 'div',
          className: 'sp-shortcuts-empty',
          text: 'No saved shortcuts',
        });
      } else {
        for (const sc of shortcuts) {
          const item = el('div', { class: 'sp-shortcut-item' });
          item.appendChild(el('span', { class: 'sp-shortcut-name' }, sc.name));
          const actions = el('div', { class: 'sp-shortcut-actions' });
          const playBtn = iconButton({ class: 'sp-shortcut-action-btn', title: 'Replay' }, Play);
          playBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.runtime.sendMessage(
              { type: 'REPLAY_SHORTCUT', shortcutId: sc.id },
              (replayResponse: { success?: boolean; error?: string } | undefined) => {
                if (chrome.runtime.lastError || !replayResponse?.success) {
                  const reason =
                    replayResponse?.error ??
                    chrome.runtime.lastError?.message ??
                    'the page may have changed since it was recorded';
                  setStatus(`Could not replay "${sc.name}": ${reason}`, 'error');
                  dropdown.classList.add('open');
                }
              },
            );
            dropdown.classList.remove('open');
          });
          const delBtn = iconButton({ class: 'sp-shortcut-action-btn', title: 'Delete' }, Trash2);
          delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chrome.runtime.sendMessage(
              { type: 'DELETE_SHORTCUT', shortcutId: sc.id },
              (deleteResponse: { success?: boolean; error?: string } | undefined) => {
                if (chrome.runtime.lastError || !deleteResponse?.success) {
                  const reason =
                    deleteResponse?.error ?? chrome.runtime.lastError?.message ?? 'unknown error';
                  setStatus(`Could not delete "${sc.name}": ${reason}`, 'error');
                  return;
                }
                refreshShortcuts();
              },
            );
          });
          actions.appendChild(playBtn);
          actions.appendChild(delBtn);
          item.appendChild(actions);
          dropdown.appendChild(item);
        }
      }

      const saveRow = el('div', { class: 'sp-save-shortcut-row' });
      const nameInput = el('input', {
        class: 'sp-save-shortcut-input',
        placeholder: 'Name this shortcut…',
      }) as HTMLInputElement;
      const saveBtn = el('button', { class: 'sp-save-shortcut-btn' }, 'Save Recording');
      saveBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name) {
          setStatus('Give the shortcut a name before saving it.', 'error');
          nameInput.focus();
          return;
        }
        // Get recorded actions from content script
        chrome.runtime.sendMessage(
          { type: 'GET_RECORDED_ACTIONS' },
          (recResponse: { success?: boolean; actions?: unknown[] } | undefined) => {
            if (chrome.runtime.lastError || !recResponse?.success) {
              setStatus(
                `Could not read the recording: ${
                  chrome.runtime.lastError?.message ?? 'no response from the page'
                }`,
                'error',
              );
              return;
            }
            const recActions = recResponse.actions ?? [];
            if (recActions.length === 0) {
              // The most common silent failure: Save was pressed before
              // anything was recorded, and the row simply did nothing.
              setStatus('Nothing recorded yet — start a recording first.', 'error');
              return;
            }
            chrome.runtime.sendMessage(
              {
                type: 'SAVE_SHORTCUT',
                name,
                actions: recActions,
              },
              (saveResponse: { success?: boolean; error?: string } | undefined) => {
                if (chrome.runtime.lastError || !saveResponse?.success) {
                  const reason =
                    saveResponse?.error ?? chrome.runtime.lastError?.message ?? 'unknown error';
                  setStatus(`Could not save "${name}": ${reason}`, 'error');
                  return;
                }
                nameInput.value = '';
                refreshShortcuts();
              },
            );
          },
        );
      });
      saveRow.appendChild(nameInput);
      saveRow.appendChild(saveBtn);
      dropdown.appendChild(saveRow);
      dropdown.appendChild(statusEl);
    },
  );
}

function refreshWorkflowsShortcuts(): void {
  chrome.runtime.sendMessage(
    { type: 'LIST_SHORTCUTS' },
    (
      response:
        | {
            success?: boolean;
            shortcuts?: Array<{
              id: string;
              name: string;
              actions: unknown[];
              createdAt: number;
              prompt?: string;
              startUrl?: string;
              scheduled?: boolean;
            }>;
          }
        | undefined,
    ) => {
      if (chrome.runtime.lastError || !response?.success) return;
      const list = document.getElementById('sp-wf-shortcuts-list');
      const countBadge = document.getElementById('sp-wf-shortcuts-count');
      if (!list) return;
      clearChildren(list);
      const shortcuts = response.shortcuts ?? [];
      if (countBadge) countBadge.textContent = String(shortcuts.length);
      if (shortcuts.length === 0) {
        setChild(list, {
          tag: 'div',
          className: 'sp-wf-empty',
          text: 'Record your first workflow or create a prompt shortcut',
        });
        return;
      }
      // A prompt shortcut's answer is filed under a shortcut-scoped
      // conversation. Only offer "View last result" where one actually exists.
      const owner = _ctx.managedCloudOwner;
      void (owner ? listConversations(owner) : Promise.resolve([] as ConversationEntry[]))
        .catch(() => [] as ConversationEntry[])
        .then((entries) => renderShortcutRows(list, shortcuts, new Set(entries.map((e) => e.id))));
    },
  );
}

function renderShortcutRows(
  list: HTMLElement,
  shortcuts: Array<{
    id: string;
    name: string;
    actions: unknown[];
    createdAt: number;
    prompt?: string;
    startUrl?: string;
    scheduled?: boolean;
  }>,
  storedConversationIds: ReadonlySet<string>,
): void {
  clearChildren(list);
  for (const sc of shortcuts) {
    const item = el('div', { class: 'sp-wf-shortcut-item' });
    const isPromptBased = sc.prompt && Array.isArray(sc.actions) && sc.actions.length === 0;
    const shortcutIcon = el('div', { class: 'sp-wf-shortcut-icon' });
    if (isPromptBased) {
      shortcutIcon.textContent = '/';
    } else {
      shortcutIcon.appendChild(renderIcon(Zap, 14));
    }
    item.appendChild(shortcutIcon);
    const info = el('div', { class: 'sp-wf-shortcut-info' });
    info.appendChild(el('div', { class: 'sp-wf-shortcut-name' }, sc.name));
    const actionsCount = Array.isArray(sc.actions) ? sc.actions.length : 0;
    const dateStr = new Date(sc.createdAt).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    });
    // Legacy records may still carry `scheduled`, but shortcut scheduling
    // never had an executor. Do not present that dormant bit as a live state;
    // actual scheduled work is managed in the Scheduled Tasks section below.
    const metaText = isPromptBased
      ? `prompt shortcut · ${dateStr}`
      : `${actionsCount} actions · ${dateStr}`;
    info.appendChild(el('div', { class: 'sp-wf-shortcut-meta' }, metaText));
    item.appendChild(info);
    const btns = el('div', { class: 'sp-wf-shortcut-btns' });
    const resultConversationId = backgroundConversationId('shortcut', sc.id);
    const playBtn = el('button', { class: 'sp-wf-btn-replay', title: 'Replay workflow' }, ' Play');
    playBtn.addEventListener('click', () => {
      playBtn.textContent = '...';
      (playBtn as HTMLButtonElement).disabled = true;
      chrome.runtime.sendMessage(
        { type: 'REPLAY_SHORTCUT', shortcutId: sc.id },
        (resp: { success?: boolean } | undefined) => {
          playBtn.textContent = ' Play';
          (playBtn as HTMLButtonElement).disabled = false;
          // A prompt shortcut produces an answer rather than a page effect.
          // Show it here instead of leaving the user with a spinner that
          // finished and nothing to read.
          if (chrome.runtime.lastError || !resp?.success) return;
          if (!isPromptBased || !resultConversationId) return;
          void openStoredConversation(resultConversationId);
        },
      );
    });
    btns.appendChild(playBtn);
    if (isPromptBased && resultConversationId && storedConversationIds.has(resultConversationId)) {
      const resultBtn = iconButton(
        { class: 'sp-wf-task-result', title: 'View last result' },
        MessageSquare,
      );
      resultBtn.addEventListener('click', () => {
        void openStoredConversation(resultConversationId);
      });
      btns.appendChild(resultBtn);
    }
    const delBtn = iconButton({ class: 'sp-wf-btn-delete', title: 'Delete' }, Trash2);
    delBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'DELETE_SHORTCUT', shortcutId: sc.id }, () => {
        if (!chrome.runtime.lastError) refreshWorkflowsShortcuts();
      });
    });
    btns.appendChild(delBtn);
    item.appendChild(btns);
    list.appendChild(item);
  }
}

function refreshWorkflowsTasks(): void {
  const request = scheduledTasksRequestFence.begin(_ctx.managedCloudOwner);
  chrome.runtime.sendMessage(
    { type: 'LIST_SCHEDULED_TASKS', ...(request.owner ? { owner: request.owner } : {}) },
    (
      response:
        | {
            success?: boolean;
            tasks?: Array<{
              id: string;
              name: string;
              enabled: boolean;
              scheduleType: string;
              scheduleValue: string;
              lastRun?: number;
            }>;
          }
        | undefined,
    ) => {
      if (!scheduledTasksRequestFence.isCurrent(request, _ctx.managedCloudOwner)) return;
      if (chrome.runtime.lastError || !response?.success) return;
      const list = document.getElementById('sp-wf-tasks-list');
      const countBadge = document.getElementById('sp-wf-tasks-count');
      if (!list) return;
      clearChildren(list);
      const tasks = response.tasks ?? [];
      if (countBadge) countBadge.textContent = String(tasks.length);
      if (tasks.length === 0) {
        setChild(list, { tag: 'div', className: 'sp-wf-empty', text: 'No scheduled tasks' });
        return;
      }
      // A scheduled run files its answer under a task-scoped conversation id.
      // Look up which of those exist so "View result" is only rendered when it
      // has something to open — an always-on button would be the dead control
      // this fix is closing.
      const owner = request.owner;
      void (owner ? listConversations(owner) : Promise.resolve([] as ConversationEntry[]))
        .catch(() => [] as ConversationEntry[])
        .then((entries) => {
          if (!scheduledTasksRequestFence.isCurrent(request, _ctx.managedCloudOwner)) return;
          renderTaskRows(list, tasks, new Set(entries.map((e) => e.id)), owner);
        });
    },
  );
}

function clearWorkflowsTaskRows(): void {
  const list = document.getElementById('sp-wf-tasks-list');
  const countBadge = document.getElementById('sp-wf-tasks-count');
  if (countBadge) countBadge.textContent = '0';
  if (list) {
    setChild(list, { tag: 'div', className: 'sp-wf-empty', text: 'No scheduled tasks' });
  }
}

function renderTaskRows(
  list: HTMLElement,
  tasks: Array<{
    id: string;
    name: string;
    enabled: boolean;
    scheduleType: string;
    scheduleValue: string;
    lastRun?: number;
  }>,
  storedConversationIds: ReadonlySet<string>,
  owner: ManagedCloudOwner | null,
): void {
  clearChildren(list);
  for (const task of tasks) {
    const item = el('div', { class: 'sp-wf-task-item' });
    const toggle = el('input', {
      type: 'checkbox',
      class: 'sp-wf-task-toggle',
    }) as HTMLInputElement;
    toggle.checked = task.enabled;
    toggle.addEventListener('change', () => {
      const previousState = !toggle.checked;
      chrome.runtime.sendMessage(
        {
          type: 'UPDATE_SCHEDULED_TASK',
          ...(owner ? { owner } : {}),
          taskId: task.id,
          updates: { enabled: toggle.checked },
        },
        (resp: { success?: boolean } | undefined) => {
          if (chrome.runtime.lastError || !resp?.success) {
            toggle.checked = previousState;
          }
        },
      );
    });
    item.appendChild(toggle);
    const info = el('div', { class: 'sp-wf-task-info' });
    info.appendChild(el('div', { class: 'sp-wf-task-name' }, task.name));
    info.appendChild(el('span', { class: 'sp-wf-task-schedule-badge' }, task.scheduleType));
    item.appendChild(info);
    const resultConversationId = backgroundConversationId('task', task.id);
    if (resultConversationId && storedConversationIds.has(resultConversationId)) {
      const resultBtn = iconButton(
        { class: 'sp-wf-task-result', title: 'View last result' },
        MessageSquare,
      );
      resultBtn.addEventListener('click', () => {
        void openStoredConversation(resultConversationId);
      });
      item.appendChild(resultBtn);
    }
    const delBtn = iconButton({ class: 'sp-wf-task-delete', title: 'Delete task' }, Trash2);
    delBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage(
        { type: 'DELETE_SCHEDULED_TASK', taskId: task.id, ...(owner ? { owner } : {}) },
        () => {
          if (!chrome.runtime.lastError) refreshWorkflowsTasks();
        },
      );
    });
    item.appendChild(delBtn);
    list.appendChild(item);
  }
}

chrome.runtime.onMessage.addListener((msg: unknown) => {
  const envelope = msg as { type: string };

  // A completion notification for a scheduled task / shortcut was clicked while
  // this panel was already open. Open the conversation holding its answer.
  if (envelope.type === OPEN_BROWSER_CONVERSATION_MESSAGE) {
    const request = msg as { owner?: unknown; conversationId?: unknown };
    const owner = normalizeManagedCloudOwner(request.owner);
    if (
      owner &&
      sameManagedCloudOwner(owner, _ctx.managedCloudOwner) &&
      typeof request.conversationId === 'string' &&
      request.conversationId.length > 0
    ) {
      void openStoredConversation(request.conversationId).then((opened) => {
        // The boot-time pointer is the fallback for a panel that was not yet
        // listening; consume it here so the result is not opened twice.
        if (opened) void takePendingResultConversation(owner);
      });
    }
    return;
  }

  if (envelope.type === 'WEBMCP_TOOLS_CHANGED') {
    // Background broadcasts are hints only. Re-discover with this panel's
    // current navigation epoch so a delayed payload can never populate UI.
    if (isWebMCPUpdateHintForActivePage(msg, activeWebMCPPage) && activeWebMCPPage) {
      refreshWebMCPToolsForActivePage(activeWebMCPPage);
    }
    return;
  }

  // Live connection-status updates from the background service worker.
  // Background now also broadcasts these via chrome.runtime.sendMessage so
  // extension views (side panel, popup) receive them — not just content scripts.
  if (envelope.type === 'CONNECTION_STATUS_CHANGED') {
    const statusMsg = msg as { connected?: boolean; status?: string };
    const nowConnected = statusMsg.connected === true;
    if (nowConnected !== _ctx.isConnected) {
      _ctx.isConnected = nowConnected;
      updateConnectionStatus();
      if (nowConnected) {
        chrome.storage.local.set({ agi_ever_connected: true }).catch(() => {});
        hideLegacyOfflineOnboarding();
      }
    }
    return;
  }

  const chunk = msg as ChatChunk;
  if (chunk.type !== 'CHAT_CHUNK') return;
  const chunkOwner = normalizeManagedCloudOwner(chunk.owner);
  if (
    !chunkOwner ||
    !isManagedCloudBroadcastOwnedBy(
      _ctx.managedCloudOwner,
      ownerByStreamId.get(chunk.id),
      chunkOwner,
    )
  )
    return;
  if (chunk.clientInstanceId !== SIDE_PANEL_CLIENT_INSTANCE_ID) return;
  if (chunk.id !== _ctx.currentStreamId) return;
  armManagedStreamInactivityWatchdog(chunk.id);
  const streamUsedQuick = quickModeByStreamId.get(chunk.id) === true;
  // Quick is a request-only overlay. Its resolved economy route must not
  // replace the conversation's durable Auto/manual route or effort.
  if (!streamUsedQuick && applyRoutingContinuation(chunk.routing)) saveMessages();

  if (chunk.error) {
    // Cloud free-trial sentinels: show actionable UI instead of a generic error
    // bubble.  The background sets these when the gateway returns a 403 quota
    // response or a 401 auth failure so we can guide the user to upgrade/sign-in
    // rather than surfacing a confusing "request failed" message.
    if (chunk.error === '__QUOTA_EXCEEDED__') {
      void refreshCloudAccountUI();
      handleStreamError(
        chunk.id,
        'Your AGI Cloud usage limit has been reached. Open AGI Cloud settings to review your plan.',
      );
      return;
    }
    if (chunk.error === '__AUTH_REQUIRED__') {
      void refreshCloudAccountUI();
      handleStreamError(chunk.id, 'Sign in to AGI Cloud to send messages.');
      return;
    }
    handleStreamError(chunk.id, chunk.error);
    return;
  }

  if (chunk.cloudRun) {
    cloudRunsByStreamId.set(chunk.id, { ...chunk.cloudRun });
    const existing = _ctx.messages.find((message) => message.id === chunk.id);
    if (existing) {
      existing.cloudAgentRun = { ...chunk.cloudRun };
      if (streamUsedQuick) existing.managedQuickMode = true;
    } else {
      // The gateway publishes its durable run handle before the first text
      // frame. Persist an invisible placeholder immediately so closing the
      // panel in that gap still leaves enough state to resume.
      _ctx.messages.push({
        id: chunk.id,
        role: 'assistant',
        content: '',
        streaming: true,
        timestamp: Date.now(),
        cloudAgentRun: { ...chunk.cloudRun },
        ...(streamUsedQuick ? { managedQuickMode: true } : {}),
      });
      trimLiveMessages();
    }
    saveMessages();
  }

  if (chunk.agentEvent) {
    removeThinking();
    const before = _ctx.messages.find((message) => message.id === chunk.id);
    const alreadyAwaitingApproval = before?.agentActivity?.entries.some(
      (entry) => entry.kind === 'tool' && entry.status === 'awaiting-approval',
    );
    if (
      chunk.agentEvent.event.type === 'approval-requested' &&
      !alreadyAwaitingApproval &&
      before
    ) {
      before.cloudApprovalDecisions = undefined;
      before.cloudApprovalError = undefined;
    }
    const assistant = applyCanonicalAgentEvent(_ctx.messages, chunk.id, chunk.agentEvent);
    if (streamUsedQuick) assistant.managedQuickMode = true;
    if (
      chunk.agentEvent.event.type === 'approval-resolved' &&
      !assistant.agentActivity?.entries.some(
        (entry) => entry.kind === 'tool' && entry.status === 'awaiting-approval',
      )
    ) {
      assistant.cloudApprovalDecisions = undefined;
      assistant.cloudApprovalError = undefined;
    }
    const cloudRun = cloudRunsByStreamId.get(chunk.id);
    if (cloudRun) assistant.cloudAgentRun = { ...cloudRun };
    trimLiveMessages();
    _ctx.needsMessageRebuild = true;
    renderMessages();
    saveMessages();
  }

  if (!chunk.text && !chunk.done) return;

  if (!_ctx.messages.find((m) => m.id === chunk.id)) {
    removeThinking();
    const assistantMsg: ChatMessage = {
      id: chunk.id,
      role: 'assistant',
      content: chunk.text,
      streaming: true,
      timestamp: Date.now(),
      ...(streamUsedQuick ? { managedQuickMode: true } : {}),
      ...(cloudRunsByStreamId.get(chunk.id)
        ? { cloudAgentRun: { ...cloudRunsByStreamId.get(chunk.id)! } }
        : {}),
    };
    _ctx.messages.push(assistantMsg);
    trimLiveMessages();
    renderMessages();
  } else {
    const existing = _ctx.messages.find((m) => m.id === chunk.id)!;
    existing.content += chunk.text;
    if (document.getElementById(`sp-bubble-${chunk.id}`)) {
      updateStreamingBubble(chunk.id, existing.content, chunk.done);
    } else {
      removeThinking();
      renderMessages();
    }
  }

  if (chunk.done) {
    quickModeByStreamId.delete(chunk.id);
    ownerByStreamId.delete(chunk.id);
    stopManagedChatKeepalive();
    if (_ctx.streamTimeoutHandle) {
      clearTimeout(_ctx.streamTimeoutHandle);
      _ctx.streamTimeoutHandle = null;
    }
    const existing = _ctx.messages.find((m) => m.id === chunk.id);
    if (existing) {
      existing.streaming = false;
      const cloudRun = cloudRunsByStreamId.get(chunk.id);
      if (cloudRun) existing.cloudAgentRun = { ...cloudRun };
    }
    cloudRunsByStreamId.delete(chunk.id);
    removeThinking();
    _ctx.isStreaming = false;
    _ctx.currentStreamId = null;
    updateSendButton();
    _ctx.needsMessageRebuild = true;
    saveMessages();
    renderMessages();
  }
});

injectStyles();
buildUI();
chrome.tabs.onActivated?.addListener(() => {
  refreshPageHostname(true);
});
chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
  // When the current page is restricted its normalized identity is null. Keep
  // querying this panel window on navigation so a later HTTP(S) page becomes
  // discoverable; updates still cannot inject tools without an exact identity.
  if (activeWebMCPPage && tabId !== activeWebMCPPage.tabId) return;
  if (!activeWebMCPPage) {
    if (changeInfo.url !== undefined || changeInfo.status === 'complete') {
      refreshPageHostname(changeInfo.url !== undefined);
    }
    return;
  }
  if (typeof changeInfo.url === 'string') {
    // Clear the old page's tools synchronously; the follow-up query refreshes
    // the exact active identity and asks that content script for its catalog.
    updateActivePageIdentity(tabId, changeInfo.url, true);
  }
  if (changeInfo.url !== undefined || changeInfo.status === 'complete') {
    refreshPageHostname();
  }
});
// Populate hostname chip as soon as UI is available
refreshPageHostname();

// ── First-run onboarding gate ─────────────────────────────────────────────
// isOnboardingComplete() reads agi_onboarding_completed from chrome.storage.local
// (defined in features/side-panel/onboarding.ts and covered by unit tests).
// We check it BEFORE probing bridge status so we don't surface the offline-
// onboarding screen underneath the carousel (double-overlay bug).
// probeBridgeStatus() is called by the carousel's onComplete callback; and
// also in the returning-user branch below.
// The storage key literal lives only in features/side-panel/onboarding.ts;
// isOnboardingComplete() encapsulates the read so the key is a single source
// of truth shared with the unit tests.
void (async () => {
  const onboardingDone = await isOnboardingComplete();
  if (!onboardingDone) {
    showOnboardingOverlay();
    void checkPendingContextHandoff();
    // Defer bridge status until onboarding carousel is dismissed.
    // probeBridgeStatus() is invoked by the onComplete callback in buildUI().
    initialCloudAccountRefresh
      .then(() => {
        if (_ctx.messages.length > 0) renderMessages();
      })
      .catch(() => {});
    return;
  }
  // Onboarding already complete — normal boot.
  Promise.all([
    initialCloudAccountRefresh.then(() => {
      if (_ctx.messages.length > 0) {
        renderMessages();
      }
    }),
    // Probe bridge status on init — updates connection pill if desktop is running
    probeBridgeStatus(),
  ])
    .then(() => {
      // Check for pending chat from context menu (selection, summarize, explain, translate)
      checkPendingChat();
      void checkPendingContextHandoff();
      // A notification click opens the panel without being able to pass a
      // payload, so the conversation it pointed at is parked in session storage.
      void checkPendingBackgroundResult();
    })
    .catch((err) => {
      // Boot errors must not surface to the user, but log for debugging.
      console.error('[SidePanel] Boot initialization failed:', err);
    });
})();

async function probeBridgeStatus(): Promise<void> {
  // Ask the background service worker for the live native-connection status.
  // This is the only authoritative source: the desktop `:8787` server only
  // serves `POST /pair` and WebSocket upgrades — a direct HTTP GET to
  // `/v1/status` always fails (404 or ECONNREFUSED), so the side panel used
  // to permanently show "Offline" even when the desktop app was running.
  //
  // GET_CONNECTION_STATUS also triggers a fresh native ping in background
  // (background.ts:1033) so the status it returns is up-to-date.
  try {
    const result = (await chrome.runtime.sendMessage({
      type: 'GET_CONNECTION_STATUS',
    })) as { success?: boolean; nativeConnected?: boolean; connectionStatus?: string } | undefined;

    const connected = result?.nativeConnected === true;
    if (connected !== _ctx.isConnected) {
      _ctx.isConnected = connected;
      updateConnectionStatus();
    }
    if (connected) {
      // Mark ever-connected so the onboarding screen is not shown on future
      // opens even if the desktop is temporarily closed.
      chrome.storage.local.set({ agi_ever_connected: true }).catch(() => {});
      hideLegacyOfflineOnboarding();
    } else {
      hideLegacyOfflineOnboarding();
    }
  } catch {
    // A restarting native worker never blocks Managed Cloud chat.
    hideLegacyOfflineOnboarding();
  }
}

/**
 * Open the background result a notification click pointed at.
 *
 * The pointer is consumed unconditionally so a stale id (its conversation was
 * deleted, or aged out of the 30-day store) cannot re-fire on every boot.
 */
async function checkPendingBackgroundResult(): Promise<void> {
  const owner = _ctx.managedCloudOwner;
  if (!owner) return;
  const conversationId = await takePendingResultConversation(owner);
  if (!conversationId) return;
  await openStoredConversation(conversationId);
}

function checkPendingChat(): void {
  chrome.storage.session.get('agi_pending_chat', (result) => {
    if (chrome.runtime.lastError) return;
    const pending = result['agi_pending_chat'] as
      | { type: string; text: string; url: string; timestamp: number }
      | undefined;
    if (!pending || Date.now() - pending.timestamp > 30_000) return;

    // Clear immediately so it doesn't re-fire
    chrome.storage.session.remove('agi_pending_chat').catch(() => {});

    let prompt = '';
    switch (pending.type) {
      case 'ask':
        prompt = pending.text;
        break;
      case 'explain':
        prompt = `Explain the following:\n\n"${pending.text}"`;
        break;
      case 'translate':
        prompt = `Translate the following to English (or if already English, to Spanish):\n\n"${pending.text}"`;
        break;
      case 'summarize':
        // Auto-capture page context then send
        capturePageContext()
          .then((ctx) => {
            if (ctx) _ctx.pendingPageContext = ctx;
            sendMessage(
              'Summarize this page concisely. Include key points, main arguments, and any important details.',
            );
          })
          .catch((err) => {
            console.error('[SidePanel] Failed to capture page context for summarize:', err);
          });
        return;
      default:
        return;
    }

    if (prompt) {
      sendMessage(prompt);
    }
  });
}

async function checkPendingContextHandoff(): Promise<void> {
  let stored: Record<string, unknown>;
  try {
    stored = await chrome.storage.session.get(CONTEXT_HANDOFF_STORAGE_KEY);
  } catch (error) {
    console.error('[SidePanel] Failed to read pending context handoff:', error);
    return;
  }

  const pending = stored[CONTEXT_HANDOFF_STORAGE_KEY];
  if (!isPendingContextHandoff(pending)) {
    if (pending !== undefined) {
      await chrome.storage.session.remove(CONTEXT_HANDOFF_STORAGE_KEY).catch(() => {});
    }
    return;
  }
  if (activeContextHandoffId === pending.id) return;

  contextHandoffPreview?.destroy();
  activeContextHandoffId = pending.id;
  contextHandoffPreview = mountContextHandoffPreview(document.body, pending, {
    onApprove: async (): Promise<ContextHandoffActionResult> => {
      try {
        const response = (await chrome.runtime.sendMessage({
          type: 'APPROVE_CONTEXT_HANDOFF',
          handoffId: pending.id,
        })) as ContextHandoffActionResult | undefined;
        return (
          response ?? {
            success: false,
            consumed: true,
            error: 'AGI Desktop did not return a handoff result. Select the context again.',
          }
        );
      } catch (error) {
        return {
          success: false,
          consumed: true,
          error: `${error instanceof Error ? error.message : 'The native handoff failed.'} Select the context again.`,
        };
      }
    },
    onCancel: async () => {
      const response = (await chrome.runtime.sendMessage({
        type: 'CANCEL_CONTEXT_HANDOFF',
        handoffId: pending.id,
      })) as ContextHandoffActionResult | undefined;
      if (response?.success !== true) {
        throw new Error(response?.error ?? 'Unable to cancel the context handoff.');
      }
    },
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes['agi_pending_chat']?.newValue) {
    checkPendingChat();
  }
  if (area === 'session' && changes[CONTEXT_HANDOFF_STORAGE_KEY]?.newValue) {
    void checkPendingContextHandoff();
  }
});
