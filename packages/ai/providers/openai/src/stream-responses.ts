import type { StreamChunk } from '@agiworkforce/types';

import type {
  ResponseOutputFunctionCallItem,
  ResponseOutputItem,
  ResponseOutputMessageItem,
  ResponseWebSearchAction,
  ResponseWebSearchCallItem,
  ResponsesStreamEvent,
} from './responses-types';

const OPENAI_TRACKING_PARAM = 'utm_source';
const OPENAI_TRACKING_VALUE = 'openai';

interface OpenItem {
  type: 'message' | 'function_call' | 'reasoning' | 'web_search_call';
  callId?: string;
  name?: string;
  argumentsEmitted?: string;
  emittedStart?: boolean;
  emittedEnd?: boolean;
}

interface WebSearchState {
  id: string;
  status?: ResponseWebSearchCallItem['status'];
  sources: Set<string>;
}

export interface OpenAIResponsesStreamDiagnostics {
  eventTypes: Record<string, number>;
  finalOutputItemTypes: Record<string, number>;
  finalContentTypes: Record<string, number>;
  responseStatus?: string;
  terminalEventType: string;
  emitted: {
    text: boolean;
    functionCall: boolean;
    serverTool: boolean;
    error: boolean;
  };
}

export interface TranslateOpenAIResponsesStreamOptions {
  onDiagnostics?: (diagnostics: OpenAIResponsesStreamDiagnostics) => void;
}

function isFunctionCallItem(item: ResponseOutputItem): item is ResponseOutputFunctionCallItem {
  return (
    item.type === 'function_call' &&
    typeof item['call_id'] === 'string' &&
    typeof item['name'] === 'string' &&
    typeof item['arguments'] === 'string'
  );
}

function isMessageItem(item: ResponseOutputItem): item is ResponseOutputMessageItem {
  return item.type === 'message' && Array.isArray(item['content']);
}

function isWebSearchItem(item: ResponseOutputItem): item is ResponseWebSearchCallItem {
  return item.type === 'web_search_call' && typeof item['id'] === 'string';
}

function incrementCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function stripOpenAITrackingParam(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.get(OPENAI_TRACKING_PARAM) !== OPENAI_TRACKING_VALUE) return url;
    parsed.searchParams.delete(OPENAI_TRACKING_PARAM);
    const cleaned = parsed.toString();
    return cleaned.endsWith('?') ? cleaned.slice(0, -1) : cleaned;
  } catch {
    return url;
  }
}

function actionSources(action: ResponseWebSearchAction | undefined): string[] {
  if (!action || action.type !== 'search') return [];
  return (action.sources ?? []).map((source) => stripOpenAITrackingParam(source.url));
}

function hostnameCitationTitle(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname || url;
  } catch {
    return url;
  }
}

function annotationTitle(raw: unknown): { url: string; title: string } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const annotation = raw as Record<string, unknown>;
  if (annotation['type'] !== 'url_citation' || typeof annotation['url'] !== 'string') {
    return null;
  }
  const url = stripOpenAITrackingParam(annotation['url']);
  const title =
    typeof annotation['title'] === 'string' && annotation['title']
      ? annotation['title']
      : hostnameCitationTitle(url);
  return { url, title };
}

function mapIncompleteReason(
  reason: string | undefined,
): 'max_tokens' | 'stop_sequence' | 'refusal' | 'end_turn' {
  switch (reason) {
    case 'max_output_tokens':
    case 'max_tokens':
      return 'max_tokens';
    case 'content_filter':
      return 'refusal';
    case 'stop_sequence':
      return 'stop_sequence';
    default:
      return 'end_turn';
  }
}

