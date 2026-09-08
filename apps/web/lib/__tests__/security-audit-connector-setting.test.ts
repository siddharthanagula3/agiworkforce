import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  execute: vi.fn<(...args: unknown[]) => Promise<number>>(async () => 0),
  query: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    execute: (...args: unknown[]) => mocks.execute(...args),
    query: (...args: unknown[]) => mocks.query(...args),
  }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getKeyValueStore: () => null,
}));

import { recordAuditEvent } from '../security-audit';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const INSTALLATION_ID = '987654';

function securityLogRow() {
  const call = mocks.execute.mock.calls.find((entry) =>
    String(entry[0]).includes('security_audit_logs'),
  );
  if (!call) throw new Error('no security_audit_logs insert');
  const params = call[1] as unknown[];
  return {
    userId: params[0],
    eventType: params[1],
    severity: params[2],
    endpoint: params[5],
    details: JSON.parse(String(params[6])) as Record<string, unknown>,
  };
}

function enterpriseRow() {
  const call = mocks.query.mock.calls.find((entry) =>
    String(entry[0]).includes('record_enterprise_audit_event'),
  );
  if (!call) throw new Error('no enterprise audit call');
  const params = call[1] as unknown[];
  return {
    organizationId: params[0],
    eventType: params[3],
    resourceType: params[4],
    resourceId: params[5],
    outcome: params[6],
    metadata: JSON.parse(String(params[8])) as Record<string, unknown>,
  };
}

async function recordToggle(detail: Record<string, unknown> = {}) {
  await recordAuditEvent({
    userId: 'user-1',
    eventType: 'connector_setting_changed',
    organizationId: ORGANIZATION_ID,
    severity: 'warning',
    detail: {
      resourceType: 'github_installation',
      resourceId: INSTALLATION_ID,
      connectorId: 'github',
      changedKeys: ['prReviewEnabled'],
      status: 'enabled',
      ...detail,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Enabling pull request review lets the product post to a third party on the
 * account's behalf. The grant does not change, so connector_added and
 * connector_removed both misdescribe it, which is why the vocabulary carries a
 * setting-changed event of its own.
 */
describe('connector_setting_changed', () => {
  it('writes the installation and the new value to the security log', async () => {
    await recordToggle();

    const row = securityLogRow();
    expect(row.eventType).toBe('connector_setting_changed');
    expect(row.severity).toBe('warning');
    expect(row.details).toMatchObject({
      resource_id: INSTALLATION_ID,
      connectorId: 'github',
      changedKeys: ['prReviewEnabled'],
      status: 'enabled',
    });
  });

  it('records the same event against the organization trail as a connector', async () => {
    await recordToggle();

    const row = enterpriseRow();
    expect(row.eventType).toBe('connector_setting_changed');
    expect(row.resourceId).toBe(INSTALLATION_ID);
    expect(row.outcome).toBe('success');
    expect(row.metadata).toMatchObject({ status: 'enabled' });
  });

  it('falls back to the connector resource type when the caller names none', async () => {
    await recordAuditEvent({
      userId: 'user-1',
      eventType: 'connector_setting_changed',
      organizationId: ORGANIZATION_ID,
      detail: { resourceId: INSTALLATION_ID },
    });

    expect(enterpriseRow().resourceType).toBe('connector');
  });

  it('carries the disabled value as faithfully as the enabled one', async () => {
    await recordToggle({ status: 'disabled' });

    expect(securityLogRow().details).toMatchObject({ status: 'disabled' });
  });

  it('never writes a token handed to it by mistake', async () => {
    await recordToggle({ resourceName: 'ghs_livetokenvaluethatmustnotbestored' });

    const serialized = JSON.stringify([securityLogRow().details, enterpriseRow().metadata]);
    expect(serialized).not.toContain('ghs_livetokenvaluethatmustnotbestored');
  });
});
