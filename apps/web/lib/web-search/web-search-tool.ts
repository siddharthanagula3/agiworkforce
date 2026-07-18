/**
 * web_search — platform-executed web search tool for the agentic chat loop.
 *
 * Closes the search parity gap (WP4) for providers with no working native
 * web-search server tool wired into this platform today: xai, deepseek, qwen,
 * moonshot, zhipu, mistral, groq, nvidia_nim, and open_router. OpenAI,
 * Anthropic, and Google keep their native provider-managed search tools
 * (higher quality, no extra hop, no platform search-key dependency);
 * Perplexity Sonar models search natively by default and never need this tool.
 * Everyone else gets this function tool, executed by the tool loop in
 * tool-loop.ts, exactly the way `url_fetch` (lib/url-fetch/url-fetch-tool.ts)
 * closes the equivalent fetch-parity gap — this module intentionally mirrors
 * that file's shape (pure, never-throws, structured ok:true/false outcome,
 * injectable overrides for testing).
 *
 * Backend: Perplexity's dedicated Search API
 * (`POST https://api.perplexity.ai/search`, verified against
 * docs.perplexity.ai/docs/search/quickstart 2026-07-11) — a purpose-built
 * structured-results endpoint (`results: [{title,url,snippet,date}]`),
 * distinct from Perplexity's Sonar chat-completions endpoint. Reuses
 * `PERPLEXITY_API_KEY`, already provisioned on this server for the platform's
 * own selectable Perplexity/Sonar models (see apps/web/lib/byok-providers.ts
 * and `providers.perplexity` in packages/contracts/types/src/models.json) — no new
 * vendor account or API key is required to stand this up.
 *
 * Errors are returned as structured tool results (`ok:false` + errorCode) the
 * model can react to — never thrown to the caller, never a 500.
 */

import 'server-only';

export const WEB_SEARCH_TOOL = 'web_search';

/** True if `name` is the platform web_search tool. */
export function isWebSearchTool(name: string): boolean {
  return name === WEB_SEARCH_TOOL;
}

const PERPLEXITY_SEARCH_URL = 'https://api.perplexity.ai/search';

/** Total wall-clock budget for the search request. */
export const WEB_SEARCH_TIMEOUT_MS = 15_000;
/** Results requested from Perplexity and returned to the model — capped well
 * under Perplexity's max of 20 to bound tool-result token cost. */
export const WEB_SEARCH_MAX_RESULTS = 8;
/** Maximum accepted query length. */
const MAX_QUERY_LENGTH = 400;

/** OpenAI-style function tool definition offered to tool-calling models. */
export function webSearchToolDef(): {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
} {
  return {
    type: 'function',
    function: {
      name: WEB_SEARCH_TOOL,
      description:
        'Search the web for current information. Use for recent events, facts you are ' +
        'not confident about, or anything that may have changed since your training data. ' +
        'Returns a list of web results with titles, URLs, and snippets — follow up with ' +
        'url_fetch on a specific result if you need the full page content.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query.',
          },
        },
        required: ['query'],
      },
    },
  };
}

export interface WebSearchResultItem {
  url: string;
  title: string;
  snippet: string;
  /** ISO date string when Perplexity attaches one; omitted otherwise. */
  date?: string;
}

export type WebSearchErrorCode =
  | 'invalid_tool_input'
  | 'not_configured'
  | 'upstream_error'
  | 'timeout';

export type WebSearchOutcome =
  | { ok: true; query: string; results: WebSearchResultItem[] }
  | { ok: false; errorCode: WebSearchErrorCode; error: string };

export interface WebSearchOverrides {
  /** Injected fetch (tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected API key (tests). Defaults to process.env.PERPLEXITY_API_KEY. */
  apiKey?: string;
  timeoutMs?: number;
  maxResults?: number;
}

function err(errorCode: WebSearchErrorCode, error: string): WebSearchOutcome {
  return { ok: false, errorCode, error };
}

/**
 * True when a web-search backend is configured on this server. Callers
 * (request-processor.ts's tool-offering gate) use this to decide whether to
 * offer `web_search` at all — never light a toggle/offer a tool the server
 * cannot actually execute.
 */
export function webSearchBackendConfigured(overrides: { apiKey?: string } = {}): boolean {
  return Boolean(overrides.apiKey ?? process.env['PERPLEXITY_API_KEY']);
}

interface PerplexitySearchResultWire {
  title?: unknown;
  url?: unknown;
  snippet?: unknown;
  date?: unknown;
}

interface PerplexitySearchResponseWire {
  results?: unknown;
}

