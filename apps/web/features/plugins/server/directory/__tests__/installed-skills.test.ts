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
    expect(db.query.mock.calls[0]![1]).toEqual([
      'user-1',
      ['https://github.com/anthropics/claude-plugins-official'],
    ]);
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
