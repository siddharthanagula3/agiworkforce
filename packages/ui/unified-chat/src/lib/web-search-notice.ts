export type WebSearchNotice = 'no-results' | 'not-invoked' | 'memory-grounded';

export interface WebSearchNoticeTurn {
  isUser: boolean;
  streaming: boolean;
  awaitingApproval: boolean;
  webSearchRequested: boolean;
  webSearchAskedInText: boolean;
  producedNoVisibleOutput: boolean;
  rendersResearchPlan: boolean;
  hasStreamError: boolean;
  declinedSearch?: boolean;
  webSearchUnavailable: boolean;
  toolAwaitingApproval: boolean;
  attemptedSearch: boolean;
  ranAnyTool: boolean;
  memoryCitationCount: number;
  sourceCount: number;
}

export function webSearchNoticeFor(turn: WebSearchNoticeTurn): WebSearchNotice | null {
  if (turn.isUser || turn.streaming || turn.awaitingApproval) return null;
  if (!turn.webSearchRequested) return null;
  if (turn.producedNoVisibleOutput) return null;
  if (turn.rendersResearchPlan) return null;
  if (turn.hasStreamError) return null;
  if (turn.declinedSearch) return null;
  if (!turn.webSearchAskedInText) return null;
  if (turn.webSearchUnavailable) return null;
  if (turn.toolAwaitingApproval) return null;
  if (!turn.attemptedSearch) {
    if (turn.ranAnyTool) return null;
    return turn.memoryCitationCount > 0 ? 'memory-grounded' : 'not-invoked';
  }
  return turn.sourceCount > 0 ? null : 'no-results';
}

export interface SearchActivityEntry {
  readonly kind: string;
  readonly category?: unknown;
  readonly approval?: { readonly decision?: unknown };
}

export interface SearchActivity {
  readonly entries: readonly SearchActivityEntry[];
}

const SEARCH_TOOL_NAME = /web_search|url_fetch|grounding/i;

function isSearchStep(entry: SearchActivityEntry): boolean {
  return (
    entry.kind === 'tool' && (entry.category === 'web-search' || entry.category === 'web-fetch')
  );
}

export function turnAttemptedSearch(
  activity: SearchActivity | null | undefined,
  toolNames: readonly string[] | undefined,
): boolean {
  if (activity?.entries.some(isSearchStep)) return true;
  if (activity?.entries.some((entry) => entry.kind === 'sources')) return true;
  return toolNames?.some((name) => SEARCH_TOOL_NAME.test(name)) ?? false;
}

export function turnRanAnyTool(
  activity: SearchActivity | null | undefined,
  toolNames: readonly string[] | undefined,
): boolean {
  if (activity?.entries.some((entry) => entry.kind === 'tool')) return true;
  return (toolNames?.length ?? 0) > 0;
}

export function turnDeclinedSearch(activity: SearchActivity | null | undefined): boolean {
  const searches = activity?.entries.filter(isSearchStep) ?? [];
  return searches.length > 0 && searches.every((entry) => entry.approval?.decision === 'denied');
}
