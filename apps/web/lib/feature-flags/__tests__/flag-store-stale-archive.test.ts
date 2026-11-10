import { describe, expect, it, vi } from 'vitest';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  getNeonDb: vi.fn(),
}));

import { archiveStaleFlagDefinition, upsertFlagOverride } from '../flag-store';

const KEY = 'capability.dictation';

const ARCHIVED_ROW = {
  key: KEY,
  description: 'Dictation',
  kill_switch: false,
  variants: ['on', 'off'],
  default_variant: 'on',
  rules: [],
  expires_at: null,
  maturity: null,
  release_channel: null,
  availability: null,
  owner_name: null,
  archived_at: '2026-11-08T00:00:00.000Z',
  version: 4,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-11-08T00:00:00.000Z',
};

interface Script {
  candidate?: Record<string, unknown>[];
  restriction?: Record<string, unknown>[];
  archived?: Record<string, unknown>[];
  definition?: Record<string, unknown>[];
}

function database(script: Script) {
  const statements: { sql: string; params: unknown[] }[] = [];
  const answer = async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes('select default_variant')) return script.candidate ?? [];
    if (sql.includes('select true as restricted')) return script.restriction ?? [];
    if (sql.includes('set archived_at = now()')) return script.archived ?? [];
    if (sql.includes('select archived_at')) return script.definition ?? [];
    return [];
  };
  const tx = {
    query: vi.fn(answer),
    execute: vi.fn(async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params });
      return 1;
    }),
  };
  const db = {
    transaction: vi.fn(async (fn: (inner: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as DatabaseAdapter;
  return { db, statements, tx };
}

describe('archiving a stale flag definition', () => {
  it('locks the exact version it decided on and only while no kill is engaged', async () => {
    const { db, statements } = database({ candidate: [], archived: [ARCHIVED_ROW] });

    const archived = await archiveStaleFlagDefinition(
      KEY,
      { expectedVersion: 3, keepRestrictedSubjects: true },
      db,
    );

    expect(archived).toBeNull();
    expect(statements).toHaveLength(1);
    expect(statements[0]?.sql).toMatch(/version = \$2/);
    expect(statements[0]?.sql).toMatch(/kill_switch = false/);
    expect(statements[0]?.sql).toMatch(/for update/);
    expect(statements[0]?.params).toEqual([KEY, 3]);
  });

  it('keeps a flag that still holds a subject at a variant other than its default', async () => {
    const { db, statements } = database({
      candidate: [{ default_variant: 'on' }],
      restriction: [{ restricted: true }],
      archived: [ARCHIVED_ROW],
    });

    const archived = await archiveStaleFlagDefinition(
      KEY,
      { expectedVersion: 3, keepRestrictedSubjects: true },
      db,
    );

    expect(archived).toBeNull();
    const restrictionRead = statements.find(({ sql }) => sql.includes('select true as restricted'));
    expect(restrictionRead?.sql).toMatch(/expires_at is null or expires_at > now\(\)/);
    expect(restrictionRead?.params).toEqual([KEY, 'on']);
    expect(statements.some(({ sql }) => sql.includes('set archived_at = now()'))).toBe(false);
  });

  it('archives a flag whose subjects all follow its default', async () => {
    const { db, statements } = database({
      candidate: [{ default_variant: 'on' }],
      restriction: [],
      archived: [ARCHIVED_ROW],
    });

    const archived = await archiveStaleFlagDefinition(
      KEY,
      { expectedVersion: 3, keepRestrictedSubjects: true },
      db,
    );

    expect(archived).toMatchObject({ key: KEY });
    expect(statements.some(({ sql }) => sql.includes('set archived_at = now()'))).toBe(true);
  });

  it('does not look at subject overrides for a flag whose overrides decide nothing', async () => {
    const { db, statements } = database({
      candidate: [{ default_variant: 'on' }],
      restriction: [{ restricted: true }],
      archived: [ARCHIVED_ROW],
    });

    const archived = await archiveStaleFlagDefinition(
      KEY,
      { expectedVersion: 3, keepRestrictedSubjects: false },
      db,
    );

    expect(archived).toMatchObject({ key: KEY });
    expect(statements.some(({ sql }) => sql.includes('select true as restricted'))).toBe(false);
  });
});

describe('writing a subject override', () => {
  const OVERRIDE = {
    subject: 'user' as const,
    subjectId: 'user-1',
    variant: 'off',
    expiresAt: null,
  };

  it('takes a share lock on the definition before it writes', async () => {
    const { db, statements } = database({ definition: [{ archived_at: null }] });

    const written = await upsertFlagOverride(KEY, OVERRIDE, db);

    expect(written).toBe(true);
    expect(statements[0]?.sql).toMatch(/for share/);
    expect(statements[1]?.sql).toContain('insert into public.feature_flags');
  });

  it('refuses to write against a definition that was archived in the meantime', async () => {
    const { db, tx } = database({ definition: [{ archived_at: '2026-11-08T00:00:00.000Z' }] });

    const written = await upsertFlagOverride(KEY, OVERRIDE, db);

    expect(written).toBe(false);
    expect(tx.execute).not.toHaveBeenCalled();
  });

  it('still writes an override for a switch that has no definition row', async () => {
    const { db, tx } = database({ definition: [] });

    await expect(upsertFlagOverride(KEY, OVERRIDE, db)).resolves.toBe(true);
    expect(tx.execute).toHaveBeenCalledTimes(1);
  });
});

type ImportedModule1 = typeof import('@/lib/logger');
type ImportedModule0 = typeof import('@/lib/server/neon-db');
