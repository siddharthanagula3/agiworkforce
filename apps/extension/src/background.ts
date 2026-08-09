// SYNC-RULE COMPLIANCE — Chrome surface (browser-session only)
//
// Locked rule: "CLI, VS Code, and Chrome must not sync consumer chat history.
// They may keep separate browser-session history, event streams, exports,
// and explicit user-approved handoffs."
//
// This surface is compliant:
//   • Browser conversations (`agi_browser_conversations_v1`) are written exclusively to
//     `chrome.storage.local` — device-scoped, never synced to Google's servers
//     or to any consumer-identity endpoint.
//   • No `ConversationSyncService` from `@agiworkforce/types` is imported or
//     constructed here.
//   • No POSTs to `/api/chat/conversations` or any web-surface consumer endpoint.
//   • Bridge calls execute a turn but do not transfer ownership or persistence;
//     Chrome remains the sole owner of its browser-scoped conversation records.

import type {
  ExtensionMessage,
  ExtensionResponse,
  ConnectionStatus,
  RunPageAction,
  ScheduledTask,
} from './types';
import { logger, RateLimiter, withTimeout, storageUtils, sleep } from './utils';
import { describeComputerUseAction } from './features/computer-use/describeAction';
import { timingSafeEqual } from '@agiworkforce/utils/crypto';
import {
  loadShortcuts,
  handleSaveShortcut,
  handleListShortcuts,
  handleDeleteShortcut,
  planShortcutReplay,
} from './features/background/shortcuts';
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
import { publishAuthorizedScheduledTaskNotification } from './features/background/scheduled-task-notifications';
import { getPlatformPrompt } from './platform-prompts';
// Wires `@agiworkforce/browser-tool`'s canonical action shapes onto the
// extension's existing `RunPageAction` machinery. The package's runtime
// (Playwright-based) is NOT bundled — only types travel through this
// import. See `browserTool.ts` for action-coverage notes (16 Computer Use
// actions; 15 implementable in content-script context, `zoom` is N/A).
import {
  computerUseToPageActions,
  browserActionToPageActions,
  type ComputerUseAction,
  type BrowserAction,
} from './browserTool';
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
  DISCOVERY_MESSAGE_TYPES,
  DOM_MUTATION_MESSAGE_TYPES,
  EXTENSION_PAGE_ONLY_MESSAGE_TYPES,
  ORIGIN_EXTENSION_PAGE,
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
  /** Exact credential captured for this run; never replaced with ambient auth. */
  token: string;
  controller: AbortController;
  cancelRequested: boolean;
  cancelNotified: boolean;
  /** Durable Managed Cloud identity for targeted scheduled-run cancellation. */
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
  // Abort every admitted operation before the first await. Storage reads can
  // be delayed; an explicit account transition must become authoritative in
  // this event-loop turn, not after a journal lookup completes.
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

  // Start captured-handle cancellation independently of storage. Journal I/O
  // must not prevent a known server run from receiving its cancellation.
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

/**
 * Reconcile a 401 against the exact credential that received it.
 *
 * Rejected A work is always torn down by owner. Clerk sign-out is a second,
 * compare-and-clear step inside clerkAuth: if B (or a refreshed bearer for A)
 * became current meanwhile, it is left untouched. Pending computer-use starts
 * intentionally remain admission-gated because they do not own auth until
 * getManagedCloudAuthContext() returns.
 */
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
    // The exact rejected incarnation is gone. Retire it synchronously, then
    // tombstone even inactive scheduled journals so no later worker can resume
    // work with that rejected authority.
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
    /** Only the first connect response may arrive before a secret exists. */
    allowUnsignedResponse: boolean;
  }
>();
const pendingContextHandoffApprovals = new Set<string>();

// WebMCP: per-tab tool catalog
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
// SHORTCUTS_STORAGE_KEY, TASKS_STORAGE_KEY, MAX_SHORTCUTS, MAX_TASKS, TASK_ALARM_PREFIX
// are now owned by background/shortcuts.ts and background/tasks.ts respectively.
const TAB_GROUP_NAME = 'AGI Workforce';

export interface SharedBackgroundContext {
  nativeReconnectTimer: ReturnType<typeof setTimeout> | null;
  nativeReconnectAttempt: number;
  nativeHandshakeInFlight: boolean;
  /** True when max reconnect attempts exhausted. Prevents macOS permission popup loops. */
  nativeReconnectGaveUp: boolean;
  /** True once Chrome begins suspending this service worker. */
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

/**
 * Per-session HMAC secret negotiated with the native host on connect.
 *
 * FIX (audit 2026-05-20, §2): the legacy native-messaging envelope paired
 * requests with their responses purely by UUID, with no integrity envelope.
 * A compromised native host (or any in-process MITM that can intercept
 * postMessage in this extension service worker) could swap responses
 * across in-flight requests — answer a benign ping with the data from a
 * concurrent `chat_message` call.
 *
 * Mitigation: at connect time, ask the native host for a 32-byte session
 * secret in its connect ack. Every outgoing request gets a per-request
 * `mac = HMAC-SHA256(secret, id || timestamp || body)` and every incoming
 * response is verified the same way against the request's id. A host that
 * does not negotiate this secret is incompatible and is rejected before any
 * privileged request can be sent.
 */
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
  // FIX (Codex P2, 2026-05-20): strict format check. The previous accept-any
  // ≥32-char string would silently coerce non-hex (or odd-length) input into
  // zeroed/truncated bytes via `parseInt(NaN, 16) = NaN → 0`, producing an
  // HMAC key that differs from the host's and breaking every signed
  // response once strict-mode (P1, below) is in effect. Require exactly
  // 64 hex chars = 32 bytes.
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
  // Parse 64-char hex into 32-byte ArrayBuffer.
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
  // L-07 audit 2026-05-19: `nativeReconnectGaveUp` is cleared in two paths:
  // (a) here, on explicit manual reconnect; (b) in connectToNativeHost
  // success block (line ~311), on handshake success. Both are intentional.
  // Do not consolidate — they have different preconditions.
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
  // Debounce: if a reconnect timer is already pending, skip this call.
  // The attempt counter only increments when a new timer is actually scheduled,
  // which is the correct behavior — duplicate disconnect events should not
  // accelerate the backoff.
  if (_bgCtx.nativeReconnectTimer) {
    return;
  }

