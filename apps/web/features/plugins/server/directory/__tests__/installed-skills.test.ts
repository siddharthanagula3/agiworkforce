import { beforeEach, describe, expect, it, vi } from 'vitest';

import { directoryEntry, SHA } from './fixtures';

const mocks = vi.hoisted(() => ({
  findRecord: vi.fn(),
  readInstalledSkills: vi.fn(),
  writeInstalledSkills: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../memory-cache', () => ({
  findPluginDirectoryRecord: (id: string) => mocks.findRecord(id),
}));
vi.mock('../snapshot-cache', () => ({
  installedSkillsCacheParams: (repo: string, key: string, sha: string) =>
    `v1|${repo}|${key}|${sha}`,
  readInstalledSkills: (params: string) => mocks.readInstalledSkills(params),
  writeInstalledSkills: (...args: unknown[]) => mocks.writeInstalledSkills(...args),
  readPluginSnapshotRecords: async () => null,
  readPluginSnapshotStamp: async () => null,
  readPluginSyncState: async () => null,
}));

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { findInstalledDirectorySkill, listInstalledDirectorySkills } from '../installed-skills';

const ROW = {
  plugin_key: 'adobe-for-creativity',
  installed_version: `0.0.0+sha.${SHA}`,
  enabled_skills: ['background-removal'],
  repository_url: 'https://github.com/anthropics/claude-plugins-official',
};
const CACHED = [
  {
    name: 'background-removal',
    description: 'Remove backgrounds',
    body: 'Do it.',
    path: 'skills/background-removal/SKILL.md',
  },
  {
    name: 'vectorize',
    description: 'Vectorize',
    body: 'Trace it.',
    path: 'skills/vectorize/SKILL.md',
  },
];

function database(rows: unknown[]): DatabaseAdapter & { query: ReturnType<typeof vi.fn> } {
  const db = { query: vi.fn().mockResolvedValue(rows), execute: vi.fn() };
  return db as unknown as DatabaseAdapter & { query: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readInstalledSkills.mockResolvedValue(CACHED);
  mocks.findRecord.mockResolvedValue(directoryEntry());
});

describe('listInstalledDirectorySkills', () => {
  it('returns only the enabled skills of directory installations as extra-source skills', async () => {
    const db = database([ROW]);
    const skills = await listInstalledDirectorySkills(db, 'user-1');
    expect(db.query.mock.calls[0]![1]).toEqual(['user-1']);
    expect(String(db.query.mock.calls[0]![0])).toContain('sources.user_id = $1');
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: 'background-removal',
      description: 'Remove backgrounds',
      body: 'Do it.',
      source: 'extra',
      filePath: 'plugins/adobe-for-creativity/skills/background-removal/SKILL.md',
      frontmatter: { plugin: 'adobe-for-creativity' },
    });
    expect(skills[0]!.contentHash).toMatch(/^sha256:/);
  });

  it('refetches the skill files at the installed sha when the cache is cold', async () => {
    mocks.readInstalledSkills.mockResolvedValueOnce(null);
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: string) => {
      requested.push(input);
      return new Response('---\nname: background-removal\n---\nRefetched.', { status: 200 });
    });
    const skills = await listInstalledDirectorySkills(database([ROW]), 'user-1', fetchImpl);
    expect(requested[0]).toContain(`/adobe/skills/${SHA}/`);
    expect(skills.map((skill) => skill.body)).toEqual(['Refetched.']);
    expect(mocks.writeInstalledSkills).toHaveBeenCalledTimes(1);
  });

  it('skips installations whose version carries no sha and dedupes names across plugins', async () => {
    const db = database([
      ROW,
      { ...ROW, plugin_key: 'other', installed_version: '1.0.0' },
      { ...ROW, plugin_key: 'twin' },
    ]);
    const skills = await listInstalledDirectorySkills(db, 'user-1');
    expect(skills.map((skill) => skill.filePath)).toEqual([
      'plugins/adobe-for-creativity/skills/background-removal/SKILL.md',
    ]);
  });
});

describe('listInstalledDirectorySkills without the marketplace schema', () => {
  it('answers with no skills instead of failing the caller', async () => {
    const db = database([]);
    db.query.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: '42P01' }));
    await expect(listInstalledDirectorySkills(db, 'user-1')).resolves.toEqual([]);
    db.query.mockRejectedValueOnce(new Error('connection refused'));
    await expect(listInstalledDirectorySkills(db, 'user-1')).rejects.toThrow('connection refused');
  });
});

describe('findInstalledDirectorySkill', () => {
  it('finds a skill by exact name', async () => {
    await expect(
      findInstalledDirectorySkill(database([ROW]), 'user-1', 'background-removal'),
    ).resolves.toMatchObject({
      name: 'background-removal',
    });
    await expect(
      findInstalledDirectorySkill(database([ROW]), 'user-1', 'vectorize'),
    ).resolves.toBeNull();
  });
});

const OWN_SOURCE_ROW = {
  plugin_key: 'acme-support',
  installed_version: '1.2.0',
  enabled_skills: ['triage-ticket'],
  declared_skills: ['triage-ticket', 'draft-reply'],
  content_hash: 'c'.repeat(64),
  repository_url: 'https://github.com/acme/tools',
  ref: 'main',
};

