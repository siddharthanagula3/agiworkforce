import { parseTaskTabScope, type TaskTabScope } from './features/browser-tools/taskTabScope';
import {
  isPageDocumentId,
  parseFormObservationReference,
  readPageDocument,
} from './features/browser-tools/documentBridge';
import { MAX_CALLER_TOOL_STEPS, TOOL_CALL_ID_MAX_LENGTH } from '@agiworkforce/cloud-contracts';
import { recoverCallerToolCheckpoint } from './features/cloud-bridge/callerToolExecution';
import {
  captureCallerConversationContext,
  assertCallerConversationAuthority,
  assertCallerConversationLink,
} from './features/cloud-bridge/callerConversationAuthority';
import {
  captureCallerBrowserContext,
  parseCallerBrowserContext,
  readCallerBrowserContext,
  type CallerBrowserContext,
} from './features/cloud-bridge/callerBrowserContext';
import {
  replayScheduledShortcut,
  ScheduledShortcutReplayDeferredError,
  ScheduledShortcutReplayCancelledError,
} from './features/background/scheduled-shortcut-replay';
import { platformRequestHeaders } from './platformHeaders';
import { createManagedCloudAgentRunClient } from '@agiworkforce/cloud-contracts';
import {
  createScheduledTaskTransport,
  ScheduledTaskTransportControl,
  type ScheduledTaskTransport,
  type ScheduledTaskFetch,
} from './features/background/scheduled-task-transport';
import { renderShortcutPrompt } from './features/side-panel/pageCommands';
import { streamFailureText } from './features/side-panel/chat-state';
import { IN_PAGE_PROMPT_PORT_PREFIX } from './features/content/in-page-panel/promptPort';
import type {
  BrowserContextTabReference,
  ChatChunkMessage,
  ChatToolHandoffMessage,
  WebMCPToolInfo,
} from './types';
import type {
  ConnectionStatus,
  ExtensionMessage,
  ExtensionResponse,
  InPagePromptMessage,
  InPagePromptOutcome,
  InPagePromptResponse,
  ScheduledTask,
} from './types';
import { logger, originOfUrl, RateLimiter, withTimeout, sleep } from './utils';
import { storageUtils } from './features/background/storageUtils';
import { t } from './i18n';
import { describeComputerUseAction } from './features/computer-use/describeAction';
import { openAssistantPanel, sidePanelAvailable } from './features/surface/assistantPanel';
import {
  describeApprovalReason,
  readsWithoutActing,
  type ActionApprovalRequirement,
} from './features/computer-use/approvalPolicy';
import { timingSafeEqual } from '@agiworkforce/utils/crypto';
import {
  loadShortcuts,
  handleSaveShortcut,
  handleListShortcuts,
  releaseRecordingsOfOtherAccounts,
  handleDeleteShortcut,
  handleUpdateShortcut,
  planShortcutReplay,
} from './features/background/shortcuts';
import {
  normalizeShortcutStartUrl,
  validateShortcutReplayTarget,
} from './features/shortcuts/origin';
import {
  appendRecordedAction,
  beginRecordingSession,
  discardAllRecordingSessions,
  discardRecordingSession,
  endRecordingSession,
  readRecordingSession,
} from './features/background/recordingSessions';
import { initializeSyncedPreferences } from './features/background/synced-preferences';
import {
  loadScheduledTasks,
  handleCreateScheduledTask,
  handleListScheduledTasks,
  handleUpdateScheduledTask,
  handleDeleteScheduledTask,
  dispatchScheduledPrompt,
  assertScheduledExecutionSucceeded,
  recordScheduledTaskRun,
  restoreScheduledTaskAlarms,
  TASK_ALARM_PREFIX,
  TASK_PROMPT_MAX_CHARS,
} from './features/background/tasks';
import {
  createBackgroundChatDelivery,
  linkNotificationToConversation,
  notificationSnippet,
  recordBackgroundChatResult,
  setPendingResultConversation,
  takeNotificationConversation,
  OPEN_BROWSER_CONVERSATION_MESSAGE,
  SCHEDULED_TASK_CLIENT_ID,
  SHORTCUT_REPLAY_CLIENT_ID,
  type BackgroundChatDelivery,
} from './features/background/background-results';
import { settleDetachedAssistantTurn } from './features/background/conversation-history';
import { createMaintenanceAlarmController } from './features/background/maintenance-alarm';
import {
  captureAdmittedTab,
  deliverPageCapture,
  pageCaptureFailureMessage,
  PAGE_CAPTURE_SITE_NOT_APPROVED_MESSAGE,
  PAGE_CAPTURE_TAB_CHANGED_MESSAGE,
  PAGE_CAPTURE_UNAVAILABLE_MESSAGE,
  PAGE_CAPTURE_UNDELIVERED_TITLE,
} from './features/background/page-capture';
import {
  beginScheduledTaskRunJournal,
  canResumeScheduledTaskRunJournal,
  loadScheduledTaskRunJournals,
  removeScheduledTaskRunJournal,
  updateScheduledTaskRunJournal,
  restoreDeferredScheduledRecoveryAttempt,
  type ScheduledTaskRunJournal,
} from './features/background/scheduled-task-runs';
import {
  ScheduledTaskExecutionCoordinator,
  type ScheduledTaskExecutionLease,
} from './features/background/scheduled-task-authority';
import {
  isScheduledCancellationRetryDue,
  requestScheduledTaskCancellation,
  ScheduledTaskCancellationAttemptCoordinator,
  selectScheduledTaskCancellationCredential,
} from './features/background/scheduled-task-cancellation';
import { readEnabledPreference } from './features/background/enabled-preference';
import {
  publishAuthorizedScheduledTaskNotification,
  scheduledTaskNotificationAuthority,
} from './features/background/scheduled-task-notifications';
import { getPlatformPrompt } from './features/content/platform-prompts';
import {
  memoryList,
  memoryAdd,
  memoryUpdate,
  memoryDelete,
  type MemoryWriteResult,
} from './background/memory-bridge';
import {
  APPROVAL_TIMEOUT_MS,
  MAX_RUN_GUIDANCE_CHARS,
  runAgentLoop,
} from './features/computer-use/agentLoop';
import {
  ASK_BEFORE_ACTING_KEY,
  actionNeedsApproval,
  readBrowserPermissionMode,
} from './features/computer-use/askBeforeActing';
import { asksInAutoMode } from './features/computer-use/crucialActions';
import { restrictStorageToTrustedContexts } from './features/background/storageAccess';
import { desktopTabSummary } from './features/native-bridge/tabListing';
import { isExtensionAccountOrigin } from './features/computer-use/accountOrigins';
import { TaskTabs, admitSelectedContextTabs } from './features/browser-tools/taskTabs';
import { BrowserAgentSiteTools } from './features/tools/browserAgentSiteTools';
import { ensureOnDetachListener, getTargetSignature } from './features/computer-use/cdpDriver';
import {
  parseBrowserUploadBinding,
  parseBrowserUploadedFilesMetadata,
  resolveUploadedUserFiles,
  sameBrowserUploadBinding,
  type BrowserUploadBinding,
  type BrowserUploadedFileMetadata,
} from './features/computer-use/userFileUpload';
import { createRunInputWatch } from './features/computer-use/inputWatch';
import {
  COMPUTER_USE_RUN_ID_PATTERN,
  ComputerUseRunCoordinator,
  ComputerUseStartCoordinator,
  USER_TAKEOVER_MAX_MS,
  type ComputerUseCancellationReason,
  type ComputerUseRunLease,
  type ComputerUseTakeover,
} from './features/computer-use/runOwnership';
import {
  BROWSER_CONTROL_CONSENT_STORAGE_KEY,
  browserControlConsentRequiredMessage,
  hasBrowserControlConsent,
  originApprovedForBrowserControl,
  readBrowserControlConsent,
  removeBrowserControlHostPermission,
  sanitizeBrowserControlConsent,
} from './features/computer-use/browserControlConsent';
import { normalizeApprovedSiteOrigin } from './features/options/site-allowlist';
import {
  DISCOVERY_MESSAGE_TYPES,
  DOM_MUTATION_MESSAGE_TYPES,
  EXTENSION_PAGE_ONLY_MESSAGE_TYPES,
  ORIGIN_EXTENSION_PAGE,
  SITE_ALLOWLIST_STORAGE_KEY,
  isTrustedExtensionPageSender,
  normalizeWebMCPToolsUpdate,
  resolveMessageTargetTabId,
  sanitizePageText,
  validateBridgeUrl,
  type NormalizedWebMCPToolsUpdate,
} from './background/policy';
import {
  ADMIN_SITE_POLICY_STORAGE_KEY,
  readAdminSitePolicy,
  readUserSiteAllowlist,
  loadScheduledSitePolicyInput,
} from './features/site-policy/store';
import { createSitePolicyPublicationOwner } from './background/site-policy-publication';
import { scheduledSourceAuthority } from './features/background/scheduled-task-source-authority';
import {
  CONTEXT_HANDOFF_CLI_DESTINATION,
  CONTEXT_HANDOFF_DESTINATION,
  CONTEXT_HANDOFF_STORAGE_KEY,
  CONTEXT_HANDOFF_VSCODE_DESTINATION,
  createSelectionContextHandoff,
  isPendingContextHandoff,
  toApprovedNativeSelectionMessage,
} from './features/context-handoff';
import {
  createChromeManagedStreamKey,
  createChromeManagedChatDependencies,
  createChromeManagedApprovalDependencies,
  createChromeManagedToolInputDependencies,
  executeChromeManagedChat,
  executeChromeManagedCallerResume,
  createChromeManagedCallerResumeDependencies,
  executeChromeManagedApproval,
  executeChromeManagedToolInput,
  normalizeChromeManagedRoutingMetadata,
  type ChromeManagedChatResult,
  type ChromeManagedResumeCallbacks,
  type ChromeManagedToolHandoffOutcome,
} from './features/cloud-bridge/managedChatHandler';
import {
  CHAT_BROWSER_TASK_TOOL,
  chatBrowserToolDefinitions,
  isChatBrowserToolTier,
  CHAT_TOOL_HANDOFF_TIMEOUT_MS,
  MAX_CHAT_TOOL_CALLS_PER_HANDOFF,
} from './features/computer-use/chatBrowserTools';
import type { ToolCall } from './features/computer-use/toolHandoff';
import {
  addOneTimeSiteGrant,
  expiredOneTimeSiteGrants,
  isOneTimeSiteGrantId,
  listOneTimeSiteGrants,
  oneTimeGrantedOrigins,
  removeOneTimeSiteGrant,
} from './features/computer-use/oneTimeSiteGrants';
import {
  forgetTransientHostPermissions,
  listTransientHostPermissions,
  planTransientSweep,
} from './features/computer-use/transientHostPermissions';
import {
  chromeHostPermissionReconcileDeps,
  releaseUnapprovedHostPermissions,
} from './features/computer-use/hostPermissionReconcile';
import {
  markComputerUseRunEnded,
  markComputerUseRunStarted,
  markComputerUseRunTab,
  recoverLostComputerUseRun,
  WORKER_RESTARTED_REASON,
} from './features/computer-use/runMarker';
import { purgeLegacyProviderCredentials } from './features/security/legacyProviderCredentials';
import {
  isPermanentNativeDisconnect,
  nativeReconnectDelayMs,
  NATIVE_RECONNECT_MAX_ATTEMPTS,
} from './features/native-bridge/reconnect';
import { parseManagedChatPortName } from './features/cloud-bridge/managedChatPort';
import {
  createChromeCallerToolCustody,
  readChromeCallerToolCustody,
  acknowledgeCompletedCallerRun,
} from './features/cloud-bridge/callerToolCustody';
import { validChatToolResults, type ChatToolCursor } from './features/computer-use/chatToolResults';
import {
  BROWSER_COMMAND_POLL_WINDOW_MS,
  BROWSER_COMMAND_PROTOCOL_VERSION,
  MAX_LISTED_BROWSER_TABS,
  NATIVE_BROWSER_POLL_MESSAGE,
  NATIVE_BROWSER_COMMAND_WATCH_MESSAGE,
  NATIVE_BROWSER_RESULT_MESSAGE,
  NATIVE_BROWSER_UNPAIR_MESSAGE,
  NATIVE_PAGE_CAPTURE_MESSAGE,
  SITE_POLICY_ADMIN_UNAVAILABLE,
  evaluateSitePolicy,
  isBrowserCommandRequest,
  type BrowserCommand,
  type BrowserTabSummary,
  type SitePolicyAdminState,
} from '@agiworkforce/types';
import { runDesktopBrowserCommand } from './features/native-bridge/desktopCommands';
import { NativeBrowserDriver } from './features/native-bridge/nativeBrowserDriver';
import { awaitCdpOperation, throwIfCdpCancelled } from './features/computer-use/debuggerSession';
import {
  cancelChromeManagedRun,
  cancelAndConfirmChromeManagedRun,
  findChromeManagedRunByRequestId,
  MANAGED_RUN_CANCELLATION_TIMEOUT_MS,
  resumeChromeManagedRun,
  assertChromeManagedCallerRun,
} from './features/cloud-bridge/managedRunControl';
import {
  getFreshClerkAuthContext,
  isClerkExtensionAuthConfigured,
  syncHostSessionCookieState,
  watchSyncHostSession,
} from './features/cloud-bridge/clerkAuth';
import {
  getManagedCloudAuthContext,
  getManagedModelAccess,
  streamFreeChat,
  FREE_TRIAL_GATEWAY,
  MANAGED_CHAT_MAX_INPUT_CHARS,
  type ManagedCloudAuthContext,
} from './features/cloud-bridge/freeTrialClient';
import {
  abortConversationSyncForOwnerChange,
  ensureCloudConversation,
  flushQuestionBeforeTurn,
  queueCloudConversationDeletion,
  saveConversationNow,
  scheduleConversationSync,
  sweepConversationSync,
  SYNC_SWEEP_ALARM,
} from './features/cloud-bridge/conversationSync';
import { watchCloudMirroringEnabled } from './features/privacy/cloudMirroring';
import { installBackgroundErrorReporting } from './features/observability/errorReporting';
import { resolveManagedComputerUseModel } from './features/computer-use/cloudAgentClient';
import {
  initDownloadLedger,
  listSessionDownloads,
  revealDownload,
  startBrowserToolDownload,
} from './features/browser-tools/downloads';
import {
  forgetPageWatchTab,
  getPageWatch,
  resumePageWatchAfterNavigation,
  startPageWatch,
  stopPageWatch,
  suspendPageWatchForNavigation,
} from './features/browser-tools/pageWatch';
import { readConsoleEntries } from './features/browser-tools/consoleCapture';
import {
  authorizeBrowserToolTab,
  authorizeBrowserToolUrl,
  readAuthorizedBrowserTab,
} from './features/browser-tools/tabAuthority';
import {
  AUTOFILL_NOT_APPROVED_ERROR,
  AUTOFILL_PROFILE_UNREADABLE_ERROR,
  AUTOFILL_UNSUPPORTED_PAGE_ERROR,
  CONTENT_SENDER_REFUSAL,
  contentScriptPageUrl,
} from './features/background/contentAccess';
import { loadAutofillProfile } from './features/content/autofill/profile-storage';
import { isJobApplicationHostUrl } from './features/content/autofill/detector';
import { changedOrigins, notifyPageAccessChanged } from './features/background/pageAccessNotifier';
import { IN_PAGE_PANEL_ENABLED_STORAGE_KEY } from './features/options/preference-rows';
import { parseContactAutofillProfile } from './features/content/autofill/contactProfile';
import { parseFormFillPlan } from './features/content/formFillPlan';
import { UUID_PATTERN } from './lib/uuid';
import { MAX_VALUE_LENGTH } from './background/policy';
import {
  captureEditableTarget,
  executeEditableTarget,
} from './features/background/editable-selection';
import { readNetworkEntries } from './features/browser-tools/networkCapture';
import { sendChromeHeartbeatIfDue } from './features/cloud-bridge/deviceHeartbeat';
import { WELCOME_PAGE_PATH } from './features/onboarding/paths';
import { createTaskNotifier, isSidePanelInFocus } from './background/task-notifications';
import { flushAutomationAuditOutbox } from './features/observability/automationAudit';
import {
  SIDE_PANEL_PORT_NAME,
  SIDE_PANEL_PRESENCE_MESSAGE,
  type SidePanelPresenceMessage,
} from './features/side-panel/panelPresence';
import {
  isCurrentManagedCloudOperation,
  managedCloudOwnerKey,
  normalizeManagedCloudOwner,
  selectManagedCloudCancellationCredential,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from './features/cloud-bridge/managedCloudAuthority';
import {
  bindUnboundDesktopPairing,
  desktopPairingRejectsAccount,
  oweDesktopRevocation,
  readDesktopPairToken,
  readPendingDesktopRevocation,
  releaseStoredDesktopPairing,
  releaseStoredDesktopPairingOf,
  settlePendingDesktopRevocation,
  type PendingDesktopRevocation,
} from './features/native-bridge/pairing';
import type {
  AdoptChatTurnMessage,
  AdoptedChatToolHandoff,
  ApproveContextHandoffMessage,
  BridgeUrlChangedMessage,
  CancelComputerUseMessage,
  ComputerUseApprovalResponseMessage,
  SidePanelClosedMessage,
  CancelContextHandoffMessage,
  CancelStreamMessage,
  ChatMessageMessage,
  ComputerUseGuidanceMessage,
  ComputerUseTakeoverMessage,
  CreateScheduledTaskMessage,
  DeleteCloudConversationMessage,
  DeleteScheduledTaskMessage,
  DeleteShortcutMessage,
  EnsureCloudConversationMessage,
  GrantSiteOnceMessage,
  ListScheduledTasksMessage,
  ManagedCloudAuthChangedMessage,
  ReadPageConsoleMessage,
  ReadPageNetworkMessage,
  ReplayShortcutMessage,
  ResolveChatApprovalMessage,
  ResolveChatInputMessage,
  ResolveChatToolsMessage,
  ResumeChatRunMessage,
  RevealDownloadMessage,
  RevokeSiteOnceMessage,
  RecordingActionMessage,
  SaveShortcutMessage,
  SetPageWatchMessage,
  SetQuickModeMessage,
  StartComputerUseMessage,
  StartDownloadMessage,
  SyncConversationMessage,
  SaveConversationNowMessage,
  SaveConversationNowResponse,
  UpdateScheduledTaskMessage,
  UpdateShortcutMessage,
  WebMCPDiscoverToolsMessage,
  WebMCPToolsChangedMessage,
} from './types';
import type { CallerToolContinuation } from './features/computer-use/toolHandoff';
import type {
  CallerToolResumeRequest,
  ManagedCloudAgentRunReference,
  WebDomainRules,
} from '@agiworkforce/cloud-contracts';
import type { PageDocumentReference } from './features/browser-tools/documentBridge';

interface BackgroundState {
  isNativeConnected: boolean;
  nativePort: chrome.runtime.Port | null;
  connectionStatus: ConnectionStatus;
  lastNativeError: string | null;
  rateLimiter: RateLimiter;
}

interface NativeMessageEnvelope {
  id: string;
  type: string;
  success?: boolean;
  error?: string;
  code?: unknown;
  data?: unknown;
}

const NATIVE_PAIRING_REJECTED_CODE = 'pairing-rejected';

class NativeRequestRefused extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
  }
}

function nativeRefusal(message: NativeMessageEnvelope): NativeRequestRefused {
  return new NativeRequestRefused(
    message.error ?? 'Native request failed',
    typeof message.code === 'string' ? message.code : null,
  );
}

interface NativeResponseEnvelope {
  success?: boolean;
  data?: unknown;
  error?: string;
}

const state: BackgroundState = {
  isNativeConnected: false,
  nativePort: null,
  connectionStatus: 'disconnected',
  lastNativeError: null,
  rateLimiter: new RateLimiter(120, 500),
};

interface ActiveChatStream {
  clientInstanceId: string;
  owner: ManagedCloudOwner;
  token: string;
  controller: AbortController;
  cancelRequested: boolean;
  cancelNotified: boolean;
  cancellation?: Promise<ExtensionResponse>;
  requestId?: string;
  cloudRun?: ManagedCloudAgentRunReference;
  streamId?: string;
  historyConversationId?: string;
  assistantMessageId?: string;
  visibleText?: string;
  panelDetached?: boolean;
  settlement?: Promise<void>;
  inPageTabId?: number;
  inPageOrigin?: string;
  inPageRequestId?: string;
}

const activeChatStreams = new Map<string, ActiveChatStream>();
const adoptedChatStreamKeys = new Map<string, string>();
let stopDetachedChatHeartbeat: (() => void) | null = null;

function syncDetachedChatHeartbeat(): void {
  const detached = [...activeChatStreams.values()].some((active) => active.panelDetached);
  if (detached && !stopDetachedChatHeartbeat) {
    stopDetachedChatHeartbeat = beginScheduledTaskHeartbeat();
  } else if (!detached && stopDetachedChatHeartbeat) {
    stopDetachedChatHeartbeat();
    stopDetachedChatHeartbeat = null;
  }
}

function releaseChatStream(streamKey: string, activeStream: ActiveChatStream): void {
  if (activeChatStreams.get(streamKey) === activeStream) activeChatStreams.delete(streamKey);
  for (const [alias, original] of adoptedChatStreamKeys) {
    if (original === streamKey && !activeChatStreams.has(original)) {
      adoptedChatStreamKeys.delete(alias);
    }
  }
  syncDetachedChatHeartbeat();
}

function resolveChatStreamKey(streamKey: string): string {
  return adoptedChatStreamKeys.get(streamKey) ?? streamKey;
}

interface PendingChatToolHandoff {
  owner: ManagedCloudOwner;
  clientInstanceId: string;
  streamId: string;
  handoff: AdoptedChatToolHandoff;
  callIds: readonly string[];
  callNames: readonly string[];
  signal: AbortSignal;
  nativeTask?: {
    runId: string;
    toolCallId: string;
    context?: CallerBrowserContext;
    taskTabs?: TaskTabScope;
    terminal: boolean;
    cancel?: () => void;
  };
  callerCheckpoint?: ChatToolCursor;
  finish: (outcome: ChromeManagedToolHandoffOutcome) => void;
}

const pendingChatToolHandoffs = new Map<string, PendingChatToolHandoff>();

function bindCallerBrowserTask(value: unknown, owner: ManagedCloudOwner, runId: string) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('The caller task link is invalid.');
  const link = value as Record<string, unknown>;
  const keys = ['handoffId', 'toolCallId', 'clientInstanceId', 'streamId'];
  if (
    Object.keys(link).length !== keys.length ||
    keys.some(
      (key) =>
        typeof link[key] !== 'string' ||
        (link[key] as string).length === 0 ||
        (link[key] as string).length > TOOL_CALL_ID_MAX_LENGTH,
    )
  )
    throw new Error('The caller task link is invalid.');
  const pending = pendingChatToolHandoffs.get(link['handoffId'] as string);
  const index = pending?.callIds.indexOf(link['toolCallId'] as string) ?? -1;
  if (
    !pending ||
    pending.signal.aborted ||
    !pending.callerCheckpoint ||
    pending.nativeTask ||
    index < 0 ||
    pending.callNames[index] !== CHAT_BROWSER_TASK_TOOL ||
    !sameManagedCloudOwner(pending.owner, owner) ||
    pending.clientInstanceId !== link['clientInstanceId'] ||
    pending.streamId !== link['streamId']
  )
    throw new Error('The browser task does not belong to the pending caller action.');
  const task = {
    runId,
    toolCallId: link['toolCallId'] as string,
    context: undefined as CallerBrowserContext | undefined,
    taskTabs: undefined as TaskTabScope | undefined,
    terminal: false,
    cancel: undefined as (() => void) | undefined,
  };
  pending.nativeTask = task;
  const isCurrent = () =>
    pendingChatToolHandoffs.get(link['handoffId'] as string) === pending &&
    pending.nativeTask === task &&
    !pending.signal.aborted;
  const assertCurrent = () => {
    if (!isCurrent()) throw new Error('The parent caller action stopped.');
  };
  const readAdmission = async () => {
    assertCurrent();
    const saved = await readChromeCallerToolCustody(
      owner,
      pending.callerCheckpoint!.run_id,
      assertCurrent,
    );
    const cursor = saved?.step?.cursor;
    const action = saved?.step?.actions?.find((entry) => entry.callId === task.toolCallId);
    const call = saved?.step?.calls.find((entry) => entry.id === task.toolCallId);
    if (
      !saved ||
      !cursor ||
      cursor.schema_version !== pending.callerCheckpoint!.schema_version ||
      cursor.next_event_sequence !== pending.callerCheckpoint!.next_event_sequence ||
      cursor.turn_id !== pending.callerCheckpoint!.turn_id ||
      action?.state !== 'in_flight' ||
      call?.function.name !== CHAT_BROWSER_TASK_TOOL
    )
      throw new Error('The native task does not match its owned caller action.');
    await assertCallerConversationAuthority(
      saved.binding,
      saved.binding.historyConversationId,
      isCurrent,
      pending.signal,
    );
    assertCurrent();
    return saved;
  };
  return {
    signal: pending.signal,
    isCurrent,
    async assertAuthority() {
      await readAdmission();
    },
    async readTaskTabs() {
      return (await readAdmission()).taskTabs;
    },
    async assertPage(tabId: number) {
      const saved = await readAdmission();
      const page = saved.currentBrowserContext ?? saved.binding.browserContext;
      if (!page?.documentId || page.tabId !== tabId)
        throw new Error('The native task does not match its owned caller page.');
      await readCallerBrowserContext(page, assertCurrent);
    },
    attachCancellation(cancel: () => void) {
      if (!isCurrent()) {
        cancel();
        return;
      }
      task.cancel = cancel;
    },
    fail() {
      if (isCurrent() && !task.terminal) task.terminal = true;
    },
    complete(value: CallerBrowserContext, scope: TaskTabScope) {
      if (!isCurrent()) throw new Error('The parent caller action stopped before task completion.');
      const context = parseCallerBrowserContext(value);
      if (!context.documentId)
        throw new Error('The completed caller task has no document identity.');
      if (task.terminal) throw new Error('The caller task already completed.');
      task.taskTabs = parseTaskTabScope(scope, context);
      task.context = context;
      task.terminal = true;
    },
  };
}

function unansweredToolResults(calls: readonly ToolCall[], content: string) {
  return calls.map((call) => ({ toolCallId: call.id, content }));
}

function requestChatToolHandoff(
  active: ActiveChatStream,
  streamId: string,
  calls: ToolCall[],
  checkpoint?: CallerToolContinuation,
  recoveryContext?: ChatToolHandoffMessage['recoveryContext'],
): Promise<ChromeManagedToolHandoffOutcome> {
  const callerCheckpoint = checkpoint
    ? {
        schema_version: checkpoint.schema_version,
        run_id: checkpoint.run_id,
        turn_id: checkpoint.turn_id,
        next_event_sequence: checkpoint.next_event_sequence,
      }
    : undefined;
  const handoffId = `handoff_${crypto.randomUUID()}`;
  const signal = active.controller.signal;
  if (calls.length > MAX_CHAT_TOOL_CALLS_PER_HANDOFF) {
    return Promise.resolve({
      status: 'resolved',
      results: unansweredToolResults(calls, 'Too many browser tool calls in one step; none ran.'),
    });
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: ChromeManagedToolHandoffOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      const pendingTask = pendingChatToolHandoffs.get(handoffId)?.nativeTask;
      pendingChatToolHandoffs.delete(handoffId);
      if (!pendingTask?.terminal) pendingTask?.cancel?.();
      resolve(outcome);
    };
    const onAbort = (): void => finish({ status: 'cancelled' });
    const timeout = setTimeout(
      () =>
        finish(
          callerCheckpoint
            ? { status: 'cancelled' }
            : {
                status: 'resolved',
                results: unansweredToolResults(calls, 'The browser tool did not answer in time.'),
              },
        ),
      CHAT_TOOL_HANDOFF_TIMEOUT_MS,
    );
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    const handoff: ChatToolHandoffMessage = {
      type: 'CHAT_TOOL_HANDOFF',
      owner: active.owner,
      clientInstanceId: active.clientInstanceId,
      id: streamId,
      handoffId,
      calls,
      ...(callerCheckpoint ? { callerCheckpoint } : {}),
      ...(recoveryContext ? { recoveryContext } : {}),
    };
    pendingChatToolHandoffs.set(handoffId, {
      owner: active.owner,
      clientInstanceId: active.clientInstanceId,
      streamId,
      handoff: {
        handoffId,
        calls,
        ...(callerCheckpoint ? { callerCheckpoint } : {}),
        ...(recoveryContext ? { recoveryContext } : {}),
      },
      callIds: calls.map((call) => call.id),
      callNames: calls.map((call) => call.function.name),
      signal,
      ...(callerCheckpoint ? { callerCheckpoint } : {}),
      finish,
    });
    void chrome.runtime.sendMessage(handoff).catch(() =>
      finish(
        callerCheckpoint
          ? { status: 'cancelled' }
          : {
              status: 'resolved',
              results: unansweredToolResults(
                calls,
                'The side panel closed, so the browser tool could not run.',
              ),
            },
      ),
    );
  });
}

function waitingChatToolHandoffs(active: ActiveChatStream, streamId: string) {
  return [...pendingChatToolHandoffs.values()].filter(
    (pending) =>
      pending.streamId === streamId &&
      pending.clientInstanceId === active.clientInstanceId &&
      !pending.nativeTask &&
      !pending.signal.aborted &&
      sameManagedCloudOwner(pending.owner, active.owner),
  );
}

function adoptPendingChatToolHandoffs(
  active: ActiveChatStream,
  streamId: string,
  clientInstanceId: string,
): AdoptedChatToolHandoff[] {
  return waitingChatToolHandoffs(active, streamId).map((pending) => {
    pending.clientInstanceId = clientInstanceId;
    return structuredClone(pending.handoff);
  });
}

async function notifyWaitingBrowserStep(active: ActiveChatStream): Promise<void> {
  if (!active.streamId || waitingChatToolHandoffs(active, active.streamId).length === 0) return;
  if (!(await taskNotificationsEnabled())) return;
  showNotification(
    t('notifyTaskInputTitle'),
    t('notifyBrowserStepWaiting'),
    active.historyConversationId,
    active.owner,
  );
}

function resolveChatToolHandoff(message: ResolveChatToolsMessage): boolean {
  const pending = pendingChatToolHandoffs.get(message.handoffId);
  const owner = normalizeManagedCloudOwner(message.owner);
  if (
    !pending ||
    !owner ||
    !sameManagedCloudOwner(owner, pending.owner) ||
    message.clientInstanceId !== pending.clientInstanceId ||
    message.id !== pending.streamId
  )
    return false;
  if (message.cancelled === true) {
    pending.finish({ status: 'cancelled' });
    return true;
  }
  const results = message.results;
  if (
    !Array.isArray(results) ||
    results.length !== pending.callIds.length ||
    results.some(
      (result, index) =>
        !result ||
        result.toolCallId !== pending.callIds[index] ||
        typeof result.content !== 'string',
    ) ||
    !validChatToolResults(results, pending.callerCheckpoint) ||
    (message.browserToolTier !== undefined && !isChatBrowserToolTier(message.browserToolTier)) ||
    (message.browserHistory !== undefined && message.browserHistory !== true)
  )
    return false;
  if (pending.nativeTask && !pending.nativeTask.terminal) return false;
  const tools = chatBrowserToolDefinitions(
    message.browserToolTier,
    message.browserHistory === true,
  );
  pending.finish({
    status: 'resolved',
    results: results.map((result) => ({
      toolCallId: result.toolCallId,
      content: result.content,
      ...(pending.nativeTask?.context && pending.nativeTask.toolCallId === result.toolCallId
        ? { browserContext: pending.nativeTask.context, taskTabs: pending.nativeTask.taskTabs }
        : {}),
      ...(result.observation !== undefined ? { observation: result.observation } : {}),
    })),
    ...(tools.length ? { tools } : {}),
  });
  return true;
}

const oneTimeSiteGrantTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function isHostPermissionKeptForever(origin: string): Promise<boolean> {
  await siteAllowlistReady;
  return (
    siteAllowlistCache.has(origin) &&
    (await readBrowserControlConsent().catch(() => [] as string[])).includes(origin)
  );
}

async function revokeOneTimeSiteGrant(grantId: string): Promise<void> {
  clearTimeout(oneTimeSiteGrantTimers.get(grantId));
  oneTimeSiteGrantTimers.delete(grantId);
  const grant = removeOneTimeSiteGrant(grantId);
  const [recorded] = await forgetTransientHostPermissions([grantId]).catch(() => []);
  const origin = grant?.origin ?? recorded?.origin;
  if (!origin) return;
  const hostPermissionAdded = grant ? grant.hostPermissionAdded : true;
  if (hostPermissionAdded && !oneTimeGrantedOrigins().includes(origin)) {
    if (!(await isHostPermissionKeptForever(origin))) {
      await removeBrowserControlHostPermission(origin);
    }
  }
  cancelActiveRunUnlessOriginStillApproved(isOriginApprovedForAutomation);
}

async function revokeAllOneTimeSiteGrants(): Promise<void> {
  for (const grant of listOneTimeSiteGrants()) await revokeOneTimeSiteGrant(grant.grantId);
  await sweepTransientHostPermissions(false);
}

async function sweepTransientHostPermissions(expiredOnly: boolean): Promise<void> {
  const entries = await listTransientHostPermissions().catch(() => []);
  if (entries.length === 0) return;
  await siteAllowlistReady;
  const plan = planTransientSweep({
    entries,
    keptOrigins: new Set(
      entries.map((entry) => entry.origin).filter((origin) => siteAllowlistCache.has(origin)),
    ),
    heldOrigins: new Set(oneTimeGrantedOrigins()),
    nowMs: Date.now(),
    expiredOnly,
  });
  await forgetTransientHostPermissions(plan.forgetIds).catch(() => []);
  for (const origin of plan.removeOrigins) await removeBrowserControlHostPermission(origin);
}

function grantSiteOnce(message: GrantSiteOnceMessage): boolean {
  for (const expired of expiredOneTimeSiteGrants()) void revokeOneTimeSiteGrant(expired.grantId);
  if (!isOneTimeSiteGrantId(message.grantId) || typeof message.origin !== 'string') return false;
  const grant = addOneTimeSiteGrant(
    message.grantId,
    message.origin,
    message.hostPermissionAdded === true,
  );
  if (!grant) return false;
  oneTimeSiteGrantTimers.set(
    grant.grantId,
    setTimeout(() => void revokeOneTimeSiteGrant(grant.grantId), grant.expiresAtMs - Date.now()),
  );
  return true;
}
const scheduledTaskExecutions = new ScheduledTaskExecutionCoordinator();
interface ActiveScheduledRecovery {
  taskId: string;
  requestId: string;
  owner: ManagedCloudOwner;
  token: string;
  controller: AbortController;
  cloudRun?: ManagedCloudAgentRunReference;
}
const activeScheduledRecoveries = new Map<string, ActiveScheduledRecovery>();
const scheduledTaskCancellationAttempts = new ScheduledTaskCancellationAttemptCoordinator();
const abandonedScheduledTaskRequestIds = new Set<string>();
const retiredManagedCloudOwners = new Set<string>();
const SCHEDULED_RECOVERY_MAX_ATTEMPTS = 3;
const SCHEDULED_HEARTBEAT_INTERVAL_MS = 20_000;

const computerUseRuns = new ComputerUseRunCoordinator();
const pendingComputerUseApprovals = new Map<
  string,
  (message: unknown, sender: chrome.runtime.MessageSender) => void
>();
const APPROVAL_NO_LONGER_PENDING =
  'This request is no longer waiting for an answer, so nothing was done.';
interface PendingRunGuidance {
  text: string;
  settle: (applied: boolean) => void;
}
const computerUseGuidance = new Map<string, PendingRunGuidance[]>();
const computerUseStarts = new ComputerUseStartCoordinator();
let computerUseStartGeneration = 0;

function isCurrentComputerUseStart(runId: string, generation: number): boolean {
  return (
    computerUseStartGeneration === generation && computerUseStarts.isCurrent(runId, generation)
  );
}

function clearPendingComputerUseStart(runId?: string): boolean {
  return computerUseStarts.cancel(runId) !== null;
}

function sendComputerUseLifecycle(message: Record<string, unknown>): void {
  void chrome.runtime.sendMessage(message).catch(() => {
    // The owning panel may have closed; cancellation still remains authoritative.
  });
}

initDownloadLedger();

function broadcastComputerUseForCurrentRun(
  lease: ComputerUseRunLease,
  message: Record<string, unknown>,
): void {
  if (!computerUseRuns.isCurrent(lease)) return;
  sendComputerUseLifecycle({
    ...message,
    runId: lease.runId,
    runGeneration: lease.generation,
    tabId: lease.tabId,
    ...(lease.windowId === undefined ? {} : { windowId: lease.windowId }),
  });
}

const USER_TAKEOVER_REASON = 'You have the page. AGI waits until you hand it back.';
const USER_INPUT_TAKEOVER_REASON = 'You started using the page, so AGI stopped acting on it.';
const AGENT_INPUT_ECHO_MS = 750;

function watchComputerUseUserInput(tabId: number, watching: boolean): void {
  void chrome.tabs
    .sendMessage(tabId, { type: 'AGI_CU_WATCH_INPUT', watching })
    .catch(() => undefined);
}

function untilHandedBack(lease: ComputerUseRunLease, takeover: ComputerUseTakeover): Promise<void> {
  const signal = lease.controller.signal;
  return new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException('Computer-use run was cancelled', 'AbortError'),
      );
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    void takeover.handedBack.then(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    });
  });
}

const takeoverDeadlines = new WeakSet<ComputerUseTakeover>();

function endTakeoverAfterLimit(lease: ComputerUseRunLease, takeover: ComputerUseTakeover): void {
  if (takeoverDeadlines.has(takeover)) return;
  takeoverDeadlines.add(takeover);
  const timer = setTimeout(() => {
    if (lease.takeover !== takeover || computerUseRuns.getActive() !== lease) return;
    computerUseStartGeneration += 1;
    cancelActiveComputerUseRun('takeover_expired', lease.runId);
  }, USER_TAKEOVER_MAX_MS);
  const clear = (): void => clearTimeout(timer);
  void takeover.handedBack.then(clear);
  lease.controller.signal.addEventListener('abort', clear, { once: true });
}

function handComputerUseTabToUser(lease: ComputerUseRunLease, reason: string): Promise<void> {
  const takeover = computerUseRuns.beginTakeover(lease, reason);
  endTakeoverAfterLimit(lease, takeover);
  broadcastComputerUseForCurrentRun(lease, {
    type: 'AGI_CU_STATE',
    status: 'paused',
    reason: takeover.reason,
  });
  return untilHandedBack(lease, takeover);
}

function cancelActiveComputerUseRun(
  reason: ComputerUseCancellationReason,
  expectedRunId?: string,
  broadcast = true,
): ComputerUseRunLease | null {
  const lease = computerUseRuns.cancel(reason, expectedRunId);
  if (lease && broadcast) {
    sendComputerUseLifecycle({
      type: 'AGI_CU_STATE',
      status: 'stopped',
      reason,
      runId: lease.runId,
      runGeneration: lease.generation,
      tabId: lease.tabId,
    });
  }
  return lease;
}

function cancelComputerUseIfAuthChanged(owner: ManagedCloudOwner | null): void {
  const lease = computerUseRuns.getActive();
  if (!lease) return;
  if (!owner) {
    computerUseStartGeneration += 1;
    cancelActiveComputerUseRun('account_changed');
    return;
  }
  if (!sameManagedCloudOwner(lease.authOwner, owner)) {
    computerUseStartGeneration += 1;
    cancelActiveComputerUseRun('account_changed');
  }
}

function broadcastManagedChatChunk(
  owner: ManagedCloudOwner,
  clientInstanceId: string,
  id: string,
  input: Omit<ChatChunkMessage, 'type' | 'owner' | 'clientInstanceId' | 'id'>,
): Promise<void> {
  const chunk: ChatChunkMessage = {
    type: 'CHAT_CHUNK',
    owner,
    clientInstanceId,
    id,
    ...input,
  };
  return chrome.runtime
    .sendMessage(chunk)
    .then(() => undefined)
    .catch(() => {
      // The extension view may have closed while the server-owned run continues.
    });
}

function publishManagedChatChunk(
  streamKey: string,
  active: ActiveChatStream,
  id: string,
  input: Omit<ChatChunkMessage, 'type' | 'owner' | 'clientInstanceId' | 'id'>,
): void {
  if (!isCurrentManagedCloudOperation(activeChatStreams.get(streamKey), active)) return;
  broadcastManagedChatChunk(active.owner, active.clientInstanceId, id, input);
}

async function cancelManagedCloudRunWithCapturedCredential(
  active: Pick<ActiveChatStream, 'token' | 'cloudRun'>,
): Promise<boolean> {
  if (!active.cloudRun) return true;
  const controller = new AbortController();
  try {
    const cancellation = await withTimeout(
      cancelChromeManagedRun(
        active.cloudRun,
        {
          getAuthToken: async () => active.token,
        },
        controller.signal,
      ),
      MANAGED_RUN_CANCELLATION_TIMEOUT_MS,
    );
    if (cancellation.status === 'success') return true;
    logger.warn('Managed Cloud run cancellation failed', {
      runId: active.cloudRun.runId,
      error: cancellation.message,
    });
    return false;
  } catch (error) {
    logger.warn('Managed Cloud run cancellation failed', {
      runId: active.cloudRun.runId,
      error,
    });
    return false;
  } finally {
    controller.abort();
  }
}

async function loadScheduledTaskRunJournalsForTeardown(): Promise<ScheduledTaskRunJournal[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await loadScheduledTaskRunJournals();
    } catch (error) {
      lastError = error;
      logger.warn('Failed to read scheduled cancellation journals during owner teardown', {
        attempt,
        error,
      });
      if (attempt < 3) await sleep(100 * attempt);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Scheduled cancellation journals could not be read.');
}

async function invalidateManagedCloudOwner(
  owner: ManagedCloudOwner,
  includeInactiveJournals = false,
): Promise<void> {
  const admittedStreams: ActiveChatStream[] = [];
  for (const [streamKey, active] of activeChatStreams) {
    if (!sameManagedCloudOwner(active.owner, owner)) continue;
    active.cancelRequested = true;
    active.controller.abort();
    activeChatStreams.delete(streamKey);
    admittedStreams.push(active);
  }
  const admittedRecoveries: ActiveScheduledRecovery[] = [];
  for (const [requestId, recovery] of activeScheduledRecoveries) {
    if (!sameManagedCloudOwner(recovery.owner, owner)) continue;
    recovery.controller.abort();
    activeScheduledRecoveries.delete(requestId);
    admittedRecoveries.push(recovery);
  }

  const immediateCancellations: Array<{
    requestId?: string;
    runId: string;
    result: Promise<boolean>;
  }> = [];
  const queuedRunIds = new Set<string>();
  const queueImmediateCancellation = (
    active: Pick<ActiveChatStream, 'token' | 'cloudRun' | 'requestId'>,
  ): void => {
    if (!active.cloudRun || queuedRunIds.has(active.cloudRun.runId)) return;
    queuedRunIds.add(active.cloudRun.runId);
    immediateCancellations.push({
      ...(active.requestId ? { requestId: active.requestId } : {}),
      runId: active.cloudRun.runId,
      result: cancelManagedCloudRunWithCapturedCredential(active),
    });
  };
  for (const active of admittedStreams) queueImmediateCancellation(active);
  for (const recovery of admittedRecoveries) queueImmediateCancellation(recovery);

  const cancellations: Promise<void>[] = [];
  let journals: ScheduledTaskRunJournal[];
  try {
    journals = await loadScheduledTaskRunJournalsForTeardown();
  } catch (error) {
    await Promise.allSettled(immediateCancellations.map((entry) => entry.result));
    throw error;
  }
  const ambientCredential = includeInactiveJournals
    ? await getManagedCloudAuthContext().catch(() => null)
    : null;
  const journalCredential =
    ambientCredential && sameManagedCloudOwner(ambientCredential.owner, owner)
      ? ambientCredential
      : null;
  const journalsByRequestId = new Map(journals.map((journal) => [journal.requestId, journal]));
  const scheduledRequests = new Set<string>();
  for (const active of admittedStreams) {
    const journal = active.requestId ? journalsByRequestId.get(active.requestId) : undefined;
    if (journal) {
      scheduledRequests.add(journal.requestId);
      cancellations.push(
        abandonScheduledTaskRun(
          journal,
          { token: active.token, owner: active.owner },
          active.cloudRun,
        ).then(() => undefined),
      );
    }
  }
  for (const recovery of admittedRecoveries) {
    if (scheduledRequests.has(recovery.requestId)) continue;
    const journal = journalsByRequestId.get(recovery.requestId);
    if (!journal) continue;
    scheduledRequests.add(recovery.requestId);
    cancellations.push(
      abandonScheduledTaskRun(
        journal,
        { token: recovery.token, owner: recovery.owner },
        recovery.cloudRun,
      ).then(() => undefined),
    );
  }
  if (includeInactiveJournals) {
    for (const journal of journals) {
      if (!sameManagedCloudOwner(journal.owner, owner)) continue;
      if (scheduledRequests.has(journal.requestId)) continue;
      scheduledRequests.add(journal.requestId);
      cancellations.push(
        abandonScheduledTaskRun(journal, journalCredential, journal.cloudRun).then(() => undefined),
      );
    }
  }
  const journalResults = await Promise.allSettled(cancellations);
  const journalFailures = journalResults.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  const immediateResults = await Promise.allSettled(
    immediateCancellations.map((entry) => entry.result),
  );
  const uncancelledWithoutJournal = immediateResults.flatMap((result, index) => {
    const entry = immediateCancellations[index];
    if (!entry || result.status === 'rejected') return entry ? [entry.runId] : [];
    return !result.value && (!entry.requestId || !scheduledRequests.has(entry.requestId))
      ? [entry.runId]
      : [];
  });
  if (journalFailures.length > 0 || uncancelledWithoutJournal.length > 0) {
    logger.error('Managed Cloud owner teardown did not durably cover every run', {
      journalFailures: journalFailures.map((result) => result.reason),
      uncancelledWithoutJournal,
    });
    throw new Error('Managed Cloud owner teardown could not durably cancel every admitted run.');
  }
}

function retireManagedCloudOwner(owner: ManagedCloudOwner): void {
  abortConversationSyncForOwnerChange();
  retiredManagedCloudOwners.add(managedCloudOwnerKey(owner));
  while (retiredManagedCloudOwners.size > 100) {
    const oldest = retiredManagedCloudOwners.values().next().value;
    if (typeof oldest !== 'string') break;
    retiredManagedCloudOwners.delete(oldest);
  }
}

function isRetiredManagedCloudOwner(owner: ManagedCloudOwner): boolean {
  return retiredManagedCloudOwners.has(managedCloudOwnerKey(owner));
}

async function invalidateRejectedManagedCloudCredential(
  rejected: Pick<ActiveChatStream, 'owner' | 'token'>,
): Promise<void> {
  const computerUseLease = computerUseRuns.getActive();
  if (computerUseLease && sameManagedCloudOwner(computerUseLease.authOwner, rejected.owner)) {
    computerUseStartGeneration += 1;
    cancelActiveComputerUseRun('account_changed', computerUseLease.runId);
  }
  const teardownErrors: unknown[] = [];
  try {
    await invalidateManagedCloudOwner(rejected.owner);
  } catch (error) {
    teardownErrors.push(error);
  }
  let current: ManagedCloudAuthContext | null = null;
  let refreshed = false;
  try {
    current = await getManagedCloudAuthContext(true);
    refreshed = true;
  } catch (error) {
    logger.warn('Failed to refresh the rejected Managed Cloud credential', error);
    teardownErrors.push(error);
  }
  if (refreshed && (!current || !sameManagedCloudOwner(current.owner, rejected.owner))) {
    retireManagedCloudOwner(rejected.owner);
    try {
      await invalidateManagedCloudOwner(rejected.owner, true);
    } catch (error) {
      teardownErrors.push(error);
    }
  }
  if (teardownErrors.length > 0) {
    logger.error('Rejected Managed Cloud credential teardown was incomplete', teardownErrors);
    throw new Error('Rejected Managed Cloud credential teardown was incomplete.');
  }
}

// Pending requests waiting for responses
const pendingRequests = new Map<
  string,
  {
    resolve: (value: ExtensionResponse) => void;
    reject: (reason: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
    allowUnsignedResponse: boolean;
    port: chrome.runtime.Port;
    removeAbort?: () => void;
  }
>();
const pendingContextHandoffApprovals = new Set<string>();

const webmcpToolsByTab = new Map<
  number,
  {
    tools: WebMCPToolInfo[];
    url: string;
    timestamp: number;
    navigationGeneration: number;
  }
>();
const webmcpNavigationGenerationByTab = new Map<number, number>();

const NATIVE_HOST_NAME = 'com.agiworkforce.browser';
const NATIVE_REQUEST_TIMEOUT_MS = 10000;
const CONTENT_SCRIPT_FORWARD_TIMEOUT_MS = 30000;
const NATIVE_CONNECT_MAX_WAIT_MS = 2000;
const NATIVE_CONNECT_POLL_INTERVAL_MS = 100;
const TAB_GROUP_NAME = 'AGI';

const _bgCtx = {
  nativeReconnectTimer: null as ReturnType<typeof setTimeout> | null,
  nativeReconnectAttempt: 0,
  nativeConnectAttempt: 0,
  nativeHandshakeInFlight: false,
  nativeReconnectGaveUp: false,
  nativeSuspendInProgress: false,
  revocationRetryAt: 0,
};

const DESKTOP_NOT_PAIRED =
  'This browser profile is not paired with Desktop. Pair it in the extension settings.';
const DESKTOP_PAIRED_ELSEWHERE =
  'Desktop no longer recognizes this browser profile, so the pairing was removed here. Pair it again in the extension settings.';
const DESKTOP_REVOCATION_RETRY_MS = 5 * 60_000;

let nativeSessionSecret: ArrayBuffer | null = null;

async function importHmacKey(rawSecret: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', rawSecret, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

async function computeEnvelopeMac(
  id: string,
  timestamp: number,
  body: unknown,
  sessionSecret: ArrayBuffer | null = nativeSessionSecret,
): Promise<string | null> {
  if (!sessionSecret) return null;
  const payload = `${id}|${timestamp}|${JSON.stringify(body)}`;
  const key = await importHmacKey(sessionSecret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function setNativeSessionSecret(hex: string | undefined): void {
  const isWellFormed =
    typeof hex === 'string' && hex.length === 64 && /^[0-9a-fA-F]{64}$/.test(hex);
  if (!isWellFormed) {
    logger.warn(
      '[native-mac] Native host did not return a well-formed session_secret; ' +
        'the connection will be rejected before privileged requests are sent.',
    );
    nativeSessionSecret = null;
    return;
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  nativeSessionSecret = bytes.buffer;
}

const NATIVE_RECONNECT_GAVE_UP_KEY = 'agi_native_reconnect_gave_up';
const DESKTOP_PAIRED_KEY = 'connectedToDesktop';

/**
 * Held in session storage rather than a worker-local flag: MV3 restarts the
 * worker freely, and a fresh one used to retry a host that had already been
 * declared permanently unavailable earlier in the same browser session.
 */
const nativeReconnectGaveUpRestored: Promise<void> = chrome.storage.session
  .get(NATIVE_RECONNECT_GAVE_UP_KEY)
  .then((stored) => {
    if (stored[NATIVE_RECONNECT_GAVE_UP_KEY] === true) _bgCtx.nativeReconnectGaveUp = true;
  })
  .catch((error: unknown) => {
    logger.warn('Failed to restore the native reconnect state', error);
  });

function setNativeReconnectGaveUp(gaveUp: boolean): void {
  _bgCtx.nativeReconnectGaveUp = gaveUp;
  void chrome.storage.session
    .set({ [NATIVE_RECONNECT_GAVE_UP_KEY]: gaveUp })
    .catch((error: unknown) => {
      logger.warn('Failed to persist the native reconnect state', error);
    });
}

function setDesktopPaired(paired: boolean): void {
  void storageUtils.setItem(DESKTOP_PAIRED_KEY, paired);
}

/**
 * A user who has never paired AGI Desktop has no native host to reach, so an
 * automatic connectNative on every worker start only produced a failed connect
 * and a warning. Pairing, manual reconnect and any request that needs the host
 * still connect directly.
 */
/**
 * A pairing is a credential of one account. Drop it when this worker can
 * read a different signed-in account, or a real sign-out. A Clerk read that
 * throws is not a sign-out: the native session stays until the account is known.
 * Returns true when the pairing was released.
 */
async function definitiveSignedInAccount(
  clerkRead?: Promise<ManagedCloudAuthContext | null>,
): Promise<string | null | undefined> {
  if (!isClerkExtensionAuthConfigured()) return undefined;
  let signedInAccountId: string | null;
  try {
    const context = await (clerkRead ?? getFreshClerkAuthContext());
    signedInAccountId = context?.owner.accountId ?? null;
  } catch {
    return undefined;
  }
  // A missing Clerk session while the sync cookie is still there is hydration,
  // not a sign-out. A different account id is never ambiguous.
  if (signedInAccountId === null && (await syncHostSessionCookieState()) !== 'absent') {
    return undefined;
  }
  return signedInAccountId;
}

async function releaseDesktopPairingOfOtherAccount(
  signedInAccountId: string | null,
): Promise<boolean> {
  if (!(await desktopPairingRejectsAccount(signedInAccountId))) {
    if (signedInAccountId !== null) await bindUnboundDesktopPairing(signedInAccountId);
    return false;
  }
  await releaseDesktopPairing('The signed-in account changed.', false);
  return true;
}

async function revokeMismatchedDesktopPairing(
  clerkRead?: Promise<ManagedCloudAuthContext | null>,
): Promise<boolean> {
  const signedInAccountId = await definitiveSignedInAccount(clerkRead);
  if (signedInAccountId === undefined) return false;
  return releaseDesktopPairingOfOtherAccount(signedInAccountId);
}

/** Pairing and recordings belong to the account that made them. */
async function releaseDataOfOtherAccounts(
  clerkRead?: Promise<ManagedCloudAuthContext | null>,
): Promise<void> {
  const signedInAccountId = await definitiveSignedInAccount(clerkRead);
  if (signedInAccountId === undefined) return;
  await releaseDesktopPairingOfOtherAccount(signedInAccountId);
  await releaseRecordingsOfOtherAccounts(signedInAccountId);
}

/**
 * Unpairs this profile. When Desktop cannot be told now, the unpair is owed
 * and retried on later worker starts with the token Desktop needs to accept it.
 * `keepUnlessOwed` keeps the pairing when that debt cannot be recorded, so a
 * user unpair is never silently half done; an account change releases anyway.
 */
async function releaseDesktopPairing(
  reason: string,
  keepUnlessOwed: boolean,
): Promise<{ acknowledged: boolean; owed: boolean; kept: boolean }> {
  const token = await readDesktopPairToken();
  const acknowledged = await disconnectPairedNativeHost(reason);
  const owed = !acknowledged && token !== null && (await oweDesktopRevocation(token));
  if (!acknowledged && token !== null && !owed && keepUnlessOwed) {
    return { acknowledged, owed, kept: true };
  }
  await releaseStoredDesktopPairing();
  if (owed) {
    _bgCtx.revocationRetryAt = 0;
    void settleOwedDesktopRevocation();
  }
  return { acknowledged, owed, kept: false };
}

/** Tries to deliver an owed unpair, at most once per retry window. True while one is owed. */
async function settleOwedDesktopRevocation(): Promise<boolean> {
  if (!(await readPendingDesktopRevocation())) return false;
  if (state.nativePort || _bgCtx.nativeHandshakeInFlight) return true;
  if (Date.now() < _bgCtx.revocationRetryAt) return true;
  _bgCtx.revocationRetryAt = Date.now() + DESKTOP_REVOCATION_RETRY_MS;
  resetNativeReconnectState();
  connectToNativeHost();
  return true;
}

async function readDesktopConnectCredential(): Promise<{
  token: string;
  revocation: PendingDesktopRevocation | null;
} | null> {
  try {
    const revocation = await readPendingDesktopRevocation();
    if (revocation) return { token: revocation.token, revocation };
    const token = await readDesktopPairToken();
    return token ? { token, revocation: null } : null;
  } catch {
    return null;
  }
}

async function shouldAutoConnectToDesktop(): Promise<boolean> {
  await nativeReconnectGaveUpRestored;
  if (_bgCtx.nativeReconnectGaveUp) return false;
  if (await revokeMismatchedDesktopPairing()) return false;
  return (await storageUtils.getItem<boolean>(DESKTOP_PAIRED_KEY, false)) === true;
}

function clearNativeReconnectTimer(): void {
  if (_bgCtx.nativeReconnectTimer) {
    clearTimeout(_bgCtx.nativeReconnectTimer);
    _bgCtx.nativeReconnectTimer = null;
  }
}

async function disconnectPairedNativeHost(reason: string): Promise<boolean> {
  activePairedBrowserCommand?.driver?.cancel(reason);
  const port = state.nativePort;
  const sessionSecret = nativeSessionSecret;
  clearNativeReconnectTimer();
  setNativeReconnectGaveUp(true);
  setDesktopPaired(false);
  const unpaired = (
    port && sessionSecret && state.isNativeConnected
      ? await sendNativeRequest(
          {
            type: NATIVE_BROWSER_UNPAIR_MESSAGE,
          },
          { requireAuthenticatedSession: true, connection: { port, sessionSecret } },
        ).catch(() => null)
      : null
  ) as { success?: boolean } | null;
  if (state.nativePort === port) dropNativeConnection(port, reason);
  return unpaired?.success === true;
}

function dropNativeConnection(port: chrome.runtime.Port | null, reason: string): void {
  if (port) rejectPendingNativeRequests(port, reason);
  state.nativePort = null;
  nativeSessionSecret = null;
  state.isNativeConnected = false;
  state.connectionStatus = 'disconnected';
  _bgCtx.nativeHandshakeInFlight = false;
  clearNativeReconnectTimer();
  setNativeReconnectGaveUp(true);
  setDesktopPaired(false);
  try {
    port?.disconnect();
  } catch (error) {
    logger.debug('Native disconnect after unpair failed', error);
  }
  void notifyConnectionStatusChange();
}

async function deliverOwedDesktopRevocation(
  port: chrome.runtime.Port,
  revocationId: string,
): Promise<void> {
  const receipt = (await sendNativeRequest({
    type: NATIVE_BROWSER_UNPAIR_MESSAGE,
  })) as unknown as { success?: boolean } | null;
  if (state.nativePort !== port) return;
  if (receipt?.success !== true) throw new Error('Desktop did not remove the pairing.');
  await settlePendingDesktopRevocation(revocationId);
  dropNativeConnection(port, 'The browser was unpaired from Desktop.');
}

function resetNativeReconnectState(): void {
  _bgCtx.nativeReconnectAttempt = 0;
  setNativeReconnectGaveUp(false);
  clearNativeReconnectTimer();
}

async function triggerManualReconnect(): Promise<ExtensionResponse> {
  activePairedBrowserCommand?.driver?.cancel('The AGI Desktop connection was replaced.');
  resetNativeReconnectState();
  const previousPort = state.nativePort;
  state.nativePort = null;
  nativeSessionSecret = null;
  _bgCtx.nativeHandshakeInFlight = false;
  if (previousPort) {
    rejectPendingNativeRequests(previousPort, 'The AGI Desktop connection was replaced.');
    try {
      previousPort.disconnect();
    } catch (error) {
      logger.debug('Manual reconnect disconnect failed', error);
    }
  }

  state.nativePort = null;
  state.isNativeConnected = false;
  state.lastNativeError = null;
  state.connectionStatus = 'connecting';
  void notifyConnectionStatusChange();

  connectToNativeHost();
  const connected = await waitForNativeConnection(NATIVE_CONNECT_MAX_WAIT_MS);

  return {
    success: true,
    nativeConnected: connected,
    connectionStatus: connected ? 'connected' : state.connectionStatus,
  } as ExtensionResponse;
}

function scheduleNativeReconnect(trigger: string): void {
  if (_bgCtx.nativeReconnectTimer) {
    return;
  }

  _bgCtx.nativeReconnectAttempt = Math.min(
    _bgCtx.nativeReconnectAttempt + 1,
    NATIVE_RECONNECT_MAX_ATTEMPTS,
  );

  const delay = nativeReconnectDelayMs(_bgCtx.nativeReconnectAttempt);
  if (delay === null) {
    logger.warn('Max native reconnect attempts reached; giving up until user action', { trigger });
    setNativeReconnectGaveUp(true);
    state.connectionStatus = 'disconnected';
    void notifyConnectionStatusChange();
    return;
  }

  logger.info('Scheduling native reconnect', {
    trigger,
    attempt: _bgCtx.nativeReconnectAttempt,
    delayMs: delay,
  });

  if (state.connectionStatus !== 'connecting') {
    state.connectionStatus = 'connecting';
    void notifyConnectionStatusChange();
  }

  _bgCtx.nativeReconnectTimer = setTimeout(() => {
    _bgCtx.nativeReconnectTimer = null;
    connectToNativeHost();
  }, delay);
}

async function waitForNativeConnection(timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (state.nativePort && state.isNativeConnected) {
      return true;
    }
    await sleep(NATIVE_CONNECT_POLL_INTERVAL_MS);
  }
  return false;
}

function initialize(): void {
  void restrictStorageToTrustedContexts(chrome.storage, (area, error) => {
    logger.error('Failed to restrict Chrome storage to extension pages', { area, error });
  });
  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.runtime.onConnect.addListener(handleManagedChatKeepalivePort);
  chrome.runtime.onConnect.addListener(handleSidePanelPresencePort);
  chrome.runtime.onConnect.addListener(handleInPagePromptPort);
  void sweepTransientHostPermissions(false);
  void initializeSyncedPreferences(chrome.storage, (error) => {
    logger.warn('Failed to mirror a cross-device preference', error);
  }).catch((error) => {
    logger.warn('Failed to initialize cross-device preferences', error);
  });
  void purgeLegacyProviderCredentials(chrome.storage).then((failures) => {
    if (failures.length > 0) {
      logger.warn('Failed to purge the obsolete provider credential from Chrome storage', {
        storageAreas: failures,
      });
    }
  });
  if (sidePanelAvailable()) {
    chrome.sidePanel.setPanelBehavior?.({ openPanelOnActionClick: false }).catch((err) => {
      logger.warn('setPanelBehavior(openPanelOnActionClick) failed', err);
    });
  }
  watchSyncHostSession(() => {
    void releaseDataOfOtherAccounts();
  });
  void shouldAutoConnectToDesktop().then((autoConnect) => {
    if (!autoConnect) return;
    connectToNativeHost();
    void checkDesktopConnection();
  });
  void restoreScheduledTaskAlarms()
    .then(recoverScheduledTaskRuns)
    .catch((error) => logger.warn('Failed to restore scheduled Managed Cloud work', error));
}

const openSidePanelWindows = new Map<number, number>();

function publishSidePanelPresence(
  windowId: number,
  open: boolean = openSidePanelWindows.has(windowId),
): void {
  const message: SidePanelPresenceMessage = {
    type: SIDE_PANEL_PRESENCE_MESSAGE,
    open,
  };
  void chrome.tabs
    .query({ windowId })
    .then((tabs) => {
      for (const tab of tabs) {
        if (tab.id !== undefined) void chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    })
    .catch(() => {});
}

function handleSidePanelPresencePort(port: chrome.runtime.Port): void {
  if (port.name !== SIDE_PANEL_PORT_NAME) return;
  if (
    !isTrustedExtensionPageSender(
      {
        id: port.sender?.id,
        url: port.sender?.url,
        origin: port.sender?.origin,
        tabUrl: port.sender?.tab?.url,
        hasTab: port.sender?.tab != null,
      },
      chrome.runtime.id,
      chrome.runtime.getURL('/').replace(/\/+$/, ''),
    )
  ) {
    port.disconnect();
    return;
  }
  let registeredWindow: number | null = null;
  port.onMessage.addListener((message: unknown) => {
    const windowId = (message as { windowId?: unknown } | null)?.windowId;
    if (typeof windowId !== 'number' || registeredWindow !== null) return;
    registeredWindow = windowId;
    openSidePanelWindows.set(windowId, (openSidePanelWindows.get(windowId) ?? 0) + 1);
    publishSidePanelPresence(windowId);
  });
  port.onDisconnect.addListener(() => {
    if (registeredWindow === null) return;
    const remaining = (openSidePanelWindows.get(registeredWindow) ?? 1) - 1;
    if (remaining > 0) openSidePanelWindows.set(registeredWindow, remaining);
    else openSidePanelWindows.delete(registeredWindow);
    void settleClosedSidePanel(registeredWindow, port.sender?.documentId);
  });
}

async function settleClosedSidePanel(
  windowId: number,
  closingDocumentId: string | undefined,
): Promise<void> {
  const remaining = (
    await chrome.runtime
      .getContexts({ contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType] })
      .catch(() => [])
  ).filter((panel) => panel.documentId === undefined || panel.documentId !== closingDocumentId);
  publishSidePanelPresence(
    windowId,
    openSidePanelWindows.has(windowId) || remaining.some((panel) => panel.windowId === windowId),
  );
  if (remaining.length === 0 && openSidePanelWindows.size === 0) await revokeAllOneTimeSiteGrants();
}

function handleManagedChatKeepalivePort(port: chrome.runtime.Port): void {
  const clientInstanceId = parseManagedChatPortName(port.name);
  if (!clientInstanceId) return;
  if (
    !isTrustedExtensionPageSender(
      {
        id: port.sender?.id,
        url: port.sender?.url,
        origin: port.sender?.origin,
        tabUrl: port.sender?.tab?.url,
        hasTab: port.sender?.tab != null,
      },
      chrome.runtime.id,
      chrome.runtime.getURL('/').replace(/\/+$/, ''),
    )
  ) {
    port.disconnect();
    return;
  }

  port.onMessage.addListener((message: unknown) => {
    if (
      !message ||
      typeof message !== 'object' ||
      (message as Record<string, unknown>)['type'] !== 'MANAGED_CHAT_KEEPALIVE'
    ) {
      port.disconnect();
    }
  });
  port.onDisconnect.addListener(() => {
    for (const active of activeChatStreams.values()) {
      if (active.clientInstanceId !== clientInstanceId) continue;
      active.panelDetached = true;
      void notifyWaitingBrowserStep(active);
    }
    syncDetachedChatHeartbeat();
  });
}

function connectToNativeHost(): void {
  if (state.nativePort || _bgCtx.nativeHandshakeInFlight || _bgCtx.nativeReconnectGaveUp) {
    return;
  }
  const attempt = ++_bgCtx.nativeConnectAttempt;
  _bgCtx.nativeHandshakeInFlight = true;
  void readDesktopConnectCredential().then((credential) => {
    if (
      attempt !== _bgCtx.nativeConnectAttempt ||
      !_bgCtx.nativeHandshakeInFlight ||
      state.nativePort
    )
      return;
    if (!credential || _bgCtx.nativeReconnectGaveUp) {
      _bgCtx.nativeHandshakeInFlight = false;
      if (!credential) state.lastNativeError = DESKTOP_NOT_PAIRED;
      return;
    }
    openNativeConnection(credential);
  });
}

/**
 * Handles a refused handshake. Desktop refuses a token it does not hold when
 * it was unpaired or paired with another profile: an owed unpair is then
 * already done, and a pairing that only this side still remembers is dropped
 * so the settings page stops showing it.
 */
async function handleRefusedDesktopHandshake(
  error: unknown,
  credential: { token: string; revocation: PendingDesktopRevocation | null },
): Promise<boolean> {
  if (!(error instanceof NativeRequestRefused) || error.code !== NATIVE_PAIRING_REJECTED_CODE)
    return false;
  if (credential.revocation) {
    await settlePendingDesktopRevocation(credential.revocation.id);
    return true;
  }
  if (!(await releaseStoredDesktopPairingOf(credential.token))) return false;
  state.lastNativeError = DESKTOP_PAIRED_ELSEWHERE;
  return true;
}

const nativePortPairTokens = new WeakMap<chrome.runtime.Port, string>();

async function releaseRevokedDesktopConnection(
  port: chrome.runtime.Port,
  error: unknown,
): Promise<boolean> {
  if (!(error instanceof NativeRequestRefused) || error.code !== NATIVE_PAIRING_REJECTED_CODE)
    return false;
  if (state.nativePort !== port) return true;
  const portToken = nativePortPairTokens.get(port);
  const released = portToken !== undefined && (await releaseStoredDesktopPairingOf(portToken));
  if (state.nativePort !== port) return true;
  const reason = released
    ? DESKTOP_PAIRED_ELSEWHERE
    : 'This browser was paired with Desktop again, so the earlier connection was closed.';
  logger.warn(
    released
      ? 'Desktop no longer holds this pairing; releasing it here'
      : 'Desktop refused an earlier pairing; keeping the newer one',
  );
  activePairedBrowserCommand?.driver?.cancel(reason);
  rejectPendingNativeRequests(port, reason);
  state.nativePort = null;
  nativeSessionSecret = null;
  _bgCtx.nativeHandshakeInFlight = false;
  state.isNativeConnected = false;
  state.connectionStatus = 'disconnected';
  state.lastNativeError = released ? DESKTOP_PAIRED_ELSEWHERE : null;
  try {
    port.disconnect();
  } catch (disconnectError) {
    logger.debug('Native port disconnect after a refused pairing failed', disconnectError);
  }
  clearNativeReconnectTimer();
  if (released) {
    setNativeReconnectGaveUp(true);
    setDesktopPaired(false);
  } else {
    connectToNativeHost();
  }
  void notifyConnectionStatusChange();
  return true;
}

function openNativeConnection(credential: {
  token: string;
  revocation: PendingDesktopRevocation | null;
}): void {
  try {
    state.connectionStatus = 'connecting';
    void notifyConnectionStatusChange();

    logger.info('Connecting to native host', { host: NATIVE_HOST_NAME });
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    nativePortPairTokens.set(port, credential.token);
    state.nativePort = port;
    nativeSessionSecret = null;
    state.isNativeConnected = false;
    state.lastNativeError = null;
    _bgCtx.nativeHandshakeInFlight = true;
    port.onMessage.addListener((message: NativeMessageEnvelope) => {
      if (state.nativePort === port) handleNativeMessage(message, port);
    });
    port.onDisconnect.addListener(() => {
      if (state.nativePort === port) handleNativeDisconnect();
    });

    void (async () => {
      try {
        const connectResult = (await sendNativeRequest({
          type: 'connect',
          extension_id: chrome.runtime.id,
          pair_token: credential.token,
        })) as unknown as NativeResponseEnvelope;
        if (state.nativePort !== port) return;
        if (!connectResult?.success) {
          throw new Error(connectResult?.error ?? 'Native connect handshake failed');
        }
        if (!nativeSessionSecret) {
          throw new Error('Native host did not negotiate an authenticated session');
        }

        const pingResult = (await sendNativeRequest({
          type: 'ping',
        })) as unknown as NativeResponseEnvelope;
        if (state.nativePort !== port) return;
        if (!pingResult?.success) {
          throw new Error(pingResult?.error ?? 'Native ping failed');
        }

        if (credential.revocation) {
          await deliverOwedDesktopRevocation(port, credential.revocation.id);
          return;
        }

        state.isNativeConnected = true;
        void pollDesktopBrowserCommands();
        _bgCtx.nativeReconnectAttempt = 0;
        setNativeReconnectGaveUp(false);
        setDesktopPaired(true);
        clearNativeReconnectTimer();
        state.connectionStatus = 'connected';
        void notifyConnectionStatusChange();
      } catch (error) {
        if (state.nativePort !== port) return;
        logger.warn('Native host handshake failed', error);
        rejectPendingNativeRequests(port, 'The AGI Desktop handshake failed.');
        state.nativePort = null;
        nativeSessionSecret = null;
        _bgCtx.nativeHandshakeInFlight = false;
        try {
          port.disconnect();
        } catch (disconnectError) {
          logger.debug('Native port disconnect after handshake failure failed', disconnectError);
        }
        state.isNativeConnected = false;
        state.connectionStatus = 'disconnected';
        state.nativePort = null;
        state.lastNativeError = error instanceof Error ? error.message : 'Native handshake failed';
        if (await handleRefusedDesktopHandshake(error, credential)) {
          clearNativeReconnectTimer();
          setNativeReconnectGaveUp(true);
          setDesktopPaired(false);
        } else if (credential.revocation) {
          setNativeReconnectGaveUp(true);
        } else {
          scheduleNativeReconnect('handshake_failed');
        }
        void notifyConnectionStatusChange();
      } finally {
        if (state.nativePort === port) _bgCtx.nativeHandshakeInFlight = false;
      }
    })();
  } catch (error) {
    logger.error('Failed to connect to native host', error);
    _bgCtx.nativeHandshakeInFlight = false;
    state.isNativeConnected = false;
    state.nativePort = null;
    state.connectionStatus = 'disconnected';
    state.lastNativeError = error instanceof Error ? error.message : 'Unknown error';
    void notifyConnectionStatusChange();
    if (credential.revocation) setNativeReconnectGaveUp(true);
    else scheduleNativeReconnect('connect_failed');
  }
}

function createRequestId(): string {
  return `${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

interface NativeRequestOptions {
  timeoutMs?: number;
  requireAuthenticatedSession?: boolean;
  connection?: { port: chrome.runtime.Port; sessionSecret: ArrayBuffer };
  signal?: AbortSignal;
}

function sendNativeRequest(
  message: Record<string, unknown>,
  timeoutOrOptions: number | NativeRequestOptions = NATIVE_REQUEST_TIMEOUT_MS,
): Promise<ExtensionResponse> {
  const options: NativeRequestOptions =
    typeof timeoutOrOptions === 'number' ? { timeoutMs: timeoutOrOptions } : timeoutOrOptions;
  const timeoutMs = options.timeoutMs ?? NATIVE_REQUEST_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    void (async () => {
      if (options.signal?.aborted) {
        reject(
          options.signal.reason instanceof Error
            ? options.signal.reason
            : new Error('The native request was cancelled.'),
        );
        return;
      }
      if (
        options.connection &&
        (state.nativePort !== options.connection.port ||
          nativeSessionSecret !== options.connection.sessionSecret ||
          !state.isNativeConnected)
      ) {
        resolve({
          success: false,
          error: 'The original AGI Desktop connection is no longer active.',
        });
        return;
      }
      const portReadyForHandshake = !!state.nativePort && _bgCtx.nativeHandshakeInFlight;
      if (!portReadyForHandshake && (!state.nativePort || !state.isNativeConnected)) {
        if (!_bgCtx.nativeReconnectGaveUp) {
          connectToNativeHost();
        }
        const connected = await waitForNativeConnection(NATIVE_CONNECT_MAX_WAIT_MS);
        if (!connected || !state.nativePort || !state.isNativeConnected) {
          resolve({ success: false, error: 'Not connected to native host' });
          return;
        }
      }

      const activePort = state.nativePort;
      const activeSessionSecret = nativeSessionSecret;
      const isConnectRequest = message['type'] === 'connect';
      if (!isConnectRequest && !activeSessionSecret) {
        resolve({
          success: false,
          error: options.requireAuthenticatedSession
            ? 'A secure AGI Desktop connection is required before selected context can leave Chrome.'
            : 'Native host did not negotiate an authenticated session',
        });
        return;
      }

      const id = createRequestId();
      const timestamp = Date.now();
      try {
        const mac = await computeEnvelopeMac(id, timestamp, message, activeSessionSecret);
        if (options.signal?.aborted)
          throw options.signal.reason instanceof Error
            ? options.signal.reason
            : new Error('The native request was cancelled.');
        if (
          !activePort ||
          state.nativePort !== activePort ||
          (options.connection &&
            (activePort !== options.connection.port ||
              activeSessionSecret !== options.connection.sessionSecret ||
              !state.isNativeConnected)) ||
          (options.requireAuthenticatedSession &&
            (!state.isNativeConnected || nativeSessionSecret !== activeSessionSecret || !mac))
        ) {
          resolve({
            success: false,
            error: 'The secure AGI Desktop connection changed before the context was sent.',
          });
          return;
        }

        const timeout = setTimeout(() => {
          pendingRequests.get(id)?.removeAbort?.();
          pendingRequests.delete(id);
          reject(new Error(`Native request timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        const abort = (): void => {
          const pending = pendingRequests.get(id);
          if (!pending || pending.port !== activePort) return;
          clearTimeout(pending.timeout);
          pending.removeAbort?.();
          pendingRequests.delete(id);
          reject(
            options.signal?.reason instanceof Error
              ? options.signal.reason
              : new Error('The native request was cancelled.'),
          );
        };
        pendingRequests.set(id, {
          resolve,
          reject,
          timeout,
          allowUnsignedResponse: isConnectRequest && !activeSessionSecret,
          port: activePort,
          ...(options.signal
            ? { removeAbort: () => options.signal!.removeEventListener('abort', abort) }
            : {}),
        });
        options.signal?.addEventListener('abort', abort, { once: true });
        if (options.signal?.aborted) {
          abort();
          return;
        }

        activePort.postMessage({
          id,
          timestamp,
          mac,
          message,
        });
      } catch (error) {
        const pending = pendingRequests.get(id);
        if (pending) {
          clearTimeout(pending.timeout);
          pending.removeAbort?.();
          pendingRequests.delete(id);
        }
        reject(error);
      }
    })();
  });
}

function currentWebMCPNavigationGeneration(tabId: number): number {
  return webmcpNavigationGenerationByTab.get(tabId) ?? 0;
}

/**
 * Records the tab as watched so the navigation listeners keep invalidating it
 * while a discovery is in flight. Without the entry the tab-event early-out
 * would skip the generation bump that makes a stale discovery detectable.
 */
function watchWebMCPNavigation(tabId: number): number {
  const generation = currentWebMCPNavigationGeneration(tabId);
  webmcpNavigationGenerationByTab.set(tabId, generation);
  return generation;
}

function hasWatchedTabWork(): boolean {
  return (
    computerUseRuns.getActive() !== null ||
    webmcpToolsByTab.size > 0 ||
    webmcpNavigationGenerationByTab.size > 0
  );
}

function sendAuthenticatedWebMCPNativeUpdate(
  tabId: number,
  normalized: NormalizedWebMCPToolsUpdate,
): void {
  if (!state.isNativeConnected || !state.nativePort) return;
  void sendNativeRequest(
    {
      type: 'webmcp_tools_update',
      tab_id: tabId,
      ...normalized,
    },
    {
      timeoutMs: NATIVE_REQUEST_TIMEOUT_MS,
      requireAuthenticatedSession: true,
    },
  )
    .then((response) => {
      if (response.success === false) {
        logger.warn(
          'WebMCP authenticated native update was rejected',
          'error' in response ? response.error : undefined,
        );
      }
    })
    .catch((error) => {
      logger.debug('WebMCP authenticated native update failed', error);
    });
}

function publishNormalizedWebMCPToolsUpdate(
  tabId: number,
  normalized: NormalizedWebMCPToolsUpdate,
  navigationGeneration = currentWebMCPNavigationGeneration(tabId),
): boolean {
  if (navigationGeneration !== currentWebMCPNavigationGeneration(tabId)) return false;
  webmcpToolsByTab.set(tabId, {
    ...normalized,
    timestamp: Date.now(),
    navigationGeneration,
  });
  logger.info(`WebMCP: ${normalized.tools.length} tool(s) on tab ${tabId}`, {
    tools: normalized.tools.map((tool) => tool.name),
  });
  chrome.runtime
    .sendMessage({ type: 'WEBMCP_TOOLS_CHANGED', tabId, navigationGeneration, ...normalized })
    .catch(() => {
      // Side panel may not be open; ignore.
    });
  sendAuthenticatedWebMCPNativeUpdate(tabId, normalized);
  return true;
}

function invalidateWebMCPToolsForNavigation(tabId: number): number {
  const navigationGeneration = currentWebMCPNavigationGeneration(tabId) + 1;
  webmcpNavigationGenerationByTab.set(tabId, navigationGeneration);
  const previous = webmcpToolsByTab.get(tabId);
  webmcpToolsByTab.delete(tabId);
  if (previous) {
    const cleared: NormalizedWebMCPToolsUpdate = { tools: [], url: previous.url };
    chrome.runtime
      .sendMessage({ type: 'WEBMCP_TOOLS_CHANGED', tabId, navigationGeneration, ...cleared })
      .catch(() => {
        // Side panel may not be open; ignore.
      });
    sendAuthenticatedWebMCPNativeUpdate(tabId, cleared);
  }
  return navigationGeneration;
}

function handleNativeMessage(message: NativeMessageEnvelope, port: chrome.runtime.Port): void {
  if (state.nativePort !== port) return;
  // The connect handshake carries session_secret (the raw HMAC key); never log the envelope.
  logger.debug('Received native message', {
    id: message?.id,
    type: message?.type,
    success: message?.success,
  });

  if (message && message.id && pendingRequests.has(message.id)) {
    const request = pendingRequests.get(message.id);
    if (request) {
      if (request.port !== port) return;
      const maybeSecret = (message as unknown as Record<string, unknown>)['session_secret'];
      if (
        request.allowUnsignedResponse &&
        typeof maybeSecret === 'string' &&
        !nativeSessionSecret
      ) {
        setNativeSessionSecret(maybeSecret);
      }
      const { resolve, reject, timeout } = request;
      clearTimeout(timeout);
      request.removeAbort?.();
      pendingRequests.delete(message.id);

      const respMac = (message as unknown as Record<string, unknown>)['mac'];
      const respTs = (message as unknown as Record<string, unknown>)['timestamp'];
      const responseSessionSecret = nativeSessionSecret;
      if (responseSessionSecret) {
        if (typeof respMac !== 'string' || typeof respTs !== 'number') {
          logger.warn(
            '[native-mac] Strict mode, rejecting response with missing mac/timestamp ' +
              '(downgrade attack guard)',
            { id: message.id },
          );
          reject(new Error('Native response missing required MAC envelope'));
          return;
        }
        const body: Record<string, unknown> = {
          ...(message as unknown as Record<string, unknown>),
        };
        delete body['id'];
        delete body['mac'];
        delete body['timestamp'];
        delete body['session_secret'];
        void computeEnvelopeMac(message.id, respTs, body, responseSessionSecret)
          .then((expected) => {
            if (state.nativePort !== port || nativeSessionSecret !== responseSessionSecret) {
              reject(
                new Error('The AGI Desktop connection changed while its response was verified.'),
              );
              return;
            }
            if (expected === null || !timingSafeEqual(expected, respMac)) {
              logger.warn(
                '[native-mac] Response MAC mismatch, rejecting (potential shuffle attack)',
                { id: message.id },
              );
              reject(new Error('Native response MAC mismatch'));
              return;
            }
            if (message.success === false) {
              reject(nativeRefusal(message));
            } else {
              resolve(message as unknown as ExtensionResponse);
            }
          })
          .catch(reject);
        return;
      }

      if (!request.allowUnsignedResponse) {
        reject(new Error('Native response arrived without an authenticated session'));
        return;
      }
      if (message.success === false) {
        reject(nativeRefusal(message));
      } else {
        resolve(message as unknown as ExtensionResponse);
      }
    }
  }
}

function rejectPendingNativeRequests(port: chrome.runtime.Port, error: string): void {
  for (const [requestId, pending] of pendingRequests.entries()) {
    if (pending.port !== port) continue;
    clearTimeout(pending.timeout);
    pending.removeAbort?.();
    pending.reject(new Error(error));
    pendingRequests.delete(requestId);
  }
}

function handleNativeDisconnect(): void {
  nativeSessionSecret = null;
  const error = chrome.runtime.lastError?.message || 'Native host disconnected';
  logger.warn('Native host disconnected', { error });

  if (state.nativePort) rejectPendingNativeRequests(state.nativePort, error);

  state.nativePort = null;
  _bgCtx.nativeHandshakeInFlight = false;
  state.isNativeConnected = false;
  state.connectionStatus = 'disconnected';
  state.lastNativeError = error;

  void notifyConnectionStatusChange();

  if (_bgCtx.nativeSuspendInProgress) {
    return;
  }

  if (isPermanentNativeDisconnect(error)) {
    logger.warn('Native host permanently unavailable; halting reconnect', { error });
    setNativeReconnectGaveUp(true);
    setDesktopPaired(false);
    void releaseUnreachableDesktopPairing();
    return;
  }

  scheduleNativeReconnect('native_disconnect');
}

/**
 * Desktop removes its host registration when it unpairs or is uninstalled, and
 * Chrome then reports the host as missing. No pairing is left on the other
 * side, so neither the record here nor an owed unpair can mean anything.
 */
async function releaseUnreachableDesktopPairing(): Promise<void> {
  const owed = await readPendingDesktopRevocation();
  if (owed) await settlePendingDesktopRevocation(owed.id);
  await releaseStoredDesktopPairing();
}

function showNotification(
  title: string,
  message: string,
  conversationId?: string,
  conversationOwner?: ManagedCloudOwner,
): void {
  if (!chrome.notifications?.create) return;
  const notifId = `agi_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  chrome.notifications.create(
    notifId,
    {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title,
      message,
    },
    () => {
      if (chrome.runtime.lastError) {
        logger.debug('Notification create failed', chrome.runtime.lastError.message);
      }
    },
  );
  if (conversationId && conversationOwner) {
    void linkNotificationToConversation(notifId, conversationOwner, conversationId);
  }
}

async function taskNotificationsEnabled(): Promise<boolean> {
  return readEnabledPreference({
    read: async () => {
      const { agi_task_notifications: enabled } = await chrome.storage.local.get({
        agi_task_notifications: true,
      });
      return enabled;
    },
    onUnreadable: (error) =>
      logger.warn('Task notification setting could not be read; staying quiet', error),
  });
}

const notifyBrowserTask = createTaskNotifier<ManagedCloudOwner>({
  isEnabled: taskNotificationsEnabled,
  isUserLooking: () => isSidePanelInFocus(),
  show: showNotification,
});

async function notifyScheduledTaskRunning(
  taskName: string,
  signal: AbortSignal,
  owner?: ManagedCloudOwner,
): Promise<void> {
  await publishAuthorizedScheduledTaskNotification(
    { signal, ...(owner ? { owner } : {}) },
    {
      isEnabled: taskNotificationsEnabled,
      isOwnerRetired: isRetiredManagedCloudOwner,
      publish: () => {
        chrome.notifications.create(`agi_task_notif_${crypto.randomUUID()}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon48.png'),
          title: t('notifyScheduledTaskRunningTitle'),
          message: taskName,
          priority: 0,
        });
      },
    },
  );
}

chrome.notifications?.onClicked?.addListener((notifId: string) => {
  void getManagedCloudAuthContext().then(async (credential) => {
    if (!credential || isRetiredManagedCloudOwner(credential.owner)) return;
    const conversationId = await takeNotificationConversation(notifId, credential.owner);
    if (!conversationId) return;
    await setPendingResultConversation(credential.owner, conversationId);
    chrome.runtime
      .sendMessage({
        type: OPEN_BROWSER_CONVERSATION_MESSAGE,
        owner: credential.owner,
        conversationId,
      })
      .catch(() => {
        // No extension view is open yet; the parked pointer covers that case.
      });
  });
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.id) openAssistantPanel({ tabId: tab.id, windowId: tab.windowId }).catch(() => {});
  });
  chrome.notifications.clear(notifId, () => {});
});

async function ensureTabGroup(tabId: number): Promise<boolean> {
  if (!chrome.tabGroups) return false;
  try {
    const groups = await chrome.tabGroups.query({ title: TAB_GROUP_NAME });
    if (groups.length > 0 && groups[0]?.id !== undefined) {
      await chrome.tabs.group({ tabIds: [tabId], groupId: groups[0].id });
    } else {
      const groupId = await chrome.tabs.group({ tabIds: [tabId] });
      await chrome.tabGroups.update(groupId, { title: TAB_GROUP_NAME, color: 'blue' });
    }
    return true;
  } catch (err) {
    logger.debug('Tab group operation failed (non-fatal)', err);
    return false;
  }
}

async function markComputerUseTab(tabId: number): Promise<(() => Promise<void>) | null> {
  if (!chrome.tabGroups) return null;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (typeof tab.groupId === 'number' && tab.groupId >= 0) return null;
    if (!(await ensureTabGroup(tabId))) return null;
    return () => chrome.tabs.ungroup(tabId).catch(() => undefined);
  } catch {
    return null;
  }
}

async function ungroupLostComputerUseTab(tabId: number): Promise<void> {
  if (!chrome.tabGroups) return;
  const tab = await chrome.tabs.get(tabId);
  if (typeof tab.groupId !== 'number' || tab.groupId < 0) return;
  const group = await chrome.tabGroups.get(tab.groupId);
  if (group.title === TAB_GROUP_NAME) await chrome.tabs.ungroup(tabId);
}

async function handleReplayShortcut(
  message: ReplayShortcutMessage,
  expectedOwner?: ManagedCloudOwner,
  notify = true,
): Promise<ExtensionResponse> {
  if (
    message.modelSelection !== undefined &&
    (typeof message.modelSelection !== 'string' || !message.modelSelection.trim())
  ) {
    return {
      success: false,
      error: 'The shortcut model selection is invalid.',
    } as ExtensionResponse;
  }
  await releaseDataOfOtherAccounts();
  const shortcuts = await loadShortcuts();
  const shortcut = shortcuts.find((s) => s.id === message.shortcutId);
  if (!shortcut) {
    return { success: false, error: 'Shortcut not found' } as ExtensionResponse;
  }
  if (
    shortcut.createdByOrigin &&
    shortcut.createdByOrigin !== ORIGIN_EXTENSION_PAGE &&
    !isOriginApprovedForAutomation(shortcut.createdByOrigin)
  ) {
    logger.warn('Auto-deleting shortcut whose origin is no longer allowlisted', {
      shortcutId: shortcut.id,
      createdByOrigin: shortcut.createdByOrigin,
    });
    await handleDeleteShortcut({
      type: 'DELETE_SHORTCUT',
      shortcutId: shortcut.id,
    } as DeleteShortcutMessage);
    return {
      success: false,
      error: 'Shortcut origin is no longer on your allowlist; the shortcut was removed.',
    } as ExtensionResponse;
  }
  const plan = planShortcutReplay(shortcut);
  if (plan.kind === 'empty') {
    return {
      success: false,
      error: 'This shortcut has no recorded actions or prompt to run.',
    } as ExtensionResponse;
  }
  if (plan.kind === 'prompt') {
    const safePrompt = renderShortcutPrompt(plan.prompt).slice(0, TASK_PROMPT_MAX_CHARS);
    const chatMsg: Omit<ChatMessageMessage, 'owner'> & {
      owner?: ManagedCloudOwner;
    } = {
      type: 'CHAT_MESSAGE',
      clientInstanceId: SHORTCUT_REPLAY_CLIENT_ID,
      id: `shortcut_${shortcut.id}_${crypto.randomUUID()}`,
      text: safePrompt,
      timestamp: Date.now(),
      modelSelection: message.modelSelection ?? 'auto',
      ...(expectedOwner ? { owner: expectedOwner } : {}),
    };
    let deliveredAnswer = '';
    let deliveredOwner: ManagedCloudOwner | undefined;
    const delivery = createBackgroundChatDelivery(
      'shortcut',
      shortcut.id,
      shortcut.name,
      safePrompt,
    );
    if (delivery) {
      delivery.onDelivered = (answer, owner) => {
        deliveredAnswer = answer;
        deliveredOwner = owner;
      };
    }
    const chatResult = await handleChatMessage(chatMsg, { id: chrome.runtime.id }, delivery);
    if (chatResult.status === 'success') {
      if (notify) {
        const snippet = notificationSnippet(deliveredAnswer);
        showNotification(
          t('notifyShortcutReplayedTitle'),
          snippet
            ? t('notifyShortcutAnswer', [shortcut.name, snippet])
            : t('notifyShortcutFinished', [shortcut.name]),
          deliveredAnswer ? delivery?.conversationId : undefined,
          deliveredOwner,
        );
      }
      return { success: true } as ExtensionResponse;
    }
    return {
      success: false,
      error: chatResult.message || 'Shortcut prompt failed to run.',
    } as ExtensionResponse;
  }
  if (message.tabId !== undefined && (!Number.isSafeInteger(message.tabId) || message.tabId < 0))
    return { success: false, error: 'The replay tab is invalid.' } as ExtensionResponse;
  let targetTab: chrome.tabs.Tab | undefined;
  try {
    targetTab =
      message.tabId === undefined
        ? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
        : await chrome.tabs.get(message.tabId);
  } catch {
    return {
      success: false,
      error: 'The recorded website tab is no longer open.',
    } as ExtensionResponse;
  }
  if (!targetTab?.id) {
    return { success: false, error: 'No replay tab' } as ExtensionResponse;
  }
  const replayTarget = validateShortcutReplayTarget(shortcut, targetTab.url);
  if (!replayTarget.ok) {
    return { success: false, error: replayTarget.error } as ExtensionResponse;
  }
  const taskId = `replay_${Date.now()}`;
  const result = await forwardToContentScript(targetTab.id, {
    type: 'RUN_PAGE_ACTIONS',
    tabId: targetTab.id,
    taskId,
    actions: shortcut.actions,
    expectedOrigin: normalizeShortcutStartUrl(shortcut.startUrl)!,
  } as ExtensionMessage);
  if (result.success && notify) {
    showNotification(
      t('notifyShortcutReplayedTitle'),
      t('notifyShortcutCompleted', [shortcut.name]),
    );
  }
  return result;
}

async function scheduledTaskManagedPrompt(
  task: Pick<ScheduledTask, 'prompt' | 'shortcutId'>,
): Promise<string | undefined> {
  const directPrompt =
    typeof task.prompt === 'string'
      ? task.prompt.slice(0, TASK_PROMPT_MAX_CHARS).trim()
      : undefined;
  if (directPrompt) return directPrompt;
  if (!task.shortcutId) return undefined;
  const shortcut = (await loadShortcuts()).find((candidate) => candidate.id === task.shortcutId);
  if (!shortcut) return undefined;
  const plan = planShortcutReplay(shortcut);
  if (plan.kind !== 'prompt') return undefined;
  const shortcutPrompt = plan.prompt.slice(0, TASK_PROMPT_MAX_CHARS).trim();
  return shortcutPrompt || undefined;
}

async function scheduledTaskUsesManagedCloud(
  task: Pick<ScheduledTask, 'prompt' | 'shortcutId'>,
): Promise<boolean> {
  return (await scheduledTaskManagedPrompt(task)) !== undefined;
}

class ScheduledTaskSourceUnavailableError extends Error {}
class ScheduledTaskSourceDeniedError extends Error {
  constructor(
    message: string,
    readonly taskOriginDenied = false,
  ) {
    super(message);
  }
}

async function assertScheduledTaskSourceAuthority(
  task: ScheduledTask,
): Promise<string | undefined> {
  if (task.prompt !== undefined && typeof task.prompt !== 'string') {
    throw new ScheduledTaskSourceUnavailableError('The scheduled prompt is unreadable.');
  }
  const directPrompt = task.prompt?.slice(0, TASK_PROMPT_MAX_CHARS).trim();
  let shortcut: Awaited<ReturnType<typeof loadShortcuts>>[number] | undefined;
  try {
    // A direct prompt takes precedence over a shortcut, as in scheduledTaskManagedPrompt.
    if (!directPrompt && task.shortcutId) {
      shortcut = (await loadShortcuts()).find((candidate) => candidate.id === task.shortcutId);
    }
  } catch {
    throw new ScheduledTaskSourceUnavailableError('The scheduled shortcut could not be read.');
  }
  const storedPolicy = await loadScheduledSitePolicyInput();
  const policy = storedPolicy
    ? {
        ...storedPolicy,
        userAllowlist: [...storedPolicy.userAllowlist, ...oneTimeGrantedOrigins()],
      }
    : null;
  const taskAuthority = scheduledSourceAuthority([task.createdByOrigin], policy);
  const authority = scheduledSourceAuthority(
    [task.createdByOrigin, shortcut?.createdByOrigin],
    policy,
  );
  if (authority === 'unavailable') {
    throw new ScheduledTaskSourceUnavailableError(
      'Scheduled source policy is temporarily unavailable.',
    );
  }
  if (authority === 'denied') {
    throw new ScheduledTaskSourceDeniedError(
      'A scheduled source is no longer approved.',
      taskAuthority === 'denied',
    );
  }
  if (directPrompt) return directPrompt;
  if (!shortcut) return undefined;
  try {
    const plan = planShortcutReplay(shortcut);
    return plan.kind === 'prompt'
      ? plan.prompt.slice(0, TASK_PROMPT_MAX_CHARS).trim() || undefined
      : undefined;
  } catch {
    throw new ScheduledTaskSourceUnavailableError('The scheduled shortcut is unreadable.');
  }
}

async function assertScheduledJournalSourceAuthority(
  journal: ScheduledTaskRunJournal,
): Promise<void> {
  let task: ScheduledTask | undefined;
  try {
    task = (await loadScheduledTasks()).find((candidate) => candidate.id === journal.taskId);
  } catch {
    throw new ScheduledTaskSourceUnavailableError(
      'Scheduled task storage is temporarily unavailable.',
    );
  }
  if (!task?.enabled || task.managedCloudAccountId !== journal.owner.accountId) {
    throw new ScheduledTaskSourceDeniedError('The scheduled task lost its authority.');
  }
  const prompt = await assertScheduledTaskSourceAuthority(task);
  if (prompt !== journal.prompt) {
    throw new ScheduledTaskSourceDeniedError('The scheduled prompt changed.');
  }
}

class ScheduledTaskRecoveryPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduledTaskRecoveryPendingError';
  }
}

class ScheduledTaskAuthorityError extends Error {
  constructor(
    message: string,
    readonly notifyCurrentUser = true,
  ) {
    super(message);
    this.name = 'ScheduledTaskAuthorityError';
  }
}

class ScheduledTaskCancelledError extends Error {
  constructor() {
    super('The scheduled task was disabled, deleted, or lost its account authority.');
    this.name = 'ScheduledTaskCancelledError';
  }
}

async function requireScheduledTaskCredential(
  task: ScheduledTask,
): Promise<NonNullable<Awaited<ReturnType<typeof getManagedCloudAuthContext>>>> {
  const credential = await getManagedCloudAuthContext();
  if (!credential) {
    throw new ScheduledTaskAuthorityError('No Managed Cloud account is signed in.');
  }
  if (isRetiredManagedCloudOwner(credential.owner)) {
    throw new ScheduledTaskAuthorityError('The Managed Cloud session changed before this run.');
  }
  if (!task.managedCloudAccountId) {
    throw new ScheduledTaskAuthorityError(
      'This legacy schedule is not bound to an account. Recreate it while signed in.',
    );
  }
  if (task.managedCloudAccountId !== credential.owner.accountId) {
    throw new ScheduledTaskAuthorityError(
      'This Managed Cloud schedule belongs to a different account.',
      false,
    );
  }
  return credential;
}

async function getExactManagedMutationCredential(
  requestedOwnerValue: unknown,
): Promise<NonNullable<Awaited<ReturnType<typeof getManagedCloudAuthContext>>> | null> {
  const requestedOwner = normalizeManagedCloudOwner(requestedOwnerValue);
  if (!requestedOwner || isRetiredManagedCloudOwner(requestedOwner)) return null;
  const credential = await getManagedCloudAuthContext();
  if (
    !credential ||
    isRetiredManagedCloudOwner(requestedOwner) ||
    isRetiredManagedCloudOwner(credential.owner) ||
    !sameManagedCloudOwner(requestedOwner, credential.owner)
  ) {
    return null;
  }
  return credential;
}

interface ScheduledTaskExecutionOutcome {
  result: unknown;
  answer: string;
  conversationId?: string;
  conversationOwner?: ManagedCloudOwner;
  journal: ScheduledTaskRunJournal;
}

function beginScheduledTaskHeartbeat(): () => void {
  const ping = (): void => {
    try {
      chrome.runtime.getPlatformInfo(() => {
        void chrome.runtime.lastError;
      });
    } catch {
      // A terminating worker will be recovered from its persisted journal.
    }
  };
  ping();
  const timer = setInterval(ping, SCHEDULED_HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
}

function createScheduledTaskRequestId(): string {
  return `agi.chrome.task.${crypto.randomUUID()}`;
}

function markScheduledTaskRequestAbandoned(requestId: string): void {
  abandonedScheduledTaskRequestIds.add(requestId);
  while (abandonedScheduledTaskRequestIds.size > 100) {
    const oldest = abandonedScheduledTaskRequestIds.values().next().value;
    if (typeof oldest !== 'string') break;
    abandonedScheduledTaskRequestIds.delete(oldest);
  }
}

function scheduledTaskError(
  code: Extract<ChromeManagedChatResult, { status: 'error' }>['code'],
  message: string,
): ChromeManagedChatResult {
  return { status: 'error', code, message };
}

function createJournalDelivery(
  initialJournal: ScheduledTaskRunJournal,
  state: { journal: ScheduledTaskRunJournal; answer: string },
): BackgroundChatDelivery | undefined {
  const delivery = createBackgroundChatDelivery(
    'task',
    initialJournal.taskId,
    initialJournal.taskName,
    initialJournal.prompt,
  );
  if (!delivery) return undefined;
  delivery.requestId = initialJournal.requestId;
  delivery.deliveryId = initialJournal.requestId;
  delivery.onDelivered = (answer) => {
    state.answer = answer;
  };
  delivery.onRouting = async (routing) => {
    const updated = await updateScheduledTaskRunJournal(
      state.journal.taskId,
      state.journal.requestId,
      { routing },
    );
    if (updated) state.journal = updated;
  };
  delivery.onRunReference = async (cloudRun) => {
    const updated = await updateScheduledTaskRunJournal(
      state.journal.taskId,
      state.journal.requestId,
      { cloudRun },
    );
    if (updated) state.journal = updated;
    const recovery = activeScheduledRecoveries.get(state.journal.requestId);
    if (recovery) recovery.cloudRun = { ...cloudRun };
  };
  return delivery;
}

async function resumeScheduledTaskJournal(
  state: { journal: ScheduledTaskRunJournal; answer: string },
  delivery: BackgroundChatDelivery,
  credential: { token: string; owner: ManagedCloudOwner },
  signal: AbortSignal,
  fetchImpl: ScheduledTaskFetch,
): Promise<unknown> {
  const cloudRun = state.journal.cloudRun;
  if (!cloudRun) return scheduledTaskError('server_error', 'The durable Cloud run is missing.');

  const transcript: string[] = [];
  const result = await resumeChromeManagedRun(
    { run: cloudRun, alreadyVisibleText: '', signal },
    {
      getAuthToken: async () => credential.token,
      fetchImpl,
      createClient: (token, capturingFetch) =>
        createManagedCloudAgentRunClient({
          baseUrl: FREE_TRIAL_GATEWAY,
          getAuthToken: async () => token,
          fetchImpl: capturingFetch ?? fetchImpl,
          decorateMutationHeaders: (headers) => ({
            ...headers,
            'X-Requested-With': 'XMLHttpRequest',
            ...platformRequestHeaders(),
          }),
        }),
      onText: (text) => {
        transcript.push(text);
      },
      onRunReference: delivery.onRunReference,
    },
  );
  const answer = transcript.join('');
  state.answer = answer;
  let deliveryFailure = false;
  if (answer.trim()) {
    const stored = await recordBackgroundChatResult(
      delivery,
      credential.owner,
      answer,
      state.journal.routing
        ? {
            selectedModel: 'auto',
            currentModelKey: state.journal.routing.modelKey,
            previousTaskType: state.journal.routing.taskType,
            ...(state.journal.routing.effort ? { effort: state.journal.routing.effort } : {}),
          }
        : undefined,
      state.journal.routing?.answeredModel,
    );
    deliveryFailure = !stored;
  }
  if (result.status === 'error' && result.code === 'auth_required') {
    await invalidateRejectedManagedCloudCredential(credential);
  }
  if (deliveryFailure) {
    return scheduledTaskError('server_error', 'The recovered answer could not be proven durable.');
  }
  const terminalState = state.journal.cloudRun?.state;
  if (result.status === 'success' && terminalState === 'awaiting_input') {
    return scheduledTaskError(
      'invalid_request',
      'The scheduled AGI Cloud run requires input and cannot finish unattended.',
    );
  }
  if (result.status === 'success' && terminalState === 'paused') {
    return scheduledTaskError('invalid_request', 'The scheduled AGI Cloud run is paused.');
  }
  return result;
}

function cancelledScheduledTaskOutcome(
  journal: ScheduledTaskRunJournal,
  message: string,
): ScheduledTaskExecutionOutcome {
  return {
    result: scheduledTaskError('cancelled', message),
    answer: '',
    journal,
  };
}

async function executeScheduledTaskJournal(
  initialJournal: ScheduledTaskRunJournal,
  credential: { token: string; owner: ManagedCloudOwner },
  recover: boolean,
  admissionSignal?: AbortSignal,
): Promise<ScheduledTaskExecutionOutcome> {
  if (!recover) {
    return executeScheduledTaskJournalWithAuthority(
      initialJournal,
      credential,
      false,
      admissionSignal,
    );
  }
  if (isRetiredManagedCloudOwner(credential.owner)) {
    return cancelledScheduledTaskOutcome(
      initialJournal,
      'The scheduled task lost account authority.',
    );
  }

  const registeredRecovery = activeScheduledRecoveries.get(initialJournal.requestId);
  if (
    registeredRecovery &&
    (!sameManagedCloudOwner(registeredRecovery.owner, credential.owner) ||
      registeredRecovery.token !== credential.token)
  ) {
    return cancelledScheduledTaskOutcome(
      initialJournal,
      'The scheduled task recovery credential changed.',
    );
  }
  const recoveryGate: ActiveScheduledRecovery = registeredRecovery ?? {
    taskId: initialJournal.taskId,
    requestId: initialJournal.requestId,
    owner: credential.owner,
    token: credential.token,
    controller: new AbortController(),
    ...(initialJournal.cloudRun ? { cloudRun: initialJournal.cloudRun } : {}),
  };
  const abortForAdmission = (): void => recoveryGate.controller.abort();
  const linkAdmission = admissionSignal && admissionSignal !== recoveryGate.controller.signal;
  if (linkAdmission) admissionSignal.addEventListener('abort', abortForAdmission, { once: true });
  if (admissionSignal?.aborted) recoveryGate.controller.abort();
  if (!registeredRecovery) {
    activeScheduledRecoveries.set(initialJournal.requestId, recoveryGate);
  }

  try {
    if (recoveryGate.controller.signal.aborted || isRetiredManagedCloudOwner(credential.owner)) {
      return cancelledScheduledTaskOutcome(
        initialJournal,
        'The scheduled task lost account authority.',
      );
    }
    return await executeScheduledTaskJournalWithAuthority(
      initialJournal,
      credential,
      true,
      recoveryGate.controller.signal,
    );
  } finally {
    if (linkAdmission) admissionSignal.removeEventListener('abort', abortForAdmission);
    if (
      !registeredRecovery &&
      activeScheduledRecoveries.get(initialJournal.requestId) === recoveryGate
    ) {
      activeScheduledRecoveries.delete(initialJournal.requestId);
    }
  }
}

async function executeScheduledTaskJournalWithAuthority(
  initialJournal: ScheduledTaskRunJournal,
  credential: { token: string; owner: ManagedCloudOwner },
  recover: boolean,
  admissionSignal?: AbortSignal,
): Promise<ScheduledTaskExecutionOutcome> {
  let recoveryAttemptRecorded = false;
  let executionStarted = false;
  try {
    return await executeScheduledTaskJournalWithSourceAuthority(
      initialJournal,
      credential,
      recover,
      admissionSignal,
      () => {
        recoveryAttemptRecorded = true;
      },
      () => {
        executionStarted = true;
      },
    );
  } catch (caught) {
    const error = caught instanceof ScheduledTaskTransportControl ? caught.original : caught;
    if (
      error instanceof ScheduledTaskSourceUnavailableError &&
      recoveryAttemptRecorded &&
      !executionStarted
    ) {
      // Never restore a newer attempt, cancellation, or an execution already started.
      await restoreDeferredScheduledRecoveryAttempt(
        initialJournal,
        () => !admissionSignal?.aborted,
      ).catch((restoreError) => {
        logger.warn('Could not restore deferred scheduled recovery budget', restoreError);
      });
    }
    throw error;
  }
}

async function executeScheduledTaskJournalWithSourceAuthority(
  initialJournal: ScheduledTaskRunJournal,
  credential: { token: string; owner: ManagedCloudOwner },
  recover: boolean,
  admissionSignal: AbortSignal | undefined,
  onRecoveryAttempt: () => void,
  onExecutionStarted: () => void,
): Promise<ScheduledTaskExecutionOutcome> {
  await assertScheduledJournalSourceAuthority(initialJournal);
  const state = { journal: initialJournal, answer: '' };
  const assertCurrent = (): void => {
    if (
      admissionSignal?.aborted ||
      isRetiredManagedCloudOwner(credential.owner) ||
      state.journal.cancellationPending ||
      abandonedScheduledTaskRequestIds.has(state.journal.requestId)
    ) {
      throw new ScheduledTaskCancelledError();
    }
  };
  const transport = createScheduledTaskTransport(
    async () => {
      assertCurrent();
      await assertScheduledJournalSourceAuthority(state.journal);
      const current = await getManagedCloudAuthContext();
      assertCurrent();
      if (!current) {
        throw new ScheduledTaskSourceUnavailableError(
          'The scheduled account could not be verified.',
        );
      }
      if (!sameManagedCloudOwner(current.owner, credential.owner)) {
        throw new ScheduledTaskSourceDeniedError('The scheduled account changed before transport.');
      }
    },
    onExecutionStarted,
    assertCurrent,
  );
  const delivery = createJournalDelivery(initialJournal, state);
  if (!delivery) {
    return {
      result: scheduledTaskError('invalid_request', 'The scheduled task identity is invalid.'),
      answer: '',
      journal: state.journal,
    };
  }
  if (abandonedScheduledTaskRequestIds.has(state.journal.requestId)) {
    return {
      result: scheduledTaskError('cancelled', 'The scheduled task was disabled or deleted.'),
      answer: '',
      journal: state.journal,
    };
  }
  if (admissionSignal?.aborted || state.journal.cancellationPending) {
    return {
      result: scheduledTaskError('cancelled', 'The scheduled task was disabled or deleted.'),
      answer: '',
      journal: state.journal,
    };
  }

  if (recover) {
    const updated = await updateScheduledTaskRunJournal(
      state.journal.taskId,
      state.journal.requestId,
      { recoveryAttempts: state.journal.recoveryAttempts + 1 },
    );
    if (updated) {
      state.journal = updated;
      onRecoveryAttempt();
    }
    if (admissionSignal?.aborted) {
      return {
        result: scheduledTaskError('cancelled', 'The scheduled task lost account authority.'),
        answer: '',
        journal: state.journal,
      };
    }
    if (!state.journal.cloudRun) {
      await assertScheduledJournalSourceAuthority(state.journal);
      if (admissionSignal?.aborted) throw new ScheduledTaskCancelledError();
      const recoveredRun = await findChromeManagedRunByRequestId(
        state.journal.requestId,
        {
          getAuthToken: async () => credential.token,
          createClient: (token) =>
            createManagedCloudAgentRunClient({
              baseUrl: FREE_TRIAL_GATEWAY,
              getAuthToken: async () => token,
              fetchImpl: transport.fetch,
              decorateMutationHeaders: (headers) => ({
                ...headers,
                'X-Requested-With': 'XMLHttpRequest',
                ...platformRequestHeaders(),
              }),
            }),
        },
        admissionSignal,
      );
      if (admissionSignal?.aborted) {
        return {
          result: scheduledTaskError('cancelled', 'The scheduled task lost account authority.'),
          answer: '',
          journal: state.journal,
        };
      }
      if (recoveredRun) await delivery.onRunReference?.(recoveredRun);
      if (admissionSignal?.aborted) {
        return {
          result: scheduledTaskError('cancelled', 'The scheduled task lost account authority.'),
          answer: '',
          journal: state.journal,
        };
      }
    }
  }

  const resumeDurableRun = async (): Promise<unknown> => {
    const registeredRecovery = activeScheduledRecoveries.get(state.journal.requestId);
    const controller = registeredRecovery?.controller ?? new AbortController();
    const recovery: ActiveScheduledRecovery =
      registeredRecovery ??
      ({
        taskId: state.journal.taskId,
        requestId: state.journal.requestId,
        owner: state.journal.owner,
        token: credential.token,
        controller,
        ...(state.journal.cloudRun ? { cloudRun: state.journal.cloudRun } : {}),
      } satisfies ActiveScheduledRecovery);
    const abortForAdmission = (): void => controller.abort();
    const linkAdmission = admissionSignal && admissionSignal !== controller.signal;
    if (linkAdmission) admissionSignal.addEventListener('abort', abortForAdmission, { once: true });
    if (admissionSignal?.aborted) controller.abort();
    if (!registeredRecovery) activeScheduledRecoveries.set(state.journal.requestId, recovery);
    try {
      await assertScheduledJournalSourceAuthority(state.journal);
      if (controller.signal.aborted) throw new ScheduledTaskCancelledError();
      return await resumeScheduledTaskJournal(
        state,
        delivery,
        credential,
        controller.signal,
        transport.fetch,
      );
    } finally {
      if (linkAdmission) admissionSignal.removeEventListener('abort', abortForAdmission);
      if (
        !registeredRecovery &&
        activeScheduledRecoveries.get(state.journal.requestId) === recovery
      ) {
        activeScheduledRecoveries.delete(state.journal.requestId);
      }
    }
  };

  let result: unknown;
  if (state.journal.cloudRun) {
    result = await resumeDurableRun();
  } else {
    if (abandonedScheduledTaskRequestIds.has(state.journal.requestId)) {
      result = scheduledTaskError('cancelled', 'The scheduled task was disabled or deleted.');
      return {
        result,
        answer: state.answer,
        conversationId: delivery.conversationId,
        conversationOwner: credential.owner,
        journal: state.journal,
      };
    }
    if (state.journal.dispatchStartedAt === undefined) {
      const updated = await updateScheduledTaskRunJournal(
        state.journal.taskId,
        state.journal.requestId,
        { dispatchStartedAt: Date.now() },
      );
      if (!updated) {
        return {
          result: scheduledTaskError('cancelled', 'The scheduled task journal was retired.'),
          answer: state.answer,
          journal: state.journal,
        };
      }
      state.journal = updated;
    }
    if (
      admissionSignal?.aborted ||
      isRetiredManagedCloudOwner(credential.owner) ||
      state.journal.cancellationPending ||
      abandonedScheduledTaskRequestIds.has(state.journal.requestId)
    ) {
      return {
        result: scheduledTaskError('cancelled', 'The scheduled task lost account authority.'),
        answer: state.answer,
        conversationId: delivery.conversationId,
        conversationOwner: credential.owner,
        journal: state.journal,
      };
    }
    await assertScheduledJournalSourceAuthority(state.journal);
    if (admissionSignal?.aborted) throw new ScheduledTaskCancelledError();
    result = await handleChatMessage(
      {
        type: 'CHAT_MESSAGE',
        clientInstanceId: SCHEDULED_TASK_CLIENT_ID,
        id: `task_${crypto.randomUUID()}`,
        text: state.journal.prompt,
        timestamp: Date.now(),
        modelSelection: state.journal.routing?.modelKey ?? 'auto',
        effort: state.journal.routing?.effort,
        currentModelKey: state.journal.routing?.modelKey,
        previousTaskType: state.journal.routing?.taskType,
        owner: state.journal.owner,
      },
      { id: chrome.runtime.id },
      delivery,
      admissionSignal,
      transport,
    );
    if (
      result &&
      typeof result === 'object' &&
      (result as { status?: unknown }).status !== 'success' &&
      isRetryableScheduledResult(result) &&
      state.journal.cloudRun &&
      !abandonedScheduledTaskRequestIds.has(state.journal.requestId)
    ) {
      result = await resumeDurableRun();
    }
  }

  return {
    result,
    answer: state.answer,
    conversationId: delivery.conversationId,
    conversationOwner: credential.owner,
    journal: state.journal,
  };
}

function isRetryableScheduledResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return true;
  const record = result as Record<string, unknown>;
  return (
    record['status'] !== 'success' &&
    (record['code'] === 'server_error' || record['code'] === 'auth_required')
  );
}

interface ScheduledTaskCompletionNotice {
  taskName: string;
  answer?: string;
  conversationId?: string;
  conversationOwner?: ManagedCloudOwner;
  runOwner?: ManagedCloudOwner;
  signal?: AbortSignal;
}

async function notifyScheduledTaskCompleted(notice: ScheduledTaskCompletionNotice): Promise<void> {
  const { taskName, answer = '', conversationId, conversationOwner } = notice;
  const fenceOwner = notice.runOwner ?? conversationOwner;
  await publishAuthorizedScheduledTaskNotification(
    {
      ...(fenceOwner ? { owner: fenceOwner } : {}),
      ...(notice.signal ? { signal: notice.signal } : {}),
    },
    {
      isEnabled: taskNotificationsEnabled,
      isOwnerRetired: isRetiredManagedCloudOwner,
      publish: () => {
        const snippet = notificationSnippet(answer);
        showNotification(
          'Task Completed',
          snippet ? `"${taskName}": ${snippet}` : `Scheduled task "${taskName}" finished`,
          answer ? conversationId : undefined,
          answer ? conversationOwner : undefined,
        );
      },
    },
  );
}

async function notifyScheduledTaskFailed(
  taskName: string,
  detail: string,
  owner: ManagedCloudOwner | undefined,
  signal: AbortSignal | undefined,
  schedule: { managedCloudAccountId?: string },
): Promise<void> {
  await publishAuthorizedScheduledTaskNotification(
    scheduledTaskNotificationAuthority({ schedule, resolvedOwner: owner, signal }),
    {
      isEnabled: taskNotificationsEnabled,
      isOwnerRetired: isRetiredManagedCloudOwner,
      publish: () =>
        showNotification('Task Failed', `Scheduled task "${taskName}" failed: ${detail}`),
    },
  );
}

async function completeScheduledTaskRun(
  taskId: string,
  taskName: string,
  outcome: ScheduledTaskExecutionOutcome,
  signal?: AbortSignal,
): Promise<void> {
  const lostAuthority = (): boolean =>
    Boolean(signal?.aborted) ||
    isRetiredManagedCloudOwner(outcome.journal.owner) ||
    abandonedScheduledTaskRequestIds.has(outcome.journal.requestId);
  if (lostAuthority()) return;
  const recorded = await recordScheduledTaskRun(taskId, Date.now(), () => !lostAuthority());
  if (!recorded) return;
  if (lostAuthority()) return;
  const latest = (await loadScheduledTaskRunJournals()).find(
    (journal) => journal.taskId === taskId && journal.requestId === outcome.journal.requestId,
  );
  if (lostAuthority() || latest?.cancellationPending) return;
  await removeScheduledTaskRunJournal(taskId, outcome.journal.requestId);
  if (lostAuthority()) return;
  await notifyScheduledTaskCompleted({
    taskName,
    answer: outcome.answer,
    ...(outcome.conversationId !== undefined ? { conversationId: outcome.conversationId } : {}),
    ...(outcome.conversationOwner ? { conversationOwner: outcome.conversationOwner } : {}),
    runOwner: outcome.journal.owner,
    ...(signal ? { signal } : {}),
  });
}

function abandonScheduledTaskRun(
  journal: ScheduledTaskRunJournal,
  currentCredential?: { token: string; owner: ManagedCloudOwner } | null,
  knownRun?: ManagedCloudAgentRunReference,
): Promise<boolean> {
  markScheduledTaskRequestAbandoned(journal.requestId);
  let cancellationCredential = selectScheduledTaskCancellationCredential(
    journal.owner,
    null,
    currentCredential,
  );
  const recovery = activeScheduledRecoveries.get(journal.requestId);
  recovery?.controller.abort();
  if (recovery) {
    activeScheduledRecoveries.delete(journal.requestId);
    cancellationCredential = selectScheduledTaskCancellationCredential(
      journal.owner,
      { token: recovery.token, owner: recovery.owner },
      cancellationCredential,
    );
    knownRun ??= recovery.cloudRun;
  }
  for (const [streamKey, active] of activeChatStreams) {
    if (active.requestId !== journal.requestId) continue;
    active.cancelRequested = true;
    active.controller.abort();
    activeChatStreams.delete(streamKey);
    cancellationCredential = selectScheduledTaskCancellationCredential(
      journal.owner,
      { token: active.token, owner: active.owner },
      cancellationCredential,
    );
    knownRun ??= active.cloudRun;
  }
  return scheduledTaskCancellationAttempts.run(
    journal.requestId,
    { hasCredential: Boolean(cancellationCredential), hasKnownRun: Boolean(knownRun) },
    () => requestScheduledTaskCancellation(journal, cancellationCredential, knownRun),
  );
}

async function recoverScheduledTaskRun(
  journal: ScheduledTaskRunJournal,
  expectedGeneration: number,
): Promise<void> {
  if (journal.cancellationPending) {
    const credential = await getManagedCloudAuthContext();
    if (
      credential?.owner.accountId === journal.owner.accountId &&
      isScheduledCancellationRetryDue(journal)
    ) {
      await abandonScheduledTaskRun(journal, credential);
    }
    return;
  }
  const lease = scheduledTaskExecutions.begin(journal.taskId, expectedGeneration);
  if (!lease) return;
  const credential = await getManagedCloudAuthContext();
  if (!credential) {
    scheduledTaskExecutions.end(lease);
    return;
  }
  if (isRetiredManagedCloudOwner(credential.owner)) {
    await abandonScheduledTaskRun(journal, credential);
    scheduledTaskExecutions.end(lease);
    return;
  }
  if (!sameManagedCloudOwner(journal.owner, credential.owner)) {
    await abandonScheduledTaskRun(
      journal,
      journal.owner.accountId === credential.owner.accountId ? credential : null,
    );
    scheduledTaskExecutions.end(lease);
    return;
  }

  const recoveryGate: ActiveScheduledRecovery = {
    taskId: journal.taskId,
    requestId: journal.requestId,
    owner: journal.owner,
    token: credential.token,
    controller: new AbortController(),
    ...(journal.cloudRun ? { cloudRun: journal.cloudRun } : {}),
  };
  const abortForTaskMutation = (): void => recoveryGate.controller.abort();
  lease.controller.signal.addEventListener('abort', abortForTaskMutation, { once: true });
  if (lease.controller.signal.aborted) recoveryGate.controller.abort();
  activeScheduledRecoveries.set(journal.requestId, recoveryGate);
  const endHeartbeat = beginScheduledTaskHeartbeat();
  try {
    const outcome = await executeScheduledTaskJournal(
      journal,
      credential,
      true,
      recoveryGate.controller.signal,
    );
    if (
      recoveryGate.controller.signal.aborted ||
      isRetiredManagedCloudOwner(credential.owner) ||
      abandonedScheduledTaskRequestIds.has(outcome.journal.requestId)
    ) {
      return;
    }
    if (
      outcome.result &&
      typeof outcome.result === 'object' &&
      (outcome.result as { status?: unknown }).status === 'success'
    ) {
      await completeScheduledTaskRun(
        journal.taskId,
        journal.taskName,
        outcome,
        recoveryGate.controller.signal,
      );
      return;
    }
    if (
      isRetryableScheduledResult(outcome.result) &&
      outcome.journal.recoveryAttempts < SCHEDULED_RECOVERY_MAX_ATTEMPTS
    ) {
      logger.warn('Scheduled Managed Cloud run remains pending recovery', {
        taskId: journal.taskId,
        attempt: outcome.journal.recoveryAttempts,
      });
      return;
    }
    await abandonScheduledTaskRun(outcome.journal, credential);
    assertScheduledExecutionSucceeded(outcome.result);
  } catch (error) {
    if (error instanceof ScheduledTaskSourceUnavailableError) return;
    if (error instanceof ScheduledTaskSourceDeniedError) {
      await abandonScheduledTaskRun(journal, credential);
      return;
    }
    if (
      recoveryGate.controller.signal.aborted ||
      abandonedScheduledTaskRequestIds.has(journal.requestId)
    ) {
      return;
    }
    const latest = (await loadScheduledTaskRunJournals()).find(
      (candidate) =>
        candidate.taskId === journal.taskId && candidate.requestId === journal.requestId,
    );
    if (latest && latest.recoveryAttempts < SCHEDULED_RECOVERY_MAX_ATTEMPTS) {
      logger.warn('Scheduled Managed Cloud recovery attempt failed', {
        taskId: journal.taskId,
        attempt: latest.recoveryAttempts,
        error,
      });
      return;
    }
    await abandonScheduledTaskRun(latest ?? journal, credential);
    const detail = error instanceof Error ? error.message.slice(0, 160) : 'Unknown error';
    await notifyScheduledTaskFailed(
      journal.taskName,
      `could not be recovered: ${detail}`,
      journal.owner,
      lease.controller.signal,
      {},
    );
  } finally {
    endHeartbeat();
    lease.controller.signal.removeEventListener('abort', abortForTaskMutation);
    if (activeScheduledRecoveries.get(journal.requestId) === recoveryGate) {
      activeScheduledRecoveries.delete(journal.requestId);
    }
    scheduledTaskExecutions.end(lease);
  }
}

const MAINTENANCE_ALARM = 'agi-maintenance';
const MAINTENANCE_PERIOD_MINUTES = 1;

/**
 * Alarms earlier versions registered unconditionally. Chrome keeps an alarm
 * across worker restarts and browser restarts, so an upgraded install would go
 * on firing them at a handler that no longer exists unless they are cleared.
 */
const RETIRED_ALARM_NAMES = ['keep-alive', SYNC_SWEEP_ALARM];

const maintenanceAlarm = createMaintenanceAlarmController({
  periodInMinutes: MAINTENANCE_PERIOD_MINUTES,
  read: () => chrome.alarms.get(MAINTENANCE_ALARM),
  create: () =>
    new Promise<void>((resolve, reject) => {
      chrome.alarms.create(
        MAINTENANCE_ALARM,
        { periodInMinutes: MAINTENANCE_PERIOD_MINUTES },
        () => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message ?? 'Failed to create maintenance alarm'));
          else resolve();
        },
      );
    }),
  clear: async () => {
    await chrome.alarms.clear(MAINTENANCE_ALARM);
  },
  runPass: runMaintenancePass,
  onError: (error) => logger.warn('Maintenance alarm reconciliation failed', error),
});

function armMaintenanceAlarm(): void {
  maintenanceAlarm.requestWork();
}

let maintenanceObservedOwner: ManagedCloudOwner | null = null;

function observeMaintenanceOwner(owner: ManagedCloudOwner | null): void {
  const changed = owner !== null && !sameManagedCloudOwner(maintenanceObservedOwner, owner);
  maintenanceObservedOwner = owner ? { ...owner } : null;
  if (changed) armMaintenanceAlarm();
}

/**
 * One maintenance pass: retry interrupted scheduled runs, mirror any
 * conversation still owing a sync, and resume native reconnection.
 *
 * @returns whether anything is still outstanding. This is what decides if the
 *   worker gets woken again, the two unconditional one-minute alarms this
 *   replaced woke it every minute for the life of the browser, with no panel
 *   open, no run active, and usually nothing to do.
 */
async function runMaintenancePass(): Promise<boolean> {
  let outstanding = false;

  try {
    await recoverScheduledTaskRuns();
    outstanding = (await loadScheduledTaskRunJournals()).length > 0;
  } catch (error) {
    logger.warn('Failed to retry scheduled Managed Cloud recovery', error);
    outstanding = true;
  }

  try {
    if (
      await sweepConversationSync(() => {
        // Auth can be temporarily unavailable without a sign-out event. Let a
        // later successful token read wake the same owner again, without polling.
        maintenanceObservedOwner = null;
      })
    )
      outstanding = true;
  } catch (error) {
    logger.debug('Conversation sync sweep failed', error);
    outstanding = true;
  }

  if (!state.isNativeConnected && (await shouldAutoConnectToDesktop())) {
    connectToNativeHost();
    outstanding = true;
  }
  await settleOwedDesktopRevocation();

  return outstanding;
}

async function settleMaintenanceAlarm(): Promise<void> {
  await maintenanceAlarm.settle();
}

async function recoverScheduledTaskRuns(): Promise<void> {
  const journals = await loadScheduledTaskRunJournals();
  if (journals.length === 0) return;
  const expectedGenerations = new Map(
    journals.map((journal) => [journal.taskId, scheduledTaskExecutions.generation(journal.taskId)]),
  );
  const tasks = await loadScheduledTasks();
  const credential = await getManagedCloudAuthContext();
  for (const journal of journals) {
    if (journal.cancellationPending) {
      if (
        credential?.owner.accountId === journal.owner.accountId &&
        isScheduledCancellationRetryDue(journal)
      ) {
        await abandonScheduledTaskRun(journal, credential);
      }
      continue;
    }
    const task = tasks.find((candidate) => candidate.id === journal.taskId);
    let managedPrompt: string | undefined;
    try {
      if (task) managedPrompt = await assertScheduledTaskSourceAuthority(task);
    } catch (error) {
      if (error instanceof ScheduledTaskSourceDeniedError) {
        await abandonScheduledTaskRun(journal, credential);
      } else if (!(error instanceof ScheduledTaskSourceUnavailableError)) {
        throw error;
      }
      continue;
    }
    const expectedPrompt = managedPrompt?.slice(0, TASK_PROMPT_MAX_CHARS).trim();
    if (
      !task?.enabled ||
      task.managedCloudAccountId !== journal.owner.accountId ||
      !expectedPrompt ||
      expectedPrompt !== journal.prompt
    ) {
      await abandonScheduledTaskRun(journal, credential);
      continue;
    }
    await recoverScheduledTaskRun(
      journal,
      expectedGenerations.get(journal.taskId) ?? scheduledTaskExecutions.generation(journal.taskId),
    );
  }
}

async function runScheduledManagedPrompt(
  task: ScheduledTask,
  safePrompt: string,
  signal: AbortSignal,
  credential: NonNullable<Awaited<ReturnType<typeof getManagedCloudAuthContext>>>,
): Promise<ScheduledTaskExecutionOutcome> {
  if (signal.aborted) throw new ScheduledTaskCancelledError();
  if (isRetiredManagedCloudOwner(credential.owner)) throw new ScheduledTaskCancelledError();
  const existing = (await loadScheduledTaskRunJournals()).find(
    (candidate) => candidate.taskId === task.id,
  );
  let journal: ScheduledTaskRunJournal;
  let recover = false;
  let journalWasCreated = false;
  if (existing && canResumeScheduledTaskRunJournal(existing, credential.owner, safePrompt)) {
    journal = existing;
    recover = true;
  } else {
    if (existing) {
      if (existing.owner.accountId !== credential.owner.accountId) {
        throw new ScheduledTaskAuthorityError(
          'A different account owns the interrupted scheduled run.',
          false,
        );
      }
      const cancelled = await abandonScheduledTaskRun(existing, credential);
      if (!cancelled) {
        throw new ScheduledTaskRecoveryPendingError(
          'The prior Managed Cloud run is still being cancelled.',
        );
      }
    }
    const started = await beginScheduledTaskRunJournal({
      taskId: task.id,
      taskName: task.name,
      prompt: safePrompt,
      requestId: createScheduledTaskRequestId(),
      owner: credential.owner,
    });
    journal = started.journal;
    journalWasCreated = started.created;
    if (!started.created) {
      if (signal.aborted) throw new ScheduledTaskCancelledError();
      if (canResumeScheduledTaskRunJournal(journal, credential.owner, safePrompt)) {
        recover = true;
      } else {
        if (journal.owner.accountId !== credential.owner.accountId) {
          throw new ScheduledTaskAuthorityError(
            'A different account owns the interrupted scheduled run.',
            false,
          );
        }
        await abandonScheduledTaskRun(journal, credential);
        throw new ScheduledTaskRecoveryPendingError(
          'A superseded Managed Cloud run is being cancelled before this schedule can continue.',
        );
      }
    }
  }
  if (signal.aborted) {
    if (journalWasCreated) await abandonScheduledTaskRun(journal, credential);
    throw new ScheduledTaskCancelledError();
  }
  return executeScheduledTaskJournal(journal, credential, recover, signal);
}

async function finishScheduledManagedPrompt(
  task: ScheduledTask,
  outcome: ScheduledTaskExecutionOutcome,
  lease: ScheduledTaskExecutionLease,
): Promise<void> {
  if (
    lease.controller.signal.aborted ||
    !scheduledTaskExecutions.isCurrent(lease) ||
    abandonedScheduledTaskRequestIds.has(outcome.journal.requestId) ||
    outcome.journal.cancellationPending
  ) {
    throw new ScheduledTaskCancelledError();
  }
  if (
    isRetryableScheduledResult(outcome.result) &&
    outcome.journal.recoveryAttempts < SCHEDULED_RECOVERY_MAX_ATTEMPTS
  ) {
    throw new ScheduledTaskRecoveryPendingError(
      'The Managed Cloud run was interrupted and will resume automatically.',
    );
  }
  if (
    !outcome.result ||
    typeof outcome.result !== 'object' ||
    (outcome.result as { status?: unknown }).status !== 'success'
  ) {
    await abandonScheduledTaskRun(outcome.journal, await getManagedCloudAuthContext());
  }
  assertScheduledExecutionSucceeded(outcome.result);
  if (lease.controller.signal.aborted || !scheduledTaskExecutions.isCurrent(lease)) {
    throw new ScheduledTaskCancelledError();
  }
  await completeScheduledTaskRun(task.id, task.name, outcome, lease.controller.signal);
}

async function executeScheduledTask(
  task: ScheduledTask,
  expectedGeneration: number,
): Promise<void> {
  const lease = scheduledTaskExecutions.begin(task.id, expectedGeneration);
  if (!lease) {
    logger.info('Skipping overlapping scheduled task invocation', { taskId: task.id });
    return;
  }
  const endHeartbeat = beginScheduledTaskHeartbeat();
  let managedExecutionOwner: ManagedCloudOwner | undefined;

  logger.info('Executing scheduled task', { id: task.id, name: task.name });

  try {
    try {
      await assertScheduledTaskSourceAuthority(task);
    } catch (error) {
      if (!(error instanceof ScheduledTaskSourceDeniedError) || !error.taskOriginDenied)
        throw error;
      if (lease.controller.signal.aborted || !scheduledTaskExecutions.isCurrent(lease)) return;
      logger.warn('Auto-deleting scheduled task whose origin is no longer allowlisted', {
        taskId: task.id,
        createdByOrigin: task.createdByOrigin,
      });
      let deletionGeneration: number | undefined;
      const deletion = await handleDeleteScheduledTask(
        {
          type: 'DELETE_SCHEDULED_TASK',
          taskId: task.id,
        } as DeleteScheduledTaskMessage,
        task.managedCloudAccountId,
        () => {
          deletionGeneration = scheduledTaskExecutions.invalidate(task.id);
        },
        (current) =>
          current.createdByOrigin === task.createdByOrigin &&
          current.prompt === task.prompt &&
          current.shortcutId === task.shortcutId &&
          (deletionGeneration === undefined
            ? scheduledTaskExecutions.isCurrent(lease)
            : scheduledTaskExecutions.generation(task.id) === deletionGeneration),
      );
      if (!deletion.success || deletionGeneration === undefined) return;
      const journal = (await loadScheduledTaskRunJournals()).find(
        (candidate) => candidate.taskId === task.id,
      );
      const credential = await getManagedCloudAuthContext();
      if (scheduledTaskExecutions.generation(task.id) !== deletionGeneration) return;
      if (journal) await abandonScheduledTaskRun(journal, credential);
      return;
    }

    if (lease.controller.signal.aborted || !scheduledTaskExecutions.isCurrent(lease)) {
      throw new ScheduledTaskCancelledError();
    }
    let managedCredential:
      NonNullable<Awaited<ReturnType<typeof getManagedCloudAuthContext>>> | undefined;
    if (task.managedCloudAccountId !== undefined) {
      managedCredential = await requireScheduledTaskCredential(task);
      managedExecutionOwner = managedCredential.owner;
    }
    const managedPrompt = await scheduledTaskManagedPrompt(task);
    const hasManagedBoundary =
      task.managedCloudAccountId !== undefined || managedPrompt !== undefined;
    if (hasManagedBoundary) {
      const credential = managedCredential ?? (await requireScheduledTaskCredential(task));
      managedExecutionOwner = credential.owner;
      if (!managedPrompt) {
        throw new Error('The Managed Cloud prompt is unavailable.');
      }
      if (
        lease.controller.signal.aborted ||
        !scheduledTaskExecutions.isCurrent(lease) ||
        isRetiredManagedCloudOwner(credential.owner)
      ) {
        throw new ScheduledTaskCancelledError();
      }
      await notifyScheduledTaskRunning(task.name, lease.controller.signal, credential.owner);
      if (
        lease.controller.signal.aborted ||
        !scheduledTaskExecutions.isCurrent(lease) ||
        isRetiredManagedCloudOwner(credential.owner)
      ) {
        throw new ScheduledTaskCancelledError();
      }
      const outcome = await dispatchScheduledPrompt(
        { ...task, prompt: managedPrompt },
        (safePrompt) =>
          runScheduledManagedPrompt(task, safePrompt, lease.controller.signal, credential),
      );
      if (!outcome) throw new Error('The scheduled prompt is empty.');
      await finishScheduledManagedPrompt(task, outcome, lease);
      return;
    }

    await notifyScheduledTaskRunning(task.name, lease.controller.signal);
    if (lease.controller.signal.aborted || !scheduledTaskExecutions.isCurrent(lease)) {
      throw new ScheduledTaskCancelledError();
    }
    let result: unknown;
    if (task.shortcutId) {
      result = await replayScheduledShortcut(task, {
        isCurrent: () => scheduledTaskExecutions.isCurrent(lease),
        loadShortcuts,
        queryActiveTab: async () =>
          (await chrome.tabs.query({ active: true, currentWindow: true }))[0],
        getTab: (tabId) => chrome.tabs.get(tabId),
        loadPolicy: loadScheduledSitePolicyInput,
        liveGrantedOrigins: oneTimeGrantedOrigins,
        forward: forwardToContentScript,
      });
    }

    assertScheduledExecutionSucceeded(result);
    const recorded = await recordScheduledTaskRun(task.id, Date.now(), () =>
      scheduledTaskExecutions.isCurrent(lease),
    );
    if (!recorded) throw new ScheduledTaskCancelledError();
    await notifyScheduledTaskCompleted({
      taskName: task.name,
      signal: lease.controller.signal,
    });
  } catch (error) {
    if (
      error instanceof ScheduledTaskSourceUnavailableError ||
      error instanceof ScheduledShortcutReplayDeferredError
    ) {
      logger.warn('Scheduled source authority could not be read; preserving work', {
        taskId: task.id,
      });
      return;
    }
    if (error instanceof ScheduledTaskSourceDeniedError) {
      if (lease.controller.signal.aborted || !scheduledTaskExecutions.isCurrent(lease)) return;
      const journal = (await loadScheduledTaskRunJournals()).find((run) => run.taskId === task.id);
      const credential = await getManagedCloudAuthContext();
      if (lease.controller.signal.aborted || !scheduledTaskExecutions.isCurrent(lease)) return;
      if (journal) await abandonScheduledTaskRun(journal, credential);
      return;
    }
    if (
      error instanceof ScheduledTaskCancelledError ||
      error instanceof ScheduledShortcutReplayCancelledError ||
      lease.controller.signal.aborted
    ) {
      logger.info('Scheduled task execution lost authority', { taskId: task.id });
      return;
    }
    if (error instanceof ScheduledTaskAuthorityError) {
      logger.warn(error.message, { taskId: task.id });
      if (error.notifyCurrentUser) {
        await publishAuthorizedScheduledTaskNotification(
          scheduledTaskNotificationAuthority({
            schedule: task,
            resolvedOwner: managedExecutionOwner,
            signal: lease.controller.signal,
          }),
          {
            isEnabled: taskNotificationsEnabled,
            isOwnerRetired: isRetiredManagedCloudOwner,
            publish: () =>
              showNotification(
                'Task Paused',
                'A Managed Cloud schedule needs its authorizing account before it can run.',
              ),
          },
        );
      }
      return;
    }
    if (error instanceof ScheduledTaskRecoveryPendingError) {
      logger.warn(error.message, { taskId: task.id });
      await publishAuthorizedScheduledTaskNotification(
        scheduledTaskNotificationAuthority({
          schedule: task,
          resolvedOwner: managedExecutionOwner,
          signal: lease.controller.signal,
        }),
        {
          isEnabled: taskNotificationsEnabled,
          isOwnerRetired: isRetiredManagedCloudOwner,
          publish: () =>
            showNotification(
              'Task Continuing',
              `Scheduled task "${task.name}" will resume shortly.`,
            ),
        },
      );
      return;
    }
    const detail = error instanceof Error ? error.message.slice(0, 160) : 'Unknown error';
    await notifyScheduledTaskFailed(
      task.name,
      detail,
      managedExecutionOwner,
      lease.controller.signal,
      task,
    );
    throw error;
  } finally {
    endHeartbeat();
    scheduledTaskExecutions.end(lease);
  }
}

// A tab-originated message is trusted only when its origin is on the user-managed
// allowlist in chrome.storage.local (agi_site_allowlist). The content script
// matches <all_urls>, so trusting any tab would hand every visited page the
// privileged commands. Extension pages stay trusted via the `!sender.tab` branch
// of isAllowlistedSender(). PING and GET_AGI_BRIDGE_URL are not discovery-bypass
// types: content scripts on arbitrary pages must not receive fingerprinting replies.
const SITE_NOT_APPROVED_MESSAGE =
  'This site is not on your AGI approved-sites list. ' +
  'Open the extension options and use the "Approved sites" section to add this origin, then reload.';

let siteAllowlistCache = new Set<string>();
let adminSitePolicyCache: SitePolicyAdminState = null;
let siteAllowlistLoaded = false;
const siteAllowlistPublication = createSitePolicyPublicationOwner();
const adminSitePolicyPublication = createSitePolicyPublicationOwner();
const startupSiteAllowlistOwner = siteAllowlistPublication.claim();
const startupAdminSitePolicyOwner = adminSitePolicyPublication.claim();
// Held rather than dropped: the message that wakes a dormant MV3 worker arrives
// before this read resolves, and a floating promise left that first message
// deciding against an empty set.
const siteAllowlistReady: Promise<void> = Promise.all([
  chrome.storage.local
    .get(SITE_ALLOWLIST_STORAGE_KEY)
    .then((res) => {
      const list = res[SITE_ALLOWLIST_STORAGE_KEY];
      if (Array.isArray(list)) {
        siteAllowlistPublication.publish(startupSiteAllowlistOwner, () => {
          siteAllowlistCache = new Set(list as string[]);
        });
      }
    })
    .catch(() => {}),
  readAdminSitePolicy()
    .then((policy) => {
      adminSitePolicyPublication.publish(startupAdminSitePolicyOwner, () => {
        adminSitePolicyCache = policy;
      });
    })
    .catch(() => {
      adminSitePolicyPublication.publish(startupAdminSitePolicyOwner, () => {
        adminSitePolicyCache = SITE_POLICY_ADMIN_UNAVAILABLE;
      });
    }),
])
  .then(() => undefined)
  .finally(() => {
    siteAllowlistLoaded = true;
  });

/**
 * The one approval question the worker asks. The user's allowlist grants, the
 * org's site policy can withhold, and a policy that cannot be read withholds
 * everything until it can.
 */
function isOriginApprovedForAutomation(origin: string): boolean {
  return evaluateSitePolicy(
    {
      admin: adminSitePolicyCache,
      userAllowlist: [...siteAllowlistCache, ...oneTimeGrantedOrigins()],
    },
    origin,
    'automation',
  ).allowed;
}

function cancelActiveRunUnlessOriginStillApproved(
  isStillApproved: (origin: string) => boolean,
): void {
  const lease = computerUseRuns.getActive();
  if (!lease) return;
  try {
    if (isStillApproved(new URL(lease.tabIntentUrl).origin)) return;
  } catch {
    // Invalid stored intent is handled by the same fail-closed cancellation.
  }
  computerUseStartGeneration += 1;
  cancelActiveComputerUseRun('site_access_withdrawn', lease.runId);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[SITE_ALLOWLIST_STORAGE_KEY]) return;
  siteAllowlistPublication.claim();
  const next = changes[SITE_ALLOWLIST_STORAGE_KEY].newValue;
  const previous = changes[SITE_ALLOWLIST_STORAGE_KEY].oldValue;
  siteAllowlistCache = new Set(Array.isArray(next) ? (next as string[]) : []);
  cancelActiveRunUnlessOriginStillApproved(isOriginApprovedForAutomation);
  const changed = changedOrigins(
    new Set(Array.isArray(previous) ? (previous as string[]) : []),
    siteAllowlistCache,
  );
  cancelInPagePromptsOnUnapprovedOrigins();
  void notifyPageAccessChanged((origin) => changed.has(origin));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[IN_PAGE_PANEL_ENABLED_STORAGE_KEY]) return;
  void siteAllowlistReady.then(() => notifyPageAccessChanged(isOriginApprovedForAutomation));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if ((area !== 'local' && area !== 'managed') || !changes[ADMIN_SITE_POLICY_STORAGE_KEY]) return;
  const owner = adminSitePolicyPublication.claim();
  void readAdminSitePolicy()
    .catch(() => SITE_POLICY_ADMIN_UNAVAILABLE as SitePolicyAdminState)
    .then((policy) => {
      adminSitePolicyPublication.publish(owner, () => {
        adminSitePolicyCache = policy;
        cancelActiveRunUnlessOriginStillApproved(isOriginApprovedForAutomation);
        cancelInPagePromptsOnUnapprovedOrigins();
        void notifyPageAccessChanged(() => true);
      });
    });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[BROWSER_CONTROL_CONSENT_STORAGE_KEY]) return;
  const consented = new Set(
    sanitizeBrowserControlConsent(changes[BROWSER_CONTROL_CONSENT_STORAGE_KEY].newValue),
  );
  cancelActiveRunUnlessOriginStillApproved((origin) => consented.has(origin));
});

let quickModeCache = false;
chrome.storage.local
  .get({ agi_quick_mode: false })
  .then((res) => {
    quickModeCache = res['agi_quick_mode'] === true;
  })
  .catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes['agi_quick_mode']) return;
  quickModeCache = changes['agi_quick_mode'].newValue === true;
});

function rejectComputerUseOwnership(
  lease: ComputerUseRunLease,
  reason: Extract<ComputerUseCancellationReason, 'account_changed' | 'tab_intent_changed'>,
): never {
  computerUseStartGeneration += 1;
  cancelActiveComputerUseRun(reason, lease.runId);
  const abortReason = lease.controller.signal.reason;
  if (abortReason instanceof Error) throw abortReason;
  throw new Error(`Computer-use ownership lost: ${reason}`);
}

async function readComputerUseAuthContext(lease: ComputerUseRunLease) {
  computerUseRuns.assertCurrent(lease);

  const context = await getManagedCloudAuthContext();
  computerUseRuns.assertCurrent(lease);
  if (
    !context ||
    isRetiredManagedCloudOwner(context.owner) ||
    !sameManagedCloudOwner(lease.authOwner, context.owner)
  ) {
    rejectComputerUseOwnership(lease, 'account_changed');
  }

  return context;
}

async function assertComputerUseOwnership(lease: ComputerUseRunLease): Promise<string> {
  let context = await readComputerUseAuthContext(lease);
  const targetTabId = lease.tabId;
  let tab: chrome.tabs.Tab;
  try {
    const snapshot = await readAuthorizedBrowserTab(targetTabId, {
      assertCurrent: () => {
        computerUseRuns.assertCurrent(lease);
        if (lease.tabId !== targetTabId) rejectComputerUseOwnership(lease, 'tab_intent_changed');
      },
      reauthorizeNavigation: async () => {
        if (!lease.actionInFlight) return false;
        context = await readComputerUseAuthContext(lease);
        return true;
      },
    });
    tab = snapshot.tab;
  } catch {
    computerUseRuns.assertCurrent(lease);
    rejectComputerUseOwnership(lease, 'tab_intent_changed');
  }
  computerUseRuns.assertCurrent(lease);

  if (!tab.url || (lease.windowId !== undefined && tab.windowId !== lease.windowId)) {
    rejectComputerUseOwnership(lease, 'tab_intent_changed');
  }
  let origin: string;
  try {
    origin = new URL(tab.url).origin;
  } catch {
    rejectComputerUseOwnership(lease, 'tab_intent_changed');
  }
  if (!isOriginApprovedForAutomation(origin)) {
    rejectComputerUseOwnership(lease, 'tab_intent_changed');
  }

  // The site allowlist only authorizes ordinary page automation. Full CDP control is a
  // separate, higher-bar consent that must hold for whatever origin the tab is on *now*.
  let browserControlGranted = false;
  try {
    browserControlGranted = await hasBrowserControlConsent(origin);
  } catch {
    browserControlGranted = false;
  }
  computerUseRuns.assertCurrent(lease);
  if (!browserControlGranted) {
    rejectComputerUseOwnership(lease, 'tab_intent_changed');
  }

  if (!lease.actionInFlight && tab.url !== lease.tabIntentUrl) {
    rejectComputerUseOwnership(lease, 'tab_intent_changed');
  }

  return context.token;
}

async function updateComputerUseActionState(
  lease: ComputerUseRunLease,
  active: boolean,
): Promise<void> {
  if (!computerUseRuns.isCurrent(lease)) return;
  if (active) {
    computerUseRuns.setActionInFlight(lease, true);
    return;
  }

  try {
    const tab = await chrome.tabs.get(lease.tabId);
    if (!computerUseRuns.isCurrent(lease) || !tab.url) return;
    computerUseRuns.commitTabIntent(lease, tab.url);
    computerUseRuns.setActionInFlight(lease, false);
  } catch {
    if (computerUseRuns.isCurrent(lease)) {
      computerUseStartGeneration += 1;
      cancelActiveComputerUseRun('tab_intent_changed', lease.runId);
    }
  }
}

async function assertComputerUseInputCleanupOwnership(
  lease: ComputerUseRunLease,
  startGeneration: number,
): Promise<void> {
  const assertGeneration = (): void => {
    const active = computerUseRuns.getActive();
    const reason = lease.controller.signal.reason as { reasonCode?: unknown } | undefined;
    const locallyCancelled =
      lease.controller.signal.aborted &&
      ['user_stopped', 'user_cleared', 'panel_closed'].includes(String(reason?.reasonCode));
    if (
      (active && active !== lease) ||
      computerUseStarts.getPending() ||
      computerUseStartGeneration !== startGeneration + (locallyCancelled ? 1 : 0)
    ) {
      throw new Error('A newer browser run or start owns this tab.');
    }
  };
  assertGeneration();
  const context = await getManagedCloudAuthContext(true);
  assertGeneration();
  if (
    !context ||
    isRetiredManagedCloudOwner(context.owner) ||
    !sameManagedCloudOwner(context.owner, lease.authOwner)
  )
    throw new Error('The original account no longer owns input cleanup.');
  const tab = await chrome.tabs.get(lease.tabId);
  assertGeneration();
  if (
    !tab.url ||
    tab.url !== lease.tabIntentUrl ||
    (lease.windowId !== undefined && tab.windowId !== lease.windowId)
  )
    throw new Error('The original browser page changed before input cleanup.');
  const authorized = await authorizeBrowserToolTab(lease.tabId);
  assertGeneration();
  const currentTab = await chrome.tabs.get(lease.tabId);
  assertGeneration();
  if (
    authorized.url !== lease.tabIntentUrl ||
    currentTab.url !== authorized.url ||
    currentTab.windowId !== tab.windowId
  )
    throw new Error('The original browser page changed before input cleanup.');
  const origin = new URL(tab.url).origin;
  if (!isOriginApprovedForAutomation(origin) || !(await hasBrowserControlConsent(origin)))
    throw new Error('Browser input cleanup no longer has site and control consent.');
  assertGeneration();
  if (lease.windowId !== undefined) {
    const activeTabs = await chrome.tabs.query({ active: true, windowId: lease.windowId });
    assertGeneration();
    if (activeTabs[0]?.id !== lease.tabId)
      throw new Error('The original browser tab is no longer active.');
  }
  const current = await getManagedCloudAuthContext(true);
  assertGeneration();
  if (
    !current ||
    !sameManagedCloudOwner(current.owner, lease.authOwner) ||
    isRetiredManagedCloudOwner(current.owner)
  )
    throw new Error('The original account changed during input cleanup.');
}

function isAllowlistedSender(
  sender: chrome.runtime.MessageSender,
  messageType: string | undefined,
): boolean {
  if (
    isTrustedExtensionPageSender(
      {
        id: sender.id,
        url: sender.url,
        origin: sender.origin,
        tabUrl: sender.tab?.url,
        hasTab: sender.tab != null,
      },
      chrome.runtime.id,
      chrome.runtime.getURL('/').replace(/\/+$/, ''),
    )
  ) {
    return true;
  }

  if (!sender.tab || !sender.tab.url) return false;

  if (messageType && DISCOVERY_MESSAGE_TYPES.has(messageType)) return true;

  let origin: string;
  try {
    origin = new URL(sender.tab.url).origin;
  } catch {
    return false;
  }
  return isOriginApprovedForAutomation(origin);
}

function senderTabAllowedToMutate(
  sender: chrome.runtime.MessageSender,
  targetTabId: number | undefined,
): boolean {
  if (typeof targetTabId !== 'number') return true;
  return sender?.tab?.id === targetTabId;
}

function memoryWriteResponse(result: MemoryWriteResult): ExtensionResponse {
  return {
    success: result.status === 'ready',
    status: result.status,
    memory: result.memory,
    error: result.error,
  } as ExtensionResponse;
}

function handleMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: ExtensionResponse) => void,
): boolean {
  const msg = message as ExtensionMessage;

  if (!isValidMessage(msg)) {
    const rejectedType = (message as { type?: unknown } | null)?.type;
    logger.warn('Invalid message received', {
      type: typeof rejectedType === 'string' ? rejectedType : typeof message,
      origin: sender.origin,
    });
    sendResponse({ success: false, error: 'Invalid message format' } as ExtensionResponse);
    return false;
  }

  if (
    msg.type === 'OPEN_SIDE_PANEL' &&
    !siteAllowlistLoaded &&
    sender.id === chrome.runtime.id &&
    sender.tab?.id != null
  ) {
    // Chrome allows sidePanel.open only in the synchronous turn of the user's
    // click, and a dormant worker has not read the allowlist yet. Opening the
    // panel reveals nothing about any site, so the open comes first and the
    // allowlist decides the reply.
    openAssistantPanel({ tabId: sender.tab.id, windowId: sender.tab.windowId }).catch((err) => {
      logger.warn('OPEN_SIDE_PANEL synchronous open failed', err);
    });
    void siteAllowlistReady.then(() => {
      sendResponse(
        isAllowlistedSender(sender, msg.type)
          ? ({ success: true } as ExtensionResponse)
          : ({ success: false, error: SITE_NOT_APPROVED_MESSAGE } as ExtensionResponse),
      );
    });
    return true;
  }

  if (!isAllowlistedSender(sender, msg.type)) {
    if (!siteAllowlistLoaded) {
      // This message may be the one that woke a dormant worker, arriving before
      // the cached allowlist read landed. Decide again once it does, rather
      // than rejecting an approved origin on its first page load and making the
      // user reload to get a working extension.
      void siteAllowlistReady.then(() => {
        if (!isAllowlistedSender(sender, msg.type)) {
          logger.warn('Rejected message from non-allowlisted sender', {
            origin: originOfUrl(sender?.tab?.url),
            type: msg.type,
          });
          sendResponse({ success: false, error: SITE_NOT_APPROVED_MESSAGE } as ExtensionResponse);
          return;
        }
        dispatchAuthorizedMessage(msg, sender, sendResponse);
      });
      return true;
    }
    logger.warn('Rejected message from non-allowlisted sender', {
      origin: originOfUrl(sender?.tab?.url),
      type: msg.type,
    });
    sendResponse({
      success: false,
      error: SITE_NOT_APPROVED_MESSAGE,
    } as ExtensionResponse);
    return false;
  }

  return dispatchAuthorizedMessage(msg, sender, sendResponse);
}

/**
 * Every gate past the site allowlist, plus dispatch. Split out so the allowlist
 * decision can be retried asynchronously on a cold worker wake without pushing
 * the rest, notably OPEN_SIDE_PANEL, which must open inside the synchronous
 * turn of the user gesture, behind an await in the common case.
 */
function dispatchAuthorizedMessage(
  msg: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: ExtensionResponse) => void,
): boolean {
  if (EXTENSION_PAGE_ONLY_MESSAGE_TYPES.has(msg.type)) {
    if (
      !isTrustedExtensionPageSender(
        {
          id: sender.id,
          url: sender.url,
          origin: sender.origin,
          tabUrl: sender.tab?.url,
          hasTab: sender.tab != null,
        },
        chrome.runtime.id,
        chrome.runtime.getURL('/').replace(/\/+$/, ''),
      )
    ) {
      logger.warn('Rejected extension-page-only message from non-UI sender', {
        origin: originOfUrl(sender?.tab?.url),
        type: msg.type,
      });
      sendResponse({
        success: false,
        error: 'This action requires the extension UI.',
      } as ExtensionResponse);
      return false;
    }
  }

  if (DOM_MUTATION_MESSAGE_TYPES.has(msg.type)) {
    if (!senderTabAllowedToMutate(sender, msg.tabId)) {
      logger.warn('Rejected cross-tab DOM mutation', {
        senderTab: sender?.tab?.id,
        targetTab: msg.tabId,
        type: msg.type,
      });
      sendResponse({
        success: false,
        error: 'Cross-tab DOM mutation is not allowed.',
      } as ExtensionResponse);
      return false;
    }
  }

  if (msg.type === 'OPEN_SIDE_PANEL' && sender.tab?.id != null) {
    openAssistantPanel({ tabId: sender.tab.id, windowId: sender.tab.windowId }).catch((err) => {
      logger.warn('OPEN_SIDE_PANEL synchronous open failed', err);
    });
    sendResponse({ success: true } as ExtensionResponse);
    return false;
  }

  handleMessageAsync(msg, sender)
    .then((response) => {
      sendResponse(response);
    })
    .catch((error) => {
      logger.error('Error handling message', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      } as ExtensionResponse);
    });

  return true;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function isWebTab(tab: chrome.tabs.Tab): boolean {
  return (
    typeof tab.id === 'number' &&
    typeof tab.url === 'string' &&
    (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
  );
}

/**
 * The tab a page tool acts on.
 *
 * A page tool can never act on a chrome-extension: page, and an extension page
 * that sends a message carries its own tab id whether or not it meant to name a
 * target. Taking that id literally pointed every page tool from the options
 * page at the extension itself. An id that is not a web tab is therefore read
 * as "no target given" and the nearest active web tab is used; the origin is
 * re-authorized afterwards either way.
 */
async function resolveBrowserToolTabId(explicitTabId: number | undefined): Promise<number | null> {
  try {
    if (typeof explicitTabId === 'number') {
      const explicitTab = await chrome.tabs.get(explicitTabId).catch(() => undefined);
      if (explicitTab && isWebTab(explicitTab)) return explicitTabId;
    }
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && isWebTab(activeTab)) return activeTab.id ?? null;
    const activeTabs = await chrome.tabs.query({ active: true });
    return activeTabs.find(isWebTab)?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * The tabs, with `active` marking the one a page tool with no tab named acts
 * on. That is resolveBrowserToolTabId's choice, not simply the focused window's
 * tab, or the desktop would check one tab while the command acted on another.
 */
async function listDesktopBrowserTabs(): Promise<BrowserTabSummary[]> {
  await siteAllowlistReady;
  const [focused] = await chrome.tabs.query({ active: true, currentWindow: true });
  const target = await resolveBrowserToolTabId(undefined);
  const tabs = await chrome.tabs.query({});
  return tabs
    .filter((tab) => isWebTab(tab) && !tab.incognito)
    .sort(
      (a, b) =>
        Number(b.windowId === focused?.windowId) - Number(a.windowId === focused?.windowId) ||
        a.index - b.index,
    )
    .slice(0, MAX_LISTED_BROWSER_TABS)
    .map((tab) =>
      desktopTabSummary(
        { id: tab.id as number, url: tab.url as string, title: tab.title },
        tab.id === target,
        (origin) => isOriginApprovedForAutomation(origin) && !isExtensionAccountOrigin(origin),
      ),
    );
}

const DESKTOP_POLL_TIMEOUT_MS = BROWSER_COMMAND_POLL_WINDOW_MS + 10_000;
const DESKTOP_POLL_RETRY_BASE_MS = 5_000;
const DESKTOP_POLL_RETRY_MAX_MS = 60_000;

/**
 * Reads that may name a tab other than the foreground one, as the desktop's
 * tab picker does. They send the page no input, so they hold that tab to its
 * site grant and address instead of the foreground lease. Every command that
 * acts stays on the leased foreground tab.
 */
const PAIRED_NAMED_TAB_READS: ReadonlySet<BrowserCommand> = new Set([
  'browser_read_page',
  'browser_find',
]);

let desktopPollRunning = false;
let activePairedBrowserCommand: {
  controller: AbortController;
  driver: NativeBrowserDriver | null;
} | null = null;

/**
 * Desktop-issued page work, pulled rather than pushed.
 *
 * The native client only resolves responses to its own requests, so a host that
 * pushed a command would be talking to nobody. The native host belongs to
 * Chrome and outlives a Desktop restart, so a failed poll backs off and asks
 * again for as long as this connection lasts: nothing else would restart it.
 */
async function pollDesktopBrowserCommands(): Promise<void> {
  if (desktopPollRunning) return;
  const port = state.nativePort;
  const sessionSecret = nativeSessionSecret;
  if (!port || !sessionSecret || !state.isNativeConnected) return;
  const connection = { port, sessionSecret };
  const isCurrentConnection = (): boolean =>
    state.nativePort === port && nativeSessionSecret === sessionSecret && state.isNativeConnected;
  const assertConnection = (): void => {
    if (!isCurrentConnection()) throw new Error('The original AGI Desktop connection changed.');
  };
  desktopPollRunning = true;
  let failures = 0;

  try {
    while (isCurrentConnection()) {
      let command: unknown = null;
      try {
        const response = (await sendNativeRequest(
          { type: NATIVE_BROWSER_POLL_MESSAGE, version: BROWSER_COMMAND_PROTOCOL_VERSION },
          { timeoutMs: DESKTOP_POLL_TIMEOUT_MS, requireAuthenticatedSession: true, connection },
        )) as unknown as { success?: boolean; command?: unknown };
        assertConnection();
        if (response?.success !== true) throw new Error('Desktop refused the command poll');
        failures = 0;
        command = response.command ?? null;
      } catch (error) {
        if (!isCurrentConnection()) return;
        if (await releaseRevokedDesktopConnection(port, error)) return;
        failures += 1;
        logger.debug('Desktop browser command poll failed', error);
        const retryAt =
          Date.now() +
          Math.min(DESKTOP_POLL_RETRY_BASE_MS * 2 ** (failures - 1), DESKTOP_POLL_RETRY_MAX_MS);
        while (isCurrentConnection() && Date.now() < retryAt) await sleep(1_000);
        continue;
      }

      if (!command) continue;

      const paired = {
        controller: new AbortController(),
        driver: null as NativeBrowserDriver | null,
      };
      activePairedBrowserCommand = paired;
      const disconnectPaired = (): void =>
        paired.driver?.cancel('The original AGI Desktop connection disconnected.');
      const commandId =
        command &&
        typeof command === 'object' &&
        typeof (command as { id?: unknown }).id === 'string'
          ? (command as { id: string }).id
          : '';
      let result: Awaited<ReturnType<typeof runDesktopBrowserCommand>>;
      try {
        const assertPairedWork = (): void => {
          assertConnection();
          if (activePairedBrowserCommand !== paired)
            throw new Error('The original paired browser command lease changed.');
          if (computerUseStarts.getPending() || computerUseRuns.getActive())
            throw new Error(
              'Chrome is already running or starting a browser task. Finish or stop it before paired work.',
            );
        };
        const driver = new NativeBrowserDriver(paired.controller, assertPairedWork);
        paired.driver = driver;
        port.onDisconnect.addListener(disconnectPaired);
        const confirmation = await sendNativeRequest(
          {
            type: NATIVE_BROWSER_COMMAND_WATCH_MESSAGE,
            version: BROWSER_COMMAND_PROTOCOL_VERSION,
            id: commandId,
            wait: false,
          },
          { requireAuthenticatedSession: true, connection, signal: driver.signal },
        );
        if ((confirmation as { state?: unknown }).state !== 'active')
          throw new Error(
            'The paired command is no longer active, or the desktop browser host needs an update.',
          );
        void (async () => {
          while (activePairedBrowserCommand === paired && !driver.signal.aborted) {
            try {
              const status = await sendNativeRequest(
                {
                  type: NATIVE_BROWSER_COMMAND_WATCH_MESSAGE,
                  version: BROWSER_COMMAND_PROTOCOL_VERSION,
                  id: commandId,
                  wait: true,
                },
                {
                  timeoutMs: DESKTOP_POLL_TIMEOUT_MS,
                  requireAuthenticatedSession: true,
                  connection,
                  signal: driver.signal,
                },
              );
              if ((status as { state?: unknown }).state !== 'active') {
                driver.cancel('The desktop requester cancelled or finished this browser command.');
                return;
              }
            } catch (error) {
              if (!driver.signal.aborted) driver.cancel(errorText(error));
              void releaseRevokedDesktopConnection(port, error);
              return;
            }
          }
        })();
        const readsNamedTab =
          isBrowserCommandRequest(command) && PAIRED_NAMED_TAB_READS.has(command.command);
        let namedTab: { tabId: number; url: string } | null = null;
        const assertTabOwnership = async (tabId: number): Promise<void> => {
          if (!namedTab) return driver.assertOwnership(tabId);
          throwIfCdpCancelled(driver.signal);
          assertPairedWork();
          const current = await authorizeBrowserToolTab(tabId);
          if (tabId !== namedTab.tabId || current.url !== namedTab.url)
            throw new Error('The chosen browser tab changed during paired work.');
          assertPairedWork();
          throwIfCdpCancelled(driver.signal);
        };
        result = await runDesktopBrowserCommand(command, {
          resolveTabId: async (explicitTabId) => {
            if (!readsNamedTab || explicitTabId === undefined)
              return driver.resolveTabId(explicitTabId);
            throwIfCdpCancelled(driver.signal);
            assertPairedWork();
            const tabId = await resolveBrowserToolTabId(explicitTabId);
            if (tabId === explicitTabId)
              namedTab = { tabId, url: (await chrome.tabs.get(tabId)).url ?? '' };
            return tabId;
          },
          listTabs: listDesktopBrowserTabs,
          openTab: (url) => driver.openTab(url),
          tabUrl: async (tabId) => {
            await assertTabOwnership(tabId);
            return (await chrome.tabs.get(tabId)).url ?? '';
          },
          history: (tabId, direction) => driver.history(tabId, direction),
          send: async (tabId, message) => {
            await assertTabOwnership(tabId);
            if (message['type'] === 'START_DOWNLOAD') {
              if (typeof message['url'] !== 'string')
                throw new Error('A download URL is required.');
              const download = await startBrowserToolDownload(
                tabId,
                message['url'],
                message['siteRules'] as WebDomainRules | undefined,
                { signal: driver.signal, assertCurrent: () => assertTabOwnership(tabId) },
              );
              await assertTabOwnership(tabId);
              return { success: true, download };
            }
            const response = await awaitCdpOperation(
              handleMessageAsync({ ...message, tabId } as unknown as ExtensionMessage, {
                id: chrome.runtime.id,
                url: chrome.runtime.getURL('side_panel.html'),
                origin: chrome.runtime.getURL('/').replace(/\/+$/, ''),
              }),
              driver.signal,
            );
            await assertTabOwnership(tabId);
            return response as unknown as Record<string, unknown>;
          },
          navigate: (tabId, url) => driver.navigate(tabId, url),
          stop: (tabId) => driver.stop(tabId),
          capture: (tabId) => driver.capture(tabId),
          click: (tabId, selector) => driver.click(tabId, selector),
          type: (tabId, selector, text, clear) => driver.type(tabId, selector, text, clear),
        });
      } catch (error) {
        result = {
          version: BROWSER_COMMAND_PROTOCOL_VERSION,
          id: commandId,
          ok: false,
          error: errorText(error),
        };
      } finally {
        paired.controller.abort(new Error('The paired browser command finished.'));
        port.onDisconnect.removeListener(disconnectPaired);
        try {
          await paired.driver?.dispose();
        } finally {
          if (activePairedBrowserCommand === paired) activePairedBrowserCommand = null;
        }
      }

      try {
        await sendNativeRequest(
          {
            type: NATIVE_BROWSER_RESULT_MESSAGE,
            version: BROWSER_COMMAND_PROTOCOL_VERSION,
            result,
          },
          { requireAuthenticatedSession: true, connection },
        );
      } catch (error) {
        if (await releaseRevokedDesktopConnection(port, error)) return;
        logger.debug('Desktop browser command result was not delivered', error);
      }
    }
  } finally {
    desktopPollRunning = false;
    if (!isCurrentConnection() && state.nativePort && state.isNativeConnected)
      void pollDesktopBrowserCommands();
  }
}

async function handleMessageAsync(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<ExtensionResponse> {
  logger.debug('Processing message', { type: message.type, sender: originOfUrl(sender.url) });

  const tabId = resolveMessageTargetTabId(
    {
      id: sender.id,
      url: sender.url,
      origin: sender.origin,
      tabId: sender.tab?.id,
      tabUrl: sender.tab?.url,
      hasTab: sender.tab != null,
    },
    message.tabId,
    chrome.runtime.id,
    chrome.runtime.getURL('/').replace(/\/+$/, ''),
  );
  const windowId = sender.tab?.windowId;

  if (state.rateLimiter.isLimited(tabId || 0, message.type)) {
    return {
      success: false,
      error: 'Rate limit exceeded',
    } as ExtensionResponse;
  }

  switch (message.type) {
    case 'APPLY_EDITABLE_SELECTION':
    case 'UNDO_EDITABLE_SELECTION': {
      const credential = await getExactManagedMutationCredential(message.owner);
      if (!credential) return { success: false, error: 'The selected-text account changed.' };
      return executeEditableTarget(
        { ...message, owner: credential.owner },
        () => !isRetiredManagedCloudOwner(credential.owner),
      );
    }
    case 'FILL_APPLICATION_CONTACT':
    case 'FILL_OBSERVED_FORM': {
      const profile =
        message.type === 'FILL_APPLICATION_CONTACT'
          ? parseContactAutofillProfile(message.profile)
          : null;
      const plan = message.type === 'FILL_OBSERVED_FORM' ? parseFormFillPlan(message.plan) : null;
      const owner = normalizeManagedCloudOwner(message.owner);
      if (
        (message.type === 'FILL_APPLICATION_CONTACT' &&
          message.replaceExisting !== undefined &&
          typeof message.replaceExisting !== 'boolean') ||
        (message.type === 'FILL_OBSERVED_FORM' && !isPageDocumentId(message.documentId)) ||
        (message.documentId !== undefined && !isPageDocumentId(message.documentId)) ||
        (!profile && !plan) ||
        !Number.isSafeInteger(message.tabId) ||
        message.tabId < 0
      )
        return { success: false, error: 'Invalid application autofill request.' };
      const credential = await getManagedCloudAuthContext();
      if (
        !owner ||
        !sameManagedCloudOwner(owner, credential?.owner) ||
        isRetiredManagedCloudOwner(owner)
      )
        return { success: false, error: 'The application autofill account changed.' };
      const target = await authorizeBrowserToolTab(message.tabId);
      if (target.url !== message.pageUrl)
        return { success: false, error: 'The application page changed before autofill.' };
      if (isRetiredManagedCloudOwner(owner))
        return { success: false, error: 'The application autofill account changed.' };
      let document: PageDocumentReference;
      try {
        document = await readPageDocument(target.tabId, target.url, message.documentId);
      } catch {
        return {
          success: false,
          error:
            message.type === 'FILL_OBSERVED_FORM'
              ? 'The form document changed. Read the page again.'
              : 'The application page could not be verified before autofill.',
        };
      }
      if (message.type === 'FILL_OBSERVED_FORM') {
        if (
          typeof message.formSnapshotId !== 'string' ||
          !UUID_PATTERN.test(message.formSnapshotId)
        )
          return { success: false, error: 'The form document changed. Read the page again.' };
        if (isRetiredManagedCloudOwner(owner))
          return { success: false, error: 'The form filling account changed.' };
        return chrome.tabs.sendMessage(
          target.tabId,
          { ...message, plan, pageUrl: target.url },
          { documentId: document.documentId },
        );
      }
      if (isRetiredManagedCloudOwner(owner))
        return { success: false, error: 'The application autofill account changed.' };
      return chrome.tabs.sendMessage(
        target.tabId,
        {
          type: 'FILL_APPLICATION_CONTACT',
          tabId: target.tabId,
          pageUrl: target.url,
          profile,
          ...(message.replaceExisting !== undefined
            ? { replaceExisting: message.replaceExisting }
            : {}),
          owner,
        },
        { documentId: document.documentId },
      );
    }
    case 'GET_CLOUD_AUTH_TOKEN': {
      const clerkRead = getFreshClerkAuthContext(message.refresh);
      await releaseDataOfOtherAccounts(clerkRead);
      const candidate = await getManagedCloudAuthContext(message.refresh, clerkRead);
      const context = candidate && !isRetiredManagedCloudOwner(candidate.owner) ? candidate : null;
      cancelComputerUseIfAuthChanged(context?.owner ?? null);
      observeMaintenanceOwner(context?.owner ?? null);
      return {
        success: true,
        ...(context ? { token: context.token, owner: context.owner } : {}),
      } as ExtensionResponse;
    }

    case 'MANAGED_CLOUD_AUTH_CHANGED': {
      const previousOwner = normalizeManagedCloudOwner(
        (message as ManagedCloudAuthChangedMessage).previousOwner,
      );
      if (!previousOwner) {
        return { success: false, error: 'Invalid Managed Cloud owner' } as ExtensionResponse;
      }
      retireManagedCloudOwner(previousOwner);
      if (sameManagedCloudOwner(maintenanceObservedOwner, previousOwner)) {
        observeMaintenanceOwner(null);
      }
      await revokeAllOneTimeSiteGrants();
      if (computerUseStarts.getPending()) {
        computerUseStartGeneration += 1;
        clearPendingComputerUseStart();
      }
      const computerUseLease = computerUseRuns.getActive();
      if (computerUseLease && sameManagedCloudOwner(computerUseLease.authOwner, previousOwner)) {
        computerUseStartGeneration += 1;
        cancelActiveComputerUseRun('account_changed', computerUseLease.runId);
      }
      await invalidateManagedCloudOwner(previousOwner, true);
      await releaseDesktopPairing('The signed-in account changed.', false);
      await discardAllRecordingSessions();
      await releaseDataOfOtherAccounts();
      return { success: true } as ExtensionResponse;
    }

    case 'GET_CONNECTION_STATUS':
      if (
        !state.isNativeConnected &&
        !_bgCtx.nativeHandshakeInFlight &&
        !_bgCtx.nativeReconnectGaveUp &&
        (await shouldAutoConnectToDesktop())
      ) {
        connectToNativeHost();
      }
      if (state.isNativeConnected) {
        const port = state.nativePort;
        const sessionSecret = nativeSessionSecret;
        void sendNativeRequest({ type: 'ping' }).catch((error) => {
          if (state.nativePort !== port || nativeSessionSecret !== sessionSecret) return;
          logger.warn('Native ping failed during status check', error);
          if (port)
            rejectPendingNativeRequests(port, 'The original AGI Desktop connection failed.');
          state.isNativeConnected = false;
          state.connectionStatus = 'disconnected';
          state.nativePort = null;
          nativeSessionSecret = null;
          _bgCtx.nativeHandshakeInFlight = false;
          try {
            port?.disconnect();
          } catch (disconnectError) {
            logger.debug('Native port disconnect after ping failure failed', disconnectError);
          }
          state.lastNativeError = error instanceof Error ? error.message : 'Native ping failed';
          void notifyConnectionStatusChange();
          scheduleNativeReconnect('status_ping_failed');
        });
      }
      return {
        success: true,
        nativeConnected: state.isNativeConnected,
        connectionStatus: state.connectionStatus,
      } as ExtensionResponse;

    case 'RECONNECT_NATIVE':
      return triggerManualReconnect();

    case 'UNPAIR_NATIVE': {
      const outcome = await releaseDesktopPairing('The browser was unpaired from Desktop.', true);
      return (
        outcome.kept
          ? {
              success: false,
              error: 'Desktop could not be reached, so the pairing was kept. Try again.',
            }
          : { success: outcome.acknowledged, revocationOwed: outcome.owed }
      ) as ExtensionResponse;
    }

    case 'TAB_READY': {
      return { success: true, ready: true } as ExtensionResponse;
    }

    case 'SYNC_PAGE_CONTEXT': {
      return {
        success: false,
        error: 'Implicit page-context transfer is disabled. Use the explicit context preview.',
      } as ExtensionResponse;
    }

    case 'APPROVE_CONTEXT_HANDOFF': {
      const approval = message as ApproveContextHandoffMessage;
      if (!/^ctx_[A-Za-z0-9_-]{8,80}$/.test(approval.handoffId)) {
        return {
          success: false,
          error: 'Invalid context handoff identifier.',
        } as ExtensionResponse;
      }
      if (pendingContextHandoffApprovals.has(approval.handoffId)) {
        return {
          success: false,
          error: 'This context handoff is already being sent.',
        } as ExtensionResponse;
      }

      const stored = await chrome.storage.session.get(CONTEXT_HANDOFF_STORAGE_KEY);
      const pending = stored[CONTEXT_HANDOFF_STORAGE_KEY];
      if (!isPendingContextHandoff(pending) || pending.id !== approval.handoffId) {
        await chrome.storage.session.remove(CONTEXT_HANDOFF_STORAGE_KEY);
        return {
          success: false,
          error: 'This context preview is invalid or expired. Select the context again.',
          consumed: true,
        } as ExtensionResponse;
      }

      if (
        approval.destination !== undefined &&
        approval.destination !== CONTEXT_HANDOFF_DESTINATION.id
      ) {
        const localDestination =
          approval.destination === CONTEXT_HANDOFF_VSCODE_DESTINATION.id
            ? CONTEXT_HANDOFF_VSCODE_DESTINATION
            : approval.destination === CONTEXT_HANDOFF_CLI_DESTINATION.id
              ? CONTEXT_HANDOFF_CLI_DESTINATION
              : undefined;
        if (localDestination === undefined) {
          return {
            success: false,
            error: 'Unknown context handoff destination.',
          } as ExtensionResponse;
        }
        await chrome.storage.session.remove(CONTEXT_HANDOFF_STORAGE_KEY);
        return {
          success: true,
          consumed: true,
          destination: localDestination.label,
        } as ExtensionResponse;
      }

      let approvedMessage: ReturnType<typeof toApprovedNativeSelectionMessage>;
      try {
        approvedMessage = toApprovedNativeSelectionMessage(pending, nativeSessionSecret !== null);
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'A secure AGI Desktop connection is required before sending context.',
          consumed: false,
        } as ExtensionResponse;
      }

      pendingContextHandoffApprovals.add(pending.id);
      await chrome.storage.session.remove(CONTEXT_HANDOFF_STORAGE_KEY);
      try {
        const nativeResponse = (await sendNativeRequest(
          { ...approvedMessage },
          {
            requireAuthenticatedSession: true,
          },
        )) as unknown as NativeResponseEnvelope;
        if (nativeResponse.success !== true) {
          const retryable = isPendingContextHandoff(pending);
          if (retryable) {
            await chrome.storage.session.set({ [CONTEXT_HANDOFF_STORAGE_KEY]: pending });
          }
          return {
            success: false,
            error: String(nativeResponse.error ?? 'AGI Desktop did not accept the context.'),
            consumed: !retryable,
          } as ExtensionResponse;
        }
        return {
          success: true,
          consumed: true,
          destination: CONTEXT_HANDOFF_DESTINATION.label,
        } as ExtensionResponse;
      } catch (error) {
        return {
          success: false,
          error: `${error instanceof Error ? error.message : 'Native handoff failed.'} The delivery state is unknown; select the context again before retrying.`,
          consumed: true,
        } as ExtensionResponse;
      } finally {
        pendingContextHandoffApprovals.delete(pending.id);
      }
    }

    case 'CANCEL_CONTEXT_HANDOFF': {
      const cancellation = message as CancelContextHandoffMessage;
      if (!/^ctx_[A-Za-z0-9_-]{8,80}$/.test(cancellation.handoffId)) {
        return {
          success: false,
          error: 'Invalid context handoff identifier.',
        } as ExtensionResponse;
      }
      if (pendingContextHandoffApprovals.has(cancellation.handoffId)) {
        return {
          success: false,
          error: 'The context handoff is already being sent and cannot be cancelled.',
        } as ExtensionResponse;
      }
      const stored = await chrome.storage.session.get(CONTEXT_HANDOFF_STORAGE_KEY);
      const pending = stored[CONTEXT_HANDOFF_STORAGE_KEY];
      if (!isPendingContextHandoff(pending) || pending.id !== cancellation.handoffId) {
        await chrome.storage.session.remove(CONTEXT_HANDOFF_STORAGE_KEY);
        return {
          success: false,
          error: 'This context preview is no longer pending.',
        } as ExtensionResponse;
      }
      await chrome.storage.session.remove(CONTEXT_HANDOFF_STORAGE_KEY);
      return { success: true, consumed: true } as ExtensionResponse;
    }

    case 'CHAT_MESSAGE': {
      const chatMsg = message as ChatMessageMessage;
      const owner = normalizeManagedCloudOwner(chatMsg.owner);
      if (!owner) return { success: false, error: 'Invalid Managed Cloud owner' };
      try {
        createChromeManagedStreamKey(chatMsg.clientInstanceId, chatMsg.id);
      } catch {
        return { success: false, error: 'Invalid chat stream identifier' } as ExtensionResponse;
      }
      void handleChatMessage({ ...chatMsg, owner }, sender);
      return { success: true } as ExtensionResponse;
    }

    case 'RESUME_CHAT_RUN': {
      const resumeMsg = message as ResumeChatRunMessage;
      const owner = normalizeManagedCloudOwner(resumeMsg.owner);
      if (!owner) return { success: false, error: 'Invalid Managed Cloud owner' };
      try {
        createChromeManagedStreamKey(resumeMsg.clientInstanceId, resumeMsg.id);
      } catch {
        return { success: false, error: 'Invalid chat stream identifier' } as ExtensionResponse;
      }
      const routing =
        resumeMsg.routing === undefined
          ? undefined
          : normalizeChromeManagedRoutingMetadata(resumeMsg.routing);
      if (resumeMsg.routing !== undefined && !routing) {
        return { success: false, error: 'Invalid Managed Cloud routing metadata' };
      }
      void handleResumeChatRun({ ...resumeMsg, owner, ...(routing ? { routing } : {}) });
      return { success: true } as ExtensionResponse;
    }

    case 'ADOPT_CHAT_TURN': {
      const adoptMsg = message as AdoptChatTurnMessage;
      const owner = normalizeManagedCloudOwner(adoptMsg.owner);
      if (!owner) return { success: false, error: 'Invalid Managed Cloud owner' };
      if (typeof adoptMsg.historyConversationId !== 'string') {
        return { success: false, error: 'Invalid conversation identifier' } as ExtensionResponse;
      }
      for (const [streamKey, active] of activeChatStreams) {
        if (
          !active.panelDetached ||
          !active.streamId ||
          active.historyConversationId !== adoptMsg.historyConversationId ||
          !sameManagedCloudOwner(active.owner, owner)
        )
          continue;
        let adoptedKey: string;
        try {
          adoptedKey = createChromeManagedStreamKey(adoptMsg.clientInstanceId, active.streamId);
        } catch {
          return { success: false, error: 'Invalid chat stream identifier' } as ExtensionResponse;
        }
        if (active.settlement) {
          await active.settlement;
          return { success: true } as ExtensionResponse;
        }
        const toolHandoffs = adoptPendingChatToolHandoffs(
          active,
          active.streamId,
          adoptMsg.clientInstanceId,
        );
        active.clientInstanceId = adoptMsg.clientInstanceId;
        active.panelDetached = false;
        adoptedChatStreamKeys.set(adoptedKey, streamKey);
        syncDetachedChatHeartbeat();
        return {
          success: true,
          adopted: {
            id: active.streamId,
            text: active.visibleText ?? '',
            ...(active.cloudRun ? { cloudRun: { ...active.cloudRun } } : {}),
            ...(active.assistantMessageId ? { assistantMessageId: active.assistantMessageId } : {}),
            ...(toolHandoffs.length > 0 ? { toolHandoffs } : {}),
          },
        } as ExtensionResponse;
      }
      return { success: true } as ExtensionResponse;
    }

    case 'RESOLVE_CHAT_APPROVAL': {
      const approvalMsg = message as ResolveChatApprovalMessage;
      const owner = normalizeManagedCloudOwner(approvalMsg.owner);
      if (!owner) return { success: false, error: 'Invalid Managed Cloud owner' };
      try {
        createChromeManagedStreamKey(approvalMsg.clientInstanceId, approvalMsg.id);
      } catch {
        return { success: false, error: 'Invalid chat stream identifier' } as ExtensionResponse;
      }
      void handleResolveChatApproval({ ...approvalMsg, owner });
      return { success: true } as ExtensionResponse;
    }

    case 'RESOLVE_CHAT_INPUT': {
      const inputMsg = message as ResolveChatInputMessage;
      const owner = normalizeManagedCloudOwner(inputMsg.owner);
      if (!owner) return { success: false, error: 'Invalid Managed Cloud owner' };
      try {
        createChromeManagedStreamKey(inputMsg.clientInstanceId, inputMsg.id);
      } catch {
        return { success: false, error: 'Invalid chat stream identifier' } as ExtensionResponse;
      }
      void handleResolveChatApproval({ ...inputMsg, owner });
      return { success: true } as ExtensionResponse;
    }

    case 'RESOLVE_CHAT_TOOLS': {
      const resolved = resolveChatToolHandoff(message as ResolveChatToolsMessage);
      return (
        resolved
          ? { success: true }
          : { success: false, error: 'This browser tool request is no longer active.' }
      ) as ExtensionResponse;
    }

    case 'GRANT_SITE_ONCE': {
      const granted = grantSiteOnce(message as GrantSiteOnceMessage);
      return (
        granted ? { success: true } : { success: false, error: 'Invalid one-time site grant.' }
      ) as ExtensionResponse;
    }

    case 'REVOKE_SITE_ONCE': {
      const revokeMsg = message as RevokeSiteOnceMessage;
      if (!isOneTimeSiteGrantId(revokeMsg.grantId))
        return { success: false, error: 'Invalid one-time site grant.' } as ExtensionResponse;
      await revokeOneTimeSiteGrant(revokeMsg.grantId);
      return { success: true } as ExtensionResponse;
    }

    case 'CHECK_SITE_ONCE': {
      const grant = listOneTimeSiteGrants().find(
        (entry) =>
          entry.grantId === message.grantId &&
          entry.origin === message.origin &&
          entry.expiresAtMs > Date.now(),
      );
      return grant
        ? { success: true }
        : { success: false, error: 'The task site grant is no longer active.' };
    }

    case 'CANCEL_STREAM': {
      const cancelMsg = message as CancelStreamMessage;
      const owner = normalizeManagedCloudOwner(cancelMsg.owner);
      if (!owner) return { success: false, error: 'Invalid Managed Cloud owner' };
      let streamKey: string;
      try {
        streamKey = resolveChatStreamKey(
          createChromeManagedStreamKey(cancelMsg.clientInstanceId, cancelMsg.id),
        );
      } catch {
        return { success: false, error: 'Invalid chat stream identifier' } as ExtensionResponse;
      }
      const active = activeChatStreams.get(streamKey);
      if (active && !sameManagedCloudOwner(active.owner, owner)) {
        return { success: false, error: 'Managed Cloud stream owner changed' };
      }
      const cloudRun = active?.cloudRun ?? cancelMsg.cloudRun;
      if (!active && !cloudRun) {
        return { success: false, error: 'No active stream for id' } as ExtensionResponse;
      }
      if (active?.cancellation) return active.cancellation;
      if (!cloudRun) {
        return {
          success: false,
          error: 'Cancellation could not be confirmed before the cloud run was saved.',
        };
      }
      const cancellationAttempt = (async (): Promise<ExtensionResponse> => {
        const currentCredential = await getManagedCloudAuthContext().catch(() => null);
        const credential = selectManagedCloudCancellationCredential(
          owner,
          active ? { token: active.token, owner: active.owner } : null,
          currentCredential,
        );
        if (!credential || isRetiredManagedCloudOwner(owner)) {
          return { success: false, error: 'Managed Cloud stream owner changed' };
        }
        const controller = new AbortController();
        try {
          const cancellation = await withTimeout(
            cancelAndConfirmChromeManagedRun(
              cloudRun,
              {
                getAuthToken: async () => credential.token,
              },
              controller.signal,
            ),
            MANAGED_RUN_CANCELLATION_TIMEOUT_MS,
          );
          if (cancellation.status === 'error') {
            return { success: false, error: cancellation.message };
          }
          const current = activeChatStreams.get(streamKey);
          if (isRetiredManagedCloudOwner(owner) || (current !== undefined && current !== active)) {
            return { success: false, error: 'Managed Cloud stream owner changed' };
          }
          if (active) {
            active.cancelRequested = true;
            active.cancelNotified = true;
            active.controller.abort();
          }
          const cancelledRun = {
            ...cloudRun,
            state: cancellation.run.state,
            cancellationRequestedAt: cancellation.run.cancellationRequestedAt,
            lastSequence: Math.max(cloudRun.lastSequence, cancellation.run.lastEventSequence),
          };
          await broadcastManagedChatChunk(owner, cancelMsg.clientInstanceId, cancelMsg.id, {
            text: '',
            done: true,
            ...(cancellation.run.state === 'cancelled'
              ? { error: 'Cancelled.', errorCode: 'cancelled' }
              : {}),
            cloudRun: cancelledRun,
          });
          return {
            success: true,
            cancellationConfirmed: true,
            cloudRun: cancelledRun,
          } as ExtensionResponse;
        } catch {
          return {
            success: false,
            error: 'Cancellation has not been confirmed. The run may still be working.',
          };
        } finally {
          controller.abort();
        }
      })();
      if (active) active.cancellation = cancellationAttempt;
      try {
        return await cancellationAttempt;
      } finally {
        if (active?.cancellation === cancellationAttempt) active.cancellation = undefined;
      }
    }

    case 'OPEN_SIDE_PANEL': {
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }
      if (resolvedTabId) {
        openAssistantPanel({ tabId: resolvedTabId }).catch(() => {});
      } else {
        logger.warn('OPEN_SIDE_PANEL: no active tab');
      }
      return { success: true } as ExtensionResponse;
    }

    case 'SIDE_PANEL_CLOSED': {
      const windowId = (message as SidePanelClosedMessage).windowId;
      if (!Number.isSafeInteger(windowId)) {
        return {
          success: false,
          error: 'SIDE_PANEL_CLOSED: invalid windowId',
        } as ExtensionResponse;
      }
      if (openSidePanelWindows.has(windowId)) return { success: true } as ExtensionResponse;
      await settleClosedSidePanel(windowId, sender.documentId);
      return { success: true } as ExtensionResponse;
    }

    case 'GET_SIDE_PANEL_OPEN': {
      const windowId = sender.tab?.windowId;
      const panels = await chrome.runtime
        .getContexts({ contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType] })
        .catch(() => []);
      return {
        success: true,
        open: windowId !== undefined && panels.some((panel) => panel.windowId === windowId),
      } as ExtensionResponse;
    }

    case 'GET_PAGE_ACCESS': {
      const pageUrl = contentScriptPageUrl(sender, chrome.runtime.id);
      if (!pageUrl) return { success: false, error: CONTENT_SENDER_REFUSAL } as ExtensionResponse;
      await siteAllowlistReady;
      const approved = isOriginApprovedForAutomation(new URL(pageUrl).origin);
      const preference = approved
        ? await chrome.storage.local.get(IN_PAGE_PANEL_ENABLED_STORAGE_KEY)
        : {};
      return {
        success: true,
        approved,
        inPagePanel: approved && preference[IN_PAGE_PANEL_ENABLED_STORAGE_KEY] !== false,
      } as ExtensionResponse;
    }

    case 'GET_AUTOFILL_PROFILE': {
      const pageUrl = contentScriptPageUrl(sender, chrome.runtime.id);
      if (!pageUrl) return { success: false, error: CONTENT_SENDER_REFUSAL } as ExtensionResponse;
      if (!isOriginApprovedForAutomation(new URL(pageUrl).origin))
        return { success: false, error: AUTOFILL_NOT_APPROVED_ERROR } as ExtensionResponse;
      if (!isJobApplicationHostUrl(pageUrl))
        return { success: false, error: AUTOFILL_UNSUPPORTED_PAGE_ERROR } as ExtensionResponse;
      try {
        return {
          success: true,
          profile: await loadAutofillProfile({ throwOnError: true }),
        } as ExtensionResponse;
      } catch (error) {
        logger.warn('Autofill profile could not be read', error);
        return { success: false, error: AUTOFILL_PROFILE_UNREADABLE_ERROR } as ExtensionResponse;
      }
    }

    case 'AUTHORIZE_SITE_TOOL_DESTINATION': {
      const pageUrl = contentScriptPageUrl(sender, chrome.runtime.id);
      const destination = (message as { url?: unknown }).url;
      const senderTabId = sender.tab?.id;
      if (!pageUrl || typeof senderTabId !== 'number' || typeof destination !== 'string')
        return { success: false, error: CONTENT_SENDER_REFUSAL } as ExtensionResponse;
      try {
        await authorizeBrowserToolTab(senderTabId);
        await authorizeBrowserToolUrl(destination);
        return { success: true } as ExtensionResponse;
      } catch (error) {
        return { success: false, error: errorText(error) } as ExtensionResponse;
      }
    }

    case 'CAPTURE_SCREENSHOT': {
      const requestedTab =
        sender.tab ?? (tabId ? await chrome.tabs.get(tabId).catch(() => undefined) : undefined);
      if (tabId && !requestedTab) {
        return {
          success: false,
          error: 'The tab to capture is no longer open.',
        } as ExtensionResponse;
      }
      const targetWindowId = requestedTab?.windowId ?? windowId;
      const visibleTabIn = async (): Promise<chrome.tabs.Tab | undefined> =>
        (
          await chrome.tabs.query(
            targetWindowId !== undefined
              ? { active: true, windowId: targetWindowId }
              : { active: true, currentWindow: true },
          )
        )[0];

      const visibleTab = await visibleTabIn();
      if (visibleTab?.id === undefined) {
        return {
          success: false,
          error: 'No active tab/window for screenshot',
        } as ExtensionResponse;
      }
      if (requestedTab && requestedTab.id !== visibleTab.id) {
        return {
          success: false,
          error: 'The tab is not the one showing in its window, so it cannot be captured.',
        } as ExtensionResponse;
      }

      try {
        const screenshotMsg = message as ExtensionMessage & {
          format?: 'png' | 'jpeg';
          quality?: number;
        };
        const format = screenshotMsg.format ?? 'png';
        const options: { format: 'png' | 'jpeg'; quality?: number } = {
          format,
          ...(format === 'jpeg' ? { quality: screenshotMsg.quality ?? 90 } : {}),
        };
        const canvas = await chrome.tabs.captureVisibleTab(visibleTab.windowId, options);
        if ((await visibleTabIn())?.id !== visibleTab.id) {
          return {
            success: false,
            error: 'The tab changed while the screenshot was taken. Try again.',
          } as ExtensionResponse;
        }

        return {
          success: true,
          data: canvas,
          tabId: visibleTab.id,
          timestamp: Date.now(),
        } as ExtensionResponse;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Screenshot failed';
        return {
          success: false,
          error: /(?:<all_urls>|activeTab).*permission/i.test(reason)
            ? t('spScreenshotTabAccessRequired')
            : reason,
        } as ExtensionResponse;
      }
    }

    case 'GET_ACCESSIBILITY_TREE': {
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }
      if (!resolvedTabId) {
        return { success: false, error: 'No tab ID for accessibility tree' } as ExtensionResponse;
      }
      return handleGetAccessibilityTree(resolvedTabId);
    }

    case 'START_RECORDING':
    case 'STOP_RECORDING':
    case 'GET_RECORDED_ACTIONS':
    case 'SET_RECORDING_VALUE_CAPTURE': {
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }
      if (!resolvedTabId) {
        return { success: false, error: 'No tab ID' } as ExtensionResponse;
      }
      return handleRecordingMessage(resolvedTabId, message);
    }

    case 'RECORDING_ACTION': {
      if (tabId === undefined || sender.tab?.id !== tabId)
        return { success: false, error: 'Only the recorded page reports its steps.' };
      const recording = await appendRecordedAction(
        tabId,
        sender.url,
        (message as RecordingActionMessage).action,
      );
      return { success: true, recording } as ExtensionResponse;
    }

    case 'FIND_ELEMENTS':
    case 'FILL_FIELDS': {
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }
      if (!resolvedTabId) {
        return { success: false, error: 'No tab ID' } as ExtensionResponse;
      }
      return forwardToContentScript(resolvedTabId, message);
    }

    case 'WEBMCP_DISCOVER_TOOLS': {
      const discoveryRequest = message as WebMCPDiscoverToolsMessage;
      const pageGeneration = discoveryRequest.pageGeneration;
      if (
        pageGeneration !== undefined &&
        (typeof pageGeneration !== 'number' ||
          !Number.isSafeInteger(pageGeneration) ||
          pageGeneration < 0)
      ) {
        return { success: false, error: 'Invalid WebMCP page generation' };
      }
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }
      if (!resolvedTabId) {
        return { success: false, error: 'No tab ID' } as ExtensionResponse;
      }
      const navigationGeneration = watchWebMCPNavigation(resolvedTabId);
      const targetBefore = await chrome.tabs.get(resolvedTabId);
      const targetUrl = targetBefore.url;
      const response = await forwardToContentScript(resolvedTabId, message);
      const targetAfter = await chrome.tabs.get(resolvedTabId);
      if (
        navigationGeneration !== currentWebMCPNavigationGeneration(resolvedTabId) ||
        typeof targetUrl !== 'string' ||
        targetAfter.url !== targetUrl
      ) {
        return { success: false, error: 'WebMCP page changed during discovery' };
      }
      const discovery = response as unknown as {
        success?: boolean;
        supported?: boolean;
        tools?: unknown;
        url?: unknown;
        error?: string;
      };
      if (discovery.success !== true) return response;
      const normalized = normalizeWebMCPToolsUpdate(discovery.tools, discovery.url, targetUrl);
      if (!normalized) {
        return { success: false, error: 'Invalid WebMCP discovery response' };
      }
      webmcpToolsByTab.set(resolvedTabId, {
        ...normalized,
        timestamp: Date.now(),
        navigationGeneration,
      });
      return {
        success: true,
        supported: discovery.supported === true,
        tabId: resolvedTabId,
        ...(pageGeneration === undefined ? {} : { pageGeneration }),
        ...normalized,
      } as ExtensionResponse;
    }

    case 'WEBMCP_CALL_TOOL': {
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }
      if (!resolvedTabId) {
        return { success: false, error: 'No tab ID' } as ExtensionResponse;
      }
      return forwardToContentScript(resolvedTabId, message);
    }

    case 'WEBMCP_TOOLS_CHANGED': {
      const toolsMsg = message as WebMCPToolsChangedMessage;
      const toolsTabId = sender?.tab?.id;
      if (typeof toolsTabId !== 'number') {
        return { success: false, error: 'WebMCP discovery requires a sender tab' };
      }
      const senderTabUrl = sender.tab?.url;
      const navigationGeneration = currentWebMCPNavigationGeneration(toolsTabId);
      const currentTab = await chrome.tabs.get(toolsTabId);
      if (
        typeof senderTabUrl !== 'string' ||
        currentTab.url !== senderTabUrl ||
        navigationGeneration !== currentWebMCPNavigationGeneration(toolsTabId)
      ) {
        return { success: false, error: 'Stale WebMCP sender document' };
      }
      const normalized = normalizeWebMCPToolsUpdate(toolsMsg.tools, toolsMsg.url, senderTabUrl);
      if (!normalized) {
        return { success: false, error: 'Invalid WebMCP tool metadata' };
      }
      if (!publishNormalizedWebMCPToolsUpdate(toolsTabId, normalized, navigationGeneration)) {
        return { success: false, error: 'WebMCP page changed during publication' };
      }
      return { success: true } as ExtensionResponse;
    }

    case 'GET_TAB_GROUP_STATE': {
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }
      if (!resolvedTabId) {
        return { success: false, error: 'No active tab' } as ExtensionResponse;
      }
      const activeTab = await chrome.tabs.get(resolvedTabId);
      if (typeof activeTab.groupId !== 'number' || activeTab.groupId < 0) {
        return { success: true, grouped: false } as ExtensionResponse;
      }
      if (!chrome.tabGroups) {
        return { success: false, error: 'Tab groups are not available' } as ExtensionResponse;
      }
      const activeGroup = await chrome.tabGroups.get(activeTab.groupId);
      return {
        success: true,
        grouped: activeGroup.title === TAB_GROUP_NAME,
      } as ExtensionResponse;
    }

    case 'ADD_TAB_TO_GROUP': {
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }
      if (!resolvedTabId) {
        return { success: false, error: 'No active tab' } as ExtensionResponse;
      }
      const grouped = await ensureTabGroup(resolvedTabId);
      return grouped
        ? ({ success: true, grouped: true } as ExtensionResponse)
        : ({
            success: false,
            grouped: false,
            error: t('spTabGroupUpdateFailed'),
          } as ExtensionResponse);
    }

    case 'REMOVE_TAB_FROM_GROUP': {
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }
      if (!resolvedTabId) {
        return { success: false, error: 'No active tab' } as ExtensionResponse;
      }
      try {
        await chrome.tabs.ungroup(resolvedTabId);
      } catch {
        // Tab may not be in a group
      }
      return { success: true, grouped: false } as ExtensionResponse;
    }

    case 'SAVE_SHORTCUT':
      return handleSaveShortcut(
        message as SaveShortcutMessage,
        (await definitiveSignedInAccount()) ?? null,
      );

    case 'LIST_SHORTCUTS':
      await releaseDataOfOtherAccounts();
      return handleListShortcuts();

    case 'DELETE_SHORTCUT':
      return handleDeleteShortcut(message as DeleteShortcutMessage);

    case 'UPDATE_SHORTCUT':
      return handleUpdateShortcut(message as UpdateShortcutMessage);

    case 'REPLAY_SHORTCUT':
      return handleReplayShortcut(message as ReplayShortcutMessage);

    case 'CREATE_SCHEDULED_TASK': {
      const createMessage = message as CreateScheduledTaskMessage;
      const requiresManagedCloud = await scheduledTaskUsesManagedCloud(createMessage.task);
      const requestedOwner = requiresManagedCloud
        ? normalizeManagedCloudOwner(createMessage.owner)
        : null;
      const credential = requiresManagedCloud
        ? await getExactManagedMutationCredential(requestedOwner)
        : null;
      if (requiresManagedCloud && (!requestedOwner || !credential)) {
        return {
          success: false,
          error: 'The Managed Cloud account changed before this schedule could be authorized.',
        } as ExtensionResponse;
      }
      return handleCreateScheduledTask(
        createMessage,
        requestedOwner?.accountId,
        requiresManagedCloud,
        requestedOwner ? () => !isRetiredManagedCloudOwner(requestedOwner) : undefined,
      );
    }

    case 'LIST_SCHEDULED_TASKS': {
      const listMessage = message as ListScheduledTasksMessage;
      const requestedOwner = normalizeManagedCloudOwner(listMessage.owner);
      const credential = requestedOwner
        ? await getExactManagedMutationCredential(requestedOwner)
        : null;
      return handleListScheduledTasks(
        credential && requestedOwner ? requestedOwner.accountId : undefined,
      );
    }

    case 'UPDATE_SCHEDULED_TASK': {
      const updateMessage = message as UpdateScheduledTaskMessage;
      const changesExecution =
        Object.prototype.hasOwnProperty.call(updateMessage.updates, 'prompt') ||
        Object.prototype.hasOwnProperty.call(updateMessage.updates, 'shortcutId');
      const invalidatesExecution =
        changesExecution || Object.prototype.hasOwnProperty.call(updateMessage.updates, 'enabled');
      let mutationGeneration: number | undefined;
      let committedTaskEnabled = false;
      const existing = (await loadScheduledTasks()).find(
        (task) => task.id === updateMessage.taskId,
      );
      const requiresManagedCloud =
        changesExecution && existing
          ? await scheduledTaskUsesManagedCloud({ ...existing, ...updateMessage.updates })
          : undefined;
      const touchesManagedCloud =
        existing?.managedCloudAccountId !== undefined || requiresManagedCloud === true;
      const requestedOwner = touchesManagedCloud
        ? normalizeManagedCloudOwner(updateMessage.owner)
        : null;
      const credential = touchesManagedCloud
        ? await getExactManagedMutationCredential(requestedOwner)
        : null;
      if (touchesManagedCloud && (!requestedOwner || !credential)) {
        return {
          success: false,
          error: 'Task not found for the current Managed Cloud account.',
        } as ExtensionResponse;
      }
      let response: ExtensionResponse;
      try {
        response = await handleUpdateScheduledTask(
          updateMessage,
          requestedOwner?.accountId,
          requiresManagedCloud,
          invalidatesExecution
            ? () => {
                mutationGeneration = scheduledTaskExecutions.invalidate(updateMessage.taskId);
              }
            : undefined,
          invalidatesExecution
            ? (updatedTask) => {
                committedTaskEnabled = updatedTask.enabled;
              }
            : undefined,
          requestedOwner ? () => !isRetiredManagedCloudOwner(requestedOwner) : undefined,
        );
      } catch (error) {
        if (mutationGeneration !== undefined) {
          scheduledTaskExecutions.activate(updateMessage.taskId, mutationGeneration);
        }
        throw error;
      }
      if (!response.success && mutationGeneration !== undefined) {
        scheduledTaskExecutions.activate(updateMessage.taskId, mutationGeneration);
      }
      if (response.success && invalidatesExecution) {
        const journal = (await loadScheduledTaskRunJournals()).find(
          (candidate) => candidate.taskId === updateMessage.taskId,
        );
        if (journal) await abandonScheduledTaskRun(journal, credential);
        if (committedTaskEnabled && mutationGeneration !== undefined) {
          scheduledTaskExecutions.activate(updateMessage.taskId, mutationGeneration);
        }
      }
      return response;
    }

    case 'DELETE_SCHEDULED_TASK': {
      const deleteMessage = message as DeleteScheduledTaskMessage;
      const existing = (await loadScheduledTasks()).find(
        (task) => task.id === deleteMessage.taskId,
      );
      const touchesManagedCloud = existing?.managedCloudAccountId !== undefined;
      const requestedOwner = touchesManagedCloud
        ? normalizeManagedCloudOwner(deleteMessage.owner)
        : null;
      const credential = touchesManagedCloud
        ? await getExactManagedMutationCredential(requestedOwner)
        : null;
      if (touchesManagedCloud && (!requestedOwner || !credential)) {
        return {
          success: false,
          error: 'Task not found for the current Managed Cloud account.',
        } as ExtensionResponse;
      }
      let mutationGeneration: number | undefined;
      let response: ExtensionResponse;
      try {
        response = await handleDeleteScheduledTask(
          deleteMessage,
          requestedOwner?.accountId,
          () => {
            mutationGeneration = scheduledTaskExecutions.invalidate(deleteMessage.taskId);
          },
          requestedOwner ? () => !isRetiredManagedCloudOwner(requestedOwner) : undefined,
        );
      } catch (error) {
        if (mutationGeneration !== undefined) {
          scheduledTaskExecutions.activate(deleteMessage.taskId, mutationGeneration);
        }
        throw error;
      }
      if (!response.success && mutationGeneration !== undefined) {
        scheduledTaskExecutions.activate(deleteMessage.taskId, mutationGeneration);
      }
      const journal = response.success
        ? (await loadScheduledTaskRunJournals()).find(
            (candidate) => candidate.taskId === deleteMessage.taskId,
          )
        : undefined;
      if (response.success && journal) await abandonScheduledTaskRun(journal, credential);
      return response;
    }

    case 'IN_PAGE_PROMPT': {
      const { prompt, pageContext } = message as InPagePromptMessage;
      return handleInPagePrompt(
        typeof prompt === 'string' ? prompt : '',
        typeof pageContext === 'string' ? pageContext : undefined,
        sender.tab?.url ?? sender.url,
        sender.tab?.id,
        typeof (message as InPagePromptMessage).requestId === 'string'
          ? (message as InPagePromptMessage).requestId
          : undefined,
      );
    }

    case 'CANCEL_IN_PAGE_PROMPT': {
      if (typeof sender.tab?.id === 'number') cancelInPagePrompts(sender.tab.id);
      return { success: true } as ExtensionResponse;
    }

    case 'LIST_MEMORIES': {
      const owner = normalizeManagedCloudOwner(message.owner);
      if (!owner || isRetiredManagedCloudOwner(owner))
        return { success: false, status: 'signed-out' } as ExtensionResponse;
      const listOffset = message.offset;
      const listed = await memoryList(
        owner,
        typeof listOffset === 'number' && Number.isInteger(listOffset) && listOffset > 0
          ? listOffset
          : 0,
      );
      if (isRetiredManagedCloudOwner(owner))
        return { success: false, status: 'signed-out' } as ExtensionResponse;
      return {
        success: listed.status === 'ready',
        status: listed.status,
        memories: listed.memories,
        fromCache: listed.fromCache,
        hasMore: listed.hasMore === true,
        error: listed.error,
      } as ExtensionResponse;
    }

    case 'ADD_MEMORY': {
      const owner = normalizeManagedCloudOwner(message.owner);
      if (!owner || isRetiredManagedCloudOwner(owner))
        return { success: false, status: 'signed-out' } as ExtensionResponse;
      const addContent = typeof message.content === 'string' ? message.content : '';
      if (!addContent.trim()) {
        return { success: false, error: 'Memory content is required' } as ExtensionResponse;
      }
      const result = await memoryAdd(owner, addContent);
      return memoryWriteResponse(
        isRetiredManagedCloudOwner(owner) ? { status: 'signed-out' } : result,
      );
    }

    case 'UPDATE_MEMORY': {
      const owner = normalizeManagedCloudOwner(message.owner);
      if (!owner || isRetiredManagedCloudOwner(owner))
        return { success: false, status: 'signed-out' } as ExtensionResponse;
      const upId = typeof message.id === 'string' ? message.id : '';
      const upContent = typeof message.content === 'string' ? message.content : '';
      if (!upId || !upContent.trim()) {
        return {
          success: false,
          error: 'Memory id and content are required',
        } as ExtensionResponse;
      }
      const result = await memoryUpdate(owner, upId, upContent);
      return memoryWriteResponse(
        isRetiredManagedCloudOwner(owner) ? { status: 'signed-out' } : result,
      );
    }

    case 'DELETE_MEMORY': {
      const owner = normalizeManagedCloudOwner(message.owner);
      if (!owner || isRetiredManagedCloudOwner(owner))
        return { success: false, status: 'signed-out' } as ExtensionResponse;
      const delId = typeof message.id === 'string' ? message.id : '';
      if (!delId) {
        return { success: false, error: 'Memory id is required' } as ExtensionResponse;
      }
      const result = await memoryDelete(owner, delId);
      return memoryWriteResponse(
        isRetiredManagedCloudOwner(owner) ? { status: 'signed-out' } : result,
      );
    }

    case 'GET_QUICK_MODE': {
      return { success: true, enabled: quickModeCache } as ExtensionResponse;
    }

    case 'SET_QUICK_MODE': {
      const qmMsg = message as SetQuickModeMessage;
      quickModeCache = qmMsg.enabled === true;
      await chrome.storage.local.set({ agi_quick_mode: quickModeCache });
      return { success: true, enabled: quickModeCache } as ExtensionResponse;
    }

    case 'SYNC_CONVERSATION': {
      const syncMsg = message as SyncConversationMessage;
      const syncOwner = normalizeManagedCloudOwner(syncMsg.owner);
      if (!syncOwner || isRetiredManagedCloudOwner(syncOwner)) {
        return { success: false, error: 'Invalid Managed Cloud owner' } as ExtensionResponse;
      }
      if (typeof syncMsg.conversationId !== 'string' || syncMsg.conversationId.length === 0) {
        return { success: false, error: 'conversationId is required' } as ExtensionResponse;
      }
      scheduleConversationSync(syncOwner, syncMsg.conversationId, syncMsg.streaming === true);
      // The debounced flush lives in this worker. If it is evicted first, the
      // alarm is what brings the mirror back around.
      armMaintenanceAlarm();
      return { success: true } as ExtensionResponse;
    }

    case 'SAVE_CONVERSATION_NOW': {
      const saveMsg = message as SaveConversationNowMessage;
      const saveOwner = normalizeManagedCloudOwner(saveMsg.owner);
      if (!saveOwner || isRetiredManagedCloudOwner(saveOwner)) {
        return { success: false, error: 'Invalid Managed Cloud owner' } as ExtensionResponse;
      }
      if (typeof saveMsg.conversationId !== 'string' || saveMsg.conversationId.length === 0) {
        return { success: false, error: 'conversationId is required' } as ExtensionResponse;
      }
      const answering = [...activeChatStreams.values()].some(
        (active) =>
          active.historyConversationId === saveMsg.conversationId &&
          sameManagedCloudOwner(active.owner, saveOwner),
      );
      const saved: SaveConversationNowResponse = answering
        ? { success: true, status: 'streaming' }
        : { success: true, ...(await saveConversationNow(saveOwner, saveMsg.conversationId)) };
      return saved as ExtensionResponse;
    }

    case 'ENSURE_CLOUD_CONVERSATION': {
      const ensureMsg = message as EnsureCloudConversationMessage;
      const ensureOwner = normalizeManagedCloudOwner(ensureMsg.owner);
      if (!ensureOwner || isRetiredManagedCloudOwner(ensureOwner)) {
        return { success: false, error: 'Invalid Managed Cloud owner' } as ExtensionResponse;
      }
      if (typeof ensureMsg.conversationId !== 'string' || ensureMsg.conversationId.length === 0) {
        return { success: false, error: 'conversationId is required' } as ExtensionResponse;
      }
      const cloudConversationId = await ensureCloudConversation(
        ensureOwner,
        ensureMsg.conversationId,
      );
      return cloudConversationId
        ? ({ success: true, cloudConversationId } as ExtensionResponse)
        : ({
            success: false,
            error: 'This chat is not saved to your account yet.',
          } as ExtensionResponse);
    }

    case 'DELETE_CLOUD_CONVERSATION': {
      const delCloudMsg = message as DeleteCloudConversationMessage;
      const delOwner = normalizeManagedCloudOwner(delCloudMsg.owner);
      if (!delOwner || isRetiredManagedCloudOwner(delOwner)) {
        return { success: false, error: 'Invalid Managed Cloud owner' } as ExtensionResponse;
      }
      const queued = await queueCloudConversationDeletion(
        delOwner,
        delCloudMsg.cloudConversationId,
        delCloudMsg.organizationId,
      );
      if (queued) armMaintenanceAlarm();
      return queued
        ? ({ success: true } as ExtensionResponse)
        : ({ success: false, error: 'Could not queue account chat deletion' } as ExtensionResponse);
    }

    case 'AGI_START_COMPUTER_USE': {
      const cuMsg = message as StartComputerUseMessage;
      const cuTabId = cuMsg.tabId;
      const cuGoal = typeof cuMsg.goal === 'string' ? cuMsg.goal.trim() : '';
      const cuRunId =
        typeof cuMsg.runId === 'string' && COMPUTER_USE_RUN_ID_PATTERN.test(cuMsg.runId)
          ? cuMsg.runId
          : null;

      if (!cuGoal) {
        return {
          success: false,
          error: 'AGI_START_COMPUTER_USE: goal is required',
        } as ExtensionResponse;
      }
      if (cuGoal.length > 4096) {
        return {
          success: false,
          error: 'AGI_START_COMPUTER_USE: goal must be 4096 characters or fewer',
        } as ExtensionResponse;
      }
      if (
        cuMsg.pageContext !== undefined &&
        (typeof cuMsg.pageContext !== 'string' ||
          cuMsg.pageContext.length > MANAGED_CHAT_MAX_INPUT_CHARS)
      )
        return {
          success: false,
          error: 'Selected page context is invalid or exceeds its message budget.',
        } as ExtensionResponse;
      if (typeof cuTabId !== 'number') {
        return {
          success: false,
          error: 'AGI_START_COMPUTER_USE: tabId is required',
        } as ExtensionResponse;
      }
      if (!cuRunId) {
        return {
          success: false,
          error: 'AGI_START_COMPUTER_USE: valid runId is required',
        } as ExtensionResponse;
      }

      if (activePairedBrowserCommand !== null)
        return {
          success: false,
          error:
            'A paired desktop browser action is still running. Wait for it to finish before starting a Chrome task.',
        } as ExtensionResponse;

      const startGeneration = ++computerUseStartGeneration;
      computerUseStarts.begin(cuRunId, startGeneration);
      cancelActiveComputerUseRun('superseded');

      let callerTask: ReturnType<typeof bindCallerBrowserTask>;
      const failStart = (error: string): ExtensionResponse => {
        callerTask?.fail();
        if (isCurrentComputerUseStart(cuRunId, startGeneration)) {
          clearPendingComputerUseStart(cuRunId);
        }
        return { success: false, error } as ExtensionResponse;
      };

      const startWasCancelled = (): boolean =>
        !isCurrentComputerUseStart(cuRunId, startGeneration) ||
        (callerTask !== undefined && !callerTask.isCurrent());

      let cuTab: chrome.tabs.Tab | undefined;
      try {
        cuTab = await chrome.tabs.get(cuTabId);
      } catch {
        return failStart('AGI_START_COMPUTER_USE: tab not found');
      }
      if (startWasCancelled()) {
        return failStart('AGI_START_COMPUTER_USE: superseded or cancelled before admission');
      }
      if (!cuTab?.url) {
        return failStart('AGI_START_COMPUTER_USE: tab has no URL');
      }
      let cuOrigin: string;
      try {
        cuOrigin = new URL(cuTab.url).origin;
      } catch {
        return failStart('AGI_START_COMPUTER_USE: invalid tab URL');
      }
      if (!isOriginApprovedForAutomation(cuOrigin)) {
        return failStart(
          `AGI_START_COMPUTER_USE: tab origin "${cuOrigin}" is not on the site allowlist. ` +
            `${SITE_NOT_APPROVED_MESSAGE} Then start computer use again.`,
        );
      }

      let cuBrowserControlGranted: boolean;
      try {
        cuBrowserControlGranted = await hasBrowserControlConsent(cuOrigin);
      } catch {
        return failStart('AGI_START_COMPUTER_USE: browser control consent could not be verified');
      }
      if (startWasCancelled()) {
        return failStart('AGI_START_COMPUTER_USE: superseded or cancelled before admission');
      }
      if (!cuBrowserControlGranted) {
        return failStart(
          `AGI_START_COMPUTER_USE: ${browserControlConsentRequiredMessage(cuOrigin)}`,
        );
      }

      if (cuTab.windowId !== undefined) {
        let activeTab: chrome.tabs.Tab | undefined;
        try {
          [activeTab] = await chrome.tabs.query({ active: true, windowId: cuTab.windowId });
        } catch {
          return failStart('AGI_START_COMPUTER_USE: active tab could not be verified');
        }
        if (startWasCancelled()) {
          return failStart('AGI_START_COMPUTER_USE: superseded or cancelled before admission');
        }
        if (activeTab?.id !== cuTabId) {
          return failStart('AGI_START_COMPUTER_USE: target tab is no longer active');
        }
      }

      let authContext: Awaited<ReturnType<typeof getManagedCloudAuthContext>>;
      try {
        authContext = await getManagedCloudAuthContext();
      } catch {
        return failStart('AGI_START_COMPUTER_USE: Cloud authentication could not be verified');
      }
      if (startWasCancelled()) {
        return failStart('AGI_START_COMPUTER_USE: superseded or cancelled before admission');
      }
      if (!authContext || isRetiredManagedCloudOwner(authContext.owner)) {
        return failStart(
          'AGI_START_COMPUTER_USE: sign in to AGI Cloud before starting computer use',
        );
      }

      try {
        callerTask = bindCallerBrowserTask(cuMsg.callerHandoff, authContext.owner, cuRunId);
      } catch (error) {
        return failStart(
          error instanceof Error ? error.message : 'The caller task link is invalid.',
        );
      }

      let askPref: Record<string, unknown>;
      try {
        askPref = await chrome.storage.local.get(ASK_BEFORE_ACTING_KEY);
      } catch {
        return failStart('AGI_START_COMPUTER_USE: approval preference could not be loaded');
      }
      const permissionMode = readBrowserPermissionMode(askPref[ASK_BEFORE_ACTING_KEY]);
      if (startWasCancelled()) {
        return failStart('AGI_START_COMPUTER_USE: superseded or cancelled before admission');
      }

      let computerUseModel: string;
      try {
        if (cuMsg.modelSelection !== undefined && typeof cuMsg.modelSelection !== 'string') {
          return failStart('AGI_START_COMPUTER_USE: valid model selection is required');
        }
        const modelAccess = await getManagedModelAccess(authContext.token);
        computerUseModel = resolveManagedComputerUseModel(modelAccess, cuMsg.modelSelection);
      } catch (error) {
        return failStart(
          `AGI_START_COMPUTER_USE: ${error instanceof Error ? error.message : 'Cloud model access could not be verified'}`,
        );
      }
      if (startWasCancelled()) {
        return failStart('AGI_START_COMPUTER_USE: superseded or cancelled before admission');
      }

      let selectedTabs: readonly BrowserContextTabReference[];
      let restoredTaskTabs: TaskTabScope | undefined;
      const assertStartCurrent = async (): Promise<void> => {
        if (startWasCancelled())
          throw new Error('The browser task start was cancelled or superseded.');
        const current = await getManagedCloudAuthContext();
        if (
          startWasCancelled() ||
          !current ||
          isRetiredManagedCloudOwner(current.owner) ||
          !sameManagedCloudOwner(current.owner, authContext!.owner)
        )
          throw new Error('The account changed during browser task admission.');
        await callerTask?.assertPage(cuTabId);
        const currentTarget = await authorizeBrowserToolTab(cuTabId);
        if (startWasCancelled()) throw new Error('The browser task start was cancelled.');
        const latest = await chrome.tabs.get(cuTabId);
        if (
          startWasCancelled() ||
          currentTarget.url !== cuTab!.url ||
          latest.url !== cuTab!.url ||
          latest.windowId !== cuTab!.windowId ||
          !latest.active
        )
          throw new Error('The original browser task tab changed during admission.');
      };
      try {
        await assertStartCurrent();
        selectedTabs = await admitSelectedContextTabs(
          cuMsg.selectedTabs,
          cuTab.windowId,
          assertStartCurrent,
        );
        restoredTaskTabs = await callerTask?.readTaskTabs();
        await assertStartCurrent();
      } catch (error) {
        return failStart(
          error instanceof Error ? error.message : 'Selected tabs could not be admitted.',
        );
      }

      await lostComputerUseRunRecovery;
      if (startWasCancelled()) {
        return failStart('AGI_START_COMPUTER_USE: superseded or cancelled before admission');
      }
      clearPendingComputerUseStart(cuRunId);
      const notificationTarget =
        typeof cuMsg.historyConversationId === 'string' &&
        cuMsg.historyConversationId.length > 0 &&
        cuMsg.historyConversationId.length <= 200
          ? { conversationId: cuMsg.historyConversationId, owner: authContext.owner }
          : undefined;
      const lease = computerUseRuns.begin({
        runId: cuRunId,
        generation: Date.now() * 1_000 + (startGeneration % 1_000),
        tabId: cuTabId,
        ...(cuTab.windowId === undefined ? {} : { windowId: cuTab.windowId }),
        tabIntentUrl: cuTab.url,
        authOwner: authContext.owner,
        credential: authContext.token,
      });
      const releaseWorker = beginScheduledTaskHeartbeat();
      void markComputerUseRunStarted({
        runId: lease.runId,
        runGeneration: lease.generation,
        tabIds: [cuTabId],
      }).catch(() => undefined);

      const onCallerAbort = () => cancelActiveComputerUseRun('user_stopped', lease.runId);
      callerTask?.attachCancellation(onCallerAbort);
      callerTask?.signal.addEventListener('abort', onCallerAbort, { once: true });
      if (callerTask?.signal.aborted) onCallerAbort();

      const allowedForTask = new Set<string>();
      const approvedUploadFiles = new WeakMap<
        Record<string, unknown>,
        {
          binding: BrowserUploadBinding;
          files: BrowserUploadedFileMetadata[];
        }
      >();
      const onBeforeAction = async (
        toolName: string,
        args: Record<string, unknown>,
        signal: AbortSignal | undefined,
        requirement: ActionApprovalRequirement,
      ): Promise<boolean> => {
        const needsApproval = await actionNeedsApproval({
          alwaysAsk: requirement.alwaysAsk,
          crucial: asksInAutoMode(requirement),
          mode: permissionMode,
          allowedForTask: allowedForTask.has(toolName),
          readsOnly: readsWithoutActing(toolName),
          siteApproved: async () => {
            const origin = normalizeApprovedSiteOrigin((await chrome.tabs.get(lease.tabId)).url);
            return origin !== null && originApprovedForBrowserControl(origin);
          },
        });
        if (!needsApproval) return true;
        {
          const requestId = `cu_approve_${crypto.randomUUID()}`;
          let uploadBinding: BrowserUploadBinding | null = null;
          if (toolName === 'upload_file') {
            if (
              !args ||
              typeof args !== 'object' ||
              Array.isArray(args) ||
              Object.keys(args).length !== 1 ||
              typeof args['index'] !== 'number' ||
              !Number.isSafeInteger(args['index']) ||
              args['index'] < 0
            )
              return false;
            await assertComputerUseOwnership(lease);
            const tab = await chrome.tabs.get(lease.tabId);
            const signature = await getTargetSignature(
              lease.tabId,
              { index: args['index'] },
              signal,
            );
            await assertComputerUseOwnership(lease);
            uploadBinding = parseBrowserUploadBinding({
              requestId,
              runId: lease.runId,
              runGeneration: lease.generation,
              tabId: lease.tabId,
              tabUrl: tab.url,
              targetSignature: signature,
              owner: lease.authOwner,
            });
            if (!uploadBinding) return false;
            approvedUploadFiles.delete(args);
          }
          const action =
            requirement.reason === 'sensitive_input'
              ? 'Type into this field. The text is hidden here.'
              : describeComputerUseAction(toolName, args);
          const reason = describeApprovalReason(requirement);
          void notifyBrowserTask('needs-input', notificationTarget);
          broadcastComputerUseForCurrentRun(lease, {
            type: 'AGI_CU_APPROVE_REQUEST',
            requestId,
            toolName,
            description: reason ? `${reason} ${action}` : action,
            canAllowForTask: !requirement.alwaysAsk,
            ...(uploadBinding ? { uploadBinding } : {}),
          });
          const decision = await new Promise<boolean>((resolve, reject) => {
            let settled = false;
            const cleanup = (): void => {
              clearTimeout(timeout);
              signal?.removeEventListener('abort', onAbort);
              if (pendingComputerUseApprovals.get(requestId) === listener)
                pendingComputerUseApprovals.delete(requestId);
            };
            const finish = (allowed: boolean, forTask = false): void => {
              if (settled) return;
              settled = true;
              cleanup();
              if (allowed && forTask && !requirement.alwaysAsk) allowedForTask.add(toolName);
              resolve(allowed);
            };
            const onAbort = (): void => {
              if (settled) return;
              settled = true;
              cleanup();
              reject(
                signal?.reason instanceof Error
                  ? signal.reason
                  : new DOMException('Computer-use approval was cancelled', 'AbortError'),
              );
            };
            const timeout = setTimeout(() => {
              finish(false);
            }, APPROVAL_TIMEOUT_MS);
            function listener(msg: unknown, sender: chrome.runtime.MessageSender): void {
              if (
                !isTrustedExtensionPageSender(
                  {
                    id: sender.id,
                    url: sender.url,
                    origin: sender.origin,
                    tabUrl: sender.tab?.url,
                    hasTab: sender.tab != null,
                  },
                  chrome.runtime.id,
                  chrome.runtime.getURL('/').replace(/\/+$/, ''),
                )
              ) {
                return;
              }
              if (
                typeof msg === 'object' &&
                msg !== null &&
                (msg as Record<string, unknown>)['type'] === 'AGI_CU_APPROVE_RESPONSE' &&
                (msg as Record<string, unknown>)['requestId'] === requestId
              ) {
                if (settled) return;
                if (uploadBinding) {
                  const response = msg as Record<string, unknown>;
                  const responseBinding = parseBrowserUploadBinding(response['uploadBinding']);
                  const files = parseBrowserUploadedFilesMetadata(response['upload']);
                  if (
                    response['allowed'] !== true ||
                    !responseBinding ||
                    !files ||
                    !sameBrowserUploadBinding(uploadBinding, responseBinding) ||
                    response['runId'] !== lease.runId ||
                    response['runGeneration'] !== lease.generation ||
                    response['tabId'] !== lease.tabId ||
                    !computerUseRuns.isCurrent(lease)
                  ) {
                    finish(false);
                    return;
                  }
                  approvedUploadFiles.set(args, { binding: uploadBinding, files });
                }
                finish(
                  (msg as Record<string, unknown>)['allowed'] === true,
                  !uploadBinding && (msg as Record<string, unknown>)['forTask'] === true,
                );
              }
            }
            pendingComputerUseApprovals.set(requestId, listener);
            signal?.addEventListener('abort', onAbort, { once: true });
            if (signal?.aborted) onAbort();
          });
          return decision;
        }
      };

      const resolveUploadFile = async (args: Record<string, unknown>) => {
        const approval = approvedUploadFiles.get(args);
        approvedUploadFiles.delete(args);
        if (!approval)
          throw new Error('No files were selected and approved for this exact action.');
        const assertCurrent = async (): Promise<void> => {
          await assertComputerUseOwnership(lease);
          const tab = await chrome.tabs.get(lease.tabId);
          if (
            tab.url !== approval.binding.tabUrl ||
            typeof args['index'] !== 'number' ||
            (await getTargetSignature(
              lease.tabId,
              { index: args['index'] },
              lease.controller.signal,
            )) !== approval.binding.targetSignature
          ) {
            throw new Error('The upload page or target changed after your approval.');
          }
          await assertComputerUseOwnership(lease);
        };
        return resolveUploadedUserFiles(approval.files, approval.binding, {
          signal: lease.controller.signal,
          assertCurrent,
        });
      };

      const inputWatch = createRunInputWatch({
        lease,
        activeRun: () => computerUseRuns.getActive(),
        send: watchComputerUseUserInput,
      });
      const taskTabs =
        Number.isSafeInteger(lease.windowId) && lease.windowId !== undefined && lease.windowId >= 0
          ? new TaskTabs({
              initialTabId: cuTabId,
              selectedTabs,
              restoredTabs: restoredTaskTabs,
              windowId: lease.windowId,
              signal: lease.controller.signal,
              currentTabId: () => lease.tabId,
              assertCurrent: () => assertComputerUseOwnership(lease).then(() => undefined),
              beginTransition: (targetTabId) =>
                computerUseRuns.beginTabTransition(lease, targetTabId),
              commitTransition: (transition, url) => {
                const previousTabId = lease.tabId;
                computerUseRuns.commitTabTransition(lease, transition, url);
                inputWatch.retarget(previousTabId);
                void markComputerUseRunTab(lease.runId, lease.tabId).catch(() => undefined);
              },
              abortTransition: (transition) =>
                computerUseRuns.abortTabTransition(lease, transition),
              transitionFailed: () => {
                if (!computerUseRuns.isCurrent(lease)) return;
                computerUseStartGeneration += 1;
                cancelActiveComputerUseRun('tab_intent_changed', lease.runId);
              },
            })
          : undefined;
      const guidanceQueue: PendingRunGuidance[] = [];
      computerUseGuidance.set(lease.runId, guidanceQueue);
      const completion = runAgentLoop(cuGoal, cuTabId, {
        model: computerUseModel,
        ...(cuMsg.pageContext ? { pageContext: cuMsg.pageContext } : {}),
        runId: lease.runId,
        signal: lease.controller.signal,
        assertOwnership: async () => {
          await callerTask?.assertAuthority();
          await assertComputerUseOwnership(lease);
        },
        assertInputCleanupOwnership: () =>
          assertComputerUseInputCleanupOwnership(lease, startGeneration),
        resolveOwnedCredential: async () => {
          await callerTask?.assertAuthority();
          return assertComputerUseOwnership(lease);
        },
        onActionStateChange: async (active) => {
          if (active) await callerTask?.assertAuthority();
          return updateComputerUseActionState(lease, active);
        },
        taskTabs,
        browserSiteTools: new BrowserAgentSiteTools({
          signal: lease.controller.signal,
          currentTabId: () => lease.tabId,
          navigationGeneration: watchWebMCPNavigation,
          assertCurrent: () => assertComputerUseOwnership(lease).then(() => undefined),
          send: forwardToContentScript,
        }),
        currentTabId: () => lease.tabId,
        onDebuggerDetachedByUser: () => {
          computerUseStartGeneration += 1;
          cancelActiveComputerUseRun('debugger_detached', lease.runId);
        },
        onActionPoint: (point) => {
          void chrome.tabs
            .sendMessage(cuTabId, { type: 'AGI_CU_SHOW_ACTION', x: point.x, y: point.y })
            .catch(() => undefined);
        },
        requestTakeover: (reason) => {
          void notifyBrowserTask('needs-input', notificationTarget);
          return handComputerUseTabToUser(lease, reason);
        },
        pendingTakeover: () => (lease.takeover ? untilHandedBack(lease, lease.takeover) : null),
        isTakenOver: () => lease.takeover !== null,
        takeUserGuidance: () =>
          guidanceQueue.splice(0, guidanceQueue.length).map((pending) => {
            pending.settle(true);
            return pending.text;
          }),
        onBeforeAction,
        resolveUploadFile,
        onProgress: (step) => {
          broadcastComputerUseForCurrentRun(lease, { type: 'AGI_CU_STEP', step });
        },
        onUsageUpdate: (usage) => {
          broadcastComputerUseForCurrentRun(lease, { type: 'AGI_CU_USAGE', usage });
        },
      }).then(async () => {
        await callerTask?.assertAuthority();
        await assertComputerUseOwnership(lease);
        if (!lease.tabIntentUrl) throw new Error('The completed task has no verified page.');
        const browserContext = await captureCallerBrowserContext(
          { tabId: lease.tabId, windowId: lease.windowId, url: lease.tabIntentUrl },
          undefined,
          () => computerUseRuns.assertCurrent(lease),
          true,
        );
        await assertComputerUseOwnership(lease);
        if (callerTask) {
          if (!taskTabs) throw new Error('The native task has no tab ownership broker.');
          const scope = await taskTabs.snapshot();
          callerTask.complete(browserContext, scope);
        }
        return browserContext;
      });
      computerUseRuns.trackCompletion(lease, completion);
      void completion
        .finally(() => {
          callerTask?.signal.removeEventListener('abort', onCallerAbort);
          if (computerUseGuidance.get(lease.runId) === guidanceQueue)
            computerUseGuidance.delete(lease.runId);
          for (const pending of guidanceQueue.splice(0, guidanceQueue.length))
            pending.settle(false);
        })
        .catch(() => undefined);
      inputWatch.start();
      const unmarkTab = markComputerUseTab(cuTabId);
      void unmarkTab
        .then((unmark) => (unmark ? markComputerUseRunTab(lease.runId, cuTabId, true) : undefined))
        .catch(() => undefined);
      const cleanupActions: Array<() => unknown> = [
        () => inputWatch.stop(cuTabId),
        () => flushAutomationAuditOutbox().catch(() => false),
        () => unmarkTab.then((unmark) => unmark?.()),
        () => markComputerUseRunEnded(lease.runId),
      ];
      void Promise.all(
        cleanupActions.map((cleanup) =>
          completion
            .then(cleanup, cleanup)
            .catch((error) => logger.warn('Browser task cleanup failed', error)),
        ),
      ).finally(releaseWorker);
      void completion.then(
        (browserContext) => {
          if (!computerUseRuns.finish(lease)) return;
          void notifyBrowserTask('finished', notificationTarget);
          sendComputerUseLifecycle({
            type: 'AGI_CU_STATE',
            status: 'completed',
            runId: lease.runId,
            runGeneration: lease.generation,
            tabId: lease.tabId,
            browserContext,
          });
        },
        (err: unknown) => {
          callerTask?.fail();
          if (!computerUseRuns.finish(lease)) return;
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error('Computer-use agent loop error', err);
          void notifyBrowserTask('failed', notificationTarget);
          sendComputerUseLifecycle({
            type: 'AGI_CU_ESCALATE',
            reason: errMsg,
            runId: lease.runId,
            runGeneration: lease.generation,
            tabId: lease.tabId,
          });
          sendComputerUseLifecycle({
            type: 'AGI_CU_STATE',
            status: 'error',
            reason: errMsg,
            runId: lease.runId,
            runGeneration: lease.generation,
            tabId: lease.tabId,
          });
        },
      );

      broadcastComputerUseForCurrentRun(lease, {
        type: 'AGI_CU_STATE',
        status: 'running',
      });

      return {
        success: true,
        running: true,
        runId: lease.runId,
        runGeneration: lease.generation,
      } as ExtensionResponse;
    }

    case 'START_DOWNLOAD': {
      const downloadMsg = message as StartDownloadMessage;
      const downloadTabId = await resolveBrowserToolTabId(tabId);
      if (downloadTabId === null) {
        return { success: false, error: 'No tab to download from' } as ExtensionResponse;
      }
      if (typeof downloadMsg.url !== 'string' || downloadMsg.url.length === 0) {
        return { success: false, error: 'START_DOWNLOAD: url is required' } as ExtensionResponse;
      }
      try {
        const record = await startBrowserToolDownload(
          downloadTabId,
          downloadMsg.url,
          (message as { siteRules?: { allow: string[]; deny: string[] } }).siteRules,
        );
        return { success: true, download: record } as ExtensionResponse;
      } catch (error) {
        return { success: false, error: errorText(error) } as ExtensionResponse;
      }
    }

    case 'LIST_DOWNLOADS': {
      return { success: true, downloads: await listSessionDownloads() } as ExtensionResponse;
    }

    case 'REVEAL_DOWNLOAD': {
      const revealMsg = message as RevealDownloadMessage;
      if (typeof revealMsg.downloadId !== 'number') {
        return {
          success: false,
          error: 'REVEAL_DOWNLOAD: downloadId is required',
        } as ExtensionResponse;
      }
      try {
        await revealDownload(revealMsg.downloadId);
        return { success: true } as ExtensionResponse;
      } catch (error) {
        return { success: false, error: errorText(error) } as ExtensionResponse;
      }
    }

    case 'SET_PAGE_WATCH': {
      const watchMsg = message as SetPageWatchMessage;
      const watchTabId = await resolveBrowserToolTabId(tabId);
      if (watchTabId === null) {
        return { success: false, error: 'No tab to watch' } as ExtensionResponse;
      }
      try {
        if (watchMsg.watching === true) {
          const watch = await startPageWatch(watchTabId, 'user');
          return { success: true, watching: true, origin: watch.origin } as ExtensionResponse;
        }
        await stopPageWatch(watchTabId, 'user');
        return { success: true, watching: false } as ExtensionResponse;
      } catch (error) {
        return { success: false, watching: false, error: errorText(error) } as ExtensionResponse;
      }
    }

    case 'READ_PAGE_CONSOLE': {
      const consoleMsg = message as ReadPageConsoleMessage;
      const consoleTabId = await resolveBrowserToolTabId(tabId);
      if (consoleTabId === null) {
        return { success: false, error: 'No tab to read the console of' } as ExtensionResponse;
      }
      try {
        const consoleTab = await authorizeBrowserToolTab(consoleTabId);
        return {
          success: true,
          watching: getPageWatch(consoleTabId)?.suspended === false,
          origin: consoleTab.origin,
          console: readConsoleEntries(consoleTabId, {
            ...(consoleMsg.pattern ? { pattern: consoleMsg.pattern } : {}),
            ...(consoleMsg.level ? { level: consoleMsg.level } : {}),
            ...(typeof consoleMsg.limit === 'number' ? { limit: consoleMsg.limit } : {}),
          }),
        } as ExtensionResponse;
      } catch (error) {
        return { success: false, error: errorText(error) } as ExtensionResponse;
      }
    }

    case 'READ_PAGE_NETWORK': {
      const networkMsg = message as ReadPageNetworkMessage;
      const networkTabId = await resolveBrowserToolTabId(tabId);
      if (networkTabId === null) {
        return { success: false, error: 'No tab to read requests for' } as ExtensionResponse;
      }
      try {
        const networkTab = await authorizeBrowserToolTab(networkTabId);
        return {
          success: true,
          watching: getPageWatch(networkTabId)?.suspended === false,
          origin: networkTab.origin,
          network: readNetworkEntries(networkTabId, {
            ...(networkMsg.pattern ? { pattern: networkMsg.pattern } : {}),
            ...(networkMsg.resourceType ? { resourceType: networkMsg.resourceType } : {}),
            ...(networkMsg.failedOnly === true ? { failedOnly: true } : {}),
            ...(typeof networkMsg.limit === 'number' ? { limit: networkMsg.limit } : {}),
          }),
        } as ExtensionResponse;
      } catch (error) {
        return { success: false, error: errorText(error) } as ExtensionResponse;
      }
    }

    case 'AGI_CU_APPROVE_RESPONSE': {
      const requestId = (message as ComputerUseApprovalResponseMessage).requestId;
      const deliver =
        typeof requestId === 'string' ? pendingComputerUseApprovals.get(requestId) : undefined;
      if (!deliver)
        return { success: false, error: APPROVAL_NO_LONGER_PENDING } as ExtensionResponse;
      deliver(message, sender);
      return { success: true } as ExtensionResponse;
    }

    case 'GET_COMPUTER_USE_STATE': {
      const activeLease = computerUseRuns.getActive();
      if (!activeLease) {
        return { success: true, running: false } as ExtensionResponse;
      }
      return {
        success: true,
        running: true,
        runId: activeLease.runId,
        runGeneration: activeLease.generation,
        tabId: activeLease.tabId,
        ...(activeLease.windowId === undefined ? {} : { windowId: activeLease.windowId }),
        ...(activeLease.takeover ? { paused: true, pauseReason: activeLease.takeover.reason } : {}),
      } as ExtensionResponse;
    }

    case 'AGI_CU_USER_INPUT': {
      const lease = computerUseRuns.getActive();
      if (
        lease &&
        sender?.tab?.id === lease.tabId &&
        !lease.takeover &&
        !lease.actionInFlight &&
        Date.now() - lease.lastActionEndedAt > AGENT_INPUT_ECHO_MS
      ) {
        void handComputerUseTabToUser(lease, USER_INPUT_TAKEOVER_REASON).catch(() => undefined);
      }
      const inputTabId = sender?.tab?.id;
      if (typeof inputTabId === 'number' && lease?.tabId !== inputTabId)
        watchComputerUseUserInput(inputTabId, false);
      return { success: true } as ExtensionResponse;
    }

    case 'ADD_COMPUTER_USE_GUIDANCE': {
      if (
        !isTrustedExtensionPageSender(
          {
            id: sender.id,
            url: sender.url,
            origin: sender.origin,
            tabUrl: sender.tab?.url,
            hasTab: sender.tab != null,
          },
          chrome.runtime.id,
          chrome.runtime.getURL('/').replace(/\/+$/, ''),
        )
      ) {
        return {
          success: false,
          error: 'This action requires the extension UI.',
        } as ExtensionResponse;
      }
      const guidanceMessage = message as ComputerUseGuidanceMessage;
      const lease = computerUseRuns.getActive();
      const queue = lease ? computerUseGuidance.get(lease.runId) : undefined;
      if (!lease || lease.runId !== guidanceMessage.runId || !queue) {
        return { success: true, applied: false, running: lease !== null } as ExtensionResponse;
      }
      const text = typeof guidanceMessage.text === 'string' ? guidanceMessage.text.trim() : '';
      if (!text) {
        return {
          success: false,
          running: true,
          error: 'Type the details to add.',
        } as ExtensionResponse;
      }
      const queued = queue.reduce((total, pending) => total + pending.text.length, 0);
      if (queued + text.length > MAX_RUN_GUIDANCE_CHARS) {
        return {
          success: false,
          running: true,
          error: `Details are limited to ${MAX_RUN_GUIDANCE_CHARS.toLocaleString()} characters until AGI reads them.`,
        } as ExtensionResponse;
      }
      const applied = await new Promise<boolean>((settle) => {
        queue.push({ text, settle });
      });
      return {
        success: true,
        applied,
        running: computerUseRuns.isCurrent(lease),
        runId: lease.runId,
        runGeneration: lease.generation,
      } as ExtensionResponse;
    }

    case 'OPEN_EXTENSION_SETTINGS': {
      await chrome.runtime.openOptionsPage();
      return { success: true } as ExtensionResponse;
    }

    case 'PAUSE_COMPUTER_USE':
    case 'RESUME_COMPUTER_USE': {
      const takeoverMessage = message as ComputerUseTakeoverMessage;
      const lease = computerUseRuns.getActive();
      if (!lease || lease.runId !== takeoverMessage.runId) {
        return {
          success: false,
          running: lease !== null,
          error: `${takeoverMessage.type}: run ownership no longer matches`,
        } as ExtensionResponse;
      }
      if (takeoverMessage.type === 'PAUSE_COMPUTER_USE') {
        void handComputerUseTabToUser(lease, USER_TAKEOVER_REASON).catch(() => undefined);
        return {
          success: true,
          running: true,
          runId: lease.runId,
          runGeneration: lease.generation,
        } as ExtensionResponse;
      }
      let handedBackUrl: string | undefined;
      try {
        handedBackUrl = (await chrome.tabs.get(lease.tabId)).url;
      } catch {
        handedBackUrl = undefined;
      }
      if (!computerUseRuns.isCurrent(lease)) {
        return { success: true, running: false } as ExtensionResponse;
      }
      let handedBackOrigin: string | null = null;
      try {
        handedBackOrigin = handedBackUrl ? new URL(handedBackUrl).origin : null;
      } catch {
        handedBackOrigin = null;
      }
      const stillApproved =
        handedBackOrigin !== null &&
        isOriginApprovedForAutomation(handedBackOrigin) &&
        (await hasBrowserControlConsent(handedBackOrigin).catch(() => false));
      if (!computerUseRuns.isCurrent(lease)) {
        return { success: true, running: false } as ExtensionResponse;
      }
      if (!stillApproved || !handedBackUrl) {
        computerUseStartGeneration += 1;
        cancelActiveComputerUseRun('site_access_withdrawn', lease.runId);
        return { success: true, running: false } as ExtensionResponse;
      }
      computerUseRuns.commitTabIntent(lease, handedBackUrl);
      computerUseRuns.endTakeover(lease);
      void chrome.tabs.update(lease.tabId, { active: true }).catch(() => undefined);
      broadcastComputerUseForCurrentRun(lease, { type: 'AGI_CU_STATE', status: 'running' });
      return {
        success: true,
        running: true,
        runId: lease.runId,
        runGeneration: lease.generation,
      } as ExtensionResponse;
    }

    case 'CANCEL_COMPUTER_USE': {
      const cancelMessage = message as CancelComputerUseMessage;
      const rawExpectedRunId = cancelMessage.runId;
      if (
        rawExpectedRunId !== undefined &&
        (typeof rawExpectedRunId !== 'string' ||
          !COMPUTER_USE_RUN_ID_PATTERN.test(rawExpectedRunId))
      ) {
        return {
          success: false,
          running: computerUseRuns.getActive() !== null || computerUseStarts.getPending() !== null,
          error: 'CANCEL_COMPUTER_USE: invalid runId',
        } as ExtensionResponse;
      }
      const expectedRunId = rawExpectedRunId;
      if (!expectedRunId && activePairedBrowserCommand) {
        activePairedBrowserCommand.driver?.cancel(
          'The paired browser command was stopped by the user.',
        );
        activePairedBrowserCommand.controller.abort(
          new Error('The paired browser command was stopped by the user.'),
        );
      }
      const requestedReason = cancelMessage.reason;
      const reason: ComputerUseCancellationReason =
        requestedReason === 'account_changed' ||
        requestedReason === 'panel_closed' ||
        requestedReason === 'user_cleared'
          ? requestedReason
          : 'user_stopped';

      const activeRun = computerUseRuns.getActive();
      if (
        expectedRunId &&
        activeRun?.runId !== expectedRunId &&
        computerUseStarts.getPending()?.runId !== expectedRunId
      ) {
        if (activeRun || computerUseStarts.getPending()) {
          return {
            success: false,
            running: true,
            error: 'CANCEL_COMPUTER_USE: run ownership no longer matches',
          } as ExtensionResponse;
        }
        return { success: true, running: false } as ExtensionResponse;
      }
      if (
        reason === 'panel_closed' &&
        activeRun !== null &&
        activeRun.runId === expectedRunId &&
        activeRun.windowId !== undefined &&
        cancelMessage.windowId !== activeRun.windowId
      ) {
        return {
          success: false,
          running: true,
          error: 'CANCEL_COMPUTER_USE: the closed panel belongs to another window',
        } as ExtensionResponse;
      }

      computerUseStartGeneration += 1;
      const pendingCancelled = clearPendingComputerUseStart(expectedRunId);
      const cancelled = cancelActiveComputerUseRun(reason, expectedRunId);
      return {
        success: true,
        running: false,
        ...(cancelled
          ? { runId: cancelled.runId }
          : pendingCancelled && expectedRunId
            ? { runId: expectedRunId }
            : {}),
      } as ExtensionResponse;
    }

    case 'BRIDGE_URL_CHANGED': {
      const newUrl = (message as BridgeUrlChangedMessage).url?.trim();
      if (newUrl) {
        const validated = validateBridgeUrl(newUrl);
        if (!validated) {
          logger.error('Bridge URL change rejected: non-local URL', { url: newUrl });
          return {
            success: false,
            error: 'Only local URLs (localhost/127.0.0.1) are allowed',
          } as ExtensionResponse;
        }
      }
      logger.info('Bridge URL updated', { url: newUrl ?? '(default)' });
      return { success: true } as ExtensionResponse;
    }

    default: {
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }

      if (!resolvedTabId) {
        return { success: false, error: 'No tab ID' } as ExtensionResponse;
      }

      return forwardToContentScript(resolvedTabId, message);
    }
  }
}

async function handleGetAccessibilityTree(tabId: number): Promise<ExtensionResponse> {
  try {
    const response = (await forwardToContentScript(tabId, {
      type: 'GET_ACCESSIBILITY_TREE',
    } as ExtensionMessage)) as unknown as { success?: boolean; data?: unknown };

    if (state.isNativeConnected && state.nativePort && response.success) {
      void sendNativeMessage({
        type: 'accessibility_tree',
        tab_id: tabId,
        tree: response.data,
      });
    }

    return response as ExtensionResponse;
  } catch (error) {
    logger.error('Failed to get accessibility tree', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get accessibility tree',
    } as ExtensionResponse;
  }
}

/**
 * The worker owns the recording, so a page that loads a new document cannot
 * take the recorded steps with it. Options asks the worker, and the worker asks
 * the page whether it is still recording: a page that is not, or no longer
 * answers, has navigated, and the recording ends there with its steps kept.
 */
async function handleRecordingMessage(
  tabId: number,
  message: ExtensionMessage,
): Promise<ExtensionResponse> {
  if (message.type === 'SET_RECORDING_VALUE_CAPTURE') return forwardToContentScript(tabId, message);
  if (message.type === 'START_RECORDING') {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!(await beginRecordingSession(tabId, tab?.url)))
      return { success: false, error: 'Only a web page can be recorded.' } as ExtensionResponse;
    const started = await forwardToContentScript(tabId, message);
    if (!started?.success) await discardRecordingSession(tabId);
    return started;
  }
  const session = await readRecordingSession(tabId);
  if (message.type === 'STOP_RECORDING') {
    if (session?.state === 'recording') await forwardToContentScript(tabId, message);
    const ended = await endRecordingSession(tabId, 'stopped');
    return {
      success: true,
      recording: false,
      actions: ended?.actions ?? [],
      ...(ended?.state === 'navigated' ? { stoppedBy: 'navigation' } : {}),
    } as ExtensionResponse;
  }
  if (!session) return { success: true, recording: false, actions: [] } as ExtensionResponse;
  let current = session;
  if (session.state === 'recording') {
    const page = (await forwardToContentScript(tabId, message)) as { recording?: unknown };
    if (page?.recording !== true)
      current = (await endRecordingSession(tabId, 'navigated')) ?? session;
  }
  return {
    success: true,
    recording: current.state === 'recording',
    actions: current.actions,
    ...(current.state === 'navigated' ? { stoppedBy: 'navigation' } : {}),
  } as ExtensionResponse;
}

async function forwardToContentScript(
  tabId: number,
  message: ExtensionMessage,
): Promise<ExtensionResponse> {
  try {
    const response = await withTimeout(
      chrome.tabs.sendMessage(tabId, message),
      CONTENT_SCRIPT_FORWARD_TIMEOUT_MS,
    );
    return response as ExtensionResponse;
  } catch (error) {
    logger.error('Failed to forward message to content script', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to communicate with page',
    } as ExtensionResponse;
  }
}

/**
 * `connectedToDesktop` records that the native host has answered on this
 * profile, not that it is answering right now. A closed Desktop app is a
 * reconnect, not an unpairing, so only a permanently unavailable host, an
 * explicit unpair, Desktop refusing this profile's pair token, or a Managed
 * Cloud account change clears it.
 */
async function checkDesktopConnection(): Promise<void> {
  if (!state.nativePort || !state.isNativeConnected) {
    if (!_bgCtx.nativeReconnectGaveUp && !_bgCtx.nativeHandshakeInFlight) {
      connectToNativeHost();
      return;
    }
    return;
  }

  if (state.nativePort && state.isNativeConnected) {
    try {
      const ping = (await sendNativeRequest({
        type: 'ping',
      })) as unknown as NativeResponseEnvelope;
      if (!ping?.success) {
        throw new Error(ping?.error ?? 'Native ping failed');
      }
      if (state.connectionStatus !== 'connected') {
        state.connectionStatus = 'connected';
        void notifyConnectionStatusChange();
      }
      setDesktopPaired(true);
      return;
    } catch (error) {
      logger.warn('Native ping failed', error);
    }
  }

  state.nativePort = null;
  state.isNativeConnected = false;
  if (state.connectionStatus !== 'disconnected') {
    state.connectionStatus = 'disconnected';
    void notifyConnectionStatusChange();
  }
  scheduleNativeReconnect('ping_failed');
}

async function notifyConnectionStatusChange(): Promise<void> {
  const statusPayload = {
    type: 'CONNECTION_STATUS_CHANGED',
    connected: state.isNativeConnected,
    status: state.connectionStatus,
  };

  chrome.runtime.sendMessage(statusPayload).catch(() => {});

  try {
    const tabs = await chrome.tabs.query({ discarded: false });

    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, statusPayload, () => {
          void chrome.runtime.lastError;
        });
      }
    }
  } catch (error) {
    logger.warn('Failed to notify tabs of connection change', error);
  }
}

const CONTEXT_MENU_ITEMS: ReadonlyArray<chrome.contextMenus.CreateProperties> = [
  { id: 'ask-agi-workforce', title: t('menuAskAgi'), contexts: ['selection'] },
  { id: 'send-selection-local', title: t('menuSendSelectionLocal'), contexts: ['selection'] },
  { id: 'explain-selection', title: t('menuExplainSelection'), contexts: ['selection'] },
  { id: 'translate-selection', title: t('menuTranslateSelection'), contexts: ['selection'] },
  { id: 'rewrite-selection', title: t('menuRewriteSelection'), contexts: ['editable'] },
  { id: 'ask-page', title: t('menuAskAboutPage'), contexts: ['page'] },
  { id: 'summarize-page', title: t('menuSummarizePage'), contexts: ['page'] },
  { id: 'add-to-tab-group', title: t('menuAddToTabGroup'), contexts: ['page'] },
];
const pendingChatWindowStamp = (tab: chrome.tabs.Tab) => ({
  tabId: tab.id,
  windowId: tab.windowId,
});

const pendingEditableCaptures = new Map<number, string>();

/**
 * Chrome keeps context menus across worker restarts, so rebuilding them on
 * every start duplicated the work and raced `create` against a `removeAll`
 * that had not settled. Install and update are the only times the set changes.
 */
async function rebuildContextMenus(): Promise<void> {
  if (!chrome.contextMenus?.removeAll || !chrome.contextMenus?.create) {
    logger.warn('contextMenus API unavailable; skipping context menu setup');
    return;
  }

  try {
    await chrome.contextMenus.removeAll();
  } catch (error) {
    logger.warn('contextMenus.removeAll failed', error);
    return;
  }

  for (const item of CONTEXT_MENU_ITEMS) {
    chrome.contextMenus.create(item, () => {
      if (chrome.runtime.lastError) {
        logger.warn(
          `contextMenus.create(${item.id ?? 'unknown'}) failed`,
          chrome.runtime.lastError.message,
        );
      }
    });
  }
}

function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  tab: chrome.tabs.Tab | undefined,
): void {
  if (!tab?.id) return;

  if (info.menuItemId === 'rewrite-selection') {
    const captureId = crypto.randomUUID();
    pendingEditableCaptures.set(tab.id, captureId);
    void openAssistantPanel({ tabId: tab.id, windowId: tab.windowId }).catch(() => {});
    void (async () => {
      try {
        if ((info.frameId ?? 0) !== 0) throw new Error(t('spRewriteFrameUnsupported'));
        const credential = await getManagedCloudAuthContext();
        if (!credential || isRetiredManagedCloudOwner(credential.owner))
          throw new Error(t('spRewriteSignIn'));
        const target = await captureEditableTarget(
          tab,
          info.selectionText ?? '',
          credential.owner,
          () => !isRetiredManagedCloudOwner(credential.owner),
        );
        if (pendingEditableCaptures.get(tab.id!) !== captureId) return;
        await chrome.storage.session.set({
          agi_pending_chat: {
            type: 'rewrite-selection',
            text: target.selectedText,
            url: target.url,
            tabId: target.tabId,
            target,
            windowId: tab.windowId,
            timestamp: Date.now(),
          },
        });
      } catch (error) {
        if (pendingEditableCaptures.get(tab.id!) !== captureId) return;
        const reason = sanitizePageText(
          error instanceof Error ? error.message : t('spRewriteSelectAgain'),
        ).slice(0, MAX_VALUE_LENGTH);
        showNotification(t('spRewriteUnavailable'), reason);
        void chrome.storage.session
          .set({
            agi_pending_chat: {
              type: 'rewrite-error',
              text: reason,
              url: tab.url ?? '',
              windowId: tab.windowId,
              timestamp: Date.now(),
            },
          })
          .catch(() => {});
      } finally {
        if (pendingEditableCaptures.get(tab.id!) === captureId)
          pendingEditableCaptures.delete(tab.id!);
      }
    })();
  } else if (info.menuItemId === 'ask-agi-workforce' && info.selectionText && tab.id) {
    void chrome.storage.session
      .set({
        agi_pending_chat: {
          type: 'ask-selection',
          text: info.selectionText,
          url: info.pageUrl ?? tab.url ?? '',
          ...pendingChatWindowStamp(tab),
          timestamp: Date.now(),
        },
      })
      .catch((error: unknown) => {
        logger.warn('Failed to prepare selected browser context', error);
        showNotification(
          'Context unavailable',
          'The selected context was not attached. Try again.',
        );
      });
    void openAssistantPanel({ tabId: tab.id, windowId: tab.windowId }).catch(() => {});
  } else if (info.menuItemId === 'send-selection-local' && info.selectionText && tab.id) {
    try {
      const pending = createSelectionContextHandoff({
        selectedText: info.selectionText,
        pageUrl: info.pageUrl ?? tab.url ?? '',
        tabId: tab.id,
      });
      void chrome.storage.session
        .set({ [CONTEXT_HANDOFF_STORAGE_KEY]: pending })
        .catch((error: unknown) => {
          logger.warn('Failed to prepare selected-context handoff', error);
          showNotification(
            'Context handoff unavailable',
            'The selected context was not sent. Open the side panel and try again.',
          );
        });
      void openAssistantPanel({ tabId: pending.tabId, windowId: tab.windowId }).catch(
        (error: unknown) => {
          logger.warn('Failed to open selected-context preview', error);
          showNotification(
            'Context preview ready',
            'Open the AGI side panel to review and approve the selected context.',
          );
        },
      );
    } catch (error) {
      logger.warn('Rejected selected-context handoff', error);
      showNotification(
        'Context handoff unavailable',
        error instanceof Error ? error.message : 'The selected context was not sent.',
      );
    }
  } else if (info.menuItemId === 'explain-selection' && info.selectionText && tab.id) {
    chrome.storage.session
      .set({
        agi_pending_chat: {
          type: 'explain',
          text: info.selectionText,
          url: info.pageUrl ?? '',
          ...pendingChatWindowStamp(tab),
          timestamp: Date.now(),
        },
      })
      .catch((err) => {
        logger.warn('Failed to store pending chat (explain)', err);
      });
    openAssistantPanel({ tabId: tab.id, windowId: tab.windowId }).catch(() => {});
  } else if (info.menuItemId === 'translate-selection' && info.selectionText && tab.id) {
    chrome.storage.session
      .set({
        agi_pending_chat: {
          type: 'translate',
          text: info.selectionText,
          url: info.pageUrl ?? '',
          ...pendingChatWindowStamp(tab),
          timestamp: Date.now(),
        },
      })
      .catch((err) => {
        logger.warn('Failed to store pending chat (translate)', err);
      });
    openAssistantPanel({ tabId: tab.id, windowId: tab.windowId }).catch(() => {});
  } else if (info.menuItemId === 'ask-page' && tab.id) {
    chrome.storage.session
      .set({
        agi_pending_chat: {
          type: 'ask-page',
          text: '',
          url: info.pageUrl ?? '',
          ...pendingChatWindowStamp(tab),
          timestamp: Date.now(),
        },
      })
      .catch((err) => {
        logger.warn('Failed to store pending chat (ask about page)', err);
      });
    openAssistantPanel({ tabId: tab.id, windowId: tab.windowId }).catch(() => {});
  } else if (info.menuItemId === 'summarize-page' && tab.id) {
    chrome.storage.session
      .set({
        agi_pending_chat: {
          type: 'summarize',
          text: '',
          url: info.pageUrl ?? '',
          ...pendingChatWindowStamp(tab),
          timestamp: Date.now(),
        },
      })
      .catch((err) => {
        logger.warn('Failed to store pending chat (summarize)', err);
      });
    openAssistantPanel({ tabId: tab.id, windowId: tab.windowId }).catch(() => {});
  } else if (info.menuItemId === 'add-to-tab-group' && tab.id) {
    void ensureTabGroup(tab.id);
  }
}

chrome.contextMenus?.onClicked?.addListener(handleContextMenuClick);

chrome.action?.onClicked?.addListener((tab) => {
  void openAssistantPanel({ tabId: tab.id, windowId: tab.windowId }).catch((error: unknown) => {
    logger.warn('Opening the assistant from the toolbar failed', error);
  });
});

function releaseUnapprovedSiteAccess(): void {
  void releaseUnapprovedHostPermissions(chromeHostPermissionReconcileDeps(readUserSiteAllowlist))
    .then((released) => {
      if (released.length > 0)
        logger.info('Released site access that was allowed only once', { count: released.length });
    })
    .catch((error) => logger.warn('Site access could not be reconciled', error));
}

chrome.runtime.onStartup.addListener(releaseUnapprovedSiteAccess);

chrome.runtime.onInstalled.addListener((details) => {
  void rebuildContextMenus();
  releaseUnapprovedSiteAccess();
  if (details.reason === 'install') {
    void chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PAGE_PATH) });
  }
});

function sendNativeMessage(message: Record<string, unknown>): Promise<void> {
  return sendNativeRequest(message)
    .then(() => undefined)
    .catch((err: unknown) => {
      logger.warn('sendNativeMessage failed', err);
    });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  cancelInPagePrompts(tabId);
  void discardRecordingSession(tabId);
  const lease = computerUseRuns.getActive();
  if (lease?.tabId === tabId) {
    computerUseStartGeneration += 1;
    cancelActiveComputerUseRun('tab_removed', lease.runId);
  }
  state.rateLimiter.reset(tabId);
  forgetPageWatchTab(tabId);
  webmcpToolsByTab.delete(tabId);
  webmcpNavigationGenerationByTab.delete(tabId);
});

// chrome.tabs.onUpdated takes no filter argument (the UpdateFilter overload is
// Firefox-only), so every favicon, title and audible change on every open tab
// reaches this listener. The first line is the cheapest possible answer for the
// common case: nothing is being driven and no tab's tools are cached.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!hasWatchedTabWork()) return;
  const lease = computerUseRuns.getActive();
  if (
    lease?.tabId === tabId &&
    typeof changeInfo.url === 'string' &&
    changeInfo.url !== lease.tabIntentUrl &&
    !lease.actionInFlight &&
    !lease.takeover
  ) {
    computerUseStartGeneration += 1;
    cancelActiveComputerUseRun('tab_intent_changed', lease.runId);
  }
  if (lease?.tabId === tabId && changeInfo.status === 'complete') {
    watchComputerUseUserInput(tabId, true);
  }
  if (changeInfo.url !== undefined || changeInfo.status === 'loading') {
    suspendPageWatchForNavigation(tabId);
  }
  if (changeInfo.url !== undefined || changeInfo.status === 'complete') {
    void resumePageWatchAfterNavigation(tabId);
  }
  if (changeInfo.url === undefined && changeInfo.status !== 'loading') return;
  invalidateWebMCPToolsForNavigation(tabId);
});

chrome.commands.onCommand.addListener((command) => {
  logger.debug('Command received', { command });

  switch (command) {
    case 'capture_page':
      captureCurrentPage();
      break;
  }
});

async function captureCurrentPage(): Promise<void> {
  if (!state.isNativeConnected) {
    showNotification(PAGE_CAPTURE_UNDELIVERED_TITLE, PAGE_CAPTURE_UNAVAILABLE_MESSAGE);
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      logger.warn('No active tab found');
      return;
    }

    try {
      await authorizeBrowserToolTab(tab.id);
    } catch (error) {
      showNotification(
        PAGE_CAPTURE_UNDELIVERED_TITLE,
        `${error instanceof Error ? error.message : PAGE_CAPTURE_SITE_NOT_APPROVED_MESSAGE} Nothing was captured.`,
      );
      return;
    }

    const tabId = tab.id;
    const dataUrl = await captureAdmittedTab(
      { id: tabId, windowId: tab.windowId, url: tab.url },
      {
        visibleTab: async (windowId) => (await chrome.tabs.query({ active: true, windowId }))[0],
        capture: (windowId) => chrome.tabs.captureVisibleTab(windowId, { format: 'png' }),
      },
    );
    if (dataUrl === null) {
      showNotification(PAGE_CAPTURE_UNDELIVERED_TITLE, PAGE_CAPTURE_TAB_CHANGED_MESSAGE);
      return;
    }
    await deliverPageCapture({
      send: () =>
        sendNativeRequest({
          type: NATIVE_PAGE_CAPTURE_MESSAGE,
          dataUrl,
          tabId,
          timestamp: Date.now(),
        }),
      readActionCount: async () => {
        const stats = await storageUtils.getItem<{ actionCount: number }>('stats', {
          actionCount: 0,
        });
        return stats?.actionCount ?? 0;
      },
      writeActionCount: (actionCount) => storageUtils.setItem('stats', { actionCount }),
      notify: showNotification,
      sent: { title: t('pageCaptureSentTitle'), message: t('pageCaptureSentMessage') },
    });
  } catch (error) {
    logger.error('Failed to capture page', error);
    showNotification(
      PAGE_CAPTURE_UNDELIVERED_TITLE,
      pageCaptureFailureMessage(error instanceof Error ? error.message : ''),
    );
  }
}

async function handleChatMessage(
  message: Omit<ChatMessageMessage, 'owner'> & {
    owner?: ManagedCloudOwner;
  },
  _sender: chrome.runtime.MessageSender,
  delivery?: BackgroundChatDelivery,
  admissionSignal?: AbortSignal,
  scheduledTransport?: ScheduledTaskTransport,
): Promise<ChromeManagedChatResult> {
  if (admissionSignal?.aborted) {
    return scheduledTaskError('cancelled', 'The scheduled task was disabled or deleted.');
  }
  const { clientInstanceId, id } = message;
  let streamKey: string;
  try {
    streamKey = createChromeManagedStreamKey(clientInstanceId, id);
  } catch {
    return {
      status: 'error',
      code: 'invalid_request',
      message: 'Invalid chat stream identifier.',
    };
  }
  const requestedOwner = message.owner ? normalizeManagedCloudOwner(message.owner) : null;
  if (requestedOwner && isRetiredManagedCloudOwner(requestedOwner)) {
    return scheduledTaskError(
      'auth_required',
      'The Managed Cloud account changed before this turn.',
    );
  }
  const credential = await getManagedCloudAuthContext();
  if (admissionSignal?.aborted) {
    return scheduledTaskError('cancelled', 'The scheduled task was disabled or deleted.');
  }
  if (
    !credential ||
    isRetiredManagedCloudOwner(credential.owner) ||
    (message.owner && !requestedOwner)
  ) {
    const result = {
      status: 'error',
      code: 'auth_required',
      message: 'Sign in to use AGI Cloud chat.',
    } as const;
    if (requestedOwner) {
      broadcastManagedChatChunk(requestedOwner, clientInstanceId, id, {
        text: '',
        done: true,
        error: '__AUTH_REQUIRED__',
      });
    }
    return result;
  }
  if (requestedOwner && !sameManagedCloudOwner(requestedOwner, credential.owner)) {
    const result = {
      status: 'error',
      code: 'auth_required',
      message: 'The Managed Cloud account changed before this turn started.',
    } as const;
    broadcastManagedChatChunk(requestedOwner, clientInstanceId, id, {
      text: '',
      done: true,
      error: '__AUTH_REQUIRED__',
    });
    return result;
  }
  const owner = credential.owner;
  if (message.conversationId && message.historyConversationId) {
    await flushQuestionBeforeTurn(owner, message.historyConversationId);
  }
  const broadcastChunk = (
    text: string,
    done: boolean,
    error?: string,
    routing?: ChatChunkMessage['routing'],
    activity?: Pick<ChatChunkMessage, 'agentEvent' | 'durableReplay' | 'cloudRun'>,
  ): void => {
    broadcastManagedChatChunk(owner, clientInstanceId, id, {
      text,
      done,
      error,
      routing,
      ...activity,
    });
  };

  if (activeChatStreams.has(streamKey)) {
    const result = {
      status: 'error',
      code: 'invalid_request',
      message: 'A stream with this identifier is already active.',
    } as const;
    broadcastChunk('', true, result.message);
    return result;
  }

  const activeStream: ActiveChatStream = {
    clientInstanceId,
    owner,
    token: credential.token,
    controller: new AbortController(),
    cancelRequested: false,
    cancelNotified: false,
    ...(delivery?.requestId ? { requestId: delivery.requestId } : {}),
    streamId: id,
    visibleText: '',
    ...(!delivery && message.historyConversationId
      ? { historyConversationId: message.historyConversationId }
      : {}),
    ...(message.assistantMessageId ? { assistantMessageId: message.assistantMessageId } : {}),
  };
  activeChatStreams.set(streamKey, activeStream);
  const abortForAdmission = (): void => {
    activeStream.cancelRequested = true;
    activeStream.controller.abort();
  };
  admissionSignal?.addEventListener('abort', abortForAdmission, { once: true });
  if (admissionSignal?.aborted) abortForAdmission();

  const transcript: string[] = [];
  const onStreamText = (text: string): void => {
    if (activeChatStreams.get(streamKey) !== activeStream) return;
    activeStream.visibleText += text;
    if (delivery && text) transcript.push(text);
    publishManagedChatChunk(streamKey, activeStream, id, { text, done: false });
  };
  const settleClosedPanelTurn = async (errorText?: string): Promise<void> => {
    const conversationId = activeStream.historyConversationId;
    if (
      !activeStream.panelDetached ||
      activeStream.cancelRequested ||
      !conversationId ||
      activeStream.cloudRun?.detachable === true
    )
      return;
    const content = activeStream.visibleText ?? '';
    const failure = errorText ?? (content.trim() ? undefined : t('spEmptyResponse'));
    activeStream.settlement = settleDetachedAssistantTurn(owner, conversationId, {
      content,
      ...(failure ? { errorText: failure } : {}),
      ...(activeStream.assistantMessageId
        ? { cloudMessageId: activeStream.assistantMessageId }
        : {}),
    })
      .then(() => undefined)
      .catch((error) => {
        logger.warn('The reply of a closed side panel could not be saved', error);
      });
    await activeStream.settlement;
  };
  let backgroundDeliveryAttempted = false;
  let backgroundDeliveryFailure: string | null = null;
  const deliverBackgroundResult = async (
    routing?: ChromeManagedChatResult['routing'],
  ): Promise<string | null> => {
    if (backgroundDeliveryAttempted) return backgroundDeliveryFailure;
    if (!delivery) return null;
    const answer = transcript.join('');
    if (!answer.trim()) return null;
    backgroundDeliveryAttempted = true;
    try {
      const stored = await recordBackgroundChatResult(
        delivery,
        owner,
        answer,
        routing
          ? {
              selectedModel:
                delivery.kind === 'shortcut' ? (message.modelSelection ?? 'auto') : 'auto',
              currentModelKey: routing.modelKey,
            }
          : undefined,
        routing?.answeredModel ?? routing?.modelKey,
      );
      if (!stored) {
        const message = 'The background answer could not be proven durable.';
        logger.error(message);
        backgroundDeliveryFailure = message;
        return backgroundDeliveryFailure;
      }
      return null;
    } catch (error) {
      logger.error('Failed to persist background chat result', error);
      backgroundDeliveryFailure = 'The background answer could not be persisted.';
      return backgroundDeliveryFailure;
    }
  };

  try {
    const browserContext =
      message.browserContext === undefined
        ? undefined
        : await readCallerBrowserContext(message.browserContext, () => {
            if (
              !isCurrentManagedCloudOperation(activeChatStreams.get(streamKey), activeStream) ||
              isRetiredManagedCloudOwner(owner)
            )
              throw new DOMException('This browser task is no longer current.', 'AbortError');
            activeStream.controller.signal.throwIfAborted();
          });
    const browserObservation =
      message.browserObservation === undefined
        ? undefined
        : parseFormObservationReference(message.browserObservation);
    if (
      message.browserObservation !== undefined &&
      (!browserObservation ||
        browserObservation.tabId !== browserContext?.tabId ||
        browserObservation.url !== browserContext.url ||
        browserObservation.documentId !== browserContext.documentId)
    )
      throw new Error('The original form observation could not be admitted.');
    const conversationContext = !delivery
      ? await captureCallerConversationContext(
          owner,
          message.historyConversationId,
          message.conversationId,
          () => {
            if (
              !isCurrentManagedCloudOperation(activeChatStreams.get(streamKey), activeStream) ||
              isRetiredManagedCloudOwner(owner)
            )
              throw new DOMException('This browser task is no longer current.', 'AbortError');
            activeStream.controller.signal.throwIfAborted();
          },
        )
      : undefined;
    let systemPrompt: string | undefined;
    const turnCarriesPage =
      (typeof message.pageContext === 'string' && message.pageContext.length > 0) ||
      isChatBrowserToolTier(message.browserToolTier) ||
      browserContext !== undefined;
    if (!delivery && turnCarriesPage) {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const turnUrl = browserContext?.url ?? activeTab?.url;
        if (turnUrl) systemPrompt = getPlatformPrompt(turnUrl) ?? undefined;
      } catch {
        // Platform context is optional; inference remains Managed Cloud only.
      }
    }

    const chatTools = chatBrowserToolDefinitions(
      isChatBrowserToolTier(message.browserToolTier) ? message.browserToolTier : undefined,
      message.browserHistory === true,
    );
    const result = await executeChromeManagedChat(
      {
        id,
        ...(browserObservation ? { browserObservation } : {}),
        text: message.text,
        modelSelection: message.modelSelection,
        quickMode: message.quickMode,
        effort: message.effort,
        pageContext: message.pageContext,
        systemPrompt,
        conversationHistory: message.conversationHistory,
        attachments: message.attachments,
        fileAttachments: message.fileAttachments,
        uploadedAttachments: message.uploadedAttachments,
        extendedThinking: message.extendedThinking,
        ...(message.workMode === 'agiwork' ? { workMode: 'agiwork' as const } : {}),
        ...(message.workMode === 'agiwork' && message.agiWorkPlan
          ? { agiWorkPlan: message.agiWorkPlan }
          : {}),
        ...(message.webSearch === false ? { webSearch: false } : {}),
        currentModelKey: message.currentModelKey,
        previousTaskType: message.previousTaskType,
        conversationId: message.conversationId,
        assistantMessageId: message.assistantMessageId,
        ...(message.memoryCommand ? { memoryCommand: message.memoryCommand } : {}),
        ...(message.skillName !== undefined ? { skillName: message.skillName } : {}),
        ...(!delivery && chatTools.length ? { tools: chatTools } : {}),
        ...(!delivery &&
        chatTools.length &&
        conversationContext &&
        browserContext?.documentId &&
        message.historyConversationId
          ? { callerToolContinuation: true }
          : {}),
        idempotencyKey: delivery?.requestId,
        completionMode: delivery ? 'unattended' : 'interactive',
        signal: activeStream.controller.signal,
      },
      {
        ...createChromeManagedChatDependencies(onStreamText, {
          onCodeExecution: (chunk) =>
            publishManagedChatChunk(streamKey, activeStream, id, {
              text: '',
              done: false,
              codeExecution: chunk.execution,
            }),
          onRouting: async (routing) => {
            publishManagedChatChunk(streamKey, activeStream, id, {
              text: '',
              done: false,
              routing,
            });
            await delivery?.onRouting?.(routing);
          },
          onAgentEvent: (chunk) =>
            publishManagedChatChunk(streamKey, activeStream, id, {
              text: '',
              done: false,
              agentEvent: chunk.envelope,
              ...(chunk.durableReplay ? { durableReplay: true } : {}),
            }),
          onGeneratedFiles: (chunk) =>
            publishManagedChatChunk(streamKey, activeStream, id, {
              text: '',
              done: false,
              generatedFiles: chunk.files,
            }),
          onInteractiveCard: (chunk) =>
            publishManagedChatChunk(streamKey, activeStream, id, {
              text: '',
              done: false,
              interactiveCard: chunk.card,
            }),
          onSources: (chunk) =>
            publishManagedChatChunk(streamKey, activeStream, id, {
              text: '',
              done: false,
              sources: { citations: chunk.citations, results: chunk.results },
            }),
          onRunReference: async (cloudRun) => {
            if (activeChatStreams.get(streamKey) !== activeStream) return;
            activeStream.cloudRun = { ...cloudRun };
            publishManagedChatChunk(streamKey, activeStream, id, {
              text: '',
              done: false,
              cloudRun,
            });
            await delivery?.onRunReference?.(cloudRun);
          },
          onQuotaWarning: (quotaWarning) =>
            publishManagedChatChunk(streamKey, activeStream, id, {
              text: '',
              done: false,
              quotaWarning,
            }),
          beforeCallerAction: async (checkpoint) => {
            const saved = await readChromeCallerToolCustody(owner, checkpoint.run_id, () => {
              activeStream.controller.signal.throwIfAborted();
              if (
                !isCurrentManagedCloudOperation(activeChatStreams.get(streamKey), activeStream) ||
                isRetiredManagedCloudOwner(owner)
              )
                throw new Error('The browser task owner changed.');
            });
            if (!saved) throw new Error('The original browser admission is unavailable.');
            await assertOwnedCallerBrowserAction(
              saved,
              checkpoint,
              message.historyConversationId,
              streamKey,
              activeStream,
            );
          },
          onToolHandoff: (calls, checkpoint) =>
            isCurrentManagedCloudOperation(activeChatStreams.get(streamKey), activeStream)
              ? requestChatToolHandoff(activeStream, id, calls, checkpoint)
              : Promise.resolve({ status: 'cancelled' }),
        }),
        ...(!delivery && chatTools.length
          ? {
              callerCustody: createChromeCallerToolCustody(
                {
                  owner,
                  clientInstanceId,
                  streamId: id,
                  ...(browserContext ? { browserContext } : {}),
                  ...(conversationContext ? { conversationContext } : {}),
                  ...(message.historyConversationId
                    ? { historyConversationId: message.historyConversationId }
                    : {}),
                  ...(_sender?.documentId ? { originatingDocumentId: _sender.documentId } : {}),
                },
                () => {
                  if (
                    !isCurrentManagedCloudOperation(
                      activeChatStreams.get(streamKey),
                      activeStream,
                    ) ||
                    isRetiredManagedCloudOwner(owner)
                  )
                    throw new DOMException('This browser task is no longer current.', 'AbortError');
                  activeStream.controller.signal.throwIfAborted();
                },
              ),
            }
          : {}),
        ...(scheduledTransport
          ? {
              streamChat: (...args: Parameters<typeof streamFreeChat>) => {
                const [messages, token, options] = args;
                return streamFreeChat(messages, token, {
                  ...(options && 'aborted' in options ? { signal: options } : options),
                  fetchImpl: scheduledTransport.fetch,
                });
              },
              getModelAccess: async (token: string, signal?: AbortSignal) => {
                await scheduledTransport.beforeModelAccess();
                return getManagedModelAccess(token, signal);
              },
            }
          : {}),
        getAuthToken: async () => {
          activeStream.controller.signal.throwIfAborted();
          if (activeChatStreams.get(streamKey) !== activeStream)
            throw new Error('This Managed Cloud turn is no longer current.');
          const current = await getManagedCloudAuthContext();
          activeStream.controller.signal.throwIfAborted();
          if (
            !current ||
            activeChatStreams.get(streamKey) !== activeStream ||
            isRetiredManagedCloudOwner(current.owner) ||
            !sameManagedCloudOwner(current.owner, owner)
          )
            throw new Error('The Managed Cloud account changed before this turn.');
          activeStream.token = current.token;
          return current.token;
        },
      },
    );

    if (result.status === 'success') {
      await settleClosedPanelTurn();
      if (!activeStream.cancelNotified) {
        publishManagedChatChunk(streamKey, activeStream, id, {
          text: '',
          done: true,
          routing: result.routing,
        });
      }
      const deliveryFailure = await deliverBackgroundResult(result.routing);
      if (deliveryFailure) return scheduledTaskError('server_error', deliveryFailure);
      return result;
    }

    await settleClosedPanelTurn(result.message);
    if (!activeStream.cancelNotified) {
      activeStream.cancelNotified = true;
      // A spent allowance still needs the account panel refreshed, but the
      // sentence the gateway wrote says whose limit it is and this one did
      // not, so the refresh is keyed off the code and the message survives.
      const visibleError = result.code === 'auth_required' ? '__AUTH_REQUIRED__' : result.message;
      publishManagedChatChunk(streamKey, activeStream, id, {
        text: '',
        done: true,
        error: visibleError,
        errorCode: result.code,
        ...(result.retryAfterSeconds !== undefined
          ? { errorRetryAfterSeconds: result.retryAfterSeconds }
          : {}),
        ...(result.requestId !== undefined ? { errorRequestId: result.requestId } : {}),
        ...(result.quota ? { errorQuota: result.quota } : {}),
        ...(result.routing ? { routing: result.routing } : {}),
      });
    }
    const deliveryFailure = await deliverBackgroundResult(result.routing);
    if (result.code === 'auth_required') {
      await invalidateRejectedManagedCloudCredential(activeStream);
    }
    if (deliveryFailure) return scheduledTaskError('server_error', deliveryFailure);
    return result;
  } catch (error) {
    if (error instanceof ScheduledTaskTransportControl) throw error;
    const deliveryFailure = await deliverBackgroundResult();
    // Whatever threw here is this extension's own fault, and its words name a
    // module or a browser API rather than anything a reader can act on.
    const messageText = deliveryFailure ?? 'AGI Cloud chat failed on this device. Try again.';
    const result = {
      status: 'error',
      code: 'server_error',
      message: messageText,
    } as const;
    await settleClosedPanelTurn(messageText);
    if (!activeStream.cancelNotified) {
      activeStream.cancelNotified = true;
      publishManagedChatChunk(streamKey, activeStream, id, {
        text: '',
        done: true,
        error: messageText,
        errorCode: result.code,
      });
    }
    logger.error('handleChatMessage error', error);
    return result;
  } finally {
    admissionSignal?.removeEventListener('abort', abortForAdmission);
    releaseChatStream(streamKey, activeStream);
  }
}

async function handleResumeChatRun(message: ResumeChatRunMessage): Promise<void> {
  const { clientInstanceId, id } = message;
  let streamKey: string;
  try {
    streamKey = createChromeManagedStreamKey(clientInstanceId, id);
  } catch {
    return;
  }
  const routing =
    message.routing === undefined
      ? undefined
      : normalizeChromeManagedRoutingMetadata(message.routing);
  if (message.routing !== undefined && !routing) {
    broadcastManagedChatChunk(message.owner, clientInstanceId, id, {
      text: '',
      done: true,
      error: 'Invalid Managed Cloud routing metadata.',
    });
    return;
  }
  const credential = await getManagedCloudAuthContext();
  if (
    !credential ||
    isRetiredManagedCloudOwner(message.owner) ||
    isRetiredManagedCloudOwner(credential.owner) ||
    !sameManagedCloudOwner(credential.owner, message.owner)
  ) {
    broadcastManagedChatChunk(message.owner, clientInstanceId, id, {
      text: '',
      done: true,
      error: '__AUTH_REQUIRED__',
    });
    return;
  }

  for (const [detachedKey, detached] of activeChatStreams) {
    if (
      detached.panelDetached &&
      detached.cloudRun?.runId === message.cloudRun.runId &&
      sameManagedCloudOwner(detached.owner, credential.owner)
    ) {
      detached.controller.abort();
      releaseChatStream(detachedKey, detached);
    }
  }
  if (activeChatStreams.has(streamKey)) {
    broadcastManagedChatChunk(message.owner, clientInstanceId, id, {
      text: '',
      done: true,
      error: 'This AGI Cloud run is already active.',
    });
    return;
  }

  const activeStream: ActiveChatStream = {
    clientInstanceId,
    owner: credential.owner,
    token: credential.token,
    controller: new AbortController(),
    cancelRequested: false,
    cancelNotified: false,
    cloudRun: { ...message.cloudRun },
    streamId: id,
    ...(message.historyConversationId
      ? { historyConversationId: message.historyConversationId }
      : {}),
  };
  activeChatStreams.set(streamKey, activeStream);

  await resumeOwnedManagedRun(message, streamKey, activeStream, routing ?? undefined);
}

async function assertOwnedCallerBrowserAction(
  saved: NonNullable<Awaited<ReturnType<typeof readChromeCallerToolCustody>>>,
  checkpoint: CallerToolContinuation,
  historyConversationId: string | undefined,
  streamKey: string,
  active: ActiveChatStream,
): Promise<void> {
  const assertCurrent = () => {
    active.controller.signal.throwIfAborted();
    if (
      !isCurrentManagedCloudOperation(activeChatStreams.get(streamKey), active) ||
      isRetiredManagedCloudOwner(active.owner)
    )
      throw new Error('The browser task owner changed.');
  };
  const browserContext = saved.currentBrowserContext ?? saved.binding.browserContext;
  if (!browserContext?.documentId)
    throw new Error('The original browser document could not be recovered.');
  await assertCallerConversationAuthority(
    saved.binding,
    historyConversationId,
    () =>
      isCurrentManagedCloudOperation(activeChatStreams.get(streamKey), active) &&
      !isRetiredManagedCloudOwner(active.owner),
    active.controller.signal,
  );
  await assertChromeManagedCallerRun(
    checkpoint,
    { requestId: saved.requestId, conversationId: saved.binding.conversationContext!.id },
    {
      getAuthToken: async () => {
        assertCurrent();
        const current = await getManagedCloudAuthContext();
        assertCurrent();
        if (!current || !sameManagedCloudOwner(current.owner, active.owner)) return null;
        active.token = current.token;
        return current.token;
      },
    },
    active.controller.signal,
  );
  const authorized = await authorizeBrowserToolTab(browserContext.tabId);
  assertCurrent();
  if (authorized.url !== browserContext.url) throw new Error('The original browser site changed.');
  await readCallerBrowserContext(browserContext, assertCurrent);
}

async function resumeOwnedManagedRun(
  message: ResumeChatRunMessage,
  streamKey: string,
  activeStream: ActiveChatStream,
  routing?: Exclude<ReturnType<typeof normalizeChromeManagedRoutingMetadata>, null>,
): Promise<void> {
  const { clientInstanceId, id } = message;
  try {
    let savedCaller: Awaited<ReturnType<typeof readChromeCallerToolCustody>> = null;
    try {
      savedCaller = await readChromeCallerToolCustody(
        activeStream.owner,
        message.cloudRun.runId,
        () => {
          activeStream.controller.signal.throwIfAborted();
          if (
            activeChatStreams.get(streamKey) !== activeStream ||
            isRetiredManagedCloudOwner(activeStream.owner)
          )
            throw new Error('The Managed Cloud account changed.');
        },
      );
      if (savedCaller?.binding.historyConversationId)
        assertCallerConversationLink(savedCaller.binding, message.historyConversationId);
      if (savedCaller && (savedCaller.binding.conversationContext || savedCaller.step))
        await assertCallerConversationAuthority(
          savedCaller.binding,
          message.historyConversationId,
          () =>
            isCurrentManagedCloudOperation(activeChatStreams.get(streamKey), activeStream) &&
            !isRetiredManagedCloudOwner(activeStream.owner),
          activeStream.controller.signal,
        );
    } catch {
      if (activeStream.controller.signal.aborted) return;
      broadcastManagedChatChunk(message.owner, clientInstanceId, id, {
        text: '',
        done: true,
        error:
          'Saved browser recovery state could not be verified. No browser action was repeated.',
      });
      return;
    }

    if (routing) {
      publishManagedChatChunk(streamKey, activeStream, id, {
        text: '',
        done: false,
        routing,
      });
    }
    const getCurrentResumeToken = async (): Promise<string | null> => {
      if (
        activeChatStreams.get(streamKey) !== activeStream ||
        activeStream.controller.signal.aborted
      )
        return null;
      const current = await getManagedCloudAuthContext();
      if (
        !current ||
        activeChatStreams.get(streamKey) !== activeStream ||
        !sameManagedCloudOwner(current.owner, activeStream.owner) ||
        isRetiredManagedCloudOwner(current.owner) ||
        activeStream.controller.signal.aborted
      )
        return null;
      activeStream.token = current.token;
      return current.token;
    };
    let visibleText = message.alreadyVisibleText;
    const replayPublicJournal = (
      onCallerCheckpoint?: (checkpoint: CallerToolContinuation) => void,
    ) =>
      resumeChromeManagedRun(
        {
          run: message.cloudRun,
          alreadyVisibleText: visibleText,
          ...(savedCaller ? { originalCallerToolNames: savedCaller.originalToolNames } : {}),
          signal: activeStream.controller.signal,
        },
        {
          getAuthToken: getCurrentResumeToken,
          onText: (text) => {
            visibleText += text;
            publishManagedChatChunk(streamKey, activeStream, id, { text, done: false });
          },
          ...(onCallerCheckpoint ? { onCallerCheckpoint } : {}),
          onAgentEvent: (agentEvent) =>
            publishManagedChatChunk(streamKey, activeStream, id, {
              text: '',
              done: false,
              agentEvent,
              durableReplay: true,
            }),
          onRunReference: (cloudRun) => {
            if (activeChatStreams.get(streamKey) !== activeStream) return;
            activeStream.cloudRun = { ...cloudRun };
            publishManagedChatChunk(streamKey, activeStream, id, {
              text: '',
              done: false,
              cloudRun,
            });
          },
        },
      );
    const postReceipt = async (receipt: CallerToolResumeRequest) =>
      await executeChromeManagedCallerResume(
        {
          id,
          run: message.cloudRun,
          receipt: receipt,
          originalToolNames: savedCaller!.originalToolNames,
          signal: activeStream.controller.signal,
        },
        {
          ...createChromeManagedCallerResumeDependencies(() => undefined, {
            onCallerCheckpoint: () => undefined,
            onCodeExecution: (chunk) =>
              publishManagedChatChunk(streamKey, activeStream, id, {
                text: '',
                done: false,
                codeExecution: chunk.execution,
              }),
            onGeneratedFiles: (chunk) =>
              publishManagedChatChunk(streamKey, activeStream, id, {
                text: '',
                done: false,
                generatedFiles: chunk.files,
              }),
            onInteractiveCard: (chunk) =>
              publishManagedChatChunk(streamKey, activeStream, id, {
                text: '',
                done: false,
                interactiveCard: chunk.card,
              }),
            onSources: (chunk) =>
              publishManagedChatChunk(streamKey, activeStream, id, {
                text: '',
                done: false,
                sources: { citations: chunk.citations, results: chunk.results },
              }),
            onQuotaWarning: (quotaWarning) =>
              publishManagedChatChunk(streamKey, activeStream, id, {
                text: '',
                done: false,
                quotaWarning,
              }),
            onAgentEvent: (chunk) =>
              publishManagedChatChunk(streamKey, activeStream, id, {
                text: '',
                done: false,
                agentEvent: chunk.envelope,
                ...(chunk.durableReplay ? { durableReplay: true } : {}),
              }),
            onRunReference: (cloudRun) => {
              if (activeChatStreams.get(streamKey) !== activeStream) return;
              activeStream.cloudRun = { ...cloudRun };
              publishManagedChatChunk(streamKey, activeStream, id, {
                text: '',
                done: false,
                cloudRun,
              });
            },
          }),
          getAuthToken: getCurrentResumeToken,
        },
      );
    let result:
      | Awaited<ReturnType<typeof resumeChromeManagedRun>>
      | Awaited<ReturnType<typeof executeChromeManagedCallerResume>> = { status: 'success' };
    const posted = new Set<number>();
    for (let step = 0; step <= MAX_CALLER_TOOL_STEPS; step += 1) {
      let checkpoint: CallerToolContinuation | undefined;
      result = await replayPublicJournal(
        savedCaller
          ? (value) => {
              checkpoint = value;
            }
          : undefined,
      );
      if (!checkpoint) break;
      if (step === MAX_CALLER_TOOL_STEPS || !savedCaller) {
        result = {
          status: 'error',
          code: 'server_error',
          message: 'The browser recovery step budget was exhausted.',
        };
        break;
      }
      try {
        const assertCurrent = () => {
          activeStream.controller.signal.throwIfAborted();
          if (
            !isCurrentManagedCloudOperation(activeChatStreams.get(streamKey), activeStream) ||
            isRetiredManagedCloudOwner(activeStream.owner)
          )
            throw new Error('The browser task owner changed.');
        };
        const current = await readChromeCallerToolCustody(
          activeStream.owner,
          message.cloudRun.runId,
          assertCurrent,
        );
        if (!current?.binding.historyConversationId)
          throw new Error('The original browser conversation could not be recovered.');
        savedCaller = current;
        const ready = async () => {
          const latest = await readChromeCallerToolCustody(
            activeStream.owner,
            message.cloudRun.runId,
            assertCurrent,
          );
          if (!latest || latest.requestId !== current.requestId)
            throw new Error('The original browser admission changed.');
          await assertOwnedCallerBrowserAction(
            latest,
            checkpoint!,
            message.historyConversationId,
            streamKey,
            activeStream,
          );
        };
        if (posted.has(checkpoint.next_event_sequence))
          throw new Error(
            'The browser continuation was not acknowledged. Its receipt is retained.',
          );
        const receipt = await recoverCallerToolCheckpoint({
          saved: current,
          checkpoint,
          assertCurrent,
          beforeAction: ready,
          signal: activeStream.controller.signal,
          dispatch: async (calls, cursor) => {
            const latest = await readChromeCallerToolCustody(
              activeStream.owner,
              message.cloudRun.runId,
              assertCurrent,
            );
            const browserContext = latest?.currentBrowserContext ?? latest?.binding.browserContext;
            if (!latest || !browserContext?.documentId)
              throw new Error('The original browser document is unavailable.');
            return requestChatToolHandoff(activeStream, id, calls, cursor, {
              historyConversationId: current.binding.historyConversationId!,
              projectId: current.binding.conversationContext!.projectId,
              organizationId: current.binding.conversationContext!.organizationId,
              browserContext,
              ...(latest.browserObservation ? { observation: latest.browserObservation } : {}),
            });
          },
        });
        savedCaller = await readChromeCallerToolCustody(
          activeStream.owner,
          message.cloudRun.runId,
          assertCurrent,
        );
        posted.add(checkpoint.next_event_sequence);
        result = await postReceipt(receipt);
        if (result.status !== 'success') break;
      } catch (error) {
        result = {
          status: 'error',
          code: activeStream.controller.signal.aborted ? 'cancelled' : 'server_error',
          message:
            error instanceof Error
              ? error.message
              : 'The original browser task could not be recovered.',
        };
        break;
      }
    }
    if (result.status === 'success') {
      if (
        savedCaller?.step?.state === 'completed' &&
        activeStream.cloudRun?.state === 'completed'
      ) {
        try {
          await acknowledgeCompletedCallerRun(
            activeStream.owner,
            activeStream.cloudRun,
            savedCaller.step.cursor.next_event_sequence,
            () => {
              activeStream.controller.signal.throwIfAborted();
              if (
                activeChatStreams.get(streamKey) !== activeStream ||
                isRetiredManagedCloudOwner(activeStream.owner)
              )
                throw new Error('The browser recovery owner changed.');
            },
          );
        } catch {
          logger.warn('Completed browser recovery payload cleanup was deferred', {
            runId: message.cloudRun.runId,
          });
        }
      }

      publishManagedChatChunk(streamKey, activeStream, id, {
        text: '',
        done: true,
        ...(routing ? { routing } : {}),
        ...(activeStream.cloudRun ? { cloudRun: activeStream.cloudRun } : {}),
      });
      return;
    }
    const failure: Extract<
      Awaited<ReturnType<typeof executeChromeManagedCallerResume>>,
      { status: 'error' }
    > = result;
    if (!activeStream.cancelNotified) {
      activeStream.cancelNotified = true;
      publishManagedChatChunk(streamKey, activeStream, id, {
        text: '',
        done: true,
        error: result.code === 'auth_required' ? '__AUTH_REQUIRED__' : result.message,
        errorCode: result.code,
        ...(failure.retryAfterSeconds !== undefined
          ? { errorRetryAfterSeconds: failure.retryAfterSeconds }
          : {}),
        ...(failure.requestId !== undefined ? { errorRequestId: failure.requestId } : {}),
        ...(failure.quota ? { errorQuota: failure.quota } : {}),
        ...(routing ? { routing } : {}),
        ...(activeStream.cloudRun ? { cloudRun: activeStream.cloudRun } : {}),
      });
    }
    if (result.code === 'auth_required') {
      await invalidateRejectedManagedCloudCredential(activeStream);
    }
  } finally {
    releaseChatStream(streamKey, activeStream);
  }
}

async function handleResolveChatApproval(
  message: ResolveChatApprovalMessage | ResolveChatInputMessage,
): Promise<void> {
  const { clientInstanceId, id } = message;
  let streamKey: string;
  try {
    streamKey = createChromeManagedStreamKey(clientInstanceId, id);
  } catch {
    return;
  }
  const credential = await getManagedCloudAuthContext();
  if (
    !credential ||
    isRetiredManagedCloudOwner(message.owner) ||
    isRetiredManagedCloudOwner(credential.owner) ||
    !sameManagedCloudOwner(credential.owner, message.owner)
  ) {
    broadcastManagedChatChunk(message.owner, clientInstanceId, id, {
      text: '',
      done: true,
      error: '__AUTH_REQUIRED__',
    });
    return;
  }
  if (activeChatStreams.has(streamKey)) {
    broadcastManagedChatChunk(message.owner, clientInstanceId, id, {
      text: '',
      done: true,
      error: 'This AGI Cloud run is already active.',
    });
    return;
  }

  const activeStream: ActiveChatStream = {
    clientInstanceId,
    owner: credential.owner,
    token: credential.token,
    controller: new AbortController(),
    cancelRequested: false,
    cancelNotified: false,
    cloudRun: { ...message.cloudRun },
    streamId: id,
    ...(message.historyConversationId
      ? { historyConversationId: message.historyConversationId }
      : {}),
  };
  activeChatStreams.set(streamKey, activeStream);

  try {
    const assertCurrentResume = () => {
      if (
        !isCurrentManagedCloudOperation(activeChatStreams.get(streamKey), activeStream) ||
        isRetiredManagedCloudOwner(activeStream.owner)
      )
        throw new DOMException('This browser task is no longer current.', 'AbortError');
      activeStream.controller.signal.throwIfAborted();
    };
    const savedCaller = await readChromeCallerToolCustody(
      activeStream.owner,
      message.cloudRun.runId,
      assertCurrentResume,
    );
    if (savedCaller?.terminal || savedCaller?.step?.state === 'in_flight')
      throw new Error(
        'This browser task has finished or has an uncertain action. Open its saved result before continuing.',
      );
    if (savedCaller && (savedCaller.binding.conversationContext || savedCaller.step))
      await assertCallerConversationAuthority(
        savedCaller.binding,
        message.historyConversationId,
        () =>
          isCurrentManagedCloudOperation(activeChatStreams.get(streamKey), activeStream) &&
          !isRetiredManagedCloudOwner(activeStream.owner),
        activeStream.controller.signal,
      );
    let visibleText = message.alreadyVisibleText ?? '';
    let browserPending = false;
    const onText = (text: string) => {
      visibleText += text;
      publishManagedChatChunk(streamKey, activeStream, id, { text, done: false });
    };
    const callbacks: ChromeManagedResumeCallbacks = {
      ...(savedCaller
        ? {
            onCallerCheckpoint: () => {
              browserPending = true;
            },
          }
        : {}),
      onCodeExecution: (chunk) =>
        publishManagedChatChunk(streamKey, activeStream, id, {
          text: '',
          done: false,
          codeExecution: chunk.execution,
        }),
      onAgentEvent: (chunk) =>
        publishManagedChatChunk(streamKey, activeStream, id, {
          text: '',
          done: false,
          agentEvent: chunk.envelope,
          ...(chunk.durableReplay ? { durableReplay: true } : {}),
        }),
      onGeneratedFiles: (chunk) =>
        publishManagedChatChunk(streamKey, activeStream, id, {
          text: '',
          done: false,
          generatedFiles: chunk.files,
        }),
      onInteractiveCard: (chunk) =>
        publishManagedChatChunk(streamKey, activeStream, id, {
          text: '',
          done: false,
          interactiveCard: chunk.card,
        }),
      onSources: (chunk) =>
        publishManagedChatChunk(streamKey, activeStream, id, {
          text: '',
          done: false,
          sources: { citations: chunk.citations, results: chunk.results },
        }),
      onRunReference: (cloudRun) => {
        if (activeChatStreams.get(streamKey) !== activeStream) return;
        activeStream.cloudRun = { ...cloudRun };
        publishManagedChatChunk(streamKey, activeStream, id, {
          text: '',
          done: false,
          cloudRun,
        });
      },
      onQuotaWarning: (quotaWarning) =>
        publishManagedChatChunk(streamKey, activeStream, id, {
          text: '',
          done: false,
          quotaWarning,
        }),
    };
    const getResumeToken = async () => {
      assertCurrentResume();
      const current = await getManagedCloudAuthContext();
      assertCurrentResume();
      if (!current || !sameManagedCloudOwner(current.owner, activeStream.owner)) return null;
      activeStream.token = current.token;
      return current.token;
    };
    const result =
      message.type === 'RESOLVE_CHAT_INPUT'
        ? await executeChromeManagedToolInput(
            {
              id,
              run: message.cloudRun,
              ...(savedCaller ? { originalCallerToolNames: savedCaller.originalToolNames } : {}),
              toolInputs: message.toolInputs,
              signal: activeStream.controller.signal,
            },
            {
              ...createChromeManagedToolInputDependencies(onText, callbacks),
              getAuthToken: getResumeToken,
            },
          )
        : await executeChromeManagedApproval(
            {
              id,
              run: message.cloudRun,
              ...(savedCaller ? { originalCallerToolNames: savedCaller.originalToolNames } : {}),
              toolApprovals: message.toolApprovals,
              ...(typeof message.guidance === 'string' ? { guidance: message.guidance } : {}),
              signal: activeStream.controller.signal,
            },
            {
              ...createChromeManagedApprovalDependencies(onText, callbacks),
              getAuthToken: getResumeToken,
            },
          );

    if (result.status === 'success' && browserPending) {
      await resumeOwnedManagedRun(
        {
          type: 'RESUME_CHAT_RUN',
          owner: activeStream.owner,
          clientInstanceId,
          id,
          historyConversationId: message.historyConversationId,
          cloudRun: activeStream.cloudRun ?? message.cloudRun,
          alreadyVisibleText: visibleText,
        },
        streamKey,
        activeStream,
      );
      return;
    }
    if (result.status === 'success') {
      publishManagedChatChunk(streamKey, activeStream, id, {
        text: '',
        done: true,
        ...(activeStream.cloudRun ? { cloudRun: activeStream.cloudRun } : {}),
      });
      return;
    }
    if (!activeStream.cancelNotified) {
      activeStream.cancelNotified = true;
      publishManagedChatChunk(streamKey, activeStream, id, {
        text: '',
        done: true,
        error: result.code === 'auth_required' ? '__AUTH_REQUIRED__' : result.message,
        errorCode: result.code,
        ...(result.retryAfterSeconds !== undefined
          ? { errorRetryAfterSeconds: result.retryAfterSeconds }
          : {}),
        ...(result.requestId !== undefined ? { errorRequestId: result.requestId } : {}),
        ...(result.quota ? { errorQuota: result.quota } : {}),
        ...(activeStream.cloudRun ? { cloudRun: activeStream.cloudRun } : {}),
      });
    }
    if (result.code === 'auth_required') {
      await invalidateRejectedManagedCloudCredential(activeStream);
    }
  } catch (error) {
    if (!activeStream.cancelNotified) {
      activeStream.cancelNotified = true;
      publishManagedChatChunk(streamKey, activeStream, id, {
        text: '',
        done: true,
        error: error instanceof Error ? error.message : 'The saved run could not be continued.',
        errorCode: activeStream.controller.signal.aborted ? 'cancelled' : 'server_error',
        ...(activeStream.cloudRun ? { cloudRun: activeStream.cloudRun } : {}),
      });
    }
  } finally {
    releaseChatStream(streamKey, activeStream);
  }
}

function inPagePromptFailure(
  outcome: InPagePromptOutcome,
  message: string,
  retryable = false,
): InPagePromptResponse {
  return { success: false, outcome, message, retryable };
}

function mapInPagePromptFailure(
  result: Extract<ChromeManagedChatResult, { status: 'error' }>,
): InPagePromptResponse {
  switch (result.code) {
    case 'auth_required':
      return inPagePromptFailure('signed_out', 'Sign in to use AGI Managed Cloud.');
    case 'plan_required':
      return inPagePromptFailure('plan_required', result.message);
    case 'quota_exceeded':
      return inPagePromptFailure('quota_exceeded', result.message);
    case 'account_unavailable':
      return inPagePromptFailure('account_unavailable', result.message, true);
    case 'account_suspended':
      return inPagePromptFailure('account_unavailable', result.message);
    case 'terms_required':
      return inPagePromptFailure('terms_required', result.message);
    case 'rate_limited':
      return inPagePromptFailure(
        'rate_limited',
        streamFailureText(result.message, {
          ...(result.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: result.retryAfterSeconds }
            : {}),
        }),
        true,
      );
    case 'cancelled':
      return inPagePromptFailure('cancelled', 'Request cancelled.');
    case 'invalid_request':
    case 'model_not_admitted':
    case 'model_refused':
    case 'policy_blocked':
      return inPagePromptFailure('request_rejected', result.message);
    default:
      return inPagePromptFailure('retryable_error', result.message, true);
  }
}

function cancelInPagePrompts(tabId: number, requestId?: string): void {
  for (const active of activeChatStreams.values()) {
    if (active.inPageTabId !== tabId) continue;
    if (requestId !== undefined && active.inPageRequestId !== requestId) continue;
    active.cancelRequested = true;
    active.controller.abort();
  }
}

function cancelInPagePromptsOnUnapprovedOrigins(): void {
  for (const active of activeChatStreams.values()) {
    if (active.inPageTabId === undefined) continue;
    if (active.inPageOrigin && isOriginApprovedForAutomation(active.inPageOrigin)) continue;
    active.cancelRequested = true;
    active.controller.abort();
  }
}

const MAX_CLOSED_IN_PAGE_REQUESTS = 50;
const closedInPageRequests = new Set<string>();

function handleInPagePromptPort(port: chrome.runtime.Port): void {
  if (!port.name.startsWith(IN_PAGE_PROMPT_PORT_PREFIX)) return;
  const tabId = port.sender?.tab?.id;
  if (port.sender?.id !== chrome.runtime.id || typeof tabId !== 'number') {
    port.disconnect();
    return;
  }
  const requestId = port.name.slice(IN_PAGE_PROMPT_PORT_PREFIX.length);
  port.onDisconnect.addListener(() => {
    closedInPageRequests.add(requestId);
    if (closedInPageRequests.size > MAX_CLOSED_IN_PAGE_REQUESTS) {
      const oldest = closedInPageRequests.values().next().value;
      if (oldest !== undefined) closedInPageRequests.delete(oldest);
    }
    cancelInPagePrompts(tabId, requestId);
  });
}

async function handleInPagePrompt(
  prompt: string,
  pageContext?: string,
  senderUrl?: string,
  senderTabId?: number,
  requestId?: string,
): Promise<InPagePromptResponse> {
  if (!prompt.trim()) {
    return inPagePromptFailure('request_rejected', 'Enter a question or choose a page action.');
  }
  if (requestId !== undefined && closedInPageRequests.has(requestId)) {
    return inPagePromptFailure('cancelled', 'Request cancelled.');
  }
  let credential: Awaited<ReturnType<typeof getManagedCloudAuthContext>>;
  try {
    credential = await getManagedCloudAuthContext();
  } catch (error) {
    return inPagePromptFailure(
      'account_unavailable',
      error instanceof Error ? error.message : 'Could not verify the AGI account.',
      true,
    );
  }
  if (!credential || isRetiredManagedCloudOwner(credential.owner)) {
    return inPagePromptFailure('signed_out', 'Sign in to use AGI Managed Cloud.');
  }
  const systemPrompt = senderUrl ? (getPlatformPrompt(senderUrl) ?? undefined) : undefined;

  let responseText = '';
  const id = `in_page:${crypto.randomUUID()}`;
  const streamKey = createChromeManagedStreamKey('in_page', id);
  const activeStream: ActiveChatStream = {
    clientInstanceId: 'in_page',
    owner: credential.owner,
    token: credential.token,
    controller: new AbortController(),
    cancelRequested: false,
    cancelNotified: false,
    ...(senderTabId !== undefined ? { inPageTabId: senderTabId } : {}),
    ...(senderUrl ? { inPageOrigin: originOfUrl(senderUrl) } : {}),
    ...(requestId !== undefined ? { inPageRequestId: requestId } : {}),
  };
  activeChatStreams.set(streamKey, activeStream);
  let result: ChromeManagedChatResult;
  try {
    result = await executeChromeManagedChat(
      {
        id,
        text: prompt,
        pageContext,
        modelSelection: 'auto',
        systemPrompt,
        completionMode: 'unattended',
        signal: activeStream.controller.signal,
      },
      {
        ...createChromeManagedChatDependencies(
          (chunk) => {
            if (activeChatStreams.get(streamKey) === activeStream) responseText += chunk;
          },
          {
            onRunReference: (cloudRun) => {
              if (activeChatStreams.get(streamKey) === activeStream) {
                activeStream.cloudRun = { ...cloudRun };
              }
            },
          },
        ),
        getAuthToken: async () => credential.token,
      },
    );
    if (result.status === 'error' && result.code === 'auth_required') {
      await invalidateRejectedManagedCloudCredential(activeStream);
    }
  } catch (error) {
    return inPagePromptFailure(
      'retryable_error',
      error instanceof Error ? error.message : 'AGI Managed Cloud request failed.',
      true,
    );
  } finally {
    releaseChatStream(streamKey, activeStream);
  }

  if (result.status === 'success') {
    return {
      success: true,
      text: responseText || 'AGI Managed Cloud completed the request without a text response.',
      provider: 'managed_cloud',
      modelSelection: 'auto',
    };
  }
  return mapInPagePromptFailure(result);
}

function isValidMessage(message: unknown): message is ExtensionMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as Record<string, unknown>;
  return typeof msg['type'] === 'string';
}

initialize();
installBackgroundErrorReporting();
void flushAutomationAuditOutbox();
const lostComputerUseRunRecovery = recoverLostComputerUseRun({
  stopInputWatch: (tabId) =>
    chrome.tabs.sendMessage(tabId, { type: 'AGI_CU_WATCH_INPUT', watching: false }),
  detachDebugger: (tabId) => chrome.debugger.detach({ tabId }),
  ungroupTab: ungroupLostComputerUseTab,
  announce: (marker) =>
    sendComputerUseLifecycle({
      type: 'AGI_CU_STATE',
      status: 'error',
      reason: WORKER_RESTARTED_REASON,
      runId: marker.runId,
      runGeneration: marker.runGeneration,
      tabId: marker.tabIds[marker.tabIds.length - 1],
    }),
}).catch((error) => {
  logger.warn('A browser task lost with the previous worker could not be cleaned up', error);
  return null;
});

// chrome.debugger.onDetach has to be attached in the worker's first turn: a
// user pressing Cancel on Chrome's debugging bar wakes a worker that would
// otherwise register the listener only once a run started.
ensureOnDetachListener();

for (const retired of RETIRED_ALARM_NAMES) {
  void chrome.alarms.clear(retired);
}

watchCloudMirroringEnabled();
void settleMaintenanceAlarm();
void sendChromeHeartbeatIfDue();
chrome.runtime.onConnect.addListener(() => {
  void sendChromeHeartbeatIfDue();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === MAINTENANCE_ALARM) {
    void settleMaintenanceAlarm();
    return;
  }

  if (alarm.name.startsWith(TASK_ALARM_PREFIX)) {
    const taskId = alarm.name.slice(TASK_ALARM_PREFIX.length);
    const expectedGeneration = scheduledTaskExecutions.generation(taskId);
    void loadScheduledTasks()
      .then(async (tasks) => {
        const task = tasks.find((t) => t.id === taskId);
        if (!task?.enabled) {
          // Chrome keeps an alarm until it is cleared, so a deleted or disabled
          // task went on waking the worker on its old period forever.
          await chrome.alarms.clear(alarm.name);
          return;
        }
        await executeScheduledTask(task, expectedGeneration);
      })
      .catch((err) => {
        logger.warn(`Failed to load/execute scheduled task ${taskId}`, err);
      });
  }
});

chrome.runtime.onSuspendCanceled.addListener(() => {
  _bgCtx.nativeSuspendInProgress = false;
});

chrome.runtime.onSuspend.addListener(() => {
  _bgCtx.nativeSuspendInProgress = true;
  clearNativeReconnectTimer();

  if (!state.nativePort) {
    return;
  }

  try {
    state.nativePort.disconnect();
  } catch (error) {
    logger.debug('Native disconnect on suspend failed', error);
  }
});
