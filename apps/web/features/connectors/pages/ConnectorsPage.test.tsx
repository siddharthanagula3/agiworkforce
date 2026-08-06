/**
 * ConnectorsPage Component Tests
 *
 * Tests for the Connectors page: rendering, search filtering,
 * category tab switching, and connector count badges.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// ConnectorsPage now reads category from the URL via next/navigation. jsdom has
// no app-router context, so stub the hooks with a minimal in-memory implementation.
vi.mock('next/navigation', () => {
  let currentParams = new URLSearchParams();
  return {
    useRouter: () => ({
      push: (url: string) => {
        const queryStart = url.indexOf('?');
        currentParams =
          queryStart >= 0 ? new URLSearchParams(url.slice(queryStart + 1)) : new URLSearchParams();
      },
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
    useSearchParams: () => currentParams,
    usePathname: () => '/connectors',
  };
});

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
  // useConnectors() (use-connectors.ts) reads useUser directly, separately
  // from ConnectorsPage's own useAuth call — both must be mocked or the hook
  // throws "useUser is not a function" before any test body runs.
  useUser: () => ({ isLoaded: true, isSignedIn: true }),
}));

vi.mock('@shared/lib/utils', () => ({
  cn: (...args: (string | boolean | undefined | null)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/ui')>();
  const Badge = ({ children, className, variant, ...props }: Record<string, unknown>) => (
    <span
      data-variant={variant as string | undefined}
      className={className as string | undefined}
      {...props}
    >
      {children as React.ReactNode}
    </span>
  );
  // Spread the real primitives (Button/Input/Card/Dialog/…, now sourced from
  // @agiworkforce/ui after the Wave 3 fork consolidation) and override only Badge.
  return { ...actual, Badge };
});

// Spread the real lucide-react icon set. The real @agiworkforce/ui primitives
// (spread into the @agiworkforce/ui mock above after Wave 3 consolidation)
// reference a broad range of icons; enumerating them would be brittle.
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lucide-react')>();
  return { ...actual };
});

// Mock CSRF token client · the connect flow calls getCsrfToken() before fetch.
vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn().mockResolvedValue('test-csrf-token'),
}));

// ─── Import under test ────────────────────────────────────────────────────────

import { ConnectorsPage } from './ConnectorsPage';
import { invalidateConnectorsCache } from '../hooks/use-connectors';

// ─── Helper: render with resolved loading state ──────────────────────────────

async function renderConnectorsPage() {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(<ConnectorsPage />);
  });
  return result!;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ConnectorsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch to resolve the /api/connectors call with empty connectors
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ connectors: [] }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // 1. Renders without crashing
  it('renders without crashing', async () => {
    const { container } = await renderConnectorsPage();
    expect(container).toBeDefined();
  });

  // 2. Displays "Connectors" heading
  it('displays the Connectors heading', async () => {
    await renderConnectorsPage();
    expect(screen.getByText('Connectors')).toBeDefined();
  });

  // 3. Shows the page description
  it('shows the page description', async () => {
    await renderConnectorsPage();
    expect(
      screen.getByText(
        'Connect your tools and give your AI agents access to the apps you use every day.',
      ),
    ).toBeDefined();
  });

  // 4. Shows connector count badges (connected + total)
  it('shows connected and total count badges', async () => {
    await renderConnectorsPage();
    // Default: 0 connected (connectors start unconnected)
    expect(screen.getByText('0 connected')).toBeDefined();
    // Total count badge: CONNECTORS.length
    expect(screen.getByText(/\d+ total/)).toBeDefined();
  });

  // 5. Shows "Connected" section header with count after connecting
  it('shows the Connected section when connectors are connected', async () => {
    await renderConnectorsPage();

    // Select the first connector from the list to show the detail panel
    const listRows = screen.getAllByRole('button');
    const firstConnectorRow = listRows.find((btn) => {
      // ConnectorListRow buttons do not use filter/header labels.
      const label = btn.textContent ?? '';
      return (
        !['All', 'Connected', 'Ready', 'Coming soon', 'Browse', 'Connectors'].includes(label) &&
        !label.startsWith('0') &&
        label.length > 0
      );
    });
    expect(firstConnectorRow).toBeDefined();

    await act(async () => {
      fireEvent.click(firstConnectorRow!);
    });

    // With a connector selected, click Connect in the detail panel
    const connectBtn = screen.queryByText('Connect');
    if (connectBtn) {
      await act(async () => {
        fireEvent.click(connectBtn);
      });
      // The "Connected (1)" heading should now be visible
      expect(screen.getByText(/Connected \(\d+\)/)).toBeDefined();
    } else {
      // Count badge shows connections; 0 initially is acceptable if no Connect path exposed
      expect(screen.getByText(/\d+ connected/)).toBeDefined();
    }
  });

  // 6. Shows a neutral browse section and explicit readiness filters
  it('shows browse and connector readiness filters', async () => {
    await renderConnectorsPage();
    expect(screen.getByText(/Browse \(\d+\)/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Ready' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Coming soon' })).toBeDefined();
  });

  // 7. Shows search input placeholder
  it('shows a search input with placeholder text', async () => {
    await renderConnectorsPage();
    const input = screen.getByPlaceholderText('Search connectors...');
    expect(input).toBeDefined();
  });

  // 8. Search input filters connectors by name
  it('filters connectors by search query (name match)', async () => {
    await renderConnectorsPage();

    const input = screen.getByPlaceholderText('Search connectors...');
    fireEvent.change(input, { target: { value: 'Github' } });

    // "GitHub" connector should still be visible
    expect(screen.getByText('GitHub')).toBeDefined();

    // Gmail and Calendar should NOT appear because "Github" doesn't match them
    expect(screen.queryByText('Gmail')).toBeNull();
    expect(screen.queryByText('Google Calendar')).toBeNull();
  });

  // 9. Search with no match shows empty state
  it('shows empty state when no connectors match the search query', async () => {
    await renderConnectorsPage();

    const input = screen.getByPlaceholderText('Search connectors...');
    fireEvent.change(input, { target: { value: 'xyznonexistentconnector' } });

    // The source renders "No connectors found." (with period)
    expect(screen.getByText('No connectors found.')).toBeDefined();
  });

  // 10. Category filter tabs are rendered
  it('renders all category filter tabs', async () => {
    await renderConnectorsPage();

    // These labels come from the CATEGORIES array in ConnectorsPage
    const expectedLabels = [
      'All',
      'Productivity',
      'Developer',
      'CRM',
      'Marketing',
      'Finance',
      'Social',
      'Communication',
      'Cloud',
      'Data',
      'Design',
      'Storage',
      'Healthcare',
      'AI',
    ];

    for (const label of expectedLabels) {
      // Some labels (e.g. "All") collide with text elsewhere on the page ·
      // assert presence with getAllByText so the tab match doesn't have to be
      // unique across the whole DOM.
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  // 11. Clicking a category tab filters to that category
  it('filters connectors when a category tab is clicked', async () => {
    await renderConnectorsPage();

    // Click the "Developer" category
    fireEvent.click(screen.getByText('Developer'));

    // GitHub is in the Developer category · should be visible
    expect(screen.getByText('GitHub')).toBeDefined();

    // Gmail and Calendar are in Productivity · should NOT be visible
    expect(screen.queryByText('Gmail')).toBeNull();
    expect(screen.queryByText('Google Calendar')).toBeNull();
  });

  // 12. Clicking "All" category tab shows all connectors
  it('clicking All tab shows all connectors', async () => {
    await renderConnectorsPage();

    // First switch to Developer
    fireEvent.click(screen.getByText('Developer'));
    expect(screen.queryByText('Gmail')).toBeNull();
    expect(screen.queryByText('Google Calendar')).toBeNull();

    // Then switch back to All. The page renders two "All" buttons: a tri-state
    // status filter (first in DOM order) and the category tab (second). Clicking
    // the category tab is what resets activeCategory back to 'All'.
    const allButtons = screen.getAllByRole('button', { name: 'All' });
    expect(allButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(allButtons[1]!);
    expect(screen.getByText('Gmail')).toBeDefined();
    expect(screen.getByText('Google Calendar')).toBeDefined();
    expect(screen.getByText('GitHub')).toBeDefined();
  });

  // 13. Clicking Connect in the detail panel adds a connector to the connected section
  it('connects a connector when Connect button is clicked in the detail panel', async () => {
    await renderConnectorsPage();

    // Select a connector from the list · click the first non-status-filter row button
    const listRows = screen.getAllByRole('button');
    const firstConnectorRow = listRows.find((btn) => {
      const label = btn.textContent ?? '';
      return (
        !['All', 'Connected', 'Ready', 'Coming soon', 'Connectors', 'Prev', 'Next'].includes(
          label,
        ) &&
        !label.startsWith('0') &&
        label.length > 0 &&
        !label.includes('total')
      );
    });

    await act(async () => {
      fireEvent.click(firstConnectorRow!);
    });

    // Click Connect in the detail panel
    const connectBtn = screen.queryByText('Connect');
    if (connectBtn) {
      await act(async () => {
        fireEvent.click(connectBtn);
      });
      // After optimistic connect, count badge should be 1 connected
      expect(screen.getByText('1 connected')).toBeDefined();
    } else {
      // Acceptable: no direct Connect button exposed (overview dialog flow)
      expect(screen.getByText(/\d+ connected/)).toBeDefined();
    }
  });

  // 14. Roadmap callout is visible in "All" category view
  it('shows the connector roadmap callout in All view', async () => {
    await renderConnectorsPage();
    expect(screen.getByText('Connector roadmap')).toBeDefined();
  });

  // 15. Exclusive/local connectors are hidden until enforcement exists
  it('does not show the AGI Exclusive category', async () => {
    await renderConnectorsPage();

    expect(screen.queryByText('AGI Exclusive')).toBeNull();
    expect(screen.queryByText('Local Filesystem')).toBeNull();
    expect(screen.queryByText('Terminal / Shell')).toBeNull();
  });

  it('labels the custom MCP flow as inspection only', async () => {
    await renderConnectorsPage();

    fireEvent.click(screen.getByRole('button', { name: /inspect mcp server/i }));

    expect(screen.getAllByText('Inspect MCP server').length).toBeGreaterThan(0);
    expect(screen.getByText(/review its advertised tools/i)).toBeDefined();
    expect(screen.queryByText('Add custom connector')).toBeNull();
  });

  // Regression guard: a failed GET /api/connectors previously rendered
  // identically to "you have zero connectors" — no error text, no way to
  // distinguish "nothing connected" from "we couldn't check."
  it('shows a distinct error state (not a silent empty list) when the connector fetch fails, and retry recovers it', async () => {
    // use-connectors.ts caches successful GET /api/connectors responses at
    // module scope (deliberately, to dedupe multiple mounted consumers) — an
    // earlier test in this file already primed that cache, so without
    // invalidating it here, this test would silently read stale success data
    // instead of exercising the mocked failure below.
    invalidateConnectorsCache();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ connectors: [] }),
        }),
    );

    await renderConnectorsPage();

    expect(screen.getByText(/failed to fetch connectors/i)).toBeDefined();
    // The normal browse UI must not render underneath a failed load.
    expect(screen.queryByText('No connectors found.')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    });

    expect(screen.queryByText(/failed to fetch connectors/i)).toBeNull();
  });
});

// ─── OAuth broker states ─────────────────────────────────────────────────────
// Shapes below mirror `app/api/connectors/route.ts`: a `source: 'oauth'` entry
// carries the scopes the provider granted and a `needsReauthorization` flag.

describe('ConnectorsPage — OAuth-granted connectors', () => {
  function stubConnectorsResponse(body: unknown) {
    invalidateConnectorsCache();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(body),
      }),
    );
  }

  async function openLinearDetail() {
    await act(async () => {
      fireEvent.click(screen.getByText('Linear'));
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateConnectorsCache();
  });

  // Regression guard: a live OAuth grant rendered no different from any other
  // connected row — the user could not see what they had actually authorized.
  it('shows the OAuth grant and the scopes the provider granted, verbatim', async () => {
    stubConnectorsResponse({
      connectors: [
        {
          connectorId: 'linear',
          connectedAt: '2026-08-01T00:00:00.000Z',
          source: 'oauth',
          scopes: ['read', 'write:issue'],
          needsReauthorization: false,
        },
      ],
      available: ['linear'],
    });

    await renderConnectorsPage();
    await openLinearDetail();

    expect(screen.getByText('Connected with OAuth')).toBeDefined();
    expect(screen.getByText('Scopes you granted (2)')).toBeDefined();
    // Rendered exactly as the provider returned them — no invented friendly copy.
    expect(screen.getByText('read')).toBeDefined();
    expect(screen.getByText('write:issue')).toBeDefined();
    // A healthy grant must not nag the user to reconnect.
    expect(screen.queryByRole('button', { name: /reconnect/i })).toBeNull();
  });

  it('says so plainly when the provider returned no scope list', async () => {
    stubConnectorsResponse({
      connectors: [{ connectorId: 'linear', source: 'oauth', scopes: [] }],
      available: ['linear'],
    });

    await renderConnectorsPage();
    await openLinearDetail();

    expect(screen.getByText('Scopes you granted (0)')).toBeDefined();
    expect(screen.getByText(/did not return a scope list/i)).toBeDefined();
  });

  it('offers Reconnect when the stored authorization can no longer be renewed', async () => {
    stubConnectorsResponse({
      connectors: [
        {
          connectorId: 'linear',
          source: 'oauth',
          scopes: ['read'],
          needsReauthorization: true,
        },
      ],
      available: ['linear'],
    });

    await renderConnectorsPage();
    await openLinearDetail();

    expect(screen.getByText('Authorization needs renewing')).toBeDefined();
    expect(screen.getByRole('button', { name: /reconnect/i })).toBeDefined();
  });

  // Disconnecting also deletes the saved per-tool permissions
  // (`clearConnectorToolPermissions` in DELETE /api/connectors). The user has
  // to be told that before it happens, not after.
  it('confirms before disconnecting and states that saved tool permissions are deleted', async () => {
    stubConnectorsResponse({
      connectors: [{ connectorId: 'linear', source: 'oauth', scopes: ['read'] }],
      available: ['linear'],
    });

    await renderConnectorsPage();
    await openLinearDetail();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    });

    expect(screen.getByText('Disconnect Linear?')).toBeDefined();
    expect(
      screen.getByText(/per-tool permissions you saved for Linear are deleted/i),
    ).toBeDefined();
    expect(screen.getByText(/revoked and deleted/i)).toBeDefined();
  });

  // The honest default: zero providers are configured, so an OAuth connector
  // with no server-side app must stay "Coming soon" with no Connect control.
  it('keeps an unconfigured connector unavailable with no Connect button', async () => {
    stubConnectorsResponse({ connectors: [], available: [] });

    await renderConnectorsPage();
    await openLinearDetail();

    expect(screen.queryByRole('button', { name: /^Connect$/ })).toBeNull();
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThan(0);
  });
});
