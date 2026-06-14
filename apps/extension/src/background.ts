// SYNC-RULE COMPLIANCE — Chrome surface (developer-session only)
//
// Locked rule: "CLI, VS Code, and Chrome must not sync consumer chat history.
// They may keep separate developer-session history, event streams, exports,
// and explicit user-approved handoffs."
//
// This surface is compliant:
//   • Chat history (`agi_conversation_history`) is written exclusively to
//     `chrome.storage.local` — device-scoped, never synced to Google's servers
//     or to any consumer-identity endpoint.
//   • No `ConversationSyncService` from `@agiworkforce/types` is imported or
//     constructed here.
//   • No POSTs to `/api/chat/conversations` or any web-surface consumer endpoint.
//   • Bridge calls (localhost:8787) route chat operations to the desktop app,
//     which is the designated persistence owner. That delegation is explicitly
//     permitted by the locked rule — the Chrome surface itself does not persist.

import type {
  ExtensionMessage,
  ExtensionResponse,
  ConnectionStatus,
  RunPageAction,
  ScheduledTask,
} from './types';
import { logger, RateLimiter, withTimeout, storageUtils, sleep } from './utils';
import {
  loadShortcuts,
  handleSaveShortcut,
  handleListShortcuts,
  handleDeleteShortcut,
} from './features/background/shortcuts';
import {
  loadScheduledTasks,
  saveScheduledTasks,
  handleCreateScheduledTask,
  handleListScheduledTasks,
  handleUpdateScheduledTask,
  handleDeleteScheduledTask,
  restoreScheduledTaskAlarms,
  TASK_ALARM_PREFIX,
} from './features/background/tasks';
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
import { migrateAutofillProfile } from './autofill/filler';
import { memoryList, memoryAdd, memoryUpdate, memoryDelete } from './background/memory-bridge';
import { runAgentLoop } from './features/computer-use/agentLoop';
import {
  DISCOVERY_MESSAGE_TYPES,
  DOM_MUTATION_MESSAGE_TYPES,
  EXTENSION_PAGE_ONLY_MESSAGE_TYPES,
  DEFAULT_AGI_BRIDGE_URL,
  ORIGIN_EXTENSION_PAGE,
  MAX_CONTEXT_HTML_CHARS,
  validateBridgeUrl,
  validateShortcutActions,
} from './background/policy';

interface BackgroundState {
  isNativeConnected: boolean;
  nativePort: chrome.runtime.Port | null;
  connectionStatus: ConnectionStatus;
  lastNativeError: string | null;
  rateLimiter: RateLimiter;
  messageQueue: ExtensionMessage[];
  isProcessingQueue: boolean;
}

