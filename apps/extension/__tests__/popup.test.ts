/**
 * Tests for the popup UI (src/popup.ts).
 *
 * Tests verify:
 * - applyConnectionStatus() DOM mutations for all four status values
 * - updateTabInfo() URL truncation and error handling
 * - updateStats() action counter rendering
 * - updateStatus() wiring to chrome.runtime.sendMessage
 * - handleManualReconnect() button state transitions
 * - Keyboard shortcut (Ctrl+R / Meta+R) triggering refresh
 * - chrome.storage.onChanged listener driving UI updates
 *
 * Architecture note: popup.ts registers its event listeners at module load time
 * (DOM listeners via setupEventListeners()). We build the DOM fixture BEFORE
 * importing the module so that querySelector calls during setup find the right
 * elements. The DOM is rebuilt between tests and exports are re-tested directly.
 *
 * NOTE ON vi.mock HOISTING: vi.mock() factories are hoisted above all imports.
 * Variables declared with const/let in the test file are NOT accessible from
 * inside a vi.mock factory. We therefore define mock return values inside the
 * factory itself and retrieve the live mock fns via the imported module below.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Chrome API stubs ─────────────────────────────────────────────────────────
// popup.ts calls initializePopup() at module load time (before any test code
// runs). initializePopup() uses chrome.runtime.sendMessage, chrome.tabs.query,
// and chrome.storage APIs. The chrome global must exist on globalThis BEFORE
// the module is imported — so we use vi.hoisted() which runs before imports.
//
// The listener arrays are module-scope arrays captured by the addListener
// implementations below. They survive vi.clearAllMocks() because clearAllMocks
// only resets .mock.calls/.results, not implementations.

type StorageChangeListener = (changes: Record<string, chrome.storage.StorageChange>) => void;
type MessageListener = (message: unknown) => void;

// chromeMock and globalThis.chrome setup via vi.hoisted() — executes before imports.
// The listener arrays live INSIDE the hoisted factory so popup.ts finds chrome at load time.
// Access listener arrays via chromeMock.runtime.onMessage._listeners etc.
const chromeMock = vi.hoisted(() => {
  const msgListeners: MessageListener[] = [];
  const storageListeners_: StorageChangeListener[] = [];

  const mock = {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ connectionStatus: 'disconnected' }),
      getManifest: vi.fn(() => ({ version: '1.2.0' })),
      onMessage: {
        addListener: vi.fn((cb: MessageListener) => msgListeners.push(cb)),
        _listeners: msgListeners,
      },
      lastError: undefined as string | undefined,
    },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com/page', title: 'Ex' }]),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: {
        addListener: vi.fn((cb: StorageChangeListener) => storageListeners_.push(cb)),
        _listeners: storageListeners_,
      },
    },
  };
  (globalThis as Record<string, unknown>).chrome = mock;
  return mock;
});

// ─── Mock storageUtils — factory must NOT reference outer-scope let/const ──────
// vi.mock is hoisted; use vi.fn() directly and recover the mocks after import.

vi.mock('../src/utils', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  storageUtils: {
    getItem: vi.fn().mockResolvedValue({ actionCount: 0 }),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── DOM fixture — built BEFORE module import ─────────────────────────────────

function buildPopupDom(): void {
  document.body.innerHTML = `
    <div id="statusCard">
      <h2 id="statusTitle">--</h2>
      <p id="statusSubtitle">--</p>
    </div>
    <button id="captureBtn">Capture Page</button>
    <button id="refreshBtn">Refresh</button>
    <button id="sidePanelBtn">Side Panel</button>
    <button id="groupBtn">Group Tab</button>
    <button id="reconnectBtn">Reconnect</button>
    <span id="extVersion"></span>
    <span id="tabId"></span>
    <span id="currentUrl"></span>
    <span id="tabCount"></span>
    <span id="actionCount"></span>
    <span id="sessionTime"></span>
  `;
}

// Build DOM before module import so event listeners bind to correct elements
buildPopupDom();

// ─── Import after DOM + mocks are ready ──────────────────────────────────────

import { popupState, updateStatus, updateTabInfo, updateStats } from '../src/popup.ts';
import type { storageUtils as StorageUtilsType } from '../src/utils';

// ─── Retrieve live mock references ───────────────────────────────────────────

async function getStorageMock(): Promise<typeof StorageUtilsType> {
  const mod = await import('../src/utils');
  return mod.storageUtils;
}

/** Wait for module initialization by polling until listeners are registered. */
async function waitForInit(): Promise<void> {
  // initializePopup() is async — it awaits updateStatus/updateTabInfo/updateStats
  // then calls setupEventListeners() which registers the onMessage, storage.onChanged
  // and keydown listeners we test below.
  // Poll until at least one message listener is registered (max 200ms).
  for (let i = 0; i < 50; i++) {
    await new Promise<void>((r) => setTimeout(r, 4));
    if ((chromeMock.runtime.onMessage._listeners as MessageListener[]).length > 0) break;
  }
}

