import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('server-only', () => ({}));
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

import { POST as createMemory } from '@/app/api/memory/route';
import { PUT as updateMemory } from '@/app/api/memory/[id]/route';
import { POST as importMemory } from '@/app/api/memory/import/route';
import { POST as pushMemorySync } from '@/app/api/memory/sync/route';

const EXCLUDED_TERM = 'home address';
const EXCLUDED_CONTENT = 'The user home address is 12 Elm Street';
const ALLOWED_CONTENT = 'The user prefers terse answers';
const MEMORY_ID = '0190a000-0000-7000-8000-000000000abc';
const OTHER_MEMORY_ID = '0190a000-0000-7000-8000-000000000def';

function storedRow(content: string) {
  return {
    id: MEMORY_ID,
    content,
    category: null,
    source: 'web',
    pinned: false,
    created_at: '2026-09-07T00:00:00.000Z',
    updated_at: '2026-09-07T00:00:00.000Z',
  };
}

function stubDb(exclusions: readonly string[], rows: { synced?: unknown[] } = {}) {
  mocks.query.mockImplementation(async (sql: unknown) => {
    const text = String(sql);
    if (text.includes("settings -> 'memory'")) {
      return [{ memory: { excludedTerms: exclusions } }];
    }
    if (text.includes('applied_rows')) return rows.synced ?? [];
    if (text.includes('select content from user_memories')) return [];
    if (text.includes('insert into user_memories')) return [storedRow(ALLOWED_CONTENT)];
    if (text.includes('update user_memories')) return [storedRow(ALLOWED_CONTENT)];
    return [];
  });
}

function sqlCalls(fragment: string) {
  return mocks.query.mock.calls.filter((call) => String(call[0]).includes(fragment));
}

function jsonRequest(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function putRequest(body: unknown) {
  return new NextRequest(`http://localhost/api/memory/${MEMORY_ID}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const routeContext = { params: Promise.resolve({ id: MEMORY_ID }) };

beforeEach(() => {
  mocks.query.mockReset();
});

describe('manual memory create', () => {
  it('refuses content matching a never remember term and writes nothing', async () => {
    stubDb([EXCLUDED_TERM]);

    const response = await createMemory(jsonRequest('/api/memory', { content: EXCLUDED_CONTENT }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain(EXCLUDED_TERM);
    expect(sqlCalls('insert into user_memories')).toHaveLength(0);
  });

  it('still saves content that matches no term', async () => {
    stubDb([EXCLUDED_TERM]);

    const response = await createMemory(jsonRequest('/api/memory', { content: ALLOWED_CONTENT }));

    expect(response.status).toBe(201);
    expect(sqlCalls('insert into user_memories')).toHaveLength(1);
  });
});

describe('manual memory edit', () => {
  it('refuses an edit that introduces a never remember term', async () => {
    stubDb([EXCLUDED_TERM]);

    const response = await updateMemory(putRequest({ content: EXCLUDED_CONTENT }), routeContext);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toContain(EXCLUDED_TERM);
    expect(sqlCalls('update user_memories')).toHaveLength(0);
  });

  it('leaves a pin toggle alone', async () => {
    stubDb([EXCLUDED_TERM]);

    const response = await updateMemory(putRequest({ pinned: true }), routeContext);

    expect(response.status).toBe(200);
    expect(sqlCalls('update user_memories')).toHaveLength(1);
  });
});

describe('memory import commit', () => {
  it('drops excluded items, keeps the rest, and reports the count', async () => {
    stubDb([EXCLUDED_TERM]);

    const response = await importMemory(
      jsonRequest('/api/memory/import', {
        mode: 'commit',
        items: [EXCLUDED_CONTENT, ALLOWED_CONTENT],
        sourceName: 'ChatGPT',
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.excludedCount).toBe(1);
    const insert = sqlCalls('insert into user_memories')[0];
    const batch = JSON.parse(String(insert?.[1]?.[1])) as Array<{ content: string }>;
    expect(batch.map((entry) => entry.content)).toEqual([ALLOWED_CONTENT]);
  });

  it('refuses a commit whose every item is excluded without writing', async () => {
    stubDb([EXCLUDED_TERM]);

    const response = await importMemory(
      jsonRequest('/api/memory/import', {
        mode: 'commit',
        items: [EXCLUDED_CONTENT],
        sourceName: 'ChatGPT',
      }),
    );

    const body = await response.json();
    expect(body.excludedCount).toBe(1);
    expect(body.insertedCount).toBe(0);
    expect(sqlCalls('insert into user_memories')).toHaveLength(0);
  });
});

describe('cross-device memory sync push', () => {
  it('refuses an excluded row, applies the rest, and names the term', async () => {
    stubDb([EXCLUDED_TERM], {
      synced: [{ kind: 'applied', id: OTHER_MEMORY_ID, server_version: '7', current: null }],
    });

    const response = await pushMemorySync(
      jsonRequest('/api/memory/sync', {
        protocolVersion: 2,
        memories: [
          { id: MEMORY_ID, content: EXCLUDED_CONTENT, baseVersion: '0' },
          { id: OTHER_MEMORY_ID, content: ALLOWED_CONTENT, baseVersion: '6' },
        ],
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.rejected).toEqual([{ id: MEMORY_ID, term: EXCLUDED_TERM }]);
    expect(body.applied).toEqual([{ id: OTHER_MEMORY_ID, server_version: '7' }]);

    const push = sqlCalls('applied_rows')[0];
    const sent = JSON.parse(String(push?.[1]?.[1])) as Array<{ id: string }>;
    expect(sent.map((entry) => entry.id)).toEqual([OTHER_MEMORY_ID]);
  });

  it('lets a delete through even when its content matches a term', async () => {
    stubDb([EXCLUDED_TERM], {
      synced: [{ kind: 'applied', id: MEMORY_ID, server_version: '9', current: null }],
    });

    const response = await pushMemorySync(
      jsonRequest('/api/memory/sync', {
        protocolVersion: 2,
        memories: [{ id: MEMORY_ID, content: EXCLUDED_CONTENT, baseVersion: '8', isDeleted: true }],
      }),
    );

    const body = await response.json();
    expect(body.rejected).toEqual([]);
    expect(body.applied).toEqual([{ id: MEMORY_ID, server_version: '9' }]);
  });

  it('writes nothing when every pushed row is excluded', async () => {
    stubDb([EXCLUDED_TERM]);

    const response = await pushMemorySync(
      jsonRequest('/api/memory/sync', {
        protocolVersion: 2,
        memories: [{ id: MEMORY_ID, content: EXCLUDED_CONTENT, baseVersion: '0' }],
      }),
    );

    const body = await response.json();
    expect(body.applied).toEqual([]);
    expect(body.rejected).toHaveLength(1);
    expect(sqlCalls('applied_rows')).toHaveLength(0);
  });
});

describe('every memory route reaches the write gate', () => {
  const routesDir = join(__dirname, '..');

  function routeFiles(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) found.push(...routeFiles(full));
      else if (entry.name === 'route.ts') found.push(full);
    }
    return found;
  }

  it('imports the exclusion gate in every route that writes a memory row', () => {
    const writers = routeFiles(routesDir).filter((file) => {
      const source = readFileSync(file, 'utf8');
      return (
        source.includes('insert into user_memories') ||
        source.includes('update user_memories') ||
        source.includes('persistImported')
      );
    });

    expect(writers.length).toBeGreaterThan(0);
    for (const file of writers) {
      expect(readFileSync(file, 'utf8')).toContain('memory-write-service');
    }
  });
});
