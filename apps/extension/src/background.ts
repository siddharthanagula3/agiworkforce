/**
 * Background service worker for AGI Workforce extension
 * Handles communication between popup, content scripts, and desktop app
 */

import type {
  ExtensionMessage,
  ExtensionResponse,
  ConnectionStatus,
  RateLimitState as _RateLimitState,
  RunPageAction,
} from './types';
import {
  logger,
  RateLimiter,
  retry as _retry,
  withTimeout,
  storageUtils,
  sleep as _sleep,
} from './utils';

// Service worker state
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
    timeout: NodeJS.Timeout;
  }
>();
const lastPageContextSyncByTab = new Map<number, { fingerprint: string; at: number }>();

const NATIVE_HOST_NAME = 'com.agiworkforce.browser';
const NATIVE_REQUEST_TIMEOUT_MS = 10000;
const MAX_CONTEXT_HTML_CHARS = 100_000;
const NATIVE_CONNECT_MAX_WAIT_MS = 2000;
const NATIVE_RECONNECT_BASE_DELAY_MS = 1000;
const NATIVE_RECONNECT_MAX_DELAY_MS = 30000;
const NATIVE_RECONNECT_MAX_ATTEMPTS = 8;
const NATIVE_CONNECT_POLL_INTERVAL_MS = 100;
let nativeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let nativeReconnectAttempt = 0;
let nativeHandshakeInFlight = false;

function clearNativeReconnectTimer(): void {
  if (nativeReconnectTimer) {
    clearTimeout(nativeReconnectTimer);
    nativeReconnectTimer = null;
  }
}

function scheduleNativeReconnect(trigger: string): void {
  if (nativeReconnectTimer) {
    return;
  }

  nativeReconnectAttempt = Math.min(nativeReconnectAttempt + 1, NATIVE_RECONNECT_MAX_ATTEMPTS);
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
    await _sleep(NATIVE_CONNECT_POLL_INTERVAL_MS);
  }
  return false;
}

/**
 * Initialize the background service worker
 */
function initialize(): void {
  logger.info('Background service worker initializing');

  // Set up message listeners
  chrome.runtime.onMessage.addListener(handleMessage);

  // Set up context menu
  setupContextMenu();

  // Connect to native host
  connectToNativeHost();

  // Check initial connection status via native messaging heartbeat
  checkDesktopConnection();

  // Periodic connection check
  setInterval(() => {
    checkDesktopConnection();
    if (!state.isNativeConnected) {
      connectToNativeHost();
    }
  }, 30000);

  logger.info('Background service worker initialized');
}

/**
 * Connect to the native messaging host
 */
function connectToNativeHost(): void {
  if (state.nativePort || nativeHandshakeInFlight) {
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
    state.isNativeConnected = true;
    state.lastNativeError = null;
    nativeHandshakeInFlight = true;

    void (async () => {
      try {
        const connectResult = await sendNativeRequest({
          type: 'connect',
          extension_id: chrome.runtime.id,
        });
        if (!(connectResult as any)?.success) {
          throw new Error((connectResult as any)?.error ?? 'Native connect handshake failed');
        }

        const pingResult = await sendNativeRequest({ type: 'ping' });
        if (!(pingResult as any)?.success) {
          throw new Error((pingResult as any)?.error ?? 'Native ping failed');
        }

        nativeReconnectAttempt = 0;
        clearNativeReconnectTimer();
        state.connectionStatus = 'connected';
        notifyConnectionStatusChange();
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
        notifyConnectionStatusChange();
        scheduleNativeReconnect('handshake_failed');
      } finally {
        nativeHandshakeInFlight = false;
      }
    })();

    logger.info('Connected to native host');
  } catch (error) {
    logger.error('Failed to connect to native host', error);
    nativeHandshakeInFlight = false;
    state.isNativeConnected = false;
    state.nativePort = null;
    state.connectionStatus = 'disconnected';
    state.lastNativeError = error instanceof Error ? error.message : 'Unknown error';
    notifyConnectionStatusChange();
    scheduleNativeReconnect('connect_failed');
  }
}

