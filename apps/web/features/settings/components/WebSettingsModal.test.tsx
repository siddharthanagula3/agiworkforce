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
 *   - catalog Connect buttons render only for ids the server reports as
 *     available; preview-only rows stay in the Browse directory;
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
vi.mock('../sections/TeamSection', () => ({ TeamSection: () => <div>Team settings content</div> }));
// The Team section also renders the organization's SHARED ecosystem (0086).
// Stubbed here for the same reason every other section is: this file tests the
// modal's section routing, not the sections themselves. Its own behaviour is
// covered by OrganizationSharingSection.test.tsx.
vi.mock('../sections/OrganizationSharingSection', () => ({
  OrganizationSharingSection: () => <div>Organization sharing content</div>,
}));
vi.mock('../sections/SecuritySection', () => ({ SecuritySection: () => null }));
vi.mock('../sections/SafetySection', () => ({ SafetySection: () => null }));
vi.mock('../sections/PrivacySection', () => ({ PrivacySection: () => null }));
vi.mock('../sections/ArchivedChatsSection', () => ({ ArchivedChatsSection: () => null }));
vi.mock('../sections/SharedLinksSection', () => ({ SharedLinksSection: () => null }));
vi.mock('../sections/BillingSection', () => ({ BillingSection: () => null }));
vi.mock('../sections/UsageSection', () => ({ UsageSection: () => null }));
vi.mock('../sections/CapabilitiesSection', () => ({ CapabilitiesSection: () => null }));
vi.mock('../sections/MemorySection', () => ({ MemorySection: () => null }));
vi.mock('../sections/NotificationsSection', () => ({ NotificationsSection: () => null }));
vi.mock('../sections/TimeFocusSection', () => ({
  TimeFocusSection: () => <div>Time and focus settings content</div>,
}));
vi.mock('../sections/ReflectSection', () => ({
  ReflectSection: () => <div>Reflect settings content</div>,
}));