  _bgCtx.nativeReconnectAttempt = Math.min(
    _bgCtx.nativeReconnectAttempt + 1,
    NATIVE_RECONNECT_MAX_ATTEMPTS,
  );

  // Stop retrying once max attempts are exhausted. Without this guard the
  // reconnect loop runs indefinitely, launching the native host binary on
  // every attempt and triggering repeated macOS permission prompts.
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
  // Claude-style front door: clicking the toolbar icon opens the side-panel chat
  // (no popup). Persistent + idempotent, so calling it on every SW start is safe.
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch((err) => {
    logger.warn('setPanelBehavior(openPanelOnActionClick) failed', err);
  });
  setupContextMenu();
  connectToNativeHost();
  checkDesktopConnection();
  void restoreScheduledTaskAlarms()
    .then(recoverScheduledTaskRuns)
    .catch((error) => logger.warn('Failed to restore scheduled Managed Cloud work', error));
  // One-shot migration of the autofill profile from chrome.storage.sync (which
  // replicates to Google's servers) into chrome.storage.local (device-only).
  // Idempotent and silent on storage error. See H-04 in audits/2026-05-19.
  void migrateAutofillProfile().catch((err) => {
    logger.debug('Autofill profile migration failed (non-fatal)', err);
  });
}

function handleManagedChatKeepalivePort(port: chrome.runtime.Port): void {
  const clientInstanceId = parseManagedChatPortName(port.name);
  if (!clientInstanceId) return;
  // A Chrome side-panel document may be associated with its host tab. Treat
  // the sender's extension URL/origin as authoritative instead of requiring a
  // tabless port; content scripts still fail because their document and tab
  // URLs are HTTP(S), not the extension origin.
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
    state.isNativeConnected = false; // Not connected until handshake succeeds
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

        // Handshake succeeded — only now mark as connected
        state.isNativeConnected = true;
        _bgCtx.nativeReconnectAttempt = 0;
        _bgCtx.nativeReconnectGaveUp = false; // Reset so future disconnects can retry
        clearNativeReconnectTimer();
        state.connectionStatus = 'connected';
        void notifyConnectionStatusChange();

        // Drain any messages queued while disconnected
        if (state.messageQueue.length > 0 && !state.isProcessingQueue) {
          state.isProcessingQueue = true;
          const queued = state.messageQueue.splice(0);
          for (const msg of queued) {
            try {
              await handleMessage(msg, {} as chrome.runtime.MessageSender, () => {});
            } catch (err) {
              // Best-effort drain — don't block reconnection
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
  // L-04 audit 2026-05-19: accept a per-call timeoutMs. Default stays at
  // NATIVE_REQUEST_TIMEOUT_MS (10s); long calls (chat_message, etc.)
  // now pass 30000 explicitly instead of getting wrapped in `withTimeout`
  // and risking double-timeouts.
  return new Promise((resolve, reject) => {
    void (async () => {
      // Allow sending during handshake (port exists but isNativeConnected not yet true)
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

      // FIX (audit 2026-05-20, §2): attach an HMAC envelope when a session
      // secret is available. The native host echoes the same id and signs
      // its response with the same secret; verifyResponseMac() rejects on
      // mismatch.
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
    // Clear the paired Desktop catalog through the same authenticated envelope
    // before any post-navigation discovery can publish a replacement.
    sendAuthenticatedWebMCPNativeUpdate(tabId, cleared);
  }
  return navigationGeneration;
}

function handleNativeMessage(message: NativeMessageEnvelope): void {
  logger.debug('Received native message', message);

  // FIX (audit 2026-05-20, §2): if the native host sends a session_secret
  // (in the connect-handshake response), latch it for subsequent MAC
  // computation. A missing or malformed secret makes the handshake fail;
  // privileged requests are never allowed to downgrade to an unsigned mode.
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

      // FIX (audit 2026-05-20, §2 + Codex P1 2026-05-20): once a session
      // secret has been negotiated, we are in STRICT mode — every response
      // must carry a valid mac+timestamp envelope. An attacker that can
      // tamper with response framing must not be able to defeat the
      // integrity check by simply stripping the `mac`/`timestamp` fields
      // (downgrade attack). Only when no secret has ever been negotiated
      // do we accept the legacy success/error envelope.
      const respMac = (message as unknown as Record<string, unknown>)['mac'];
      const respTs = (message as unknown as Record<string, unknown>)['timestamp'];
      if (nativeSessionSecret) {
        if (typeof respMac !== 'string' || typeof respTs !== 'number') {
          logger.warn(
            '[native-mac] Strict mode — rejecting response with missing mac/timestamp ' +
              '(downgrade attack guard)',
            { id: message.id },
          );
          reject(new Error('Native response missing required MAC envelope'));
          return;
        }
        // The host signs with the same payload shape: id|ts|body. Body is
        // the message *without* id/mac/timestamp/session_secret so the
        // signature is over a stable canonical form.
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
              '[native-mac] Response MAC mismatch — rejecting (potential shuffle attack)',
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

      // The initial connect response is the only response allowed before the
      // negotiated secret exists. It is used solely to obtain that secret; the
      // handshake rejects immediately afterward if the response omitted it.
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
  // FIX (audit 2026-05-20, §2): drop the session secret on disconnect
  // so a reconnect must re-negotiate.
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

  // A service worker that is already shutting down must not schedule another
  // native connection. The next worker instance performs a fresh authenticated
  // handshake from its newly initialized background context.
  if (_bgCtx.nativeSuspendInProgress) {
    return;
  }

  // Stop retrying immediately for permanent errors (host not installed, or macOS
  // access denied) — these will never resolve without user action and would cause
  // repeated macOS permission prompts on every reconnect attempt.
  //
  // Deliberately narrow patterns to avoid false positives:
  //   - 'not found' is too broad (matches transient messages)
  //   - 'com.agiworkforce.browser' always matches since it's the host name
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
  /**
   * Background result this notification announces. Clicking the notification
   * opens that conversation in the side panel, so a scheduled answer is one
   * click away instead of only discoverable in the History drawer.
   */
  conversationId?: string,
  conversationOwner?: ManagedCloudOwner,
): void {
  if (!chrome.notifications?.create) return;
  // L-12 audit 2026-05-19: crypto.randomUUID prefix instead of Date.now so
  // rapid notifications don't collide.
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
  // Store tabId for click handler
  if (tabId) {
    chrome.storage.session.set({ [`agi_notif_${notifId}`]: tabId }).catch(() => {});
  }
  if (conversationId && conversationOwner) {
    void linkNotificationToConversation(notifId, conversationOwner, conversationId);
  }
}

// Single source of truth for the "Task notifications" options toggle. Previously
// only the pre-run reminder honored it while Task Completed/Failed fired
// regardless, so turning the toggle OFF still produced completion notifications.
async function taskNotificationsEnabled(): Promise<boolean> {
  try {
    const { agi_task_notifications: enabled } = await chrome.storage.local.get({
      agi_task_notifications: true,
    });
    return enabled !== false;
  } catch {
    return true; // fail-open to the default-on behavior
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
  // A completion notification for a background run points at the conversation
  // holding its answer. Park the pointer before the panel opens (a panel that
  // is still booting cannot receive a runtime message) and also broadcast it,
  // for the case where a panel is already open and idle.
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
  // Open side panel when notification clicked
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.id && chrome.sidePanel) {
      chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    }
  });
  chrome.notifications.clear(notifId, () => {});
});

async function ensureTabGroup(tabId: number): Promise<void> {
  if (!chrome.tabGroups) return;
  try {
    const groups = await chrome.tabGroups.query({ title: TAB_GROUP_NAME });
    if (groups.length > 0 && groups[0]?.id !== undefined) {
      await chrome.tabs.group({ tabIds: [tabId], groupId: groups[0].id });
    } else {
      const groupId = await chrome.tabs.group({ tabIds: [tabId] });
      await chrome.tabGroups.update(groupId, { title: TAB_GROUP_NAME, color: 'blue' });
    }
  } catch (err) {
    // tabGroups API may not be available in all contexts
    logger.debug('Tab group operation failed (non-fatal)', err);
  }
}

// loadShortcuts, saveShortcuts, handleSaveShortcut, handleListShortcuts, handleDeleteShortcut
// extracted to background/shortcuts.ts

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
  // SECURITY (C-03 audit 2026-05-19): if this shortcut was created by a web
  // page (not the trusted UI), confirm the origin is still allowlisted.
  // Auto-delete stale records so they can't accumulate as a persistent
  // attacker capability.
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
    // A prompt shortcut carries no recorded page actions — run its saved prompt
    // through the chat path (the same route the scheduler uses for prompt-only
    // tasks) instead of dispatching an empty RUN_PAGE_ACTIONS batch, which
    // no-ops on the page yet previously still reported "completed" (fake
    // success).
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
    // SIX-04: nothing listens for `shortcut-replay` chunks, so the answer is
    // filed into the conversation store the side panel's History drawer reads.
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

// Scheduled-task storage and alarm mechanics live in background/tasks.ts.

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
      // Chrome 110+ resets the MV3 idle timer when an extension API is called.
      // This heartbeat exists only while a user-authorized scheduled operation
      // is active; durable recovery below remains authoritative if the process
      // or browser still exits.
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

async function notifyScheduledTaskCompleted(
  taskName: string,
  answer = '',
  conversationId?: string,
  conversationOwner?: ManagedCloudOwner,
  signal?: AbortSignal,
): Promise<void> {
  await publishAuthorizedScheduledTaskNotification(
    { ...(conversationOwner ? { owner: conversationOwner } : {}), ...(signal ? { signal } : {}) },
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
  owner?: ManagedCloudOwner,
  signal?: AbortSignal,
): Promise<void> {
  await publishAuthorizedScheduledTaskNotification(
    { ...(owner ? { owner } : {}), ...(signal ? { signal } : {}) },
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
  await notifyScheduledTaskCompleted(
    taskName,
    outcome.answer,
    outcome.conversationId,
    outcome.conversationOwner,
    signal,
  );
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
    // A different account must never recover this run. A replacement session
    // for the same account may cancel, but never resume or render, the old
    // incarnation's paid work.
    // A different account cannot inspect or cancel A's server run, but it must
    // still durably tombstone the journal. Otherwise a missed transition lets A
    // resume stale paid work when it signs in again later.
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
    // If another execution won the serialized journal insert, it owns that
    // request. An aborted stale lease must never cancel the winner's journal.
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
    // SECURITY (C-02 audit 2026-05-19): fire-time allowlist re-check. Tasks
    // created from a non-extension-UI origin must verify the originating
    // origin is still on `agi_site_allowlist`. If not, auto-delete so the
    // task does not accumulate as a persistent capability.
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
    await notifyScheduledTaskCompleted(
      task.name,
      '',
      undefined,
      undefined,
      lease.controller.signal,
    );
  } catch (error) {
    if (error instanceof ScheduledTaskCancelledError || lease.controller.signal.aborted) {
      logger.info('Scheduled task execution lost authority', { taskId: task.id });
      return;
    }
    if (error instanceof ScheduledTaskAuthorityError) {
      logger.warn(error.message, { taskId: task.id });
      if (error.notifyCurrentUser) {
        await publishAuthorizedScheduledTaskNotification(
          {
            signal: lease.controller.signal,
            ...(managedExecutionOwner ? { owner: managedExecutionOwner } : {}),
          },
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
        {
          signal: lease.controller.signal,
          ...(managedExecutionOwner ? { owner: managedExecutionOwner } : {}),
        },
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
let siteAllowlistCache = new Set<string>();
chrome.storage.local
  .get('agi_site_allowlist')
  .then((res) => {
    const list = res['agi_site_allowlist'];
    if (Array.isArray(list)) {
      siteAllowlistCache = new Set(list as string[]);
    }
  })
  .catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes['agi_site_allowlist']) return;
  const next = changes['agi_site_allowlist'].newValue;
  siteAllowlistCache = new Set(Array.isArray(next) ? (next as string[]) : []);
  const lease = computerUseRuns.getActive();
  if (!lease) return;
  try {
    if (siteAllowlistCache.has(new URL(lease.tabIntentUrl).origin)) return;
  } catch {
    // Invalid stored intent is handled by the same fail-closed cancellation.
  }
  computerUseStartGeneration += 1;
  cancelActiveComputerUseRun('tab_intent_changed', lease.runId);
});

// W5-06: persisted side-panel preference. Outgoing turns carry a snapshot so
// routing cannot race a later toggle or affect non-side-panel chat surfaces.
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

/** Reassert the account/session and exact foreground-tab intent for one lease. */
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
  // Extension pages (popup, side panel, options) are always trusted.
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

  // Reject anything without tab info.
  if (!sender.tab || !sender.tab.url) return false;

  // Discovery messages don't expose any privileged capability.
  if (messageType && DISCOVERY_MESSAGE_TYPES.has(messageType)) return true;

  let origin: string;
  try {
    origin = new URL(sender.tab.url).origin;
  } catch {
    return false;
  }
  return siteAllowlistCache.has(origin);
}

// DOM_MUTATION_MESSAGE_TYPES is now sourced from `./background/policy` so the
// side panel, tests, and any other consumer share one source of truth. See the
// policy module's comment for the historical fix history (EXT-3, H-2,
// CHROME-NEW-002, CHROME-NEW-005, P0-D). Adding a new content-script handler
// that writes DOM? Add the wire-message type to `DOM_MUTATION_MESSAGE_TYPES`
// in `policy.ts`.

function senderTabAllowedToMutate(
  sender: chrome.runtime.MessageSender,
  targetTabId: number | undefined,
): boolean {
  if (typeof targetTabId !== 'number') return true; // no target = sender's own tab
  return sender?.tab?.id === targetTabId;
}

function handleMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: ExtensionResponse) => void,
): boolean {
  const msg = message as ExtensionMessage;

  if (!isValidMessage(msg)) {
    logger.warn('Invalid message received', message);
    sendResponse({ success: false, error: 'Invalid message format' } as ExtensionResponse);
    return false;
  }

  // EXT-1/2: gate by user-managed allowlist.
  if (!isAllowlistedSender(sender, msg.type)) {
    logger.warn('Rejected message from non-allowlisted sender', {
      url: sender?.tab?.url,
      type: msg.type,
    });
    sendResponse({
      success: false,
      error:
        'This site is not on your AGI Workforce allowlist. Open the extension popup and use the "Site allowlist" section to add this origin, then reload.',
    } as ExtensionResponse);
    return false;
  }

  // SECURITY (C-02 / C-03 audit 2026-05-19): some message types create
  // persistent state (chrome.alarms, chrome.storage.local shortcuts) that
  // outlives the originating tab and survives removal from the allowlist.
  // These must originate from a trusted extension page (popup / side panel /
  // options), never from a content script — even on an allowlisted origin.
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

  // EXT-3: block cross-tab DOM mutation.
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

  // chrome.sidePanel.open() requires a live user gesture and must be called
  // SYNCHRONOUSLY inside this onMessage listener — deferring it through
  // handleMessageAsync's .then() continuation drops the activation, so the
  // in-page panel's "Open side panel" button did nothing. Handle it here, after
  // the security gates above, for a content-script sender that carries its tab.
  // Extension-page senders (no sender.tab) fall through to the async handler.
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
      // SECURITY (H-09 audit 2026-05-19): only capture the sender's own tab.
      // The previous implementation fell back to `chrome.tabs.query({active:
      // true})`, which let an allowlisted content script wait for the user to
      // switch tabs and then exfiltrate a screenshot of whatever was visible.
      // Extension pages (popup / side panel) have `!sender.tab` — they must
      // explicitly include `tabId` in the message, which is resolved upstream.
      let resolvedTabId = tabId;
      let resolvedWindowId = windowId;

      if (sender.tab) {
        // Content-script sender — restrict to its own tab regardless of the
        // tabId passed in the message body. This closes the cross-tab
        // capture path.
        resolvedTabId = sender.tab.id;
        resolvedWindowId = sender.tab.windowId;
      } else if (!resolvedTabId || resolvedWindowId === undefined) {
        // Extension-page sender (popup / side panel) with no explicit tabId:
        // fall back to the active tab so the popup's "capture page" button
        // still works.
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
      // Page-declared tool metadata is untrusted even after the origin
      // allowlist gate. Validate it again before storage, UI, or native egress.
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

    // SECURITY: the tab-group cases fall back to the active tab when no tabId
    // is supplied, so they are in EXTENSION_PAGE_ONLY_MESSAGE_TYPES — otherwise
    // a content script in a background tab could regroup the tab the user is
    // actually looking at.
    case 'ADD_TAB_TO_GROUP': {
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }
      if (!resolvedTabId) {
        return { success: false, error: 'No active tab' } as ExtensionResponse;
      }
      await ensureTabGroup(resolvedTabId);
      return { success: true, grouped: true } as ExtensionResponse;
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
      // A stale A panel must receive no managed rows if ambient Clerk auth is
      // already B, even before its foreground auth observer catches up.
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
      // SECURITY (H-01 audit 2026-05-19): restrict NLWEB_PROBE to the
      // sender's own origin. Discovery is intrinsically same-origin —
      // probing arbitrary public URLs through the extension turned the
      // service worker into an SSRF reflector (the extension's IP, no
      // Origin header, may bypass CORS allowlists that key on Origin).
      //
      // Self-review #11 audit 2026-05-19: fail-closed for extension pages
      // too. The prior implementation exempted senders with no `sender.tab`
      // (i.e. popup / side panel). No extension-page code currently calls
      // NLWEB_PROBE, so fail-closed costs nothing today and prevents a
      // future caller from bypassing the SSRF check.
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

    case 'IN_PAGE_PROMPT' as ExtensionMessage['type']: {
      // Sent by the in-page chat panel (content-script) to run a prompt and
      // return the full accumulated response text. Uses the same Managed
      // Cloud-only owner as CHAT_MESSAGE but resolves to a simple
      // { success, text } rather than broadcasting chunks, since content
      // scripts cannot receive chunked messages while the panel waits.
      const promptPayload = message as unknown as { prompt?: string };
      const promptText = typeof promptPayload.prompt === 'string' ? promptPayload.prompt : '';
      if (!promptText) {
        return { success: false, error: 'Missing prompt' } as ExtensionResponse;
      }
      try {
        const responseText = await handleInPagePrompt(promptText);
        return { success: true, text: responseText } as ExtensionResponse;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Prompt failed';
        return { success: false, error: msg } as ExtensionResponse;
      }
    }

    // SECURITY: every memory case is in EXTENSION_PAGE_ONLY_MESSAGE_TYPES.
    // Memories are user-authored notes in chrome.storage.local that outlive the
    // origin's place on the allowlist (same C-02/C-03 argument as shortcuts),
    // and reading them hands the page the user's own notes. The side panel's
    // memory drawer is the only sender.
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

    // W5-06: quick mode get/set
    case 'GET_QUICK_MODE' as ExtensionMessage['type']: {
      return { success: true, enabled: quickModeCache } as ExtensionResponse;
    }

    case 'SET_QUICK_MODE' as ExtensionMessage['type']: {
      const qmMsg = message as import('./types').SetQuickModeMessage;
      quickModeCache = qmMsg.enabled === true;
      await chrome.storage.local.set({ agi_quick_mode: quickModeCache });
      return { success: true, enabled: quickModeCache } as ExtensionResponse;
    }

    case 'AGI_START_COMPUTER_USE' as ExtensionMessage['type']: {
      // SECURITY: 'AGI_START_COMPUTER_USE' is in EXTENSION_PAGE_ONLY_MESSAGE_TYPES —
      // the handleMessage guard above already rejected any non-UI sender before we
      // reach this case. Here we additionally re-validate the target tab's origin
      // against siteAllowlistCache before starting the CDP loop.
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

      // Re-validate the tab's origin against the allowlist (belt-and-suspenders).
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
            'Add it via the extension popup before starting computer use.',
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

      // Read the "ask before acting" preference stored by the side panel.
      // The side panel writes 'agi_cu_ask_before_acting' (boolean) to
      // chrome.storage.local when the toggle changes.
      //
      // SECURITY (trust-boundary P0): autonomous CDP browser control on a
      // prompt-injectable page must DEFAULT to human-in-the-loop. So an UNSET
      // pref means ask-before-acting (default-deny). Allow-all ("autopilot") is
      // an explicit opt-out the user must choose by turning the toggle OFF.
      // Only an explicit stored `false` disables the gate.
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

      // Resolve the automation model this account is entitled to. A Max /
      // Enterprise plan allows the premium computer-use slot; every other tier
      // resolves back to the balanced one. This read is advisory — a failure
      // must not block a run the user is otherwise allowed to start, so it
      // degrades to the tier-agnostic default rather than failing closed.
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
        // Monotonic enough across MV3 worker restarts for the long-lived side
        // panel to reject a delayed lifecycle broadcast from an older run.
        generation: Date.now() * 1_000 + (startGeneration % 1_000),
        tabId: cuTabId,
        ...(cuTab.windowId === undefined ? {} : { windowId: cuTab.windowId }),
        tabIntentUrl: cuTab.url,
        authOwner: authContext.owner,
        credential: authContext.token,
      });

      // onBeforeAction wiring:
      //   - When askBeforeActing is false (explicit autopilot opt-out): no gate —
      //     every action is allowed immediately (user chose lowest-friction).
      //   - When askBeforeActing is true: the background sends an AGI_CU_APPROVE_REQUEST
      //     message to the side panel, then waits for an AGI_CU_APPROVE_RESPONSE
      //     (allow/deny). The side panel's showApprovalCard() provides the UI.
      //     A 30 s timeout is applied; no response = DENY (fail-CLOSED) so a
      //     closed/unresponsive panel can never auto-approve an action. Matches
      //     agentLoop's fail-closed contract (commit security review 2026-06-13).
      const onBeforeAction = askBeforeActing
        ? async (
            toolName: string,
            args: Record<string, unknown>,
            signal?: AbortSignal,
          ): Promise<boolean> => {
            // SECURITY (commit review 2026-06-13): CSPRNG request id, not Math.random,
            // so a prompt-injected page cannot guess an in-flight approval id.
            const requestId = `cu_approve_${crypto.randomUUID()}`;
            // Notify the side panel to show an approval card
            broadcastComputerUseForCurrentRun(lease, {
              type: 'AGI_CU_APPROVE_REQUEST',
              requestId,
              toolName,
              // A sentence the user can actually consent to, not a stringified
              // function call. See describeAction.ts for why.
              description: describeComputerUseAction(toolName, args),
            });
            // Wait for the side panel's response (or timeout after 30 s → DENY)
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
                finish(false); // fail-CLOSED: deny if no approval arrives in time
              }, 30_000);
              function listener(msg: unknown, sender: chrome.runtime.MessageSender): void {
                // SECURITY (commit review 2026-06-13): only honor approval responses
                // from a trusted extension page (popup/side panel/options) — these
                // have no sender.tab. Reject content-script / external senders so a
                // prompt-injected page cannot forge an AGI_CU_APPROVE_RESPONSE and
                // bypass the human approval gate.
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
        : undefined; // allow-all (no gate)

      const completion = runAgentLoop(cuGoal, cuTabId, {
        model: computerUseModel,
        signal: lease.controller.signal,
        assertOwnership: () => assertComputerUseOwnership(lease).then(() => undefined),
        resolveOwnedCredential: () => assertComputerUseOwnership(lease),
        onActionStateChange: (active) => updateComputerUseActionState(lease, active),
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
      // Validate the new URL before accepting it
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
      // Forward other messages to content script
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

/**
 * Cookie-domain blocklist.
 *
 * SECURITY (M-01 audit 2026-05-19): the previous implementation matched
 * cookie domains with bare regexes like `/bank/i` and `/stripe\.com$/i`.
 * Two problems:
 *   1. `/bank/i` matches any string containing "bank" — fine for legitimate
 *      bank-named hostnames; the substring matching is preserved for that
 *      category bucket. But the suffix-anchored regexes silently broke
 *      under port suffixes: `/stripe\.com$/i` is anchored on the regex but
 *      tested against `urlOrDomain.replace(/^https?:\/\//, '').split('/')[0]`
 *      which retains `:port` — so `stripe.com:443` would fail the `$`
 *      anchor and slip through.
 *   2. Hostname parsing was DIY: split on `/`. URLs like `http://attacker.com\@github.com`
 *      can confuse naive splitting on some browser parses.
 *
 * We now parse with `new URL`, lowercase the hostname (no port, no path,
 * no userinfo), then match against structured {hostname, mode} entries.
 *   - `exact`: hostname must equal the entry's value.
 *   - `suffix`: hostname is the entry's value OR ends with `.<value>`.
 *   - `substring`: hostname contains the value (for category bucket
 *     keywords like "bank" that aren't suffix-anchorable).
 */
type CookieBlockEntry = { value: string; mode: 'exact' | 'suffix' | 'substring' };

const BLOCKED_COOKIE_DOMAINS: ReadonlyArray<CookieBlockEntry> = [
  // Financial — substring keywords. False positives are acceptable here;
  // a false-allow on a bank-flavored site is much worse than a false-block.
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
  // Government & healthcare
  { value: 'gov', mode: 'suffix' },
  { value: 'mil', mode: 'suffix' },
  { value: 'healthcare', mode: 'substring' },
  { value: 'medical', mode: 'substring' },
  { value: 'health.com', mode: 'suffix' },
  // Cloud infrastructure & developer tools
  { value: 'aws.amazon.com', mode: 'suffix' },
  { value: 'console.cloud.google.com', mode: 'suffix' },
  { value: 'portal.azure.com', mode: 'suffix' },
  { value: 'github.com', mode: 'suffix' },
  { value: 'gitlab.com', mode: 'suffix' },
  { value: 'bitbucket.org', mode: 'suffix' },
  // Auth & identity providers
  { value: 'accounts.google.com', mode: 'suffix' },
  { value: 'login.microsoftonline.com', mode: 'suffix' },
  { value: 'auth0.com', mode: 'suffix' },
  { value: 'okta.com', mode: 'suffix' },
  // Email & communication
  { value: 'mail.google.com', mode: 'suffix' },
  { value: 'outlook.live.com', mode: 'suffix' },
  { value: 'outlook.office.com', mode: 'suffix' },
  // Social media (auth tokens)
  { value: 'facebook.com', mode: 'suffix' },
  { value: 'twitter.com', mode: 'suffix' },
  { value: 'x.com', mode: 'suffix' },
  { value: 'instagram.com', mode: 'suffix' },
  // Platforms the extension targets — DOM-level only, never cookies.
  // CHROME-NEW-006 (2026-05-05) + M-01 (2026-05-19): suffix mode replaces
  // the prior `/(^|\.)linkedin\.com$/i` regexes which silently broke under
  // port suffixes (`linkedin.com:443`).
  // L-08 note: linkedin/lever/etc. are deliberately blocked at the COOKIE
  // layer even though autofill targets them; autofill only writes DOM, never
  // reads cookies.
  { value: 'linkedin.com', mode: 'suffix' },
  { value: 'slack.com', mode: 'suffix' },
  { value: 'notion.so', mode: 'suffix' },
  { value: 'figma.com', mode: 'suffix' },
  { value: 'lever.co', mode: 'suffix' },
  { value: 'greenhouse.io', mode: 'suffix' },
  { value: 'workday.com', mode: 'suffix' },
  // CHROME-NEW-003 (2026-05-04): the extension's own auth surfaces.
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
  // Parse strictly: extract just the hostname (lowercase, no port, no path,
  // no userinfo). The prior implementation used DIY substring extraction
  // which retained `:port` and broke suffix-anchored matchers; this is the
  // M-01 fix.
  let hostname: string;
  try {
    const normalized = urlOrDomain.includes('://')
      ? urlOrDomain
      : `https://${(urlOrDomain.split('/')[0] ?? '').toLowerCase()}`;
    hostname = new URL(normalized).hostname.toLowerCase();
  } catch {
    return false; // fail-closed on unparseable input
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
    // Add to AGI Workforce tab group
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

    // Forward tree to native host if connected
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
      // A connection attempt was initiated — don't also schedule a reconnect below
      return;
    }
    // Already in-flight or gave up — nothing to do
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

  // Broadcast to extension views (side panel, popup, options).
  // chrome.runtime.sendMessage reaches all live extension pages; ignore the
  // error that fires when no listener is registered (panel not open).
  chrome.runtime.sendMessage(statusPayload).catch(() => {});

  try {
    // Also deliver to content scripts in open tabs (they listen on
    // chrome.runtime.onMessage inside the tab context).
    // Skip discarded tabs — they have no active content script to receive messages.
    const tabs = await chrome.tabs.query({ discarded: false });

    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, statusPayload, () => {
          // Reading chrome.runtime.lastError clears the error state (Chrome API
          // quirk). Without this, Chrome logs "Unchecked runtime.lastError".
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

  // L-13 audit 2026-05-19: contextMenus.removeAll is async but its callback
  // does not gate the create() calls below. Chrome serializes these
  // internally — removeAll completes before any subsequent create() in the
  // same task — so there's no actual race. The callback is purely for
  // logging the (rare) removal failure.
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      logger.warn('contextMenus.removeAll failed', chrome.runtime.lastError.message);
    }
  });

  const menuItems: chrome.contextMenus.CreateProperties[] = [
    { id: 'ask-agi-workforce', title: 'Ask AGI Workforce about "%s"', contexts: ['selection'] },
    { id: 'explain-selection', title: 'Explain this', contexts: ['selection'] },
    { id: 'translate-selection', title: 'Translate this', contexts: ['selection'] },
    { id: 'summarize-page', title: 'Summarize this page', contexts: ['page'] },
    { id: 'capture-element', title: 'Capture Element', contexts: ['all'] },
    { id: 'get-element-info', title: 'Get Element Info', contexts: ['all'] },
    { id: 'discover-webmcp-tools', title: 'Discover AI Tools on Page', contexts: ['all'] },
    { id: 'add-to-tab-group', title: 'Add Tab to AGI Workforce Group', contexts: ['page'] },
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

/**
 * Fire-and-forget wrapper for native message sends that do not need a response
 */
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

    await sendNativeMessage({
      type: 'page_capture',
      dataUrl,
      tabId: tab.id,
      timestamp: Date.now(),
    });

    const stats = await storageUtils.getItem<{ actionCount: number }>('stats', {
      actionCount: 0,
    });
    const actionCount = stats?.actionCount ?? 0;

    await storageUtils.setItem('stats', {
      actionCount: actionCount + 1,
    });
  } catch (error) {
    logger.error('Failed to capture page', error);
  }
}

// Bridge allowlisting is owned by `./background/policy` so side-panel,
// pairing, and tests share one source of truth.

/** Maximum response body size for NLWEB probe requests (256 KB). */
const MAX_PROBE_RESPONSE_BYTES = 262_144;

/**
 * Private/reserved IPv4 and IPv6 ranges that MUST NOT be probed.
 * Prevents SSRF reconnaissance of internal networks via the NLWEB_PROBE handler.
 */
function isPrivateOrReservedHost(hostname: string): boolean {
  // Strip IPv6 brackets
  const h = hostname.replace(/^\[|\]$/g, '');

  // IPv6 loopback and link-local
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fd')) return true;

  // Named loopback
  if (h === 'localhost' || h === '0.0.0.0') return true;

  // IPv4 private/reserved ranges
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local)
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 0) return true; // 0.0.0.0/8
  }

  return false;
}

/**
 * Validate that a probe URL is safe to fetch.
 * Blocks private/reserved IPs, non-http(s) schemes, and localhost.
 */
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

// validateBridgeUrl is now imported from `./background/policy` (audit 2026-05-19).
// The function deliberately does not log here — it's called from multiple
// surfaces (background, side panel, pairing); log at the call site instead.

async function handleChatMessage(
  message: Omit<import('./types').ChatMessageMessage, 'owner'> & {
    owner?: ManagedCloudOwner;
  },
  _sender: chrome.runtime.MessageSender,
  /**
   * Present only for background-initiated runs (scheduled tasks, prompt
   * shortcuts). Those streams have no live `CHAT_CHUNK` listener, so the
   * generated — and billed — answer has to be filed into the conversation
   * store or it is lost. See `features/background/background-results.ts`.
   */
  delivery?: BackgroundChatDelivery,
  /** Cancels alarm admission while auth or another pre-dispatch await is pending. */
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

  // Only accumulated for background runs. An interactive turn is rendered and
  // persisted by the panel that owns the stream, so buffering the whole answer
  // here would just duplicate it in service-worker memory.
  const transcript: string[] = [];
  const onStreamText = (text: string): void => {
    if (activeChatStreams.get(streamKey) !== activeStream) return;
    if (delivery && text) transcript.push(text);
    publishManagedChatChunk(streamKey, activeStream, id, { text, done: false });
  };
  let backgroundDeliveryAttempted = false;
  let backgroundDeliveryFailure: string | null = null;
  /**
   * File whatever the run produced before returning. Called on every terminal
   * path — success, error and throw — because a stream that failed midway was
   * still billed for the tokens it emitted.
   */
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
    // A stale completion must never delete a newer stream that reused the id.
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
      // Restore the exact route before replay begins so a service-worker or
      // side-panel restart cannot silently reset Auto to an unrelated model.
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

/**
 * Handle an in-page prompt from the content-script overlay panel.
 *
 * Returns the full accumulated response text so the panel can render it
 * without needing a chunked messaging protocol.
 *
 * Same trust boundary as handleChatMessage: Chrome inference is Managed
 * Cloud only. The desktop bridge and native messaging carry pairing and
 * browser automation, never chat inference, and there is no local or BYOK
 * fallback — a failed Managed Cloud turn surfaces its error.
 */
async function handleInPagePrompt(prompt: string): Promise<string> {
  const credential = await getManagedCloudAuthContext();
  if (!credential || isRetiredManagedCloudOwner(credential.owner)) {
    return 'Sign in to use AGI Cloud chat.';
  }
  let systemPrompt: string | undefined;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.url) systemPrompt = getPlatformPrompt(activeTab.url) ?? undefined;
  } catch {
    // Optional platform context must not change the Managed Cloud boundary.
  }

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
  } finally {
    if (activeChatStreams.get(streamKey) === activeStream) activeChatStreams.delete(streamKey);
  }

  if (result.status === 'success') {
    return responseText || 'AGI Cloud completed the request without a text response.';
  }
  if (result.code === 'auth_required') return 'Sign in to use AGI Cloud chat.';
  if (result.code === 'quota_exceeded') return 'Your AGI Cloud usage limit has been reached.';
  return result.message;
}

function isValidMessage(message: unknown): message is ExtensionMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as Record<string, unknown>;
  return typeof msg['type'] === 'string';
}

