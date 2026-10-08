import { beforeEach, describe, expect, it, vi } from 'vitest';
type ScanModule0 = typeof import('@/lib/services/managed-memory-context-service');

const mocks = vi.hoisted(() => ({
  loadMemoryExclusions: vi.fn(async (..._args: unknown[]) => [] as string[]),
  loadOrganizationMemoryPolicy: vi.fn(async (..._args: unknown[]) => ({
    allowMemory: true,
    retentionDays: null as number | null,
    retentionEnforced: false,
  })),
  writeConsolidatedMemory: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    loadMemoryExclusions: (...args: unknown[]) => mocks.loadMemoryExclusions(...args),
    loadOrganizationMemoryPolicy: (...args: unknown[]) =>
      mocks.loadOrganizationMemoryPolicy(...args),
    writeConsolidatedMemory: (...args: unknown[]) => mocks.writeConsolidatedMemory(...args),
  };
});

const { runMemoryCommand } = await import('../memory-commands');

const SCOPE = { userId: 'user-1', organizationId: null };
const OWN_MEMORY_PROJECT = '0190a000-0000-7000-8000-0000000000e1';
const PROJECT = '0190a000-0000-7000-8000-0000000000e2';

function db(rows: Record<string, unknown[]> = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("settings -> 'capabilities'")) {
      return rows['capabilities'] ?? [{ capabilities: { memory: true } }];
    }
    if (sql.includes('organization_admin_policies')) {
      return (
        rows['policy'] ?? [{ allow_memory: true, retention_days: null, retention_enforced: false }]
      );
    }
    if (sql.includes('from user_projects')) return rows['project'] ?? [];
    if (sql.includes('update user_memories')) return rows['remove'] ?? [];
    if (sql.includes('select id::text as id, content')) return rows['find'] ?? [];
    return [];
  });
  return { query } as unknown as Parameters<typeof runMemoryCommand>[0] & {
    query: ReturnType<typeof vi.fn>;
  };
}

