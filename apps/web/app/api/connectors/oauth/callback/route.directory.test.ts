import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  consumePending: vi.fn(),
  complete: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: (...a: unknown[]) => mocks.audit(...a),
  BLOCK_APPEAL_PATH: '/support',
  getClientIp: vi.fn(),
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/connectors/oauth-store', () => ({
  ConnectorOAuthStoreUnavailableError: class extends Error {},
  consumePendingAuthorization: (...a: unknown[]) => mocks.consumePending(...a),
  upsertConnectorOAuthGrant: vi.fn(),
  createPendingAuthorization: vi.fn(),
}));
vi.mock('@/lib/connectors/oauth-client', () => ({
  ConnectorOAuthTokenError: class extends Error {},
  exchangeAuthorizationCode: vi.fn(),
}));
vi.mock('@/lib/connectors/mcp-discovery', () => ({
  completeMcpAuthorization: (...a: unknown[]) => mocks.complete(...a),
}));

import { GET } from './route';

const RECORD_ID = 'ch.cowork24/booking';
const STATE = 'c'.repeat(64);

function pending() {
  return {
    userId: 'user-1',
    connectorId: RECORD_ID,
    codeVerifier: 'verifier',
    redirectUri: 'https://app.example.com/api/connectors/oauth/callback',
    requestedScopes: [],
    returnPath: '/settings',
    mcpUrl: 'https://mcp.cowork24.ch/mcp',
    issuer: 'https://mcp.cowork24.ch/',
    discoveryState: {},
  };
}

function request(query: string): NextRequest {
  return new NextRequest(`https://app.example.com/api/connectors/oauth/callback${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consumePending.mockResolvedValue(pending());
  mocks.audit.mockResolvedValue(undefined);
});

describe('GET /api/connectors/oauth/callback for a discovered directory record', () => {
  it('completes the discovered exchange and returns to the caller as connected', async () => {
    mocks.complete.mockResolvedValue({
      status: 'connected',
      connectorId: RECORD_ID,
      grantedScopes: ['booking:read'],
    });

    const response = await GET(request(`?state=${STATE}&code=auth-code`));

    const target = new URL(response.headers.get('location') as string);
    expect(target.pathname).toBe('/settings');
    expect(target.searchParams.get('status')).toBe('connected');
    expect(target.searchParams.get('connector')).toBe(RECORD_ID);
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'auth-code', state: STATE }),
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ connectorId: RECORD_ID, source: 'mcp-discovery' }),
      }),
    );
  });

  it('maps a refused registration during the exchange to its own status', async () => {
    mocks.complete.mockResolvedValue({
      status: 'error',
      reason: 'registration-rejected',
      message: 'refused',
    });

    const response = await GET(request(`?state=${STATE}&code=auth-code`));

    expect(new URL(response.headers.get('location') as string).searchParams.get('status')).toBe(
      'registration_rejected',
    );
  });

  it('asks for a fresh connection when the authorization server changed', async () => {
    mocks.complete.mockResolvedValue({
      status: 'error',
      reason: 'authorization-server-changed',
      message: 'moved',
    });

    const response = await GET(request(`?state=${STATE}&code=auth-code`));

    expect(new URL(response.headers.get('location') as string).searchParams.get('status')).toBe(
      'reauthorize',
    );
  });
});
