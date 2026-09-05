import type {
  ConnectionStatus,
  ExtensionMessage,
  ExtensionResponse,
  InPagePromptMessage,
  InPagePromptOutcome,
  InPagePromptResponse,
  ScheduledTask,
} from './types';
import { logger, RateLimiter, withTimeout, storageUtils, sleep } from './utils';
import { t } from './i18n';
import { describeComputerUseAction } from './features/computer-use/describeAction';
import { timingSafeEqual } from '@agiworkforce/utils/crypto';
import {
  loadShortcuts,
  handleSaveShortcut,
  handleListShortcuts,
  handleDeleteShortcut,
  planShortcutReplay,
} from './features/background/shortcuts';
import { validateShortcutReplayTarget } from './features/shortcuts/origin';
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
import {
  deliverPageCapture,
  pageCaptureFailureMessage,
  PAGE_CAPTURE_UNAVAILABLE_MESSAGE,
  PAGE_CAPTURE_UNDELIVERED_TITLE,
} from './features/background/page-capture';
import {
  beginScheduledTaskRunJournal,
  canResumeScheduledTaskRunJournal,
  loadScheduledTaskRunJournals,
  removeScheduledTaskRunJournal,
  updateScheduledTaskRunJournal,
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
import {
  publishAuthorizedScheduledTaskNotification,
  scheduledTaskNotificationAuthority,
} from './features/background/scheduled-task-notifications';
import { getPlatformPrompt } from './features/content/platform-prompts';
import { migrateAutofillProfile } from './features/content/autofill/filler';
import { memoryList, memoryAdd, memoryUpdate, memoryDelete } from './background/memory-bridge';
import { runAgentLoop } from './features/computer-use/agentLoop';
import {
  ComputerUseRunCoordinator,
  ComputerUseStartCoordinator,
  type ComputerUseCancellationReason,
  type ComputerUseRunLease,
} from './features/computer-use/runOwnership';
import {
  BROWSER_CONTROL_CONSENT_STORAGE_KEY,
  browserControlConsentRequiredMessage,
  hasBrowserControlConsent,
  sanitizeBrowserControlConsent,
} from './features/computer-use/browserControlConsent';
import {
  DISCOVERY_MESSAGE_TYPES,
  DOM_MUTATION_MESSAGE_TYPES,
  EXTENSION_PAGE_ONLY_MESSAGE_TYPES,
  ORIGIN_EXTENSION_PAGE,
  SITE_ALLOWLIST_STORAGE_KEY,
  isTrustedExtensionPageSender,
  normalizeWebMCPToolsUpdate,
  resolveMessageTargetTabId,
  validateBridgeUrl,
  type NormalizedWebMCPToolsUpdate,
} from './background/policy';
import {
  CONTEXT_HANDOFF_DESTINATION,
  CONTEXT_HANDOFF_STORAGE_KEY,
  createSelectionContextHandoff,
  isPendingContextHandoff,
  toApprovedNativeSelectionMessage,
} from './features/context-handoff';
import {
  createChromeManagedStreamKey,
  createChromeManagedChatDependencies,
  createChromeManagedApprovalDependencies,
  executeChromeManagedChat,
  executeChromeManagedApproval,
  normalizeChromeManagedRoutingMetadata,
  type ChromeManagedChatResult,
} from './features/cloud-bridge/managedChatHandler';
import { purgeLegacyProviderCredentials } from './features/security/legacyProviderCredentials';
import { parseManagedChatPortName } from './features/cloud-bridge/managedChatPort';
import {
  cancelChromeManagedRun,
  findChromeManagedRunByRequestId,
  resumeChromeManagedRun,
} from './features/cloud-bridge/managedRunControl';
import {
  getManagedCloudAuthContext,
  getManagedModelAccess,
} from './features/cloud-bridge/freeTrialClient';
import {
  abortConversationSyncForOwnerChange,
  queueCloudConversationDeletion,
  scheduleConversationSync,
  sweepConversationSync,
  SYNC_SWEEP_ALARM,
} from './features/cloud-bridge/conversationSync';
import { watchCloudMirroringEnabled } from './features/privacy/cloudMirroring';
import { installBackgroundErrorReporting } from './features/observability/errorReporting';
import { resolveComputerUseModel } from './features/computer-use/cloudAgentClient';
import { signOutClerkIfCurrent } from './features/cloud-bridge/clerkAuth';
import {
  isCurrentManagedCloudOperation,
  managedCloudOwnerKey,
  normalizeManagedCloudOwner,
  selectManagedCloudCancellationCredential,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from './features/cloud-bridge/managedCloudAuthority';

interface BackgroundState {
  isNativeConnected: boolean;
  nativePort: chrome.runtime.Port | null;
  connectionStatus: ConnectionStatus;
  lastNativeError: string | null;
  rateLimiter: RateLimiter;
  messageQueue: ExtensionMessage[];
  isProcessingQueue: boolean;
}

interface NativeMessageEnvelope {
  id: string;
  type: string;
  success?: boolean;
  error?: string;
  data?: unknown;
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
  messageQueue: [],
  isProcessingQueue: false,
};

interface ActiveChatStream {
  clientInstanceId: string;
  owner: ManagedCloudOwner;
  token: string;
  controller: AbortController;
  cancelRequested: boolean;
  cancelNotified: boolean;
  requestId?: string;
  cloudRun?: import('@agiworkforce/cloud-contracts').ManagedCloudAgentRunReference;
}

const activeChatStreams = new Map<string, ActiveChatStream>();
const scheduledTaskExecutions = new ScheduledTaskExecutionCoordinator();
interface ActiveScheduledRecovery {
  taskId: string;
  requestId: string;
  owner: ManagedCloudOwner;
  token: string;
  controller: AbortController;
  cloudRun?: import('@agiworkforce/cloud-contracts').ManagedCloudAgentRunReference;
}
const activeScheduledRecoveries = new Map<string, ActiveScheduledRecovery>();
const scheduledTaskCancellationAttempts = new ScheduledTaskCancellationAttemptCoordinator();
const abandonedScheduledTaskRequestIds = new Set<string>();
const retiredManagedCloudOwners = new Set<string>();
const SCHEDULED_RECOVERY_MAX_ATTEMPTS = 3;
const SCHEDULED_HEARTBEAT_INTERVAL_MS = 20_000;

const computerUseRuns = new ComputerUseRunCoordinator();
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
  });
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
  input: Omit<import('./types').ChatChunkMessage, 'type' | 'owner' | 'clientInstanceId' | 'id'>,
): void {
  const chunk: import('./types').ChatChunkMessage = {
    type: 'CHAT_CHUNK',
    owner,
    clientInstanceId,
    id,
    ...input,
  };
  chrome.runtime.sendMessage(chunk).catch(() => {
    // The extension view may have closed while the server-owned run continues.
  });
}

function publishManagedChatChunk(
  streamKey: string,
  active: ActiveChatStream,
  id: string,
  input: Omit<import('./types').ChatChunkMessage, 'type' | 'owner' | 'clientInstanceId' | 'id'>,
): void {
  if (!isCurrentManagedCloudOperation(activeChatStreams.get(streamKey), active)) return;
  broadcastManagedChatChunk(active.owner, active.clientInstanceId, id, input);
}

