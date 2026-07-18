import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import {
  executeManagedSkillTool,
  findManagedSkillByName,
  getManagedSkillCatalog,
  parseSkillLayersConfig,
  resetManagedSkillCatalogCacheForTests,
} from './skill-catalog-service';

describe('managed Skill catalog service', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'managed-skill-service-'));
    const skillDir = join(root, 'design-review');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'name: design-review',
        'description: Review UI for release polish.',
        '---',
        '',
        'Inspect the rendered interface and cite concrete defects.',
      ].join('\n'),
      'utf-8',
    );
    process.env['SKILLS_LAYERS'] = JSON.stringify([{ rootDir: root, source: 'personal' }]);
    resetManagedSkillCatalogCacheForTests();
  });

  afterEach(async () => {
    delete process.env['SKILLS_LAYERS'];
    resetManagedSkillCatalogCacheForTests();
    await rm(root, { recursive: true, force: true });
  });

  it('parses only declared skill sources with non-empty roots', () => {
    expect(
      parseSkillLayersConfig(
        JSON.stringify([
          { rootDir: '/one', source: 'bundled' },
          { rootDir: '/two', source: 'foreign' },
          { rootDir: '', source: 'personal' },
          { rootDir: '/three', source: 'workspace' },
        ]),
      ),
    ).toEqual([
      { rootDir: '/one', source: 'bundled' },
      { rootDir: '/three', source: 'workspace' },
    ]);
    expect(parseSkillLayersConfig('{invalid')).toEqual([]);
  });

  it('loads, merges, and caches the deployment catalog behind one service owner', async () => {
    const first = await getManagedSkillCatalog();
    const second = await getManagedSkillCatalog();

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      name: 'design-review',
      description: 'Review UI for release polish.',
      source: 'personal',
    });
    expect(second).toBe(first);
  });

  it('performs exact-name lookup without accepting a host location', async () => {
    await expect(findManagedSkillByName('design-review')).resolves.toMatchObject({
      name: 'design-review',
    });
    await expect(findManagedSkillByName('Design-Review')).resolves.toBeNull();
    await expect(findManagedSkillByName('../../design-review')).resolves.toBeNull();
  });

  it('executes the shared Skill tool without exposing the host location', async () => {
    const result = await executeManagedSkillTool(
      { action: 'load', name: 'design-review' },
      { availableTools: new Set(['skill']) },
    );

    expect(result).toMatchObject({ isError: false, code: 'skill_loaded' });
    expect(result.content).toContain('Inspect the rendered interface');
    expect(result.content).not.toContain(root);
    expect(result.content).not.toContain('SKILL.md');
  });
});
