import type {
  ExtensionMessage,
  ExtensionResponse,
  ConnectionStatus,
  RunPageAction,
  SavedShortcut,
  ScheduledTask,
} from './types';
import { logger, RateLimiter, withTimeout, storageUtils, sleep } from './utils';
import { getPlatformPrompt } from './platform-prompts';

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
const SHORTCUTS_STORAGE_KEY = 'agi_saved_shortcuts';
const TASKS_STORAGE_KEY = 'agi_scheduled_tasks';
const MAX_SHORTCUTS = 50;
const MAX_TASKS = 50;
const TASK_ALARM_PREFIX = 'agi_task_';
const TAB_GROUP_NAME = 'AGI Workforce';

let nativeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let nativeReconnectAttempt = 0;
let nativeHandshakeInFlight = false;
// Set to true when max reconnect attempts exhausted or host is permanently unavailable.
// Prevents infinite permission popup loops on macOS.
let nativeReconnectGaveUp = false;

function clearNativeReconnectTimer(): void {
  if (nativeReconnectTimer) {
    clearTimeout(nativeReconnectTimer);
    nativeReconnectTimer = null;
  }
}

function resetNativeReconnectState(): void {
  nativeReconnectAttempt = 0;
  nativeReconnectGaveUp = false;
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
  if (nativeReconnectTimer) {
    return;
  }

  nativeReconnectAttempt = Math.min(nativeReconnectAttempt + 1, NATIVE_RECONNECT_MAX_ATTEMPTS);

  // Stop retrying once max attempts are exhausted. Without this guard the
  // reconnect loop runs indefinitely, launching the native host binary on
  // every attempt and triggering repeated macOS permission prompts.
  if (nativeReconnectAttempt >= NATIVE_RECONNECT_MAX_ATTEMPTS) {
    logger.warn('Max native reconnect attempts reached; giving up until user action', { trigger });
    nativeReconnectGaveUp = true;
    state.connectionStatus = 'disconnected';
    void notifyConnectionStatusChange();
    return;
  }

  const delay = Math.min(
    NATIVE_RECONNECT_BASE_DELAY_MS * 2 ** Math.max(nativeReconnectAttempt - 1, 0),
    NATIVE_RECONNECT_MAX_DELAY_MS,
  );

  logger.info('Scheduling native reconnect', {
    trigger,
    attempt: nativeReconnectAttempt,
    delayMs: delay,
  });

  if (state.connectionStatus !== 'connecting') {
    state.connectionStatus = 'connecting';
    void notifyConnectionStatusChange();
  }

  nativeReconnectTimer = setTimeout(() => {
    nativeReconnectTimer = null;
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
  if (state.nativePort || nativeHandshakeInFlight || nativeReconnectGaveUp) {
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
    nativeHandshakeInFlight = true;

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
        nativeReconnectAttempt = 0;
        nativeReconnectGaveUp = false; // Reset so future disconnects can retry
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
            } catch {
              // Best-effort drain — don't block reconnection
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
        nativeHandshakeInFlight = false;
      }
    })();
  } catch (error) {
    logger.error('Failed to connect to native host', error);
    nativeHandshakeInFlight = false;
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
      const portReadyForHandshake = !!state.nativePort && nativeHandshakeInFlight;
      if (!portReadyForHandshake && (!state.nativePort || !state.isNativeConnected)) {
        if (!nativeReconnectGaveUp) {
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
    nativeReconnectGaveUp = true;
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
  } catch {
    // tabGroups API may not be available in all contexts
  }
}

async function loadShortcuts(): Promise<SavedShortcut[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(SHORTCUTS_STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }
      resolve((result[SHORTCUTS_STORAGE_KEY] as SavedShortcut[] | undefined) ?? []);
    });
  });
}

async function saveShortcuts(shortcuts: SavedShortcut[]): Promise<void> {
  await chrome.storage.local.set({ [SHORTCUTS_STORAGE_KEY]: shortcuts });
}