function createRequestId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sendNativeRequest(message: Record<string, unknown>): Promise<ExtensionResponse> {
  return new Promise((resolve, reject) => {
    void (async () => {
      if (!state.nativePort || !state.isNativeConnected) {
        connectToNativeHost();
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

/**
 * Handle messages from the native host
 */
function handleNativeMessage(message: any): void {
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
        resolve(message as ExtensionResponse);
      }
    }
  }
}

/**
 * Handle native host disconnection
 */
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

  notifyConnectionStatusChange();
  scheduleNativeReconnect('native_disconnect');
}

/**
 * Handle incoming messages from popup or content scripts
 */
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

  // Handle async response
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

  // Return true to indicate we'll send response asynchronously
  return true;
}

/**
 * Async message handler
 */
async function handleMessageAsync(
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<ExtensionResponse> {
  logger.debug('Processing message', { type: message.type, sender: sender.url });

  const tabId = sender.tab?.id ?? message.tabId;
  const windowId = sender.tab?.windowId;

  // Check rate limits
  if (state.rateLimiter.isLimited(tabId || 0, message.type)) {
    return {
      success: false,
      error: 'Rate limit exceeded',
    } as ExtensionResponse;
  }

  switch (message.type) {
    case 'GET_CONNECTION_STATUS':
      if (!state.isNativeConnected && !nativeHandshakeInFlight) {
        connectToNativeHost();
      }
      if (state.isNativeConnected) {
        void sendNativeRequest({ type: 'ping' }).catch((error) => {
          logger.warn('Native ping failed during status check', error);
          state.isNativeConnected = false;
          state.connectionStatus = 'disconnected';
          state.nativePort = null;
          state.lastNativeError = error instanceof Error ? error.message : 'Native ping failed';
          notifyConnectionStatusChange();
          scheduleNativeReconnect('status_ping_failed');
        });
      }
      return {
        success: true,
        nativeConnected: state.isNativeConnected,
        connectionStatus: state.connectionStatus,
      } as ExtensionResponse;

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

      const messageContext = (message as any).context as Record<string, unknown> | undefined;
      return syncTabContextWithDesktop(resolvedTabId, 'content_sync', messageContext);
    }

    case 'queue_message': {
      let resolvedTabId = tabId;
      if (!resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }
      if (!resolvedTabId) {
        logger.warn('queue_message: no active tab');
        return { success: false, error: 'No active tab' } as ExtensionResponse;
      }
      const msgEntry = message as import('./types').QueueMessageMessage;
      try {
        await sendNativeRequest({
          type: 'queue_message',
          id: msgEntry.id,
          text: msgEntry.text,
          tabId: resolvedTabId,
          timestamp: msgEntry.timestamp,
        });
        return { success: true } as ExtensionResponse;
      } catch (err: unknown) {
        logger.warn('queue_message native send failed', err);
        return { success: false, error: 'Native send failed' } as ExtensionResponse;
      }
    }

    case 'open_side_panel': {
      let resolvedTabId = tabId;
      if (chrome.sidePanel && !resolvedTabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        resolvedTabId = activeTab?.id;
      }
      if (chrome.sidePanel && resolvedTabId) {
        chrome.sidePanel.open({ tabId: resolvedTabId }).catch(() => {});
      } else if (!resolvedTabId) {
        logger.warn('open_side_panel: no active tab');
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
        const options = {
          format: (message as any).format ?? 'png',
          quality: (message as any).quality ?? 90,
        } as chrome.tabs.CaptureVisibleTabOptions;
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

/**
 * Forward message to content script
 */
async function forwardToContentScript(
  tabId: number,
  message: ExtensionMessage,
): Promise<ExtensionResponse> {
  try {
    const response = await withTimeout(chrome.tabs.sendMessage(tabId, message), 30000);
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
 * Check desktop app connection status
 */
async function checkDesktopConnection(): Promise<void> {
  if (!state.nativePort || !state.isNativeConnected) {
    connectToNativeHost();
  }

  if (state.nativePort && state.isNativeConnected) {
    try {
      const ping = await sendNativeRequest({ type: 'ping' });
      if (!(ping as any)?.success) {
        throw new Error((ping as any)?.error ?? 'Native ping failed');
      }
      if (state.connectionStatus !== 'connected') {
        state.connectionStatus = 'connected';
        notifyConnectionStatusChange();
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
    notifyConnectionStatusChange();
  }
  await storageUtils.setItem('connectedToDesktop', false);
  scheduleNativeReconnect('ping_failed');
}

/**
 * Notify all tabs of connection status change
 */
async function notifyConnectionStatusChange(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});

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
            // Ignore errors - tab might not have content script
            const _lastError = chrome.runtime.lastError;
            void _lastError;
          },
        );
      }
    }
  } catch (error) {
    logger.warn('Failed to notify tabs of connection change', error);
  }
}

/**
 * Set up context menu
 */
function setupContextMenu(): void {
  if (!chrome.contextMenus?.removeAll || !chrome.contextMenus?.create) {
    logger.warn('contextMenus API unavailable; skipping context menu setup');
    return;
  }

  chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: 'capture-element',
    title: 'Capture Element',
    contexts: ['all'],
  });

  chrome.contextMenus.create({
    id: 'get-element-info',
    title: 'Get Element Info',
    contexts: ['all'],
  });

  // Show only when text is selected
  chrome.contextMenus.create({
    id: 'ask-agi-workforce',
    title: 'Ask AGI Workforce',
    contexts: ['selection'],
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;

    if (info.menuItemId === 'capture-element') {
      chrome.tabs.sendMessage(tab.id, {
        type: 'CAPTURE_ELEMENT',
      });
    } else if (info.menuItemId === 'get-element-info') {
      chrome.tabs.sendMessage(tab.id, {
        type: 'GET_ELEMENT_INFO',
      });
    } else if (info.menuItemId === 'ask-agi-workforce' && info.selectionText && tab.id) {
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

/**
 * Handle tab removal - clean up rate limits
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  state.rateLimiter.reset(tabId);
  lastPageContextSyncByTab.delete(tabId);
  logger.debug('Cleaned up rate limit for tab', { tabId });
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

/**
 * Handle chrome commands (keyboard shortcuts)
 */
chrome.commands.onCommand.addListener((command) => {
  logger.debug('Command received', { command });

  switch (command) {
    case 'capture_page':
      captureCurrentPage();
      break;
  }
});

/**
 * Capture current active page
 */
async function captureCurrentPage(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      logger.warn('No active tab found');
      return;
    }

    await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
      quality: 90,
    });

    logger.info('Page captured', { tabId: tab.id });

    // Increment action count
    const stats = await storageUtils.getItem<{ actionCount: number }>('stats', {
      actionCount: 0,
    });

    // Safety check for stats
    const actionCount = stats?.actionCount ?? 0;

    await storageUtils.setItem('stats', {
      actionCount: actionCount + 1,
    });
  } catch (error) {
    logger.error('Failed to capture page', error);
  }
}

/**
 * Validate message structure
 */
function isValidMessage(message: unknown): message is ExtensionMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }

  const msg = message as Record<string, unknown>;
  return typeof msg['type'] === 'string';
}

/**
 * Create request ID for tracking
 */
function _createRequestId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get pending request or create new one
 */
function _getPendingRequest(id: string) {
  return pendingRequests.get(id);
}

/**
 * Clean up pending request
 */
function _removePendingRequest(id: string): void {
  const request = pendingRequests.get(id);
  if (request) {
    clearTimeout(request.timeout);
    pendingRequests.delete(id);
  }
}

// Initialize on service worker start
initialize();

// Handle service worker keep-alive
chrome.alarms.create('keep-alive', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keep-alive') {
    logger.debug('Keeping service worker alive');
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
