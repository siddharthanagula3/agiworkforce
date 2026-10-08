import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const MEMORY_ID = '0190a000-0000-7000-8000-000000000abc';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
}));

vi.mock('server-only', () => ({}));
type CsrfModule = typeof import('@/lib/csrf');
type RateLimitModule = typeof import('@/lib/rate-limit');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type CorsModule = typeof import('@/lib/cors');
type LoggerModule = typeof import('@/lib/logger');

vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mocks.query(...args),
      execute: (...args: unknown[]) => mocks.execute(...args),
    },
    userId: 'user-1',
    organizationId: null,
  })),
}));
vi.mock('@/lib/cors', async (importOriginal) => ({
  ...(await importOriginal<CorsModule>()),
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { DELETE as deleteAllMemories } from '@/app/api/memory/route';
import { DELETE as deleteMemory } from '@/app/api/memory/[id]/route';
import { POST as pushMemories } from '@/app/api/memory/sync/route';

type Call = [string, unknown[]];

function setClause(sql: string): string {
  const match = /\bset\b([\s\S]*?)\bwhere\b/i.exec(sql);
  if (!match?.[1]) throw new Error(`No set clause in: ${sql}`);
  return match[1];
}

function expectClearsText(assignments: string) {
  expect(assignments).toMatch(/\bis_deleted = true\b/);
  expect(assignments).toMatch(/\bcontent = ''/);
  expect(assignments).toMatch(/\bcategory = null\b/);
  expect(assignments).toMatch(/\bimport_key = null\b/);
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.execute.mockReset();
  mocks.execute.mockResolvedValue(1);
});

describe('deleting a memory leaves no copy of its text', () => {
  it('clears the text when one memory is deleted', async () => {
    const response = await deleteMemory(
      new NextRequest(`http://localhost/api/memory/${MEMORY_ID}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: MEMORY_ID }) },
    );

    expect(response.status).toBe(200);
    const [sql] = mocks.execute.mock.calls[0] as unknown as Call;
    expectClearsText(setClause(sql));
  });

  it('clears the text of every memory when all are deleted', async () => {
    const response = await deleteAllMemories(
      new NextRequest('http://localhost/api/memory', { method: 'DELETE' }),
    );

    expect(response.status).toBe(200);
    const [sql] = mocks.execute.mock.calls[0] as unknown as Call;
    expectClearsText(setClause(sql));
  });

  it('stores no text for a deletion another device sends, even when the device sends the text', async () => {
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes("settings -> 'capabilities'")
        ? [{ capabilities: { memory: true } }]
        : [{ kind: 'applied', id: MEMORY_ID, server_version: '9', current: null }],
    );

    const response = await pushMemories(
      new NextRequest('http://localhost/api/memory/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          protocolVersion: 2,
          memories: [
            {
              id: MEMORY_ID,
              content: 'User lives in Berlin',
              category: 'fact',
              isDeleted: true,
              baseVersion: '7',
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    const [sql] = (mocks.query.mock.calls as unknown as Call[]).find(([text]) =>
      text.includes('update user_memories as existing'),
    )!;
    const update = /update user_memories as existing\s+set([\s\S]*?)\bfrom input\b/.exec(sql)?.[1];
    expect(update).toMatch(
      /content = case when incoming\.should_delete then '' else incoming\.content end/,
    );
    expect(update).toMatch(
      /category = case when incoming\.should_delete then null else incoming\.category end/,
    );
    expect(update).toMatch(/import_key = case when incoming\.should_delete then null\b/);

    const insert = /insert into user_memories[\s\S]*?\bfrom input as incoming\b/.exec(sql)?.[0];
    expect(insert).toMatch(/case when incoming\.should_delete then '' else incoming\.content end/);
  });
});
