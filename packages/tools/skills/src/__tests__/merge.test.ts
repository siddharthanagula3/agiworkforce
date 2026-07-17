/**
 * Skill merge precedence tests.
 *
 * Order (highest wins): extra > workspace > project > personal > managed-local > bundled.
 * Same key from a higher source replaces the lower; same source keeps the
 * later occurrence (last-wins via the Map.set overwrite path).
 */

import { describe, expect, it } from 'vitest';

import { mergeSkills } from '../merge';
import type { Skill, SkillSource } from '../types';

function makeSkill(name: string, source: SkillSource, suffix = ''): Skill {
  return {
    name,
    description: `${name}${suffix} description`,
    body: `${name}${suffix} body`,
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
    expect(out.map((s) => s.name)).toEqual(['a', 'b', 'c']); // sorted alphabetically
  });

  it('result is sorted alphabetically by name (stable for prompt output)', () => {
    const out = mergeSkills([
      [makeSkill('zebra', 'project'), makeSkill('apple', 'project')],
      [makeSkill('mango', 'workspace')],
    ]);
    expect(out.map((s) => s.name)).toEqual(['apple', 'mango', 'zebra']);
  });

  it('same-precedence collision: latest (last-set) wins', () => {
    // Both at `project` source — Map.set overwrites the earlier entry.
    const earlier = makeSkill('twin', 'project', '-earlier');
    const later = makeSkill('twin', 'project', '-later');
    const out = mergeSkills([[earlier], [later]]);
    expect(out).toHaveLength(1);
    expect(out[0]?.body).toBe('twin-later body');
  });

  it('skillKey override changes which entries collide', () => {
    // Two skills with different `name`s but the same `metadata.skillKey`:
    // they should be deduped under that shared key.
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
    expect(out[0]?.source).toBe('workspace'); // higher precedence wins
  });

  it('an empty input returns an empty output', () => {
    expect(mergeSkills([])).toEqual([]);
    expect(mergeSkills([[], [], []])).toEqual([]);
  });
});