async function cancelManagedCloudRunWithCapturedCredential(
  active: Pick<ActiveChatStream, 'token' | 'cloudRun'>,
): Promise<boolean> {
  if (!active.cloudRun) return true;
  try {
    const cancellation = await withTimeout(
      cancelChromeManagedRun(active.cloudRun, {
        getAuthToken: async () => active.token,
      }),
      15_000,
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
  let cleared = false;
  try {
    cleared = await signOutClerkIfCurrent({ owner: rejected.owner, token: rejected.token });
  } catch (error) {
    logger.warn('Failed to clear the exact rejected Managed Cloud credential', error);
    teardownErrors.push(error);
  }
  if (cleared) {
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
  }
>();
const pendingContextHandoffApprovals = new Set<string>();

const webmcpToolsByTab = new Map<
  number,
  {
    tools: import('./types').WebMCPToolInfo[];
    url: string;
    timestamp: number;
    navigationGeneration: number;
  }
>();
const webmcpNavigationGenerationByTab = new Map<number, number>();
const nlwebByTab = new Map<
  number,
  {
    nlweb: import('./nlweb').NLWebDetectionResult;
    url: string;
    timestamp: number;
  }
>();

const NATIVE_HOST_NAME = 'com.agiworkforce.browser';
const NATIVE_REQUEST_TIMEOUT_MS = 10000;
const CONTENT_SCRIPT_FORWARD_TIMEOUT_MS = 30000;
const NATIVE_CONNECT_MAX_WAIT_MS = 2000;
const NATIVE_RECONNECT_BASE_DELAY_MS = 1000;
const NATIVE_RECONNECT_MAX_DELAY_MS = 30000;
const NATIVE_RECONNECT_MAX_ATTEMPTS = 8;
const NATIVE_CONNECT_POLL_INTERVAL_MS = 100;
const TAB_GROUP_NAME = 'AGI Workforce';

export interface SharedBackgroundContext {
  nativeReconnectTimer: ReturnType<typeof setTimeout> | null;
  nativeReconnectAttempt: number;
  nativeHandshakeInFlight: boolean;
  nativeReconnectGaveUp: boolean;
  nativeSuspendInProgress: boolean;
}

function createSharedBackgroundContext(): SharedBackgroundContext {
  return {
    nativeReconnectTimer: null,
    nativeReconnectAttempt: 0,
    nativeHandshakeInFlight: false,
    nativeReconnectGaveUp: false,
    nativeSuspendInProgress: false,
  };
}

const _bgCtx: SharedBackgroundContext = createSharedBackgroundContext();

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

function clearNativeReconnectTimer(): void {
  if (_bgCtx.nativeReconnectTimer) {
    clearTimeout(_bgCtx.nativeReconnectTimer);
    _bgCtx.nativeReconnectTimer = null;
  }
}

function resetNativeReconnectState(): void {
  _bgCtx.nativeReconnectAttempt = 0;
  _bgCtx.nativeReconnectGaveUp = false;
  clearNativeReconnectTimer();
}

async function triggerManualReconnect(): Promise<ExtensionResponse> {
  resetNativeReconnectState();

  if (state.nativePort) {
    try {
      state.nativePort.disconnect();
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

  if (_bgCtx.nativeReconnectAttempt >= NATIVE_RECONNECT_MAX_ATTEMPTS) {
    logger.warn('Max native reconnect attempts reached; giving up until user action', { trigger });
    _bgCtx.nativeReconnectGaveUp = true;
    state.connectionStatus = 'disconnected';
    void notifyConnectionStatusChange();
    return;
  }

  const delay = Math.min(
    NATIVE_RECONNECT_BASE_DELAY_MS * 2 ** Math.max(_bgCtx.nativeReconnectAttempt - 1, 0),
    NATIVE_RECONNECT_MAX_DELAY_MS,
  );

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
  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.runtime.onConnect.addListener(handleManagedChatKeepalivePort);
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
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch((err) => {
    logger.warn('setPanelBehavior(openPanelOnActionClick) failed', err);
  });
  setupContextMenu();
  connectToNativeHost();
  checkDesktopConnection();
  void restoreScheduledTaskAlarms()
    .then(recoverScheduledTaskRuns)
    .catch((error) => logger.warn('Failed to restore scheduled Managed Cloud work', error));
  void migrateAutofillProfile().catch((err) => {
    logger.debug('Autofill profile migration failed (non-fatal)', err);
  });
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
    for (const [streamKey, active] of activeChatStreams) {
      if (active.clientInstanceId !== clientInstanceId) continue;
      active.cancelRequested = true;
      active.controller.abort();
      activeChatStreams.delete(streamKey);
      void cancelManagedCloudRunWithCapturedCredential(active);
    }
  });
}

function connectToNativeHost(): void {
  if (state.nativePort || _bgCtx.nativeHandshakeInFlight || _bgCtx.nativeReconnectGaveUp) {
    return;
  }

  try {
    state.connectionStatus = 'connecting';
    void notifyConnectionStatusChange();

    logger.info('Connecting to native host', { host: NATIVE_HOST_NAME });
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    port.onMessage.addListener(handleNativeMessage);
    port.onDisconnect.addListener(handleNativeDisconnect);

    state.nativePort = port;
    state.isNativeConnected = false;
    state.lastNativeError = null;
    _bgCtx.nativeHandshakeInFlight = true;

    void (async () => {
      try {
        const connectResult = (await sendNativeRequest({
          type: 'connect',
          extension_id: chrome.runtime.id,
        })) as unknown as NativeResponseEnvelope;
        if (!connectResult?.success) {
          throw new Error(connectResult?.error ?? 'Native connect handshake failed');
        }
        if (!nativeSessionSecret) {
          throw new Error('Native host did not negotiate an authenticated session');
        }

        const pingResult = (await sendNativeRequest({
          type: 'ping',
        })) as unknown as NativeResponseEnvelope;
        if (!pingResult?.success) {
          throw new Error(pingResult?.error ?? 'Native ping failed');
        }

        state.isNativeConnected = true;
        _bgCtx.nativeReconnectAttempt = 0;
        _bgCtx.nativeReconnectGaveUp = false;
        clearNativeReconnectTimer();
        state.connectionStatus = 'connected';
        void notifyConnectionStatusChange();

        if (state.messageQueue.length > 0 && !state.isProcessingQueue) {
          state.isProcessingQueue = true;
          const queued = state.messageQueue.splice(0);
          for (const msg of queued) {
            try {
              await handleMessage(msg, {} as chrome.runtime.MessageSender, () => {});
            } catch (err) {
              logger.debug('Failed to drain queued message during reconnect', err);
            }
          }
          state.isProcessingQueue = false;
        }
      } catch (error) {
        logger.warn('Native host handshake failed', error);
        try {
          port.disconnect();
        } catch (disconnectError) {
          logger.debug('Native port disconnect after handshake failure failed', disconnectError);
        }
        state.isNativeConnected = false;
        state.connectionStatus = 'disconnected';
        state.nativePort = null;
        state.lastNativeError = error instanceof Error ? error.message : 'Native handshake failed';
        void notifyConnectionStatusChange();
        scheduleNativeReconnect('handshake_failed');
      } finally {
        _bgCtx.nativeHandshakeInFlight = false;
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
    scheduleNativeReconnect('connect_failed');
  }
}

function createRequestId(): string {
  return `${Date.now()}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

interface NativeRequestOptions {
  timeoutMs?: number;
  requireAuthenticatedSession?: boolean;
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
        if (
          !activePort ||
          state.nativePort !== activePort ||
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
          pendingRequests.delete(id);
          reject(new Error(`Native request timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        pendingRequests.set(id, {
          resolve,
          reject,
          timeout,
          allowUnsignedResponse: isConnectRequest && !activeSessionSecret,
        });

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

function handleNativeMessage(message: NativeMessageEnvelope): void {
  // The connect handshake carries session_secret (the raw HMAC key); never log the envelope.
  logger.debug('Received native message', {
    id: message?.id,
    type: message?.type,
    success: message?.success,
  });

  const maybeSecret = (message as unknown as Record<string, unknown>)['session_secret'];
  if (typeof maybeSecret === 'string' && !nativeSessionSecret) {
    setNativeSessionSecret(maybeSecret);
  }

  if (message && message.id && pendingRequests.has(message.id)) {
    const request = pendingRequests.get(message.id);
    if (request) {
      const { resolve, reject, timeout } = request;
      clearTimeout(timeout);
      pendingRequests.delete(message.id);

      const respMac = (message as unknown as Record<string, unknown>)['mac'];
      const respTs = (message as unknown as Record<string, unknown>)['timestamp'];
      if (nativeSessionSecret) {
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
        void computeEnvelopeMac(message.id, respTs, body).then((expected) => {
          if (expected === null || !timingSafeEqual(expected, respMac)) {
            logger.warn(
              '[native-mac] Response MAC mismatch, rejecting (potential shuffle attack)',
              { id: message.id },
            );
            reject(new Error('Native response MAC mismatch'));
            return;
          }
          if (message.success === false) {
            reject(new Error(message.error ?? 'Native request failed'));
          } else {
            resolve(message as unknown as ExtensionResponse);
          }
        });
        return;
      }

      if (!request.allowUnsignedResponse) {
        reject(new Error('Native response arrived without an authenticated session'));
        return;
      }
      if (message.success === false) {
        reject(new Error(message.error ?? 'Native request failed'));
      } else {
        resolve(message as unknown as ExtensionResponse);
      }
    }
  }
}

function handleNativeDisconnect(): void {
  nativeSessionSecret = null;
  const error = chrome.runtime.lastError?.message || 'Native host disconnected';
  logger.warn('Native host disconnected', { error });

  for (const [requestId, pending] of pendingRequests.entries()) {
    clearTimeout(pending.timeout);
    pending.reject(new Error(error));
    pendingRequests.delete(requestId);
  }

  state.nativePort = null;
  state.isNativeConnected = false;
  state.connectionStatus = 'disconnected';
  state.lastNativeError = error;

  void notifyConnectionStatusChange();

  if (_bgCtx.nativeSuspendInProgress) {
    return;
  }

  const isPermanentError =
    error.includes('Native host not found') ||
    error.includes('Specified native messaging host not found') ||
    error.includes('Access to the specified native messaging host is forbidden') ||
    error.includes('not allowed');
  if (isPermanentError) {
    logger.warn('Native host permanently unavailable; halting reconnect', { error });
    _bgCtx.nativeReconnectGaveUp = true;
    return;
  }

  scheduleNativeReconnect('native_disconnect');
}

function showNotification(
  title: string,
  message: string,
  tabId?: number,
  conversationId?: string,
  conversationOwner?: ManagedCloudOwner,
): void {
  if (!chrome.notifications?.create) return;
  const notifId = `agi_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  chrome.notifications.create(
    notifId,
    {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message,
    },
    () => {
      if (chrome.runtime.lastError) {
        logger.debug('Notification create failed', chrome.runtime.lastError.message);
      }
    },
  );
  if (tabId) {
    chrome.storage.session.set({ [`agi_notif_${notifId}`]: tabId }).catch(() => {});
  }
  if (conversationId && conversationOwner) {
    void linkNotificationToConversation(notifId, conversationOwner, conversationId);
  }
}

async function taskNotificationsEnabled(): Promise<boolean> {
  try {
    const { agi_task_notifications: enabled } = await chrome.storage.local.get({
      agi_task_notifications: true,
    });
    return enabled !== false;
  } catch {
    return true;
  }
}

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
          iconUrl: 'icons/icon48.png',
          title: 'AGI Task Running',
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
    if (tab?.id && chrome.sidePanel) {
      chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    }
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

async function handleReplayShortcut(
  message: import('./types').ReplayShortcutMessage,
  expectedOwner?: ManagedCloudOwner,
  notify = true,
): Promise<ExtensionResponse> {
  const shortcuts = await loadShortcuts();
  const shortcut = shortcuts.find((s) => s.id === message.shortcutId);
  if (!shortcut) {
    return { success: false, error: 'Shortcut not found' } as ExtensionResponse;
  }
  if (
    shortcut.createdByOrigin &&
    shortcut.createdByOrigin !== ORIGIN_EXTENSION_PAGE &&
    !siteAllowlistCache.has(shortcut.createdByOrigin)
  ) {
    logger.warn('Auto-deleting shortcut whose origin is no longer allowlisted', {
      shortcutId: shortcut.id,
      createdByOrigin: shortcut.createdByOrigin,
    });
    await handleDeleteShortcut({
      type: 'DELETE_SHORTCUT',
      shortcutId: shortcut.id,
    } as import('./types').DeleteShortcutMessage);
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
    const safePrompt = plan.prompt.slice(0, TASK_PROMPT_MAX_CHARS);
    const chatMsg: Omit<import('./types').ChatMessageMessage, 'owner'> & {
      owner?: ManagedCloudOwner;
    } = {
      type: 'CHAT_MESSAGE',
      clientInstanceId: SHORTCUT_REPLAY_CLIENT_ID,
      id: `shortcut_${shortcut.id}_${crypto.randomUUID()}`,
      text: safePrompt,
      timestamp: Date.now(),
      modelSelection: 'auto',
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
          'Shortcut Replayed',
          snippet ? `"${shortcut.name}": ${snippet}` : `"${shortcut.name}" finished`,
          undefined,
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
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    return { success: false, error: 'No active tab' } as ExtensionResponse;
  }
  const replayTarget = validateShortcutReplayTarget(shortcut, activeTab.url);
  if (!replayTarget.ok) {
    return { success: false, error: replayTarget.error } as ExtensionResponse;
  }
  const taskId = `replay_${Date.now()}`;
  const result = await forwardToContentScript(activeTab.id, {
    type: 'RUN_PAGE_ACTIONS',
    tabId: activeTab.id,
    taskId,
    actions: shortcut.actions,
  } as ExtensionMessage);
  if (result.success && notify) {
    showNotification('Shortcut Replayed', `"${shortcut.name}" completed`);
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

async function getExactScheduledMutationCredential(
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
): Promise<unknown> {
  const cloudRun = state.journal.cloudRun;
  if (!cloudRun) return scheduledTaskError('server_error', 'The durable Cloud run is missing.');

  const transcript: string[] = [];
  const result = await resumeChromeManagedRun(
    { run: cloudRun, alreadyVisibleText: '', signal },
    {
      getAuthToken: async () => credential.token,
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
  const state = { journal: initialJournal, answer: '' };
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
    if (updated) state.journal = updated;
    if (admissionSignal?.aborted) {
      return {
        result: scheduledTaskError('cancelled', 'The scheduled task lost account authority.'),
        answer: '',
        journal: state.journal,
      };
    }
    if (!state.journal.cloudRun) {
      const recoveredRun = await findChromeManagedRunByRequestId(
        state.journal.requestId,
        {
          getAuthToken: async () => credential.token,
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
      return await resumeScheduledTaskJournal(state, delivery, credential, controller.signal);
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
          undefined,
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
  knownRun?: import('@agiworkforce/cloud-contracts').ManagedCloudAgentRunReference,
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

export const MAINTENANCE_ALARM = 'agi-maintenance';
const MAINTENANCE_PERIOD_MINUTES = 1;

/**
 * Alarms earlier versions registered unconditionally. Chrome keeps an alarm
 * across worker restarts and browser restarts, so an upgraded install would go
 * on firing them at a handler that no longer exists unless they are cleared.
 */
const RETIRED_ALARM_NAMES = ['keep-alive', SYNC_SWEEP_ALARM];

let maintenanceAlarmArmed = false;

function armMaintenanceAlarm(): void {
  if (maintenanceAlarmArmed) return;
  maintenanceAlarmArmed = true;
  chrome.alarms.create(MAINTENANCE_ALARM, { periodInMinutes: MAINTENANCE_PERIOD_MINUTES }, () => {
    if (chrome.runtime.lastError) {
      maintenanceAlarmArmed = false;
      logger.warn('Failed to create maintenance alarm', chrome.runtime.lastError.message);
    }
  });
}

function disarmMaintenanceAlarm(): void {
  maintenanceAlarmArmed = false;
  void chrome.alarms.clear(MAINTENANCE_ALARM);
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
    if (await sweepConversationSync()) outstanding = true;
  } catch (error) {
    logger.debug('Conversation sync sweep failed', error);
    outstanding = true;
  }

  if (!_bgCtx.nativeReconnectGaveUp && !state.isNativeConnected) {
    void connectToNativeHost();
    outstanding = true;
  }

  return outstanding;
}

async function settleMaintenanceAlarm(): Promise<void> {
  if (await runMaintenancePass()) armMaintenanceAlarm();
  else disarmMaintenanceAlarm();
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
    const managedPrompt = task ? await scheduledTaskManagedPrompt(task) : undefined;
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
    if (
      task.createdByOrigin &&
      task.createdByOrigin !== ORIGIN_EXTENSION_PAGE &&
      !siteAllowlistCache.has(task.createdByOrigin)
    ) {
      logger.warn('Auto-deleting scheduled task whose origin is no longer allowlisted', {
        taskId: task.id,
        createdByOrigin: task.createdByOrigin,
      });
      await handleDeleteScheduledTask(
        {
          type: 'DELETE_SCHEDULED_TASK',
          taskId: task.id,
        } as import('./types').DeleteScheduledTaskMessage,
        task.managedCloudAccountId,
        () => {
          scheduledTaskExecutions.invalidate(task.id);
        },
      );
      const journal = (await loadScheduledTaskRunJournals()).find(
        (candidate) => candidate.taskId === task.id,
      );
      if (journal) await abandonScheduledTaskRun(journal, await getManagedCloudAuthContext());
      return;
    }

    if (lease.controller.signal.aborted || !scheduledTaskExecutions.isCurrent(lease)) {
      throw new ScheduledTaskCancelledError();
    }
    let managedCredential:
      | NonNullable<Awaited<ReturnType<typeof getManagedCloudAuthContext>>>
      | undefined;
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
      result = await handleReplayShortcut(
        {
          type: 'REPLAY_SHORTCUT',
          shortcutId: task.shortcutId,
        } as import('./types').ReplayShortcutMessage,
        undefined,
        false,
      );
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
    if (error instanceof ScheduledTaskCancelledError || lease.controller.signal.aborted) {
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

// EXT-1, EXT-2 (audit 2026-05-03): allowlist-based sender validation.
//
// The previous implementation accepted any tab as a valid sender. Combined
// with the content-script `<all_urls>` match, every web page the user
// visits could fire privileged background commands. This meant any XSS
// on any visited page = full extension takeover.
//
// We now gate by an explicit user-managed origin allowlist stored under
// `chrome.storage.local.agi_site_allowlist`. Extension pages (popup,
// side panel, options) remain trusted; tab-originated messages are
// trusted only if the tab's origin is on the list.
// SECURITY (H-1): PING and GET_AGI_BRIDGE_URL previously bypassed origin checks.
// Removed both from the discovery bypass set. Extension-origin senders (popup,
// side panel) are already trusted via the `!sender.tab` branch in
// isAllowlistedSender(). Content scripts on arbitrary pages must NOT receive
// responses to fingerprinting probes.
// DISCOVERY_MESSAGE_TYPES now imported from `./background/policy` (audit 2026-05-19).
export const SITE_NOT_APPROVED_MESSAGE =
  'This site is not on your AGI Workforce approved-sites list. ' +
  'Open the extension options and use the "Approved sites" section to add this origin, then reload.';

let siteAllowlistCache = new Set<string>();
let siteAllowlistLoaded = false;
// Held rather than dropped: the message that wakes a dormant MV3 worker arrives
// before this read resolves, and a floating promise left that first message
// deciding against an empty set.
const siteAllowlistReady: Promise<void> = chrome.storage.local
  .get(SITE_ALLOWLIST_STORAGE_KEY)
  .then((res) => {
    const list = res[SITE_ALLOWLIST_STORAGE_KEY];
    if (Array.isArray(list)) {
      siteAllowlistCache = new Set(list as string[]);
    }
  })
  .catch(() => {})
  .finally(() => {
    siteAllowlistLoaded = true;
  });
function cancelActiveRunUnlessOriginStillApproved(approvedOrigins: ReadonlySet<string>): void {
  const lease = computerUseRuns.getActive();
  if (!lease) return;
  try {
    if (approvedOrigins.has(new URL(lease.tabIntentUrl).origin)) return;
  } catch {
    // Invalid stored intent is handled by the same fail-closed cancellation.
  }
  computerUseStartGeneration += 1;
  cancelActiveComputerUseRun('tab_intent_changed', lease.runId);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[SITE_ALLOWLIST_STORAGE_KEY]) return;
  const next = changes[SITE_ALLOWLIST_STORAGE_KEY].newValue;
  siteAllowlistCache = new Set(Array.isArray(next) ? (next as string[]) : []);
  cancelActiveRunUnlessOriginStillApproved(siteAllowlistCache);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[BROWSER_CONTROL_CONSENT_STORAGE_KEY]) return;
  cancelActiveRunUnlessOriginStillApproved(
    new Set(sanitizeBrowserControlConsent(changes[BROWSER_CONTROL_CONSENT_STORAGE_KEY].newValue)),
  );
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

async function assertComputerUseOwnership(lease: ComputerUseRunLease): Promise<string> {
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

  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(lease.tabId);
  } catch {
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
  if (!siteAllowlistCache.has(origin)) {
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

  if (lease.windowId !== undefined) {
    const activeTabs = await chrome.tabs.query({ active: true, windowId: lease.windowId });
    computerUseRuns.assertCurrent(lease);
    if (activeTabs[0]?.id !== lease.tabId) {
      rejectComputerUseOwnership(lease, 'tab_intent_changed');
    }
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
  return siteAllowlistCache.has(origin);
}

function senderTabAllowedToMutate(
  sender: chrome.runtime.MessageSender,
  targetTabId: number | undefined,
): boolean {
  if (typeof targetTabId !== 'number') return true;
  return sender?.tab?.id === targetTabId;
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

  if (!isAllowlistedSender(sender, msg.type)) {
    if (!siteAllowlistLoaded) {
      // This message may be the one that woke a dormant worker, arriving before
      // the cached allowlist read landed. Decide again once it does, rather
      // than rejecting an approved origin on its first page load and making the
      // user reload to get a working extension.
      void siteAllowlistReady.then(() => {
        if (!isAllowlistedSender(sender, msg.type)) {
          logger.warn('Rejected message from non-allowlisted sender', {
            url: sender?.tab?.url,
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
      url: sender?.tab?.url,
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
        url: sender?.tab?.url,
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

  if (msg.type === 'OPEN_SIDE_PANEL' && sender.tab?.id != null && chrome.sidePanel?.open) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch((err) => {
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

async function handleMessageAsync(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<ExtensionResponse> {
  logger.debug('Processing message', { type: message.type, sender: sender.url });

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
    case 'GET_CLOUD_AUTH_TOKEN': {
      const candidate = await getManagedCloudAuthContext(message.refresh);
      const context = candidate && !isRetiredManagedCloudOwner(candidate.owner) ? candidate : null;
      cancelComputerUseIfAuthChanged(context?.owner ?? null);
      return {
        success: true,
        ...(context ? { token: context.token, owner: context.owner } : {}),
      } as ExtensionResponse;
    }

    case 'MANAGED_CLOUD_AUTH_CHANGED': {
      const previousOwner = normalizeManagedCloudOwner(
        (message as import('./types').ManagedCloudAuthChangedMessage).previousOwner,
      );
      if (!previousOwner) {
        return { success: false, error: 'Invalid Managed Cloud owner' } as ExtensionResponse;
      }
      retireManagedCloudOwner(previousOwner);
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
      return { success: true } as ExtensionResponse;
    }

    case 'GET_CONNECTION_STATUS':
      if (
        !state.isNativeConnected &&
        !_bgCtx.nativeHandshakeInFlight &&
        !_bgCtx.nativeReconnectGaveUp
      ) {
        connectToNativeHost();
      }
      if (state.isNativeConnected) {
        void sendNativeRequest({ type: 'ping' }).catch((error) => {
          logger.warn('Native ping failed during status check', error);
          state.isNativeConnected = false;
          state.connectionStatus = 'disconnected';
          state.nativePort = null;
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
      const approval = message as import('./types').ApproveContextHandoffMessage;
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
      const cancellation = message as import('./types').CancelContextHandoffMessage;
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

    case 'QUEUE_MESSAGE': {
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }
      if (!resolvedTabId) {
        logger.warn('QUEUE_MESSAGE: no active tab');
        return { success: false, error: 'No active tab' } as ExtensionResponse;
      }
      const msgEntry = message as import('./types').QueueMessageMessage;
      try {
        await sendNativeRequest({
          type: 'QUEUE_MESSAGE',
          id: msgEntry.id,
          text: msgEntry.text,
          tabId: resolvedTabId,
          timestamp: msgEntry.timestamp,
        });
        return { success: true } as ExtensionResponse;
      } catch (err: unknown) {
        logger.warn('QUEUE_MESSAGE native send failed', err);
        return { success: false, error: 'Native send failed' } as ExtensionResponse;
      }
    }

    case 'CHAT_MESSAGE': {
      const chatMsg = message as import('./types').ChatMessageMessage;
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
      const resumeMsg = message as import('./types').ResumeChatRunMessage;
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

    case 'RESOLVE_CHAT_APPROVAL': {
      const approvalMsg = message as import('./types').ResolveChatApprovalMessage;
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

    case 'CANCEL_STREAM': {
      const cancelMsg = message as import('./types').CancelStreamMessage;
      const owner = normalizeManagedCloudOwner(cancelMsg.owner);
      if (!owner) return { success: false, error: 'Invalid Managed Cloud owner' };
      let streamKey: string;
      try {
        streamKey = createChromeManagedStreamKey(cancelMsg.clientInstanceId, cancelMsg.id);
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
      if (active) {
        active.cancelRequested = true;
        active.controller.abort();
      }
      if (!active?.cancelNotified) {
        if (active) active.cancelNotified = true;
        broadcastManagedChatChunk(owner, cancelMsg.clientInstanceId, cancelMsg.id, {
          text: '',
          done: true,
          error: 'Cancelled.',
          ...(cloudRun ? { cloudRun } : {}),
        });
      }
      if (cloudRun) {
        const currentCredential = active ? null : await getManagedCloudAuthContext();
        const credential = selectManagedCloudCancellationCredential(
          owner,
          active ? { token: active.token, owner: active.owner } : null,
          currentCredential,
        );
        if (!credential) {
          return { success: false, error: 'Managed Cloud stream owner changed' };
        }
        const cancellation = await cancelChromeManagedRun(cloudRun, {
          getAuthToken: async () => credential.token,
        });
        if (cancellation.status === 'error') {
          logger.warn('Managed Cloud run cancellation failed', {
            runId: cloudRun.runId,
            error: cancellation.message,
          });
        }
      }
      return { success: true } as ExtensionResponse;
    }

    case 'OPEN_SIDE_PANEL': {
      let resolvedTabId = tabId;
      if (chrome.sidePanel && !resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }
      if (chrome.sidePanel && resolvedTabId) {
        chrome.sidePanel.open({ tabId: resolvedTabId }).catch(() => {});
      } else if (!resolvedTabId) {
        logger.warn('OPEN_SIDE_PANEL: no active tab');
      }
      return { success: true } as ExtensionResponse;
    }

    case 'CAPTURE_SCREENSHOT': {
      let resolvedTabId = tabId;
      let resolvedWindowId = windowId;

      if (sender.tab) {
        resolvedTabId = sender.tab.id;
        resolvedWindowId = sender.tab.windowId;
      } else if (!resolvedTabId || resolvedWindowId === undefined) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = resolvedTabId ?? activeTab?.id;
        resolvedWindowId = resolvedWindowId ?? activeTab?.windowId;
      }

      if (!resolvedTabId && resolvedWindowId === undefined) {
        return {
          success: false,
          error: 'No active tab/window for screenshot',
        } as ExtensionResponse;
      }

      try {
        const screenshotMsg = message as ExtensionMessage & {
          format?: 'png' | 'jpeg';
          quality?: number;
        };
        const options: { format?: 'png' | 'jpeg'; quality?: number } = {
          format: screenshotMsg.format ?? 'png',
          quality: screenshotMsg.quality ?? 90,
        };
        const canvas =
          resolvedWindowId !== undefined
            ? await chrome.tabs.captureVisibleTab(resolvedWindowId, options)
            : await chrome.tabs.captureVisibleTab(options);

        return {
          success: true,
          data: canvas,
          tabId: resolvedTabId,
          timestamp: Date.now(),
        } as ExtensionResponse;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Screenshot failed',
        } as ExtensionResponse;
      }
    }

    case 'SET_COOKIE': {
      const cookieMsg = message as import('./types').SetCookieMessage;
      return handleSetCookie(cookieMsg);
    }

    case 'GET_ALL_TABS': {
      return handleGetAllTabs();
    }

    case 'CREATE_TAB': {
      const tabMsg = message as import('./types').CreateTabMessage;
      return handleCreateTab(tabMsg);
    }

    case 'CLOSE_TAB': {
      const tabMsg = message as import('./types').CloseTabMessage;
      return handleCloseTab(tabMsg);
    }

    case 'SWITCH_TAB': {
      const tabMsg = message as import('./types').SwitchTabMessage;
      return handleSwitchTab(tabMsg);
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
    case 'SET_RECORDING_VALUE_CAPTURE' as ExtensionMessage['type']: {
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

    case 'SELECT_OPTION':
    case 'CHECK':
    case 'UNCHECK':
    case 'FOCUS':
    case 'BLUR':
    case 'HOVER':
    case 'SCROLL':
    case 'DRAG_DROP':
    case 'CLICK_AT_COORDINATES': {
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
      const discoveryRequest = message as import('./types').WebMCPDiscoverToolsMessage;
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
      const navigationGeneration = currentWebMCPNavigationGeneration(resolvedTabId);
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
      const toolsMsg = message as import('./types').WebMCPToolsChangedMessage;
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

    case 'NLWEB_DETECTED': {
      const nlwebMsg = message as import('./types').NLWebDetectedMessage;
      const nlwebTabId = sender?.tab?.id;
      if (nlwebTabId) {
        nlwebByTab.set(nlwebTabId, {
          nlweb: nlwebMsg.nlweb,
          url: nlwebMsg.url || '',
          timestamp: Date.now(),
        });
        logger.info('NLWeb detected on tab', {
          tabId: nlwebTabId,
          url: nlwebMsg.url,
          endpoints: nlwebMsg.nlweb.endpoints.length,
        });
        chrome.runtime
          .sendMessage({
            type: 'NLWEB_DETECTED',
            nlweb: nlwebMsg.nlweb,
            url: nlwebMsg.url,
          })
          .catch(() => {
            // Popup / side panel may not be open; ignore
          });
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
      return handleSaveShortcut(message as import('./types').SaveShortcutMessage);

    case 'LIST_SHORTCUTS':
      return handleListShortcuts();

    case 'DELETE_SHORTCUT':
      return handleDeleteShortcut(message as import('./types').DeleteShortcutMessage);

    case 'REPLAY_SHORTCUT':
      return handleReplayShortcut(message as import('./types').ReplayShortcutMessage);

    case 'CREATE_SCHEDULED_TASK': {
      const createMessage = message as import('./types').CreateScheduledTaskMessage;
      const requiresManagedCloud = await scheduledTaskUsesManagedCloud(createMessage.task);
      const requestedOwner = requiresManagedCloud
        ? normalizeManagedCloudOwner(createMessage.owner)
        : null;
      const credential = requiresManagedCloud
        ? await getExactScheduledMutationCredential(requestedOwner)
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
      const listMessage = message as import('./types').ListScheduledTasksMessage;
      const requestedOwner = normalizeManagedCloudOwner(listMessage.owner);
      const credential = requestedOwner
        ? await getExactScheduledMutationCredential(requestedOwner)
        : null;
      return handleListScheduledTasks(
        credential && requestedOwner ? requestedOwner.accountId : undefined,
      );
    }

    case 'UPDATE_SCHEDULED_TASK': {
      const updateMessage = message as import('./types').UpdateScheduledTaskMessage;
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
        ? await getExactScheduledMutationCredential(requestedOwner)
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
      const deleteMessage = message as import('./types').DeleteScheduledTaskMessage;
      const existing = (await loadScheduledTasks()).find(
        (task) => task.id === deleteMessage.taskId,
      );
      const touchesManagedCloud = existing?.managedCloudAccountId !== undefined;
      const requestedOwner = touchesManagedCloud
        ? normalizeManagedCloudOwner(deleteMessage.owner)
        : null;
      const credential = touchesManagedCloud
        ? await getExactScheduledMutationCredential(requestedOwner)
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

    case 'NLWEB_PROBE' as ExtensionMessage['type']: {
      const probe = message as unknown as { probeUrl?: string; method?: 'GET' | 'HEAD' };
      const probeUrl = probe.probeUrl;
      const method = probe.method ?? 'HEAD';
      if (!probeUrl || typeof probeUrl !== 'string') {
        return { success: false, error: 'Missing probeUrl' } as ExtensionResponse;
      }
      if (!isAllowedProbeUrl(probeUrl)) {
        return { success: false, error: 'Probe URL not allowed' } as ExtensionResponse;
      }
      if (!sender.tab?.url) {
        return {
          success: false,
          error: 'NLWeb probes can only originate from a content script.',
        } as ExtensionResponse;
      }
      try {
        const senderOrigin = new URL(sender.tab.url).origin;
        const probeOrigin = new URL(probeUrl).origin;
        if (probeOrigin !== senderOrigin) {
          logger.warn('Rejected cross-origin NLWEB_PROBE', {
            senderOrigin,
            probeOrigin,
          });
          return {
            success: false,
            error: "NLWeb probes are restricted to the page's own origin.",
          } as ExtensionResponse;
        }
      } catch {
        return { success: false, error: 'Invalid probe URL' } as ExtensionResponse;
      }
      {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        try {
          const resp = await fetch(probeUrl, {
            method,
            signal: controller.signal,
            credentials: 'omit',
            cache: 'no-store',
          });
          const headers: Record<string, string> = {};
          resp.headers.forEach((value, key) => {
            headers[key.toLowerCase()] = value;
          });
          let body: string | undefined;
          if (method === 'GET' && resp.ok) {
            try {
              const raw = await resp.text();
              body = raw.substring(0, MAX_PROBE_RESPONSE_BYTES);
            } catch {
              /* non-fatal */
            }
          }
          return { success: true, status: resp.status, headers, body } as ExtensionResponse;
        } catch (e) {
          return {
            success: false,
            error: e instanceof Error ? e.message : 'Probe fetch failed',
          } as ExtensionResponse;
        } finally {
          clearTimeout(timeoutId);
        }
      }
    }

    case 'IN_PAGE_PROMPT': {
      const { prompt, pageContext } = message as InPagePromptMessage;
      return handleInPagePrompt(
        typeof prompt === 'string' ? prompt : '',
        typeof pageContext === 'string' ? pageContext : undefined,
        sender.tab?.url ?? sender.url,
      );
    }

    case 'LIST_MEMORIES' as ExtensionMessage['type']: {
      const memories = await memoryList();
      return { success: true, memories } as ExtensionResponse;
    }

    case 'ADD_MEMORY' as ExtensionMessage['type']: {
      const addPayload = message as unknown as { content?: string };
      const addContent = typeof addPayload.content === 'string' ? addPayload.content : '';
      if (!addContent.trim()) {
        return { success: false, error: 'Memory content is required' } as ExtensionResponse;
      }
      const added = await memoryAdd(addContent);
      if (!added) {
        return {
          success: false,
          error: 'Memory limit reached or content empty',
        } as ExtensionResponse;
      }
      return { success: true, memory: added } as ExtensionResponse;
    }

    case 'UPDATE_MEMORY' as ExtensionMessage['type']: {
      const upPayload = message as unknown as { id?: string; content?: string };
      const upId = typeof upPayload.id === 'string' ? upPayload.id : '';
      const upContent = typeof upPayload.content === 'string' ? upPayload.content : '';
      if (!upId || !upContent.trim()) {
        return {
          success: false,
          error: 'Memory id and content are required',
        } as ExtensionResponse;
      }
      const updated = await memoryUpdate(upId, upContent);
      if (!updated) {
        return { success: false, error: 'Memory not found' } as ExtensionResponse;
      }
      return { success: true, memory: updated } as ExtensionResponse;
    }

    case 'DELETE_MEMORY' as ExtensionMessage['type']: {
      const delPayload = message as unknown as { id?: string };
      const delId = typeof delPayload.id === 'string' ? delPayload.id : '';
      if (!delId) {
        return { success: false, error: 'Memory id is required' } as ExtensionResponse;
      }
      const deleted = await memoryDelete(delId);
      return {
        success: deleted,
        error: deleted ? undefined : 'Memory not found',
      } as ExtensionResponse;
    }

    case 'GET_QUICK_MODE' as ExtensionMessage['type']: {
      return { success: true, enabled: quickModeCache } as ExtensionResponse;
    }

    case 'SET_QUICK_MODE' as ExtensionMessage['type']: {
      const qmMsg = message as import('./types').SetQuickModeMessage;
      quickModeCache = qmMsg.enabled === true;
      await chrome.storage.local.set({ agi_quick_mode: quickModeCache });
      return { success: true, enabled: quickModeCache } as ExtensionResponse;
    }

    case 'SYNC_CONVERSATION' as ExtensionMessage['type']: {
      const syncMsg = message as import('./types').SyncConversationMessage;
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

    case 'DELETE_CLOUD_CONVERSATION' as ExtensionMessage['type']: {
      const delCloudMsg = message as import('./types').DeleteCloudConversationMessage;
      const delOwner = normalizeManagedCloudOwner(delCloudMsg.owner);
      if (!delOwner || isRetiredManagedCloudOwner(delOwner)) {
        return { success: false, error: 'Invalid Managed Cloud owner' } as ExtensionResponse;
      }
      const queued = await queueCloudConversationDeletion(
        delOwner,
        delCloudMsg.cloudConversationId,
        delCloudMsg.organizationId,
      );
      return queued
        ? ({ success: true } as ExtensionResponse)
        : ({ success: false, error: 'Could not queue account chat deletion' } as ExtensionResponse);
    }

    case 'AGI_START_COMPUTER_USE' as ExtensionMessage['type']: {
      const cuMsg = message as import('./types').StartComputerUseMessage;
      const cuTabId = cuMsg.tabId;
      const cuGoal = typeof cuMsg.goal === 'string' ? cuMsg.goal.slice(0, 4096) : '';
      const cuRunId =
        typeof cuMsg.runId === 'string' && /^cu_run_[A-Za-z0-9_-]{1,128}$/.test(cuMsg.runId)
          ? cuMsg.runId
          : null;

      if (!cuGoal) {
        return {
          success: false,
          error: 'AGI_START_COMPUTER_USE: goal is required',
        } as ExtensionResponse;
      }
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

      const startGeneration = ++computerUseStartGeneration;
      computerUseStarts.begin(cuRunId, startGeneration);
      cancelActiveComputerUseRun('superseded');

      const failStart = (error: string): ExtensionResponse => {
        if (isCurrentComputerUseStart(cuRunId, startGeneration)) {
          clearPendingComputerUseStart(cuRunId);
        }
        return { success: false, error } as ExtensionResponse;
      };

      const startWasCancelled = (): boolean => !isCurrentComputerUseStart(cuRunId, startGeneration);

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
      if (!siteAllowlistCache.has(cuOrigin)) {
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

      let askPref: Record<string, unknown>;
      try {
        askPref = await chrome.storage.local.get('agi_cu_ask_before_acting');
      } catch {
        return failStart('AGI_START_COMPUTER_USE: approval preference could not be loaded');
      }
      const askBeforeActing = askPref['agi_cu_ask_before_acting'] !== false;
      if (startWasCancelled()) {
        return failStart('AGI_START_COMPUTER_USE: superseded or cancelled before admission');
      }

      const computerUseModel = resolveComputerUseModel(
        await getManagedModelAccess(authContext.token)
          .then((access) => access.subscriptionTier)
          .catch(() => null),
      );
      if (startWasCancelled()) {
        return failStart('AGI_START_COMPUTER_USE: superseded or cancelled before admission');
      }

      clearPendingComputerUseStart(cuRunId);
      const lease = computerUseRuns.begin({
        runId: cuRunId,
        generation: Date.now() * 1_000 + (startGeneration % 1_000),
        tabId: cuTabId,
        ...(cuTab.windowId === undefined ? {} : { windowId: cuTab.windowId }),
        tabIntentUrl: cuTab.url,
        authOwner: authContext.owner,
        credential: authContext.token,
      });

      const onBeforeAction = askBeforeActing
        ? async (
            toolName: string,
            args: Record<string, unknown>,
            signal?: AbortSignal,
          ): Promise<boolean> => {
            const requestId = `cu_approve_${crypto.randomUUID()}`;
            broadcastComputerUseForCurrentRun(lease, {
              type: 'AGI_CU_APPROVE_REQUEST',
              requestId,
              toolName,
              description: describeComputerUseAction(toolName, args),
            });
            const decision = await new Promise<boolean>((resolve, reject) => {
              let settled = false;
              const cleanup = (): void => {
                clearTimeout(timeout);
                signal?.removeEventListener('abort', onAbort);
                chrome.runtime.onMessage.removeListener(listener);
              };
              const finish = (allowed: boolean): void => {
                if (settled) return;
                settled = true;
                cleanup();
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
              }, 30_000);
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
                  finish((msg as Record<string, unknown>)['allowed'] === true);
                }
              }
              chrome.runtime.onMessage.addListener(listener);
              signal?.addEventListener('abort', onAbort, { once: true });
              if (signal?.aborted) onAbort();
            });
            return decision;
          }
        : undefined;

      const completion = runAgentLoop(cuGoal, cuTabId, {
        model: computerUseModel,
        signal: lease.controller.signal,
        assertOwnership: () => assertComputerUseOwnership(lease).then(() => undefined),
        resolveOwnedCredential: () => assertComputerUseOwnership(lease),
        onActionStateChange: (active) => updateComputerUseActionState(lease, active),
        onDebuggerDetachedByUser: () => {
          computerUseStartGeneration += 1;
          cancelActiveComputerUseRun('debugger_detached', lease.runId);
        },
        onBeforeAction,
        onProgress: (step) => {
          broadcastComputerUseForCurrentRun(lease, { type: 'AGI_CU_STEP', step });
        },
        onUsageUpdate: (usage) => {
          broadcastComputerUseForCurrentRun(lease, { type: 'AGI_CU_USAGE', usage });
        },
      });
      computerUseRuns.trackCompletion(lease, completion);
      void completion.then(
        () => {
          if (!computerUseRuns.finish(lease)) return;
          sendComputerUseLifecycle({
            type: 'AGI_CU_STATE',
            status: 'completed',
            runId: lease.runId,
            runGeneration: lease.generation,
            tabId: lease.tabId,
          });
        },
        (err: unknown) => {
          if (!computerUseRuns.finish(lease)) return;
          const errMsg = err instanceof Error ? err.message : String(err);
          logger.error('Computer-use agent loop error', err);
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

    case 'GET_COMPUTER_USE_STATE' as ExtensionMessage['type']: {
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
      } as ExtensionResponse;
    }

    case 'CANCEL_COMPUTER_USE' as ExtensionMessage['type']: {
      const cancelMessage = message as import('./types').CancelComputerUseMessage;
      const rawExpectedRunId = cancelMessage.runId;
      if (
        rawExpectedRunId !== undefined &&
        (typeof rawExpectedRunId !== 'string' ||
          !/^cu_run_[A-Za-z0-9_-]{1,128}$/.test(rawExpectedRunId))
      ) {
        return {
          success: false,
          running: computerUseRuns.getActive() !== null || computerUseStarts.getPending() !== null,
          error: 'CANCEL_COMPUTER_USE: invalid runId',
        } as ExtensionResponse;
      }
      const expectedRunId = rawExpectedRunId;
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
      const newUrl = (message as import('./types').BridgeUrlChangedMessage).url?.trim();
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

type CookieBlockEntry = { value: string; mode: 'exact' | 'suffix' | 'substring' };

const BLOCKED_COOKIE_DOMAINS: ReadonlyArray<CookieBlockEntry> = [
  { value: 'bank', mode: 'substring' },
  { value: 'paypal', mode: 'substring' },
  { value: 'venmo', mode: 'substring' },
  { value: 'chase', mode: 'substring' },
  { value: 'wellsfargo', mode: 'substring' },
  { value: 'citibank', mode: 'substring' },
  { value: 'fidelity', mode: 'substring' },
  { value: 'schwab', mode: 'substring' },
  { value: 'coinbase', mode: 'substring' },
  { value: 'binance', mode: 'substring' },
  { value: 'kraken', mode: 'substring' },
  { value: 'stripe.com', mode: 'suffix' },
  { value: 'plaid.com', mode: 'suffix' },
  { value: 'gov', mode: 'suffix' },
  { value: 'mil', mode: 'suffix' },
  { value: 'healthcare', mode: 'substring' },
  { value: 'medical', mode: 'substring' },
  { value: 'health.com', mode: 'suffix' },
  { value: 'aws.amazon.com', mode: 'suffix' },
  { value: 'console.cloud.google.com', mode: 'suffix' },
  { value: 'portal.azure.com', mode: 'suffix' },
  { value: 'github.com', mode: 'suffix' },
  { value: 'gitlab.com', mode: 'suffix' },
  { value: 'bitbucket.org', mode: 'suffix' },
  { value: 'accounts.google.com', mode: 'suffix' },
  { value: 'login.microsoftonline.com', mode: 'suffix' },
  { value: 'auth0.com', mode: 'suffix' },
  { value: 'okta.com', mode: 'suffix' },
  { value: 'mail.google.com', mode: 'suffix' },
  { value: 'outlook.live.com', mode: 'suffix' },
  { value: 'outlook.office.com', mode: 'suffix' },
  { value: 'facebook.com', mode: 'suffix' },
  { value: 'twitter.com', mode: 'suffix' },
  { value: 'x.com', mode: 'suffix' },
  { value: 'instagram.com', mode: 'suffix' },
  { value: 'linkedin.com', mode: 'suffix' },
  { value: 'slack.com', mode: 'suffix' },
  { value: 'notion.so', mode: 'suffix' },
  { value: 'figma.com', mode: 'suffix' },
  { value: 'lever.co', mode: 'suffix' },
  { value: 'greenhouse.io', mode: 'suffix' },
  { value: 'workday.com', mode: 'suffix' },
  { value: 'agiworkforce.com', mode: 'suffix' },
];

function matchCookieBlock(hostname: string, entry: CookieBlockEntry): boolean {
  const value = entry.value.toLowerCase();
  switch (entry.mode) {
    case 'exact':
      return hostname === value;
    case 'suffix':
      return hostname === value || hostname.endsWith(`.${value}`);
    case 'substring':
      return hostname.includes(value);
  }
}

function isCookieDomainAllowed(urlOrDomain: string): boolean {
  if (!urlOrDomain) return false;
  let hostname: string;
  try {
    const normalized = urlOrDomain.includes('://')
      ? urlOrDomain
      : `https://${(urlOrDomain.split('/')[0] ?? '').toLowerCase()}`;
    hostname = new URL(normalized).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (!hostname) return false;
  return !BLOCKED_COOKIE_DOMAINS.some((entry) => matchCookieBlock(hostname, entry));
}

async function handleSetCookie(
  message: import('./types').SetCookieMessage,
): Promise<ExtensionResponse> {
  try {
    const { name, value, domain, path, secure, httpOnly, url } = message.cookie;
    const targetUrl = url || (domain ? `https://${domain}` : undefined);
    if (!targetUrl) {
      return {
        success: false,
        error: 'Must specify url or domain for cookie.',
      } as ExtensionResponse;
    }
    if (!isCookieDomainAllowed(targetUrl)) {
      return {
        success: false,
        error: 'Setting cookies for this domain is blocked for security.',
      } as ExtensionResponse;
    }
    await chrome.cookies.set({
      url: targetUrl,
      name,
      value,
      domain,
      path: path || '/',
      secure: secure !== false,
      httpOnly: httpOnly !== false,
    });
    return { success: true } as ExtensionResponse;
  } catch (error) {
    logger.error('Failed to set cookie', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set cookie',
    } as ExtensionResponse;
  }
}

async function handleGetAllTabs(): Promise<ExtensionResponse> {
  try {
    const tabs = await chrome.tabs.query({});
    const tabsInfo = tabs.map((tab) => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      active: tab.active,
      windowId: tab.windowId,
      status: tab.status,
    }));
    return { success: true, data: tabsInfo } as ExtensionResponse;
  } catch (error) {
    logger.error('Failed to get all tabs', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get tabs',
    } as ExtensionResponse;
  }
}

async function handleCreateTab(
  message: import('./types').CreateTabMessage,
): Promise<ExtensionResponse> {
  try {
    const tab = await chrome.tabs.create({
      url: message.url,
      active: message.active !== false,
    });
    if (tab.id) {
      void ensureTabGroup(tab.id);
    }
    return {
      success: true,
      data: {
        id: tab.id,
        url: tab.url,
        title: tab.title,
      },
    } as ExtensionResponse;
  } catch (error) {
    logger.error('Failed to create tab', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create tab',
    } as ExtensionResponse;
  }
}

async function handleCloseTab(
  message: import('./types').CloseTabMessage,
): Promise<ExtensionResponse> {
  try {
    await chrome.tabs.remove(message.tabId);
    return { success: true } as ExtensionResponse;
  } catch (error) {
    logger.error('Failed to close tab', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close tab',
    } as ExtensionResponse;
  }
}

async function handleSwitchTab(
  message: import('./types').SwitchTabMessage,
): Promise<ExtensionResponse> {
  try {
    await chrome.tabs.update(message.tabId, { active: true });
    return { success: true } as ExtensionResponse;
  } catch (error) {
    logger.error('Failed to switch tab', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to switch tab',
    } as ExtensionResponse;
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
      await storageUtils.setItem('connectedToDesktop', true);
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
  await storageUtils.setItem('connectedToDesktop', false);
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

function setupContextMenu(): void {
  if (!chrome.contextMenus?.removeAll || !chrome.contextMenus?.create) {
    logger.warn('contextMenus API unavailable; skipping context menu setup');
    return;
  }

  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      logger.warn('contextMenus.removeAll failed', chrome.runtime.lastError.message);
    }
  });

  const menuItems: chrome.contextMenus.CreateProperties[] = [
    { id: 'ask-agi-workforce', title: t('menuAskAgi'), contexts: ['selection'] },
    { id: 'explain-selection', title: t('menuExplainSelection'), contexts: ['selection'] },
    { id: 'translate-selection', title: t('menuTranslateSelection'), contexts: ['selection'] },
    { id: 'summarize-page', title: t('menuSummarizePage'), contexts: ['page'] },
    { id: 'capture-element', title: t('menuCaptureElement'), contexts: ['all'] },
    { id: 'get-element-info', title: t('menuGetElementInfo'), contexts: ['all'] },
    { id: 'discover-webmcp-tools', title: t('menuDiscoverWebmcpTools'), contexts: ['all'] },
    { id: 'add-to-tab-group', title: t('menuAddToTabGroup'), contexts: ['page'] },
    // Phase 3: 'open-agi-controls' context-menu item removed. All pairing,
    // allowlist, and memory controls are now in the side-panel ⋮ settings drawer.
  ];

  for (const item of menuItems) {
    chrome.contextMenus.create(item, () => {
      if (chrome.runtime.lastError) {
        logger.warn(
          `contextMenus.create(${item.id ?? 'unknown'}) failed`,
          chrome.runtime.lastError.message,
        );
      }
    });
  }

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;

    if (info.menuItemId === 'capture-element') {
      chrome.tabs
        .sendMessage(tab.id, {
          type: 'CAPTURE_ELEMENT',
        })
        .catch((err: unknown) => {
          logger.warn('Failed to send CAPTURE_ELEMENT to tab', err);
        });
    } else if (info.menuItemId === 'get-element-info') {
      chrome.tabs
        .sendMessage(tab.id, {
          type: 'GET_ELEMENT_INFO',
        })
        .catch((err: unknown) => {
          logger.warn('Failed to send GET_ELEMENT_INFO to tab', err);
        });
    } else if (info.menuItemId === 'discover-webmcp-tools') {
      const discoveryTabId = tab.id;
      const discoveryTabUrl = tab.url;
      const navigationGeneration = currentWebMCPNavigationGeneration(discoveryTabId);
      chrome.tabs.sendMessage(
        discoveryTabId,
        { type: 'WEBMCP_DISCOVER_TOOLS' },
        (response: { tools?: unknown; url?: unknown } | undefined) => {
          if (chrome.runtime.lastError) {
            logger.warn('WebMCP discover failed', chrome.runtime.lastError.message);
            return;
          }
          void chrome.tabs
            .get(discoveryTabId)
            .then((currentTab) => {
              if (
                typeof discoveryTabUrl !== 'string' ||
                currentTab.url !== discoveryTabUrl ||
                navigationGeneration !== currentWebMCPNavigationGeneration(discoveryTabId)
              ) {
                logger.debug('Discarded stale WebMCP context-menu discovery');
                return;
              }
              const normalized = normalizeWebMCPToolsUpdate(
                response?.tools,
                response?.url,
                discoveryTabUrl,
              );
              if (!normalized) {
                logger.warn('WebMCP context-menu discovery returned invalid metadata');
                return;
              }
              publishNormalizedWebMCPToolsUpdate(discoveryTabId, normalized, navigationGeneration);
            })
            .catch((error) => {
              logger.debug('WebMCP context-menu tab lookup failed', error);
            });
        },
      );
    } else if (info.menuItemId === 'ask-agi-workforce' && info.selectionText && tab.id) {
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
        void chrome.sidePanel?.open({ tabId: pending.tabId }).catch((error: unknown) => {
          logger.warn('Failed to open selected-context preview', error);
          showNotification(
            'Context preview ready',
            'Open the AGI side panel to review and approve the selected context.',
          );
        });
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
            timestamp: Date.now(),
          },
        })
        .catch((err) => {
          logger.warn('Failed to store pending chat (explain)', err);
        });
      if (chrome.sidePanel) {
        chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
      }
    } else if (info.menuItemId === 'translate-selection' && info.selectionText && tab.id) {
      chrome.storage.session
        .set({
          agi_pending_chat: {
            type: 'translate',
            text: info.selectionText,
            url: info.pageUrl ?? '',
            timestamp: Date.now(),
          },
        })
        .catch((err) => {
          logger.warn('Failed to store pending chat (translate)', err);
        });
      if (chrome.sidePanel) {
        chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
      }
    } else if (info.menuItemId === 'summarize-page' && tab.id) {
      chrome.storage.session
        .set({
          agi_pending_chat: {
            type: 'summarize',
            text: '',
            url: info.pageUrl ?? '',
            timestamp: Date.now(),
          },
        })
        .catch((err) => {
          logger.warn('Failed to store pending chat (summarize)', err);
        });
      if (chrome.sidePanel) {
        chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
      }
    } else if (info.menuItemId === 'add-to-tab-group' && tab.id) {
      void ensureTabGroup(tab.id);
    }
  });
}

