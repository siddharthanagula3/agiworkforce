import { beforeEach, describe, expect, it, vi } from 'vitest';

import { directoryEntry, SHA } from './fixtures';

const mocks = vi.hoisted(() => ({
  findRecord: vi.fn(),
  writeInstalledSkills: vi.fn(),
  getMarketplaceInstallation: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../memory-cache', () => ({
  findPluginDirectoryRecord: (id: string) => mocks.findRecord(id),
}));
vi.mock('../snapshot-cache', () => ({
  installedSkillsCacheParams: (repo: string, key: string, sha: string) =>
    `v1|${repo}|${key}|${sha}`,
  writeInstalledSkills: (...args: unknown[]) => mocks.writeInstalledSkills(...args),
  readPluginSnapshotRecords: async () => null,
  readPluginSnapshotStamp: async () => null,
  readPluginSyncState: async () => null,
}));
vi.mock('@/lib/services/plugin-marketplace-installation-service', () => ({
  getMarketplaceInstallation: (...args: unknown[]) => mocks.getMarketplaceInstallation(...args),
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  INSTALL_BUILTIN_MESSAGE,
  INSTALL_SKILLS_UNAVAILABLE_MESSAGE,
  INSTALL_UNKNOWN_MESSAGE,
  RUNTIME_NOTE_HOOKS,
  RUNTIME_NOTE_NOT_INSPECTED,
} from '../constants';
import { installDirectoryPlugin, uninstallDirectoryInstallation } from '../install';

const SKILL = [
  '---',
  'name: background-removal',
  'description: Remove backgrounds',
  '---',
  'Do it.',
].join('\n');
const INSTALLATION = {
  id: 'installation-1',
  entryId: 'entry-1',
  sourceId: 'source-1',
  pluginKey: 'adobe-for-creativity',
  installedVersion: `0.0.0+sha.${SHA}`,
  enabled: true,
  enabledSkills: ['background-removal'],
  customExamplePrompts: null,
  installedAt: '2026-09-06T00:00:00.000Z',
  updatedAt: '2026-09-06T00:00:00.000Z',
};

interface FakeDb {
  query: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  transaction: <T>(work: (tx: DatabaseAdapter) => Promise<T>) => Promise<T>;
  sql: string[];
}

function database(): FakeDb & DatabaseAdapter {
  const sql: string[] = [];
  const db = {
    sql,
    query: vi.fn(async (text: string) => {
      sql.push(text);
      if (text.includes('select id from public.plugin_marketplace_sources')) return [];
      if (text.includes('insert into public.plugin_marketplace_sources'))
        return [{ id: 'source-1' }];
      if (text.includes('insert into public.plugin_marketplace_entries'))
        return [{ id: 'entry-1' }];
      if (text.includes('insert into public.plugin_marketplace_installations'))
        return [{ id: 'installation-1' }];
      return [];
    }),
    execute: vi.fn(async (text: string) => {
      sql.push(text);
      return 1;
    }),
    transaction: async <T>(work: (tx: DatabaseAdapter) => Promise<T>) =>
      work(db as unknown as DatabaseAdapter),
  };
  return db as unknown as FakeDb & DatabaseAdapter;
}

const fetchedUrls: string[] = [];
const fetchSkill = vi.fn(async (input: string) => {
  fetchedUrls.push(input);
  return new Response(SKILL, { status: 200 });
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchedUrls.length = 0;
  mocks.findRecord.mockResolvedValue(directoryEntry());
  mocks.getMarketplaceInstallation.mockResolvedValue(INSTALLATION);
});

describe('installDirectoryPlugin', () => {
  it('fetches the skills, shadows the marketplace and records the installation', async () => {
    const db = database();
    const result = await installDirectoryPlugin(db, 'user-1', 'adobe-for-creativity', {
      fetchImpl: fetchSkill,
    });

    expect(result).toEqual({
      status: 'installed',
      installation: INSTALLATION,
      skills: ['background-removal'],
    });
    expect(fetchedUrls[0]).toBe(
      `https://raw.githubusercontent.com/adobe/skills/${SHA}/plugins/creative-cloud/adobe-for-creativity/skills/background-removal/SKILL.md`,
    );
    expect(mocks.writeInstalledSkills).toHaveBeenCalledWith(
      `v1|https://github.com/anthropics/claude-plugins-official|adobe-for-creativity|${SHA}`,
      [
        {
          name: 'background-removal',
          description: 'Remove backgrounds',
          body: 'Do it.',
          path: 'skills/background-removal/SKILL.md',
        },
      ],
    );
    const sourceInsert = db.query.mock.calls.find(([text]) =>
      (text as string).includes('insert into public.plugin_marketplace_sources'),
    );
    expect(sourceInsert?.[1]).toEqual([
      'user-1',
      'claude-plugins-official',
      'https://github.com/anthropics/claude-plugins-official',
      null,
      'active',
      'a'.repeat(64),
    ]);
    const entryInsert = db.query.mock.calls.find(([text]) =>
      (text as string).includes('insert into public.plugin_marketplace_entries'),
    );
    expect(entryInsert?.[1]).toEqual([
      'source-1',
      'adobe-for-creativity',
      'Adobe for Creativity',
      'Adobe tools.',
      `0.0.0+sha.${SHA}`,
      JSON.stringify(['background-removal']),
      'a'.repeat(64),
    ]);
    const installInsert = db.query.mock.calls.find(([text]) =>
      (text as string).includes('insert into public.plugin_marketplace_installations'),
    );
    expect(installInsert?.[1]).toEqual([
      'user-1',
      'entry-1',
      `0.0.0+sha.${SHA}`,
      JSON.stringify(['background-removal']),
    ]);
    expect(mocks.getMarketplaceInstallation).toHaveBeenCalledWith(db, 'user-1', 'installation-1');
  });

  it('reports an unknown id and a built-in pack without touching the database', async () => {
    mocks.findRecord.mockResolvedValueOnce(null);
    const db = database();
    await expect(installDirectoryPlugin(db, 'user-1', 'nope')).resolves.toEqual({
      status: 'missing',
      message: INSTALL_UNKNOWN_MESSAGE,
    });
    mocks.findRecord.mockResolvedValueOnce(directoryEntry({ sourceFacet: 'builtin' }));
    await expect(installDirectoryPlugin(db, 'user-1', 'engineering-pack')).resolves.toEqual({
      status: 'builtin',
      message: INSTALL_BUILTIN_MESSAGE,
    });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('blocks a plugin the web runtime cannot run and returns its CLI command', async () => {
    mocks.findRecord.mockResolvedValueOnce(
      directoryEntry({
        runtime: { ...directoryEntry().runtime, webInstallable: false, note: RUNTIME_NOTE_HOOKS },
      }),
    );
    await expect(
      installDirectoryPlugin(database(), 'user-1', 'adobe-for-creativity'),
    ).resolves.toEqual({
      status: 'blocked',
      message: RUNTIME_NOTE_HOOKS,
      installCommand: 'claude plugin install adobe-for-creativity@claude-plugins-official',
    });
  });

  it('blocks a plugin whose sha was never resolved', async () => {
    mocks.findRecord.mockResolvedValueOnce(
      directoryEntry({ sourceLocation: { ...directoryEntry().sourceLocation!, sha: null } }),
    );
    await expect(
      installDirectoryPlugin(database(), 'user-1', 'adobe-for-creativity'),
    ).resolves.toMatchObject({
      status: 'blocked',
      message: RUNTIME_NOTE_NOT_INSPECTED,
    });
  });

  it('does not record anything when no skill file could be fetched', async () => {
    const db = database();
    const result = await installDirectoryPlugin(db, 'user-1', 'adobe-for-creativity', {
      fetchImpl: async () => new Response('', { status: 404 }),
    });
    expect(result).toEqual({
      status: 'skills-unavailable',
      message: INSTALL_SKILLS_UNAVAILABLE_MESSAGE,
    });
    expect(db.query).not.toHaveBeenCalled();
    expect(mocks.writeInstalledSkills).not.toHaveBeenCalled();
  });
});

describe('uninstallDirectoryInstallation', () => {
  it('removes the installation and prunes the orphaned shadow entry and source', async () => {
    const db = database();
    db.query.mockImplementationOnce(async (text: string) => {
      db.sql.push(text);
      return [
        {
          entry_id: 'entry-1',
          source_id: 'source-1',
          repository_url: 'https://github.com/anthropics/claude-plugins-official',
        },
      ];
    });
    await expect(uninstallDirectoryInstallation(db, 'user-1', 'installation-1')).resolves.toBe(
      true,
    );
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.execute.mock.calls[0]![0]).toContain('delete from public.plugin_marketplace_entries');
    expect(db.execute.mock.calls[1]![0]).toContain('delete from public.plugin_marketplace_sources');
  });

  it('leaves entries of an account-registered marketplace alone', async () => {
    const db = database();
    db.query.mockImplementationOnce(async () => [
      {
        entry_id: 'entry-9',
        source_id: 'source-9',
        repository_url: 'https://github.com/acme/marketplace',
      },
    ]);
    await expect(uninstallDirectoryInstallation(db, 'user-1', 'installation-9')).resolves.toBe(
      true,
    );
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('answers false when nothing was installed', async () => {
    await expect(uninstallDirectoryInstallation(database(), 'user-1', 'missing')).resolves.toBe(
      false,
    );
  });
});
