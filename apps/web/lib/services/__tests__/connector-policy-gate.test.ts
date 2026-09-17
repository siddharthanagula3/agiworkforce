import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveActiveOrganizationId, readConnectorPolicySafely, loggerInfo, loggerError } =
  vi.hoisted(() => ({
    resolveActiveOrganizationId: vi.fn(),
    readConnectorPolicySafely: vi.fn(),
    loggerInfo: vi.fn(),
    loggerError: vi.fn(),
  }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: loggerInfo, warn: vi.fn(), error: loggerError, debug: vi.fn() },
}));
vi.mock('@/lib/services/active-workspace-service', () => ({ resolveActiveOrganizationId }));
vi.mock('@/lib/services/connector-policy-service', () => ({ readConnectorPolicySafely }));

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
  readConnectorPolicySafely.mockResolvedValue(policy());
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
    readConnectorPolicySafely.mockResolvedValue(policy({ blockedConnectors: ['github'] }));

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
    readConnectorPolicySafely.mockResolvedValue(policy({ allowedConnectors: ['notion'] }));

    const decision = await evaluateConnectorPolicyForUser({
      db,
      userId: USER,
      connectorId: 'github',
    });

    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe('connector_not_allowed');
  });

  it('refuses a custom endpoint when the workspace has switched them off', async () => {
    readConnectorPolicySafely.mockResolvedValue(policy({ allowCustomConnectors: false }));

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
    readConnectorPolicySafely.mockResolvedValue(policy({ blockedConnectors: ['github'] }));

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

  it('leaves a personal account ungoverned', async () => {
    resolveActiveOrganizationId.mockResolvedValue(null);

    const decision = await evaluateConnectorPolicyForUser({
      db,
      userId: USER,
      connectorId: 'github',
    });

    expect(decision).toMatchObject({ allowed: true, code: 'ungoverned', organizationId: null });
    expect(readConnectorPolicySafely).not.toHaveBeenCalled();
  });

  it('fails open when the policy cannot be read', async () => {
    // Deliberate, and the same reasoning readConnectorPolicySafely carries:
    // connector governance is a deployment control over which approved
    // integrations staff use, not a containment barrier. Tenancy is what stops
    // cross-workspace access and that fails closed. Denying every connection
    // over a table blip would break every member for an outage that granted
    // nobody anything.
    readConnectorPolicySafely.mockRejectedValue(new Error('database unreachable'));

    const decision = await evaluateConnectorPolicyForUser({
      db,
      userId: USER,
      connectorId: 'github',
    });

    expect(decision.allowed).toBe(true);
    expect(decision.organizationId).toBe(ORG);
    expect(loggerError).toHaveBeenCalled();
  });

  it('fails open when the workspace cannot be resolved', async () => {
    resolveActiveOrganizationId.mockRejectedValue(new Error('no workspace'));

    await expect(
      evaluateConnectorPolicyForUser({ db, userId: USER, connectorId: 'github' }),
    ).resolves.toMatchObject({ allowed: true, code: 'ungoverned' });
  });

  it('does not resolve a workspace without a user', async () => {
    const decision = await evaluateConnectorPolicyForUser({ db, userId: '', connectorId: 'x' });

    expect(decision.allowed).toBe(true);
    expect(resolveActiveOrganizationId).not.toHaveBeenCalled();
  });
});

describe('evaluateConnectorPolicyForUser with an MCP host allowlist', () => {
  it('refuses a custom endpoint on a host the workspace has not approved', async () => {
    readConnectorPolicySafely.mockResolvedValue(policy({ allowedMcpHosts: ['*.corp.example'] }));

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
    readConnectorPolicySafely.mockResolvedValue(
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
    expect(readConnectorPolicySafely).not.toHaveBeenCalled();
  });
});
