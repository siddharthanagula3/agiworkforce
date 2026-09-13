import { normalizeSourceUrlKey } from '@/lib/web-search/source-url-key';

/**
 * What a turn already spent and already delivered, read back from its own
 * messages.
 *
 * A turn that stops for a tool approval finishes in a different HTTP request
 * from the one it started in, and every counter in the tool loop is a local of
 * that request. Left alone the resumed request starts its search budget at
 * zero and numbers its first source `[1]` again, while the browser keeps
 * appending to the list it already has. Measured on 2026-09-13: one ordinary
 * question ran five requests, delivered thirty sources against a three-search
 * budget, and every `[n]` in the answer named a different page than the one it
 * opened.
 *
 * The resume already carries the checkpoint's trusted messages, and a tool
 * result is only in them once that call actually ran, so they are the honest
 * record of what the turn has spent. Only the current turn counts: everything
 * up to and including the last user message belongs to earlier turns.
 */
export interface TurnMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

export interface TurnToolHistory {
  /** Web search calls whose result is already in the transcript. */
  searchCalls: number;
  /** URL fetches whose result is already in the transcript. */
  fetchCalls: number;
  /** Every source URL already delivered, in the order it was delivered. */
  deliveredUrls: string[];
}

/**
 * A search result is written as `n. title`, then the URL alone on its own
 * indented line, then the snippet. Matching that line rather than every URL in
 * the text is what keeps a link quoted inside a snippet out of the ledger.
 */
const SEARCH_RESULT_URL_LINE = /^[ \t]+(https?:\/\/\S+)[ \t]*$/gm;
/** A fetched page announces itself once, before the page's own content. */
const FETCHED_PAGE_URL = /(?:^|\n)Fetched (https?:\/\/\S+)/;

function toolCallNames(messages: readonly TurnMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.tool_calls)) continue;
    for (const raw of message.tool_calls) {
      if (!raw || typeof raw !== 'object') continue;
      const call = raw as { id?: unknown; function?: { name?: unknown } };
      const id = typeof call.id === 'string' ? call.id : '';
      const name = typeof call.function?.name === 'string' ? call.function.name : '';
      if (id && name) names.set(id, name);
    }
  }
  return names;
}

function currentTurn(messages: readonly TurnMessage[]): TurnMessage[] {
  let start = 0;
  messages.forEach((message, index) => {
    if (message.role === 'user') start = index + 1;
  });
  return messages.slice(start);
}

export function readTurnToolHistory(
  messages: readonly TurnMessage[],
  isSearchTool: (name: string) => boolean,
  isFetchTool: (name: string) => boolean,
): TurnToolHistory {
  const turn = currentTurn(messages);
  const names = toolCallNames(turn);
  const history: TurnToolHistory = { searchCalls: 0, fetchCalls: 0, deliveredUrls: [] };
  const seen = new Set<string>();

  for (const message of turn) {
    if (message.role !== 'tool' || typeof message.tool_call_id !== 'string') continue;
    const name = names.get(message.tool_call_id);
    if (!name) continue;
    const search = isSearchTool(name);
    const fetch = isFetchTool(name);
    if (!search && !fetch) continue;
    if (search) history.searchCalls += 1;
    else history.fetchCalls += 1;
    const urls = search
      ? [...message.content.matchAll(SEARCH_RESULT_URL_LINE)].map(([, url]) => url as string)
      : [FETCHED_PAGE_URL.exec(message.content)?.[1]].filter(
          (url): url is string => url !== undefined,
        );
    for (const url of urls) {
      const key = normalizeSourceUrlKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      history.deliveredUrls.push(url);
    }
  }

  return history;
}
