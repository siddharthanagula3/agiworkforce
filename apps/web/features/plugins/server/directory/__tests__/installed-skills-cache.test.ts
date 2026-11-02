import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSkillTool } from '@agiworkforce/skills';
import { parseSkillFile } from '../skill-files';
import { toSkill } from '../installed-skills';

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
  it.each([
    { label: 'missing', frontmatter: undefined },
    { label: 'null', frontmatter: null },
    { label: 'array', frontmatter: [] },
    { label: 'string', frontmatter: 'invalid' },
  ])('refuses a $label cached declaration payload', async ({ frontmatter }) => {
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
  });

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

  it('enforces imported requirements after loading from the cache', async () => {
    const parsed = parseSkillFile(
      'skills/guarded/SKILL.md',
      '---\nname: guarded\nrequires:\n  tools: [fixture-tool]\n  mcp: [fixture-connector]\n---\nInstructions.',
    );
    if (!parsed) throw new Error('The valid cache fixture must parse');
    await writeInstalledSkills('fixture', [parsed]);
    const [cached] = (await readInstalledSkills('fixture')) ?? [];
    if (!cached) throw new Error('The stored fixture must remain readable');
    const skill = toSkill('actual-owner', cached);
    expect(executeSkillTool([skill], { action: 'load', name: skill.name }).code).toBe(
      'skill_dependencies_unavailable',
    );
    expect(
      executeSkillTool(
        [skill],
        { action: 'load', name: skill.name },
        { availableTools: new Set(['fixture-tool', 'mcp__fixture-connector__fetch']) },
      ).code,
    ).toBe('skill_loaded');
  });
});
