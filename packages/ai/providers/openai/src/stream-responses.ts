/**
 * OpenAI Responses API stream → StreamChunk translation.
 *
 * The Responses API emits a typed event stream. Mapping:
 *
 *   response.created                           → (ignored — observation only)
 *   response.in_progress                       → (ignored)
 *   response.output_item.added (function_call) → tool-use-start
 *   response.output_item.added (web_search_call) → server-tool-use
 *   response.output_text.delta                 → text-delta
 *   response.function_call_arguments.delta     → tool-use-delta
 *   response.reasoning_summary_text.delta      → thinking-delta
 *   response.reasoning_text.delta              → thinking-delta
 *   response.refusal.delta                     → text-delta (visible refusal)
 *   response.output_item.done (function_call)  → tool-use-end
 *   response.output_text.annotation.added      → citation-delta
 *   response.completed                         → usage + stop(end_turn)
 *   response.incomplete                        → stop(max_tokens)
 *   response.failed / error / response.error   → error + stop(error)
 */

import type { StreamChunk } from '@agiworkforce/types';

import type {
  ResponseWebSearchAction,
  ResponseWebSearchCallItem,
  ResponsesStreamEvent,
} from './responses-types';

interface OpenItem {
  type: 'message' | 'function_call' | 'reasoning' | 'web_search_call';
  /** For function_call only — the call_id we expose to consumers. */
  callId?: string;
  emittedStart?: boolean;
}

interface WebSearchState {
  id: string;
  status?: ResponseWebSearchCallItem['status'];
  sources: Set<string>;
}

function actionSources(action: ResponseWebSearchAction | undefined): string[] {
  if (!action) return [];
  if (action.type === 'search') {
    return (action.sources ?? []).map((source) => source.url).filter(Boolean);
  }
  return action.url ? [action.url] : [];
}

function mapIncompleteReason(
  reason: string | undefined,
): 'max_tokens' | 'stop_sequence' | 'refusal' | 'end_turn' {
  switch (reason) {
    case 'max_output_tokens':
    case 'max_tokens':
      return 'max_tokens';
    case 'content_filter':
      // Safety-layer stop — first-class 'refusal', same member the
      // Chat Completions adapter maps wire `content_filter` to.
      return 'refusal';
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
  const webSearches = new Map<number, WebSearchState>();
  const citationTitles = new Map<string, string>();
  const textDeltaKeys = new Set<string>();
  let stopEmitted = false;
  let searchResultEmitted = false;

  function updateWebSearch(outputIndex: number, item: ResponseWebSearchCallItem): WebSearchState {
    const state = webSearches.get(outputIndex) ?? { id: item.id, sources: new Set<string>() };
    state.id = item.id;
    state.status = item.status;
    for (const url of actionSources(item.action)) state.sources.add(url);
    webSearches.set(outputIndex, state);
    return state;
  }

  function buildWebSearchResult():
    | Extract<StreamChunk, { type: 'server-tool-result' }>
    | undefined {
    if (searchResultEmitted || webSearches.size === 0) return undefined;
    searchResultEmitted = true;
    const states = [...webSearches.values()];
    const first = states[0];
    if (!first) return undefined;
    const urls = [...new Set(states.flatMap((state) => [...state.sources]))];
    return {
      type: 'server-tool-result',
      toolUseId: first.id,
      payload: {
        type: 'web_search_tool_result',
        tool_use_id: first.id,
        content: urls.map((url) => ({
          type: 'web_search_result',
          url,
          title: citationTitles.get(url) ?? url,
        })),
      },
      ...(urls.length === 0 && states.every((state) => state.status === 'failed')
        ? { isError: true }
        : {}),
    };
  }

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
        } else if (ev.item.type === 'web_search_call') {
          items.set(idx, { type: 'web_search_call', callId: ev.item.id, emittedStart: true });
          updateWebSearch(idx, ev.item);
          yield { type: 'server-tool-use', toolUseId: ev.item.id, name: 'web_search' };
        }
        break;
      }
      case 'response.output_text.delta': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.output_text.delta' }>;
        if (ev.delta) {
          textDeltaKeys.add(`${ev.output_index}:${ev.content_index}`);
          yield { type: 'text-delta', delta: ev.delta };
        }
        break;
      }
      case 'response.output_text.done': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.output_text.done' }>;
        const key = `${ev.output_index}:${ev.content_index}`;
        if (ev.text && !textDeltaKeys.has(key)) {
          yield { type: 'text-delta', delta: ev.text };
        }
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
      case 'response.output_text.annotation.added': {
        const ev = event as Extract<
          ResponsesStreamEvent,
          { type: 'response.output_text.annotation.added' }
        >;
        const annotation = ev.annotation as Record<string, unknown>;
        if (
          annotation['type'] === 'url_citation' &&
          typeof annotation['url'] === 'string' &&
          typeof annotation['title'] === 'string' &&
          typeof annotation['start_index'] === 'number' &&
          typeof annotation['end_index'] === 'number'
        ) {
          const citation = {
            type: 'url_citation' as const,
            url: annotation['url'],
            title: annotation['title'],
            start_index: annotation['start_index'],
            end_index: annotation['end_index'],
          };
          citationTitles.set(citation.url, citation.title);
          yield {
            type: 'citation-delta',
            blockIndex: ev.output_index,
            payload: citation,
          };
        }
        break;
      }
      case 'response.output_item.done': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.output_item.done' }>;
        const state = items.get(ev.output_index);
        if (state?.type === 'function_call' && state.callId && state.emittedStart) {
          yield { type: 'tool-use-end', toolUseId: state.callId };
        }
        if (ev.item.type === 'web_search_call') {
          if (!state?.emittedStart) {
            yield { type: 'server-tool-use', toolUseId: ev.item.id, name: 'web_search' };
          }
          updateWebSearch(ev.output_index, ev.item);
        }
        items.delete(ev.output_index);
        break;
      }
      case 'response.completed': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.completed' }>;
        const searchResult = buildWebSearchResult();
        if (searchResult) yield searchResult;
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
        const searchResult = buildWebSearchResult();
        if (searchResult) yield searchResult;
        yield {
          type: 'stop',
          reason: mapIncompleteReason(ev.response.incomplete_details?.reason),
        };
        stopEmitted = true;
        break;
      }
      case 'response.failed': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.failed' }>;
        const searchResult = buildWebSearchResult();
        if (searchResult) yield searchResult;
        yield {
          type: 'error',
          message: ev.response.error?.message ?? 'Response failed',
          ...(ev.response.error?.code ? { code: ev.response.error.code } : {}),
        };
        yield { type: 'stop', reason: 'error' };
        stopEmitted = true;
        break;
      }
      case 'error':
      case 'response.error': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'error' | 'response.error' }>;
        const searchResult = buildWebSearchResult();
        if (searchResult) yield searchResult;
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
    const searchResult = buildWebSearchResult();
    if (searchResult) yield searchResult;
    yield { type: 'stop', reason: 'end_turn' };
  }
}
