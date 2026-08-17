import { describe, expect, it } from 'vitest';

import { matchSkillsForPrompt } from '../relevance';
import type { Skill } from '../types';

function skill(name: string, description: string): Skill {
  return {
    name,
    description,
    body: 'BODY',
    contentHash: `sha256:${'0'.repeat(64)}`,
    filePath: `/srv/skills/${name}/SKILL.md`,
    source: 'managed',
    metadata: {},
    frontmatter: {},
  };
}

const catalog = [
  skill('design-review', 'Review interface polish before a release.'),
  skill('sales-forecast', 'Model quarterly pipeline revenue.'),
  skill('changelog', 'Write release notes from merged commits.'),
];

describe('matchSkillsForPrompt', () => {
  it('ranks a topically overlapping skill above unrelated catalog entries', () => {
    const matches = matchSkillsForPrompt(catalog, 'Review the interface polish for this release.');

    expect(matches.map((match) => match.skill.name)).toEqual(['design-review']);
    expect(matches[0]?.matchedKeywords).toEqual(
      expect.arrayContaining(['interface', 'polish', 'release', 'review']),
    );
  });

  it('matches a skill named verbatim in the prompt even without shared vocabulary', () => {
    const matches = matchSkillsForPrompt(catalog, 'Run sales-forecast on the attached numbers.');

    expect(matches.map((match) => match.skill.name)).toEqual(['sales-forecast']);
    expect(matches[0]?.score).toBeGreaterThan(0.3);
  });

  it('returns nothing for an unrelated prompt', () => {
    expect(matchSkillsForPrompt(catalog, 'What time does the museum close tomorrow?')).toEqual([]);
  });

  it('returns nothing for an empty or stopword-only prompt', () => {
    expect(matchSkillsForPrompt(catalog, '   ')).toEqual([]);
    expect(matchSkillsForPrompt(catalog, 'is it the')).toEqual([]);
  });

  it('honours the result limit and drops duplicate names', () => {
    const duplicated = [...catalog, skill('design-review', 'Review interface polish.')];
    const matches = matchSkillsForPrompt(
      duplicated,
      'Review release notes and interface polish from merged commits.',
      { limit: 1 },
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.skill.name).toBe('changelog');
  });
});
