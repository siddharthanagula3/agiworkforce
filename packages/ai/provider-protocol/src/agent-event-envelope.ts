
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