function stubFetch({
  connectors = [] as Array<{ connectorId: string; connectedAt?: string }>,
  installations = [] as Array<{ installation_id: number; created_at?: string }>,
  skills = [] as Array<{
    name: string;
    description: string;
    source: string;
    lifecycle?: 'included' | 'draft';
    downloadable?: boolean;
  }>,
  plugins = [
    {
      id: 'github-automation',
      name: 'GitHub Automation',
      description: 'Pull request and issue workflows.',
      status: 'preview' as const,
      webInstallable: false,
      publisher: { name: 'AGI' },
      declaredSkills: ['Code Review'],
      distribution: null,
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ],
  pluginFailuresBeforeSuccess = 0,
  available = [] as string[],
  connectorFailuresBeforeSuccess = 0,
  skillFailuresBeforeSuccess = 0,
} = {}) {
  let connectorRequests = 0;
  let skillRequests = 0;
  let pluginCatalogRequests = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/skills')) {
      const shouldFail = skillRequests < skillFailuresBeforeSuccess;
      skillRequests += 1;
      return {
        ok: !shouldFail,
        status: shouldFail ? 503 : 200,
        json: async () => ({
          skills: skills.map((skill) => ({
            ...skill,
            lifecycle: skill.lifecycle ?? 'included',
            downloadable: skill.downloadable ?? false,
          })),
        }),
      } as Response;
    }
    if (url.includes('/api/plugins/installations')) {
      return { ok: true, json: async () => ({ installations: [] }) } as Response;
    }
    if (url.includes('/api/plugins')) {
      const shouldFail = pluginCatalogRequests < pluginFailuresBeforeSuccess;
      pluginCatalogRequests += 1;
      return {
        ok: !shouldFail,
        status: shouldFail ? 503 : 200,
        json: async () => ({ entries: plugins, total: plugins.length }),
      } as Response;
    }
    if (url.includes('/api/github/installations')) {
      return { ok: true, json: async () => ({ installations }) } as Response;
    }
    if (url.includes('/api/connectors/custom')) {
      return { ok: true, json: async () => ({ connectors: [] }) } as Response;
    }
    if (url === '/api/connectors') {
      const shouldFail = connectorRequests < connectorFailuresBeforeSuccess;
      connectorRequests += 1;
      return {
        ok: !shouldFail,
        status: shouldFail ? 503 : 200,
        json: async () => ({ connectors, available }),
      } as Response;
    }
    if (url.includes('/api/connectors')) {
      return { ok: true, json: async () => ({ connectors, available }) } as Response;
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

  it('renders no Connect buttons when the server reports nothing connectable, and hides local-only connectors', async () => {
    stubFetch(); // available: [] — nothing connectable
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    await screen.findByText('Connect your first tool');
    // The generic custom-MCP action is real, but no branded connector is
    // offered unless the server advertises it as available.
    expect(screen.getByRole('button', { name: 'Connect remote MCP server' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByPlaceholderText('Search connectors...')).toBeNull();
    // Preview-only rows stay in Browse rather than becoming dead operational
    // rows in the primary settings pane.
    expect(screen.queryByText('Notion')).toBeNull();
    expect(screen.queryByText('Coming soon')).toBeNull();
    // Local-only (exclusive) connectors cannot run on the cloud web server.
    expect(screen.queryByText('Local Filesystem')).toBeNull();
    expect(screen.queryByText('Terminal / Shell')).toBeNull();
  });

  it('renders a Connect button for GitHub when the server reports it available', async () => {
    // GitHub App configured → GET /api/connectors reports github connectable.
    stubFetch({ available: ['github'] });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    const table = await screen.findByRole('table');
    const githubRow = within(table).getByText('GitHub').closest('tr') as HTMLElement;
    await waitFor(() =>
      expect(within(githubRow).getByRole('button', { name: /^Connect/ })).toBeTruthy(),
    );
  });

  it('shows a connector loading failure and retries instead of pretending the directory is empty', async () => {
    stubFetch({ connectorFailuresBeforeSuccess: 1 });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    expect(
      await screen.findByText(
        'Connectors could not be loaded. Check your connection and try again.',
      ),
    ).toBeTruthy();

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Connect your first tool')).toBeTruthy();
    expect(
      screen.queryByText('Connectors could not be loaded. Check your connection and try again.'),
    ).toBeNull();
  });

  it('persists custom connectors and their optional bearer token through the real custom MCP endpoint', async () => {
    const fetchMock = stubFetch();
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);
    await screen.findByText('Connect your first tool');

    // Open Add > Add custom connector, fill valid values, submit.
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: 'Connect remote MCP server' }));
    fireEvent.change(screen.getByPlaceholderText('My connector'), {
      target: { value: 'My MCP' },
    });
    fireEvent.change(screen.getByPlaceholderText('https://example.com/mcp'), {
      target: { value: 'https://mcp.example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Token is encrypted before storage'), {
      target: { value: 'secret-token' },
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
          body: JSON.stringify({
            name: 'My MCP',
            url: 'https://mcp.example.com',
            authToken: 'secret-token',
          }),
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
          source: 'bundled',
          downloadable: true,
        },
      ],
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    await screen.findByText('Connect your first tool');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Browse connectors' }));

    const tablist = screen.getByRole('tablist', { name: 'Directory sections' });
    fireEvent.click(within(tablist).getByRole('tab', { name: 'Skills' }));
    expect(await screen.findByText('/release-notes')).toBeTruthy();
    expect(screen.getByText('Included')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Download release-notes SKILL.md' })).toBeTruthy();

    fireEvent.click(within(tablist).getByRole('tab', { name: 'Plugins' }));
    expect(await screen.findByText('GitHub Automation')).toBeTruthy();
    expect(screen.getAllByText('Coming later').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /install github automation/i })).toBeNull();
  });

  it('shows a skills loading failure and retries instead of presenting an empty environment', async () => {
    stubFetch({
      skillFailuresBeforeSuccess: 1,
      skills: [
        {
          name: 'fixture-reviewed-skill',
          description: 'A reviewed fixture skill.',
          source: 'bundled',
        },
      ],
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="skills" />);

    expect(
      await screen.findByText('Skills could not be loaded. Check your connection and try again.'),
    ).toBeTruthy();

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('fixture-reviewed-skill')).toBeTruthy();
    expect(
      screen.queryByText('Skills could not be loaded. Check your connection and try again.'),
    ).toBeNull();
  });

  it('shows a plugin loading failure and retries instead of presenting a fake directory', async () => {
    stubFetch({ pluginFailuresBeforeSuccess: 1 });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="plugins" />);

    expect(
      await screen.findByText('Plugins could not be loaded. Check your connection and try again.'),
    ).toBeTruthy();

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText(/No plugins installed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    expect(await screen.findByText('GitHub Automation')).toBeTruthy();
    expect(
      screen.queryByText('Plugins could not be loaded. Check your connection and try again.'),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: /install/i })).toBeNull();
  });

  it('renders the account-backed Time and focus section from the shared settings nav', () => {
    stubFetch();
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="time-focus" />);

    expect(screen.getByText('Time and focus settings content')).toBeTruthy();
  });

  it('renders the account-backed Reflect section from the shared settings nav', () => {
    stubFetch();
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="reflect" />);

    expect(screen.getByText('Reflect settings content')).toBeTruthy();
  });

  it('renders the Team administration section from the shared settings nav', () => {
    stubFetch();
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="team" />);

    expect(screen.getByText('Team settings content')).toBeTruthy();
  });
});
