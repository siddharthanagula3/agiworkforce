import {
  createMessageQueue,
  LANE_CAP,
  QueueFullError,
  type AgentActivityToolEntry,
  type ConnectorInputResponse,
} from '@agiworkforce/client-runtime';
import {
  createManagedCloudChatAttachmentsClient,
  MAX_CHAT_ATTACHMENT_BYTES,
  resolveChatAttachmentMimeType,
  TOOL_APPROVAL_GUIDANCE_MAX_LENGTH,
  type GeneratedFileWire,
  type ManagedCloudAgentRunReference,
  type ManagedCloudChatAttachment,
  type ManagedCloudChatAttachmentUploadPhase,
} from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import {
  dataTransferCarriesFiles,
  filesFromDataTransfer,
} from '@agiworkforce/utils/composer-paste';
import { agiCornerCssVars, agiMotionCssVars, cssVarsToString } from '@agiworkforce/design-tokens';
import { getExtensionTokensCssAuto } from './tokens';
import { followThemePreference } from './features/appearance/themePreference';
import { t, tPlural } from './i18n';
import { pageChipLabel } from './utils';
import {
  canUseBillingPlanCapability,
  classifyManagedQuotaErrorCode,
  formatCredits,
  formatUsageResetIn,
  getBillingPlanPricing,
  getModelMetadataById,
  INTERACTIVE_CARDS_MAX_PER_MESSAGE,
  EFFORT_LABEL,
  isEntitledSubscriptionStatus,
  MAX_CUSTOM_INSTRUCTIONS_CHARS,
  normalizeModelId,
  getProviderDisplayLabel,
  messageKindForAgentEvent,
  PREFERRED_LENGTHS,
  PROVIDERS_IN_ORDER,
  RESPONSE_STYLES,
  resolveModelEffort,
  USAGE_CRITICAL_REMAINING_PERCENT,
  USAGE_WARNING_REMAINING_PERCENT,
  type ClarifyState,
  type Effort,
  type InteractiveCard,
  type InteractiveCardResponsePayload,
  type ManagedUsageWarning,
  type ModelSpeed,
  type PreferredLength,
  type ResponseStyle,
  type RoutingTaskType,
} from '@agiworkforce/types';
import { getExtensionSendQueue } from './features/native-bridge/sendQueue';
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
  isCloudPersistenceEligible,
  listConversations,
  pendingCloudMessages,
  deleteConversation,
  persistConversationSeed,
  recordCloudSyncState,
  upsertConversation,
  updateConversationEntry,
  startNewConversation,
  BROWSER_STORE_KEY,
  type ConversationEntry,
  type ConversationEntryChanges,
} from './features/background/conversation-history';
import { pullCloudConversationFlags } from './features/cloud-bridge/conversationSync';
import { wirePopupMenu } from './features/side-panel/menu';
import { createChromeShareLink } from './features/cloud-bridge/shareClient';
import {
  assignConversationOwner,
  claimConversationOwner,
  claimSelectedConversationOwner,
  restoreConversationOwnerIfCurrent,
  resolveBrowserConversationScope,
} from './features/background/conversation-session';
import {
  normalizeApprovedSiteOrigin,
  removeApprovedSiteHostPermission,
  requestApprovedSiteHostPermission,
} from './features/options/site-allowlist';
import {
  BROWSER_CONTROL_CONSENT_STORAGE_KEY,
  grantBrowserControlConsent,
  hasBrowserControlConsent,
  removeBrowserControlHostPermission,
  requestBrowserControlHostPermission,
} from './features/computer-use/browserControlConsent';
import {
  backgroundConversationId,
  takePendingResultConversation,
  OPEN_BROWSER_CONVERSATION_MESSAGE,
} from './features/background/background-results';
import { el } from './features/side-panel/dom';
import {
  buildBubbleWithTools,
  fillAnswerBubble,
  resolveManagedArtifactUrl,
  type RegenerateModelOption,
} from './features/side-panel/bubbles';
import type { ConnectorInputBinding } from './features/side-panel/connectorInputForm';
import {
  clarifyAnswerMessage,
  clarifyAnswersFromResponse,
} from './features/side-panel/interactiveCards';
import type { AnswerFileAccess } from './features/side-panel/generatedFiles';
import {
  answerSourceLists,
  applyCanonicalAgentEvent,
  applyStreamFailure,
  isEmptyAssistantTurn,
  mergeMessageSources,
  streamFailureText,
  type StreamFailureDetail,
  hydrateStoredChatMessage,
  pageContextStillDescribes,
  resolveComposerPrompt,
  selectModelHistory,
  shouldRebuildMessageDom,
  trimChatMessages,
  type PageContextSource,
  type SidePanelChatMessage,
  type SidePanelMessageAttachment,
  type SidePanelPageReference,
} from './features/side-panel/chat-state';
import { buildMicrophoneNotice, setupVoiceInput } from './features/side-panel/voice';
import { replaceComposerRange, replaceComposerText } from './features/side-panel/composerText';
import {
  expandPromptShortcut,
  expandSlashCommand,
  matchSlashCommands,
  promptShortcutsFromSaved,
  shortcutCommand,
  shortcutCommandConflict,
  SHORTCUT_INPUT_PLACEHOLDER,
  SLASH_COMMANDS,
  type PromptShortcut,
  type SlashCommandMeta,
} from './features/side-panel/pageCommands';
import { SHORTCUTS_STORAGE_KEY } from './features/background/shortcuts';
import {
  dictationLanguageChoices,
  readDictationLanguage,
  resolveDictationLanguage,
  writeDictationLanguage,
} from './features/side-panel/dictation-language';
import { markOnboardingComplete, isOnboardingComplete } from './features/side-panel/onboarding';
import { DATA_HANDLING_DISCLOSURES } from './features/privacy/dataHandling';
import {
  cloudMirroringEnabledSnapshot,
  readCloudMirroringEnabled,
  watchCloudMirroringEnabled,
} from './features/privacy/cloudMirroring';
import {
  getChromeSurfaceAvailability,
  isRestrictedPageUrl,
} from './features/side-panel/surface-policy';
import { ManagedCloudOwnerRequestFence } from './features/side-panel/managed-owner-request-fence';
import {
  ALLOWED_BRIDGE_HOSTS,
  DEFAULT_AGI_BRIDGE_URL,
  validateBridgeUrl,
  sanitizePageText,
  SELECTED_EFFORT_STORAGE_KEY,
  SELECTED_MODEL_STORAGE_KEY,
} from './background/policy';
import {
  FilePen,
  Loader2,
  Folder,
  ArrowUp,
  Clock,
  Trash2,
  MessageSquare,
  Monitor,
  Terminal,
  Globe,
  Mic,
  Camera,
  FileImage,
  FileText,
  Zap,
  FileEdit,
  SquarePen,
  Square,
  Settings,
  Shield,
  X,
  Play,
  ChevronRight,
  Check,
  Plug,
  CircleHelp,
  Ellipsis,
  renderIcon,
} from './assets/icons';
import {
  buildComputerUsePanel,
  COMPUTER_USE_PANEL_CSS,
  describeCancellationReason,
  type ComputerUseApprovalDecision,
  type ComputerUsePanelAPI,
} from './features/side-panel/computerUsePanel';
import {
  buildCloudRunsPanel,
  CLOUD_RUNS_PANEL_CSS,
  type CloudRunsPanelAPI,
} from './features/side-panel/cloudRunsPanel';
import {
  buildBrowserToolsPanel,
  BROWSER_TOOLS_PANEL_CSS,
  type BrowserToolsPanelAPI,
} from './features/side-panel/browserToolsPanel';
import {
  buildProjectsDrawerSection,
  PROJECTS_DRAWER_CSS,
  type ActiveProjectSelection,
  type ProjectsDrawerAPI,
} from './features/side-panel/projectsDrawer';
import { listChromeProjects } from './features/cloud-bridge/projectsClient';
import {
  buildArtifactsDrawerSection,
  ARTIFACTS_DRAWER_CSS,
  type ArtifactsDrawerAPI,
} from './features/side-panel/artifactsDrawer';
import {
  buildCommandPalette,
  COMMAND_PALETTE_CSS,
  type PaletteCommand,
} from './features/side-panel/commandPalette';
import {
  AGIWORK_PLAN_REVIEW_CSS,
  pendingAgiWorkPlanSteps,
  type AgiWorkPlanReviewBinding,
} from './features/side-panel/agiWorkPlanReview';
import { buildHelpArticleLink, HELP_LINK_CSS } from './features/side-panel/helpLinks';
import {
  beginPairing,
  loadPairingState,
  storeBridgeSecret,
  submitPairingCode,
  unpair,
  type PairingState,
} from './features/native-bridge/pairing';
import {
  ACCOUNT_MEMORY_CACHE_KEY,
  fetchAccountMemoryConflicts,
  fetchActiveMemoryWorkspace,
  fetchMemoryExclusions,
  fetchMemoryPreferences,
  isAccountMemory,
  MEMORY_COMMAND_HINT,
  MEMORY_EXCLUSION_MAX_CHARS,
  MEMORY_EXCLUSION_MAX_TERMS,
  MEMORY_EXCLUSION_MIN_CHARS,
  normalizeMemoryExclusions,
  restoreAccountMemory,
  runAccountMemoryCommand,
  saveMemoryExclusions,
  saveMemoryPreferences,
  type AccountMemory,
  type AccountMemoryConflict,
  type MemoryPreferences,
  type MemoryCommandKind,
  type MemoryCommandRequest,
  type MemoryCommandResult,
} from './features/cloud-bridge/memoryClient';
import {
  fetchAccountPersonalization,
  saveAccountInstructions,
  saveAccountResponseStyle,
  type AccountPersonalization,
} from './features/cloud-bridge/personalizationClient';
import { mountInviteCodeModal } from './features/cloud-bridge/InviteCodeModal';
import { createExtensionCloudChatClient } from './features/cloud-bridge/conversationSyncClient';
import { managedModelImageLimit } from './features/cloud-bridge/managedModelLimits';
import {
  capabilityAllowed,
  fetchAccountSummary,
  saveAccountDisplayName,
  type CapabilityDocument,
} from './features/cloud-bridge/capabilityDocument';
import {
  CONTEXT_HANDOFF_CLI_DESTINATION,
  CONTEXT_HANDOFF_STORAGE_KEY,
  CONTEXT_HANDOFF_VSCODE_DESTINATION,
  contextHandoffCliCommand,
  isPendingContextHandoff,
  mountContextHandoffPreview,
  type ContextHandoffActionResult,
  type ContextHandoffDestinationId,
  type ContextHandoffPreviewController,
} from './features/context-handoff';
import {
  getManagedCloudAuthContext,
  getManagedModelAccess,
  AccountUnavailableError,
  clearAuthToken,
  signOutOfAccount,
  MANAGED_CHAT_MAX_ATTACHMENTS,
  MANAGED_CHAT_MAX_ATTACHMENT_BYTES,
  MANAGED_CHAT_MAX_ATTACHMENT_FILE_BYTES,
  FREE_TRIAL_GATEWAY,
  getManagedUsageHistory,
  type ManagedChatSourcesDelta,
  type ManagedCodeExecution,
  type ManagedMemoryCommandTurn,
  type ManagedModelAccess,
  type ManagedUsageHistory,
  type ManagedQuotaBlock,
  type ManagedQuotaRecovery,
  type ManagedQuotaWarningSignal,
} from './features/cloud-bridge/freeTrialClient';
import {
  blockingUsageWindow,
  describeUsageNotice,
  planQuotaRecovery,
  purchasedCreditsView,
  quotaBlockWindow,
  quotaWarningFromSignal,
  usageLimitNotice,
  usageWarning,
  usageWindowViews,
  type PurchasedCreditsView,
  type UsageWindowView,
} from './features/side-panel/usageWindows';
import { planComparisonViews } from './features/side-panel/planComparison';
import { createManagedChatPortName } from './features/cloud-bridge/managedChatPort';
import {
  getClerkAccountProfile,
  isClerkExtensionAuthConfigured,
  observeClerkAuth,
  openClerkSignIn,
} from './features/cloud-bridge/clerkAuth';
import {
  agiWorkUnlockPlanLabel,
  buildManagedModelPickerView,
  formatManagedTierLabel,
  getManagedCapabilityLabel,
  getManagedModelBadgeLabel,
  getManagedEffortControlState,
  getManagedOutboundEffort,
  getManagedModelPickerOptions,
  partitionManagedModelOptions,
  reconcileManagedModelSelection,
  type ManagedModelPickerOption,
} from './features/cloud-bridge/managedModelPicker';
import {
  isManagedCloudBroadcastOwnedBy,
  managedCloudOwnerKey,
  normalizeManagedCloudOwner,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from './features/cloud-bridge/managedCloudAuthority';
import { normalizeShortcutStartUrl } from './features/shortcuts/origin';
import { withTimeout } from './utils';
import { platformRequestHeaders } from './platformHeaders';
import { installSidePanelErrorReporting } from './features/observability/errorReporting';
import { flushProductEvents, trackProductEvent } from './features/observability/productAnalytics';

installSidePanelErrorReporting();

const extensionSendQueue = getExtensionSendQueue();

const SP_IN_PAGE_PANEL_ENABLED_KEY = 'in_page_panel_enabled';
const SP_SITE_ALLOWLIST_KEY = 'agi_site_allowlist';

let refreshOnboardingAccount: () => void = () => undefined;
let capabilityDocument: CapabilityDocument | null = null;
let accountDisplayName: string | null = null;
let applyCapabilityGates: () => void = () => undefined;

let refreshCloudAccountUI: (forceAuthRefresh?: boolean) => Promise<void> = async () => {
  /* no-op until buildUI() initialises the real implementation */
};

let refreshModelPickerUI: () => void = () => {
  /* no-op until buildUI() initialises the real implementation */
};
let refreshEffortUI: () => void = () => {
  /* no-op until buildUI() initialises the real implementation */
};

let openStoredConversation: (conversationId: string) => Promise<boolean> = async () => false;

const ACTIVE_PROJECT_KEY = 'agi_active_project';
const PROJECT_NAME_CACHE_KEY = 'agi_project_names';
const MAX_CACHED_PROJECT_NAMES = 200;
/**
 * Names, not authority: the binding that matters is the project id on the
 * conversation. This only lets a restored chat say which project it is in
 * without a round trip for a list the drawer has already read.
 */
const projectNameById = new Map<string, string>();

let refreshProjectChip: () => void = () => {
  /* no-op until buildUI() installs the real implementation */
};
let adoptChatProject: (projectId: string | undefined) => void = () => {
  /* no-op until buildUI() installs the real implementation */
};

function hydrateProjectNameCache(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [id, name] of Object.entries(value as Record<string, unknown>)) {
    if (typeof name !== 'string' || !name) continue;
    if (projectNameById.size >= MAX_CACHED_PROJECT_NAMES) break;
    projectNameById.set(id, name);
  }
}

function readStoredActiveProject(value: unknown): ActiveProjectSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = record['id'];
  const name = record['name'];
  return typeof id === 'string' && id && typeof name === 'string' && name ? { id, name } : null;
}
let historyRestoreInProgress = false;
let historyRestoreToken = 0;
let managedModelAccess: ManagedModelAccess | null = null;
let cloudAccountRefreshGeneration = 0;
const scheduledTasksRequestFence = new ManagedCloudOwnerRequestFence();
const scheduledTaskCreateRequestFence = new ManagedCloudOwnerRequestFence();
let activePersistenceEntry: ConversationEntry | undefined;
let activePersistenceReadGeneration = 0;

type PersistencePresentation = {
  state: 'cloud' | 'pending' | 'error' | 'local';
  label: string;
  detail: string;
  cloudIcon: boolean;
};

function conversationPersistencePresentation(
  entry: ConversationEntry | undefined,
): PersistencePresentation {
  if (!cloudMirroringEnabledSnapshot()) {
    return {
      state: 'local',
      label: 'Saved on this device',
      detail: 'Account mirroring is off in AGI settings, so chats stay in this browser.',
      cloudIcon: false,
    };
  }
  if (!entry) {
    return {
      state: 'local',
      label: 'New chat',
      detail: 'Managed Cloud chats start syncing to your AGI account after the first message.',
      cloudIcon: false,
    };
  }
  const sync = entry.cloudSync;
  if (!isCloudPersistenceEligible(entry) || sync?.blockedReason === 'non-cloud-runtime') {
    return {
      state: 'local',
      label: 'Saved on this device',
      detail: 'This chat includes a Local, BYOK, or unknown-provenance turn, so it stays here.',
      cloudIcon: false,
    };
  }
  if (sync?.blockedReason === 'auth') {
    return {
      state: 'local',
      label: 'Sign in to sync',
      detail: 'This chat is saved on this device until you sign in again.',
      cloudIcon: false,
    };
  }
  if (sync?.blockedReason === 'not-found') {
    return {
      state: 'local',
      label: 'Saved on this device',
      detail: 'The account copy was removed and this browser-local chat is no longer syncing.',
      cloudIcon: false,
    };
  }
  if (sync?.blockedReason === 'workspace') {
    return {
      state: 'local',
      label: 'Saved on this device',
      detail:
        'The original Cloud workspace could not be proven, so this chat is no longer syncing.',
      cloudIcon: false,
    };
  }
  if (sync?.state === 'error') {
    return {
      state: 'error',
      label: 'Sync needs attention',
      detail: 'The latest version is saved on this device and will retry automatically.',
      cloudIcon: false,
    };
  }
  if (sync?.state === 'pending' || pendingCloudMessages(entry).length > 0) {
    return {
      state: 'pending',
      label: 'Syncing to your account',
      detail: 'The browser-local chat stays authoritative while the account copy catches up.',
      cloudIcon: true,
    };
  }
  if (sync?.state === 'idle' && sync.conversationId) {
    return {
      state: 'cloud',
      label: 'Saved to your account',
      detail: 'Available on Web, Mobile Cloud, Tauri Desktop Cloud, and Electron Desktop Cloud.',
      cloudIcon: true,
    };
  }
  return {
    state: 'pending',
    label: 'Syncing to your account',
    detail: 'The browser-local chat stays authoritative while the account copy is created.',
    cloudIcon: true,
  };
}

function clearActivePersistenceState(): void {
  activePersistenceReadGeneration += 1;
  activePersistenceEntry = undefined;
}

async function refreshActivePersistenceState(): Promise<void> {
  const owner = _ctx.managedCloudOwner;
  const conversationId = _ctx.conversationId;
  const readGeneration = ++activePersistenceReadGeneration;
  if (!owner || _ctx.messages.length === 0) {
    activePersistenceEntry = undefined;
    return;
  }
  const entry = await getConversation(owner, conversationId).catch(() => undefined);
  if (
    readGeneration !== activePersistenceReadGeneration ||
    conversationId !== _ctx.conversationId ||
    !sameManagedCloudOwner(owner, _ctx.managedCloudOwner)
  ) {
    return;
  }
  activePersistenceEntry = entry;
}
let refreshTabGroupUI: () => void = () => {
  /* no-op until buildUI() registers the controls */
};

let resetScheduledTaskDraftForOwnerTransition: () => void = () => {
  /* no-op until buildUI() creates the Workflows form */
};
let openScheduledTaskEditor: (task: ScheduledTaskRow) => void = () => undefined;
let initialCloudAccountRefresh: Promise<void> = Promise.resolve();
type ManagedCloudChatState = 'loading' | 'ready' | 'signed_out' | 'unavailable';
type ManagedCloudGateAction =
  'none' | 'sign_in' | 'open_web' | 'upgrade' | 'billing' | 'usage' | 'retry' | 'recovery';
let managedCloudChatState: ManagedCloudChatState = 'loading';
let managedCloudGateMessage = t('spGateChecking');
let managedCloudGateAction: ManagedCloudGateAction = 'none';
let managedCloudGateActionLabel = '';
let managedCloudGateHref = '';

function agiWebUrl(path: string): string {
  const url = new URL(path, FREE_TRIAL_GATEWAY);
  url.searchParams.set('from', 'chrome-extension');
  return url.toString();
}

function quotaRecoveryLabel(recovery: ManagedQuotaRecovery): string {
  switch (recovery.action) {
    case 'top_up':
      return t('spQuotaRecoveryTopUp');
    case 'upgrade':
      return t('spQuotaUpgrade');
    case 'view_usage':
      return t('spQuotaManageUsage');
    case 'contact_support':
      return t('spQuotaRecoverySupport');
  }
}

function openQuotaRecovery(recovery: ManagedQuotaRecovery): void {
  chrome.tabs.create({ url: agiWebUrl(recovery.href) }).catch(() => {});
}

function setManagedCloudChatState(
  state: ManagedCloudChatState,
  options: {
    message?: string;
    action?: ManagedCloudGateAction;
    actionLabel?: string;
    href?: string;
  } = {},
): void {
  const becameReady = state === 'ready' && managedCloudChatState !== 'ready';
  managedCloudChatState = state;
  managedCloudGateMessage =
    options.message ??
    (state === 'signed_out'
      ? t('spGateSignedOut')
      : state === 'unavailable'
        ? t('spGateUnavailable')
        : managedCloudGateMessage);
  managedCloudGateAction = options.action ?? 'none';
  managedCloudGateActionLabel = options.actionLabel ?? '';
  managedCloudGateHref = options.href ?? '';
  if (state !== 'ready') {
    renderUsageBanner(null);
    renderModelNotice(null);
  }

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
    if (state === 'signed_out') input.placeholder = t('spComposerPlaceholderSignedOut');
    else if (state === 'unavailable') input.placeholder = t('spComposerPlaceholderNoAccess');
    else input.placeholder = t('spComposerPlaceholder');
  }
  updateSendButton();
  updateEmptyStateActions();
  if (becameReady) {
    void refreshRecentProjects();
    checkPendingChat();
  }
}

interface UsageBanner {
  text: string;
  severity: ManagedUsageWarning['severity'];
  recovery: ManagedQuotaRecovery;
}

let usageBanner: UsageBanner | null = null;
const quotaWarnedStreamIds = new Set<string>();
const MODEL_USAGE_ROW_LIMIT = 5;

function renderUsageBanner(next: UsageBanner | null): void {
  usageBanner = next;
  const banner = document.getElementById('sp-usage-warning');
  const text = document.getElementById('sp-usage-warning-text');
  const action = document.getElementById('sp-usage-warning-action');
  if (!banner || !text || !action) return;
  banner.classList.toggle('visible', next !== null);
  banner.dataset['severity'] = next?.severity ?? '';
  text.textContent = next?.text ?? '';
  action.textContent = next ? quotaRecoveryLabel(next.recovery) : '';
}

function renderModelNotice(text: string | null): void {
  const notice = document.getElementById('sp-model-notice');
  const noticeText = document.getElementById('sp-model-notice-text');
  if (!notice || !noticeText) return;
  notice.classList.toggle('visible', text !== null);
  noticeText.textContent = text ?? '';
}

function managedPlanTier(access: ManagedModelAccess): string {
  return access.accountPlanTier ?? access.subscriptionTier;
}

function applyStreamQuotaWarning(signal: ManagedQuotaWarningSignal): void {
  if (!managedModelAccess || managedCloudChatState !== 'ready') return;
  const warning = quotaWarningFromSignal(usageWindowViews(managedModelAccess.usage), signal);
  if (!warning) return;
  renderUsageBanner({
    text: describeUsageNotice(warning),
    severity: warning.severity,
    recovery: planQuotaRecovery(managedPlanTier(managedModelAccess)),
  });
}

function quotaResetLabel(quotaCode: string): string | null {
  if (!managedModelAccess) return null;
  const blocked = quotaBlockWindow(usageWindowViews(managedModelAccess.usage), quotaCode);
  return blocked ? formatUsageResetIn(blocked.resetAt) : null;
}

function buildPurchasedCreditsRow(purchased: PurchasedCreditsView): HTMLElement {
  const row = el('div', { class: 'sp-quota-window' });
  const head = el('div', { class: 'sp-quota-bar-row' });
  head.appendChild(el('span', {}, t('spQuotaPurchasedLabel')));
  head.appendChild(
    el(
      'span',
      { class: 'sp-quota-window-value' },
      purchased.balance ?? t('spQuotaPurchasedUnavailable'),
    ),
  );
  row.appendChild(head);
  row.appendChild(
    el(
      'div',
      { class: 'sp-quota-window-reset' },
      purchased.overageEnabled ? t('spQuotaPurchasedOn') : t('spQuotaPurchasedOff'),
    ),
  );
  return row;
}

function buildQuotaWindowRow(view: UsageWindowView): HTMLElement {
  const row = el('div', { class: 'sp-quota-window' });
  const head = el('div', { class: 'sp-quota-bar-row' });
  head.appendChild(el('span', {}, view.label));
  head.appendChild(el('span', { class: 'sp-quota-window-value' }, view.detail));
  row.appendChild(head);
  const usedPercent = Math.round(view.usedPercent);
  const remainingPercent = 100 - view.usedPercent;
  const bar = el('div', {
    class: 'sp-quota-bar-bg',
    role: 'progressbar',
    'aria-label': view.label,
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': String(usedPercent),
    'aria-valuetext': view.detail,
  });
  const fill = el('div', {
    class:
      view.exhausted || remainingPercent <= USAGE_CRITICAL_REMAINING_PERCENT
        ? 'sp-quota-bar-fill exhausted'
        : remainingPercent <= USAGE_WARNING_REMAINING_PERCENT
          ? 'sp-quota-bar-fill warning'
          : 'sp-quota-bar-fill',
  });
  fill.style.width = `${usedPercent}%`;
  bar.appendChild(fill);
  row.appendChild(bar);
  const resetLabel = formatUsageResetIn(view.resetAt);
  if (resetLabel) row.appendChild(el('div', { class: 'sp-quota-window-reset' }, resetLabel));
  return row;
}

type ChatMessage = SidePanelChatMessage;

interface ChatChunk {
  type: 'CHAT_CHUNK';
  owner: ManagedCloudOwner;
  clientInstanceId: string;
  id: string;
  text: string;
  done: boolean;
  error?: string;
  errorCode?: string;
  errorRetryAfterSeconds?: number;
  errorRequestId?: string;
  errorQuota?: ManagedQuotaBlock;
  quotaWarning?: ManagedQuotaWarningSignal;
  agentEvent?: AgentEventEnvelope;
  durableReplay?: true;
  cloudRun?: ManagedCloudAgentRunReference;
  generatedFiles?: GeneratedFileWire[];
  interactiveCard?: InteractiveCard;
  sources?: ManagedChatSourcesDelta;
  codeExecution?: ManagedCodeExecution;
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
  pendingPageContextSource: PageContextSource | null;
  isStreaming: boolean;
  currentStreamId: string | null;
  streamTimeoutHandle: ReturnType<typeof setTimeout> | null;
  lastRenderedCount: number;
  needsMessageRebuild: boolean;
  isConnected: boolean;
  thinkingEnabled: boolean;
  quickMode: boolean;
  workMode: 'chat' | 'agiwork';
  conversationId: string;
  conversationScope: string | null;
  conversationGeneration: number;
  managedCloudOwner: ManagedCloudOwner | null;
  selectedModel: string;
  currentModelKey?: string;
  previousTaskType?: RoutingTaskType;
  reasoningEffort?: Effort;
  activeProject: ActiveProjectSelection | null;
  pendingProjectBinding?: string | null;
  temporaryChat: boolean;
  temporaryConversationId: string | null;
}

function createSharedSidePanelContext(): SharedSidePanelContext {
  return {
    messages: [],
    pendingPageContext: null,
    pendingPageContextSource: null,
    isStreaming: false,
    currentStreamId: null,
    streamTimeoutHandle: null,
    lastRenderedCount: 0,
    needsMessageRebuild: false,
    isConnected: false,
    thinkingEnabled: false,
    quickMode: false,
    workMode: 'chat',
    conversationId: createBrowserConversationId(),
    conversationScope: null,
    conversationGeneration: 0,
    managedCloudOwner: null,
    selectedModel: 'auto',
    activeProject: null,
    temporaryChat: false,
    temporaryConversationId: null,
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

function previousAnswerModel(streamId: string): string | undefined {
  const index = _ctx.messages.findIndex((message) => message.id === streamId);
  const earlier = index < 0 ? _ctx.messages : _ctx.messages.slice(0, index);
  return [...earlier].reverse().find((message) => message.role === 'assistant' && message.model)
    ?.model;
}

function captureResolvedRoute(streamId: string, routing: ChatChunk['routing']): boolean {
  if (!routing) return false;
  const metadata = getModelMetadataById(routing.modelKey);
  if (!metadata) return false;
  const chosenByAuto = routing.reason !== 'explicit';
  const movedFrom = chosenByAuto ? previousAnswerModel(streamId) : undefined;
  const route: ResolvedRoute = {
    model: metadata.id,
    provider: metadata.provider,
    ...(chosenByAuto ? { autoRouteReason: routing.reason } : {}),
    ...(movedFrom && movedFrom !== metadata.id ? { movedFromModel: movedFrom } : {}),
  };
  resolvedRouteByStreamId.set(streamId, route);
  const assistant = _ctx.messages.find((message) => message.id === streamId);
  if (!assistant) return false;
  stampResolvedRoute(streamId, assistant);
  return true;
}

function stampResolvedRoute(streamId: string, assistant: ChatMessage): void {
  const route = resolvedRouteByStreamId.get(streamId);
  if (!route) return;
  assistant.model = route.model;
  assistant.provider = route.provider;
  if (route.autoRouteReason) assistant.autoRouteReason = route.autoRouteReason;
  else delete assistant.autoRouteReason;
  if (route.movedFromModel) assistant.movedFromModel = route.movedFromModel;
  else delete assistant.movedFromModel;
}

function managedOutboundEffortPayload(usePersistedSelection = false): { effort?: Effort } {
  if (_ctx.quickMode && !usePersistedSelection) return {};
  const routingSelection = _ctx.selectedModel;
  const effort = getManagedOutboundEffort(
    routingSelection,
    _ctx.currentModelKey,
    _ctx.reasoningEffort,
    managedModelAccess?.subscriptionTier,
  );
  return effort === undefined ? {} : { effort };
}

function managedOutboundRoutingPayload(quickMode = _ctx.quickMode): {
  effort?: Effort;
  currentModelKey?: string;
  previousTaskType?: RoutingTaskType;
} {
  if (quickMode) return {};
  return {
    ...managedOutboundEffortPayload(true),
    ...(_ctx.currentModelKey ? { currentModelKey: _ctx.currentModelKey } : {}),
    ...(_ctx.previousTaskType ? { previousTaskType: _ctx.previousTaskType } : {}),
  };
}

const OUTBOUND_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Server-authority identity for a managed turn: a client-generated
 * `assistantMessageId` (also stamped onto the assistant row so the cloud sync
 * reuses it) and, when the conversation is already bound server-side, its cloud
 * `conversationId`. Sending both lets the server persist the turn under the
 * same id the extension would sync, so they converge on ONE row. When the
 * conversation is not yet bound the conversation id is omitted and the
 * extension's own sync stays authoritative.
 */
function managedTurnPersistencePayload(streamId: string): {
  assistantMessageId?: string;
  conversationId?: string;
} {
  if (_ctx.temporaryChat) {
    const temporaryId = _ctx.temporaryConversationId;
    return temporaryId && OUTBOUND_UUID_PATTERN.test(temporaryId)
      ? { conversationId: temporaryId }
      : {};
  }
  const assistantMessageId = assistantCloudIdByStreamId.get(streamId);
  const cloudConversationId = activePersistenceEntry?.cloudSync?.conversationId;
  return {
    ...(assistantMessageId && OUTBOUND_UUID_PATTERN.test(assistantMessageId)
      ? { assistantMessageId }
      : {}),
    ...(cloudConversationId && OUTBOUND_UUID_PATTERN.test(cloudConversationId)
      ? { conversationId: cloudConversationId }
      : {}),
  };
}

// Provider display order in the grouped picker.
const UNKNOWN_PROVIDER_KEY = 'unknown-provider';

function modelGroupHeading(providerKey: string): string {
  if (providerKey === UNKNOWN_PROVIDER_KEY) return t('spModelsOtherProvider');
  return getProviderDisplayLabel(providerKey);
}

function modelSpeedLabel(speed: ModelSpeed): string {
  switch (speed) {
    case 'very-fast':
      return t('spModelSpeedVeryFast');
    case 'fast':
      return t('spModelSpeedFast');
    case 'medium':
      return t('spModelSpeedMedium');
    case 'slow':
      return t('spModelSpeedSlow');
  }
}

const CONNECTORS_URL = 'https://agiworkforce.com/connectors?from=chrome-extension';
const HELP_URL = 'https://agiworkforce.com/help?from=chrome-extension';

const RECENTS_SEARCH_THRESHOLD = 10;

const RELATIVE_TIME_FORMAT = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const RELATIVE_TIME_STEPS: { ms: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { ms: 86_400_000, unit: 'day' },
  { ms: 3_600_000, unit: 'hour' },
  { ms: 60_000, unit: 'minute' },
];

function getModelBadgeLabel(modelId: string): string {
  return getManagedModelBadgeLabel(modelId);
}
let isRecording = false;
let recordingActionCount = 0;
let recordingStartUrl: string | null = null;

interface ComposerImage {
  dataUrl: string;
  name: string;
}

interface ComposerFile {
  assetId: string;
  mimeType: string;
  name: string;
}

interface TurnPayload {
  prompt: string;
  pageText: string | null;
  capturePage: boolean;
  images: ComposerImage[];
  files: ComposerFile[];
  agiWorkPlan?: string[];
}

const pendingAttachments: ComposerImage[] = [];
const turnPayloadByMessageId = new Map<string, TurnPayload>();
const streamStartedAtById = new Map<string, number>();
interface ComposerDocument {
  key: string;
  file: File;
  mimeType: string;
  phase: ManagedCloudChatAttachmentUploadPhase;
  error?: string;
  attachment?: ManagedCloudChatAttachment;
  controller: AbortController;
}
const pendingDocuments: ComposerDocument[] = [];
let composerAttachmentIntakeCount = 0;
const cloudRunsByStreamId = new Map<string, ManagedCloudAgentRunReference>();
interface ResolvedRoute {
  model: string;
  provider: string;
  autoRouteReason?: string;
  movedFromModel?: string;
}

const resolvedRouteByStreamId = new Map<string, ResolvedRoute>();
const quickModeByStreamId = new Map<string, boolean>();
const ownerByStreamId = new Map<string, ManagedCloudOwner>();
const assistantCloudIdByStreamId = new Map<string, string>();

/**
 * A save on every text delta would be a storage write per token. Throttled
 * to once per interval instead; the placeholder pushed at stream start and
 * the unconditional save at stream end are what keep a reload from ever
 * landing on nothing, this only bounds how stale a mid-stream save can be.
 */
const STREAM_TEXT_PERSIST_INTERVAL_MS = 1_500;
let lastStreamPersistAtMs = 0;

let currentPageHostname = '';
let activePageSource: PageContextSource | null = null;

type SidePanelTab = 'chat' | 'workflows' | 'computer-use' | 'cloud-runs' | 'page';

const MAX_STORED_MESSAGES = 50;
const MAX_STORED_GENERATED_FILES_PER_MESSAGE = 20;

function pruneTurnPayloads(): void {
  const live = new Set(_ctx.messages.map((message) => message.id));
  for (const messageId of turnPayloadByMessageId.keys()) {
    if (!live.has(messageId)) turnPayloadByMessageId.delete(messageId);
  }
}

function trimLiveMessages(): void {
  if (trimChatMessages(_ctx.messages, MAX_STORED_MESSAGES) > 0) {
    _ctx.lastRenderedCount = 0;
    _ctx.needsMessageRebuild = true;
    pruneTurnPayloads();
  }
}

function serializeMessagesForHistory() {
  return _ctx.messages.slice(-MAX_STORED_MESSAGES).map((message) => ({
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    ...(message.runtime ? { runtime: message.runtime } : {}),
    ...(message.error ? { error: true } : {}),
    ...(message.role === 'assistant' && message.streaming ? { streaming: true } : {}),
    ...(message.cloudMessageId ? { cloudMessageId: message.cloudMessageId } : {}),
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
    ...(message.role === 'assistant' && message.managedQuickMode ? { managedQuickMode: true } : {}),
    ...(message.role === 'assistant' && message.agiWorkPlanDeclined
      ? { agiWorkPlanDeclined: true }
      : {}),
    ...(message.role === 'assistant' && message.model ? { model: message.model } : {}),
    ...(message.role === 'assistant' && message.provider ? { provider: message.provider } : {}),
    ...(message.role === 'assistant' && message.autoRouteReason
      ? { autoRouteReason: message.autoRouteReason }
      : {}),
    ...(message.role === 'assistant' && message.movedFromModel
      ? { movedFromModel: message.movedFromModel }
      : {}),
    ...(message.role === 'assistant' && message.generatedFiles
      ? { generatedFiles: message.generatedFiles }
      : {}),
    ...(message.role === 'assistant' && message.interactiveCards
      ? { interactiveCards: message.interactiveCards }
      : {}),
    ...(message.role === 'assistant' && message.codeExecution
      ? { codeExecution: message.codeExecution }
      : {}),
    ...(message.role === 'assistant' && message.sources ? { sources: message.sources } : {}),
    ...(message.role === 'assistant' && message.citations ? { citations: message.citations } : {}),
    ...(message.role === 'assistant' && message.durationMs !== undefined
      ? { durationMs: message.durationMs }
      : {}),
    ...(message.role === 'user' && message.attachments ? { attachments: message.attachments } : {}),
    ...(message.role === 'user' && message.pages ? { pages: message.pages } : {}),
  }));
}

function persistMessages(): Promise<void> {
  const owner = _ctx.managedCloudOwner;
  if (!owner || _ctx.temporaryChat) return Promise.resolve();
  const conversationId = _ctx.conversationId;
  persistCurrentConversationOwner();
  const projectBinding = _ctx.pendingProjectBinding;
  return upsertConversation(
    owner,
    conversationId,
    serializeMessagesForHistory(),
    {
      selectedModel: _ctx.selectedModel,
      currentModelKey: _ctx.currentModelKey,
      previousTaskType: _ctx.previousTaskType,
      effort: _ctx.reasoningEffort,
    },
    projectBinding,
  ).then((entry) => {
    if (entry && _ctx.pendingProjectBinding === projectBinding) {
      delete _ctx.pendingProjectBinding;
    }
    if (
      entry &&
      conversationId === _ctx.conversationId &&
      sameManagedCloudOwner(owner, _ctx.managedCloudOwner)
    ) {
      activePersistenceEntry = entry;
    }
  });
}

function saveMessages(): void {
  if (_ctx.temporaryChat) return;
  void persistMessages()
    .then(() => {
      requestCloudConversationSync();
    })
    .catch((err) => {
      console.warn('[SidePanel] Failed to persist messages:', err);
    });
}

function requestCloudConversationSync(conversationId = _ctx.conversationId): void {
  const owner = _ctx.managedCloudOwner;
  if (!owner) return;
  try {
    chrome.runtime.sendMessage(
      {
        type: 'SYNC_CONVERSATION',
        owner,
        conversationId,
        streaming: conversationId === _ctx.conversationId && _ctx.isStreaming,
      },
      () => {
        void chrome.runtime.lastError;
      },
    );
  } catch {
    // The worker is unavailable (restarting). The sweep alarm will pick it up.
  }
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
  activePersistenceEntry = active;
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

let newChatModelSelection = 'auto';
let newChatEffortSelection: Effort | undefined;

function effortForNewChat(): Effort | undefined {
  const model = _ctx.selectedModel;
  if (!newChatEffortSelection || _ctx.quickMode || model === 'auto' || model.startsWith('auto-')) {
    return undefined;
  }
  return resolveModelEffort(model, newChatEffortSelection);
}

function clearStoredMessages(): void {
  historyRestoreToken += 1;
  _ctx.conversationGeneration += 1;
  _ctx.conversationId = createBrowserConversationId();
  leaveTemporaryChat();
  _ctx.pendingProjectBinding = _ctx.activeProject?.id ?? null;
  clearActivePersistenceState();
  persistCurrentConversationOwner();
  _ctx.selectedModel = newChatModelSelection;
  _ctx.workMode = 'chat';
  _ctx.currentModelKey = undefined;
  _ctx.previousTaskType = undefined;
  _ctx.reasoningEffort = effortForNewChat();
  refreshModelPickerUI();
  refreshEffortUI();
  const owner = _ctx.managedCloudOwner;
  if (!owner) return;
  startNewConversation(owner).catch((err) => {
    console.warn('[SidePanel] Failed to clear stored messages:', err);
  });
}

function clearPendingPageContext(): void {
  _ctx.pendingPageContext = null;
  _ctx.pendingPageContextSource = null;
}

function resetConversationView(): void {
  returnFollowUpsToComposer();
  _ctx.messages.length = 0;
  turnPayloadByMessageId.clear();
  void refreshRecentProjects();
  _ctx.lastRenderedCount = 0;
  _ctx.needsMessageRebuild = true;
  clearPendingPageContext();
  clearStoredMessages();
  updateContextButton();
  updateSendButton();
  renderMessages();
}

async function transitionManagedCloudOwner(nextOwner: ManagedCloudOwner | null): Promise<boolean> {
  const previousOwner = _ctx.managedCloudOwner;
  if (
    (previousOwner === null && nextOwner === null) ||
    sameManagedCloudOwner(previousOwner, nextOwner)
  ) {
    return false;
  }

  historyRestoreToken += 1;
  clearActivePersistenceState();
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
  followUpQueue.clear();
  _ctx.workMode = 'chat';
  _ctx.messages.length = 0;
  turnPayloadByMessageId.clear();
  streamStartedAtById.clear();
  _ctx.lastRenderedCount = 0;
  _ctx.needsMessageRebuild = true;
  _ctx.isStreaming = false;
  _ctx.currentStreamId = null;
  clearPendingPageContext();
  discardComposerDocuments();
  _ctx.conversationId = createBrowserConversationId();
  _ctx.activeProject = null;
  delete _ctx.pendingProjectBinding;
  refreshProjectChip();
  recentProjects = [];
  recentProjectsGeneration += 1;
  renderRecentProjects();
  if (previousOwner) {
    _ctx.selectedModel = 'auto';
    newChatModelSelection = 'auto';
    chrome.storage.local.remove(SELECTED_MODEL_STORAGE_KEY).catch(() => {});
    newChatEffortSelection = undefined;
    chrome.storage.local.remove(SELECTED_EFFORT_STORAGE_KEY).catch(() => {});
  }
  _ctx.currentModelKey = undefined;
  _ctx.previousTaskType = undefined;
  _ctx.reasoningEffort = undefined;
  cloudRunsByStreamId.clear();
  resolvedRouteByStreamId.clear();
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
  const cssText = `
    /* ── AGI design tokens (dark) ── */
    ${getExtensionTokensCssAuto()}

    :root {
      ${cssVarsToString(agiCornerCssVars)}
      ${cssVarsToString(agiMotionCssVars)}
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    button:not(:disabled):active,
    #sp-auth-save-btn:not(:disabled):active,
    #sp-cloud-gate-action:not(:disabled):active,
    #sp-drawer-back:not(:disabled):active,
    #sp-drawer-close:not(:disabled):active,
    #sp-mic-btn:not(:disabled):active,
    #sp-model-badge:not(:disabled):active,
    #sp-model-selector-btn:not(:disabled):active,
    #sp-onboarding-skip:not(:disabled):active,
    #sp-project-chip:not(:disabled):active,
    #sp-project-chip-clear:not(:disabled):active,
    #sp-recents-close:not(:disabled):active,
    #sp-send-btn:not(:disabled):active,
    [role="button"]:not([aria-disabled="true"]):active,
    [role="menuitem"]:not([aria-disabled="true"]):active,
    [role="option"]:not([aria-disabled="true"]):active {
      background-image: linear-gradient(var(--pressed), var(--pressed));
    }

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
      font-size: var(--type-body-size);
      line-height: var(--type-body-height);
    }

    #sp-tab-group-notice {
      position: fixed;
      top: 52px;
      right: 10px;
      z-index: var(--z-notice);
      max-width: min(300px, calc(100vw - 20px));
      padding: 8px 10px;
      border: 1px solid var(--agi-ext-success-border);
      border-radius: var(--corner-control);
      background: var(--agi-ext-success-bg);
      color: var(--agi-ext-success-text);
      box-shadow: var(--agi-ext-elevation-3);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    #sp-tab-group-notice[data-kind='error'] {
      border-color: var(--agi-ext-danger-border);
      background: var(--agi-ext-danger-bg);
      color: var(--agi-ext-danger-text);
    }
    #sp-tab-group-notice[hidden] { display: none; }

    /* ── Explicit Chrome → Desktop context handoff ── */
    .sp-context-handoff-overlay {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal-raised);
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
      border-radius: var(--corner-surface);
      background: var(--agi-ext-surface);
      box-shadow: var(--agi-ext-elevation-4);
    }
    .sp-context-handoff-dialog h2 { font-size: var(--type-h3-size); line-height: var(--type-h3-height); color: var(--agi-ext-text); }
    .sp-context-handoff-dialog p { line-height: var(--type-body-small-height); color: var(--agi-ext-text-muted); }
    .sp-context-handoff-destination { color: var(--agi-ext-text) !important; font-weight: 600; }
    .sp-context-handoff-preview {
      max-height: 220px;
      overflow: auto;
      padding: 10px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-field);
      background: var(--agi-ext-bg);
      color: var(--agi-ext-text);
      font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      user-select: text;
    }
    .sp-context-handoff-source { font-size: var(--type-caption-size); line-height: var(--type-caption-height); overflow-wrap: anywhere; }
    .sp-context-handoff-redaction { color: var(--agi-ext-accent-text) !important; font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-context-handoff-status { min-height: 18px; font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-context-handoff-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .sp-context-handoff-destinations { flex-wrap: wrap; justify-content: flex-start; }
    .sp-context-handoff-secondary {
      min-height: 34px;
      padding: 7px 11px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      cursor: pointer;
      font: inherit;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      color: var(--agi-ext-text);
      background: var(--agi-ext-surface);
    }
    .sp-context-handoff-secondary[aria-disabled='true'] { cursor: not-allowed; opacity: 0.55; }
    .sp-context-handoff-secondary:focus-visible {
      outline: 2px solid var(--agi-ext-focus);
      outline-offset: 2px;
    }
    .sp-context-handoff-actions button {
      min-height: var(--control-lg);
      padding: 7px 11px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
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
      color: var(--agi-ext-on-accent) !important;
      font-weight: 600;
    }

    /* ── Project chip ── */
    #sp-project-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      background: var(--agi-ext-surface);
      border-bottom: 1px solid var(--agi-ext-border);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      flex-shrink: 0;
    }
    #sp-project-chip[hidden] { display: none; }
    #sp-project-chip-label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #sp-project-chip-clear {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      line-height: 1;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      background: none;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      cursor: pointer;
    }
    #sp-project-chip-clear:hover {
      color: var(--agi-ext-accent-text);
      border-color: var(--agi-ext-accent);
    }
    #sp-project-chip-clear:focus-visible {
      outline: 2px solid var(--agi-ext-focus);
      outline-offset: 2px;
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
    #sp-model-badge {
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      color: var(--agi-ext-accent-text);
      background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent);
      border-radius: var(--corner-compact);
      padding: 1px 6px;
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
      border-radius: var(--corner-control);
      width: var(--control-sm);
      height: var(--control-sm);
      padding: 0;
      font-size: var(--type-body-size);
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: color var(--duration-quick), background var(--duration-quick);
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
    #sp-messages::-webkit-scrollbar-thumb { background: var(--agi-ext-border); border-radius: var(--corner-compact); }

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
    .sp-empty-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: min(100%, 360px);
      margin-top: 6px;
      text-align: left;
    }
    .sp-empty-actions[hidden] { display: none; }
    .sp-empty-actions-title {
      margin: 8px 0 0;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 500;
    }
    .sp-empty-actions-list { display: flex; flex-direction: column; gap: 6px; }
    .sp-empty-action {
      display: flex;
      width: 100%;
      min-height: 40px;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-menu);
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text);
      font: inherit;
      font-size: var(--type-label-size);
      line-height: var(--type-label-height);
      text-align: left;
      cursor: pointer;
    }
    .sp-empty-action:hover { background: var(--agi-ext-hover); }
    .sp-empty-action:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-empty-action > .agi-icon { color: var(--agi-ext-text-muted); }
    .sp-empty-action[aria-pressed='true'] { border-color: var(--agi-ext-focus); }
    .sp-empty-action-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @media (pointer: coarse) {
      .sp-empty-action { min-height: 44px; }
    }
    #sp-empty-icon {
      display: none;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
      opacity: 0.7;
    }
    /* ── Restricted-page notice; chat remains available ── */
    #sp-blocked {
      display: none;
      flex: none;
      align-items: flex-start;
      gap: 10px;
      order: -1;
      padding: 10px 12px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-menu);
      background: var(--agi-ext-surface);
    }
    #sp-blocked.visible { display: flex; }
    .sp-blocked-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    #sp-blocked-desc { font-size: var(--type-caption-size); color: var(--agi-ext-text-muted); line-height: var(--type-caption-height); }

    .sp-visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
      border: 0;
    }
    :where(#sp-drawer-title, #sp-recents-title, .sp-drawer-section-title, .sp-bt-title, .sp-runs-detail-title) {
      margin: 0;
    }

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
      border-radius: var(--corner-surface);
      line-height: var(--type-body-height);
      font-size: var(--type-body-size);
      word-break: break-word;
      white-space: pre-wrap;
    }
    .sp-bubble-user {
      background: color-mix(in srgb, var(--agi-ext-accent) 18%, transparent);
      color: var(--agi-ext-text);
      border-bottom-right-radius: var(--corner-compact);
    }
    .sp-bubble-assistant {
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text);
      border: 1px solid var(--agi-ext-border);
      border-bottom-left-radius: var(--corner-compact);
    }
    .sp-bubble-error {
      background: var(--agi-ext-danger-bg);
      border-color: var(--agi-ext-danger-border);
      color: var(--agi-ext-danger-text);
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
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      color: var(--agi-ext-danger-text);
      overflow-wrap: anywhere;
    }
    .sp-bubble-retry-btn {
      flex-shrink: 0;
      padding: 3px 10px;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 600;
      color: var(--agi-ext-text);
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: var(--corner-pill);
      cursor: pointer;
    }
    .sp-bubble-retry-btn:hover:not(:disabled) { background: var(--agi-ext-hover); }
    .sp-bubble-retry-btn:disabled { opacity: 0.5; cursor: default; }
    /* Interrupted footer: a reply cut off by a reload or a closed tab, not a
       failure, so it takes the neutral text tone, not the danger one. */
    .sp-bubble-interrupted-footer {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid var(--agi-ext-border);
    }
    .sp-bubble-interrupted-text {
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      color: var(--agi-ext-text-muted);
      overflow-wrap: anywhere;
    }
    /* ── Bubble action row (timestamp + copy) ── */
    .sp-bubble-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      min-height: 16px;
    }
    .sp-msg-user .sp-bubble-actions { justify-content: flex-end; }
    .sp-timestamp {
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      color: var(--agi-ext-text-muted);
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
      border-radius: var(--corner-compact);
      opacity: 0;
      transition: opacity var(--duration-quick), color var(--duration-quick), background var(--duration-quick);
    }
    .sp-msg:hover .sp-copy-btn { opacity: 1; }
    /* Keyboard users tab to an opacity:0 control and cannot see where focus is;
       touch devices never hover at all, so Copy was unreachable there. */
    .sp-copy-btn:focus-visible { opacity: 1; }
    @media (hover: none) {
      .sp-copy-btn { opacity: 1; }
    }
    .sp-copy-btn:hover { color: var(--agi-ext-text); background: var(--agi-ext-hover); }
    .sp-copy-btn.copied { color: var(--agi-ext-success-text); opacity: 1; }
    .sp-answer-meta {
      padding: 0 3px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-answer-route {
      margin: 2px 0 0;
      padding: 0 3px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      overflow-wrap: anywhere;
    }
    .sp-regenerate { position: relative; display: inline-flex; }
    .sp-regenerate__menu {
      position: absolute;
      bottom: calc(100% + 4px);
      left: 0;
      z-index: var(--z-dropdown);
      min-width: 210px;
      max-height: 280px;
      overflow-y: auto;
      padding: 4px;
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: var(--corner-menu);
      background: var(--agi-ext-surface);
      box-shadow: var(--agi-ext-elevation-2);
    }
    .sp-regenerate__menu[hidden] { display: none; }
    .sp-regenerate__item {
      display: flex;
      width: 100%;
      min-height: var(--control-lg);
      align-items: center;
      padding: 4px 10px;
      border: 0;
      border-radius: var(--corner-control);
      background: transparent;
      color: var(--agi-ext-text);
      font: inherit;
      font-size: var(--type-label-size);
      line-height: var(--type-label-height);
      text-align: left;
      cursor: pointer;
    }
    .sp-regenerate__item:hover { background: var(--agi-ext-hover); }
    .sp-regenerate__item:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-regenerate__heading {
      padding: 6px 10px 2px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    #sp-messages.sp-messages--busy .sp-regenerate,
    #sp-messages.sp-messages--busy .sp-resend-btn { display: none; }
    .sp-msg-context {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 6px;
      max-width: 100%;
    }
    .sp-msg-context__item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: 220px;
      min-height: 32px;
      padding: 4px 10px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      text-decoration: none;
    }
    .sp-msg-context__item > .agi-icon { color: var(--agi-ext-text-muted); }
    .sp-msg-context__item--thumb { padding: 0; overflow: hidden; }
    .sp-msg-context__thumb { display: block; width: 64px; height: 64px; object-fit: cover; }
    .sp-msg-context__open,
    .sp-answer-image__open { display: block; max-width: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; }
    .sp-media-viewer {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 52px 16px 16px;
      background: var(--agi-ext-scrim);
    }
    .sp-media-viewer__image {
      display: block;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: var(--corner-control);
      box-shadow: var(--agi-ext-elevation-4);
    }
    .sp-media-viewer__close {
      position: absolute;
      top: 10px;
      right: 10px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--control-lg);
      height: var(--control-lg);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-pill);
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text);
      cursor: pointer;
    }
    .sp-media-viewer__close:hover { background: var(--agi-ext-hover); }
    @media (pointer: coarse) {
      .sp-media-viewer__close { width: 44px; height: 44px; }
    }
    .sp-msg-context__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    a.sp-msg-context__page:hover { background: var(--agi-ext-hover); }
    a.sp-msg-context__page:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-answer-files { display: flex; flex-direction: column; gap: 8px; width: min(100%, 420px); }
    .sp-answer-file {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 52px;
      padding: 8px 8px 8px 12px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-panel);
      background: var(--agi-ext-surface);
    }
    .sp-answer-file__icon { display: inline-flex; flex-shrink: 0; color: var(--agi-ext-text-muted); }
    .sp-answer-file__copy { display: flex; flex: 1; flex-direction: column; gap: 1px; min-width: 0; }
    .sp-answer-file__name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--agi-ext-text);
      font-size: var(--type-label-size);
      line-height: var(--type-label-height);
      font-weight: 550;
    }
    .sp-answer-file__meta,
    .sp-answer-file__status {
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-answer-file__status:empty { display: none; }
    .sp-answer-file__actions { display: inline-flex; flex-shrink: 0; gap: 2px; }
    .sp-answer-file__action {
      display: inline-flex;
      width: var(--control-md);
      height: var(--control-md);
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: var(--corner-control);
      background: transparent;
      color: var(--agi-ext-text-muted);
      cursor: pointer;
    }
    .sp-answer-file__action:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-answer-file__action:disabled { opacity: 0.5; cursor: default; }
    .sp-answer-file__action:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-answer-image { display: flex; flex-direction: column; gap: 6px; margin: 0; }
    .sp-answer-image__frame {
      display: flex;
      min-height: 120px;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-panel);
      background: var(--agi-ext-surface);
    }
    .sp-answer-image__frame img { display: block; max-width: 100%; height: auto; }
    .sp-answer-image__status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 12px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-answer-image__frame[aria-busy='true'] .sp-answer-image__spinner svg { animation: sp-spin var(--duration-spin) linear infinite; }
    .sp-answer-image__caption { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .sp-answer-image__caption .sp-answer-file__name { flex: 1; }
    .sp-citation { position: relative; display: inline; }
    .sp-bubble-assistant a.sp-citation__chip,
    .sp-citation__chip {
      display: inline-flex;
      max-width: 160px;
      align-items: center;
      margin: 0 2px;
      padding: 0 7px;
      overflow: hidden;
      border-radius: var(--corner-pill);
      background: var(--agi-ext-overlay);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 500;
      text-decoration: none;
      text-overflow: ellipsis;
      white-space: nowrap;
      vertical-align: baseline;
    }
    .sp-bubble-assistant a.sp-citation__chip:hover,
    .sp-bubble-assistant a.sp-citation__chip:focus-visible { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-citation__card {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      z-index: var(--z-popover);
      display: none;
      width: min(300px, calc(100vw - 32px));
      flex-direction: column;
      gap: 10px;
      padding: 10px;
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: var(--corner-menu);
      background: var(--agi-ext-surface);
      box-shadow: var(--agi-ext-elevation-2);
      white-space: normal;
    }
    .sp-citation:hover .sp-citation__card,
    .sp-citation:focus-within .sp-citation__card,
    .sp-citation.open .sp-citation__card { display: flex; }
    .sp-bubble-assistant a.sp-citation__source,
    .sp-sources__link {
      display: flex;
      flex-direction: column;
      gap: 2px;
      color: var(--agi-ext-text);
      text-decoration: none;
    }
    .sp-citation__source-site,
    .sp-sources__link-site {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-citation__source-title,
    .sp-sources__link-title {
      color: var(--agi-ext-text);
      font-size: var(--type-label-size);
      line-height: var(--type-label-height);
      font-weight: 550;
    }
    .sp-citation__source:hover .sp-citation__source-title,
    .sp-sources__link:hover .sp-sources__link-title { text-decoration: underline; }
    .sp-citation__source:focus-visible,
    .sp-sources__link:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-citation__source-snippet,
    .sp-sources__link-snippet {
      display: -webkit-box;
      overflow: hidden;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }
    .sp-citation__source-date,
    .sp-sources__link-date {
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-sources { width: min(100%, 420px); }
    .sp-sources__summary {
      display: inline-flex;
      min-height: 28px;
      align-items: center;
      gap: 6px;
      padding: 0 10px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-pill);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      cursor: pointer;
      list-style: none;
      user-select: none;
    }
    .sp-sources__summary::-webkit-details-marker { display: none; }
    .sp-sources__summary:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-sources__summary:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-sources__list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 8px 0 0;
      padding: 10px 12px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-panel);
      background: var(--agi-ext-surface);
      list-style: none;
    }

    /* ── Markdown rendering inside assistant bubbles ── */
    .sp-bubble-assistant code {
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-compact);
      padding: 1px 4px;
      font-family: var(--type-code-family);
      font-size: var(--type-code-size);
      line-height: var(--type-code-height);
      color: var(--agi-ext-accent-text);
    }
    .sp-bubble-assistant pre {
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      padding: 10px;
      overflow-x: auto;
      margin: 4px 0;
      font-family: var(--type-code-family);
      font-size: var(--type-code-size);
      line-height: var(--type-code-height);
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
    .sp-bubble-assistant a { color: var(--agi-ext-accent-text); text-decoration: underline; }
    .sp-bubble-assistant ul, .sp-bubble-assistant ol {
      padding-left: 16px;
      margin: 4px 0;
    }
    .sp-bubble-assistant li { margin: 2px 0; }
    .sp-bubble-assistant li > ul, .sp-bubble-assistant li > ol { margin: 2px 0; }
    .sp-bubble-assistant h1, .sp-bubble-assistant h2, .sp-bubble-assistant h3,
    .sp-bubble-assistant h4, .sp-bubble-assistant h5, .sp-bubble-assistant h6 {
      font-weight: 600;
      color: var(--agi-ext-text);
      margin: 6px 0 3px;
    }
    .sp-bubble-assistant h1 { font-size: var(--type-title-size); line-height: var(--type-title-height); }
    .sp-bubble-assistant h2 { font-size: var(--type-body-large-size); line-height: var(--type-body-large-height); }
    .sp-bubble-assistant h3, .sp-bubble-assistant h4 { font-size: var(--type-body-size); line-height: var(--type-body-height); }
    .sp-bubble-assistant h5, .sp-bubble-assistant h6 { font-size: var(--type-label-size); line-height: var(--type-label-height); }
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
    .sp-bubble-assistant { white-space: normal; }
    .sp-bubble-assistant p + p { margin-top: var(--paragraph-gap); }
    .sp-bubble-assistant table {
      display: block;
      max-width: 100%;
      margin: 6px 0;
      overflow-x: auto;
      border-collapse: collapse;
    }
    .sp-bubble-assistant th,
    .sp-bubble-assistant td {
      padding: 4px 10px;
      border: 1px solid var(--agi-ext-border);
      text-align: left;
      vertical-align: top;
    }
    .sp-bubble-assistant th { background: var(--agi-ext-overlay); font-weight: 600; }

    /* ── Validated structured result cards ── */
    .sp-interactive-card-stack {
      display: flex;
      width: min(100%, 420px);
      flex-direction: column;
      gap: 8px;
    }
    .sp-interactive-card {
      width: 100%;
      overflow: hidden;
      padding: 12px;
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: var(--corner-panel);
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text);
      box-shadow: var(--agi-ext-elevation-2);
    }
    .sp-interactive-card__heading {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .sp-interactive-card__heading > .agi-icon {
      flex: 0 0 15px;
      color: var(--agi-ext-accent-text);
    }
    .sp-interactive-card__headline {
      min-width: 0;
      font-size: var(--type-body-size);
      font-weight: 650;
      line-height: var(--type-body-height);
      overflow-wrap: anywhere;
    }
    .sp-interactive-card__text {
      margin-top: 5px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .sp-interactive-card__status {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--agi-ext-border);
      color: var(--agi-ext-warning-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-code-run {
      margin-top: 8px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      background: var(--agi-ext-surface);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-code-run__summary {
      display: flex;
      align-items: center;
      gap: 7px;
      min-height: 32px;
      padding: 0 10px;
      color: var(--agi-ext-text);
      font-weight: 600;
      list-style: none;
    }
    details.sp-code-run > summary { cursor: pointer; }
    details.sp-code-run > summary::-webkit-details-marker { display: none; }
    .sp-code-run__title { flex: 1; min-width: 0; }
    .sp-code-run__status--running svg { animation: sp-spin var(--duration-spin) linear infinite; }
    .sp-code-run__status--passed { color: var(--agi-ext-success-text); }
    .sp-code-run__status--failed { color: var(--agi-ext-danger-text); }
    .sp-code-run__detail {
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 8px 10px 10px;
      border-top: 1px solid var(--agi-ext-border);
    }
    .sp-code-run__label { color: var(--agi-ext-text-muted); font-weight: 600; }
    .sp-code-run__output {
      max-height: 240px;
      margin: 0;
      overflow: auto;
      padding: 7px 9px;
      border-radius: var(--corner-compact);
      background: var(--agi-ext-bg);
      color: var(--agi-ext-text);
      font-family: var(--type-code-family);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .sp-code-run__output--error { border: 1px solid var(--agi-ext-danger-border); color: var(--agi-ext-danger-text); }
    .sp-code-run__error { color: var(--agi-ext-danger-text); }
    .sp-code-run > summary:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-interactive-card__meta {
      margin-top: 4px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      overflow-wrap: anywhere;
    }
    .sp-interactive-card__link { color: var(--agi-ext-accent-text); text-decoration: underline; text-underline-offset: 2px; }
    .sp-itinerary__stops {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 10px 0 0;
      padding: 0;
      list-style: none;
    }
    .sp-itinerary__stop { display: flex; gap: 9px; }
    .sp-itinerary__pin {
      display: grid;
      flex: 0 0 22px;
      height: 22px;
      place-items: center;
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: var(--corner-pill);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .sp-itinerary__detail { min-width: 0; flex: 1; }
    .sp-itinerary__time,
    .sp-itinerary__address,
    .sp-itinerary__missing {
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-itinerary__time { font-variant-numeric: tabular-nums; }
    .sp-itinerary__address { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sp-itinerary__missing { display: flex; align-items: center; gap: 4px; }
    .sp-itinerary__place { font-weight: 600; overflow-wrap: anywhere; }
    .sp-itinerary__note { margin-top: 3px; font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-itinerary__route { margin-top: 10px; }
    .sp-itinerary__legs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .sp-itinerary__leg,
    .sp-comparison__buy {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 28px;
      padding: 0 10px;
      border-radius: var(--corner-pill);
      font-size: var(--type-caption-size);
      font-weight: 600;
      text-decoration: none;
    }
    .sp-itinerary__leg {
      border: 1px solid var(--agi-ext-border-strong);
      color: var(--agi-ext-text);
    }
    .sp-itinerary__leg:hover { background: var(--agi-ext-hover); }
    .sp-comparison__products {
      display: grid;
      gap: 8px;
      margin: 10px 0 0;
      padding: 0;
      list-style: none;
    }
    .sp-comparison__product {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 5px;
      padding: 10px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
    }
    .sp-comparison__name { font-weight: 600; overflow-wrap: anywhere; }
    .sp-comparison__best-for,
    .sp-comparison__merchant,
    .sp-comparison__unlisted { color: var(--agi-ext-text-muted); font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-comparison__price { font-size: var(--type-body-large-size); font-weight: 650; font-variant-numeric: tabular-nums; }
    .sp-comparison__merchant { margin-left: 6px; font-weight: 400; }
    .sp-comparison__buy {
      width: fit-content;
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
    }
    .sp-comparison__buy:hover { background: var(--agi-ext-accent-hover); }
    .sp-comparison__sources {
      display: flex;
      flex-wrap: wrap;
      gap: 3px 10px;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-comparison__source { display: inline-flex; min-height: 24px; align-items: center; gap: 4px; color: var(--agi-ext-text-muted); text-decoration: none; }
    .sp-comparison__source:hover { color: var(--agi-ext-text); text-decoration: underline; }
    .sp-comparison__source-number { font-variant-numeric: tabular-nums; }
    .sp-comparison__specs {
      margin: 10px -12px -12px;
      overflow-x: auto;
      border-top: 1px solid var(--agi-ext-border);
    }
    .sp-comparison__table { width: 100%; border-collapse: collapse; font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-comparison__table th,
    .sp-comparison__table td { min-width: 96px; padding: 6px 12px; border-bottom: 1px solid var(--agi-ext-border); text-align: left; vertical-align: top; }
    .sp-comparison__table tr:last-child th,
    .sp-comparison__table tr:last-child td { border-bottom: 0; }
    .sp-comparison__table th { color: var(--agi-ext-text-muted); font-weight: 600; }
    .sp-clarify__question { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
    .sp-clarify__label { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: var(--type-body-size); line-height: var(--type-body-height); }
    .sp-clarify__header {
      padding: 0 6px;
      border-radius: var(--corner-compact);
      background: var(--agi-ext-hover);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .sp-clarify__options { display: flex; flex-wrap: wrap; gap: 6px; }
    .sp-clarify__option {
      min-height: 28px;
      padding: 0 11px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-pill);
      background: transparent;
      color: var(--agi-ext-text-muted);
      cursor: pointer;
      font: inherit;
      font-size: var(--type-caption-size);
    }
    .sp-clarify__option:hover:not(:disabled) { color: var(--agi-ext-text); }
    .sp-clarify__option[aria-pressed='true'] { border-color: var(--agi-ext-accent); color: var(--agi-ext-text); font-weight: 600; }
    .sp-clarify__option:disabled { cursor: default; }
    .sp-clarify__other {
      box-sizing: border-box;
      width: 100%;
      padding: 5px 9px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      background: var(--agi-ext-bg);
      color: var(--agi-ext-text);
      font: inherit;
      font-size: var(--type-caption-size);
    }
    .sp-clarify__other::placeholder { color: var(--agi-ext-text-placeholder); }
    .sp-clarify__answer { color: var(--agi-ext-text-muted); font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-clarify__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 12px; }
    .sp-clarify__send {
      min-height: 28px;
      padding: 0 12px;
      border: 0;
      border-radius: var(--corner-control);
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      cursor: pointer;
      font: inherit;
      font-size: var(--type-caption-size);
      font-weight: 600;
    }
    .sp-clarify__send:disabled { cursor: default; opacity: 0.5; }
    .sp-clarify__dismiss {
      min-height: 28px;
      padding: 0 8px;
      border: 0;
      background: transparent;
      color: var(--agi-ext-text-muted);
      cursor: pointer;
      font: inherit;
      font-size: var(--type-caption-size);
    }
    .sp-clarify__dismiss:hover { color: var(--agi-ext-text); }
    .sp-itinerary__leg:focus-visible,
    .sp-comparison__buy:focus-visible,
    .sp-comparison__source:focus-visible,
    .sp-clarify__option:focus-visible,
    .sp-clarify__send:focus-visible,
    .sp-clarify__dismiss:focus-visible,
    .sp-clarify__other:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-comparison__specs:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-interactive-card__places {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin: 9px 0 0;
      padding: 0;
      list-style: none;
      counter-reset: sp-card-place;
    }
    .sp-interactive-card__places li {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr);
      gap: 6px;
      align-items: center;
      color: var(--agi-ext-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      counter-increment: sp-card-place;
    }
    .sp-interactive-card__places li::before {
      content: counter(sp-card-place);
      display: grid;
      width: 18px;
      height: 18px;
      place-items: center;
      border-radius: var(--corner-pill);
      background: color-mix(in srgb, var(--agi-ext-accent) 18%, transparent);
      color: var(--agi-ext-accent-text);
      font-size: var(--type-caption-size);
      font-weight: 700;
    }
    .sp-interactive-card__places li > span {
      grid-column: 2;
      margin-top: -5px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      text-transform: capitalize;
    }
    .sp-map-preview {
      position: relative;
      height: 200px;
      margin-top: 9px;
      overflow: hidden;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      background: var(--agi-ext-overlay);
    }
    .sp-map-preview__canvas { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
    .sp-map-preview__tile {
      position: absolute;
      width: 256px;
      max-width: none;
      height: 256px;
      user-select: none;
      pointer-events: none;
    }
    .sp-map-preview--dimmed .sp-map-preview__tile {
      filter: invert(1) hue-rotate(180deg) saturate(0.22) sepia(0.16) brightness(1.04) contrast(0.88);
    }
    .sp-map-preview__marker {
      position: absolute;
      display: grid;
      box-sizing: border-box;
      min-width: 22px;
      height: 22px;
      padding: 0 5px;
      transform: translate(-50%, -50%);
      place-items: center;
      white-space: nowrap;
      border: 2px solid var(--agi-ext-surface);
      border-radius: var(--corner-pill);
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      font-size: var(--type-caption-size);
      font-weight: 600;
      line-height: 1;
      box-shadow: var(--agi-ext-elevation-2);
    }
    .sp-map-preview__marker--unconfirmed {
      border-color: var(--agi-ext-warning-text);
      background: var(--agi-ext-surface);
      color: var(--agi-ext-warning-text);
    }
    .sp-map-preview__attribution {
      position: absolute;
      right: 4px;
      bottom: 4px;
      max-width: calc(100% - 8px);
      overflow: hidden;
      padding: 1px 5px;
      border-radius: var(--corner-compact);
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sp-map-preview__status {
      display: flex;
      height: 100%;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 16px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      text-align: center;
    }
    .sp-map-preview[aria-busy='true'] .sp-map-preview__spinner svg { animation: sp-spin var(--duration-spin) linear infinite; }
    .sp-interactive-card__actions {
      display: flex;
      flex-direction: column;
      gap: 5px;
      margin-top: 10px;
      padding-top: 9px;
      border-top: 1px solid var(--agi-ext-border);
    }
    .sp-interactive-card__action {
      display: flex;
      width: 100%;
      min-height: var(--control-lg);
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 9px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-menu);
      background: var(--agi-ext-bg);
      color: var(--agi-ext-text);
      cursor: pointer;
      font: inherit;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 550;
      text-align: left;
    }
    .sp-interactive-card__action:hover { background: var(--agi-ext-hover); }
    .sp-interactive-card__action:focus-visible {
      outline: 2px solid var(--agi-ext-focus);
      outline-offset: 2px;
    }
    .sp-interactive-card__action > .agi-icon { flex: 0 0 12px; opacity: 0.7; }

    /* ── Cursor blink for streaming ── */
    .sp-cursor::after {
      content: '▋';
      animation: sp-blink var(--duration-blink) steps(1) infinite;
      color: var(--agi-ext-accent-text);
      font-size: var(--type-caption-size);
    }
    @keyframes sp-blink { 0%, 100% { opacity: 1; }
    50% { opacity: 0; }
    }

    /* ── Inline tool-call UI (design-spec §4) ── */
    .tool-call {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: var(--type-body-size);
      line-height: var(--type-body-height);
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
      border-radius: var(--corner-control);
      transition: background var(--duration-instant) var(--curve-standard);
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
    .tool-call__label { color: var(--agi-ext-text-muted); font-weight: 400; font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .tool-call__summary {
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
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
      transition: transform var(--duration-quick) var(--curve-standard);
      flex-shrink: 0;
    }
    .tool-call__chevron svg { width: 12px; height: 12px; }
    .tool-call--open .tool-call__chevron { transform: rotate(90deg); }
    .tool-call__body {
      display: none;
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      padding: 10px 12px;
      font-family: var(--type-code-family);
      font-size: var(--type-code-size);
      line-height: var(--type-code-height);
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
    .tool-call--running .tool-call__icon svg { animation: sp-spin var(--duration-spin) linear infinite; }
    @keyframes sp-spin { to { transform: rotate(360deg); }
    }
    .tool-call--error .tool-call__label { color: var(--agi-ext-danger-text); }
    .tool-call--error .tool-call__icon { color: var(--agi-ext-danger-text); }
    .tool-call--success .tool-call__icon { color: var(--agi-ext-success-text); }

    .sp-agent-activity {
      width: min(100%, 420px);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
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
      border-radius: var(--corner-control);
    }
    .sp-agent-activity > summary::-webkit-details-marker { display: none; }
    .sp-agent-activity > summary:hover { background: var(--agi-ext-hover); }
    .sp-agent-activity__chevron {
      margin-left: auto;
      transition: transform var(--duration-quick) var(--curve-standard);
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
      border-radius: var(--corner-control);
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
    .sp-agent-step--running .sp-agent-step__icon { animation: sp-spin var(--duration-spin) linear infinite; }
    .sp-agent-step--failed .sp-agent-step__icon { color: var(--agi-ext-danger-text); }
    .sp-agent-step--completed .sp-agent-step__icon { color: var(--agi-ext-success-text); }
    .sp-agent-step__summary {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sp-agent-step__elapsed { font-size: var(--type-caption-size); line-height: var(--type-caption-height); opacity: 0.65; }
    .sp-agent-step__detail {
      margin: 0 5px 6px 26px;
      padding: 8px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
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
      border-radius: var(--corner-pill);
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
      color: var(--agi-ext-accent-text);
      font-weight: 600;
      text-decoration: none;
      white-space: normal;
    }
    .sp-agent-artifact-link:hover { text-decoration: underline; }
    .sp-agent-artifact-unavailable {
      margin-top: 8px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
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
    .sp-agent-approval__summary { color: var(--agi-ext-text); line-height: var(--type-body-height); }
    .sp-agent-approval__recorded { color: var(--agi-ext-accent-text); font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-agent-approval__error { color: var(--agi-ext-danger-text); font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-agent-approval__actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .sp-agent-approval__stakes {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 2px 10px;
      margin: 0;
      padding: 6px 8px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-agent-approval__stakes dt { color: var(--agi-ext-text-muted); }
    .sp-agent-approval__stakes dd { margin: 0; color: var(--agi-ext-text); font-weight: 600; overflow-wrap: anywhere; }
    .sp-agent-approval__guidance {
      box-sizing: border-box;
      width: 100%;
      min-height: 52px;
      padding: 6px 9px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      background: var(--agi-ext-bg);
      color: var(--agi-ext-text);
      font: inherit;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      resize: vertical;
    }
    .sp-agent-approval__guidance::placeholder { color: var(--agi-ext-text-placeholder); }
    .sp-agent-approval__guidance:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-agent-approval__button {
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text);
      cursor: pointer;
      font: inherit;
      font-size: var(--type-label-size); line-height: var(--type-label-height);
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
    .sp-connector-input {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0 5px 6px 26px;
      padding: 10px;
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: var(--corner-control);
      background: var(--agi-ext-bg);
      white-space: normal;
    }
    .sp-connector-input__heading { margin: 0; color: var(--agi-ext-text); font-weight: 600; line-height: var(--type-body-height); }
    .sp-connector-input__meta,
    .sp-connector-input__hint { margin: 0; color: var(--agi-ext-text-muted); font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-connector-input [hidden] { display: none; }
    .sp-connector-input__form { display: flex; flex-direction: column; gap: 12px; margin-top: 8px; }
    .sp-connector-input__prompt { display: flex; flex-direction: column; gap: 10px; }
    .sp-connector-input__message { margin: 0; color: var(--agi-ext-text); line-height: var(--type-body-height); white-space: pre-wrap; overflow-wrap: anywhere; }
    .sp-connector-input__field { display: flex; flex-direction: column; gap: 4px; min-width: 0; margin: 0; padding: 0; border: 0; }
    .sp-connector-input__label { padding: 0; color: var(--agi-ext-text); font-size: var(--type-caption-size); font-weight: 600; line-height: var(--type-caption-height); }
    .sp-connector-input__optional { color: var(--agi-ext-text-muted); font-weight: 400; }
    .sp-connector-input__control {
      box-sizing: border-box;
      width: 100%;
      min-height: var(--control-md);
      padding: 5px 9px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      background: var(--agi-ext-bg);
      color: var(--agi-ext-text);
      font: inherit;
      font-size: var(--type-caption-size);
    }
    .sp-connector-input__control[aria-invalid='true'] { border-color: var(--agi-ext-danger-border); }
    .sp-connector-input__check-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      color: var(--agi-ext-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-connector-input__check { flex-shrink: 0; margin: 2px 0 0; accent-color: var(--agi-ext-accent); }
    .sp-connector-input__error { margin: 0; color: var(--agi-ext-danger-text); font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-connector-input__address {
      margin: 0;
      padding: 6px 8px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      color: var(--agi-ext-text-muted);
      font-family: var(--type-code-family);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      overflow-wrap: anywhere;
    }
    .sp-connector-input__address strong { color: var(--agi-ext-text); }
    .sp-connector-input__warning {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin: 0;
      color: var(--agi-ext-warning-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-connector-input__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
    .sp-connector-input__open,
    .sp-connector-input__submit { display: inline-flex; align-items: center; gap: 5px; }
    .sp-connector-input button:disabled { cursor: default; opacity: 0.5; }
    .sp-connector-input__submit[aria-busy='true'] svg { animation: sp-spin var(--duration-spin) linear infinite; }
    .sp-connector-input__control:focus-visible,
    .sp-connector-input__check:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    @media (pointer: coarse) {
      .sp-connector-input__control,
      .sp-connector-input__check-row,
      .sp-connector-input button { min-height: 44px; }
    }

    /* ── Thinking dots ── */
    .sp-thinking {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 8px 12px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-surface);
      border-bottom-left-radius: var(--corner-compact);
    }
    .sp-dot {
      width: 6px;
      height: 6px;
      border-radius: var(--corner-pill);
      background: var(--agi-ext-accent);
      animation: sp-bounce var(--duration-bounce) infinite;
    }
    .sp-dot:nth-child(2) { animation-delay: calc(var(--duration-bounce) / 6); }
    .sp-dot:nth-child(3) { animation-delay: calc(var(--duration-bounce) / 3); }
    .sp-thinking-label {
      margin-left: 4px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-bubble-transient-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-bubble-transient-status__icon svg,
    .sp-send-stopping-icon svg { animation: sp-spin var(--duration-spin) linear infinite; }
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
      border-radius: var(--corner-control);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      padding: 4px 9px;
      cursor: pointer;
      transition: color var(--duration-quick), border-color var(--duration-quick), background var(--duration-quick);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .sp-tool-btn:hover { color: var(--agi-ext-accent-text); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    .sp-tool-btn.active { color: var(--agi-ext-accent-text); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 15%, transparent); }
    .sp-tool-btn.has-context { color: var(--agi-ext-success-text); border-color: var(--agi-ext-success-border); background: var(--agi-ext-success-bg); }
    .sp-tool-btn:disabled { opacity: 0.5; cursor: wait; }

    /* ── Mic pulsing indicator ── */
    .sp-mic-pulse {
      width: 8px; height: 8px;
      border-radius: var(--corner-pill);
      background: var(--agi-ext-danger);
      animation: sp-pulse var(--duration-pulse) infinite;
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
      border-radius: var(--corner-field);
      padding: 4px;
      z-index: var(--z-dropdown);
      box-shadow: var(--agi-ext-elevation-2);
    }
    #sp-shortcuts-dropdown.open { display: block; }
    .sp-shortcut-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 8px;
      border-radius: var(--corner-control);
      cursor: pointer;
      transition: background var(--duration-instant);
    }
    .sp-shortcut-item:hover { background: var(--agi-ext-hover); }
    .sp-shortcut-name { font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text); flex: 1; }
    .sp-shortcut-actions {
      display: flex;
      gap: 4px;
    }
    .sp-shortcut-action-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      padding: 2px 4px;
      border-radius: var(--corner-compact);
      transition: background var(--duration-instant);
    }
    .sp-shortcut-action-btn:hover { background: var(--agi-ext-overlay); }
    .sp-shortcuts-status {
      padding: 6px 10px;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      border-top: 1px solid var(--agi-ext-border);
    }
    .sp-shortcuts-status[data-kind='error'] { color: var(--agi-ext-danger-text); }
    .sp-shortcuts-status[data-kind='success'] { color: var(--agi-ext-success-text); }
    .sp-shortcuts-status:empty { display: none; }

    .sp-shortcuts-empty {
      padding: 10px 8px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
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
      border-radius: var(--corner-compact);
      color: var(--agi-ext-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      padding: 4px 6px;
      outline: none;
    }
    .sp-save-shortcut-input:focus { border-color: var(--agi-ext-focus); }
    .sp-save-shortcut-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-save-shortcut-btn {
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      border: none;
      border-radius: var(--corner-compact);
      padding: 4px 8px;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      cursor: pointer;
      white-space: nowrap;
    }
    .sp-save-shortcut-btn:hover { background: var(--agi-ext-accent-hover); }
    .sp-save-shortcut-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

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
      border-radius: var(--corner-menu);
      background: var(--agi-ext-surface);
    }
    #sp-cloud-gate.visible { display: flex; }
    #sp-cloud-gate-copy {
      flex: 1;
      min-width: 0;
    }
    #sp-cloud-gate-title {
      color: var(--agi-ext-text);
      font-size: var(--type-caption-size);
      font-weight: 600;
      line-height: var(--type-caption-height);
    }
    #sp-cloud-gate-message {
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      margin-top: 2px;
    }
    #sp-cloud-gate-action {
      flex-shrink: 0;
      border: 0;
      border-radius: var(--corner-control);
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      cursor: pointer;
      font: inherit;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 600;
      padding: 6px 9px;
    }
    #sp-cloud-gate-action:hover { opacity: 0.88; }
    #sp-cloud-gate-action:disabled { cursor: wait; opacity: 0.6; }
    .sp-composer-notice {
      display: none;
      align-items: center;
      gap: 8px;
      margin: 0 0 6px;
      padding: 7px 10px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-menu);
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-composer-notice.visible { display: flex; }
    .sp-composer-notice > span { flex: 1; min-width: 0; }
    #sp-mic-notice { flex-wrap: wrap; justify-content: flex-end; color: var(--agi-ext-text); }
    #sp-mic-notice > span { flex-basis: 100%; }
    #sp-usage-warning[data-severity='warning'] {
      border-color: var(--agi-ext-warning-border);
      background: var(--agi-ext-warning-bg);
      color: var(--agi-ext-warning-text);
    }
    #sp-usage-warning[data-severity='critical'] {
      border-color: var(--agi-ext-danger-border);
      background: var(--agi-ext-danger-bg);
      color: var(--agi-ext-danger-text);
    }
    .sp-composer-notice-action {
      flex-shrink: 0;
      background: none;
      border: 1px solid currentColor;
      border-radius: var(--corner-control);
      color: inherit;
      font: inherit;
      padding: 2px 8px;
      cursor: pointer;
      white-space: nowrap;
    }
    .sp-composer-notice-dismiss {
      display: grid;
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: var(--corner-control);
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .sp-composer-notice-dismiss:hover { background: var(--agi-ext-hover); }
    .sp-composer-notice-dismiss:focus-visible,
    .sp-composer-notice-action:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    #sp-memory-notice { flex-wrap: wrap; color: var(--agi-ext-text); }
    .sp-composer-notice-action:hover {
      background: color-mix(in srgb, currentColor 12%, transparent);
    }
    /* outer composer shell */
    #sp-composer-shell {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-panel);
      min-height: 106px;
      padding: 10px 10px 7px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: border-color var(--duration-quick), box-shadow var(--duration-quick);
    }
    #sp-composer-shell:has(#sp-input:focus) {
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
      font-size: var(--type-body-large-size);
      padding: 3px 4px;
      resize: none;
      outline: none;
      font-family: inherit;
      line-height: var(--type-body-large-height);
      max-height: 120px;
      min-height: 52px;
      overflow-y: auto;
    }
    #sp-input::placeholder { color: var(--agi-ext-text-placeholder); }
    /* Slash-command autocomplete. Anchored above the composer because the panel
       is short and a downward menu would fall outside the viewport. */
    #sp-slash-menu, #sp-mention-menu {
      display: none;
      flex-direction: column;
      gap: 1px;
      margin-bottom: 6px;
      padding: 4px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-menu);
      box-shadow: var(--agi-ext-elevation-2);
      max-height: 214px;
      overflow-y: auto;
    }
    #sp-slash-menu.visible, #sp-mention-menu.visible { display: flex; }
    .sp-mention-heading {
      padding: 6px 9px 2px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 600;
    }
    .sp-slash-item .sp-slash-name, .sp-slash-item .sp-slash-hint {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #sp-link-form { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
    #sp-link-form[hidden] { display: none; }
    .sp-link-row { display: flex; gap: 6px; align-items: center; }
    #sp-link-input {
      flex: 1;
      min-width: 0;
      min-height: 32px;
      padding: 5px 9px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      background: var(--agi-ext-bg);
      color: var(--agi-ext-text);
      font: inherit;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    #sp-link-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-link-submit, .sp-link-cancel {
      min-height: 32px;
      padding: 5px 10px;
      border-radius: var(--corner-control);
      font: inherit;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      cursor: pointer;
    }
    .sp-link-submit { border: 0; background: var(--agi-ext-accent); color: var(--agi-ext-on-accent); }
    .sp-link-submit:disabled { cursor: wait; opacity: 0.6; }
    .sp-link-cancel { border: 1px solid var(--agi-ext-border); background: transparent; color: var(--agi-ext-text-muted); }
    .sp-link-cancel:hover { color: var(--agi-ext-text); }
    .sp-link-submit:focus-visible, .sp-link-cancel:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-link-error { min-height: 0; color: var(--agi-ext-text-muted); font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-link-error:empty { display: none; }
    @media (pointer: coarse) {
      #sp-link-input, .sp-link-submit, .sp-link-cancel { min-height: 44px; }
    }
    #sp-queued-list { display: flex; flex-direction: column; gap: 4px; margin: 0 0 6px; padding: 0; list-style: none; }
    #sp-queued-list[hidden] { display: none; }
    .sp-queued-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      background: var(--agi-ext-bg);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-queued-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sp-queued-action {
      flex-shrink: 0;
      padding: 2px 6px;
      border: 0;
      border-radius: var(--corner-compact);
      background: transparent;
      color: var(--agi-ext-text-muted);
      font: inherit;
      cursor: pointer;
    }
    .sp-queued-action:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-queued-action:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 1px; }
    @media (pointer: coarse) {
      .sp-queued-action { min-height: 44px; min-width: 44px; }
    }
    .sp-slash-item {
      display: flex;
      flex-direction: column;
      gap: 1px;
      padding: 7px 9px;
      border-radius: var(--corner-control);
      cursor: pointer;
      border: none;
      background: transparent;
      text-align: left;
      font-family: inherit;
    }
    .sp-slash-item:hover, .sp-slash-item.active { background: var(--agi-ext-hover); }
    .sp-slash-item.active { outline: 1px solid var(--agi-ext-focus); outline-offset: -1px; }
    .sp-slash-name { color: var(--agi-ext-text); font-size: var(--type-body-size); line-height: var(--type-body-height); font-weight: 600; }
    .sp-slash-hint { color: var(--agi-ext-text-muted); font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    #sp-send-btn {
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      border: none;
      border-radius: var(--corner-pill);
      width: var(--control-md);
      height: var(--control-md);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      transition: background var(--duration-quick), transform var(--duration-instant);
    }
    #sp-send-btn:hover:not(:disabled) { background: var(--agi-ext-accent-hover); transform: scale(1.05); }
    #sp-send-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    #sp-send-btn:disabled { background: var(--agi-ext-overlay); color: var(--agi-ext-border-strong); cursor: not-allowed; transform: none; }
    #sp-send-btn[data-mode="stop"] { background: var(--agi-ext-danger); color: var(--agi-ext-on-danger); }
    #sp-send-btn[data-mode="stop"]:hover { background: var(--agi-ext-danger-hover); }

    /* ── Attachment + button and menu ── */
    .sp-attach-wrapper { position: relative; flex-shrink: 0; }
    .sp-attach-btn {
      width: var(--control-md);
      height: var(--control-md);
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: var(--corner-control);
      color: var(--agi-ext-text-muted);
      font-size: 18px;
      font-weight: 300;
      line-height: 1;
      cursor: pointer;
      flex-shrink: 0;
      transition: color var(--duration-quick), background var(--duration-quick);
    }
    .sp-attach-btn:hover { color: var(--agi-ext-accent-text); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    #sp-attach-menu {
      display: none;
      position: absolute;
      bottom: calc(100% + 6px);
      left: 0;
      min-width: 190px;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-field);
      padding: 4px;
      z-index: var(--z-dropdown);
      box-shadow: var(--agi-ext-elevation-2);
    }
    #sp-attach-menu.open { display: block; }
    .sp-attach-menu-item[hidden],
    .sp-tool-btn[hidden] { display: none; }
    .sp-attach-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: var(--corner-control);
      cursor: pointer;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      color: var(--agi-ext-text-muted);
      transition: background var(--duration-instant), color var(--duration-instant);
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
      border-radius: var(--corner-control);
      overflow: visible;
      border: 1px solid var(--agi-ext-border);
    }
    .sp-attachment-thumb {
      width: 48px;
      height: 48px;
      object-fit: cover;
      border-radius: var(--corner-control);
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
      border-radius: var(--corner-pill);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      transition: background var(--duration-instant), color var(--duration-instant);
    }
    .sp-attachment-remove:hover { background: var(--agi-ext-danger-bg); color: var(--agi-ext-danger-text); border-color: var(--agi-ext-danger-border); }
    .sp-attachment-doc {
      align-items: center;
      gap: 8px;
      max-width: 240px;
      min-height: 48px;
      padding: 6px 14px 6px 8px;
      background: var(--agi-ext-surface);
    }
    .sp-attachment-doc[data-phase='failed'] { border-color: var(--agi-ext-danger-border); }
    .sp-attachment-doc-icon { display: inline-flex; flex-shrink: 0; color: var(--agi-ext-text-muted); }
    .sp-attachment-doc[aria-busy='true'] .sp-attachment-doc-icon svg { animation: sp-spin var(--duration-spin) linear infinite; }
    .sp-attachment-doc-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }
    .sp-attachment-doc-name {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--agi-ext-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 500;
    }
    .sp-attachment-doc-status {
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-attachment-doc[data-phase='failed'] .sp-attachment-doc-status { color: var(--agi-ext-danger-text); white-space: normal; }
    .sp-attachment-doc-retry {
      padding: 2px 8px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      background: none;
      color: var(--agi-ext-accent-text);
      font: inherit;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      cursor: pointer;
      transition: background var(--duration-instant);
    }
    .sp-attachment-doc-retry:hover { background: var(--agi-ext-hover); }
    .sp-attachment-notice {
      flex: 1 1 100%;
      color: var(--agi-ext-danger-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-attachment-retention {
      flex: 1 1 100%;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-attachment-notices {
      display: flex;
      flex: 1 1 100%;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
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

    /* Autonomy chip (EXT-11). Reads the same agi_cu_ask_before_acting pref the
       background's authoritative gate reads, it reports that gate, it does not
       own it. Amber for the permissive state, matching how the reference
       products surface a permission mode: the risky setting is the one that
       gets the warning colour, not the safe one. */
    .sp-autonomy-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 22px;
      padding: 0 8px;
      font-size: var(--type-label-size); line-height: var(--type-label-height);
      font-weight: 600;
      border-radius: var(--corner-pill);
      cursor: pointer;
      white-space: nowrap;
      background: var(--agi-ext-success-bg);
      border: 1px solid var(--agi-ext-success-border);
      color: var(--agi-ext-success-text);
    }
    .sp-autonomy-chip[data-mode='full'] {
      background: var(--agi-ext-warning-bg);
      border-color: var(--agi-ext-warning-border);
      color: var(--agi-ext-warning-text);
    }
    .sp-autonomy-chip:hover { filter: brightness(1.12); }
    .sp-autonomy-chip .agi-icon { flex-shrink: 0; }

    /* Per-row provenance badge in the history drawer. */
    .sp-drawer-history-badge {
      display: inline-flex;
      align-items: center;
      color: var(--agi-ext-text-muted);
      flex-shrink: 0;
      margin-right: 4px;
    }
    .sp-drawer-history-badge[data-state="cloud"] { color: var(--agi-ext-accent-text); }
    .sp-drawer-history-badge[data-state="pending"] { color: var(--agi-ext-info-text); }
    .sp-drawer-history-badge[data-state="error"] { color: var(--agi-ext-warning-text); }

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
      border-radius: var(--corner-control);
      color: var(--agi-ext-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      padding: 5px 9px;
      outline: none;
      font-family: inherit;
      transition: border-color var(--duration-quick);
      min-width: 0;
    }
    #sp-auth-input:focus { border-color: var(--agi-ext-focus); }
    #sp-auth-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    #sp-auth-input::placeholder { color: var(--agi-ext-text-placeholder); }
    #sp-auth-save-btn {
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      border: none;
      border-radius: var(--corner-control);
      padding: 5px 10px;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      cursor: pointer;
      flex-shrink: 0;
      transition: background var(--duration-quick);
      white-space: nowrap;
    }
    #sp-auth-save-btn:hover { background: var(--agi-ext-accent-hover); }
    #sp-auth-save-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

    /* ── Connection status pill ── */
    #sp-status-pill {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      border-radius: var(--corner-menu);
      padding: 3px 8px;
      flex-shrink: 0;
      font-weight: 500;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }
    #sp-status-pill.connected {
      background: var(--agi-ext-success-bg);
      color: var(--agi-ext-success-text);
      border: 1px solid var(--agi-ext-success-border);
    }
    #sp-status-pill.disconnected {
      background: var(--agi-ext-danger-bg);
      color: var(--agi-ext-danger-text);
      border: 1px solid var(--agi-ext-danger-border);
    }
    .sp-status-dot {
      width: 6px;
      height: 6px;
      border-radius: var(--corner-pill);
      flex-shrink: 0;
    }
    #sp-status-pill.connected .sp-status-dot { background: var(--agi-ext-success); }
    #sp-status-pill.disconnected .sp-status-dot { background: var(--agi-ext-danger); }
    #sp-status-pill.cloud {
      background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
      color: var(--agi-ext-accent-text);
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
      font-size: var(--type-caption-size); line-height: var(--type-caption-height);
      color: var(--agi-ext-danger-text);
      flex-shrink: 0;
    }
    #sp-bridge-notice.visible { display: flex; }
    #sp-bridge-notice-dot {
      width: 6px;
      height: 6px;
      border-radius: var(--corner-pill);
      background: var(--agi-ext-danger);
      flex-shrink: 0;
    }
    #sp-bridge-notice-text { flex: 1; line-height: var(--type-caption-height); }
    #sp-bridge-notice-reconnect {
      background: none;
      border: 1px solid var(--agi-ext-danger-border);
      color: var(--agi-ext-danger-text);
      border-radius: var(--corner-control);
      padding: 2px 8px;
      font-size: var(--type-caption-size); line-height: var(--type-caption-height);
      cursor: pointer;
      white-space: nowrap;
      flex-shrink: 0;
      transition: background var(--duration-instant);
    }
    #sp-bridge-notice-reconnect:hover {
      background: color-mix(in srgb, var(--agi-ext-danger) 12%, transparent);
    }
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
      /* A flex child will not shrink below its text's min-content width without
         min-width:0, so the fourth tab pushed the bar wider than the panel
         rather than sharing the row. Clip the label instead of the bar. */
      min-width: 0;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 500;
      padding: 9px 4px;
      cursor: pointer;
      letter-spacing: 0.02em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: color var(--duration-quick), border-color var(--duration-quick);
    }
    .sp-tab:hover { color: var(--agi-ext-text); }
    .sp-tab.sp-tab-active { color: var(--agi-ext-accent-text); border-bottom-color: var(--agi-ext-accent); }
    #sp-chat-panel { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    #sp-chat-panel.sp-tab-hidden { display: none; }
    #sp-workflows { display: none; flex: 1; overflow-y: auto; padding: 12px 10px; flex-direction: column; gap: 16px; }
    #sp-workflows.sp-tab-visible { display: flex; }
    #sp-workflows::-webkit-scrollbar { width: 4px; }
    #sp-workflows::-webkit-scrollbar-track { background: transparent; }
    #sp-workflows::-webkit-scrollbar-thumb { background: var(--agi-ext-border); border-radius: var(--corner-compact); }
    .sp-wf-section { background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: var(--corner-menu); padding: 12px; display: flex; flex-direction: column; gap: 10px; }
    .sp-wf-section-header { display: flex; align-items: center; justify-content: space-between; }
    .sp-wf-section-title { font-size: var(--type-caption-size); line-height: var(--type-caption-height); font-weight: 600; color: var(--agi-ext-text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .sp-wf-empty { color: var(--agi-ext-text-muted); font-size: var(--type-caption-size); line-height: var(--type-caption-height); padding: 4px 0; }
    .sp-wf-shortcuts-list { display: flex; flex-direction: column; gap: 6px; }
    .sp-wf-shortcut-item { display: flex; align-items: center; gap: 8px; padding: 7px 9px; background: var(--agi-ext-bg); border: 1px solid var(--agi-ext-border); border-radius: var(--corner-control); }
    .sp-wf-shortcut-icon { font-size: 14px; flex-shrink: 0; }
    .sp-wf-shortcut-info { flex: 1; min-width: 0; }
    .sp-wf-shortcut-name { font-size: var(--type-caption-size); line-height: var(--type-caption-height); font-weight: 500; color: var(--agi-ext-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sp-wf-shortcut-meta { font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text-muted); margin-top: 1px; }
    .sp-wf-shortcut-btns { display: flex; gap: 4px; flex-shrink: 0; }
    .sp-wf-btn-replay { background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); color: var(--agi-ext-accent-text); font-size: var(--type-caption-size); line-height: var(--type-caption-height); padding: 3px 9px; border-radius: var(--corner-control); cursor: pointer; transition: background var(--duration-instant); }
    .sp-wf-btn-replay:hover { background: color-mix(in srgb, var(--agi-ext-accent) 22%, transparent); }
    .sp-wf-btn-replay:disabled { cursor: wait; opacity: 0.6; }
    .sp-wf-btn-delete { background: none; border: 1px solid var(--agi-ext-border); color: var(--agi-ext-danger-text); font-size: var(--type-caption-size); line-height: var(--type-caption-height); padding: 3px 7px; border-radius: var(--corner-control); cursor: pointer; transition: color var(--duration-instant), border-color var(--duration-instant); }
    .sp-wf-btn-delete:hover { color: var(--agi-ext-danger-text); border-color: var(--agi-ext-danger-border); }
    .sp-wf-btn-delete:disabled, .sp-wf-task-delete:disabled { cursor: wait; opacity: 0.55; }
    .sp-wf-btn-delete.is-confirm,
    .sp-wf-task-delete.is-confirm { color: var(--agi-ext-on-danger); background: var(--agi-ext-danger); border-color: var(--agi-ext-danger); }
    .sp-wf-tasks-list { display: flex; flex-direction: column; gap: 6px; }
    .sp-wf-task-item { display: flex; align-items: center; gap: 8px; padding: 7px 9px; background: var(--agi-ext-bg); border: 1px solid var(--agi-ext-border); border-radius: var(--corner-control); }
    .sp-wf-task-info { flex: 1; min-width: 0; }
    .sp-wf-task-name { font-size: var(--type-caption-size); line-height: var(--type-caption-height); font-weight: 500; color: var(--agi-ext-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sp-wf-task-description { font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text-muted); overflow-wrap: anywhere; }
    .sp-wf-task-schedule-badge { display: inline-block; font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-accent-text); background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); border-radius: var(--corner-compact); padding: 1px 5px; margin-top: 2px; }
    .sp-wf-task-toggle { appearance: none; width: 30px; height: 16px; border-radius: var(--corner-pill); background: var(--agi-ext-hover); position: relative; cursor: pointer; transition: background var(--duration-quick); flex-shrink: 0; }
    .sp-wf-task-toggle:checked { background: var(--agi-ext-accent); }
    .sp-wf-task-toggle:disabled { cursor: wait; opacity: 0.55; }
    .sp-wf-task-toggle::after { content: ''; position: absolute; width: 12px; height: 12px; border-radius: var(--corner-pill); background: var(--agi-ext-toggle-knob); top: 2px; left: 2px; transition: transform var(--duration-quick); }
    .sp-wf-task-toggle:checked::after { transform: translateX(14px); }
    .sp-wf-task-delete { background: none; border: 1px solid var(--agi-ext-border); color: var(--agi-ext-danger-text); font-size: var(--type-caption-size); line-height: var(--type-caption-height); padding: 3px 7px; border-radius: var(--corner-control); cursor: pointer; transition: color var(--duration-instant), border-color var(--duration-instant); }
    .sp-wf-task-delete:hover { color: var(--agi-ext-danger-text); border-color: var(--agi-ext-danger-border); }
    .sp-wf-task-result { background: none; border: 1px solid var(--agi-ext-border); color: var(--agi-ext-text-muted); font-size: var(--type-caption-size); line-height: var(--type-caption-height); padding: 3px 7px; border-radius: var(--corner-control); cursor: pointer; transition: color var(--duration-instant), border-color var(--duration-instant); }
    .sp-wf-task-result:hover { color: var(--agi-ext-accent-text); border-color: var(--agi-ext-focus); }
    .sp-wf-new-task-btn { background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); color: var(--agi-ext-accent-text); font-size: var(--type-caption-size); line-height: var(--type-caption-height); padding: 4px 10px; border-radius: var(--corner-control); cursor: pointer; transition: background var(--duration-instant); }
    .sp-wf-new-task-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 22%, transparent); }
    .sp-wf-new-task-form { display: none; flex-direction: column; gap: 7px; padding: 10px; background: var(--agi-ext-bg); border: 1px solid var(--agi-ext-border); border-radius: var(--corner-control); }
    .sp-wf-new-task-form.open { display: flex; }
    .sp-wf-form-label { font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text-muted); margin-bottom: 1px; }
    .sp-wf-form-input { background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: var(--corner-control); color: var(--agi-ext-text); font-size: var(--type-caption-size); line-height: var(--type-caption-height); padding: 5px 8px; outline: none; font-family: inherit; transition: border-color var(--duration-quick); width: 100%; }
    .sp-wf-form-input:focus { border-color: var(--agi-ext-focus); }
    .sp-wf-form-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-wf-form-input::placeholder { color: var(--agi-ext-text-placeholder); }
    .sp-wf-form-textarea { resize: vertical; min-height: 72px; box-sizing: border-box; }
    .sp-wf-form-select { background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: var(--corner-control); color: var(--agi-ext-text); font-size: var(--type-caption-size); line-height: var(--type-caption-height); padding: 5px 8px; outline: none; font-family: inherit; width: 100%; }
    .sp-wf-form-select:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-wf-form-save-btn { background: var(--agi-ext-accent); color: var(--agi-ext-on-accent); border: none; border-radius: var(--corner-control); padding: 6px 14px; font-size: var(--type-caption-size); line-height: var(--type-caption-height); cursor: pointer; align-self: flex-end; transition: background var(--duration-instant); }
    .sp-wf-form-save-btn:hover { background: var(--agi-ext-accent-hover); }
    .sp-wf-form-save-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-wf-form-save-btn:disabled { cursor: wait; opacity: 0.6; }
    .sp-wf-form-cancel-btn { background: none; border: 1px solid var(--agi-ext-border); color: var(--agi-ext-text-muted); border-radius: var(--corner-control); padding: 6px 10px; font-size: var(--type-caption-size); line-height: var(--type-caption-height); cursor: pointer; align-self: flex-end; transition: color var(--duration-instant); }
    .sp-wf-form-cancel-btn:hover { color: var(--agi-ext-text); }
    .sp-wf-form-actions { display: flex; gap: 6px; justify-content: flex-end; }
    .sp-wf-form-error { min-height: 15px; color: var(--agi-ext-danger-text); font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-wf-mutation-status {
      min-height: 18px;
      padding: 0 14px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-wf-mutation-status[data-kind="success"] { color: var(--agi-ext-success-text); }
    .sp-wf-mutation-status[data-kind="error"] { color: var(--agi-ext-danger-text); }
    .sp-wf-create-shortcut-btn { background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); color: var(--agi-ext-accent-text); font-size: var(--type-caption-size); line-height: var(--type-caption-height); padding: 4px 10px; border-radius: var(--corner-control); cursor: pointer; transition: background var(--duration-instant); }
    .sp-wf-create-shortcut-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 22%, transparent); }
    .sp-create-shortcut-overlay { display: none; position: fixed; inset: 0; background: var(--agi-ext-scrim); z-index: var(--z-modal); align-items: center; justify-content: center; }
    .sp-create-shortcut-overlay.open { display: flex; }
    .sp-create-shortcut-modal { background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: var(--corner-menu); padding: 18px 18px 14px; width: 290px; max-width: 95vw; display: flex; flex-direction: column; gap: 12px; box-shadow: var(--agi-ext-elevation-4); }
    .sp-create-shortcut-header { display: flex; align-items: center; justify-content: space-between; }
    .sp-create-shortcut-title { font-size: var(--type-body-size); line-height: var(--type-body-height); font-weight: 600; color: var(--agi-ext-text); }
    .sp-create-shortcut-close { background: none; border: none; color: var(--agi-ext-text-muted); font-size: 16px; cursor: pointer; padding: 0 2px; line-height: 1; transition: color var(--duration-instant); }
    .sp-create-shortcut-close:hover { color: var(--agi-ext-text); }
    .sp-create-shortcut-field { display: flex; flex-direction: column; gap: 4px; }
    .sp-create-shortcut-label { font-size: var(--type-caption-size); line-height: var(--type-caption-height); font-weight: 600; color: var(--agi-ext-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .sp-create-shortcut-input { background: var(--agi-ext-bg); border: 1px solid var(--agi-ext-border); border-radius: var(--corner-control); color: var(--agi-ext-text); font-size: var(--type-caption-size); line-height: var(--type-caption-height); padding: 6px 9px; outline: none; font-family: inherit; transition: border-color var(--duration-quick); width: 100%; box-sizing: border-box; }
    .sp-create-shortcut-input:focus { border-color: var(--agi-ext-focus); }
    .sp-create-shortcut-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-create-shortcut-input::placeholder { color: var(--agi-ext-text-placeholder); }
    .sp-create-shortcut-textarea { background: var(--agi-ext-bg); border: 1px solid var(--agi-ext-border); border-radius: var(--corner-control); color: var(--agi-ext-text); font-size: var(--type-caption-size); padding: 6px 9px; outline: none; font-family: inherit; transition: border-color var(--duration-quick); width: 100%; box-sizing: border-box; resize: none; height: 70px; line-height: var(--type-caption-height); }
    .sp-create-shortcut-textarea:focus { border-color: var(--agi-ext-focus); }
    .sp-create-shortcut-textarea:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-create-shortcut-textarea::placeholder { color: var(--agi-ext-text-placeholder); }
    .sp-create-shortcut-input[aria-invalid='true'], .sp-create-shortcut-textarea[aria-invalid='true'] { border-color: var(--agi-ext-danger); }
    .sp-create-shortcut-hint { color: var(--agi-ext-text-muted); font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-create-shortcut-hint:empty { display: none; }
    .sp-create-shortcut-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 2px; }
    .sp-create-shortcut-cancel { background: none; border: 1px solid var(--agi-ext-border); color: var(--agi-ext-text-muted); border-radius: var(--corner-control); padding: 6px 14px; font-size: var(--type-caption-size); line-height: var(--type-caption-height); cursor: pointer; transition: color var(--duration-instant); }
    .sp-create-shortcut-cancel:hover { color: var(--agi-ext-text); }
    .sp-create-shortcut-save { background: var(--agi-ext-accent); color: var(--agi-ext-on-accent); border: none; border-radius: var(--corner-control); padding: 6px 14px; font-size: var(--type-caption-size); line-height: var(--type-caption-height); cursor: pointer; transition: background var(--duration-instant); }
    .sp-create-shortcut-save:hover { background: var(--agi-ext-accent-hover); }
    .sp-create-shortcut-save:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-wf-group-desc { font-size: var(--type-caption-size); color: var(--agi-ext-text-muted); line-height: var(--type-caption-height); }
    .sp-wf-group-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .sp-wf-group-action-btn { display: flex; align-items: center; gap: 5px; background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: var(--corner-control); color: var(--agi-ext-text-muted); font-size: var(--type-caption-size); line-height: var(--type-caption-height); padding: 5px 11px; cursor: pointer; transition: color var(--duration-quick), border-color var(--duration-quick), background var(--duration-quick); }
    .sp-wf-group-action-btn:hover { color: var(--agi-ext-accent-text); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    .sp-wf-group-action-btn.active { color: var(--agi-ext-success-text); border-color: var(--agi-ext-success-border); background: var(--agi-ext-success-bg); }
    .sp-wf-group-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .sp-wf-record-bar { display: flex; align-items: center; gap: 8px; }
    .sp-wf-record-btn { display: flex; align-items: center; gap: 6px; background: var(--agi-ext-danger); border: none; color: var(--agi-ext-on-danger); font-size: var(--type-caption-size); line-height: var(--type-caption-height); font-weight: 600; padding: 8px 16px; border-radius: var(--corner-field); cursor: pointer; transition: background var(--duration-quick), transform var(--duration-instant); flex-shrink: 0; }
    .sp-wf-record-btn:hover { background: var(--agi-ext-danger-hover); transform: scale(1.02); }
    .sp-wf-record-btn.recording { background: var(--agi-ext-danger-bg); border: 1px solid var(--agi-ext-danger); color: var(--agi-ext-danger-text); animation: sp-record-pulse calc(var(--duration-pulse) * 1.5) infinite; }
    .sp-wf-record-btn.recording:hover { background: var(--agi-ext-danger-bg); }
    @keyframes sp-record-pulse { 0%, 100% { box-shadow: 0 0 0 0 var(--agi-ext-transparent-shadow); }
    50% { box-shadow: 0 0 0 6px var(--agi-ext-danger-shadow); }
    }
    .sp-wf-record-dot { width: 8px; height: 8px; border-radius: var(--corner-pill); background: var(--agi-ext-on-danger); flex-shrink: 0; }
    .sp-wf-record-btn.recording .sp-wf-record-dot { background: var(--agi-ext-danger); animation: sp-pulse var(--duration-pulse) infinite; }
    .sp-wf-action-counter { font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text-muted); flex: 1; }
    .sp-wf-action-counter strong { color: var(--agi-ext-text); }
    .sp-wf-record-status { min-height: 18px; margin-top: 7px; color: var(--agi-ext-text-muted); font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-wf-record-status[data-kind="error"] { color: var(--agi-ext-danger-text); }
    .sp-wf-capture-values { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text-muted); cursor: pointer; }
    .sp-wf-capture-values input { cursor: pointer; }
    .sp-wf-save-dialog { display: none; flex-direction: column; gap: 6px; padding: 10px; background: var(--agi-ext-bg); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); border-radius: var(--corner-field); }
    .sp-wf-save-dialog.open { display: flex; }
    .sp-wf-save-dialog-title { font-size: var(--type-caption-size); line-height: var(--type-caption-height); font-weight: 600; color: var(--agi-ext-accent-text); }
    .sp-wf-count-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; font-size: var(--type-caption-size); line-height: var(--type-caption-height); font-weight: 600; background: color-mix(in srgb, var(--agi-ext-accent) 20%, transparent); color: var(--agi-ext-accent-text); border-radius: var(--corner-field); padding: 0 5px; }
    .sp-model-selector-wrap { position: relative; min-width: 0; }
    #sp-model-selector-btn { display: flex; align-items: center; gap: 4px; background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent); border-radius: var(--corner-control); padding: 3px 8px; color: var(--agi-ext-accent-text); font-size: var(--type-caption-size); line-height: var(--type-caption-height); font-weight: 500; cursor: pointer; transition: background var(--duration-instant), border-color var(--duration-instant); white-space: nowrap; min-width: 0; max-width: 100%; overflow: hidden; }
    #sp-model-selector-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 22%, transparent); border-color: var(--agi-ext-accent); }
    #sp-model-selector-btn:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    #sp-model-dropdown { display: none; position: absolute; top: 100%; left: 0; right: auto; margin-top: 4px; min-width: 200px; max-width: calc(100vw - 24px); max-height: 280px; overflow-y: auto; background: var(--agi-ext-surface); border: 1px solid var(--agi-ext-border); border-radius: var(--corner-field); padding: 4px; z-index: var(--z-popover); box-shadow: var(--agi-ext-elevation-3); }
    #sp-model-dropdown.open { display: block; }
    .sp-model-option { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 9px; border: 0; border-radius: var(--corner-control); cursor: pointer; background: transparent; transition: background var(--duration-instant); font: inherit; font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text-muted); text-align: left; }
    .sp-model-option:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-model-option.selected { color: var(--agi-ext-accent-text); background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent); }
    .sp-model-option-check { width: 14px; text-align: center; font-size: var(--type-caption-size); flex-shrink: 0; }
    .sp-model-option-label { flex: 1; }

    /* ── Enhanced model picker ── */
    .sp-model-option-logo {
      width: 16px;
      height: 16px;
      border-radius: var(--corner-compact);
      flex-shrink: 0;
      object-fit: contain;
      display: block;
    }
    .sp-model-option-logo-placeholder {
      width: 16px;
      height: 16px;
      border-radius: var(--corner-compact);
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
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      color: inherit;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sp-model-option-sublabel {
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      color: var(--agi-ext-text-muted);
      white-space: nowrap;
    }
    .sp-model-option.selected .sp-model-option-sublabel { color: var(--agi-ext-accent-text); opacity: 0.7; }
    .sp-model-option-auto .sp-model-option-sublabel { white-space: normal; }
    .sp-model-option:hover .sp-model-option-sublabel { color: var(--agi-ext-text-muted); }

    /* ── Free-tier model gating: Upgrade badge on premium models ── */
    .sp-model-option-lock {
      padding: 1px 6px;
      border-radius: var(--corner-control);
      background: var(--agi-ext-overlay);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      flex-shrink: 0;
      white-space: nowrap;
    }
    .sp-model-upgrade-tag {
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--agi-ext-on-accent);
      background: var(--agi-ext-accent);
      border-radius: var(--corner-compact);
      padding: 1px 5px;
      flex-shrink: 0;
      white-space: nowrap;
    }

    .sp-model-option-auto {
      border-bottom: 1px solid var(--agi-ext-border);
      margin-bottom: 4px;
      padding-bottom: 10px;
    }
    .sp-model-option-auto .sp-model-option-name {
      font-weight: 600;
      color: var(--agi-ext-accent-text);
    }
    .sp-model-option-auto:hover .sp-model-option-name { color: var(--agi-ext-accent-text); opacity: 0.85; }
    .sp-model-auto-dot {
      width: 16px;
      height: 16px;
      border-radius: var(--corner-pill);
      background: linear-gradient(135deg, var(--agi-ext-accent), var(--agi-ext-accent-secondary));
      flex-shrink: 0;
    }

    .sp-model-group-header {
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
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
      z-index: var(--z-drawer-backdrop);
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
      transition: transform var(--duration-quick) var(--curve-standard);
      z-index: var(--z-drawer);
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
      font-size: var(--type-body-size);
      line-height: var(--type-body-height);
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
      border-radius: var(--corner-compact);
      transition: color var(--duration-instant), background var(--duration-instant);
    }
    #sp-drawer-close:hover { color: var(--agi-ext-text); background: var(--agi-ext-hover); }
    #sp-drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 0 0 8px;
    }
    #sp-drawer-body::-webkit-scrollbar { width: 4px; }
    #sp-drawer-body::-webkit-scrollbar-track { background: transparent; }
    #sp-drawer-body::-webkit-scrollbar-thumb { background: var(--agi-ext-border); border-radius: var(--corner-compact); }
    /* Drawer sections */
    .sp-drawer-section {
      padding: 12px 14px;
      border-bottom: 1px solid var(--agi-ext-border);
    }
    .sp-drawer-section-title {
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
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
      border-radius: var(--corner-field);
      padding: 10px 12px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 500;
      cursor: pointer;
      transition: color var(--duration-quick), border-color var(--duration-quick), background var(--duration-quick);
      text-align: left;
      margin-bottom: 6px;
    }
    .sp-drawer-launcher-btn:last-child { margin-bottom: 0; }
    .sp-drawer-launcher-btn:hover { color: var(--agi-ext-accent-text); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    .sp-drawer-launcher-icon { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--corner-control); background: var(--agi-ext-hover); }
    .sp-drawer-launcher-label { flex: 1; }
    .sp-drawer-launcher-desc { font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text-muted); margin-top: 1px; font-weight: 400; }
    .sp-help-shortcuts {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 6px 12px;
      margin: 0 0 10px;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-help-shortcuts dt { color: var(--agi-ext-text); }
    .sp-help-shortcuts dd { margin: 0; color: var(--agi-ext-text-muted); }
    .sp-help-shortcuts kbd {
      padding: 1px 6px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-compact);
      background: var(--agi-ext-surface);
      font-family: var(--type-code-family);
      font-size: var(--type-caption-size);
      white-space: nowrap;
    }
    .sp-drawer-launcher-chevron { font-size: var(--type-caption-size); color: var(--agi-ext-text-muted); flex-shrink: 0; }
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
      border-radius: var(--corner-control);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      padding: 6px 11px;
      cursor: pointer;
      transition: color var(--duration-quick), border-color var(--duration-quick), background var(--duration-quick);
      flex-shrink: 0;
    }
    .sp-drawer-tool-btn:hover { color: var(--agi-ext-accent-text); border-color: var(--agi-ext-accent); background: color-mix(in srgb, var(--agi-ext-accent) 8%, transparent); }
    .sp-drawer-tool-btn.active { color: var(--agi-ext-success-text); border-color: var(--agi-ext-success-border); background: var(--agi-ext-success-bg); }
    .sp-drawer-tool-btn:disabled { opacity: 0.5; cursor: wait; }
    /* History sub-list inside the drawer.
       CSP note (style-src 'self'): these rules used to be applied via
       element.style.cssText at runtime, which Chrome blocks on extension
       pages with a strict style-src, keep them here in the stylesheet. */
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
      border-radius: var(--corner-control);
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text);
      font: inherit;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    #sp-drawer-history-search::placeholder { color: var(--agi-ext-text-placeholder); }
    #sp-drawer-history-search:focus {
      border-color: var(--agi-ext-accent);
      outline: 2px solid color-mix(in srgb, var(--agi-ext-focus) 45%, transparent);
      outline-offset: 1px;
    }
    #sp-drawer-history-search[hidden] { display: none; }
    .sp-drawer-history-error {
      margin-top: 6px;
      color: var(--agi-ext-danger-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-drawer-history-empty { font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text-muted); padding: 4px 2px; }
    .sp-drawer-history-item {
      display: flex;
      align-items: center;
      gap: 2px;
      border-radius: var(--corner-control);
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
    }
    .sp-drawer-history-open {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      padding: 6px 8px;
      border: none;
      border-radius: var(--corner-compact);
      background: transparent;
      cursor: pointer;
      width: 100%;
      text-align: left;
      font: inherit;
      color: inherit;
    }
    .sp-drawer-history-open:hover { background: var(--agi-ext-hover); }
    .sp-drawer-history-open:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
    .sp-drawer-history-open:disabled:hover { background: transparent; }
    .sp-drawer-history-text { flex: 1; min-width: 0; }
    .sp-drawer-history-title {
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      color: var(--agi-ext-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sp-drawer-history-date { font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text-muted); margin-top: 1px; }
    .sp-drawer-history-item { position: relative; flex-wrap: wrap; }
    .sp-drawer-history-open[hidden] { display: none; }
    .sp-drawer-history-more-wrap { position: relative; flex-shrink: 0; margin-right: 4px; }
    .sp-drawer-history-more-wrap[hidden] { display: none; }
    .sp-drawer-history-more {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--control-sm);
      height: var(--control-sm);
      border: none;
      border-radius: var(--corner-control);
      background: none;
      color: var(--agi-ext-text-muted);
      cursor: pointer;
    }
    .sp-drawer-history-more:hover,
    .sp-drawer-history-more[aria-expanded='true'] { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-history-menu {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      z-index: var(--z-dropdown);
      display: flex;
      flex-direction: column;
      min-width: 168px;
      padding: 4px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-menu);
      background: var(--agi-ext-surface);
      box-shadow: var(--agi-ext-elevation-3);
    }
    .sp-history-menu[hidden] { display: none; }
    .sp-history-menu-item {
      min-height: var(--control-md);
      padding: 6px 10px;
      border: none;
      border-radius: var(--corner-control);
      background: none;
      color: var(--agi-ext-text);
      cursor: pointer;
      font: inherit;
      font-size: var(--type-body-size);
      line-height: var(--type-body-height);
      text-align: left;
    }
    .sp-history-menu-item:hover,
    .sp-history-menu-item:focus-visible { background: var(--agi-ext-hover); }
    .sp-history-menu-item.is-danger { color: var(--agi-ext-danger-text); }
    .sp-drawer-history-edit { display: flex; flex: 1 1 100%; align-items: center; gap: 6px; padding: 6px 8px; }
    .sp-drawer-history-edit-input {
      flex: 1;
      min-width: 0;
      min-height: var(--control-md);
      padding: 4px 8px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      background: var(--agi-ext-bg);
      color: var(--agi-ext-text);
      font: inherit;
      font-size: var(--type-body-size);
    }
    .sp-drawer-history-edit-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 1px; }
    .sp-drawer-history-edit-btn {
      flex-shrink: 0;
      min-height: var(--control-md);
      padding: 4px 10px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      background: transparent;
      color: var(--agi-ext-text);
      cursor: pointer;
      font: inherit;
      font-size: var(--type-label-size);
      line-height: var(--type-label-height);
    }
    .sp-drawer-history-edit-btn.is-primary { border-color: var(--agi-ext-accent); background: var(--agi-ext-accent); color: var(--agi-ext-on-accent); }
    .sp-drawer-history-edit-btn.is-danger { border-color: var(--agi-ext-danger); background: var(--agi-ext-danger); color: var(--agi-ext-on-danger); }
    .sp-drawer-history-edit-btn:disabled { cursor: wait; opacity: 0.55; }
    .sp-drawer-history-confirm { flex: 1 1 100%; padding: 0 8px 4px; }
    .sp-drawer-history-share-text {
      margin: 0;
      padding: 6px 0 0;
      color: var(--agi-ext-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-drawer-history-confirm-text {
      margin: 0;
      padding: 6px 0 0;
      color: var(--agi-ext-danger-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    #sp-recents-archived {
      min-height: var(--control-md);
      padding: 4px 10px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-field);
      background: transparent;
      color: var(--agi-ext-text-muted);
      cursor: pointer;
      font: inherit;
      font-size: var(--type-label-size);
      line-height: var(--type-label-height);
    }
    #sp-recents-archived[hidden] { display: none; }
    #sp-recents-archived[aria-pressed='true'] { border-color: var(--agi-ext-accent); color: var(--agi-ext-text); }
    /* Connection / pairing */
    .sp-drawer-pairing-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .sp-drawer-pairing-label { font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text-muted); }
    .sp-drawer-pairing-fingerprint {
      font-size: var(--type-code-size);
      font-family: var(--type-code-family);
      color: var(--agi-ext-success-text);
      background: var(--agi-ext-success-bg);
      border: 1px solid var(--agi-ext-success-border);
      border-radius: var(--corner-compact);
      padding: 1px 6px;
    }
    .sp-drawer-pairing-error {
      font-size: var(--type-caption-size); line-height: var(--type-caption-height);
      color: var(--agi-ext-danger-text);
      min-height: 16px;
      margin-bottom: 6px;
    }
    .sp-drawer-pairing-code-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 8px;
    }
    .sp-drawer-pairing-code-row[hidden] { display: none; }
    .sp-drawer-pairing-hint { font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text-muted); }
    .sp-drawer-pairing-code-input {
      font-family: var(--type-code-family);
      font-size: var(--type-title-size);
      line-height: var(--type-title-height);
      letter-spacing: 0.18em;
      text-transform: uppercase;
      padding: 6px 8px;
      border-radius: var(--corner-control);
      border: 1px solid var(--agi-ext-border);
      background: var(--agi-ext-surface);
      color: var(--agi-ext-text);
    }
    .sp-drawer-btn-row { display: flex; gap: 6px; }
    .sp-drawer-btn {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      padding: 5px 12px;
      cursor: pointer;
      transition: color var(--duration-quick), border-color var(--duration-quick), background var(--duration-quick);
    }
    .sp-drawer-btn:hover { color: var(--agi-ext-accent-text); border-color: var(--agi-ext-accent); }
    .sp-drawer-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .sp-drawer-btn-primary { background: var(--agi-ext-accent); color: var(--agi-ext-on-accent); border-color: var(--agi-ext-accent); }
    .sp-drawer-btn-primary:hover { background: var(--agi-ext-accent-hover); color: var(--agi-ext-on-accent); border-color: var(--agi-ext-accent); }
    .sp-drawer-btn-danger { color: var(--agi-ext-danger-text); border-color: var(--agi-ext-danger-border); }
    .sp-drawer-btn-danger:hover { background: var(--agi-ext-danger-bg); color: var(--agi-ext-danger-text); border-color: var(--agi-ext-danger-border); }
    /* Allowlist */
    .sp-drawer-allowlist-help { font-size: var(--type-caption-size); color: var(--agi-ext-text-muted); line-height: var(--type-caption-height); margin-bottom: 8px; }
    .sp-drawer-allowlist-current-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .sp-drawer-allowlist-origin {
      flex: 1;
      font-size: var(--type-code-size);
      line-height: var(--type-code-height);
      font-family: var(--type-code-family);
      color: var(--agi-ext-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sp-drawer-allowlist-toggle-btn {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      padding: 3px 10px;
      cursor: pointer;
      flex-shrink: 0;
      transition: color var(--duration-instant), border-color var(--duration-instant), background var(--duration-instant);
    }
    .sp-drawer-allowlist-toggle-btn:hover { color: var(--agi-ext-accent-text); border-color: var(--agi-ext-accent); }
    .sp-drawer-allowlist-toggle-btn.is-remove { color: var(--agi-ext-danger-text); border-color: var(--agi-ext-danger-border); }
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
      border-radius: var(--corner-control);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-drawer-allowlist-item.is-current { border-color: var(--agi-ext-accent); }
    .sp-drawer-allowlist-item-origin {
      flex: 1;
      font-family: var(--type-code-family);
      color: var(--agi-ext-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sp-drawer-allowlist-item-remove {
      background: none;
      border: none;
      color: var(--agi-ext-danger-text);
      font-size: var(--type-caption-size);
      cursor: pointer;
      padding: 1px 5px;
      border-radius: var(--corner-compact);
      transition: color var(--duration-instant), background var(--duration-instant);
      flex-shrink: 0;
    }
    .sp-drawer-allowlist-item-remove:hover { color: var(--agi-ext-danger-text); background: var(--agi-ext-danger-bg); }
    .sp-drawer-allowlist-empty { font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text-muted); padding: 4px 0; }
    .sp-drawer-allowlist-status { font-size: var(--type-caption-size); color: var(--agi-ext-danger-text); line-height: var(--type-caption-height); padding: 4px 0; }
    .sp-drawer-allowlist-status[hidden] { display: none; }
    /* Memory */
    .sp-drawer-memory-help { font-size: var(--type-caption-size); color: var(--agi-ext-text-muted); line-height: var(--type-caption-height); margin-bottom: 8px; }
    .sp-drawer-memory-add-btn {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      padding: 5px 12px;
      cursor: pointer;
      transition: color var(--duration-instant), border-color var(--duration-instant);
      margin-bottom: 8px;
    }
    .sp-drawer-memory-add-btn:hover { color: var(--agi-ext-accent-text); border-color: var(--agi-ext-accent); }
    .sp-drawer-memory-editor { display: none; flex-direction: column; gap: 6px; margin-bottom: 8px; }
    .sp-drawer-memory-editor.open { display: flex; }
    .sp-drawer-memory-textarea {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      color: var(--agi-ext-text);
      font-size: var(--type-caption-size);
      padding: 6px 9px;
      outline: none;
      font-family: inherit;
      resize: none;
      height: 64px;
      line-height: var(--type-caption-height);
      width: 100%;
      box-sizing: border-box;
    }
    .sp-drawer-memory-textarea:focus { border-color: var(--agi-ext-focus); }
    .sp-drawer-memory-textarea::placeholder { color: var(--agi-ext-text-placeholder); }
    .sp-drawer-memory-editor-actions { display: flex; gap: 6px; justify-content: flex-end; }
    .sp-drawer-memory-list { list-style: none; display: flex; flex-direction: column; gap: 5px; }
    .sp-drawer-memory-item {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      padding: 7px 10px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .sp-drawer-memory-item-content { font-size: var(--type-caption-size); color: var(--agi-ext-text); line-height: var(--type-caption-height); }
    .sp-drawer-memory-item-meta { font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text-muted); }
    .sp-drawer-memory-item-row { display: flex; gap: 5px; margin-top: 2px; }
    .sp-drawer-memory-item-edit-btn {
      background: none; border: 1px solid var(--agi-ext-border); border-radius: var(--corner-compact);
      color: var(--agi-ext-text-muted); font-size: var(--type-caption-size); line-height: var(--type-caption-height); padding: 2px 6px; cursor: pointer;
      transition: color var(--duration-instant), border-color var(--duration-instant);
    }
    .sp-drawer-memory-item-edit-btn:hover { color: var(--agi-ext-accent-text); border-color: var(--agi-ext-accent); }
    .sp-drawer-memory-item-delete-btn {
      background: none; border: 1px solid var(--agi-ext-danger-border); border-radius: var(--corner-compact);
      color: var(--agi-ext-danger-text); font-size: var(--type-caption-size); line-height: var(--type-caption-height); padding: 2px 6px; cursor: pointer;
      transition: color var(--duration-instant), border-color var(--duration-instant), background var(--duration-instant);
    }
    .sp-drawer-memory-item-delete-btn:hover { color: var(--agi-ext-danger-text); border-color: var(--agi-ext-danger-border); background: var(--agi-ext-danger-bg); }
    .sp-drawer-memory-item-delete-btn.is-confirm { color: var(--agi-ext-on-danger); background: var(--agi-ext-danger); border-color: var(--agi-ext-danger); }
    .sp-drawer-memory-item-textarea {
      background: var(--agi-ext-bg);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      color: var(--agi-ext-text);
      font-size: var(--type-caption-size);
      padding: 5px 7px;
      outline: none;
      font-family: inherit;
      resize: none;
      height: 52px;
      line-height: var(--type-caption-height);
      width: 100%;
      box-sizing: border-box;
    }
    .sp-drawer-memory-item-textarea:focus { border-color: var(--agi-ext-focus); }
    .sp-drawer-memory-empty { font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text-muted); padding: 4px 0; }
    .sp-drawer-memory-item-link { color: var(--agi-ext-accent-text); text-decoration: underline; text-underline-offset: 2px; }
    .sp-drawer-memory-block { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--agi-ext-border); }
    .sp-drawer-memory-subtitle { margin: 0; color: var(--agi-ext-text); font-size: var(--type-label-size); font-weight: 600; line-height: var(--type-label-height); }
    .sp-drawer-memory-block .sp-drawer-memory-help { margin-bottom: 0; }
    .sp-drawer-memory-exclusion-form { display: flex; gap: 6px; }
    .sp-drawer-memory-exclusion-input {
      flex: 1;
      min-width: 0;
      min-height: 28px;
      padding: 4px 8px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      background: var(--agi-ext-bg);
      color: var(--agi-ext-text);
      font: inherit;
      font-size: var(--type-caption-size);
    }
    .sp-drawer-memory-exclusion-input::placeholder { color: var(--agi-ext-text-placeholder); }
    .sp-drawer-memory-exclusion-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-drawer-memory-exclusions { display: flex; flex-wrap: wrap; gap: 5px; margin: 0; padding: 0; list-style: none; }
    .sp-drawer-memory-exclusion {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 4px 2px 9px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-pill);
      color: var(--agi-ext-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-drawer-memory-exclusion-remove {
      display: grid;
      width: 24px;
      height: 24px;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: var(--corner-pill);
      background: transparent;
      color: var(--agi-ext-text-muted);
      cursor: pointer;
    }
    .sp-drawer-memory-exclusion-remove:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-drawer-memory-exclusion-remove:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 1px; }
    .sp-drawer-memory-status { font-size: var(--type-caption-size); color: var(--agi-ext-text-muted); line-height: var(--type-caption-height); padding: 4px 0; }
    .sp-drawer-memory-retry-btn {
      align-self: flex-start;
      margin-top: 4px;
      padding: 4px 8px;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      color: var(--agi-ext-text);
      background: transparent;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      cursor: pointer;
    }
    .sp-drawer-memory-retry-btn:hover { color: var(--agi-ext-accent-text); border-color: var(--agi-ext-accent); }

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
    .sp-drawer-toggle-label { font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-text-muted); }
    .sp-drawer-toggle-switch {
      appearance: none;
      width: var(--control-lg);
      height: 18px;
      border-radius: var(--corner-field);
      background: var(--agi-ext-hover);
      position: relative;
      cursor: pointer;
      transition: background var(--duration-quick);
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
      border-radius: var(--corner-pill);
      background: var(--agi-ext-toggle-knob);
      /* Definition ring. The OFF track is --agi-ext-hover, which is #f0f0f0 in
         the light theme, a plain white knob on it was ~1.05:1 and the OFF
         state read as an empty pill. An outset ring costs no layout and
         reads on both grounds. */
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.28), 0 1px 2px rgba(0, 0, 0, 0.28);
      top: 2.5px;
      left: 2.5px;
      transition: transform var(--duration-quick);
    }
    .sp-drawer-toggle-switch:checked::after { transform: translateX(16px); }
    .sp-drawer-toggle-status {
      min-height: 15px;
      margin-top: 5px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-drawer-toggle-status[data-kind="error"] { color: var(--agi-ext-danger-text); }
    /* Bridge URL inside drawer */
    .sp-drawer-bridge-row { display: flex; gap: 6px; margin-top: 4px; }
    .sp-drawer-bridge-input {
      flex: 1;
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      color: var(--agi-ext-text);
      font-size: var(--type-code-size);
      line-height: var(--type-code-height);
      padding: 5px 8px;
      outline: none;
      font-family: var(--type-code-family);
      transition: border-color var(--duration-quick);
      min-width: 0;
    }
    .sp-drawer-bridge-input:focus { border-color: var(--agi-ext-focus); }
    .sp-drawer-bridge-input::placeholder { color: var(--agi-ext-text-placeholder); }
    .sp-drawer-bridge-error { font-size: var(--type-caption-size); line-height: var(--type-caption-height); color: var(--agi-ext-danger-text); padding: 2px 0; margin-top: 2px; }
    /* Cloud unlock */
    .sp-drawer-cloud-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent);
      border-radius: var(--corner-control);
      color: var(--agi-ext-accent-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 500;
      padding: 8px 14px;
      cursor: pointer;
      transition: background var(--duration-quick), border-color var(--duration-quick);
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
      border-radius: var(--corner-pill);
      background: color-mix(in srgb, var(--agi-ext-accent) 20%, transparent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 35%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 700;
      color: var(--agi-ext-accent-text);
      flex-shrink: 0;
    }
    .sp-cloud-user-info {
      flex: 1;
      min-width: 0;
    }
    .sp-cloud-user-label {
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 600;
      color: var(--agi-ext-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sp-cloud-user-tier {
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      color: var(--agi-ext-text-muted);
    }
    .sp-cloud-name-edit {
      padding: 0;
      border: none;
      background: none;
      color: var(--agi-ext-accent-text);
      font: inherit;
      font-size: var(--type-caption-size);
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;
    }
    .sp-cloud-name-edit[hidden],
    .sp-cloud-name-editor[hidden] { display: none; }
    .sp-cloud-name-editor { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
    .sp-cloud-name-actions { display: flex; gap: 6px; }
    .sp-cloud-signout-btn {
      background: transparent;
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: var(--corner-control);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      padding: 3px 7px;
      cursor: pointer;
      flex-shrink: 0;
      transition: color var(--duration-quick), border-color var(--duration-quick);
    }
    .sp-cloud-signout-btn:hover { color: var(--agi-ext-danger-text); border-color: var(--agi-ext-danger); }
    .sp-cloud-signout-status {
      width: 100%;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      color: var(--agi-ext-danger-text);
    }
    .sp-cloud-signout-status:empty { display: none; }

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
      font-size: var(--type-caption-size); line-height: var(--type-caption-height);
      color: var(--agi-ext-text-muted);
    }
    .sp-quota-bar-model {
      font-size: var(--type-caption-size); line-height: var(--type-caption-height);
      color: var(--agi-ext-text-muted);
    }
    .sp-quota-bar-bg {
      height: 4px;
      border-radius: var(--corner-detail);
      background: var(--agi-ext-border);
      overflow: hidden;
    }
    .sp-quota-bar-fill {
      height: 100%;
      border-radius: var(--corner-detail);
      background: var(--agi-ext-accent);
      transition: width var(--duration-moved) var(--curve-standard);
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
    .sp-quota-exhausted-label { color: var(--agi-ext-danger-text); font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-quota-upgrade-btn {
      font-size: var(--type-label-size); line-height: var(--type-label-height);
      font-weight: 600;
      color: var(--agi-ext-accent-text);
      background: color-mix(in srgb, var(--agi-ext-accent) 10%, transparent);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 25%, transparent);
      border-radius: var(--corner-control);
      padding: 3px 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: background var(--duration-instant);
    }
    .sp-quota-upgrade-btn:hover { background: color-mix(in srgb, var(--agi-ext-accent) 18%, transparent); }
    .sp-quota-windows {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sp-quota-windows:empty { display: none; }
    .sp-quota-window {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .sp-quota-window-value {
      color: var(--agi-ext-text);
      font-variant-numeric: tabular-nums;
      text-align: right;
    }
    .sp-quota-window-reset {
      font-size: var(--type-caption-size); line-height: var(--type-caption-height);
      color: var(--agi-ext-text-muted);
    }
    .sp-quota-bar-fill.warning { background: var(--agi-ext-warning); }
    .sp-quota-notice {
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      color: var(--agi-ext-text);
    }
    .sp-quota-notice:empty { display: none; }
    .sp-quota-notice[data-severity='warning'] { color: var(--agi-ext-warning-text); }
    .sp-quota-notice[data-severity='critical'] { color: var(--agi-ext-danger-text); }
    .sp-quota-models {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .sp-quota-models:empty { display: none; }
    .sp-quota-models-heading {
      font-size: var(--type-label-size); line-height: var(--type-label-height);
      font-weight: 600;
      color: var(--agi-ext-text);
    }
    .sp-plan-compare > summary {
      font-size: var(--type-label-size); line-height: var(--type-label-height);
      font-weight: 600;
      color: var(--agi-ext-text);
      cursor: pointer;
    }
    .sp-plan-compare-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 6px;
    }
    .sp-plan-compare-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-plan-compare-name {
      font-weight: 600;
      color: var(--agi-ext-text);
    }
    .sp-plan-compare-detail {
      color: var(--agi-ext-text-muted);
    }
    .sp-cloud-link-hint {
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-cloud-link-row {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .sp-cloud-link-btn {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-control);
      color: var(--agi-ext-text-muted);
      cursor: pointer;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      padding: 4px 7px;
    }
    .sp-cloud-link-btn:hover {
      border-color: var(--agi-ext-accent);
      color: var(--agi-ext-accent-text);
    }

    /* Sign-in prompt (when not signed in) */
    .sp-cloud-signin-prompt {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sp-cloud-signin-desc {
      font-size: var(--type-caption-size);
      color: var(--agi-ext-text-muted);
      line-height: var(--type-caption-height);
    }
    .sp-cloud-signin-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      background: var(--agi-ext-accent);
      border: none;
      border-radius: var(--corner-control);
      color: var(--agi-ext-on-accent);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 600;
      padding: 8px 14px;
      cursor: pointer;
      transition: opacity var(--duration-quick);
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
      border-radius: var(--corner-control);
      color: var(--agi-ext-text);
      font-size: var(--type-code-size);
      line-height: var(--type-code-height);
      font-family: var(--type-code-family);
      padding: 5px 8px;
      outline: none;
      min-width: 0;
      transition: border-color var(--duration-quick);
    }
    .sp-cloud-token-input:focus { border-color: var(--agi-ext-focus); }
    .sp-cloud-token-input::placeholder { color: var(--agi-ext-text-placeholder); }
    .sp-cloud-token-save-btn {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: var(--corner-control);
      color: var(--agi-ext-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 600;
      padding: 5px 9px;
      cursor: pointer;
      flex-shrink: 0;
      transition: background var(--duration-instant);
    }
    .sp-cloud-token-save-btn:hover { background: var(--agi-ext-hover); }
    .sp-cloud-token-hint {
      font-size: var(--type-caption-size);
      color: var(--agi-ext-text-muted);
      line-height: var(--type-caption-height);
    }

    /* Quota badge in the chat header */
    #sp-quota-badge {
      display: none;
      align-items: center;
      gap: 4px;
      font-size: var(--type-label-size); line-height: var(--type-label-height);
      font-weight: 600;
      border-radius: var(--corner-pill);
      padding: 2px 7px;
      white-space: nowrap;
      cursor: pointer;
      transition: opacity var(--duration-quick);
         renders as a badge. */
      border: none;
      background: none;
      font-family: inherit;
      color: inherit;
    }
    #sp-quota-badge.visible { display: flex; }
    #sp-quota-badge.has-prompts {
      background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
      color: var(--agi-ext-accent-text);
      border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 28%, transparent);
    }
    #sp-quota-badge.exhausted {
      background: var(--agi-ext-danger-bg);
      color: var(--agi-ext-danger-text);
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
    .sp-drawer-about-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      color: var(--agi-ext-text-muted);
      gap: 4px;
    }
    .sp-drawer-about-url {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 140px;
      font-family: var(--type-code-family);
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
      z-index: var(--z-modal);
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
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      padding: 4px 8px;
      border-radius: var(--corner-control);
      transition: color var(--duration-quick), background var(--duration-quick);
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
      font-size: var(--type-title-size);
      line-height: var(--type-title-height);
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
      border-radius: var(--corner-menu);
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
    .sp-ob-row-icon.danger { color: var(--agi-ext-danger-text); }
    .sp-ob-row-text {
      font-size: var(--type-caption-size);
      color: var(--agi-ext-text-muted);
      line-height: var(--type-caption-height);
    }
    .sp-ob-row-text.danger { color: var(--agi-ext-danger-text); }
    .sp-ob-learn-more {
      color: var(--agi-ext-accent-text);
      text-decoration: underline;
      cursor: pointer;
      background: none;
      border: none;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      padding: 0;
      display: inline;
      font-family: inherit;
    }
    .sp-ob-learn-more:hover { opacity: 0.8; }
    .sp-ob-learn-more:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

    /* Steps 2-5 body text */
    .sp-ob-body {
      font-size: var(--type-caption-size);
      color: var(--agi-ext-text-muted);
      line-height: var(--type-caption-height);
      text-align: center;
      max-width: 300px;
      flex-shrink: 0;
    }
    .sp-ob-body:empty { display: none; }
    .sp-drawer-memory-preferences { display: flex; flex-direction: column; gap: 6px; margin: 4px 0 8px; }
    .sp-drawer-memory-preferences[hidden] { display: none; }
    .sp-drawer-personalization { display: flex; flex-direction: column; gap: 6px; margin: 4px 0 8px; }
    .sp-drawer-personalization[hidden] { display: none; }
    .sp-drawer-memory-preference {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--agi-ext-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-drawer-memory-preference input { flex-shrink: 0; margin: 0; accent-color: var(--agi-ext-accent); }
    .sp-drawer-memory-preference input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-ob-action {
      min-height: var(--control-lg);
      padding: 6px 16px;
      border: none;
      border-radius: var(--corner-field);
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      cursor: pointer;
      font: inherit;
      font-size: var(--type-caption-size);
      font-weight: 600;
    }
    .sp-ob-action[hidden],
    .sp-ob-field[hidden] { display: none; }
    .sp-ob-field { display: flex; flex-direction: column; gap: 6px; width: min(300px, 100%); }
    .sp-ob-label { color: var(--agi-ext-text); font-size: var(--type-caption-size); font-weight: 600; line-height: var(--type-caption-height); }
    .sp-ob-input {
      box-sizing: border-box;
      width: 100%;
      min-height: var(--control-lg);
      padding: 6px 10px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-field);
      background: var(--agi-ext-bg);
      color: var(--agi-ext-text);
      font: inherit;
      font-size: var(--type-body-size);
    }
    .sp-ob-input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 1px; }
    .sp-ob-choices { display: flex; flex-direction: column; gap: 6px; width: min(300px, 100%); max-height: 220px; overflow-y: auto; }
    .sp-ob-check {
      display: flex;
      align-items: center;
      gap: 8px;
      width: min(300px, 100%);
      color: var(--agi-ext-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      text-align: left;
    }
    .sp-ob-check input { flex-shrink: 0; margin: 0; accent-color: var(--agi-ext-accent); }
    .sp-ob-check input:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-ob-error {
      margin: 0 0 8px;
      color: var(--agi-ext-danger-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      text-align: center;
    }
    .sp-ob-error[hidden] { display: none; }
    @media (pointer: coarse) {
      .sp-ob-check { min-height: 44px; }
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
      border-radius: var(--corner-pill);
      background: var(--agi-ext-border-strong);
      transition: background var(--duration-quick), width var(--duration-quick);
    }
    .sp-ob-dot.active {
      width: 18px;
      border-radius: var(--corner-compact);
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
      border-radius: var(--corner-field);
      border: 1px solid var(--agi-ext-border-strong);
      background: transparent;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      cursor: pointer;
      transition: background var(--duration-instant), color var(--duration-instant);
      font-family: inherit;
    }
    .sp-ob-btn-back:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-ob-btn-back:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-ob-btn-back[hidden] { display: none; }

    .sp-ob-btn-next {
      flex: 2;
      padding: 8px 14px;
      border-radius: var(--corner-field);
      border: none;
      background: var(--agi-ext-accent);
      color: var(--agi-ext-on-accent);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 600;
      cursor: pointer;
      transition: background var(--duration-instant);
      font-family: inherit;
    }
    .sp-ob-btn-next:hover { background: var(--agi-ext-accent-hover); }
    .sp-ob-btn-next:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }

    /* ── 2026-08 browser-surface polish ───────────────────────────────────
       Chrome's side panel is a narrow, long-lived surface. Keep its hierarchy
       calm: one quiet header, a spacious transcript, and one rounded composer.
       Trust state remains visible, but secondary controls no longer compete
       with the message field. */
    body {
      color-scheme: dark;
      letter-spacing: -0.005em;
    }
    @media (prefers-color-scheme: light) {
      body { color-scheme: light; }
    }
    #sp-header {
      min-height: 48px;
      padding: 8px 10px 8px 12px;
      background: var(--agi-ext-bg);
      border-bottom-color: color-mix(in srgb, var(--agi-ext-border) 70%, transparent);
    }
    #sp-header-right { flex: 0 0 auto; }
    .sp-icon-btn {
      width: var(--control-md);
      height: var(--control-md);
      border-radius: var(--corner-menu);
    }
    #sp-model-selector-btn {
      min-height: var(--control-sm);
      padding: 5px 7px;
      border: 0;
      border-radius: var(--corner-field);
      background: transparent;
      color: var(--agi-ext-text-muted);
    }
    #sp-model-selector-btn:hover,
    #sp-model-selector-btn.open {
      border-color: transparent;
      background: var(--agi-ext-hover);
      color: var(--agi-ext-text);
    }
    #sp-model-badge {
      max-width: 118px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: inherit;
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      font-weight: 500;
    }

    #sp-messages {
      padding: 18px max(14px, calc((100% - var(--sp-reading-column)) / 2)) 10px;
      gap: 18px;
    }
    #sp-empty {
      padding: 52px 22px 28px;
      gap: 11px;
    }
    #sp-empty-icon {
      display: flex;
      width: 56px;
      height: 56px;
      margin-bottom: 8px;
      color: var(--agi-ext-text-muted);
      opacity: 0.58;
    }
    .sp-msg { max-width: 92%; gap: 5px; }
    .sp-msg-assistant { max-width: 100%; }
    .sp-bubble {
      padding: 9px 12px;
      border-radius: var(--corner-panel);
      font-size: var(--type-prose-size);
      line-height: var(--type-prose-height);
    }
    .sp-bubble-user {
      background: var(--agi-ext-overlay);
      border: 1px solid color-mix(in srgb, var(--agi-ext-border) 76%, transparent);
      border-bottom-right-radius: var(--corner-panel);
    }
    .sp-bubble-assistant {
      padding: 4px 2px;
      border: 0;
      border-radius: 0;
      background: transparent;
    }

    #sp-input-area {
      padding: 6px max(10px, calc((100% - var(--sp-reading-column)) / 2)) 8px;
      border-top: 0;
      background: var(--agi-ext-bg);
    }
    #sp-composer-shell {
      min-height: 84px;
      padding: 10px 10px 6px;
      gap: 6px;
      border-color: var(--agi-ext-border-strong);
      border-radius: var(--corner-panel);
      background: var(--agi-ext-surface);
      box-shadow: none;
    }
    #sp-composer-shell:has(#sp-input:focus) {
      border-color: color-mix(in srgb, var(--agi-ext-accent) 55%, var(--agi-ext-border));
      box-shadow: none;
    }
    #sp-input-row { align-items: stretch; }
    #sp-input {
      min-height: 40px;
      padding: 2px 4px 4px;
      font-size: var(--type-body-large-size);
      line-height: var(--type-body-large-height);
    }
    #sp-composer-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      overflow: visible;
      padding: 0;
    }
    .sp-composer-controls-start,
    .sp-composer-controls-end {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }
    .sp-composer-controls-start { flex: 1 1 auto; }
    .sp-composer-controls-end { flex: 0 0 auto; }
    .sp-attach-btn,
    #sp-mic-btn {
      width: var(--control-md);
      height: var(--control-md);
      padding: 0;
      border: 0;
      border-radius: var(--corner-menu);
      background: transparent;
      color: var(--agi-ext-text-muted);
      justify-content: center;
    }
    .sp-attach-btn:hover,
    #sp-mic-btn:hover {
      border-color: transparent;
      background: var(--agi-ext-hover);
      color: var(--agi-ext-text);
    }
    .sp-autonomy-control { position: relative; }
    .sp-autonomy-chip {
      position: relative;
      height: 20px;
      padding: 0 4px 0 7px;
      border-color: transparent;
      border-radius: var(--corner-control);
      background: transparent;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-label-size); line-height: var(--type-label-height);
      font-weight: 550;
    }
    /* The chip is 20px by design and the pointer target may not be. The
       overlay carries the hit area to 24px without moving anything. It grows
       upward only: below the chip is the edge of the composer shell, which
       clips anything that reaches past it. */
    .sp-autonomy-chip::after {
      content: '';
      position: absolute;
      inset: -4px 0 0;
    }
    .sp-autonomy-chip:hover { background: var(--agi-ext-hover); filter: none; }
    .sp-autonomy-chip[data-mode='full'] {
      border-color: var(--agi-ext-warning-border);
      background: var(--agi-ext-warning-bg);
    }
    #sp-autonomy-popover {
      position: absolute;
      right: 0;
      bottom: calc(100% + 8px);
      z-index: var(--z-popover);
      display: none;
      width: min(270px, calc(100vw - 24px));
      padding: 7px;
      border: 1px solid var(--agi-ext-border-strong);
      border-radius: var(--corner-surface);
      background: var(--agi-ext-surface);
      box-shadow: var(--agi-ext-elevation-3);
    }
    #sp-autonomy-popover.open { display: block; }
    .sp-autonomy-option {
      width: 100%;
      display: flex;
      align-items: flex-start;
      gap: 9px;
      padding: 9px;
      border: 0;
      border-radius: var(--corner-field);
      background: transparent;
      color: var(--agi-ext-text-muted);
      cursor: pointer;
      text-align: left;
    }
    .sp-autonomy-option:hover,
    .sp-autonomy-option.selected { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    .sp-autonomy-option-warning.selected,
    .sp-autonomy-option-warning:hover { color: var(--agi-ext-warning-text); }
    .sp-autonomy-option-copy { display: flex; flex: 1; flex-direction: column; gap: 2px; }
    .sp-autonomy-option-copy strong { font-size: var(--type-label-size); line-height: var(--type-label-height); font-weight: 600; }
    .sp-autonomy-option-copy small {
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    #sp-send-btn {
      width: var(--control-md);
      height: var(--control-md);
      box-shadow: none;
    }#sp-model-dropdown,
#sp-attach-menu,
#sp-slash-menu,
#sp-mention-menu,
#sp-shortcuts-dropdown {
      padding: 6px;
      border-color: var(--agi-ext-border-strong);
      border-radius: var(--corner-surface);
      box-shadow: var(--agi-ext-elevation-3);
    }
    #sp-model-dropdown { margin-top: 8px; min-width: min(232px, calc(100vw - 24px)); }
    .sp-model-option,
    .sp-attach-menu-item,
    .sp-slash-item,
    .sp-shortcut-item { border-radius: var(--corner-field); }
    .sp-model-option { padding: 9px; }

    #sp-cloud-gate,
    #sp-blocked,
    .sp-agent-approval,
    .sp-create-shortcut-modal,
    .sp-ob-row { border-radius: var(--corner-panel); }
    #sp-cloud-gate.visible {
      flex-direction: column;
      align-items: center;
      gap: 12px;
      margin: 0 0 4px;
      padding: 22px 18px 20px;
      text-align: center;
    }
    #sp-cloud-gate-title { font-size: var(--type-body-large-size); line-height: var(--type-body-large-height); }
    #sp-cloud-gate-message { font-size: var(--type-caption-size); line-height: var(--type-caption-height); max-width: 260px; }
    #sp-cloud-gate-action { min-height: var(--control-lg); padding: 8px 18px; border-radius: var(--corner-field); font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    #sp-drawer-header { min-height: 56px; padding: 10px 14px; }
    .sp-drawer-section { border-radius: var(--corner-surface); }


    /* ── 2026-09 side panel: one quiet header, one glyph, one composer card ── */
    #sp-header { justify-content: flex-end; }

    #sp-empty { padding: 24px 20px; gap: 0; }
    #sp-empty-icon {
      width: 110px;
      height: 110px;
      margin: 0;
      color: color-mix(in srgb, var(--agi-ext-brand) 30%, var(--agi-ext-text-muted));
      opacity: 0.55;
    }
    #sp-empty-icon svg { width: 110px; height: 110px; }

    #sp-blocked {
      align-items: center;
      gap: 7px;
      padding: 0 2px;
      border: 0;
      border-radius: 0;
      background: none;
    }
    #sp-blocked-shield {
      width: 16px;
      height: 16px;
      flex: 0 0 16px;
      opacity: 0.7;
    }
    #sp-blocked-desc {
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      color: var(--agi-ext-text-muted);
    }

    #sp-composer-shell {
      min-height: 104px;
      padding: 10px 12px 9px;
      border-radius: var(--corner-panel);
      gap: 2px;
    }
    #sp-input { min-height: 46px; font-size: var(--type-body-large-size); line-height: var(--type-body-large-height); }
    #sp-composer-bar {
      padding: 0;
      gap: 4px;
      overflow: visible;
    }
    .sp-composer-controls-start,
    .sp-composer-controls-end { gap: 4px; }
    #sp-send-btn[hidden] { display: none; }

    #sp-model-selector-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: var(--control-sm);
      min-width: 0;
      max-width: 100%;
      padding: 4px 8px;
      border: 0;
      border-radius: var(--corner-field);
      background: transparent;
      cursor: pointer;
      overflow: hidden;
    }
    #sp-model-selector-btn:hover,
    #sp-model-selector-btn[aria-expanded='true'] { background: var(--agi-ext-hover); }
    #sp-model-badge {
      max-width: 132px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: var(--agi-ext-text);
      font-size: var(--type-body-size);
      line-height: var(--type-body-height);
      font-weight: 400;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #sp-model-effort-badge {
      color: var(--agi-ext-text-muted);
      font-size: var(--type-body-size);
      line-height: var(--type-body-height);
      white-space: nowrap;
    }
    #sp-model-mode-badge {
      padding: 0 6px;
      border-radius: var(--corner-control);
      background: var(--agi-ext-overlay);
      color: var(--agi-ext-text);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
      white-space: nowrap;
    }
    #sp-model-mode-badge[hidden] { display: none; }

    .sp-autonomy-chip {
      justify-content: center;
      gap: 0;
      width: var(--control-sm);
      height: var(--control-sm);
      padding: 0;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-field);
      background: transparent;
      color: var(--agi-ext-text-muted);
    }
    .sp-autonomy-chip[data-mode='full'] {
      border-color: var(--agi-ext-warning-border);
      background: transparent;
      color: var(--agi-ext-warning-text);
    }
    .sp-autonomy-chip:hover { filter: none; background: var(--agi-ext-hover); }
    #sp-autonomy-icon { display: inline-flex; }
    .sp-autonomy-option { align-items: flex-start; }
    .sp-autonomy-option-copy strong { font-size: var(--type-body-size); line-height: var(--type-body-height); font-weight: 500; }
    .sp-autonomy-option-check {
      display: inline-flex;
      align-items: center;
      width: 14px;
      flex-shrink: 0;
      color: var(--agi-ext-accent-text);
    }

    #sp-attach-menu { min-width: 224px; }
    .sp-attach-menu-item {
      min-height: var(--control-lg);
      color: var(--agi-ext-text);
      font-size: var(--type-body-size);
      line-height: var(--type-body-height);
    }
    .sp-attach-menu-label { flex: 1; min-width: 0; }
    .sp-attach-menu-label > span { display: block; }
    .sp-attach-menu-hint { color: var(--agi-ext-text-muted); font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-attach-menu-check {
      display: inline-flex;
      align-items: center;
      width: 14px;
      flex-shrink: 0;
      color: var(--agi-ext-accent-text);
    }

    .sp-model-option { font-size: var(--type-body-size); line-height: var(--type-body-height); }
    .sp-model-option.selected {
      background: var(--agi-ext-hover);
      color: var(--agi-ext-text);
    }
    .sp-model-option.selected .sp-model-option-sublabel {
      color: var(--agi-ext-text-muted);
      opacity: 1;
    }
    .sp-model-option-check { color: var(--agi-ext-accent-text); }
    .sp-model-option-auto .sp-model-option-name,
    .sp-model-option-auto:hover .sp-model-option-name {
      color: var(--agi-ext-text);
      font-weight: 400;
      opacity: 1;
    }
    .sp-model-option-name { font-size: var(--type-body-size); line-height: var(--type-body-height); }
    .sp-model-option-sublabel { font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-model-group-header { font-size: var(--type-caption-size); line-height: var(--type-caption-height); text-transform: none; letter-spacing: 0; }
    .sp-menu-heading {
      padding: 9px 10px 3px;
      margin-top: 4px;
      border-top: 1px solid var(--agi-ext-border);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-menu-note {
      padding: 4px 10px 8px;
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-effort-option {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: var(--control-md);
      padding: 6px 10px;
      border: 0;
      border-radius: var(--corner-field);
      background: transparent;
      color: var(--agi-ext-text);
      font: inherit;
      font-size: var(--type-body-size);
      line-height: var(--type-body-height);
      text-align: left;
      cursor: pointer;
    }
    .sp-effort-option:hover { background: var(--agi-ext-hover); }
    .sp-effort-option:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-effort-option[aria-disabled='true'] { color: var(--agi-ext-text-muted); cursor: default; }
    .sp-effort-option-label { flex: 1; min-width: 0; }
    .sp-effort-option-badge {
      padding: 1px 6px;
      border-radius: var(--corner-control);
      background: var(--agi-ext-overlay);
      color: var(--agi-ext-text-muted);
      font-size: var(--type-caption-size);
      line-height: var(--type-caption-height);
    }
    .sp-menu-toggle-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 4px;
      padding: 8px 10px;
      border-top: 1px solid var(--agi-ext-border);
    }
    .sp-menu-toggle-copy { display: flex; flex: 1; flex-direction: column; gap: 1px; min-width: 0; }
    .sp-menu-toggle-label { color: var(--agi-ext-text); font-size: var(--type-body-size); line-height: var(--type-body-height); cursor: pointer; }
    .sp-menu-toggle-desc { color: var(--agi-ext-text-muted); font-size: var(--type-caption-size); line-height: var(--type-caption-height); }
    .sp-menu-toggle {
      appearance: none;
      position: relative;
      width: var(--control-lg);
      height: 20px;
      flex-shrink: 0;
      border: none;
      border-radius: var(--corner-pill);
      background: var(--agi-ext-border-strong);
      cursor: pointer;
      transition: background var(--duration-quick);
    }
    .sp-menu-toggle:checked { background: var(--agi-ext-accent); }
    .sp-menu-toggle:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    .sp-menu-toggle::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: var(--corner-pill);
      background: var(--agi-ext-toggle-knob);
      transition: transform var(--duration-quick);
    }
    .sp-menu-toggle:checked::after { transform: translateX(14px); }

    #sp-recents {
      position: fixed;
      inset: 8px;
      z-index: var(--z-sheet);
      display: flex;
      flex-direction: column;
      padding: 6px 12px 12px;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-panel);
      background: var(--agi-ext-surface);
      box-shadow: var(--agi-ext-elevation-3);
    }
    #sp-recents[hidden] { display: none; }
    #sp-recents-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 2px 12px;
    }
    #sp-recents-header > #sp-recents-title { flex: 1; min-width: 0; }
    #sp-recents-title {
      color: var(--agi-ext-text);
      font-size: var(--type-h1-size);
      line-height: var(--type-h1-height);
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    #sp-recents-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      flex-shrink: 0;
      border: 1px solid var(--agi-ext-border);
      border-radius: var(--corner-field);
      background: transparent;
      color: var(--agi-ext-text-muted);
      cursor: pointer;
    }
    #sp-recents-close:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    #sp-recents-close:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
    #sp-recents #sp-drawer-history-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      max-height: none;
    }
    #sp-recents #sp-drawer-history-search { margin-bottom: 8px; font-size: var(--type-body-size); line-height: var(--type-body-height); }
    .sp-drawer-history-bullet {
      width: 6px;
      height: 6px;
      flex-shrink: 0;
      border-radius: var(--corner-pill);
      background: var(--agi-ext-accent);
    }
    .sp-drawer-history-open { min-height: 40px; gap: 10px; }
    .sp-drawer-history-title { font-size: var(--type-body-size); line-height: var(--type-body-height); }
    .sp-drawer-history-item.is-active { background: var(--agi-ext-hover); border-color: var(--agi-ext-border-strong); }
    .sp-drawer-history-item.is-active .sp-drawer-history-title { font-weight: 600; }
    .sp-drawer-history-date { font-size: var(--type-caption-size); line-height: var(--type-caption-height); }

    #sp-drawer-menu { display: flex; flex-direction: column; }
    #sp-drawer-menu[hidden],
    #sp-drawer-page[hidden],
    .sp-drawer-group[hidden] { display: none; }
    .sp-drawer-row {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 44px;
      padding: 10px 4px;
      border: 0;
      border-bottom: 1px solid var(--agi-ext-border);
      background: transparent;
      color: var(--agi-ext-text);
      font: inherit;
      font-size: var(--type-body-large-size);
      line-height: var(--type-body-large-height);
      text-align: left;
      cursor: pointer;
    }
    .sp-drawer-row:hover { background: var(--agi-ext-hover); }
    .sp-drawer-row:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: -2px; }
    .sp-drawer-row-label { flex: 1; min-width: 0; }
    .sp-drawer-row-chevron { display: inline-flex; color: var(--agi-ext-text-muted); }
    #sp-drawer-back {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      border: none;
      border-radius: var(--corner-field);
      background: transparent;
      color: var(--agi-ext-text-muted);
      cursor: pointer;
      transform: rotate(180deg);
    }
    #sp-drawer-back[hidden] { display: none; }
    #sp-drawer-back:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
    #sp-drawer-title { flex: 1; min-width: 0; }
    .sp-drawer-section-title {
      text-transform: none;
      letter-spacing: 0;
      font-size: var(--type-body-size);
      line-height: var(--type-body-height);
    }
    .sp-drawer-group > .sp-drawer-section:first-child { margin-top: 0; }

    @media (max-width: 390px) {
      #sp-header { padding-inline: 10px; }
    #sp-quota-badge.visible {
        display: inline-flex;
        max-width: 38px;
        padding-inline: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--type-label-size); line-height: var(--type-label-height);
      }
      #sp-model-badge { max-width: 82px; }
      #sp-messages { padding-inline: 11px; }
      #sp-input-area { padding-inline: 8px; }
      #sp-composer-shell { padding-inline: 9px; }
    }
    @media (max-width: 340px) {
      .sp-composer-controls-start,
      .sp-composer-controls-end { gap: 2px; }
    }
    @media (forced-colors: active) {
      * { forced-color-adjust: auto; }
      .sp-model-upgrade-tag {
        color: HighlightText;
        background: Highlight;
        border: 1px solid CanvasText;
      }
      .sp-drawer-toggle-switch::after,
      .sp-wf-task-toggle::after,
      .sp-toggle-switch::after {
        background: CanvasText;
        box-shadow: none;
      }
    }
  `;
  if (
    typeof CSSStyleSheet === 'function' &&
    typeof (CSSStyleSheet.prototype as { replaceSync?: unknown }).replaceSync === 'function'
  ) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      cssText +
        '\n' +
        COMPUTER_USE_PANEL_CSS +
        '\n' +
        CLOUD_RUNS_PANEL_CSS +
        '\n' +
        BROWSER_TOOLS_PANEL_CSS +
        '\n' +
        PROJECTS_DRAWER_CSS +
        '\n' +
        ARTIFACTS_DRAWER_CSS +
        '\n' +
        COMMAND_PALETTE_CSS +
        '\n' +
        AGIWORK_PLAN_REVIEW_CSS +
        '\n' +
        HELP_LINK_CSS,
    );
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } else {
    const fallback = document.createElement('style');
    fallback.textContent = cssText;
    document.head.appendChild(fallback);
  }
}

function scrollToBottom(): void {
  const msgs = document.getElementById('sp-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

const toolsAllowedForChat = new Map<string, Set<string>>();
const approvalGuidanceDrafts = new Map<string, string>();
const connectorInputResponses = new Map<
  string,
  Map<string, Record<string, ConnectorInputResponse>>
>();

function setApprovalGuidanceDraft(toolCallId: string, guidance: string): void {
  if (guidance.trim()) approvalGuidanceDrafts.set(toolCallId, guidance);
  else approvalGuidanceDrafts.delete(toolCallId);
}

function approveToolsAllowedForChat(assistantMessageId: string): void {
  const allowed = toolsAllowedForChat.get(_ctx.conversationId);
  if (!allowed?.size) return;
  const assistant = _ctx.messages.find(
    (message) => message.id === assistantMessageId && message.role === 'assistant',
  );
  for (const entry of assistant?.agentActivity?.entries ?? []) {
    if (
      entry.kind !== 'tool' ||
      entry.status !== 'awaiting-approval' ||
      !entry.approval ||
      entry.approval.decision ||
      entry.approval.riskLevel === 'high' ||
      entry.inputRequest ||
      !allowed.has(entry.name) ||
      assistant?.cloudApprovalDecisions?.[entry.toolCallId]
    ) {
      continue;
    }
    resolveManagedToolApproval(assistantMessageId, entry.toolCallId, 'approved');
  }
}

function approveToolForChat(assistantMessageId: string, toolName: string): void {
  const allowed = toolsAllowedForChat.get(_ctx.conversationId) ?? new Set<string>();
  allowed.add(toolName);
  toolsAllowedForChat.set(_ctx.conversationId, allowed);
  approveToolsAllowedForChat(assistantMessageId);
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
  const guidance = pendingCalls
    .flatMap((entry) => {
      const draft = approvalGuidanceDrafts.get(entry.toolCallId)?.trim();
      approvalGuidanceDrafts.delete(entry.toolCallId);
      return draft ? [draft] : [];
    })
    .join('\n\n')
    .slice(0, TOOL_APPROVAL_GUIDANCE_MAX_LENGTH);
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
      ...(guidance ? { guidance } : {}),
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

function pendingConnectorInputs(message: ChatMessage): AgentActivityToolEntry[] {
  return (
    message.agentActivity?.entries.filter(
      (entry): entry is AgentActivityToolEntry =>
        entry.kind === 'tool' && entry.inputRequest !== undefined,
    ) ?? []
  );
}

function connectorInputBinding(message: ChatMessage): ConnectorInputBinding | undefined {
  if (message.role !== 'assistant' || !message.cloudAgentRun) return undefined;
  return {
    answered: new Set(connectorInputResponses.get(message.id)?.keys()),
    sending: message.streaming === true,
    ...(message.cloudApprovalError ? { error: message.cloudApprovalError } : {}),
    ...(_ctx.isStreaming || !_ctx.managedCloudOwner
      ? {}
      : {
          onRespond: (toolCallId: string, responses: Record<string, ConnectorInputResponse>) =>
            resolveManagedToolInput(message.id, toolCallId, responses),
        }),
  };
}

function resolveManagedToolInput(
  assistantMessageId: string,
  toolCallId: string,
  responses: Record<string, ConnectorInputResponse>,
): void {
  const assistant = _ctx.messages.find(
    (message) => message.id === assistantMessageId && message.role === 'assistant',
  );
  const run = assistant?.cloudAgentRun;
  const owner = _ctx.managedCloudOwner;
  const pendingCalls = assistant ? pendingConnectorInputs(assistant) : [];
  if (
    !assistant ||
    !run ||
    !owner ||
    _ctx.isStreaming ||
    !pendingCalls.some((entry) => entry.toolCallId === toolCallId)
  ) {
    return;
  }

  const answered = connectorInputResponses.get(assistant.id) ?? new Map();
  answered.set(toolCallId, responses);
  connectorInputResponses.set(assistant.id, answered);
  assistant.cloudApprovalError = undefined;
  _ctx.needsMessageRebuild = true;
  if (pendingCalls.some((entry) => !answered.has(entry.toolCallId))) {
    renderMessages();
    return;
  }

  const toolInputs = pendingCalls.map((entry) => ({
    tool_call_id: entry.toolCallId,
    input_responses: answered.get(entry.toolCallId) ?? {},
  }));
  assistant.streaming = true;
  _ctx.currentStreamId = assistant.id;
  ownerByStreamId.set(assistant.id, { ...owner });
  _ctx.isStreaming = true;
  startManagedChatKeepalive();
  armManagedStreamInactivityWatchdog(assistant.id);
  updateSendButton();
  renderMessages();

  chrome.runtime.sendMessage(
    {
      type: 'RESOLVE_CHAT_INPUT',
      owner,
      clientInstanceId: SIDE_PANEL_CLIENT_INSTANCE_ID,
      id: assistant.id,
      cloudRun: run,
      toolInputs,
    },
    (response?: { success?: boolean; error?: string }) => {
      if (_ctx.currentStreamId !== assistant.id) return;
      if (chrome.runtime.lastError) {
        handleStreamError(
          assistant.id,
          chrome.runtime.lastError.message ?? t('spConnectorInputSendFailed'),
        );
      } else if (response?.success !== true) {
        handleStreamError(assistant.id, response?.error ?? t('spConnectorInputSendFailed'));
      }
    },
  );
}

function sendCardAnswer(text: string): void {
  if (!canAdmitComposerMessage(text)) return;
  _ctx.conversationGeneration += 1;
  renderModelNotice(null);
  const payload: TurnPayload = {
    prompt: text,
    pageText: null,
    capturePage: false,
    images: [],
    files: [],
  };
  const userMsg: ChatMessage = {
    id: `u-${Date.now()}`,
    role: 'user',
    content: text,
    timestamp: Date.now(),
    runtime: 'managed-cloud',
  };
  _ctx.messages.push(userMsg);
  turnPayloadByMessageId.set(userMsg.id, payload);
  trimLiveMessages();
  _ctx.needsMessageRebuild = true;
  saveMessages();
  renderMessages();
  dispatchTurn(userMsg, payload, _ctx.quickMode);
}

function respondToInteractiveCard(
  messageId: string,
  cardId: string,
  payload: InteractiveCardResponsePayload,
): void {
  const message = _ctx.messages.find(
    (candidate) => candidate.id === messageId && candidate.role === 'assistant',
  );
  const card = message?.interactiveCards?.find((candidate) => candidate.cardId === cardId);
  if (
    !message ||
    !card?.recognized ||
    card.kind !== 'clarify.v1' ||
    card.body.state.status !== 'pending' ||
    _ctx.isStreaming
  ) {
    return;
  }
  const settledAt = new Date().toISOString();
  const settle = (state: ClarifyState): void => {
    message.interactiveCards = (message.interactiveCards ?? []).map((candidate) =>
      candidate.cardId === cardId ? { ...card, body: { ...card.body, state } } : candidate,
    );
    _ctx.needsMessageRebuild = true;
    saveMessages();
    renderMessages();
  };
  if (payload.kind === 'dismiss') {
    settle({ status: 'dismissed', dismissedAt: settledAt });
    document.getElementById('sp-input')?.focus();
    return;
  }
  const answers = clarifyAnswersFromResponse(card.body, payload);
  const text = clarifyAnswerMessage(card.body, answers);
  if (!text || !canAdmitComposerMessage(text)) return;
  settle({ status: 'answered', answeredAt: settledAt, answers });
  sendCardAnswer(text);
}

function iconButton(attrs: Record<string, string>, icon: string): HTMLElement {
  const button = el('button', attrs);
  button.appendChild(renderIcon(icon, 12));
  return button;
}

let promptShortcuts: PromptShortcut[] = [];
let editPromptShortcut: (shortcut: PromptShortcut) => void = () => {};

function loadPromptShortcuts(): void {
  chrome.storage.local.get(SHORTCUTS_STORAGE_KEY, (items) => {
    if (chrome.runtime.lastError) {
      console.warn('[SidePanel] Could not read saved shortcuts:', chrome.runtime.lastError.message);
      return;
    }
    promptShortcuts = promptShortcutsFromSaved(items[SHORTCUTS_STORAGE_KEY]);
  });
}

const RECENT_PROJECT_LIMIT = 3;
let recentProjects: ActiveProjectSelection[] = [];
let recentProjectsGeneration = 0;
let chooseChatProject: (project: ActiveProjectSelection | null) => void = () => {};

function updateEmptyStateActions(): void {
  const ready = managedCloudChatState === 'ready' && _ctx.managedCloudOwner !== null;
  const pageBlocked = document.getElementById('sp-blocked')?.classList.contains('visible') === true;
  const suggestions = document.getElementById('sp-empty-suggestions');
  if (suggestions) suggestions.hidden = !ready || pageBlocked;
  const projects = document.getElementById('sp-empty-projects');
  if (projects) projects.hidden = !ready || recentProjects.length === 0;
}

function renderRecentProjects(): void {
  const list = document.getElementById('sp-empty-projects-list');
  if (!list) return;
  clearChildren(list);
  for (const project of recentProjects) {
    const button = el('button', {
      class: 'sp-empty-action',
      type: 'button',
      'aria-pressed': String(_ctx.activeProject?.id === project.id),
    });
    button.appendChild(renderIcon(Folder, 15));
    button.appendChild(el('span', { class: 'sp-empty-action-label' }, project.name));
    button.addEventListener('click', () => {
      chooseChatProject(_ctx.activeProject?.id === project.id ? null : project);
      document.getElementById('sp-input')?.focus();
    });
    list.appendChild(button);
  }
  updateEmptyStateActions();
}

async function refreshRecentProjects(): Promise<void> {
  const owner = _ctx.managedCloudOwner;
  const generation = ++recentProjectsGeneration;
  if (!owner || managedCloudChatState !== 'ready') {
    recentProjects = [];
    renderRecentProjects();
    return;
  }
  const result = await listChromeProjects();
  if (
    generation !== recentProjectsGeneration ||
    !sameManagedCloudOwner(owner, _ctx.managedCloudOwner)
  ) {
    return;
  }
  recentProjects =
    result.status === 'success'
      ? [...result.projects]
          .sort((left, right) =>
            (right.lastUsedAt ?? right.updatedAt).localeCompare(left.lastUsedAt ?? left.updatedAt),
          )
          .slice(0, RECENT_PROJECT_LIMIT)
          .map((project) => ({ id: project.id, name: project.name }))
      : [];
  renderRecentProjects();
}

function renderMessages(): void {
  const container = document.getElementById('sp-messages')!;
  const emptyEl = document.getElementById('sp-empty');

  if (_ctx.messages.length === 0) {
    if (emptyEl) emptyEl.classList.remove('hidden');
    updateEmptyStateActions();
    container.querySelectorAll('.sp-msg, .sp-thinking-wrap').forEach((n) => n.remove());
    _ctx.lastRenderedCount = 0;
    _ctx.needsMessageRebuild = false;
    return;
  }

  if (emptyEl) emptyEl.classList.add('hidden');

  if (
    shouldRebuildMessageDom({
      forceRebuild: _ctx.needsMessageRebuild,
      renderedCount: _ctx.lastRenderedCount,
      messageCount: _ctx.messages.length,
    })
  ) {
    container.querySelectorAll('.sp-msg, .sp-thinking-wrap').forEach((n) => n.remove());
    _ctx.lastRenderedCount = 0;
    _ctx.needsMessageRebuild = false;
  }

  const lastUserIndex = lastUserMessageIndex();
  const regenerateModels = regenerateModelOptions();
  for (let i = _ctx.lastRenderedCount; i < _ctx.messages.length; i++) {
    const msg = _ctx.messages[i];
    if (msg) {
      const regenerable =
        lastUserIndex >= 0 &&
        (msg.role === 'user' ? i === lastUserIndex : i === _ctx.messages.length - 1) &&
        i >= lastUserIndex;
      container.appendChild(
        buildBubbleWithTools(msg, {
          approvalDecisions: msg.cloudApprovalDecisions,
          approvalError: msg.cloudApprovalError,
          approvalGuidance: Object.fromEntries(approvalGuidanceDrafts),
          onResolveApproval: (toolCallId, decision) =>
            resolveManagedToolApproval(msg.id, toolCallId, decision),
          onApproveForChat: (_toolCallId, toolName) => approveToolForChat(msg.id, toolName),
          onApprovalGuidanceChange: setApprovalGuidanceDraft,
          connectorInput: connectorInputBinding(msg),
          ...agiWorkPlanReviewOption(msg, i),
          onRetry: (messageId) => retryFailedMessage(messageId),
          onSwitchModel: () => document.getElementById('sp-model-selector-btn')?.click(),
          quotaRecovery: { label: quotaRecoveryLabel, open: openQuotaRecovery },
          ...(regenerable
            ? {
                onRegenerate: (messageId: string, modelSelection?: string) => {
                  trackProductEvent('response_regenerated', msg.runtime);
                  regenerateTurn(messageId, modelSelection);
                },
                regenerateModels,
              }
            : {}),
          ...(msg.role === 'user'
            ? {
                imagePreviews:
                  turnPayloadByMessageId.get(msg.id)?.images.map((image) => image.dataUrl) ?? [],
              }
            : { fileAccess: answerFileAccess }),
          ...(msg.role === 'assistant' && i === _ctx.messages.length - 1 && !_ctx.isStreaming
            ? {
                onRespondToCard: (cardId: string, payload: InteractiveCardResponsePayload) =>
                  respondToInteractiveCard(msg.id, cardId, payload),
              }
            : {}),
        }),
      );
    }
  }
  _ctx.lastRenderedCount = _ctx.messages.length;
  renderTemporaryChatState();

  scrollToBottom();
}

function lastUserMessageIndex(): number {
  for (let index = _ctx.messages.length - 1; index >= 0; index -= 1) {
    if (_ctx.messages[index]?.role === 'user') return index;
  }
  return -1;
}

function applyModelSelection(value: string): void {
  if (_ctx.selectedModel !== value) {
    _ctx.conversationGeneration += 1;
    _ctx.currentModelKey = undefined;
    _ctx.previousTaskType = undefined;
    _ctx.reasoningEffort =
      _ctx.quickMode || value === 'auto' || value.startsWith('auto-')
        ? undefined
        : resolveModelEffort(value, _ctx.reasoningEffort);
  }
  _ctx.selectedModel = value;
  newChatModelSelection = value;
  renderModelNotice(null);
  chrome.storage.local.set({ [SELECTED_MODEL_STORAGE_KEY]: value }).catch(() => {});
  refreshModelPickerUI();
  saveMessages();
}

function regenerateModelOptions(): RegenerateModelOption[] {
  if (!managedModelAccess) return [];
  const options = getManagedModelPickerOptions(managedModelAccess);
  const { primary } = partitionManagedModelOptions(options);
  return [...options.filter((option) => option.value === 'auto'), ...primary].map((option) => ({
    value: option.value,
    label: option.label,
  }));
}

async function fetchAnswerFile(url: string): Promise<Blob> {
  const target = new URL(url);
  const owner = _ctx.managedCloudOwner;
  const headers =
    owner && target.origin === new URL(FREE_TRIAL_GATEWAY).origin
      ? await composerDocumentHeaders(owner)()
      : {};
  const response = await fetch(target.href, { headers, credentials: 'omit' });
  if (!response.ok) throw new Error(`File request failed with ${response.status}`);
  return response.blob();
}

const answerFileAccess: AnswerFileAccess = {
  resolveUrl: resolveManagedArtifactUrl,
  fetchFile: fetchAnswerFile,
  openUrl: (url) => {
    void chrome.tabs.create({ url });
  },
};

function showThinking(label = t('spThinkingPreparing')): void {
  const container = document.getElementById('sp-messages')!;

  const wrap = el('div', {
    class: 'sp-msg sp-msg-assistant sp-thinking-wrap',
    role: 'status',
    'aria-live': 'polite',
  });
  const thinking = el('div', { class: 'sp-thinking' });
  thinking.appendChild(el('div', { class: 'sp-dot', 'aria-hidden': 'true' }));
  thinking.appendChild(el('div', { class: 'sp-dot', 'aria-hidden': 'true' }));
  thinking.appendChild(el('div', { class: 'sp-dot', 'aria-hidden': 'true' }));
  thinking.appendChild(el('span', { class: 'sp-thinking-label' }, label));
  wrap.appendChild(thinking);
  container.appendChild(wrap);
  scrollToBottom();
}

function setThinkingLabel(label: string): void {
  const target = document.querySelector('.sp-thinking-label');
  if (target) target.textContent = label;
}

function removeThinking(): void {
  document.querySelectorAll('.sp-thinking-wrap').forEach((n) => n.remove());
}

function updateStreamingBubble(id: string, fullText: string, done: boolean): void {
  const bubble = document.getElementById(`sp-bubble-${id}`);
  if (!bubble) return;
  const message = _ctx.messages.find((candidate) => candidate.id === id);
  fillAnswerBubble(bubble, fullText, message ? answerSourceLists(message).markers : []);
  if (done) {
    bubble.classList.remove('sp-cursor');
  } else {
    bubble.classList.add('sp-cursor');
  }
  scrollToBottom();
}

const PAGE_CONTEXT_MAX_CHARS = 5_000;

const PAGE_CONTEXT_DENIED_REASON =
  'Chrome would not let the extension read this page. Approve this site under Settings, Site ' +
  'Allowlist in this panel, reload the page, and try again.';

const PAGE_CONTEXT_BLOCKED_REASON =
  "Chrome does not let extensions read this page at all. That covers Chrome's own pages, the " +
  'Web Store, and pages an administrator has restricted. Open an ordinary site and try again.';

const PAGE_CONTEXT_EMPTY_REASON = 'This page had no readable text to attach.';

const PAGE_CONTEXT_CHANGED_REASON =
  'The active page changed before it could be read. Go back to the page you asked about and try again.';

export type PageContextCapture =
  { ok: true; text: string; source: PageContextSource } | { ok: false; reason: string };

function describePageContextFailure(message: string): string {
  if (/chrome:\/\/|extension gallery|chrome-untrusted|view-source/i.test(message)) {
    return PAGE_CONTEXT_BLOCKED_REASON;
  }
  if (/cannot access|host permission|must request permission/i.test(message)) {
    return PAGE_CONTEXT_DENIED_REASON;
  }
  return `The page could not be read: ${message}`;
}

/**
 * Reads the active tab's visible text.
 *
 * Resolves a discriminated result rather than `null`: every caller here either
 * shows the user why nothing was attached or refuses to send a turn that needs
 * the page, and neither is possible without the reason.
 */
async function capturePageContext(): Promise<PageContextCapture> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const queryFailure = chrome.runtime.lastError?.message;
      if (queryFailure) {
        resolve({ ok: false, reason: describePageContextFailure(queryFailure) });
        return;
      }
      const tab = tabs[0];
      if (!tab?.id) {
        resolve({ ok: false, reason: 'No page is open in the active tab.' });
        return;
      }
      void readTabText(tab).then(resolve);
    });
  });
}

function readTabText(tab: chrome.tabs.Tab, chosen = false): Promise<PageContextCapture> {
  return new Promise((resolve) => {
    if (!tab.id) {
      resolve({ ok: false, reason: 'That tab has no page to read.' });
      return;
    }
    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: () => {
          const main = document.querySelector('main, article, [role="main"]');
          const mainText = main instanceof HTMLElement ? main.innerText.trim() : '';
          const text = mainText.length >= 200 ? mainText : (document.body?.innerText ?? '');
          return text.slice(0, 5000);
        },
      },
      (results) => {
        const scriptFailure = chrome.runtime.lastError?.message;
        if (scriptFailure) {
          resolve({ ok: false, reason: describePageContextFailure(scriptFailure) });
          return;
        }
        const raw = typeof results?.[0]?.result === 'string' ? results[0].result : '';
        const text = sanitizePageText(raw).slice(0, PAGE_CONTEXT_MAX_CHARS);
        resolve(
          text.trim()
            ? {
                ok: true,
                text,
                source: {
                  tabId: tab.id!,
                  url: tab.url ?? '',
                  ...(tab.title ? { title: tab.title } : {}),
                  ...(chosen ? { chosen: true } : {}),
                },
              }
            : { ok: false, reason: PAGE_CONTEXT_EMPTY_REASON },
        );
      },
    );
  });
}

async function readLinkedPage(url: string): Promise<PageContextCapture> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'omit', redirect: 'follow' });
  } catch {
    return { ok: false, reason: t('spLinkUnreachable', [pageChipLabel(url)]) };
  }
  if (!response.ok) {
    return { ok: false, reason: t('spLinkStatus', [pageChipLabel(url), String(response.status)]) };
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^text\/(html|plain)|application\/xhtml\+xml/i.test(contentType)) {
    return { ok: false, reason: t('spLinkNotText', [pageChipLabel(url)]) };
  }
  const body = await response.text();
  const page = /^text\/plain/i.test(contentType)
    ? null
    : new DOMParser().parseFromString(body, 'text/html');
  page?.querySelectorAll('script, style, noscript, template, svg').forEach((node) => node.remove());
  const main = page?.querySelector('main, article, [role="main"]');
  const mainText = main?.textContent?.trim() ?? '';
  const raw = page ? (mainText.length >= 200 ? mainText : (page.body?.textContent ?? '')) : body;
  const text = sanitizePageText(raw.replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' ')).slice(
    0,
    PAGE_CONTEXT_MAX_CHARS,
  );
  if (!text.trim()) return { ok: false, reason: PAGE_CONTEXT_EMPTY_REASON };
  const title = page?.title.trim();
  return {
    ok: true,
    text,
    source: { url: response.url || url, ...(title ? { title } : {}), chosen: true },
  };
}

function requestStreamCancellation(streamId: string): Promise<void> {
  const owner = ownerByStreamId.get(streamId);
  if (!owner) return Promise.resolve();
  const cloudRun =
    cloudRunsByStreamId.get(streamId) ??
    _ctx.messages.find((message) => message.id === streamId)?.cloudAgentRun;
  return chrome.runtime
    .sendMessage({
      type: 'CANCEL_STREAM',
      owner,
      clientInstanceId: SIDE_PANEL_CLIENT_INSTANCE_ID,
      id: streamId,
      ...(cloudRun ? { cloudRun } : {}),
    })
    .then(() => undefined)
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
  assistantCloudIdByStreamId.set(streamId, crypto.randomUUID());
  streamStartedAtById.set(streamId, Date.now());
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
  assistant.reconnecting = true;
  assistant.cloudAgentRun = { ...cloudRun };
  cloudRunsByStreamId.set(streamId, { ...cloudRun });
  ownerByStreamId.set(streamId, { ...owner });
  quickModeByStreamId.set(streamId, quickMode);
  _ctx.currentStreamId = streamId;
  _ctx.isStreaming = true;
  startManagedChatKeepalive();
  armManagedStreamInactivityWatchdog(streamId);
  updateSendButton();
  _ctx.needsMessageRebuild = true;
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

let stoppingStreamId: string | null = null;

function cancelCurrentManagedStream(preservePartialOutput: boolean): void {
  const streamId = _ctx.currentStreamId;
  if (streamId) {
    const stopped = _ctx.messages.find((message) => message.id === streamId);
    if (stopped && preservePartialOutput) stopped.stopping = true;
    stoppingStreamId = streamId;
    void requestStreamCancellation(streamId).finally(() => {
      if (stopped) stopped.stopping = false;
      if (stoppingStreamId === streamId) stoppingStreamId = null;
      updateSendButton();
      if (stopped && _ctx.messages.includes(stopped)) {
        _ctx.needsMessageRebuild = true;
        renderMessages();
      }
      if (preservePartialOutput) sendNextFollowUp();
    });
  }
  stopManagedChatKeepalive();
  if (_ctx.streamTimeoutHandle) {
    clearTimeout(_ctx.streamTimeoutHandle);
    _ctx.streamTimeoutHandle = null;
  }
  if (streamId) {
    const existing = _ctx.messages.find((message) => message.id === streamId);
    if (existing) existing.streaming = false;
    resolvedRouteByStreamId.delete(streamId);
    quickModeByStreamId.delete(streamId);
    ownerByStreamId.delete(streamId);
    streamStartedAtById.delete(streamId);
  }
  removeThinking();
  _ctx.isStreaming = false;
  _ctx.currentStreamId = null;
  updateSendButton();
  if (preservePartialOutput) {
    _ctx.needsMessageRebuild = true;
    saveMessages();
    renderMessages();
  }
}

function mimeTypeOfDataUrl(dataUrl: string): string {
  return /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'image/png';
}

function turnAttachmentDescriptors(payload: TurnPayload): SidePanelMessageAttachment[] {
  return [
    ...payload.images.map((image): SidePanelMessageAttachment => ({
      kind: 'image',
      name: image.name,
      mimeType: mimeTypeOfDataUrl(image.dataUrl),
    })),
    ...payload.files.map((file): SidePanelMessageAttachment => ({
      kind: 'file',
      name: file.name,
      mimeType: file.mimeType,
      assetId: file.assetId,
    })),
  ];
}

function pageReference(source: PageContextSource): SidePanelPageReference {
  return { url: source.url, title: source.title || pageChipLabel(source.url) };
}

const followUpQueue = createMessageQueue();

function canQueueFollowUp(text: string): boolean {
  return (
    managedCloudChatState === 'ready' &&
    _ctx.managedCloudOwner !== null &&
    (_ctx.isStreaming || stoppingStreamId !== null) &&
    !historyRestoreInProgress &&
    text.trim().length > 0
  );
}

function submitComposerText(text: string): boolean {
  if (canAdmitComposerMessage(text)) {
    sendMessage(text);
    return true;
  }
  if (!canQueueFollowUp(text)) return false;
  try {
    followUpQueue.enqueue({ value: text.trim(), mode: 'prompt' });
  } catch (err) {
    if (!(err instanceof QueueFullError)) throw err;
    composerContextNotice = t('spQueuedFull', [String(LANE_CAP)]);
    updateAttachmentPreview();
    return false;
  }
  return true;
}

function sendNextFollowUp(): void {
  const next = followUpQueue.peek();
  if (!next || typeof next.value !== 'string' || !canAdmitComposerMessage(next.value)) return;
  followUpQueue.dequeueIf(next.id);
  sendMessage(next.value);
}

function returnFollowUpsToComposer(): void {
  const parked = followUpQueue
    .dequeueAll()
    .flatMap((command) => (typeof command.value === 'string' ? [command.value] : []));
  if (parked.length === 0) return;
  const input = document.getElementById('sp-input') as HTMLTextAreaElement | null;
  if (!input) return;
  const current = input.value.trim();
  replaceComposerText(input, [...parked, ...(current ? [current] : [])].join('\n\n'));
  autoResizeInput(input);
  composerContextNotice = t('spQueuedReturned');
  updateAttachmentPreview();
  updateSendButton();
}

function sendMessage(text: string, displayText?: string): void {
  if (!canAdmitComposerMessage(text)) return;
  const imageLimitNotice = selectedModelImageLimitNotice(composerImageCount());
  if (imageLimitNotice) {
    composerAttachmentNotices = [imageLimitNotice];
    updateAttachmentPreview();
    return;
  }
  const prompt = expandPromptShortcut(
    resolveComposerPrompt(
      text,
      pendingAttachmentCount(),
      pendingDocuments.length > 0 ? 'file' : 'image',
    )!,
    promptShortcuts,
  );
  _ctx.conversationGeneration += 1;
  renderModelNotice(null);

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
  const capturePage = slashCmd?.captureContext === true;
  const pageSource = _ctx.pendingPageContextSource;
  const payload: TurnPayload = {
    prompt: capturePage && slashCmd ? slashCmd.prompt : prompt,
    pageText: _ctx.pendingPageContext,
    capturePage,
    images: pendingAttachments.splice(0),
    files: takeComposerDocuments(),
  };
  clearPendingPageContext();
  composerAttachmentNotices = [];
  composerContextNotice = null;
  updateContextButton();
  updateAttachmentPreview();

  const attachments = turnAttachmentDescriptors(payload);
  const userMsg: ChatMessage = {
    id: `u-${Date.now()}`,
    role: 'user',
    content: displayText ?? (capturePage && slashCmd ? slashCmd.display : prompt),
    timestamp: Date.now(),
    runtime: 'managed-cloud',
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(pageSource && payload.pageText ? { pages: [pageReference(pageSource)] } : {}),
  };
  _ctx.messages.push(userMsg);
  turnPayloadByMessageId.set(userMsg.id, payload);
  trimLiveMessages();
  _ctx.needsMessageRebuild = true;
  saveMessages();
  renderMessages();
  dispatchTurn(userMsg, payload, _ctx.quickMode);
}

let temporaryEndPending = false;

function renderTemporaryChatState(): void {
  const notice = document.getElementById('sp-temporary-notice');
  const text = document.getElementById('sp-temporary-notice-text');
  const end = document.getElementById('sp-temporary-notice-end');
  const keep = document.getElementById('sp-temporary-notice-keep');
  const item = document.getElementById('sp-temporary-item');
  if (notice && text && end && keep) {
    notice.classList.toggle('visible', _ctx.temporaryChat);
    const started = _ctx.messages.length > 0;
    text.textContent = temporaryEndPending
      ? t('spTemporaryChatEndPrompt')
      : t('spTemporaryChatActive');
    end.textContent = temporaryEndPending
      ? t('spTemporaryChatEndConfirm')
      : started
        ? t('spTemporaryChatEnd')
        : t('spTemporaryChatTurnOff');
    keep.hidden = !temporaryEndPending;
  }
  if (item) {
    item.setAttribute('aria-checked', String(_ctx.temporaryChat));
    item.hidden = !_ctx.temporaryChat && _ctx.messages.length > 0;
    const check = item.querySelector('.sp-attach-menu-check');
    if (check) {
      clearChildren(check);
      if (_ctx.temporaryChat) check.appendChild(renderIcon(Check, 14));
    }
  }
}

function leaveTemporaryChat(): void {
  _ctx.temporaryChat = false;
  _ctx.temporaryConversationId = null;
  temporaryEndPending = false;
  renderTemporaryChatState();
}

function startTemporaryChat(): void {
  if (_ctx.messages.length > 0 || _ctx.isStreaming) return;
  _ctx.temporaryChat = true;
  _ctx.temporaryConversationId = null;
  temporaryEndPending = false;
  renderTemporaryChatState();
}

function endTemporaryChat(): void {
  const owner = _ctx.managedCloudOwner;
  const conversationId = _ctx.temporaryConversationId;
  if (owner && conversationId) {
    void createExtensionCloudChatClient(owner)
      .deleteConversation(conversationId)
      .catch(() => undefined);
  }
  cancelCurrentManagedStream(false);
  resetConversationView();
}

function renderMemoryNotice(
  notice: { text: string; confirmForget?: () => Promise<void> } | null,
): void {
  const element = document.getElementById('sp-memory-notice');
  const text = document.getElementById('sp-memory-notice-text');
  const forget = document.getElementById('sp-memory-notice-forget') as HTMLButtonElement | null;
  const keep = document.getElementById('sp-memory-notice-keep') as HTMLButtonElement | null;
  if (!element || !text || !forget || !keep) return;
  element.classList.toggle('visible', notice !== null);
  text.textContent = notice?.text ?? '';
  const confirmForget = notice?.confirmForget;
  forget.hidden = keep.hidden = confirmForget === undefined;
  forget.disabled = false;
  forget.onclick = confirmForget
    ? () => {
        forget.disabled = true;
        void confirmForget();
      }
    : null;
}

function memoryCommandKindHint(message: string): MemoryCommandKind | undefined {
  if (/\bforget\b/i.test(message)) return 'forget';
  return /\bremember/i.test(message) ? 'remember' : undefined;
}

async function runChatMemoryCommand(
  message: string,
): Promise<ManagedMemoryCommandTurn | undefined> {
  const auth = await getManagedCloudAuthContext().catch(() => null);
  if (!auth) return undefined;
  const conversationId = activePersistenceEntry?.cloudSync?.conversationId;
  const projectId = _ctx.activeProject?.id;
  const request: MemoryCommandRequest = {
    message,
    conversationId:
      conversationId && OUTBOUND_UUID_PATTERN.test(conversationId) ? conversationId : null,
    projectId: projectId && OUTBOUND_UUID_PATTERN.test(projectId) ? projectId : null,
  };
  let result: MemoryCommandResult | null;
  try {
    result = await runAccountMemoryCommand(auth.token, request);
  } catch (error) {
    renderMemoryNotice({
      text: error instanceof Error ? error.message : t('spMemoryCommandUnavailable'),
    });
    const kind = memoryCommandKindHint(message);
    return kind ? { kind, status: 'failed' } : undefined;
  }
  if (!result) return undefined;
  const matches = result.matches;
  if (matches.length > 0) {
    renderMemoryNotice({
      text: tPlural('spMemoryForgetPrompt', matches.length, [
        matches.map((memory) => `“${memory.content}”`).join(' '),
      ]),
      confirmForget: async () => {
        try {
          const confirmed = await runAccountMemoryCommand(auth.token, {
            ...request,
            confirmed: true,
          });
          renderMemoryNotice({ text: confirmed?.message ?? t('spMemoryCommandUnavailable') });
        } catch (error) {
          renderMemoryNotice({
            text: error instanceof Error ? error.message : t('spMemoryCommandUnavailable'),
          });
        }
      },
    });
  } else if (result.message) {
    renderMemoryNotice({ text: result.message });
  }
  return { kind: result.kind, status: result.status };
}

async function ensureTemporaryConversation(owner: ManagedCloudOwner): Promise<string | null> {
  if (_ctx.temporaryConversationId) return _ctx.temporaryConversationId;
  const conversation = await createExtensionCloudChatClient(owner).createConversation({
    isTemporary: true,
  });
  if (!_ctx.temporaryChat) return null;
  _ctx.temporaryConversationId = conversation.id;
  return conversation.id;
}

function projectChatAwaitsAccountCopy(): boolean {
  const projectId = activePersistenceEntry?.projectId ?? _ctx.pendingProjectBinding;
  return Boolean(projectId) && activePersistenceEntry?.cloudSync?.createAcknowledged !== true;
}

async function ensureProjectChatInAccount(owner: ManagedCloudOwner): Promise<boolean> {
  const conversationId = _ctx.conversationId;
  await persistMessages();
  const response = (await chrome.runtime.sendMessage({
    type: 'ENSURE_CLOUD_CONVERSATION',
    owner,
    conversationId,
  })) as { success?: boolean } | undefined;
  const entry = await getConversation(owner, conversationId);
  if (entry && conversationId === _ctx.conversationId) activePersistenceEntry = entry;
  return response?.success === true;
}

function dispatchTurn(userMsg: ChatMessage, payload: TurnPayload, quickMode: boolean): void {
  const owner = _ctx.managedCloudOwner!;
  const streamId = beginManagedStream(quickMode);
  renderMemoryNotice(null);
  if (!_ctx.temporaryChat && projectChatAwaitsAccountCopy()) {
    void ensureProjectChatInAccount(owner)
      .catch(() => false)
      .then((saved) => {
        if (_ctx.currentStreamId !== streamId) return;
        if (!saved) {
          composerContextNotice = t('spProjectChatNotSaved');
          updateAttachmentPreview();
        }
        continueTurnWithMemory(userMsg, payload, streamId, owner, quickMode);
      });
    return;
  }
  if (_ctx.temporaryChat) {
    void ensureTemporaryConversation(owner)
      .catch(() => null)
      .then((conversationId) => {
        if (_ctx.currentStreamId !== streamId) return;
        if (!conversationId) {
          handleStreamError(streamId, t('spTemporaryChatUnavailable'));
          return;
        }
        continueTurn(userMsg, payload, streamId, owner, quickMode);
      });
    return;
  }
  continueTurnWithMemory(userMsg, payload, streamId, owner, quickMode);
}

function continueTurnWithMemory(
  userMsg: ChatMessage,
  payload: TurnPayload,
  streamId: string,
  owner: ManagedCloudOwner,
  quickMode: boolean,
): void {
  if (!MEMORY_COMMAND_HINT.test(payload.prompt)) {
    continueTurn(userMsg, payload, streamId, owner, quickMode);
    return;
  }
  void runChatMemoryCommand(payload.prompt).then((memoryCommand) => {
    if (_ctx.currentStreamId !== streamId) return;
    continueTurn(userMsg, payload, streamId, owner, quickMode, memoryCommand);
  });
}

function continueTurn(
  userMsg: ChatMessage,
  payload: TurnPayload,
  streamId: string,
  owner: ManagedCloudOwner,
  quickMode: boolean,
  memoryCommand?: ManagedMemoryCommandTurn,
): void {
  if (!payload.capturePage) {
    postTurn(userMsg, payload, streamId, owner, quickMode, memoryCommand);
    return;
  }
  const pageAtAdmission = activePageSource;
  setThinkingLabel(t('spThinkingReadingPage'));
  capturePageContext()
    .then((capture) => {
      if (_ctx.currentStreamId !== streamId) return;
      if (
        capture.ok &&
        !pageContextStillDescribes(pageAtAdmission, capture.source.tabId, capture.source.url)
      ) {
        handleStreamError(streamId, PAGE_CONTEXT_CHANGED_REASON);
        return;
      }
      const pageText = capture.ok ? capture.text : payload.pageText;
      if (!pageText) {
        // This command is about the page. Answering without it would be an
        // answer about nothing, dressed as an answer about this page.
        handleStreamError(streamId, capture.ok ? PAGE_CONTEXT_EMPTY_REASON : capture.reason);
        return;
      }
      payload.pageText = pageText;
      payload.capturePage = false;
      if (capture.ok) {
        userMsg.pages = [pageReference(capture.source)];
        _ctx.needsMessageRebuild = true;
        renderMessages();
        showThinking();
      }
      postTurn(userMsg, payload, streamId, owner, quickMode, memoryCommand);
    })
    .catch((err) => {
      console.error('[SidePanel] Failed to capture page context for chat:', err);
      if (_ctx.currentStreamId === streamId) {
        handleStreamError(streamId, 'Unable to capture page context.');
      }
    });
}

function postTurn(
  userMsg: ChatMessage,
  payload: TurnPayload,
  streamId: string,
  owner: ManagedCloudOwner,
  quickMode: boolean,
  memoryCommand?: ManagedMemoryCommandTurn,
): void {
  const history = selectModelHistory(_ctx.messages, userMsg.id);
  _ctx.messages.push({
    id: streamId,
    role: 'assistant',
    content: '',
    streaming: true,
    timestamp: Date.now(),
    runtime: 'managed-cloud',
  });
  lastStreamPersistAtMs = Date.now();
  saveMessages();

  chrome.runtime.sendMessage(
    {
      type: 'CHAT_MESSAGE',
      owner,
      clientInstanceId: SIDE_PANEL_CLIENT_INSTANCE_ID,
      id: streamId,
      text: payload.prompt,
      pageContext: payload.pageText ?? undefined,
      conversationHistory: history,
      attachments:
        payload.images.length > 0 ? payload.images.map((image) => image.dataUrl) : undefined,
      fileAttachments:
        payload.files.length > 0
          ? payload.files.map(({ assetId, mimeType }) => ({ assetId, mimeType }))
          : undefined,
      extendedThinking: _ctx.thinkingEnabled || undefined,
      modelSelection: _ctx.selectedModel,
      quickMode: quickMode || undefined,
      ...(_ctx.workMode === 'agiwork' || payload.agiWorkPlan ? { workMode: 'agiwork' } : {}),
      ...(payload.agiWorkPlan ? { agiWorkPlan: payload.agiWorkPlan } : {}),
      ...(capabilityAllowed(capabilityDocument, 'canUseWebSearch') ? {} : { webSearch: false }),
      ...(memoryCommand ? { memoryCommand } : {}),
      ...managedOutboundRoutingPayload(quickMode),
      ...managedTurnPersistencePayload(streamId),
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

function replayableTurnPayload(userMsg: ChatMessage): TurnPayload | null {
  const live = turnPayloadByMessageId.get(userMsg.id);
  if (live) return live;
  const attachments = userMsg.attachments ?? [];
  if ((userMsg.pages?.length ?? 0) > 0) return null;
  if (attachments.some((attachment) => attachment.kind === 'image' || !attachment.assetId)) {
    return null;
  }
  const slashCmd = expandSlashCommand(userMsg.content);
  return {
    prompt: slashCmd?.captureContext ? slashCmd.prompt : userMsg.content,
    pageText: null,
    capturePage: slashCmd?.captureContext === true,
    images: [],
    files: attachments.map((attachment) => ({
      assetId: attachment.assetId!,
      mimeType: attachment.mimeType,
      name: attachment.name,
    })),
  };
}

function restoreTurnToComposer(userMsg: ChatMessage): void {
  const input = document.getElementById('sp-input') as HTMLTextAreaElement | null;
  if (!input) return;
  replaceComposerText(input, userMsg.content);
  autoResizeInput(input);
  composerContextNotice = t('spRetryNeedsAttachments');
  updateAttachmentPreview();
}

function canReplayTurn(): boolean {
  return (
    managedCloudChatState === 'ready' &&
    _ctx.managedCloudOwner !== null &&
    !_ctx.isStreaming &&
    stoppingStreamId === null &&
    !historyRestoreInProgress
  );
}

function regenerateTurn(messageId: string, modelSelection?: string): void {
  if (!canReplayTurn()) return;
  const index = _ctx.messages.findIndex((message) => message.id === messageId);
  if (index < 0) return;
  let userIndex = -1;
  for (let i = index; i >= 0; i -= 1) {
    if (_ctx.messages[i]?.role === 'user') {
      userIndex = i;
      break;
    }
  }
  if (userIndex < 0 || userIndex !== lastUserMessageIndex()) return;
  const userMsg = _ctx.messages[userIndex]!;
  const payload = replayableTurnPayload(userMsg);
  if (!payload) {
    restoreTurnToComposer(userMsg);
    return;
  }
  if (modelSelection) applyModelSelection(modelSelection);
  _ctx.messages.splice(userIndex + 1);
  turnPayloadByMessageId.set(userMsg.id, payload);
  _ctx.conversationGeneration += 1;
  _ctx.needsMessageRebuild = true;
  renderModelNotice(null);
  saveMessages();
  renderMessages();
  dispatchTurn(userMsg, payload, modelSelection ? false : _ctx.quickMode);
}

function retryFailedMessage(messageId: string): void {
  regenerateTurn(messageId);
}

function startAgiWorkPlan(messageId: string, steps: string[]): void {
  if (!canReplayTurn()) return;
  const index = _ctx.messages.findIndex((message) => message.id === messageId);
  const userIndex = lastUserMessageIndex();
  if (index < 0 || index !== _ctx.messages.length - 1 || userIndex < 0 || userIndex > index) {
    return;
  }
  const userMsg = _ctx.messages[userIndex]!;
  const payload = replayableTurnPayload(userMsg);
  if (!payload) {
    restoreTurnToComposer(userMsg);
    return;
  }
  _ctx.messages.splice(userIndex + 1);
  turnPayloadByMessageId.set(userMsg.id, payload);
  _ctx.conversationGeneration += 1;
  _ctx.needsMessageRebuild = true;
  renderModelNotice(null);
  saveMessages();
  renderMessages();
  dispatchTurn(userMsg, { ...payload, agiWorkPlan: steps }, _ctx.quickMode);
}

function declineAgiWorkPlan(messageId: string): void {
  const message = _ctx.messages.find((candidate) => candidate.id === messageId);
  if (message?.role !== 'assistant') return;
  message.agiWorkPlanDeclined = true;
  _ctx.needsMessageRebuild = true;
  saveMessages();
  renderMessages();
}

function agiWorkPlanReviewOption(
  message: ChatMessage,
  index: number,
): { planReview?: AgiWorkPlanReviewBinding } {
  if (message.role !== 'assistant' || message.streaming || index !== _ctx.messages.length - 1) {
    return {};
  }
  const steps = pendingAgiWorkPlanSteps(message.agentActivity);
  if (!steps) return {};
  const busy = !canReplayTurn();
  return {
    planReview: {
      steps,
      declined: message.agiWorkPlanDeclined === true,
      busy,
      ...(busy
        ? {}
        : {
            onStart: (planSteps: string[]) => startAgiWorkPlan(message.id, planSteps),
            onCancel: () => declineAgiWorkPlan(message.id),
          }),
    },
  };
}

function handleStreamError(
  id: string,
  rawErrorText: string,
  errorCode?: string,
  detail: StreamFailureDetail = {},
  quota?: ManagedQuotaBlock,
): void {
  if (_ctx.currentStreamId !== id) return;
  const quotaPresentation = classifyManagedQuotaErrorCode(quota?.code);
  const resetLabel = quota && quotaPresentation?.showResetTime ? quotaResetLabel(quota.code) : null;
  const errorText = streamFailureText(rawErrorText, {
    ...detail,
    ...(resetLabel ? { resetLabel } : {}),
  });
  const errorAction =
    quotaPresentation?.suggestStandardModel === true ||
    (errorCode !== undefined &&
      ![
        'auth_required',
        'account_suspended',
        'terms_required',
        'plan_required',
        'quota_exceeded',
        'cancelled',
        'invalid_request',
        'protocol_error',
      ].includes(errorCode))
      ? 'switch-model'
      : undefined;
  const streamUsedQuick = quickModeByStreamId.get(id) === true;
  const assistantCloudId = assistantCloudIdByStreamId.get(id);
  resolvedRouteByStreamId.delete(id);
  quickModeByStreamId.delete(id);
  ownerByStreamId.delete(id);
  assistantCloudIdByStreamId.delete(id);
  streamStartedAtById.delete(id);
  stopManagedChatKeepalive();
  if (_ctx.streamTimeoutHandle) {
    clearTimeout(_ctx.streamTimeoutHandle);
    _ctx.streamTimeoutHandle = null;
  }
  removeThinking();
  const existing = _ctx.messages.find((message) => message.id === id);
  if (existing) existing.reconnecting = false;
  const canRetryPause = existing?.agentActivity?.entries.some(
    (entry) =>
      entry.kind === 'tool' &&
      (entry.inputRequest !== undefined ||
        (entry.status === 'awaiting-approval' &&
          Boolean(entry.approval) &&
          !entry.approval?.decision)),
  );
  if (existing && canRetryPause) {
    existing.streaming = false;
    if (streamUsedQuick) existing.managedQuickMode = true;
    existing.cloudApprovalDecisions = undefined;
    existing.cloudApprovalError = errorText.slice(0, 500);
    connectorInputResponses.delete(existing.id);
  } else {
    applyStreamFailure(_ctx.messages, id, errorText, Date.now(), errorAction, quota?.recovery);
  }
  const failedTurn = _ctx.messages.find((message) => message.id === id);
  if (failedTurn) {
    if (streamUsedQuick) failedTurn.managedQuickMode = true;
    // A failed row pushed with no runtime would flip the whole conversation to
    // cloud-ineligible (isCloudPersistenceEligible requires every message to be
    // managed-cloud); this turn is managed-cloud, so mark it as such.
    if (!failedTurn.runtime) failedTurn.runtime = 'managed-cloud';
    if (assistantCloudId && !failedTurn.cloudMessageId) {
      failedTurn.cloudMessageId = assistantCloudId;
    }
  }
  trimLiveMessages();
  _ctx.isStreaming = false;
  _ctx.currentStreamId = null;
  updateSendButton();
  _ctx.needsMessageRebuild = true;
  saveMessages();
  renderMessages();
  sendNextFollowUp();
}

function ensureStreamingAssistant(streamId: string, streamUsedQuick: boolean): ChatMessage {
  const existing = _ctx.messages.find((message) => message.id === streamId);
  if (existing) return existing;
  const cloudRun = cloudRunsByStreamId.get(streamId);
  const assistant: ChatMessage = {
    id: streamId,
    role: 'assistant',
    content: '',
    streaming: true,
    timestamp: Date.now(),
    runtime: 'managed-cloud',
    ...(streamUsedQuick ? { managedQuickMode: true } : {}),
    ...(cloudRun ? { cloudAgentRun: { ...cloudRun } } : {}),
  };
  _ctx.messages.push(assistant);
  trimLiveMessages();
  return assistant;
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

let contextBtn: HTMLButtonElement | null = null;

function updateContextButton(): void {
  if (!contextBtn) return;
  const attached = _ctx.pendingPageContext !== null;
  const label = contextBtn.querySelector('.sp-attach-menu-label');
  const check = contextBtn.querySelector('.sp-attach-menu-check');
  contextBtn.classList.toggle('has-context', attached);
  contextBtn.setAttribute('aria-checked', String(attached));
  contextBtn.title = attached
    ? t('spContextBtnAttached')
    : currentPageHostname || t('spContextBtnAttach');
  if (label) label.textContent = attached ? t('spContextItemAttached') : t('spContextItem');
  if (check) {
    clearChildren(check);
    if (attached) check.appendChild(renderIcon(Check, 14));
  }
}

function updateModelBadge(modelId: string): void {
  const badge = document.getElementById('sp-model-badge');
  if (!badge) return;
  const normalizedModelId = normalizeModelId(modelId) ?? modelId;
  badge.textContent = getModelBadgeLabel(normalizedModelId);
}

function updateSendButton(): void {
  document.getElementById('sp-messages')?.classList.toggle('sp-messages--busy', _ctx.isStreaming);
  const composer = document.getElementById('sp-input') as HTMLTextAreaElement | null;
  if (composer && managedCloudChatState === 'ready') {
    composer.placeholder = _ctx.isStreaming
      ? t('spComposerPlaceholderQueue')
      : t('spComposerPlaceholder');
  }
  const btn = document.getElementById('sp-send-btn') as HTMLButtonElement | null;
  if (!btn) return;
  if (_ctx.isStreaming) {
    btn.disabled = false;
    btn.hidden = false;
    btn.setAttribute('data-mode', 'stop');
    btn.title = t('spSendStop');
    btn.setAttribute('aria-label', t('spSendStopAria'));
    clearChildren(btn);
    btn.appendChild(renderIcon(Square, 14));
  } else if (stoppingStreamId !== null) {
    btn.disabled = true;
    btn.hidden = false;
    btn.setAttribute('data-mode', 'stopping');
    btn.title = t('spStopping');
    btn.setAttribute('aria-label', t('spStopping'));
    clearChildren(btn);
    btn.appendChild(renderIcon(Loader2, 14, 'sp-send-stopping-icon'));
  } else {
    const input = document.getElementById('sp-input') as HTMLTextAreaElement | null;
    const text = input?.value ?? '';
    btn.disabled = !canAdmitComposerMessage(text);
    btn.hidden = text.trim().length === 0 && pendingAttachmentCount() === 0;
    btn.setAttribute('data-mode', 'send');
    btn.title = t('spSendSend');
    btn.setAttribute('aria-label', t('spSendSendAria'));
    clearChildren(btn);
    btn.appendChild(renderIcon(ArrowUp, 16));
  }
  updateComposerAdmissionControls();
  updateHistoryRestoreControls();
}

function updateHistoryRestoreControls(): void {
  const disabled = _ctx.isStreaming || historyRestoreInProgress;
  for (const control of document.querySelectorAll<HTMLButtonElement>(
    '[data-conversation-restore="true"]',
  )) {
    control.disabled = disabled;
    control.setAttribute('aria-disabled', String(disabled));
  }
}

function canAdmitComposerMessage(text: string): boolean {
  return (
    managedCloudChatState === 'ready' &&
    _ctx.managedCloudOwner !== null &&
    !_ctx.isStreaming &&
    stoppingStreamId === null &&
    !historyRestoreInProgress &&
    composerAttachmentIntakeCount === 0 &&
    composerDocumentsSettled() &&
    resolveComposerPrompt(text, pendingAttachmentCount()) !== null
  );
}

function updateComposerAdmissionControls(): void {
  const controlsReady =
    managedCloudChatState === 'ready' &&
    _ctx.managedCloudOwner !== null &&
    !_ctx.isStreaming &&
    !historyRestoreInProgress &&
    composerAttachmentIntakeCount === 0;
  for (const control of document.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
    '#sp-attach-btn, #sp-attach-menu button, #sp-attach-file-input, #sp-mic-btn',
  )) {
    control.disabled = !controlsReady;
    control.setAttribute('aria-disabled', String(!controlsReady));
  }
  const pageContextBlocked =
    document.getElementById('sp-blocked')?.classList.contains('visible') === true;
  if (contextBtn) {
    contextBtn.disabled = !controlsReady || pageContextBlocked;
    contextBtn.setAttribute('aria-disabled', String(contextBtn.disabled));
  }
}

function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(typeof result === 'string' ? result : null);
    };
    reader.onerror = () => resolve(null);
    reader.onabort = () => resolve(null);
    try {
      reader.readAsDataURL(file);
    } catch {
      resolve(null);
    }
  });
}

const COMPOSER_ATTACHMENT_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const COMPOSER_DOCUMENT_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
]);
const COMPOSER_ATTACHMENT_ACCEPT = [
  ...COMPOSER_ATTACHMENT_MIME_TYPES,
  ...COMPOSER_DOCUMENT_MIME_TYPES,
  '.pdf',
  '.txt',
  '.md',
].join(',');
const COMPOSER_ATTACHMENT_DATA_URL =
  /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/]+={0,2}$/i;
function composerAttachmentBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function pendingAttachmentBytes(): number {
  let total = 0;
  for (const image of pendingAttachments) total += composerAttachmentBytes(image.dataUrl);
  return total;
}

function pendingAttachmentCount(): number {
  return pendingAttachments.length + pendingDocuments.length;
}

function composerDocumentsSettled(): boolean {
  return pendingDocuments.every((entry) => entry.phase === 'complete');
}

let composerAttachmentNotices: string[] = [];
/** Why the last page-context capture produced nothing. Rendered in the same composer strip. */
let composerContextNotice: string | null = null;

function attachmentBudgetLabel(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

function composerImageCount(): number {
  return (
    pendingAttachments.length +
    pendingDocuments.filter((entry) => entry.mimeType.startsWith('image/')).length
  );
}

function selectedModelImageLimitNotice(images: number): string | null {
  const model = getModelMetadataById(_ctx.selectedModel);
  if (!model) return null;
  const limit = managedModelImageLimit(model.id);
  if (limit === null || images <= limit) return null;
  return tPlural('spAttachmentModelImageLimit', limit, [model.name]);
}

function admitComposerAttachment(dataUrl: string, name: string): boolean {
  if (!COMPOSER_ATTACHMENT_DATA_URL.test(dataUrl)) {
    composerAttachmentNotices.push(t('spAttachmentUnsupported', [name]));
    return false;
  }
  const imageLimitNotice = selectedModelImageLimitNotice(composerImageCount() + 1);
  if (imageLimitNotice) {
    composerAttachmentNotices.push(imageLimitNotice);
    return false;
  }
  if (pendingAttachmentCount() >= MANAGED_CHAT_MAX_ATTACHMENTS) {
    composerAttachmentNotices.push(
      t('spAttachmentTooMany', [name, String(MANAGED_CHAT_MAX_ATTACHMENTS)]),
    );
    return false;
  }
  if (
    pendingAttachmentBytes() + composerAttachmentBytes(dataUrl) >
    MANAGED_CHAT_MAX_ATTACHMENT_BYTES
  ) {
    composerAttachmentNotices.push(
      t('spAttachmentOverBudget', [name, attachmentBudgetLabel(MANAGED_CHAT_MAX_ATTACHMENT_BYTES)]),
    );
    return false;
  }
  pendingAttachments.push({ dataUrl, name });
  return true;
}

function composerDocumentMimeType(file: File): string | null {
  const mimeType = resolveChatAttachmentMimeType(file.name, file.type);
  return mimeType && COMPOSER_DOCUMENT_MIME_TYPES.has(mimeType) ? mimeType : null;
}

function admitComposerDocument(file: File, mimeType: string): boolean {
  if (file.size === 0) {
    composerAttachmentNotices.push(t('spAttachmentEmpty', [file.name]));
    return false;
  }
  if (pendingAttachmentCount() >= MANAGED_CHAT_MAX_ATTACHMENTS) {
    composerAttachmentNotices.push(
      t('spAttachmentTooMany', [file.name, String(MANAGED_CHAT_MAX_ATTACHMENTS)]),
    );
    return false;
  }
  const documentBytes = pendingDocuments.reduce((sum, entry) => sum + entry.file.size, 0);
  if (documentBytes + file.size > MAX_CHAT_ATTACHMENT_BYTES) {
    composerAttachmentNotices.push(
      t('spAttachmentOverBudget', [file.name, attachmentBudgetLabel(MAX_CHAT_ATTACHMENT_BYTES)]),
    );
    return false;
  }
  const entry: ComposerDocument = {
    key: crypto.randomUUID(),
    file,
    mimeType,
    phase: 'preparing',
    controller: new AbortController(),
  };
  pendingDocuments.push(entry);
  void uploadComposerDocument(entry);
  return true;
}

function composerDocumentHeaders(owner: ManagedCloudOwner): () => Promise<HeadersInit> {
  return async () => {
    const auth = await getManagedCloudAuthContext();
    if (!auth) throw new Error(t('spDocumentSignInRequired'));
    if (
      !sameManagedCloudOwner(auth.owner, owner) ||
      !sameManagedCloudOwner(_ctx.managedCloudOwner, owner)
    ) {
      throw new Error(t('spDocumentAccountChanged'));
    }
    return {
      Authorization: `Bearer ${auth.token}`,
      'X-Requested-With': 'XMLHttpRequest',
      ...platformRequestHeaders(),
    };
  };
}

async function uploadComposerDocument(entry: ComposerDocument): Promise<void> {
  const owner = _ctx.managedCloudOwner;
  entry.phase = 'preparing';
  entry.error = undefined;
  entry.attachment = undefined;
  if (entry.controller.signal.aborted) entry.controller = new AbortController();
  const { signal } = entry.controller;
  updateAttachmentPreview();
  if (!owner) {
    entry.phase = 'failed';
    entry.error = t('spDocumentSignInRequired');
    updateAttachmentPreview();
    return;
  }
  const client = createManagedCloudChatAttachmentsClient({
    baseUrl: FREE_TRIAL_GATEWAY,
    getHeaders: composerDocumentHeaders(owner),
  });
  try {
    const [attachment] = await client.upload([entry.file], {
      signal,
      ...(_ctx.temporaryChat ? { temporary: true } : {}),
      onStatus: (status) => {
        if (signal.aborted || status.phase === 'failed' || status.phase === 'complete') return;
        entry.phase = status.phase;
        updateAttachmentPreview();
      },
    });
    if (signal.aborted) return;
    if (!attachment) throw new Error(t('spDocumentUploadFailed', [entry.file.name]));
    entry.attachment = attachment;
    entry.phase = 'complete';
  } catch (error) {
    if (signal.aborted) return;
    entry.phase = 'failed';
    entry.error =
      error instanceof Error && error.message
        ? error.message
        : t('spDocumentUploadFailed', [entry.file.name]);
  }
  updateAttachmentPreview();
}

function removeComposerDocument(key: string): void {
  const index = pendingDocuments.findIndex((entry) => entry.key === key);
  if (index < 0) return;
  pendingDocuments[index]!.controller.abort();
  pendingDocuments.splice(index, 1);
  composerAttachmentNotices = [];
  updateAttachmentPreview();
}

function discardComposerDocuments(): void {
  for (const entry of pendingDocuments) entry.controller.abort();
  pendingDocuments.length = 0;
  updateAttachmentPreview();
}

function takeComposerDocuments(): ComposerFile[] {
  const ready = pendingDocuments.flatMap((entry) =>
    entry.attachment
      ? [
          {
            assetId: entry.attachment.id,
            mimeType: entry.attachment.mimeType,
            name: entry.file.name,
          },
        ]
      : [],
  );
  pendingDocuments.length = 0;
  return ready;
}

function acceptIncomingComposerFiles(files: File[] | FileList): void {
  composerAttachmentNotices = [];
  if (!capabilityAllowed(capabilityDocument, 'canUploadFiles')) {
    composerAttachmentNotices.push(t('spAttachmentUploadsOff'));
    updateAttachmentPreview();
    return;
  }
  const incoming: File[] = [];
  for (const file of Array.from(files)) {
    if (!COMPOSER_ATTACHMENT_MIME_TYPES.has(file.type.toLowerCase())) {
      const documentMimeType = composerDocumentMimeType(file);
      if (!documentMimeType) {
        composerAttachmentNotices.push(t('spAttachmentUnsupported', [file.name]));
        continue;
      }
      if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
        composerAttachmentNotices.push(
          t('spAttachmentFileTooLarge', [
            file.name,
            attachmentBudgetLabel(MAX_CHAT_ATTACHMENT_BYTES),
          ]),
        );
        continue;
      }
      admitComposerDocument(file, documentMimeType);
      continue;
    }
    if (file.size > MANAGED_CHAT_MAX_ATTACHMENT_FILE_BYTES) {
      composerAttachmentNotices.push(
        t('spAttachmentFileTooLarge', [
          file.name,
          attachmentBudgetLabel(MANAGED_CHAT_MAX_ATTACHMENT_FILE_BYTES),
        ]),
      );
      continue;
    }
    incoming.push(file);
  }
  if (incoming.length === 0) {
    updateAttachmentPreview();
    return;
  }

  composerAttachmentIntakeCount += 1;
  updateAttachmentPreview();
  void Promise.all(incoming.map(readFileAsDataUrl))
    .then((results) => {
      results.forEach((dataUrl, index) => {
        const name = incoming[index]?.name || t('spAttachmentImageName');
        if (dataUrl) admitComposerAttachment(dataUrl, name);
        else composerAttachmentNotices.push(t('spAttachmentReadFailedNamed', [name]));
      });
    })
    .catch(() => {
      composerAttachmentNotices.push(t('spAttachmentReadAllFailed'));
    })
    .finally(() => {
      composerAttachmentIntakeCount = Math.max(0, composerAttachmentIntakeCount - 1);
      updateAttachmentPreview();
    });
}

function composerDocumentStatusLabel(entry: ComposerDocument): string {
  switch (entry.phase) {
    case 'preparing':
    case 'uploading':
      return t('spDocumentUploading');
    case 'verifying':
      return t('spDocumentVerifying');
    case 'complete':
      return t('spDocumentReady');
    case 'failed':
      return entry.error ?? t('spDocumentUploadFailed', [entry.file.name]);
  }
}

function renderComposerDocumentChip(entry: ComposerDocument): HTMLElement {
  const busy = entry.phase !== 'complete' && entry.phase !== 'failed';
  const chip = el('div', {
    class: 'sp-attachment-chip sp-attachment-doc',
    'data-phase': entry.phase,
    'aria-busy': String(busy),
  });
  const icon = el('span', { class: 'sp-attachment-doc-icon', 'aria-hidden': 'true' });
  icon.appendChild(renderIcon(busy ? Loader2 : FileText, 16));
  chip.appendChild(icon);
  const copy = el('div', { class: 'sp-attachment-doc-copy' });
  copy.appendChild(
    el('span', { class: 'sp-attachment-doc-name', title: entry.file.name }, entry.file.name),
  );
  copy.appendChild(
    el(
      'span',
      {
        class: 'sp-attachment-doc-status',
        role: entry.phase === 'failed' ? 'alert' : 'status',
      },
      composerDocumentStatusLabel(entry),
    ),
  );
  if (entry.phase === 'failed') {
    const retryBtn = el(
      'button',
      { class: 'sp-attachment-doc-retry', type: 'button' },
      t('spDocumentRetry'),
    );
    retryBtn.addEventListener('click', () => {
      void uploadComposerDocument(entry);
    });
    copy.appendChild(retryBtn);
  }
  chip.appendChild(copy);
  const removeBtn = el(
    'button',
    {
      class: 'sp-attachment-remove',
      type: 'button',
      title: 'Remove',
      'aria-label': t('spDocumentRemove', [entry.file.name]),
    },
    '×',
  );
  removeBtn.addEventListener('click', () => removeComposerDocument(entry.key));
  chip.appendChild(removeBtn);
  return chip;
}

function renderPendingPageChip(bar: HTMLElement): void {
  const source = _ctx.pendingPageContextSource;
  if (!_ctx.pendingPageContext || !source) return;
  const label = source.title || pageChipLabel(source.url);
  const chip = el('div', {
    class: 'sp-attachment-chip sp-attachment-doc sp-attachment-page',
    title: source.url,
  });
  const icon = el('span', { class: 'sp-attachment-doc-icon', 'aria-hidden': 'true' });
  icon.appendChild(renderIcon(Globe, 16));
  chip.appendChild(icon);
  const copy = el('div', { class: 'sp-attachment-doc-copy' });
  copy.appendChild(el('span', { class: 'sp-attachment-doc-name' }, label));
  copy.appendChild(el('span', { class: 'sp-attachment-doc-status' }, pageChipLabel(source.url)));
  chip.appendChild(copy);
  const removeBtn = el(
    'button',
    {
      class: 'sp-attachment-remove',
      type: 'button',
      title: t('spContextChipRemove', [label]),
      'aria-label': t('spContextChipRemove', [label]),
    },
    '×',
  );
  removeBtn.addEventListener('click', () => {
    clearPendingPageContext();
    updateContextButton();
    updateAttachmentPreview();
    document.getElementById('sp-input')?.focus();
  });
  chip.appendChild(removeBtn);
  bar.appendChild(chip);
}

function updateAttachmentPreview(): void {
  const bar = document.getElementById('sp-attachment-bar');
  if (!bar) return;
  clearChildren(bar);
  const pageAttached = _ctx.pendingPageContext !== null && _ctx.pendingPageContextSource !== null;
  if (
    pendingAttachments.length === 0 &&
    pendingDocuments.length === 0 &&
    composerAttachmentNotices.length === 0 &&
    !composerContextNotice &&
    !pageAttached &&
    composerAttachmentIntakeCount === 0
  ) {
    bar.style.display = 'none';
    updateSendButton();
    return;
  }
  bar.style.display = 'flex';
  renderPendingPageChip(bar);
  pendingAttachments.forEach((image, index) => {
    const chip = el('div', { class: 'sp-attachment-chip', title: image.name });
    const thumb = el('img', {
      class: 'sp-attachment-thumb',
      src: image.dataUrl,
      alt: image.name,
      width: '48',
      height: '48',
    }) as HTMLImageElement;
    const removeBtn = el(
      'button',
      {
        class: 'sp-attachment-remove',
        type: 'button',
        title: t('spDocumentRemove', [image.name]),
        'aria-label': t('spDocumentRemove', [image.name]),
      },
      '×',
    );
    removeBtn.addEventListener('click', () => {
      pendingAttachments.splice(index, 1);
      composerAttachmentNotices = [];
      updateAttachmentPreview();
    });
    chip.appendChild(thumb);
    chip.appendChild(removeBtn);
    bar.appendChild(chip);
  });
  for (const entry of pendingDocuments) bar.appendChild(renderComposerDocumentChip(entry));
  if (composerContextNotice) {
    bar.appendChild(
      el(
        'div',
        {
          class: 'sp-attachment-notice',
          id: 'sp-context-notice',
          role: 'status',
          'aria-live': 'polite',
        },
        composerContextNotice,
      ),
    );
  }
  if (composerAttachmentNotices.length > 0) {
    const notices = el('ul', {
      class: 'sp-attachment-notices',
      role: 'status',
      'aria-live': 'polite',
    });
    for (const notice of composerAttachmentNotices) {
      notices.appendChild(el('li', { class: 'sp-attachment-notice' }, notice));
    }
    bar.appendChild(notices);
  } else if (composerAttachmentIntakeCount > 0) {
    bar.appendChild(
      el(
        'div',
        { class: 'sp-attachment-retention', role: 'status', 'aria-live': 'polite' },
        t('spAttachmentAdding'),
      ),
    );
  }
  updateSendButton();
}

/**
 * The attached page text is the page it was read from, not "the page". A tab
 * switch or a navigation, including an in-page one on a single-page app, leaves
 * the chip naming the new host while it still carries the old page's text, so
 * the attachment is dropped the moment its source stops being what the user is
 * looking at.
 */
function dropPageContextOnNavigation(tabId: number | undefined, url: string): void {
  if (pageContextStillDescribes(_ctx.pendingPageContextSource, tabId, url)) return;
  clearPendingPageContext();
  composerContextNotice = t('spContextChipDropped');
  updateAttachmentPreview();
}

let refreshComputerUseSiteHook: () => void = () => {};

function updateActivePage(url: string, tabId?: number): void {
  dropPageContextOnNavigation(tabId, url);
  activePageSource = typeof tabId === 'number' ? { tabId, url } : null;
  currentPageHostname = pageChipLabel(url);
  setBlockedState(isRestrictedPageUrl(url));
  updateContextButton();
  refreshComputerUseSiteHook();
}

function autoResizeInput(ta: HTMLTextAreaElement): void {
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
}

function setBlockedState(blocked: boolean): void {
  const blockedEl = document.getElementById('sp-blocked');
  const inputEl = document.getElementById('sp-input') as HTMLTextAreaElement | null;

  if (!blockedEl) return;
  const availability = getChromeSurfaceAvailability({
    nativeConnected: _ctx.isConnected,
    restrictedPage: blocked,
  });

  if (blocked) {
    blockedEl.classList.add('visible');
    clearPendingPageContext();
  } else {
    blockedEl.classList.remove('visible');
  }
  if (inputEl) {
    inputEl.disabled = !availability.chat || managedCloudChatState !== 'ready';
    if (managedCloudChatState === 'ready') {
      inputEl.placeholder = t('spComposerPlaceholder');
    }
  }
  updateContextButton();
  if (contextBtn) {
    contextBtn.disabled = !availability.pageContext || managedCloudChatState !== 'ready';
    contextBtn.title = availability.pageContext
      ? t('spContextBtnAttach')
      : t('spContextBtnUnavailable');
  }
  updateSendButton();
  updateEmptyStateActions();
}

function refreshPageHostname(): void {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) return;
      const tab = tabs[0];
      const url = tab?.url ?? '';
      updateActivePage(url, tab?.id);
      refreshTabGroupUI();
    });
  } catch {
    /* noop */
  }
}

function buildOnboardingOverlay(onComplete: () => void): void {
  const TOTAL_STEPS = 6;
  let currentStep = 0;

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

  const overlay = el('div', {
    id: 'sp-onboarding-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Welcome to AGI, first-time setup',
    'aria-hidden': 'true',
    inert: '',
  });

  const header = el('div', { id: 'sp-onboarding-header' });
  const skipBtn = el(
    'button',
    { id: 'sp-onboarding-skip', 'aria-label': 'Skip onboarding' },
    'Skip',
  );
  header.appendChild(skipBtn);
  overlay.appendChild(header);

  const body = el('div', { id: 'sp-onboarding-body' });

  const step0 = el('div', {
    class: 'sp-ob-step active',
    'data-step': '0',
    role: 'group',
    'aria-label': t('spOnboardingStepLabel', ['1', String(TOTAL_STEPS)]),
    'aria-hidden': 'false',
  });
  step0.appendChild(el('div', { class: 'sp-ob-title' }, 'This is a beta feature'));
  const rows0 = el('div', { class: 'sp-ob-rows' });

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

  for (const disclosure of DATA_HANDLING_DISCLOSURES) {
    const privacyRow = el('div', { class: 'sp-ob-row sp-ob-privacy-row' });
    const privacyIcon = el('div', { class: 'sp-ob-row-icon', 'aria-hidden': 'true' });
    appendSvgString(privacyIcon, eyeSvg);
    const privacyText = el('div', { class: 'sp-ob-row-text' });
    privacyText.appendChild(el('strong', {}, disclosure.label));
    privacyText.appendChild(document.createTextNode(` ${disclosure.body}`));
    privacyRow.appendChild(privacyIcon);
    privacyRow.appendChild(privacyText);
    rows0.appendChild(privacyRow);
  }

  const privacySettingsRow = el('div', { class: 'sp-ob-row sp-ob-privacy-row' });
  const privacySettingsText = el('div', { class: 'sp-ob-row-text' });
  const privacySettingsBtn = el('button', { class: 'sp-ob-learn-more' }, 'Open privacy settings');
  privacySettingsBtn.addEventListener('click', () => {
    if (typeof chrome.runtime.openOptionsPage === 'function') chrome.runtime.openOptionsPage();
  });
  privacySettingsText.appendChild(privacySettingsBtn);
  privacySettingsRow.appendChild(privacySettingsText);
  rows0.appendChild(privacySettingsRow);

  step0.appendChild(rows0);
  body.appendChild(step0);

  const setupName = el('input', {
    class: 'sp-ob-input',
    id: 'sp-ob-name',
    type: 'text',
    autocomplete: 'name',
  }) as HTMLInputElement;
  const setupAccountStatus = el('p', { class: 'sp-ob-body', role: 'status' });
  const setupSignIn = el(
    'button',
    { class: 'sp-ob-action', type: 'button' },
    t('spSetupAccountSignIn'),
  );
  const setupNameField = el(
    'div',
    { class: 'sp-ob-field' },
    el('label', { class: 'sp-ob-label', for: 'sp-ob-name' }, t('spSetupNameLabel')),
    setupName,
  );
  const stepAccount = el('div', {
    class: 'sp-ob-step',
    'data-step': '1',
    role: 'group',
    'aria-label': t('spOnboardingStepLabel', ['2', String(TOTAL_STEPS)]),
    'aria-hidden': 'true',
  });
  stepAccount.appendChild(el('div', { class: 'sp-ob-title' }, t('spSetupAccountTitle')));
  stepAccount.appendChild(setupAccountStatus);
  stepAccount.appendChild(setupSignIn);
  stepAccount.appendChild(setupNameField);
  body.appendChild(stepAccount);
  setupSignIn.addEventListener('click', () => {
    setupSignIn.disabled = true;
    void openClerkSignIn()
      .catch((error: unknown) => {
        setupAccountStatus.textContent =
          error instanceof Error ? error.message : t('spSetupAccountSignedOut');
      })
      .finally(() => {
        setupSignIn.disabled = false;
      });
  });

  const setupModels = el('div', {
    class: 'sp-ob-choices',
    role: 'radiogroup',
    'aria-labelledby': 'sp-ob-model-title',
  });
  const setupModelNote = el('p', { class: 'sp-ob-body' });
  const stepModel = el('div', {
    class: 'sp-ob-step',
    'data-step': '2',
    role: 'group',
    'aria-label': t('spOnboardingStepLabel', ['3', String(TOTAL_STEPS)]),
    'aria-hidden': 'true',
  });
  stepModel.appendChild(
    el('div', { class: 'sp-ob-title', id: 'sp-ob-model-title' }, t('spSetupModelTitle')),
  );
  stepModel.appendChild(setupModelNote);
  stepModel.appendChild(setupModels);
  body.appendChild(stepModel);

  const setupRemember = el('input', {
    type: 'checkbox',
    id: 'sp-ob-memory-remember',
  }) as HTMLInputElement;
  const setupSearchPast = el('input', {
    type: 'checkbox',
    id: 'sp-ob-memory-search',
  }) as HTMLInputElement;
  const setupMemoryNote = el('p', { class: 'sp-ob-body', role: 'status' });
  const stepMemory = el('div', {
    class: 'sp-ob-step',
    'data-step': '3',
    role: 'group',
    'aria-label': t('spOnboardingStepLabel', ['4', String(TOTAL_STEPS)]),
    'aria-hidden': 'true',
  });
  stepMemory.appendChild(el('div', { class: 'sp-ob-title' }, t('spSetupMemoryTitle')));
  stepMemory.appendChild(el('p', { class: 'sp-ob-body' }, t('spSetupMemoryBody')));
  stepMemory.appendChild(
    el(
      'div',
      { class: 'sp-ob-check' },
      setupRemember,
      el('label', { for: 'sp-ob-memory-remember' }, t('spSetupMemoryRemember')),
    ),
  );
  stepMemory.appendChild(
    el(
      'div',
      { class: 'sp-ob-check' },
      setupSearchPast,
      el('label', { for: 'sp-ob-memory-search' }, t('spSetupMemorySearch')),
    ),
  );
  stepMemory.appendChild(setupMemoryNote);
  body.appendChild(stepMemory);

  const setupState: {
    ownerKey: string | null;
    loadedName: string;
    memory: MemoryPreferences | null;
    model: string;
  } = { ownerKey: null, loadedName: '', memory: null, model: _ctx.selectedModel };

  function renderSetupModels(signedIn: boolean): void {
    const options = signedIn ? regenerateModelOptions() : [];
    const choices =
      options.length > 0 ? options : [{ value: 'auto', label: t('spSetupModelAuto') }];
    if (!choices.some((choice) => choice.value === setupState.model)) setupState.model = 'auto';
    setupModelNote.textContent = signedIn ? t('spSetupModelBody') : t('spSetupModelSignedOut');
    setupModels.replaceChildren();
    for (const choice of choices) {
      const id = `sp-ob-model-${choice.value.replace(/[^A-Za-z0-9_-]/g, '-')}`;
      const radio = el('input', {
        type: 'radio',
        name: 'sp-ob-model',
        id,
        value: choice.value,
      }) as HTMLInputElement;
      radio.checked = choice.value === setupState.model;
      radio.addEventListener('change', () => {
        if (radio.checked) setupState.model = choice.value;
      });
      setupModels.appendChild(
        el('div', { class: 'sp-ob-check' }, radio, el('label', { for: id }, choice.label)),
      );
    }
  }

  function renderSetupMemory(signedIn: boolean): void {
    const memory = setupState.memory;
    const usable = signedIn && memory !== null && memory.organizationAllows;
    setupRemember.disabled = !usable;
    setupSearchPast.disabled = !usable;
    setupMemoryNote.textContent = !signedIn
      ? t('spSetupMemorySignedOut')
      : memory && !memory.organizationAllows
        ? t('spSetupMemoryOrgOff')
        : '';
  }

  refreshOnboardingAccount = () => {
    const owner = _ctx.managedCloudOwner;
    const signedIn = owner !== null && managedModelAccess !== null;
    const ownerKey = owner ? managedCloudOwnerKey(owner) : null;
    setupSignIn.hidden = signedIn;
    setupNameField.hidden = !signedIn;
    setupAccountStatus.textContent = signedIn
      ? t('spSetupAccountSignedIn', [setupState.loadedName || t('spCloudAccountFallbackName')])
      : t('spSetupAccountSignedOut');
    renderSetupModels(signedIn);
    renderSetupMemory(signedIn);
    if (!signedIn || ownerKey === setupState.ownerKey) return;
    setupState.ownerKey = ownerKey;
    void getClerkAccountProfile()
      .then((profile) => {
        if (setupState.ownerKey !== ownerKey) return;
        setupState.loadedName = accountDisplayName ?? profile?.displayName ?? '';
        if (!setupName.value) setupName.value = setupState.loadedName;
        setupAccountStatus.textContent = t('spSetupAccountSignedIn', [
          setupState.loadedName || profile?.email || t('spCloudAccountFallbackName'),
        ]);
      })
      .catch(() => undefined);
    void getManagedCloudAuthContext()
      .then(async (auth) => {
        if (!auth || setupState.ownerKey !== ownerKey) return;
        const preferences = await fetchMemoryPreferences(auth.token);
        if (setupState.ownerKey !== ownerKey) return;
        setupState.memory = preferences;
        setupRemember.checked = preferences.memory;
        setupSearchPast.checked = preferences.searchPastChats;
        renderSetupMemory(true);
      })
      .catch(() => {
        setupMemoryNote.textContent = t('spSetupMemoryUnavailable');
      });
  };

  async function saveSetupChoices(): Promise<void> {
    if (setupState.model !== _ctx.selectedModel) applyModelSelection(setupState.model);
    const auth = await getManagedCloudAuthContext();
    if (!auth) return;
    const name = setupName.value.trim();
    if (!setupNameField.hidden && name && name !== setupState.loadedName) {
      await saveAccountDisplayName(auth.token, name);
    }
    const memory = setupState.memory;
    if (
      memory &&
      memory.organizationAllows &&
      (memory.memory !== setupRemember.checked ||
        memory.searchPastChats !== setupSearchPast.checked)
    ) {
      await saveMemoryPreferences(auth.token, {
        memory: setupRemember.checked,
        searchPastChats: setupSearchPast.checked,
      });
    }
  }

  const step2 = el('div', {
    class: 'sp-ob-step',
    'data-step': '4',
    role: 'group',
    'aria-label': t('spOnboardingStepLabel', ['5', String(TOTAL_STEPS)]),
    'aria-hidden': 'true',
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

  const step4 = el('div', {
    class: 'sp-ob-step',
    'data-step': '5',
    role: 'group',
    'aria-label': t('spOnboardingStepLabel', ['6', String(TOTAL_STEPS)]),
    'aria-hidden': 'true',
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

  const footer = el('div', { id: 'sp-onboarding-footer' });

  const dotsRow = el('div', {
    class: 'sp-ob-dots',
    role: 'progressbar',
    'aria-label': 'Onboarding progress',
    'aria-valuemin': '1',
    'aria-valuemax': String(TOTAL_STEPS),
    'aria-valuenow': '1',
    'aria-valuetext': t('spOnboardingStepLabel', ['1', String(TOTAL_STEPS)]),
  });
  const dots: HTMLElement[] = [];
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const dot = el('div', {
      class: i === 0 ? 'sp-ob-dot active' : 'sp-ob-dot',
      'aria-hidden': 'true',
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
    {
      class: 'sp-ob-btn-next',
      'aria-label': t('spOnboardingContinueAria', ['1', String(TOTAL_STEPS)]),
    },
    'I understand',
  );
  navRow.appendChild(backBtn);
  navRow.appendChild(nextBtn);
  footer.appendChild(navRow);
  overlay.appendChild(footer);

  const stepLabels: string[] = [
    t('spOnboardingUnderstand'),
    t('spNext'),
    t('spNext'),
    t('spNext'),
    t('spOnboardingLetsGo'),
    t('spOnboardingDone'),
  ];
  const total = String(TOTAL_STEPS);
  const stepAriaLabels: string[] = [
    t('spOnboardingContinueAria', ['1', total]),
    t('spOnboardingContinueAria', ['2', total]),
    t('spOnboardingContinueAria', ['3', total]),
    t('spOnboardingContinueAria', ['4', total]),
    t('spOnboardingContinueAria', ['5', total]),
    t('spOnboardingDismissAria'),
  ];

  function dismiss(): void {
    markOnboardingComplete();
    overlay.classList.remove('visible');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('inert', '');
    onComplete();
    const composer = document.getElementById('sp-input') as HTMLTextAreaElement | null;
    const fallback = document.getElementById('sp-menu-btn') as HTMLButtonElement | null;
    (composer && !composer.disabled ? composer : fallback)?.focus();
  }

  function goToStep(step: number): void {
    refreshOnboardingAccount();
    const steps = body.querySelectorAll<HTMLElement>('.sp-ob-step');
    steps.forEach((s, i) => {
      s.classList.toggle('active', i === step);
      s.setAttribute('aria-hidden', String(i !== step));
    });
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === step);
    });
    currentStep = step;
    dotsRow.setAttribute('aria-valuenow', String(step + 1));
    dotsRow.setAttribute(
      'aria-valuetext',
      t('spOnboardingStepLabel', [String(step + 1), String(TOTAL_STEPS)]),
    );
    if (step === 0) {
      backBtn.setAttribute('hidden', '');
    } else {
      backBtn.removeAttribute('hidden');
    }
    nextBtn.textContent = stepLabels[step] ?? t('spNext');
    nextBtn.setAttribute('aria-label', stepAriaLabels[step] ?? t('spWizardContinueAria'));
    nextBtn.focus();
  }

  const setupError = el('p', { class: 'sp-ob-error', role: 'alert', hidden: '' });
  footer.insertBefore(setupError, navRow);

  nextBtn.addEventListener('click', () => {
    if (currentStep < TOTAL_STEPS - 1) {
      goToStep(currentStep + 1);
      return;
    }
    nextBtn.disabled = true;
    setupError.hidden = true;
    nextBtn.textContent = t('spSetupSaving');
    void saveSetupChoices()
      .then(() => dismiss())
      .catch((error: unknown) => {
        setupError.textContent = t('spSetupSaveFailed', [
          error instanceof Error ? error.message : t('spSetupSaveFailedGeneric'),
        ]);
        setupError.hidden = false;
        nextBtn.textContent = stepLabels[currentStep] ?? t('spOnboardingDone');
      })
      .finally(() => {
        nextBtn.disabled = false;
      });
  });

  backBtn.addEventListener('click', () => {
    if (currentStep > 0) {
      goToStep(currentStep - 1);
    }
  });

  skipBtn.addEventListener('click', () => dismiss());

  overlay.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
      return;
    }
    if (e.key === 'Tab') {
      const focusable = Array.from(
        overlay.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([hidden]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  document.body.appendChild(overlay);
}

function showOnboardingOverlay(): void {
  const overlay = document.getElementById('sp-onboarding-overlay');
  if (!overlay) return;
  overlay.classList.add('visible');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.removeAttribute('inert');
  const nextBtn = overlay.querySelector<HTMLButtonElement>('.sp-ob-btn-next');
  if (nextBtn) {
    setTimeout(() => nextBtn.focus(), 50);
  }
}

function buildUI(): void {
  clearChildren(document.body);

  const tabGroupNotice = el('div', {
    id: 'sp-tab-group-notice',
    role: 'status',
    'aria-live': 'polite',
    hidden: '',
  });
  document.body.appendChild(tabGroupNotice);
  let tabGroupNoticeTimer: ReturnType<typeof setTimeout> | null = null;

  function showTabGroupNotice(message: string, kind: 'success' | 'error'): void {
    if (tabGroupNoticeTimer) clearTimeout(tabGroupNoticeTimer);
    tabGroupNotice.textContent = message;
    tabGroupNotice.dataset['kind'] = kind;
    tabGroupNotice.removeAttribute('hidden');
    tabGroupNoticeTimer = setTimeout(() => {
      tabGroupNotice.setAttribute('hidden', '');
      tabGroupNoticeTimer = null;
    }, 3500);
  }

  type TabGroupStateRenderer = (grouped: boolean, known: boolean) => void;
  const tabGroupStateRenderers = new Set<TabGroupStateRenderer>();
  let currentTabGrouped = false;
  let tabGroupStateKnown = false;
  let tabGroupRequestGeneration = 0;

  function publishTabGroupState(grouped: boolean, known: boolean): void {
    currentTabGrouped = grouped;
    tabGroupStateKnown = known;
    for (const renderState of tabGroupStateRenderers) renderState(grouped, known);
  }

  function registerTabGroupStateRenderer(renderState: TabGroupStateRenderer): void {
    tabGroupStateRenderers.add(renderState);
    renderState(currentTabGrouped, tabGroupStateKnown);
  }

  refreshTabGroupUI = (): void => {
    const requestGeneration = ++tabGroupRequestGeneration;
    publishTabGroupState(currentTabGrouped, false);
    chrome.runtime.sendMessage(
      { type: 'GET_TAB_GROUP_STATE' },
      (response: { success?: boolean; grouped?: boolean; error?: string } | undefined) => {
        if (requestGeneration !== tabGroupRequestGeneration) return;
        if (chrome.runtime.lastError || response?.success !== true) {
          publishTabGroupState(currentTabGrouped, false);
          return;
        }
        publishTabGroupState(response.grouped === true, true);
      },
    );
  };

  function requestTabGroupChange(grouped: boolean): void {
    const requestGeneration = ++tabGroupRequestGeneration;
    publishTabGroupState(currentTabGrouped, false);
    chrome.runtime.sendMessage(
      { type: grouped ? 'ADD_TAB_TO_GROUP' : 'REMOVE_TAB_FROM_GROUP' },
      (response: { success?: boolean; grouped?: boolean; error?: string } | undefined) => {
        if (requestGeneration !== tabGroupRequestGeneration) return;
        if (chrome.runtime.lastError || response?.success !== true) {
          showTabGroupNotice(
            response?.error ?? chrome.runtime.lastError?.message ?? t('spTabGroupUpdateFailed'),
            'error',
          );
          refreshTabGroupUI();
          return;
        }
        publishTabGroupState(response.grouped === true, true);
        showTabGroupNotice(
          response.grouped === true ? t('spGroupTabAdded') : t('spGroupTabRemoved'),
          'success',
        );
      },
    );
  }

  const header = el('div', { id: 'sp-header' });

  const modelSelectorWrap = el('div', { class: 'sp-model-selector-wrap' });
  const modelSelectorBtn = el('button', {
    id: 'sp-model-selector-btn',
    type: 'button',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  });
  const modelBadge = document.createElement('span');
  modelBadge.id = 'sp-model-badge';
  modelBadge.textContent = t('spModelBadgeDefault');
  const modelEffortBadge = document.createElement('span');
  modelEffortBadge.id = 'sp-model-effort-badge';
  const modelModeBadge = document.createElement('span');
  modelModeBadge.id = 'sp-model-mode-badge';
  modelModeBadge.textContent = t('spAgiWork');
  modelModeBadge.hidden = true;
  modelSelectorBtn.replaceChildren(modelBadge, modelEffortBadge, modelModeBadge);
  const modelDropdownEl = el('div', {
    id: 'sp-model-dropdown',
    role: 'menu',
    'aria-label': 'Available models',
  });

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

  const GENERIC_PROVIDER_ICON_ID = 'custom-openai-compatible';

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

  function buildModelOptionRow(m: ManagedModelPickerOption, isSelected: boolean): HTMLElement {
    const isAuto = m.value === 'auto';
    const lockLabel = m.lockLabel;

    const classes = [
      'sp-model-option',
      isSelected ? 'selected' : '',
      isAuto ? 'sp-model-option-auto' : '',
      lockLabel ? 'sp-model-option-locked' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const opt = el(
      'button',
      lockLabel
        ? {
            class: classes,
            type: 'button',
            role: 'menuitem',
            'aria-label': t('spModelLockedAria', [m.label, lockLabel]),
          }
        : {
            class: classes,
            type: 'button',
            role: 'menuitemradio',
            'aria-checked': String(isSelected),
          },
    );

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

    const textBlock = el('div', { class: 'sp-model-option-text' });
    textBlock.appendChild(el('span', { class: 'sp-model-option-name' }, m.label));
    const sublabel = isAuto
      ? t('spModelAutoDescription')
      : [
          m.speed ? modelSpeedLabel(m.speed) : undefined,
          m.description ?? getManagedCapabilityLabel(m),
        ]
          .filter(Boolean)
          .join(' · ');
    if (sublabel) {
      textBlock.appendChild(el('span', { class: 'sp-model-option-sublabel' }, sublabel));
    }
    opt.appendChild(textBlock);

    if (lockLabel) {
      opt.appendChild(
        el('span', { class: 'sp-model-option-lock', 'aria-hidden': 'true' }, lockLabel),
      );
      opt.addEventListener('click', () => {
        closeModelDropdown();
        chrome.tabs.create({ url: agiWebUrl('/pricing') }).catch(() => {});
      });
      return opt;
    }

    const checkCell = el('span', { class: 'sp-model-option-check' });
    if (isSelected) checkCell.appendChild(renderIcon(Check, 12));
    opt.appendChild(checkCell);
    opt.addEventListener('click', () => {
      applyModelSelection(m.value);
      closeModelDropdown();
      modelSelectorBtn.focus();
    });

    return opt;
  }

  function closeModelDropdown(): void {
    modelDropdownEl.classList.remove('open');
    modelSelectorBtn.classList.remove('open');
    modelSelectorBtn.setAttribute('aria-expanded', 'false');
  }

  function currentEffortState() {
    return getManagedEffortControlState(
      _ctx.quickMode ? 'auto-economy' : _ctx.selectedModel,
      _ctx.quickMode ? undefined : _ctx.currentModelKey,
      _ctx.reasoningEffort,
      managedModelAccess?.subscriptionTier,
    );
  }

  function appendModelRows(options: ManagedModelPickerOption[]): void {
    for (const option of options) {
      modelDropdownEl.appendChild(buildModelOptionRow(option, _ctx.selectedModel === option.value));
    }
  }

  function appendEffortSection(): void {
    modelDropdownEl.appendChild(el('div', { class: 'sp-menu-heading' }, t('spEffortHeading')));
    const state = currentEffortState();
    if (state.status !== 'ready' || state.effort === undefined) {
      const row = el('div', { class: 'sp-effort-option', 'aria-disabled': 'true' });
      row.appendChild(el('span', { class: 'sp-effort-option-label' }, t('spEffortAuto')));
      row.setAttribute('title', state.description);
      modelDropdownEl.appendChild(row);
      return;
    }
    const defaultEffort = state.modelId ? resolveModelEffort(state.modelId, undefined) : undefined;
    for (const option of state.options) {
      const isSelected = option === state.effort;
      const row = el('button', {
        class: 'sp-effort-option',
        type: 'button',
        role: 'menuitemradio',
        'aria-checked': String(isSelected),
      });
      row.appendChild(el('span', { class: 'sp-effort-option-label' }, EFFORT_LABEL[option]));
      if (option === defaultEffort) {
        row.appendChild(el('span', { class: 'sp-effort-option-badge' }, t('spEffortDefaultBadge')));
      }
      const check = el('span', { class: 'sp-model-option-check' });
      if (isSelected) check.appendChild(renderIcon(Check, 12));
      row.appendChild(check);
      row.addEventListener('click', () => {
        _ctx.reasoningEffort = option;
        newChatEffortSelection = option;
        chrome.storage.local.set({ [SELECTED_EFFORT_STORAGE_KEY]: option }).catch(() => {});
        renderModelDropdown();
        refreshEffortUI();
        saveMessages();
      });
      modelDropdownEl.appendChild(row);
    }
    const unlockPlanLabel = state.unlockPlanLabel;
    if (!unlockPlanLabel) return;
    for (const option of state.gated) {
      const gatedCopy = t('spEffortGated', [unlockPlanLabel]);
      const row = el('div', {
        class: 'sp-effort-option',
        'aria-disabled': 'true',
        'aria-label': `${EFFORT_LABEL[option]}, ${gatedCopy}`,
        title: gatedCopy,
      });
      row.appendChild(el('span', { class: 'sp-effort-option-label' }, EFFORT_LABEL[option]));
      row.appendChild(el('span', { class: 'sp-effort-option-badge' }, unlockPlanLabel));
      modelDropdownEl.appendChild(row);
    }
  }

  function appendToggleRow(
    id: string,
    label: string,
    description: string,
    checked: boolean,
    onChange: (next: boolean) => void,
  ): void {
    const row = el('div', { class: 'sp-menu-toggle-row' });
    const copy = el('div', { class: 'sp-menu-toggle-copy' });
    copy.appendChild(el('label', { class: 'sp-menu-toggle-label', for: id }, label));
    copy.appendChild(el('span', { class: 'sp-menu-toggle-desc' }, description));
    row.appendChild(copy);
    const input = el('input', {
      id,
      class: 'sp-menu-toggle',
      type: 'checkbox',
      role: 'menuitemcheckbox',
      'data-active': String(checked),
      'aria-checked': String(checked),
    }) as HTMLInputElement;
    input.checked = checked;
    input.setAttribute('aria-label', label);
    input.addEventListener('change', () => onChange(input.checked));
    row.appendChild(input);
    modelDropdownEl.appendChild(row);
  }

  function appendWorkModeRow(): void {
    if (!managedModelAccess) return;
    if (canUseBillingPlanCapability(managedModelAccess.subscriptionTier, 'agi_work')) {
      appendToggleRow(
        'sp-agi-work-toggle',
        t('spAgiWork'),
        t('spAgiWorkDescription'),
        _ctx.workMode === 'agiwork',
        (next) => {
          _ctx.workMode = next ? 'agiwork' : 'chat';
          renderModelDropdown();
          renderModelTrigger();
        },
      );
      return;
    }
    const unlockPlanLabel = agiWorkUnlockPlanLabel();
    if (!unlockPlanLabel) return;
    const gatedCopy = t('spAgiWorkGated', [unlockPlanLabel]);
    const row = el('div', {
      class: 'sp-menu-toggle-row',
      'aria-disabled': 'true',
      title: gatedCopy,
    });
    const copy = el('div', { class: 'sp-menu-toggle-copy' });
    copy.appendChild(el('span', { class: 'sp-menu-toggle-label' }, t('spAgiWork')));
    copy.appendChild(el('span', { class: 'sp-menu-toggle-desc' }, gatedCopy));
    row.appendChild(copy);
    row.appendChild(el('span', { class: 'sp-effort-option-badge' }, unlockPlanLabel));
    modelDropdownEl.appendChild(row);
  }

  function applyQuickMode(next: boolean): void {
    const previous = _ctx.quickMode;
    _ctx.quickMode = next;
    renderModelDropdown();
    refreshEffortUI();
    chrome.runtime
      .sendMessage({ type: 'SET_QUICK_MODE', enabled: next })
      .then((response: { success?: boolean } | undefined) => {
        if (response?.success === true) return;
        _ctx.quickMode = previous;
        renderModelDropdown();
        refreshEffortUI();
      })
      .catch(() => {
        _ctx.quickMode = previous;
        renderModelDropdown();
        refreshEffortUI();
      });
  }

  function renderModelDropdown(): void {
    clearChildren(modelDropdownEl);
    const autoOption = getManagedModelPickerOptions(null)[0];
    if (autoOption) {
      modelDropdownEl.appendChild(buildModelOptionRow(autoOption, _ctx.selectedModel === 'auto'));
    }
    const view = managedModelAccess
      ? buildManagedModelPickerView(managedModelAccess, _ctx.selectedModel)
      : null;
    const more = view?.more ?? [];
    if (view?.current) appendModelRows([view.current]);
    if (view && view.recommended.length > 0) {
      modelDropdownEl.appendChild(
        el('div', { class: 'sp-model-group-header' }, t('spModelsRecommended')),
      );
      appendModelRows(view.recommended);
    }
    if (managedModelAccess === null) {
      modelDropdownEl.appendChild(el('div', { class: 'sp-menu-note' }, t('spModelsSignedOut')));
    }

    appendEffortSection();
    appendToggleRow(
      'sp-quick-mode-toggle',
      t('spQuickMode'),
      t('spQuickModeDescription'),
      _ctx.quickMode,
      applyQuickMode,
    );
    appendToggleRow(
      'sp-thinking-toggle',
      t('spThinking'),
      t('spThinkingDescription'),
      _ctx.thinkingEnabled,
      (next) => {
        _ctx.thinkingEnabled = next;
        chrome.storage.local.set({ agi_thinking_enabled: next }).catch(() => {});
        renderModelDropdown();
      },
    );
    appendWorkModeRow();

    if (more.length === 0) return;
    modelDropdownEl.appendChild(el('div', { class: 'sp-menu-heading' }, t('spMoreModels')));

    const grouped = new Map<string, ManagedModelPickerOption[]>();
    for (const option of more) {
      const providerKey = option.provider ?? UNKNOWN_PROVIDER_KEY;
      const bucket = grouped.get(providerKey);
      if (bucket) bucket.push(option);
      else grouped.set(providerKey, [option]);
    }

    const rendered = new Set<string>();
    for (const providerKey of PROVIDERS_IN_ORDER) {
      const options = grouped.get(providerKey);
      if (!options || options.length === 0) continue;
      rendered.add(providerKey);
      modelDropdownEl.appendChild(
        el('div', { class: 'sp-model-group-header' }, modelGroupHeading(providerKey)),
      );
      appendModelRows(options);
    }
    for (const [providerKey, options] of grouped.entries()) {
      if (rendered.has(providerKey)) continue;
      modelDropdownEl.appendChild(
        el('div', { class: 'sp-model-group-header' }, modelGroupHeading(providerKey)),
      );
      appendModelRows(options);
    }
  }
  function renderModelTrigger(): void {
    updateModelBadge(_ctx.selectedModel);
    const state = currentEffortState();
    const effortLabel =
      state.status === 'ready' && state.effort !== undefined
        ? EFFORT_LABEL[state.effort]
        : t('spEffortAuto');
    modelEffortBadge.textContent = state.status === 'ready' ? effortLabel : '';
    modelEffortBadge.hidden = state.status !== 'ready';
    modelModeBadge.hidden = _ctx.workMode !== 'agiwork';
    modelSelectorBtn.title = state.description;
    const menuLabelArgs = [getModelBadgeLabel(_ctx.selectedModel), effortLabel];
    modelSelectorBtn.setAttribute(
      'aria-label',
      _ctx.workMode === 'agiwork'
        ? t('spModelMenuAriaWork', menuLabelArgs)
        : t('spModelMenuAria', menuLabelArgs),
    );
  }
  refreshEffortUI = renderModelTrigger;

  refreshModelPickerUI = () => {
    renderModelDropdown();
    renderModelTrigger();
  };
  function positionModelDropdown(): void {
    const trigger = modelSelectorBtn.getBoundingClientRect();
    const viewportPadding = 12;
    modelDropdownEl.style.maxWidth = `${window.innerWidth - viewportPadding * 2}px`;
    const menuWidth = modelDropdownEl.getBoundingClientRect().width;
    const left = Math.max(
      viewportPadding,
      Math.min(trigger.left, window.innerWidth - menuWidth - viewportPadding),
    );
    const gap = 6;
    const availableBelow = Math.max(0, window.innerHeight - trigger.bottom - viewportPadding);
    const availableAbove = Math.max(0, trigger.top - viewportPadding);
    const openBelow = availableBelow >= 220 || availableBelow >= availableAbove;
    const available = openBelow ? availableBelow : availableAbove;
    modelDropdownEl.style.position = 'fixed';
    modelDropdownEl.style.top = openBelow ? `${trigger.bottom + gap}px` : 'auto';
    modelDropdownEl.style.right = 'auto';
    modelDropdownEl.style.bottom = openBelow
      ? 'auto'
      : `${window.innerHeight - trigger.top + gap}px`;
    modelDropdownEl.style.left = `${left}px`;
    modelDropdownEl.style.marginTop = '0';
    modelDropdownEl.style.maxHeight = `${Math.max(80, Math.min(280, available - gap))}px`;
  }
  modelSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpenNow = modelDropdownEl.classList.toggle('open');
    modelSelectorBtn.classList.toggle('open', isOpenNow);
    modelSelectorBtn.setAttribute('aria-expanded', String(isOpenNow));
    if (isOpenNow) {
      positionModelDropdown();
      modelDropdownEl.querySelector<HTMLButtonElement>('.sp-model-option.selected')?.focus();
    }
  });
  window.addEventListener('resize', () => {
    if (modelDropdownEl.classList.contains('open')) positionModelDropdown();
  });
  modelDropdownEl.addEventListener('keydown', (event: KeyboardEvent) => {
    const options = Array.from(
      modelDropdownEl.querySelectorAll<HTMLElement>(
        ".sp-model-option:not(:disabled), .sp-effort-option:not(:disabled):not([aria-disabled='true']), .sp-menu-toggle:not(:disabled)",
      ),
    );
    if (event.key === 'Escape') {
      event.preventDefault();
      modelDropdownEl.classList.remove('open');
      modelSelectorBtn.classList.remove('open');
      modelSelectorBtn.setAttribute('aria-expanded', 'false');
      modelSelectorBtn.focus();
      return;
    }
    if (event.key === 'Tab') {
      modelDropdownEl.classList.remove('open');
      modelSelectorBtn.classList.remove('open');
      modelSelectorBtn.setAttribute('aria-expanded', 'false');
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || options.length === 0) {
      return;
    }
    event.preventDefault();
    const current = Math.max(0, options.indexOf(document.activeElement as HTMLElement));
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : event.key === 'ArrowDown'
            ? (current + 1) % options.length
            : (current - 1 + options.length) % options.length;
    options[nextIndex]?.focus();
  });
  document.addEventListener('click', (e: MouseEvent) => {
    if (!modelSelectorWrap.contains(e.target as Node)) {
      modelDropdownEl.classList.remove('open');
      modelSelectorBtn.classList.remove('open');
      modelSelectorBtn.setAttribute('aria-expanded', 'false');
    }
  });
  chrome.storage.local.get(['agi_thinking_enabled', SELECTED_MODEL_STORAGE_KEY], (result) => {
    if (chrome.runtime.lastError) return;
    const storedThinking = result['agi_thinking_enabled'] as boolean | undefined;
    if (storedThinking !== undefined) {
      _ctx.thinkingEnabled = storedThinking;
    }
    const storedModel = result[SELECTED_MODEL_STORAGE_KEY] as string | undefined;
    if (storedModel) {
      _ctx.selectedModel = storedModel;
      newChatModelSelection = storedModel;
    }
    renderModelDropdown();
    renderModelTrigger();
  });
  chrome.storage.local.get(SELECTED_EFFORT_STORAGE_KEY, (result) => {
    if (chrome.runtime.lastError) return;
    const storedEffort = result[SELECTED_EFFORT_STORAGE_KEY];
    if (
      typeof storedEffort !== 'string' ||
      !Object.prototype.hasOwnProperty.call(EFFORT_LABEL, storedEffort)
    ) {
      return;
    }
    newChatEffortSelection = storedEffort as Effort;
    if (_ctx.messages.length === 0 && _ctx.reasoningEffort === undefined) {
      _ctx.reasoningEffort = effortForNewChat();
      refreshEffortUI();
    }
  });
  modelSelectorWrap.appendChild(modelSelectorBtn);
  modelSelectorWrap.appendChild(modelDropdownEl);

  const headerRight = el('div', { id: 'sp-header-right' });

  const historyBtn = el('button', {
    class: 'sp-icon-btn',
    id: 'sp-history-btn',
    title: 'Recent chats',
    'aria-label': 'Recent chats',
  });
  historyBtn.appendChild(renderIcon(Clock, 16));
  headerRight.appendChild(historyBtn);

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
    switchTab('chat');
  });
  headerRight.appendChild(newChatBtn);

  const quotaBadgeSlot = el('span', { id: 'sp-quota-badge-slot' });
  headerRight.appendChild(quotaBadgeSlot);

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

  const projectChip = el('div', { id: 'sp-project-chip', role: 'status', hidden: '' });
  const projectChipLabel = el('span', { id: 'sp-project-chip-label' });
  const projectChipClear = el(
    'button',
    {
      type: 'button',
      id: 'sp-project-chip-clear',
      'aria-label': t('spProjectsChipStopUse'),
      title: t('spProjectsChipStopUse'),
    },
    '\u00D7',
  );
  projectChip.appendChild(projectChipLabel);
  projectChip.appendChild(projectChipClear);
  document.body.appendChild(projectChip);

  function renderProjectChip(): void {
    const project = _ctx.activeProject;
    renderRecentProjects();
    if (!project) {
      projectChip.hidden = true;
      return;
    }
    projectChipLabel.textContent = t('spProjectsChip', [project.name]);
    projectChip.hidden = false;
  }

  function rememberProjectName(project: ActiveProjectSelection): void {
    projectNameById.set(project.id, project.name);
    void chrome.storage.local
      .set({ [PROJECT_NAME_CACHE_KEY]: Object.fromEntries(projectNameById) })
      .catch(() => undefined);
  }

  function selectActiveProject(project: ActiveProjectSelection | null): void {
    _ctx.activeProject = project;
    _ctx.pendingProjectBinding = project?.id ?? null;
    if (project) rememberProjectName(project);
    void chrome.storage.local.set({ [ACTIVE_PROJECT_KEY]: project }).catch(() => undefined);
    renderProjectChip();
    void persistMessages().catch(() => undefined);
  }

  function adoptConversationProject(projectId: string | undefined): void {
    if (!projectId) {
      _ctx.activeProject = null;
      renderProjectChip();
      return;
    }
    const name = projectNameById.get(projectId);
    _ctx.activeProject = name ? { id: projectId, name } : null;
    renderProjectChip();
  }

  projectChipClear.addEventListener('click', () => selectActiveProject(null));
  refreshProjectChip = renderProjectChip;
  adoptChatProject = adoptConversationProject;
  chrome.storage.local.get([ACTIVE_PROJECT_KEY, PROJECT_NAME_CACHE_KEY], (stored) => {
    if (chrome.runtime.lastError) return;
    hydrateProjectNameCache(stored[PROJECT_NAME_CACHE_KEY]);
    const restored = readStoredActiveProject(stored[ACTIVE_PROJECT_KEY]);
    if (!restored) return;
    _ctx.activeProject = restored;
    renderProjectChip();
  });

  function formatHistoryDate(ts: number): string {
    const elapsedMs = ts - Date.now();
    for (const step of RELATIVE_TIME_STEPS) {
      if (Math.abs(elapsedMs) >= step.ms || step.unit === 'minute') {
        return RELATIVE_TIME_FORMAT.format(Math.round(elapsedMs / step.ms), step.unit);
      }
    }
    return '';
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
      returnFollowUpsToComposer();
      _ctx.workMode = 'chat';
      _ctx.messages.length = 0;
      turnPayloadByMessageId.clear();
      _ctx.lastRenderedCount = 0;
      _ctx.needsMessageRebuild = true;
      _ctx.isStreaming = false;
      _ctx.currentStreamId = null;
      clearPendingPageContext();
      _ctx.conversationGeneration += 1;
      _ctx.conversationId = conversationOwner.conversationId;
      leaveTemporaryChat();
      adoptChatProject(entry.projectId);
      if (conversationOwner.forked) _ctx.pendingProjectBinding = entry.projectId ?? null;
      activePersistenceEntry = conversationOwner.forked ? undefined : entry;
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
      switchTab('chat');
      return true;
    } catch (err) {
      console.warn('[SidePanel] failed to open stored conversation:', err);
      return false;
    }
  };

  const bridgeUrlInput = el('input', {
    id: 'sp-bridge-url-input',
    type: 'hidden',
  }) as HTMLInputElement;
  document.body.appendChild(bridgeUrlInput);

  const drawerOverlay = el('div', { id: 'sp-drawer-overlay' });
  const drawer = el('div', {
    id: 'sp-drawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'AGI menu',
    inert: '',
  });

  let drawerReturnFocus: HTMLElement = menuBtn;

  function explainExtensionFailure(message: string): string {
    if (/Receiving end does not exist|Could not establish connection/i.test(message)) {
      return "AGI isn't running on this page yet. Reload the tab, then try again.";
    }
    if (/Cannot access|extension manifest|chrome:\/\/|blocked by the extension/i.test(message)) {
      return "AGI can't run on this page. Chrome blocks extensions on its own pages and on the Web Store, open an ordinary site and try again.";
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
    drawer.removeAttribute('inert');
    showDrawerMenu();
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
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      drawer.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((node) => node.getAttribute('aria-hidden') !== 'true' && !node.hasAttribute('hidden'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const drawerHeader = el('div', { id: 'sp-drawer-header' });
  const drawerBack = el('button', { id: 'sp-drawer-back', type: 'button', hidden: '' });
  drawerBack.setAttribute('aria-label', t('spMenuBack'));
  drawerBack.appendChild(renderIcon(ChevronRight, 14));
  drawerHeader.appendChild(drawerBack);
  const drawerTitle = el('h2', { id: 'sp-drawer-title' }, t('spMenuTitle'));
  drawerHeader.appendChild(drawerTitle);
  const drawerClose = el('button', { id: 'sp-drawer-close' });
  drawerClose.setAttribute('aria-label', t('spMenuClose'));
  drawerClose.appendChild(renderIcon(X, 14));
  drawerClose.addEventListener('click', closeDrawer);
  drawerHeader.appendChild(drawerClose);
  drawer.appendChild(drawerHeader);

  const drawerBody = el('div', { id: 'sp-drawer-body' });
  const drawerMenu = el('div', { id: 'sp-drawer-menu', role: 'menu' });
  drawerMenu.setAttribute('aria-label', t('spMenuTitle'));
  const drawerPage = el('div', { id: 'sp-drawer-page', hidden: '' });
  drawerBody.appendChild(drawerMenu);
  drawerBody.appendChild(drawerPage);

  interface DrawerGroup {
    label: string;
    body: HTMLElement;
    refresh?: () => void;
  }
  const drawerGroups: DrawerGroup[] = [];
  function drawerGroupBody(label: string, refresh?: () => void): HTMLElement {
    const body = el('div', { class: 'sp-drawer-group', hidden: '' });
    drawerGroups.push(refresh ? { label, body, refresh } : { label, body });
    drawerPage.appendChild(body);
    return body;
  }
  function showDrawerMenu(): void {
    for (const group of drawerGroups) group.body.hidden = true;
    drawerPage.hidden = true;
    drawerMenu.hidden = false;
    drawerBack.hidden = true;
    drawerTitle.textContent = t('spMenuTitle');
  }
  function openDrawerGroup(group: DrawerGroup): void {
    for (const entry of drawerGroups) entry.body.hidden = entry !== group;
    drawerMenu.hidden = true;
    drawerPage.hidden = false;
    drawerBack.hidden = false;
    drawerTitle.textContent = group.label;
    group.refresh?.();
  }
  drawerBack.addEventListener('click', showDrawerMenu);

  const chatActionsSection = el('div', { class: 'sp-drawer-section' });
  const chatActionsRow = el('div', { class: 'sp-drawer-tools-row' });

  const drawerHistoryBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-history-btn',
    title: 'Conversation history',
  });
  drawerHistoryBtn.appendChild(renderIcon(Clock, 13));
  drawerHistoryBtn.appendChild(document.createTextNode(' History'));

  const drawerHistoryList = el('div', { id: 'sp-drawer-history-list' });
  const drawerHistorySearch = el('input', {
    id: 'sp-drawer-history-search',
    type: 'search',
    placeholder: 'Search recent chats',
    'aria-label': 'Search recent chats',
    maxlength: '200',
    autocomplete: 'off',
    hidden: '',
  }) as HTMLInputElement;
  const drawerHistoryError = el('div', {
    class: 'sp-drawer-history-error',
    role: 'status',
    'aria-live': 'polite',
    hidden: '',
  });
  let drawerHistoryEntries: ConversationEntry[] = [];

  let showingArchived = false;

  function showHistoryStatus(text: string): void {
    drawerHistoryError.textContent = text;
    drawerHistoryError.removeAttribute('hidden');
  }

  async function changeHistoryEntry(
    entry: ConversationEntry,
    changes: ConversationEntryChanges,
    done: string,
  ): Promise<void> {
    const owner = _ctx.managedCloudOwner;
    if (!owner) return;
    const cloudConversationId = entry.cloudSync?.conversationId;
    const cloudFlags = {
      ...(changes.pinned !== undefined ? { pinned: changes.pinned } : {}),
      ...(changes.archived !== undefined ? { archived: changes.archived } : {}),
    };
    try {
      if (cloudConversationId && Object.keys(cloudFlags).length > 0) {
        await createExtensionCloudChatClient(owner).updateConversation(
          cloudConversationId,
          cloudFlags,
          { organizationId: entry.cloudSync?.organizationId ?? null },
        );
      }
      await updateConversationEntry(owner, entry.id, changes);
      if (cloudConversationId && Object.keys(cloudFlags).length > 0) {
        await recordCloudSyncState(owner, entry.id, {
          ...(changes.pinned !== undefined ? { syncedPinned: changes.pinned } : {}),
          ...(changes.archived !== undefined ? { syncedArchived: changes.archived } : {}),
        });
      }
    } catch (error) {
      console.warn('[SidePanel] history change failed:', error);
      showHistoryStatus(t('spHistoryChangeFailed'));
      return;
    }
    if (changes.customTitle !== undefined || changes.projectId !== undefined) {
      requestCloudConversationSync(entry.id);
    }
    if (changes.projectId !== undefined && entry.id === _ctx.conversationId) {
      adoptChatProject(changes.projectId ?? undefined);
    }
    if (changes.archived === true && entry.id === _ctx.conversationId) {
      cancelCurrentManagedStream(false);
      resetConversationView();
    }
    await refreshDrawerHistory();
    showHistoryStatus(done);
  }

  function buildHistoryEditor(
    item: HTMLElement,
    openButton: HTMLButtonElement,
    control: HTMLInputElement | HTMLSelectElement,
    save: () => void,
  ): void {
    const editor = el('div', { class: 'sp-drawer-history-edit' });
    const saveBtn = el(
      'button',
      { type: 'button', class: 'sp-drawer-history-edit-btn is-primary' },
      t('spHistorySave'),
    );
    const cancelBtn = el(
      'button',
      { type: 'button', class: 'sp-drawer-history-edit-btn' },
      t('spHistoryCancel'),
    );
    const more = item.querySelector<HTMLElement>('.sp-drawer-history-more-wrap');
    const close = (): void => {
      editor.remove();
      openButton.hidden = false;
      if (more) more.hidden = false;
      openButton.focus();
    };
    saveBtn.addEventListener('click', save);
    cancelBtn.addEventListener('click', close);
    control.addEventListener('keydown', (event: Event) => {
      const key = (event as KeyboardEvent).key;
      if (key === 'Enter') {
        event.preventDefault();
        save();
      } else if (key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    });
    editor.appendChild(control);
    editor.appendChild(saveBtn);
    editor.appendChild(cancelBtn);
    openButton.hidden = true;
    if (more) more.hidden = true;
    item.insertBefore(editor, openButton);
    control.focus();
  }

  function startHistoryRename(
    entry: ConversationEntry,
    item: HTMLElement,
    openButton: HTMLButtonElement,
  ): void {
    const input = el('input', {
      class: 'sp-drawer-history-edit-input',
      type: 'text',
      maxlength: '200',
      'aria-label': t('spHistoryRenameLabel'),
    }) as HTMLInputElement;
    input.value = entry.title;
    buildHistoryEditor(item, openButton, input, () => {
      const title = input.value.trim();
      void changeHistoryEntry(entry, { customTitle: title ? title : null }, t('spHistoryRenamed'));
    });
    input.select();
  }

  function startHistoryMove(
    entry: ConversationEntry,
    item: HTMLElement,
    openButton: HTMLButtonElement,
  ): void {
    const select = el('select', {
      class: 'sp-drawer-history-edit-input',
      'aria-label': t('spHistoryMoveLabel'),
    }) as HTMLSelectElement;
    select.appendChild(el('option', { value: '' }, t('spHistoryNoProject')));
    select.disabled = true;
    buildHistoryEditor(item, openButton, select, () => {
      if (select.disabled) return;
      const projectId = select.value || null;
      const projectName = select.selectedOptions[0]?.textContent ?? '';
      void changeHistoryEntry(
        entry,
        { projectId },
        projectId ? t('spHistoryMoved', [projectName]) : t('spHistoryMovedOut'),
      );
    });
    void listChromeProjects().then((result) => {
      if (result.status === 'error') {
        showHistoryStatus(result.message);
        return;
      }
      for (const project of result.projects) {
        select.appendChild(el('option', { value: project.id }, project.name));
      }
      select.value = entry.projectId ?? '';
      select.disabled = false;
      select.focus();
    });
  }

  function confirmHistoryDelete(
    entry: ConversationEntry,
    item: HTMLElement,
    trigger: HTMLButtonElement,
  ): void {
    item.querySelector('.sp-drawer-history-confirm')?.remove();
    const confirmRow = el('div', { class: 'sp-drawer-history-confirm', role: 'alertdialog' });
    const question = el(
      'p',
      { class: 'sp-drawer-history-confirm-text', id: `sp-history-confirm-${entry.id}` },
      entry.cloudSync?.conversationId
        ? t('spHistoryDeleteConfirmAccount')
        : t('spHistoryDeleteConfirmDevice'),
    );
    confirmRow.setAttribute('aria-labelledby', question.id);
    const deleteBtn = el(
      'button',
      { type: 'button', class: 'sp-drawer-history-edit-btn is-danger' },
      t('spHistoryDelete'),
    ) as HTMLButtonElement;
    const cancelBtn = el(
      'button',
      { type: 'button', class: 'sp-drawer-history-edit-btn' },
      t('spHistoryCancel'),
    );
    cancelBtn.addEventListener('click', () => {
      confirmRow.remove();
      trigger.focus();
    });
    confirmRow.addEventListener('keydown', (event: Event) => {
      if ((event as KeyboardEvent).key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      confirmRow.remove();
      trigger.focus();
    });
    deleteBtn.addEventListener('click', () => deleteHistoryEntry(entry, deleteBtn));
    confirmRow.appendChild(question);
    const actions = el('div', { class: 'sp-drawer-history-edit' });
    actions.appendChild(deleteBtn);
    actions.appendChild(cancelBtn);
    confirmRow.appendChild(actions);
    item.appendChild(confirmRow);
    deleteBtn.focus();
  }

  function confirmHistoryShare(
    entry: ConversationEntry,
    item: HTMLElement,
    trigger: HTMLButtonElement,
  ): void {
    item.querySelector('.sp-drawer-history-confirm')?.remove();
    const confirmRow = el('div', { class: 'sp-drawer-history-confirm', role: 'alertdialog' });
    const question = el(
      'p',
      { class: 'sp-drawer-history-share-text', id: `sp-history-share-${entry.id}` },
      t('spHistoryShareConfirm'),
    );
    confirmRow.setAttribute('aria-labelledby', question.id);
    const createBtn = el(
      'button',
      { type: 'button', class: 'sp-drawer-history-edit-btn is-primary' },
      t('spHistoryShareCreate'),
    ) as HTMLButtonElement;
    const cancelBtn = el(
      'button',
      { type: 'button', class: 'sp-drawer-history-edit-btn' },
      t('spHistoryCancel'),
    );
    const close = (): void => {
      confirmRow.remove();
      trigger.focus();
    };
    cancelBtn.addEventListener('click', close);
    confirmRow.addEventListener('keydown', (event: Event) => {
      if ((event as KeyboardEvent).key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      close();
    });
    createBtn.addEventListener('click', () => {
      createBtn.disabled = true;
      void (async () => {
        const auth = await getManagedCloudAuthContext();
        if (!auth) throw new Error(t('spHistoryShareSignIn'));
        const link = await createChromeShareLink(auth.token, {
          title: entry.title,
          messages: entry.messages.filter((message) => message.content.trim().length > 0),
          ...(entry.cloudSync?.conversationId
            ? { conversationId: entry.cloudSync.conversationId }
            : {}),
        });
        await navigator.clipboard.writeText(link.url);
        confirmRow.remove();
        const expires = link.expiresAt ? new Date(link.expiresAt) : null;
        showHistoryStatus(
          expires && !Number.isNaN(expires.getTime())
            ? t('spHistoryShareCopiedUntil', [expires.toLocaleDateString()])
            : t('spHistoryShareCopied'),
        );
        trigger.focus();
      })()
        .catch((error: unknown) => {
          showHistoryStatus(error instanceof Error ? error.message : t('spHistoryShareFailed'));
        })
        .finally(() => {
          createBtn.disabled = false;
        });
    });
    confirmRow.appendChild(question);
    confirmRow.appendChild(buildHelpArticleLink('sharing-conversations', t('spHelpLinkSharing')));
    const actions = el('div', { class: 'sp-drawer-history-edit' });
    actions.appendChild(createBtn);
    actions.appendChild(cancelBtn);
    confirmRow.appendChild(actions);
    item.appendChild(confirmRow);
    createBtn.focus();
  }

  function deleteHistoryEntry(entry: ConversationEntry, deleteBtn: HTMLButtonElement): void {
    const deletingCurrentConversation = entry.id === _ctx.conversationId;
    const deletionGeneration = _ctx.conversationGeneration;
    if (deletingCurrentConversation) cancelCurrentManagedStream(false);
    const owner = _ctx.managedCloudOwner;
    if (!owner) return;
    deleteBtn.disabled = true;
    showHistoryStatus(t('spHistoryDeleting'));
    void (async () => {
      const cloudConversationId = entry.cloudSync?.conversationId;
      if (cloudConversationId) {
        const organizationId = entry.cloudSync?.organizationId;
        if (organizationId === undefined) {
          throw new Error('Could not prove the account workspace for this chat deletion');
        }
        const response = (await chrome.runtime.sendMessage({
          type: 'DELETE_CLOUD_CONVERSATION',
          owner,
          cloudConversationId,
          organizationId,
        })) as { success?: boolean; error?: string } | undefined;
        if (response?.success !== true) {
          throw new Error(response?.error ?? 'Could not queue account chat deletion');
        }
      }
      await deleteConversation(owner, entry.id);
      if (
        deletingCurrentConversation &&
        _ctx.conversationId === entry.id &&
        _ctx.conversationGeneration === deletionGeneration
      ) {
        resetConversationView();
      }
      await refreshDrawerHistory();
      showHistoryStatus(t('spHistoryDeleted'));
    })()
      .catch((err) => {
        console.warn('[SidePanel] history delete failed:', err);
        showHistoryStatus(t('spHistoryDeleteFailed'));
      })
      .finally(() => {
        deleteBtn.disabled = false;
      });
  }

  function buildHistoryMenu(
    entry: ConversationEntry,
    item: HTMLElement,
    openButton: HTMLButtonElement,
  ): HTMLElement {
    const wrapper = el('div', { class: 'sp-drawer-history-more-wrap' });
    const moreBtn = el('button', {
      class: 'sp-drawer-history-more',
      type: 'button',
      title: t('spHistoryMore'),
      'aria-label': t('spHistoryMoreNamed', [entry.title]),
    }) as HTMLButtonElement;
    moreBtn.appendChild(renderIcon(Ellipsis, 14));
    const menu = el('div', {
      class: 'sp-history-menu',
      role: 'menu',
      'aria-label': t('spHistoryMoreNamed', [entry.title]),
    });
    const handle = wirePopupMenu(moreBtn, menu);
    const addItem = (label: string, run: () => void, danger = false): void => {
      const menuItem = el(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          class: danger ? 'sp-history-menu-item is-danger' : 'sp-history-menu-item',
        },
        label,
      );
      menuItem.addEventListener('click', () => {
        handle.close();
        run();
      });
      menu.appendChild(menuItem);
    };
    addItem(t('spHistoryShare'), () => confirmHistoryShare(entry, item, moreBtn));
    addItem(t('spHistoryRename'), () => startHistoryRename(entry, item, openButton));
    if (!entry.archived) {
      addItem(entry.pinned ? t('spHistoryUnpin') : t('spHistoryPin'), () => {
        void changeHistoryEntry(
          entry,
          { pinned: !entry.pinned },
          entry.pinned ? t('spHistoryUnpinned') : t('spHistoryPinned'),
        );
      });
      addItem(t('spHistoryMove'), () => startHistoryMove(entry, item, openButton));
    }
    if (entry.cloudSync?.conversationId) {
      addItem(entry.archived ? t('spHistoryUnarchive') : t('spHistoryArchive'), () => {
        void changeHistoryEntry(
          entry,
          { archived: !entry.archived },
          entry.archived ? t('spHistoryUnarchived') : t('spHistoryArchivedDone'),
        );
      });
    }
    addItem(t('spHistoryDelete'), () => confirmHistoryDelete(entry, item, moreBtn), true);
    wrapper.appendChild(moreBtn);
    wrapper.appendChild(menu);
    return wrapper;
  }

  function renderDrawerHistory(entries: ConversationEntry[]): void {
    clearChildren(drawerHistoryList);
    drawerHistorySearch.hidden = entries.length <= RECENTS_SEARCH_THRESHOLD;
    archivedToggle.hidden = !entries.some((entry) => entry.archived) && !showingArchived;
    archivedToggle.setAttribute('aria-pressed', String(showingArchived));
    const listed = entries.filter((entry) => Boolean(entry.archived) === showingArchived);
    const ordered = [
      ...listed.filter((entry) => entry.pinned),
      ...listed.filter((entry) => !entry.pinned),
    ];
    const filteredEntries = filterConversations(ordered, drawerHistorySearch.value);
    if (filteredEntries.length === 0) {
      const emptyLabel = showingArchived
        ? t('spHistoryArchivedEmpty')
        : entries.length === 0
          ? 'No saved conversations'
          : 'No matching conversations';
      const empty = el('div', { class: 'sp-drawer-history-empty' }, emptyLabel);
      drawerHistoryList.appendChild(empty);
      return;
    }
    for (const entry of filteredEntries) {
      const active = entry.id === _ctx.conversationId;
      const item = el('div', {
        class: active ? 'sp-drawer-history-item is-active' : 'sp-drawer-history-item',
      });
      const openButton = el('button', {
        class: 'sp-drawer-history-open',
        type: 'button',
        'data-conversation-restore': 'true',
        'aria-label': `Open chat: ${entry.title}`,
        ...(active ? { 'aria-current': 'page' } : {}),
      }) as HTMLButtonElement;
      openButton.disabled = _ctx.isStreaming || historyRestoreInProgress;

      const persistence = conversationPersistencePresentation(entry);
      const badge = el('span', {
        class: 'sp-drawer-history-badge',
        'data-state': persistence.state,
        'aria-label': `${persistence.label}. ${persistence.detail}`,
      });
      badge.setAttribute('title', badge.getAttribute('aria-label') ?? '');
      badge.appendChild(renderIcon(persistence.cloudIcon ? Globe : Monitor, 12));
      openButton.appendChild(badge);

      openButton.appendChild(el('span', { class: 'sp-drawer-history-bullet' }));
      const textCol = el('div', { class: 'sp-drawer-history-text' });
      const title = el('div', { class: 'sp-drawer-history-title' }, entry.title);
      const date = el(
        'div',
        { class: 'sp-drawer-history-date' },
        entry.pinned
          ? `${t('spHistoryPinnedMarker')} · ${formatHistoryDate(entry.savedAt)}`
          : formatHistoryDate(entry.savedAt),
      );
      textCol.appendChild(title);
      textCol.appendChild(date);
      openButton.appendChild(textCol);
      item.appendChild(openButton);

      item.appendChild(buildHistoryMenu(entry, item, openButton));

      openButton.addEventListener('click', () => {
        drawerHistoryError.textContent = t('spHistoryOpening');
        drawerHistoryError.removeAttribute('hidden');
        void openStoredConversation(entry.id).then((opened) => {
          if (opened) {
            drawerHistoryError.setAttribute('hidden', '');
            closeRecents();
            return;
          }
          drawerHistoryError.textContent = _ctx.isStreaming
            ? t('spHistoryStopBeforeOpen')
            : t('spHistoryOpenFailed');
          drawerHistoryError.removeAttribute('hidden');
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

  async function pullDrawerHistoryFlags(): Promise<void> {
    const owner = _ctx.managedCloudOwner;
    if (!owner) return;
    try {
      if (!(await pullCloudConversationFlags(owner))) return;
    } catch (error) {
      console.warn('[SidePanel] reading pins and archives from the account failed:', error);
      return;
    }
    if (sameManagedCloudOwner(_ctx.managedCloudOwner, owner)) await refreshDrawerHistory();
  }

  drawerHistorySearch.addEventListener('input', () => {
    renderDrawerHistory(drawerHistoryEntries);
  });

  drawerHistoryBtn.addEventListener('click', () => {
    closeDrawer();
    openRecents();
  });
  chatActionsRow.appendChild(drawerHistoryBtn);

  historyBtn.addEventListener('click', openRecents);

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

  chatActionsSection.appendChild(chatActionsRow);

  const recentsSheet = el('div', { id: 'sp-recents', role: 'dialog', 'aria-modal': 'true' });
  recentsSheet.hidden = true;
  recentsSheet.setAttribute('aria-label', t('spRecentsTitle'));
  const recentsHeader = el('div', { id: 'sp-recents-header' });
  recentsHeader.appendChild(el('h2', { id: 'sp-recents-title' }, t('spRecentsTitle')));
  const archivedToggle = el(
    'button',
    { id: 'sp-recents-archived', type: 'button', 'aria-pressed': 'false', hidden: '' },
    t('spHistoryShowArchived'),
  );
  archivedToggle.addEventListener('click', () => {
    showingArchived = !showingArchived;
    renderDrawerHistory(drawerHistoryEntries);
  });
  recentsHeader.appendChild(archivedToggle);
  const recentsClose = el('button', { id: 'sp-recents-close', type: 'button' });
  recentsClose.setAttribute('aria-label', t('spRecentsClose'));
  recentsClose.appendChild(renderIcon(X, 14));
  recentsHeader.appendChild(recentsClose);
  recentsSheet.appendChild(recentsHeader);
  recentsSheet.appendChild(drawerHistorySearch);
  recentsSheet.appendChild(drawerHistoryError);
  recentsSheet.appendChild(drawerHistoryList);
  document.body.appendChild(recentsSheet);

  function closeRecents(): void {
    if (recentsSheet.hidden) return;
    recentsSheet.hidden = true;
    historyBtn.focus();
  }
  function openRecents(): void {
    recentsSheet.hidden = false;
    drawerHistoryError.setAttribute('hidden', '');
    void refreshDrawerHistory()
      .then(() => {
        if (!drawerHistorySearch.hidden) drawerHistorySearch.focus();
        else recentsClose.focus();
        void pullDrawerHistoryFlags();
      })
      .catch(() => recentsClose.focus());
  }
  recentsClose.addEventListener('click', closeRecents);
  recentsSheet.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    closeRecents();
  });

  const chatGroupBody = drawerGroupBody(t('spMenuChat'));
  chatGroupBody.appendChild(chatActionsSection);

  const viewsSection = el('div', { class: 'sp-drawer-section' });

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

  const runsLaunchBtn = el('button', {
    class: 'sp-drawer-launcher-btn',
    id: 'sp-drawer-runs-btn',
    title: 'Open Work runs',
  });
  const runsIcon = el('div', { class: 'sp-drawer-launcher-icon' });
  runsIcon.appendChild(renderIcon(Play, 14));
  const runsTextBlock = el('div', { class: 'sp-drawer-launcher-label' });
  runsTextBlock.appendChild(el('div', {}, 'Work runs'));
  runsTextBlock.appendChild(
    el('div', { class: 'sp-drawer-launcher-desc' }, 'Runs you started on any device'),
  );
  runsLaunchBtn.appendChild(runsIcon);
  runsLaunchBtn.appendChild(runsTextBlock);
  runsLaunchBtn.appendChild(el('span', { class: 'sp-drawer-launcher-chevron' }, '\u203A'));
  runsLaunchBtn.addEventListener('click', () => {
    closeDrawer();
    switchTab('cloud-runs');
  });
  viewsSection.appendChild(runsLaunchBtn);

  const pageLaunchBtn = el('button', {
    class: 'sp-drawer-launcher-btn',
    id: 'sp-drawer-page-btn',
    title: 'Open page downloads, console and network',
  });
  const pageIcon = el('div', { class: 'sp-drawer-launcher-icon' });
  pageIcon.appendChild(renderIcon(Terminal, 14));
  const pageTextBlock = el('div', { class: 'sp-drawer-launcher-label' });
  pageTextBlock.appendChild(el('div', {}, 'Page'));
  pageTextBlock.appendChild(
    el('div', { class: 'sp-drawer-launcher-desc' }, 'Downloads, console and network'),
  );
  pageLaunchBtn.appendChild(pageIcon);
  pageLaunchBtn.appendChild(pageTextBlock);
  pageLaunchBtn.appendChild(el('span', { class: 'sp-drawer-launcher-chevron' }, '\u203A'));
  pageLaunchBtn.addEventListener('click', () => {
    closeDrawer();
    switchTab('page');
  });
  viewsSection.appendChild(pageLaunchBtn);
  const automateGroupBody = drawerGroupBody(t('spMenuAutomate'));
  automateGroupBody.appendChild(viewsSection);

  const projectsDrawer: ProjectsDrawerAPI = buildProjectsDrawerSection({
    getActiveProject: () => _ctx.activeProject,
    setActiveProject: (project) => selectActiveProject(project),
    openConversation: (conversationId) => {
      void chrome.tabs.create({
        url: `${FREE_TRIAL_GATEWAY}/chat/${encodeURIComponent(conversationId)}?from=chrome-extension`,
      });
    },
  });
  drawerGroupBody(t('spMenuProjects'), () => {
    void projectsDrawer.refresh();
  }).appendChild(projectsDrawer.sectionEl);

  const artifactsDrawer: ArtifactsDrawerAPI = buildArtifactsDrawerSection();
  drawerGroupBody(t('spMenuArtifacts'), () => {
    void artifactsDrawer.refresh();
  }).appendChild(artifactsDrawer.sectionEl);

  const toolsSection = el('div', { class: 'sp-drawer-section' });
  const toolsRow = el('div', { class: 'sp-drawer-tools-row' });

  const drawerCaptureBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-capture-btn',
    title: 'Capture page screenshot',
  });
  drawerCaptureBtn.appendChild(renderIcon(Camera, 13));
  drawerCaptureBtn.appendChild(document.createTextNode(t('spDrawerCapture')));
  drawerCaptureBtn.addEventListener('click', async () => {
    drawerCaptureBtn.textContent = t('spDrawerCapturing');
    (drawerCaptureBtn as HTMLButtonElement).disabled = true;
    try {
      const res = (await chrome.runtime.sendMessage({
        type: 'CAPTURE_SCREENSHOT',
        format: 'png',
        quality: 90,
      })) as { success: boolean; data?: string; error?: string };
      if (res.success && res.data) {
        composerAttachmentNotices = [];
        const admitted = admitComposerAttachment(res.data, t('spScreenshotName'));
        updateAttachmentPreview();
        if (!admitted) {
          throw new Error(
            composerAttachmentNotices[composerAttachmentNotices.length - 1] ??
              t('spAttachmentCaptureFailed'),
          );
        }
        drawerCaptureBtn.textContent = t('spDrawerCaptured');
        drawerCaptureBtn.classList.add('active');
        closeDrawer();
        switchTab('chat');
        inputEl.focus();
        setTimeout(() => {
          drawerCaptureBtn.replaceChildren(
            renderIcon(Camera, 13),
            document.createTextNode(t('spDrawerCapture')),
          );
          drawerCaptureBtn.classList.remove('active');
          (drawerCaptureBtn as HTMLButtonElement).disabled = false;
        }, 1500);
      } else {
        throw new Error(res.error ?? 'No screenshot data returned');
      }
    } catch {
      drawerCaptureBtn.textContent = t('spDrawerCaptureFailed');
      setTimeout(() => {
        drawerCaptureBtn.replaceChildren(
          renderIcon(Camera, 13),
          document.createTextNode(t('spDrawerCapture')),
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
        refreshDrawerTabInfo(),
      ]);
    } finally {
      (drawerRefreshBtn as HTMLButtonElement).disabled = false;
    }
  });
  toolsRow.appendChild(drawerRefreshBtn);

  const drawerGroupBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-group-btn',
    title: 'Add current tab to group',
  });
  drawerGroupBtn.appendChild(renderIcon(Folder, 13));
  const drawerGroupLabel = document.createTextNode(t('spDrawerGroupTab'));
  drawerGroupBtn.appendChild(drawerGroupLabel);
  drawerGroupBtn.addEventListener('click', () => {
    requestTabGroupChange(!currentTabGrouped);
  });
  registerTabGroupStateRenderer((grouped, known) => {
    drawerGroupBtn.disabled = !known;
    drawerGroupLabel.textContent = grouped ? t('spDrawerUngroupTab') : t('spDrawerGroupTab');
    drawerGroupBtn.classList.toggle('active', grouped && known);
    drawerGroupBtn.title = known
      ? grouped
        ? t('spTabGroupRemoveTitle')
        : t('spTabGroupAddTitle')
      : t('spTabGroupChecking');
  });
  toolsRow.appendChild(drawerGroupBtn);

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
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/options.html') });
  });
  toolsRow.appendChild(drawerOptionsBtn);

  const drawerHelpBtn = el('button', {
    class: 'sp-drawer-tool-btn',
    id: 'sp-drawer-help-btn',
    title: 'Open the AGI help centre',
  });
  drawerHelpBtn.appendChild(renderIcon(CircleHelp, 13));
  drawerHelpBtn.appendChild(document.createTextNode(' Get help'));
  drawerHelpBtn.addEventListener('click', () => {
    void chrome.tabs.create({ url: HELP_URL });
  });
  toolsRow.appendChild(drawerHelpBtn);

  toolsSection.appendChild(toolsRow);
  const toolsGroupBody = drawerGroupBody(t('spMenuTools'), () => {
    void refreshDrawerTabInfo();
    refreshTabGroupUI();
  });
  toolsGroupBody.appendChild(toolsSection);

  const pairingSection = el('div', { class: 'sp-drawer-section' });

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

  const pairingCodeRow = el('div', { class: 'sp-drawer-pairing-code-row', hidden: '' });
  const pairingCodeHint = el(
    'div',
    { class: 'sp-drawer-pairing-hint', id: 'sp-drawer-pairing-hint' },
    t('spPairingCodeHint'),
  );
  const pairingCodeInput = el('input', {
    type: 'text',
    class: 'sp-drawer-pairing-code-input',
    id: 'sp-drawer-pairing-code-input',
    placeholder: t('spPairingCodePlaceholder'),
    autocomplete: 'off',
    spellcheck: 'false',
    maxlength: '12',
    'aria-label': t('spPairingCodeHint'),
  }) as HTMLInputElement;
  const pairingCodeSubmitBtn = el(
    'button',
    { class: 'sp-drawer-btn sp-drawer-btn-primary', id: 'sp-drawer-pairing-code-submit' },
    t('spPairingCodeSubmit'),
  );
  pairingCodeRow.appendChild(pairingCodeHint);
  pairingCodeRow.appendChild(pairingCodeInput);
  pairingCodeRow.appendChild(pairingCodeSubmitBtn);
  pairingSection.appendChild(pairingCodeRow);

  const pairingSecretRow = el('div', { class: 'sp-drawer-pairing-code-row' });
  pairingSecretRow.appendChild(
    el('div', { class: 'sp-drawer-pairing-hint' }, t('spPairingSecretHint')),
  );
  const pairingSecretInput = el('input', {
    type: 'password',
    class: 'sp-drawer-pairing-code-input',
    id: 'sp-drawer-bridge-secret-input',
    placeholder: t('spPairingSecretPlaceholder'),
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': t('spPairingSecretHint'),
  }) as HTMLInputElement;
  const pairingSecretSaveBtn = el(
    'button',
    { class: 'sp-drawer-btn', id: 'sp-drawer-bridge-secret-save' },
    t('spPairingSecretSave'),
  );
  pairingSecretRow.appendChild(pairingSecretInput);
  pairingSecretRow.appendChild(pairingSecretSaveBtn);
  pairingSection.appendChild(pairingSecretRow);

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
    const awaitingCode = state.phase === 'awaiting-code' || state.phase === 'confirming';
    if (awaitingCode) {
      pairingCodeRow.removeAttribute('hidden');
    } else {
      pairingCodeRow.setAttribute('hidden', '');
      pairingCodeInput.value = '';
    }
    (pairingCodeInput as HTMLInputElement).disabled = state.phase === 'confirming';
    (pairingCodeSubmitBtn as HTMLButtonElement).disabled = state.phase === 'confirming';

    if (state.phase === 'idle' || state.phase === 'error') {
      pairingSecretRow.removeAttribute('hidden');
    } else {
      pairingSecretRow.setAttribute('hidden', '');
    }

    switch (state.phase) {
      case 'idle':
        pairingLabel.textContent = t('spPairingIdle');
        pairingFingerprint.setAttribute('hidden', '');
        drawerPairBtn.textContent = t('spPairingPair');
        (drawerPairBtn as HTMLButtonElement).disabled = false;
        drawerPairBtn.removeAttribute('hidden');
        drawerUnpairBtn.setAttribute('hidden', '');
        break;
      case 'requesting':
        pairingLabel.textContent = t('spPairingInProgress');
        pairingFingerprint.setAttribute('hidden', '');
        drawerPairBtn.textContent = t('spPairingInProgress');
        (drawerPairBtn as HTMLButtonElement).disabled = true;
        drawerUnpairBtn.setAttribute('hidden', '');
        break;
      case 'awaiting-code':
        pairingLabel.textContent = t('spPairingAwaitingCode');
        pairingFingerprint.setAttribute('hidden', '');
        pairingCodeSubmitBtn.textContent = t('spPairingCodeSubmit');
        drawerPairBtn.setAttribute('hidden', '');
        drawerUnpairBtn.setAttribute('hidden', '');
        if (state.error) pairingError.textContent = state.error;
        break;
      case 'confirming':
        pairingLabel.textContent = t('spPairingInProgress');
        pairingFingerprint.setAttribute('hidden', '');
        pairingCodeSubmitBtn.textContent = t('spPairingInProgress');
        drawerPairBtn.setAttribute('hidden', '');
        drawerUnpairBtn.setAttribute('hidden', '');
        break;
      case 'paired':
        pairingLabel.textContent = t('spPairingPaired');
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
        pairingLabel.textContent = t('spPairingFailed');
        pairingFingerprint.setAttribute('hidden', '');
        if (state.error) pairingError.textContent = state.error;
        drawerPairBtn.textContent = t('spPairingRetry');
        (drawerPairBtn as HTMLButtonElement).disabled = false;
        drawerPairBtn.removeAttribute('hidden');
        drawerUnpairBtn.setAttribute('hidden', '');
        break;
    }
  }

  drawerPairBtn.addEventListener('click', async () => {
    applyDrawerPairingState({
      phase: 'requesting',
      fingerprint: null,
      error: null,
      requestId: null,
      codeLength: null,
      expiresAt: null,
    });
    const next = await beginPairing();
    applyDrawerPairingState(next);
  });
  pairingCodeSubmitBtn.addEventListener('click', async () => {
    const next = await submitPairingCode(pairingCodeInput.value);
    applyDrawerPairingState(next);
  });
  pairingSecretSaveBtn.addEventListener('click', async () => {
    const stored = await storeBridgeSecret(pairingSecretInput.value);
    pairingSecretInput.value = '';
    if (stored.phase === 'error') {
      applyDrawerPairingState(stored);
      return;
    }
    applyDrawerPairingState(await beginPairing());
  });
  pairingCodeInput.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key !== 'Enter') return;
    event.preventDefault();
    void submitPairingCode(pairingCodeInput.value).then(applyDrawerPairingState);
  });
  drawerUnpairBtn.addEventListener('click', async () => {
    const next = await unpair();
    applyDrawerPairingState(next);
  });

  pairingBtnRow.appendChild(drawerPairBtn);
  pairingBtnRow.appendChild(drawerUnpairBtn);
  pairingSection.appendChild(pairingBtnRow);
  drawerGroupBody(t('spMenuPairing'), () => {
    void refreshDrawerPairingState();
  }).appendChild(pairingSection);

  async function refreshDrawerPairingState(): Promise<void> {
    const state = await loadPairingState();
    applyDrawerPairingState(state);
  }

  const inPageSection = el('div', { class: 'sp-drawer-section' });
  inPageSection.appendChild(el('h3', { class: 'sp-drawer-section-title' }, 'In-Page Panel'));
  const inPageRow = el('div', { class: 'sp-drawer-toggle-row' });
  inPageRow.appendChild(
    el('span', { class: 'sp-drawer-toggle-label' }, t('spPageAssistantOverlay')),
  );
  const inPageToggle = el('input', {
    type: 'checkbox',
    class: 'sp-drawer-toggle-switch',
    id: 'sp-drawer-in-page-toggle',
    'aria-label': t('spPageAssistantToggleAria'),
  }) as HTMLInputElement;
  inPageToggle.checked = true;
  chrome.storage.local.get(SP_IN_PAGE_PANEL_ENABLED_KEY, (result) => {
    if (chrome.runtime.lastError) return;
    const val = result[SP_IN_PAGE_PANEL_ENABLED_KEY] as boolean | undefined;
    inPageToggle.checked = val !== false;
  });
  const inPageToggleStatus = el('div', {
    class: 'sp-drawer-toggle-status',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
  inPageToggle.addEventListener('change', async () => {
    const next = inPageToggle.checked;
    inPageToggle.disabled = true;
    inPageToggleStatus.textContent = t('spPageAssistantSaving');
    inPageToggleStatus.removeAttribute('data-kind');
    try {
      await chrome.storage.local.set({ [SP_IN_PAGE_PANEL_ENABLED_KEY]: next });
      inPageToggleStatus.textContent = next
        ? t('spPageAssistantEnabled')
        : t('spPageAssistantDisabled');
    } catch {
      inPageToggle.checked = !next;
      inPageToggleStatus.textContent = t('spPreferenceSaveFailed');
      inPageToggleStatus.setAttribute('data-kind', 'error');
    } finally {
      inPageToggle.disabled = false;
    }
  });
  inPageRow.appendChild(inPageToggle);
  inPageSection.appendChild(inPageRow);
  inPageSection.appendChild(
    el('div', { class: 'sp-drawer-toggle-status' }, t('spPageAssistantOneShot')),
  );
  inPageSection.appendChild(inPageToggleStatus);
  const settingsGroupBody = drawerGroupBody(t('spMenuSettings'), () => {
    void refreshDrawerAllowlist();
    void refreshDrawerMemory();
    void refreshModelUsageHistory();
  });
  settingsGroupBody.appendChild(inPageSection);

  const dictationSection = el('div', { class: 'sp-drawer-section' });
  dictationSection.appendChild(
    el('h3', { class: 'sp-drawer-section-title' }, t('spDictationSectionTitle')),
  );
  const dictationRow = el('div', { class: 'sp-drawer-toggle-row' });
  dictationRow.appendChild(
    el('span', { class: 'sp-drawer-toggle-label' }, t('spDictationLanguageLabel')),
  );
  const dictationSelect = el('select', {
    class: 'sp-wf-form-select',
    id: 'sp-drawer-dictation-language',
    'aria-label': t('spDictationLanguageAria'),
    style: 'width: auto; max-width: 60%;',
  }) as HTMLSelectElement;
  dictationRow.appendChild(dictationSelect);
  dictationSection.appendChild(dictationRow);
  dictationSection.appendChild(
    el('div', { class: 'sp-drawer-toggle-status' }, t('spDictationLanguageHelp')),
  );
  const dictationStatus = el('div', {
    class: 'sp-drawer-toggle-status',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
  });
  dictationSection.appendChild(dictationStatus);
  void (async () => {
    const stored = await readDictationLanguage();
    const choices = dictationLanguageChoices(stored, navigator);
    if (choices.length === 0) {
      dictationSelect.disabled = true;
      dictationStatus.textContent = t('spDictationLanguageUnavailable');
      return;
    }
    for (const choice of choices) {
      dictationSelect.appendChild(el('option', { value: choice.tag }, choice.label));
    }
    dictationSelect.value = resolveDictationLanguage(stored, navigator) ?? choices[0]!.tag;
  })();
  dictationSelect.addEventListener('change', async () => {
    const next = dictationSelect.value;
    dictationSelect.disabled = true;
    dictationStatus.removeAttribute('data-kind');
    try {
      await writeDictationLanguage(next);
      dictationStatus.textContent = t('spDictationLanguageSaved');
    } catch {
      dictationStatus.textContent = t('spPreferenceSaveFailed');
      dictationStatus.setAttribute('data-kind', 'error');
    } finally {
      dictationSelect.disabled = false;
    }
  });
  settingsGroupBody.appendChild(dictationSection);

  const allowlistSection = el('div', { class: 'sp-drawer-section' });
  allowlistSection.appendChild(el('h3', { class: 'sp-drawer-section-title' }, 'Site Allowlist'));
  allowlistSection.appendChild(
    el(
      'p',
      { class: 'sp-drawer-allowlist-help' },
      'Approved sites are where the in-page assistant, page tools and job autofill can run. The in-page assistant can send up to 30,000 characters of redacted visible page text from an approved site to AGI Cloud. Browser control for computer use is granted per site in Settings. Add the current site, then reload it.',
    ),
  );

  const allowlistCurrentRow = el('div', { class: 'sp-drawer-allowlist-current-row' });
  const allowlistOriginLabel = el(
    'span',
    {
      class: 'sp-drawer-allowlist-origin',
      id: 'sp-drawer-allowlist-origin',
    },
    ', ',
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
  const allowlistStatus = el('div', {
    class: 'sp-drawer-allowlist-status',
    id: 'sp-drawer-allowlist-status',
    role: 'alert',
    hidden: '',
  });
  allowlistSection.appendChild(allowlistList);
  allowlistSection.appendChild(allowlistEmpty);
  allowlistSection.appendChild(allowlistStatus);
  settingsGroupBody.appendChild(allowlistSection);

  let currentAllowlistOrigin: string | null = null;
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
        await removeApprovedSiteHostPermission(origin);
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
    currentAllowlistOrigin = origin;
    allowlistStatus.setAttribute('hidden', '');
    allowlistOriginLabel.textContent = origin ?? t('spAllowlistNoSite');
    (allowlistToggleBtn as HTMLButtonElement).disabled = !origin;
    if (origin) {
      const present = list.includes(origin);
      allowlistToggleBtn.textContent = present ? t('spAllowlistRemove') : t('spAllowlistAdd');
      allowlistToggleBtn.classList.toggle('is-remove', present);
    } else {
      allowlistToggleBtn.textContent = t('spAllowlistAdd');
      allowlistToggleBtn.classList.remove('is-remove');
    }
    await renderDrawerAllowlistList(list, origin);
  }
  allowlistToggleBtn.addEventListener('click', async () => {
    const origin = currentAllowlistOrigin;
    if (!origin) return;
    allowlistStatus.setAttribute('hidden', '');
    const removing = allowlistToggleBtn.classList.contains('is-remove');
    if (removing) {
      await removeApprovedSiteHostPermission(origin);
      const list = await drawerReadAllowlist();
      await drawerWriteAllowlist(list.filter((o) => o !== origin));
      await refreshDrawerAllowlist();
      return;
    }
    // Must be the first await after the click: Chrome only honours
    // chrome.permissions.request inside the still-live user gesture, and the
    // allowlist must never claim a site is approved when Chrome refused it
    // the read access page context actually needs.
    const hostGranted = await requestApprovedSiteHostPermission(origin);
    if (!hostGranted) {
      allowlistStatus.textContent = t('spAllowlistHostPermissionRefused', [origin]);
      allowlistStatus.removeAttribute('hidden');
      return;
    }
    const list = await drawerReadAllowlist();
    await drawerWriteAllowlist(list.includes(origin) ? list : [...list, origin]);
    await refreshDrawerAllowlist();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SP_SITE_ALLOWLIST_KEY] && drawer.classList.contains('open')) {
      void refreshDrawerAllowlist();
    }
  });

  const personalizationSection = el('div', { class: 'sp-drawer-section' });
  personalizationSection.appendChild(
    el('h3', { class: 'sp-drawer-section-title' }, t('spPersonalizationTitle')),
  );
  personalizationSection.appendChild(
    el('p', { class: 'sp-drawer-memory-help' }, t('spPersonalizationHelp')),
  );
  const personalizationBody = el('div', { class: 'sp-drawer-personalization', hidden: '' });
  personalizationBody.appendChild(
    el(
      'label',
      { class: 'sp-drawer-toggle-label', for: 'sp-drawer-instructions' },
      t('spInstructionsLabel'),
    ),
  );
  const instructionsInput = el('textarea', {
    id: 'sp-drawer-instructions',
    class: 'sp-drawer-memory-textarea',
    maxlength: String(MAX_CUSTOM_INSTRUCTIONS_CHARS),
    placeholder: t('spInstructionsPlaceholder'),
  }) as HTMLTextAreaElement;
  personalizationBody.appendChild(instructionsInput);
  const instructionsToggle = el('input', {
    type: 'checkbox',
    id: 'sp-drawer-instructions-enabled',
  }) as HTMLInputElement;
  personalizationBody.appendChild(
    el(
      'div',
      { class: 'sp-drawer-memory-preference' },
      instructionsToggle,
      el('label', { for: 'sp-drawer-instructions-enabled' }, t('spInstructionsEnabled')),
    ),
  );
  const instructionsSaveBtn = el(
    'button',
    { type: 'button', class: 'sp-drawer-memory-add-btn' },
    t('spInstructionsSave'),
  ) as HTMLButtonElement;
  personalizationBody.appendChild(instructionsSaveBtn);
  const responseStyleLabels: Record<ResponseStyle, string> = {
    default: t('spResponseStyleDefault'),
    concise: t('spResponseStyleConcise'),
    explanatory: t('spResponseStyleExplanatory'),
    formal: t('spResponseStyleFormal'),
  };
  const responseLengthLabels: Record<PreferredLength, string> = {
    default: t('spResponseLengthDefault'),
    shorter: t('spResponseLengthShorter'),
    longer: t('spResponseLengthLonger'),
  };
  const responseStyleSelect = el('select', {
    class: 'sp-wf-form-select',
    id: 'sp-drawer-response-style',
    style: 'width: auto; max-width: 60%;',
  }) as HTMLSelectElement;
  for (const style of RESPONSE_STYLES) {
    responseStyleSelect.appendChild(el('option', { value: style }, responseStyleLabels[style]));
  }
  const responseLengthSelect = el('select', {
    class: 'sp-wf-form-select',
    id: 'sp-drawer-response-length',
    style: 'width: auto; max-width: 60%;',
  }) as HTMLSelectElement;
  for (const length of PREFERRED_LENGTHS) {
    responseLengthSelect.appendChild(el('option', { value: length }, responseLengthLabels[length]));
  }
  for (const [id, label, select] of [
    ['sp-drawer-response-style', t('spResponseStyleLabel'), responseStyleSelect],
    ['sp-drawer-response-length', t('spResponseLengthLabel'), responseLengthSelect],
  ] as const) {
    const row = el('div', { class: 'sp-drawer-toggle-row' });
    row.appendChild(el('label', { class: 'sp-drawer-toggle-label', for: id }, label));
    row.appendChild(select);
    personalizationBody.appendChild(row);
  }
  const personalizationStatus = el('div', {
    class: 'sp-drawer-toggle-status',
    role: 'status',
    'aria-live': 'polite',
  });
  personalizationBody.appendChild(personalizationStatus);
  personalizationSection.appendChild(personalizationBody);
  let personalizationSnapshot: AccountPersonalization | null = null;

  function renderDrawerPersonalization(personalization: AccountPersonalization): void {
    personalizationSnapshot = personalization;
    instructionsInput.value = personalization.instructions;
    instructionsToggle.checked = personalization.instructionsEnabled;
    responseStyleSelect.value = personalization.style;
    responseLengthSelect.value = personalization.preferredLength;
    for (const control of [
      instructionsInput,
      instructionsToggle,
      instructionsSaveBtn,
      responseStyleSelect,
      responseLengthSelect,
    ]) {
      control.disabled = false;
    }
    personalizationBody.hidden = false;
  }

  function savePersonalizationChange(
    save: (token: string) => Promise<void>,
    next: Partial<AccountPersonalization>,
  ): void {
    const previous = personalizationSnapshot;
    if (!previous) return;
    instructionsSaveBtn.disabled = true;
    responseStyleSelect.disabled = true;
    responseLengthSelect.disabled = true;
    instructionsToggle.disabled = true;
    personalizationStatus.textContent = t('spPersonalizationSaving');
    void (async () => {
      const auth = await getManagedCloudAuthContext();
      if (!auth) throw new Error(t('spSetupMemorySignedOut'));
      await save(auth.token);
      renderDrawerPersonalization({ ...previous, ...next });
      personalizationStatus.textContent = t('spPersonalizationSaved');
    })().catch((error: unknown) => {
      renderDrawerPersonalization(previous);
      personalizationStatus.textContent =
        error instanceof Error ? error.message : t('spPersonalizationSaveFailed');
    });
  }

  function saveDrawerInstructions(): void {
    const instructions = {
      instructions: instructionsInput.value.trim(),
      instructionsEnabled: instructionsToggle.checked,
    };
    savePersonalizationChange(
      (token) => saveAccountInstructions(token, instructions),
      instructions,
    );
  }

  function saveDrawerResponseStyle(): void {
    const style = {
      style: responseStyleSelect.value as ResponseStyle,
      preferredLength: responseLengthSelect.value as PreferredLength,
    };
    savePersonalizationChange((token) => saveAccountResponseStyle(token, style), style);
  }

  instructionsSaveBtn.addEventListener('click', saveDrawerInstructions);
  instructionsToggle.addEventListener('change', saveDrawerInstructions);
  responseStyleSelect.addEventListener('change', saveDrawerResponseStyle);
  responseLengthSelect.addEventListener('change', saveDrawerResponseStyle);

  async function refreshDrawerPersonalization(token: string): Promise<void> {
    try {
      renderDrawerPersonalization(await fetchAccountPersonalization(token));
      personalizationStatus.textContent = '';
    } catch (error) {
      personalizationBody.hidden = false;
      for (const control of [
        instructionsInput,
        instructionsToggle,
        instructionsSaveBtn,
        responseStyleSelect,
        responseLengthSelect,
      ]) {
        control.disabled = true;
      }
      personalizationStatus.textContent =
        error instanceof Error ? error.message : t('spPersonalizationUnavailable');
    }
  }
  const personalizationBtn = el(
    'button',
    { type: 'button', class: 'sp-drawer-memory-add-btn' },
    t('spPersonalizationOpen'),
  );
  personalizationBtn.addEventListener('click', () => {
    void chrome.tabs.create({
      url: `${FREE_TRIAL_GATEWAY}/settings/general?from=chrome-extension`,
    });
  });
  personalizationSection.appendChild(personalizationBtn);
  settingsGroupBody.appendChild(personalizationSection);

  const memorySection = el('div', { class: 'sp-drawer-section' });
  memorySection.appendChild(el('h3', { class: 'sp-drawer-section-title' }, 'Memory'));
  memorySection.appendChild(
    el(
      'p',
      { class: 'sp-drawer-memory-help' },
      'Saved facts and preferences reused across sessions, shared with the AGI web and mobile apps on your account.',
    ),
  );
  memorySection.appendChild(buildHelpArticleLink('memory', t('spHelpLinkMemory')));
  const memoryScope = el('p', { class: 'sp-drawer-memory-help', hidden: '' });
  memorySection.appendChild(memoryScope);

  const memoryRememberToggle = el('input', {
    type: 'checkbox',
    id: 'sp-drawer-memory-remember',
  }) as HTMLInputElement;
  const memorySearchToggle = el('input', {
    type: 'checkbox',
    id: 'sp-drawer-memory-search',
  }) as HTMLInputElement;
  const memoryPreferenceStatus = el('p', {
    class: 'sp-drawer-memory-help',
    role: 'status',
    hidden: '',
  });
  const memoryPreferencesBlock = el(
    'div',
    { class: 'sp-drawer-memory-preferences', hidden: '' },
    el(
      'div',
      { class: 'sp-drawer-memory-preference' },
      memoryRememberToggle,
      el('label', { for: 'sp-drawer-memory-remember' }, t('spSetupMemoryRemember')),
    ),
    el(
      'div',
      { class: 'sp-drawer-memory-preference' },
      memorySearchToggle,
      el('label', { for: 'sp-drawer-memory-search' }, t('spSetupMemorySearch')),
    ),
    memoryPreferenceStatus,
  );
  memorySection.appendChild(memoryPreferencesBlock);
  let memoryPreferenceSnapshot: MemoryPreferences | null = null;

  function setMemoryPreferenceStatus(text: string): void {
    memoryPreferenceStatus.textContent = text;
    memoryPreferenceStatus.hidden = !text;
  }

  function renderMemoryPreferences(preferences: MemoryPreferences): void {
    memoryPreferenceSnapshot = preferences;
    memoryRememberToggle.checked = preferences.memory;
    memorySearchToggle.checked = preferences.searchPastChats;
    memoryRememberToggle.disabled = !preferences.organizationAllows;
    memorySearchToggle.disabled = !preferences.organizationAllows;
    setMemoryPreferenceStatus(preferences.organizationAllows ? '' : t('spSetupMemoryOrgOff'));
    memoryPreferencesBlock.hidden = false;
  }

  function saveDrawerMemoryPreference(): void {
    const previous = memoryPreferenceSnapshot;
    if (!previous) return;
    const next = {
      memory: memoryRememberToggle.checked,
      searchPastChats: memorySearchToggle.checked,
    };
    memoryRememberToggle.disabled = true;
    memorySearchToggle.disabled = true;
    void (async () => {
      const auth = await getManagedCloudAuthContext();
      if (!auth) throw new Error(t('spSetupMemorySignedOut'));
      await saveMemoryPreferences(auth.token, next);
      renderMemoryPreferences({ ...previous, ...next });
      setMemoryPreferenceStatus(t('spMemoryPreferenceSaved'));
    })().catch((error: unknown) => {
      renderMemoryPreferences(previous);
      setMemoryPreferenceStatus(
        error instanceof Error ? error.message : t('spMemoryPreferenceSaveFailed'),
      );
    });
  }
  memoryRememberToggle.addEventListener('change', saveDrawerMemoryPreference);
  memorySearchToggle.addEventListener('change', saveDrawerMemoryPreference);

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
  const memoryStatus = el('div', {
    class: 'sp-drawer-memory-status',
    id: 'sp-drawer-memory-status',
    role: 'status',
    hidden: '',
  });
  const memoryRetryBtn = el(
    'button',
    { type: 'button', class: 'sp-drawer-memory-retry-btn', id: 'sp-drawer-memory-retry-btn' },
    'Try again',
  ) as HTMLButtonElement;
  const memoryCount = el('div', { class: 'sp-drawer-memory-status', hidden: '' });
  const memoryMoreBtn = el(
    'button',
    { type: 'button', class: 'sp-drawer-memory-retry-btn', hidden: '' },
    t('spMemoryShowMore'),
  ) as HTMLButtonElement;
  memorySection.appendChild(memoryList);
  memorySection.appendChild(memoryEmpty);
  memorySection.appendChild(memoryCount);
  memorySection.appendChild(memoryMoreBtn);
  memorySection.appendChild(memoryStatus);
  memorySection.appendChild(memoryRetryBtn);

  const exclusionsBlock = el('div', { class: 'sp-drawer-memory-block', hidden: '' });
  exclusionsBlock.appendChild(
    el('h4', { class: 'sp-drawer-memory-subtitle' }, t('spMemoryNeverRememberTitle')),
  );
  exclusionsBlock.appendChild(
    el('p', { class: 'sp-drawer-memory-help' }, t('spMemoryNeverRememberHelp')),
  );
  const exclusionForm = el('div', { class: 'sp-drawer-memory-exclusion-form' });
  const exclusionInput = el('input', {
    type: 'text',
    class: 'sp-drawer-memory-exclusion-input',
    maxlength: String(MEMORY_EXCLUSION_MAX_CHARS),
    placeholder: t('spMemoryNeverRememberPlaceholder'),
    'aria-label': t('spMemoryNeverRememberInputLabel'),
  });
  const exclusionAddBtn = el(
    'button',
    { type: 'button', class: 'sp-drawer-btn' },
    t('spMemoryNeverRememberAdd'),
  ) as HTMLButtonElement;
  exclusionForm.appendChild(exclusionInput);
  exclusionForm.appendChild(exclusionAddBtn);
  exclusionsBlock.appendChild(exclusionForm);
  const exclusionList = el('ul', {
    class: 'sp-drawer-memory-exclusions',
    'aria-label': t('spMemoryNeverRememberTitle'),
  });
  exclusionsBlock.appendChild(exclusionList);
  const exclusionStatus = el('div', {
    class: 'sp-drawer-memory-status',
    role: 'status',
    hidden: '',
  });
  exclusionsBlock.appendChild(exclusionStatus);
  memorySection.appendChild(exclusionsBlock);

  const conflictsBlock = el('div', { class: 'sp-drawer-memory-block', hidden: '' });
  conflictsBlock.appendChild(
    el('h4', { class: 'sp-drawer-memory-subtitle' }, t('spMemoryConflictsTitle')),
  );
  conflictsBlock.appendChild(
    el('p', { class: 'sp-drawer-memory-help' }, t('spMemoryConflictsRule')),
  );
  const conflictList = el('ul', {
    class: 'sp-drawer-memory-list',
    'aria-label': t('spMemoryConflictsListLabel'),
  });
  conflictsBlock.appendChild(conflictList);
  const conflictStatus = el('div', {
    class: 'sp-drawer-memory-status',
    role: 'status',
    hidden: '',
  });
  conflictsBlock.appendChild(conflictStatus);
  memorySection.appendChild(conflictsBlock);
  settingsGroupBody.appendChild(memorySection);

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

  type DrawerMemoryItem = AccountMemory;

  function buildDrawerMemoryOrigin(item: DrawerMemoryItem): HTMLElement {
    const origin = el('span', { class: 'sp-drawer-memory-item-origin' });
    if (item.source === 'auto') {
      if (item.sourceConversationId) {
        const link = el('a', {
          class: 'sp-drawer-memory-item-link',
          href: `${FREE_TRIAL_GATEWAY}/chat/${encodeURIComponent(item.sourceConversationId)}?from=chrome-extension`,
          target: '_blank',
          rel: 'noopener noreferrer',
        });
        link.textContent = item.sourceConversationTitle
          ? t('spMemoryOriginLearnedFromTitled', [item.sourceConversationTitle])
          : t('spMemoryOriginLearnedFromChat');
        origin.appendChild(link);
      } else {
        origin.textContent = t('spMemoryOriginLearnedFromChat');
      }
    } else if (item.source?.startsWith('imported:')) {
      origin.textContent = t('spMemoryOriginImported');
    } else {
      origin.textContent = t('spMemoryOriginAdded');
    }
    return origin;
  }

  function buildDrawerMemoryItem(item: DrawerMemoryItem): HTMLLIElement {
    const li = el('li', { class: 'sp-drawer-memory-item' });
    li.dataset['id'] = item.id;
    const contentEl = el('span', { class: 'sp-drawer-memory-item-content' }, item.content);
    const metaEl = el('span', { class: 'sp-drawer-memory-item-meta' });
    metaEl.appendChild(buildDrawerMemoryOrigin(item));
    metaEl.appendChild(
      document.createTextNode(` · ${drawerFormatRelTime(item.updatedAt || item.createdAt)}`),
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
          .then((res) => applyDrawerMemoryWrite(res))
          .catch(() => {});
      } else {
        deleteBtn.classList.add('is-confirm');
        deleteBtn.textContent = t('spMemoryDeleteConfirm');
        confirmTimer = setTimeout(() => {
          deleteBtn.classList.remove('is-confirm');
          deleteBtn.textContent = t('spMemoryDelete');
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
        await applyDrawerMemoryWrite(
          await sendDrawerMemoryMsg('UPDATE_MEMORY', { id: item.id, content: txt }),
        );
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

  function setDrawerMemoryStatus(text: string, retryable: boolean): void {
    if (!text) {
      memoryStatus.setAttribute('hidden', '');
      memoryRetryBtn.setAttribute('hidden', '');
      return;
    }
    memoryStatus.textContent = text;
    memoryStatus.removeAttribute('hidden');
    if (retryable) memoryRetryBtn.removeAttribute('hidden');
    else memoryRetryBtn.setAttribute('hidden', '');
  }

  let drawerMemoryShown = 0;
  let drawerMemoryGeneration = 0;

  function renderDrawerMemoryCount(hasMore: boolean): void {
    memoryCount.hidden = drawerMemoryShown === 0;
    memoryCount.replaceChildren(
      document.createTextNode(
        hasMore
          ? tPlural('spMemoryShowingMore', drawerMemoryShown)
          : tPlural('spMemoryShowing', drawerMemoryShown),
      ),
    );
    memoryMoreBtn.hidden = !hasMore;
  }

  function setDrawerMemoryExtrasHidden(hidden: boolean): void {
    if (hidden) personalizationBody.hidden = true;
    memoryScope.hidden = hidden;
    if (hidden) memoryPreferencesBlock.hidden = true;
    exclusionsBlock.hidden = hidden;
    conflictsBlock.hidden = hidden;
  }

  async function refreshDrawerMemory(): Promise<void> {
    const generation = ++drawerMemoryGeneration;
    const res = await sendDrawerMemoryMsg('LIST_MEMORIES');
    if (generation !== drawerMemoryGeneration) return;
    const status = typeof res['status'] === 'string' ? res['status'] : 'unavailable';
    const raw = Array.isArray(res['memories']) ? (res['memories'] as unknown[]) : [];
    const items = raw.filter(isAccountMemory);
    clearChildren(memoryList);
    drawerMemoryShown = 0;
    renderDrawerMemoryCount(false);

    if (status === 'signed-out') {
      memoryEmpty.setAttribute('hidden', '');
      memoryAddBtn.setAttribute('hidden', '');
      showDrawerMemoryEditor(false);
      setDrawerMemoryExtrasHidden(true);
      setDrawerMemoryStatus('Sign in to your AGI account to read and save memories.', false);
      return;
    }

    memoryAddBtn.removeAttribute('hidden');
    void refreshDrawerMemoryAccountDetails();

    if (status !== 'ready') {
      memoryEmpty.setAttribute('hidden', '');
      setDrawerMemoryStatus(
        typeof res['error'] === 'string' ? res['error'] : 'Memory is unavailable right now.',
        true,
      );
      return;
    }

    setDrawerMemoryStatus(
      res['fromCache'] === true && typeof res['error'] === 'string'
        ? `Showing the last synced copy · ${res['error']}`
        : '',
      res['fromCache'] === true,
    );

    if (items.length === 0) {
      memoryEmpty.removeAttribute('hidden');
      return;
    }
    memoryEmpty.setAttribute('hidden', '');
    for (const item of items) memoryList.appendChild(buildDrawerMemoryItem(item));
    drawerMemoryShown = items.length;
    renderDrawerMemoryCount(res['hasMore'] === true && res['fromCache'] !== true);
  }

  memoryMoreBtn.addEventListener('click', async () => {
    const generation = drawerMemoryGeneration;
    memoryMoreBtn.disabled = true;
    const res = await sendDrawerMemoryMsg('LIST_MEMORIES', { offset: drawerMemoryShown });
    memoryMoreBtn.disabled = false;
    if (generation !== drawerMemoryGeneration) return;
    if (res['status'] !== 'ready') {
      setDrawerMemoryStatus(
        typeof res['error'] === 'string' ? res['error'] : 'Memory is unavailable right now.',
        false,
      );
      return;
    }
    const raw = Array.isArray(res['memories']) ? (res['memories'] as unknown[]) : [];
    const items = raw.filter(isAccountMemory);
    for (const item of items) memoryList.appendChild(buildDrawerMemoryItem(item));
    drawerMemoryShown += items.length;
    renderDrawerMemoryCount(res['hasMore'] === true);
  });

  let memoryExclusions: string[] = [];

  function renderMemoryExclusions(): void {
    clearChildren(exclusionList);
    for (const term of memoryExclusions) {
      const item = el('li', { class: 'sp-drawer-memory-exclusion' });
      item.appendChild(el('span', {}, term));
      const remove = el('button', {
        type: 'button',
        class: 'sp-drawer-memory-exclusion-remove',
        'aria-label': t('spMemoryNeverRememberRemove', [term]),
      });
      remove.appendChild(renderIcon(X, 11));
      remove.addEventListener('click', () => {
        void saveDrawerMemoryExclusions(memoryExclusions.filter((existing) => existing !== term));
      });
      item.appendChild(remove);
      exclusionList.appendChild(item);
    }
    if (memoryExclusions.length === 0) {
      exclusionList.appendChild(
        el('li', { class: 'sp-drawer-memory-empty' }, t('spMemoryNeverRememberEmpty')),
      );
    }
  }

  function setExclusionStatus(text: string): void {
    exclusionStatus.textContent = text;
    exclusionStatus.hidden = text.length === 0;
  }

  async function saveDrawerMemoryExclusions(next: string[]): Promise<void> {
    const auth = await getManagedCloudAuthContext();
    if (!auth) {
      setExclusionStatus(t('spMemorySignedOut'));
      return;
    }
    exclusionAddBtn.disabled = true;
    try {
      await saveMemoryExclusions(auth.token, next);
      memoryExclusions = normalizeMemoryExclusions(next);
      setExclusionStatus('');
      renderMemoryExclusions();
    } catch (error) {
      setExclusionStatus(
        error instanceof Error ? error.message : t('spMemoryNeverRememberSaveFailed'),
      );
    } finally {
      exclusionAddBtn.disabled = false;
    }
  }

  function addMemoryExclusion(): void {
    const term = exclusionInput.value.trim().toLowerCase();
    if (term.length < MEMORY_EXCLUSION_MIN_CHARS) {
      setExclusionStatus(t('spMemoryNeverRememberTooShort', [String(MEMORY_EXCLUSION_MIN_CHARS)]));
      return;
    }
    if (memoryExclusions.includes(term)) {
      exclusionInput.value = '';
      return;
    }
    if (memoryExclusions.length >= MEMORY_EXCLUSION_MAX_TERMS) {
      setExclusionStatus(t('spMemoryNeverRememberFull', [String(MEMORY_EXCLUSION_MAX_TERMS)]));
      return;
    }
    exclusionInput.value = '';
    void saveDrawerMemoryExclusions([...memoryExclusions, term]);
  }
  exclusionAddBtn.addEventListener('click', addMemoryExclusion);
  exclusionInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addMemoryExclusion();
  });

  function renderMemoryConflicts(conflicts: readonly AccountMemoryConflict[]): void {
    clearChildren(conflictList);
    if (conflicts.length === 0) {
      conflictList.appendChild(
        el('li', { class: 'sp-drawer-memory-empty' }, t('spMemoryConflictsEmpty')),
      );
      return;
    }
    for (const conflict of conflicts) {
      const item = el('li', { class: 'sp-drawer-memory-item' });
      item.appendChild(
        el(
          'span',
          { class: 'sp-drawer-memory-item-content' },
          t('spMemoryConflictUsing', [conflict.keptContent]),
        ),
      );
      item.appendChild(
        el(
          'span',
          { class: 'sp-drawer-memory-item-meta' },
          t('spMemoryConflictReplaced', [conflict.content]),
        ),
      );
      const restore = el(
        'button',
        { type: 'button', class: 'sp-drawer-memory-item-edit-btn' },
        t('spMemoryConflictRestore'),
      ) as HTMLButtonElement;
      restore.addEventListener('click', async () => {
        const auth = await getManagedCloudAuthContext();
        if (!auth) return;
        restore.disabled = true;
        try {
          await restoreAccountMemory(auth.token, conflict.id);
          await Promise.all([refreshDrawerMemory(), loadDrawerMemoryConflicts(auth.token)]);
        } catch (error) {
          restore.disabled = false;
          conflictStatus.textContent =
            error instanceof Error ? error.message : t('spMemoryConflictRestoreFailed');
          conflictStatus.hidden = false;
        }
      });
      const row = el('div', { class: 'sp-drawer-memory-item-row' });
      row.appendChild(restore);
      item.appendChild(row);
      conflictList.appendChild(item);
    }
  }

  async function loadDrawerMemoryConflicts(token: string): Promise<void> {
    try {
      renderMemoryConflicts(await fetchAccountMemoryConflicts(token));
      conflictStatus.hidden = true;
    } catch (error) {
      clearChildren(conflictList);
      conflictStatus.textContent =
        error instanceof Error ? error.message : t('spMemoryConflictsLoadFailed');
      conflictStatus.hidden = false;
    }
  }

  async function refreshDrawerMemoryAccountDetails(): Promise<void> {
    const auth = await getManagedCloudAuthContext();
    if (!auth) {
      setDrawerMemoryExtrasHidden(true);
      return;
    }
    setDrawerMemoryExtrasHidden(false);
    await Promise.all([
      refreshDrawerPersonalization(auth.token),
      fetchMemoryPreferences(auth.token)
        .then(renderMemoryPreferences)
        .catch(() => {
          memoryPreferencesBlock.hidden = false;
          memoryRememberToggle.disabled = true;
          memorySearchToggle.disabled = true;
          setMemoryPreferenceStatus(t('spSetupMemoryUnavailable'));
        }),
      fetchActiveMemoryWorkspace(auth.token)
        .then((workspace) => {
          memoryScope.textContent =
            workspace.scope === 'organization' && workspace.name
              ? t('spMemoryScopeWorkspace', [workspace.name])
              : t('spMemoryScopePersonal');
        })
        .catch(() => {
          memoryScope.hidden = true;
        }),
      fetchMemoryExclusions(auth.token)
        .then((terms) => {
          memoryExclusions = terms;
          setExclusionStatus('');
          renderMemoryExclusions();
        })
        .catch((error: unknown) => {
          clearChildren(exclusionList);
          setExclusionStatus(
            error instanceof Error ? error.message : t('spMemoryNeverRememberLoadFailed'),
          );
        }),
      loadDrawerMemoryConflicts(auth.token),
    ]);
  }

  async function applyDrawerMemoryWrite(res: Record<string, unknown>): Promise<void> {
    if (res['success'] !== true && typeof res['error'] === 'string') {
      setDrawerMemoryStatus(res['error'], true);
      return;
    }
    await refreshDrawerMemory();
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
    const res = await sendDrawerMemoryMsg('ADD_MEMORY', { content });
    (memorySaveBtn as HTMLButtonElement).disabled = false;
    if (res['success'] === true) showDrawerMemoryEditor(false);
    await applyDrawerMemoryWrite(res);
  });
  memoryRetryBtn.addEventListener('click', () => {
    setDrawerMemoryStatus('', false);
    void refreshDrawerMemory();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === 'local' &&
      changes[ACCOUNT_MEMORY_CACHE_KEY] &&
      drawer.classList.contains('open')
    ) {
      void refreshDrawerMemory();
    }
  });

  const bridgeSection = el('div', { class: 'sp-drawer-section' });
  bridgeSection.appendChild(el('h3', { class: 'sp-drawer-section-title' }, 'Bridge URL'));
  const drawerBridgeInput = el('input', {
    class: 'sp-drawer-bridge-input',
    id: 'sp-drawer-bridge-input',
    type: 'text',
    placeholder: DEFAULT_AGI_BRIDGE_URL,
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
  settingsGroupBody.appendChild(bridgeSection);

  function drawerSaveBridgeUrl(): void {
    const raw = (drawerBridgeInput as HTMLInputElement).value.trim();
    let persisted = '';
    if (!raw) {
      chrome.storage.local.remove('agi_bridge_url');
    } else {
      const validated = validateBridgeUrl(raw);
      if (!validated) {
        const allowed = Array.from(ALLOWED_BRIDGE_HOSTS).join(', ');
        drawerBridgeError.textContent = t('spBridgeUrlNotAllowed', [allowed]);
        drawerBridgeError.removeAttribute('hidden');
        setTimeout(() => drawerBridgeError.setAttribute('hidden', ''), 8000);
        return;
      }
      persisted = validated;
      chrome.storage.local
        .set({ agi_bridge_url: validated })
        .catch((err: unknown) => console.warn('[SidePanel] drawer bridge save failed:', err));
    }
    drawerBridgeInput.value = persisted;
    drawerBridgeError.setAttribute('hidden', '');
    chrome.runtime
      .sendMessage({ type: 'BRIDGE_URL_CHANGED', url: persisted })
      .catch((err: unknown) => console.warn('[SidePanel] drawer bridge notify failed:', err));
    const oldInput = document.getElementById('sp-bridge-url-input') as HTMLInputElement | null;
    if (oldInput) oldInput.value = persisted;
  }
  drawerBridgeSaveBtn.addEventListener('click', drawerSaveBridgeUrl);
  drawerBridgeInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') drawerSaveBridgeUrl();
  });

  const cloudSection = el('div', { class: 'sp-drawer-section' });
  cloudSection.appendChild(el('h3', { class: 'sp-drawer-section-title' }, 'AGI Cloud'));

  const cloudAccountEl = el('div', { class: 'sp-cloud-account', id: 'sp-cloud-account' });

  const signinPrompt = el('div', {
    class: 'sp-cloud-signin-prompt',
    id: 'sp-cloud-signin-prompt',
  });
  const signinDescription = el('span', { class: 'sp-cloud-signin-desc' }, t('spCloudSignInPrompt'));
  signinPrompt.appendChild(signinDescription);

  const signinBtn = el('button', { class: 'sp-cloud-signin-btn', id: 'sp-cloud-signin-btn' });
  let signInAwaitingCompletion = false;
  signinBtn.textContent = t('spCloudSignIn');
  signinBtn.addEventListener('click', async () => {
    signinBtn.setAttribute('disabled', '');
    signinBtn.textContent = signInAwaitingCompletion
      ? t('spCloudSignInChecking')
      : t('spCloudSignInOpening');
    try {
      if (signInAwaitingCompletion) {
        await refreshCloudAccountUI(true);
      } else {
        await openClerkSignIn();
        signInAwaitingCompletion = true;
        signinDescription.textContent = t('spCloudSignInReturnTab');
      }
    } catch (error) {
      signinDescription.textContent =
        error instanceof Error ? error.message : t('spCloudSignInOpenFailed');
    } finally {
      signinBtn.removeAttribute('disabled');
      signinBtn.textContent = signInAwaitingCompletion
        ? t('spCloudCheckSignIn')
        : t('spCloudSignIn');
    }
  });
  signinPrompt.appendChild(signinBtn);

  const signedInView = el('div', {
    class: 'sp-cloud-signed-in',
    id: 'sp-cloud-signed-in',
    style: 'display:none',
  });
  const avatarEl = el(
    'div',
    { class: 'sp-cloud-avatar', id: 'sp-cloud-avatar' },
    t('spCloudAvatarFallback'),
  );
  const userInfoEl = el('div', { class: 'sp-cloud-user-info' });
  const userLabelEl = el('div', {
    class: 'sp-cloud-user-label',
    id: 'sp-cloud-user-label',
  });
  userLabelEl.textContent = t('spCloudAccountFallbackName');
  const userTierEl = el('div', { class: 'sp-cloud-user-tier', id: 'sp-cloud-user-tier' });
  userTierEl.textContent = t('spCloudFreeTier');
  userInfoEl.appendChild(userLabelEl);
  userInfoEl.appendChild(userTierEl);
  const nameEditBtn = el(
    'button',
    { type: 'button', class: 'sp-cloud-name-edit' },
    t('spAccountNameEdit'),
  ) as HTMLButtonElement;
  const nameEditor = el('form', { class: 'sp-cloud-name-editor', hidden: '' });
  const nameInput = el('input', {
    type: 'text',
    class: 'sp-wf-form-input',
    id: 'sp-cloud-name-input',
    autocomplete: 'name',
    'aria-label': t('spAccountNameLabel'),
  }) as HTMLInputElement;
  const nameSaveBtn = el(
    'button',
    { type: 'submit', class: 'sp-drawer-memory-add-btn' },
    t('spAccountNameSave'),
  ) as HTMLButtonElement;
  const nameCancelBtn = el(
    'button',
    { type: 'button', class: 'sp-drawer-memory-add-btn' },
    t('spAccountNameCancel'),
  ) as HTMLButtonElement;
  const nameStatus = el('div', { class: 'sp-drawer-toggle-status', role: 'status' });
  nameEditor.append(
    nameInput,
    el('div', { class: 'sp-cloud-name-actions' }, nameSaveBtn, nameCancelBtn),
  );
  userInfoEl.appendChild(nameEditBtn);
  userInfoEl.appendChild(nameEditor);
  userInfoEl.appendChild(nameStatus);

  function closeNameEditor(): void {
    nameEditor.hidden = true;
    nameEditBtn.hidden = false;
    nameEditBtn.focus();
  }

  nameEditBtn.addEventListener('click', () => {
    nameInput.value = accountDisplayName ?? '';
    nameStatus.textContent = '';
    nameEditBtn.hidden = true;
    nameEditor.hidden = false;
    nameInput.focus();
    nameInput.select();
  });
  nameCancelBtn.addEventListener('click', closeNameEditor);
  nameEditor.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closeNameEditor();
  });
  nameEditor.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (!name) {
      nameStatus.textContent = t('spAccountNameRequired');
      return;
    }
    nameSaveBtn.disabled = true;
    nameStatus.textContent = t('spPersonalizationSaving');
    void (async () => {
      const auth = await getManagedCloudAuthContext();
      if (!auth) throw new Error(t('spSetupMemorySignedOut'));
      await saveAccountDisplayName(auth.token, name);
      accountDisplayName = name;
      userLabelEl.textContent = name;
      nameStatus.textContent = t('spAccountNameSaved');
      closeNameEditor();
    })()
      .catch((error: unknown) => {
        nameStatus.textContent =
          error instanceof Error ? error.message : t('spAccountNameSaveFailed');
      })
      .finally(() => {
        nameSaveBtn.disabled = false;
      });
  });
  const signoutBtn = el(
    'button',
    { class: 'sp-cloud-signout-btn', id: 'sp-cloud-signout-btn' },
    'Sign out',
  );
  signedInView.appendChild(avatarEl);
  signedInView.appendChild(userInfoEl);
  signedInView.appendChild(signoutBtn);
  const signoutStatusEl = el('div', {
    class: 'sp-cloud-signout-status',
    id: 'sp-cloud-signout-status',
    role: 'status',
  });

  const quotaWrap = el('div', {
    class: 'sp-quota-bar-wrap',
    id: 'sp-quota-bar-wrap',
    style: 'display:none',
  });
  const quotaLabelEl = el('span', { id: 'sp-quota-label' }, t('spQuotaPaidPlanRequired'));
  quotaWrap.appendChild(quotaLabelEl);
  const quotaWindowsEl = el('div', { class: 'sp-quota-windows', id: 'sp-quota-windows' });
  quotaWrap.appendChild(quotaWindowsEl);
  quotaWrap.appendChild(buildHelpArticleLink('usage-and-credits', t('spHelpLinkUsage')));
  const quotaNoticeEl = el('div', {
    class: 'sp-quota-notice',
    id: 'sp-quota-notice',
    role: 'status',
  });
  quotaWrap.appendChild(quotaNoticeEl);
  const quotaModelsEl = el('div', { class: 'sp-quota-models', id: 'sp-quota-models' });
  quotaWrap.appendChild(quotaModelsEl);
  const planCompareEl = el(
    'details',
    { class: 'sp-plan-compare', id: 'sp-plan-compare' },
    el('summary', {}, t('spPlansHeading')),
  );
  const planCompareListEl = el('div', { class: 'sp-plan-compare-list' });
  const planComparePricingBtn = el(
    'button',
    { class: 'sp-quota-upgrade-btn', type: 'button' },
    t('spPlansPricing'),
  );
  planComparePricingBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: agiWebUrl('/pricing') }).catch(() => {});
  });
  planCompareEl.appendChild(planCompareListEl);
  planCompareEl.appendChild(planComparePricingBtn);
  quotaWrap.appendChild(planCompareEl);

  function renderPlanComparison(currentPlan: string | null | undefined): void {
    clearChildren(planCompareListEl);
    for (const view of planComparisonViews(currentPlan)) {
      const row = el('div', { class: 'sp-plan-compare-row' });
      row.appendChild(el('span', { class: 'sp-plan-compare-name' }, view.label));
      row.appendChild(el('span', { class: 'sp-plan-compare-detail' }, view.usage));
      row.appendChild(el('span', { class: 'sp-plan-compare-detail' }, view.features));
      planCompareListEl.appendChild(row);
    }
  }

  const quotaUpgradeRow = el('div', {
    class: 'sp-quota-upgrade-row',
    id: 'sp-quota-upgrade-row',
    style: 'display:none',
  });
  const quotaExhaustedLabel = el(
    'span',
    { class: 'sp-quota-exhausted-label' },
    t('spQuotaFreeElsewhere'),
  );
  const quotaUpgradeBtn = el(
    'button',
    { class: 'sp-quota-upgrade-btn', id: 'sp-quota-upgrade-btn' },
    t('spQuotaUpgrade'),
  );
  quotaUpgradeRow.appendChild(quotaExhaustedLabel);
  quotaUpgradeRow.appendChild(quotaUpgradeBtn);
  quotaWrap.appendChild(quotaUpgradeRow);

  cloudAccountEl.appendChild(signinPrompt);
  cloudAccountEl.appendChild(signedInView);
  cloudAccountEl.appendChild(signoutStatusEl);
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
    void chrome.tabs.create({ url: CONNECTORS_URL });
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
  settingsGroupBody.appendChild(cloudSection);

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
  settingsGroupBody.appendChild(inviteCodeSection);

  const helpGroupBody = drawerGroupBody(t('spMenuHelp'), () => void renderHelpShortcuts());
  const helpLinksSection = el('div', { class: 'sp-drawer-section' });
  const helpLinks: ReadonlyArray<{ label: string; detail: string; path: string; icon: string }> = [
    { label: t('spHelpCenter'), detail: t('spHelpCenterDetail'), path: '/help', icon: CircleHelp },
    { label: t('spHelpDocs'), detail: t('spHelpDocsDetail'), path: '/docs', icon: FileText },
    {
      label: t('spHelpContact'),
      detail: t('spHelpContactDetail'),
      path: '/support',
      icon: MessageSquare,
    },
    {
      label: t('spHelpReportBug'),
      detail: t('spHelpReportBugDetail'),
      path: '/support#bugs',
      icon: Shield,
    },
    { label: t('spHelpStatus'), detail: t('spHelpStatusDetail'), path: '/status', icon: Globe },
    {
      label: t('spHelpReleaseNotes'),
      detail: t('spHelpReleaseNotesDetail'),
      path: '/changelog',
      icon: Zap,
    },
  ];
  for (const link of helpLinks) {
    const button = el('button', { class: 'sp-drawer-launcher-btn', type: 'button' });
    const icon = el('div', { class: 'sp-drawer-launcher-icon' });
    icon.appendChild(renderIcon(link.icon, 14));
    const text = el('div', { class: 'sp-drawer-launcher-label' });
    text.appendChild(el('div', {}, link.label));
    text.appendChild(el('div', { class: 'sp-drawer-launcher-desc' }, link.detail));
    button.appendChild(icon);
    button.appendChild(text);
    button.addEventListener('click', () => {
      const url = new URL(link.path, FREE_TRIAL_GATEWAY);
      url.searchParams.set('from', 'chrome-extension');
      void chrome.tabs.create({ url: url.toString() });
    });
    helpLinksSection.appendChild(button);
  }
  helpGroupBody.appendChild(helpLinksSection);

  const helpShortcutsSection = el('div', { class: 'sp-drawer-section' });
  helpShortcutsSection.appendChild(
    el('h3', { class: 'sp-drawer-section-title' }, t('spHelpShortcutsTitle')),
  );
  const helpShortcutList = el('dl', { class: 'sp-help-shortcuts' });
  helpShortcutsSection.appendChild(helpShortcutList);
  const helpShortcutsChangeBtn = el(
    'button',
    { type: 'button', class: 'sp-drawer-memory-add-btn' },
    t('spHelpShortcutsChange'),
  );
  helpShortcutsChangeBtn.addEventListener('click', () => {
    void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
  helpShortcutsSection.appendChild(helpShortcutsChangeBtn);
  helpShortcutsSection.appendChild(
    buildHelpArticleLink('keyboard-shortcuts', t('spHelpLinkShortcuts')),
  );
  helpGroupBody.appendChild(helpShortcutsSection);

  async function renderHelpShortcuts(): Promise<void> {
    const mac = /mac/i.test(navigator.platform);
    const modifier = mac ? '⌘' : t('spHelpKeyCtrl');
    const commands = await chrome.commands.getAll().catch(() => []);
    const commandKey = (name: string): string | null =>
      commands.find((command) => command.name === name)?.shortcut || null;
    const rows: Array<[string, string]> = [
      [`${modifier} K`, t('spHelpShortcutPalette')],
      [t('spHelpKeyEnter'), t('spHelpShortcutSend')],
      [`${t('spHelpKeyShift')} ${t('spHelpKeyEnter')}`, t('spHelpShortcutNewLine')],
      ['/', t('spHelpShortcutSlash')],
      ['@', t('spHelpShortcutMention')],
      [t('spHelpKeyEscape'), t('spHelpShortcutEscape')],
    ];
    const openPanel = commandKey('_execute_action');
    if (openPanel) rows.push([openPanel, t('spHelpShortcutOpenPanel')]);
    const capture = commandKey('capture_page');
    if (capture) rows.push([capture, t('spHelpShortcutCapture')]);
    helpShortcutList.replaceChildren();
    for (const [keys, action] of rows) {
      helpShortcutList.appendChild(el('dt', {}, el('kbd', {}, keys)));
      helpShortcutList.appendChild(el('dd', {}, action));
    }
  }

  for (const group of drawerGroups) {
    const row = el('button', { class: 'sp-drawer-row', type: 'button', role: 'menuitem' });
    row.appendChild(el('span', { class: 'sp-drawer-row-label' }, group.label));
    const rowChevron = el('span', { class: 'sp-drawer-row-chevron' });
    rowChevron.appendChild(renderIcon(ChevronRight, 14));
    row.appendChild(rowChevron);
    row.addEventListener('click', () => openDrawerGroup(group));
    drawerMenu.appendChild(row);
  }

  const quotaBadgeEl = el('button', {
    id: 'sp-quota-badge',
    type: 'button',
    title: 'AGI Cloud plan',
    'aria-label': 'AGI Cloud plan and usage, open menu',
  });
  quotaBadgeEl.addEventListener('click', () => {
    openDrawer(quotaBadgeEl);
  });
  const quotaSlot = document.getElementById('sp-quota-badge-slot');
  if (quotaSlot) quotaSlot.replaceWith(quotaBadgeEl);
  else document.body.appendChild(quotaBadgeEl);

  let usageResetTimer: ReturnType<typeof setTimeout> | null = null;

  function clearUsageResetTimer(): void {
    if (usageResetTimer !== null) clearTimeout(usageResetTimer);
    usageResetTimer = null;
  }

  function scheduleUsageResetRefresh(resetAt: string | null): void {
    clearUsageResetTimer();
    const resetTime = resetAt ? Date.parse(resetAt) : Number.NaN;
    if (!Number.isFinite(resetTime)) return;
    const untilReset = resetTime - Date.now();
    usageResetTimer = setTimeout(
      () => {
        usageResetTimer = null;
        if (Date.now() >= resetTime) void refreshCloudAccountUI();
        else if (managedModelAccess) presentManagedUsage(managedModelAccess);
      },
      Math.max(1_000, Math.min(untilReset + 1_000, 60_000)),
    );
  }

  function setQuotaNotice(text: string, severity: ManagedUsageWarning['severity'] | null): void {
    quotaNoticeEl.textContent = text;
    if (severity) quotaNoticeEl.dataset['severity'] = severity;
    else delete quotaNoticeEl.dataset['severity'];
  }

  function clearManagedUsagePresentation(): void {
    clearUsageResetTimer();
    clearChildren(quotaWindowsEl);
    setQuotaNotice('', null);
    usageHistoryGeneration += 1;
    clearChildren(quotaModelsEl);
  }

  let usageHistoryGeneration = 0;

  function renderModelUsage(history: ManagedUsageHistory | null): void {
    clearChildren(quotaModelsEl);
    if (!history) {
      quotaModelsEl.appendChild(
        el('div', { class: 'sp-quota-window-reset' }, t('spQuotaByModelUnavailable')),
      );
      return;
    }
    const days = Math.max(
      1,
      Math.round((Date.parse(history.to) - Date.parse(history.from)) / 86_400_000),
    );
    quotaModelsEl.appendChild(
      el('div', { class: 'sp-quota-models-heading' }, t('spQuotaByModelHeading', [String(days)])),
    );
    const rows = history.byModel.slice(0, MODEL_USAGE_ROW_LIMIT);
    if (rows.length === 0) {
      quotaModelsEl.appendChild(
        el('div', { class: 'sp-quota-window-reset' }, t('spQuotaByModelEmpty')),
      );
      return;
    }
    for (const row of rows) {
      const line = el('div', { class: 'sp-quota-bar-row' });
      line.appendChild(el('span', {}, row.label ?? getModelBadgeLabel(row.modelId)));
      line.appendChild(el('span', { class: 'sp-quota-window-value' }, formatCredits(row.credits)));
      quotaModelsEl.appendChild(line);
    }
  }

  async function refreshModelUsageHistory(): Promise<void> {
    const generation = ++usageHistoryGeneration;
    const accountGeneration = cloudAccountRefreshGeneration;
    const access = managedModelAccess;
    if (!access || !canUseBillingPlanCapability(access.subscriptionTier, 'managed_chat')) {
      clearChildren(quotaModelsEl);
      return;
    }
    let history: ManagedUsageHistory | null = null;
    try {
      const authContext = await getManagedCloudAuthContext();
      if (authContext) history = await getManagedUsageHistory(authContext.token);
    } catch {
      history = null;
    }
    if (
      generation !== usageHistoryGeneration ||
      accountGeneration !== cloudAccountRefreshGeneration
    ) {
      return;
    }
    renderModelUsage(history);
  }

  function presentManagedUsage(access: ManagedModelAccess): void {
    clearUsageResetTimer();
    const usage = access.usage;
    const views = usageWindowViews(usage);
    const purchased = purchasedCreditsView(usage);
    const recovery = planQuotaRecovery(managedPlanTier(access));
    const planLabel = getBillingPlanPricing(access.subscriptionTier).label;
    clearChildren(quotaWindowsEl);
    for (const view of views) quotaWindowsEl.appendChild(buildQuotaWindowRow(view));
    if (purchased) quotaWindowsEl.appendChild(buildPurchasedCreditsRow(purchased));
    renderPlanComparison(access.subscriptionTier);
    quotaLabelEl.textContent = t('spQuotaHeading');
    quotaBadgeEl.classList.add('visible');

    if (usage.usage_allocation === 'pending') {
      setQuotaNotice(t('spQuotaAllocationPending'), 'warning');
      quotaUpgradeRow.style.display = 'none';
      quotaBadgeEl.classList.add('has-prompts');
      quotaBadgeEl.classList.remove('exhausted');
      quotaBadgeEl.textContent = planLabel;
      setManagedCloudChatState('unavailable', {
        message: t('spQuotaAllocationPending'),
        action: 'retry',
        actionLabel: t('spGateRetry'),
      });
      return;
    }

    if (usage.has_usage_remaining === false && purchased?.spendable !== true) {
      const blocking = blockingUsageWindow(views);
      const notice = blocking ? usageLimitNotice(blocking) : null;
      const message = notice ? describeUsageNotice(notice) : t('spGateUsageLimit');
      const recoveryLabel = quotaRecoveryLabel(recovery);
      setQuotaNotice('', null);
      quotaExhaustedLabel.textContent = message;
      quotaUpgradeBtn.textContent = recoveryLabel;
      quotaUpgradeBtn.dataset['destination'] = 'recovery';
      quotaUpgradeBtn.dataset['href'] = recovery.href;
      quotaUpgradeRow.style.display = '';
      quotaBadgeEl.classList.add('exhausted');
      quotaBadgeEl.classList.remove('has-prompts');
      quotaBadgeEl.textContent = t('spQuotaManageUsage');
      setManagedCloudChatState('unavailable', {
        message,
        action: 'recovery',
        actionLabel: recoveryLabel,
        href: recovery.href,
      });
      scheduleUsageResetRefresh(blocking?.resetAt ?? null);
      return;
    }

    const coveredByPurchased = usage.has_usage_remaining === false;
    const warning = coveredByPurchased ? null : usageWarning(views);
    const banner: UsageBanner | null = coveredByPurchased
      ? { text: t('spQuotaUsingPurchased'), severity: 'warning', recovery }
      : warning
        ? { text: describeUsageNotice(warning), severity: warning.severity, recovery }
        : null;
    setQuotaNotice(banner?.text ?? '', banner?.severity ?? null);
    quotaUpgradeRow.style.display = 'none';
    quotaBadgeEl.classList.add('has-prompts');
    quotaBadgeEl.classList.remove('exhausted');
    quotaBadgeEl.textContent = planLabel;
    setManagedCloudChatState('ready');
    renderUsageBanner(banner);
  }

  refreshCloudAccountUI = async function (forceAuthRefresh = false): Promise<void> {
    const refreshGeneration = ++cloudAccountRefreshGeneration;
    clearUsageResetTimer();
    const accountProfilePromise = getClerkAccountProfile().catch(() => null);
    let authContext: Awaited<ReturnType<typeof getManagedCloudAuthContext>>;
    try {
      authContext = await withTimeout(getManagedCloudAuthContext(forceAuthRefresh), 8_000);
    } catch {
      if (refreshGeneration !== cloudAccountRefreshGeneration) return;
      managedModelAccess = null;
      signinPrompt.style.display = 'none';
      signedInView.style.display = '';
      quotaWrap.style.display = 'none';
      cloudLinkHint.style.display = 'none';
      cloudLinkRow.style.display = 'none';
      quotaBadgeEl.classList.remove('visible', 'has-prompts', 'exhausted');
      userTierEl.textContent = t('spCloudAccountUnavailable');
      setManagedCloudChatState('unavailable', {
        message: t('spGateVerifyFailed'),
        action: 'retry',
        actionLabel: t('spGateRetry'),
      });
      return;
    }
    if (refreshGeneration !== cloudAccountRefreshGeneration) return;
    const ownerChanged = await transitionManagedCloudOwner(authContext?.owner ?? null);
    if (refreshGeneration !== cloudAccountRefreshGeneration) return;
    const token = authContext?.token ?? null;
    if (!token) {
      capabilityDocument = null;
      applyCapabilityGates();
      refreshOnboardingAccount();
      managedModelAccess = null;
      _ctx.selectedModel = reconcileManagedModelSelection(_ctx.selectedModel, null);
      _ctx.currentModelKey = undefined;
      _ctx.previousTaskType = undefined;
      _ctx.reasoningEffort = undefined;
      signinDescription.textContent = isClerkExtensionAuthConfigured()
        ? signInAwaitingCompletion
          ? t('spCloudSignInFinishTab')
          : t('spCloudSignInPrompt')
        : t('spCloudSignInUnconfigured');
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
          ? t('spGateSignInToChat')
          : t('spGateFinishSetup'),
        action: isClerkExtensionAuthConfigured() ? 'sign_in' : 'open_web',
        actionLabel: isClerkExtensionAuthConfigured() ? t('spGateSignIn') : t('spGateOpenAgi'),
      });
      return;
    }

    const accountSummaryPromise = fetchAccountSummary(token).catch(() => null);
    const accountProfile = await withTimeout(accountProfilePromise, 8_000).catch(() => null);
    if (refreshGeneration !== cloudAccountRefreshGeneration) return;
    const currentAccountProfile =
      authContext && sameManagedCloudOwner(accountProfile?.owner, authContext.owner)
        ? accountProfile
        : null;

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

      if (error instanceof AccountUnavailableError) {
        signinPrompt.style.display = 'none';
        signedInView.style.display = '';
        userTierEl.textContent = t('spCloudAccountUnavailable');
        setManagedCloudChatState('unavailable', {
          message: error.message,
          ...(error.recoveryPath
            ? {
                action: 'recovery' as const,
                actionLabel: t('spAccountUnavailableAction'),
                href: error.recoveryPath,
              }
            : {}),
        });
        return;
      }

      if (error instanceof Error && error.message.includes('Authentication')) {
        await transitionManagedCloudOwner(null);
        await clearAuthToken();
        if (refreshGeneration !== cloudAccountRefreshGeneration) return;
        signinDescription.textContent = t('spCloudSessionExpired');
        signinPrompt.style.display = '';
        signedInView.style.display = 'none';
        setManagedCloudChatState('signed_out', {
          message: t('spCloudSessionExpired'),
          action: 'sign_in',
          actionLabel: t('spGateSignIn'),
        });
        return;
      }

      signinPrompt.style.display = 'none';
      signedInView.style.display = '';
      userTierEl.textContent = t('spCloudAccountUnavailable');
      setManagedCloudChatState('unavailable', {
        message: t('spGateVerifyFailed'),
        action: 'retry',
        actionLabel: t('spGateRetry'),
      });
      return;
    }
    if (refreshGeneration !== cloudAccountRefreshGeneration) return;

    const accountSummary = await accountSummaryPromise;
    if (refreshGeneration !== cloudAccountRefreshGeneration) return;
    capabilityDocument = accountSummary?.capabilityDocument ?? null;
    accountDisplayName = accountSummary?.displayName ?? currentAccountProfile?.displayName ?? null;
    applyCapabilityGates();
    managedModelAccess = access;
    refreshOnboardingAccount();
    signInAwaitingCompletion = false;
    if (!canUseBillingPlanCapability(access.subscriptionTier, 'agi_work')) _ctx.workMode = 'chat';
    const reconciledSelection = reconcileManagedModelSelection(_ctx.selectedModel, access);
    const unavailableSelection =
      reconciledSelection !== _ctx.selectedModel ? _ctx.selectedModel : null;
    if (unavailableSelection !== null) {
      _ctx.conversationGeneration += 1;
      _ctx.selectedModel = reconciledSelection;
      _ctx.currentModelKey = undefined;
      _ctx.previousTaskType = undefined;
      _ctx.reasoningEffort = undefined;
    }
    refreshModelPickerUI();

    signinPrompt.style.display = 'none';
    signedInView.style.display = '';
    cloudLinkHint.style.display = '';
    cloudLinkRow.style.display = 'flex';
    userLabelEl.textContent =
      accountDisplayName ?? currentAccountProfile?.email ?? t('spCloudAccountFallbackName');
    userLabelEl.title = currentAccountProfile?.email ?? '';
    avatarEl.textContent = currentAccountProfile?.initials ?? t('spCloudAvatarFallback');
    userTierEl.textContent = formatManagedTierLabel(
      access.accountPlanTier ?? access.subscriptionTier,
    );

    const subscriptionNeedsAttention =
      Boolean(access.accountPlanTier && access.accountPlanTier.toLowerCase() !== 'free') &&
      !isEntitledSubscriptionStatus(access.subscriptionStatus);
    if (subscriptionNeedsAttention) {
      const subscriptionStatusLabel = (access.subscriptionStatus ?? 'inactive').replace('_', ' ');
      clearManagedUsagePresentation();
      quotaWrap.style.display = '';
      quotaLabelEl.textContent =
        access.subscriptionStatus === 'past_due'
          ? t('spBillingPastDue')
          : access.subscriptionStatus === 'canceled'
            ? t('spBillingCanceled')
            : t('spBillingOtherStatus', [subscriptionStatusLabel]);
      quotaExhaustedLabel.textContent = t('spBillingPaused');
      quotaUpgradeBtn.textContent = t('spBillingManage');
      quotaUpgradeBtn.dataset['destination'] = 'billing';
      quotaUpgradeRow.style.display = '';
      quotaBadgeEl.classList.add('visible', 'exhausted');
      quotaBadgeEl.classList.remove('has-prompts');
      quotaBadgeEl.textContent = t('spBillingBadge');
      setManagedCloudChatState('unavailable', {
        message:
          access.subscriptionStatus === 'past_due'
            ? t('spGateBillingPastDue')
            : t('spGateSubscriptionStatus', [subscriptionStatusLabel]),
        action: 'billing',
        actionLabel: t('spBillingManage'),
      });
      return;
    }

    if (canUseBillingPlanCapability(access.subscriptionTier, 'managed_chat')) {
      quotaWrap.style.display = '';
      presentManagedUsage(access);
      if (ownerChanged) clearChildren(quotaModelsEl);
      if (!settingsGroupBody.hidden) void refreshModelUsageHistory();
      if (managedCloudChatState !== 'ready') return;
      if (unavailableSelection !== null) {
        renderModelNotice(
          t('spModelFallback', [
            getModelBadgeLabel(unavailableSelection),
            getModelBadgeLabel(reconciledSelection),
          ]),
        );
      }
      refreshPageHostname();
      if (ownerChanged) {
        refreshWorkflowsTasks();
        await loadMessages();
        if (refreshGeneration !== cloudAccountRefreshGeneration) return;
        renderMessages();
      }
      return;
    }

    clearManagedUsagePresentation();
    renderPlanComparison(access.subscriptionTier);
    quotaWrap.style.display = '';
    quotaLabelEl.textContent = t('spQuotaProRequired');
    quotaExhaustedLabel.textContent = t('spQuotaFreeElsewhere');
    quotaUpgradeBtn.textContent = t('spQuotaUpgrade');
    quotaUpgradeBtn.dataset['destination'] = 'pricing';
    quotaUpgradeRow.style.display = '';

    quotaBadgeEl.classList.add('visible');
    quotaBadgeEl.classList.remove('has-prompts');
    quotaBadgeEl.classList.add('exhausted');
    quotaBadgeEl.textContent = t('spQuotaUpgrade');
    setManagedCloudChatState('unavailable', {
      message: t('spQuotaProRequired'),
      action: 'upgrade',
      actionLabel: t('spGateViewPlans'),
    });
  };

  signoutBtn.addEventListener('click', async () => {
    signoutStatusEl.textContent = '';
    const { webSessionEnded } = await signOutOfAccount();
    if (!webSessionEnded) signoutStatusEl.textContent = t('spCloudSignOutSyncFailed');
    await transitionManagedCloudOwner(null);
    await refreshCloudAccountUI();
  });

  quotaUpgradeBtn.addEventListener('click', () => {
    const recoveryHref = quotaUpgradeBtn.dataset['href'];
    const url =
      quotaUpgradeBtn.dataset['destination'] === 'recovery' && recoveryHref
        ? agiWebUrl(recoveryHref)
        : quotaUpgradeBtn.dataset['destination'] === 'billing'
          ? 'https://agiworkforce.com/settings/billing?from=chrome-extension'
          : quotaUpgradeBtn.dataset['destination'] === 'usage'
            ? 'https://agiworkforce.com/settings/usage?from=chrome-extension'
            : 'https://agiworkforce.com/pricing?from=chrome-extension&feature=managed_chat';
    chrome.tabs.create({ url }).catch(() => {});
  });

  if (isClerkExtensionAuthConfigured()) {
    void observeClerkAuth(() => {
      void refreshCloudAccountUI();
    }).catch((error) => {
      console.warn('[SidePanel] Clerk auth listener failed:', error);
    });
  } else {
    signinDescription.textContent = t('spCloudSignInUnconfigured');
    signinBtn.setAttribute('disabled', '');
  }

  initialCloudAccountRefresh = refreshCloudAccountUI();

  drawer.appendChild(drawerBody);

  const drawerFooter = el('div', { id: 'sp-drawer-footer' });

  const aboutRow = el('div', { class: 'sp-drawer-about-row' });
  aboutRow.appendChild(el('span', {}, `v${chrome.runtime.getManifest().version}`));
  const aboutUrlSpan = el(
    'span',
    { class: 'sp-drawer-about-url', id: 'sp-drawer-about-url' },
    ', ',
  );
  aboutRow.appendChild(aboutUrlSpan);
  drawerFooter.appendChild(aboutRow);
  drawer.appendChild(drawerFooter);

  async function refreshDrawerTabInfo(): Promise<void> {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab?.url) {
        try {
          const url = new URL(tab.url);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            aboutUrlSpan.textContent = t('spAboutBrowserPage');
            aboutUrlSpan.removeAttribute('title');
          } else {
            const chars = [...`${url.hostname}${url.pathname}`];
            aboutUrlSpan.textContent =
              chars.length > 28 ? chars.slice(0, 28).join('') + '…' : chars.join('');
            aboutUrlSpan.title = tab.url;
          }
        } catch {
          aboutUrlSpan.textContent = t('spAboutUnknownPage');
        }
      }
    } catch {
      /* ignore */
    }
  }

  document.body.appendChild(drawerOverlay);
  document.body.appendChild(drawer);

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
    {
      class: 'sp-tab sp-tab-active',
      id: 'sp-tab-chat',
      'data-tab': 'chat',
      role: 'tab',
      'aria-selected': 'true',
      'aria-controls': 'sp-chat-panel',
      tabindex: '0',
    },
    'Chat',
  );
  const workflowsTabBtn = el(
    'button',
    {
      class: 'sp-tab',
      id: 'sp-tab-workflows',
      'data-tab': 'workflows',
      role: 'tab',
      'aria-selected': 'false',
      'aria-controls': 'sp-workflows',
      tabindex: '-1',
    },
    'Workflows',
  );
  const cuTabBtn = el(
    'button',
    {
      class: 'sp-tab',
      id: 'sp-tab-computer-use',
      'data-tab': 'computer-use',
      role: 'tab',
      'aria-selected': 'false',
      'aria-controls': 'sp-cu-panel',
      tabindex: '-1',
    },
    'Computer Use',
  );
  const runsTabBtn = el(
    'button',
    {
      class: 'sp-tab',
      id: 'sp-tab-cloud-runs',
      'data-tab': 'cloud-runs',
      role: 'tab',
      'aria-selected': 'false',
      'aria-controls': 'sp-runs-panel',
      tabindex: '-1',
    },
    'Runs',
  );
  const pageTabBtn = el(
    'button',
    {
      class: 'sp-tab',
      id: 'sp-tab-page',
      'data-tab': 'page',
      role: 'tab',
      'aria-selected': 'false',
      'aria-controls': 'sp-page-panel',
      tabindex: '-1',
    },
    'Page',
  );
  tabBar.appendChild(chatTabBtn);
  tabBar.appendChild(workflowsTabBtn);
  tabBar.appendChild(cuTabBtn);
  tabBar.appendChild(runsTabBtn);
  tabBar.appendChild(pageTabBtn);
  document.body.appendChild(tabBar);

  const cuPanel: ComputerUsePanelAPI = buildComputerUsePanel();
  cuPanel.panelEl.setAttribute('role', 'tabpanel');
  cuPanel.panelEl.setAttribute('aria-labelledby', 'sp-tab-computer-use');
  cuPanel.panelEl.setAttribute('aria-hidden', 'true');

  const runsPanel: CloudRunsPanelAPI = buildCloudRunsPanel({ fileAccess: answerFileAccess });
  runsPanel.panelEl.setAttribute('role', 'tabpanel');
  runsPanel.panelEl.setAttribute('aria-labelledby', 'sp-tab-cloud-runs');
  runsPanel.panelEl.setAttribute('aria-hidden', 'true');

  const pagePanel: BrowserToolsPanelAPI = buildBrowserToolsPanel();
  pagePanel.panelEl.setAttribute('role', 'tabpanel');
  pagePanel.panelEl.setAttribute('aria-labelledby', 'sp-tab-page');
  pagePanel.panelEl.setAttribute('aria-hidden', 'true');

  function switchTab(tab: SidePanelTab): void {
    const chatPanelEl = document.getElementById('sp-chat-panel');
    const workflowsPanelEl = document.getElementById('sp-workflows');
    const inputAreaEl = document.getElementById('sp-input-area');
    const toolbarEl = document.getElementById('sp-toolbar');
    chatTabBtn.classList.toggle('sp-tab-active', tab === 'chat');
    workflowsTabBtn.classList.toggle('sp-tab-active', tab === 'workflows');
    cuTabBtn.classList.toggle('sp-tab-active', tab === 'computer-use');
    runsTabBtn.classList.toggle('sp-tab-active', tab === 'cloud-runs');
    pageTabBtn.classList.toggle('sp-tab-active', tab === 'page');
    chatTabBtn.setAttribute('aria-selected', String(tab === 'chat'));
    workflowsTabBtn.setAttribute('aria-selected', String(tab === 'workflows'));
    cuTabBtn.setAttribute('aria-selected', String(tab === 'computer-use'));
    runsTabBtn.setAttribute('aria-selected', String(tab === 'cloud-runs'));
    pageTabBtn.setAttribute('aria-selected', String(tab === 'page'));
    chatTabBtn.tabIndex = tab === 'chat' ? 0 : -1;
    workflowsTabBtn.tabIndex = tab === 'workflows' ? 0 : -1;
    cuTabBtn.tabIndex = tab === 'computer-use' ? 0 : -1;
    runsTabBtn.tabIndex = tab === 'cloud-runs' ? 0 : -1;
    pageTabBtn.tabIndex = tab === 'page' ? 0 : -1;
    if (chatPanelEl) chatPanelEl.classList.toggle('sp-tab-hidden', tab !== 'chat');
    if (workflowsPanelEl) workflowsPanelEl.classList.toggle('sp-tab-visible', tab === 'workflows');
    cuPanel.panelEl.classList.toggle('sp-tab-visible', tab === 'computer-use');
    runsPanel.panelEl.classList.toggle('sp-tab-visible', tab === 'cloud-runs');
    pagePanel.panelEl.classList.toggle('sp-tab-visible', tab === 'page');
    chatPanelEl?.setAttribute('aria-hidden', String(tab !== 'chat'));
    workflowsPanelEl?.setAttribute('aria-hidden', String(tab !== 'workflows'));
    cuPanel.panelEl.setAttribute('aria-hidden', String(tab !== 'computer-use'));
    runsPanel.panelEl.setAttribute('aria-hidden', String(tab !== 'cloud-runs'));
    pagePanel.panelEl.setAttribute('aria-hidden', String(tab !== 'page'));
    if (inputAreaEl) inputAreaEl.style.display = tab === 'chat' ? '' : 'none';
    if (toolbarEl) toolbarEl.style.display = tab === 'chat' ? '' : 'none';
    tabBar.classList.toggle('sp-tab-bar-exit', tab !== 'chat');
    if (tab === 'workflows') {
      refreshWorkflowsShortcuts();
      refreshWorkflowsTasks();
    }
    if (tab === 'computer-use') {
      cuPanel.refreshAuthChip();
      refreshComputerUseSiteHook();
    }
    // The runs list polls the gateway. Deactivating stops the timer and drops
    // every rendered row, so a hidden tab costs nothing and holds no data.
    runsPanel.setActive(tab === 'cloud-runs');
    // The page lists poll the service worker. A hidden tab stops the timer and
    // holds nothing, so console and request text is never retained unseen.
    pagePanel.setActive(tab === 'page');
  }
  chatTabBtn.addEventListener('click', () => switchTab('chat'));
  workflowsTabBtn.addEventListener('click', () => switchTab('workflows'));
  cuTabBtn.addEventListener('click', () => switchTab('computer-use'));
  runsTabBtn.addEventListener('click', () => switchTab('cloud-runs'));
  pageTabBtn.addEventListener('click', () => switchTab('page'));
  const viewTabs = [chatTabBtn, workflowsTabBtn, cuTabBtn, runsTabBtn, pageTabBtn];
  tabBar.addEventListener('keydown', (event: KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = Math.max(0, viewTabs.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? viewTabs.length - 1
          : event.key === 'ArrowRight'
            ? (currentIndex + 1) % viewTabs.length
            : (currentIndex - 1 + viewTabs.length) % viewTabs.length;
    const nextTab = viewTabs[nextIndex]!;
    switchTab(nextTab.dataset['tab'] as SidePanelTab);
    nextTab.focus();
  });

  const commandPalette = buildCommandPalette(async () => {
    const destinations: PaletteCommand[] = [
      {
        id: 'new-chat',
        section: 'go',
        label: t('spPaletteNewChat'),
        run: () => newChatBtn.click(),
      },
      {
        id: 'search-chats',
        section: 'go',
        label: t('spPaletteSearchChats'),
        run: openRecents,
      },
      ...viewTabs.map((tab): PaletteCommand => ({
        id: `view-${tab.dataset['tab'] ?? ''}`,
        section: 'go',
        label: tab.textContent ?? '',
        detail: t('spPaletteViewDetail'),
        run: () => {
          switchTab(tab.dataset['tab'] as SidePanelTab);
          tab.focus();
        },
      })),
      ...drawerGroups.map((group, index): PaletteCommand => ({
        id: `menu-${index}`,
        section: 'go',
        label: group.label,
        detail: t('spPaletteMenuDetail'),
        run: () => {
          openDrawer(menuBtn);
          openDrawerGroup(group);
        },
      })),
    ];
    const owner = _ctx.managedCloudOwner;
    const chats = owner ? await listConversations(owner).catch(() => []) : [];
    return [
      ...destinations,
      ...chats.map((entry): PaletteCommand => ({
        id: `chat-${entry.id}`,
        section: 'chats',
        label: entry.title,
        detail: formatHistoryDate(entry.savedAt),
        run: () => {
          switchTab('chat');
          void openStoredConversation(entry.id);
        },
      })),
    ];
  });
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== 'k' || event.altKey || event.shiftKey) return;
    if (!(event.metaKey || event.ctrlKey)) return;
    if (document.getElementById('sp-onboarding-overlay')?.classList.contains('visible')) return;
    event.preventDefault();
    commandPalette.open(
      document.activeElement instanceof HTMLElement ? document.activeElement : null,
    );
  });

  const chatPanel = el('div', {
    id: 'sp-chat-panel',
    role: 'tabpanel',
    'aria-labelledby': 'sp-tab-chat',
    'aria-hidden': 'false',
  });

  const msgsArea = el('div', {
    id: 'sp-messages',
    role: 'log',
    'aria-live': 'polite',
    'aria-relevant': 'additions',
  });
  const emptyState = el('div', { id: 'sp-empty' });
  const emptyIcon = el('div', { id: 'sp-empty-icon' });
  const emptyIconSvg = `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="48" aria-hidden="true">
    <circle cx="24" cy="24" r="4" fill="var(--agi-ext-brand)" opacity="0.2"/>
    <g stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <line x1="24" y1="16" x2="24" y2="8" stroke="var(--agi-ext-brand)"/>
      <line x1="28" y1="17.072" x2="32" y2="10.144"/>
      <line x1="30.928" y1="20" x2="37.856" y2="16"/>
      <line x1="32" y1="24" x2="40" y2="24"/>
      <line x1="30.928" y1="28" x2="37.856" y2="32"/>
      <line x1="28" y1="30.928" x2="32" y2="37.856"/>
      <line x1="24" y1="32" x2="24" y2="40"/>
      <line x1="20" y1="30.928" x2="16" y2="37.856"/>
      <line x1="17.072" y1="28" x2="10.144" y2="32"/>
      <line x1="16" y1="24" x2="8" y2="24"/>
      <line x1="17.072" y1="20" x2="10.144" y2="16"/>
      <line x1="20" y1="17.072" x2="16" y2="10.144"/>
    </g>
  </svg>`;
  appendSvgString(emptyIcon, emptyIconSvg);
  emptyState.appendChild(emptyIcon);
  const suggestionGroup = el('div', {
    id: 'sp-empty-suggestions',
    class: 'sp-empty-actions',
    role: 'group',
    'aria-label': t('spSuggestionsLabel'),
    hidden: '',
  });
  const suggestions: Array<[string, string]> = [
    ['/summarize', t('spSuggestionSummarize')],
    ['/explain', t('spSuggestionExplain')],
    ['/extract', t('spSuggestionExtract')],
    ['/translate', t('spSuggestionTranslate')],
  ];
  for (const [command, label] of suggestions) {
    const suggestion = el('button', { class: 'sp-empty-action', type: 'button' });
    suggestion.appendChild(renderIcon(FileText, 15));
    suggestion.appendChild(el('span', { class: 'sp-empty-action-label' }, label));
    suggestion.addEventListener('click', () => sendMessage(command, label));
    suggestionGroup.appendChild(suggestion);
  }
  emptyState.appendChild(suggestionGroup);
  const recentProjectsGroup = el('div', {
    id: 'sp-empty-projects',
    class: 'sp-empty-actions',
    role: 'group',
    'aria-labelledby': 'sp-empty-projects-title',
    hidden: '',
  });
  recentProjectsGroup.appendChild(
    el(
      'h2',
      { class: 'sp-empty-actions-title', id: 'sp-empty-projects-title' },
      t('spRecentProjectsTitle'),
    ),
  );
  recentProjectsGroup.appendChild(
    el('div', { id: 'sp-empty-projects-list', class: 'sp-empty-actions-list' }),
  );
  emptyState.appendChild(recentProjectsGroup);
  chooseChatProject = (project) => selectActiveProject(project);
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
  blockedState.appendChild(
    createElementWith({
      tag: 'span',
      id: 'sp-blocked-desc',
      text: "You can still chat, but Chrome does not let extensions read or automate this page. That covers Chrome's own pages, the Web Store, and pages an administrator has restricted.",
    }),
  );
  msgsArea.appendChild(blockedState);

  chatPanel.appendChild(msgsArea);
  document.body.appendChild(chatPanel);

  const workflowsPanel = el('div', {
    id: 'sp-workflows',
    role: 'tabpanel',
    'aria-labelledby': 'sp-tab-workflows',
    'aria-hidden': 'true',
  });
  workflowsPanel.appendChild(
    el('div', {
      class: 'sp-wf-mutation-status',
      id: 'sp-wf-mutation-status',
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true',
    }),
  );

  const recordSection = el('div', { class: 'sp-wf-section' });
  const recordHeader = el('div', { class: 'sp-wf-section-header' });
  recordHeader.appendChild(el('h2', { class: 'sp-wf-section-title' }, 'Recording'));
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
  const recordStatus = el('div', {
    class: 'sp-wf-record-status',
    role: 'status',
    'aria-live': 'polite',
  });
  recordSection.appendChild(recordStatus);
  function setRecordingStatus(message: string, kind: 'info' | 'error' = 'info'): void {
    recordStatus.textContent = message;
    recordStatus.setAttribute('data-kind', kind);
  }

  const captureRow = el('label', { class: 'sp-wf-capture-values' });
  const captureToggle = el('input', {
    type: 'checkbox',
    id: 'sp-wf-capture-values',
  }) as HTMLInputElement;
  captureRow.appendChild(captureToggle);
  captureRow.appendChild(
    el('span', {}, 'Capture typed values (passwords & sensitive fields redacted)'),
  );
  function syncCaptureValues(): Promise<boolean> {
    const next = captureToggle.checked;
    captureToggle.disabled = true;
    announceWorkflowMutation(t('spRecordingPrivacySaving'));
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'SET_RECORDING_VALUE_CAPTURE', enabled: next },
        (response: { success?: boolean } | undefined) => {
          const runtimeError = chrome.runtime.lastError;
          captureToggle.disabled = false;
          if (runtimeError || !response?.success) {
            captureToggle.checked = !next;
            announceWorkflowMutation(t('spRecordingPrivacySaveFailed'), 'error');
            resolve(false);
            return;
          }
          announceWorkflowMutation(
            next ? t('spRecordingValueCaptureEnabled') : t('spRecordingValueCaptureDisabled'),
            'success',
          );
          resolve(true);
        },
      );
    });
  }
  captureToggle.addEventListener('change', () => {
    void syncCaptureValues();
  });
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
  recordBtn.addEventListener('click', async () => {
    if (isRecording) {
      chrome.runtime.sendMessage(
        { type: 'STOP_RECORDING' },
        (response: { success?: boolean; error?: string } | undefined) => {
          if (chrome.runtime.lastError || !response?.success) {
            setRecordingStatus(
              response?.error ?? chrome.runtime.lastError?.message ?? 'Could not stop recording.',
              'error',
            );
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
          setRecordingStatus('Recording stopped. Name it to save the workflow.');
        },
      );
    } else {
      let activeTab: chrome.tabs.Tab | undefined;
      try {
        [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      } catch {
        activeTab = undefined;
      }
      recordingStartUrl = normalizeShortcutStartUrl(activeTab?.url);
      if (!recordingStartUrl) {
        setRecordingStatus('Open an approved web page before starting a recording.', 'error');
        return;
      }
      // Sync the value-capture choice to the active tab's content script before
      // recording begins (the toggle may have been set on a different tab).
      if (!(await syncCaptureValues())) {
        recordingStartUrl = null;
        setRecordingStatus(t('spRecordingPrivacySaveFailed'), 'error');
        return;
      }
      chrome.runtime.sendMessage(
        { type: 'START_RECORDING' },
        (response: { success?: boolean; error?: string } | undefined) => {
          if (chrome.runtime.lastError || !response?.success) {
            recordingStartUrl = null;
            setRecordingStatus(
              response?.error ?? chrome.runtime.lastError?.message ?? 'Could not start recording.',
              'error',
            );
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
          setRecordingStatus(`Recording actions on ${new URL(recordingStartUrl!).host}.`);
        },
      );
    }
  });
  saveCancelBtn.addEventListener('click', () => {
    saveDialog.classList.remove('open');
    recordingStartUrl = null;
    setRecordingStatus('Recording discarded.');
  });
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
          saveNameInput.placeholder = t('spShortcutActionsFailed');
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
        chrome.runtime.sendMessage(
          { type: 'SAVE_SHORTCUT', name, actions: recActions, startUrl: recordingStartUrl },
          (saveResponse: { success?: boolean; error?: string } | undefined) => {
            if (chrome.runtime.lastError || !saveResponse?.success) {
              const origPlaceholder = saveNameInput.placeholder;
              saveNameInput.placeholder = t('spShortcutSaveFailed');
              saveNameInput.style.borderColor = 'var(--agi-ext-danger)';
              setRecordingStatus(
                saveResponse?.error ??
                  chrome.runtime.lastError?.message ??
                  'Could not save recording.',
                'error',
              );
              setTimeout(() => {
                saveNameInput.placeholder = origPlaceholder;
                saveNameInput.style.borderColor = '';
              }, 2000);
              return;
            }
            saveDialog.classList.remove('open');
            recordingStartUrl = null;
            setRecordingStatus('Workflow saved.');
            refreshWorkflowsShortcuts();
          },
        );
      },
    );
  });
  saveNameInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') saveConfirmBtn.click();
  });
  workflowsPanel.appendChild(recordSection);

  const shortcutsSection = el('div', { class: 'sp-wf-section' });
  const shortcutsSectionHeader = el('div', { class: 'sp-wf-section-header' });
  const shortcutsTitle = el('h2', { class: 'sp-wf-section-title' });
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

  const createShortcutOverlay = el('div', {
    class: 'sp-create-shortcut-overlay',
    id: 'sp-create-shortcut-overlay',
    'aria-hidden': 'true',
  });
  const createShortcutModal = el('div', {
    class: 'sp-create-shortcut-modal',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'sp-create-shortcut-title',
  });
  const modalHeader = el('div', { class: 'sp-create-shortcut-header' });
  const modalTitle = el(
    'div',
    { class: 'sp-create-shortcut-title', id: 'sp-create-shortcut-title' },
    t('spShortcutCreate'),
  );
  modalHeader.appendChild(modalTitle);
  const modalCloseBtn = el(
    'button',
    {
      class: 'sp-create-shortcut-close',
      type: 'button',
      title: 'Close',
      'aria-label': 'Close shortcut dialog',
    },
    '×',
  );
  modalHeader.appendChild(modalCloseBtn);
  createShortcutModal.appendChild(modalHeader);

  const nameField = el('div', { class: 'sp-create-shortcut-field' });
  nameField.appendChild(
    el('label', { class: 'sp-create-shortcut-label', for: 'sp-sc-name' }, 'Name'),
  );
  const scNameInput = el('input', {
    class: 'sp-create-shortcut-input',
    placeholder: 'e.g. Daily research',
    id: 'sp-sc-name',
    'aria-describedby': 'sp-sc-command',
  }) as HTMLInputElement;
  nameField.appendChild(scNameInput);
  const scCommandHint = el('div', { class: 'sp-create-shortcut-hint', id: 'sp-sc-command' });
  nameField.appendChild(scCommandHint);
  createShortcutModal.appendChild(nameField);

  const promptField = el('div', { class: 'sp-create-shortcut-field' });
  promptField.appendChild(
    el('label', { class: 'sp-create-shortcut-label', for: 'sp-sc-prompt' }, 'Prompt'),
  );
  const scPromptInput = el('textarea', {
    class: 'sp-create-shortcut-textarea',
    placeholder: t('spShortcutPromptPlaceholder', [SHORTCUT_INPUT_PLACEHOLDER]),
    id: 'sp-sc-prompt',
    'aria-describedby': 'sp-sc-prompt-hint',
  }) as HTMLTextAreaElement;
  promptField.appendChild(scPromptInput);
  promptField.appendChild(
    el(
      'div',
      { class: 'sp-create-shortcut-hint', id: 'sp-sc-prompt-hint' },
      t('spShortcutInputHint', [SHORTCUT_INPUT_PLACEHOLDER]),
    ),
  );
  createShortcutModal.appendChild(promptField);

  const scError = el('div', { class: 'sp-wf-form-error', role: 'status', 'aria-live': 'polite' });
  createShortcutModal.appendChild(scError);

  const modalActions = el('div', { class: 'sp-create-shortcut-actions' });
  const scCancelBtn = el('button', { class: 'sp-create-shortcut-cancel' }, 'Cancel');
  const scSaveBtn = el(
    'button',
    { class: 'sp-create-shortcut-save' },
    t('spShortcutCreate'),
  ) as HTMLButtonElement;
  modalActions.appendChild(scCancelBtn);
  modalActions.appendChild(scSaveBtn);
  createShortcutModal.appendChild(modalActions);
  createShortcutOverlay.appendChild(createShortcutModal);
  document.body.appendChild(createShortcutOverlay);

  let createShortcutReturnFocus: HTMLElement = createShortcutBtn;
  let editingShortcutId: string | null = null;

  function renderShortcutCommandHint(): void {
    const command = shortcutCommand(scNameInput.value);
    scCommandHint.textContent = command ? t('spShortcutCommandHint', [command]) : '';
  }

  function showShortcutProblem(
    field: HTMLInputElement | HTMLTextAreaElement,
    message: string,
  ): void {
    scNameInput.removeAttribute('aria-invalid');
    scPromptInput.removeAttribute('aria-invalid');
    field.setAttribute('aria-invalid', 'true');
    scError.textContent = message;
    field.focus();
  }

  function openShortcutModal(shortcut: PromptShortcut | null): void {
    editingShortcutId = shortcut?.id ?? null;
    scNameInput.value = shortcut?.name ?? '';
    scPromptInput.value = shortcut?.prompt ?? '';
    scNameInput.removeAttribute('aria-invalid');
    scPromptInput.removeAttribute('aria-invalid');
    scError.textContent = '';
    modalTitle.textContent = shortcut ? t('spShortcutEditTitle') : t('spShortcutCreate');
    scSaveBtn.textContent = shortcut ? t('spShortcutSaveChanges') : t('spShortcutCreate');
    renderShortcutCommandHint();
    if (document.activeElement instanceof HTMLElement) {
      createShortcutReturnFocus = document.activeElement;
    }
    createShortcutOverlay.setAttribute('aria-hidden', 'false');
    createShortcutOverlay.classList.add('open');
    setTimeout(() => scNameInput.focus(), 50);
  }
  function closeCreateShortcutModal(): void {
    createShortcutOverlay.classList.remove('open');
    createShortcutOverlay.setAttribute('aria-hidden', 'true');
    createShortcutReturnFocus.focus();
  }
  editPromptShortcut = openShortcutModal;

  createShortcutBtn.addEventListener('click', () => openShortcutModal(null));
  scNameInput.addEventListener('input', renderShortcutCommandHint);
  modalCloseBtn.addEventListener('click', closeCreateShortcutModal);
  scCancelBtn.addEventListener('click', closeCreateShortcutModal);
  createShortcutOverlay.addEventListener('click', (e: MouseEvent) => {
    if (e.target === createShortcutOverlay) closeCreateShortcutModal();
  });
  createShortcutModal.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCreateShortcutModal();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      createShortcutModal.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((node) => !node.hasAttribute('hidden'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  scSaveBtn.addEventListener('click', () => {
    const name = scNameInput.value.trim();
    const prompt = scPromptInput.value.trim();
    const editing = editingShortcutId;
    const conflict = shortcutCommandConflict(name, promptShortcuts, editing ?? undefined);
    if (conflict === 'unnamed') {
      showShortcutProblem(scNameInput, t('spShortcutNameUnusable'));
      return;
    }
    if (conflict === 'taken') {
      showShortcutProblem(scNameInput, t('spShortcutNameTaken', [shortcutCommand(name)]));
      return;
    }
    if (!prompt.split(SHORTCUT_INPUT_PLACEHOLDER).join('').trim()) {
      showShortcutProblem(scPromptInput, t('spShortcutPromptMissing'));
      return;
    }
    scNameInput.removeAttribute('aria-invalid');
    scPromptInput.removeAttribute('aria-invalid');
    scError.textContent = '';
    scSaveBtn.disabled = true;
    scSaveBtn.textContent = t('spShortcutSaving');
    chrome.runtime.sendMessage(
      editing
        ? { type: 'UPDATE_SHORTCUT', shortcutId: editing, name, prompt }
        : { type: 'SAVE_SHORTCUT', name, actions: [], prompt },
      (response: { success?: boolean; error?: string } | undefined) => {
        scSaveBtn.disabled = false;
        scSaveBtn.textContent = editing ? t('spShortcutSaveChanges') : t('spShortcutCreate');
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError || !response?.success) {
          scError.textContent =
            response?.error ?? runtimeError?.message ?? t('spShortcutSaveFailed');
          return;
        }
        closeCreateShortcutModal();
        announceWorkflowMutation(
          editing ? t('spShortcutUpdated', [name]) : `Shortcut "${name}" created.`,
          'success',
        );
        refreshWorkflowsShortcuts();
      },
    );
  });

  const tasksSection = el('div', { class: 'sp-wf-section' });
  const tasksSectionHeader = el('div', { class: 'sp-wf-section-header' });
  const tasksTitle = el('h2', { class: 'sp-wf-section-title' });
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
  newTaskForm.appendChild(
    el('label', { class: 'sp-wf-form-label', for: 'sp-wf-nt-name' }, 'Task Name'),
  );
  const ntNameInput = el('input', {
    class: 'sp-wf-form-input',
    placeholder: 'e.g. Check news',
    id: 'sp-wf-nt-name',
  }) as HTMLInputElement;
  newTaskForm.appendChild(ntNameInput);
  newTaskForm.appendChild(
    el(
      'label',
      { class: 'sp-wf-form-label', for: 'sp-wf-nt-description' },
      t('spTaskDescriptionLabel'),
    ),
  );
  const ntDescriptionInput = el('input', {
    class: 'sp-wf-form-input',
    placeholder: t('spTaskDescriptionPlaceholder'),
    id: 'sp-wf-nt-description',
  }) as HTMLInputElement;
  newTaskForm.appendChild(ntDescriptionInput);
  newTaskForm.appendChild(
    el('label', { class: 'sp-wf-form-label', for: 'sp-wf-nt-prompt' }, 'Prompt'),
  );
  const ntPromptInput = el('textarea', {
    class: 'sp-wf-form-input sp-wf-form-textarea',
    placeholder: 'What should the AI do?',
    id: 'sp-wf-nt-prompt',
    rows: '4',
  }) as HTMLTextAreaElement;
  newTaskForm.appendChild(ntPromptInput);
  newTaskForm.appendChild(
    el('label', { class: 'sp-wf-form-label', for: 'sp-wf-nt-schedule' }, 'Schedule'),
  );
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

  let editingTask: ScheduledTaskRow | null = null;
  const idleSaveLabel = (): string => (editingTask ? t('spTaskSaveChanges') : t('spTaskCreate'));

  const resetNewTaskForm = (): void => {
    newTaskForm.classList.remove('open');
    editingTask = null;
    ntNameInput.value = '';
    ntDescriptionInput.value = '';
    ntPromptInput.value = '';
    ntScheduleSelect.value = 'daily';
    ntNameInput.style.borderColor = '';
    ntPromptInput.style.borderColor = '';
    ntFormError.textContent = '';
    ntSaveBtn.removeAttribute('disabled');
    ntSaveBtn.textContent = t('spTaskCreate');
  };
  resetScheduledTaskDraftForOwnerTransition = resetNewTaskForm;
  openScheduledTaskEditor = (task) => {
    resetNewTaskForm();
    editingTask = task;
    ntNameInput.value = task.name;
    ntDescriptionInput.value = task.description ?? '';
    ntPromptInput.value = task.prompt ?? '';
    ntScheduleSelect.value = task.scheduleType;
    ntSaveBtn.textContent = idleSaveLabel();
    newTaskForm.classList.add('open');
    newTaskForm.scrollIntoView?.({ block: 'nearest' });
    ntNameInput.focus();
  };

  newTaskBtn.addEventListener('click', () => {
    if (editingTask) {
      resetNewTaskForm();
      newTaskForm.classList.add('open');
    } else {
      newTaskForm.classList.toggle('open');
    }
    ntFormError.textContent = '';
    if (newTaskForm.classList.contains('open')) ntNameInput.focus();
  });
  ntCancelBtn.addEventListener('click', () => {
    scheduledTaskCreateRequestFence.invalidate();
    resetNewTaskForm();
  });
  ntSaveBtn.addEventListener('click', () => {
    const name = ntNameInput.value.trim();
    const description = ntDescriptionInput.value.trim();
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
    const editing = editingTask;
    ntFormError.textContent = '';
    ntSaveBtn.setAttribute('disabled', 'true');
    ntSaveBtn.textContent = editing ? t('spTaskSaving') : t('spTaskCreating');
    const createRequest = scheduledTaskCreateRequestFence.begin(_ctx.managedCloudOwner);
    const owner = createRequest.owner ? { owner: createRequest.owner } : {};
    chrome.runtime.sendMessage(
      editing
        ? {
            type: 'UPDATE_SCHEDULED_TASK',
            ...owner,
            taskId: editing.id,
            updates: {
              name,
              description,
              prompt,
              scheduleType: ntScheduleSelect.value,
            },
          }
        : {
            type: 'CREATE_SCHEDULED_TASK',
            ...owner,
            task: {
              name,
              ...(description ? { description } : {}),
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
        ntSaveBtn.textContent = idleSaveLabel();
        const runtimeError = chrome.runtime.lastError?.message;
        if (runtimeError || response?.success !== true) {
          ntFormError.textContent =
            runtimeError ||
            response?.error ||
            (editing ? t('spTaskSaveFailed') : t('spTaskCreateFailed'));
          return;
        }
        resetNewTaskForm();
        if (editing) announceWorkflowMutation(t('spTaskUpdated', [name]), 'success');
        refreshWorkflowsTasks();
      },
    );
  });

  const groupsSection = el('div', { class: 'sp-wf-section' });
  groupsSection.appendChild(
    (() => {
      const h = el('div', { class: 'sp-wf-section-header' });
      h.appendChild(el('h2', { class: 'sp-wf-section-title' }, 'Tab Groups'));
      return h;
    })(),
  );
  groupsSection.appendChild(
    el('div', { class: 'sp-wf-group-desc' }, 'Organize tabs into groups for focused workflows.'),
  );
  const groupBtnsRow = el('div', { class: 'sp-wf-group-btns' });
  const wfGroupAddBtn = el('button', { class: 'sp-wf-group-action-btn' }, t('spGroupTabAdd'));
  const wfGroupRemoveBtn = el('button', { class: 'sp-wf-group-action-btn' }, t('spGroupTabRemove'));
  wfGroupAddBtn.addEventListener('click', () => {
    requestTabGroupChange(true);
  });
  wfGroupRemoveBtn.addEventListener('click', () => {
    requestTabGroupChange(false);
  });
  registerTabGroupStateRenderer((grouped, known) => {
    wfGroupAddBtn.disabled = !known || grouped;
    wfGroupRemoveBtn.disabled = !known || !grouped;
    wfGroupAddBtn.classList.toggle('active', grouped && known);
    wfGroupAddBtn.title = known
      ? grouped
        ? t('spTabGroupAlreadyGrouped')
        : t('spTabGroupAddTitle')
      : t('spTabGroupChecking');
    wfGroupRemoveBtn.title = known
      ? grouped
        ? t('spTabGroupRemoveTitle')
        : t('spTabGroupNotGrouped')
      : t('spTabGroupChecking');
  });
  groupBtnsRow.appendChild(wfGroupAddBtn);
  groupBtnsRow.appendChild(wfGroupRemoveBtn);
  groupsSection.appendChild(groupBtnsRow);
  workflowsPanel.appendChild(groupsSection);
  document.body.appendChild(workflowsPanel);

  document.body.appendChild(cuPanel.panelEl);

  document.body.appendChild(runsPanel.panelEl);

  document.body.appendChild(pagePanel.panelEl);

  for (const [tabBtn, panel] of [
    [chatTabBtn, chatPanel],
    [workflowsTabBtn, workflowsPanel],
    [cuTabBtn, cuPanel.panelEl],
    [runsTabBtn, runsPanel.panelEl],
    [pageTabBtn, pagePanel.panelEl],
  ] as const) {
    panel.prepend(el('h1', { class: 'sp-visually-hidden' }, tabBtn.textContent ?? ''));
  }

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
        cuPanel.setPaused(false);
        switchTab('computer-use');
      } else if (status === 'paused' && cuPanel.ownsRun(runId)) {
        cuPanel.noteRunActivity();
        cuPanel.setPaused(true, typeof m['reason'] === 'string' ? m['reason'] : undefined);
        switchTab('computer-use');
      } else if (
        (status === 'stopped' || status === 'completed' || status === 'error') &&
        cuPanel.ownsRun(runId)
      ) {
        const stoppedBecause = describeCancellationReason(m['reason']);
        cuPanel.setRunState(false, runId as string);
        if (status !== 'completed' && stoppedBecause) {
          cuPanel.showHandoffBanner(stoppedBecause, 'run_stopped');
          switchTab('computer-use');
        }
      }
    } else if (m['type'] === 'AGI_DOWNLOAD_CHANGED') {
      const download = m['download'] as Parameters<BrowserToolsPanelAPI['applyDownload']>[0];
      if (download && typeof download.id === 'number') pagePanel.applyDownload(download);
    } else if (m['type'] === 'AGI_CU_STEP') {
      if (!cuPanel.ownsRun(runId)) return;
      cuPanel.noteRunActivity();
      const step = m['step'] as Parameters<ComputerUsePanelAPI['appendStep']>[0];
      cuPanel.appendStep(step);
      switchTab('computer-use');
    } else if (m['type'] === 'AGI_CU_USAGE') {
      if (!cuPanel.ownsRun(runId)) return;
      cuPanel.noteRunActivity();
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
      cuPanel.noteRunActivity();
      const reason = typeof m['reason'] === 'string' ? m['reason'] : 'Fast-path autofill stalled.';
      cuPanel.showHandoffBanner(reason);
      switchTab('computer-use');
    } else if (m['type'] === 'AGI_CU_APPROVE_REQUEST') {
      if (!cuPanel.ownsRun(runId)) return;
      cuPanel.noteRunActivity();
      const requestId = typeof m['requestId'] === 'string' ? m['requestId'] : '';
      const toolName = typeof m['toolName'] === 'string' ? m['toolName'] : 'action';
      const description = typeof m['description'] === 'string' ? m['description'] : '';
      switchTab('computer-use');
      cuPanel.showApprovalCard(
        toolName,
        description,
        m['canAllowForTask'] === true,
        (decision: ComputerUseApprovalDecision) => {
          void chrome.runtime.sendMessage({
            type: 'AGI_CU_APPROVE_RESPONSE',
            requestId,
            allowed: decision !== 'skip',
            forTask: decision === 'allow-for-task',
          });
        },
      );
    }
  });

  async function startComputerUseRun(goal: string, tabId: number): Promise<void> {
    const requestedRunId = `cu_run_${crypto.randomUUID()}`;
    cuPanel.setRunState(true, requestedRunId);

    let startResponse:
      { success?: boolean; runId?: string; runGeneration?: number; error?: string } | undefined;
    try {
      startResponse = (await chrome.runtime.sendMessage({
        type: 'AGI_START_COMPUTER_USE',
        runId: requestedRunId,
        goal,
        tabId,
      })) as typeof startResponse;
    } catch (error) {
      if (!cuPanel.ownsRun(requestedRunId)) return;
      cuPanel.setRunState(false, requestedRunId);
      cuPanel.showHandoffBanner(
        error instanceof Error ? error.message : 'Computer use could not start. Please try again.',
        'error',
      );
      return;
    }

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
  }

  let computerUseSiteGeneration = 0;
  async function refreshComputerUseSite(): Promise<void> {
    const generation = ++computerUseSiteGeneration;
    let tab: chrome.tabs.Tab | undefined;
    try {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    } catch {
      tab = undefined;
    }
    const url = tab?.url ?? '';
    const origin = isRestrictedPageUrl(url) ? null : normalizeApprovedSiteOrigin(url);
    if (!origin) {
      if (generation === computerUseSiteGeneration) {
        cuPanel.setTaskSite({ kind: url ? 'restricted' : 'none' });
      }
      return;
    }
    const [allowlist, controlled] = await Promise.all([
      drawerReadAllowlist(),
      hasBrowserControlConsent(origin).catch(() => false),
    ]);
    if (generation !== computerUseSiteGeneration) return;
    cuPanel.setTaskSite({
      kind: allowlist.includes(origin) && controlled ? 'ready' : 'needs-approval',
      origin,
    });
  }
  refreshComputerUseSiteHook = () => void refreshComputerUseSite();

  cuPanel.onApproveSite((origin) => {
    const hostGranted = requestBrowserControlHostPermission(origin);
    void hostGranted.then(async (granted) => {
      if (!granted) {
        cuPanel.showHandoffBanner(
          `Chrome did not grant site access for ${origin}, so browser control was not enabled.`,
          'error',
        );
        return;
      }
      try {
        const list = await drawerReadAllowlist();
        if (!list.includes(origin)) await drawerWriteAllowlist([...list, origin]);
        await grantBrowserControlConsent(origin);
      } catch (error) {
        await removeBrowserControlHostPermission(origin);
        cuPanel.showHandoffBanner(
          error instanceof Error ? error.message : 'This site could not be approved.',
          'error',
        );
        return;
      }
      await refreshComputerUseSite();
      cuPanel.hideHandoffBanner();
      cuPanel.focusTask();
    });
  });

  cuPanel.onStartTask((goal) => {
    void (async () => {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) {
        cuPanel.showHandoffBanner('Could not determine the active tab. Please try again.', 'error');
        return;
      }
      cuPanel.hideHandoffBanner();
      await startComputerUseRun(goal, activeTab.id);
    })();
  });

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
        { shouldEscalate?: boolean; agentGoal?: string; triggers?: unknown[] } | undefined;

      if (!escalation?.shouldEscalate) {
        cuPanel.showHandoffBanner('No agent escalation needed.', 'success');
        switchTab('computer-use');
        return;
      }

      const goal = typeof escalation.agentGoal === 'string' ? escalation.agentGoal : '';
      cuPanel.showHandoffBanner(
        `Fast-path autofill stalled (${String(escalation.triggers?.length ?? 0)} trigger(s)). ` +
          `Switching to computer use…`,
      );
      switchTab('computer-use');
      await startComputerUseRun(goal, activeTabId);
    })();
  });

  const toolbar = el('div', { id: 'sp-toolbar' });

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
  const groupBtnLabel = document.createTextNode(t('spDrawerGroupTab'));
  groupBtn.appendChild(groupBtnLabel);
  groupBtn.addEventListener('click', () => {
    requestTabGroupChange(!currentTabGrouped);
  });
  registerTabGroupStateRenderer((grouped, known) => {
    groupBtn.disabled = !known;
    groupBtnLabel.textContent = grouped ? t('spDrawerUngroupTab') : t('spDrawerGroupTab');
    groupBtn.classList.toggle('has-context', grouped && known);
    groupBtn.setAttribute('aria-pressed', grouped && known ? 'true' : 'false');
    groupBtn.title = known
      ? grouped
        ? t('spTabGroupRemoveTitle')
        : t('spTabGroupAddTitle')
      : t('spTabGroupChecking');
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
          message: t('spGateReturnAfterSignIn'),
          action: 'retry',
          actionLabel: t('spCloudCheckSignIn'),
        });
      } else if (action === 'open_web') {
        await chrome.tabs.create({ url: 'https://agiworkforce.com' });
      } else if (action === 'upgrade') {
        await chrome.tabs.create({
          url: 'https://agiworkforce.com/pricing?from=chrome-extension&feature=managed_chat',
        });
      } else if (action === 'billing') {
        await chrome.tabs.create({
          url: 'https://agiworkforce.com/settings/billing?from=chrome-extension',
        });
      } else if (action === 'usage') {
        await chrome.tabs.create({
          url: 'https://agiworkforce.com/settings/usage?from=chrome-extension',
        });
      } else if (action === 'recovery' && managedCloudGateHref) {
        await chrome.tabs.create({ url: agiWebUrl(managedCloudGateHref) });
      } else if (action === 'retry') {
        await refreshCloudAccountUI(true);
      }
    } catch (error) {
      setManagedCloudChatState('unavailable', {
        message: error instanceof Error ? error.message : t('spGateOpenFailed'),
        action: 'retry',
        actionLabel: t('spGateRetry'),
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
    placeholder: t('spComposerPlaceholder'),
    rows: '1',
    name: 'message',
    'aria-label': 'Message AGI',
  }) as HTMLTextAreaElement;

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
      item.addEventListener('mousedown', (ev: Event) => {
        ev.preventDefault();
        acceptSlash(i);
      });
      slashMenu.appendChild(item);
    });
    slashMenu.classList.add('visible');
    inputEl.setAttribute('aria-activedescendant', `sp-slash-opt-${slashActive}`);
    slashMenu.querySelector<HTMLElement>('.sp-slash-item.active')?.scrollIntoView({
      block: 'nearest',
    });
  }

  function closeSlashMenu(): void {
    slashMatches = [];
    slashActive = 0;
    renderSlashMenu();
  }

  function acceptSlash(index: number): void {
    const picked = slashMatches[index];
    if (!picked) return;
    replaceComposerText(inputEl, `${picked[0]} `);
    closeSlashMenu();
    autoResizeInput(inputEl);
    updateSendButton();
  }

  function refreshSlashMenu(): void {
    slashMatches = matchSlashCommands(inputEl.value, promptShortcuts);
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
      e.stopImmediatePropagation();
      acceptSlash(slashActive);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeSlashMenu();
    }
  });

  function approveSiteForReading(url: string): Promise<boolean> {
    const origin = normalizeApprovedSiteOrigin(url);
    if (!origin) return Promise.resolve(false);
    return requestApprovedSiteHostPermission(origin).then(async (granted) => {
      if (!granted) return false;
      const list = await drawerReadAllowlist();
      if (!list.includes(origin)) await drawerWriteAllowlist([...list, origin]);
      return true;
    });
  }

  function attachPageCapture(capture: PageContextCapture): void {
    if (capture.ok) {
      _ctx.pendingPageContext = capture.text;
      _ctx.pendingPageContextSource = capture.source;
      composerContextNotice = null;
    } else {
      composerContextNotice = capture.reason;
    }
    updateAttachmentPreview();
    updateContextButton();
  }

  async function attachChosenTab(tab: chrome.tabs.Tab, approval: Promise<boolean>): Promise<void> {
    if (!(await approval)) {
      attachPageCapture({
        ok: false,
        reason: t('spSiteAccessRefused', [pageChipLabel(tab.url ?? '')]),
      });
      return;
    }
    attachPageCapture(await readTabText(tab, true));
  }

  const mentionMenu = el('div', {
    id: 'sp-mention-menu',
    role: 'listbox',
    'aria-label': t('spMentionMenuLabel'),
  });
  type MentionOption =
    | { kind: 'tab'; tab: chrome.tabs.Tab; label: string; detail: string }
    | { kind: 'project'; project: ActiveProjectSelection; label: string; detail: string };
  let mentionOptions: MentionOption[] = [];
  let mentionActive = 0;
  let mentionStart = -1;
  let mentionGeneration = 0;
  let mentionTabs: chrome.tabs.Tab[] = [];
  let mentionProjects: ActiveProjectSelection[] = [];

  const mentionOpen = (): boolean => mentionOptions.length > 0;

  function mentionAtCaret(): { start: number; end: number; query: string } | null {
    const end = inputEl.selectionStart ?? inputEl.value.length;
    if (end !== (inputEl.selectionEnd ?? end)) return null;
    const match = /(?:^|\s)@([^\s@]*)$/.exec(inputEl.value.slice(0, end));
    if (!match) return null;
    const query = match[1] ?? '';
    return { start: end - query.length - 1, end, query: query.toLowerCase() };
  }

  function renderMentionMenu(): void {
    mentionMenu.textContent = '';
    if (!mentionOpen()) {
      mentionMenu.classList.remove('visible');
      if (!slashOpen()) inputEl.removeAttribute('aria-activedescendant');
      return;
    }
    let group: MentionOption['kind'] | null = null;
    mentionOptions.forEach((option, index) => {
      if (option.kind !== group) {
        group = option.kind;
        mentionMenu.appendChild(
          el(
            'div',
            { class: 'sp-mention-heading', role: 'presentation' },
            option.kind === 'tab' ? t('spMentionTabs') : t('spMentionProjects'),
          ),
        );
      }
      const item = el('button', {
        class: `sp-slash-item${index === mentionActive ? ' active' : ''}`,
        type: 'button',
        role: 'option',
        id: `sp-mention-opt-${index}`,
        'aria-selected': String(index === mentionActive),
        tabindex: '-1',
      });
      item.appendChild(el('span', { class: 'sp-slash-name' }, option.label));
      item.appendChild(el('span', { class: 'sp-slash-hint' }, option.detail));
      item.addEventListener('mousedown', (event: Event) => {
        event.preventDefault();
        acceptMention(index);
      });
      mentionMenu.appendChild(item);
    });
    mentionMenu.classList.add('visible');
    inputEl.setAttribute('aria-activedescendant', `sp-mention-opt-${mentionActive}`);
    mentionMenu.querySelector<HTMLElement>('.sp-slash-item.active')?.scrollIntoView({
      block: 'nearest',
    });
  }

  function closeMentionMenu(): void {
    mentionGeneration += 1;
    mentionOptions = [];
    mentionActive = 0;
    mentionStart = -1;
    renderMentionMenu();
  }

  function recomputeMentionOptions(): void {
    const mention = mentionAtCaret();
    if (!mention || mentionStart === -1) return;
    const matchesQuery = (...texts: string[]): boolean =>
      texts.some((text) => text.toLowerCase().includes(mention.query));
    const tabOptions = mentionTabs.flatMap((tab): MentionOption[] => {
      const url = tab.url ?? '';
      const label = tab.title || pageChipLabel(url);
      const detail = pageChipLabel(url);
      return matchesQuery(label, url) ? [{ kind: 'tab', tab, label, detail }] : [];
    });
    const projectOptions = mentionProjects.flatMap((project): MentionOption[] =>
      matchesQuery(project.name)
        ? [{ kind: 'project', project, label: project.name, detail: t('spMentionProjectDetail') }]
        : [],
    );
    mentionOptions = [...tabOptions, ...projectOptions];
    if (mentionActive >= mentionOptions.length) mentionActive = 0;
    renderMentionMenu();
  }

  function refreshMentionMenu(): void {
    const mention =
      managedCloudChatState === 'ready' && _ctx.managedCloudOwner !== null
        ? mentionAtCaret()
        : null;
    if (!mention) {
      if (mentionStart !== -1) closeMentionMenu();
      return;
    }
    const opening = mentionStart === -1;
    mentionStart = mention.start;
    if (!opening) {
      recomputeMentionOptions();
      return;
    }
    const generation = ++mentionGeneration;
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      if (generation !== mentionGeneration) return;
      mentionTabs = chrome.runtime.lastError
        ? []
        : tabs.filter((tab) => tab.id !== undefined && !!tab.url && !isRestrictedPageUrl(tab.url));
      recomputeMentionOptions();
    });
    void listChromeProjects().then((result) => {
      if (generation !== mentionGeneration) return;
      mentionProjects =
        result.status === 'success'
          ? result.projects.map((project) => ({ id: project.id, name: project.name }))
          : [];
      recomputeMentionOptions();
    });
  }

  function acceptMention(index: number): void {
    const option = mentionOptions[index];
    const mention = mentionAtCaret();
    if (!option || !mention) return;
    const approval =
      option.kind === 'tab' && option.tab.id !== activePageSource?.tabId
        ? approveSiteForReading(option.tab.url ?? '')
        : Promise.resolve(true);
    closeMentionMenu();
    replaceComposerRange(inputEl, mention.start, mention.end, '');
    autoResizeInput(inputEl);
    updateSendButton();
    if (option.kind === 'project') {
      chooseChatProject(option.project);
      return;
    }
    void attachChosenTab(option.tab, approval);
  }

  inputEl.addEventListener('input', refreshMentionMenu);
  inputEl.addEventListener('blur', () => closeMentionMenu());
  inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!mentionOpen()) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mentionActive = (mentionActive + 1) % mentionOptions.length;
      renderMentionMenu();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      mentionActive = (mentionActive - 1 + mentionOptions.length) % mentionOptions.length;
      renderMentionMenu();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
      acceptMention(mentionActive);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeMentionMenu();
    }
  });

  inputEl.addEventListener('input', () => {
    autoResizeInput(inputEl);
    updateSendButton();
  });
  inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      const text = inputEl.value;
      if (!submitComposerText(text)) return;
      inputEl.value = '';
      autoResizeInput(inputEl);
      updateSendButton();
    }
  });

  inputEl.addEventListener('paste', (e: ClipboardEvent) => {
    const pasted = filesFromDataTransfer(e.clipboardData);
    if (pasted.length === 0) return;
    e.preventDefault();
    acceptIncomingComposerFiles(pasted);
  });

  const sendBtn = el('button', {
    id: 'sp-send-btn',
    title: 'Send (Enter, Shift+Enter for a new line)',
    'aria-label': 'Send message',
    'data-mode': 'send',
  });
  sendBtn.appendChild(renderIcon(ArrowUp, 16));
  sendBtn.addEventListener('click', () => {
    if (sendBtn.getAttribute('data-mode') === 'stop') {
      trackProductEvent(
        'generation_stopped',
        _ctx.messages.find((message) => message.id === _ctx.currentStreamId)?.runtime,
      );
      cancelCurrentManagedStream(true);
      return;
    }
    const text = inputEl.value;
    if (!canAdmitComposerMessage(text)) return;
    inputEl.value = '';
    autoResizeInput(inputEl);
    sendMessage(text);
  });

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
    id: 'sp-attach-screenshot-item',
    type: 'button',
    role: 'menuitem',
  });
  screenshotItem.appendChild(renderIcon(Camera, 16));
  screenshotItem.appendChild(el('span', { class: 'sp-attach-menu-label' }, 'Take a screenshot'));
  screenshotItem.addEventListener('click', () => {
    attachMenu.classList.remove('open');
    attachBtn.setAttribute('aria-expanded', 'false');
    composerAttachmentNotices = [];
    composerAttachmentIntakeCount += 1;
    updateAttachmentPreview();
    const finishScreenshotCapture = (
      resp: { success?: boolean; data?: string; error?: string } | undefined,
    ): void => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError || !resp?.success || !resp.data) {
        composerAttachmentNotices = [resp?.error ?? t('spAttachmentCaptureFailed')];
      } else {
        admitComposerAttachment(resp.data, t('spScreenshotName'));
      }
      composerAttachmentIntakeCount = Math.max(0, composerAttachmentIntakeCount - 1);
      updateAttachmentPreview();
    };
    try {
      chrome.runtime.sendMessage(
        { type: 'CAPTURE_SCREENSHOT', format: 'png', quality: 90 },
        finishScreenshotCapture,
      );
    } catch {
      composerAttachmentNotices = [t('spAttachmentCaptureFailed')];
      composerAttachmentIntakeCount = Math.max(0, composerAttachmentIntakeCount - 1);
      updateAttachmentPreview();
    }
  });

  const fileItem = el('button', {
    class: 'sp-attach-menu-item',
    id: 'sp-attach-file-item',
    type: 'button',
    role: 'menuitem',
  });
  fileItem.appendChild(renderIcon(FileImage, 16));
  fileItem.appendChild(
    el('span', { class: 'sp-attach-menu-label' }, t('spAttachUploadFromDevice')),
  );
  const fileInput = el('input', {
    type: 'file',
    accept: COMPOSER_ATTACHMENT_ACCEPT,
    multiple: '',
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

  contextBtn = el('button', {
    class: 'sp-attach-menu-item',
    id: 'sp-context-item',
    type: 'button',
    role: 'menuitemcheckbox',
    'aria-checked': 'false',
  }) as HTMLButtonElement;
  contextBtn.appendChild(renderIcon(Globe, 16));
  const contextItemLabel = el('span', { class: 'sp-attach-menu-label' }, t('spContextItem'));
  contextBtn.appendChild(contextItemLabel);
  const contextItemCheck = el('span', { class: 'sp-attach-menu-check' });
  contextBtn.appendChild(contextItemCheck);
  contextBtn.addEventListener('click', async () => {
    const chip = contextBtn!;
    if (_ctx.pendingPageContext) {
      clearPendingPageContext();
      updateContextButton();
      return;
    }
    contextItemLabel.textContent = t('spContextChipCapturing');
    chip.disabled = true;
    const capture = await capturePageContext();
    chip.disabled = false;
    if (capture.ok) {
      _ctx.pendingPageContext = capture.text;
      _ctx.pendingPageContextSource = capture.source;
      composerContextNotice = null;
    } else {
      composerContextNotice = capture.reason;
    }
    attachMenu.classList.remove('open');
    attachBtn.setAttribute('aria-expanded', 'false');
    updateAttachmentPreview();
    updateContextButton();
  });

  const connectorsItem = el('button', {
    class: 'sp-attach-menu-item',
    type: 'button',
    role: 'menuitem',
  });
  connectorsItem.appendChild(renderIcon(Plug, 16));
  connectorsItem.appendChild(el('span', { class: 'sp-attach-menu-label' }, t('spConnectors')));
  connectorsItem.addEventListener('click', () => {
    attachMenu.classList.remove('open');
    attachBtn.setAttribute('aria-expanded', 'false');
    void chrome.tabs.create({ url: CONNECTORS_URL });
  });

  const linkItem = el('button', {
    class: 'sp-attach-menu-item',
    type: 'button',
    role: 'menuitem',
  });
  linkItem.appendChild(renderIcon(Globe, 16));
  linkItem.appendChild(el('span', { class: 'sp-attach-menu-label' }, t('spLinkItem')));
  linkItem.addEventListener('click', () => {
    attachMenu.classList.remove('open');
    attachBtn.setAttribute('aria-expanded', 'false');
    linkError.textContent = '';
    linkForm.hidden = false;
    linkInput.focus();
  });

  const linkForm = el('form', {
    id: 'sp-link-form',
    'aria-label': t('spLinkFormLabel'),
    hidden: '',
  }) as HTMLFormElement;
  linkForm.noValidate = true;
  const linkInput = el('input', {
    id: 'sp-link-input',
    type: 'url',
    inputmode: 'url',
    autocomplete: 'off',
    placeholder: 'https://',
    'aria-label': t('spLinkInputLabel'),
    'aria-describedby': 'sp-link-error',
  }) as HTMLInputElement;
  const linkSubmit = el(
    'button',
    { type: 'submit', class: 'sp-link-submit' },
    t('spLinkAdd'),
  ) as HTMLButtonElement;
  const linkCancel = el('button', { type: 'button', class: 'sp-link-cancel' }, t('spLinkCancel'));
  const linkError = el('div', { id: 'sp-link-error', class: 'sp-link-error', role: 'status' });
  const linkRow = el('div', { class: 'sp-link-row' });
  linkRow.append(linkInput, linkSubmit, linkCancel);
  linkForm.append(linkRow, linkError);
  const closeLinkForm = (): void => {
    linkForm.hidden = true;
    linkInput.value = '';
    linkError.textContent = '';
    inputEl.focus();
  };
  linkCancel.addEventListener('click', closeLinkForm);
  linkForm.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeLinkForm();
    }
  });
  linkForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const url = linkInput.value.trim();
    if (!normalizeApprovedSiteOrigin(url)) {
      linkError.textContent = t('spLinkInvalid');
      linkInput.focus();
      return;
    }
    const approval = approveSiteForReading(url);
    linkSubmit.disabled = true;
    linkError.textContent = t('spLinkReading');
    void approval
      .then(async (granted) => {
        if (!granted) {
          linkError.textContent = t('spSiteAccessRefused', [pageChipLabel(url)]);
          return;
        }
        const capture = await readLinkedPage(url);
        if (!capture.ok) {
          linkError.textContent = capture.reason;
          return;
        }
        attachPageCapture(capture);
        closeLinkForm();
      })
      .finally(() => {
        linkSubmit.disabled = false;
      });
  });

  const temporaryItem = el('button', {
    class: 'sp-attach-menu-item',
    id: 'sp-temporary-item',
    type: 'button',
    role: 'menuitemcheckbox',
    'aria-checked': 'false',
    title: t('spTemporaryChatRetention'),
  }) as HTMLButtonElement;
  temporaryItem.appendChild(renderIcon(Clock, 16));
  const temporaryItemText = el('span', { class: 'sp-attach-menu-label' });
  temporaryItemText.appendChild(el('span', {}, t('spTemporaryChatLabel')));
  temporaryItemText.appendChild(
    el('span', { class: 'sp-attach-menu-hint' }, t('spTemporaryChatExplanation')),
  );
  temporaryItem.appendChild(temporaryItemText);
  temporaryItem.appendChild(el('span', { class: 'sp-attach-menu-check' }));
  temporaryItem.addEventListener('click', () => {
    attachMenu.classList.remove('open');
    attachBtn.setAttribute('aria-expanded', 'false');
    if (_ctx.temporaryChat) {
      if (_ctx.messages.length === 0) leaveTemporaryChat();
      else {
        temporaryEndPending = true;
        renderTemporaryChatState();
      }
      return;
    }
    startTemporaryChat();
    inputEl.focus();
  });

  const attachMenuItems = [
    fileItem,
    screenshotItem,
    contextBtn,
    linkItem,
    connectorsItem,
    temporaryItem,
  ];
  for (const item of attachMenuItems) attachMenu.appendChild(item);
  applyCapabilityGates = () => {
    micBtn.hidden = !capabilityAllowed(capabilityDocument, 'canUseVoice');
    fileItem.hidden = !capabilityAllowed(capabilityDocument, 'canUploadFiles');
    connectorsItem.hidden = !capabilityAllowed(capabilityDocument, 'canUseConnectors');
  };
  applyCapabilityGates();
  attachWrapper.appendChild(attachMenu);
  attachWrapper.appendChild(attachBtn);
  attachWrapper.appendChild(fileInput);

  attachBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = attachMenu.classList.toggle('open');
    attachBtn.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) fileItem.focus();
  });
  attachMenu.addEventListener('keydown', (event: KeyboardEvent) => {
    const items = attachMenuItems.filter((item) => !item.hidden && !item.disabled);
    if (event.key === 'Escape') {
      event.preventDefault();
      attachMenu.classList.remove('open');
      attachBtn.setAttribute('aria-expanded', 'false');
      attachBtn.focus();
      return;
    }
    if (event.key === 'Tab') {
      attachMenu.classList.remove('open');
      attachBtn.setAttribute('aria-expanded', 'false');
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (current + 1) % items.length
            : (current - 1 + items.length) % items.length;
    items[nextIndex]?.focus();
  });
  document.addEventListener('click', (e: MouseEvent) => {
    if (!attachWrapper.contains(e.target as Node)) {
      attachMenu.classList.remove('open');
      attachBtn.setAttribute('aria-expanded', 'false');
    }
  });

  const attachmentBar = el('div', { id: 'sp-attachment-bar' });
  attachmentBar.style.display = 'none';

  inputRow.appendChild(inputEl);

  const queuedList = el('ul', {
    id: 'sp-queued-list',
    'aria-label': t('spQueuedListLabel'),
    hidden: '',
  });
  function renderQueuedFollowUps(): void {
    const queued = followUpQueue
      .getSnapshot()
      .flatMap((command) =>
        typeof command.value === 'string' ? [{ id: command.id, text: command.value }] : [],
      );
    clearChildren(queuedList);
    queuedList.hidden = queued.length === 0;
    queued.forEach(({ id, text }, index) => {
      const item = el('li', { class: 'sp-queued-item' });
      item.appendChild(renderIcon(Clock, 14));
      const lead =
        queued.length > 1
          ? t('spQueuedLeadNumbered', [String(index + 1), String(queued.length)])
          : t('spQueuedLead');
      item.appendChild(el('span', { class: 'sp-queued-text' }, `${lead}: ${text}`));
      const removeQueued = (): void => {
        followUpQueue.dequeueAllMatching((command) => command.id === id);
      };
      const edit = el(
        'button',
        { type: 'button', class: 'sp-queued-action', 'aria-label': t('spQueuedEditAria', [text]) },
        t('spQueuedEdit'),
      );
      edit.addEventListener('click', () => {
        removeQueued();
        replaceComposerText(inputEl, text);
        autoResizeInput(inputEl);
        updateSendButton();
      });
      const cancel = el(
        'button',
        {
          type: 'button',
          class: 'sp-queued-action',
          'aria-label': t('spQueuedCancelAria', [text]),
        },
        t('spQueuedCancel'),
      );
      cancel.addEventListener('click', () => {
        removeQueued();
        inputEl.focus();
      });
      item.appendChild(edit);
      item.appendChild(cancel);
      queuedList.appendChild(item);
    });
  }
  followUpQueue.subscribe(renderQueuedFollowUps);

  composerShell.appendChild(queuedList);
  composerShell.appendChild(slashMenu);
  composerShell.appendChild(mentionMenu);
  composerShell.appendChild(linkForm);
  composerShell.appendChild(inputRow);

  const composerBar = el('div', { id: 'sp-composer-bar' });
  const composerBarStart = el('div', { class: 'sp-composer-controls-start' });
  const composerBarEnd = el('div', { class: 'sp-composer-controls-end' });
  composerBar.appendChild(composerBarStart);
  composerBar.appendChild(composerBarEnd);
  composerBarStart.appendChild(attachWrapper);

  const autonomyChip = el('button', {
    class: 'sp-autonomy-chip',
    id: 'sp-autonomy-chip',
    type: 'button',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
  }) as HTMLButtonElement;
  const autonomyIcon = el('span', { id: 'sp-autonomy-icon' });
  autonomyIcon.appendChild(renderIcon(Shield, 15));
  autonomyChip.appendChild(autonomyIcon);

  const autonomyControl = el('div', { class: 'sp-autonomy-control' });
  const autonomyPopover = el('div', {
    id: 'sp-autonomy-popover',
    role: 'menu',
    'aria-label': 'Browser action approvals',
  });
  const askFirstOption = el('button', {
    class: 'sp-autonomy-option',
    type: 'button',
    role: 'menuitemradio',
  }) as HTMLButtonElement;
  askFirstOption.appendChild(renderIcon(Shield, 15));
  const askFirstCopy = el('span', { class: 'sp-autonomy-option-copy' });
  askFirstCopy.appendChild(el('strong', {}, t('spAutonomyAskFirst')));
  askFirstCopy.appendChild(el('small', {}, t('spAutonomyAskFirstDescription')));
  askFirstOption.appendChild(askFirstCopy);
  const askFirstCheck = el('span', { class: 'sp-autonomy-option-check' });
  askFirstOption.appendChild(askFirstCheck);
  const fullAccessOption = el('button', {
    class: 'sp-autonomy-option sp-autonomy-option-warning',
    type: 'button',
    role: 'menuitemradio',
  }) as HTMLButtonElement;
  fullAccessOption.appendChild(renderIcon(Zap, 15));
  const fullAccessCopy = el('span', { class: 'sp-autonomy-option-copy' });
  fullAccessCopy.appendChild(el('strong', {}, t('spAutonomyFullAccess')));
  fullAccessCopy.appendChild(el('small', {}, t('spAutonomyFullAccessDescription')));
  fullAccessOption.appendChild(fullAccessCopy);
  const fullAccessCheck = el('span', { class: 'sp-autonomy-option-check' });
  fullAccessOption.appendChild(fullAccessCheck);
  autonomyPopover.appendChild(askFirstOption);
  autonomyPopover.appendChild(fullAccessOption);
  autonomyControl.appendChild(autonomyChip);
  autonomyControl.appendChild(autonomyPopover);
  composerBarStart.appendChild(autonomyControl);

  function closeAutonomyPopover(returnFocus = false): void {
    autonomyPopover.classList.remove('open');
    autonomyPopover.style.transform = '';
    autonomyChip.setAttribute('aria-expanded', 'false');
    if (returnFocus) autonomyChip.focus();
  }

  function renderAutonomyChip(askFirst: boolean): void {
    autonomyChip.setAttribute('data-mode', askFirst ? 'ask' : 'full');
    clearChildren(askFirstCheck);
    clearChildren(fullAccessCheck);
    (askFirst ? askFirstCheck : fullAccessCheck).appendChild(renderIcon(Check, 12));
    autonomyChip.title = askFirst
      ? t('spAutonomyAskFirstTooltip')
      : t('spAutonomyFullAccessTooltip');
    autonomyChip.setAttribute('aria-pressed', String(!askFirst));
    autonomyChip.setAttribute(
      'aria-label',
      askFirst ? t('spAutonomyAskFirstAria') : t('spAutonomyFullAccessAria'),
    );
    askFirstOption.setAttribute('aria-checked', String(askFirst));
    fullAccessOption.setAttribute('aria-checked', String(!askFirst));
    askFirstOption.classList.toggle('selected', askFirst);
    fullAccessOption.classList.toggle('selected', !askFirst);
  }

  renderAutonomyChip(true);
  chrome.storage.local.get('agi_cu_ask_before_acting', (items) => {
    if (chrome.runtime.lastError) return;
    renderAutonomyChip(items['agi_cu_ask_before_acting'] !== false);
  });

  autonomyChip.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = autonomyPopover.classList.toggle('open');
    autonomyChip.setAttribute('aria-expanded', String(open));
    if (open) {
      autonomyPopover.style.transform = '';
      const bounds = autonomyPopover.getBoundingClientRect();
      const viewportPadding = 12;
      const shift =
        bounds.left < viewportPadding
          ? viewportPadding - bounds.left
          : bounds.right > window.innerWidth - viewportPadding
            ? window.innerWidth - viewportPadding - bounds.right
            : 0;
      if (shift !== 0) autonomyPopover.style.transform = `translateX(${shift}px)`;
      const askFirst = autonomyChip.getAttribute('data-mode') === 'ask';
      (askFirst ? askFirstOption : fullAccessOption).focus();
    }
  });

  askFirstOption.addEventListener('click', () => {
    renderAutonomyChip(true);
    void chrome.storage.local.set({ agi_cu_ask_before_acting: true });
    closeAutonomyPopover(true);
  });
  fullAccessOption.addEventListener('click', () => {
    renderAutonomyChip(false);
    void chrome.storage.local.set({ agi_cu_ask_before_acting: false });
    closeAutonomyPopover(true);
  });
  autonomyPopover.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAutonomyPopover(true);
    }
  });
  document.addEventListener('click', (event: MouseEvent) => {
    if (!autonomyControl.contains(event.target as Node)) closeAutonomyPopover();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const change = changes['agi_cu_ask_before_acting'];
    if (!change) return;
    renderAutonomyChip(change.newValue !== false);
  });

  composerBarEnd.appendChild(modelSelectorWrap);
  chrome.storage.local.get({ agi_quick_mode: false }, (items) => {
    _ctx.quickMode = items['agi_quick_mode'] === true;
    refreshModelPickerUI();
  });

  composerBarEnd.appendChild(micBtn);
  composerBarEnd.appendChild(sendBtn);
  composerShell.appendChild(composerBar);

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

  const usageWarningBanner = el('div', {
    id: 'sp-usage-warning',
    class: 'sp-composer-notice',
    role: 'status',
    'aria-live': 'polite',
  });
  usageWarningBanner.appendChild(el('span', { id: 'sp-usage-warning-text' }));
  const usageWarningAction = el('button', {
    id: 'sp-usage-warning-action',
    class: 'sp-composer-notice-action',
    type: 'button',
  });
  usageWarningAction.addEventListener('click', () => {
    if (usageBanner) openQuotaRecovery(usageBanner.recovery);
  });
  usageWarningBanner.appendChild(usageWarningAction);

  const modelNotice = el('div', {
    id: 'sp-model-notice',
    class: 'sp-composer-notice',
    role: 'status',
    'aria-live': 'polite',
  });
  modelNotice.appendChild(el('span', { id: 'sp-model-notice-text' }));
  const modelNoticeAction = el(
    'button',
    { class: 'sp-composer-notice-action', type: 'button' },
    t('spModelNoticeChoose'),
  );
  modelNoticeAction.addEventListener('click', () => {
    renderModelNotice(null);
    document.getElementById('sp-model-selector-btn')?.click();
  });
  modelNotice.appendChild(modelNoticeAction);

  const memoryNotice = el('div', {
    id: 'sp-memory-notice',
    class: 'sp-composer-notice',
    role: 'status',
    'aria-live': 'polite',
  });
  memoryNotice.appendChild(el('span', { id: 'sp-memory-notice-text' }));
  memoryNotice.appendChild(
    el(
      'button',
      {
        id: 'sp-memory-notice-forget',
        class: 'sp-composer-notice-action',
        type: 'button',
        hidden: '',
      },
      t('spMemoryForgetConfirm'),
    ),
  );
  const memoryNoticeKeep = el(
    'button',
    { id: 'sp-memory-notice-keep', class: 'sp-composer-notice-action', type: 'button', hidden: '' },
    t('spMemoryForgetKeep'),
  );
  memoryNoticeKeep.addEventListener('click', () => renderMemoryNotice(null));
  memoryNotice.appendChild(memoryNoticeKeep);
  const memoryNoticeDismiss = el('button', {
    class: 'sp-composer-notice-dismiss',
    type: 'button',
    'aria-label': t('spMemoryNoticeDismiss'),
  });
  memoryNoticeDismiss.appendChild(renderIcon(X, 12));
  memoryNoticeDismiss.addEventListener('click', () => renderMemoryNotice(null));
  memoryNotice.appendChild(memoryNoticeDismiss);

  const temporaryNotice = el('div', {
    id: 'sp-temporary-notice',
    class: 'sp-composer-notice',
    role: 'status',
    'aria-live': 'polite',
  });
  temporaryNotice.appendChild(el('span', { id: 'sp-temporary-notice-text' }));
  const temporaryEnd = el('button', {
    id: 'sp-temporary-notice-end',
    class: 'sp-composer-notice-action',
    type: 'button',
  });
  temporaryEnd.addEventListener('click', () => {
    if (_ctx.messages.length === 0) {
      leaveTemporaryChat();
      return;
    }
    if (!temporaryEndPending) {
      temporaryEndPending = true;
      renderTemporaryChatState();
      return;
    }
    endTemporaryChat();
  });
  const temporaryKeep = el(
    'button',
    {
      id: 'sp-temporary-notice-keep',
      class: 'sp-composer-notice-action',
      type: 'button',
      hidden: '',
    },
    t('spTemporaryChatKeep'),
  );
  temporaryKeep.addEventListener('click', () => {
    temporaryEndPending = false;
    renderTemporaryChatState();
  });
  temporaryNotice.append(
    temporaryEnd,
    temporaryKeep,
    buildHelpArticleLink('temporary-chats', t('spHelpLinkTemporary')),
  );

  inputArea.appendChild(usageWarningBanner);
  inputArea.appendChild(modelNotice);
  inputArea.appendChild(temporaryNotice);
  inputArea.appendChild(memoryNotice);
  inputArea.appendChild(cloudGate);
  inputArea.appendChild(bridgeNotice);
  const microphoneNotice = buildMicrophoneNotice();
  inputArea.appendChild(microphoneNotice.element);
  inputArea.appendChild(attachmentBar);
  inputArea.appendChild(composerShell);
  document.body.appendChild(inputArea);
  setManagedCloudChatState(managedCloudChatState, {
    message: managedCloudGateMessage,
    action: managedCloudGateAction,
    actionLabel: managedCloudGateActionLabel,
    href: managedCloudGateHref,
  });
  renderUsageBanner(usageBanner);

  buildOnboardingOverlay(() => {
    void probeBridgeStatus();
    checkPendingChat();
    void checkPendingBackgroundResult();
  });

  composerShell.addEventListener('dragover', (event: DragEvent) => {
    if (!dataTransferCarriesFiles(event.dataTransfer)) return;
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
    acceptIncomingComposerFiles(filesFromDataTransfer(event.dataTransfer));
  });

  setupVoiceInput(
    micBtn,
    inputEl,
    autoResizeInput,
    (message) => {
      composerContextNotice = message;
      updateAttachmentPreview();
    },
    microphoneNotice,
  );
  renderMessages();

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
      if (chrome.runtime.lastError || !response?.success) {
        const dropdown = document.getElementById('sp-shortcuts-dropdown');
        if (dropdown) {
          setChild(dropdown, {
            tag: 'div',
            className: 'sp-shortcuts-status',
            text: t('spWorkflowLoadFailed'),
          });
        }
        return;
      }
      const dropdown = document.getElementById('sp-shortcuts-dropdown');
      if (!dropdown) return;
      clearChildren(dropdown);

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
              setStatus('Nothing recorded yet, start a recording first.', 'error');
              return;
            }
            chrome.runtime.sendMessage(
              {
                type: 'SAVE_SHORTCUT',
                name,
                actions: recActions,
                startUrl: recordingStartUrl,
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

let workflowAnnouncements = 0;

function announceWorkflowMutation(
  message: string,
  kind: 'info' | 'success' | 'error' = 'info',
): number {
  workflowAnnouncements += 1;
  const status = document.getElementById('sp-wf-mutation-status');
  if (status) {
    status.textContent = message;
    status.setAttribute('data-kind', kind);
  }
  return workflowAnnouncements;
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
      if (chrome.runtime.lastError || !response?.success) {
        announceWorkflowMutation(t('spWorkflowLoadFailed'), 'error');
        return;
      }
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
  const savedPromptShortcuts = promptShortcutsFromSaved(shortcuts);
  for (const sc of shortcuts) {
    const item = el('div', { class: 'sp-wf-shortcut-item' });
    const promptShortcut = savedPromptShortcuts.find((candidate) => candidate.id === sc.id);
    const isPromptBased = promptShortcut !== undefined;
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
    const command =
      promptShortcut &&
      shortcutCommandConflict(promptShortcut.name, savedPromptShortcuts, promptShortcut.id) === null
        ? shortcutCommand(promptShortcut.name)
        : '';
    const metaText = isPromptBased
      ? `${command || 'prompt shortcut'} · ${dateStr}`
      : `${actionsCount} actions · ${dateStr}`;
    info.appendChild(el('div', { class: 'sp-wf-shortcut-meta' }, metaText));
    item.appendChild(info);
    const btns = el('div', { class: 'sp-wf-shortcut-btns' });
    const resultConversationId = backgroundConversationId('shortcut', sc.id);
    const playBtn = el(
      'button',
      { class: 'sp-wf-btn-replay', title: 'Replay workflow' },
      t('spShortcutPlay'),
    ) as HTMLButtonElement;
    playBtn.addEventListener('click', () => {
      playBtn.textContent = t('spWorkflowRunningButton');
      playBtn.disabled = true;
      announceWorkflowMutation(t('spWorkflowRunning', [sc.name]));
      chrome.runtime.sendMessage(
        { type: 'REPLAY_SHORTCUT', shortcutId: sc.id },
        (resp: { success?: boolean } | undefined) => {
          playBtn.textContent = t('spShortcutPlay');
          playBtn.disabled = false;
          if (chrome.runtime.lastError || !resp?.success) {
            announceWorkflowMutation(t('spWorkflowRunFailed', [sc.name]), 'error');
            return;
          }
          if (!isPromptBased || !resultConversationId) {
            announceWorkflowMutation(t('spWorkflowCompleted', [sc.name]), 'success');
            return;
          }
          void openStoredConversation(resultConversationId).then((opened) => {
            announceWorkflowMutation(
              opened
                ? t('spWorkflowCompletedOpen', [sc.name])
                : t('spWorkflowCompletedOpenFailed', [sc.name]),
              opened ? 'success' : 'error',
            );
          });
        },
      );
    });
    btns.appendChild(playBtn);
    if (isPromptBased && resultConversationId && storedConversationIds.has(resultConversationId)) {
      const resultBtn = iconButton(
        { class: 'sp-wf-task-result', title: 'View last result' },
        MessageSquare,
      ) as HTMLButtonElement;
      resultBtn.dataset['conversationRestore'] = 'true';
      resultBtn.disabled = _ctx.isStreaming || historyRestoreInProgress;
      resultBtn.addEventListener('click', () => {
        void openStoredConversation(resultConversationId);
      });
      btns.appendChild(resultBtn);
    }
    if (promptShortcut) {
      const editBtn = iconButton(
        { class: 'sp-wf-task-result', title: t('spShortcutEdit', [sc.name]) },
        SquarePen,
      ) as HTMLButtonElement;
      editBtn.addEventListener('click', () => editPromptShortcut(promptShortcut));
      btns.appendChild(editBtn);
    }
    const delBtn = iconButton(
      { class: 'sp-wf-btn-delete', title: t('spShortcutDelete') },
      Trash2,
    ) as HTMLButtonElement;
    let deleteConfirmTimer: ReturnType<typeof setTimeout> | null = null;
    delBtn.addEventListener('click', () => {
      if (!delBtn.classList.contains('is-confirm')) {
        delBtn.classList.add('is-confirm');
        delBtn.title = t('spShortcutDeleteAgain');
        const confirmText = command
          ? t('spShortcutDeleteConfirm', [sc.name, command])
          : t('spWorkflowDeleteConfirm', [sc.name]);
        const confirmation = announceWorkflowMutation(confirmText);
        deleteConfirmTimer = setTimeout(() => {
          delBtn.classList.remove('is-confirm');
          delBtn.title = t('spShortcutDelete');
          if (confirmation === workflowAnnouncements) announceWorkflowMutation('');
          deleteConfirmTimer = null;
        }, DRAWER_DELETE_CONFIRM_MS);
        return;
      }
      if (deleteConfirmTimer !== null) clearTimeout(deleteConfirmTimer);
      deleteConfirmTimer = null;
      delBtn.classList.remove('is-confirm');
      delBtn.disabled = true;
      announceWorkflowMutation(t('spWorkflowDeleting', [sc.name]));
      chrome.runtime.sendMessage(
        { type: 'DELETE_SHORTCUT', shortcutId: sc.id },
        (response: { success?: boolean } | undefined) => {
          if (chrome.runtime.lastError || !response?.success) {
            delBtn.disabled = false;
            announceWorkflowMutation(t('spWorkflowDeleteFailed', [sc.name]), 'error');
            return;
          }
          announceWorkflowMutation(t('spWorkflowDeleted', [sc.name]), 'success');
          refreshWorkflowsShortcuts();
        },
      );
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
            tasks?: ScheduledTaskRow[];
          }
        | undefined,
    ) => {
      if (!scheduledTasksRequestFence.isCurrent(request, _ctx.managedCloudOwner)) return;
      if (chrome.runtime.lastError || !response?.success) {
        announceWorkflowMutation(t('spTaskLoadFailed'), 'error');
        return;
      }
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

interface ScheduledTaskRow {
  id: string;
  name: string;
  description?: string;
  prompt?: string;
  enabled: boolean;
  scheduleType: string;
  scheduleValue: string;
  lastRun?: number;
}

function renderTaskRows(
  list: HTMLElement,
  tasks: ScheduledTaskRow[],
  storedConversationIds: ReadonlySet<string>,
  owner: ManagedCloudOwner | null,
): void {
  clearChildren(list);
  for (const task of tasks) {
    const item = el('div', { class: 'sp-wf-task-item' });
    const toggle = el('input', {
      type: 'checkbox',
      class: 'sp-wf-task-toggle',
      'aria-label': task.enabled
        ? t('spTaskDisableAria', [task.name])
        : t('spTaskEnableAria', [task.name]),
    }) as HTMLInputElement;
    toggle.checked = task.enabled;
    toggle.addEventListener('change', () => {
      const previousState = !toggle.checked;
      const nextState = toggle.checked;
      toggle.disabled = true;
      announceWorkflowMutation(
        nextState ? t('spTaskEnabling', [task.name]) : t('spTaskDisabling', [task.name]),
      );
      chrome.runtime.sendMessage(
        {
          type: 'UPDATE_SCHEDULED_TASK',
          ...(owner ? { owner } : {}),
          taskId: task.id,
          updates: { enabled: toggle.checked },
        },
        (resp: { success?: boolean } | undefined) => {
          toggle.disabled = false;
          if (chrome.runtime.lastError || !resp?.success) {
            toggle.checked = previousState;
            announceWorkflowMutation(
              nextState
                ? t('spTaskEnableFailed', [task.name])
                : t('spTaskDisableFailed', [task.name]),
              'error',
            );
            return;
          }
          toggle.setAttribute(
            'aria-label',
            nextState ? t('spTaskDisableAria', [task.name]) : t('spTaskEnableAria', [task.name]),
          );
          announceWorkflowMutation(
            nextState ? t('spTaskEnabled', [task.name]) : t('spTaskDisabled', [task.name]),
            'success',
          );
        },
      );
    });
    item.appendChild(toggle);
    const info = el('div', { class: 'sp-wf-task-info' });
    info.appendChild(el('div', { class: 'sp-wf-task-name' }, task.name));
    if (task.description) {
      info.appendChild(el('div', { class: 'sp-wf-task-description' }, task.description));
    }
    info.appendChild(el('span', { class: 'sp-wf-task-schedule-badge' }, task.scheduleType));
    item.appendChild(info);
    const resultConversationId = backgroundConversationId('task', task.id);
    if (resultConversationId && storedConversationIds.has(resultConversationId)) {
      const resultBtn = iconButton(
        { class: 'sp-wf-task-result', title: 'View last result' },
        MessageSquare,
      ) as HTMLButtonElement;
      resultBtn.dataset['conversationRestore'] = 'true';
      resultBtn.disabled = _ctx.isStreaming || historyRestoreInProgress;
      resultBtn.addEventListener('click', () => {
        void openStoredConversation(resultConversationId);
      });
      item.appendChild(resultBtn);
    }
    const editBtn = iconButton(
      { class: 'sp-wf-task-result', title: t('spTaskEdit', [task.name]) },
      SquarePen,
    ) as HTMLButtonElement;
    editBtn.addEventListener('click', () => openScheduledTaskEditor(task));
    item.appendChild(editBtn);
    const deleteTitle = `Delete task ${task.name}`;
    const delBtn = iconButton(
      { class: 'sp-wf-task-delete', title: deleteTitle },
      Trash2,
    ) as HTMLButtonElement;
    let deleteConfirmTimer: ReturnType<typeof setTimeout> | null = null;
    delBtn.addEventListener('click', () => {
      if (!delBtn.classList.contains('is-confirm')) {
        delBtn.classList.add('is-confirm');
        delBtn.title = t('spShortcutDeleteAgain');
        const confirmation = announceWorkflowMutation(t('spTaskDeleteConfirm', [task.name]));
        deleteConfirmTimer = setTimeout(() => {
          delBtn.classList.remove('is-confirm');
          delBtn.title = deleteTitle;
          if (confirmation === workflowAnnouncements) announceWorkflowMutation('');
          deleteConfirmTimer = null;
        }, DRAWER_DELETE_CONFIRM_MS);
        return;
      }
      if (deleteConfirmTimer !== null) clearTimeout(deleteConfirmTimer);
      deleteConfirmTimer = null;
      delBtn.classList.remove('is-confirm');
      delBtn.disabled = true;
      announceWorkflowMutation(t('spWorkflowDeleting', [task.name]));
      chrome.runtime.sendMessage(
        { type: 'DELETE_SCHEDULED_TASK', taskId: task.id, ...(owner ? { owner } : {}) },
        (resp: { success?: boolean } | undefined) => {
          if (chrome.runtime.lastError || !resp?.success) {
            delBtn.disabled = false;
            announceWorkflowMutation(t('spWorkflowDeleteFailed', [task.name]), 'error');
            return;
          }
          announceWorkflowMutation(t('spWorkflowDeleted', [task.name]), 'success');
          refreshWorkflowsTasks();
        },
      );
    });
    item.appendChild(delBtn);
    list.appendChild(item);
  }
}

chrome.runtime.onMessage.addListener((msg: unknown) => {
  const envelope = msg as { type: string };

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
        if (opened) void takePendingResultConversation(owner);
      });
    }
    return;
  }

  if (envelope.type === 'CONNECTION_STATUS_CHANGED') {
    const statusMsg = msg as { connected?: boolean; status?: string };
    const nowConnected = statusMsg.connected === true;
    if (nowConnected !== _ctx.isConnected) {
      _ctx.isConnected = nowConnected;
      updateConnectionStatus();
      if (nowConnected) {
        chrome.storage.local.set({ agi_ever_connected: true }).catch(() => {});
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
  const reconnected = _ctx.messages.find((message) => message.id === chunk.id);
  if (reconnected?.reconnecting) {
    reconnected.reconnecting = false;
    _ctx.needsMessageRebuild = true;
    renderMessages();
  }
  const streamUsedQuick = quickModeByStreamId.get(chunk.id) === true;
  const routeStamped = captureResolvedRoute(chunk.id, chunk.routing);
  const continuationChanged = !streamUsedQuick && applyRoutingContinuation(chunk.routing);
  if (routeStamped || continuationChanged) saveMessages();

  if (chunk.quotaWarning) {
    quotaWarnedStreamIds.add(chunk.id);
    applyStreamQuotaWarning(chunk.quotaWarning);
  }

  if (chunk.error) {
    quotaWarnedStreamIds.delete(chunk.id);
    if (chunk.errorCode === 'quota_exceeded' || chunk.errorCode === 'account_suspended') {
      void refreshCloudAccountUI();
    }
    if (chunk.error === '__AUTH_REQUIRED__') {
      void refreshCloudAccountUI();
      handleStreamError(chunk.id, 'Sign in to AGI Cloud to send messages.');
      return;
    }
    handleStreamError(
      chunk.id,
      chunk.error,
      chunk.errorCode,
      {
        ...(chunk.errorRetryAfterSeconds !== undefined
          ? { retryAfterSeconds: chunk.errorRetryAfterSeconds }
          : {}),
        ...(chunk.errorRequestId !== undefined ? { requestId: chunk.errorRequestId } : {}),
      },
      chunk.errorQuota,
    );
    return;
  }

  if (chunk.cloudRun) {
    cloudRunsByStreamId.set(chunk.id, { ...chunk.cloudRun });
    const existing = _ctx.messages.find((message) => message.id === chunk.id);
    if (existing) {
      existing.cloudAgentRun = { ...chunk.cloudRun };
      if (streamUsedQuick) existing.managedQuickMode = true;
      stampResolvedRoute(chunk.id, existing);
    } else {
      _ctx.messages.push({
        id: chunk.id,
        role: 'assistant',
        content: '',
        streaming: true,
        timestamp: Date.now(),
        runtime: 'managed-cloud',
        cloudAgentRun: { ...chunk.cloudRun },
        ...(streamUsedQuick ? { managedQuickMode: true } : {}),
        ...(resolvedRouteByStreamId.get(chunk.id) ?? {}),
      });
      trimLiveMessages();
    }
    saveMessages();
  }

  if (chunk.agentEvent) {
    removeThinking();
    const before = _ctx.messages.find((message) => message.id === chunk.id);
    const approvalEventType =
      messageKindForAgentEvent(chunk.agentEvent.event.type) === 'approval'
        ? chunk.agentEvent.event.type
        : null;
    const alreadyAwaitingApproval = before?.agentActivity?.entries.some(
      (entry) => entry.kind === 'tool' && entry.status === 'awaiting-approval',
    );
    if (approvalEventType === 'approval-requested' && !alreadyAwaitingApproval && before) {
      before.cloudApprovalDecisions = undefined;
      before.cloudApprovalError = undefined;
    }
    if (approvalEventType === 'input-requested' && before) {
      connectorInputResponses.delete(before.id);
      before.cloudApprovalError = undefined;
    }
    const assistant = applyCanonicalAgentEvent(_ctx.messages, chunk.id, chunk.agentEvent);
    assistant.runtime = 'managed-cloud';
    if (streamUsedQuick) assistant.managedQuickMode = true;
    stampResolvedRoute(chunk.id, assistant);
    if (
      approvalEventType === 'approval-resolved' &&
      !assistant.agentActivity?.entries.some(
        (entry) => entry.kind === 'tool' && entry.status === 'awaiting-approval',
      )
    ) {
      assistant.cloudApprovalDecisions = undefined;
      assistant.cloudApprovalError = undefined;
    }
    if (approvalEventType === 'input-resolved' && pendingConnectorInputs(assistant).length === 0) {
      connectorInputResponses.delete(assistant.id);
      assistant.cloudApprovalError = undefined;
    }
    const cloudRun = cloudRunsByStreamId.get(chunk.id);
    if (cloudRun) assistant.cloudAgentRun = { ...cloudRun };
    trimLiveMessages();
    _ctx.needsMessageRebuild = true;
    renderMessages();
    saveMessages();
  }

  if (chunk.codeExecution) {
    removeThinking();
    const assistant = ensureStreamingAssistant(chunk.id, streamUsedQuick);
    stampResolvedRoute(chunk.id, assistant);
    assistant.codeExecution = { ...chunk.codeExecution };
    _ctx.needsMessageRebuild = true;
    renderMessages();
    saveMessages();
  }

  if ((chunk.generatedFiles?.length ?? 0) > 0 || chunk.interactiveCard) {
    removeThinking();
    const assistant = ensureStreamingAssistant(chunk.id, streamUsedQuick);
    stampResolvedRoute(chunk.id, assistant);
    if (chunk.generatedFiles?.length) {
      const files = new Map((assistant.generatedFiles ?? []).map((file) => [file.id, file]));
      for (const file of chunk.generatedFiles) files.set(file.id, { ...file });
      assistant.generatedFiles = [...files.values()].slice(-MAX_STORED_GENERATED_FILES_PER_MESSAGE);
    }
    if (chunk.interactiveCard) {
      const cards = new Map((assistant.interactiveCards ?? []).map((card) => [card.cardId, card]));
      cards.set(chunk.interactiveCard.cardId, { ...chunk.interactiveCard });
      assistant.interactiveCards = [...cards.values()].slice(-INTERACTIVE_CARDS_MAX_PER_MESSAGE);
    }
    _ctx.needsMessageRebuild = true;
    renderMessages();
    saveMessages();
  }

  if (chunk.sources) {
    const assistant = ensureStreamingAssistant(chunk.id, streamUsedQuick);
    if (chunk.sources.citations.length > 0) {
      assistant.citations = mergeMessageSources(assistant.citations, chunk.sources.citations);
    }
    if (chunk.sources.results.length > 0) {
      assistant.sources = mergeMessageSources(assistant.sources, chunk.sources.results);
    }
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
      runtime: 'managed-cloud',
      ...(streamUsedQuick ? { managedQuickMode: true } : {}),
      ...(cloudRunsByStreamId.get(chunk.id)
        ? { cloudAgentRun: { ...cloudRunsByStreamId.get(chunk.id)! } }
        : {}),
      ...(resolvedRouteByStreamId.get(chunk.id) ?? {}),
    };
    _ctx.messages.push(assistantMsg);
    trimLiveMessages();
    renderMessages();
  } else {
    const existing = _ctx.messages.find((m) => m.id === chunk.id)!;
    stampResolvedRoute(chunk.id, existing);
    existing.content += chunk.text;
    if (document.getElementById(`sp-bubble-${chunk.id}`)) {
      updateStreamingBubble(chunk.id, existing.content, chunk.done);
    } else {
      removeThinking();
      renderMessages();
    }
    if (!chunk.done) {
      const now = Date.now();
      if (now - lastStreamPersistAtMs >= STREAM_TEXT_PERSIST_INTERVAL_MS) {
        lastStreamPersistAtMs = now;
        saveMessages();
      }
    }
  }

  if (chunk.done) {
    if (quotaWarnedStreamIds.has(chunk.id)) {
      quotaWarnedStreamIds.delete(chunk.id);
      void refreshCloudAccountUI();
    }
    resolvedRouteByStreamId.delete(chunk.id);
    quickModeByStreamId.delete(chunk.id);
    ownerByStreamId.delete(chunk.id);
    stopManagedChatKeepalive();
    if (_ctx.streamTimeoutHandle) {
      clearTimeout(_ctx.streamTimeoutHandle);
      _ctx.streamTimeoutHandle = null;
    }
    const existing = _ctx.messages.find((m) => m.id === chunk.id);
    const startedAt = streamStartedAtById.get(chunk.id);
    if (existing) {
      existing.streaming = false;
      if (startedAt !== undefined) existing.durationMs = Math.max(0, Date.now() - startedAt);
      const cloudRun = cloudRunsByStreamId.get(chunk.id);
      if (cloudRun) existing.cloudAgentRun = { ...cloudRun };
      const assistantCloudId = assistantCloudIdByStreamId.get(chunk.id);
      if (assistantCloudId && !existing.cloudMessageId) existing.cloudMessageId = assistantCloudId;
      if (isEmptyAssistantTurn(existing)) {
        existing.error = true;
        existing.errorText = t('spEmptyResponse');
      }
    }
    streamStartedAtById.delete(chunk.id);
    assistantCloudIdByStreamId.delete(chunk.id);
    cloudRunsByStreamId.delete(chunk.id);
    removeThinking();
    _ctx.isStreaming = false;
    _ctx.currentStreamId = null;
    updateSendButton();
    _ctx.needsMessageRebuild = true;
    saveMessages();
    renderMessages();
    approveToolsAllowedForChat(chunk.id);
    sendNextFollowUp();
  }
});

injectStyles();
followThemePreference();
watchCloudMirroringEnabled();
void readCloudMirroringEnabled().then(() => refreshActivePersistenceState());
buildUI();
loadPromptShortcuts();
chrome.tabs.onActivated?.addListener(() => {
  refreshPageHostname();
});
const ACCOUNT_REFRESH_ON_RETURN_MS = 60_000;
let lastAccountRefreshOnReturn = Date.now();
function refreshAccountOnReturn(): void {
  if (document.visibilityState !== 'visible') return;
  if (Date.now() - lastAccountRefreshOnReturn < ACCOUNT_REFRESH_ON_RETURN_MS) return;
  lastAccountRefreshOnReturn = Date.now();
  void refreshCloudAccountUI();
}
document.addEventListener('visibilitychange', refreshAccountOnReturn);
window.addEventListener('pagehide', () => void flushProductEvents());
window.addEventListener('focus', refreshAccountOnReturn);
chrome.tabs.onUpdated?.addListener((_tabId, changeInfo) => {
  if (changeInfo.url !== undefined || changeInfo.status === 'complete') {
    refreshPageHostname();
  }
});
refreshPageHostname();

void (async () => {
  const onboardingDone = await isOnboardingComplete();
  if (!onboardingDone) {
    showOnboardingOverlay();
    void checkPendingContextHandoff();
    initialCloudAccountRefresh
      .then(() => {
        if (_ctx.messages.length > 0) renderMessages();
      })
      .catch(() => {});
    return;
  }
  Promise.all([
    initialCloudAccountRefresh.then(() => {
      if (_ctx.messages.length > 0) {
        renderMessages();
      }
    }),
    probeBridgeStatus(),
  ])
    .then(() => {
      checkPendingChat();
      void checkPendingContextHandoff();
      void checkPendingBackgroundResult();
    })
    .catch((err) => {
      console.error('[SidePanel] Boot initialization failed:', err);
    });
})();

async function probeBridgeStatus(): Promise<void> {
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
      chrome.storage.local.set({ agi_ever_connected: true }).catch(() => {});
    }
  } catch {
    // A restarting native worker never blocks Managed Cloud chat.
  }
}

async function checkPendingBackgroundResult(): Promise<void> {
  const owner = _ctx.managedCloudOwner;
  if (!owner) return;
  const conversationId = await takePendingResultConversation(owner);
  if (!conversationId) return;
  await openStoredConversation(conversationId);
}

const DRAWER_DELETE_CONFIRM_MS = 3000;

const PENDING_CHAT_TTL_MS = 5 * 60_000;

function browserLanguageName(): string {
  const code = chrome.i18n.getUILanguage();
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

function pendingChatPrompt(pending: { type: string; text: string }): string {
  switch (pending.type) {
    case 'explain':
      return `Explain the following:\n\n"${pending.text}"`;
    case 'translate': {
      const language = browserLanguageName();
      return `Translate the following into ${language}. If it is already in ${language}, ask me which language to translate it into:\n\n"${pending.text}"`;
    }
    default:
      return pending.text;
  }
}

function checkPendingChat(): void {
  chrome.storage.session.get('agi_pending_chat', (result) => {
    if (chrome.runtime.lastError) return;
    const pending = result['agi_pending_chat'] as
      { type: string; text: string; url: string; timestamp: number } | undefined;
    if (!pending || Date.now() - pending.timestamp > PENDING_CHAT_TTL_MS) {
      if (pending) chrome.storage.session.remove('agi_pending_chat').catch(() => {});
      return;
    }

    const summarizePrompt = SLASH_COMMANDS['/summarize']!.prompt;
    const admissionProbe = pending.type === 'summarize' ? summarizePrompt : pending.text;
    if (!canAdmitComposerMessage(admissionProbe)) {
      const input = document.getElementById('sp-input') as HTMLTextAreaElement | null;
      if (input && !input.value.trim()) {
        replaceComposerText(
          input,
          pending.type === 'summarize' ? '/summarize' : pendingChatPrompt(pending),
        );
        autoResizeInput(input);
        updateSendButton();
        chrome.storage.session.remove('agi_pending_chat').catch(() => {});
      }
      return;
    }

    chrome.storage.session.remove('agi_pending_chat').catch(() => {});

    let prompt = '';
    switch (pending.type) {
      case 'ask':
      case 'explain':
      case 'translate':
        prompt = pendingChatPrompt(pending);
        break;
      case 'summarize':
        capturePageContext()
          .then((capture) => {
            if (!capture.ok) {
              composerContextNotice = capture.reason;
              updateAttachmentPreview();
              return;
            }
            _ctx.pendingPageContext = capture.text;
            _ctx.pendingPageContextSource = capture.source;
            composerContextNotice = null;
            sendMessage(summarizePrompt);
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
    onOpenInVsCode: () =>
      releaseContextHandoffTo(
        pending.id,
        CONTEXT_HANDOFF_VSCODE_DESTINATION.id,
        `${CONTEXT_HANDOFF_VSCODE_DESTINATION.label} did not receive the selected context.`,
      ),
    onCopyCliCommand: async (): Promise<ContextHandoffActionResult> => {
      try {
        await navigator.clipboard.writeText(contextHandoffCliCommand(pending));
      } catch {
        return {
          success: false,
          consumed: false,
          error: 'Chrome would not write to the clipboard. Try the copy again.',
        };
      }
      return releaseContextHandoffTo(
        pending.id,
        CONTEXT_HANDOFF_CLI_DESTINATION.id,
        'The command was copied but the preview could not be closed.',
      );
    },
  });
}

async function releaseContextHandoffTo(
  handoffId: string,
  destination: ContextHandoffDestinationId,
  failure: string,
): Promise<ContextHandoffActionResult> {
  try {
    const response = (await chrome.runtime.sendMessage({
      type: 'APPROVE_CONTEXT_HANDOFF',
      handoffId,
      destination,
    })) as ContextHandoffActionResult | undefined;
    return response ?? { success: false, consumed: true, error: failure };
  } catch (error) {
    return {
      success: false,
      consumed: true,
      error: `${error instanceof Error ? error.message : failure} Select the context again.`,
    };
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[BROWSER_STORE_KEY]) {
    void refreshActivePersistenceState();
  }
  if (
    area === 'local' &&
    (changes[SP_SITE_ALLOWLIST_KEY] || changes[BROWSER_CONTROL_CONSENT_STORAGE_KEY])
  ) {
    refreshComputerUseSiteHook();
  }
  if (area === 'local' && changes[SHORTCUTS_STORAGE_KEY]) {
    promptShortcuts = promptShortcutsFromSaved(changes[SHORTCUTS_STORAGE_KEY].newValue);
  }
  if (area === 'session' && changes['agi_pending_chat']?.newValue) {
    checkPendingChat();
  }
  if (area === 'session' && changes[CONTEXT_HANDOFF_STORAGE_KEY]?.newValue) {
    void checkPendingContextHandoff();
  }
});
