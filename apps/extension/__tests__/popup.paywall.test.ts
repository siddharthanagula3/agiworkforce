/**
 * Tests for the paywall card and tier display added to popup.ts.
 *
 * Covers:
 *   - showPaywallCard() renders a card with the correct title
 *   - Upgrade link contains correct URL with feature, tier, and from=ext-paywall
 *   - Dismiss button removes the card
 *   - Reason text is shown when present; hidden when absent
 *   - Repeated calls replace (not duplicate) the card
 *   - PAYWALL_HIT runtime message triggers showPaywallCard
 *   - updateTierDisplay() renders known tier labels
 *   - updateTierDisplay() hides the element when no tier is stored
 *
 * Architecture note: this file follows the same pattern as popup.test.ts —
 * build the DOM fixture BEFORE importing the module.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Chrome API stubs (vi.hoisted — runs before all imports)
// ---------------------------------------------------------------------------

type MessageListener = (message: unknown) => void;
type StorageChangeListener = (changes: Record<string, chrome.storage.StorageChange>) => void;

const chromeMock = vi.hoisted(() => {
  const msgListeners: MessageListener[] = [];
  const storageListeners: StorageChangeListener[] = [];

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
      query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com/', title: 'Ex' }]),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: {
        addListener: vi.fn((cb: StorageChangeListener) => storageListeners.push(cb)),
        _listeners: storageListeners,
      },
    },
  };
  (globalThis as Record<string, unknown>).chrome = mock;
  return mock;
});

// ---------------------------------------------------------------------------
// Mock storageUtils
// ---------------------------------------------------------------------------

vi.mock('../src/utils', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  storageUtils: {
    getItem: vi.fn().mockResolvedValue(undefined),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

// ---------------------------------------------------------------------------
// DOM fixture
// ---------------------------------------------------------------------------

function buildPopupDom(): void {
  document.body.innerHTML = `
    <div class="header">
      <h1>AGI Workforce</h1>
    </div>
    <div class="content">
      <div class="status-card" id="statusCard">
        <div class="status-info">
          <div class="status-title" id="statusTitle">--</div>
          <div class="status-subtitle" id="statusSubtitle">--</div>
          <button class="reconnect-btn" id="reconnectBtn">Reconnect</button>
        </div>
      </div>
      <div class="actions">
        <button id="sidePanelBtn">Open Chat</button>
        <button id="captureBtn">Capture</button>
        <button id="refreshBtn">Refresh</button>
        <button id="groupBtn">Group Tab</button>
      </div>
      <div class="stats-grid">
        <div><span id="tabCount">-</span></div>
        <div><span id="actionCount">-</span></div>
        <div><span id="sessionTime">-</span></div>
      </div>
      <div class="divider"></div>
      <div class="info-section">
        <div id="tabId">-</div>
        <div id="currentUrl">-</div>
        <span id="extVersion">v…</span>
        <span id="userTier" hidden></span>
      </div>
    </div>
  `;
}

// Build DOM before module import
buildPopupDom();

// ---------------------------------------------------------------------------
// Import after DOM + mocks
// ---------------------------------------------------------------------------

import {
  showPaywallCard,
  updateTierDisplay,
  TIER_LABELS,
  PAYWALL_FEATURE_LABELS,
  REQUIRED_TIER_LABELS,
} from '../src/popup.ts';
import type { storageUtils as StorageUtilsType } from '../src/utils';

// ---------------------------------------------------------------------------
// Retrieve live mock references
// ---------------------------------------------------------------------------

async function getStorageMock(): Promise<typeof StorageUtilsType> {
  const mod = await import('../src/utils');
  return mod.storageUtils;
}

async function waitForInit(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await new Promise<void>((r) => setTimeout(r, 4));
    if ((chromeMock.runtime.onMessage._listeners as MessageListener[]).length > 0) break;
  }
}

beforeAll(async () => {
  await waitForInit();
});

beforeEach(async () => {
  buildPopupDom();
  vi.clearAllMocks();
  chromeMock.runtime.sendMessage.mockResolvedValue({ connectionStatus: 'disconnected' });
  chromeMock.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com/', title: 'Ex' }]);
  const storage = await getStorageMock();
  (storage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// showPaywallCard — DOM structure
// ---------------------------------------------------------------------------

describe('showPaywallCard — DOM structure', () => {
  it('inserts a #paywallCard element into the DOM', () => {
    showPaywallCard('token_cap', 'pro');
    expect(document.getElementById('paywallCard')).not.toBeNull();
  });

  it('inserts the card before the .actions section', () => {
    showPaywallCard('token_cap', 'pro');
    const card = document.getElementById('paywallCard')!;
    const actions = document.querySelector('.actions')!;
    // card should appear before actions in document order
    expect(card.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders the correct feature label in the title', () => {
    showPaywallCard('token_cap', 'pro');
    const title = document.querySelector('.paywall-title')!;
    expect(title.textContent).toContain(PAYWALL_FEATURE_LABELS['token_cap']);
  });

  it('renders the correct required tier label in the title', () => {
    showPaywallCard('token_cap', 'pro');
    const title = document.querySelector('.paywall-title')!;
    expect(title.textContent).toContain(REQUIRED_TIER_LABELS['pro']);
  });

  it('shows the reason text when reason is provided', () => {
    showPaywallCard('image_quota', 'hobby', '10/10 images used this month');
    const reasonEl = document.querySelector('.paywall-reason') as HTMLElement | null;
    expect(reasonEl).not.toBeNull();
    expect(reasonEl!.textContent).toBe('10/10 images used this month');
    expect(reasonEl!.hasAttribute('hidden')).toBe(false);
  });

  it('hides the reason element when reason is not provided', () => {
    showPaywallCard('web_search', 'pro');
    const reasonEl = document.querySelector('.paywall-reason') as HTMLElement | null;
    expect(reasonEl).not.toBeNull();
    expect(reasonEl!.hasAttribute('hidden')).toBe(true);
  });

  it('renders an upgrade link with correct href query params', () => {
    showPaywallCard('video_generation', 'pro_plus', 'Video generation requires Pro+');
    const link = document.querySelector('.paywall-upgrade-btn') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    const href = link!.href;
    const url = new URL(href);
    expect(url.origin).toBe('https://agiworkforce.com');
    expect(url.pathname).toBe('/pricing');
    expect(url.searchParams.get('from')).toBe('ext-paywall');
    expect(url.searchParams.get('tier')).toBe('pro_plus');
    expect(url.searchParams.get('feature')).toBe('video_generation');
  });

  it('opens upgrade link in a new tab (target=_blank, rel=noopener)', () => {
    showPaywallCard('token_cap', 'max');
    const link = document.querySelector('.paywall-upgrade-btn') as HTMLAnchorElement | null;
    expect(link!.target).toBe('_blank');
    expect(link!.rel).toContain('noopener');
  });

  it('renders a dismiss button labelled "Try later"', () => {
    showPaywallCard('token_cap', 'pro');
    const dismissBtn = document.querySelector('.paywall-dismiss-btn') as HTMLButtonElement | null;
    expect(dismissBtn).not.toBeNull();
    expect(dismissBtn!.textContent).toBe('Try later');
  });
});

// ---------------------------------------------------------------------------
// showPaywallCard — dismiss behaviour
// ---------------------------------------------------------------------------

describe('showPaywallCard — dismiss', () => {
  it('removes the card from the DOM when dismiss is clicked', () => {
    showPaywallCard('token_cap', 'pro');
    const dismissBtn = document.querySelector('.paywall-dismiss-btn') as HTMLButtonElement;
    dismissBtn.click();
    expect(document.getElementById('paywallCard')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// showPaywallCard — idempotency
// ---------------------------------------------------------------------------

describe('showPaywallCard — idempotency', () => {
  it('replaces an existing paywall card instead of adding a second one', () => {
    showPaywallCard('token_cap', 'pro');
    showPaywallCard('image_quota', 'hobby', 'second call');
    const cards = document.querySelectorAll('#paywallCard');
    expect(cards).toHaveLength(1);
    // The new card's title should reflect the second call
    const title = document.querySelector('.paywall-title')!;
    expect(title.textContent).toContain(PAYWALL_FEATURE_LABELS['image_quota']);
  });
});

// ---------------------------------------------------------------------------
// PAYWALL_HIT message listener
// ---------------------------------------------------------------------------

describe('PAYWALL_HIT runtime message triggers showPaywallCard', () => {
  it('renders a paywall card when PAYWALL_HIT message is received', () => {
    const listeners = chromeMock.runtime.onMessage._listeners as MessageListener[];
    for (const listener of listeners) {
      listener({
        type: 'PAYWALL_HIT',
        feature: 'mcp',
        requiredTier: 'pro',
        reason: 'MCP requires Pro',
      });
    }
    const card = document.getElementById('paywallCard');
    expect(card).not.toBeNull();
    expect(document.querySelector('.paywall-title')!.textContent).toContain(
      PAYWALL_FEATURE_LABELS['mcp'],
    );
  });

  it('does NOT render a paywall card for non-PAYWALL_HIT messages', () => {
    const listeners = chromeMock.runtime.onMessage._listeners as MessageListener[];
    for (const listener of listeners) {
      listener({ type: 'SOME_UNRELATED_MESSAGE', data: 42 });
    }
    expect(document.getElementById('paywallCard')).toBeNull();
  });

  it('passes the reason field through to the rendered card', () => {
    const listeners = chromeMock.runtime.onMessage._listeners as MessageListener[];
    const reason = 'Video generation blocked on Hobby tier';
    for (const listener of listeners) {
      listener({
        type: 'PAYWALL_HIT',
        feature: 'video_generation',
        requiredTier: 'pro_plus',
        reason,
      });
    }
    const reasonEl = document.querySelector('.paywall-reason') as HTMLElement;
    expect(reasonEl.textContent).toBe(reason);
  });
});

// ---------------------------------------------------------------------------
// updateTierDisplay
// ---------------------------------------------------------------------------

describe('updateTierDisplay', () => {
  it('renders the tier label in #userTier and removes hidden attr when tier is stored', async () => {
    const storage = await getStorageMock();
    (storage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('pro');
    await updateTierDisplay();
    const tierEl = document.getElementById('userTier') as HTMLElement;
    expect(tierEl.textContent).toBe(TIER_LABELS['pro']);
    expect(tierEl.hasAttribute('hidden')).toBe(false);
  });

  it('renders "Hobby" for tier value "hobby"', async () => {
    const storage = await getStorageMock();
    (storage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('hobby');
    await updateTierDisplay();
    expect(document.getElementById('userTier')!.textContent).toBe('Hobby');
  });

  it('renders "Pro+" for tier value "pro_plus"', async () => {
    const storage = await getStorageMock();
    (storage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('pro_plus');
    await updateTierDisplay();
    expect(document.getElementById('userTier')!.textContent).toBe('Pro+');
  });

  it('renders "Max" for tier value "max"', async () => {
    const storage = await getStorageMock();
    (storage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('max');
    await updateTierDisplay();
    expect(document.getElementById('userTier')!.textContent).toBe('Max');
  });

  it('hides #userTier when no tier is stored', async () => {
    const storage = await getStorageMock();
    (storage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await updateTierDisplay();
    expect(document.getElementById('userTier')!.hasAttribute('hidden')).toBe(true);
  });

  it('hides #userTier when storageUtils.getItem throws', async () => {
    const storage = await getStorageMock();
    (storage.getItem as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Storage error'));
    await updateTierDisplay();
    expect(document.getElementById('userTier')!.hasAttribute('hidden')).toBe(true);
  });

  it('falls back to raw tier value when tier is not in TIER_LABELS', async () => {
    const storage = await getStorageMock();
    (storage.getItem as ReturnType<typeof vi.fn>).mockResolvedValue('enterprise');
    await updateTierDisplay();
    expect(document.getElementById('userTier')!.textContent).toBe('enterprise');
  });
});

// ---------------------------------------------------------------------------
// Upgrade URL construction — parametric coverage
// ---------------------------------------------------------------------------

describe('showPaywallCard — upgrade URL coverage', () => {
  const cases: Array<[string, string]> = [
    ['video_generation', 'pro_plus'],
    ['opus_4_7', 'pro_plus'],
    ['gpt_5_5', 'pro_plus'],
    ['computer_use', 'pro'],
    ['deep_research', 'max'],
    ['image_quota', 'hobby'],
    ['token_cap', 'pro'],
    ['mcp', 'pro'],
    ['web_search', 'hobby'],
  ];

  for (const [feature, tier] of cases) {
    it(`builds a correct upgrade URL for feature=${feature} tier=${tier}`, () => {
      showPaywallCard(feature, tier);
      const link = document.querySelector('.paywall-upgrade-btn') as HTMLAnchorElement;
      const url = new URL(link.href);
      expect(url.searchParams.get('feature')).toBe(feature);
      expect(url.searchParams.get('tier')).toBe(tier);
      expect(url.searchParams.get('from')).toBe('ext-paywall');
    });
  }
});
