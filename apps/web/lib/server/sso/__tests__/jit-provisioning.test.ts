import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockRecordAuditEvent } = vi.hoisted(() => ({
  mockRecordAuditEvent: vi.fn(async (_event: unknown) => undefined),
}));

vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mockRecordAuditEvent }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { emailBelongsToDomain, provisionEnterpriseSignIn } from '../jit-provisioning';

const ORG = '11111111-1111-4111-8111-111111111111';

function connection(over: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    organization_id: ORG,
    domain: 'acme.test',
    clerk_connection_id: 'econ_1',
    jit_default_role: 'member',
    ...over,
  };
}

function fakeDb(handlers: { connections?: unknown[]; insert?: () => unknown[] }) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    db: {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        calls.push({ sql, params });
        if (/from public\.sso_connections/.test(sql)) return handlers.connections ?? [];
        if (/insert into public\.organization_members/.test(sql)) {
          return handlers.insert ? handlers.insert() : [{ user_id: 'user-1' }];
        }
        return [];
      }),
      execute: vi.fn(),
      transaction: vi.fn(),
    },
  };
}

const enterpriseUser = {
  id: 'user-1',
  enterpriseAccounts: [{ connectionId: 'econ_1', emailAddress: 'ada@acme.test', active: true }],
};

beforeEach(() => {
  mockRecordAuditEvent.mockClear();
});

describe('single sign-on just-in-time provisioning', () => {
  it('joins a first-time enterprise sign-in to the verified-domain workspace with its default role', async () => {
    const { db, calls } = fakeDb({ connections: [connection({ jit_default_role: 'viewer' })] });

    const results = await provisionEnterpriseSignIn(db as never, enterpriseUser);

    expect(results).toEqual([
      { organizationId: ORG, connectionId: 'conn-1', role: 'viewer', outcome: 'joined' },
    ]);
    const lookup = calls.find((call) => /from public\.sso_connections/.test(call.sql));
    expect(lookup?.sql).toMatch(/domain_verified_at is not null/);
    expect(lookup?.sql).toMatch(/jit_provisioning_enabled = true/);
    const insert = calls.find((call) => /insert into public\.organization_members/.test(call.sql));
    expect(insert?.sql).toMatch(/'sso_jit'/);
    expect(insert?.params).toEqual([ORG, 'user-1', 'viewer']);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'sso_jit_membership_granted', organizationId: ORG }),
    );
  });

  it('leaves an existing member untouched and records nothing', async () => {
    const { db } = fakeDb({ connections: [connection()], insert: () => [] });

    const results = await provisionEnterpriseSignIn(db as never, enterpriseUser);

    expect(results[0]?.outcome).toBe('already_member');
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses an account whose email is outside the connection domain', async () => {
    const { db, calls } = fakeDb({ connections: [connection()] });

    const results = await provisionEnterpriseSignIn(db as never, {
      id: 'user-1',
      enterpriseAccounts: [
        { connectionId: 'econ_1', emailAddress: 'ada@acme.test.evil', active: true },
      ],
    });

    expect(results).toEqual([]);
    expect(calls.some((call) => /insert into/.test(call.sql))).toBe(false);
  });

  it('asks nothing of the database for a password or social sign-in', async () => {
    const { db } = fakeDb({ connections: [connection()] });

    await expect(
      provisionEnterpriseSignIn(db as never, {
        id: 'user-1',
        enterpriseAccounts: [
          { connectionId: 'econ_1', emailAddress: 'a@acme.test', active: false },
        ],
      }),
    ).resolves.toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('audits a refusal when the workspace has no seat left instead of failing sign-in', async () => {
    const { db } = fakeDb({
      connections: [connection()],
      insert: () => {
        throw Object.assign(new Error('check violation'), {
          code: '23514',
          constraint: 'organizations_seats_within_license',
        });
      },
    });

    const results = await provisionEnterpriseSignIn(db as never, enterpriseUser);

    expect(results[0]?.outcome).toBe('seat_limit');
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'sso_jit_membership_refused', outcome: 'denied' }),
    );
  });

  it('matches the domain and its subdomains only', () => {
    expect(emailBelongsToDomain('a@acme.test', 'acme.test')).toBe(true);
    expect(emailBelongsToDomain('a@eu.acme.test', 'acme.test')).toBe(true);
    expect(emailBelongsToDomain('a@notacme.test', 'acme.test')).toBe(false);
    expect(emailBelongsToDomain('acme.test', 'acme.test')).toBe(false);
  });
});
