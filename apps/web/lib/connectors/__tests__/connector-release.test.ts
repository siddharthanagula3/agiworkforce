import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const connectorRelease = vi.hoisted(() => ({ released: false }));
vi.mock('@agiworkforce/types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/types')>()),
  connectorsReleased: () => connectorRelease.released,
}));

const mocks = vi.hoisted(() => ({
  readKillSwitchGate: vi.fn(async () => ({ capabilityAllowed: () => true })),
  validateHttpsMcpUrl: vi.fn(),
  evaluateConnectorPolicyForUser: vi.fn(),
  consumePendingAuthorization: vi.fn(),
  upsertConnectorOAuthGrant: vi.fn(),
  exchangeAuthorizationCode: vi.fn(),
  completeMcpAuthorization: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/feature-flags/capability-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/feature-flags/capability-gate')>()),
  readKillSwitchGate: mocks.readKillSwitchGate,
}));
vi.mock('@/lib/mcp-url-validation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mcp-url-validation')>()),
  validateHttpsMcpUrl: mocks.validateHttpsMcpUrl,
}));
vi.mock('@/lib/services/connector-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/connector-policy-gate')>()),
  evaluateConnectorPolicyForUser: mocks.evaluateConnectorPolicyForUser,
}));
vi.mock('@/lib/connectors/oauth-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/oauth-store')>()),
  consumePendingAuthorization: mocks.consumePendingAuthorization,
  upsertConnectorOAuthGrant: mocks.upsertConnectorOAuthGrant,
}));
vi.mock('@/lib/connectors/oauth-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/oauth-client')>()),
  exchangeAuthorizationCode: mocks.exchangeAuthorizationCode,
}));
vi.mock('@/lib/connectors/mcp-discovery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connectors/mcp-discovery')>()),
  completeMcpAuthorization: mocks.completeMcpAuthorization,
}));

import {
  assertConnectorsReleased,
  connectorsAllowedForTurn,
  connectorsAllowedWithoutRequest,
} from '../connector-capability';
import { createCustomConnector } from '../custom-connector-creation';
import { finishConnectorAuthorization } from '../finish-authorization';

const USER = 'user-1';
const PLANS = ['free', 'basic', 'pro', 'max', 'enterprise'] as const;
const COMING_SOON = 'Connectors are coming soon.';

function request(): NextRequest {
  return new Request('https://agiworkforce.com/api/connectors') as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectorRelease.released = false;
});

afterEach(() => {
  connectorRelease.released = false;
});

describe('the connector release switch at the shared gates', () => {
  it.each(PLANS)(
    'withholds connectors from a %s chat turn without asking the kill switch',
    async (plan) => {
      await expect(
        connectorsAllowedForTurn(request(), USER, { subscriptionTier: plan, chatSurface: 'web' }),
      ).resolves.toBe(false);
      expect(mocks.readKillSwitchGate).not.toHaveBeenCalled();
    },
  );

  it.each(PLANS)('withholds connectors from %s background work', async (plan) => {
    await expect(
      connectorsAllowedWithoutRequest({ userId: USER, organizationId: null, planTier: plan }),
    ).resolves.toBe(false);
    expect(mocks.readKillSwitchGate).not.toHaveBeenCalled();
  });

  it('opens the same gates once connectors are released, so the switch is what refused', async () => {
    connectorRelease.released = true;

    await expect(
      connectorsAllowedForTurn(request(), USER, { subscriptionTier: 'pro', chatSurface: 'web' }),
    ).resolves.toBe(true);
    await expect(
      connectorsAllowedWithoutRequest({ userId: USER, organizationId: null, planTier: 'pro' }),
    ).resolves.toBe(true);
    expect(mocks.readKillSwitchGate).toHaveBeenCalledTimes(2);
  });

  it('refuses a direct entry point with a plain coming-soon message, not an upgrade', () => {
    expect(() => assertConnectorsReleased()).toThrow(
      expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN', message: COMING_SOON }),
    );
  });
});

describe('the connector release switch at the connect paths', () => {
  it('refuses a custom connector before its address is looked up or the policy is read', async () => {
    await expect(
      createCustomConnector({} as Parameters<typeof createCustomConnector>[0], {
        userId: USER,
        request: request(),
        name: 'Example',
        url: 'https://mcp.example.com/mcp',
      }),
    ).rejects.toMatchObject({ statusCode: 403, message: COMING_SOON });
    expect(mocks.validateHttpsMcpUrl).not.toHaveBeenCalled();
    expect(mocks.evaluateConnectorPolicyForUser).not.toHaveBeenCalled();
  });

  it('spends a pending authorization without exchanging its code', async () => {
    mocks.consumePendingAuthorization.mockResolvedValue({
      connectorId: 'gmail',
      returnPath: '/settings/connectors',
      mcpUrl: null,
    });

    const outcome = await finishConnectorAuthorization({
      request: request(),
      userId: USER,
      state: 'state-1',
      code: 'code-1',
      iss: undefined,
      providerError: null,
    });

    expect(outcome).toEqual({
      returnPath: '/settings/connectors',
      connectorId: 'gmail',
      status: 'unavailable',
    });
    expect(mocks.consumePendingAuthorization).toHaveBeenCalledWith('state-1', USER);
    expect(mocks.exchangeAuthorizationCode).not.toHaveBeenCalled();
    expect(mocks.completeMcpAuthorization).not.toHaveBeenCalled();
    expect(mocks.upsertConnectorOAuthGrant).not.toHaveBeenCalled();
  });
});
