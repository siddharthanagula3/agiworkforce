import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const connectorRelease = vi.hoisted(() => ({ released: true }));
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/types')>()),
  connectorsReleased: () => connectorRelease.released,
}));

type ScanModule0 = typeof import('@/lib/services/connector-policy-service');

const {
  resolveActiveOrganizationId,
  readConnectorPolicy,
  loggerInfo,
  loggerError,
  connectorsAllowed,
} = vi.hoisted(() => ({
  resolveActiveOrganizationId: vi.fn(),
  readConnectorPolicy: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  connectorsAllowed: vi.fn(async () => true),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: loggerInfo, warn: vi.fn(), error: loggerError, debug: vi.fn() },
}));
vi.mock('@/lib/services/active-workspace-service', () => ({ resolveActiveOrganizationId }));
vi.mock('@/lib/services/connector-policy-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  readConnectorPolicy,
}));
vi.mock('@/lib/connectors/connector-capability', () => ({
  connectorsAllowedWithoutRequest: connectorsAllowed,
}));
vi.mock('@/lib/services/entitlement-resolution', () => ({
  ensureSeatMemberCreditAccount: vi.fn(),
  isSeatBearingBillingPlan: vi.fn(),
  resolveEffectiveSubscription: vi.fn(),
  resolveEntitlementBundle: vi.fn(),
  resolveEntitledPlanTier: vi.fn(async () => 'pro'),
}));

import {
  evaluateConnectorPolicyForUser,
  evaluatePluginPolicyForUser,
} from '../connector-policy-gate';

const ORG = 'org-1';
const USER = 'user-1';
const db = {} as Parameters<typeof evaluateConnectorPolicyForUser>[0]['db'];

function policy(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    organizationId: ORG,
    allowedConnectors: [],
    blockedConnectors: [],
    allowCustomConnectors: true,
    updatedByUserId: null,
    updatedAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveActiveOrganizationId.mockResolvedValue(ORG);
  readConnectorPolicy.mockResolvedValue(policy());
});

/**
 * The workspace connector policy was consulted only when tools were READ for a
 * chat turn. A member could complete an OAuth flow for a connector their
 * administrator forbids, have the credential exchanged and stored, and only
 * then find the tools hidden. This gate is the same question asked on the way
 * in, once, for the connect, authorize and create paths.
 */
