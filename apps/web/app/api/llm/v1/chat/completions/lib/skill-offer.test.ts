import { skillCatalogEntryLength, type Skill } from '@agiworkforce/skills';
import { describe, expect, it } from 'vitest';

import { ALWAYS_LISTED_SKILL_CHARACTER_BUDGET, selectOfferedSkills } from './skill-offer';

function skill(name: string, description: string, overrides: Partial<Skill> = {}): Skill {
  return {
    name,
    description,
    body: 'body',
    contentHash: `sha256:${'0'.repeat(64)}`,
    filePath: `/skills/${name}/SKILL.md`,
    source: 'bundled',
    metadata: {},
    frontmatter: {},
    ...overrides,
  };
}

const BUILT_IN = [
  skill('design-review', 'Review interface polish before a release.'),
  skill('sales-forecast', 'Model quarterly pipeline revenue.'),
];
const PERSONAL = skill('weekly-digest', 'Summarize my week.', { source: 'personal' });
const PLUGIN = skill('plugin-review', 'Review plugin output.', {
  source: 'extra',
  frontmatter: { plugin: 'demo-plugin' },
});

const names = (skills: readonly Skill[]) => skills.map((entry) => entry.name);

describe('selectOfferedSkills', () => {
  it('offers nothing when the person has no skills of their own and nothing matches', () => {
    expect(selectOfferedSkills(BUILT_IN, 'What time does the museum close?')).toEqual([]);
  });

  it('lists personal and plugin skills on every turn, personal first', () => {
    expect(
      names(selectOfferedSkills([...BUILT_IN, PLUGIN, PERSONAL], 'What time does it close?')),
    ).toEqual(['weekly-digest', 'plugin-review']);
  });

  it('adds relevance-matched built-in skills after the always-listed ones', () => {
    expect(
      names(
        selectOfferedSkills(
          [...BUILT_IN, PERSONAL],
          'Review the interface polish for this release.',
        ),
      ),
    ).toEqual(['weekly-digest', 'design-review']);
  });

  it('never lists the same skill twice when an always-listed skill also matches', () => {
    expect(
      names(selectOfferedSkills([PLUGIN], 'Review the plugin output for plugin-review.')),
    ).toEqual(['plugin-review']);
  });

  it('keeps the always-listed set inside its budget and lets the rest compete on relevance', () => {
    const description = 'x'.repeat(1_000);
    const many = Array.from({ length: 12 }, (_, index) =>
      skill(`own-${index}`, `${description} ${index}`, { source: 'personal' }),
    );
    const offered = selectOfferedSkills(many, 'unrelated question');
    const spent = offered.reduce((sum, entry) => sum + skillCatalogEntryLength(entry), 0);
    expect(spent).toBeLessThanOrEqual(ALWAYS_LISTED_SKILL_CHARACTER_BUDGET);
    expect(offered.length).toBeLessThan(many.length);
    expect(names(offered)[0]).toBe('own-0');
  });
});
