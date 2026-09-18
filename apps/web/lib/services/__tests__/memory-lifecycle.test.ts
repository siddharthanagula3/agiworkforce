import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  MAX_MEMORY_EXPIRY_DAYS,
  UNGOVERNED_MEMORY_POLICY,
  loadManagedMemoryContext,
  parseMemoryExpiry,
  persistManagedAutoMemoryFacts,
  sweepExpiredMemories,
  writeConsolidatedMemory,
  type ManagedMemoryPolicy,
} from '../managed-memory-context-service';

const MEMORY_ON: ManagedMemoryPolicy = {
  enabled: true,
  generateFromHistory: true,
  allowToolAssistedGeneration: false,
  searchPastChats: false,
};

const WORKSPACE_MEMORY_ON = [
  { allow_memory: true, retention_days: null, retention_enforced: false },
];

const ORG = '0190a000-0000-7000-8000-00000000a001';
const OTHER_ORG = '0190a000-0000-7000-8000-00000000a002';
const NOW = Date.parse('2026-09-17T00:00:00.000Z');

type Call = [string, unknown[]];

function recordingDb(respond: (sql: string) => unknown[] = () => []) {
  const query = vi.fn(async (sql: string) =>
    sql.includes('organization_admin_policies') ? WORKSPACE_MEMORY_ON : respond(sql),
  );
  return { db: { query: query as never }, calls: () => query.mock.calls as unknown as Call[] };
}

describe('memory expiry input', () => {
  it('accepts a future date and normalises it', () => {
    expect(parseMemoryExpiry('2026-10-01T00:00:00Z', NOW)).toEqual({
      ok: true,
      expiresAt: '2026-10-01T00:00:00.000Z',
    });
  });

  it('distinguishes leaving the expiry alone from clearing it', () => {
    expect(parseMemoryExpiry(undefined, NOW)).toEqual({ ok: true, expiresAt: undefined });
    expect(parseMemoryExpiry(null, NOW)).toEqual({ ok: true, expiresAt: null });
  });

  it('refuses past, malformed, non-string and too-distant dates', () => {
    expect(parseMemoryExpiry('2026-09-01T00:00:00Z', NOW).ok).toBe(false);
    expect(parseMemoryExpiry('next tuesday', NOW).ok).toBe(false);
    expect(parseMemoryExpiry(1_900_000_000_000, NOW).ok).toBe(false);
    const tooFar = new Date(NOW + (MAX_MEMORY_EXPIRY_DAYS + 1) * 86_400_000).toISOString();
    expect(parseMemoryExpiry(tooFar, NOW).ok).toBe(false);
  });
});

describe('memory context reads', () => {
  it('excludes deleted, superseded and expired rows in SQL', async () => {
    const { db, calls } = recordingDb();
    await loadManagedMemoryContext(db, { userId: 'u1', policy: MEMORY_ON });

    const [sql] = calls()[0]!;
    expect(sql).toContain('is_deleted = false');
    expect(sql).toContain('superseded_by is null');
    expect(sql).toContain('(expires_at is null or expires_at > now())');
  });

  it('reads only the active workspace, never personal rows inside it', async () => {
    const { db, calls } = recordingDb();
    await loadManagedMemoryContext(db, { userId: 'u1', organizationId: ORG, policy: MEMORY_ON });

    const [sql, params] = calls()[0]!;
    expect(sql).toContain('organization_id is not distinct from $2::uuid');
    expect(params).toEqual(['u1', ORG]);
  });

  it('keeps personal memory personal', async () => {
    const { db, calls } = recordingDb();
    await loadManagedMemoryContext(db, { userId: 'u1', organizationId: null, policy: MEMORY_ON });

    const [sql, params] = calls()[0]!;
    expect(sql).toContain('organization_id is not distinct from $2::uuid');
    expect(params[1]).toBeNull();
  });
});

