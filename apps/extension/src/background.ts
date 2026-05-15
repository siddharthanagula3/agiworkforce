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
} from './background/shortcuts';
import {
  loadScheduledTasks,
  saveScheduledTasks,
  handleCreateScheduledTask,
  handleListScheduledTasks,
  handleUpdateScheduledTask,
  handleDeleteScheduledTask,
  restoreScheduledTaskAlarms,
  TASK_ALARM_PREFIX,
} from './background/tasks';
import { getPlatformPrompt } from './platform-prompts';
import {
  streamFromProvider,
  type ProviderStreamProvider,
  type StreamChunk as ProviderStreamChunk,
} from './providerStreamClient';
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
const MAX_CONTEXT_HTML_CHARS = 100_000;
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

function sendNativeRequest(message: Record<string, unknown>): Promise<ExtensionResponse> {
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
        reject(new Error(`Native request timeout after ${NATIVE_REQUEST_TIMEOUT_MS}ms`));
      }, NATIVE_REQUEST_TIMEOUT_MS);

      pendingRequests.set(id, { resolve, reject, timeout });

      try {
        state.nativePort?.postMessage({
          id,
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

  if (message && message.id && pendingRequests.has(message.id)) {
    const request = pendingRequests.get(message.id);
    if (request) {
      const { resolve, reject, timeout } = request;
      clearTimeout(timeout);
      pendingRequests.delete(message.id);
      if (message.success === false) {
        reject(new Error(message.error ?? 'Native request failed'));
      } else {
        resolve(message as unknown as ExtensionResponse);
      }
    }
  }
}

function handleNativeDisconnect(): void {
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
  const notifId = `agi_${Date.now()}`;
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
    // user input but small enough to bound LLM cost on the user's API key.
    const TASK_PROMPT_MAX_CHARS = 10_000;
    const safePrompt = String(task.prompt).slice(0, TASK_PROMPT_MAX_CHARS);
    if (safePrompt.length < task.prompt.length) {
      logger.warn('Scheduled task prompt truncated', {
        taskId: task.id,
        originalLength: task.prompt.length,
        truncatedTo: TASK_PROMPT_MAX_CHARS,
      });
    }
    // Send as chat message via the same path as side panel
    const chatMsg: import('./types').ChatMessageMessage = {
      type: 'CHAT_MESSAGE',
      id: `task_${task.id}_${Date.now()}`,
      text: safePrompt,
      timestamp: Date.now(),
    };
    void handleChatMessage(chatMsg, {} as chrome.runtime.MessageSender);
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
const DISCOVERY_MESSAGE_TYPES = new Set<string>();
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

// EXT-3 (audit 2026-05-03): same-tab restriction for DOM-mutation
// commands. Even with an allowlisted origin, a malicious page must
// not be able to drive DOM mutation in a different tab.
// SECURITY (H-2): EVALUATE_SCRIPT removed. It had no handler in content.ts and
// its presence in this set made a future accidental eval()-based handler look
// "intentional" to reviewers. Do NOT re-add — content scripts must never
// expose an eval() surface. Use EXECUTE_SCRIPT + ALLOWED_SCRIPT_OPERATIONS instead.
//
// CHROME-NEW-002 fix (2026-05-04 audit): the prior set covered only `TYPE`,
// `CLICK`, storage, and `SUBMIT_FORM`. Every other content-script handler
// in `content.ts:222-274` (`SELECT_OPTION`, `CHECK`, `UNCHECK`, `FOCUS`,
// `BLUR`, `HOVER`, `SCROLL`, `DRAG_DROP`, `CLICK_AT_COORDINATES`) was
// forwarded to any caller-supplied `tabId` with no same-tab check. An
// allowlisted page (e.g., a compromised LinkedIn / Lever clone) could send
// `{ type: 'SELECT_OPTION', tabId: <banking>, selector: '#amount',
// value: '10000' }` and drive a different tab. We now gate every
// DOM-mutation-class message through `senderTabAllowedToMutate`. Recording
// types (`START_RECORDING` / `STOP_RECORDING`) read state and aren't
// mutations, so they remain outside this set.
const DOM_MUTATION_MESSAGE_TYPES = new Set<string>([
  'TYPE',
  'CLICK',
  'SET_LOCAL_STORAGE',
  'CLEAR_LOCAL_STORAGE',
  'SUBMIT_FORM',
  // Added 2026-05-04 — every type below has a handler in content.ts that
  // observably mutates the target tab's DOM or page state.
  'SELECT_OPTION',
  'CHECK',
  'UNCHECK',
  'FOCUS',
  'BLUR',
  'HOVER',
  'SCROLL',
  'DRAG_DROP',
  'CLICK_AT_COORDINATES',
  'EXECUTE_SCRIPT',
  // CHROME-NEW-005 fix (2026-05-05): compound action types must also be
  // gated by `senderTabAllowedToMutate`. `RUN_PAGE_ACTIONS` is a batch
  // executor that internally invokes any of the simple types above —
  // without this guard, an allowlisted origin could send
  // `{ type: 'RUN_PAGE_ACTIONS', tabId: <other-tab>, actions: [...] }` and
  // drive a different tab's DOM. `AUTO_FILL_JOB_APPLICATION` is the
  // LinkedIn / Lever autofill entry point and writes to form fields.
  'RUN_PAGE_ACTIONS',
  'AUTO_FILL_JOB_APPLICATION',
  // P0-D fix (2026-05-08): these three types have content-script handlers
  // that mutate the target tab's DOM (dispatch MouseEvent/simulate context-menu/
  // write form fields). Without this guard, an allowlisted origin could send
  // `{ type: 'DOUBLE_CLICK', tabId: <other-tab>, selector: '#btn' }` and drive
  // a different tab's DOM.
  'DOUBLE_CLICK',
  'RIGHT_CLICK',
  'FILL_FORM',
]);

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
        'This site is not on your AGI Workforce allowlist. Add it from the extension popup to enable automation here.',
    } as ExtensionResponse);
    return false;
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

      const messageContext = (message as ExtensionMessage & { context?: Record<string, unknown> })
        .context;
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

      if (!resolvedTabId || resolvedWindowId === undefined) {
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
    case 'GET_RECORDED_ACTIONS': {
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
      // return the full accumulated response text. Uses the same provider-stream
      // / bridge / native fallback chain as CHAT_MESSAGE but resolves to a
      // simple { success, text } rather than broadcasting chunks, since content
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
 * Domains where cookie operations are blocked to prevent exfiltration of
 * sensitive session tokens. Errs on the side of caution — default-deny for
 * known sensitive categories.
 */
const BLOCKED_COOKIE_DOMAINS: RegExp[] = [
  // Financial
  /bank/i,
  /paypal/i,
  /venmo/i,
  /chase/i,
  /wellsfargo/i,
  /citibank/i,
  /fidelity/i,
  /schwab/i,
  /stripe\.com$/i,
  /plaid\.com$/i,
  /coinbase/i,
  /binance/i,
  /kraken/i,
  // Government & healthcare
  /\.gov$/i,
  /\.mil$/i,
  /healthcare/i,
  /medical/i,
  /health\.com/i,
  // Cloud infrastructure & developer tools
  /aws\.amazon\.com/i,
  /console\.cloud\.google/i,
  /portal\.azure/i,
  /github\.com$/i,
  /gitlab\.com$/i,
  /bitbucket\.org$/i,
  // Auth & identity providers
  /accounts\.google/i,
  /login\.microsoftonline/i,
  /auth0\.com$/i,
  /okta\.com$/i,
  // Email & communication
  /mail\.google/i,
  /outlook\.(live|office)/i,
  // Social media (auth tokens)
  /facebook\.com$/i,
  /twitter\.com$/i,
  /x\.com$/i,
  /instagram\.com$/i,
  // CHROME-NEW-006 fix (2026-05-05): explicitly block the very platforms the
  // extension *targets* for autofill / chat assistance. The agent only needs
  // DOM-level read/write on these origins — not their session cookies. Without
  // these entries, a malicious script running on an allowlisted page could
  // call GET_COOKIES against `linkedin.com` / `slack.com` / `notion.so` /
  // `figma.com` / `lever.co` and exfiltrate the user's session token, even
  // though the regex `/health\.com/` and friends already cover unrelated
  // categories.
  /(^|\.)linkedin\.com$/i,
  /(^|\.)slack\.com$/i,
  /(^|\.)notion\.so$/i,
  /(^|\.)figma\.com$/i,
  /(^|\.)lever\.co$/i,
  /(^|\.)greenhouse\.io$/i,
  /(^|\.)workday\.com$/i,
  // CHROME-NEW-003 fix (2026-05-04): the extension's own auth surfaces are
  // sensitive too. An allowlisted page that calls GET_COOKIES against
  // `https://<ref>.supabase.co` would receive Supabase auth cookies, and
  // against `https://agiworkforce.com` would receive `agi_access_token` /
  // `agi_refresh_token`. Block both at the cookie layer.
  /\.supabase\.(co|io)$/i,
  /(^|\.)agiworkforce\.com$/i,
];

function isCookieDomainAllowed(urlOrDomain: string): boolean {
  if (!urlOrDomain) return false;
  const domain = urlOrDomain.replace(/^https?:\/\//, '').split('/')[0] ?? '';
  return !BLOCKED_COOKIE_DOMAINS.some((pattern) => pattern.test(domain));
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
  const actions = Array.isArray(plannerData.actions) ? plannerData.actions : [];

  if (!taskId || actions.length === 0) {
    return {
      success: true,
      taskId,
      actionsDispatched: 0,
    } as ExtensionResponse;
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
  try {
    // Skip discarded tabs — they have no active content script to receive messages.
    const tabs = await chrome.tabs.query({ discarded: false });

    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: 'CONNECTION_STATUS_CHANGED',
            connected: state.isNativeConnected,
            status: state.connectionStatus,
          },
          () => {
            // Reading chrome.runtime.lastError clears the error state (Chrome API
            // quirk). Without this, Chrome logs "Unchecked runtime.lastError".
            void chrome.runtime.lastError;
          },
        );
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

/** Default AGI bridge base URL — overridden by chrome.storage.local `agi_bridge_url`.
 *  Port 8787 is the canonical AGI Workforce desktop bridge port (matches VS Code ext + desktop). */
const DEFAULT_AGI_BRIDGE_URL = 'http://localhost:8787';

/** Allowed bridge URL hostnames — only local connections to the desktop app are permitted.
 *  `0.0.0.0` removed (SEV-CHEXT-09): on Linux it routes to LAN-bound services, defeating the
 *  loopback-only contract. Use the explicit loopback addresses only. */
const ALLOWED_BRIDGE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

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

/**
 * Validate that a bridge URL points to a local address.
 * Returns the normalized URL if valid, null if rejected.
 */
function validateBridgeUrl(raw: string): string | null {
  try {
    // Normalize protocol for URL parsing
    const normalized = raw.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
    const parsed = new URL(normalized);

    // Only allow http/https schemes
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      logger.warn('Bridge URL rejected: unsupported protocol', { protocol: parsed.protocol });
      return null;
    }

    // Only allow local hostnames — never route bridge traffic to remote servers
    if (!ALLOWED_BRIDGE_HOSTS.has(parsed.hostname)) {
      logger.warn('Bridge URL rejected: non-local hostname', { hostname: parsed.hostname });
      return null;
    }

    // Strip trailing slash
    return normalized.replace(/\/$/, '');
  } catch {
    logger.warn('Bridge URL rejected: invalid URL', { raw });
    return null;
  }
}

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

/**
 * Settings keys for the optional `/api/v1/providers/:id/stream` path that
 * routes through the AGI Workforce api-gateway instead of the local desktop
 * bridge. Default-off; enabled by setting `chrome.storage.local.agi_use_provider_stream = true`.
 */
const USE_PROVIDER_STREAM_KEY = 'agi_use_provider_stream';
const GATEWAY_URL_KEY = 'agi_gateway_url';
const PROVIDER_OVERRIDE_KEY = 'agi_provider_override';
const SUPABASE_JWT_SESSION_KEY = 'agi_supabase_jwt';
const DEFAULT_GATEWAY_URL = 'https://api.agiworkforce.com';
const VALID_PROVIDER_IDS: ReadonlySet<ProviderStreamProvider> = new Set([
  'anthropic',
  'openai',
  'google',
  'ollama',
]);

// SECURITY (C-1): Gateway URL allowlist. The agi_gateway_url key in
// chrome.storage.local is writable by any allowlisted page. We therefore
// validate the stored value against a strict allowlist rather than trusting the
// raw storage value. Only https://api.agiworkforce.com and its subdomains are
// accepted. localhost is never accepted for the gateway (bridge URL is separate
// and validated by validateBridgeUrl).
const GATEWAY_URL_ALLOWLIST_EXACT = new Set<string>(['https://api.agiworkforce.com']);
const GATEWAY_URL_SUBDOMAIN_SUFFIX = '.agiworkforce.com';

/**
 * Returns the validated gateway origin or null.
 * Accepts: https://api.agiworkforce.com, https://<sub>.agiworkforce.com
 * Rejects: http:// (JWT would be plaintext), any non-agiworkforce.com host.
 */
function validateGatewayUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') return null;
    const origin = `https://${parsed.host}`;
    if (GATEWAY_URL_ALLOWLIST_EXACT.has(origin)) return origin;
    if (parsed.hostname.endsWith(GATEWAY_URL_SUBDOMAIN_SUFFIX)) return origin;
    return null;
  } catch {
    return null;
  }
}

interface ProviderStreamSettings {
  enabled: boolean;
  gatewayUrl: string;
  providerOverride: 'auto' | ProviderStreamProvider;
}

async function getProviderStreamSettings(): Promise<ProviderStreamSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      [USE_PROVIDER_STREAM_KEY, GATEWAY_URL_KEY, PROVIDER_OVERRIDE_KEY],
      (result) => {
        if (chrome.runtime.lastError) {
          resolve({ enabled: false, gatewayUrl: DEFAULT_GATEWAY_URL, providerOverride: 'auto' });
          return;
        }
        const enabled = result[USE_PROVIDER_STREAM_KEY] === true;
        const gatewayRaw = (result[GATEWAY_URL_KEY] as string | undefined)?.trim() ?? '';
        const overrideRaw = (result[PROVIDER_OVERRIDE_KEY] as string | undefined)?.trim();
        const providerOverride: 'auto' | ProviderStreamProvider =
          overrideRaw && VALID_PROVIDER_IDS.has(overrideRaw as ProviderStreamProvider)
            ? (overrideRaw as ProviderStreamProvider)
            : 'auto';
        // SECURITY (C-1): Allowlist-validate the stored gateway URL. If storage
        // was tampered (e.g. evil.com written by a content script), fall back to
        // the manifest-declared default silently. This prevents JWT exfiltration.
        const gatewayUrl = validateGatewayUrl(gatewayRaw) ?? DEFAULT_GATEWAY_URL;
        resolve({ enabled, gatewayUrl, providerOverride });
      },
    );
  });
}