/**
 * Execute a web_search tool call against Perplexity's Search API. Never
 * throws — every failure mode returns a structured `ok:false` outcome the
 * model can react to.
 */
export async function executeWebSearch(
  args: Record<string, unknown>,
  overrides: WebSearchOverrides = {},
): Promise<WebSearchOutcome> {
  const rawQuery = args['query'];
  if (typeof rawQuery !== 'string' || rawQuery.trim().length === 0) {
    return err('invalid_tool_input', 'web_search requires a non-empty string "query" argument.');
  }
  const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);

  const apiKey = overrides.apiKey ?? process.env['PERPLEXITY_API_KEY'];
  if (!apiKey) {
    return err(
      'not_configured',
      'Web search is not configured on this server (missing PERPLEXITY_API_KEY).',
    );
  }

  const fetchImpl = overrides.fetchImpl ?? fetch;
  const timeoutMs = overrides.timeoutMs ?? WEB_SEARCH_TIMEOUT_MS;
  const maxResults = overrides.maxResults ?? WEB_SEARCH_MAX_RESULTS;

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetchImpl(PERPLEXITY_SEARCH_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, max_results: maxResults }),
      });
    } catch (fetchErr) {
      if (controller.signal.aborted) {
        return err('timeout', `Web search timed out after ${timeoutMs}ms.`);
      }
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      return err('upstream_error', `Web search request failed: ${msg}`);
    }

    if (!response.ok) {
      let bodyText = '';
      try {
        bodyText = (await response.text()).slice(0, 500);
      } catch {
        // best-effort diagnostic only
      }
      return err(
        'upstream_error',
        `Perplexity Search API returned HTTP ${response.status}${bodyText ? `: ${bodyText}` : ''}.`,
      );
    }

    let parsed: PerplexitySearchResponseWire;
    try {
      parsed = (await response.json()) as PerplexitySearchResponseWire;
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      return err('upstream_error', `Failed to parse Perplexity Search API response: ${msg}`);
    }

    const rawResults = Array.isArray(parsed.results)
      ? (parsed.results as PerplexitySearchResultWire[])
      : [];
    const results: WebSearchResultItem[] = [];
    for (const r of rawResults) {
      if (typeof r?.url !== 'string' || r.url.length === 0) continue;
      const title = typeof r.title === 'string' && r.title.length > 0 ? r.title : r.url;
      const snippet = typeof r.snippet === 'string' ? r.snippet : '';
      const date = typeof r.date === 'string' ? r.date : undefined;
      results.push({ url: r.url, title, snippet, ...(date ? { date } : {}) });
    }

    return { ok: true, query, results };
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * Format a WebSearchOutcome into the plain-text tool-result content sent
 * back to the model — kept here (not in tool-loop.ts) so the eventual
 * tool-loop.ts wiring is just "call executeWebSearch, call this, done",
 * minimizing the diff footprint in that shared/high-traffic file.
 */
export function formatWebSearchResultForModel(outcome: WebSearchOutcome): string {
  if (!outcome.ok) {
    return `Search failed (${outcome.errorCode}): ${outcome.error}`;
  }
  if (outcome.results.length === 0) {
    return `No results found for "${outcome.query}".`;
  }
  const lines = outcome.results.map((r, i) => {
    const datePart = r.date ? ` (${r.date})` : '';
    const snippetPart = r.snippet ? `\n   ${r.snippet}` : '';
    return `${i + 1}. ${r.title}${datePart}\n   ${r.url}${snippetPart}`;
  });
  return `Search results for "${outcome.query}":\n\n${lines.join('\n\n')}`;
}

/**
 * Map a successful outcome's results into a `{url, title, snippet}` list
 * structurally compatible with tool-loop.ts's `FetchedSource` (widened to
 * carry an optional `snippet`). Deliberately NOT importing `FetchedSource`
 * from tool-loop.ts here — that would be a circular import (tool-loop.ts
 * imports from this module). tool-loop.ts's web_search dispatch pushes these
 * into its OWN cumulative sources array and emits them via its
 * `searchResultsEvent` — the research-loop.ts `SourceAggregator` shape (NO
 * `tool` field, snippet mapped to `encrypted_content`), NOT `fetchSourcesEvent`
 * (which hardcodes `tool:'url_fetch'` and has no snippet concept — a fetched
 * page has no separate snippet, it IS the content).
 */
export function webSearchResultsToFetchedSources(
  outcome: WebSearchOutcome,
): Array<{ url: string; title: string; snippet?: string }> {
  if (!outcome.ok) return [];
  return outcome.results.map((r) => ({
    url: r.url,
    title: r.title,
    ...(r.snippet ? { snippet: r.snippet } : {}),
  }));
}