interface PageContextSnapshot {
  success?: boolean;
  url?: string;
  title?: string;
  html?: string;
  selectedText?: string;
  timestamp?: number;
  error?: string;
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

interface NativePageContextPlan {
  success?: boolean;
  task_id?: string;
  actions?: RunPageAction[];
  error?: string;
}

interface RunActionsExecutionPayload {
  success?: boolean;
  screenshot?: string;
  result?: unknown;
  error?: string;
  actionsPerformed?: number;
  duration?: number;
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
  controller: AbortController;
  cancelRequested: boolean;
  cancelNotified: boolean;
}

const activeChatStreams = new Map<string, ActiveChatStream>();

// Pending requests waiting for responses
const pendingRequests = new Map<
  string,
  {
    resolve: (value: ExtensionResponse) => void;
    reject: (reason: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
  }
>();
const lastPageContextSyncByTab = new Map<number, { fingerprint: string; at: number }>();

// WebMCP: per-tab tool catalog
const webmcpToolsByTab = new Map<
  number,
  {
    tools: import('./types').WebMCPToolInfo[];
    url: string;
    timestamp: number;
  }
>();
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
// MAX_CONTEXT_HTML_CHARS now imported from policy.ts (L-14 audit 2026-05-19) so
// content.ts and background.ts share a single byte-budget constant.
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
}

function createSharedBackgroundContext(): SharedBackgroundContext {
  return {
    nativeReconnectTimer: null,
    nativeReconnectAttempt: 0,
    nativeHandshakeInFlight: false,
    nativeReconnectGaveUp: false,
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
 * response is verified the same way against the request's id. If the host
 * doesn't return a session_secret (older builds), we log a one-time
 * warning and continue without MACing — fully backwards-compatible.
 */
let nativeSessionSecret: ArrayBuffer | null = null;
let nativeSessionSecretWarned = false;

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
): Promise<string | null> {
  if (!nativeSessionSecret) return null;
  const payload = `${id}|${timestamp}|${JSON.stringify(body)}`;
  const key = await importHmacKey(nativeSessionSecret);
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
    if (!nativeSessionSecretWarned) {
      nativeSessionSecretWarned = true;
      logger.warn(
        '[native-mac] Native host did not return a well-formed session_secret in connect ack; ' +
          'continuing without HMAC envelope verification (back-compat). Update the desktop ' +
          'app to mint a 32-byte (64 hex char) per-session secret to enable ' +
          'response-shuffle protection.',
      );
    }
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
  setupContextMenu();
  connectToNativeHost();
  checkDesktopConnection();
  void restoreScheduledTaskAlarms();
  // One-shot migration of the autofill profile from chrome.storage.sync (which
  // replicates to Google's servers) into chrome.storage.local (device-only).
  // Idempotent and silent on storage error. See H-04 in audits/2026-05-19.
  void migrateAutofillProfile().catch((err) => {
    logger.debug('Autofill profile migration failed (non-fatal)', err);
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

function sendNativeRequest(
  message: Record<string, unknown>,
  timeoutMs: number = NATIVE_REQUEST_TIMEOUT_MS,
): Promise<ExtensionResponse> {
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

      const id = createRequestId();
      const timeout = setTimeout(() => {
        pendingRequests.delete(id);
        reject(new Error(`Native request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      pendingRequests.set(id, { resolve, reject, timeout });

      // FIX (audit 2026-05-20, §2): attach an HMAC envelope when a session
      // secret is available. The native host echoes the same id and signs
      // its response with the same secret; verifyResponseMac() rejects on
      // mismatch.
      const timestamp = Date.now();
      try {
        const mac = await computeEnvelopeMac(id, timestamp, message);
        state.nativePort?.postMessage({
          id,
          timestamp,
          mac,
          message,
        });
      } catch (error) {
        clearTimeout(timeout);
        pendingRequests.delete(id);
        reject(error);
      }
    })();
  });
}

function handleNativeMessage(message: NativeMessageEnvelope): void {
  logger.debug('Received native message', message);

  // FIX (audit 2026-05-20, §2): if the native host sends a session_secret
  // (in the connect-handshake response), latch it for subsequent MAC
  // computation. Best-effort: a missing secret falls back to the legacy
  // no-MAC behavior with a one-time warn.
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
          if (expected !== respMac) {
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

      // No session secret negotiated — legacy back-compat path.
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
  nativeSessionSecretWarned = false;
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

function showNotification(title: string, message: string, tabId?: number): void {
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
}

chrome.notifications?.onClicked?.addListener((notifId: string) => {
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
  showNotification('Shortcut Replayed', `"${shortcut.name}" completed`);
  return result;
}

// loadScheduledTasks, saveScheduledTasks, getAlarmPeriod, registerTaskAlarm, unregisterTaskAlarm,
// handleCreateScheduledTask, handleListScheduledTasks, handleUpdateScheduledTask,
// handleDeleteScheduledTask, restoreScheduledTaskAlarms extracted to background/tasks.ts

async function executeScheduledTask(task: ScheduledTask): Promise<void> {
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
    await handleDeleteScheduledTask({
      type: 'DELETE_SCHEDULED_TASK',
      taskId: task.id,
    } as import('./types').DeleteScheduledTaskMessage);
    return;
  }

  logger.info('Executing scheduled task', { id: task.id, name: task.name });

  if (task.shortcutId) {
    await handleReplayShortcut({
      type: 'REPLAY_SHORTCUT',
      shortcutId: task.shortcutId,
    } as import('./types').ReplayShortcutMessage);
  } else if (task.prompt) {
    // CHROME-NEW-007 fix (2026-05-05): cap stored task prompt length before
    // dispatching to the LLM. The prompt sits in `chrome.storage.local` which
    // is per-extension and not directly attacker-writable from outside, but
    // any code path with this extension's context that can write to local
    // storage (a future bug, a corrupted import-tasks flow) could plant a
    // multi-megabyte prompt. We cap at 10 000 chars — far above legitimate
    // user input but small enough to bound bridge/runtime work.
    const TASK_PROMPT_MAX_CHARS = 10_000;
    const safePrompt = String(task.prompt).slice(0, TASK_PROMPT_MAX_CHARS);
    if (safePrompt.length < task.prompt.length) {
      logger.warn('Scheduled task prompt truncated', {
        taskId: task.id,
        originalLength: task.prompt.length,
        truncatedTo: TASK_PROMPT_MAX_CHARS,
      });
    }
    // Send as chat message via the same path as side panel.
    //
    // Arch #2 audit 2026-05-19: synthesize a sender that looks like an
    // extension-page sender (`id === chrome.runtime.id`, `!sender.tab`) so
    // any future origin-aware logic in `handleChatMessage` treats this as
    // trusted UI rather than a faked content script. The prior `{} as
    // MessageSender` was a type-cast lie that would have bypassed any
    // future sender check on this path.
    const chatMsg: import('./types').ChatMessageMessage = {
      type: 'CHAT_MESSAGE',
      id: `task_${task.id}_${Date.now()}`,
      text: safePrompt,
      timestamp: Date.now(),
    };
    const scheduledTaskSender: chrome.runtime.MessageSender = {
      id: chrome.runtime.id,
      // No `tab` — emulates an extension page (popup / side panel) call.
    };
    void handleChatMessage(chatMsg, scheduledTaskSender);
  }

  // Update lastRun
  const tasks = await loadScheduledTasks();
  const updated = tasks.map((t) => (t.id === task.id ? { ...t, lastRun: Date.now() } : t));
  await saveScheduledTasks(updated);

  showNotification('Task Completed', `Scheduled task "${task.name}" finished`);
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
});

// BLOCKER-01: autonomy mode cache. Default 'ask' — user must opt in to unconfirmed execution.
let actionModeCache: import('./types').ActionMode = 'ask';
chrome.storage.local
  .get({ agi_action_mode: 'ask' })
  .then((res) => {
    const stored = res['agi_action_mode'];
    if (stored === 'ask' || stored === 'act') actionModeCache = stored;
  })
  .catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes['agi_action_mode']) return;
  const next = changes['agi_action_mode'].newValue;
  if (next === 'ask' || next === 'act') actionModeCache = next;
});

// W5-06: quick mode cache — when true, model resolution uses the fast-status slot.
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

// BLOCKER-02: pending permission requests waiting for user decision.
const pendingPermissionRequests = new Map<
  string,
  { resolve: (decision: 'allow' | 'deny' | 'always') => void }
>();

function isAllowlistedSender(
  sender: chrome.runtime.MessageSender,
  messageType: string | undefined,
): boolean {
  // Extension pages (popup, side panel, options) are always trusted.
  if (sender.id === chrome.runtime.id && !sender.tab) return true;

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
    if (sender.tab || sender.id !== chrome.runtime.id) {
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

  const tabId = sender.tab?.id ?? message.tabId;
  const windowId = sender.tab?.windowId;

  if (state.rateLimiter.isLimited(tabId || 0, message.type)) {
    return {
      success: false,
      error: 'Rate limit exceeded',
    } as ExtensionResponse;
  }

  switch (message.type) {
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
      if (tabId) {
        void syncTabContextWithDesktop(tabId, 'tab_ready').catch((error) => {
          logger.debug('TAB_READY context sync failed', error);
        });
      }
      return { success: true, ready: true } as ExtensionResponse;
    }

    case 'SYNC_PAGE_CONTEXT': {
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }
      if (!resolvedTabId) {
        return { success: false, error: 'No tab ID for page context sync' } as ExtensionResponse;
      }

      // FIX (audit 2026-05-20, §9): the content script is on attacker-
      // authored pages (Slack/Gmail/Docs/etc.). Page-script can postMessage
      // arbitrary shapes into our SYNC_PAGE_CONTEXT path. Whitelist the
      // fields by type at this boundary so a hostile context cannot smuggle
      // extra keys past the downstream sender.
      const rawContext =
        (message as ExtensionMessage & { context?: Record<string, unknown> }).context ?? null;
      let messageContext: Record<string, unknown> | undefined;
      if (rawContext && typeof rawContext === 'object') {
        const whitelisted: Record<string, unknown> = {
          success: true,
        };
        const str = (k: string) => {
          const v = rawContext[k];
          if (typeof v === 'string') whitelisted[k] = v;
        };
        const num = (k: string) => {
          const v = rawContext[k];
          if (typeof v === 'number' && Number.isFinite(v)) whitelisted[k] = v;
        };
        str('url');
        str('title');
        str('html');
        str('selectedText');
        str('error');
        num('timestamp');
        messageContext = whitelisted;
      }
      return syncTabContextWithDesktop(resolvedTabId, 'content_sync', messageContext);
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
      void handleChatMessage(chatMsg, sender);
      return { success: true } as ExtensionResponse;
    }

    case 'CANCEL_STREAM': {
      const cancelMsg = message as import('./types').CancelStreamMessage;
      const active = activeChatStreams.get(cancelMsg.id);
      if (!active) {
        return { success: false, error: 'No active stream for id' } as ExtensionResponse;
      }
      active.cancelRequested = true;
      if (!active.cancelNotified) {
        active.cancelNotified = true;
        const chunk: import('./types').ChatChunkMessage = {
          type: 'CHAT_CHUNK',
          id: cancelMsg.id,
          text: '',
          done: true,
          error: 'Cancelled.',
        };
        chrome.runtime.sendMessage(chunk).catch(() => {});
      }
      active.controller.abort();
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

    case 'OPEN_IN_DESKTOP': {
      // Forward to desktop via native bridge — lets the side panel hand off the
      // current session to the desktop app (Claude/Comet parity feature).
      void sendNativeMessage({ type: 'OPEN_IN_DESKTOP' });
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

    case 'GET_COOKIES': {
      const cookieMsg = message as import('./types').GetCookiesMessage;
      return handleGetCookies(cookieMsg);
    }

    case 'SET_COOKIE': {
      const cookieMsg = message as import('./types').SetCookieMessage;
      return handleSetCookie(cookieMsg);
    }

    case 'CLEAR_COOKIES': {
      const cookieMsg = message as import('./types').ClearCookiesMessage;
      return handleClearCookies(cookieMsg);
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

    case 'WEBMCP_DISCOVER_TOOLS':
    case 'WEBMCP_CALL_TOOL': {
      // Forward to content script on the active tab
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
      // Store discovered tools per tab for native messaging bridge
      const toolsMsg = message as import('./types').WebMCPToolsChangedMessage;
      const toolsTabId = sender?.tab?.id;
      if (toolsTabId && toolsMsg.tools) {
        webmcpToolsByTab.set(toolsTabId, {
          tools: toolsMsg.tools,
          url: toolsMsg.url || '',
          timestamp: Date.now(),
        });
        logger.info(`WebMCP: ${toolsMsg.tools.length} tool(s) on tab ${toolsTabId}`, {
          tools: toolsMsg.tools.map((t: import('./types').WebMCPToolInfo) => t.name),
        });
        // Forward to side panel so it can display the discovered tools
        chrome.runtime
          .sendMessage({
            type: 'WEBMCP_TOOLS_CHANGED',
            tools: toolsMsg.tools,
            url: toolsMsg.url,
          })
          .catch(() => {
            // Side panel may not be open; ignore
          });
        // Forward to native messaging if connected
        if (state.isNativeConnected && state.nativePort) {
          try {
            state.nativePort.postMessage({
              type: 'webmcp_tools_update',
              tab_id: toolsTabId,
              tools: toolsMsg.tools,
              url: toolsMsg.url,
            });
          } catch (err) {
            // Native port may be disconnected
            logger.debug('WebMCP native port message failed', err);
          }
        }
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

    case 'GET_CONSOLE_LOGS':
    case 'CLEAR_CONSOLE_LOGS': {
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

    case 'SAVE_SHORTCUT':
      return handleSaveShortcut(message as import('./types').SaveShortcutMessage);

    case 'LIST_SHORTCUTS':
      return handleListShortcuts();

    case 'DELETE_SHORTCUT':
      return handleDeleteShortcut(message as import('./types').DeleteShortcutMessage);

    case 'REPLAY_SHORTCUT':
      return handleReplayShortcut(message as import('./types').ReplayShortcutMessage);

    case 'CREATE_SCHEDULED_TASK':
      return handleCreateScheduledTask(message as import('./types').CreateScheduledTaskMessage);

    case 'LIST_SCHEDULED_TASKS':
      return handleListScheduledTasks();

    case 'UPDATE_SCHEDULED_TASK':
      return handleUpdateScheduledTask(message as import('./types').UpdateScheduledTaskMessage);

    case 'DELETE_SCHEDULED_TASK':
      return handleDeleteScheduledTask(message as import('./types').DeleteScheduledTaskMessage);

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
      // return the full accumulated response text. Uses the same local bridge /
      // native chain as CHAT_MESSAGE but resolves to a simple { success, text }
      // rather than broadcasting chunks, since content scripts cannot receive
      // chunked messages while the panel waits.
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

    // BLOCKER-01: autonomy mode get/set
    case 'GET_ACTION_MODE' as ExtensionMessage['type']: {
      return { success: true, mode: actionModeCache } as ExtensionResponse;
    }

    case 'SET_ACTION_MODE' as ExtensionMessage['type']: {
      const modeMsg = message as import('./types').SetActionModeMessage;
      const newMode = modeMsg.mode;
      if (newMode !== 'ask' && newMode !== 'act') {
        return { success: false, error: 'Invalid action mode' } as ExtensionResponse;
      }
      actionModeCache = newMode;
      await chrome.storage.local.set({ agi_action_mode: newMode });
      return { success: true, mode: newMode } as ExtensionResponse;
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

    // BLOCKER-02: user decision arriving from the side panel for a pending permission request
    case 'PERMISSION_RESPONSE' as ExtensionMessage['type']: {
      const resp = message as import('./types').PermissionResponseMessage;
      const pending = pendingPermissionRequests.get(resp.requestId);
      if (!pending) return { success: false, error: 'No pending request' } as ExtensionResponse;
      pendingPermissionRequests.delete(resp.requestId);
      pending.resolve(resp.decision);
      if (resp.decision === 'always' && resp.requestId) {
        // Persist to site allowlist using the domain encoded in the requestId prefix
        const domainMatch = /^perm_([^_]+(?:_[^_]+)*)_\d+$/.exec(resp.requestId);
        const domain = domainMatch?.[1] ? domainMatch[1].replace(/_dot_/g, '.') : null;
        if (domain) {
          const origin = `https://${domain}`;
          const stored = await chrome.storage.local.get('agi_site_allowlist');
          const list: string[] = Array.isArray(stored['agi_site_allowlist'])
            ? (stored['agi_site_allowlist'] as string[])
            : [];
          if (!list.includes(origin)) {
            list.push(origin);
            await chrome.storage.local.set({ agi_site_allowlist: list });
          }
        }
      }
      return { success: true } as ExtensionResponse;
    }

    case 'AGI_START_COMPUTER_USE' as ExtensionMessage['type']: {
      // SECURITY: 'AGI_START_COMPUTER_USE' is in EXTENSION_PAGE_ONLY_MESSAGE_TYPES —
      // the handleMessage guard above already rejected any non-UI sender before we
      // reach this case. Here we additionally re-validate the target tab's origin
      // against siteAllowlistCache before starting the CDP loop.
      const cuMsg = message as import('./types').StartComputerUseMessage;
      const cuTabId = cuMsg.tabId;
      const cuGoal = typeof cuMsg.goal === 'string' ? cuMsg.goal.slice(0, 4096) : '';

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

      // Re-validate the tab's origin against the allowlist (belt-and-suspenders).
      let cuTab: chrome.tabs.Tab | undefined;
      try {
        cuTab = await chrome.tabs.get(cuTabId);
      } catch {
        return {
          success: false,
          error: 'AGI_START_COMPUTER_USE: tab not found',
        } as ExtensionResponse;
      }
      if (!cuTab?.url) {
        return {
          success: false,
          error: 'AGI_START_COMPUTER_USE: tab has no URL',
        } as ExtensionResponse;
      }
      let cuOrigin: string;
      try {
        cuOrigin = new URL(cuTab.url).origin;
      } catch {
        return {
          success: false,
          error: 'AGI_START_COMPUTER_USE: invalid tab URL',
        } as ExtensionResponse;
      }
      if (!siteAllowlistCache.has(cuOrigin)) {
        return {
          success: false,
          error:
            `AGI_START_COMPUTER_USE: tab origin "${cuOrigin}" is not on the site allowlist. ` +
            'Add it via the extension popup before starting computer use.',
        } as ExtensionResponse;
      }

      // Read the "ask before acting" preference stored by the side panel.
      // The side panel writes 'agi_cu_ask_before_acting' (boolean) to
      // chrome.storage.local when the toggle changes. Default: false (allow-all).
      const askPref = await chrome.storage.local.get('agi_cu_ask_before_acting');
      const askBeforeActing = askPref['agi_cu_ask_before_acting'] === true;

      // onBeforeAction wiring:
      //   - When askBeforeActing is false (default): no gate — every action is
      //     allowed immediately (lowest-friction path for automated scenarios).
      //   - When askBeforeActing is true: the background sends an AGI_CU_APPROVE_REQUEST
      //     message to the side panel, then waits for an AGI_CU_APPROVE_RESPONSE
      //     (allow/deny). The side panel's showApprovalCard() provides the UI.
      //     A 30 s timeout is applied; no response = DENY (fail-CLOSED) so a
      //     closed/unresponsive panel can never auto-approve an action. Matches
      //     agentLoop's fail-closed contract (commit security review 2026-06-13).
      const onBeforeAction = askBeforeActing
        ? async (toolName: string, args: Record<string, unknown>): Promise<boolean> => {
            // SECURITY (commit review 2026-06-13): CSPRNG request id, not Math.random,
            // so a prompt-injected page cannot guess an in-flight approval id.
            const requestId = `cu_approve_${crypto.randomUUID()}`;
            // Notify the side panel to show an approval card
            void chrome.runtime.sendMessage({
              type: 'AGI_CU_APPROVE_REQUEST',
              requestId,
              toolName,
              description: `${toolName}(${Object.entries(args)
                .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                .join(', ')})`,
            });
            // Wait for the side panel's response (or timeout after 30 s → DENY)
            const decision = await new Promise<boolean>((resolve) => {
              const timeout = setTimeout(() => {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(false); // fail-CLOSED: deny if no approval arrives in time
              }, 30_000);
              function listener(msg: unknown, sender: chrome.runtime.MessageSender): void {
                // SECURITY (commit review 2026-06-13): only honor approval responses
                // from a trusted extension page (popup/side panel/options) — these
                // have no sender.tab. Reject content-script / external senders so a
                // prompt-injected page cannot forge an AGI_CU_APPROVE_RESPONSE and
                // bypass the human approval gate.
                if (sender.id !== chrome.runtime.id || sender.tab) return;
                if (
                  typeof msg === 'object' &&
                  msg !== null &&
                  (msg as Record<string, unknown>)['type'] === 'AGI_CU_APPROVE_RESPONSE' &&
                  (msg as Record<string, unknown>)['requestId'] === requestId
                ) {
                  clearTimeout(timeout);
                  chrome.runtime.onMessage.removeListener(listener);
                  resolve((msg as Record<string, unknown>)['allowed'] === true);
                }
              }
              chrome.runtime.onMessage.addListener(listener);
            });
            return decision;
          }
        : undefined; // allow-all (no gate)

      // Run the agent loop in a detached promise so we can return immediately.
      // Progress updates are broadcast via AGI_CU_STEP messages so the side
      // panel's existing listener (side_panel.ts:3781) picks them up.
      void runAgentLoop(cuGoal, cuTabId, {
        onBeforeAction,
        onProgress: (step) => {
          void chrome.runtime.sendMessage({ type: 'AGI_CU_STEP', step });
        },
      }).catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error('Computer-use agent loop error', err);
        void chrome.runtime.sendMessage({ type: 'AGI_CU_ESCALATE', reason: errMsg });
      });

      return { success: true } as ExtensionResponse;
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

async function handleGetCookies(
  message: import('./types').GetCookiesMessage,
): Promise<ExtensionResponse> {
  try {
    let { url } = message;
    if (!url) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      url = activeTab?.url ?? '';
    }
    if (!url) {
      return {
        success: false,
        error: 'Could not resolve a URL for cookie access.',
      } as ExtensionResponse;
    }
    if (!isCookieDomainAllowed(url)) {
      return {
        success: false,
        error: 'Cookie access for this domain is blocked for security.',
      } as ExtensionResponse;
    }
    const cookies = await chrome.cookies.getAll({ url });
    return { success: true, data: cookies } as ExtensionResponse;
  } catch (error) {
    logger.error('Failed to get cookies', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get cookies',
    } as ExtensionResponse;
  }
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

async function handleClearCookies(
  message: import('./types').ClearCookiesMessage,
): Promise<ExtensionResponse> {
  try {
    let { url } = message;
    if (!url) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      url = activeTab?.url ?? '';
    }
    if (!url) {
      return {
        success: false,
        error: 'Could not resolve a URL for cookie clearing.',
      } as ExtensionResponse;
    }
    if (!isCookieDomainAllowed(url)) {
      return {
        success: false,
        error: 'Cookie access for this domain is blocked for security.',
      } as ExtensionResponse;
    }
    const cookies = await chrome.cookies.getAll({ url });
    await Promise.all(
      cookies.map((cookie) =>
        chrome.cookies.remove({
          url: `${cookie.secure ? 'https' : 'http'}://${cookie.domain}${cookie.path}`,
          name: cookie.name,
        }),
      ),
    );
    return { success: true, cleared: cookies.length } as ExtensionResponse;
  } catch (error) {
    logger.error('Failed to clear cookies', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear cookies',
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

async function syncTabContextWithDesktop(
  tabId: number,
  reason: string,
  providedContext?: Record<string, unknown>,
): Promise<ExtensionResponse> {
  const context = (providedContext ??
    (await forwardToContentScript(tabId, {
      type: 'GET_PAGE_INFO',
      tabId,
    } as ExtensionMessage))) as unknown as PageContextSnapshot;

  if (!context || context.success !== true) {
    return {
      success: false,
      error: String(context?.error ?? 'Unable to collect page context'),
    } as ExtensionResponse;
  }

  const url = String(context.url ?? '').trim();
  const title = String(context.title ?? '').trim();
  if (!url || !title) {
    return {
      success: false,
      error: 'Invalid page context: missing url/title',
    } as ExtensionResponse;
  }

  const html = String(context.html ?? '').substring(0, MAX_CONTEXT_HTML_CHARS);
  const selectedText = String(context.selectedText ?? '').substring(0, 2_000);
  const timestamp = Number(context.timestamp ?? Date.now());
  const fingerprint = `${url}::${title}::${selectedText.slice(0, 200)}`;
  const previousSync = lastPageContextSyncByTab.get(tabId);
  const now = Date.now();
  if (previousSync && previousSync.fingerprint === fingerprint && now - previousSync.at < 5_000) {
    return {
      success: true,
      skipped: true,
      reason: 'page_context_unchanged',
    } as ExtensionResponse;
  }
  lastPageContextSyncByTab.set(tabId, { fingerprint, at: now });

  const pageContextResponse = (await sendNativeRequest({
    type: 'page_context',
    url,
    title,
    html,
    selected_text: selectedText,
    tab_id: tabId,
    timestamp,
    reason,
  })) as unknown as NativeResponseEnvelope;

  if (pageContextResponse.success !== true) {
    return {
      success: false,
      error: String(pageContextResponse.error ?? 'Desktop rejected page context'),
    } as ExtensionResponse;
  }

  const plannerData = (pageContextResponse.data ?? {}) as NativePageContextPlan;
  const taskId = String(plannerData.task_id ?? '');
  const rawActions = Array.isArray(plannerData.actions) ? plannerData.actions : [];
  // SECURITY (L-09 audit 2026-05-19): validate the desktop-bridge-supplied
  // action plan before forwarding to the content script. The bridge is
  // trusted today, but defense-in-depth: if the bridge is ever compromised
  // (e.g., a malicious local app binds port 8787), an attacker-crafted
  // action plan should still be rejected by the same allowlist that gates
  // user-saved shortcuts.
  if (rawActions.length > 0 && !validateShortcutActions(rawActions)) {
    logger.warn('Rejected desktop-bridge plan containing unknown action type', {
      taskId,
      actionCount: rawActions.length,
    });
    return {
      success: false,
      error: 'Desktop plan contains an unsupported action type.',
    } as ExtensionResponse;
  }
  const actions = rawActions;

  if (!taskId || actions.length === 0) {
    return {
      success: true,
      taskId,
      actionsDispatched: 0,
    } as ExtensionResponse;
  }

  // BLOCKER-01/02: gate execution on autonomy mode. When mode='ask', prompt
  // the user with an inline consent card before executing page actions.
  if (actionModeCache === 'ask') {
    // Derive the domain from the first action's URL or fall back to the tab URL.
    let actionDomain = '';
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.url) actionDomain = new URL(activeTab.url).hostname;
    } catch {
      // ignore — domain is best-effort for display only
    }
    if (!siteAllowlistCache.has(`https://${actionDomain}`)) {
      const requestId = `perm_${actionDomain.replace(/\./g, '_dot_')}_${Date.now()}`;
      const actionSummary =
        actions.length === 1
          ? `run 1 action on ${actionDomain}`
          : `run ${actions.length} actions on ${actionDomain}`;
      const permMsg: import('./types').PermissionRequiredMessage = {
        type: 'PERMISSION_REQUIRED',
        requestId,
        domain: actionDomain,
        actionDescription: actionSummary,
      };
      chrome.runtime.sendMessage(permMsg).catch(() => {});
      // Wait up to 60 s for the user to respond; decline silently on timeout.
      const decision = await new Promise<'allow' | 'deny' | 'always'>((resolve) => {
        const timer = setTimeout(() => {
          pendingPermissionRequests.delete(requestId);
          resolve('deny');
        }, 60_000);
        pendingPermissionRequests.set(requestId, {
          resolve: (d) => {
            clearTimeout(timer);
            resolve(d);
          },
        });
      });
      if (decision === 'deny') {
        return {
          success: false,
          error: 'User declined permission for this action.',
        } as ExtensionResponse;
      }
      // 'allow' or 'always' — proceed with execution
    }
  }

  const executionResponse = (await forwardToContentScript(tabId, {
    type: 'RUN_PAGE_ACTIONS',
    tabId,
    taskId,
    actions,
  } as ExtensionMessage)) as unknown as RunActionsExecutionPayload;

  const taskResultPayload = {
    type: 'task_result',
    task_id: taskId,
    success: executionResponse.success === true,
    screenshot:
      typeof executionResponse.screenshot === 'string' ? executionResponse.screenshot : undefined,
    result: executionResponse.result !== undefined ? executionResponse.result : executionResponse,
    error:
      executionResponse.success === true
        ? undefined
        : String(executionResponse.error ?? 'Extension action execution failed'),
    actions_performed: Number(executionResponse.actionsPerformed ?? 0),
    duration: Number(executionResponse.duration ?? 0),
  };

  const taskResultResponse = (await sendNativeRequest(
    taskResultPayload,
  )) as unknown as NativeResponseEnvelope;
  if (taskResultResponse.success !== true) {
    return {
      success: false,
      error: String(taskResultResponse.error ?? 'Failed to submit task result'),
      taskId,
    } as ExtensionResponse;
  }

  return {
    success: true,
    taskId,
    actionsDispatched: actions.length,
    actionsPerformed: Number(executionResponse.actionsPerformed ?? 0),
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
      chrome.tabs.sendMessage(
        tab.id,
        { type: 'WEBMCP_DISCOVER_TOOLS' },
        (response: { tools?: import('./types').WebMCPToolInfo[] } | undefined) => {
          if (chrome.runtime.lastError) {
            logger.warn('WebMCP discover failed', chrome.runtime.lastError.message);
            return;
          }
          const tools = response?.tools ?? [];
          logger.info(`WebMCP: discovered ${tools.length} tool(s) on tab ${tab!.id}`, {
            tools: tools.map((t) => t.name),
          });
          if (tab!.id != null) {
            webmcpToolsByTab.set(tab!.id, {
              tools,
              url: info.pageUrl ?? '',
              timestamp: Date.now(),
            });
          }
        },
      );
    } else if (info.menuItemId === 'ask-agi-workforce' && info.selectionText && tab.id) {
      // Store selection for side panel to pick up, then open it
      chrome.storage.session
        .set({
          agi_pending_chat: {
            type: 'ask',
            text: info.selectionText,
            url: info.pageUrl ?? '',
            timestamp: Date.now(),
          },
        })
        .catch((err) => {
          logger.warn('Failed to store pending chat (ask)', err);
        });
      void sendNativeMessage({
        type: 'selected_text_query',
        tabId: tab.id,
        url: info.pageUrl,
        selectedText: info.selectionText,
        timestamp: Date.now(),
      });
      if (chrome.sidePanel) {
        chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
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
  state.rateLimiter.reset(tabId);
  lastPageContextSyncByTab.delete(tabId);
  webmcpToolsByTab.delete(tabId);
  nlwebByTab.delete(tabId);
  logger.debug('Cleaned up rate limit, webmcp tools, and nlweb for tab', { tabId });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') {
    return;
  }
  const url = tab.url ?? '';
  if (!/^https?:\/\//i.test(url)) {
    return;
  }
  // SECURITY (H-06 audit 2026-05-19): the previous listener fired for every
  // http(s) tab regardless of allowlist, shipping innerText to the desktop
  // bridge for pages the user never authorized. Gate on the same
  // `siteAllowlistCache` that controls message dispatch. Non-allowlisted
  // origins get no implicit page-context sync.
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return;
  }
  if (!siteAllowlistCache.has(origin)) {
    return;
  }

  void syncTabContextWithDesktop(tabId, 'tab_updated').catch((error) => {
    logger.debug('Tab update context sync skipped', error);
  });
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

// DEFAULT_AGI_BRIDGE_URL and ALLOWED_BRIDGE_HOSTS are now imported from
// `./background/policy` so side-panel, pairing, and tests share one source
// of truth. See H-02 in audits/2026-05-19.

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

/**
 * Resolve the configured bridge URL from storage, falling back to the default.
 * Returns a base HTTP(S) URL derived from the stored ws:// or http:// value.
 * Rejects non-local URLs to prevent data exfiltration.
 */
async function getAgiBridgeBaseUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get('agi_bridge_url', (result) => {
      if (chrome.runtime.lastError) {
        logger.warn('Failed to read bridge URL from storage', chrome.runtime.lastError.message);
        resolve(DEFAULT_AGI_BRIDGE_URL);
        return;
      }
      const raw = (result['agi_bridge_url'] as string | undefined)?.trim();
      if (!raw) {
        resolve(DEFAULT_AGI_BRIDGE_URL);
        return;
      }
      const validated = validateBridgeUrl(raw);
      if (!validated) {
        logger.error('Stored bridge URL failed validation, using default', { raw });
        resolve(DEFAULT_AGI_BRIDGE_URL);
        return;
      }
      resolve(validated);
    });
  });
}

async function handleChatMessage(
  message: import('./types').ChatMessageMessage,
  _sender: chrome.runtime.MessageSender,
): Promise<void> {
  // SECURITY (chrome-HIGH-3, audit 2026-05-04): the previous implementation
  // destructured an `apiKey` field straight off the inbound message and used
  // it as the authoritative provider key. A malicious page (via a compromised
  // allowlisted origin or via XSS on an allowlisted site) could craft a
  // `CHAT_MESSAGE` carrying an attacker-controlled `apiKey` and force every
  // outbound request to authenticate against that key, or to a key the
  // attacker wants the user to bill. Chrome chat now stays inside the
  // desktop/native bridge boundary, so no provider API key is resolved here.
  // The `apiKey` destructure is gone.
  const { id, text, pageContext, conversationHistory = [], attachments } = message;

  const broadcastChunk = (chunkText: string, done: boolean, error?: string): void => {
    const chunk: import('./types').ChatChunkMessage = {
      type: 'CHAT_CHUNK',
      id,
      text: chunkText,
      done,
      error,
    };
    // Send to all extension views — side panel receives this via onMessage
    chrome.runtime.sendMessage(chunk).catch(() => {
      // Side panel may not be open; ignore
    });
  };

  const streamController = new AbortController();
  const activeStream: ActiveChatStream = {
    controller: streamController,
    cancelRequested: false,
    cancelNotified: false,
  };
  activeChatStreams.set(id, activeStream);

  // Build message array for the API
  const messages: Array<{ role: string; content: string }> = [];

  // Prepend platform-specific knowledge prompt if on a known site (Gap 1)
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabUrl = activeTab?.url;
    if (tabUrl) {
      const platformPrompt = getPlatformPrompt(tabUrl);
      if (platformPrompt) {
        messages.push({ role: 'system', content: platformPrompt });
      }
    }
  } catch {
    // Tab query failed — proceed without platform prompt
  }

  messages.push(...conversationHistory.map((h) => ({ role: h.role, content: h.content })));

  // Append page context to the user message if provided.
  // SECURITY: The fixed `<page_context>` delimiter was trivially escapable —
  // a hostile page (or a Slack DM / Gmail body that the user copies) could
  // contain a literal `</page_context>` tag and break out of the fence,
  // injecting attacker-controlled instructions into the model's user turn.
  // Mitigation: bind the fence to a per-request random nonce so any injected
  // closing tag the attacker chooses cannot match the actual fence string.
  const fenceNonce = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  let userContent = pageContext
    ? `${text}\n\n<page_context_${fenceNonce}>\n${pageContext}\n</page_context_${fenceNonce}>`
    : text;

  // Round-2 audit P0 #3 fix (2026-05-21): if the side panel forwarded inline
  // data-URL attachments, surface them as a structured annotation so the
  // model can reference them. The desktop bridge can upgrade this into proper
  // multi-modal content in a follow-up; today the annotation alone closes the
  // regression of attachments being silently dropped between the composer and
  // the model.
  if (attachments && attachments.length > 0) {
    const attachmentSummary = attachments
      .map((dataUrl, idx) => {
        const mimeMatch = /^data:([^;,]+)/.exec(dataUrl);
        const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
        return `- attachment_${idx + 1}: ${mime} (${dataUrl.length} chars)`;
      })
      .join('\n');
    userContent += `\n\n<attachments_${fenceNonce}>\n${attachmentSummary}\n</attachments_${fenceNonce}>`;
  }

  messages.push({ role: 'user', content: userContent });

  try {
    // Resolve the bridge URL at call time so it picks up any in-session changes.
    const AGI_API_BASE = await getAgiBridgeBaseUrl();
    if (streamController.signal.aborted) {
      return;
    }

    // Attempt to stream via the local desktop bridge only.
    // If unavailable, fail closed or use native messaging; never fall back to hosted APIs.
    let streamed = false;

    const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    // Bridge-token attachment: read pairing token from session storage.
    // This is set during the one-time popup pairing flow.
    const bridgeToken = await new Promise<string | null>((res) => {
      try {
        chrome.storage.session.get('agi_bridge_token', (r) => {
          if (chrome.runtime.lastError) {
            res(null);
            return;
          }
          const t = (r['agi_bridge_token'] as string | undefined)?.trim();
          res(t ?? null);
        });
      } catch {
        res(null);
      }
    });
    if (bridgeToken) {
      fetchHeaders['X-Bridge-Token'] = bridgeToken;
    }

    try {
      const timeoutId = setTimeout(() => {
        streamController.abort();
      }, 60_000);
      const resp = await fetch(`${AGI_API_BASE}/v1/chat/stream`, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify({ messages, stream: true }),
        signal: streamController.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (resp.ok && resp.body) {
        streamed = true;
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        // Buffer incomplete lines across reader.read() calls so a JSON
        // payload split across two TCP segments is not silently dropped.
        let sseBuffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (streamController.signal.aborted) return;
          sseBuffer += decoder.decode(value, { stream: true });
          // Split on newlines — the last element may be an incomplete line,
          // so we keep it in the buffer for the next iteration.
          const lines = sseBuffer.split('\n');
          sseBuffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            const dataStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
            try {
              const parsed = JSON.parse(dataStr) as {
                choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
                content?: string;
                done?: boolean;
              };
              const delta = parsed.choices?.[0]?.delta?.content ?? parsed.content ?? '';
              if (delta) {
                broadcastChunk(delta, false);
              }
              if (parsed.done || parsed.choices?.[0]?.finish_reason === 'stop') {
                broadcastChunk('', true);
                return;
              }
            } catch {
              // Non-JSON line — skip
            }
          }
        }
        // Flush any remaining buffered content after the stream ends.
        const remaining = sseBuffer.trim();
        if (remaining && remaining !== 'data: [DONE]') {
          const dataStr = remaining.startsWith('data: ') ? remaining.slice(6) : remaining;
          try {
            const parsed = JSON.parse(dataStr) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
              content?: string;
              done?: boolean;
            };
            const delta = parsed.choices?.[0]?.delta?.content ?? parsed.content ?? '';
            if (delta) {
              broadcastChunk(delta, false);
            }
          } catch {
            // Final fragment is not valid JSON — discard
          }
        }
        broadcastChunk('', true);
        return;
      }
    } catch (fetchErr) {
      if (streamController.signal.aborted) {
        if (!activeStream.cancelRequested || !activeStream.cancelNotified) {
          broadcastChunk(
            '',
            true,
            activeStream.cancelRequested ? 'Cancelled.' : 'Bridge request timed out.',
          );
        }
        return;
      }
      // Network error or local API unavailable — fall through to native.
      // Log for diagnostics but don't surface to user.
      logger.debug('Chat SSE fetch failed, falling back to native', fetchErr);
    }

    if (!streamed) {
      // Fall back: forward to native desktop app via existing QUEUE_MESSAGE path
      if (state.isNativeConnected && state.nativePort) {
        if (streamController.signal.aborted) {
          if (!activeStream.cancelNotified) {
            broadcastChunk('', true, 'Cancelled.');
          }
          return;
        }
        try {
          const nativeResp = (await withTimeout(
            sendNativeRequest({
              type: 'chat_message',
              id,
              text: userContent,
              conversationHistory,
              timestamp: Date.now(),
            }),
            30000,
          )) as unknown as { success?: boolean; reply?: string; error?: string };

          if (nativeResp?.reply) {
            broadcastChunk(nativeResp.reply, false);
          }
          if (streamController.signal.aborted) {
            if (!activeStream.cancelNotified) {
              broadcastChunk('', true, 'Cancelled.');
            }
            return;
          }
          broadcastChunk('', true);
          return;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Native request failed';
          broadcastChunk('', true, errMsg);
          return;
        }
      }

      // Nothing available — surface as an error bubble so it renders in red,
      // not as a normal assistant reply. The side panel already has an offline
      // onboarding screen; this error is the fallback for in-session disconnects.
      broadcastChunk(
        '',
        true,
        'Desktop bridge not available. Start the AGI desktop app and try again.',
      );
    }
  } catch (error) {
    logger.error('handleChatMessage error', error);
    const errText = error instanceof Error ? error.message : 'Unknown error';
    broadcastChunk('', true, errText);
    showNotification('Chat Error', errText);
  } finally {
    activeChatStreams.delete(id);
  }
}

/**
 * Handle an in-page prompt from the content-script overlay panel.
 *
 * Returns the full accumulated response text so the panel can render it
 * without needing a chunked messaging protocol.
 *
 * Fallback chain (same trust boundary as handleChatMessage):
 *  1. HTTP fetch to AGI bridge (localhost:8787)
 *  2. Native messaging to desktop app
 *  3. Offline message
 */
async function handleInPagePrompt(prompt: string): Promise<string> {
  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
    { role: 'user', content: prompt },
  ];

  // Path 1 — HTTP bridge
  const AGI_API_BASE = await getAgiBridgeBaseUrl();
  try {
    const resp = await fetch(`${AGI_API_BASE}/v1/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, stream: false }),
      signal: AbortSignal.timeout(45000),
    });
    if (resp.ok) {
      const json = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        content?: string;
      };
      const text =
        json.choices?.[0]?.message?.content ??
        (typeof json.content === 'string' ? json.content : '');
      if (text) return text;
    }
  } catch {
    logger.debug('In-page prompt: bridge fetch failed, trying native');
  }

  // Path 2 — native messaging
  if (state.isNativeConnected && state.nativePort) {
    try {
      const nativeResp = (await withTimeout(
        sendNativeRequest({
          type: 'chat_message',
          id: `in_page_${Date.now()}`,
          text: prompt,
          conversationHistory: [],
          timestamp: Date.now(),
        }),
        30000,
      )) as unknown as { success?: boolean; reply?: string; error?: string };
      if (nativeResp?.reply) return nativeResp.reply;
    } catch (err) {
      logger.warn('In-page prompt: native fallback failed', err);
    }
  }

  // Path 3 — offline
  return 'The AGI Workforce desktop app is not running. Please start it and try again.';
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
    // Periodic connection check (replaces setInterval which is lost on MV3 suspension)
    if (!_bgCtx.nativeReconnectGaveUp && !state.isNativeConnected) {
      void connectToNativeHost();
    }
    return;
  }

  // Handle scheduled task alarms (Gap 6 / W5-03)
  if (alarm.name.startsWith(TASK_ALARM_PREFIX)) {
    const taskId = alarm.name.slice(TASK_ALARM_PREFIX.length);
    void loadScheduledTasks()
      .then((tasks) => {
        const task = tasks.find((t) => t.id === taskId);
        if (!task?.enabled) return;
        chrome.notifications.create(`agi_task_notif_${taskId}`, {
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'AGI Task Running',
          message: task.name,
          priority: 0,
        });
        void executeScheduledTask(task);
      })
      .catch((err) => {
        logger.warn(`Failed to load/execute scheduled task ${taskId}`, err);
      });
  }
});

chrome.runtime.onSuspend.addListener(() => {
  if (!state.nativePort || !state.isNativeConnected) {
    return;
  }

  try {
    state.nativePort.postMessage({
      id: createRequestId(),
      message: {
        type: 'disconnect',
        reason: 'extension_service_worker_suspend',
      },
    });
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
