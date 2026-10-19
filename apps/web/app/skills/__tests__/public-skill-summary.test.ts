import { describe, expect, it } from 'vitest';

import { publicSkillSummary } from '../public-skill-summary';

describe('publicSkillSummary', () => {
  it('turns model routing text into one line a buyer can read', () => {
    expect(
      publicSkillSummary(
        "When the user wants to optimize content for AI search engines, get cited by LLMs, or appear in AI-generated answers. Also use when the user mentions 'AI SEO,' 'AEO,' 'GEO.'",
      ),
    ).toBe(
      'Helps you optimize content for AI search engines, get cited by LLMs, or appear in AI-generated answers.',
    );
    expect(
      publicSkillSummary(
        'When the user wants help with pricing decisions, packaging, or monetization strategy. Also use when the user mentions pricing tiers.',
      ),
    ).toBe('Helps you with pricing decisions, packaging, or monetization strategy.');
    expect(
      publicSkillSummary(
        'When the user needs marketing ideas, inspiration, or strategies for their SaaS. Also use when they ask for ideas.',
      ),
    ).toBe('For when you want marketing ideas, inspiration, or strategies for their SaaS.');
  });

  it('keeps a description that already reads as an outcome and drops its trigger tail', () => {
    expect(
      publicSkillSummary(
        'Build and leverage online communities to drive product growth and brand loyalty. Use when the user wants to grow a community.',
      ),
    ).toBe('Build and leverage online communities to drive product growth and brand loyalty.');
  });

  it('never starts with system-style routing text', () => {
    for (const description of [
      'When the user needs marketing ideas, inspiration, or strategies for their SaaS. Also use when they ask for ideas.',
      'When the user wants to plan a product launch, feature announcement, or release strategy.',
    ]) {
      expect(publicSkillSummary(description)).not.toMatch(/^when the user/i);
    }
  });
});
