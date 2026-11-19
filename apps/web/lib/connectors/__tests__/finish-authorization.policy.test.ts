import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type TypesModule = typeof import('@agiworkforce/types');
type EmailModule = typeof import('@/lib/auth/email-confirmation');
type ScopeModule = typeof import('@/lib/server/rls-db');
type PolicyModule = typeof import('@/lib/services/connector-policy-service');
type EntitlementModule = typeof import('@/lib/services/entitlement-resolution');
type CapabilityModule = typeof import('@/lib/connectors/connector-capability');
type StoreModule = typeof import('@/lib/connectors/oauth-store');
type ClientModule = typeof import('@/lib/connectors/oauth-client');
type DiscoveryModule = typeof import('@/lib/connectors/mcp-discovery');
type RegistryModule = typeof import('@/lib/connectors/oauth-registry');
type AuditModule = typeof import('@/lib/security-audit');
type RateLimitModule = typeof import('@/lib/rate-limit');
type CryptoModule = typeof import('@/lib/custom-connector-crypto');
type WorkspaceGateModule = typeof import('@/lib/managed-compute-gate');

const WORKSPACE_ACCESS_ALLOWED = {
  allowed: true,
  code: 'allowed',
  reason: 'Allowed by workspace policy.',
  obligations: [],
  organizationId: null,
};

const mocks = vi.hoisted(() => ({
  workspaceAccess: vi.fn(),
  pending: vi.fn(),
  policy: vi.fn(),
  scope: vi.fn(),
  upsert: vi.fn(),
  exchange: vi.fn(),
  complete: vi.fn(),
  audit: vi.fn(),
  begin: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/managed-compute-gate', async (importOriginal) => ({
  ...(await importOriginal<WorkspaceGateModule>()),
  evaluateWorkspaceAccess: mocks.workspaceAccess,
}));
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<TypesModule>()),
  connectorsReleased: () => true,
  connectorReleased: () => true,
}));
vi.mock('@/lib/auth/email-confirmation', async (importOriginal) => ({
  ...(await importOriginal<EmailModule>()),
  readPrimaryEmailState: vi.fn(async () => ({ confirmed: true })),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScopeModule>()),
  getUserScopedDb: mocks.scope,
}));
vi.mock('@/lib/services/connector-policy-service', async (importOriginal) => ({
  ...(await importOriginal<PolicyModule>()),
  readConnectorPolicy: mocks.policy,
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<EntitlementModule>()),
  resolveEntitledPlanTier: vi.fn(async () => 'pro'),
}));
vi.mock('@/lib/connectors/connector-capability', async (importOriginal) => ({
  ...(await importOriginal<CapabilityModule>()),
  connectorsAllowedWithoutRequest: vi.fn(async () => true),
}));
vi.mock('@/lib/connectors/oauth-store', async (importOriginal) => ({
  ...(await importOriginal<StoreModule>()),
  consumePendingAuthorization: mocks.pending,
  upsertConnectorOAuthGrant: mocks.upsert,
}));
vi.mock('@/lib/connectors/oauth-client', async (importOriginal) => ({
  ...(await importOriginal<ClientModule>()),
  exchangeAuthorizationCode: mocks.exchange,
}));
vi.mock('@/lib/connectors/mcp-discovery', async (importOriginal) => ({
  ...(await importOriginal<DiscoveryModule>()),
  completeMcpAuthorization: mocks.complete,
  beginMcpAuthorization: mocks.begin,
}));
vi.mock('@/lib/connectors/oauth-registry', async (importOriginal) => ({
  ...(await importOriginal<RegistryModule>()),
  getConnectorOAuthProvider: vi.fn(() => ({
    connectorId: 'linear',
    mcpUrl: 'https://mcp.example.com/mcp',
  })),
  isAllowedConnectorOAuthRedirectUri: vi.fn(() => true),
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<AuditModule>()),
  recordAuditEvent: mocks.audit,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/custom-connector-crypto', async (importOriginal) => ({
  ...(await importOriginal<CryptoModule>()),
  isConnectorTokenStorageAvailable: vi.fn(() => true),
}));

