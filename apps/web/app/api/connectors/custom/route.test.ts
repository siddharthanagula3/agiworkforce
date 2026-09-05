import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  getSubscription: vi.fn(),
  connect: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({ query: (...args: unknown[]) => mocks.query(...args) })),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mocks.query(...args),
      execute: (...args: unknown[]) => mocks.execute?.(...args),
    },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mocks.getSubscription },
}));
vi.mock('@/lib/mcp-url-validation', () => ({
  validateHttpsMcpUrl: vi.fn(async () => new URL('https://mcp.example.com/sse')),
}));
vi.mock('@/lib/custom-connector-crypto', () => ({ encryptConnectorToken: vi.fn(() => 'enc') }));
vi.mock('@/lib/user-connector-tools', () => ({
  evictCustomConnectorCaches: vi.fn(),
  getUserCustomConnectorSummaries: vi.fn(async () => []),
}));
vi.mock('@/lib/connectors/mcp-runtime-cache', () => ({
  getMcpStatelessRuntime: vi.fn(async () => ({})),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@agiworkforce/mcp', () => ({ connectMcpServer: mocks.connect }));

import { POST } from './route';

function request() {
  return new NextRequest('http://localhost/api/connectors/custom', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'My MCP', url: 'https://mcp.example.com/sse' }),
  });
}

describe('POST /api/connectors/custom free-plan entitlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSubscription.mockResolvedValue({ plan_tier: 'free' });
    mocks.connect.mockResolvedValue({
      protocolEra: 'modern',
      catalog: {
        tools: [{ toolName: 'search', visibility: 'model' }],
        resources: [],
        resourceTemplates: [],
        prompts: [],
        apps: [],
      },
      close: vi.fn(),
    });
  });

  it('rejects a second custom remote MCP for a free user before network work', async () => {
    mocks.query.mockResolvedValueOnce([{ count: '1' }]);

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect((await response.json()).error.message).toContain('1 custom connector');
  });

  it('uses the Pro plan limit from the shared billing catalog', async () => {
    mocks.getSubscription.mockResolvedValue({ plan_tier: 'pro' });
    mocks.query
      .mockResolvedValueOnce([{ count: '1' }])
      .mockResolvedValueOnce([{ exists: false }])
      .mockResolvedValueOnce([
        {
          id: 'connector-1',
          short_id: 'abc123',
          name: 'My MCP',
          url: 'https://mcp.example.com/sse',
          transport: 'sse',
          created_at: '2026-07-17T00:00:00.000Z',
          updated_at: '2026-07-17T00:00:00.000Z',
        },
      ]);

    const response = await POST(request());

    expect(response.status).toBe(201);
    const [sql, params] = mocks.query.mock.calls[2] as [string, unknown[]];
    expect(sql).toContain("assert_user_resource_limit('custom_connectors'");
    expect(params).toContain(25);
  });

  it('fails closed for an unknown subscription before network work', async () => {
    mocks.getSubscription.mockResolvedValue({ plan_tier: 'starter' });
    mocks.query.mockResolvedValueOnce([{ count: '0' }]);

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
    expect((await response.json()).error.message).toBe(
      'Your current subscription does not allow custom connectors. Choose an eligible plan and try again.',
    );
  });
});
