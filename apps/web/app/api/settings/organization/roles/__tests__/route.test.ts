import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  resolveAccess: vi.fn(),
  recordAuditEvent: vi.fn(async (_event: unknown) => undefined),
  createCustomRole: vi.fn(),
  updateCustomRole: vi.fn(),
  deleteCustomRole: vi.fn(async () => undefined),
  listOrganizationRoles: vi.fn(async () => []),
  listMemberRoleGrants: vi.fn(async () => ({})),
}));

const revision = vi.hoisted(() => ({ value: 0 }));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mocks.recordAuditEvent,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({ query: (...args: unknown[]) => mocks.query(...args) }),
}));
vi.mock('@/lib/services/organization-role-service', () => ({
  createCustomRole: mocks.createCustomRole,
  updateCustomRole: mocks.updateCustomRole,
  deleteCustomRole: mocks.deleteCustomRole,
  listOrganizationRoles: mocks.listOrganizationRoles,
  listMemberRoleGrants: mocks.listMemberRoleGrants,
}));
vi.mock('../../workspace-access', () => ({
  resolveWorkspaceConsoleAccess: mocks.resolveAccess,
  requireWorkspaceConsolePermission: mocks.resolveAccess,
}));

import { GET, POST } from '../route';
import { DELETE, PATCH } from '../[roleId]/route';

const ORG = '11111111-1111-4111-8111-111111111111';
const ROLE_ID = '44444444-4444-4444-8444-444444444444';

interface IdempotencyRecord {
  status: string;
  request_fingerprint: string;
  response_status: number | null;
  response_body: unknown;
}

const idempotency = new Map<string, IdempotencyRecord>();

function roleBody() {
  return { name: 'Auditor', description: 'Reads the audit log', permissions: ['audit.read'] };
}

function send(method: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://app.test/api/settings/organization/roles', {
    method,
    ...(body === undefined
      ? { headers }
      : {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json', ...headers },
        }),
  });
}

const context = { params: Promise.resolve({ roleId: ROLE_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  idempotency.clear();
  revision.value = 0;
  mocks.resolveAccess.mockImplementation(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: ORG,
    access: { role: 'owner', permissions: new Set(['roles.manage', 'groups.manage']) },
  }));
  mocks.createCustomRole.mockImplementation(async () => ({
    id: ROLE_ID,
    name: 'Auditor',
    permissions: ['audit.read'],
  }));
  mocks.updateCustomRole.mockImplementation(async () => ({
    id: ROLE_ID,
    name: 'Auditor',
    permissions: ['audit.read'],
  }));
  mocks.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
    const text = String(sql);
    if (/from public\.organization_policy_revisions/i.test(text)) {
      return [{ revision: revision.value }];
    }
    if (/insert into public\.admin_request_idempotency/i.test(text)) {
      const key = `${params[1]}|${params[2]}`;
      if (idempotency.has(key)) return [];
      idempotency.set(key, {
        status: 'in_progress',
        request_fingerprint: String(params[3]),
        response_status: null,
        response_body: null,
      });
      return [{ organization_id: ORG }];
    }
    if (/update public\.admin_request_idempotency/i.test(text)) {
      const row = idempotency.get(`${params[1]}|${params[2]}`);
      if (row) {
        row.status = 'completed';
        row.response_status = Number(params[3]);
        row.response_body = JSON.parse(String(params[4]));
      }
      return [];
    }
    if (/from public\.admin_request_idempotency/i.test(text)) {
      const row = idempotency.get(`${params[1]}|${params[2]}`);
      return row ? [row] : [];
    }
    return [];
  });
});

describe('role writes are versioned', () => {
  it('hands the reader the revision to send back', async () => {
    revision.value = 4;

    const response = await GET(send('GET', undefined) as never);

    expect((await response.json()).revision).toBe(4);
    expect(response.headers.get('ETag')).toBe('W/"wsrev-4"');
  });

  it('refuses an update whose revision another administrator moved past', async () => {
    revision.value = 5;

    const response = await PATCH(
      send('PATCH', roleBody(), { 'If-Match': 'W/"wsrev-4"' }) as never,
      context as never,
    );

    expect(response.status).toBe(409);
    expect(mocks.updateCustomRole).not.toHaveBeenCalled();
  });

  it('accepts an update whose revision is current', async () => {
    revision.value = 5;

    const response = await PATCH(
      send('PATCH', roleBody(), { 'If-Match': 'W/"wsrev-5"' }) as never,
      context as never,
    );

    expect(response.status).toBe(200);
    expect(mocks.updateCustomRole).toHaveBeenCalledTimes(1);
  });

  it('refuses a delete whose revision another administrator moved past', async () => {
    revision.value = 5;

    const response = await DELETE(
      send('DELETE', undefined, { 'If-Match': 'W/"wsrev-4"' }) as never,
      context as never,
    );

    expect(response.status).toBe(409);
    expect(mocks.deleteCustomRole).not.toHaveBeenCalled();
  });
});

describe('role creation is idempotent', () => {
  it('creates once and replays the first response on a retry', async () => {
    const headers = { 'Idempotency-Key': 'role-create-0001' };

    const first = await POST(send('POST', roleBody(), headers) as never);
    const second = await POST(send('POST', roleBody(), headers) as never);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get('Idempotency-Replayed')).toBe('true');
    expect(await second.json()).toEqual(await first.json());
    expect(mocks.createCustomRole).toHaveBeenCalledTimes(1);
    expect(mocks.recordAuditEvent).toHaveBeenCalledTimes(1);
  });

  it('refuses the same key used for a different role', async () => {
    const headers = { 'Idempotency-Key': 'role-create-0001' };

    await POST(send('POST', roleBody(), headers) as never);
    const response = await POST(
      send('POST', { ...roleBody(), name: 'Reviewer' }, headers) as never,
    );

    expect(response.status).toBe(409);
    expect(mocks.createCustomRole).toHaveBeenCalledTimes(1);
  });

  it('creates twice without a key, because two intents are indistinguishable', async () => {
    await POST(send('POST', roleBody()) as never);
    await POST(send('POST', roleBody()) as never);

    expect(mocks.createCustomRole).toHaveBeenCalledTimes(2);
  });
});
