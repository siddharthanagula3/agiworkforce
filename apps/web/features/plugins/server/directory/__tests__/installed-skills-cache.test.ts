import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSkillFile } from '../skill-files';

type CacheModule = typeof import('@/lib/connectors/mcp-runtime-cache');
const storage = vi.hoisted(() => new Map<string, string>());

vi.mock('server-only', () => ({}));
vi.mock('@/lib/connectors/mcp-runtime-cache', async (importOriginal) => ({
  ...(await importOriginal<CacheModule>()),
  NeonMcpResponseCacheStore: class {
    async get(key: { method: string; params: string; partition: string }) {
      const value = storage.get(JSON.stringify(key));
      return value === undefined ? undefined : { value };
    }
    async set(
      key: { method: string; params: string; partition: string },
      entry: { value: string },
    ) {
      storage.set(JSON.stringify(key), entry.value);
      return 1;
    }
  },
}));

import { readInstalledSkills, writeInstalledSkills } from '../snapshot-cache';
import { INSTALLED_SKILLS_CACHE_METHOD } from '../constants';

beforeEach(() => storage.clear());

describe('installed skill metadata cache', () => {
  it.each([undefined, null, [], 'invalid'])(
    'refuses a cached declaration payload of %j',
    async (frontmatter) => {
      storage.set(
        JSON.stringify({ method: INSTALLED_SKILLS_CACHE_METHOD, params: 'fixture', partition: '' }),
        JSON.stringify([
          {
            name: 'guarded',
            description: 'Guarded',
            body: 'Instructions.',
            path: 'SKILL.md',
            contentHash: 'fixture-hash',
            frontmatter,
          },
        ]),
      );
      expect(await readInstalledSkills('fixture')).toBeNull();
    },
  );

  it('does not replay old entries whose declarations were discarded', async () => {
    storage.set(
      JSON.stringify({
        method: 'plugins.directory.installed-skills',
        params: 'fixture',
        partition: '',
      }),
      JSON.stringify([
        { name: 'guarded', description: 'Guarded', body: 'Instructions.', path: 'SKILL.md' },
      ]),
    );
    expect(await readInstalledSkills('fixture')).toBeNull();
  });

  it('preserves declarations and source identity through cached JSON', async () => {
    const skill = parseSkillFile(
      'skills/guarded/SKILL.md',
      '---\nname: guarded\nversion: 1.2.3\nrequires:\n  tools: [fixture-tool]\n---\nInstructions.',
    );
    if (!skill) throw new Error('The valid cache fixture must parse');
    await writeInstalledSkills('fixture', [skill]);
    expect(await readInstalledSkills('fixture')).toEqual([skill]);
  });
});
