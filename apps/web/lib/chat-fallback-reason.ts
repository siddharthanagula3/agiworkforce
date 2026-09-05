export const FALLBACK_REASON_HEADER = 'X-AGI-Fallback-Reason';

/**
 * D-2026-09-05-06. Auto left the conversation's model on a failure signal. The
 * pair is a receipt about Auto's own continuity, distinct from the substitution
 * notice above, which is about the model the user picked.
 */
export const MOVED_FROM_MODEL_HEADER = 'X-AGI-Moved-From-Model';
export const MOVED_REASON_HEADER = 'X-AGI-Moved-Reason';

export function addModelEscalationHeaders(
  headers: Record<string, string>,
  source: { movedFromModel?: string | null; movedReason?: string | null },
): void {
  const movedFrom = source.movedFromModel?.trim();
  if (!movedFrom) return;
  headers[MOVED_FROM_MODEL_HEADER] = movedFrom.replace(/[^\w.:/-]/g, '_').slice(0, 120);
  const reason = source.movedReason?.trim();
  if (reason) headers[MOVED_REASON_HEADER] = reason.replace(/[^\w .,:/-]/g, '_').slice(0, 200);
}

export const FALLBACK_REASON_CODES = [
  'managed_failover',
  'openrouter_route_failover',
  'insufficient_credits',
  'research_unsupported_model',
] as const;

export type FallbackReasonCode = (typeof FALLBACK_REASON_CODES)[number];

export function toFallbackReasonHeaderValue(source: {
  usedFallback?: boolean;
  fallbackReason?: string | undefined;
}): string | null {
  // A downgrade is worth reporting even when the model itself did not change:
  // the request the user asked for is not the request that ran.
  if (!source.usedFallback && source.fallbackReason !== 'research_unsupported_model') return null;
  const raw = source.fallbackReason?.trim();
  if (!raw) return null;
  const safe = raw.replace(/[^\w.:-]/g, '_').slice(0, 120);
  return safe.length > 0 ? safe : null;
}

export function addFallbackReasonHeader(
  headers: Record<string, string>,
  source: { usedFallback?: boolean; fallbackReason?: string | undefined },
): void {
  const value = toFallbackReasonHeaderValue(source);
  if (value) headers[FALLBACK_REASON_HEADER] = value;
}

export function describeFallbackReason(
  reason: string | null | undefined,
  modelLabel?: string | null,
): string | null {
  const code = reason?.trim();
  if (!code) return null;
  const servedBy = modelLabel?.trim();
  switch (code) {
    case 'managed_failover':
      return servedBy
        ? `The model you picked was unavailable, so this reply came from ${servedBy}.`
        : 'The model you picked was unavailable, so a backup model answered.';
    case 'openrouter_route_failover':
      return servedBy
        ? `The direct route to ${servedBy} failed, so this reply was served through a backup route.`
        : 'The direct route to that model failed, so this reply was served through a backup route.';
    case 'insufficient_credits':
      return servedBy
        ? `You were out of credits for the model you picked, so this reply used ${servedBy}.`
        : 'You were out of credits for the model you picked, so a cheaper model answered.';
    case 'research_unsupported_model':
      return servedBy
        ? `${servedBy} cannot run Deep Research, so this reply used web search instead. No research report was saved.`
        : 'This model cannot run Deep Research, so this reply used web search instead. No research report was saved.';
    default:
      return servedBy
        ? `This reply came from ${servedBy} instead of the model you picked.`
        : 'This reply came from a different model than the one you picked.';
  }
}
