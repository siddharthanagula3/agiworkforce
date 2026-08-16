
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadSkillsFromDir } from '../loader';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'skills-loader-'));
});

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe('loadSkillsFromDir — directory layout', () => {
  it('loads <id>/SKILL.md and uses dirname as fallback name', async () => {
    await mkdir(join(root, 'diffs'), { recursive: true });
    await writeFile(
      join(root, 'diffs', 'SKILL.md'),
      ['---', 'description: Use diffs tool.', '---', '', 'body'].join('\n'),
      'utf-8',
    );
    const skills = await loadSkillsFromDir({ rootDir: root, source: 'project' });
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('diffs');
    expect(skills[0]?.description).toBe('Use diffs tool.');
    expect(skills[0]?.source).toBe('project');
  });

  it('uses frontmatter name when present (overrides dirname)', async () => {
    await mkdir(join(root, 'unrelated-dir'), { recursive: true });
    await writeFile(
      join(root, 'unrelated-dir', 'SKILL.md'),
      ['---', 'name: my-skill', 'description: Hello.', '---', 'body'].join('\n'),
      'utf-8',
    );
    const skills = await loadSkillsFromDir({ rootDir: root, source: 'workspace' });
    expect(skills[0]?.name).toBe('my-skill');
  });

  it('extracts metadata fields (always, primaryEnv, requires.bins, requires.tools)', async () => {
    await mkdir(join(root, 'gizmo'), { recursive: true });
    await writeFile(
      join(root, 'gizmo', 'SKILL.md'),
      [
        '---',
        'name: gizmo',
        'description: Run gizmo.',
        'always: true',
        'primaryEnv: GIZMO_API_KEY',
        'requires:',
        '  bins:',
        '    - gizmo-cli',
        '  tools:',
        '    - write_file',
        '---',
        'body',
      ].join('\n'),
      'utf-8',
    );
    const skills = await loadSkillsFromDir({ rootDir: root, source: 'bundled' });
    expect(skills[0]?.metadata.always).toBe(true);
    expect(skills[0]?.metadata.primaryEnv).toBe('GIZMO_API_KEY');
    expect(skills[0]?.metadata.requires?.bins).toEqual(['gizmo-cli']);
    expect(skills[0]?.metadata.requires?.tools).toEqual(['write_file']);
  });

  it('uses a path-free fallback description when frontmatter omits one', async () => {
    await writeFile(join(root, 'path-free.md'), 'Body only', 'utf-8');

    const skills = await loadSkillsFromDir({ rootDir: root, source: 'personal' });
    const loaded = skills.find((skill) => skill.name === 'path-free');

    expect(loaded?.description).toBe('Skill path-free');
    expect(loaded?.description).not.toContain(root);
  });
});

describe('loadSkillsFromDir — flat layout', () => {
  it('loads <name>.md and uses filename (without .md) as fallback name', async () => {
    await writeFile(
      join(root, 'planner.md'),
      ['---', 'description: Plan first.', '---', 'body'].join('\n'),
      'utf-8',
    );
    const skills = await loadSkillsFromDir({ rootDir: root, source: 'personal' });
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('planner');
  });

  it('skips hidden files (`.hidden.md`) and non-md files', async () => {
    await writeFile(join(root, '.hidden.md'), '---\nname: shouldNotShow\n---\n', 'utf-8');
    await writeFile(join(root, 'README.txt'), 'not a skill', 'utf-8');
    await writeFile(
      join(root, 'visible.md'),
      ['---', 'description: Visible.', '---'].join('\n'),
      'utf-8',
    );
    const skills = await loadSkillsFromDir({ rootDir: root, source: 'extra' });
    expect(skills.map((s) => s.name)).toEqual(['visible']);
  });

  it('returns an empty array for a non-existent directory', async () => {
    const skills = await loadSkillsFromDir({
      rootDir: join(root, 'does-not-exist'),
      source: 'project',
    });
    expect(skills).toEqual([]);
  });
});

describe('loadSkillsFromDir — security: name field sanitization', () => {
  it('a skill whose frontmatter `name` has whitespace/punct is loaded verbatim (no shell escape required)', async () => {
    await writeFile(
      join(root, 'shell.md'),
      ['---', 'name: foo; rm -rf /', 'description: malicious.', '---', 'body'].join('\n'),
      'utf-8',
    );
    const skills = await loadSkillsFromDir({ rootDir: root, source: 'project' });
    expect(skills[0]?.name).toBe('foo; rm -rf /');
    expect(skills[0]?.description).toBe('malicious.');
  });

  it('a skill with __proto__ frontmatter does not pollute Object.prototype', async () => {
    await writeFile(
      join(root, 'evil.md'),
      ['---', '__proto__: {polluted: true}', 'name: evil', '---', 'body'].join('\n'),
      'utf-8',
    );
    await loadSkillsFromDir({ rootDir: root, source: 'project' });
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});
