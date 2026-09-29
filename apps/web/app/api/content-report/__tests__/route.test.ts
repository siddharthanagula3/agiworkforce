import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  getOptionalAuthUser: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  query: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({ getOptionalAuthUser: mocks.getOptionalAuthUser }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({ query: mocks.query }) }));

import { POST } from '../route';

const body = {
  reportId: 'rpt_web_1',
  messageId: 'msg-1',
  conversationId: 'conv-1',
  category: 'inaccurate',
  contentExcerpt: 'the answer',
  userNote: 'wrong date',
};

function request(payload: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/content-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

describe('/api/content-report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getOptionalAuthUser.mockResolvedValue({ userId: 'user-1' });
    mocks.query.mockResolvedValue([]);
  });

  it('refuses a report that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));
    const response = await POST(request(body));
    expect(response.status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('returns the rate limit response before storing anything', async () => {
    mocks.withRateLimit.mockResolvedValue(NextResponse.json({ error: 'slow' }, { status: 429 }));
    const response = await POST(request(body));
    expect(response.status).toBe(429);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('rejects an unknown category', async () => {
    const response = await POST(request({ ...body, category: 'spam' }));
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('rejects a body that is not json', async () => {
    const response = await POST(request('not json'));
    expect(response.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('stores the report against the signed in user, idempotent on the report id', async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    const [sql, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('insert into public.content_reports');
    expect(sql).toContain('on conflict (client_report_id) do nothing');
    expect(params.slice(0, 7)).toEqual([
      'user-1',
      'rpt_web_1',
      'msg-1',
      'conv-1',
      'inaccurate',
      'the answer',
      'wrong date',
    ]);
  });

  it('accepts an anonymous report with a null user', async () => {
    mocks.getOptionalAuthUser.mockResolvedValue(null);
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    const [, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(params[0]).toBeNull();
  });

  it('answers 500 when the insert fails', async () => {
    mocks.query.mockRejectedValue(new Error('db down'));
    const response = await POST(request(body));
    expect(response.status).toBe(500);
  });
});
