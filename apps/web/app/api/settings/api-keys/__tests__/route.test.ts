import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockGetUserScopedDb, mockQuery, mockExecute, mockAudit } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockQuery: vi.fn(),
  mockExecute: vi.fn(async () => 1),
  mockAudit: vi.fn(async () => {}),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...args: unknown[]) => mockGetUserScopedDb(...args),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', () => ({
  recordAuditEvent: mockAudit,
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(),
}));

import { GET, POST } from '../route';
import { DELETE } from '../[keyId]/route';

const KEY_ID = '11111111-2222-4333-8444-555555555555';

function req(url = 'http://localhost:3000/api/settings/api-keys', init?: RequestInit) {
  return new Request(url, init) as never;
}

function params(keyId: string) {
  return { params: Promise.resolve({ keyId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: mockQuery, execute: mockExecute },
    userId: 'user-1',
    organizationId: null,
  });
});

describe('listing API keys', () => {
  it('scopes the query to the caller under the rls-scoped connection', async () => {
    mockQuery.mockResolvedValue([
      {
        id: KEY_ID,
        name: 'CI key',
        key_prefix: 'abc123',
        scopes: ['models:read'],
        created_at: '2026-06-01T00:00:00.000Z',
        last_used_at: null,
      },
    ]);

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(mockGetUserScopedDb).toHaveBeenCalledWith(expect.anything());
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['user-1']);
    const body = (await response.json()) as { api_keys: Array<Record<string, unknown>> };
    expect(body.api_keys[0]).toMatchObject({ id: KEY_ID, name: 'CI key' });
  });
});

describe('creating an API key', () => {
  it('inserts scoped to the caller through the rls-scoped connection', async () => {
    mockQuery.mockResolvedValueOnce([{ count: '0' }]).mockResolvedValueOnce([
      {
        id: KEY_ID,
        user_id: 'user-1',
        name: 'New key',
        key_hash: 'hash',
        key_prefix: 'abc123',
        scopes: ['models:read'],
        last_used_at: null,
        expires_at: null,
        revoked_at: null,
        created_at: '2026-06-01T00:00:00.000Z',
      },
    ]);

    const response = await POST(
      req('http://localhost:3000/api/settings/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'New key', scopes: ['models:read'] }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mockQuery.mock.calls[0]?.[1]).toEqual(['user-1']);
    expect(mockQuery.mock.calls[1]?.[1]).toEqual(expect.arrayContaining(['user-1', 'New key']));
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', eventType: 'api_key_created' }),
    );
  });
});

describe('revoking an API key', () => {
  it('refuses to revoke a key the caller does not own', async () => {
    mockQuery.mockResolvedValue([{ id: KEY_ID, user_id: 'user-2', revoked_at: null }]);

    const response = await DELETE(
      new Request('http://localhost:3000/api/settings/api-keys/x', {
        method: 'DELETE',
      }) as never,
      params(KEY_ID),
    );

    expect(response.status).toBe(403);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('revokes an owned key through the rls-scoped connection', async () => {
    mockQuery.mockResolvedValue([{ id: KEY_ID, user_id: 'user-1', revoked_at: null }]);

    const response = await DELETE(
      new Request('http://localhost:3000/api/settings/api-keys/x', {
        method: 'DELETE',
      }) as never,
      params(KEY_ID),
    );

    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('UPDATE api_keys'), [
      KEY_ID,
      'user-1',
    ]);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', eventType: 'api_key_revoked' }),
    );
  });
});
