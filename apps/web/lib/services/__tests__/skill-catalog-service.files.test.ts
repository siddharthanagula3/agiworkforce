import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { Skill } from '@agiworkforce/skills';

import {
  filterSkillsByInstallOverrides,
  isPluginOwnedSkill,
  listManagedSkillFiles,
  readManagedSkillFile,
} from '../skill-catalog-service';

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'design-review',
    description: 'Review UI for release polish.',
    body: 'BODY',
    contentHash: `sha256:${'0'.repeat(64)}`,
    filePath: '/srv/skills/design-review/SKILL.md',
    source: 'bundled',
    metadata: {},
    frontmatter: {},
    ...overrides,
  };
}

describe('isPluginOwnedSkill', () => {
  it('is false for a skill with no plugin frontmatter', () => {
    expect(isPluginOwnedSkill(skill())).toBe(false);
  });

  it('is true for a skill declaring a plugin owner', () => {
    expect(isPluginOwnedSkill(skill({ frontmatter: { plugin: 'research-pack' } }))).toBe(true);
  });
});

describe('filterSkillsByInstallOverrides', () => {
  it('keeps a non-plugin skill by default when there is no override', () => {
    const result = filterSkillsByInstallOverrides([skill()], new Map());
    expect(result).toHaveLength(1);
  });

  it('drops a non-plugin skill the user explicitly uninstalled', () => {
    const overrides = new Map([['design-review', false]]);
    const result = filterSkillsByInstallOverrides([skill()], overrides);
    expect(result).toHaveLength(0);
  });

  it('keeps a plugin-owned skill regardless of the override map', () => {
    const pluginSkill = skill({
      name: 'literature-review',
      frontmatter: { plugin: 'research-pack' },
    });
    const overrides = new Map([['literature-review', false]]);
    const result = filterSkillsByInstallOverrides([pluginSkill], overrides);
    expect(result).toHaveLength(1);
  });

  it('keeps a skill explicitly re-installed after an earlier uninstall', () => {
    const overrides = new Map([['design-review', true]]);
    const result = filterSkillsByInstallOverrides([skill()], overrides);
    expect(result).toHaveLength(1);
  });
});

describe('managed skill file access', () => {
  let root: string | null = null;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'agi-skill-files-'));
    const packageDir = join(root, 'design-review');
    await mkdir(join(packageDir, 'references'), { recursive: true });
    await writeFile(join(packageDir, 'SKILL.md'), '---\nname: design-review\n---\nBody', 'utf-8');
    await writeFile(join(packageDir, 'references', 'checklist.md'), 'Checklist content', 'utf-8');
    await writeFile(join(packageDir, 'huge.txt'), 'x'.repeat(600 * 1024), 'utf-8');
    await writeFile(join(packageDir, 'logo.bin'), Buffer.from([0x89, 0x50, 0x00, 0x4e]), 'utf-8');
    await mkdir(join(root, 'other-skill'), { recursive: true });
    await writeFile(join(root, 'other-skill', 'secret.md'), 'Not part of design-review', 'utf-8');
  });

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = null;
  });

  function packageSkill(): Skill {
    return skill({ filePath: join(root!, 'design-review', 'SKILL.md') });
  }

  it('lists every file under the skill package as a sorted tree', async () => {
    const files = await listManagedSkillFiles(packageSkill());
    expect(files).not.toBeNull();
    const paths = files!.map((entry) => entry.path);
    expect(paths).toContain('SKILL.md');
    expect(paths).toContain('references/checklist.md');
    expect([...paths]).toEqual([...paths].sort());
  });

  it('reads a text file within the package', async () => {
    const result = await readManagedSkillFile(packageSkill(), 'references/checklist.md');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file.content).toBe('Checklist content');
      expect(result.file.path).toBe('references/checklist.md');
    }
  });

  it('rejects a file above the size cap', async () => {
    const result = await readManagedSkillFile(packageSkill(), 'huge.txt');
    expect(result).toEqual({ ok: false, reason: 'too_large', size: 600 * 1024 });
  });

  it('rejects binary content', async () => {
    const result = await readManagedSkillFile(packageSkill(), 'logo.bin');
    expect(result).toEqual({ ok: false, reason: 'binary' });
  });

  it('blocks a traversal attempt that escapes the skill package', async () => {
    const result = await readManagedSkillFile(packageSkill(), '../other-skill/secret.md');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('blocks a traversal attempt reaching outside the skills root entirely', async () => {
    const result = await readManagedSkillFile(packageSkill(), '../../../../../../etc/passwd');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('returns not_found for a missing file', async () => {
    const result = await readManagedSkillFile(packageSkill(), 'missing.md');
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});