async function handleSaveShortcut(
  message: import('./types').SaveShortcutMessage,
): Promise<ExtensionResponse> {
  const shortcuts = await loadShortcuts();
  if (shortcuts.length >= MAX_SHORTCUTS) {
    return {
      success: false,
      error: `Maximum ${MAX_SHORTCUTS} shortcuts reached`,
    } as ExtensionResponse;
  }
  const shortcut: SavedShortcut = {
    id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: message.name.slice(0, 100),
    actions: message.actions,
    createdAt: Date.now(),
    url: message.url,
  };
  shortcuts.push(shortcut);
  await saveShortcuts(shortcuts);
  return { success: true, shortcuts } as ExtensionResponse;
}

async function handleListShortcuts(): Promise<ExtensionResponse> {
  const shortcuts = await loadShortcuts();
  return { success: true, shortcuts } as ExtensionResponse;
}

async function handleDeleteShortcut(
  message: import('./types').DeleteShortcutMessage,
): Promise<ExtensionResponse> {
  let shortcuts = await loadShortcuts();
  shortcuts = shortcuts.filter((s) => s.id !== message.shortcutId);
  await saveShortcuts(shortcuts);
  return { success: true, shortcuts } as ExtensionResponse;
}

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

async function loadScheduledTasks(): Promise<ScheduledTask[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(TASKS_STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }
      resolve((result[TASKS_STORAGE_KEY] as ScheduledTask[] | undefined) ?? []);
    });
  });
}

async function saveScheduledTasks(tasks: ScheduledTask[]): Promise<void> {
  await chrome.storage.local.set({ [TASKS_STORAGE_KEY]: tasks });
}

function getAlarmPeriod(task: ScheduledTask): number {
  switch (task.scheduleType) {
    case 'hourly':
      return 60;
    case 'daily':
      return 60 * 24;
    case 'weekly':
      return 60 * 24 * 7;
    case 'monthly':
      return 60 * 24 * 30; // Approximate — real months vary 28-31 days
    default: {
      // Exhaustive guard: if a new scheduleType is added to the ScheduledTask
      // type, TypeScript will flag this assignment as unreachable.
      const _exhaustive: never = task.scheduleType;
      logger.warn('Unknown schedule type, defaulting to daily', { scheduleType: _exhaustive });
      return 60 * 24;
    }
  }
}

async function registerTaskAlarm(task: ScheduledTask): Promise<void> {
  if (!task.enabled) return;
  const alarmName = `${TASK_ALARM_PREFIX}${task.id}`;
  await chrome.alarms.create(alarmName, {
    periodInMinutes: getAlarmPeriod(task),
    delayInMinutes: getAlarmPeriod(task),
  });
}

async function unregisterTaskAlarm(taskId: string): Promise<void> {
  await chrome.alarms.clear(`${TASK_ALARM_PREFIX}${taskId}`);
}

