import type { StreamChunk } from '@agiworkforce/types';

import type { OpenAIChatCompletionChunk } from './types';

interface ToolCallState {
  id: string;
  name: string;
  emittedStart: boolean;
}

function mapFinishReason(
  reason: OpenAIChatCompletionChunk['choices'][number]['finish_reason'],
): 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' | 'refusal' | 'error' | 'cancel' {
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    case 'content_filter':
      return 'refusal';
    default:
      return 'end_turn';
  }
}

function usageChunk(usage: NonNullable<OpenAIChatCompletionChunk['usage']>): StreamChunk {
  return {
    type: 'usage',
    ...(usage.prompt_tokens !== undefined ? { inputTokens: usage.prompt_tokens } : {}),
    ...(usage.completion_tokens !== undefined ? { outputTokens: usage.completion_tokens } : {}),
    ...(usage.prompt_tokens_details?.cached_tokens !== undefined
      ? { cacheReadTokens: usage.prompt_tokens_details.cached_tokens }
      : {}),
    ...(usage.prompt_tokens_details?.cache_write_tokens !== undefined
      ? { cacheWriteTokens: usage.prompt_tokens_details.cache_write_tokens }
      : {}),
    ...(usage.completion_tokens_details?.reasoning_tokens !== undefined
      ? { reasoningTokens: usage.completion_tokens_details.reasoning_tokens }
      : {}),
  };
}

// `stop` is emitted at finish_reason, not held to the end: the passthrough wire
// owes OpenAI's own frame order, which puts the usage-only chunk last.
export async function* translateOpenAIStream(
  chunks: AsyncIterable<OpenAIChatCompletionChunk>,
): AsyncIterable<StreamChunk> {
  const toolCalls = new Map<number, ToolCallState>();
  let lastUsage: OpenAIChatCompletionChunk['usage'] | undefined;
  let stopEmitted = false;
  let metaEmitted = false;

  for await (const chunk of chunks) {
    if (!metaEmitted) {
      metaEmitted = true;
      yield {
        type: 'response-meta',
        ...(chunk.id !== undefined ? { id: chunk.id } : {}),
        ...(chunk.model !== undefined ? { model: chunk.model } : {}),
        ...(chunk.created !== undefined ? { created: chunk.created } : {}),
        ...(chunk.system_fingerprint !== undefined
          ? { systemFingerprint: chunk.system_fingerprint }
          : {}),
        ...(chunk.service_tier !== undefined ? { serviceTier: chunk.service_tier } : {}),
      };
    }

    if (chunk.usage) {
      lastUsage = chunk.usage;
    }
    const choice = chunk.choices[0];
    if (!choice) continue;
    const delta = choice.delta;

    const logprobs = choice.logprobs !== undefined ? { logprobs: choice.logprobs } : {};

    if (delta.content) {
      yield { type: 'text-delta', delta: delta.content, ...logprobs };
    }
    if (delta.reasoning_content) {
      yield { type: 'thinking-delta', delta: delta.reasoning_content };
    }
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        let state = toolCalls.get(tc.index);
        if (!state) {
          if (tc.id && tc.function?.name) {
            state = { id: tc.id, name: tc.function.name, emittedStart: false };
            toolCalls.set(tc.index, state);
          }
        }
        if (state && !state.emittedStart) {
          yield { type: 'tool-use-start', toolUseId: state.id, name: state.name, ...logprobs };
          state.emittedStart = true;
        }
        if (state && tc.function?.arguments) {
          yield {
            type: 'tool-use-delta',
            toolUseId: state.id,
            deltaJson: tc.function.arguments,
            ...logprobs,
          };
        }
      }
    }

    if (choice.finish_reason && !stopEmitted) {
      for (const state of toolCalls.values()) {
        if (state.emittedStart) {
          yield { type: 'tool-use-end', toolUseId: state.id };
        }
      }
      toolCalls.clear();

      if (lastUsage) {
        yield usageChunk(lastUsage);
        lastUsage = undefined;
      }

      yield { type: 'stop', reason: mapFinishReason(choice.finish_reason) };
      stopEmitted = true;
    }
  }

  if (lastUsage) yield usageChunk(lastUsage);
  if (!stopEmitted) yield { type: 'stop', reason: 'end_turn' };
}
