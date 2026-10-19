import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  csrf: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
  rateLimit: vi.fn(async (..._args: unknown[]): Promise<Response | null> => null),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: (...a: unknown[]) => mocks.csrf(...a) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: (...a: unknown[]) => mocks.rateLimit(...a) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'owner-1',
    organizationId: null,
  }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { GET, POST, DELETE } = await import('./route');

const TOKEN = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const PUBLICATION = '44444444-4444-4444-8444-444444444444';
const context = { params: Promise.resolve({ token: TOKEN }) };

function request(method: string, body?: unknown) {
  return new NextRequest(`https://agiworkforce.com/api/artifacts/publish/${TOKEN}/viewers`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
      : {}),
  });
}

let viewers: Array<{ email: string; created_at: string }> = [];

beforeEach(() => {
  viewers = [];
  mocks.csrf.mockClear();
  mocks.query.mockReset();
  mocks.query.mockImplementation(async (sql: string, params: unknown[]) => {
    const text = String(sql);
    if (text.includes('from public.published_artifacts')) {
      return params[1] === 'owner-1' ? [{ id: PUBLICATION }] : [];
    }
    if (text.includes('count(*)')) return [{ total: viewers.length }];
    if (text.includes('insert into public.published_artifact_viewers')) {
      viewers.push({ email: params[1] as string, created_at: '2026-10-19T00:00:00Z' });
      return [];
    }
    if (text.includes('delete from public.published_artifact_viewers')) {
      viewers = viewers.filter((viewer) => viewer.email !== params[1]);
      return [];
    }
    if (text.includes('from public.published_artifact_viewers')) return viewers;
    return [];
  });
});

describe('/api/artifacts/publish/[token]/viewers', () => {
  it('adds a lower-cased email behind the CSRF check and lists it', async () => {
    const response = await POST(request('POST', { email: '  Ana@Example.COM ' }), context);
    expect(response.status).toBe(200);
    expect(mocks.csrf).toHaveBeenCalledTimes(1);
    expect(((await response.json()) as { viewers: { email: string }[] }).viewers).toEqual([
      { email: 'ana@example.com', invitedAt: '2026-10-19T00:00:00.000Z' },
    ]);
    const owner = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(owner[0]).toContain('where token = $1 and user_id = $2');
  });

  it('refuses something that is not an email address', async () => {
    expect((await POST(request('POST', { email: 'not an email' }), context)).status).toBe(400);
  });

  it('removes a viewer', async () => {
    viewers = [{ email: 'ana@example.com', created_at: '2026-10-19T00:00:00Z' }];
    const response = await DELETE(request('DELETE', { email: 'ana@example.com' }), context);
    expect(((await response.json()) as { viewers: unknown[] }).viewers).toEqual([]);
  });

  it('caps the people one site is shared with', async () => {
    viewers = Array.from({ length: 100 }, (_, index) => ({
      email: `p${index}@example.com`,
      created_at: '2026-10-19T00:00:00Z',
    }));
    expect((await POST(request('POST', { email: 'one@more.com' }), context)).status).toBe(409);
  });

  it('answers 404 to anyone but the publisher', async () => {
    mocks.query.mockImplementation(async () => []);
    expect((await GET(request('GET'), context)).status).toBe(404);
  });
});
