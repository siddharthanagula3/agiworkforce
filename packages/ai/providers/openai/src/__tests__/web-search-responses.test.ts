import { describe, expect, it } from 'vitest';
import type { StreamChunk } from '@agiworkforce/types';

import { translateOpenAIResponsesStream } from '../stream-responses';
import type { ResponsesStreamEvent } from '../responses-types';

async function* fromArray<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const chunk of stream) out.push(chunk);
  return out;
}

describe('translateOpenAIResponsesStream native web search', () => {
  it('emits searchable activity plus one cumulative, titled source result', async () => {
    const events = [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'web_search_call',
          id: 'ws_1',
          status: 'in_progress',
          action: {
            type: 'search',
            query: 'official OpenAI Responses web search docs',
            sources: [
              {
                type: 'url',
                url: 'https://developers.openai.com/api/docs/guides/tools-web-search',
              },
            ],
          },
        },
      },
      {
        type: 'response.web_search_call.searching',
        item_id: 'ws_1',
        output_index: 0,
      },
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          type: 'web_search_call',
          id: 'ws_1',
          status: 'completed',
          action: {
            type: 'search',
            query: 'official OpenAI Responses web search docs',
            sources: [
              {
                type: 'url',
                url: 'https://developers.openai.com/api/docs/guides/tools-web-search',
              },
              { type: 'url', url: 'https://developers.openai.com/api/docs/guides/tools' },
            ],
          },
        },
      },
      {
        type: 'response.output_text.annotation.added',
        item_id: 'msg_1',
        output_index: 1,
        content_index: 0,
        annotation_index: 0,
        annotation: {
          type: 'url_citation',
          url: 'https://developers.openai.com/api/docs/guides/tools-web-search',
          title: 'Web search | OpenAI API',
          start_index: 10,
          end_index: 24,
        },
      },
      {
        type: 'response.completed',
        response: { id: 'resp_1', status: 'completed' },
      },
    ] as ResponsesStreamEvent[];

    const chunks = await collect(translateOpenAIResponsesStream(fromArray(events)));

    expect(chunks).toContainEqual({
      type: 'server-tool-use',
      toolUseId: 'ws_1',
      name: 'web_search',
    });
    expect(chunks).toContainEqual({
      type: 'citation-delta',
      blockIndex: 1,
      payload: {
        type: 'url_citation',
        url: 'https://developers.openai.com/api/docs/guides/tools-web-search',
        title: 'Web search | OpenAI API',
        start_index: 10,
        end_index: 24,
      },
    });
    expect(chunks).toContainEqual({
      type: 'server-tool-result',
      toolUseId: 'ws_1',
      payload: {
        type: 'web_search_tool_result',
        tool_use_id: 'ws_1',
        content: [
          {
            type: 'web_search_result',
            url: 'https://developers.openai.com/api/docs/guides/tools-web-search',
            title: 'Web search | OpenAI API',
          },
          {
            type: 'web_search_result',
            url: 'https://developers.openai.com/api/docs/guides/tools',
            title: 'https://developers.openai.com/api/docs/guides/tools',
          },
        ],
      },
    });
    expect(chunks.at(-1)).toEqual({ type: 'stop', reason: 'end_turn' });
  });
});
