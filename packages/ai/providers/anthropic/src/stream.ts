/**
 * Anthropic stream → StreamChunk translation.
 *
 * Consumes the SDK's MessageStreamEvent union and yields AGI Workforce's
 * canonical `StreamChunk` discriminated union.
 *
 * Anthropic event types we map:
 *   - `message_start` → ignored (usage emitted separately)
 *   - `content_block_start` (text|tool_use|thinking) → tool-use-start (tools only)
 *   - `content_block_start` (server_tool_use) → server-tool-use
 *   - `content_block_start` (web_search_tool_result|code_execution_tool_result) → server-tool-result
 *   - `content_block_start` (anything else, e.g. web_fetch_tool_result) → vendor-raw (whole event)
 *   - `content_block_delta` (text_delta|input_json_delta|thinking_delta|signature_delta) → text-delta | tool-use-delta | thinking-delta
 *   - `content_block_delta` (input_json_delta on a server_tool_use block) → dropped (no known consumer)
 *   - `content_block_delta` (citations_delta) → citation-delta
 *   - `content_block_delta` (anything else) → vendor-raw (whole event)
 *   - `content_block_stop` → tool-use-end (when block was tool_use); otherwise no chunk
 *   - `message_delta` (stop_reason + usage) → usage + stop
 *   - `message_stop` → ignored (we already emitted stop)
 *
 * The `vendor-raw` / raw-passthrough choices above exist to reproduce the
 * legacy web route's default behavior (apps/web/app/api/llm/v1/chat/
 * completions/lib/stream-transform.ts, pre-Wave-2): its Anthropic-event
 * reshaping only special-cased a specific set of block/delta types; every
 * OTHER type it saw fell through untouched onto the SSE wire. Byte-stable
 * migration means reproducing that passthrough here, not silently dropping
 * newly-noticed cases — see the golden fixtures in apps/web/app/api/llm/
 * v1/chat/completions/__tests__/stream-transform.golden.test.ts, which
 * capture the exact bytes for citations_delta.
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
    case 'refusal':
      // Anthropic's streaming safety classifiers intervened mid-generation
      // (docs.claude.com: "when streaming classifiers intervene to handle
      // potential policy violations"). StreamChunkStop['reason'] has no
      // dedicated refusal member, so this maps to 'error' -- NOT the
      // 'end_turn' default -- matching the sibling OpenAI adapter's
      // `content_filter` -> 'error' convention (packages/ai/providers/openai/
      // src/stream.ts's mapFinishReason). Both api-gateway (routes/llm.ts)
      // and the OpenAI-wire assembler (packages/ai/provider-protocol/src/
      // openai-wire-compat.ts's x_stream_error side-channel) already treat
      // 'error' as "surface this as an abnormal stop", so a refusal is
      // reported to the caller/client distinctly from a normal completion
      // instead of silently billing/rendering it as one.
      return 'error';
    // `pause_turn` (long-running server-tool turn paused, resumable via a
    // follow-up request) also falls through to the 'end_turn' default below.
    // That's a distinct, tracked gap -- the harness has no continuation
    // support for it today -- not fixed here (out of scope for the refusal
    // fix; see docs/agent-context/known-flaws.md).
    default:
      return 'end_turn';
  }
}

interface BlockState {
  type: 'text' | 'tool_use' | 'thinking' | 'server_tool_use';
  toolUseId?: string;
}

/** `content_block_start.content_block.type` values with a dedicated
 *  translation below. Anything outside this set (e.g. `web_fetch_tool_
 *  result`, `redacted_thinking`, `bash_code_execution_tool_result`) yields
 *  `vendor-raw` — see the module docstring. */
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
          // Anthropic emits initial usage on message_start
          const usage = event.message.usage;
          if (usage) {
            inputTokens = usage.input_tokens;
            cacheReadTokens = usage.cache_read_input_tokens ?? undefined;
            cacheWriteTokens = usage.cache_creation_input_tokens ?? undefined;
            // 1h/5m TTL breakdown only appears on the full `Usage` shape
            // (message_start), not on the cumulative `MessageDeltaUsage`
            // (message_delta) — capture it here alongside the other cache
            // counters. Anthropic omits `cache_creation` entirely for
            // requests with no cache breakpoints or a single 5m breakpoint.
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
            // Result blocks arrive complete -- no delta form, no
            // content_block_stop follow-up needed, so we don't register
            // block state for them.
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
            // Signature_delta carries the verifier signature for thinking blocks.
            // We surface it on the next thinking-delta with empty content; callers
            // that care about round-tripping signatures should observe both.
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
          // No-op — already emitted stop in message_delta.
          break;
      }
    }
  } finally {
    // Anthropic streams normally emit `message_delta` (-> stop) before the
    // SDK iterator drains. If the upstream stream is truncated (network
    // drop, abort, server-side cutoff) we still need to surface a `stop`
    // chunk so the caller's consumer loop terminates with a known reason.
    // Mirrors the OpenAI stream's `if (!stopEmitted)` tail in stream.ts.
    if (!stopEmitted) {
      yield { type: 'stop', reason: 'end_turn' };
    }
  }
}