import { finishConnectorAuthorization } from '@/lib/connectors/finish-authorization';
import { evaluateConnectorPolicyForUser } from '@/lib/services/connector-policy-gate';
import { getConnectorOAuthProvider } from '@/lib/connectors/oauth-registry';
import { getMcpEndpoint } from '@/lib/connectors/mcp-endpoints';
import { GET as startAuthorization } from '@/app/api/connectors/oauth/start/route';

const USER = 'user-1';
const ORGANIZATION = 'org-1';
const request = new NextRequest('https://app.example.com/api/connectors/oauth/callback');
const db = {} as Parameters<typeof evaluateConnectorPolicyForUser>[0]['db'];
const POLICY = {
  organizationId: ORGANIZATION,
  allowedConnectors: [],
  blockedConnectors: [],
  allowCustomConnectors: true,
  updatedByUserId: null,
  updatedAt: '2026-10-31T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspaceAccess.mockResolvedValue(WORKSPACE_ACCESS_ALLOWED);
  mocks.policy.mockResolvedValue(POLICY);
  mocks.scope.mockResolvedValue({ db, userId: USER, organizationId: ORGANIZATION });
  mocks.pending.mockResolvedValue({
    userId: USER,
    connectorId: 'linear',
    returnPath: '/connectors',
    requestedScopes: ['read'],
    redirectUri: 'https://app.example.com/api/connectors/oauth/callback',
    codeVerifier: 'verifier',
    mcpUrl: null,
  });
  mocks.exchange.mockResolvedValue({ accessToken: 'test-access', grantedScopes: ['read'] });
  mocks.complete.mockResolvedValue({
    status: 'connected',
    connectorId: 'linear',
    grantedScopes: ['read'],
  });
  mocks.upsert.mockResolvedValue(true);
  mocks.audit.mockResolvedValue(undefined);
});

