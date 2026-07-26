import { describe, expect, it } from 'vitest';

import { shouldEnablePromptCache } from './prompt-cache-helper';

const largeSystemRequest = {
  messages: [{ role: 'system', content: 'x'.repeat(5_000) }],
};

describe('shouldEnablePromptCache model ownership', () => {
  it('uses canonical catalog capability metadata for a known caching model', () => {
    expect(shouldEnablePromptCache(largeSystemRequest, 'gpt-5.6-sol')).toBe(true);
  });

  it('does not infer caching from the name of an unregistered model', () => {
    expect(shouldEnablePromptCache(largeSystemRequest, 'claude-future-unknown')).toBe(false);
    expect(shouldEnablePromptCache(largeSystemRequest, 'gpt-future-unknown')).toBe(false);
  });

  it('uses the Opus 5 provider minimum of 512 tokens', () => {
    const exactly512Tokens = {
      messages: [{ role: 'system', content: 'x'.repeat(512 * 4) }],
    };

    expect(shouldEnablePromptCache(exactly512Tokens, 'claude-opus-5')).toBe(true);
  });
});
