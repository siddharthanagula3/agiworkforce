import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  target: null as Record<string, unknown> | null,
  spec: vi.fn(),
  customByUrl: vi.fn(),
  probe: vi.fn(),
  insertCustom: vi.fn(),
  updateCredential: vi.fn(),
  cacheToolNames: vi.fn(),
  seal: vi.fn(),
  audit: vi.fn(),
  evictCustomCaches: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: vi.fn(), execute: vi.fn() },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...args: unknown[]) => mocks.audit(...args),
  BLOCK_APPEAL_PATH: '/support',
  getClientIp: vi.fn(),
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/mcp-url-validation', () => ({
  validateHttpsMcpUrl: vi.fn(async (raw: unknown) => new URL(String(raw))),
}));
vi.mock('@/lib/custom-connector-crypto', () => ({
  AUTHORIZATION_HEADER_NAME: 'Authorization',
  BEARER_VALUE_PREFIX: 'Bearer ',
  CONNECTOR_TOKEN_STORAGE_UNAVAILABLE: 'storage unavailable',
  isConnectorTokenStorageAvailable: vi.fn(() => true),
  openCustomConnectorCredential: vi.fn(),
  sealCustomConnectorCredential: (...args: unknown[]) => mocks.seal(...args),
}));
vi.mock('@/lib/user-connector-tools', () => ({
  evictCustomConnectorCaches: (...args: unknown[]) => mocks.evictCustomCaches(...args),
  findUserCustomConnectorByUrl: (...args: unknown[]) => mocks.customByUrl(...args),
}));
vi.mock('@/lib/connectors/mcp-directory-targets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/mcp-directory-targets')>()),
  resolveDirectoryTarget: async () => mocks.target,
}));
vi.mock('@/lib/connectors/mcp-credential-spec', () => ({
  resolveConnectorCredentialSpec: (...args: unknown[]) => mocks.spec(...args),
}));
vi.mock('@/lib/connectors/mcp-custom-connections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/mcp-custom-connections')>()),
  probeMcpServer: (...args: unknown[]) => mocks.probe(...args),
  insertCustomConnector: (...args: unknown[]) => mocks.insertCustom(...args),
  updateCustomConnectorCredential: (...args: unknown[]) => mocks.updateCredential(...args),
  assertCustomConnectorCapacity: vi.fn(async () => ({ planTier: 'pro', connectorLimit: 25 })),
  assertConnectorToolCapacity: vi.fn(),
}));
vi.mock('@/lib/connectors/directory/tool-names-cache', () => ({
  setCachedToolNames: (...args: unknown[]) => mocks.cacheToolNames(...args),
  getCachedToolNames: vi.fn(async () => null),
}));

import { GET, POST } from './route';

const RECORD_ID = 'ai.fodda/mcp-server';
const ENCODED_ID = encodeURIComponent(RECORD_ID);

function context() {
  return { params: Promise.resolve({ connectorId: RECORD_ID }) };
}

function getRequest(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/connectors/${ENCODED_ID}/credentials`);
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/connectors/${ENCODED_ID}/credentials`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.target = {
    connectorId: RECORD_ID,
    serverId: 'dir-0123456789ab',
    mcpUrl: 'https://mcp.fodda.ai/mcp',
    transport: 'streamable-http',
    name: 'Fodda',
    documentationUrl: 'https://www.fodda.ai/docs',
    record: { authMode: 'api-key', sourceRegistry: 'mcp-registry' },
  };
  mocks.spec.mockResolvedValue({
    headerName: 'Authorization',
    valuePrefix: 'Bearer ',
    placement: 'header',
    source: 'registry',
    description: 'Bearer token with your Fodda API key',
  });
  mocks.customByUrl.mockResolvedValue(null);
  mocks.probe.mockResolvedValue({
    toolCount: 3,
    toolNames: ['search', 'fetch', 'graph'],
    capabilityCounts: { tools: 3, resources: 0, resourceTemplates: 0, prompts: 0, apps: 0 },
    protocolEra: 'modern',
  });
  mocks.insertCustom.mockResolvedValue({
    id: 'row-9',
    short_id: 'fedcba9876',
    name: 'Fodda',
    url: 'https://mcp.fodda.ai/mcp',
    transport: 'streamable-http',
    created_at: '2026-09-05T00:00:00.000Z',
    updated_at: '2026-09-05T00:00:00.000Z',
  });
  mocks.seal.mockReturnValue('sealed');
  mocks.cacheToolNames.mockResolvedValue(undefined);
  mocks.audit.mockResolvedValue(undefined);
});

