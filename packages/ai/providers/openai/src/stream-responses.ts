/**
 * OpenAI Responses API stream → StreamChunk translation.
 *
 * The Responses API emits a typed event stream. Mapping:
 *
 *   response.created                           → (ignored — observation only)
 *   response.in_progress                       → (ignored)
 *   response.output_item.added (function_call) → tool-use-start
 *   response.output_text.delta                 → text-delta
 *   response.function_call_arguments.delta     → tool-use-delta
 *   response.reasoning_summary_text.delta      → thinking-delta
 *   response.reasoning_text.delta              → thinking-delta
 *   response.refusal.delta                     → text-delta (visible refusal)
 *   response.output_item.done (function_call)  → tool-use-end
 *   response.completed                         → usage + stop(end_turn)
 *   response.incomplete                        → stop(max_tokens)
 *   response.failed / response.error           → error + stop(error)
 */

import type { StreamChunk } from '@agiworkforce/types';

import type { ResponsesStreamEvent } from './responses-types';

interface OpenItem {
  type: 'message' | 'function_call' | 'reasoning';
  /** For function_call only — the call_id we expose to consumers. */
  callId?: string;
  emittedStart?: boolean;
}

function mapIncompleteReason(
  reason: string | undefined,
): 'max_tokens' | 'stop_sequence' | 'error' | 'end_turn' {
  switch (reason) {
    case 'max_output_tokens':
    case 'max_tokens':
      return 'max_tokens';
    case 'content_filter':
      return 'error';
    case 'stop_sequence':
      return 'stop_sequence';
    default:
      return 'end_turn';
  }
}

export async function* translateOpenAIResponsesStream(
  events: AsyncIterable<ResponsesStreamEvent>,
): AsyncIterable<StreamChunk> {
  const items = new Map<number, OpenItem>();
  let stopEmitted = false;

  for await (const event of events) {
    switch (event.type) {
      case 'response.output_item.added': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.output_item.added' }>;
        const idx = ev.output_index;
        if (ev.item.type === 'function_call') {
          items.set(idx, { type: 'function_call', callId: ev.item.call_id });
          yield {
            type: 'tool-use-start',
            toolUseId: ev.item.call_id,
            name: ev.item.name,
          };
          const state = items.get(idx);
          if (state) state.emittedStart = true;
          // Some providers include initial arguments on `added`; emit them.
          if (ev.item.arguments && ev.item.arguments.length > 0) {
            yield {
              type: 'tool-use-delta',
              toolUseId: ev.item.call_id,
              deltaJson: ev.item.arguments,
            };
          }
        } else if (ev.item.type === 'message') {
          items.set(idx, { type: 'message' });
        } else if (ev.item.type === 'reasoning') {
          items.set(idx, { type: 'reasoning' });
        }
        break;
      }
      case 'response.output_text.delta': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.output_text.delta' }>;
        if (ev.delta) yield { type: 'text-delta', delta: ev.delta };
        break;
      }
      case 'response.refusal.delta': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.refusal.delta' }>;
        // Surface refusal text as visible content so the user sees it.
        if (ev.delta) yield { type: 'text-delta', delta: ev.delta };
        break;
      }
      case 'response.function_call_arguments.delta': {
        const ev = event as Extract<
          ResponsesStreamEvent,
          { type: 'response.function_call_arguments.delta' }
        >;
        const state = items.get(ev.output_index);
        if (state?.callId && ev.delta) {
          yield {
            type: 'tool-use-delta',
            toolUseId: state.callId,
            deltaJson: ev.delta,
          };
        }
        break;
      }
      case 'response.reasoning_summary_text.delta':
      case 'response.reasoning_text.delta': {
        const ev = event as { delta?: string };
        if (ev.delta) yield { type: 'thinking-delta', delta: ev.delta };
        break;
      }
      case 'response.output_item.done': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.output_item.done' }>;
        const state = items.get(ev.output_index);
        if (state?.type === 'function_call' && state.callId && state.emittedStart) {
          yield { type: 'tool-use-end', toolUseId: state.callId };
        }
        items.delete(ev.output_index);
        break;
      }
      case 'response.completed': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.completed' }>;
        const usage = ev.response.usage;
        if (usage) {
          const usageChunk: StreamChunk = {
            type: 'usage',
            ...(usage.input_tokens !== undefined ? { inputTokens: usage.input_tokens } : {}),
            ...(usage.output_tokens !== undefined ? { outputTokens: usage.output_tokens } : {}),
            ...(usage.input_tokens_details?.cached_tokens !== undefined
              ? { cacheReadTokens: usage.input_tokens_details.cached_tokens }
              : {}),
            ...(usage.output_tokens_details?.reasoning_tokens !== undefined
              ? { reasoningTokens: usage.output_tokens_details.reasoning_tokens }
              : {}),
          };
          yield usageChunk;
        }
        const reason = ev.response.incomplete_details?.reason;
        yield { type: 'stop', reason: mapIncompleteReason(reason) };
        stopEmitted = true;
        break;
      }
      case 'response.incomplete': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.incomplete' }>;
        yield {
          type: 'stop',
          reason: mapIncompleteReason(ev.response.incomplete_details?.reason),
        };
        stopEmitted = true;
        break;
      }
      case 'response.failed': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.failed' }>;
        yield {
          type: 'error',
          message: ev.response.error?.message ?? 'Response failed',
          ...(ev.response.error?.code ? { code: ev.response.error.code } : {}),
        };
        yield { type: 'stop', reason: 'error' };
        stopEmitted = true;
        break;
      }
      case 'response.error': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.error' }>;
        yield {
          type: 'error',
          message: ev.message ?? 'Response error',
          ...(ev.code ? { code: ev.code } : {}),
        };
        yield { type: 'stop', reason: 'error' };
        stopEmitted = true;
        break;
      }
      // Ignore other event variants (queued, in_progress, content_part.*, etc.).
    }
  }

  if (!stopEmitted) {
    yield { type: 'stop', reason: 'end_turn' };
  }
}
