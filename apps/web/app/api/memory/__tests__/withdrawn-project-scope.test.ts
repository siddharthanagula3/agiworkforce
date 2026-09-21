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

import { GET as listMemories } from '@/app/api/memory/route';

const PROJECT_ID = '0190a000-0000-7000-8000-000000000111';
const MEMORY_ID = '0190a000-0000-7000-8000-000000000abc';

/**
 * Answers the way Postgres would: the project name arrives only through a join
 * the statement actually spells, so a missing predicate shows up as a name.
 */
function stubDb(project: { name: string; deletedAt: string | null }) {
  mocks.query.mockImplementation(async (sql: unknown) => {
    const text = String(sql);
    if (!text.includes('from user_memories')) return [];
    const joined =
      project.deletedAt === null || !text.includes('p.deleted_at is null') ? project.name : null;
    return [
      {
        id: MEMORY_ID,
        content: 'The user ships on Fridays',
        category: null,
        source: 'web',
        pinned: false,
        expires_at: null,
        created_at: '2026-09-19T00:00:00.000Z',
        updated_at: '2026-09-19T00:00:00.000Z',
        project_id: PROJECT_ID,
        project_name: joined,
      },
    ];
  });
}

async function listedMemory() {
  const response = await listMemories(
    new NextRequest('http://localhost/api/memory', { method: 'GET' }),
  );
  const body = (await response.json()) as {
    memories: Array<{ projectId: string | null; projectName: string | null }>;
  };
  return body.memories[0];
}

describe('memory list project scope', () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it('names the project a memory is scoped to', async () => {
    stubDb({ name: 'Launch plan', deletedAt: null });

    expect(await listedMemory()).toMatchObject({
      projectId: PROJECT_ID,
      projectName: 'Launch plan',
    });
  });

  it('does not name a withdrawn project beside the memories it scoped', async () => {
    stubDb({ name: 'Launch plan', deletedAt: '2026-09-19T00:00:00.000Z' });

    expect(await listedMemory()).toMatchObject({ projectId: PROJECT_ID, projectName: null });
  });
});