describe('GET /api/connectors/[connectorId]/credentials', () => {
  it('tells the form which header to send and whether a key is already saved', async () => {
    const response = await GET(getRequest(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      connectorId: RECORD_ID,
      name: 'Fodda',
      documentationUrl: 'https://www.fodda.ai/docs',
      connected: false,
      headerName: 'Authorization',
      valuePrefix: 'Bearer ',
      placement: 'header',
      source: 'registry',
    });
  });

  it('404s for an id the directory does not know', async () => {
    mocks.target = null;
    const response = await GET(getRequest(), context());
    expect(response.status).toBe(404);
  });
});

describe('POST /api/connectors/[connectorId]/credentials', () => {
  it('runs tools/list with the key before saving it encrypted through the custom path', async () => {
    const response = await POST(postRequest({ apiKey: 'sk_live_example' }), context());

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      connector: { connectorId: string; toolConnectorId: string };
      toolNames: string[];
    };
    expect(body.connector).toMatchObject({
      connectorId: RECORD_ID,
      toolConnectorId: 'custom-fedcba9876',
      source: 'custom',
    });
    expect(body.toolNames).toEqual(['search', 'fetch', 'graph']);
    expect(mocks.probe).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://mcp.fodda.ai/mcp',
        headers: { Authorization: 'Bearer sk_live_example' },
      }),
    );
    expect(mocks.seal).toHaveBeenCalledWith({
      headerName: 'Authorization',
      headerValue: 'Bearer sk_live_example',
    });
    expect(mocks.insertCustom).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'Fodda', credentialEnc: 'sealed' }),
    );
    expect(mocks.cacheToolNames).toHaveBeenCalledWith(RECORD_ID, ['search', 'fetch', 'graph']);
    expect(JSON.stringify(body)).not.toContain('sk_live_example');
  });

  it('uses the vendor header name and no prefix when the registry declares one', async () => {
    mocks.spec.mockResolvedValue({
      headerName: 'X-API-Key',
      valuePrefix: '',
      placement: 'header',
      source: 'registry',
      description: null,
    });

    await POST(postRequest({ apiKey: 'kb_example' }), context());

    expect(mocks.probe).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { 'X-API-Key': 'kb_example' } }),
    );
  });

  it('does not save a key the server rejects', async () => {
    const { McpProbeError } = await import('@/lib/connectors/mcp-custom-connections');
    mocks.probe.mockRejectedValue(new McpProbeError('HTTP 401', true));

    const response = await POST(postRequest({ apiKey: 'wrong' }), context());

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toBe('Fodda rejected that API key.');
    expect(mocks.insertCustom).not.toHaveBeenCalled();
    expect(mocks.seal).not.toHaveBeenCalled();
  });

  it('names the server when it cannot be reached at all', async () => {
    const { McpProbeError } = await import('@/lib/connectors/mcp-custom-connections');
    mocks.probe.mockRejectedValue(new McpProbeError('connect ETIMEDOUT', false));

    const response = await POST(postRequest({ apiKey: 'sk' }), context());

    expect(response.status).toBe(502);
    expect((await response.json()).error.message).toContain('Fodda could not be reached');
  });

  it('replaces the stored key in place when the connector already exists', async () => {
    mocks.customByUrl.mockResolvedValue({
      id: 'row-9',
      shortId: 'fedcba9876',
      connectorId: 'custom-fedcba9876',
      name: 'Fodda',
      url: 'https://mcp.fodda.ai/mcp',
      transport: 'streamable-http',
    });
    mocks.updateCredential.mockResolvedValue({
      id: 'row-9',
      short_id: 'fedcba9876',
      name: 'Fodda',
      url: 'https://mcp.fodda.ai/mcp',
      transport: 'streamable-http',
      created_at: '2026-09-05T00:00:00.000Z',
      updated_at: '2026-09-06T00:00:00.000Z',
    });

    const response = await POST(postRequest({ apiKey: 'sk_new' }), context());

    expect(response.status).toBe(200);
    expect(mocks.updateCredential).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'row-9',
      'sealed',
    );
    expect(mocks.evictCustomCaches).toHaveBeenCalledWith('user-1', 'row-9');
    expect(mocks.insertCustom).not.toHaveBeenCalled();
  });

  it('refuses a placement this app cannot send', async () => {
    mocks.spec.mockResolvedValue({
      headerName: 'Authorization',
      valuePrefix: 'Bearer ',
      placement: 'query',
      source: 'discovery',
      description: null,
    });

    const response = await POST(postRequest({ apiKey: 'sk' }), context());

    expect(response.status).toBe(400);
    expect(mocks.probe).not.toHaveBeenCalled();
  });

  it('rejects an empty key before any network work', async () => {
    const response = await POST(postRequest({ apiKey: '   ' }), context());

    expect(response.status).toBe(400);
    expect(mocks.probe).not.toHaveBeenCalled();
  });
});
