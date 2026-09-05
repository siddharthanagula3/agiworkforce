import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFakeNeonDb } from './helpers/fake-neon-db';

const mocks = vi.hoisted(() => ({
  db: null as ReturnType<typeof import('./helpers/fake-neon-db').createFakeNeonDb> | null,
  warn: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: mocks.warn, error: vi.fn(), debug: vi.fn() },
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

import { EXCLUDED_SUPPORT_ACTION_IDS, EXCLUDED_SUPPORT_ACTIONS } from '../excluded';
import { SUPPORT_ACTIONS } from '../registry';
import { listAvailableSupportActions, proposeSupportAction } from '../service';
import { SUPPORT_ACTION_IDS } from '../types';

describe('support actions, the exclusion list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db = createFakeNeonDb();
  });

  it('names the five destructive operations the brief forbids', () => {
    expect([...EXCLUDED_SUPPORT_ACTION_IDS].sort()).toEqual(
      [
        'cancel_subscription',
        'change_plan',
        'delete_account',
        'remove_member',
        'transfer_ownership',
      ].sort(),
    );
  });

  it('shares no id with the allowlist', () => {
    const allowed = new Set<string>(SUPPORT_ACTION_IDS);
    for (const id of EXCLUDED_SUPPORT_ACTION_IDS) {
      expect(allowed.has(id)).toBe(false);
    }
    expect(Object.keys(SUPPORT_ACTIONS).sort()).toEqual([...SUPPORT_ACTION_IDS].sort());
  });

  it('never lists an excluded id as available', () => {
    const listed = listAvailableSupportActions();
    const offered = new Set([
      ...listed.actions.map((a) => a.id as string),
      ...listed.unavailable.map((a) => a.id as string),
    ]);
    for (const id of EXCLUDED_SUPPORT_ACTION_IDS) {
      expect(offered.has(id)).toBe(false);
    }
    expect(listed.excluded.map((e) => e.id).sort()).toEqual(
      [...EXCLUDED_SUPPORT_ACTION_IDS].sort(),
    );
    for (const entry of listed.excluded) {
      expect(entry.control.href).toMatch(/^\//u);
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });

  it.each([...EXCLUDED_SUPPORT_ACTION_IDS])(
    'refuses to propose %s, and records no proposal',
    async (id) => {
      await expect(
        proposeSupportAction({
          db: mocks.db!.adapter,
          userId: 'user_a',
          actionId: id,
          params: {},
          surface: 'web',
          conversationRef: null,
        }),
      ).rejects.toMatchObject({
        code: 'SUPPORT_ACTION_EXCLUDED',
        control: EXCLUDED_SUPPORT_ACTIONS[id].control,
      });

      expect(mocks.db!.proposals).toHaveLength(0);
      expect(mocks.db!.calls).toHaveLength(0);

      expect(mocks.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'support_action_refused',
          reason: 'excluded',
          requestedActionId: id,
          userId: 'user_a',
        }),
        expect.any(String),
      );
    },
  );

  it('refuses an id that is in neither list', async () => {
    await expect(
      proposeSupportAction({
        db: mocks.db!.adapter,
        userId: 'user_a',
        actionId: 'drop_all_tables',
        params: {},
        surface: 'web',
        conversationRef: null,
      }),
    ).rejects.toMatchObject({ code: 'SUPPORT_ACTION_UNKNOWN' });
    expect(mocks.db!.calls).toHaveLength(0);
    expect(mocks.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'support_action_refused',
        reason: 'unknown_action',
        requestedActionId: 'drop_all_tables',
      }),
      expect.any(String),
    );
  });

  it('refuses to remove a custom MCP connector, because that deletes its stored credential', async () => {
    await expect(
      proposeSupportAction({
        db: mocks.db!.adapter,
        userId: 'user_a',
        actionId: 'revoke_connector',
        params: { connectorId: 'custom-abc123' },
        surface: 'web',
        conversationRef: null,
      }),
    ).rejects.toMatchObject({
      code: 'SUPPORT_ACTION_EXCLUDED',
      control: { href: '/settings/connections' },
    });
    expect(mocks.db!.proposals).toHaveLength(0);
  });
});