describe('an install from the account own registered marketplace', () => {
  it('serves that entry skills from that entry own repository', async () => {
    mocks.readInstalledSkills.mockResolvedValueOnce(null);
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: string) => {
      requested.push(input);
      return new Response('---\nname: triage-ticket\n---\nTriage it.', { status: 200 });
    });

    const skills = await listInstalledDirectorySkills(
      database([OWN_SOURCE_ROW]),
      'user-1',
      fetchImpl,
    );

    expect(
      requested.some((url) => url.includes('/acme/tools/main/skills/triage-ticket/SKILL.md')),
    ).toBe(true);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: 'triage-ticket',
      body: 'Triage it.',
      source: 'extra',
      filePath: 'plugins/acme-support/skills/triage-ticket/SKILL.md',
    });
  });

  it('never borrows another repository location when a snapshot id happens to collide', async () => {
    mocks.readInstalledSkills.mockResolvedValueOnce(null);
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: string) => {
      requested.push(input);
      return new Response('---\nname: triage-ticket\n---\nTriage it.', { status: 200 });
    });

    await listInstalledDirectorySkills(database([OWN_SOURCE_ROW]), 'user-1', fetchImpl);

    expect(requested.every((url) => url.includes('/acme/tools/'))).toBe(true);
    expect(requested.some((url) => url.includes('/adobe/'))).toBe(false);
  });

  it('uses the inspected paths when the account registered a marketplace we already know', async () => {
    mocks.readInstalledSkills.mockResolvedValueOnce(null);
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: string) => {
      requested.push(input);
      return new Response('---\nname: background-removal\n---\nRemove it.', { status: 200 });
    });

    const skills = await listInstalledDirectorySkills(
      database([
        {
          ...OWN_SOURCE_ROW,
          plugin_key: 'adobe-for-creativity',
          enabled_skills: ['background-removal'],
          declared_skills: ['background-removal'],
          repository_url: 'https://github.com/anthropics/claude-plugins-official',
        },
      ]),
      'user-1',
      fetchImpl,
    );

    expect(requested.some((url) => url.includes('skills/background-removal/SKILL.md'))).toBe(true);
    expect(skills.map((skill) => skill.name)).toEqual(['background-removal']);
  });

  it('serves only the skills the installation has enabled', async () => {
    mocks.readInstalledSkills.mockResolvedValue([
      { name: 'triage-ticket', description: '', body: 'A', path: 'skills/triage-ticket/SKILL.md' },
      { name: 'draft-reply', description: '', body: 'B', path: 'skills/draft-reply/SKILL.md' },
    ]);
    const skills = await listInstalledDirectorySkills(database([OWN_SOURCE_ROW]), 'user-1');
    expect(skills.map((skill) => skill.name)).toEqual(['triage-ticket']);
  });

  it('serves nothing when the entry declares no skills of its own', async () => {
    const skills = await listInstalledDirectorySkills(
      database([{ ...OWN_SOURCE_ROW, declared_skills: [] }]),
      'user-1',
    );
    expect(skills).toEqual([]);
  });

  it('refuses a declared name that would climb out of the plugin directory', async () => {
    mocks.readInstalledSkills.mockResolvedValueOnce(null);
    const requested: string[] = [];
    const fetchImpl = vi.fn(async (input: string) => {
      requested.push(input);
      return new Response('', { status: 404 });
    });

    await listInstalledDirectorySkills(
      database([{ ...OWN_SOURCE_ROW, declared_skills: ['../../etc/passwd'] }]),
      'user-1',
      fetchImpl,
    );

    expect(requested).toEqual([]);
  });
});

function scopedDatabase(
  rowsByUser: Readonly<Record<string, unknown[]>>,
): DatabaseAdapter & { query: ReturnType<typeof vi.fn> } {
  const db = {
    query: vi.fn(async (_sql: string, params: unknown[]) => {
      const callerId = params[0];
      return typeof callerId === 'string' ? (rowsByUser[callerId] ?? []) : [];
    }),
    execute: vi.fn(),
  };
  return db as unknown as DatabaseAdapter & { query: ReturnType<typeof vi.fn> };
}

