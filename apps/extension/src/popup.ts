import type {
  PopupState,
  ConnectionStatusResponse,
  CaptureScreenshotResponse,
  ConnectionStatus,
  PaywallHitMessage,
} from './types';
import { formatPrivacyModeLabel } from '@agiworkforce/types';
import { logger, storageUtils } from './utils';
import { loadPairingState, requestPairing, unpair } from './features/native-bridge/pairing';
import type { PairingState } from './features/native-bridge/pairing';
import type { MemoryItem } from './background/memory-bridge';
import { isMemoryItem, MEMORY_STORAGE_KEY } from './background/memory-bridge';

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

/** Storage key matching inPagePanel/setup.ts IN_PAGE_PANEL_ENABLED_KEY */
const IN_PAGE_PANEL_ENABLED_KEY = 'in_page_panel_enabled';

/** Storage key matching background.ts siteAllowlistCache + inPagePanel/setup.ts */
const SITE_ALLOWLIST_KEY = 'agi_site_allowlist';

async function initializePopup(): Promise<void> {
  try {
    await Promise.all([updateStatus(), updateTabInfo(), updateStats(), updateTierDisplay()]);
    setupEventListeners();
    startSessionTimer();
    await initInPagePanelToggle();
    await initAllowlistUI();
    await initMemoryUI();
    await initPairingUI();
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
            setActionButtonLabel(groupBtn, 'Grouped');
            setTimeout(() => {
              setActionButtonLabel(groupBtn, 'Group Tab');
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

  // Listen for connection status changes and paywall hits broadcast from background
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message !== 'object' || message === null || !('type' in message)) {
      return;
    }
    const msgType = (message as Record<string, unknown>)['type'];

    if (msgType === 'CONNECTION_STATUS_CHANGED') {
      const msg = message as { type: string; status?: ConnectionStatus; connected?: boolean };
      applyConnectionStatus(msg.status ?? (msg.connected ? 'connected' : 'disconnected'));
      return;
    }

    if (msgType === 'PAYWALL_HIT') {
      const msg = message as PaywallHitMessage;
      showPaywallCard(msg.feature, msg.requiredTier, msg.reason);
    }
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

function setActionButtonLabel(button: HTMLButtonElement, label: string): void {
  const labelEl = button.querySelector('.btn-label');
  if (labelEl) {
    labelEl.textContent = label;
  } else {
    button.textContent = label;
  }
}

function getActionButtonLabel(button: HTMLButtonElement): string {
  return button.querySelector('.btn-label')?.textContent ?? button.textContent ?? '';
}

/**
 * Apply visual state for a given connection status.
 * Handles connected / disconnected / connecting (reconnecting) states.
 */
function applyConnectionStatus(status: ConnectionStatus): void {
  const statusCard = document.getElementById('statusCard');
  const statusTitle = document.getElementById('statusTitle');
  const reconnectBtn = document.getElementById('reconnectBtn');

  if (!statusCard || !statusTitle) return;

  statusCard.classList.remove('connected', 'reconnecting');

  switch (status) {
    case 'connected':
      statusCard.classList.add('connected');
      statusTitle.textContent = 'Connected';
      reconnectBtn?.classList.remove('visible');
      popupState.isConnected = true;
      break;

    case 'connecting':
      statusCard.classList.add('reconnecting');
      statusTitle.textContent = 'Connecting…';
      reconnectBtn?.classList.remove('visible');
      popupState.isConnected = false;
      break;

    case 'disconnected':
    case 'error':
    default:
      statusTitle.textContent = 'Disconnected';
      reconnectBtn?.classList.add('visible');
      popupState.isConnected = false;
      break;
  }

  void storageUtils.setItem('connectedToDesktop', status === 'connected');
}

async function handleManualReconnect(): Promise<void> {
  const btn = document.getElementById('reconnectBtn') as HTMLButtonElement | null;
  if (btn) btn.disabled = true;
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
    if (btn) btn.disabled = false;
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
    applyConnectionStatus('error');
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

  const originalText = getActionButtonLabel(button);

  try {
    setActionButtonLabel(button, 'Capturing...');
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
      setActionButtonLabel(button, 'Captured!');
      incrementActionCount();

      setTimeout(() => {
        setActionButtonLabel(button, originalText ?? 'Capture');
        button.disabled = false;
      }, UI_FEEDBACK_DURATION_MS);
    } else {
      throw new Error(result.error || 'Screenshot failed');
    }
  } catch (error) {
    logger.error('Capture failed', error);
    setActionButtonLabel(button, 'Failed');

    setTimeout(() => {
      setActionButtonLabel(button, originalText ?? 'Capture');
      button.disabled = false;
    }, UI_FEEDBACK_DURATION_MS);
  }
}

async function handleRefresh(): Promise<void> {
  const button = document.getElementById('refreshBtn') as HTMLButtonElement | null;
  if (!button) return;

  const originalText = getActionButtonLabel(button);

  try {
    setActionButtonLabel(button, 'Refreshing...');
    button.disabled = true;

    await Promise.all([updateStatus(), updateTabInfo(), updateStats()]);

    setActionButtonLabel(button, 'Refreshed');

    setTimeout(() => {
      setActionButtonLabel(button, originalText ?? 'Refresh');
      button.disabled = false;
    }, REFRESH_FEEDBACK_DURATION_MS);
  } catch (error) {
    logger.error('Refresh failed', error);
    setActionButtonLabel(button, 'Failed');

    setTimeout(() => {
      setActionButtonLabel(button, originalText ?? 'Refresh');
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

// ---------------------------------------------------------------------------
// Tier display
// ---------------------------------------------------------------------------

/**
 * Human-readable labels for each tier value returned by the API.
 * Keeps tier display logic in one place — update here if tier IDs change.
 */
const TIER_LABELS: Readonly<Record<string, string>> = {
  free: 'Free',
  hobby: 'Hobby',
  pro: 'Pro',
  pro_plus: 'Pro+',
  max: 'Max',
  local: formatPrivacyModeLabel('local'),
  byok: formatPrivacyModeLabel('byok'),
};

/**
 * Read the user's cached tier from chrome.storage.local ('agi_user_tier') and
 * render it next to the version string.  Does NOT enforce anything — enforcement
 * is server-side.  If no cached tier is found, the element is hidden so the
 * popup is not cluttered for unauthenticated users.
 */
async function updateTierDisplay(): Promise<void> {
  const tierEl = document.getElementById('userTier') as HTMLElement | null;
  if (!tierEl) return;
  try {
    const stored = await storageUtils.getItem<string>('agi_user_tier');
    if (stored) {
      // Only show the element when a tier is known — no blank badge
      tierEl.textContent = TIER_LABELS[stored] ?? stored;
      tierEl.removeAttribute('hidden');
    } else {
      tierEl.setAttribute('hidden', '');
    }
  } catch {
    tierEl.setAttribute('hidden', '');
  }
}

// ---------------------------------------------------------------------------
// Paywall card
// ---------------------------------------------------------------------------

/**
 * Required-tier display strings for the upgrade CTA.
 */
const REQUIRED_TIER_LABELS: Readonly<Record<string, string>> = {
  hobby: 'Hobby',
  pro: 'Pro',
  pro_plus: 'Pro+',
  max: 'Max',
};

/**
 * Feature display names for the paywall card title.
 */
const PAYWALL_FEATURE_LABELS: Readonly<Record<string, string>> = {
  video_generation: 'video generation',
  opus_4_7: 'Opus 4.7 access',
  gpt_5_5: 'GPT-5.5 access',
  computer_use: 'computer use',
  deep_research: 'deep research',
  image_quota: 'more image generation',
  token_cap: 'higher token limits',
  mcp: 'MCP server support',
  web_search: 'web search',
};

/**
 * Render a paywall notification card in the popup.
 *
 * The card uses plain DOM construction so no innerHTML with user-controlled
 * content is involved (security constraint: DOMPurify is available in
 * side_panel.ts but popup.ts is a simpler surface — we avoid it by not
 * rendering any LLM-derived content, only static strings derived from the
 * structured paywall payload).
 *
 * Layout: injected above the .actions section so it is immediately visible.
 */
function showPaywallCard(feature: string, requiredTier: string, reason?: string): void {
  // Remove any existing paywall card (idempotent)
  document.getElementById('paywallCard')?.remove();

  const featureLabel = PAYWALL_FEATURE_LABELS[feature] ?? feature.replace(/_/g, ' ');
  const tierLabel = REQUIRED_TIER_LABELS[requiredTier] ?? requiredTier;

  // Build upgrade URL with UTM-style query params for analytics
  const upgradeUrl = new URL('https://agiworkforce.com/pricing');
  upgradeUrl.searchParams.set('from', 'ext-paywall');
  upgradeUrl.searchParams.set('tier', requiredTier);
  upgradeUrl.searchParams.set('feature', feature);

  // ── Card container ──────────────────────────────────────────────────────
  const card = document.createElement('div');
  card.id = 'paywallCard';
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Upgrade required');

  // ── Title row ───────────────────────────────────────────────────────────
  const titleEl = document.createElement('p');
  titleEl.className = 'paywall-title';
  // All text set via textContent — no innerHTML — so no XSS risk
  titleEl.textContent = `Upgrade to ${tierLabel} for ${featureLabel}`;

  // ── Reason (optional) ───────────────────────────────────────────────────
  const reasonEl = document.createElement('p');
  reasonEl.className = 'paywall-reason';
  if (reason) {
    reasonEl.textContent = reason;
  } else {
    reasonEl.setAttribute('hidden', '');
  }

  // ── CTA: Upgrade ────────────────────────────────────────────────────────
  const upgradeBtn = document.createElement('a');
  upgradeBtn.className = 'paywall-upgrade-btn';
  upgradeBtn.href = upgradeUrl.toString();
  upgradeBtn.target = '_blank';
  upgradeBtn.rel = 'noopener noreferrer';
  upgradeBtn.textContent = `Upgrade to ${tierLabel}`;

  // ── CTA: Dismiss ────────────────────────────────────────────────────────
  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'paywall-dismiss-btn';
  dismissBtn.textContent = 'Try later';
  dismissBtn.addEventListener('click', () => {
    card.remove();
  });

  // ── Button row ──────────────────────────────────────────────────────────
  const btnRow = document.createElement('div');
  btnRow.className = 'paywall-btn-row';
  btnRow.appendChild(upgradeBtn);
  btnRow.appendChild(dismissBtn);

  card.appendChild(titleEl);
  card.appendChild(reasonEl);
  card.appendChild(btnRow);

  // Insert before .actions so it appears near the top of the visible content
  const actionsEl = document.querySelector('.actions');
  const contentEl = document.querySelector('.content');
  if (actionsEl && contentEl) {
    contentEl.insertBefore(card, actionsEl);
  } else if (contentEl) {
    contentEl.prepend(card);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Desktop pairing UI
// ─────────────────────────────────────────────────────────────────────────────

function applyPairingState(state: PairingState): void {
  const labelEl = document.getElementById('pairingStatusLabel');
  const fpEl = document.getElementById('pairingFingerprint');
  const errorEl = document.getElementById('pairingError');
  const pairBtn = document.getElementById('pairBtn') as HTMLButtonElement | null;
  const unpairBtn = document.getElementById('unpairBtn') as HTMLButtonElement | null;

  if (!labelEl || !fpEl || !errorEl || !pairBtn || !unpairBtn) return;

  errorEl.classList.remove('visible');

  switch (state.phase) {
    case 'idle':
      labelEl.textContent = 'Not paired';
      fpEl.setAttribute('hidden', '');
      fpEl.classList.remove('paired');
      pairBtn.textContent = 'Pair with Desktop';
      pairBtn.disabled = false;
      pairBtn.removeAttribute('hidden');
      unpairBtn.setAttribute('hidden', '');
      break;

    case 'requesting':
      labelEl.textContent = 'Pairing...';
      fpEl.setAttribute('hidden', '');
      pairBtn.textContent = 'Pairing...';
      pairBtn.disabled = true;
      unpairBtn.setAttribute('hidden', '');
      break;

    case 'paired':
      labelEl.textContent = 'Paired';
      if (state.fingerprint) {
        fpEl.textContent = state.fingerprint;
        fpEl.classList.add('paired');
        fpEl.removeAttribute('hidden');
      }
      pairBtn.setAttribute('hidden', '');
      unpairBtn.removeAttribute('hidden');
      break;

    case 'error':
      labelEl.textContent = 'Pairing failed';
      fpEl.setAttribute('hidden', '');
      fpEl.classList.remove('paired');
      if (state.error) {
        errorEl.textContent = state.error;
        errorEl.classList.add('visible');
      }
      pairBtn.textContent = 'Retry Pairing';
      pairBtn.disabled = false;
      pairBtn.removeAttribute('hidden');
      unpairBtn.setAttribute('hidden', '');
      break;
  }
}

async function initPairingUI(): Promise<void> {
  const pairBtn = document.getElementById('pairBtn') as HTMLButtonElement | null;
  const unpairBtn = document.getElementById('unpairBtn') as HTMLButtonElement | null;

  if (!pairBtn || !unpairBtn) return;

  const state = await loadPairingState();
  applyPairingState(state);

  pairBtn.addEventListener('click', async () => {
    applyPairingState({ phase: 'requesting', fingerprint: null, error: null });
    const next = await requestPairing();
    applyPairingState(next);
  });

  unpairBtn.addEventListener('click', async () => {
    const next = await unpair();
    applyPairingState(next);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// In-page panel toggle
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sync the toggle UI with the stored flag and wire the change listener.
 * Default is enabled (checked) on first run.
 */
async function initInPagePanelToggle(): Promise<void> {
  const toggle = document.getElementById('inPagePanelToggle') as HTMLInputElement | null;
  if (!toggle) return;

  try {
    const result = await storageUtils.getItem<boolean>(IN_PAGE_PANEL_ENABLED_KEY);
    // Default true when not set
    toggle.checked = result !== false;
  } catch {
    toggle.checked = true;
  }

  toggle.addEventListener('change', () => {
    storageUtils.setItem(IN_PAGE_PANEL_ENABLED_KEY, toggle.checked).catch(() => {});
  });
}

/**
 * Site allowlist management — surfaces `agi_site_allowlist` in chrome.storage.local.
 *
 * Background.ts gates every content-script-originated message on this list;
 * before this UI shipped the user-facing error pointed at a popup section that
 * didn't exist ("Add it from the extension popup"). Now the UI is real:
 *   - Add/Remove button toggles the current tab's origin
 *   - List below shows all allowlisted origins with per-row Remove buttons
 *   - Storage writes propagate to background via the existing
 *     chrome.storage.onChanged listener at background.ts:834
 */
async function readAllowlist(): Promise<string[]> {
  try {
    const res = await chrome.storage.local.get(SITE_ALLOWLIST_KEY);
    const list = (res as Record<string, unknown>)[SITE_ALLOWLIST_KEY];
    return Array.isArray(list) ? (list as string[]).filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

async function writeAllowlist(next: string[]): Promise<void> {
  // Normalize: lowercase scheme+host, dedupe, sort for stable rendering.
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of next) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const u = new URL(trimmed);
      const origin = u.origin;
      if (!seen.has(origin)) {
        seen.add(origin);
        cleaned.push(origin);
      }
    } catch {
      // Drop malformed values silently — never persist garbage to the gate.
    }
  }
  cleaned.sort();
  await chrome.storage.local.set({ [SITE_ALLOWLIST_KEY]: cleaned });
}

function currentTabOrigin(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url;
      if (!url) return resolve(null);
      try {
        resolve(new URL(url).origin);
      } catch {
        resolve(null);
      }
    });
  });
}

function renderAllowlistList(list: string[], currentOrigin: string | null): void {
  const ul = document.getElementById('allowlistList') as HTMLUListElement | null;
  const empty = document.getElementById('allowlistEmpty') as HTMLParagraphElement | null;
  if (!ul) return;
  ul.textContent = '';
  if (list.length === 0) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  for (const origin of list) {
    const li = document.createElement('li');
    li.className = 'allowlist-item';
    if (origin === currentOrigin) li.classList.add('is-current');
    const label = document.createElement('span');
    label.className = 'allowlist-item-origin';
    label.textContent = origin;
    li.appendChild(label);
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'allowlist-item-remove';
    removeBtn.textContent = 'Remove';
    removeBtn.setAttribute('aria-label', `Remove ${origin} from allowlist`);
    removeBtn.addEventListener('click', () => {
      void removeOrigin(origin);
    });
    li.appendChild(removeBtn);
    ul.appendChild(li);
  }
}

async function renderAllowlistUI(): Promise<void> {
  const list = await readAllowlist();
  const origin = await currentTabOrigin();
  const originLabel = document.getElementById('allowlistCurrentOrigin') as HTMLSpanElement | null;
  const toggleBtn = document.getElementById('allowlistToggleBtn') as HTMLButtonElement | null;
  if (originLabel) {
    originLabel.textContent = origin ?? 'No active tab';
    originLabel.title = origin ?? '';
  }
  if (toggleBtn) {
    if (!origin) {
      toggleBtn.disabled = true;
      toggleBtn.textContent = 'Add';
      toggleBtn.classList.remove('is-remove');
    } else {
      toggleBtn.disabled = false;
      const present = list.includes(origin);
      toggleBtn.textContent = present ? 'Remove' : 'Add';
      toggleBtn.classList.toggle('is-remove', present);
    }
  }
  renderAllowlistList(list, origin);
}

async function toggleCurrentOrigin(): Promise<void> {
  const origin = await currentTabOrigin();
  if (!origin) return;
  const list = await readAllowlist();
  const present = list.includes(origin);
  const next = present ? list.filter((o) => o !== origin) : [...list, origin];
  await writeAllowlist(next);
  // Re-render — storage.onChanged also fires in background; this is the
  // popup-local refresh path.
  await renderAllowlistUI();
}

async function removeOrigin(origin: string): Promise<void> {
  const list = await readAllowlist();
  if (!list.includes(origin)) return;
  await writeAllowlist(list.filter((o) => o !== origin));
  await renderAllowlistUI();
}

async function initAllowlistUI(): Promise<void> {
  const toggleBtn = document.getElementById('allowlistToggleBtn') as HTMLButtonElement | null;
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      void toggleCurrentOrigin();
    });
  }
  // Keep popup in sync if another popup window mutates the list.
  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[SITE_ALLOWLIST_KEY]) {
        void renderAllowlistUI();
      }
    });
  }
  await renderAllowlistUI();
}

