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
  getBundledSkillDownload,
  getBundledSkillDownloadForPlugins,
  getManagedSkillCatalog,
  getManagedSkillDirectory,
  getManagedSkillLayers,
  getManagedSkillPluginOwners,
  parseSkillLayersConfig,
  resetManagedSkillCatalogCacheForTests,
} from './skill-catalog-service';

describe('managed Skill catalog service', () => {
  let root: string;
  let bundledOverlay: string;

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
    bundledOverlay = await mkdtemp(join(tmpdir(), 'managed-skill-draft-'));
    const draftDir = join(bundledOverlay, 'unreleased-fixture');
    await mkdir(draftDir, { recursive: true });
    await writeFile(
      join(draftDir, 'SKILL.md'),
      [
        '---',
        'name: unreleased-fixture',
        'description: A draft catalog entry used to pin draft handling.',
        'draft: true',
        '---',
        '',
        'This entry is a draft and must never be offered for execution.',
      ].join('\n'),
      'utf-8',
    );
    process.env['SKILLS_LAYERS'] = JSON.stringify([
      { rootDir: root, source: 'personal' },
      { rootDir: bundledOverlay, source: 'bundled' },
    ]);
    resetManagedSkillCatalogCacheForTests();
  });

  afterEach(async () => {
    delete process.env['SKILLS_LAYERS'];
    resetManagedSkillCatalogCacheForTests();
    await rm(root, { recursive: true, force: true });
    await rm(bundledOverlay, { recursive: true, force: true });
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

    expect(first).toContainEqual(
      expect.objectContaining({
        name: 'design-review',
        description: 'Review UI for release polish.',
        source: 'personal',
      }),
    );
    expect(second).toBe(first);
  });

  it('always loads the canonical bundled root before optional overlays', () => {
    expect(getManagedSkillLayers()).toEqual([
      expect.objectContaining({
        rootDir: expect.stringContaining('.agents/skills'),
        source: 'bundled',
      }),
      { rootDir: root, source: 'personal' },
      { rootDir: bundledOverlay, source: 'bundled' },
    ]);
  });

  it('keeps draft entries visible in the directory but out of execution', async () => {
    await expect(getManagedSkillDirectory()).resolves.toContainEqual(
      expect.objectContaining({
        name: 'unreleased-fixture',
        frontmatter: expect.objectContaining({ draft: true }),
      }),
    );
    await expect(findManagedSkillByName('unreleased-fixture')).resolves.toBeNull();
  });

  it('offers the promoted skill-creator for execution and download', async () => {
    const skill = await findManagedSkillByName('skill-creator');
    expect(skill).toMatchObject({ name: 'skill-creator' });
    expect(skill?.frontmatter['draft']).not.toBe(true);
    const download = await getBundledSkillDownload('skill-creator');
    expect(download?.content.toString('utf-8')).toContain('name: skill-creator');

    const loaded = await executeManagedSkillTool(
      { action: 'load', name: 'skill-creator' },
      { availableTools: new Set(['skill']) },
    );
    expect(loaded).toMatchObject({ isError: false, code: 'skill_loaded' });
    expect(loaded.content).toContain('one narrow job');
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

  it('executes an included bundled skill and downloads only its canonical SKILL.md', async () => {
    const result = await executeManagedSkillTool(
      { action: 'load', name: 'code-review' },
      { availableTools: new Set(['skill']) },
    );
    expect(result).toMatchObject({ isError: false, code: 'skill_loaded' });
    expect(result.content).toContain('Prioritize correctness');

    const download = await getBundledSkillDownload('code-review');
    expect(download?.content.toString('utf-8')).toContain('name: code-review');
    await expect(getBundledSkillDownload('design-review')).resolves.toBeNull();
    await expect(getBundledSkillDownload('unreleased-fixture')).resolves.toBeNull();
  });

  it('maps only plugin-owned skills to their owner, keyed by skill name', async () => {
    const gatedDir = join(root, 'gated-skill');
    await mkdir(gatedDir, { recursive: true });
    await writeFile(
      join(gatedDir, 'SKILL.md'),
      [
        '---',
        'name: gated-skill',
        'description: Owned by a pack.',
        'plugin: test-pack',
        '---',
        '',
        'Body.',
      ].join('\n'),
      'utf-8',
    );
    resetManagedSkillCatalogCacheForTests();

    const owners = await getManagedSkillPluginOwners();
    expect(owners.get('gated-skill')).toBe('test-pack');
    expect(owners.has('design-review')).toBe(false);
    expect(owners.has('unreleased-fixture')).toBe(false);
  });

  it('downloads a plugin-owned bundle only when that plugin is enabled', async () => {
    await expect(
      getBundledSkillDownloadForPlugins(new Set(), 'literature-review'),
    ).resolves.toBeNull();

    const download = await getBundledSkillDownloadForPlugins(
      new Set(['research-pack']),
      'literature-review',
    );
    expect(download?.content.toString('utf-8')).toContain('name: literature-review');
  });

  it('does not auto-grant a bundled skill required tools', async () => {
    const refused = await executeManagedSkillTool(
      { action: 'load', name: 'document-creation' },
      { availableTools: new Set(['skill']) },
    );
    expect(refused).toMatchObject({ isError: true, code: 'skill_dependencies_unavailable' });

    const allowed = await executeManagedSkillTool(
      { action: 'load', name: 'document-creation' },
      { availableTools: new Set(['skill', 'create_office_file']) },
    );
    expect(allowed).toMatchObject({ isError: false, code: 'skill_loaded' });
  });
});
