import { beforeEach, describe, expect, it, vi } from 'vitest';

type NeonModule = typeof import('@/lib/server/neon-db');
type EmailModule = typeof import('@/lib/auth/email-confirmation');
type EntitlementModule = typeof import('@/lib/services/entitlement-resolution');
type GateModule = typeof import('@/lib/feature-flags/capability-gate');
type OAuthAccessModule = typeof import('@/lib/connectors/oauth-access');
type McpModule = typeof import('@agiworkforce/mcp');
type EgressModule = typeof import('@/lib/egress-policy');

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  email: vi.fn(),
  plan: vi.fn(),
  killSwitch: vi.fn(),
  refresh: vi.fn(),
  build: vi.fn(),
  connect: vi.fn(),
  operation: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => {
  const adapter = {
    query: mocks.query,
    execute: vi.fn(async () => 0),
    transaction: async (callback: (db: unknown) => unknown) => callback(adapter),
  };
  return { ...(await importOriginal<NeonModule>()), getNeonDb: () => adapter };
});
vi.mock('@/lib/auth/email-confirmation', async (importOriginal) => ({
  ...(await importOriginal<EmailModule>()),
  readPrimaryEmailState: mocks.email,
}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<EntitlementModule>()),
  resolveEntitledPlanTier: mocks.plan,
}));
vi.mock('@/lib/feature-flags/capability-gate', async (importOriginal) => ({
  ...(await importOriginal<GateModule>()),
  readKillSwitchGate: mocks.killSwitch,
}));
vi.mock('@/lib/connectors/oauth-access', async (importOriginal) => ({
  ...(await importOriginal<OAuthAccessModule>()),
  resolveConnectorAccessToken: mocks.refresh,
}));
vi.mock('@agiworkforce/mcp', async (importOriginal) => ({
  ...(await importOriginal<McpModule>()),
  buildMcpToolCatalog: mocks.build,
  connectMcpServer: mocks.connect,
}));
vi.mock('@/lib/egress-policy', async (importOriginal) => ({
  ...(await importOriginal<EgressModule>()),
  assertResolvedPublicHostname: vi.fn(async () => undefined),
}));

import { getUserConnectorOAuthGrantSummaries } from '@/lib/connectors/oauth-store';
import {
  __resetConnectorMcpMapCacheForTests,
  evictConnectorOAuthCaches,
  loadUserConnectorCapabilityCatalog,
  withUserConnectorMcpHandle,
} from '@/lib/user-connector-tools';

const USER = 'user-stored-grant';
const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const GRANT = {
  connector_id: 'linear',
  granted_scopes: ['read'],
  access_token_expires_at: null,
  refresh_token_enc: 'test-sealed-refresh',
  connected_at: '2026-10-31T00:00:00.000Z',
  updated_at: '2026-10-31T00:00:00.000Z',
  account_key: 'default',
  account_label: null,
  account_scope: 'personal',
  is_default: true,
};
const POLICY = {
  organization_id: ORGANIZATION,
  allowed_connectors: [],
  blocked_connectors: ['linear'],
  allow_custom_connectors: true,
  allowed_plugins: [],
  blocked_plugins: [],
  allowed_mcp_hosts: [],
  allowed_web_domains: [],
  blocked_web_domains: [],
  tool_rules: [],
  updated_by_user_id: null,
  updated_at: '2026-10-31T00:00:00.000Z',
};

beforeEach(async () => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  __resetConnectorMcpMapCacheForTests();
  vi.stubEnv('CONNECTOR_MCP_SERVERS_JSON', '');
  vi.stubEnv('CONNECTOR_OAUTH_PROVIDERS_JSON', '');
  mocks.email.mockResolvedValue({ confirmed: true });
  mocks.plan.mockResolvedValue('pro');
  mocks.killSwitch.mockResolvedValue({ capabilityAllowed: () => true });
  mocks.refresh.mockResolvedValue({
    status: 'ready',
    accessToken: 'test-access',
    tokenType: 'Bearer',
    grantedScopes: ['read'],
  });
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('organization_connector_policies')) return [POLICY];
    if (sql.includes('organization_members')) return [{ organization_id: ORGANIZATION }];
    if (sql.includes('connector_oauth_grants')) return [GRANT];
    return [];
  });
  mocks.build.mockResolvedValue({
    catalog: {
      version: 1,
      generatedAt: 0,
      servers: {},
      tools: [],
      resources: [],
      resourceTemplates: [],
      prompts: [],
      apps: [],
    },
    handles: [],
  });
  mocks.connect.mockResolvedValue({
    serverName: 'linear',
    close: vi.fn(),
    catalog: { tools: [], prompts: [], resources: [], apps: [] },
  });
  mocks.operation.mockResolvedValue('opened');
  await evictConnectorOAuthCaches(USER, 'linear');
  vi.clearAllMocks();
});

const OPERATIONS = [
  [
    'capability catalog',
    () =>
      loadUserConnectorCapabilityCatalog(USER, 'linear', {
        organizationId: ORGANIZATION,
        allowSelective: true,
      }),
  ],
  [
    'MCP handle',
    () =>
      withUserConnectorMcpHandle(USER, 'linear', mocks.operation, {
        organizationId: ORGANIZATION,
        allowSelective: true,
      }),
  ],
] as const;