// ─────────────────────────────────────────────────────────────────────────────
// Memory editor
//
// v1 LOCAL ONLY: all reads/writes go through background → chrome.storage.local.
// No cloud sync. No writes to consumer chat tables.
// DOM construction uses textContent exclusively — no innerHTML.
// R21 (2026-05-22): host-adopt shared memory primitive.
// ─────────────────────────────────────────────────────────────────────────────

/** Milliseconds the delete-confirm button stays red before reverting. */
const DELETE_CONFIRM_MS = 3000;

// MEMORY_STORAGE_KEY is imported from ./background/memory-bridge

type MemoryMessageType = 'LIST_MEMORIES' | 'ADD_MEMORY' | 'UPDATE_MEMORY' | 'DELETE_MEMORY';

async function sendMemoryMessage(
  type: MemoryMessageType,
  payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  try {
    const res = (await chrome.runtime.sendMessage({ type, ...payload })) as Record<string, unknown>;
    return res ?? {};
  } catch {
    return { success: false, error: 'Message failed' };
  }
}

/** Render a human-readable relative timestamp (e.g. "2 h ago", "just now"). */
function formatRelativeTime(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    if (diffMs < 60_000) return 'just now';
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    return `${days} d ago`;
  } catch {
    return '';
  }
}

/** Render the memory list + empty state. */
function renderMemoryList(memories: MemoryItem[]): void {
  const ul = document.getElementById('memoryList') as HTMLUListElement | null;
  const emptyDiv = document.getElementById('memoryEmpty') as HTMLDivElement | null;
  if (!ul) return;

  ul.textContent = '';

  if (memories.length === 0) {
    if (emptyDiv) emptyDiv.hidden = false;
    return;
  }
  if (emptyDiv) emptyDiv.hidden = true;

  for (const item of memories) {
    ul.appendChild(buildMemoryItem(item));
  }
}

