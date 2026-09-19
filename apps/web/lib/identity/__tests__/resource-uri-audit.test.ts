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

import { recordAuditEvent } from '../../security-audit';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '2f1c8a64-9d3b-4f7a-8e21-0b5d6c7a8f90';

function securityDetails(): Record<string, unknown> {
  const call = mocks.execute.mock.calls.find((entry) =>
    String(entry[0]).includes('security_audit_logs'),
  );
  if (!call) throw new Error('no security_audit_logs insert');
  return JSON.parse(String((call[1] as unknown[])[6])) as Record<string, unknown>;
}

function enterpriseMetadata(): Record<string, unknown> {
  const call = mocks.query.mock.calls.find((entry) =>
    String(entry[0]).includes('record_enterprise_audit_event'),
  );
  if (!call) throw new Error('no enterprise audit call');
  return JSON.parse(String((call[1] as unknown[])[8])) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.execute.mockClear();
  mocks.query.mockClear();
});

describe('an audit event addresses its resource canonically', () => {
  it('writes the agi uri on both trails when the resource is a registered concept', async () => {
    await recordAuditEvent({
      userId: 'user-1',
      eventType: 'project_shared',
      organizationId: ORGANIZATION_ID,
      detail: { resourceType: 'project', resourceId: PROJECT_ID },
    });

    const uri = `agi://project/${PROJECT_ID}?workspace=${ORGANIZATION_ID}`;
    expect(securityDetails()['resource_uri']).toBe(uri);
    expect(enterpriseMetadata()['resourceUri']).toBe(uri);
  });

  it('leaves the uri off a resource the concept registry does not name', async () => {
    await recordAuditEvent({
      userId: 'user-1',
      eventType: 'legal_hold_created',
      organizationId: ORGANIZATION_ID,
      detail: { resourceType: 'legal_hold', resourceId: PROJECT_ID },
    });

    expect(securityDetails()['resource_uri']).toBeUndefined();
    expect(enterpriseMetadata()['resourceUri']).toBeUndefined();
  });

  it('leaves the uri off an id that is not a canonical AGI id', async () => {
    await recordAuditEvent({
      userId: 'user-1',
      eventType: 'connector_added',
      detail: { resourceType: 'connector', resourceId: 'projects/1234/operations/abc' },
    });

    expect(securityDetails()['resource_uri']).toBeUndefined();
  });
});