async function getSupabaseJwtFromStorage(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      chrome.storage.session.get(SUPABASE_JWT_SESSION_KEY, (sessionResult) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        const stored = (sessionResult[SUPABASE_JWT_SESSION_KEY] as string | undefined)?.trim();
        resolve(stored && stored.startsWith('eyJ') ? stored : null);
      });
    } catch {
      resolve(null);
    }
  });
}

// ---------------------------------------------------------------------------
// Tier cache — fetched from /api/me, stored in chrome.storage.local under
// 'agi_user_tier'. Refreshed on demand and on a 30-minute alarm (Phase 3 #41).
//
// Bearer-token auth side-steps the BLOCKED_COOKIE_DOMAINS guard: cookies
// would leak across origins, but a JWT pulled from session storage and sent
// in the Authorization header is fine.
// ---------------------------------------------------------------------------

const TIER_CACHE_KEY = 'agi_user_tier';
const TIER_CACHE_TIMESTAMP_KEY = 'agi_user_tier_fetched_at';
const TIER_REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Allowlist of /api/me hosts the extension may call. Mirrors the gateway
 * allowlist but uses the marketing domain (agiworkforce.com) where /api/me
 * lives in the Next.js app — the api.agiworkforce.com gateway proxies
 * different routes.
 */
