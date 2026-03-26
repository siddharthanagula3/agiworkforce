import type {
  PopupState,
  ConnectionStatusResponse,
  CaptureScreenshotResponse,
  ConnectionStatus,
} from './types';
import { logger, storageUtils } from './utils';

// UI feedback durations
const UI_FEEDBACK_DURATION_MS = 2000;
const REFRESH_FEEDBACK_DURATION_MS = 1000;

let sessionTimerInterval: ReturnType<typeof setInterval> | null = null;

// State management
const popupState: PopupState = {
  sessionStartTime: Date.now(),
  actionCount: 0,
  isConnected: false,
};

async function initializePopup(): Promise<void> {
  try {
    await Promise.all([updateStatus(), updateTabInfo(), updateStats()]);
    setupEventListeners();
    startSessionTimer();
  } catch (error) {
    logger.error('Failed to initialize popup', error);
  }
}

function setupEventListeners(): void {
  const captureBtn = document.getElementById('captureBtn') as HTMLButtonElement | null;
  const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement | null;
  const sidePanelBtn = document.getElementById('sidePanelBtn') as HTMLButtonElement | null;
  const groupBtn = document.getElementById('groupBtn') as HTMLButtonElement | null;
  const reconnectBtn = document.getElementById('reconnectBtn') as HTMLButtonElement | null;

  if (captureBtn) {
    captureBtn.addEventListener('click', handleCapturePage);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', handleRefresh);
  }

  if (sidePanelBtn) {
    sidePanelBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }).catch(() => {
        // Background may not be ready — silently ignore.
      });
      window.close();
    });
  }

  if (groupBtn) {
    groupBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage(
        { type: 'ADD_TAB_TO_GROUP' },
        (response: { success?: boolean } | undefined) => {
          if (chrome.runtime.lastError) return;
          if (groupBtn && response?.success) {
            groupBtn.textContent = 'Grouped';
            setTimeout(() => {
              groupBtn.textContent = 'Group Tab';
            }, 1500);
          }
        },
      );
    });
  }

  if (reconnectBtn) {
    reconnectBtn.addEventListener('click', handleManualReconnect);
  }

  const versionEl = document.getElementById('extVersion');
  if (versionEl) {
    versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
  }

  // Listen for connection status changes broadcast from background
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('type' in message) ||
      (message as Record<string, unknown>)['type'] !== 'CONNECTION_STATUS_CHANGED'
    ) {
      return;
    }
    const msg = message as { type: string; status?: ConnectionStatus; connected?: boolean };
    applyConnectionStatus(msg.status ?? (msg.connected ? 'connected' : 'disconnected'));
  });

  window.addEventListener('unload', () => {
    if (sessionTimerInterval !== null) {
      clearInterval(sessionTimerInterval);
      sessionTimerInterval = null;
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes['connectedToDesktop']) {
      void updateStatus();
    }

    if (changes['stats']) {
      const stats = changes['stats'].newValue || {};
      popupState.actionCount = (stats as { actionCount?: number }).actionCount || 0;
      void updateStats();
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
      e.preventDefault();
      void handleRefresh();
    }
  });
}

/**
 * Apply visual state for a given connection status.
 * Handles connected / disconnected / connecting (reconnecting) states.
 */
function applyConnectionStatus(status: ConnectionStatus): void {
  const statusCard = document.getElementById('statusCard');
  const statusTitle = document.getElementById('statusTitle');
  const statusSubtitle = document.getElementById('statusSubtitle');
  const reconnectBtn = document.getElementById('reconnectBtn');

  if (!statusCard || !statusTitle || !statusSubtitle) return;

  // Reset all state classes
  statusCard.classList.remove('connected', 'reconnecting');

  switch (status) {
    case 'connected':
      statusCard.classList.add('connected');
      statusTitle.textContent = 'Connected';
      statusSubtitle.textContent = 'Desktop app is active';
      reconnectBtn?.classList.remove('visible');
      popupState.isConnected = true;
      break;

    case 'connecting':
      statusCard.classList.add('reconnecting');
      statusTitle.textContent = 'Reconnecting...';
      statusSubtitle.textContent = 'Attempting to reach desktop app';
      reconnectBtn?.classList.remove('visible');
      popupState.isConnected = false;
      break;

    case 'disconnected':
    case 'error':
    default:
      statusTitle.textContent = 'Disconnected';
      statusSubtitle.textContent = 'Desktop app not detected';
      reconnectBtn?.classList.add('visible');
      popupState.isConnected = false;
      break;
  }

  void storageUtils.setItem('connectedToDesktop', status === 'connected');
}

async function handleManualReconnect(): Promise<void> {
  const btn = document.getElementById('reconnectBtn') as HTMLButtonElement | null;
  if (btn) {
    btn.textContent = 'Connecting...';
    btn.disabled = true;
  }
  applyConnectionStatus('connecting');

  try {
    const result = (await chrome.runtime.sendMessage({
      type: 'RECONNECT_NATIVE',
    })) as ConnectionStatusResponse;

    const status: ConnectionStatus =
      result.connectionStatus ?? (result.nativeConnected ? 'connected' : 'disconnected');
    applyConnectionStatus(status);
  } catch {
    applyConnectionStatus('disconnected');
  } finally {
    if (btn) {
      btn.textContent = 'Reconnect';
      btn.disabled = false;
    }
  }
}

