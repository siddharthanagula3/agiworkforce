/**
 * Web-dialect edge translation for the one versioned agent event envelope
 * (`crates/agiworkforce-protocol/src/agent_events.rs`, execution program
 * §W5 item 4). Pure functions both ways — no IO, no provider SDKs, matching
 * this package's existing translation-edge contract (see
 * `openai-wire-compat.ts`'s module doc).
 *
 * This is the web/`StreamChunk` <-> `AgentEvent` edge specifically. The
 * app-server (`turn/*` JSON-RPC notifications) and desktop (`sse_parser.rs`
 * `StreamChunk`) edges are their own surfaces' work — "converging the three
 * surfaces' emitters is follow-on work" (execution program §W5 item 4) —
 * this file does not attempt them.
 *
 * `StreamChunkCitation`, `StreamChunkVendorRaw`, and `StreamChunkResponseMeta`
 * map to `null`: `agent_events.rs`'s module doc documents why they are not
 * modeled in the shared envelope (legacy-wire-reconstruction concerns with
 * no app-server/desktop equivalent). User-surface run activity (`lifecycle`,
 * progress, execution, approvals, sources, artifacts, and compaction) maps to
 * `null` in the reverse direction because provider `StreamChunk` is only the
 * model-streaming sub-dialect of the broader agent-run envelope.
 */

import type { StreamChunk } from '@agiworkforce/types';
import type { AgentEvent, AgentEventStopReason, JsonValue } from '@agiworkforce/types/protocol';

const STOP_REASON_TO_AGENT_EVENT: Record<
  Extract<StreamChunk, { type: 'stop' }>['reason'],
  AgentEventStopReason
> = {
  end_turn: 'end-turn',
  max_tokens: 'max-tokens',
  tool_use: 'tool-use',
  stop_sequence: 'stop-sequence',
  refusal: 'refusal',
  cancel: 'cancelled',
  error: 'error',
};

/**
 * Every member round-trips losslessly now that `StreamChunkStop['reason']`
 * carries the first-class `'refusal'` member and both live emitters produce
 * it (Anthropic `stop_reason: 'refusal'` and OpenAI wire
 * `finish_reason: 'content_filter'` — see
 * `packages/ai/providers/{anthropic,openai}/src/stream*.ts`). The historical
 * asymmetry (envelope `Refusal` collapsing down to `'error'`) is closed —
 * see the `stopReasonRoundTrip` describe block in the test file, which pins
 * the symmetric behavior.
 */
const AGENT_EVENT_STOP_REASON_TO_STREAM_CHUNK: Record<
  AgentEventStopReason,
  Extract<StreamChunk, { type: 'stop' }>['reason']
> = {
  'end-turn': 'end_turn',
  'max-tokens': 'max_tokens',
  'tool-use': 'tool_use',
  'stop-sequence': 'stop_sequence',
  refusal: 'refusal',
  cancelled: 'cancel',
  error: 'error',
};

/** Web `StreamChunk` -> the shared envelope's `AgentEvent`. Returns `null`
 * for the three deliberately-unmodeled variants (see module doc). */
export function streamChunkToAgentEvent(chunk: StreamChunk): AgentEvent | null {
  switch (chunk.type) {
    case 'text-delta':
      return { type: 'text-delta', delta: chunk.delta };
    case 'thinking-delta':
      return { type: 'reasoning-delta', delta: chunk.delta, signature: chunk.signature };
    case 'tool-use-start':
      return { type: 'tool-use-start', toolUseId: chunk.toolUseId, name: chunk.name };
    case 'tool-use-delta':
      return { type: 'tool-use-delta', toolUseId: chunk.toolUseId, deltaJson: chunk.deltaJson };
    case 'tool-use-end':
      return { type: 'tool-use-end', toolUseId: chunk.toolUseId };
    case 'server-tool-use':
      return { type: 'server-tool-use', toolUseId: chunk.toolUseId, name: chunk.name };
    case 'server-tool-result':
      return {
        type: 'server-tool-result',
        toolUseId: chunk.toolUseId,
        // `StreamChunkServerToolResult.payload` is deliberately `unknown`
        // (its own docstring: "no cross-vendor consumer interprets its
        // contents"), but every real producer assigns it a vendor JSON
        // object — safe to assert into the envelope's stricter `JsonValue`.
        payload: chunk.payload as JsonValue,
        isError: chunk.isError,
      };
    case 'usage':
      return {
        type: 'usage',
        inputTokens: chunk.inputTokens,
        outputTokens: chunk.outputTokens,
        cacheReadTokens: chunk.cacheReadTokens,
        cacheWriteTokens: chunk.cacheWriteTokens,
        cacheWrite1hTokens: chunk.cacheWrite1hTokens,
        reasoningTokens: chunk.reasoningTokens,
      };
    case 'error':
      return {
        type: 'error',
        message: chunk.message,
        code: chunk.code,
        retryable: chunk.retryable,
        retryAfterSeconds: chunk.retryAfterSeconds,
      };
    case 'stop':
      return { type: 'stop', reason: STOP_REASON_TO_AGENT_EVENT[chunk.reason] };
    case 'citation-delta':
    case 'vendor-raw':
    case 'response-meta':
      return null;
  }
}

/** The shared envelope's `AgentEvent` -> web `StreamChunk`. Returns `null`
 * for user-surface run activity with no provider `StreamChunk` analog. */
export function agentEventToStreamChunk(event: AgentEvent): StreamChunk | null {
  switch (event.type) {
    case 'text-delta':
      return { type: 'text-delta', delta: event.delta };
    case 'reasoning-delta':
      return { type: 'thinking-delta', delta: event.delta, signature: event.signature };
    case 'tool-use-start':
      return { type: 'tool-use-start', toolUseId: event.toolUseId, name: event.name };
    case 'tool-use-delta':
      return { type: 'tool-use-delta', toolUseId: event.toolUseId, deltaJson: event.deltaJson };
    case 'tool-use-end':
      return { type: 'tool-use-end', toolUseId: event.toolUseId };
    case 'server-tool-use':
      return { type: 'server-tool-use', toolUseId: event.toolUseId, name: event.name };
    case 'server-tool-result':
      return {
        type: 'server-tool-result',
        toolUseId: event.toolUseId,
        payload: event.payload,
        isError: event.isError,
      };
    case 'usage':
      return {
        type: 'usage',
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        cacheReadTokens: event.cacheReadTokens,
        cacheWriteTokens: event.cacheWriteTokens,
        cacheWrite1hTokens: event.cacheWrite1hTokens,
        reasoningTokens: event.reasoningTokens,
      };
    case 'error':
      return {
        type: 'error',
        message: event.message,
        code: event.code,
        retryable: event.retryable,
        retryAfterSeconds: event.retryAfterSeconds,
      };
    case 'stop':
      return { type: 'stop', reason: AGENT_EVENT_STOP_REASON_TO_STREAM_CHUNK[event.reason] };
    case 'lifecycle':
    case 'progress-update':
    case 'tool-execution-start':
    case 'tool-execution-end':
    case 'source-list':
    case 'approval-requested':
    case 'approval-resolved':
    case 'artifact-produced':
    case 'context-compacted':
    case 'task-state-changed':
      return null;
  }
}
