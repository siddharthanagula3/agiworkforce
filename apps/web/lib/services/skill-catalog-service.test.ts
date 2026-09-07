import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { SKILL_AUDIENCES, SKILL_MANIFEST_FILE_NAME, type Skill } from '@agiworkforce/skills';

vi.mock('server-only', () => ({}));
const directorySkills = vi.hoisted(() => ({
  listInstalledDirectorySkills: vi.fn(async () => []),
}));
const userSkills = vi.hoisted(() => ({
  listUserSkillsAsManagedSkills: vi.fn(async () => []),
}));
vi.mock('@/features/plugins/server/directory/installed-skills', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/features/plugins/server/directory/installed-skills')
  >()),
  ...directorySkills,
}));
vi.mock('@/lib/services/user-skill-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/user-skill-service')>()),
  ...userSkills,
}));
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
  getManagedSkillDirectoryForPlugins,
  getManagedSkillLayers,
  getManagedSkillPluginOwners,
  invalidateManagedSkillCatalogCache,
  loadSelectableSkillCatalog,
  memoizeAsync,
  parseSkillLayersConfig,
  resetManagedSkillCatalogCacheForTests,
  selectedSkillRequirementFailure,
  skillRequiredTools,
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

  it('forces a fresh read on the next call instead of replaying a poisoned cache', async () => {
    const first = await getManagedSkillDirectory();
    expect(first.some((entry) => entry.name === 'design-review')).toBe(true);

    await writeFile(
      join(root, 'design-review', 'SKILL.md'),
      [
        '---',
        'name: design-review',
        'description: Revised after a retry-triggering failure.',
        '---',
        '',
        'Inspect the rendered interface and cite concrete defects.',
      ].join('\n'),
      'utf-8',
    );

    const stillCached = await getManagedSkillDirectory();
    expect(stillCached).toBe(first);

    invalidateManagedSkillCatalogCache();

    const afterInvalidation = await getManagedSkillDirectory();
    expect(afterInvalidation).not.toBe(first);
    expect(afterInvalidation).toContainEqual(
      expect.objectContaining({
        name: 'design-review',
        description: 'Revised after a retry-triggering failure.',
      }),
    );
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

  it('lists a skill package file with the instructions and serves it on request', async () => {
    await mkdir(join(root, 'design-review', 'references'), { recursive: true });
    await writeFile(
      join(root, 'design-review', 'references', 'checklist.md'),
      'Check contrast, focus order and target size.',
      'utf-8',
    );
    resetManagedSkillCatalogCacheForTests();

    const loaded = await executeManagedSkillTool(
      { action: 'load', name: 'design-review' },
      { availableTools: new Set(['skill']) },
    );
    expect(loaded.content).toContain('path="references/checklist.md"');
    expect(loaded.content).not.toContain(root);

    const read = await executeManagedSkillTool(
      { action: 'read', name: 'design-review', path: 'references/checklist.md' },
      { availableTools: new Set(['skill']) },
    );
    expect(read).toMatchObject({ isError: false, code: 'skill_file_read' });
    expect(read.content).toContain('Check contrast, focus order and target size.');
    expect(read.content).toContain('<skill_file untrusted="true"');
    expect(read.content).not.toContain(root);
  });

  it('reaches the reference files a shipped product skill tells the model to open', async () => {
    const loaded = await executeManagedSkillTool(
      { action: 'load', name: 'copywriting' },
      { availableTools: new Set(['skill']) },
    );
    expect(loaded).toMatchObject({ isError: false, code: 'skill_loaded' });
    expect(loaded.content).toContain('references/copy-frameworks.md');

    const read = await executeManagedSkillTool(
      { action: 'read', name: 'copywriting', path: 'references/copy-frameworks.md' },
      { availableTools: new Set(['skill']) },
    );
    expect(read).toMatchObject({ isError: false, code: 'skill_file_read' });
    expect(read.content.length).toBeGreaterThan(loaded.content.length / 2);
  });

  it('refuses a skill file read that escapes the skill package', async () => {
    const read = await executeManagedSkillTool(
      { action: 'read', name: 'design-review', path: '../unreleased-fixture/SKILL.md' },
      { availableTools: new Set(['skill']) },
    );

    expect(read).toMatchObject({ isError: true, code: 'skill_file_unavailable' });
    expect(read.content).not.toContain(root);
    expect(read.content).not.toMatch(/ENOENT|No such file/);
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

  it('offers a plugin-owned skill to the composer only once its plugin is installed and enabled', async () => {
    const beforeInstall = await getManagedSkillDirectoryForPlugins(new Set());
    expect(beforeInstall.some((skill) => skill.name === 'literature-review')).toBe(false);

    const afterInstall = await getManagedSkillDirectoryForPlugins(new Set(['research-pack']));
    expect(afterInstall.some((skill) => skill.name === 'literature-review')).toBe(true);

    const afterUninstall = await getManagedSkillDirectoryForPlugins(new Set());
    expect(afterUninstall.some((skill) => skill.name === 'literature-review')).toBe(false);
  });

  it('never gates an engineering-pack skill behind install, since it owns no skill', async () => {
    const withoutPlugin = await getManagedSkillDirectoryForPlugins(new Set());
    const withPlugin = await getManagedSkillDirectoryForPlugins(new Set(['engineering-pack']));

    for (const skills of [withoutPlugin, withPlugin]) {
      expect(skills.some((skill) => skill.name === 'code-review')).toBe(true);
    }
  });

  it('never offers a repository development skill to the product catalog', async () => {
    const directory = await getManagedSkillDirectory();
    const listed = new Set(directory.map((skill) => skill.name));

    for (const developerSkill of ['agiworkforce-design', 'model-orchestration', 'antislop']) {
      expect(listed.has(developerSkill)).toBe(false);
      await expect(findManagedSkillByName(developerSkill)).resolves.toBeNull();
      await expect(getBundledSkillDownload(developerSkill)).resolves.toBeNull();
      await expect(
        executeManagedSkillTool(
          { action: 'load', name: developerSkill },
          { availableTools: new Set(['skill']) },
        ),
      ).resolves.toMatchObject({ isError: true, code: 'skill_not_found' });
    }

    for (const productSkill of ['code-review', 'data-analysis']) {
      expect(listed.has(productSkill)).toBe(true);
      await expect(findManagedSkillByName(productSkill)).resolves.toMatchObject({
        name: productSkill,
      });
    }
  });

  it('requires every bundled skill to declare an audience before it can ship', async () => {
    const repositoryRoot = resolve(process.cwd(), '..', '..');
    const manifest = JSON.parse(
      await readFile(join(repositoryRoot, SKILL_MANIFEST_FILE_NAME), 'utf-8'),
    ) as { skills: Record<string, { audience?: string }> };
    const bundled = await readdir(join(repositoryRoot, '.agents', 'skills'), {
      withFileTypes: true,
    });

    const undeclared = bundled
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .filter((id) => !SKILL_AUDIENCES.includes(manifest.skills[id]?.audience as never));

    expect(undeclared).toEqual([]);
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

describe('selected skill requirements', () => {
  const officeSkill: Skill = {
    name: 'document-creation',
    description: 'Create documents.',
    body: 'Body',
    contentHash: 'sha256:'.padEnd(7 + 64, '0'),
    filePath: '/tmp/document-creation/SKILL.md',
    source: 'bundled',
    metadata: { requires: { tools: ['create_office_file'] } },
    frontmatter: {},
  };

  it('names the tool a selected skill needs when the turn does not offer it', () => {
    const failure = selectedSkillRequirementFailure(officeSkill, new Set(['skill']));

    expect(failure).toMatchObject({
      code: 'skill_requirements_unmet',
      missingTools: ['create_office_file'],
    });
    expect(failure?.message).toContain('document-creation');
    expect(failure?.message).toContain('create_office_file');
  });

  it('passes once the turn offers the tool', () => {
    expect(
      selectedSkillRequirementFailure(officeSkill, new Set(['skill', 'create_office_file'])),
    ).toBeNull();
  });

  it('passes for a skill that declares nothing and for no selection at all', () => {
    const plain = { ...officeSkill, name: 'code-review', metadata: {} };
    expect(selectedSkillRequirementFailure(plain, new Set())).toBeNull();
    expect(selectedSkillRequirementFailure(null, new Set())).toBeNull();
  });

  it('reports the declared tools a summary should advertise', () => {
    expect(skillRequiredTools(officeSkill)).toEqual(['create_office_file']);
    expect(skillRequiredTools({ ...officeSkill, metadata: {} })).toEqual([]);
  });
});

describe('memoizeAsync', () => {
  it('runs the loader once however many callers ask', async () => {
    const load = vi.fn(async () => new Set(['research-pack']));
    const memoized = memoizeAsync(load);

    const [first, second] = await Promise.all([memoized(), memoized()]);
    await memoized();

    expect(load).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });
});

describe('loadSelectableSkillCatalog directory cost', () => {
  const params = {
    db: { query: vi.fn(async () => []) } as unknown as Parameters<
      typeof loadSelectableSkillCatalog
    >[0]['db'],
    userId: 'user-1',
    loadEnabledPluginIds: async () => new Set<string>(),
    loadInstallOverrides: async () => new Map<string, boolean>(),
  };

  it('still serves the bundled catalogue when the plugin-id read throws', async () => {
    const skills = await loadSelectableSkillCatalog({
      ...params,
      loadEnabledPluginIds: async () => {
        throw new Error('db.query is not a function');
      },
    });

    expect(skills.map((skill) => skill.name)).toContain('code-review');
  });

  it('still serves the bundled catalogue when the install-override read throws', async () => {
    const skills = await loadSelectableSkillCatalog({
      ...params,
      loadInstallOverrides: async () => {
        throw new Error('settings unavailable');
      },
    });

    expect(skills.map((skill) => skill.name)).toContain('code-review');
  });

  it('still serves the bundled catalogue when the directory read throws', async () => {
    directorySkills.listInstalledDirectorySkills.mockRejectedValueOnce(
      new Error('marketplace unreachable'),
    );

    const skills = await loadSelectableSkillCatalog(params);

    expect(skills.map((skill) => skill.name)).toContain('code-review');
  });

  it('still serves the bundled catalogue when the authored-skill read throws', async () => {
    userSkills.listUserSkillsAsManagedSkills.mockRejectedValueOnce(new Error('rls denied'));

    const skills = await loadSelectableSkillCatalog(params);

    expect(skills.map((skill) => skill.name)).toContain('code-review');
  });

  it('keeps the first-party skill when a directory install claims its name', async () => {
    directorySkills.listInstalledDirectorySkills.mockResolvedValueOnce([
      {
        name: 'code-review',
        description: 'Impostor from a marketplace.',
        body: 'Impostor body',
        contentHash: 'sha256:'.padEnd(7 + 64, '1'),
        filePath: '/tmp/impostor/SKILL.md',
        source: 'extra',
        metadata: {},
        frontmatter: {},
      },
    ] as never);

    const skills = await loadSelectableSkillCatalog(params);
    const codeReview = skills.filter((skill) => skill.name === 'code-review');

    expect(codeReview).toHaveLength(1);
    expect(codeReview[0]?.source).toBe('bundled');
    expect(codeReview[0]?.description).not.toContain('Impostor');
  });

  it('keeps the first-party skill when an authored skill claims its name', async () => {
    userSkills.listUserSkillsAsManagedSkills.mockResolvedValueOnce([
      {
        name: 'code-review',
        description: 'Mine, not theirs.',
        body: 'Authored body',
        contentHash: 'sha256:'.padEnd(7 + 64, '2'),
        filePath: 'user-skills/1',
        source: 'personal',
        metadata: {},
        frontmatter: {},
      },
    ] as never);

    const skills = await loadSelectableSkillCatalog(params);
    const codeReview = skills.filter((skill) => skill.name === 'code-review');

    expect(codeReview).toHaveLength(1);
    expect(codeReview[0]?.source).toBe('bundled');
  });

  it('keeps the directory skill when an authored skill claims a directory name', async () => {
    directorySkills.listInstalledDirectorySkills.mockResolvedValueOnce([
      {
        name: 'pack-only',
        description: 'From the installed pack.',
        body: 'Pack body',
        contentHash: 'sha256:'.padEnd(7 + 64, '3'),
        filePath: '/tmp/pack/SKILL.md',
        source: 'extra',
        metadata: {},
        frontmatter: {},
      },
    ] as never);
    userSkills.listUserSkillsAsManagedSkills.mockResolvedValueOnce([
      {
        name: 'pack-only',
        description: 'Mine.',
        body: 'Authored body',
        contentHash: 'sha256:'.padEnd(7 + 64, '4'),
        filePath: 'user-skills/2',
        source: 'personal',
        metadata: {},
        frontmatter: {},
      },
    ] as never);

    const packOnly = (await loadSelectableSkillCatalog(params)).filter(
      (skill) => skill.name === 'pack-only',
    );

    expect(packOnly).toHaveLength(1);
    expect(packOnly[0]?.source).toBe('extra');
  });

  it('still admits a skill whose name nothing else claims', async () => {
    userSkills.listUserSkillsAsManagedSkills.mockResolvedValueOnce([
      {
        name: 'my-own-thing',
        description: 'Mine alone.',
        body: 'Authored body',
        contentHash: 'sha256:'.padEnd(7 + 64, '5'),
        filePath: 'user-skills/3',
        source: 'personal',
        metadata: {},
        frontmatter: {},
      },
    ] as never);

    const skills = await loadSelectableSkillCatalog(params);

    expect(skills.map((skill) => skill.name)).toContain('my-own-thing');
  });

  it('resolves directory skills by default, so an explicit selection can name one', async () => {
    const skills = await loadSelectableSkillCatalog(params);

    expect(directorySkills.listInstalledDirectorySkills).toHaveBeenCalledWith(params.db, 'user-1');
    expect(skills.length).toBeGreaterThan(0);
  });

  it('skips the network-backed directory when a caller opts out', async () => {
    await loadSelectableSkillCatalog({
      ...params,
      includeNetworkBackedDirectorySkills: false,
    });

    expect(directorySkills.listInstalledDirectorySkills).not.toHaveBeenCalled();
  });
});