/** Build a single <li> for a memory entry (no innerHTML). */
function buildMemoryItem(item: MemoryItem): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'memory-item';
  li.dataset['id'] = item.id;

  // Content span (2-line clamp via CSS)
  const contentEl = document.createElement('span');
  contentEl.className = 'memory-item-content';
  contentEl.textContent = item.content;
  li.appendChild(contentEl);

  // Meta row: timestamp
  const metaEl = document.createElement('span');
  metaEl.className = 'memory-item-meta';
  metaEl.textContent = formatRelativeTime(item.updatedAt || item.createdAt);
  li.appendChild(metaEl);

  // Action row: edit + delete
  const actionRow = document.createElement('div');
  actionRow.className = 'memory-item-row';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'memory-item-edit-btn';
  editBtn.textContent = 'Edit';
  editBtn.setAttribute('aria-label', 'Edit memory');
  editBtn.addEventListener('click', () => {
    startInlineEdit(li, item, contentEl, editBtn, deleteBtn, actionRow);
  });
  actionRow.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'memory-item-delete-btn';
  deleteBtn.textContent = 'Delete';
  deleteBtn.setAttribute('aria-label', 'Delete memory');

  let confirmTimer: ReturnType<typeof setTimeout> | null = null;

  deleteBtn.addEventListener('click', () => {
    if (deleteBtn.classList.contains('is-confirm')) {
      // Second tap — execute delete
      if (confirmTimer !== null) {
        clearTimeout(confirmTimer);
        confirmTimer = null;
      }
      void executeMemoryDelete(item.id);
    } else {
      // First tap — show red confirm for DELETE_CONFIRM_MS
      deleteBtn.classList.add('is-confirm');
      deleteBtn.textContent = 'Confirm delete';
      confirmTimer = setTimeout(() => {
        deleteBtn.classList.remove('is-confirm');
        deleteBtn.textContent = 'Delete';
        confirmTimer = null;
      }, DELETE_CONFIRM_MS);
    }
  });
  actionRow.appendChild(deleteBtn);

  li.appendChild(actionRow);
  return li;
}

