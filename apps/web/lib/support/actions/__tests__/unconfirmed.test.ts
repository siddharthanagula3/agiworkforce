import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeNeonDb } from './helpers/fake-neon-db';

const mocks = vi.hoisted(() => ({
  db: null as ReturnType<typeof import('./helpers/fake-neon-db').createFakeNeonDb> | null,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mocks.db!.adapter }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: vi.fn(async () => ({ plan_tier: 'pro', status: 'active' })),
  },
}));
vi.mock('@/lib/services/managed-usage-summary-service', () => ({
  getManagedUsageSummary: vi.fn(async () => null),
}));
vi.mock('@/lib/user-connector-tools', () => ({
  getOperatorMappedConnectorIds: () => new Set(['slack']),
  getUserGithubInstallations: vi.fn(async () => []),
  getUserCustomConnectorSummaries: vi.fn(async () => []),
}));

import { confirmSupportAction, proposeSupportAction } from '../service';

const USER = 'user_a';

function seedWithSlack() {
  return createFakeNeonDb({
    connectors: [{ id: 'row-1', connector_id: 'slack', connected_at: new Date().toISOString() }],
  });
}

describe('support actions, nothing runs without a confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db = seedWithSlack();
  });

  it('proposing a connector revoke changes nothing', async () => {
    const { proposal, confirmationToken } = await proposeSupportAction({
      db: mocks.db!.adapter,
      userId: USER,
      actionId: 'revoke_connector',
      params: { connectorId: 'slack' },
      surface: 'web',
      conversationRef: null,
    });

    expect(proposal.actionId).toBe('revoke_connector');
    expect(confirmationToken).toEqual(expect.any(String));

    expect(mocks.db!.callsMatching(/update user_connectors set is_active = false/iu)).toHaveLength(
      0,
    );
    expect(
      mocks.db!.callsMatching(/delete from public\.connector_tool_permissions/iu),
    ).toHaveLength(0);
    expect(mocks.db!.connectors.map((c) => c.connector_id)).toEqual(['slack']);
  });

  it('confirming with a token that was never issued executes nothing', async () => {
    const { proposal } = await proposeSupportAction({
      db: mocks.db!.adapter,
      userId: USER,
      actionId: 'revoke_connector',
      params: { connectorId: 'slack' },
      surface: 'web',
      conversationRef: null,
    });

    await expect(
      confirmSupportAction({
        db: mocks.db!.adapter,
        userId: USER,
        proposalId: proposal.id,
        confirmationToken: 'not-the-token-that-was-issued',
        surface: 'web',
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_ACTION_PROPOSAL_SPENT' });

    expect(mocks.db!.callsMatching(/update user_connectors set is_active = false/iu)).toHaveLength(
      0,
    );
    expect(mocks.db!.connectors.map((c) => c.connector_id)).toEqual(['slack']);
    expect(mocks.db!.proposals[0]!.consumed_at).toBeNull();
  });

  it('executes only after the issued token is presented', async () => {
    const { proposal, confirmationToken } = await proposeSupportAction({
      db: mocks.db!.adapter,
      userId: USER,
      actionId: 'revoke_connector',
      params: { connectorId: 'slack' },
      surface: 'web',
      conversationRef: null,
    });

    const { result } = await confirmSupportAction({
      db: mocks.db!.adapter,
      userId: USER,
      proposalId: proposal.id,
      confirmationToken,
      surface: 'web',
    });

    expect(result.kind).toBe('completed');
    expect(
      mocks.db!.callsMatching(/update user_connectors set is_active = false/iu).length,
    ).toBeGreaterThan(0);
    expect(
      mocks.db!.callsMatching(/delete from public\.connector_tool_permissions/iu).length,
    ).toBeGreaterThan(0);
    expect(mocks.db!.proposals[0]!.outcome).toBe('success');
  });
});