const ME_ENDPOINT_ALLOWLIST = new Set<string>([
  'https://agiworkforce.com',
  'https://www.agiworkforce.com',
  'http://localhost:3000',
  'http://localhost:3001',
]);

function deriveMeEndpoint(gatewayUrl: string): string | null {
  // Default to agiworkforce.com unless the gateway is explicitly localhost
  // (developer dev-stack pointing at next-dev directly).
  try {
    const u = new URL(gatewayUrl);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      const candidate = `${u.protocol}//${u.host}`;
      if (ME_ENDPOINT_ALLOWLIST.has(candidate)) {
        return `${candidate}/api/me`;
      }
    }
  } catch {
    /* fall through */
  }
  return 'https://agiworkforce.com/api/me';
}

interface ApiMeResponse {
  plan?: { tier?: string };
  routing_preferences?: { us_only?: boolean };
  feature_flags?: Record<string, unknown>;
}

/**
 * Fetch /api/me with Bearer auth and cache the tier locally. Silent on
 * failure — the popup falls back to whatever was cached previously, or
 * hides the tier badge if no cache exists yet.
 */
async function refreshUserTierFromApi(): Promise<void> {
  try {
    const jwt = await getSupabaseJwtFromStorage();
    if (!jwt) return;

    const settings = await getProviderStreamSettings();
    const meUrl = deriveMeEndpoint(settings.gatewayUrl);
    if (!meUrl) return;

    const response = await fetch(meUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/json',
      },
      credentials: 'omit',
    });

    if (!response.ok) {
      return;
    }

    const body = (await response.json()) as ApiMeResponse;
    const tier = body.plan?.tier;
    if (typeof tier !== 'string' || tier.length === 0) {
      return;
    }

    await chrome.storage.local.set({
      [TIER_CACHE_KEY]: tier,
      [TIER_CACHE_TIMESTAMP_KEY]: Date.now(),
    });
  } catch {
    // Network errors, malformed JSON, storage failures — all silent.
  }
}

