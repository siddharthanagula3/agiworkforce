import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ getInstallation: vi.fn() }));
vi.mock('@/lib/services/plugin-marketplace-installation-service', () => ({
  getMarketplaceInstallation: (...args: unknown[]) => mocks.getInstallation(...args),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  listOwnedEntryFiles,
  ownedPluginContentHash,
  storeOwnedPluginSource,
  type OwnedPluginInput,
} from './plugin-owned-source-service';

const USER_ID = 'user-1';
const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const ENTRY_ID = '22222222-2222-4222-8222-222222222222';
const INSTALLATION_ID = '33333333-3333-4333-8333-333333333333';

interface RecordedStatement {
  sql: string;
  params: unknown[];
}

function plugin(overrides: Partial<OwnedPluginInput> = {}): OwnedPluginInput {
  return {
    key: 'my-plugin',
    name: 'My plugin',
    description: 'Does a thing',
    version: '1.0.0',
    skills: [
      {
        name: 'summarise',
        description: 'Summarise things',
        body: 'Do it.',
        path: 'skills/summarise/SKILL.md',
      },
    ],
    ...overrides,
  };
}

function transactionalDb(): {
  db: DatabaseAdapter;
  statements: RecordedStatement[];
} {
  const statements: RecordedStatement[] = [];
  const run = async (sql: string, params: unknown[] = []): Promise<Record<string, string>[]> => {
    statements.push({ sql, params });
    if (sql.includes('select id from public.plugin_marketplace_sources')) return [];
    if (sql.includes('insert into public.plugin_marketplace_sources')) return [{ id: SOURCE_ID }];
    if (sql.includes('insert into public.plugin_marketplace_entries')) return [{ id: ENTRY_ID }];
    if (sql.includes('insert into public.plugin_marketplace_installations')) {
      return [{ id: INSTALLATION_ID }];
    }
    return [];
  };
  const adapter = {
    query: run,
    execute: run,
    transaction: async (fn: (tx: DatabaseAdapter) => Promise<unknown>) =>
      fn(adapter as unknown as DatabaseAdapter),
  };
  return { db: adapter as unknown as DatabaseAdapter, statements };
}

function statementMatching(statements: RecordedStatement[], needle: string): RecordedStatement {
  const found = statements.find((statement) => statement.sql.includes(needle));
  if (!found) throw new Error(`no statement contains ${needle}`);
  return found;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getInstallation.mockResolvedValue({
    id: INSTALLATION_ID,
    entryId: ENTRY_ID,
    sourceId: SOURCE_ID,
    pluginKey: 'my-plugin',
    installedVersion: '1.0.0',
    enabled: true,
    enabledSkills: ['summarise'],
    customExamplePrompts: null,
    installedAt: '2026-09-07T00:00:00.000Z',
    updatedAt: '2026-09-07T00:00:00.000Z',
  });
});

describe('ownedPluginContentHash', () => {
  it('is stable for the same plugin and changes when a skill body changes', () => {
    const first = ownedPluginContentHash(plugin());
    expect(ownedPluginContentHash(plugin())).toBe(first);
    expect(
      ownedPluginContentHash(
        plugin({
          skills: [
            {
              name: 'summarise',
              description: 'Summarise things',
              body: 'Do it differently.',
              path: 'skills/summarise/SKILL.md',
            },
          ],
        }),
      ),
    ).not.toBe(first);
  });

  it('does not depend on the order the skills arrive in', () => {
    const skills = [
      { name: 'a', description: 'a', body: 'A', path: 'skills/a/SKILL.md' },
      { name: 'b', description: 'b', body: 'B', path: 'skills/b/SKILL.md' },
    ];
    expect(ownedPluginContentHash(plugin({ skills }))).toBe(
      ownedPluginContentHash(plugin({ skills: [...skills].reverse() })),
    );
  });
});

describe('storeOwnedPluginSource', () => {
  it('writes the source with no repository and the kind the caller asked for', async () => {
    const { db, statements } = transactionalDb();
    await storeOwnedPluginSource(db, USER_ID, {
      kind: 'upload',
      sourceName: 'My plugin',
      plugins: [plugin()],
    });
    const insert = statementMatching(statements, 'insert into public.plugin_marketplace_sources');
    expect(insert.sql).toContain('repository_url');
    expect(insert.params).toEqual([USER_ID, 'My plugin', 'upload', 'active', expect.any(String)]);
    expect(insert.sql).toContain('values ($1, $2, $3, null, null, $4, $5, now())');
  });

  it('stores each skill body with its own hash and byte size', async () => {
    const { db, statements } = transactionalDb();
    await storeOwnedPluginSource(db, USER_ID, {
      kind: 'upload',
      sourceName: 'My plugin',
      plugins: [plugin()],
    });
    const file = statementMatching(statements, 'insert into public.plugin_marketplace_entry_files');
    expect(file.params[0]).toBe(ENTRY_ID);
    expect(file.params[1]).toBe('skills/summarise/SKILL.md');
    expect(file.params[2]).toBe('Do it.');
    expect(file.params[3]).toMatch(/^[0-9a-f]{64}$/);
    expect(file.params[4]).toBe(Buffer.byteLength('Do it.', 'utf8'));
  });

  it('removes the files and entries a re-upload no longer carries', async () => {
    const { db, statements } = transactionalDb();
    await storeOwnedPluginSource(db, USER_ID, {
      kind: 'upload',
      sourceName: 'My plugin',
      plugins: [plugin()],
    });
    const staleFiles = statementMatching(
      statements,
      'delete from public.plugin_marketplace_entry_files',
    );
    expect(staleFiles.params).toEqual([ENTRY_ID, ['skills/summarise/SKILL.md']]);
    const staleEntries = statementMatching(
      statements,
      'delete from public.plugin_marketplace_entries',
    );
    expect(staleEntries.params).toEqual([SOURCE_ID, ['my-plugin']]);
  });

  it('enables exactly the skills the plugin shipped', async () => {
    const { db, statements } = transactionalDb();
    const stored = await storeOwnedPluginSource(db, USER_ID, {
      kind: 'authored',
      sourceName: 'My plugin',
      plugins: [plugin()],
    });
    const installation = statementMatching(
      statements,
      'insert into public.plugin_marketplace_installations',
    );
    expect(installation.params[3]).toBe(JSON.stringify(['summarise']));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ pluginKey: 'my-plugin', skills: ['summarise'] });
  });

  it('reuses the source a second upload of the same name targets', async () => {
    const statements: RecordedStatement[] = [];
    const run = async (sql: string, params: unknown[] = []): Promise<Record<string, string>[]> => {
      statements.push({ sql, params });
      if (sql.includes('select id from public.plugin_marketplace_sources')) {
        return [{ id: SOURCE_ID }];
      }
      if (sql.includes('insert into public.plugin_marketplace_entries')) return [{ id: ENTRY_ID }];
      if (sql.includes('insert into public.plugin_marketplace_installations')) {
        return [{ id: INSTALLATION_ID }];
      }
      return [];
    };
    const adapter = {
      query: run,
      execute: run,
      transaction: async (fn: (tx: DatabaseAdapter) => Promise<unknown>) =>
        fn(adapter as unknown as DatabaseAdapter),
    } as unknown as DatabaseAdapter;

    await storeOwnedPluginSource(adapter, USER_ID, {
      kind: 'upload',
      sourceName: 'My plugin',
      plugins: [plugin()],
    });
    expect(
      statements.some((statement) =>
        statement.sql.includes('insert into public.plugin_marketplace_sources'),
      ),
    ).toBe(false);
    const lookup = statementMatching(
      statements,
      'select id from public.plugin_marketplace_sources',
    );
    expect(lookup.params).toEqual([USER_ID, 'upload', 'My plugin']);
  });
});

