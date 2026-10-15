import { describe, expect, it } from 'vitest';

import { createOpenAIAdapter } from '../index';

describe('OpenAI adapter auth methods', () => {
  it('offers only an API key, never a ChatGPT subscription sign-in', () => {
    const adapter = createOpenAIAdapter({ apiKey: 'test-key', skipDiscovery: true });

    expect(adapter.auth).toEqual([
      {
        kind: 'api-key',
        envVar: 'OPENAI_API_KEY',
        required: true,
        label: 'OpenAI API Key',
      },
    ]);
  });
});
