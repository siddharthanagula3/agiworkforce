import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import type { StreamChunk } from '@agiworkforce/types';

import { translateAnthropicStream } from '../stream';

type Event = Anthropic.MessageStreamEvent;

async function* fromArray(events: Event[]): AsyncIterable<Event> {
  for (const e of events) yield e;
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const out: StreamChunk[] = [];
  for await (const c of stream) out.push(c);
  return out;
}

describe('translateAnthropicStream — native web_fetch tool result (P1-1)', () => {
  it('yields a server-tool-result chunk for a web_fetch_tool_result block, not vendor-raw', async () => {
    const block = {
      type: 'web_fetch_tool_result',
      tool_use_id: 'wf_1',
      content: {
        type: 'web_fetch_result',
        url: 'https://example.com/page',
        retrieved_at: '2026-09-02T00:00:00Z',
        content: { type: 'document' },
      },
    };
    const events: Event[] = [
      {
        type: 'content_block_start',
        index: 0,
        content_block: block,
      } as unknown as Event,
    ];

    const out = await collect(translateAnthropicStream(fromArray(events)));
    const results = out.filter((c) => c.type === 'server-tool-result');
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      type: 'server-tool-result',
      toolUseId: 'wf_1',
      payload: block,
    });
    expect(out.some((c) => c.type === 'vendor-raw')).toBe(false);
  });

  it('yields a server-tool-result chunk for a web_fetch_tool_result_error content payload', async () => {
    const block = {
      type: 'web_fetch_tool_result',
      tool_use_id: 'wf_2',
      content: {
        type: 'web_fetch_tool_result_error',
        error_code: 'url_not_accessible',
      },
    };
    const events: Event[] = [
      {
        type: 'content_block_start',
        index: 0,
        content_block: block,
      } as unknown as Event,
    ];

    const out = await collect(translateAnthropicStream(fromArray(events)));
    expect(out.filter((c) => c.type === 'server-tool-result')).toEqual([
      { type: 'server-tool-result', toolUseId: 'wf_2', payload: block },
    ]);
  });
});
