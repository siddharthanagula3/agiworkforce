import { getProviderOffering } from '@agiworkforce/types';

export function freeQuotaSelection(id: string | null | undefined) {
  if (!id) return null;
  const offering = getProviderOffering(id);
  return offering?.identityStatus === 'exact' && offering.quotaProbeProtocol ? offering : null;
}

export function chatCompletionEndpoint(model: string): string {
  // An offering key must never reach normal paid routing, including after deployment.
  return getProviderOffering(model)
    ? '/api/models/free-quota/completions'
    : '/api/llm/v1/chat/completions';
}
