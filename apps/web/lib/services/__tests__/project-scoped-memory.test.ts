import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/observability/spans', async (importOriginal) => {
  try {
    return await importOriginal();
  } catch {
    return {
      withSpan: async (_n: string, _o: unknown, fn: (s: unknown) => unknown) =>
        fn({ setAttributes: () => {} }),
    };
  }
});

import {
  GLOBAL_MEMORY_SCOPE,
  loadManagedMemoryContext,
  loadProjectMemoryScope,
} from '../managed-memory-context-service';

const PROJECT = '11111111-2222-4333-8444-555555555555';

function db(rows: unknown[] = []) {
  const query = vi.fn(async () => rows);
  return { query: query as never, calls: query };
}

beforeEach(() => vi.clearAllMocks());

// A memory confined to a project must be invisible everywhere else. If it
// leaks, "project memory" is just a label on the same shared pool.
describe('memory scoping', () => {
  it('a loose chat sees only global memories', async () => {
    const d = db();
    await loadManagedMemoryContext(d as never, { userId: 'u1' });

    const [sql] = d.calls.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('project_id is null');
    expect(sql).not.toContain('project_id = $');
  });

  it('an explicit global scope behaves the same as no scope', async () => {
    const d = db();
    await loadManagedMemoryContext(d as never, { userId: 'u1', scope: GLOBAL_MEMORY_SCOPE });

    const [sql] = d.calls.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('project_id is null');
  });

  it('a project that uses global memory sees both pools', async () => {
    const d = db();
    await loadManagedMemoryContext(d as never, {
      userId: 'u1',
      scope: { projectId: PROJECT, usesGlobalMemory: true },
    });

    const [sql, params] = d.calls.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('project_id is null or project_id =');
    expect(params).toContain(PROJECT);
  });

  it('a project that opted out sees only its own, never the account pool', async () => {
    const d = db();
    await loadManagedMemoryContext(d as never, {
      userId: 'u1',
      scope: { projectId: PROJECT, usesGlobalMemory: false },
    });

    const [sql, params] = d.calls.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('project_id = $');
    expect(sql).not.toContain('project_id is null');
    expect(params).toContain(PROJECT);
  });

  it('keeps source suppression and project scoping on the same query', async () => {
    const d = db();
    await loadManagedMemoryContext(d as never, {
      userId: 'u1',
      suppressedSources: ['auto'],
      scope: { projectId: PROJECT, usesGlobalMemory: false },
    });

    const [sql, params] = d.calls.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('<> all($2::text[])');
    expect(sql).toContain('project_id = $3::uuid');
    expect(params[0]).toBe('u1');
    expect(params[2]).toBe(PROJECT);
  });
});

describe('reading a project memory posture', () => {
  it('defaults to global when the conversation has no project', async () => {
    const d = db();
    await expect(
      loadProjectMemoryScope(d as never, { userId: 'u1', projectId: null }),
    ).resolves.toEqual(GLOBAL_MEMORY_SCOPE);
    expect(d.calls).not.toHaveBeenCalled();
  });

  it('falls back to global, not to the project, when the project cannot be read', async () => {
    const d = db([]);
    const scope = await loadProjectMemoryScope(d as never, { userId: 'u1', projectId: PROJECT });

    // Guessing the project exists would surface rows the caller may not own.
    expect(scope).toEqual(GLOBAL_MEMORY_SCOPE);
  });

  it('honours a project that turned global memory off', async () => {
    const d = db([{ uses_global_memory: false }]);
    const scope = await loadProjectMemoryScope(d as never, { userId: 'u1', projectId: PROJECT });

    expect(scope).toEqual({ projectId: PROJECT, usesGlobalMemory: false });
  });

  it('scopes the lookup to the owner', async () => {
    const d = db([{ uses_global_memory: true }]);
    await loadProjectMemoryScope(d as never, { userId: 'u1', projectId: PROJECT });

    const [sql, params] = d.calls.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('user_id = $2');
    expect(params).toEqual([PROJECT, 'u1']);
  });
});

import { persistManagedAutoMemoryFacts } from '../managed-memory-context-service';

describe('memories learned inside a project are tagged with it', () => {
  function writeDb(settingsRow: unknown = { memory: {} }) {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('user_settings')) return [settingsRow];
      return [{ id: 'm1' }];
    });
    return { query: query as never, calls: query };
  }

  it('writes the project id so the fact stays inside the project', async () => {
    const d = writeDb();
    await persistManagedAutoMemoryFacts(d as never, {
      userId: 'u1',
      candidates: ['The client ships on Fridays.'],
      projectId: PROJECT,
    });

    const insert = (d.calls.mock.calls as unknown as Array<[string, unknown[]]>).find(([sql]) =>
      sql.includes('insert into user_memories'),
    );
    expect(insert?.[0]).toContain('project_id');
    expect(insert?.[1]?.[2]).toBe(PROJECT);
  });

  it('writes global when the conversation is not in a project', async () => {
    const d = writeDb();
    await persistManagedAutoMemoryFacts(d as never, {
      userId: 'u1',
      candidates: ['I prefer metric units.'],
    });

    const insert = (d.calls.mock.calls as unknown as Array<[string, unknown[]]>).find(([sql]) =>
      sql.includes('insert into user_memories'),
    );
    expect(insert?.[1]?.[2]).toBeNull();
  });

  it('dedupes within a scope, not across them', async () => {
    const d = writeDb();
    await persistManagedAutoMemoryFacts(d as never, {
      userId: 'u1',
      candidates: ['Same fact.'],
      projectId: PROJECT,
    });

    const insert = (d.calls.mock.calls as unknown as Array<[string, unknown[]]>).find(([sql]) =>
      sql.includes('insert into user_memories'),
    );
    // Without this the same sentence learned globally would block it ever being
    // recorded inside a project, and the project would silently have no memory.
    expect(insert?.[0]).toContain('existing.project_id is not distinct from $3::uuid');
  });
});
