/**
 * @file The sources a turn cited, collected from the wire it already emitted.
 *
 * Citations were written to the database by the client alone, after the stream
 * ended, by `saveMessageToDb`. Its failure handler is `console.error`. A
 * non-retryable failure therefore left an answer whose text survived a reload
 * while every source chip vanished, with nothing anywhere saying so, which is
 * the part of an answer a reader most needs in order to trust it.
 *
 * The server already has the evidence: it emits the `x_search_results` frames
 * the client builds those chips from. Collecting them here costs one pass over
 * frames that are being produced anyway, and the result is written by the same
 * snapshot that already persists the text.
 *
 * This deliberately does NOT reimplement the client's derivation. The client
 * merges results into research state, upserts a tool timeline and tracks
 * per-tool status; none of that is reproduced. What is reproduced is the flat
 * list of cited pages, in the `SearchResult[]` shape the metadata field already
 * accepts, so a reload after a failed client save shows the sources rather than
 * nothing. The client's own write still lands on top when it succeeds.
 */

export interface PersistedTurnSource {
  url: string;
  title: string;
  snippet: string;
}

/**
 * One page the model cited, in the order it cited them, which is the order the
 * `[n]` markers in the answer count in.
 */
export interface PersistedTurnCitation {
  type: typeof URL_CITATION_TYPE;
  url: string;
  title: string;
}

/** Enough to cite an answer, bounded so one turn cannot bloat a row. */
export const MAX_PERSISTED_TURN_SOURCES = 20;
const MAX_SNIPPET_CHARS = 500;
const WEB_SEARCH_RESULT_TYPE = 'web_search_result';
const URL_CITATION_TYPE = 'url_citation';
const CITATION_DELTA_KEY = 'x_citation';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

/**
 * The `x_search_results` payload from one wire frame, if it carries one.
 *
 * Both shapes the assembler emits are accepted: a provider's
 * `web_search_tool_result` content array, and the flattened list it builds for
 * Google's grounding results. An error payload is an object rather than an
 * array and falls through to nothing, which is correct: a failed search cites
 * no pages.
 */
function readSearchResultContent(event: unknown): Record<string, unknown>[] {
  const envelope = asRecord(event);
  const choices = envelope?.['choices'];
  if (!Array.isArray(choices)) return [];
  const delta = asRecord(asRecord(choices[0])?.['delta']);
  const block = asRecord(delta?.['x_search_results']);
  const content = block?.['content'];
  if (!Array.isArray(content)) return [];
  return content.flatMap((entry) => {
    const record = asRecord(entry);
    return record ? [record] : [];
  });
}

/**
 * Accumulates the pages one turn cited, in the order they were first seen.
 *
 * Deduplicated by URL because a provider can ground several times over the same
 * page within a turn, and a citation list that repeats a source reads as
 * padding.
 */
export class AssistantTurnSourceCollector {
  private readonly byUrl = new Map<string, PersistedTurnSource>();
  private readonly citationsByUrl = new Map<string, PersistedTurnCitation>();

  ingestWireBytes(value: Uint8Array): void {
    for (const rawLine of new TextDecoder().decode(value).split('\n')) {
      const line = rawLine.trim();
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      try {
        this.ingestWireEvent(JSON.parse(line.slice(6)));
      } catch {
        /* a non-JSON SSE line carries no sources */
      }
    }
  }

  ingestWireEvent(event: unknown): void {
    this.ingestCitation(event);
    if (this.byUrl.size >= MAX_PERSISTED_TURN_SOURCES) return;
    for (const result of readSearchResultContent(event)) {
      if (this.byUrl.size >= MAX_PERSISTED_TURN_SOURCES) return;
      if (result['type'] !== WEB_SEARCH_RESULT_TYPE) continue;
      const url = readString(result, 'url');
      if (!url || this.byUrl.has(url)) continue;
      this.byUrl.set(url, {
        url,
        title: readString(result, 'title') || url,
        snippet: readString(result, 'encrypted_content').slice(0, MAX_SNIPPET_CHARS),
      });
    }
  }

  /**
   * The pages the model actually cited are a different list from the pages the
   * provider searched, and on a native-search turn they only partly overlap.
   * Collecting only the searched list left a reloaded answer whose `[n]`
   * markers pointed at outlets the row never recorded.
   */
  private ingestCitation(event: unknown): void {
    if (this.citationsByUrl.size >= MAX_PERSISTED_TURN_SOURCES) return;
    const envelope = asRecord(event);
    const choices = envelope?.['choices'];
    if (!Array.isArray(choices)) return;
    for (const choice of choices) {
      const citation = asRecord(asRecord(choice)?.['delta'])?.[CITATION_DELTA_KEY];
      const record = asRecord(citation);
      if (!record) continue;
      const url = readString(record, 'url');
      const title = readString(record, 'title');
      if (!url || !title || this.citationsByUrl.has(url)) continue;
      this.citationsByUrl.set(url, { type: URL_CITATION_TYPE, url, title });
      if (this.citationsByUrl.size >= MAX_PERSISTED_TURN_SOURCES) return;
    }
  }

  /** The collected sources, or undefined when the turn cited none. */
  snapshot(): readonly PersistedTurnSource[] | undefined {
    return this.byUrl.size > 0 ? [...this.byUrl.values()] : undefined;
  }

  /** The cited pages in marker order, or undefined when the turn cited none. */
  citationSnapshot(): readonly PersistedTurnCitation[] | undefined {
    return this.citationsByUrl.size > 0 ? [...this.citationsByUrl.values()] : undefined;
  }
}
