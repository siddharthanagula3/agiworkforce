import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(async () => undefined),
  sendSpendAlertEmail: vi.fn(async () => ({ delivered: true, providerMessageId: 'msg' })),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => {
    throw new Error('tests pass the database explicitly');
  },
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock('@/lib/services/notification-email-service', () => ({
  sendSpendAlertEmail: mocks.sendSpendAlertEmail,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { dispatchSpendAlertIfDue, dueSpendAlertKind } from '../spend-alert-service';
import type { SpendState } from '../spend-limit-service';

const ORG = '11111111-1111-4111-8111-111111111111';

function state(overrides: Partial<SpendState> = {}): SpendState {
  return {
    configured: true,
    monthlyCapCents: 10_000,
    enforcement: 'notify',
    alertThresholdPct: 80,
    spentCents: 8_500,
    usedPct: 85,
    overCap: false,
    overThreshold: true,
    ...overrides,
  };
}

function harness({ alreadySent = false } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('insert into public.organization_spend_alerts')) {
      return alreadySent ? [] : [{ period_start: '2026-09-01' }];
    }
    if (sql.includes('from public.organization_members')) {
      return [
        { user_id: 'owner-1', role: 'owner', email: 'owner@example.com', workspace_name: 'Acme' },
        { user_id: 'admin-1', role: 'admin', email: 'admin@example.com', workspace_name: 'Acme' },
        {
          user_id: 'member-1',
          role: 'member',
          email: 'member@example.com',
          workspace_name: 'Acme',
        },
        { user_id: 'admin-2', role: 'admin', email: null, workspace_name: 'Acme' },
      ];
    }
    return [];
  });
  const execute = vi.fn(async () => 1);
  return { db: { query, execute } as unknown as DatabaseAdapter, query, execute };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('dueSpendAlertKind', () => {
  it('announces nothing for an unconfigured or off limit', () => {
    expect(dueSpendAlertKind(state({ configured: false }))).toBeNull();
    expect(dueSpendAlertKind(state({ enforcement: 'off' }))).toBeNull();
    expect(dueSpendAlertKind(state({ overThreshold: false }))).toBeNull();
  });

  it('prefers the cap over the threshold once both are crossed', () => {
    expect(dueSpendAlertKind(state())).toBe('threshold');
    expect(dueSpendAlertKind(state({ overCap: true, enforcement: 'block' }))).toBe('cap');
  });
});

describe('dispatchSpendAlertIfDue', () => {
  it('emails owners and admins once, audits the crossing and records the delivery', async () => {
    const h = harness();

    const outcome = await dispatchSpendAlertIfDue(ORG, state(), h.db);

    expect(outcome).toEqual({ dispatched: true, kind: 'threshold', recipientsNotified: 2 });
    const recipients = mocks.sendSpendAlertEmail.mock.calls.map(
      (call) => (call as unknown as [{ to: string }])[0].to,
    );
    expect(recipients.sort()).toEqual(['admin@example.com', 'owner@example.com']);
    expect((mocks.sendSpendAlertEmail.mock.calls[0] as unknown as [unknown])[0]).toMatchObject({
      workspaceName: 'Acme',
      spent: '$85.00',
      cap: '$100.00',
      thresholdPct: 80,
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORG,
        eventType: 'spend_cap_exceeded',
        detail: expect.objectContaining({ status: 'threshold_reached', scope: 'notify' }),
      }),
    );
    expect(h.execute).toHaveBeenCalledWith(expect.stringContaining('set recipients_notified'), [
      ORG,
      '2026-09-01',
      'threshold',
      2,
    ]);
  });

  it('keys the send on workspace, month, kind and recipient so a retry cannot double-send', async () => {
    const h = harness();
    await dispatchSpendAlertIfDue(ORG, state({ overCap: true, enforcement: 'block' }), h.db);

    const keys = mocks.sendSpendAlertEmail.mock.calls.map(
      (call) => (call as unknown as [{ idempotencyKey: string }])[0].idempotencyKey,
    );
    expect(keys).toContain(`spend-alert:${ORG}:2026-09-01:cap:owner-1`);
  });

  it('sends nothing when the crossing was already announced this month', async () => {
    const h = harness({ alreadySent: true });

    const outcome = await dispatchSpendAlertIfDue(ORG, state(), h.db);

    expect(outcome).toEqual({ dispatched: false, reason: 'already_sent' });
    expect(mocks.sendSpendAlertEmail).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('claims nothing when no crossing is due', async () => {
    const h = harness();

    const outcome = await dispatchSpendAlertIfDue(ORG, state({ overThreshold: false }), h.db);

    expect(outcome).toEqual({ dispatched: false, reason: 'not_due' });
    expect(h.query).not.toHaveBeenCalled();
  });

  it('counts only delivered emails', async () => {
    mocks.sendSpendAlertEmail.mockResolvedValueOnce({
      delivered: false,
      reason: 'not_configured',
      detail: 'x',
    } as never);
    const h = harness();

    const outcome = await dispatchSpendAlertIfDue(ORG, state(), h.db);

    expect(outcome).toMatchObject({ dispatched: true, recipientsNotified: 1 });
  });
});
