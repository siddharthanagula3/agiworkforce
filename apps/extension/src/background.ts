/**
 * Background service worker for AGI Workforce extension
 * Handles communication between popup, content scripts, and desktop app
 */

import type {
  ExtensionMessage,
  ExtensionResponse,
  ConnectionStatus,
  RateLimitState as _RateLimitState,
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
  connectionStatus: ConnectionStatus;
  lastNativeError: string | null;
  rateLimiter: RateLimiter;
  messageQueue: ExtensionMessage[];
  isProcessingQueue: boolean;
}

const state: BackgroundState = {
  isNativeConnected: false,
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

/**
 * Initialize the background service worker
 */
function initialize(): void {
  logger.info('Background service worker initializing');

  // Set up message listeners
  chrome.runtime.onMessage.addListener(handleMessage);

  // Set up context menu
  setupContextMenu();

  // Check initial connection status
  checkDesktopConnection();

  // Periodic connection check
  setInterval(checkDesktopConnection, 30000);

  logger.info('Background service worker initialized');
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

  // Check rate limits
  if (state.rateLimiter.isLimited(tabId || 0, message.type)) {
    return {
      success: false,
      error: 'Rate limit exceeded',
    } as ExtensionResponse;
  }

  switch (message.type) {
    case 'GET_CONNECTION_STATUS':
      return {
        success: true,
        nativeConnected: state.isNativeConnected,
        connectionStatus: state.connectionStatus,
      } as ExtensionResponse;

    case 'CAPTURE_SCREENSHOT': {
      if (!tabId) {
        return { success: false, error: 'No tab ID' } as ExtensionResponse;
      }

      try {
        const canvas = await chrome.tabs.captureVisibleTab(tabId, {
          format: (message as any).format ?? 'png',
          quality: (message as any).quality ?? 90,
        });

        return {
          success: true,
          data: canvas,
          timestamp: Date.now(),
        } as ExtensionResponse;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Screenshot failed',
        } as ExtensionResponse;
      }
    }

    default:
      // Forward other messages to content script
      if (!tabId) {
        return { success: false, error: 'No tab ID' } as ExtensionResponse;
      }

      return forwardToContentScript(tabId, message);
  }
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
  try {
    const response = await fetch('http://localhost:3001/health', {
      method: 'GET',
      timeout: 5000,
    });

    const isConnected = response.ok;

    if (isConnected !== state.isNativeConnected) {
      state.isNativeConnected = isConnected;
      state.connectionStatus = isConnected ? 'connected' : 'disconnected';
      state.lastNativeError = null;

      // Notify all tabs of connection status change
      notifyConnectionStatusChange();

      logger.info('Desktop connection status changed', {
        connected: isConnected,
      });

      // Store connection status
      await storageUtils.setItem('connectedToDesktop', isConnected);
    }
  } catch (error) {
    if (state.isNativeConnected) {
      state.isNativeConnected = false;
      state.connectionStatus = 'disconnected';
      state.lastNativeError = error instanceof Error ? error.message : 'Unknown error';

      notifyConnectionStatusChange();
      logger.warn('Lost connection to desktop app', error);
    }

    await storageUtils.setItem('connectedToDesktop', false);
  }
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
            chrome.runtime.lastError; // Acknowledge error
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
    }
  });
}

/**
 * Handle tab removal - clean up rate limits
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  state.rateLimiter.reset(tabId);
  logger.debug('Cleaned up rate limit for tab', { tabId });
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

    const _response = await chrome.tabs.captureVisibleTab(tab.id, {
      format: 'png',
      quality: 90,
    });

    logger.info('Page captured', { tabId: tab.id });

    // Increment action count
    const { actionCount = 0 } = await storageUtils.getItem<{ actionCount: number }>('stats', {
      actionCount: 0,
    });

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
  return typeof msg.type === 'string';
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

// Export for testing
export { state, handleMessage, checkDesktopConnection };
