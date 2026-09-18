import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'token') }));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

import { WorkspaceMcpServers } from '../WorkspaceMcpServers';

const PUBLISHED = {
  id: '0190a000-0000-7000-8000-000000000001',
  shortId: 'p0123456789',
  connectorId: 'orgmcp-p0123456789',
  name: 'Acme Gateway',
  description: null,
  url: 'https://mcp.acme.test/mcp',
  transport: 'streamable-http',
  published: true,
  publishedAt: '2026-09-17T00:00:00.000Z',
  retiredAt: null,
};

function body(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: 'org-1',
    canManage: true,
    servers: [PUBLISHED],
    revision: 4,
    ...overrides,
  };
}

function respond(payload: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => payload,
  } as unknown as Response;
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceMcpServers />
    </QueryClientProvider>,
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('WorkspaceMcpServers', () => {
  it('renders nothing for a member who does not administer the workspace', async () => {
    fetchMock.mockResolvedValue(respond(null, 403));
    const { container } = renderPanel();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('says which servers every member already has', async () => {
    fetchMock.mockResolvedValue(respond(body()));
    renderPanel();

    expect(await screen.findByText('Acme Gateway')).toBeInTheDocument();
    expect(screen.getByText('Published to everyone')).toBeInTheDocument();
    expect(screen.getByText('https://mcp.acme.test/mcp')).toBeInTheDocument();
  });

  it('distinguishes a draft from a published server', async () => {
    fetchMock.mockResolvedValue(
      respond(body({ servers: [{ ...PUBLISHED, published: false, publishedAt: null }] })),
    );
    renderPanel();

    expect(await screen.findByText('Draft, not yet published')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish to everyone' })).toBeInTheDocument();
  });

  it('publishes a server the administrator names', async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? respond({ server: PUBLISHED }) : respond(body({ servers: [] })),
    );
    renderPanel();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Add a server'), 'Acme Gateway');
    await user.type(screen.getByLabelText('Server URL'), 'https://mcp.acme.test/mcp');
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => {
      const posted = fetchMock.mock.calls.find(
        (call) => (call[1] as RequestInit | undefined)?.method === 'POST',
      );
      expect(posted).toBeDefined();
      expect(JSON.parse(String((posted?.[1] as RequestInit).body))).toEqual({
        name: 'Acme Gateway',
        url: 'https://mcp.acme.test/mcp',
      });
    });
  });

  it('refuses to publish anything that is not an https URL', async () => {
    fetchMock.mockResolvedValue(respond(body({ servers: [] })));
    renderPanel();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Add a server'), 'Acme Gateway');
    await user.type(screen.getByLabelText('Server URL'), 'http://mcp.acme.test/mcp');

    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  });

  it('names the consequence before retiring a server for everyone', async () => {
    fetchMock.mockResolvedValue(respond(body()));
    renderPanel();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Retire' }));

    expect(await screen.findByText('Retire Acme Gateway?')).toBeInTheDocument();
    expect(screen.getByText(/Every member loses this server/)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'PATCH'),
    ).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Retire for everyone' }));

    await waitFor(() => {
      const patched = fetchMock.mock.calls.find(
        (call) => (call[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(JSON.parse(String((patched?.[1] as RequestInit).body))).toEqual({
        serverId: PUBLISHED.id,
        retired: true,
      });
    });
  });

  it('offers a member with no management permission no controls', async () => {
    fetchMock.mockResolvedValue(respond(body({ canManage: false })));
    renderPanel();

    expect(await screen.findByText('Acme Gateway')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retire' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add a server')).not.toBeInTheDocument();
  });
});
