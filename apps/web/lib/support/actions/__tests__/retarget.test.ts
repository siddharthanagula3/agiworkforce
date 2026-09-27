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

import { hashActionParams } from '../confirmation-token';
process.env['CSRF_SECRET'] = 'support-retarget-step-up-secret-long-enough';

import { STEP_UP_TOKEN_HEADER } from '@/lib/server/step-up-auth';
import { createStepUpGrant } from '@/lib/server/step-up/grant-token';
import { confirmSupportAction, proposeSupportAction } from '../service';

const USER = 'user_a';
const KEY_ID = '44444444-4444-4444-8444-444444444444';

describe('support actions, a proposal cannot be swapped for a different effect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db = createFakeNeonDb({
      apiKeys: [
        {
          id: KEY_ID,
          user_id: USER,
          name: 'CI key',
          scopes: ['inference:write'],
          revoked_at: null,
        },
      ],
    });
  });

  it('confirming a billing-portal proposal never touches API keys', async () => {
    const { proposal, confirmationToken } = await proposeSupportAction({
      db: mocks.db!.adapter,
      userId: USER,
      actionId: 'open_billing_portal',
      params: {},
      surface: 'web',
      conversationRef: null,
    });

    const { actionId, result } = await confirmSupportAction({
      db: mocks.db!.adapter,
      userId: USER,
      proposalId: proposal.id,
      confirmationToken,
      surface: 'web',
    });

    expect(actionId).toBe('open_billing_portal');
    expect(result).toMatchObject({
      kind: 'handoff',
      request: { method: 'POST', path: '/api/portal' },
    });
    expect(mocks.db!.callsMatching(/update api_keys set revoked_at/iu)).toHaveLength(0);
    expect(mocks.db!.callsMatching(/insert into api_keys/iu)).toHaveLength(0);
    expect(mocks.db!.apiKeys[0]!.revoked_at).toBeNull();
  });

  it('refuses to execute when the stored parameters no longer match their recorded hash', async () => {
    const { proposal, confirmationToken } = await proposeSupportAction({
      db: mocks.db!.adapter,
      userId: USER,
      actionId: 'regenerate_api_key',
      params: { keyId: KEY_ID },
      surface: 'web',
      conversationRef: null,
    });

    const row = mocks.db!.proposals.find((p) => p.id === proposal.id)!;
    row.params = { keyId: '55555555-5555-4555-8555-555555555555' };
    expect(hashActionParams(row.params)).not.toBe(row.params_hash);

    const revealProof = createStepUpGrant({
      userId: USER,
      action: 'api_credential.reveal',
      resourceId: proposal.id,
      method: 'first_factor',
    }).token;

    await expect(
      confirmSupportAction({
        db: mocks.db!.adapter,
        userId: USER,
        proposalId: proposal.id,
        confirmationToken,
        surface: 'web',
        request: new Request('http://localhost/api/support/actions/confirm', {
          method: 'POST',
          headers: { [STEP_UP_TOKEN_HEADER]: revealProof },
        }),
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_ACTION_INVALID_PARAMS' });

    expect(mocks.db!.callsMatching(/update api_keys set revoked_at/iu)).toHaveLength(0);
    expect(row.consumed_at).not.toBeNull();
    expect(row.outcome).toBe('denied');
  });
});
