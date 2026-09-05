import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeNeonDb } from './helpers/fake-neon-db';

const mocks = vi.hoisted(() => ({
  db: null as ReturnType<typeof import('./helpers/fake-neon-db').createFakeNeonDb> | null,
  recordAuditEvent: vi.fn(async () => {}),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => mocks.db!.adapter }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: vi.fn(async () => ({ plan_tier: 'pro', status: 'active' })),
  },
}));
vi.mock('@/lib/services/managed-usage-summary-service', () => ({
  getManagedUsageSummary: vi.fn(async () => {
    throw new Error('usage unavailable in this test');
  }),
}));
vi.mock('@/lib/user-connector-tools', () => ({
  getOperatorMappedConnectorIds: () => new Set(['slack', 'notion']),
  getUserGithubInstallations: vi.fn(async () => []),
  getUserCustomConnectorSummaries: vi.fn(async () => []),
}));

import { hashActionParams, mintConfirmationToken } from '../confirmation-token';
import { confirmSupportAction, proposeSupportAction } from '../service';
import { SupportActionRefusal } from '../types';

const USER_A = 'user_a';
const USER_B = 'user_b';

describe('support actions, cross-account refusal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db = createFakeNeonDb();
  });

  it('refuses to propose a connector revoke for a connector the caller does not have', async () => {
    mocks.db = createFakeNeonDb({ connectors: [] });

    await expect(
      proposeSupportAction({
        db: mocks.db!.adapter,
        userId: USER_A,
        actionId: 'revoke_connector',
        params: { connectorId: 'slack' },
        surface: 'web',
        conversationRef: null,
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_ACTION_TARGET_NOT_FOUND' });

    expect(mocks.db!.proposals).toHaveLength(0);
    expect(mocks.db!.callsMatching(/update user_connectors/iu)).toHaveLength(0);
  });

  it('refuses to propose an API key regeneration for a key owned by someone else', async () => {
    mocks.db = createFakeNeonDb({
      apiKeys: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          user_id: USER_B,
          name: 'B key',
          scopes: ['chat'],
          revoked_at: null,
        },
      ],
    });

    await expect(
      proposeSupportAction({
        db: mocks.db!.adapter,
        userId: USER_A,
        actionId: 'regenerate_api_key',
        params: { keyId: '11111111-1111-4111-8111-111111111111' },
        surface: 'web',
        conversationRef: null,
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_ACTION_TARGET_NOT_FOUND' });

    expect(mocks.db!.proposals).toHaveLength(0);
    expect(mocks.db!.callsMatching(/update api_keys set revoked_at/iu)).toHaveLength(0);
    expect(mocks.db!.callsMatching(/insert into api_keys/iu)).toHaveLength(0);

    const read = mocks.db!.callsMatching(/select id, name, scopes from public\.api_keys/iu)[0];
    expect(read).toBeDefined();
    expect(read!.sql.replace(/\s+/gu, ' ')).toContain('user_id = $2');
    expect(read!.params[1]).toBe(USER_A);
  });

  it('refuses a confirmation token minted for another user and leaves the proposal unspent', async () => {
    const { raw, hash } = mintConfirmationToken();
    const params = {};
    mocks.db = createFakeNeonDb({
      proposals: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          user_id: USER_A,
          action_id: 'export_account_data',
          params,
          params_hash: hashActionParams(params),
          token_hash: hash,
          surface: 'web',
          conversation_ref: null,
          expires_at: new Date(Date.now() + 60_000),
          consumed_at: null,
          outcome: 'proposed',
          created_at: new Date(),
        },
      ],
    });

    await expect(
      confirmSupportAction({
        db: mocks.db!.adapter,
        userId: USER_B,
        proposalId: '22222222-2222-4222-8222-222222222222',
        confirmationToken: raw,
        surface: 'web',
      }),
    ).rejects.toBeInstanceOf(SupportActionRefusal);

    expect(mocks.db!.proposals[0]!.consumed_at).toBeNull();
    expect(mocks.db!.proposals[0]!.outcome).toBe('proposed');

    const claim = mocks.db!.callsMatching(/update public\.support_action_proposals/iu)[0];
    expect(claim).toBeDefined();
    const claimSql = claim!.sql.replace(/\s+/gu, ' ');
    expect(claimSql).toContain('id = $1');
    expect(claimSql).toContain('user_id = $2');
    expect(claimSql).toContain('token_hash = $3');
    expect(claimSql).toContain('consumed_at is null');
    expect(claimSql).toContain('expires_at > now()');
    expect(claim!.params[1]).toBe(USER_B);
  });

  it('scopes the daily proposal count to the caller', async () => {
    mocks.db = createFakeNeonDb({ connectors: [] });
    await expect(
      proposeSupportAction({
        db: mocks.db!.adapter,
        userId: USER_A,
        actionId: 'export_account_data',
        params: {},
        surface: 'web',
        conversationRef: null,
      }),
    ).resolves.toBeDefined();

    const count = mocks.db!.callsMatching(
      /select count\(\*\) as count from public\.support_action_proposals/iu,
    )[0];
    expect(count).toBeDefined();
    expect(count!.sql.replace(/\s+/gu, ' ')).toContain('user_id = $1');
    expect(count!.params[0]).toBe(USER_A);
    expect(mocks.db!.proposals[0]!.user_id).toBe(USER_A);
  });
});
