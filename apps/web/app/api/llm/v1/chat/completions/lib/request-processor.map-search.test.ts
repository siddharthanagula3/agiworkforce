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
    expect(parsed.tool_choice).toEqual({
      type: 'function',
      function: { name: 'search_maps' },
    });
  });

  it('offers the same card contract to a capable Mobile caller', () => {
    const parsed = request();

    applyMapSearchCardCapability(parsed, {
      surface: 'mobile',
      toolsCapable: true,
      userMessage: 'Plan a driving route from Austin to Marfa.',
    });

    expect(parsed.tools).toHaveLength(1);
    expect(parsed.tools?.[0]?.function.name).toBe('search_maps');
    expect(parsed.tool_choice).toEqual({
      type: 'function',
      function: { name: 'search_maps' },
    });
  });

  it('offers the display-only map card to a capable Chrome caller', () => {
    const parsed = request({
      x_interactive_cards: { supported: ['map-search.v1'], canRespond: false },
    });

    applyMapSearchCardCapability(parsed, {
      surface: 'chrome',
      toolsCapable: true,
      userMessage: 'Show coffee shops near me on a map.',
    });

    expect(parsed.tools).toHaveLength(1);
    expect(parsed.tools?.[0]?.function.name).toBe('search_maps');
    expect(parsed.tool_choice).toEqual({
      type: 'function',
      function: { name: 'search_maps' },
    });
  });

  it('preserves an explicit caller tool choice', () => {
    const parsed = request({ tool_choice: 'none' });

    applyMapSearchCardCapability(parsed, {
      surface: 'mobile',
      toolsCapable: true,
      userMessage: 'Show coffee shops on a map.',
    });

    expect(parsed.tools?.[0]?.function.name).toBe('search_maps');
    expect(parsed.tool_choice).toBe('none');
  });

  it.each([
    [
      'unsupported surface',
      {
        surface: 'desktop' as const,
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
