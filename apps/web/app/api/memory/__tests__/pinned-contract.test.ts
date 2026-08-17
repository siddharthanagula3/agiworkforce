import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn(async () => ({ userId: 'user-1' })),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  })),
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET as LIST, POST as CREATE } from '../route';
import { GET as GET_ONE, PUT } from '../[id]/route';

const MEM_ID = '018f6f2a-0000-7000-8000-000000000010';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: MEM_ID,
    content: 'I prefer dark mode',
    category: 'preference',
    source: 'web',
    pinned: true,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

const context = { params: Promise.resolve({ id: MEM_ID }) };

function sql(callIndex = 0): string {
  return String(mocks.query.mock.calls[callIndex]?.[0] ?? '');
}

function params(callIndex = 0): unknown[] {
  return (mocks.query.mock.calls[callIndex]?.[1] ?? []) as unknown[];
}

describe('/api/memory pinned contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/memory returns pinned and orders pinned facts first', async () => {
    mocks.query.mockResolvedValueOnce([row()]);

    const res = await LIST(new NextRequest('http://localhost:3000/api/memory'));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { memories: Array<{ pinned: boolean }> };
    expect(body.memories[0]?.pinned).toBe(true);
    expect(sql()).toMatch(/select[\s\S]*\bpinned\b/i);
    expect(sql()).toContain('order by pinned desc, updated_at desc');
  });

  it('GET /api/memory/[id] returns pinned', async () => {
    mocks.query.mockResolvedValueOnce([row({ pinned: false })]);

    const res = await GET_ONE(
      new NextRequest(`http://localhost:3000/api/memory/${MEM_ID}`),
      context,
    );
    const body = (await res.json()) as { memory: { pinned: boolean } };
    expect(body.memory.pinned).toBe(false);
  });

  it('PUT /api/memory/[id] pins without requiring the content to be resent', async () => {
    mocks.query.mockResolvedValueOnce([row({ pinned: true })]);

    const res = await PUT(
      new NextRequest(`http://localhost:3000/api/memory/${MEM_ID}`, {
        method: 'PUT',
        body: JSON.stringify({ pinned: true }),
      }),
      context,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { memory: { pinned: boolean } };
    expect(body.memory.pinned).toBe(true);
    expect(sql()).toContain('pinned = $1');
    expect(sql()).not.toContain('content = ');
    expect(params()).toEqual([true, MEM_ID, 'user-1']);
  });

  it('PUT /api/memory/[id] updates content and pin state together', async () => {
    mocks.query.mockResolvedValueOnce([row({ content: 'new text', pinned: false })]);

    const res = await PUT(
      new NextRequest(`http://localhost:3000/api/memory/${MEM_ID}`, {
        method: 'PUT',
        body: JSON.stringify({ content: '  new text  ', pinned: false }),
      }),
      context,
    );

    expect(res.status).toBe(200);
    expect(sql()).toContain('content = $1');
    expect(sql()).toContain('pinned = $2');
    expect(params()).toEqual(['new text', false, MEM_ID, 'user-1']);
  });

  it('PUT /api/memory/[id] still requires content when no pin change is requested', async () => {
    const res = await PUT(
      new NextRequest(`http://localhost:3000/api/memory/${MEM_ID}`, {
        method: 'PUT',
        body: JSON.stringify({}),
      }),
      context,
    );

    expect(res.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('PUT /api/memory/[id] rejects a non-boolean pinned', async () => {
    const res = await PUT(
      new NextRequest(`http://localhost:3000/api/memory/${MEM_ID}`, {
        method: 'PUT',
        body: JSON.stringify({ content: 'ok', pinned: 'yes' }),
      }),
      context,
    );

    expect(res.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('POST /api/memory persists and returns the requested pin state', async () => {
    mocks.query.mockResolvedValueOnce([row({ pinned: true })]);

    const res = await CREATE(
      new NextRequest('http://localhost:3000/api/memory', {
        method: 'POST',
        body: JSON.stringify({ content: 'I prefer dark mode', pinned: true }),
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { memory: { pinned: boolean } };
    expect(body.memory.pinned).toBe(true);
    expect(params()[4]).toBe(true);
  });
});