async function updateStatus(): Promise<void> {
  try {
    const result = (await chrome.runtime.sendMessage({
      type: 'GET_CONNECTION_STATUS',
    })) as ConnectionStatusResponse;

    const status: ConnectionStatus =
      result.connectionStatus ?? (result.nativeConnected ? 'connected' : 'disconnected');
    applyConnectionStatus(status);
  } catch (error) {
    logger.error('Failed to update status', error);

    const statusTitle = document.getElementById('statusTitle') as HTMLElement | null;
    const statusSubtitle = document.getElementById('statusSubtitle') as HTMLElement | null;

    if (statusTitle) statusTitle.textContent = 'Error';
    if (statusSubtitle) statusSubtitle.textContent = 'Failed to check status';
  }
}

async function updateTabInfo(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab) {
      throw new Error('No active tab found');
    }

    const tabIdEl = document.getElementById('tabId') as HTMLElement | null;
    const currentUrlEl = document.getElementById('currentUrl') as HTMLElement | null;

    if (tabIdEl) {
      tabIdEl.textContent = String(tab.id ?? '-');
    }

    if (tab.url && currentUrlEl) {
      try {
        const url = new URL(tab.url);
        const displayUrl = `${url.hostname}${url.pathname}`;
        // Use spread to iterate by code points — substring() can split multibyte characters.
        const chars = [...displayUrl];
        const truncated = chars.length > 25 ? chars.slice(0, 25).join('') + '...' : displayUrl;

        currentUrlEl.textContent = truncated;
        currentUrlEl.setAttribute('title', tab.url);
      } catch {
        currentUrlEl.textContent = 'Invalid URL';
        currentUrlEl.removeAttribute('title');
      }
    }
  } catch (error) {
    logger.error('Failed to update tab info', error);

    const tabIdEl = document.getElementById('tabId') as HTMLElement | null;
    const currentUrlEl = document.getElementById('currentUrl') as HTMLElement | null;

    if (tabIdEl) tabIdEl.textContent = 'Error';
    if (currentUrlEl) currentUrlEl.textContent = 'Error';
  }
}

async function updateStats(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    const tabCountEl = document.getElementById('tabCount') as HTMLElement | null;
    if (tabCountEl) {
      tabCountEl.textContent = String(tabs.length);
    }

    const stats = await storageUtils.getItem<{ actionCount: number }>('stats', { actionCount: 0 });
    const actionCount = stats?.actionCount ?? 0;
    popupState.actionCount = actionCount;

    const actionCountEl = document.getElementById('actionCount') as HTMLElement | null;
    if (actionCountEl) {
      actionCountEl.textContent = String(actionCount);
    }
  } catch (error) {
    logger.error('Failed to update stats', error);
  }
}

function startSessionTimer(): void {
  const sessionTimeEl = document.getElementById('sessionTime') as HTMLElement | null;

  if (!sessionTimeEl) return;

  const updateSessionTime = (): void => {
    const elapsed = Math.floor((Date.now() - popupState.sessionStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    sessionTimeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  updateSessionTime();
  sessionTimerInterval = setInterval(updateSessionTime, 1000);
}

async function handleCapturePage(): Promise<void> {
  const button = document.getElementById('captureBtn') as HTMLButtonElement | null;
  if (!button) return;

  const originalText = button.textContent;

  try {
    button.textContent = 'Capturing...';
    button.disabled = true;

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (!tab?.id) {
      throw new Error('No active tab found');
    }

    const response = await chrome.runtime.sendMessage({
      type: 'CAPTURE_SCREENSHOT',
      format: 'png',
      quality: 90,
    });

    const result = response as CaptureScreenshotResponse;

    if (result.success) {
      button.textContent = 'Captured!';
      incrementActionCount();

      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
      }, UI_FEEDBACK_DURATION_MS);
    } else {
      throw new Error(result.error || 'Screenshot failed');
    }
  } catch (error) {
    logger.error('Capture failed', error);
    button.textContent = 'Failed';

    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, UI_FEEDBACK_DURATION_MS);
  }
}

async function handleRefresh(): Promise<void> {
  const button = document.getElementById('refreshBtn') as HTMLButtonElement | null;
  if (!button) return;

  const originalText = button.textContent;

  try {
    button.textContent = 'Refreshing...';
    button.disabled = true;

    await Promise.all([updateStatus(), updateTabInfo(), updateStats()]);

    button.textContent = 'Refreshed';

    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, REFRESH_FEEDBACK_DURATION_MS);
  } catch (error) {
    logger.error('Refresh failed', error);
    button.textContent = 'Failed';

    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, UI_FEEDBACK_DURATION_MS);
  }
}

async function incrementActionCount(): Promise<void> {
  const stats = await storageUtils.getItem<{ actionCount: number }>('stats', { actionCount: 0 });
  const newCount = (stats?.actionCount ?? 0) + 1;
  await storageUtils.setItem('stats', { actionCount: newCount });
  popupState.actionCount = newCount;

  const actionCountEl = document.getElementById('actionCount') as HTMLElement | null;
  if (actionCountEl) {
    actionCountEl.textContent = String(newCount);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup);
} else {
  initializePopup().catch((error) => {
    logger.error('Failed to initialize popup', error);
  });
}

export { popupState, updateStatus, updateTabInfo, updateStats };
