import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ORG = '0190a000-0000-7000-8000-00000000a001';
const MEMORY_ID = '0190a000-0000-7000-8000-000000000abc';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  organizationId: null as string | null,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mocks.query(...args),
      execute: (...args: unknown[]) => mocks.execute(...args),
    },
    userId: 'user-1',
    organizationId: mocks.organizationId,
  })),
}));
vi.mock('@/lib/cors', () => ({
  withCorsRoute: <T>(handler: T) => handler,
  handleCorsPreflightRequest: vi.fn(() => null),
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET as listMemories, POST as createMemory } from '@/app/api/memory/route';
import {
  DELETE as deleteMemory,
  GET as getMemory,
  PUT as updateMemory,
} from '@/app/api/memory/[id]/route';
import { GET as searchMemories } from '@/app/api/memory/search/route';
import { GET as syncMemories } from '@/app/api/memory/sync/route';

type Call = [string, unknown[]];

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMORY_ID,
    content: 'User lives in Berlin',
    category: 'fact',
    source: 'web',
    pinned: false,
    project_id: null,
    expires_at: null,
    superseded_by: null,
    superseded_ids: [],
    created_at: '2026-09-17T00:00:00.000Z',
    updated_at: '2026-09-17T00:00:00.000Z',
    ...overrides,
  };
}

function memoryCalls(): Call[] {
  return (mocks.query.mock.calls as unknown as Call[]).filter(([sql]) =>
    sql.includes('user_memories'),
  );
}

function jsonRequest(path: string, method: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const routeContext = { params: Promise.resolve({ id: MEMORY_ID }) };

beforeEach(() => {
  mocks.query.mockReset();
  mocks.execute.mockReset();
  mocks.organizationId = ORG;
  mocks.query.mockImplementation(async (sql: string) =>
    sql.includes("settings -> 'memory'") ? [] : [row()],
  );
});

describe('memory reads are bound to the active workspace in SQL', () => {
  it('lists only active rows of the active workspace', async () => {
    const response = await listMemories(new NextRequest('http://localhost/api/memory'));

    expect(response.status).toBe(200);
    const [sql, params] = memoryCalls()[0]!;
    expect(sql).toContain('m.organization_id is not distinct from $4::uuid');
    expect(sql).toContain('m.superseded_by is null');
    expect(sql).toContain('(m.expires_at is null or m.expires_at > now())');
    expect(params[3]).toBe(ORG);
  });

  it('binds personal context to rows with no workspace', async () => {
    mocks.organizationId = null;
    await listMemories(new NextRequest('http://localhost/api/memory'));

    const [, params] = memoryCalls()[0]!;
    expect(params[3]).toBeNull();
  });

  it('scopes a single read, delete and search to the workspace', async () => {
    await getMemory(new NextRequest(`http://localhost/api/memory/${MEMORY_ID}`), routeContext);
    await deleteMemory(
      new NextRequest(`http://localhost/api/memory/${MEMORY_ID}`, { method: 'DELETE' }),
      routeContext,
    );
    await searchMemories(new NextRequest('http://localhost/api/memory/search?q=berlin'));

    const [getSql, getParams] = memoryCalls()[0]!;
    expect(getSql).toContain('organization_id is not distinct from $3::uuid');
    expect(getSql).toContain('(expires_at is null or expires_at > now())');
    expect(getParams).toEqual([MEMORY_ID, 'user-1', ORG]);

    const [deleteSql, deleteParams] = mocks.execute.mock.calls[0] as unknown as Call;
    expect(deleteSql).toContain('organization_id is not distinct from $3::uuid');
    expect(deleteParams).toEqual([MEMORY_ID, 'user-1', ORG]);

    const [searchSql, searchParams] = memoryCalls()[1]!;
    expect(searchSql).toContain('organization_id is not distinct from $3::uuid');
    expect(searchSql).toContain('superseded_by is null');
    expect(searchParams[2]).toBe(ORG);
  });

  it('scopes the sync status to active rows of the workspace', async () => {
    await syncMemories(new NextRequest('http://localhost/api/memory/sync'));

    const [sql, params] = memoryCalls()[0]!;
    expect(sql).toContain('organization_id is not distinct from $2::uuid');
    expect(sql).toContain('superseded_by is null');
    expect(params).toEqual(['user-1', ORG]);
  });
});

describe('memory create consolidates and resolves conflicts', () => {
  it('writes into the active workspace and reports what it superseded', async () => {
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes("settings -> 'memory'")
        ? []
        : [row({ outcome: 'inserted', superseded_ids: ['0190a000-0000-7000-8000-000000000def'] })],
    );

    const response = await createMemory(
      jsonRequest('/api/memory', 'POST', { content: 'User lives in Berlin' }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.merged).toBe(false);
    expect(body.supersededIds).toEqual(['0190a000-0000-7000-8000-000000000def']);
    const [sql, params] = memoryCalls()[0]!;
    expect(sql).toContain('insert into user_memories');
    expect(params[3]).toBe(ORG);
    expect(params[9]).toEqual(['user lives in %', 'i live in %']);
  });

  it('answers 200 with the existing memory when the new one is a near-duplicate', async () => {
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes("settings -> 'memory'") ? [] : [row({ outcome: 'merged' })],
    );

    const response = await createMemory(
      jsonRequest('/api/memory', 'POST', { content: 'user lives in berlin.' }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.merged).toBe(true);
    expect(body.memory.id).toBe(MEMORY_ID);
  });
});

describe('memory expiry through the API', () => {
  it('stores a future expiry on create', async () => {
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    mocks.query.mockImplementation(async (sql: string) =>
      sql.includes("settings -> 'memory'")
        ? []
        : [row({ outcome: 'inserted', expires_at: expiresAt })],
    );

    const response = await createMemory(
      jsonRequest('/api/memory', 'POST', { content: 'Trip to Lisbon next week', expiresAt }),
    );

    expect(response.status).toBe(201);
    expect((await response.json()).memory.expiresAt).toBe(expiresAt);
    expect(memoryCalls()[0]![1][8]).toBe(expiresAt);
  });

  it('refuses an expiry in the past without writing', async () => {
    const response = await createMemory(
      jsonRequest('/api/memory', 'POST', {
        content: 'Trip to Lisbon',
        expiresAt: '2020-01-01T00:00:00Z',
      }),
    );

    expect(response.status).toBe(400);
    expect(memoryCalls()).toHaveLength(0);
  });

  it('sets or clears an expiry without requiring the content again', async () => {
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const setResponse = await updateMemory(
      jsonRequest(`/api/memory/${MEMORY_ID}`, 'PUT', { expiresAt }),
      routeContext,
    );
    const clearResponse = await updateMemory(
      jsonRequest(`/api/memory/${MEMORY_ID}`, 'PUT', { expiresAt: null }),
      routeContext,
    );

    expect(setResponse.status).toBe(200);
    expect(clearResponse.status).toBe(200);
    const [setSql, setParams] = memoryCalls()[0]!;
    expect(setSql).toContain('expires_at = $1::timestamptz');
    expect(setSql).not.toContain('content =');
    expect(setSql).toContain('organization_id is not distinct from $4::uuid');
    expect(setParams).toEqual([expiresAt, MEMORY_ID, 'user-1', ORG]);
    expect(memoryCalls()[1]![1][0]).toBeNull();
  });
});