async function executeScheduledTask(task: ScheduledTask): Promise<void> {
  logger.info('Executing scheduled task', { id: task.id, name: task.name });

  if (task.shortcutId) {
    await handleReplayShortcut({
      type: 'REPLAY_SHORTCUT',
      shortcutId: task.shortcutId,
    } as import('./types').ReplayShortcutMessage);
  } else if (task.prompt) {
    // Send as chat message via the same path as side panel
    const chatMsg: import('./types').ChatMessageMessage = {
      type: 'CHAT_MESSAGE',
      id: `task_${task.id}_${Date.now()}`,
      text: task.prompt,
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

async function handleCreateScheduledTask(
  message: import('./types').CreateScheduledTaskMessage,
): Promise<ExtensionResponse> {
  const tasks = await loadScheduledTasks();
  if (tasks.length >= MAX_TASKS) {
    return { success: false, error: `Maximum ${MAX_TASKS} tasks reached` } as ExtensionResponse;
  }
  const task: ScheduledTask = {
    ...message.task,
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  tasks.push(task);
  await saveScheduledTasks(tasks);
  await registerTaskAlarm(task);
  return { success: true, tasks } as ExtensionResponse;
}

async function handleListScheduledTasks(): Promise<ExtensionResponse> {
  const tasks = await loadScheduledTasks();
  return { success: true, tasks } as ExtensionResponse;
}

async function handleUpdateScheduledTask(
  message: import('./types').UpdateScheduledTaskMessage,
): Promise<ExtensionResponse> {
  const tasks = await loadScheduledTasks();
  const idx = tasks.findIndex((t) => t.id === message.taskId);
  if (idx === -1) {
    return { success: false, error: 'Task not found' } as ExtensionResponse;
  }
  const updated = { ...tasks[idx]!, ...message.updates };
  tasks[idx] = updated;
  await saveScheduledTasks(tasks);
  await unregisterTaskAlarm(message.taskId);
  await registerTaskAlarm(updated);
  return { success: true, tasks } as ExtensionResponse;
}

async function handleDeleteScheduledTask(
  message: import('./types').DeleteScheduledTaskMessage,
): Promise<ExtensionResponse> {
  let tasks = await loadScheduledTasks();
  tasks = tasks.filter((t) => t.id !== message.taskId);
  await saveScheduledTasks(tasks);
  await unregisterTaskAlarm(message.taskId);
  return { success: true, tasks } as ExtensionResponse;
}

/** Re-register all task alarms on service worker startup (MV3 restarts kill alarms). */
async function restoreScheduledTaskAlarms(): Promise<void> {
  const tasks = await loadScheduledTasks();
  for (const task of tasks) {
    if (task.enabled) {
      await registerTaskAlarm(task);
    }
  }
  if (tasks.length > 0) {
    logger.info(`Restored ${tasks.length} scheduled task alarm(s)`);
  }
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
      if (!state.isNativeConnected && !nativeHandshakeInFlight && !nativeReconnectGaveUp) {
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
          } catch {
            // Native port may be disconnected
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
    if (!nativeReconnectGaveUp && !nativeHandshakeInFlight) {
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
        .catch(() => {});
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
        .catch(() => {});
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
        .catch(() => {});
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
        .catch(() => {});
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

/** Default AGI bridge base URL — overridden by chrome.storage.local `agi_bridge_url`. */
const DEFAULT_AGI_BRIDGE_URL = 'http://localhost:8765';

/** Allowed bridge URL hostnames — only local connections to the desktop app are permitted. */
const ALLOWED_BRIDGE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

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

async function handleChatMessage(
  message: import('./types').ChatMessageMessage,
  _sender: chrome.runtime.MessageSender,
): Promise<void> {
  const { id, text, pageContext, conversationHistory = [], apiKey } = message;

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

  // Append page context to the user message if provided
  const userContent = pageContext
    ? `${text}\n\n<page_context>\n${pageContext}\n</page_context>`
    : text;

  messages.push({ role: 'user', content: userContent });

  // Resolve the bridge URL at call time so it picks up any in-session changes.
  const AGI_API_BASE = await getAgiBridgeBaseUrl();

  // Resolve the API key: prefer the value forwarded from the side panel,
  // then check chrome.storage.session (where side_panel.ts persists keys).
  // CRIT-004: Do NOT read from chrome.storage.local as an ongoing fallback.
  const resolvedApiKey: string | null = await new Promise((resolve) => {
    if (apiKey) {
      resolve(apiKey);
      return;
    }
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

    // Build request headers — include Authorization if we have a key
    const fetchHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (resolvedApiKey) {
      fetchHeaders['Authorization'] = `Bearer ${resolvedApiKey}`;
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
chrome.alarms.create('keep-alive', { periodInMinutes: 0.5 }, () => {
  if (chrome.runtime.lastError) {
    logger.warn('Failed to create keep-alive alarm', chrome.runtime.lastError.message);
  }
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keep-alive') {
    logger.debug('Keeping service worker alive');
    // Periodic connection check (replaces setInterval which is lost on MV3 suspension)
    if (!nativeReconnectGaveUp && !state.isNativeConnected) {
      void connectToNativeHost();
    }
    return;
  }

  // Handle scheduled task alarms (Gap 6)
  if (alarm.name.startsWith(TASK_ALARM_PREFIX)) {
    const taskId = alarm.name.slice(TASK_ALARM_PREFIX.length);
    void loadScheduledTasks().then((tasks) => {
      const task = tasks.find((t) => t.id === taskId);
      if (task?.enabled) {
        void executeScheduledTask(task);
      }
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

// Export for testing
export { state, handleMessage, checkDesktopConnection };
