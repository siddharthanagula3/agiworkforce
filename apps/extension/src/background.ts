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

const NATIVE_HOST_NAME = 'com.agiworkforce.browser';
const NATIVE_REQUEST_TIMEOUT_MS = 10000;
const CONTENT_SCRIPT_FORWARD_TIMEOUT_MS = 30000;
const MAX_CONTEXT_HTML_CHARS = 100_000;
const NATIVE_CONNECT_MAX_WAIT_MS = 2000;
const NATIVE_RECONNECT_BASE_DELAY_MS = 1000;
const NATIVE_RECONNECT_MAX_DELAY_MS = 30000;
const NATIVE_RECONNECT_MAX_ATTEMPTS = 8;
const NATIVE_CONNECT_POLL_INTERVAL_MS = 100;
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

function scheduleNativeReconnect(trigger: string): void {
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

  // Periodic connection check is handled by the 'keep-alive' alarm (see below)

  logger.info('Background service worker initialized');
}

/**
 * Connect to the native messaging host
 */
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

    logger.info('Connected to native host');
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

/**
 * Handle messages from the native host
 */
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

    case 'CHAT_MESSAGE': {
      const chatMsg = message as import('./types').ChatMessageMessage;
      void handleChatMessage(chatMsg, sender);
      return { success: true } as ExtensionResponse;
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
        const screenshotMsg = message as ExtensionMessage & {
          format?: 'png' | 'jpeg';
          quality?: number;
        };
        const options: chrome.tabs.CaptureVisibleTabOptions = {
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

    // ── Cookie handlers ────────────────────────────────────────────────────
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

    // ── Tab management handlers ────────────────────────────────────────────
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

    // ── Accessibility ──────────────────────────────────────────────────────
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

    // ── Recording handlers (delegated to content script) ──────────────────
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

    // ── Element interaction handlers (forwarded to content script) ─────────
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

    case 'BRIDGE_URL_CHANGED': {
      // The side panel has updated agi_bridge_url in chrome.storage.local.
      // The new URL will be picked up automatically on the next handleChatMessage()
      // call because getAgiBridgeBaseUrl() reads from storage at invocation time.
      // Log for debugging and acknowledge.
      logger.info('Bridge URL updated', { url: message.url ?? '(default)' });
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

// ─── Cookie domain security ───────────────────────────────────────────────────

/** Domains where cookie operations are blocked (sensitive sites). */
const BLOCKED_COOKIE_DOMAINS: RegExp[] = [
  /bank/i,
  /paypal/i,
  /venmo/i,
  /chase/i,
  /wellsfargo/i,
  /citibank/i,
  /\.gov$/i,
  /healthcare/i,
  /medical/i,
  /health\.com/i,
];

function isCookieDomainAllowed(urlOrDomain: string): boolean {
  if (!urlOrDomain) return false;
  const domain = urlOrDomain.replace(/^https?:\/\//, '').split('/')[0] ?? '';
  return !BLOCKED_COOKIE_DOMAINS.some((pattern) => pattern.test(domain));
}

// ─── Cookie handlers ──────────────────────────────────────────────────────────

async function handleGetCookies(
  message: import('./types').GetCookiesMessage,
): Promise<ExtensionResponse> {
  try {
    const { url } = message;
    if (!url) {
      return {
        success: false,
        error: 'Must specify a URL. Getting all cookies is disabled for security.',
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
    const { url } = message;
    if (!url) {
      return {
        success: false,
        error: 'Must specify a URL. Clearing all cookies is disabled for security.',
      } as ExtensionResponse;
    }
    if (!isCookieDomainAllowed(url)) {
      return {
        success: false,
        error: 'Cookie access for this domain is blocked for security.',
      } as ExtensionResponse;
    }
    const cookies = await chrome.cookies.getAll({ url });
    for (const cookie of cookies) {
      await chrome.cookies.remove({
        url: `${cookie.secure ? 'https' : 'http'}://${cookie.domain}${cookie.path}`,
        name: cookie.name,
      });
    }
    return { success: true, cleared: cookies.length } as ExtensionResponse;
  } catch (error) {
    logger.error('Failed to clear cookies', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear cookies',
    } as ExtensionResponse;
  }
}

// ─── Tab management handlers ──────────────────────────────────────────────────

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

// ─── Accessibility tree handler ───────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────

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
 * Check desktop app connection status
 */
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

    logger.info('Page captured and forwarded', { tabId: tab.id });

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
 * Handle a CHAT_MESSAGE from the side panel.
 * Calls the AGI Workforce API with streaming and forwards CHAT_CHUNK messages
 * back to all extension views (the side panel listens via chrome.runtime.onMessage).
 */
/** Default AGI bridge base URL — overridden by chrome.storage.local `agi_bridge_url`. */
const DEFAULT_AGI_BRIDGE_URL = 'http://localhost:8765';

/**
 * Resolve the configured bridge URL from storage, falling back to the default.
 * Returns a base HTTP(S) URL derived from the stored ws:// or http:// value.
 */
async function getAgiBridgeBaseUrl(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get('agi_bridge_url', (result) => {
      const raw = (result['agi_bridge_url'] as string | undefined)?.trim();
      if (!raw) {
        resolve(DEFAULT_AGI_BRIDGE_URL);
        return;
      }
      // Accept ws://, wss://, http://, https:// — normalise to http(s)://
      const normalized = raw.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
      // Strip trailing slash
      resolve(normalized.replace(/\/$/, ''));
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
  const messages: Array<{ role: string; content: string }> = [
    ...conversationHistory.map((h) => ({ role: h.role, content: h.content })),
  ];

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

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const raw = decoder.decode(value, { stream: true });
          // Handle SSE format: lines starting with "data: "
          for (const line of raw.split('\n')) {
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
        broadcastChunk('', true);
        return;
      }
    } catch {
      // Network error or local API unavailable — fall through
    }

    if (!streamed) {
      // Fall back: forward to native desktop app via existing queue_message path
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

// Initialize on service worker start
initialize();

// Handle service worker keep-alive and periodic connection checks
chrome.alarms.create('keep-alive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keep-alive') {
    logger.debug('Keeping service worker alive');
    // Periodic connection check (replaces setInterval which is lost on MV3 suspension)
    if (!nativeReconnectGaveUp && !state.isNativeConnected) {
      void connectToNativeHost();
    }
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
