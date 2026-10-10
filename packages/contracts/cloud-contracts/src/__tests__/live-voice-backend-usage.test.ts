import { describe, expect, it } from 'vitest';

import { LiveVoiceBackendUsageMeter, liveVoiceSourcesOf } from '../live-voice-tools';

function completed(
  id: string,
  usage: Record<string, unknown> | undefined,
  type = 'response.completed',
) {
  return { type, response: { id, output: [], ...(usage ? { usage } : {}) } };
}

describe('LiveVoiceBackendUsageMeter', () => {
  it('reports nothing for a session whose backend never ran', () => {
    expect(new LiveVoiceBackendUsageMeter().report()).toBeNull();
  });

  it('counts each backend response once by id, including failed and incomplete ones', () => {
    const meter = new LiveVoiceBackendUsageMeter();
    meter.observe(completed('resp_1', { input_tokens: 1_000, output_tokens: 100 }));
    meter.observe(completed('resp_1', { input_tokens: 1_000, output_tokens: 100 }));
    meter.observe(completed('resp_2', { input_tokens: 50, output_tokens: 5 }, 'response.failed'));
    meter.observe(
      completed('resp_3', { input_tokens: 20, output_tokens: 2 }, 'response.incomplete'),
    );
    meter.observe(
      completed('resp_4', { input_tokens: 999, output_tokens: 999 }, 'response.created'),
    );

    expect(meter.report()).toEqual({
      inputTokens: 1_070,
      outputTokens: 107,
      cachedTokens: 0,
      webSearchCalls: 0,
    });
  });

  it('never counts more cached tokens than input, nor negative or fractional counts', () => {
    const meter = new LiveVoiceBackendUsageMeter();
    meter.observe(
      completed('resp_1', {
        input_tokens: 10.9,
        output_tokens: -4,
        input_tokens_details: { cached_tokens: 500 },
      }),
    );

    expect(meter.report()).toEqual({
      inputTokens: 10,
      outputTokens: 0,
      cachedTokens: 10,
      webSearchCalls: 0,
    });
  });

  it('counts each web search call once from its output item', () => {
    const meter = new LiveVoiceBackendUsageMeter();
    const search = {
      type: 'response.output_item.done',
      item: { id: 'ws_1', type: 'web_search_call' },
    };
    meter.observe(search);
    meter.observe(search);
    meter.observe({
      type: 'response.output_item.done',
      item: { id: 'fc_1', type: 'function_call' },
    });

    expect(meter.report()).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      webSearchCalls: 1,
    });
  });
});

describe('liveVoiceSourcesOf', () => {
  it('reads cited web pages from a finished backend message', () => {
    expect(
      liveVoiceSourcesOf({
        type: 'response.output_item.done',
        item: {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'It opens at nine.',
              annotations: [
                { type: 'url_citation', url: 'https://example.com/hours', title: 'Opening hours' },
                { type: 'file_citation', file_id: 'file_1' },
                { type: 'url_citation', url: 'javascript:alert(1)', title: 'Not a page' },
              ],
            },
          ],
        },
      }),
    ).toEqual([{ url: 'https://example.com/hours', title: 'Opening hours' }]);
  });

  it('reads the sources a web search call lists, and nothing from other events', () => {
    expect(
      liveVoiceSourcesOf({
        type: 'response.output_item.done',
        item: {
          type: 'web_search_call',
          id: 'ws_1',
          action: { type: 'search', sources: [{ type: 'url', url: 'https://news.example.org/a' }] },
        },
      }),
    ).toEqual([{ url: 'https://news.example.org/a', title: 'https://news.example.org/a' }]);
    expect(liveVoiceSourcesOf({ type: 'response.completed' })).toEqual([]);
  });
});