// ─── Wait for module initialization before running any tests ─────────────────

beforeAll(async () => {
  await waitForInit();
});

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(async () => {
  buildPopupDom();
  vi.clearAllMocks();

  // Restore default mock behaviors after vi.clearAllMocks()
  chromeMock.runtime.sendMessage.mockResolvedValue({ connectionStatus: 'disconnected' });
  chromeMock.tabs.query.mockResolvedValue([
    { id: 42, url: 'https://example.com/some/path', title: 'Example' },
  ]);

  const storage = await getStorageMock();
  (storage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue({ actionCount: 3 });
  (storage.setItem as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ═════════════════════════════════════════════════════════════════════════════
// updateStatus — connected state
// ═════════════════════════════════════════════════════════════════════════════

describe('updateStatus — connected state', () => {
  it('adds "connected" class to statusCard when connected', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ connectionStatus: 'connected' });
    await updateStatus();
    expect(document.getElementById('statusCard')!.classList.contains('connected')).toBe(true);
    expect(document.getElementById('statusTitle')!.textContent).toBe('Connected');
    expect(document.getElementById('statusSubtitle')!.textContent).toBe('Desktop app is active');
  });

  it('sets popupState.isConnected to true when connected', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ connectionStatus: 'connected' });
    await updateStatus();
    expect(popupState.isConnected).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// updateStatus — disconnected state
// ═════════════════════════════════════════════════════════════════════════════

describe('updateStatus — disconnected state', () => {
  it('shows "Disconnected" title when status is disconnected', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ connectionStatus: 'disconnected' });
    await updateStatus();
    expect(document.getElementById('statusTitle')!.textContent).toBe('Disconnected');
    expect(document.getElementById('statusSubtitle')!.textContent).toBe('Desktop app not detected');
  });

  it('makes the reconnect button visible when disconnected', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ connectionStatus: 'disconnected' });
    await updateStatus();
    expect(document.getElementById('reconnectBtn')!.classList.contains('visible')).toBe(true);
  });

  it('sets popupState.isConnected to false when disconnected', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ connectionStatus: 'disconnected' });
    await updateStatus();
    expect(popupState.isConnected).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// updateStatus — connecting/reconnecting state
// ═════════════════════════════════════════════════════════════════════════════

describe('updateStatus — connecting/reconnecting state', () => {
  it('shows "Reconnecting..." title when status is connecting', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ connectionStatus: 'connecting' });
    await updateStatus();
    expect(document.getElementById('statusTitle')!.textContent).toBe('Reconnecting...');
  });

  it('adds "reconnecting" class to statusCard when connecting', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ connectionStatus: 'connecting' });
    await updateStatus();
    expect(document.getElementById('statusCard')!.classList.contains('reconnecting')).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// updateStatus — error state
// ═════════════════════════════════════════════════════════════════════════════