// Initialize on service worker start
initialize();

// Handle service worker keep-alive and periodic connection checks
chrome.alarms.create('keep-alive', { periodInMinutes: 1.0 }, () => {
  if (chrome.runtime.lastError) {
    logger.warn('Failed to create keep-alive alarm', chrome.runtime.lastError.message);
  }
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keep-alive') {
    logger.debug('Keeping service worker alive');
    void recoverScheduledTaskRuns().catch((error) => {
      logger.warn('Failed to retry scheduled Managed Cloud recovery', error);
    });
    // Periodic connection check (replaces setInterval which is lost on MV3 suspension)
    if (!_bgCtx.nativeReconnectGaveUp && !state.isNativeConnected) {
      void connectToNativeHost();
    }
    return;
  }

  // Handle scheduled task alarms (Gap 6 / W5-03)
  if (alarm.name.startsWith(TASK_ALARM_PREFIX)) {
    const taskId = alarm.name.slice(TASK_ALARM_PREFIX.length);
    // Snapshot authority before the first await. Delete/disable/update commits
    // invalidate this generation before writing task storage.
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
    // Closing the native port is the complete shutdown signal. Sending an
    // unsigned ad-hoc "disconnect" envelope here would violate the authenticated
    // session protocol and the native host correctly rejects it.
    state.nativePort.disconnect();
  } catch (error) {
    logger.debug('Native disconnect on suspend failed', error);
  }
});