// Schedule a periodic refresh while the service worker is alive. The
// alarm survives SW restarts (Chrome restores alarms on startup).
const TIER_REFRESH_ALARM_NAME = 'agi-user-tier-refresh';
chrome.alarms.create(TIER_REFRESH_ALARM_NAME, {
  periodInMinutes: TIER_REFRESH_INTERVAL_MS / 60_000,
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TIER_REFRESH_ALARM_NAME) {
    void refreshUserTierFromApi();
  }
});

// Also refresh on extension activation so a fresh install sees the tier
// without waiting 30 minutes.
void refreshUserTierFromApi();

function inferProviderFromModel(modelId: string | undefined): ProviderStreamProvider {
  if (!modelId) return 'anthropic';
  const m = modelId.toLowerCase();
  if (m.startsWith('claude-')) return 'anthropic';
  if (m.startsWith('gpt-') || m.startsWith('o1-') || m.startsWith('codex-')) return 'openai';
  if (m.startsWith('gemini-')) return 'google';
  if (
    m === 'ollama-local' ||
    m.startsWith('llama') ||
    m.startsWith('qwen') ||
    m.startsWith('mistral')
  ) {
    return 'ollama';
  }
  return 'anthropic';
}

async function getSelectedModel(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get('agi_model', (result) => {
      if (chrome.runtime.lastError) {
        // eslint-disable-next-line no-restricted-syntax -- FIXME: P1-CHROMEEXT-MODELID-MIGRATION: fallback when chrome.storage errors. Replace with getDefaultModelFor('chat') once chrome ext has access to packages/types catalog.
        resolve('claude-sonnet-4.6');
        return;
      }
      const stored = (result['agi_model'] as string | undefined)?.trim();
      // eslint-disable-next-line no-restricted-syntax -- FIXME: P1-CHROMEEXT-MODELID-MIGRATION: same fallback as above.
      resolve(stored && stored !== 'auto' ? stored : 'claude-sonnet-4.6');
    });
  });
}

