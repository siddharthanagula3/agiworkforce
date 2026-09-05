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

import { hashActionParams, mintConfirmationToken } from '../confirmation-token';
import { confirmSupportAction, proposeSupportAction } from '../service';

const USER = 'user_a';

describe('support actions, confirmation tokens are single use', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db = createFakeNeonDb();
  });

  it('refuses the second confirmation of the same proposal', async () => {
    const { proposal, confirmationToken } = await proposeSupportAction({
      db: mocks.db!.adapter,
      userId: USER,
      actionId: 'export_account_data',
      params: {},
      surface: 'web',
      conversationRef: null,
    });

    await expect(
      confirmSupportAction({
        db: mocks.db!.adapter,
        userId: USER,
        proposalId: proposal.id,
        confirmationToken,
        surface: 'web',
      }),
    ).resolves.toMatchObject({ actionId: 'export_account_data' });

    await expect(
      confirmSupportAction({
        db: mocks.db!.adapter,
        userId: USER,
        proposalId: proposal.id,
        confirmationToken,
        surface: 'web',
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_ACTION_PROPOSAL_SPENT' });
  });

  it('refuses an expired token', async () => {
    const { raw, hash } = mintConfirmationToken();
    mocks.db = createFakeNeonDb({
      proposals: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          user_id: USER,
          action_id: 'export_account_data',
          params: {},
          params_hash: hashActionParams({}),
          token_hash: hash,
          surface: 'web',
          conversation_ref: null,
          expires_at: new Date(Date.now() - 1000),
          consumed_at: null,
          outcome: 'proposed',
          created_at: new Date(),
        },
      ],
    });

    await expect(
      confirmSupportAction({
        db: mocks.db!.adapter,
        userId: USER,
        proposalId: '33333333-3333-4333-8333-333333333333',
        confirmationToken: raw,
        surface: 'web',
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_ACTION_PROPOSAL_SPENT' });
  });

  it("refuses one proposal's token presented against another proposal's id", async () => {
    const first = await proposeSupportAction({
      db: mocks.db!.adapter,
      userId: USER,
      actionId: 'export_account_data',
      params: {},
      surface: 'web',
      conversationRef: null,
    });
    const second = await proposeSupportAction({
      db: mocks.db!.adapter,
      userId: USER,
      actionId: 'open_billing_portal',
      params: {},
      surface: 'web',
      conversationRef: null,
    });

    await expect(
      confirmSupportAction({
        db: mocks.db!.adapter,
        userId: USER,
        proposalId: second.proposal.id,
        confirmationToken: first.confirmationToken,
        surface: 'web',
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_ACTION_PROPOSAL_SPENT' });

    expect(mocks.db!.proposals.every((p) => p.consumed_at === null)).toBe(true);
  });

  it('stores only a hash of the token, never the token itself', async () => {
    const { confirmationToken } = await proposeSupportAction({
      db: mocks.db!.adapter,
      userId: USER,
      actionId: 'export_account_data',
      params: {},
      surface: 'web',
      conversationRef: null,
    });

    const insert = mocks.db!.callsMatching(/insert into public\.support_action_proposals/iu)[0];
    expect(insert).toBeDefined();
    const bound = insert!.params.map((p) => String(p));
    expect(bound).not.toContain(confirmationToken);
    expect(mocks.db!.proposals[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(mocks.db!.proposals[0]!.token_hash).not.toBe(confirmationToken);
  });
});