function sendNativeMessage(message: Record<string, unknown>): Promise<void> {
  return sendNativeRequest(message)
    .then(() => undefined)
    .catch((err: unknown) => {
      logger.warn('sendNativeMessage failed', err);
    });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  const lease = computerUseRuns.getActive();
  if (lease?.tabId === tabId) {
    computerUseStartGeneration += 1;
    cancelActiveComputerUseRun('tab_removed', lease.runId);
  }
  state.rateLimiter.reset(tabId);
  webmcpToolsByTab.delete(tabId);
  webmcpNavigationGenerationByTab.delete(tabId);
  nlwebByTab.delete(tabId);
  logger.debug('Cleaned up rate limit, webmcp tools, and nlweb for tab', { tabId });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const lease = computerUseRuns.getActive();
  if (
    lease?.tabId === tabId &&
    typeof changeInfo.url === 'string' &&
    changeInfo.url !== lease.tabIntentUrl &&
    !lease.actionInFlight
  ) {
    computerUseStartGeneration += 1;
    cancelActiveComputerUseRun('tab_intent_changed', lease.runId);
  }
  if (changeInfo.url === undefined && changeInfo.status !== 'loading') return;
  invalidateWebMCPToolsForNavigation(tabId);
  nlwebByTab.delete(tabId);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  const lease = computerUseRuns.getActive();
  if (
    !lease ||
    lease.windowId === undefined ||
    activeInfo.windowId !== lease.windowId ||
    activeInfo.tabId === lease.tabId
  ) {
    return;
  }
  computerUseStartGeneration += 1;
  cancelActiveComputerUseRun('tab_intent_changed', lease.runId);
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

    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
      quality: 90,
    });

    const tabId = tab.id;
    await deliverPageCapture({
      send: () =>
        sendNativeRequest({ type: 'page_capture', dataUrl, tabId, timestamp: Date.now() }),
      readActionCount: async () => {
        const stats = await storageUtils.getItem<{ actionCount: number }>('stats', {
          actionCount: 0,
        });
        return stats?.actionCount ?? 0;
      },
      writeActionCount: (actionCount) => storageUtils.setItem('stats', { actionCount }),
      notify: showNotification,
    });
  } catch (error) {
    logger.error('Failed to capture page', error);
    showNotification(
      PAGE_CAPTURE_UNDELIVERED_TITLE,
      pageCaptureFailureMessage(error instanceof Error ? error.message : ''),
    );
  }
}

