/**
 * OpenAI Chat Completions stream → StreamChunk translation.
 *
 * SSE delta accumulation rules:
 *   - `delta.content` → `text-delta` (content can also be `null` on tool-only chunks)
 *   - `delta.reasoning_content` → `thinking-delta` (o-series reasoning models)
 *   - `delta.tool_calls[].function.name` (first time per index) → `tool-use-start`
 *   - `delta.tool_calls[].function.arguments` (string deltas) → `tool-use-delta`
 *   - `finish_reason` → `tool-use-end` (for any open tool_call) + `stop`
 *   - terminal `usage` (with `stream_options.include_usage`) → `usage`
 *
 * OpenAI emits tool_calls by **index**, not by id (the id only arrives on the
 * first chunk for that index). We track an indexId map to rebuild our shape.
 */

import type { StreamChunk } from '@agiworkforce/types';

import type { OpenAIChatCompletionChunk } from './types';

interface ToolCallState {
  id: string;
  name: string;
  emittedStart: boolean;
}

function mapFinishReason(
  reason: OpenAIChatCompletionChunk['choices'][number]['finish_reason'],
): 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' | 'error' | 'cancel' {
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'length':
      return 'max_tokens';
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    case 'content_filter':
      return 'error';
    default:
      return 'end_turn';
  }
}

export async function* translateOpenAIStream(
  chunks: AsyncIterable<OpenAIChatCompletionChunk>,
): AsyncIterable<StreamChunk> {
  const toolCalls = new Map<number, ToolCallState>();
  let lastUsage: OpenAIChatCompletionChunk['usage'] | undefined;
  let stopEmitted = false;
  let metaEmitted = false;

  for await (const chunk of chunks) {
    // id/created/system_fingerprint/service_tier are stable across a whole
    // OpenAI stream (every real chunk repeats the same values) -- emit once,
    // from the first chunk seen, as a StreamChunkResponseMeta. Task #34's
    // OpenAI slice: OpenAIWireAssembler's wireMode:'openai-passthrough' uses
    // these instead of synthesizing its own id/created, closing the gap
    // between the StreamChunk round-trip and legacy's near-verbatim raw
    // passthrough. A consumer that doesn't recognize this chunk type simply
    // ignores it (see StreamChunkResponseMeta's docstring).
    if (!metaEmitted) {
      metaEmitted = true;
      yield {
        type: 'response-meta',
        ...(chunk.id !== undefined ? { id: chunk.id } : {}),
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

    if (delta.content) {
      yield { type: 'text-delta', delta: delta.content };
    }
    if (delta.reasoning_content) {
      yield { type: 'thinking-delta', delta: delta.reasoning_content };
    }
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        let state = toolCalls.get(tc.index);
        if (!state) {
          // Need both id AND name to emit tool-use-start; OpenAI sends them together
          // on the first chunk for that index.
          if (tc.id && tc.function?.name) {
            state = { id: tc.id, name: tc.function.name, emittedStart: false };
            toolCalls.set(tc.index, state);
          }
        }
        if (state && !state.emittedStart) {
          yield { type: 'tool-use-start', toolUseId: state.id, name: state.name };
          state.emittedStart = true;
        }
        if (state && tc.function?.arguments) {
          yield { type: 'tool-use-delta', toolUseId: state.id, deltaJson: tc.function.arguments };
        }
      }
    }

    if (choice.finish_reason) {
      // Close any open tool calls.
      for (const state of toolCalls.values()) {
        if (state.emittedStart) {
          yield { type: 'tool-use-end', toolUseId: state.id };
        }
      }
      toolCalls.clear();

      // Emit usage if collected (some streams emit usage on a separate trailing chunk).
      if (lastUsage) {
        const usageChunk: StreamChunk = {
          type: 'usage',
          ...(lastUsage.prompt_tokens !== undefined
            ? { inputTokens: lastUsage.prompt_tokens }
            : {}),
          ...(lastUsage.completion_tokens !== undefined
            ? { outputTokens: lastUsage.completion_tokens }
            : {}),
          ...(lastUsage.prompt_tokens_details?.cached_tokens !== undefined
            ? { cacheReadTokens: lastUsage.prompt_tokens_details.cached_tokens }
            : {}),
          ...(lastUsage.completion_tokens_details?.reasoning_tokens !== undefined
            ? { reasoningTokens: lastUsage.completion_tokens_details.reasoning_tokens }
            : {}),
        };
        yield usageChunk;
        lastUsage = undefined;
      }

      yield { type: 'stop', reason: mapFinishReason(choice.finish_reason) };
      stopEmitted = true;
    }
  }

  // Trailing usage chunk after finish_reason — drain it.
  if (lastUsage) {
    const usageChunk: StreamChunk = {
      type: 'usage',
      ...(lastUsage.prompt_tokens !== undefined ? { inputTokens: lastUsage.prompt_tokens } : {}),
      ...(lastUsage.completion_tokens !== undefined
        ? { outputTokens: lastUsage.completion_tokens }
        : {}),
      ...(lastUsage.prompt_tokens_details?.cached_tokens !== undefined
        ? { cacheReadTokens: lastUsage.prompt_tokens_details.cached_tokens }
        : {}),
      ...(lastUsage.completion_tokens_details?.reasoning_tokens !== undefined
        ? { reasoningTokens: lastUsage.completion_tokens_details.reasoning_tokens }
        : {}),
    };
    yield usageChunk;
  }

  if (!stopEmitted) {
    yield { type: 'stop', reason: 'end_turn' };
  }
}
