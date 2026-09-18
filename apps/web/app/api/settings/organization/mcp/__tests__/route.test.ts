import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  probe: vi.fn(),
  readConnectorPolicy: vi.fn(),
  recordAuditEvent: vi.fn(async () => undefined),
  permissions: { value: new Set(['content.read', 'policy.manage']) as ReadonlySet<string> },
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: mocks.query },
    userId: 'user-1',
    organizationId: ORG_ID,
  })),
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => ({ query: mocks.query })) }));
vi.mock('@/lib/security-audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security-audit')>();
  return { ...actual, recordAuditEvent: mocks.recordAuditEvent };
});
vi.mock('@/app/api/settings/team/team-admin-access', () => ({
  requireTeamAdminAccess: vi.fn(async () => ({ plan: 'team', canManageTeam: true })),
}));
vi.mock('@/lib/services/organization-permission-service', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/services/organization-permission-service')>();
  return {
    ...actual,
    resolveOrganizationAccess: vi.fn(async () => ({
      organizationId: ORG_ID,
      role: 'admin',
      permissions: mocks.permissions.value,
    })),
  };
});
vi.mock('@/lib/services/connector-policy-service', () => ({
  readConnectorPolicy: mocks.readConnectorPolicy,
}));
vi.mock('@/lib/connectors/mcp-custom-connections', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/connectors/mcp-custom-connections')>();
  return { ...actual, probeMcpServer: mocks.probe };
});

const ORG_ID = '11111111-1111-4111-8111-111111111111';

import { McpProbeError } from '@/lib/connectors/mcp-custom-connections';
import { GET, PATCH, POST } from '../route';

const SERVER_ROW = {
  id: '22222222-2222-4222-8222-222222222222',
  short_id: 'p0123456789',
  name: 'Acme Gateway',
  description: null,
  url: 'https://mcp.acme.test/mcp',
  transport: 'streamable-http',
  published: true,
  published_at: '2026-09-18T00:00:00.000Z',
  retired_at: null,
  created_at: '2026-09-18T00:00:00.000Z',
  updated_at: '2026-09-18T00:00:00.000Z',
};