describe('listOwnedEntryFiles', () => {
  it('asks for nothing when there are no owned entries', async () => {
    const query = vi.fn();
    const db = { query, execute: vi.fn() } as unknown as DatabaseAdapter;
    await expect(listOwnedEntryFiles(db, USER_ID, [])).resolves.toEqual(new Map());
    expect(query).not.toHaveBeenCalled();
  });

  it('groups the stored files by entry and scopes the read to the owner', async () => {
    const query = vi.fn().mockResolvedValue([
      { entry_id: ENTRY_ID, path: 'skills/a/SKILL.md', content: 'A' },
      { entry_id: ENTRY_ID, path: 'skills/b/SKILL.md', content: 'B' },
    ]);
    const db = { query, execute: vi.fn() } as unknown as DatabaseAdapter;
    const files = await listOwnedEntryFiles(db, USER_ID, [ENTRY_ID]);
    expect(String(query.mock.calls[0]![0])).toContain('sources.user_id = $2');
    expect(query.mock.calls[0]![1]).toEqual([[ENTRY_ID], USER_ID]);
    expect(files.get(ENTRY_ID)).toEqual([
      { path: 'skills/a/SKILL.md', content: 'A' },
      { path: 'skills/b/SKILL.md', content: 'B' },
    ]);
  });
});
