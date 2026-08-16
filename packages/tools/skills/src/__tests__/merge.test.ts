
import { describe, expect, it } from 'vitest';

import { mergeSkills } from '../merge';
import type { Skill, SkillSource } from '../types';

function makeSkill(name: string, source: SkillSource, suffix = ''): Skill {
  return {
    name,
    description: `${name}${suffix} description`,
    body: `${name}${suffix} body`,
    contentHash: `sha256:${'0'.repeat(64)}`,
    filePath: `/fake/${source}/${name}${suffix}.md`,
    source,
    metadata: {},
    frontmatter: {},
  };
}

describe('mergeSkills — precedence resolution', () => {
  it('extra wins over workspace, workspace wins over project, etc.', async () => {
    const out = mergeSkills([
      [makeSkill('alpha', 'bundled', '-bundled')],
      [makeSkill('alpha', 'managed-local', '-managed')],
      [makeSkill('alpha', 'personal', '-personal')],
      [makeSkill('alpha', 'project', '-project')],
      [makeSkill('alpha', 'workspace', '-workspace')],
      [makeSkill('alpha', 'extra', '-extra')],
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe('extra');
    expect(out[0]?.body).toBe('alpha-extra body');
  });

  it('lower-precedence skills are silently dropped on key collision', () => {
    const out = mergeSkills([
      [makeSkill('beta', 'project', '-low')],
      [makeSkill('beta', 'workspace', '-high')],
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe('workspace');
  });

  it('different keys in different layers all survive', () => {
    const out = mergeSkills([
      [makeSkill('a', 'bundled')],
      [makeSkill('b', 'project')],
      [makeSkill('c', 'extra')],
    ]);
    expect(out.map((s) => s.name)).toEqual(['a', 'b', 'c']);
  });

  it('result is sorted alphabetically by name (stable for prompt output)', () => {
    const out = mergeSkills([
      [makeSkill('zebra', 'project'), makeSkill('apple', 'project')],
      [makeSkill('mango', 'workspace')],
    ]);
    expect(out.map((s) => s.name)).toEqual(['apple', 'mango', 'zebra']);
  });

  it('same-precedence collision: latest (last-set) wins', () => {
    const earlier = makeSkill('twin', 'project', '-earlier');
    const later = makeSkill('twin', 'project', '-later');
    const out = mergeSkills([[earlier], [later]]);
    expect(out).toHaveLength(1);
    expect(out[0]?.body).toBe('twin-later body');
  });

  it('skillKey override changes which entries collide', () => {
    const a: Skill = {
      ...makeSkill('public-a', 'project'),
      metadata: { skillKey: 'shared-key' },
    };
    const b: Skill = {
      ...makeSkill('public-b', 'workspace'),
      metadata: { skillKey: 'shared-key' },
    };
    const out = mergeSkills([[a], [b]]);
    expect(out).toHaveLength(1);
    expect(out[0]?.source).toBe('workspace');
  });

  it('an empty input returns an empty output', () => {
    expect(mergeSkills([])).toEqual([]);
    expect(mergeSkills([[], [], []])).toEqual([]);
  });
});