describe('runMemoryCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadMemoryExclusions.mockResolvedValue([]);
    mocks.loadOrganizationMemoryPolicy.mockResolvedValue({
      allowMemory: true,
      retentionDays: null,
      retentionEnforced: false,
    });
    mocks.writeConsolidatedMemory.mockResolvedValue({
      outcome: 'inserted',
      id: 'm1',
      content: 'I use TypeScript',
    });
  });

  it('ignores a turn that carries no command, so passive extraction still runs', async () => {
    expect(await runMemoryCommand(db(), SCOPE, { message: 'I live in Berlin' })).toBeNull();
    expect(mocks.writeConsolidatedMemory).not.toHaveBeenCalled();
  });

  it('stores an explicit remember and confirms it', async () => {
    const result = await runMemoryCommand(db(), SCOPE, {
      message: 'Remember that I use TypeScript',
    });

    expect(result).toMatchObject({ kind: 'remember' });
    expect(result?.outcome.status).toBe('stored');
    expect(result?.outcome.message).toBe('Saved to memory: I use TypeScript');
    expect(mocks.writeConsolidatedMemory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ content: 'I use TypeScript', source: 'web' }),
    );
  });

  it('refuses the write when the workspace has memory off, and says so', async () => {
    const result = await runMemoryCommand(
      db({ policy: [{ allow_memory: false, retention_days: null, retention_enforced: false }] }),
      { userId: 'user-1', organizationId: '0190a000-0000-7000-8000-00000000e001' },
      { message: 'Remember that I use TypeScript' },
    );

    expect(result?.outcome.status).toBe('refused');
    expect(result?.outcome.message).toContain('memory turned off');
    expect(mocks.writeConsolidatedMemory).not.toHaveBeenCalled();
  });

  it('refuses a fact the user asked never to remember', async () => {
    mocks.loadMemoryExclusions.mockResolvedValue(['typescript']);

    const result = await runMemoryCommand(db(), SCOPE, {
      message: 'Remember that I use TypeScript',
    });

    expect(result?.outcome.status).toBe('refused');
    expect(result?.outcome.message).toContain('never to remember');
    expect(mocks.writeConsolidatedMemory).not.toHaveBeenCalled();
  });

  it('names what a forget would delete and deletes nothing without confirmation', async () => {
    const connection = db({ find: [{ id: 'm1', content: 'User lives in Berlin' }] });

    const result = await runMemoryCommand(connection, SCOPE, {
      message: 'Forget what I told you about Berlin',
    });

    expect(result?.outcome.status).toBe('confirmation_required');
    expect(result?.outcome.message).toContain('cannot be undone');
    expect(
      connection.query.mock.calls.some(([sql]) => String(sql).includes('update user_memories')),
    ).toBe(false);
  });

  it('deletes on confirmation, keeps no copy of the text, and reports exactly what went', async () => {
    const removed = [{ id: 'm1', content: 'User lives in Berlin' }];
    const connection = db({ find: removed, remove: removed });

    const result = await runMemoryCommand(connection, SCOPE, {
      message: 'Forget what I told you about Berlin',
      confirmed: true,
    });

    expect(result?.outcome.status).toBe('forgotten');
    expect(result?.outcome.message).toContain('User lives in Berlin');

    const [sql, params] = connection.query.mock.calls.find(([text]) =>
      String(text).includes('update user_memories'),
    ) as [string, unknown[]];
    const assignments = /update user_memories as memory\s+set([\s\S]*?)\bfrom target\b/.exec(
      sql,
    )?.[1];
    expect(assignments).toMatch(/\bis_deleted = true\b/);
    expect(assignments).toMatch(/\bcontent = ''/);
    expect(assignments).toMatch(/\bcategory = null\b/);
    expect(assignments).toMatch(/\bimport_key = null\b/);
    expect(sql).toMatch(/select target\.id::text as id, target\.content\s+from target/);
    expect(params[1]).toEqual(['m1']);
  });

  it('forgets only what the chat can see: a project kept to its own memories never touches account ones', async () => {
    const removed = [{ id: 'm1', content: 'User takes a daily walk' }];
    const connection = db({
      project: [{ uses_global_memory: false }],
      find: removed,
      remove: removed,
    });

    await runMemoryCommand(
      connection,
      { ...SCOPE, projectId: OWN_MEMORY_PROJECT },
      { message: 'Forget what I told you about walking', confirmed: true },
    );

    const memoryCalls = connection.query.mock.calls.filter(([text]) =>
      String(text).includes('from user_memories'),
    ) as Array<[string, unknown[]]>;
    expect(memoryCalls).toHaveLength(2);
    for (const [sql, params] of memoryCalls) {
      expect(sql).toContain('project_id = $4::uuid');
      expect(sql).not.toContain('project_id is null');
      expect(params[3]).toBe(OWN_MEMORY_PROJECT);
    }
  });

  it('forgets account and project memories alike in an ordinary project chat', async () => {
    const connection = db({
      project: [{ uses_global_memory: true }],
      find: [{ id: 'm1', content: 'User lives in Berlin' }],
    });

    await runMemoryCommand(
      connection,
      { ...SCOPE, projectId: PROJECT },
      { message: 'Forget what I told you about Berlin' },
    );

    const [sql] = connection.query.mock.calls.find(([text]) =>
      String(text).includes('from user_memories'),
    ) as [string, unknown[]];
    expect(sql).toContain('(project_id is null or project_id = $4::uuid)');
  });

  it('says nothing was stored rather than claiming a deletion', async () => {
    const result = await runMemoryCommand(db(), SCOPE, {
      message: 'Forget what I told you about Berlin',
      confirmed: true,
    });
    expect(result?.outcome.status).toBe('nothing_to_forget');
  });

  it('never searches on a subject short enough to match everything', async () => {
    const connection = db();
    const result = await runMemoryCommand(connection, SCOPE, { message: 'Forget it' });
    expect(result?.outcome.status).toBe('nothing_to_forget');
    expect(connection.query).not.toHaveBeenCalled();
  });

  it('scopes every read and write to the caller', async () => {
    const connection = db({ find: [{ id: 'm1', content: 'User lives in Berlin' }] });
    await runMemoryCommand(connection, SCOPE, { message: 'Forget about Berlin' });

    const [sql, params] = connection.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('user_id = $1');
    expect(params[0]).toBe('user-1');
  });
});
