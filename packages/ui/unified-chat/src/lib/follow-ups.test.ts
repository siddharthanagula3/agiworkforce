import { describe, expect, it } from 'vitest';
import { deriveFollowUps, followUpAsksForWebSearch } from './follow-ups';

describe('follow-ups', () => {
  it('offers at most three suggestions, generic ones for a neutral answer', () => {
    const result = deriveFollowUps('xxxxxxxxxxxxxxxxxxxxxxxxx', 0);
    expect(result.map((followUp) => followUp.text)).toEqual([
      'Can you give an example?',
      'What are the next steps?',
      'How can I apply this?',
    ]);
    expect(result.map((followUp) => followUp.id)).toEqual([
      'followup-0',
      'followup-1',
      'followup-2',
    ]);
  });

  it('suggests nothing for a short answer', () => {
    expect(deriveFollowUps('Too short.', 3)).toEqual([]);
  });

  it('spots a suggestion that needs web search', () => {
    expect(followUpAsksForWebSearch('Search the web to verify')).toBe(true);
    expect(followUpAsksForWebSearch('Browse online reviews')).toBe(true);
    expect(followUpAsksForWebSearch('Can you give an example?')).toBe(false);
  });
});
