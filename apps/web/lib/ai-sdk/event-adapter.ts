import type { StreamChunk } from '@agiworkforce/types';

export interface AiSdkChunkLike {
  type: string;
  [key: string]: unknown;
}

export interface AiSdkUsageLike {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
}

export interface AiSdkFinishLike {
  finishReason?: string;
  usage?: AiSdkUsageLike;
}

function readStringField(chunk: AiSdkChunkLike, field: string): string | null {
  const value = chunk[field];
  return typeof value === 'string' ? value : null;
}

function readTextDelta(chunk: AiSdkChunkLike): string | null {
  const text = readStringField(chunk, 'text');
  if (text !== null) return text;
  const delta = readStringField(chunk, 'delta');
  if (delta !== null) return delta;
  return null;
}

function errorMessage(error: unknown, fallback?: string): string {
  if (typeof fallback === 'string' && fallback.length > 0) return fallback;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'AI SDK stream error';
}

export function mapAiSdkFinishReasonToAgiStopReason(
  finishReason: string | undefined,
): Extract<StreamChunk, { type: 'stop' }>['reason'] {
  switch (finishReason) {
    case 'length':
      return 'max_tokens';
    case 'tool-calls':
    case 'tool_call':
    case 'tool-use':
      return 'tool_use';
    case 'error':
    case 'content-filter':
      return 'error';
    case 'cancel':
      return 'cancel';
    case 'stop':
    default:
      return 'end_turn';
  }
}

export function adaptAiSdkChunkToStreamChunk(chunk: AiSdkChunkLike): StreamChunk | null {
  switch (chunk.type) {
    case 'text-delta': {
      const delta = readTextDelta(chunk);
      return delta === null ? null : { type: 'text-delta', delta };
    }

    case 'reasoning-delta': {
      const delta = readTextDelta(chunk);
      if (delta === null) return null;
      const signature = readStringField(chunk, 'signature');
      return {
        type: 'thinking-delta',
        delta,
        ...(signature ? { signature } : {}),
      };
    }

    case 'tool-call': {
      const toolCallId = readStringField(chunk, 'toolCallId');
      const toolName = readStringField(chunk, 'toolName');
      if (!toolCallId || !toolName) return null;
      return {
        type: 'tool-use-start',
        toolUseId: toolCallId,
        name: toolName,
      };
    }

    case 'tool-call-delta': {
      const toolCallId = readStringField(chunk, 'toolCallId');
      if (!toolCallId) return null;
      const deltaJson =
        readStringField(chunk, 'argsTextDelta') ??
        readStringField(chunk, 'inputTextDelta') ??
        readStringField(chunk, 'delta');
      if (deltaJson === null) return null;
      return {
        type: 'tool-use-delta',
        toolUseId: toolCallId,
        deltaJson,
      };
    }

    case 'tool-result': {
      const toolCallId = readStringField(chunk, 'toolCallId');
      if (!toolCallId) return null;
      return {
        type: 'tool-use-end',
        toolUseId: toolCallId,
      };
    }

    case 'error':
      return {
        type: 'error',
        message: errorMessage(chunk['error'], readStringField(chunk, 'message') ?? undefined),
        retryable: false,
      };

    default:
      return null;
  }
}

export function adaptAiSdkFinishToStreamChunks(finish: AiSdkFinishLike): StreamChunk[] {
  const chunks: StreamChunk[] = [];
  const usage = finish.usage;

  if (usage) {
    const usageChunk: Extract<StreamChunk, { type: 'usage' }> = { type: 'usage' };
    const inputTokens = usage.inputTokens ?? usage.promptTokens;
    const outputTokens = usage.outputTokens ?? usage.completionTokens;
    if (inputTokens !== undefined) usageChunk.inputTokens = inputTokens;
    if (outputTokens !== undefined) usageChunk.outputTokens = outputTokens;
    if (usage.reasoningTokens !== undefined) usageChunk.reasoningTokens = usage.reasoningTokens;
    chunks.push(usageChunk);
  }

  chunks.push({
    type: 'stop',
    reason: mapAiSdkFinishReasonToAgiStopReason(finish.finishReason),
  });

  return chunks;
}