describe('one account own-source install never resolves for another account', () => {
  const ownedByA = { ...OWN_SOURCE_ROW, plugin_key: 'acme-support' };
  const ownedByB = {
    ...OWN_SOURCE_ROW,
    plugin_key: 'globex-support',
    enabled_skills: ['escalate'],
    declared_skills: ['escalate'],
    repository_url: 'https://github.com/globex/tools',
  };

  beforeEach(() => {
    mocks.readInstalledSkills.mockResolvedValue([
      { name: 'triage-ticket', description: '', body: 'A', path: 'skills/triage-ticket/SKILL.md' },
      { name: 'escalate', description: '', body: 'B', path: 'skills/escalate/SKILL.md' },
    ]);
  });

  it('serves each account only its own install', async () => {
    const db = scopedDatabase({ 'user-a': [ownedByA], 'user-b': [ownedByB] });

    await expect(
      listInstalledDirectorySkills(db, 'user-a').then((skills) =>
        skills.map((skill) => skill.filePath),
      ),
    ).resolves.toEqual(['plugins/acme-support/skills/triage-ticket/SKILL.md']);

    await expect(
      listInstalledDirectorySkills(db, 'user-b').then((skills) =>
        skills.map((skill) => skill.filePath),
      ),
    ).resolves.toEqual(['plugins/globex-support/skills/escalate/SKILL.md']);
  });

  it('serves nothing to an account with no install of its own', async () => {
    const db = scopedDatabase({ 'user-a': [ownedByA] });
    await expect(listInstalledDirectorySkills(db, 'user-b')).resolves.toEqual([]);
  });

  it('passes the caller id as the only scoping parameter on every read', async () => {
    const db = scopedDatabase({ 'user-a': [ownedByA] });
    await listInstalledDirectorySkills(db, 'user-b');
    expect(db.query.mock.calls[0]![1]).toEqual(['user-b']);
    const sql = String(db.query.mock.calls[0]![0]);
    expect(sql).toContain('installation.user_id = $1');
    expect(sql).toContain('sources.user_id = $1');
  });

  it('never resolves another account skill by name through the chat lookup', async () => {
    const db = scopedDatabase({ 'user-a': [ownedByA], 'user-b': [ownedByB] });

    await expect(findInstalledDirectorySkill(db, 'user-b', 'triage-ticket')).resolves.toBeNull();
    await expect(findInstalledDirectorySkill(db, 'user-a', 'triage-ticket')).resolves.toMatchObject(
      { name: 'triage-ticket' },
    );
  });
});

describe('an uploaded or authored plugin is served from its stored files', () => {
  const ENTRY_ID = '44444444-4444-4444-8444-444444444444';
  const STORED_ROW = {
    entry_id: ENTRY_ID,
    plugin_key: 'my-plugin',
    installed_version: '1.0.0',
    enabled_skills: ['summarise'],
    declared_skills: ['summarise'],
    repository_url: null,
    ref: null,
    content_hash: null,
  };
  const STORED_BODY = '---\nname: summarise\ndescription: Summarise things\n---\n\nDo it.\n';

  function storedDatabase(
    entryRows: unknown[],
    fileRows: unknown[],
  ): DatabaseAdapter & { query: ReturnType<typeof vi.fn> } {
    const db = {
      query: vi.fn(async (sql: string) =>
        String(sql).includes('plugin_marketplace_entry_files') ? fileRows : entryRows,
      ),
      execute: vi.fn(),
    };
    return db as unknown as DatabaseAdapter & { query: ReturnType<typeof vi.fn> };
  }

  it('reads the skill body from the entry files table and never fetches', async () => {
    const db = storedDatabase(
      [STORED_ROW],
      [{ entry_id: ENTRY_ID, path: 'skills/summarise/SKILL.md', content: STORED_BODY }],
    );
    const skills = await listInstalledDirectorySkills(db, 'user-1');
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: 'summarise',
      description: 'Summarise things',
      body: 'Do it.',
      source: 'extra',
      filePath: 'plugins/my-plugin/skills/summarise/SKILL.md',
      frontmatter: { plugin: 'my-plugin' },
    });
    expect(mocks.readInstalledSkills).not.toHaveBeenCalled();
    expect(mocks.writeInstalledSkills).not.toHaveBeenCalled();
  });

  it('serves only the skills the installation has enabled', async () => {
    const db = storedDatabase(
      [STORED_ROW],
      [
        { entry_id: ENTRY_ID, path: 'skills/summarise/SKILL.md', content: STORED_BODY },
        {
          entry_id: ENTRY_ID,
          path: 'skills/disabled/SKILL.md',
          content: '---\nname: disabled\ndescription: Off\n---\n\nNo.\n',
        },
      ],
    );
    const skills = await listInstalledDirectorySkills(db, 'user-1');
    expect(skills.map((skill) => skill.name)).toEqual(['summarise']);
  });

  it('serves nothing when the entry has no stored file left', async () => {
    const db = storedDatabase([STORED_ROW], []);
    await expect(listInstalledDirectorySkills(db, 'user-1')).resolves.toEqual([]);
  });

  it('scopes the stored file read to the caller', async () => {
    const db = storedDatabase(
      [STORED_ROW],
      [{ entry_id: ENTRY_ID, path: 'skills/summarise/SKILL.md', content: STORED_BODY }],
    );
    await listInstalledDirectorySkills(db, 'user-9');
    const fileCall = db.query.mock.calls.find((call) =>
      String(call[0]).includes('plugin_marketplace_entry_files'),
    );
    expect(fileCall![1]).toEqual([[ENTRY_ID], 'user-9']);
  });

  it('resolves an uploaded skill by name through the chat lookup', async () => {
    const db = storedDatabase(
      [STORED_ROW],
      [{ entry_id: ENTRY_ID, path: 'skills/summarise/SKILL.md', content: STORED_BODY }],
    );
    await expect(findInstalledDirectorySkill(db, 'user-1', 'summarise')).resolves.toMatchObject({
      name: 'summarise',
    });
  });
});
