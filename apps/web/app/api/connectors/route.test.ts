import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  githubInstallations: vi.fn(),
  customConnectors: vi.fn(),
  operatorIds: new Set(['slack']),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  })),
}));
vi.mock('@/lib/user-connector-tools', () => ({
  getOperatorMappedConnectorIds: vi.fn(() => mocks.operatorIds),
  getUserGithubInstallations: (...args: unknown[]) => mocks.githubInstallations(...args),
  getUserCustomConnectorSummaries: (...args: unknown[]) => mocks.customConnectors(...args),
}));
vi.mock('@/lib/github-app', () => ({
  getGitHubAppInstallUrl: vi.fn(() => 'https://github.com/apps/agi/installations/new'),
  isGitHubAppConfigured: vi.fn(() => true),
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { GET, POST } from './route';

function getRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/connectors');
}

function postRequest(connectorId: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/connectors', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ connectorId, authType: 'local' }),
  });
}

describe('/api/connectors managed-cloud capability boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue([]);
    mocks.execute.mockResolvedValue(undefined);
    mocks.githubInstallations.mockResolvedValue([]);
    mocks.customConnectors.mockResolvedValue([]);
  });

  it('does not advertise or restore device-local connector rows in Cloud mode', async () => {
    mocks.query.mockResolvedValue([
      {
        id: 'row-local',
        connector_id: 'local-filesystem',
        auth_type: 'local',
        connected_at: '2026-07-23T00:00:00.000Z',
        updated_at: '2026-07-23T00:00:00.000Z',
      },
      {
        id: 'row-remote',
        connector_id: 'slack',
        auth_type: 'oauth',
        connected_at: '2026-07-23T00:00:00.000Z',
        updated_at: '2026-07-23T00:00:00.000Z',
      },
    ]);

    const response = await GET(getRequest());
    const body = (await response.json()) as {
      connectors: Array<{ connectorId: string }>;
      available: string[];
    };

    expect(response.status).toBe(200);
    expect(body.connectors.map((connector) => connector.connectorId)).toEqual(['slack']);
    expect(body.available).toEqual(expect.arrayContaining(['slack', 'github']));
    expect(body.available).not.toContain('local-filesystem');
  });

  it('rejects a device-local connector before any Cloud persistence', async () => {
    const response = await POST(postRequest('local-filesystem'));

    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({
      connectorId: 'local-filesystem',
      error: expect.stringContaining('Desktop Local settings'),
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('fails closed when the real GitHub installation signal cannot be loaded', async () => {
    mocks.githubInstallations.mockRejectedValue(new Error('database unavailable'));

    const response = await GET(getRequest());

    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toBe('An unexpected error occurred');
  });
});