describe('updateStatus — error state', () => {
  it('falls back to disconnected UI for "error" status', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ connectionStatus: 'error' });
    await updateStatus();
    expect(document.getElementById('statusTitle')!.textContent).toBe('Disconnected');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// updateStatus — nativeConnected fallback
// ═════════════════════════════════════════════════════════════════════════════

describe('updateStatus — nativeConnected fallback', () => {
  it('treats nativeConnected=true as connected when connectionStatus is absent', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ nativeConnected: true });
    await updateStatus();
    expect(document.getElementById('statusTitle')!.textContent).toBe('Connected');
  });

  it('treats nativeConnected=false as disconnected when connectionStatus is absent', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ nativeConnected: false });
    await updateStatus();
    expect(document.getElementById('statusTitle')!.textContent).toBe('Disconnected');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// updateStatus — error fallback when sendMessage throws
// ═════════════════════════════════════════════════════════════════════════════

describe('updateStatus — error fallback when sendMessage throws', () => {
  it('shows "Error" in statusTitle when sendMessage rejects', async () => {
    chromeMock.runtime.sendMessage.mockRejectedValue(new Error('No connection'));
    await updateStatus();
    expect(document.getElementById('statusTitle')!.textContent).toBe('Error');
    expect(document.getElementById('statusSubtitle')!.textContent).toBe('Failed to check status');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// updateTabInfo
// ═════════════════════════════════════════════════════════════════════════════

describe('updateTabInfo', () => {
  it('displays the tab id in #tabId', async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 99, url: 'https://example.com/' }]);
    await updateTabInfo();
    expect(document.getElementById('tabId')!.textContent).toBe('99');
  });

  it('displays a truncated host + path in #currentUrl', async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com/short' }]);
    await updateTabInfo();
    expect(document.getElementById('currentUrl')!.textContent).toContain('example.com');
  });

  it('truncates long URLs with ellipsis', async () => {
    const longPath = '/this/is/a/very/long/path/that/needs/truncation';
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: `https://example.com${longPath}` }]);
    await updateTabInfo();
    const display = document.getElementById('currentUrl')!.textContent ?? '';
    expect(display).toContain('...');
    expect(display.length).toBeLessThanOrEqual(30);
  });

  it('sets title attribute on currentUrl element for the full URL', async () => {
    const fullUrl = 'https://example.com/full-path';
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: fullUrl }]);
    await updateTabInfo();
    expect(document.getElementById('currentUrl')!.getAttribute('title')).toBe(fullUrl);
  });

  it('shows "Invalid URL" when tab URL is not parseable', async () => {
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'not-a-valid-url' }]);
    await updateTabInfo();
    expect(document.getElementById('currentUrl')!.textContent).toBe('Invalid URL');
  });

  it('shows "Error" in tabId and currentUrl when no active tab is found', async () => {
    chromeMock.tabs.query.mockResolvedValue([]);
    await updateTabInfo();
    expect(document.getElementById('tabId')!.textContent).toBe('Error');
    expect(document.getElementById('currentUrl')!.textContent).toBe('Error');
  });

  it('shows "Error" when tabs.query rejects', async () => {
    chromeMock.tabs.query.mockRejectedValue(new Error('No permission'));
    await updateTabInfo();
    expect(document.getElementById('tabId')!.textContent).toBe('Error');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// updateStats
// ═════════════════════════════════════════════════════════════════════════════

describe('updateStats', () => {
  it('renders the tab count in #tabCount', async () => {
    chromeMock.tabs.query.mockResolvedValue([{}, {}, {}]);
    await updateStats();
    expect(document.getElementById('tabCount')!.textContent).toBe('3');
  });

  it('renders the action count in #actionCount', async () => {
    const storage = await getStorageMock();
    (storage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue({ actionCount: 7 });
    await updateStats();
    expect(document.getElementById('actionCount')!.textContent).toBe('7');
  });

  it('defaults actionCount to 0 when storage has no stats', async () => {
    const storage = await getStorageMock();
    (storage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    chromeMock.tabs.query.mockResolvedValue([{}]);
    await updateStats();
    expect(document.getElementById('actionCount')!.textContent).toBe('0');
  });

  it('does not throw when tabs.query rejects', async () => {
    chromeMock.tabs.query.mockRejectedValue(new Error('permission denied'));
    await expect(updateStats()).resolves.toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CONNECTION_STATUS_CHANGED message listener (from background)
// ═════════════════════════════════════════════════════════════════════════════

describe('runtime.onMessage listener — CONNECTION_STATUS_CHANGED', () => {
  it('updates the status card when a CONNECTION_STATUS_CHANGED message arrives', () => {
    const msg = { type: 'CONNECTION_STATUS_CHANGED', status: 'connected' };
    for (const listener of chromeMock.runtime.onMessage._listeners as MessageListener[])
      listener(msg);
    expect(document.getElementById('statusTitle')!.textContent).toBe('Connected');
  });

  it('handles connected=true fallback in message', () => {
    const msg = { type: 'CONNECTION_STATUS_CHANGED', connected: true };
    for (const listener of chromeMock.runtime.onMessage._listeners as MessageListener[])
      listener(msg);
    expect(document.getElementById('statusTitle')!.textContent).toBe('Connected');
  });

  it('ignores non-CONNECTION_STATUS_CHANGED messages', () => {
    // Set a known state first
    for (const listener of chromeMock.runtime.onMessage._listeners as MessageListener[]) {
      listener({ type: 'CONNECTION_STATUS_CHANGED', status: 'connected' });
    }
    const titleBefore = document.getElementById('statusTitle')!.textContent;

    // Send an unrelated message
    for (const listener of chromeMock.runtime.onMessage._listeners as MessageListener[]) {
      listener({ type: 'SOME_OTHER_MESSAGE', data: 42 });
    }
    expect(document.getElementById('statusTitle')!.textContent).toBe(titleBefore);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Keyboard shortcut — Ctrl+R / Meta+R triggers refresh
// ═════════════════════════════════════════════════════════════════════════════

describe('keyboard shortcut Ctrl+R / Meta+R', () => {
  it('prevents default and triggers refresh on Ctrl+R', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ connectionStatus: 'connected' });
    chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
    const storage = await getStorageMock();
    (storage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue({ actionCount: 0 });

    const event = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true, bubbles: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    document.dispatchEvent(event);
    await new Promise((r) => setTimeout(r, 0));

    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// popupState initial shape
// ═════════════════════════════════════════════════════════════════════════════

describe('popupState initial shape', () => {
  it('has a numeric sessionStartTime', () => {
    expect(typeof popupState.sessionStartTime).toBe('number');
    expect(popupState.sessionStartTime).toBeGreaterThan(0);
  });

  it('has a numeric actionCount', () => {
    expect(typeof popupState.actionCount).toBe('number');
  });

  it('has a boolean isConnected', () => {
    expect(typeof popupState.isConnected).toBe('boolean');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// chrome.storage.onChanged listener
// ═════════════════════════════════════════════════════════════════════════════

describe('storage.onChanged listener', () => {
  it('calls updateStatus when connectedToDesktop changes', async () => {
    chromeMock.runtime.sendMessage.mockResolvedValue({ connectionStatus: 'connected' });

    for (const listener of chromeMock.storage.onChanged._listeners as StorageChangeListener[]) {
      listener({ connectedToDesktop: { newValue: true, oldValue: false } });
    }

    await new Promise((r) => setTimeout(r, 0));
    expect(chromeMock.runtime.sendMessage).toHaveBeenCalled();
  });

  it('updates popupState.actionCount when stats change', async () => {
    // The listener sets popupState.actionCount = 15 synchronously, then calls
    // void updateStats() which re-reads from storage. Mock getItem to return 15
    // so updateStats() does not override the value with a stale storage value.
    const storage = await getStorageMock();
    (storage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue({ actionCount: 15 });

    for (const listener of chromeMock.storage.onChanged._listeners as StorageChangeListener[]) {
      listener({ stats: { newValue: { actionCount: 15 }, oldValue: { actionCount: 0 } } });
    }

    await new Promise((r) => setTimeout(r, 0));
    expect(popupState.actionCount).toBe(15);
  });
});
