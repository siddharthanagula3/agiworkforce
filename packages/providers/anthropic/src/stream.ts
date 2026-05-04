/**
 * Anthropic stream → StreamChunk translation.
 *
 * Consumes the SDK's MessageStreamEvent union and yields AGI Workforce's
 * canonical `StreamChunk` discriminated union.
 *
 * Anthropic event types we map:
 *   - `message_start` → ignored (usage emitted separately)
 *   - `content_block_start` (text|tool_use|thinking) → tool-use-start (tools only)
 *   - `content_block_delta` (text_delta|input_json_delta|thinking_delta|signature_delta) → text-delta | tool-use-delta | thinking-delta
 *   - `content_block_stop` → tool-use-end (when block was tool_use)
 *   - `message_delta` (stop_reason + usage) → usage + stop
 *   - `message_stop` → ignored (we already emitted stop)
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { StreamChunk } from '@agiworkforce/types';

type MessageStreamEvent = Anthropic.MessageStreamEvent;

const stopReasonMap: Record<
  string,
  StreamChunk['type'] extends 'stop' ? never : never
> = {} as never;
void stopReasonMap; // silence "unused" while we keep the comment in place

function mapStopReason(
  reason: Anthropic.Message['stop_reason'] | null | undefined,
): 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' | 'error' | 'cancel' {
  switch (reason) {
    case 'end_turn':
      return 'end_turn';
    case 'max_tokens':
      return 'max_tokens';
    case 'tool_use':
      return 'tool_use';
    case 'stop_sequence':
      return 'stop_sequence';
    default:
      return 'end_turn';
  }
}

interface BlockState {
  type: 'text' | 'tool_use' | 'thinking';
  toolUseId?: string;
}

export async function* translateAnthropicStream(
  stream: AsyncIterable<MessageStreamEvent>,
): AsyncIterable<StreamChunk> {
  const blocksByIndex = new Map<number, BlockState>();
  let inputTokens: number | undefined;
  let cacheReadTokens: number | undefined;
  let cacheWriteTokens: number | undefined;

  for await (const event of stream) {
    switch (event.type) {
      case 'message_start': {
        // Anthropic emits initial usage on message_start
        const usage = event.message.usage;
        if (usage) {
          inputTokens = usage.input_tokens;
          cacheReadTokens = usage.cache_read_input_tokens ?? undefined;
          cacheWriteTokens = usage.cache_creation_input_tokens ?? undefined;
        }
        break;
      }
      case 'content_block_start': {
        const idx = event.index;
        const block = event.content_block;
        if (block.type === 'tool_use') {
          blocksByIndex.set(idx, { type: 'tool_use', toolUseId: block.id });
          yield {
            type: 'tool-use-start',
            toolUseId: block.id,
            name: block.name,
          };
        } else if (block.type === 'text') {
          blocksByIndex.set(idx, { type: 'text' });
        } else if (block.type === 'thinking') {
          blocksByIndex.set(idx, { type: 'thinking' });
        }
        break;
      }
      case 'content_block_delta': {
        const idx = event.index;
        const state = blocksByIndex.get(idx);
        const delta = event.delta;
        if (delta.type === 'text_delta') {
          yield { type: 'text-delta', delta: delta.text };
        } else if (delta.type === 'input_json_delta' && state?.toolUseId) {
          yield {
            type: 'tool-use-delta',
            toolUseId: state.toolUseId,
            deltaJson: delta.partial_json,
          };
        } else if (delta.type === 'thinking_delta') {
          yield { type: 'thinking-delta', delta: delta.thinking };
        } else if (delta.type === 'signature_delta') {
          // Signature_delta carries the verifier signature for thinking blocks.
          // We surface it on the next thinking-delta with empty content; callers
          // that care about round-tripping signatures should observe both.
          yield { type: 'thinking-delta', delta: '', signature: delta.signature };
        }
        break;
      }
      case 'content_block_stop': {
        const idx = event.index;
        const state = blocksByIndex.get(idx);
        if (state?.type === 'tool_use' && state.toolUseId) {
          yield { type: 'tool-use-end', toolUseId: state.toolUseId };
        }
        blocksByIndex.delete(idx);
        break;
      }
      case 'message_delta': {
        const usage = event.usage;
        const outputTokens = usage?.output_tokens;
        const usageChunk: StreamChunk = {
          type: 'usage',
          ...(inputTokens !== undefined ? { inputTokens } : {}),
          ...(outputTokens !== undefined ? { outputTokens } : {}),
          ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
          ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
        };
        yield usageChunk;
        yield { type: 'stop', reason: mapStopReason(event.delta.stop_reason) };
        break;
      }
      case 'message_stop':
        // No-op — already emitted stop in message_delta.
        break;
    }
  }
}