/** Replace content + edit button with an inline textarea + save button. */
function startInlineEdit(
  li: HTMLLIElement,
  item: MemoryItem,
  contentEl: HTMLSpanElement,
  editBtn: HTMLButtonElement,
  deleteBtn: HTMLButtonElement,
  actionRow: HTMLDivElement,
): void {
  // Prevent double-open
  if (li.querySelector('.memory-item-textarea')) return;

  contentEl.classList.add('is-editing');
  contentEl.hidden = true;
  editBtn.hidden = true;
  deleteBtn.hidden = true;

  const textarea = document.createElement('textarea');
  textarea.className = 'memory-item-textarea';
  textarea.value = item.content;
  textarea.rows = 3;
  textarea.maxLength = 2000;

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'memory-item-save-btn';
  saveBtn.textContent = 'Save';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'memory-item-edit-btn';
  cancelBtn.textContent = 'Cancel';

  const inlineRow = document.createElement('div');
  inlineRow.className = 'memory-editor-actions';
  inlineRow.appendChild(saveBtn);
  inlineRow.appendChild(cancelBtn);

  li.insertBefore(textarea, actionRow);
  li.insertBefore(inlineRow, actionRow);

  textarea.focus();

  saveBtn.addEventListener('click', async () => {
    const newContent = textarea.value.trim();
    if (!newContent) return;
    saveBtn.disabled = true;
    await executeMemoryUpdate(item.id, newContent);
  });

  cancelBtn.addEventListener('click', () => {
    textarea.remove();
    inlineRow.remove();
    contentEl.hidden = false;
    contentEl.classList.remove('is-editing');
    editBtn.hidden = false;
    deleteBtn.hidden = false;
  });
}