describe('evaluateConnectorPolicyForUser', () => {
  it('refuses a blocked connector before anything is exchanged', async () => {
    readConnectorPolicy.mockResolvedValue(policy({ blockedConnectors: ['github'] }));

    const decision = await evaluateConnectorPolicyForUser({
      db,
      userId: USER,
      connectorId: 'github',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('connector_blocked');
    expect(decision.organizationId).toBe(ORG);
  });

  it('refuses a connector absent from a non-empty allowlist', async () => {
    readConnectorPolicy.mockResolvedValue(policy({ allowedConnectors: ['notion'] }));

    const decision = await evaluateConnectorPolicyForUser({
      db,
      userId: USER,
      connectorId: 'github',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('connector_not_allowed');
  });

  it('refuses a custom endpoint when the workspace has switched them off', async () => {
    readConnectorPolicy.mockResolvedValue(policy({ allowCustomConnectors: false }));

    const decision = await evaluateConnectorPolicyForUser({
      db,
      userId: USER,
      connectorId: null,
      isCustom: true,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('custom_connectors_disabled');
  });

  it('says so in the log, so a refusal is diagnosable', async () => {
    readConnectorPolicy.mockResolvedValue(policy({ blockedConnectors: ['github'] }));

    await evaluateConnectorPolicyForUser({ db, userId: USER, connectorId: 'github' });

    expect(loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({ connectorId: 'github', code: 'connector_blocked' }),
      expect.stringContaining('before any credential was exchanged'),
    );
  });

  it('allows anything under an empty policy, which is unrestricted and not deny-all', async () => {
    const decision = await evaluateConnectorPolicyForUser({
      db,
      userId: USER,
      connectorId: 'github',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe('allowed');
  });

  it('refuses to connect when the connector decision is closed', async () => {
    connectorsAllowed.mockResolvedValueOnce(false);

    const decision = await evaluateConnectorPolicyForUser({
      db,
      userId: USER,
      organizationId: ORG,
      connectorId: 'github',
      surface: 'web',
    });

    expect(decision).toMatchObject({ allowed: false, code: 'connectors_unavailable' });
    expect(connectorsAllowed).toHaveBeenCalledWith({
      userId: USER,
      organizationId: ORG,
      planTier: 'pro',
      surface: 'web',
    });
  });

  it('leaves a personal account ungoverned', async () => {
    resolveActiveOrganizationId.mockResolvedValue(null);

    const decision = await evaluateConnectorPolicyForUser({
      db,
      userId: USER,
      connectorId: 'github',
    });

    expect(decision).toMatchObject({ allowed: true, code: 'ungoverned', organizationId: null });
    expect(readConnectorPolicy).not.toHaveBeenCalled();
  });

  it('refuses a connection when the policy cannot be read', async () => {
    readConnectorPolicy.mockRejectedValue(new Error('database unreachable'));

    await expect(
      evaluateConnectorPolicyForUser({ db, userId: USER, connectorId: 'github' }),
    ).rejects.toThrow('Workspace connector policy is unavailable');
    expect(loggerError).toHaveBeenCalled();
  });

  it('refuses to connect when the workspace cannot be confirmed', async () => {
    resolveActiveOrganizationId.mockRejectedValue(new Error('no workspace'));

    await expect(
      evaluateConnectorPolicyForUser({ db, userId: USER, connectorId: 'github' }),
    ).resolves.toMatchObject({ allowed: false, code: 'connectors_unavailable' });
    expect(readConnectorPolicy).not.toHaveBeenCalled();
  });

  it('does not resolve a workspace without a user', async () => {
    await expect(
      evaluateConnectorPolicyForUser({ db, userId: '', connectorId: 'x' }),
    ).rejects.toThrow('Sign in to use connectors');
    expect(resolveActiveOrganizationId).not.toHaveBeenCalled();
  });
});

describe('evaluateConnectorPolicyForUser with an MCP host allowlist', () => {
  it('refuses a custom endpoint on a host the workspace has not approved', async () => {
    readConnectorPolicy.mockResolvedValue(policy({ allowedMcpHosts: ['*.corp.example'] }));

    const refused = await evaluateConnectorPolicyForUser({
      db,
      userId: USER,
      connectorId: null,
      isCustom: true,
      url: 'https://mcp.attacker.example/sse',
    });
    expect(refused).toMatchObject({ allowed: false, code: 'mcp_host_not_allowed' });

    const permitted = await evaluateConnectorPolicyForUser({
      db,
      userId: USER,
      connectorId: null,
      isCustom: true,
      url: 'https://tools.corp.example/mcp',
    });
    expect(permitted.allowed).toBe(true);
  });
});

describe('evaluatePluginPolicyForUser', () => {
  it('refuses a blocked plugin and one missing from a non-empty allowlist', async () => {
    readConnectorPolicy.mockResolvedValue(
      policy({ allowedPlugins: ['acme-review'], blockedPlugins: ['shadow-sync'] }),
    );

    await expect(
      evaluatePluginPolicyForUser({ db, userId: USER, pluginKey: 'shadow-sync' }),
    ).resolves.toMatchObject({ allowed: false, code: 'plugin_blocked', organizationId: ORG });
    await expect(
      evaluatePluginPolicyForUser({ db, userId: USER, pluginKey: 'other-plugin' }),
    ).resolves.toMatchObject({ allowed: false, code: 'plugin_not_allowed' });
    await expect(
      evaluatePluginPolicyForUser({ db, userId: USER, pluginKey: 'ACME-Review' }),
    ).resolves.toMatchObject({ allowed: true, code: 'allowed' });
  });

  it('leaves a personal account ungoverned without a policy read', async () => {
    const decision = await evaluatePluginPolicyForUser({
      db,
      userId: USER,
      pluginKey: 'anything',
      organizationId: null,
    });
    expect(decision).toMatchObject({ allowed: true, code: 'ungoverned' });
    expect(readConnectorPolicy).not.toHaveBeenCalled();
  });
});

describe('evaluateConnectorPolicyForUser while connectors are coming soon', () => {
  beforeEach(() => {
    connectorRelease.released = false;
  });
  afterEach(() => {
    connectorRelease.released = true;
  });

  it.each([
    ['a catalog connector', { connectorId: 'gmail' }],
    ['a custom endpoint', { connectorId: null, isCustom: true, url: 'https://mcp.example.com' }],
    ['a personal account', { connectorId: 'github', organizationId: null }],
  ])('refuses %s as coming soon, on every plan, before reading anything', async (_, input) => {
    const decision = await evaluateConnectorPolicyForUser({ db, userId: USER, ...input });

    expect(decision).toMatchObject({
      allowed: false,
      code: 'connectors_coming_soon',
      reason: 'Connectors are coming soon.',
    });
    expect(decision.reason).not.toMatch(/upgrade|unavailable/i);
    expect(resolveActiveOrganizationId).not.toHaveBeenCalled();
    expect(connectorsAllowed).not.toHaveBeenCalled();
    expect(readConnectorPolicy).not.toHaveBeenCalled();
  });

  it('leaves plugin installs to the plugin policy, since a plugin is not a connector', async () => {
    const decision = await evaluatePluginPolicyForUser({
      db,
      userId: USER,
      pluginKey: 'docs-helper',
    });

    expect(decision.allowed).toBe(true);
  });
});
