import { getProviderOffering } from '@agiworkforce/types';
import { hasExplicitWebFetchIntent, hasExplicitWebSearchIntent } from '@agiworkforce/search';
import { hasExplicitCodeExecutionIntent } from '@/lib/code-execution/explicit-execution-intent';

export type PromotionalChatToolConflict = 'web_search' | 'code_execution' | 'tools';

export function promotionalChatToolConflict(
  id: string | null | undefined,
  draft: string,
  requested: {
    webSearchEnabled?: boolean;
    codeExecutionEnabled?: boolean;
    needsTools?: boolean;
  } = {},
): PromotionalChatToolConflict | null {
  if (freeQuotaSelection(id)?.quotaProbeProtocol !== 'chat') return null;
  if (
    requested.webSearchEnabled ||
    hasExplicitWebSearchIntent(draft) ||
    hasExplicitWebFetchIntent(draft)
  )
    return 'web_search';
  if (requested.codeExecutionEnabled || hasExplicitCodeExecutionIntent(draft))
    return 'code_execution';
  if (requested.needsTools) return 'tools';
  return null;
}

export function freeQuotaSelection(id: string | null | undefined) {
  if (!id) return null;
  const offering = getProviderOffering(id);
  return offering?.identityStatus === 'exact' && offering.quotaProbeProtocol ? offering : null;
}

export function chatCompletionEndpoint(model: string): string {
  // An offering key must never reach normal paid routing, including after deployment.
  const offering = getProviderOffering(model);
  if (offering?.provider === 'experientiallabs') {
    return '/api/models/experiential-free/completions';
  }
  return offering ? '/api/models/free-quota/completions' : '/api/llm/v1/chat/completions';
}
