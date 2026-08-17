import type Anthropic from '@anthropic-ai/sdk';
import type { StreamChunk, StreamChunkStop } from '@agiworkforce/types';

type MessageStreamEvent = Anthropic.MessageStreamEvent;

const stopReasonMap: Record<
  string,
  StreamChunk['type'] extends 'stop' ? never : never
> = {} as never;
void stopReasonMap;

function mapStopReason(
  reason: Anthropic.Message['stop_reason'] | null | undefined,
): StreamChunkStop['reason'] {
  switch (reason) {
    case 'end_turn':
      return 'end_turn';
    case 'max_tokens':
      return 'max_tokens';
    case 'tool_use':
      return 'tool_use';
    case 'stop_sequence':
      return 'stop_sequence';
    case 'refusal':
      // Anthropic's streaming safety classifiers intervened mid-generation
      return 'refusal';
    case 'pause_turn':
      // A long-running server tool suspended a turn that is still resumable
      return 'pause_turn';
    default:
      return 'end_turn';
  }
}

interface BlockState {
  type: 'text' | 'tool_use' | 'thinking' | 'server_tool_use';
  toolUseId?: string;
}

const KNOWN_BLOCK_START_TYPES: ReadonlySet<string> = new Set([
  'tool_use',
  'text',
  'thinking',
  'server_tool_use',
  'web_search_tool_result',
  'code_execution_tool_result',
]);

export async function* translateAnthropicStream(
  stream: AsyncIterable<MessageStreamEvent>,
): AsyncIterable<StreamChunk> {
  const blocksByIndex = new Map<number, BlockState>();
  let inputTokens: number | undefined;
  let cacheReadTokens: number | undefined;
  let cacheWriteTokens: number | undefined;
  let cacheWrite1hTokens: number | undefined;
  let stopEmitted = false;

  try {
    for await (const event of stream) {
      switch (event.type) {
        case 'message_start': {
          const usage = event.message.usage;
          if (usage) {
            inputTokens = usage.input_tokens;
            cacheReadTokens = usage.cache_read_input_tokens ?? undefined;
            cacheWriteTokens = usage.cache_creation_input_tokens ?? undefined;
            cacheWrite1hTokens = usage.cache_creation?.ephemeral_1h_input_tokens ?? undefined;
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
              vendorIndex: idx,
            };
          } else if (block.type === 'text') {
            blocksByIndex.set(idx, { type: 'text' });
          } else if (block.type === 'thinking') {
            blocksByIndex.set(idx, { type: 'thinking' });
          } else if (block.type === 'server_tool_use') {
            blocksByIndex.set(idx, { type: 'server_tool_use', toolUseId: block.id });
            yield { type: 'server-tool-use', toolUseId: block.id, name: block.name };
          } else if (
            block.type === 'web_search_tool_result' ||
            block.type === 'code_execution_tool_result'
          ) {
            yield { type: 'server-tool-result', toolUseId: block.tool_use_id, payload: block };
          } else if (!KNOWN_BLOCK_START_TYPES.has(block.type)) {
            yield { type: 'vendor-raw', payload: event };
          }
          break;
        }
        case 'content_block_delta': {
          const idx = event.index;
          const state = blocksByIndex.get(idx);
          const delta = event.delta;
          if (delta.type === 'text_delta') {
            yield { type: 'text-delta', delta: delta.text };
          } else if (delta.type === 'input_json_delta') {
            if (state?.type === 'tool_use' && state.toolUseId) {
              yield {
                type: 'tool-use-delta',
                toolUseId: state.toolUseId,
                deltaJson: delta.partial_json,
              };
            }
            // else: input deltas on a server_tool_use block are dropped,
            // not passed through -- matches stream-transform.ts's explicit
            // `continue` for blockType === 'server_tool_use', which
            // forwards nothing for these at all (not even raw).
          } else if (delta.type === 'thinking_delta') {
            yield { type: 'thinking-delta', delta: delta.thinking };
          } else if (delta.type === 'signature_delta') {
            yield { type: 'thinking-delta', delta: '', signature: delta.signature };
          } else if (delta.type === 'citations_delta') {
            yield { type: 'citation-delta', blockIndex: idx, payload: delta.citation };
          } else {
            yield { type: 'vendor-raw', payload: event };
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
            ...(cacheWrite1hTokens !== undefined ? { cacheWrite1hTokens } : {}),
          };
          yield usageChunk;
          yield { type: 'stop', reason: mapStopReason(event.delta.stop_reason) };
          stopEmitted = true;
          break;
        }
        case 'message_stop':
          break;
      }
    }
  } finally {
    if (!stopEmitted) {
      yield { type: 'stop', reason: 'end_turn' };
    }
  }
}