const MAX_PROBE_RESPONSE_BYTES = 262_144;

function isPrivateOrReservedHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '');

  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fd')) return true;

  if (h === 'localhost' || h === '0.0.0.0') return true;

  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return true;
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 127) return true;
    if (a === 0) return true;
  }

  return false;
}

function isAllowedProbeUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (isPrivateOrReservedHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function handleChatMessage(
  message: Omit<import('./types').ChatMessageMessage, 'owner'> & {
    owner?: ManagedCloudOwner;
  },
  _sender: chrome.runtime.MessageSender,
  delivery?: BackgroundChatDelivery,
  admissionSignal?: AbortSignal,
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
  const broadcastChunk = (
    text: string,
    done: boolean,
    error?: string,
    routing?: import('./types').ChatChunkMessage['routing'],
    activity?: Pick<
      import('./types').ChatChunkMessage,
      'agentEvent' | 'durableReplay' | 'cloudRun'
    >,
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
    if (delivery && text) transcript.push(text);
    publishManagedChatChunk(streamKey, activeStream, id, { text, done: false });
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
        routing ? { selectedModel: 'auto', currentModelKey: routing.modelKey } : undefined,
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
    let systemPrompt: string | undefined;
    if (!delivery) {
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.url) systemPrompt = getPlatformPrompt(activeTab.url) ?? undefined;
      } catch {
        // Platform context is optional; inference remains Managed Cloud only.
      }
    }

    const result = await executeChromeManagedChat(
      {
        id,
        text: message.text,
        modelSelection: message.modelSelection,
        quickMode: message.quickMode,
        effort: message.effort,
        pageContext: message.pageContext,
        systemPrompt,
        conversationHistory: message.conversationHistory,
        attachments: message.attachments,
        extendedThinking: message.extendedThinking,
        currentModelKey: message.currentModelKey,
        previousTaskType: message.previousTaskType,
        conversationId: message.conversationId,
        assistantMessageId: message.assistantMessageId,
        idempotencyKey: delivery?.requestId,
        completionMode: delivery ? 'unattended' : 'interactive',
        signal: activeStream.controller.signal,
      },
      {
        ...createChromeManagedChatDependencies(onStreamText, {
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
        }),
        getAuthToken: async () => credential.token,
      },
    );

    if (result.status === 'success') {
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

    if (!activeStream.cancelNotified) {
      activeStream.cancelNotified = true;
      const visibleError =
        result.code === 'quota_exceeded'
          ? '__QUOTA_EXCEEDED__'
          : result.code === 'auth_required'
            ? '__AUTH_REQUIRED__'
            : result.message;
      publishManagedChatChunk(streamKey, activeStream, id, {
        text: '',
        done: true,
        error: visibleError,
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
    const deliveryFailure = await deliverBackgroundResult();
    const messageText =
      deliveryFailure ?? (error instanceof Error ? error.message : 'Managed Cloud chat failed.');
    const result = {
      status: 'error',
      code: 'server_error',
      message: messageText,
    } as const;
    if (!activeStream.cancelNotified) {
      activeStream.cancelNotified = true;
      publishManagedChatChunk(streamKey, activeStream, id, {
        text: '',
        done: true,
        error: messageText,
      });
    }
    logger.error('handleChatMessage error', error);
    return result;
  } finally {
    admissionSignal?.removeEventListener('abort', abortForAdmission);
    if (activeChatStreams.get(streamKey) === activeStream) activeChatStreams.delete(streamKey);
  }
}

async function handleResumeChatRun(message: import('./types').ResumeChatRunMessage): Promise<void> {
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
  };
  activeChatStreams.set(streamKey, activeStream);

  try {
    if (routing) {
      publishManagedChatChunk(streamKey, activeStream, id, {
        text: '',
        done: false,
        routing,
      });
    }
    const result = await resumeChromeManagedRun(
      {
        run: message.cloudRun,
        alreadyVisibleText: message.alreadyVisibleText,
        signal: activeStream.controller.signal,
      },
      {
        getAuthToken: async () => credential.token,
        onText: (text) =>
          publishManagedChatChunk(streamKey, activeStream, id, { text, done: false }),
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

    if (result.status === 'success') {
      publishManagedChatChunk(streamKey, activeStream, id, {
        text: '',
        done: true,
        ...(routing ? { routing } : {}),
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
        ...(routing ? { routing } : {}),
        ...(activeStream.cloudRun ? { cloudRun: activeStream.cloudRun } : {}),
      });
    }
    if (result.code === 'auth_required') {
      await invalidateRejectedManagedCloudCredential(activeStream);
    }
  } finally {
    if (activeChatStreams.get(streamKey) === activeStream) activeChatStreams.delete(streamKey);
  }
}

async function handleResolveChatApproval(
  message: import('./types').ResolveChatApprovalMessage,
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
  };
  activeChatStreams.set(streamKey, activeStream);

  try {
    const result = await executeChromeManagedApproval(
      {
        id,
        run: message.cloudRun,
        toolApprovals: message.toolApprovals,
        signal: activeStream.controller.signal,
      },
      {
        ...createChromeManagedApprovalDependencies(
          (text) =>
            publishManagedChatChunk(streamKey, activeStream, id, {
              text,
              done: false,
            }),
          {
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
        ),
        getAuthToken: async () => credential.token,
      },
    );

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
        ...(activeStream.cloudRun ? { cloudRun: activeStream.cloudRun } : {}),
      });
    }
    if (result.code === 'auth_required') {
      await invalidateRejectedManagedCloudCredential(activeStream);
    }
  } finally {
    if (activeChatStreams.get(streamKey) === activeStream) activeChatStreams.delete(streamKey);
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
      return inPagePromptFailure(
        'plan_required',
        'Managed Cloud chat is not available for this AGI account.',
      );
    case 'quota_exceeded':
      return inPagePromptFailure(
        'quota_exceeded',
        'Your shared AGI Managed Cloud usage limit has been reached.',
      );
    case 'account_unavailable':
      return inPagePromptFailure('account_unavailable', result.message, true);
    case 'rate_limited':
      return inPagePromptFailure('rate_limited', result.message, true);
    case 'cancelled':
      return inPagePromptFailure('cancelled', 'Request cancelled.');
    case 'invalid_request':
    case 'model_not_admitted':
      return inPagePromptFailure('request_rejected', result.message);
    default:
      return inPagePromptFailure('retryable_error', result.message, true);
  }
}

async function handleInPagePrompt(
  prompt: string,
  pageContext?: string,
  senderUrl?: string,
): Promise<InPagePromptResponse> {
  if (!prompt.trim()) {
    return inPagePromptFailure('request_rejected', 'Enter a question or choose a page action.');
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
    if (activeChatStreams.get(streamKey) === activeStream) activeChatStreams.delete(streamKey);
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

for (const retired of RETIRED_ALARM_NAMES) {
  void chrome.alarms.clear(retired);
}

watchCloudMirroringEnabled();
void settleMaintenanceAlarm();

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
        if (!task?.enabled) return;
        await executeScheduledTask(task, expectedGeneration);
      })
      .catch((err) => {
        logger.warn(`Failed to load/execute scheduled task ${taskId}`, err);
      });
  }
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

// keeping it exported would only have advertised a bridge guaranteed to be

export { state, handleMessage, checkDesktopConnection };
