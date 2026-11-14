import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  query: vi.fn(),
  txQuery: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: h.getUserScopedDb,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/request-context-cache', async (importOriginal) => ({
  ...(await importOriginal<RequestContextCacheModule>()),
  invalidateActiveOrganizationCache: vi.fn(),
  getCachedActiveOrganizationId: vi.fn(),
  setCachedActiveOrganizationId: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { PUT } from '../route';

type RlsDbModule = typeof import('@/lib/server/rls-db');
type RateLimitModule = typeof import('@/lib/rate-limit');
type CsrfModule = typeof import('@/lib/csrf');
type LoggerModule = typeof import('@/lib/logger');
type RequestContextCacheModule = typeof import('@/lib/server/request-context-cache');

function put(body: unknown) {
  return new NextRequest('http://localhost:3000/api/settings/preferences', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function writeCalls() {
  return h.txQuery.mock.calls.filter((call) =>
    String(call[0]).includes('update public.user_settings'),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getUserScopedDb.mockResolvedValue({
    db: { query: h.query, transaction: h.transaction },
    userId: 'user-1',
  });
  h.transaction.mockImplementation(
    async (callback: (tx: { query: typeof h.txQuery }) => Promise<unknown>) =>
      callback({ query: h.txQuery }),
  );
  h.txQuery.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('from public.user_settings') && sql.includes('for update')) {
      return [{ settings: { privacy: { keepOutOfProviderTraining: true } }, version: 'v1' }];
    }
    if (sql.includes('update public.user_settings')) {
      return [{ settings: JSON.parse(String(params[1])), version: 'v2' }];
    }
    throw new Error(`Unexpected transaction query: ${sql}`);
  });
});

describe('model improvement choices in the privacy preferences', () => {
  it.each(['allowChatsForModelImprovement', 'allowVoiceForModelImprovement'])(
    'saves %s as on beside the other privacy choices',
    async (key) => {
      const response = await PUT(put({ namespace: 'privacy', patch: { [key]: true } }));
      expect(response.status).toBe(200);
      expect(writeCalls()).toHaveLength(1);
      expect(JSON.parse(String(writeCalls()[0]![1][1]))).toEqual({
        privacy: { keepOutOfProviderTraining: true, [key]: true },
      });
    },
  );

  it.each([
    ['a patch', { namespace: 'privacy', patch: { allowChatsForModelImprovement: 'yes' } }],
    ['a namespace value', { namespace: 'privacy', value: { allowVoiceForModelImprovement: 1 } }],
    ['a whole-document write', { settings: { privacy: { allowChatsForModelImprovement: null } } }],
  ])('refuses %s that is not on or off and writes nothing', async (_label, body) => {
    const response = await PUT(put(body));
    expect(response.status).toBe(400);
    expect(writeCalls()).toHaveLength(0);
  });
});