function request(method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request('https://app.test/api/settings/organization/mcp', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as Parameters<typeof POST>[0];
}

async function refusal(response: Response): Promise<string> {
  const body = (await response.json()) as { error?: { message?: string } | string };
  return typeof body.error === 'string' ? body.error : (body.error?.message ?? '');
}

function capabilities() {
  return { tools: 3, resources: 2, resourceTemplates: 0, prompts: 0, apps: 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.permissions.value = new Set(['content.read', 'policy.manage']);
  mocks.readConnectorPolicy.mockResolvedValue(null);
  mocks.probe.mockResolvedValue({
    toolCount: 3,
    toolNames: ['a', 'b', 'c'],
    capabilityCounts: capabilities(),
    protocolEra: 'modern',
  });
});

describe('GET /api/settings/organization/mcp', () => {
  it('lists the workspace servers with the revision that versions them', async () => {
    mocks.query.mockResolvedValueOnce([SERVER_ROW]).mockResolvedValueOnce([{ revision: 7 }]);

    const response = await GET(request('GET'));
    const body = (await response.json()) as {
      servers: Array<{ connectorId: string; published: boolean }>;
      canManage: boolean;
      revision: number;
    };

    expect(response.headers.get('ETag')).toBe('W/"wsrev-7"');
    expect(body.canManage).toBe(true);
    expect(body.revision).toBe(7);
    expect(body.servers[0]).toMatchObject({
      connectorId: 'orgmcp-p0123456789',
      published: true,
    });
  });
});

describe('POST /api/settings/organization/mcp', () => {
  it('contacts the server before publishing it to every member', async () => {
    mocks.query
      .mockResolvedValueOnce([{ revision: 7 }])
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([SERVER_ROW]);

    const response = await POST(
      request('POST', { name: 'Acme Gateway', url: 'https://mcp.acme.test/mcp' }),
    );

    expect(response.status).toBe(201);
    expect(mocks.probe).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://mcp.acme.test/mcp' }),
    );
    const body = (await response.json()) as { server: { connectorId: string } };
    expect(body.server.connectorId).toBe('orgmcp-p0123456789');
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ resourceType: 'organization_mcp_server' }),
      }),
    );
  });

  it('refuses a server the workspace could not reach, and writes no row', async () => {
    mocks.query.mockResolvedValueOnce([{ revision: 7 }]).mockResolvedValueOnce([{ count: '0' }]);
    mocks.probe.mockRejectedValue(new McpProbeError('connection refused', false));

    const response = await POST(
      request('POST', { name: 'Acme Gateway', url: 'https://mcp.acme.test/mcp' }),
    );
    expect(await refusal(response)).toContain('could not be reached');

    const inserts = mocks.query.mock.calls.filter(([sql]) =>
      String(sql).includes('insert into public.organization_mcp_servers'),
    );
    expect(inserts).toHaveLength(0);
  });

  it('refuses a host the workspace’s own connector policy does not allow', async () => {
    mocks.query.mockResolvedValueOnce([{ revision: 7 }]);
    mocks.readConnectorPolicy.mockResolvedValue({
      allowedConnectors: [],
      blockedConnectors: [],
      allowCustomConnectors: true,
      allowedPlugins: [],
      blockedPlugins: [],
      allowedMcpHosts: ['mcp.approved.test'],
    });

    const response = await POST(
      request('POST', { name: 'Acme Gateway', url: 'https://mcp.acme.test/mcp' }),
    );
    expect(await refusal(response)).toContain('approved hosts');
    expect(mocks.probe).not.toHaveBeenCalled();
  });

  it('refuses an endpoint that is not https', async () => {
    mocks.query.mockResolvedValueOnce([{ revision: 7 }]);

    const response = await POST(
      request('POST', { name: 'Acme Gateway', url: 'http://mcp.acme.test/mcp' }),
    );
    expect(await refusal(response)).toContain('https');
  });

  it('refuses a member whose role does not let them publish', async () => {
    mocks.permissions.value = new Set(['content.read']);

    const response = await POST(
      request('POST', { name: 'Acme Gateway', url: 'https://mcp.acme.test/mcp' }),
    );
    expect(response.status).toBe(403);
    expect(mocks.probe).not.toHaveBeenCalled();
  });

  it('refuses to publish over another administrator’s change', async () => {
    mocks.query.mockResolvedValueOnce([{ revision: 9 }]);

    const response = await POST(
      request(
        'POST',
        { name: 'Acme Gateway', url: 'https://mcp.acme.test/mcp' },
        { 'if-match': 'W/"wsrev-7"' },
      ),
    );
    expect(await refusal(response)).toContain('Another administrator');
  });
});

describe('PATCH /api/settings/organization/mcp', () => {
  it('retires a server and reports the workspace list back', async () => {
    mocks.query
      .mockResolvedValueOnce([{ revision: 7 }])
      .mockResolvedValueOnce([
        { ...SERVER_ROW, published: false, retired_at: '2026-09-18T01:00:00.000Z' },
      ])
      .mockResolvedValueOnce([
        { ...SERVER_ROW, published: false, retired_at: '2026-09-18T01:00:00.000Z' },
      ])
      .mockResolvedValueOnce([{ revision: 8 }]);

    const response = await PATCH(request('PATCH', { serverId: SERVER_ROW.id, retired: true }));
    const body = (await response.json()) as { servers: Array<{ retiredAt: string | null }> };

    expect(response.status).toBe(200);
    expect(body.servers[0]?.retiredAt).toBe('2026-09-18T01:00:00.000Z');
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ detail: expect.objectContaining({ status: 'retired' }) }),
    );
  });

  it('reports a server this workspace does not publish as not found', async () => {
    mocks.query.mockResolvedValueOnce([{ revision: 7 }]).mockResolvedValueOnce([]);

    const response = await PATCH(request('PATCH', { serverId: SERVER_ROW.id, published: false }));
    expect(response.status).toBe(404);
  });
});
