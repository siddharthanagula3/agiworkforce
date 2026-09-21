import { describe, expect, it } from 'vitest';

import { webSearchFailureSentence } from '../useChatStream';

describe('what a reader is told when web search fails', () => {
  it('names each known failure in plain words', () => {
    expect(webSearchFailureSentence('too_many_requests')).toBe(
      'Web search is receiving too many requests right now.',
    );
    expect(webSearchFailureSentence('max_uses_exceeded')).toMatch(/most searches allowed/);
  });

  it('never shows a code the table does not know', () => {
    expect(webSearchFailureSentence('unavailable')).toBe('Web search is unavailable right now.');
    for (const code of ['unknown_error', 'some_future_code']) {
      const sentence = webSearchFailureSentence(code);
      expect(sentence).toBe('Web search is unavailable right now.');
      expect(sentence).not.toContain(code);
    }
  });
});
