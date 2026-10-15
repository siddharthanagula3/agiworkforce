import { z } from 'zod';
import { explicitlyRefusedItems, hasExplicitWebSearchOptOut } from '@agiworkforce/search';

import { hasExplicitCodeExecutionOptOut } from '@/lib/code-execution/explicit-execution-intent';
import { isExecutionTool } from '@/lib/e2b/execution-tools';
import type { CloudChatSurface } from '@/lib/free-chat-surface-policy';
import { isUrlFetchTool } from '@/lib/url-fetch/url-fetch-tool';
import { isWebSearchTool } from '@/lib/web-search/web-search-tool';

import type { ChatCompletionRequest } from './request-processor';

const REFUSED_ALL_TOOLS_ITEM =
  /^(?:tools?(?:\s+(?:calls?|calling|use))?|tool\s+(?:calls?|calling|use)|function\s+calls?)$/u;
const REFUSED_CODE_ITEM =
  /^(?:code(?:\s+(?:execution|interpreter))?|python|javascript|scripts?|programs?|sandbox(?:es)?|interpreter|notebooks?)$/u;

const PROHIBITION_SURFACES: ReadonlySet<CloudChatSurface> = new Set<CloudChatSurface>([
  'web',
  'mobile',
  'desktop',
  'chrome',
]);

/**
 * What the user ruled out for this one turn, in their own words. It is carried
 * from the request flags through the catalog to dispatch, because a refusal the
 * prompt alone repeats is one a forced tool choice, a retry or a server-owned
 * fallback can still override.
 *
 * Search mode chosen for the turn outranks a typed refusal of search, as the
 * required-search contract already decides, so it also lifts the all-tools
 * refusal except for code.
 */
export type TurnToolProhibition = {
  readonly allTools: boolean;
  readonly codeExecution: boolean;
  readonly webSearch: boolean;
};

export const TurnToolProhibitionSchema = z
  .object({ allTools: z.boolean(), codeExecution: z.boolean(), webSearch: z.boolean() })
  .strict();

/**
 * A resumed turn is the same turn, but the last user-role message it is
 * rebuilt from can be a steer, approval guidance or a search-retry directive
 * the loop appended, which carries none of the refusal. The refusal recorded
 * when the turn began is therefore kept alongside whatever the new text adds.
 */
export function mergeTurnToolProhibitions(
  current: TurnToolProhibition | null,
  recorded: TurnToolProhibition | null | undefined,
): TurnToolProhibition | null {
  if (!recorded) return current;
  if (!current) return recorded;
  return {
    allTools: current.allTools || recorded.allTools,
    codeExecution: current.codeExecution || recorded.codeExecution,
    webSearch: current.webSearch || recorded.webSearch,
  };
}

export function resolveTurnToolProhibition(
  text: string,
  context: { surface: CloudChatSurface; searchRequested: boolean },
): TurnToolProhibition | null {
  if (!text || !PROHIBITION_SURFACES.has(context.surface)) return null;
  const refusedItems = explicitlyRefusedItems(text);
  const toolsRefused = refusedItems.some((item) => REFUSED_ALL_TOOLS_ITEM.test(item));
  const codeExecution =
    toolsRefused ||
    hasExplicitCodeExecutionOptOut(text) ||
    refusedItems.some((item) => REFUSED_CODE_ITEM.test(item));
  const allTools = toolsRefused && !context.searchRequested;
  const webSearch = !context.searchRequested && (toolsRefused || hasExplicitWebSearchOptOut(text));
  return allTools || codeExecution || webSearch ? { allTools, codeExecution, webSearch } : null;
}

export function applyTurnToolProhibition(
  request: ChatCompletionRequest,
  prohibition: TurnToolProhibition | null,
): void {
  if (!prohibition) return;
  if (prohibition.webSearch) {
    request.web_search = false;
    request.web_fetch = false;
  }
  if (prohibition.codeExecution) request.code_execution = false;
  if (prohibition.allTools) {
    request.office_creation = false;
    request.connector_tools_enabled = false;
  }
}

export function turnProhibitsTool(
  prohibition: TurnToolProhibition | null | undefined,
  qualifiedName: string,
): boolean {
  if (!prohibition) return false;
  if (isWebSearchTool(qualifiedName) || isUrlFetchTool(qualifiedName)) {
    return prohibition.webSearch;
  }
  if (isExecutionTool(qualifiedName)) return prohibition.codeExecution;
  return prohibition.allTools;
}

export function prohibitedToolResultMessage(qualifiedName: string): string {
  return (
    `Tool "${qualifiedName}" was not run: the user asked not to use it on this turn. ` +
    'Do not retry it or work around it; answer without it.'
  );
}
