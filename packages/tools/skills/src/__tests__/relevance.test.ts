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

describe('trigger rate on realistic prompts', () => {
  const bundled = [
    skill(
      'code-review',
      'Review code for concrete correctness, security, and regression risks with actionable evidence.',
    ),
    skill(
      'data-analysis',
      'Analyze structured data reproducibly and report validated findings with limitations.',
    ),
    skill(
      'document-creation',
      'Create polished Word documents from verified content and an audience-aware structure.',
    ),
    skill(
      'frontend-design-review',
      'Review rendered interfaces for usability, accessibility, responsive behavior, and product polish.',
    ),
    skill(
      'systematic-debugging',
      'Reproduce failures, isolate their cause, and verify the smallest safe correction.',
    ),
    skill(
      'skill-creator',
      'Draft a small AGI skill bundle with explicit triggers, trust boundaries, and verification steps.',
    ),
  ];

  const shouldTrigger: Array<[string, string]> = [
    ['code-review', 'Can you review this code for security and correctness risks before I merge?'],
    [
      'data-analysis',
      'Analyze this structured data and report the findings with their limitations.',
    ],
    [
      'document-creation',
      'Create a polished Word document from this verified content for a board audience.',
    ],
    [
      'frontend-design-review',
      'Review this rendered interface for accessibility and responsive behavior.',
    ],
    [
      'systematic-debugging',
      'Help me reproduce this failure, isolate the cause, and verify a safe correction.',
    ],
  ];

  it.each(shouldTrigger)('offers %s for a prompt about its job', (expected, prompt) => {
    const names = matchSkillsForPrompt(bundled, prompt).map((m) => m.skill.name);
    expect(names).toContain(expected);
  });

  it('still offers the intended skill first when a prompt is long and specific', () => {
    const [top] = matchSkillsForPrompt(
      bundled,
      'I have a csv of Q3 signups broken down by acquisition channel and I need you to analyze ' +
        'this structured data and report which channel converted best, with the limitations of ' +
        'the findings called out explicitly.',
    );
    expect(top?.skill.name).toBe('data-analysis');
  });

  it('does not offer a skill for a prompt outside every skill in the catalogue', () => {
    expect(matchSkillsForPrompt(bundled, 'what time is it in tokyo right now')).toEqual([]);
    expect(matchSkillsForPrompt(bundled, 'book me a table for two on friday')).toEqual([]);
  });

  it('does not let a single shared word carry a match', () => {
    // "review" alone overlaps two review skills; one word is not topicality.
    const names = matchSkillsForPrompt(bundled, 'review').map((m) => m.skill.name);
    expect(names).toEqual([]);
  });
});