/** Call background to delete, then re-render. */
async function executeMemoryDelete(id: string): Promise<void> {
  await sendMemoryMessage('DELETE_MEMORY', { id });
  await refreshMemoryUI();
}

/** Call background to update, then re-render. */
async function executeMemoryUpdate(id: string, content: string): Promise<void> {
  await sendMemoryMessage('UPDATE_MEMORY', { id, content });
  await refreshMemoryUI();
}

/** Read memories from background and re-render. */
async function refreshMemoryUI(): Promise<void> {
  const res = await sendMemoryMessage('LIST_MEMORIES');
  const raw = Array.isArray(res['memories']) ? (res['memories'] as unknown[]) : [];
  const memories = raw.filter(isMemoryItem);
  renderMemoryList(memories);
}

/** Show/hide the Add memory inline editor (top of section). */
function showAddEditor(show: boolean): void {
  const editor = document.getElementById('memoryEditor');
  const textarea = document.getElementById('memoryTextarea') as HTMLTextAreaElement | null;
  if (!editor) return;
  editor.hidden = !show;
  if (show && textarea) {
    textarea.value = '';
    textarea.focus();
  }
}

export async function initMemoryUI(): Promise<void> {
  const addBtn = document.getElementById('memoryAddBtn') as HTMLButtonElement | null;
  const addFirstBtn = document.getElementById('memoryAddFirstBtn') as HTMLButtonElement | null;
  const saveBtn = document.getElementById('memorySaveBtn') as HTMLButtonElement | null;
  const cancelBtn = document.getElementById('memoryCancelBtn') as HTMLButtonElement | null;
  const textarea = document.getElementById('memoryTextarea') as HTMLTextAreaElement | null;

  const openEditor = () => showAddEditor(true);

  if (addBtn) addBtn.addEventListener('click', openEditor);
  if (addFirstBtn) addFirstBtn.addEventListener('click', openEditor);

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => showAddEditor(false));
  }

  if (saveBtn && textarea) {
    saveBtn.addEventListener('click', async () => {
      const content = textarea.value.trim();
      if (!content) return;
      saveBtn.disabled = true;
      await sendMemoryMessage('ADD_MEMORY', { content });
      showAddEditor(false);
      saveBtn.disabled = false;
      await refreshMemoryUI();
    });
  }

  // Keep popup in sync if another popup window mutates the store
  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[MEMORY_STORAGE_KEY]) {
        void refreshMemoryUI();
      }
    });
  }

  await refreshMemoryUI();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePopup);
} else {
  initializePopup().catch((error) => {
    logger.error('Failed to initialize popup', error);
  });
}

export {
  popupState,
  updateStatus,
  updateTabInfo,
  updateStats,
  updateTierDisplay,
  showPaywallCard,
  initInPagePanelToggle,
  initPairingUI,
  initAllowlistUI,
  readAllowlist,
  writeAllowlist,
  applyPairingState,
  renderMemoryList,
  refreshMemoryUI,
  TIER_LABELS,
  PAYWALL_FEATURE_LABELS,
  REQUIRED_TIER_LABELS,
  IN_PAGE_PANEL_ENABLED_KEY,
  SITE_ALLOWLIST_KEY,
  MEMORY_STORAGE_KEY,
};