/**
 * Broadcast a PAYWALL_HIT message to all open extension views (popup, side panel).
 * Views that are not open will silently ignore the rejected sendMessage.
 */
function broadcastPaywallHit(feature: string, requiredTier: string, reason?: string): void {
  const msg: import('./types').PaywallHitMessage = {
    type: 'PAYWALL_HIT',
    feature,
    requiredTier,
    ...(reason ? { reason } : {}),
  };
  chrome.runtime.sendMessage(msg).catch(() => {
    // No listeners open (popup / side panel closed) — silently ignore.
  });
}

/**
 * Stream a chat reply via the api-gateway's `/api/v1/providers/:id/stream`
 * endpoint. Throws if the upstream returns an error chunk so the caller can
 * fall back to the legacy bridge path.
 *
 * When a paywall chunk is received the function broadcasts PAYWALL_HIT to all
 * extension views and returns normally (does NOT throw) — the caller must not
 * fall back to the bridge in that case, as the cap is enforced server-side and
 * retrying against the bridge won't help.
 */
async function streamChatViaProvider(params: {
  gatewayUrl: string;
  providerId: ProviderStreamProvider;
  jwt: string;
  model: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  broadcast: (text: string, done: boolean, error?: string) => void;
}): Promise<{ paywalled: boolean }> {
  const { gatewayUrl, providerId, jwt, model, messages, broadcast } = params;
  const stream = streamFromProvider({
    gatewayUrl,
    providerId,
    authToken: jwt,
    request: { model, messages },
  });
  let sawError: { code?: string; message: string } | null = null;
  for await (const chunk of stream as AsyncIterable<ProviderStreamChunk>) {
    if (chunk.type === 'text-delta') {
      if (chunk.delta) broadcast(chunk.delta, false);
    } else if (chunk.type === 'paywall') {
      // Tier cap hit — surface the paywall UI and stop streaming without
      // triggering the legacy-bridge fallback.
      broadcastPaywallHit(chunk.feature, chunk.requiredTier, chunk.reason);
      broadcast('', true);
      return { paywalled: true };
    } else if (chunk.type === 'error') {
      sawError = { ...(chunk.code ? { code: chunk.code } : {}), message: chunk.message };
    } else if (chunk.type === 'stop') {
      if (sawError) {
        throw new Error(`provider-stream:${sawError.code ?? 'STREAM_ERROR'}:${sawError.message}`);
      }
      broadcast('', true);
      return { paywalled: false };
    }
  }
  if (sawError) {
    throw new Error(`provider-stream:${sawError.code ?? 'STREAM_ERROR'}:${sawError.message}`);
  }
  broadcast('', true);
  return { paywalled: false };
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
  // outbound LLM request to authenticate against that key, or to a key the
  // attacker wants the user to bill. The api key MUST come from the user's
  // own session storage — written exclusively by the trusted side-panel UI
  // — and never from the message wire. The `apiKey` destructure is gone;
  // the resolution path below queries `chrome.storage.session.agi_api_key`.
  const { id, text, pageContext, conversationHistory = [] } = message;

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
  const userContent = pageContext
    ? `${text}\n\n<page_context_${fenceNonce}>\n${pageContext}\n</page_context_${fenceNonce}>`
    : text;

  messages.push({ role: 'user', content: userContent });

  // Optional: route via the AGI Workforce api-gateway provider-stream endpoint.
  // Default-off; user opts in by setting `agi_use_provider_stream = true` in
  // chrome.storage.local along with a Supabase JWT in chrome.storage.session.
  const providerStreamSettings = await getProviderStreamSettings();
  if (providerStreamSettings.enabled) {
    const jwt = await getSupabaseJwtFromStorage();
    if (jwt) {
      try {
        const model = await getSelectedModel();
        const providerId =
          providerStreamSettings.providerOverride === 'auto'
            ? inferProviderFromModel(model)
            : providerStreamSettings.providerOverride;
        const streamResult = await streamChatViaProvider({
          gatewayUrl: providerStreamSettings.gatewayUrl,
          providerId,
          jwt,
          model,
          messages: messages as Array<{
            role: 'user' | 'assistant' | 'system';
            content: string;
          }>,
          broadcast: broadcastChunk,
        });
        // If the API returned a paywall response, do not fall through to the
        // legacy bridge — the cap is enforced server-side and the PAYWALL_HIT
        // broadcast has already been sent to the popup/side-panel.
        if (streamResult.paywalled) return;
        return;
      } catch (err) {
        logger.warn('Provider-stream path failed, falling back to legacy bridge', err);
        // fall through to legacy fetch + native fallback
      }
    } else {
      logger.debug(
        'Provider-stream enabled but no Supabase JWT in session storage — using legacy path',
      );
    }
  }

  // Resolve the bridge URL at call time so it picks up any in-session changes.
  const AGI_API_BASE = await getAgiBridgeBaseUrl();

  // Resolve the API key strictly from chrome.storage.session — written only by
  // the trusted side-panel UI. See chrome-HIGH-3 comment at the top of
  // handleChatMessage for why message-body apiKey is no longer accepted.
  // CRIT-004 still applies: do NOT fall back to chrome.storage.local.
  const resolvedApiKey: string | null = await new Promise((resolve) => {
    try {
      chrome.storage.session.get('agi_api_key', (sessionResult) => {
        if (chrome.runtime.lastError) {
          logger.warn('Failed to read API key from session storage', {
            error: chrome.runtime.lastError.message,
          });
          resolve(null);
          return;
        }
        const sessionStored = (sessionResult['agi_api_key'] as string | undefined)?.trim();
        resolve(sessionStored ?? null);
      });
    } catch {
      resolve(null);
    }
  });

  try {
    // Attempt to stream via the AGI Workforce API.
    // The desktop app may expose an HTTP endpoint; fall back to native if unavailable.
    let streamed = false;

    // SECURITY (C-2): Never forward the provider API key to the local desktop
    // bridge (http://localhost:8787). The desktop app authenticates bridge calls
    // with its own pairing token, not with provider keys. Provider API keys must
    // only be sent to the provider's own endpoint (api.openai.com, etc.).
    // Bridge calls use X-Bridge-Token instead; if no bridge token is configured
    // the request still goes through without a key (desktop supplies its own).
    const bridgeBaseUrl = AGI_API_BASE ?? '';
    const isBridgeRequest =
      bridgeBaseUrl.includes('localhost') || bridgeBaseUrl.includes('127.0.0.1');

    const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (!isBridgeRequest && resolvedApiKey) {
      // Only attach provider API key when sending to a remote (non-bridge) endpoint.
      fetchHeaders['Authorization'] = `Bearer ${resolvedApiKey}`;
    }
    // Bridge-token attachment: read pairing token from session storage.
    // This is set during the one-time popup pairing flow.
    if (isBridgeRequest) {
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
    }

    try {
      const resp = await fetch(`${AGI_API_BASE}/v1/chat/stream`, {
        method: 'POST',
        headers: fetchHeaders,
        body: JSON.stringify({ messages, stream: true }),
        signal: AbortSignal.timeout(60000),
      });

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
      // Network error or local API unavailable — fall through to native.
      // Log for diagnostics but don't surface to user.
      logger.debug('Chat SSE fetch failed, falling back to native', fetchErr);
    }

    if (!streamed) {
      // Fall back: forward to native desktop app via existing QUEUE_MESSAGE path
      if (state.isNativeConnected && state.nativePort) {
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
          broadcastChunk('', true);
          return;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Native request failed';
          broadcastChunk('', true, errMsg);
          return;
        }
      }

      // Nothing available — send a helpful offline message
      const offlineMsg =
        'The AGI Workforce desktop app is not running. Please start it and try again.';
      broadcastChunk(offlineMsg, true);
    }
  } catch (error) {
    logger.error('handleChatMessage error', error);
    const errText = error instanceof Error ? error.message : 'Unknown error';
    broadcastChunk('', true, errText);
    showNotification('Chat Error', errText);
  }
}