describe('connector authorization completion policy', () => {
  it.each(['registered', 'discovered'] as const)(
    'rechecks an allowed start before %s exchange after the workspace blocks it',
    async (kind) => {
      const isCustom = kind === 'discovered';
      if (isCustom) {
        mocks.pending.mockResolvedValue({
          userId: USER,
          connectorId: 'linear',
          returnPath: '/connectors',
          mcpUrl: 'https://mcp.example.com/mcp',
        });
      }
      await expect(
        evaluateConnectorPolicyForUser({
          db,
          userId: USER,
          organizationId: ORGANIZATION,
          connectorId: 'linear',
          isCustom,
        }),
      ).resolves.toMatchObject({ allowed: true });
      mocks.policy.mockResolvedValue({ ...POLICY, blockedConnectors: ['linear'] });

      const result = await finishConnectorAuthorization({
        request,
        userId: USER,
        state: 'state',
        code: 'code',
        iss: undefined,
        providerError: null,
      });

      expect(result).toMatchObject({ connectorId: 'linear', status: 'unavailable' });
      expect(mocks.policy).toHaveBeenCalledTimes(2);
      expect(mocks.policy).toHaveBeenLastCalledWith(db, ORGANIZATION);
      expect(mocks.exchange).not.toHaveBeenCalled();
      expect(mocks.complete).not.toHaveBeenCalled();
      expect(mocks.upsert).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    },
  );

  it('refuses completion when the policy becomes unreadable after an allowed start', async () => {
    await expect(
      evaluateConnectorPolicyForUser({
        db,
        userId: USER,
        organizationId: ORGANIZATION,
        connectorId: 'linear',
      }),
    ).resolves.toMatchObject({ allowed: true });
    mocks.policy.mockRejectedValue(new Error('policy unavailable'));

    const result = await finishConnectorAuthorization({
      request,
      userId: USER,
      state: 'state',
      code: 'code',
      iss: undefined,
      providerError: null,
    });

    expect(result.status).toBe('unavailable');
    expect(mocks.policy).toHaveBeenCalledTimes(2);
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});

describe('connector authorization completion host policy', () => {
  it('refuses the trusted pending MCP host before any discovered exchange', async () => {
    const mcpUrl = 'https://mcp.example.com/mcp';
    mocks.pending.mockResolvedValue({
      userId: USER,
      connectorId: 'linear',
      returnPath: '/connectors',
      mcpUrl,
    });
    mocks.policy.mockResolvedValue({
      ...POLICY,
      allowedConnectors: ['linear'],
      allowedMcpHosts: ['approved.example'],
    });
    await expect(
      evaluateConnectorPolicyForUser({
        db,
        userId: USER,
        organizationId: ORGANIZATION,
        connectorId: 'linear',
        isCustom: true,
        url: mcpUrl,
      }),
    ).resolves.toMatchObject({ allowed: false, code: 'mcp_host_not_allowed' });

    const result = await finishConnectorAuthorization({
      request,
      userId: USER,
      state: 'state',
      code: 'code',
      iss: undefined,
      providerError: null,
    });

    expect(result.status).toBe('unavailable');
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('retains a matching host authorization for the discovered connector', async () => {
    mocks.pending.mockResolvedValue({
      userId: USER,
      connectorId: 'linear',
      returnPath: '/connectors',
      mcpUrl: 'https://mcp.example.com/mcp',
    });
    mocks.policy.mockResolvedValue({
      ...POLICY,
      allowedConnectors: ['linear'],
      allowedMcpHosts: ['mcp.example.com'],
    });

    const result = await finishConnectorAuthorization({
      request,
      userId: USER,
      state: 'state',
      code: 'code',
      iss: undefined,
      providerError: null,
    });

    expect(result.status).toBe('connected');
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    expect(mocks.exchange).not.toHaveBeenCalled();
  });

  it('preserves the registered connector classification under the host allowlist', async () => {
    mocks.policy.mockResolvedValue({
      ...POLICY,
      allowedConnectors: ['linear'],
      allowedMcpHosts: ['approved.example'],
    });
    const result = await finishConnectorAuthorization({
      request,
      userId: USER,
      state: 'state',
      code: 'code',
      iss: undefined,
      providerError: null,
    });
    expect(result.status).toBe('connected');
    expect(mocks.exchange).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it.each(['registered', 'discovered'] as const)(
    'reports an invalid state, and no connection, when a %s authorization was replaced before it saved',
    async (kind) => {
      if (kind === 'discovered') {
        mocks.pending.mockResolvedValue({
          authorizationId: 'authorization-1',
          userId: USER,
          connectorId: 'linear',
          returnPath: '/connectors',
          requestedScopes: ['read'],
          redirectUri: 'https://app.example.com/api/connectors/oauth/callback',
          codeVerifier: 'verifier',
          mcpUrl: 'https://mcp.example.com/mcp',
        });
        mocks.complete.mockResolvedValue({ status: 'superseded' });
      } else {
        mocks.upsert.mockResolvedValue(false);
      }
      const result = await finishConnectorAuthorization({
        request,
        userId: USER,
        state: 'state',
        code: 'code',
        iss: undefined,
        providerError: null,
      });
      expect(result.status).toBe('invalid_state');
      expect(mocks.audit).not.toHaveBeenCalled();
    },
  );
});

describe('connector authorization start host policy', () => {
  it.each([false, true])(
    'checks the trusted selected MCP host before SDK start (allowed: %s)',
    async (allowed) => {
      const endpoint = getMcpEndpoint('notion');
      if (!endpoint) throw new Error('The canonical Notion MCP endpoint is required');
      vi.mocked(getConnectorOAuthProvider).mockReturnValue(null);
      mocks.policy.mockResolvedValue({
        ...POLICY,
        allowedConnectors: ['notion'],
        allowedMcpHosts: [allowed ? new URL(endpoint.url).hostname : 'approved.example'],
      });
      mocks.begin.mockResolvedValue({
        status: 'redirect',
        authorizationUrl: 'https://authorization.example/authorize',
        state: 'state',
      });
      const input = new NextRequest(
        'https://app.example.com/api/connectors/oauth/start?connectorId=notion&mode=json',
      );

      const response = await startAuthorization(input);

      if (!allowed) expect.soft(mocks.begin).not.toHaveBeenCalled();
      expect(response.status).toBe(allowed ? 200 : 403);
      if (allowed) {
        expect(mocks.begin).toHaveBeenCalledWith(
          expect.objectContaining({ connectorId: 'notion', mcpUrl: endpoint.url }),
        );
      } else {
        await expect(response.json()).resolves.toMatchObject({ status: 'policy_blocked' });
        expect(mocks.begin).not.toHaveBeenCalled();
      }
      expect(mocks.exchange).not.toHaveBeenCalled();
      expect(mocks.complete).not.toHaveBeenCalled();
      expect(mocks.upsert).not.toHaveBeenCalled();
    },
  );
});
