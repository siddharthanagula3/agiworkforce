import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ scan: vi.fn() }));
vi.mock('@/lib/services/plugin-marketplace-service', () => ({
  scanAndRecordPluginPackage: mocks.scan,
  PluginPackageRefusedError: class PluginPackageRefusedError extends Error {},
}));

import { createSubmission } from '../plugin-submission-service';

const SKILL_BETA = '---\nname: beta\ndescription: beta\n---\nbeta';

function entryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    plugin_key: 'plugin-key',
    name: 'Plugin',
    description: 'A plugin',
    version: '1.0.0',
    declared_skills: ['beta'],
    content_hash: 'hash-beta',
    files: [{ path: 'skills/beta/SKILL.md', content: SKILL_BETA }],
    ...overrides,
  };
}

function fakeDb(entry: Record<string, unknown> | null) {
  const tx = {
    execute: vi.fn(async () => 1),
    query: vi.fn(async () => [{ id: 'submission-1' }]),
  };
  const db = {
    query: vi.fn(async (sql: string) => {
      if (/from public\.plugin_marketplace_entries/iu.test(sql)) return entry ? [entry] : [];
      return [];
    }),
    transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)),
  };
  return { db, tx };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scan.mockResolvedValue({ verdict: 'pass', findings: [] });
});

describe('createSubmission', () => {
  it('reads the entry metadata and its files in one statement', async () => {
    const { db } = fakeDb(entryRow());

    await createSubmission(db as never, 'user-1', {
      entryId: 'entry-1',
      category: null,
      publisherName: 'Publisher',
    });

    const reads = db.query.mock.calls.filter(([sql]) =>
      /plugin_marketplace_entr/iu.test(String(sql)),
    );
    expect(reads).toHaveLength(1);
    expect(String(reads[0]?.[0])).toMatch(/plugin_marketplace_entry_files/iu);
  });

  it('scans and stores the files of the revision whose metadata it recorded', async () => {
    const { db, tx } = fakeDb(entryRow());

    await createSubmission(db as never, 'user-1', {
      entryId: 'entry-1',
      category: null,
      publisherName: 'Publisher',
    });

    expect(mocks.scan).toHaveBeenCalledWith(db, 'plugin-key', 'hash-beta', [
      { path: 'skills/beta/SKILL.md', content: SKILL_BETA },
    ]);
    const insert = tx.query.mock.calls.find(([sql]) =>
      /insert into public\.plugin_submissions/iu.test(String(sql)),
    ) as unknown as [string, unknown[]];
    expect(insert[1]).toEqual(expect.arrayContaining([JSON.stringify(['beta']), 'hash-beta']));
    const fileInserts = tx.execute.mock.calls.filter(([sql]) =>
      /insert into public\.plugin_submission_files/iu.test(String(sql)),
    ) as unknown as Array<[string, unknown[]]>;
    expect(fileInserts.map(([, params]) => params[2])).toEqual(['skills/beta/SKILL.md']);
  });

  it('accepts the files as a JSON string from a driver that does not parse jsonb', async () => {
    const { db } = fakeDb(entryRow({ files: JSON.stringify(entryRow().files) }));

    await createSubmission(db as never, 'user-1', {
      entryId: 'entry-1',
      category: null,
      publisherName: 'Publisher',
    });

    expect(mocks.scan).toHaveBeenCalledTimes(1);
  });

  it('refuses an entry that has no files stored with it', async () => {
    const { db } = fakeDb(entryRow({ files: [] }));

    await expect(
      createSubmission(db as never, 'user-1', {
        entryId: 'entry-1',
        category: null,
        publisherName: 'Publisher',
      }),
    ).rejects.toThrow(/no files/iu);
    expect(mocks.scan).not.toHaveBeenCalled();
  });

  it('returns nothing for an entry the member does not own', async () => {
    const { db } = fakeDb(null);

    await expect(
      createSubmission(db as never, 'user-1', {
        entryId: 'entry-1',
        category: null,
        publisherName: 'Publisher',
      }),
    ).resolves.toBeNull();
  });
});