/**
 * Handle an in-page prompt from the content-script overlay panel.
 *
 * Returns the full accumulated response text so the panel can render it
 * without needing a chunked messaging protocol.
 *
 * Fallback chain (same as handleChatMessage):
 *  1. Provider-stream via api-gateway (if enabled + JWT present)
 *  2. HTTP fetch to AGI bridge (localhost:8787)
 *  3. Native messaging to desktop app
 *  4. Offline message
 */
async function handleInPagePrompt(prompt: string): Promise<string> {
  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
    { role: 'user', content: prompt },
  ];

  // Path 1 — provider-stream via api-gateway
  const providerStreamSettings = await getProviderStreamSettings();
  if (providerStreamSettings.enabled) {
    const jwt = await getSupabaseJwtFromStorage();
    if (jwt) {
      try {
        const model = await getSelectedModel();
        const providerId =
          providerStreamSettings.providerOverride === 'auto'
            ? inferProviderFromModel(model)
            : providerStreamSettings.providerOverride;
        let accumulated = '';
        const streamResult = await streamChatViaProvider({
          gatewayUrl: providerStreamSettings.gatewayUrl,
          providerId,
          jwt,
          model,
          messages,
          broadcast: (chunk: string, _done: boolean) => {
            accumulated += chunk;
          },
        });
        if (streamResult.paywalled) {
          throw new Error('Feature requires upgrade');
        }
        if (accumulated) return accumulated;
      } catch (err) {
        logger.warn('In-page prompt: provider-stream failed, falling back', err);
      }
    }
  }

  // Path 2 — HTTP bridge
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

  // Path 3 — native messaging
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

  // Path 4 — offline
  return 'The AGI Workforce desktop app is not running or no provider is configured. Please start the desktop app or configure a provider in the extension popup.';
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

  // Handle scheduled task alarms (Gap 6)
  if (alarm.name.startsWith(TASK_ALARM_PREFIX)) {
    const taskId = alarm.name.slice(TASK_ALARM_PREFIX.length);
    void loadScheduledTasks()
      .then((tasks) => {
        const task = tasks.find((t) => t.id === taskId);
        if (task?.enabled) {
          void executeScheduledTask(task);
        }
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
