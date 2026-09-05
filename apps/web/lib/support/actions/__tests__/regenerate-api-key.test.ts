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
  getOperatorMappedConnectorIds: () => new Set<string>(),
  getUserGithubInstallations: vi.fn(async () => []),
  getUserCustomConnectorSummaries: vi.fn(async () => []),
}));
vi.mock('argon2', () => ({
  default: {
    argon2id: 2,
    hash: vi.fn(async (raw: string) => `hashed:${raw.slice(0, 12)}`),
    verify: vi.fn(async () => true),
  },
}));

import { confirmSupportAction, proposeSupportAction } from '../service';

const USER = 'user_a';
const KEY_ID = '66666666-6666-4666-8666-666666666666';

describe('support actions, regenerate_api_key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db = createFakeNeonDb({
      apiKeys: [
        {
          id: KEY_ID,
          user_id: USER,
          name: 'Deploy bot',
          scopes: ['inference:write'],
          revoked_at: null,
        },
      ],
    });
  });

  it('revokes the old key and issues one with the same name and the same scopes', async () => {
    const { proposal, confirmationToken } = await proposeSupportAction({
      db: mocks.db!.adapter,
      userId: USER,
      actionId: 'regenerate_api_key',
      params: { keyId: KEY_ID },
      surface: 'web',
      conversationRef: null,
    });

    expect(proposal.summary).toContain('revoke');
    expect(proposal.effects.join(' ')).toContain('same name and exactly the same scopes');

    const { result } = await confirmSupportAction({
      db: mocks.db!.adapter,
      userId: USER,
      proposalId: proposal.id,
      confirmationToken,
      surface: 'web',
    });

    expect(result.kind).toBe('secret_once');
    if (result.kind !== 'secret_once') throw new Error('unreachable');
    expect(result.fullKey).toMatch(/^sk_live_[0-9a-f]{16}_[0-9a-f]{48}$/u);
    expect(result.doNotPersist).toBe(true);

    const insert = mocks.db!.callsMatching(/insert into api_keys/iu)[0];
    expect(insert).toBeDefined();
    expect(insert!.params[0]).toBe(USER);
    expect(insert!.params[1]).toBe('Deploy bot');
    expect(insert!.params[4]).toEqual(['inference:write']);

    const revoked = mocks.db!.apiKeys.find((k) => k.id === KEY_ID);
    expect(revoked!.revoked_at).not.toBeNull();
  });

  it('never lets a caller choose the scopes of the replacement', async () => {
    await expect(
      proposeSupportAction({
        db: mocks.db!.adapter,
        userId: USER,
        actionId: 'regenerate_api_key',
        params: { keyId: KEY_ID, scopes: ['inference:write', 'models:read'] },
        surface: 'web',
        conversationRef: null,
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_ACTION_INVALID_PARAMS' });

    expect(mocks.db!.proposals).toHaveLength(0);
  });
});