describe('stored connector grant discovery policy', () => {
  it.each(OPERATIONS)('blocks %s before refresh or SDK discovery', async (_label, run) => {
    await expect(getUserConnectorOAuthGrantSummaries(USER)).resolves.toMatchObject([
      { connectorId: 'linear' },
    ]);
    const outcome = await run().then(
      () => null,
      (error: unknown) => error,
    );

    expect.soft(outcome).toMatchObject({ statusCode: 403 });
    expect.soft(mocks.refresh).not.toHaveBeenCalled();
    expect.soft(mocks.build).not.toHaveBeenCalled();
    expect.soft(mocks.connect).not.toHaveBeenCalled();
  });

  it.each(OPERATIONS)('refuses %s when its policy cannot be read', async (_label, run) => {
    await expect(getUserConnectorOAuthGrantSummaries(USER)).resolves.toMatchObject([
      { connectorId: 'linear' },
    ]);
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('organization_connector_policies')) throw new Error('policy unavailable');
      if (sql.includes('organization_members')) return [{ organization_id: ORGANIZATION }];
      if (sql.includes('connector_oauth_grants')) return [GRANT];
      return [];
    });
    const outcome = await run().then(
      () => null,
      (error: unknown) => error,
    );

    expect.soft(outcome).toMatchObject({ statusCode: 503 });
    expect.soft(mocks.refresh).not.toHaveBeenCalled();
    expect.soft(mocks.build).not.toHaveBeenCalled();
    expect.soft(mocks.connect).not.toHaveBeenCalled();
  });
});

describe('stored connector grant account eligibility', () => {
  const refusals = [
    ['unconfirmed email', () => mocks.email.mockResolvedValue({ confirmed: false })],
    ['free plan', () => mocks.plan.mockResolvedValue('free')],
    ['unreadable plan', () => mocks.plan.mockRejectedValue(new Error('plan unavailable'))],
    [
      'closed kill switch',
      () => mocks.killSwitch.mockResolvedValue({ capabilityAllowed: () => false }),
    ],
    [
      'unreadable kill switch',
      () => mocks.killSwitch.mockRejectedValue(new Error('kill switch unavailable')),
    ],
  ] as const;
  describe.each(OPERATIONS)('%s', (_label, run) => {
    it.each(refusals)('refuses %s before refresh or SDK access', async (_reason, refuse) => {
      mocks.query.mockImplementation(async (sql: string) => {
        if (sql.includes('organization_connector_policies'))
          return [{ ...POLICY, blocked_connectors: [] }];
        if (sql.includes('organization_members')) return [{ organization_id: ORGANIZATION }];
        if (sql.includes('connector_oauth_grants')) return [GRANT];
        return [];
      });
      await expect(getUserConnectorOAuthGrantSummaries(USER)).resolves.toMatchObject([
        { connectorId: 'linear' },
      ]);
      refuse();

      await expect(run()).rejects.toMatchObject({ statusCode: 403 });
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(mocks.build).not.toHaveBeenCalled();
      expect(mocks.connect).not.toHaveBeenCalled();
      expect(mocks.operation).not.toHaveBeenCalled();
    });
  });

  it.each(OPERATIONS)(
    'permits %s after an allowed policy with the stored grant',
    async (label, run) => {
      mocks.query.mockImplementation(async (sql: string) => {
        if (sql.includes('organization_connector_policies'))
          return [{ ...POLICY, blocked_connectors: [] }];
        if (sql.includes('organization_members')) return [{ organization_id: ORGANIZATION }];
        if (sql.includes('connector_oauth_grants')) return [GRANT];
        return [];
      });
      await expect(getUserConnectorOAuthGrantSummaries(USER)).resolves.toMatchObject([
        { connectorId: 'linear' },
      ]);

      const result = await run();

      expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith(USER, 'linear');
      if (label === 'capability catalog') {
        expect(result).toMatchObject({ connectorId: 'linear' });
        expect(mocks.build).toHaveBeenCalledTimes(1);
      } else {
        expect(result).toBe('opened');
        expect(mocks.connect).toHaveBeenCalledTimes(1);
        expect(mocks.operation).toHaveBeenCalledTimes(1);
      }
    },
  );
});

describe('curated discovery host-policy classification', () => {
  it.each(OPERATIONS)(
    'retains the existing curated %s classification and trusted target URL',
    async (_label, run) => {
      const gate = await import('@/lib/services/connector-policy-gate');
      const evaluate = vi.spyOn(gate, 'evaluateConnectorPolicyForUser');
      const { getMcpEndpoint } = await import('@/lib/connectors/mcp-endpoints');
      mocks.query.mockImplementation(async (sql: string) => {
        if (sql.includes('organization_connector_policies'))
          return [{ ...POLICY, blocked_connectors: [], allowed_mcp_hosts: ['approved.example'] }];
        if (sql.includes('organization_members')) return [{ organization_id: ORGANIZATION }];
        if (sql.includes('connector_oauth_grants')) return [GRANT];
        return [];
      });
      try {
        await run();
        expect(evaluate).toHaveBeenCalledWith(
          expect.objectContaining({
            connectorId: 'linear',
            isCustom: false,
            url: getMcpEndpoint('linear')?.url,
          }),
        );
        expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith(USER, 'linear');
      } finally {
        evaluate.mockRestore();
      }
    },
  );
});