describe('consolidated memory write', () => {
  it('merges near-duplicates by a normalised content key within the same scope', async () => {
    const { db, calls } = recordingDb(() => [{ outcome: 'merged', id: 'm1' }]);
    const row = await writeConsolidatedMemory(
      db,
      {
        userId: 'u1',
        content: 'User prefers Rust.',
        category: 'preference',
        source: 'web',
        organizationId: ORG,
      },
      { organizationPolicy: UNGOVERNED_MEMORY_POLICY },
    );

    expect(row?.outcome).toBe('merged');
    const [sql, params] = calls()[0]!;
    expect(sql).toContain("regexp_replace(lower(existing.content), '[^[:alnum:]]+', ' ', 'g')");
    expect(sql).toContain('existing.organization_id is not distinct from $4::uuid');
    expect(sql).toContain('existing.project_id is not distinct from $3::uuid');
    expect(params[3]).toBe(ORG);
    expect(params[9]).toEqual([]);
  });

  it('supersedes a same-topic fact instead of overwriting it', async () => {
    const { db, calls } = recordingDb(() => [
      { outcome: 'inserted', id: 'm2', superseded_ids: ['m1'], superseded_by: null },
    ]);
    const row = await writeConsolidatedMemory(db, {
      userId: 'u1',
      content: 'User lives in Berlin',
      category: 'fact',
      source: 'web',
    });

    expect(row?.superseded_ids).toEqual(['m1']);
    const [sql, params] = calls()[0]!;
    expect(sql).toContain('set superseded_by = inserted.id::uuid, superseded_at = now()');
    expect(sql).not.toMatch(/delete from user_memories/);
    expect(params[9]).toEqual(['user lives in %', 'i live in %']);
    expect(params[10]).toBe(1);
  });

  it('ranks sources so a learned fact never displaces one the user wrote or pinned', async () => {
    const { db, calls } = recordingDb(() => [{ outcome: 'inserted', id: 'm3' }]);
    await writeConsolidatedMemory(db, {
      userId: 'u1',
      content: 'User works at Acme',
      category: 'fact',
      source: 'auto',
    });
    await writeConsolidatedMemory(db, {
      userId: 'u1',
      content: 'User works at Initech',
      category: 'fact',
      source: 'web',
      pinned: true,
    });

    const [autoSql, autoParams] = calls()[0]!;
    expect(autoParams[10]).toBe(0);
    expect(calls()[1]![1][10]).toBe(2);
    expect(autoSql).toContain(
      "case when existing.pinned then 2 when coalesce(existing.source, 'web') = 'auto' then 0 else 1 end",
    );
    expect(autoSql).toContain('where rivals.rank > incoming.rank');
    expect(autoSql).toContain('(select keeper.id from keeper)');
  });
});

describe('auto memory persistence', () => {
  function autoDb(outcome: 'inserted' | 'merged' = 'inserted') {
    return recordingDb((sql) =>
      sql.includes('user_settings') ? [{ memory: {} }] : [{ outcome, id: 'm1' }],
    );
  }

  it('collapses near-duplicate candidates before writing', async () => {
    const { db, calls } = autoDb();
    const result = await persistManagedAutoMemoryFacts(db, {
      userId: 'u1',
      candidates: ['User likes Rust.', 'user   likes rust', 'User likes Go'],
    });

    const writes = calls().filter(([sql]) => sql.includes('insert into user_memories'));
    expect(writes).toHaveLength(2);
    expect(result.inserted).toBe(2);
  });

  it('does not count a merge as a new memory', async () => {
    const { db } = autoDb('merged');
    const result = await persistManagedAutoMemoryFacts(db, {
      userId: 'u1',
      candidates: ['User likes Rust'],
    });

    expect(result.inserted).toBe(0);
  });

  it('writes the workspace and keys the row id per workspace', async () => {
    const first = autoDb();
    const second = autoDb();
    await persistManagedAutoMemoryFacts(first.db, {
      userId: 'u1',
      candidates: ['User likes Rust'],
      organizationId: ORG,
    });
    await persistManagedAutoMemoryFacts(second.db, {
      userId: 'u1',
      candidates: ['User likes Rust'],
      organizationId: OTHER_ORG,
    });

    const firstWrite = first.calls().find(([sql]) => sql.includes('insert into user_memories'))!;
    const secondWrite = second.calls().find(([sql]) => sql.includes('insert into user_memories'))!;
    expect(firstWrite[1][3]).toBe(ORG);
    expect(secondWrite[1][3]).toBe(OTHER_ORG);
    expect(firstWrite[1][1]).not.toBe(secondWrite[1][1]);
  });
});

describe('expired memory sweep', () => {
  it('soft-deletes and blanks due rows in batches until a short batch', async () => {
    const counts = [2, 1];
    const { db, calls } = recordingDb(() => [{ count: counts.shift() ?? 0 }]);

    const result = await sweepExpiredMemories(db, { batchSize: 2 });

    expect(result).toEqual({ expired: 3, remaining: false });
    expect(calls()).toHaveLength(2);
    const [sql, params] = calls()[0]!;
    expect(sql).toContain('expires_at <= now()');
    expect(sql).toContain("set is_deleted = true, content = '', category = null");
    expect(params).toEqual([2]);
  });

  it('reports a backlog when it runs out of batches', async () => {
    const { db } = recordingDb(() => [{ count: 5 }]);

    await expect(sweepExpiredMemories(db, { batchSize: 5, maxBatches: 2 })).resolves.toEqual({
      expired: 10,
      remaining: true,
    });
  });
});