export async function* translateOpenAIResponsesStream(
  events: AsyncIterable<ResponsesStreamEvent>,
  options: TranslateOpenAIResponsesStreamOptions = {},
): AsyncIterable<StreamChunk> {
  const items = new Map<number, OpenItem>();
  const webSearches = new Map<number, WebSearchState>();
  const citationTitles = new Map<string, string>();
  const emittedText = new Map<string, string>();
  const eventTypes: Record<string, number> = {};
  const emitted = {
    text: false,
    functionCall: false,
    serverTool: false,
    error: false,
  };
  let stopEmitted = false;
  const emittedWebSearchResultIds = new Set<string>();
  const emittedCitationUrls = new Set<string>();
  let textStarted = false;
  let diagnosticsEmitted = false;
  let visibleText = '';

  function emitDiagnostics(
    terminalEventType: string,
    response?: Extract<ResponsesStreamEvent, { type: 'response.completed' }>['response'],
  ): void {
    if (diagnosticsEmitted) return;
    diagnosticsEmitted = true;
    const finalOutputItemTypes: Record<string, number> = {};
    const finalContentTypes: Record<string, number> = {};
    for (const item of response?.output ?? []) {
      incrementCount(finalOutputItemTypes, item.type);
      if (isMessageItem(item)) {
        for (const content of item.content ?? []) {
          incrementCount(finalContentTypes, content.type);
        }
      }
    }
    try {
      options.onDiagnostics?.({
        eventTypes,
        finalOutputItemTypes,
        finalContentTypes,
        ...(response?.status ? { responseStatus: response.status } : {}),
        terminalEventType,
        emitted: { ...emitted },
      });
    } catch {
      // Diagnostics must never change provider behavior.
    }
  }

  function recoverText(key: string, text: string): StreamChunk[] {
    if (!text) return [];
    const alreadyEmitted = emittedText.get(key) ?? '';
    const missing = text.startsWith(alreadyEmitted) ? text.slice(alreadyEmitted.length) : '';
    if (!missing) return [];
    emittedText.set(key, text);
    visibleText += missing;
    emitted.text = true;
    return [{ type: 'text-delta', delta: missing }];
  }

  function recoverAggregateText(text: string): StreamChunk[] {
    if (!text || text === visibleText) return [];
    const missing = text.startsWith(visibleText) ? text.slice(visibleText.length) : '';
    if (!missing) return [];
    visibleText += missing;
    emitted.text = true;
    return [{ type: 'text-delta', delta: missing }];
  }

  function recoverFunctionCall(
    outputIndex: number,
    item: ResponseOutputFunctionCallItem,
    close: boolean,
  ): StreamChunk[] {
    const chunks: StreamChunk[] = [];
    const state = items.get(outputIndex) ?? {
      type: 'function_call' as const,
      callId: item.call_id,
      name: item.name,
      argumentsEmitted: '',
    };
    state.callId = item.call_id;
    state.name = item.name;
    state.argumentsEmitted ??= '';
    if (!state.emittedStart) {
      chunks.push({
        type: 'tool-use-start',
        toolUseId: item.call_id,
        name: item.name,
      });
      state.emittedStart = true;
      emitted.functionCall = true;
    }
    const missingArguments = item.arguments.startsWith(state.argumentsEmitted)
      ? item.arguments.slice(state.argumentsEmitted.length)
      : '';
    if (missingArguments) {
      chunks.push({
        type: 'tool-use-delta',
        toolUseId: item.call_id,
        deltaJson: missingArguments,
      });
      state.argumentsEmitted = item.arguments;
    }
    if (close && !state.emittedEnd) {
      chunks.push({ type: 'tool-use-end', toolUseId: item.call_id });
      state.emittedEnd = true;
    }
    items.set(outputIndex, state);
    return chunks;
  }

  function recordCitation(
    blockIndex: number,
    url: string,
    title: string,
    startIndex?: number,
    endIndex?: number,
  ): Extract<StreamChunk, { type: 'citation-delta' }> | undefined {
    citationTitles.set(url, title);
    if (emittedCitationUrls.has(url)) return undefined;
    emittedCitationUrls.add(url);
    return {
      type: 'citation-delta',
      blockIndex,
      payload: {
        type: 'url_citation',
        url,
        title,
        ...(startIndex !== undefined ? { start_index: startIndex } : {}),
        ...(endIndex !== undefined ? { end_index: endIndex } : {}),
      },
    };
  }

  function recoverOutputItem(
    outputIndex: number,
    item: ResponseOutputItem,
    closeFunctionCall: boolean,
  ): StreamChunk[] {
    if (isFunctionCallItem(item)) {
      return recoverFunctionCall(outputIndex, item, closeFunctionCall);
    }
    if (isMessageItem(item)) {
      const citationChunks: StreamChunk[] = [];
      for (const content of item.content ?? []) {
        if (content.type !== 'output_text') continue;
        for (const raw of content.annotations ?? []) {
          const citation = annotationTitle(raw);
          if (!citation) continue;
          const annotation = raw as Record<string, unknown>;
          const chunk = recordCitation(
            outputIndex,
            citation.url,
            citation.title,
            typeof annotation['start_index'] === 'number' ? annotation['start_index'] : undefined,
            typeof annotation['end_index'] === 'number' ? annotation['end_index'] : undefined,
          );
          if (chunk) citationChunks.push(chunk);
        }
      }
      return [
        ...citationChunks,
        ...(item.content ?? []).flatMap((content, contentIndex) =>
          content.type === 'output_text'
            ? recoverText(`${outputIndex}:${contentIndex}`, content.text)
            : recoverText(`${outputIndex}:${contentIndex}`, content.refusal),
        ),
      ];
    }
    return [];
  }

  function updateWebSearch(outputIndex: number, item: ResponseWebSearchCallItem): WebSearchState {
    const state = webSearches.get(outputIndex) ?? { id: item.id, sources: new Set<string>() };
    state.id = item.id;
    state.status = item.status;
    for (const url of actionSources(item.action)) state.sources.add(url);
    webSearches.set(outputIndex, state);
    return state;
  }

  function webSearchResultForState(
    state: WebSearchState,
  ): Extract<StreamChunk, { type: 'server-tool-result' }> | undefined {
    if (emittedWebSearchResultIds.has(state.id)) return undefined;
    if (state.status !== 'completed' && state.status !== 'failed') return undefined;
    emittedWebSearchResultIds.add(state.id);
    const content = [...state.sources].map((url) => ({
      type: 'web_search_result',
      url,
      title: citationTitles.get(url) ?? '',
    }));
    return {
      type: 'server-tool-result',
      toolUseId: state.id,
      payload: {
        type: 'web_search_tool_result',
        tool_use_id: state.id,
        content,
      },
      ...(content.length === 0 && state.status === 'failed' ? { isError: true } : {}),
    };
  }

  function flushWebSearchResults(): Extract<StreamChunk, { type: 'server-tool-result' }>[] {
    const chunks: Extract<StreamChunk, { type: 'server-tool-result' }>[] = [];
    for (const state of webSearches.values()) {
      const chunk = webSearchResultForState(state);
      if (chunk) chunks.push(chunk);
    }
    return chunks;
  }

  for await (const event of events) {
    incrementCount(eventTypes, event.type);
    switch (event.type) {
      case 'response.output_item.added': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.output_item.added' }>;
        const idx = ev.output_index;
        if (isFunctionCallItem(ev.item)) {
          for (const chunk of recoverFunctionCall(idx, ev.item, false)) yield chunk;
        } else if (ev.item.type === 'message') {
          items.set(idx, { type: 'message' });
        } else if (ev.item.type === 'reasoning') {
          items.set(idx, { type: 'reasoning' });
        } else if (isWebSearchItem(ev.item)) {
          items.set(idx, { type: 'web_search_call', callId: ev.item.id, emittedStart: true });
          updateWebSearch(idx, ev.item);
          emitted.serverTool = true;
          yield { type: 'server-tool-use', toolUseId: ev.item.id, name: 'web_search' };
        }
        break;
      }
      case 'response.output_text.delta': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.output_text.delta' }>;
        if (ev.delta) {
          if (!textStarted) {
            textStarted = true;
            for (const searchResult of flushWebSearchResults()) {
              emitted.serverTool = true;
              yield searchResult;
            }
          }
          const key = `${ev.output_index}:${ev.content_index}`;
          emittedText.set(key, `${emittedText.get(key) ?? ''}${ev.delta}`);
          visibleText += ev.delta;
          emitted.text = true;
          yield { type: 'text-delta', delta: ev.delta };
        }
        break;
      }
      case 'response.output_text.done': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.output_text.done' }>;
        for (const chunk of recoverText(`${ev.output_index}:${ev.content_index}`, ev.text))
          yield chunk;
        break;
      }
      case 'response.refusal.delta': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.refusal.delta' }>;
        if (ev.delta) {
          if (!textStarted) {
            textStarted = true;
            for (const searchResult of flushWebSearchResults()) {
              emitted.serverTool = true;
              yield searchResult;
            }
          }
          const key = `${ev.output_index}:${ev.content_index}`;
          emittedText.set(key, `${emittedText.get(key) ?? ''}${ev.delta}`);
          visibleText += ev.delta;
          emitted.text = true;
          yield { type: 'text-delta', delta: ev.delta };
        }
        break;
      }
      case 'response.function_call_arguments.delta': {
        const ev = event as Extract<
          ResponsesStreamEvent,
          { type: 'response.function_call_arguments.delta' }
        >;
        const state = items.get(ev.output_index);
        if (state?.callId && ev.delta) {
          state.argumentsEmitted = `${state.argumentsEmitted ?? ''}${ev.delta}`;
          yield {
            type: 'tool-use-delta',
            toolUseId: state.callId,
            deltaJson: ev.delta,
          };
        }
        break;
      }
      case 'response.function_call_arguments.done': {
        const ev = event as Extract<
          ResponsesStreamEvent,
          { type: 'response.function_call_arguments.done' }
        >;
        const state = items.get(ev.output_index);
        if (state?.type === 'function_call' && state.callId && state.name) {
          for (const chunk of recoverFunctionCall(
            ev.output_index,
            {
              type: 'function_call',
              id: ev.item_id,
              call_id: state.callId,
              name: state.name,
              arguments: ev.arguments,
            },
            false,
          )) {
            yield chunk;
          }
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
          typeof annotation['start_index'] === 'number' &&
          typeof annotation['end_index'] === 'number'
        ) {
          const url = stripOpenAITrackingParam(annotation['url']);
          const title =
            typeof annotation['title'] === 'string' && annotation['title']
              ? annotation['title']
              : hostnameCitationTitle(url);
          const chunk = recordCitation(
            ev.output_index,
            url,
            title,
            annotation['start_index'],
            annotation['end_index'],
          );
          if (chunk) yield chunk;
        }
        break;
      }
      case 'response.output_item.done': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.output_item.done' }>;
        const state = items.get(ev.output_index);
        for (const chunk of recoverOutputItem(ev.output_index, ev.item, true)) yield chunk;
        if (isWebSearchItem(ev.item)) {
          if (!state?.emittedStart) {
            emitted.serverTool = true;
            yield { type: 'server-tool-use', toolUseId: ev.item.id, name: 'web_search' };
          }
          updateWebSearch(ev.output_index, ev.item);
        }
        break;
      }
      case 'response.completed': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.completed' }>;
        for (const [outputIndex, item] of (ev.response.output ?? []).entries()) {
          for (const chunk of recoverOutputItem(outputIndex, item, true)) yield chunk;
          if (isWebSearchItem(item)) {
            const state = items.get(outputIndex);
            if (!state?.emittedStart) {
              emitted.serverTool = true;
              yield { type: 'server-tool-use', toolUseId: item.id, name: 'web_search' };
            }
            updateWebSearch(outputIndex, item);
          }
        }
        if (ev.response.output_text) {
          for (const chunk of recoverAggregateText(ev.response.output_text)) {
            yield chunk;
          }
        }
        for (const searchResult of flushWebSearchResults()) {
          emitted.serverTool = true;
          yield searchResult;
        }
        const usage = ev.response.usage;
        if (usage) {
          const usageChunk: StreamChunk = {
            type: 'usage',
            ...(usage.input_tokens !== undefined ? { inputTokens: usage.input_tokens } : {}),
            ...(usage.output_tokens !== undefined ? { outputTokens: usage.output_tokens } : {}),
            ...(usage.input_tokens_details?.cached_tokens !== undefined
              ? { cacheReadTokens: usage.input_tokens_details.cached_tokens }
              : {}),
            ...(usage.input_tokens_details?.cache_write_tokens !== undefined
              ? { cacheWriteTokens: usage.input_tokens_details.cache_write_tokens }
              : {}),
            ...(usage.output_tokens_details?.reasoning_tokens !== undefined
              ? { reasoningTokens: usage.output_tokens_details.reasoning_tokens }
              : {}),
          };
          yield usageChunk;
        }
        if (ev.response.error) {
          emitted.error = true;
          yield {
            type: 'error',
            message: ev.response.error.message ?? 'Response failed',
            ...(ev.response.error.code ? { code: ev.response.error.code } : {}),
          };
          yield { type: 'stop', reason: 'error' };
          stopEmitted = true;
          emitDiagnostics(event.type, ev.response);
          break;
        }
        if (emitted.functionCall) {
          yield { type: 'stop', reason: 'tool_use' };
          stopEmitted = true;
          emitDiagnostics(event.type, ev.response);
          break;
        }
        if (!emitted.text && !emitted.serverTool) {
          emitted.error = true;
          yield {
            type: 'error',
            code: 'empty_response',
            message: 'OpenAI response completed without text or tool output.',
          };
          yield { type: 'stop', reason: 'error' };
          stopEmitted = true;
          emitDiagnostics(event.type, ev.response);
          break;
        }
        const reason = ev.response.incomplete_details?.reason;
        yield { type: 'stop', reason: mapIncompleteReason(reason) };
        stopEmitted = true;
        emitDiagnostics(event.type, ev.response);
        break;
      }
      case 'response.incomplete': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.incomplete' }>;
        for (const searchResult of flushWebSearchResults()) {
          emitted.serverTool = true;
          yield searchResult;
        }
        yield {
          type: 'stop',
          reason: mapIncompleteReason(ev.response.incomplete_details?.reason),
        };
        stopEmitted = true;
        emitDiagnostics(event.type);
        break;
      }
      case 'response.failed': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'response.failed' }>;
        for (const searchResult of flushWebSearchResults()) {
          emitted.serverTool = true;
          yield searchResult;
        }
        emitted.error = true;
        yield {
          type: 'error',
          message: ev.response.error?.message ?? 'Response failed',
          ...(ev.response.error?.code ? { code: ev.response.error.code } : {}),
        };
        yield { type: 'stop', reason: 'error' };
        stopEmitted = true;
        emitDiagnostics(event.type);
        break;
      }
      case 'error':
      case 'response.error': {
        const ev = event as Extract<ResponsesStreamEvent, { type: 'error' | 'response.error' }>;
        for (const searchResult of flushWebSearchResults()) {
          emitted.serverTool = true;
          yield searchResult;
        }
        emitted.error = true;
        yield {
          type: 'error',
          message: ev.message ?? 'Response error',
          ...(ev.code ? { code: ev.code } : {}),
        };
        yield { type: 'stop', reason: 'error' };
        stopEmitted = true;
        emitDiagnostics(event.type);
        break;
      }
      // Ignore other event variants (queued, in_progress, content_part.*, etc.).
    }
  }

  if (!stopEmitted) {
    for (const searchResult of flushWebSearchResults()) {
      emitted.serverTool = true;
      yield searchResult;
    }
    emitted.error = true;
    yield {
      type: 'error',
      code: 'incomplete_stream',
      message: 'OpenAI response stream ended without a terminal event.',
    };
    yield { type: 'stop', reason: 'error' };
    emitDiagnostics('stream.exhausted');
  }
}
