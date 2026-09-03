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
            title: '',
          },
        ],
      },
    });
    expect(chunks.at(-1)).toEqual({ type: 'stop', reason: 'end_turn' });
  });

  it('merges a title that only appears in the final snapshot, never as a streamed annotation', async () => {
    const events = [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
          type: 'web_search_call',
          id: 'ws_2',
          status: 'in_progress',
          action: {
            type: 'search',
            query: 'q',
            sources: [{ type: 'url', url: 'https://example.com/late-title' }],
          },
        },
      },
      {
        type: 'response.completed',
        response: {
          id: 'resp_2',
          status: 'completed',
          output: [
            {
              type: 'web_search_call',
              id: 'ws_2',
              status: 'completed',
              action: {
                type: 'search',
                query: 'q',
                sources: [{ type: 'url', url: 'https://example.com/late-title' }],
              },
            },
            {
              type: 'message',
              id: 'msg_2',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'See the source.',
                  annotations: [
                    {
                      type: 'url_citation',
                      url: 'https://example.com/late-title',
                      title: 'The Late Title',
                      start_index: 0,
                      end_index: 3,
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ] as ResponsesStreamEvent[];

    const chunks = await collect(translateOpenAIResponsesStream(fromArray(events)));

    expect(chunks).toContainEqual({
      type: 'server-tool-result',
      toolUseId: 'ws_2',
      payload: {
        type: 'web_search_tool_result',
        tool_use_id: 'ws_2',
        content: [
          {
            type: 'web_search_result',
            url: 'https://example.com/late-title',
            title: 'The Late Title',
          },
        ],
      },
    });

    // A citation that OpenAI never streamed as its own
    // `response.output_text.annotation.added` event - and only delivered
    // folded into the final snapshot's message content - still has to reach
    // the client as its own citation-delta. Without this, the client falls
    // back to positional guessing against the aggregate search-results pool
    // and can attach the wrong url to a claim.
    expect(chunks).toContainEqual({
      type: 'citation-delta',
      blockIndex: 1,
      payload: {
        type: 'url_citation',
        url: 'https://example.com/late-title',
        title: 'The Late Title',
        start_index: 0,
        end_index: 3,
      },
    });
  });

  it('never emits a duplicate citation-delta when the same annotation streams incrementally and then reappears in the final snapshot', async () => {
    const events = [
      {
        type: 'response.output_text.annotation.added',
        item_id: 'msg_3',
        output_index: 1,
        content_index: 0,
        annotation_index: 0,
        annotation: {
          type: 'url_citation',
          url: 'https://example.com/streamed',
          title: 'Streamed Title',
          start_index: 0,
          end_index: 5,
        },
      },
      {
        type: 'response.completed',
        response: {
          id: 'resp_3',
          status: 'completed',
          output: [
            {
              type: 'message',
              id: 'msg_3',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'Cited.',
                  annotations: [
                    {
                      type: 'url_citation',
                      url: 'https://example.com/streamed',
                      title: 'Streamed Title',
                      start_index: 0,
                      end_index: 5,
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ] as ResponsesStreamEvent[];

    const chunks = await collect(translateOpenAIResponsesStream(fromArray(events)));
    const citations = chunks.filter(
      (c): c is Extract<StreamChunk, { type: 'citation-delta' }> => c.type === 'citation-delta',
    );
    expect(citations).toHaveLength(1);
  });

  it('resolves each cited span to its own annotation url and title across two searches and a duplicate host', async () => {
    const events = [
      {
        type: 'response.output_item.done',
        output_index: 0,
        item: {
          type: 'web_search_call',
          id: 'ws_openai',
          status: 'completed',
          action: {
            type: 'search',
            query: 'openai announcements',
            sources: [
              { type: 'url', url: 'https://openai.com/index/expanding-daybreak/' },
              { type: 'url', url: 'https://openai.com/index/gpt-5-6/' },
            ],
          },
        },
      },
      {
        type: 'response.output_item.done',
        output_index: 1,
        item: {
          type: 'web_search_call',
          id: 'ws_google',
          status: 'completed',
          action: {
            type: 'search',
            query: 'google announcements',
            sources: [{ type: 'url', url: 'https://blog.google/products/pixel-watch-5/' }],
          },
        },
      },
      {
        type: 'response.output_text.annotation.added',
        item_id: 'msg_1',
        output_index: 2,
        content_index: 0,
        annotation_index: 0,
        annotation: {
          type: 'url_citation',
          url: 'https://openai.com/index/expanding-daybreak/',
          title: 'Expanding Daybreak',
          start_index: 0,
          end_index: 10,
        },
      },
      {
        type: 'response.output_text.annotation.added',
        item_id: 'msg_1',
        output_index: 2,
        content_index: 0,
        annotation_index: 1,
        annotation: {
          type: 'url_citation',
          url: 'https://blog.google/products/pixel-watch-5/',
          title: 'Pixel Watch 5: Proactive assistance and advanced health tracking',
          start_index: 20,
          end_index: 30,
        },
      },
      {
        type: 'response.completed',
        response: { id: 'resp_dup', status: 'completed' },
      },
    ] as ResponsesStreamEvent[];

    const chunks = await collect(translateOpenAIResponsesStream(fromArray(events)));
    const citations = chunks.filter(
      (c): c is Extract<StreamChunk, { type: 'citation-delta' }> => c.type === 'citation-delta',
    );

    expect(citations).toHaveLength(2);
    expect(citations[0]?.payload).toMatchObject({
      url: 'https://openai.com/index/expanding-daybreak/',
      title: 'Expanding Daybreak',
    });
    expect(citations[1]?.payload).toMatchObject({
      url: 'https://blog.google/products/pixel-watch-5/',
      title: 'Pixel Watch 5: Proactive assistance and advanced health tracking',
    });

    // The uncited openai.com sibling on the same host never picks up the
    // cited page's title or gets folded into it - each source keeps its own
    // exact url.
    const searchResult = chunks.find(
      (c): c is Extract<StreamChunk, { type: 'server-tool-result' }> =>
        c.type === 'server-tool-result' && c.toolUseId === 'ws_openai',
    );
    const content = (searchResult?.payload as { content?: Array<{ url: string; title: string }> })
      ?.content;
    expect(content).toEqual([
      {
        type: 'web_search_result',
        url: 'https://openai.com/index/expanding-daybreak/',
        title: 'Expanding Daybreak',
      },
      { type: 'web_search_result', url: 'https://openai.com/index/gpt-5-6/', title: '' },
    ]);
  });
});