/**
 * Public bridge: translate an array of `@agiworkforce/browser-tool`
 * `BrowserAction`s OR Anthropic Computer Use actions into the extension's
 * native `RunPageAction[]` plan. Exposed for the side panel and external
 * MCP-style entrypoints. Returns the planned step list; the caller is
 * responsible for sending `RUN_PAGE_ACTIONS` to the active tab.
 */
export function planActionsFromBrowserTool(
  actions: ReadonlyArray<BrowserAction | ComputerUseAction>,
): RunPageAction[] {
  const plan: RunPageAction[] = [];
  for (const action of actions) {
    const steps = isComputerUseKind(action.kind)
      ? computerUseToPageActions(action as ComputerUseAction)
      : browserActionToPageActions(action as BrowserAction);
    for (const step of steps) {
      plan.push({
        id: step.id,
        type: step.type,
        selector: step.selector ?? null,
        value: step.value ?? null,
        delay: step.delay ?? null,
      });
    }
  }
  return plan;
}

const COMPUTER_USE_KINDS = new Set<string>([
  'screenshot',
  'left_click',
  'right_click',
  'middle_click',
  'double_click',
  'triple_click',
  'mouse_move',
  'key',
  'type',
  'scroll',
  'hold_key',
  'wait',
  'left_mouse_down',
  'left_mouse_up',
  'cursor_position',
  'zoom',
]);

function isComputerUseKind(kind: string): boolean {
  // 'type' / 'wait' / 'screenshot' overlap between the two action sets;
  // we treat them as Computer Use because that's the broader vocabulary
  // (Computer Use's 'type' takes the same shape as the package's 'type'
  // when no `coordinate` is supplied).
  return COMPUTER_USE_KINDS.has(kind);
}

// Export for testing
export { state, handleMessage, checkDesktopConnection };
