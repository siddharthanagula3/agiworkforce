import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  OpenAIWireAssembler,
  openAIWireRequestToChatRequest,
} from '@agiworkforce/provider-protocol';
import { buildAnthropicReplayPolicy } from '../replay-policy';
import { translateAnthropicStream } from '../stream';
import { translateChatRequest } from '../translate';
import { ANTHROPIC_PREMIUM_MODEL_ID } from './model-fixtures';

async function* events(seq: unknown[]): AsyncIterable<Anthropic.MessageStreamEvent> {
  for (const e of seq) yield e as Anthropic.MessageStreamEvent;
}

const OPAQUE = 'EmwKAhgBEgy3va3pzix/LafPsn4aDFIT2Xlxh0L5L8rLVyIwxtE3rAFBa8cr3qpP';

const turnWithRedactedThinking = [
  { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'plan' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig-1' } },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'content_block_start',
    index: 1,
    content_block: { type: 'redacted_thinking', data: OPAQUE },
  },
  { type: 'content_block_stop', index: 1 },
  {
    type: 'content_block_start',
    index: 2,
    content_block: { type: 'tool_use', id: 'toolu_1', name: 'web_fetch', input: {} },
  },
  {
    type: 'content_block_delta',
    index: 2,
    delta: { type: 'input_json_delta', partial_json: '{"url":"https://example.com"}' },
  },
  { type: 'content_block_stop', index: 2 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 20 } },
  { type: 'message_stop' },
];

describe('redacted thinking survives the tool-result continuation', () => {
  it('carries the opaque block from the stream into the next native request, in order', async () => {
    const assembler = new OpenAIWireAssembler({
      model: ANTHROPIC_PREMIUM_MODEL_ID,
      wireMode: 'legacy-web',
    });
    for await (const chunk of translateAnthropicStream(events(turnWithRedactedThinking))) {
      assembler.sseChunks(chunk);
    }

    const replay = assembler.canonicalThinkingBlocks();
    expect(replay).toEqual([
      { type: 'thinking', thinking: 'plan', signature: 'sig-1' },
      { type: 'redacted_thinking', data: OPAQUE },
    ]);

    const request = openAIWireRequestToChatRequest({
      model: ANTHROPIC_PREMIUM_MODEL_ID,
      messages: [
        { role: 'user', content: 'Fetch the page.' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'toolu_1',
              type: 'function',
              function: { name: 'web_fetch', arguments: '{"url":"https://example.com"}' },
            },
          ],
          __canonicalThinking: replay,
        },
        { role: 'tool', tool_call_id: 'toolu_1', content: 'page body' },
      ],
    });
    const sanitized = buildAnthropicReplayPolicy().sanitizeForReplay(request.messages);
    const native = translateChatRequest({ ...request, messages: sanitized });

    expect(native.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'plan', signature: 'sig-1' },
        { type: 'redacted_thinking', data: OPAQUE },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'web_fetch',
          input: { url: 'https://example.com' },
        },
      ],
    });
  });

  it('still forwards the raw redacted event to the legacy web wire unchanged', async () => {
    const assembler = new OpenAIWireAssembler({
      model: ANTHROPIC_PREMIUM_MODEL_ID,
      wireMode: 'legacy-web',
    });
    const wire: Record<string, unknown>[] = [];
    for await (const chunk of translateAnthropicStream(events(turnWithRedactedThinking))) {
      wire.push(...assembler.sseChunks(chunk));
    }
    expect(wire).toContainEqual(turnWithRedactedThinking[5]);
  });
});
