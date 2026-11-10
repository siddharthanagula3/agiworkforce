import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  admission: { current: null as unknown },
}));

type ManagedMemoryContextModule = typeof import('@/lib/services/managed-memory-context-service');

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => {
  const actual = await importOriginal<ManagedMemoryContextModule>();
  return {
    ...actual,
    memoryWriteAdmission: async (...args: Parameters<typeof actual.memoryWriteAdmission>) =>
      mocks.admission.current === null
        ? actual.memoryWriteAdmission(...args)
        : (mocks.admission.current as Awaited<ReturnType<typeof actual.memoryWriteAdmission>>),
  };
});
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: (...args: unknown[]) => mocks.query(...args) },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { POST } from '../route';

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/memory/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function insertedBatch(): Array<{ content: string; expiresAt?: string | null }> {
  const call = mocks.query.mock.calls.find((entry) =>
    String(entry[0]).includes('insert into user_memories'),
  );
  return call
    ? (JSON.parse(String(call[1]?.[1])) as Array<{
        content: string;
        expiresAt?: string | null;
      }>)
    : [];
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.admission.current = null;
});

describe('POST /api/memory/import, dry-run', () => {
  it('flags an item that matches an existing memory as a duplicate', async () => {
    mocks.query.mockResolvedValueOnce([{ content: 'Likes dark mode' }]);

    const response = await POST(
      request({ mode: 'dry-run', text: 'Likes dark mode\nPrefers Python', sourceName: 'ChatGPT' }),
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.sourceValue).toBe('imported:chatgpt');
    expect(json.format).toBe('text');
    expect(json.items).toEqual([
      { content: 'Likes dark mode', normalizedKey: 'likes dark mode', duplicate: true },
      { content: 'Prefers Python', normalizedKey: 'prefers python', duplicate: false },
    ]);
  });

  it('counts only live memories as already saved', async () => {
    mocks.query.mockResolvedValueOnce([]);
    await POST(request({ mode: 'dry-run', text: 'A fact', sourceName: 'Claude' }));
    const existing = String(mocks.query.mock.calls[0]?.[0]);
    expect(existing).toContain('superseded_by is null');
    expect(existing).toContain('expires_at > now()');
  });

  it('does not write anything during a dry run', async () => {
    mocks.query.mockResolvedValueOnce([]);
    await POST(request({ mode: 'dry-run', text: 'A fact', sourceName: 'Claude' }));
    for (const call of mocks.query.mock.calls) {
      expect(String(call[0])).not.toContain('insert into');
    }
  });

  it('rejects a dry run with no text', async () => {
    const response = await POST(request({ mode: 'dry-run', text: '', sourceName: 'Claude' }));
    expect(response.status).toBe(400);
  });

  it('defaults to dry-run when mode is omitted', async () => {
    mocks.query.mockResolvedValueOnce([]);
    const response = await POST(request({ text: 'A fact', sourceName: 'Claude' }));
    const json = await response.json();
    expect(json.mode).toBe('dry-run');
  });
});

describe('POST /api/memory/import, commit', () => {
  it('persists selected items with imported provenance and reports counts', async () => {
    mocks.query.mockImplementation(async (sql: string) =>
      String(sql).includes("settings -> 'capabilities'")
        ? [{ capabilities: { memory: true } }]
        : [
            {
              id: '018f6f2a-0000-7000-8000-000000000010',
              content: 'Likes dark mode',
              category: null,
              source: 'imported:chatgpt',
              pinned: false,
              created_at: '2026-09-03T00:00:00.000Z',
              updated_at: '2026-09-03T00:00:00.000Z',
            },
          ],
    );

    const response = await POST(
      request({
        mode: 'commit',
        items: ['Likes dark mode', 'Likes dark mode'],
        sourceName: 'ChatGPT',
      }),
    );
    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.sourceValue).toBe('imported:chatgpt');
    expect(json.insertedCount).toBe(1);
    expect(json.skippedDuplicateCount).toBe(0);
    expect(json.memories).toEqual([
      {
        id: '018f6f2a-0000-7000-8000-000000000010',
        content: 'Likes dark mode',
        category: null,
        source: 'imported:chatgpt',
        pinned: false,
        createdAt: '2026-09-03T00:00:00.000Z',
        updatedAt: '2026-09-03T00:00:00.000Z',
      },
    ]);
    expect(insertedBatch().map((entry) => entry.content)).toEqual(['Likes dark mode']);
  });

  it('keeps the expiry a finite workspace retention policy computed', async () => {
    const expiresAt = '2027-01-01T00:00:00.000Z';
    mocks.admission.current = { eligible: true, retentionClass: 'account', expiresAt };
    mocks.query.mockResolvedValue([]);

    await POST(request({ mode: 'commit', items: ['Likes dark mode'], sourceName: 'ChatGPT' }));

    expect(insertedBatch()).toEqual([
      { content: 'Likes dark mode', importKey: 'likes dark mode', expiresAt },
    ]);
  });

  it('rejects a commit with an empty item list', async () => {
    const response = await POST(request({ mode: 'commit', items: [], sourceName: 'ChatGPT' }));
    expect(response.status).toBe(400);
  });

  it('rejects a commit with a non-string item', async () => {
    const response = await POST(
      request({ mode: 'commit', items: ['fine', 42], sourceName: 'ChatGPT' }),
    );
    expect(response.status).toBe(400);
  });

  it('rejects an unknown mode', async () => {
    const response = await POST(request({ mode: 'wat', sourceName: 'ChatGPT' }));
    expect(response.status).toBe(400);
  });
});
