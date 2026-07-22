import { describe, expect, it } from 'vitest';

import { MINIMAX_DEFAULT_BASE_URL } from '../base-url';

describe('MINIMAX_DEFAULT_BASE_URL', () => {
  it('defaults to the MiniMax OpenAI-compatible endpoint', () => {
    expect(MINIMAX_DEFAULT_BASE_URL).toBe('https://api.minimax.io/v1');
  });
});
