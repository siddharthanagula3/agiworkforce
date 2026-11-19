import { WEB_SEARCH_CITATION_KIND, type AgentEventSource } from '@agiworkforce/types';
import { normalizeSourceUrlKey } from '@agiworkforce/utils/source-url';
import { collectTurnCitations } from '@agiworkforce/unified-chat/turn-citations';
import {
  collectMessageResearchSources,
  dedupeResearchSources,
  type MessageResearchSource,
  type MessageSearchResult,
  type MessageSearchResults,
} from '@agiworkforce/unified-chat/message-sources';
import type { ChatMessage, ToolCall } from '@/types/chat';
import { readAgentActivityState } from './agentActivityState';

export interface MessageSource extends AgentEventSource {
  publishedDate?: string;
  retrievedAt?: string;
}

export interface NativeCitation {
  url: string;
  title: string;
  citedText?: string;
}

export interface TurnSourceMetadata {
  searchResults?: MessageSource[];
  citations?: Array<{ type: typeof WEB_SEARCH_CITATION_KIND; url: string; title: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function sourceKey(url: string): string {
  return normalizeSourceUrlKey(url);
}

function plainSource(source: MessageResearchSource): MessageSource {
  return {
    url: source.url,
    title: source.title,
    ...(source.snippet ? { snippet: source.snippet } : {}),
    ...(source.publishedDate ? { publishedDate: source.publishedDate } : {}),
    ...(source.retrievedAt ? { retrievedAt: source.retrievedAt } : {}),
  };
}

function searchResultsOf(raw: unknown): MessageSearchResults | undefined {
  if (Array.isArray(raw)) return raw.filter(isRecord) as unknown as MessageSearchResult[];
  if (!isRecord(raw)) return undefined;
  const query = text(raw['query']);
  return {
    ...(query ? { query } : {}),
    results: (Array.isArray(raw['results']) ? raw['results'] : []).filter(
      isRecord,
    ) as unknown as MessageSearchResult[],
    sources: (Array.isArray(raw['sources']) ? raw['sources'] : []).flatMap((url) => {
      const trimmed = text(url);
      return trimmed ? [trimmed] : [];
    }),
  };
}

function readNativeCitation(value: unknown): NativeCitation | null {
  if (!isRecord(value)) return null;
  const url = text(value['url']);
  const title = text(value['title']);
  if (!url || !title) return null;
  const citedText = text(value['cited_text']) ?? text(value['citedText']);
  return { url, title, ...(citedText ? { citedText } : {}) };
}

export function nativeCitationFromDelta(value: unknown): NativeCitation | null {
  return readNativeCitation(value);
}

function dedupeSources(sources: readonly MessageSource[]): MessageSource[] {
  return dedupeResearchSources(sources).map(plainSource);
}

function searchedSources(raw: unknown): MessageSource[] {
  const searchResults = searchResultsOf(raw);
  if (!searchResults) return [];
  return collectMessageResearchSources({ searchResults }).searchSources.map(plainSource);
}

/**
 * The pages a model cited are numbered by its own markers, so they lead in
 * marker order and a `[n]` opens the nth cited page, as on web. Pages that
 * were searched but never cited follow, and keep their search order.
 */
export function orderTurnSources(
  searched: readonly MessageSource[],
  cited: readonly NativeCitation[],
): MessageSource[] {
  const searchedSources = dedupeSources(searched);
  if (cited.length === 0) return searchedSources;
  const searchedByKey = new Map(searchedSources.map((source) => [sourceKey(source.url), source]));
  const citedSources = dedupeSources(
    cited.map((citation) => {
      const match = searchedByKey.get(sourceKey(citation.url));
      const snippet = match?.snippet ?? citation.citedText;
      return {
        ...match,
        url: citation.url,
        title: citation.title,
        ...(snippet ? { snippet } : {}),
      };
    }),
  );
  const citedKeys = new Set(citedSources.map((source) => sourceKey(source.url)));
  return [
    ...citedSources,
    ...searchedSources.filter((source) => !citedKeys.has(sourceKey(source.url))),
  ];
}

function activitySources(raw: unknown): MessageSource[] {
  return collectTurnCitations(readAgentActivityState(raw), undefined).map((citation) => ({
    url: citation.url,
    title: citation.title ?? '',
    ...(citation.snippet ? { snippet: citation.snippet } : {}),
  }));
}

export function searchQueryFromMetadata(metadata: unknown): string | undefined {
  if (!isRecord(metadata)) return undefined;
  const raw = metadata['searchResults'];
  return isRecord(raw) ? text(raw['query']) : undefined;
}

/**
 * A turn's numbered sources as the row stored them, so a reopened chat, a chat
 * answered on another device and a provider's own search all show the same
 * list and resolve the same markers as the device that streamed the answer.
 */
export function sourcesFromPersistedMetadata(metadata: unknown): MessageSource[] {
  if (!isRecord(metadata)) return [];
  const cited = Array.isArray(metadata['citations'])
    ? metadata['citations'].flatMap((entry) => {
        const citation = readNativeCitation(entry);
        return citation ? [citation] : [];
      })
    : [];
  return withActivitySources(
    orderTurnSources(searchedSources(metadata['searchResults']), cited),
    metadata['agentActivity'],
  );
}

function withActivitySources(ordered: MessageSource[], agentActivity: unknown): MessageSource[] {
  const keys = new Set(ordered.map((source) => sourceKey(source.url)));
  for (const source of activitySources(agentActivity)) {
    const key = sourceKey(source.url);
    if (keys.has(key)) continue;
    keys.add(key);
    ordered.push(source);
  }
  return ordered;
}

export function sourcesFromToolCalls(toolCalls: readonly ToolCall[]): MessageSource[] {
  return searchedSources(toolCalls.flatMap((toolCall) => toolCall.searchResults ?? []));
}

/** What a finished turn stores, in the shape web writes and reads back. */
export function turnSourceMetadata(
  toolCalls: readonly ToolCall[],
  nativeCitations: readonly NativeCitation[],
): TurnSourceMetadata {
  const searchResults = sourcesFromToolCalls(toolCalls);
  const citations = dedupeSources(
    nativeCitations.map((citation) => ({ url: citation.url, title: citation.title })),
  ).map((citation) => ({
    type: WEB_SEARCH_CITATION_KIND,
    url: citation.url,
    title: citation.title,
  }));
  return {
    ...(searchResults.length > 0 ? { searchResults } : {}),
    ...(citations.length > 0 ? { citations } : {}),
  };
}

export function turnSources(
  toolCalls: readonly ToolCall[],
  nativeCitations: readonly NativeCitation[],
): MessageSource[] {
  return orderTurnSources(sourcesFromToolCalls(toolCalls), nativeCitations);
}

/**
 * A Cloud agent run can report its searches only as activity events, so the
 * live and finished lists add those pages after the tool and cited ones, in
 * the order a reopened row reads them back and with the same markers.
 */
export function turnSourcesWithActivity(
  toolCalls: readonly ToolCall[],
  nativeCitations: readonly NativeCitation[],
  agentActivity: unknown,
): MessageSource[] {
  return withActivitySources(turnSources(toolCalls, nativeCitations), agentActivity);
}

export function withPersistedSources(message: ChatMessage): ChatMessage {
  if (message.role !== 'assistant') return message;
  const sources = sourcesFromPersistedMetadata(message.metadata);
  return sources.length > 0 ? { ...message, citations: sources } : message;
}

export function hasPersistedSources(metadata: unknown): boolean {
  return (
    isRecord(metadata) &&
    (metadata['searchResults'] !== undefined || metadata['citations'] !== undefined)
  );
}

export function persistedSourcesForSync(
  message: Pick<ChatMessage, 'role' | 'citations' | 'metadata'>,
): MessageSource[] | undefined {
  if (message.role !== 'assistant' || hasPersistedSources(message.metadata)) return undefined;
  const sources = searchedSources(message.citations ?? []);
  return sources.length > 0 ? sources : undefined;
}
