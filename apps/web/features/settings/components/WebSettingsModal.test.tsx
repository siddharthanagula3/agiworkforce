import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { WebSettingsModal } from './WebSettingsModal';
import { invalidateSkillsCatalog } from '@features/skills/services/skills-catalog';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/chat',
}));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
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

async function findConnectedGlyph(name: string) {
  const card = (await screen.findByRole('button', { name })).closest('.group') as HTMLElement;
  return within(card).findByRole('img', { name: 'Connected' });
}

function stubFetch({
  connectors = [] as Array<{
    connectorId: string;
    connectedAt?: string;
    needsReauthorization?: boolean;
  }>,
  installations = [] as Array<{ installation_id: number; created_at?: string }>,
  skills = [] as Array<{
    name: string;
    description: string;
    source: string;
    lifecycle?: 'included' | 'draft';
    downloadable?: boolean;
    editable?: boolean;
  }>,
  canAuthorSkills = false,
  installedSkillNames = [] as string[],
  skillCatalogFailAttempts = [] as number[],
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
  pluginCatalogFailAttempts = [] as number[],
  available = [] as string[],
  connectorFailuresBeforeSuccess = 0,
  connectorFailureStatus = 503,
  installationsFailuresBeforeSuccess = 0,
  installationsFailureStatus = 500,
  installationsFailureMode = 'status' as 'status' | 'invalid-schema' | 'json-throw',
} = {}) {
  let connectorRequests = 0;
  let skillCatalogAttempt = 0;
  let pluginCatalogAttempt = 0;
  let installationsRequests = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/skills/installs') {
      return {
        ok: true,
        status: 200,
        json: async () => ({ installed: installedSkillNames }),
      } as Response;
    }
    if (url === '/api/skills?catalog=all') {
      skillCatalogAttempt += 1;
      const shouldFail = skillCatalogFailAttempts.includes(skillCatalogAttempt);
      return {
        ok: !shouldFail,
        status: shouldFail ? 503 : 200,
        json: async () => ({
          skills: skills.map((skill) => ({
            ...skill,
            lifecycle: skill.lifecycle ?? 'included',
            downloadable: skill.downloadable ?? false,
          })),
          canAuthorSkills,
        }),
      } as Response;
    }
    if (url.includes('/api/skills')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          skills: skills.map((skill) => ({
            ...skill,
            lifecycle: skill.lifecycle ?? 'included',
            downloadable: skill.downloadable ?? false,
          })),
          canAuthorSkills,
        }),
      } as Response;
    }
    if (url.includes('/api/plugins/marketplaces/entries')) {
      return { ok: true, status: 200, json: async () => ({ entries: [] }) } as Response;
    }
    if (url.includes('/api/plugins/marketplace-installations')) {
      return { ok: true, status: 200, json: async () => ({ installations: [] }) } as Response;
    }
    if (url.includes('/api/plugins/marketplaces')) {
      return { ok: true, status: 200, json: async () => ({ sources: [] }) } as Response;
    }
    if (url.includes('/api/plugins/installations')) {
      return { ok: true, json: async () => ({ installations: [] }) } as Response;
    }
    if (url.includes('/api/plugins')) {
      const isLegacyPluginRequest = init?.credentials === 'include';
      const isMarketplacePage = url.includes('source=marketplace');
      if (!isLegacyPluginRequest && isMarketplacePage) {
        pluginCatalogAttempt += 1;
        if (pluginCatalogFailAttempts.includes(pluginCatalogAttempt)) {
          return { ok: false, status: 503, json: async () => ({}) } as Response;
        }
      }
      const entries = isLegacyPluginRequest || url.includes('source=partner') ? plugins : [];
      return {
        ok: true,
        status: 200,
        json: async () => ({ entries, total: entries.length }),
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

// The directory adapter snapshots the parent's connector state (canConnect,
// connected ids, connectorsError/Notice) the moment its section first mounts.
// Mounting straight on "connectors" races WebSettingsModal's own
// /api/connectors + /api/github/installations + /api/connectors/custom
// fetch against the directory panel's own fetch, and the loser's snapshot is
// never retaken. Settling here first, then navigating, avoids that race.
async function settleParentConnectorState() {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function openConnectorsSection() {
  const nav = screen.getByRole('navigation', { name: 'Settings navigation' });
  fireEvent.click(within(nav).getByRole('button', { name: 'Connectors' }));
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

    fireEvent.click(await screen.findByRole('button', { name: 'Notion' }));
    expect(await screen.findByText('Connected')).toBeTruthy();
  });

  // The Connectors nav row carries a red count badge for connectors needing
  // reauthorization (title/aria-label explain the count), but nothing named
  // which connector it was about once you opened the panel it points at.
  it('names the connector a reconnect badge is about, on its own card', async () => {
    stubFetch({
      connectors: [
        { connectorId: 'notion', connectedAt: '2026-07-01T00:00:00Z', needsReauthorization: true },
      ],
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="general" />);
    await settleParentConnectorState();

    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });
    const connectorsNavButton = within(nav)
      .getByTitle('1 connector needs to be reconnected')
      .closest('button')!;
    expect(connectorsNavButton).toHaveTextContent('Connectors');

    fireEvent.click(connectorsNavButton);

    expect(await screen.findByRole('button', { name: 'Notion' })).toBeTruthy();
    expect(await screen.findByText('Needs to be reconnected.')).toBeTruthy();
  });

  it('leaves a healthy connector without a reconnect message', async () => {
    stubFetch({ connectors: [{ connectorId: 'notion', connectedAt: '2026-07-01T00:00:00Z' }] });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    expect(await screen.findByRole('button', { name: 'Notion' })).toBeTruthy();
    expect(screen.queryByText('Needs to be reconnected.')).toBeNull();
  });

  it('keeps a no-endpoint, unconfigured connector out of the table instead of ever labeling it "Coming soon"', async () => {
    stubFetch({ connectors: [{ connectorId: 'notion', connectedAt: '2026-07-01T00:00:00Z' }] });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    expect(await findConnectedGlyph('Notion')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Slack' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect Slack' })).toBeNull();
    expect(screen.queryByText('Coming soon')).toBeNull();
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
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="general" />);
    await settleParentConnectorState();
    openConnectorsSection();

    expect(await findConnectedGlyph('Notion')).toBeTruthy();
    expect(
      await screen.findByText(
        'Some connector data could not be read. Valid connectors remain available; retry to refresh.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Connectors returned data this page could not read.')).toBeNull();
  });

  it('marks GitHub Connected from real GitHub App installations (not user_connectors)', async () => {
    stubFetch({ installations: [{ installation_id: 42, created_at: '2026-06-01T00:00:00Z' }] });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="general" />);
    await settleParentConnectorState();
    openConnectorsSection();

    fireEvent.click(await screen.findByRole('button', { name: 'GitHub' }));
    expect(await screen.findByText('Connected')).toBeTruthy();
  });

  it('renders no Connect buttons when the server reports nothing connectable, and hides local-only connectors', async () => {
    stubFetch();
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="general" />);
    await settleParentConnectorState();
    openConnectorsSection();

    expect(await screen.findByRole('button', { name: 'Add custom connector' })).toBeTruthy();
    expect(await screen.findByPlaceholderText('Search connectors')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(await screen.findByRole('button', { name: 'Notion' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect Notion' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Connect GitHub' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Connect Slack' })).toBeNull();
    expect(screen.queryByText('Coming soon')).toBeNull();
    expect(screen.queryByText('Local Filesystem')).toBeNull();
    expect(screen.queryByText('Terminal / Shell')).toBeNull();
  });

  it('renders a Connect button for GitHub when the server reports it available', async () => {
    stubFetch({ available: ['github'] });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="general" />);
    await settleParentConnectorState();
    openConnectorsSection();

    expect(await screen.findByRole('button', { name: 'Connect GitHub' })).toBeTruthy();
  });

  it(
    'shows a secure-storage configuration failure on the connector row',
    { timeout: 20000 },
    async () => {
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
      render(<WebSettingsModal open onClose={vi.fn()} initialSection="general" />);
      await settleParentConnectorState();
      openConnectorsSection();

      const connectButton = await screen.findByRole('button', { name: 'Connect Notion' });
      await act(async () => {
        fireEvent.click(connectButton);
      });

      expect(await screen.findByText(message)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Connect Notion' })).toBeEnabled();
      expect(screen.queryByRole('img', { name: 'Connected' })).toBeNull();
    },
  );

  it('names the real cause instead of blaming the connection for a server fault', async () => {
    // A 5xx is the server failing, not the user's network. Telling them to
    // "check your connection" sends them to fix something that is not broken.
    stubFetch({ connectorFailuresBeforeSuccess: 1, connectorFailureStatus: 500 });
    const { unmount } = render(
      <WebSettingsModal open onClose={vi.fn()} initialSection="general" />,
    );
    await settleParentConnectorState();
    openConnectorsSection();
    expect(await screen.findByText(/the server returned an error/)).toBeTruthy();
    expect(screen.queryByText(/Check your connection/)).toBeNull();
    unmount();

    // A 4xx that is not an auth failure is a rejected request, not a server fault.
    stubFetch({ connectorFailuresBeforeSuccess: 1, connectorFailureStatus: 400 });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="general" />);
    await settleParentConnectorState();
    openConnectorsSection();
    expect(await screen.findByText(/the server rejected the request/)).toBeTruthy();
    expect(screen.queryByText(/the server returned an error/)).toBeNull();
  });

  it('shows a connector loading failure and retries instead of pretending the directory is empty', async () => {
    stubFetch({ connectorFailuresBeforeSuccess: 1 });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="general" />);
    await settleParentConnectorState();
    openConnectorsSection();

    expect(
      await screen.findByText(
        'Connectors could not be loaded because the server returned an error. This is not a problem with your connection, retry, or contact support if it persists.',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Notion' })).toBeTruthy();
    expect(
      screen.queryByText(
        'Connectors could not be loaded because the server returned an error. This is not a problem with your connection, retry, or contact support if it persists.',
      ),
    ).toBeNull();
  });

  it('renders the full connector list plus a scoped GitHub notice when only installations 500s', async () => {
    stubFetch({
      connectors: [{ connectorId: 'notion', connectedAt: '2026-07-01T00:00:00Z' }],
      available: ['notion', 'github'],
      installationsFailuresBeforeSuccess: Infinity,
      installationsFailureStatus: 500,
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="general" />);
    await settleParentConnectorState();
    openConnectorsSection();

    expect(await findConnectedGlyph('Notion')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Connect GitHub' })).toBeTruthy();

    expect(
      await screen.findByText(
        'GitHub app installations could not be loaded. GitHub may show as not connected here until this is retried.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        'Connectors could not be loaded because the server returned an error. This is not a problem with your connection, retry, or contact support if it persists.',
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
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="general" />);
    await settleParentConnectorState();
    openConnectorsSection();

    expect(await findConnectedGlyph('Notion')).toBeTruthy();
    expect(
      await screen.findByText(
        'GitHub app installations could not be loaded. GitHub may show as not connected here until this is retried.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        'Connectors could not be loaded because the server returned an error. This is not a problem with your connection, retry, or contact support if it persists.',
      ),
    ).toBeNull();
  });

  it('does not misreport a signed-out session when only installations 401s', async () => {
    stubFetch({
      available: ['notion', 'github'],
      installationsFailuresBeforeSuccess: Infinity,
      installationsFailureStatus: 401,
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="general" />);
    await settleParentConnectorState();
    openConnectorsSection();

    expect(await screen.findByRole('button', { name: 'Connect Notion' })).toBeTruthy();
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
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="general" />);
    await settleParentConnectorState();
    openConnectorsSection();

    expect(
      await screen.findByText(
        'Connectors could not be loaded because the server returned an error. This is not a problem with your connection, retry, or contact support if it persists.',
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

    fireEvent.click(await screen.findByRole('button', { name: 'Add custom connector' }));
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

  it('reaches per-tool connector permissions from the settings connector detail', async () => {
    stubFetch({
      connectors: [{ connectorId: 'notion', connectedAt: '2026-07-01T00:00:00Z' }],
      available: ['notion'],
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Notion' }));

    const trigger = await screen.findByText('Tool permissions');
    expect(trigger).toBeTruthy();
  });

  it('opens the real tri-state tool permissions dialog and persists a change to the API', async () => {
    const fetchMock = stubFetch({
      installations: [{ installation_id: 42, created_at: '2026-06-01T00:00:00Z' }],
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    fireEvent.click(await screen.findByRole('button', { name: 'GitHub' }));
    fireEvent.click(await screen.findByText('Tool permissions'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('GitHub - Tool Permissions')).toBeTruthy();
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
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="general" />);
    await settleParentConnectorState();
    openConnectorsSection();

    expect(
      await screen.findByText(
        'Your session expired. Reload the page to sign back in, then reopen Connectors.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        'Connectors could not be loaded because the server returned an error. This is not a problem with your connection, retry, or contact support if it persists.',
      ),
    ).toBeNull();
  });

  it('sends the Clerk bearer token with the connector directory requests', async () => {
    const fetchMock = stubFetch({});
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="connectors" />);

    await screen.findByRole('button', { name: 'Notion' });
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
      skillCatalogFailAttempts: [2],
      skills: [
        {
          name: 'fixture-reviewed-skill',
          description: 'A reviewed fixture skill.',
          source: 'bundled',
        },
      ],
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="skills" />);
    await screen.findByText('/fixture-reviewed-skill');

    const { fireEvent } = await import('@testing-library/react');
    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });
    fireEvent.click(within(nav).getByRole('button', { name: 'General' }));
    fireEvent.click(within(nav).getByRole('button', { name: 'Skills' }));

    expect(await screen.findByText('Skills are unavailable right now.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('/fixture-reviewed-skill')).toBeTruthy();
    expect(screen.queryByText('Skills are unavailable right now.')).toBeNull();
  });

  it('hides New skill and row actions when the server has not enabled skill authoring', async () => {
    stubFetch({
      canAuthorSkills: false,
      skills: [
        {
          name: 'fixture-reviewed-skill',
          description: 'A reviewed fixture skill.',
          source: 'bundled',
        },
        {
          name: 'fixture-authored-skill',
          description: 'An authored fixture skill.',
          source: 'personal',
        },
      ],
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="skills" />);

    await screen.findByText('/fixture-authored-skill');
    expect(screen.queryByRole('button', { name: 'New skill' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Settings fixture-authored-skill' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove fixture-authored-skill' })).toBeTruthy();
  });

  it('shows New skill when the server enables skill authoring', async () => {
    stubFetch({
      canAuthorSkills: true,
      skills: [
        {
          name: 'fixture-reviewed-skill',
          description: 'A reviewed fixture skill.',
          source: 'bundled',
        },
        {
          name: 'fixture-authored-skill',
          description: 'An authored fixture skill.',
          source: 'personal',
          editable: true,
        },
      ],
    });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="skills" />);

    await screen.findByText('/fixture-authored-skill');
    expect(await screen.findByRole('button', { name: 'New skill' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings fixture-authored-skill' })).toBeTruthy();
  });

  it('shows a plugin loading failure and retries instead of presenting a fake directory', async () => {
    stubFetch({ pluginCatalogFailAttempts: [2] });
    render(<WebSettingsModal open onClose={vi.fn()} initialSection="plugins" />);
    await screen.findByText('GitHub Automation');

    const { fireEvent } = await import('@testing-library/react');
    const nav = screen.getByRole('navigation', { name: 'Settings navigation' });
    fireEvent.click(within(nav).getByRole('button', { name: 'General' }));
    fireEvent.click(within(nav).getByRole('button', { name: 'Plugins' }));

    expect(await screen.findByText('The plugin catalog is unavailable right now.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('GitHub Automation')).toBeTruthy();
    expect(screen.queryByText('The plugin catalog is unavailable right now.')).toBeNull();
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
