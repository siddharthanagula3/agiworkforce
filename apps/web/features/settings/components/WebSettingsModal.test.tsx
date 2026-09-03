import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { WebSettingsModal } from './WebSettingsModal';
import { invalidateSkillsCatalog } from '@features/skills/services/skills-catalog';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/chat',
}));

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(async () => 'csrf-token'),
}));

const getTokenMock = vi.fn(async () => 'session-token');
vi.mock('@clerk/nextjs', () => ({ useAuth: () => ({ getToken: getTokenMock }) }));

vi.mock('../sections/GeneralSection', () => ({ GeneralSection: () => null }));
vi.mock('../sections/AccountSection', () => ({ AccountSection: () => null }));
vi.mock('../sections/TeamSection', () => ({ TeamSection: () => <div>Team settings content</div> }));
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
      category: 'Developer',
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
  connectorFailureStatus = 503,
  skillFailuresBeforeSuccess = 0,
  installationsFailuresBeforeSuccess = 0,
  installationsFailureStatus = 500,
  installationsFailureMode = 'status' as 'status' | 'invalid-schema' | 'json-throw',
} = {}) {
  let connectorRequests = 0;
  let skillRequests = 0;
  let pluginCatalogRequests = 0;
  let installationsRequests = 0;
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
      const shouldFail = installationsRequests < installationsFailuresBeforeSuccess;
      installationsRequests += 1;
      if (shouldFail) {
        if (installationsFailureMode === 'invalid-schema') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ installations: 'nope' }),
          } as Response;
        }
        if (installationsFailureMode === 'json-throw') {
          return {
            ok: true,
            status: 200,
            json: async () => {
              throw new SyntaxError('Unexpected end of JSON input');
            },
          } as unknown as Response;
        }
        return {
          ok: false,
          status: installationsFailureStatus,
          json: async () => ({ error: 'Failed to fetch installations' }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ installations }) } as Response;
    }
    if (url.includes('/api/connectors/custom')) {
      return { ok: true, json: async () => ({ connectors: [] }) } as Response;
    }
    if (url === '/api/connectors') {
      const shouldFail = connectorRequests < connectorFailuresBeforeSuccess;
      connectorRequests += 1;
      return {
        ok: !shouldFail,
        status: shouldFail ? connectorFailureStatus : 200,
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
    // The skills catalogue is deduped in module state, so without this a later
    // test reads the previous test's cached result instead of its own mock.
    invalidateSkillsCatalog();
  });

  it('marks connectors Connected only from real user_connectors rows', async () => {
    stubFetch({ connectors: [{ connectorId: 'notion', connectedAt: '2026-07-01T00:00:00Z' }] });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    const table = await screen.findByRole('table');
    const notionRow = within(table).getByText('Notion').closest('tr') as HTMLElement;
    await waitFor(() => expect(within(notionRow).getByText('Connected')).toBeTruthy());
  });

  it('keeps valid connector rows when one response field is malformed', async () => {
    stubFetch({
      connectors: [
        { connectorId: 'notion', connectedAt: null } as unknown as {
          connectorId: string;
          connectedAt?: string;
        },
      ],
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Notion')).toBeTruthy();
    expect(
      await screen.findByText(
        'Some connector data could not be read. Valid connectors remain available; retry to refresh.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Connectors returned data this page could not read.')).toBeNull();
  });

  it('marks GitHub Connected from real GitHub App installations (not user_connectors)', async () => {
    stubFetch({ installations: [{ installation_id: 42, created_at: '2026-06-01T00:00:00Z' }] });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    const table = await screen.findByRole('table');
    const githubRow = within(table).getByText('GitHub').closest('tr') as HTMLElement;
    await waitFor(() => expect(within(githubRow).getByText('Connected')).toBeTruthy());
  });

  it('renders no Connect buttons when the server reports nothing connectable, and hides local-only connectors', async () => {
    stubFetch();
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    await screen.findByText('Connect your first tool');
    expect(screen.getByRole('button', { name: 'Connect remote MCP server' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByPlaceholderText('Search connectors...')).toBeNull();
    expect(screen.queryByText('Notion')).toBeNull();
    expect(screen.queryByText('Coming soon')).toBeNull();
    expect(screen.queryByText('Local Filesystem')).toBeNull();
    expect(screen.queryByText('Terminal / Shell')).toBeNull();
  });

  it('renders a Connect button for GitHub when the server reports it available', async () => {
    stubFetch({ available: ['github'] });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    const table = await screen.findByRole('table');
    const githubRow = within(table).getByText('GitHub').closest('tr') as HTMLElement;
    await waitFor(() =>
      expect(within(githubRow).getByRole('button', { name: /^Connect/ })).toBeTruthy(),
    );
  });

  it('shows a secure-storage configuration failure on the connector row', async () => {
    const fetchMock = stubFetch({ available: ['notion'] });
    const readResponse = fetchMock.getMockImplementation()!;
    const message =
      'Connector authorization is unavailable because secure token storage is not configured. Contact your administrator.';
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === '/api/connectors' && init?.method === 'POST') {
        return Response.json({ error: message, connectorId: 'notion' }, { status: 503 });
      }
      return readResponse(input);
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    const { act, fireEvent } = await import('@testing-library/react');
    const connectButton = await screen.findByRole('button', { name: 'Connect Notion' });
    await act(async () => {
      fireEvent.click(connectButton);
    });

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect Notion' })).toBeEnabled();
    expect(screen.getByRole('tab', { name: /^Connected\s*0$/ })).toBeTruthy();
  });

  it('names the real cause instead of blaming the connection for a server fault', async () => {
    // A 5xx is the server failing, not the user's network. Telling them to
    // "check your connection" sends them to fix something that is not broken.
    stubFetch({ connectorFailuresBeforeSuccess: 1, connectorFailureStatus: 500 });
    const { unmount } = render(
      <WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />,
    );
    expect(await screen.findByText(/the server returned an error/)).toBeTruthy();
    expect(screen.queryByText(/Check your connection/)).toBeNull();
    unmount();

    // A 4xx that is not an auth failure is a rejected request, not a server fault.
    stubFetch({ connectorFailuresBeforeSuccess: 1, connectorFailureStatus: 400 });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);
    expect(await screen.findByText(/the server rejected the request/)).toBeTruthy();
    expect(screen.queryByText(/the server returned an error/)).toBeNull();
  });

  it('shows a connector loading failure and retries instead of pretending the directory is empty', async () => {
    stubFetch({ connectorFailuresBeforeSuccess: 1 });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    expect(
      await screen.findByText(
        'Connectors could not be loaded because the server returned an error. This is not a problem with your connection — retry, or contact support if it persists.',
      ),
    ).toBeTruthy();

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Connect your first tool')).toBeTruthy();
    expect(
      screen.queryByText(
        'Connectors could not be loaded because the server returned an error. This is not a problem with your connection — retry, or contact support if it persists.',
      ),
    ).toBeNull();
  });

  // known-flaws WEB-CONNECTORS-PANEL-ALL-OR-NOTHING-01: production served
  // /api/connectors and /api/connectors/custom 200 while
  // /api/github/installations 500'd, and the panel showed nothing but the
  // generic global error — even though the other 16 connectors had loaded
  // fine. Installations must degrade on its own from here on.
  it('renders the full connector list plus a scoped GitHub notice when only installations 500s', async () => {
    stubFetch({
      connectors: [{ connectorId: 'notion', connectedAt: '2026-07-01T00:00:00Z' }],
      available: ['notion', 'github'],
      installationsFailuresBeforeSuccess: Infinity,
      installationsFailureStatus: 500,
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Notion')).toBeTruthy();
    const notionRow = within(table).getByText('Notion').closest('tr') as HTMLElement;
    await waitFor(() => expect(within(notionRow).getByText('Connected')).toBeTruthy());

    // GitHub itself never claims to be connected off stale/absent data — its
    // row falls back to the ordinary Connect affordance, same as any other
    // available-but-not-yet-connected connector.
    const githubRow = within(table).getByText('GitHub').closest('tr') as HTMLElement;
    expect(within(githubRow).getByRole('button', { name: /^Connect/ })).toBeTruthy();

    expect(
      await screen.findByText(
        'GitHub app installations could not be loaded. GitHub may show as not connected here until this is retried.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        'Connectors could not be loaded because the server returned an error. This is not a problem with your connection — retry, or contact support if it persists.',
      ),
    ).toBeNull();
  });

  it.each([
    ['an invalid installations schema', 'invalid-schema'],
    ['an installations JSON parse failure', 'json-throw'],
  ] as const)('degrades to the scoped notice on %s', async (_label, mode) => {
    stubFetch({
      connectors: [{ connectorId: 'notion', connectedAt: '2026-07-01T00:00:00Z' }],
      available: ['notion', 'github'],
      installationsFailuresBeforeSuccess: Infinity,
      installationsFailureMode: mode,
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Notion')).toBeTruthy();
    expect(
      await screen.findByText(
        'GitHub app installations could not be loaded. GitHub may show as not connected here until this is retried.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        'Connectors could not be loaded because the server returned an error. This is not a problem with your connection — retry, or contact support if it persists.',
      ),
    ).toBeNull();
  });

  it('does not misreport a signed-out session when only installations 401s', async () => {
    stubFetch({
      available: ['notion', 'github'],
      installationsFailuresBeforeSuccess: Infinity,
      installationsFailureStatus: 401,
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    await screen.findByRole('table');
    expect(
      await screen.findByText(
        'GitHub app installations could not be loaded. GitHub may show as not connected here until this is retried.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        'Your session expired. Reload the page to sign back in, then reopen Connectors.',
      ),
    ).toBeNull();
  });

  it('still shows the global error when the core /api/connectors call itself fails, even if installations succeeds', async () => {
    stubFetch({ connectorFailuresBeforeSuccess: 1, connectorFailureStatus: 500 });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    expect(
      await screen.findByText(
        'Connectors could not be loaded because the server returned an error. This is not a problem with your connection — retry, or contact support if it persists.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(
      screen.queryByText('GitHub app installations could not be loaded.', { exact: false }),
    ).toBeNull();
  });

  it('persists custom connectors and their optional bearer token through the real custom MCP endpoint', async () => {
    const fetchMock = stubFetch();
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);
    await screen.findByText('Connect your first tool');

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
            Authorization: 'Bearer session-token',
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

  it('reaches per-tool connector permissions from the settings connector detail', async () => {
    stubFetch({
      connectors: [{ connectorId: 'notion', connectedAt: '2026-07-01T00:00:00Z' }],
      available: ['notion'],
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    const table = await screen.findByRole('table');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(within(table).getByText('Notion'));

    // The control only appears for a connector the user actually connected,
    // because there are no tools to govern until then.
    const trigger = await screen.findByText('Tool permissions');
    expect(trigger).toBeTruthy();
  });

  it('opens the real tri-state tool permissions dialog and persists a change to the API', async () => {
    const fetchMock = stubFetch({
      installations: [{ installation_id: 42, created_at: '2026-06-01T00:00:00Z' }],
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    const table = await screen.findByRole('table');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(within(table).getByText('GitHub'));

    fireEvent.click(await screen.findByText('Tool permissions'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('GitHub - Tool Permissions')).toBeTruthy();
    // Real catalog tools for this connector (lib/connectors/catalog.ts), not a
    // placeholder — proves the panel is driven by the actual tool metadata.
    expect(within(dialog).getByText('get_pull_request_diff')).toBeTruthy();
    expect(within(dialog).getByText('post_issue_comment')).toBeTruthy();
    expect(within(dialog).getByText('post_pull_request_review')).toBeTruthy();

    const diffGroup = within(dialog).getByRole('group', {
      name: 'Permission for get_pull_request_diff',
    });
    fireEvent.click(within(diffGroup).getByRole('button', { name: 'Allow' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/connectors/permissions',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            connectorId: 'github',
            toolName: 'get_pull_request_diff',
            level: 'allow',
          }),
        }),
      ),
    );
  });

  it('names an expired session instead of blaming the network when connectors 401', async () => {
    stubFetch({ connectorFailuresBeforeSuccess: 1, connectorFailureStatus: 401 });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    expect(
      await screen.findByText(
        'Your session expired. Reload the page to sign back in, then reopen Connectors.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        'Connectors could not be loaded because the server returned an error. This is not a problem with your connection — retry, or contact support if it persists.',
      ),
    ).toBeNull();
  });

  // All three sources are still requested every load — installations only
  // stopped gating the panel's success/failure, it did not stop being fetched.
  it('sends the Clerk bearer token with the connector directory requests', async () => {
    const fetchMock = stubFetch({});
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    await screen.findByText('Connect your first tool');
    for (const path of ['/api/connectors', '/api/github/installations', '/api/connectors/custom']) {
      expect(fetchMock).toHaveBeenCalledWith(
        path,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
        }),
      );
    }
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
      await screen.findByText(
        'Skills could not be loaded because the server returned an error. This is not a problem with your connection — retry, or contact support if it persists.',
      ),
    ).toBeTruthy();

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('fixture-reviewed-skill')).toBeTruthy();
    expect(
      screen.queryByText(
        'Skills could not be loaded because the server returned an error. This is not a problem with your connection — retry, or contact support if it persists.',
      ),
    ).toBeNull();
  });

  it('shows a plugin loading failure and retries instead of presenting a fake directory', async () => {
    stubFetch({ pluginFailuresBeforeSuccess: 1 });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="plugins" />);

    expect(
      await screen.findByText(
        'Plugins could not be loaded because the server returned an error. This is not a problem with your connection — retry, or contact support if it persists.',
      ),
    ).toBeTruthy();

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText(/No plugins installed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    expect(await screen.findByText('GitHub Automation')).toBeTruthy();
    expect(
      screen.queryByText(
        'Plugins could not be loaded because the server returned an error. This is not a problem with your connection — retry, or contact support if it persists.',
      ),
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

  it('lists Memory as its own top-level nav entry, not nested under Capabilities', () => {
    stubFetch();
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="general" />);

    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });
    expect(within(nav).getByRole('button', { name: 'Memory' })).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Capabilities' })).toBeTruthy();
  });

  it('marks the Memory nav entry current when the memory section is active', () => {
    stubFetch();
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="memory" />);

    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });
    expect(within(nav).getByRole('button', { name: 'Memory' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
