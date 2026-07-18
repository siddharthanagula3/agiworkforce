import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { WebSettingsModal } from './WebSettingsModal';

/**
 * WebSettingsModal adapter honesty (founder spec 2026-07-10 + known-flaws
 * WEB-CONNECTORS row):
 *   - connected state comes ONLY from real sources: active user_connectors
 *     rows (GET /api/connectors) and GitHub App installations
 *     (GET /api/github/installations) — github cannot have a user_connectors
 *     row, the installation IS its real signal;
 *   - no catalog Connect buttons anywhere (POST /api/connectors 501s every
 *     non-local catalog connector, so a Connect button would be a dead control);
 *   - custom remote MCP connectors use their real persisted
 *     POST /api/connectors/custom flow;
 *   - local-only (exclusive) connectors never render on web.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/chat',
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(async () => 'csrf-token'),
}));

// Section components pull in stores/Clerk/etc.; the connectors pane under
// test is adapter-driven inside the shared shell, so stub the rest.
vi.mock('../sections/GeneralSection', () => ({ GeneralSection: () => null }));
vi.mock('../sections/AccountSection', () => ({ AccountSection: () => null }));
vi.mock('../sections/SecuritySection', () => ({ SecuritySection: () => null }));
vi.mock('../sections/PrivacySection', () => ({ PrivacySection: () => null }));
vi.mock('../sections/BillingSection', () => ({ BillingSection: () => null }));
vi.mock('../sections/UsageSection', () => ({ UsageSection: () => null }));
vi.mock('../sections/CapabilitiesSection', () => ({ CapabilitiesSection: () => null }));
vi.mock('../sections/MemorySection', () => ({ MemorySection: () => null }));
vi.mock('../sections/NotificationsSection', () => ({ NotificationsSection: () => null }));

function stubFetch({
  connectors = [] as Array<{ connectorId: string; connectedAt?: string }>,
  installations = [] as Array<{ installation_id: number; created_at?: string }>,
  skills = [] as Array<{ name: string; description: string; source: string }>,
} = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/skills')) {
      return { ok: true, json: async () => ({ skills }) } as Response;
    }
    if (url.includes('/api/github/installations')) {
      return { ok: true, json: async () => ({ installations }) } as Response;
    }
    if (url.includes('/api/connectors')) {
      return { ok: true, json: async () => ({ connectors }) } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('WebSettingsModal connectors adapter (honest web semantics)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('marks connectors Connected only from real user_connectors rows', async () => {
    stubFetch({ connectors: [{ connectorId: 'notion', connectedAt: '2026-07-01T00:00:00Z' }] });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    const table = await screen.findByRole('table');
    const notionRow = within(table).getByText('Notion').closest('tr') as HTMLElement;
    await waitFor(() => expect(within(notionRow).getByText('Connected')).toBeTruthy());
  });

  it('marks GitHub Connected from real GitHub App installations (not user_connectors)', async () => {
    stubFetch({ installations: [{ installation_id: 42, created_at: '2026-06-01T00:00:00Z' }] });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    const table = await screen.findByRole('table');
    const githubRow = within(table).getByText('GitHub').closest('tr') as HTMLElement;
    await waitFor(() => expect(within(githubRow).getByText('Connected')).toBeTruthy());
  });

  it('never renders Connect buttons (no working connect flow on web) and hides local-only connectors', async () => {
    stubFetch();
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    await screen.findByRole('table');
    // POST /api/connectors 501s every non-local connector; a Connect button
    // would be a dead control, so none renders.
    expect(screen.queryByRole('button', { name: /^Connect / })).toBeNull();
    // Honest status labels instead.
    expect(screen.getAllByText('Not yet available on web').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Coming soon').length).toBeGreaterThan(0);
    // Local-only (exclusive) connectors cannot run on the cloud web server.
    expect(screen.queryByText('Local Filesystem')).toBeNull();
    expect(screen.queryByText('Terminal / Shell')).toBeNull();
  });

  it('persists custom connectors through the real custom MCP endpoint', async () => {
    const fetchMock = stubFetch();
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);
    await screen.findByRole('table');

    // Open Add > Add custom connector, fill valid values, submit.
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add custom connector' }));
    fireEvent.change(screen.getByPlaceholderText('My connector'), {
      target: { value: 'My MCP' },
    });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/mcp'), {
      target: { value: 'https://mcp.example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/connectors/custom',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': 'csrf-token',
          },
          body: JSON.stringify({ name: 'My MCP', url: 'https://mcp.example.com' }),
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByPlaceholderText('My connector')).toBeNull());
  });

  it('loads every real catalogue when the shared directory opens from Connectors', async () => {
    stubFetch({
      skills: [
        {
          name: 'release-notes',
          description: 'Draft release notes from verified changes.',
          source: 'builtin',
        },
      ],
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    await screen.findByRole('table');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Browse connectors' }));

    const tablist = screen.getByRole('tablist', { name: 'Directory sections' });
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Skills' }));
    expect(await screen.findByText('/release-notes')).toBeTruthy();

    fireEvent.click(within(tablist).getByRole('tab', { name: 'Plugins' }));
    expect(screen.getByText('GitHub Automation')).toBeTruthy();
    expect(screen.getAllByText('Catalogue preview').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /install github automation/i })).toBeNull();
  });
});
