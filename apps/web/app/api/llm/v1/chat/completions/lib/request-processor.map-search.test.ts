import { describe, expect, it } from 'vitest';

import { applyMapSearchCardCapability, ChatCompletionRequestSchema } from './request-processor';

function request(overrides: Record<string, unknown> = {}) {
  return ChatCompletionRequestSchema.parse({
    model: 'fixture-model',
    messages: [{ role: 'user', content: 'Show coffee shops on a map.' }],
    stream: true,
    x_interactive_cards: { supported: ['map-search.v1'], canRespond: false },
    ...overrides,
  });
}

describe('map search card capability', () => {
  it('offers the server-owned tool once to a capable Web caller', () => {
    const parsed = request({
      tools: [
        {
          type: 'function',
          function: { name: 'search_maps', description: 'untrusted', parameters: {} },
        },
      ],
    });

    applyMapSearchCardCapability(parsed, {
      surface: 'web',
      toolsCapable: true,
      userMessage: 'Show coffee shops on a map.',
    });

    expect(parsed.tools).toHaveLength(1);
    expect(parsed.tools?.[0]?.function.name).toBe('search_maps');
    expect(parsed.tools?.[0]?.function.description).not.toBe('untrusted');
  });

  it.each([
    [
      'unsupported surface',
      {
        surface: 'mobile' as const,
        toolsCapable: true,
        userMessage: 'Show this on a map.',
      },
      {},
    ],
    [
      'tool-incapable model',
      { surface: 'web' as const, toolsCapable: false, userMessage: 'Show this on a map.' },
      {},
    ],
    [
      'missing capability',
      { surface: 'web' as const, toolsCapable: true, userMessage: 'Show this on a map.' },
      { x_interactive_cards: undefined },
    ],
    [
      'non-stream request',
      { surface: 'web' as const, toolsCapable: true, userMessage: 'Show this on a map.' },
      { stream: false },
    ],
    [
      'ordinary chat without map intent',
      { surface: 'web' as const, toolsCapable: true, userMessage: 'Explain compound interest.' },
      {},
    ],
  ])('does not offer the tool for %s', (_label, params, overrides) => {
    const parsed = request(overrides);
    applyMapSearchCardCapability(parsed, params);
    expect(parsed.tools).toBeUndefined();
  });
});
