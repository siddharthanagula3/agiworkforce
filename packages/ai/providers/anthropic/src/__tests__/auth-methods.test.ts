import { describe, expect, it } from 'vitest';

import { createAnthropicAdapter } from '../index';

describe('Anthropic adapter auth methods', () => {
  it('offers only an API key, never a console OAuth sign-in', () => {
    const adapter = createAnthropicAdapter({ apiKey: 'test-key' });

    expect(adapter.auth).toEqual([
      {
        kind: 'api-key',
        envVar: 'ANTHROPIC_API_KEY',
        required: true,
        label: 'Anthropic API Key',
      },
    ]);
  });
});
