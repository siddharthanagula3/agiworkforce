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

/**
 * The code emitted when a substitution is known to have happened but nothing
 * named a cause. Without it an unlabelled fallback carried no header at all,
 * which is the silent substitution the disclosure exists to prevent.
 */
export const UNSPECIFIED_SUBSTITUTION_REASON = 'model_substituted';

export const FALLBACK_REASON_CODES = [
  'managed_failover',
  'openrouter_route_failover',
  'insufficient_credits',
  'research_unsupported_model',
  UNSPECIFIED_SUBSTITUTION_REASON,
] as const;

export type FallbackReasonCode = (typeof FALLBACK_REASON_CODES)[number];

export interface FallbackReasonSource {
  usedFallback?: boolean;
  fallbackReason?: string | undefined;
  /** The model id the caller asked for, when the caller knows it. */
  requestedModel?: string | null | undefined;
  /** The model id that actually served the turn. */
  servedModel?: string | null | undefined;
}

/**
 * True when the turn ran on something other than what the user picked. A served
 * model that differs from the requested one is a substitution on its own terms,
 * whether or not any layer bothered to set `usedFallback`.
 */
export function isSubstitution(source: FallbackReasonSource): boolean {
  if (source.usedFallback) return true;
  const requested = source.requestedModel?.trim();
  const served = source.servedModel?.trim();
  return Boolean(requested && served && requested !== served);
}

export function toFallbackReasonHeaderValue(source: FallbackReasonSource): string | null {
  // A downgrade is worth reporting even when the model itself did not change:
  // the request the user asked for is not the request that ran.
  if (!isSubstitution(source) && source.fallbackReason !== 'research_unsupported_model') {
    return null;
  }
  const raw = source.fallbackReason?.trim() || UNSPECIFIED_SUBSTITUTION_REASON;
  const safe = raw.replace(/[^\w.:-]/g, '_').slice(0, 120);
  return safe.length > 0 ? safe : UNSPECIFIED_SUBSTITUTION_REASON;
}

export function addFallbackReasonHeader(
  headers: Record<string, string>,
  source: FallbackReasonSource,
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
    case UNSPECIFIED_SUBSTITUTION_REASON:
      return servedBy
        ? `This reply came from ${servedBy}, not the model you picked. The reason was not recorded.`
        : 'This reply came from a different model than the one you picked. The reason was not recorded.';
    default:
      return servedBy
        ? `This reply came from ${servedBy} instead of the model you picked.`
        : 'This reply came from a different model than the one you picked.';
  }
}

export function fallbackStepLabel(
  reason: string | null | undefined,
  modelLabel?: string | null,
): string | null {
  const code = reason?.trim();
  if (!code) return null;
  const servedBy = modelLabel?.trim();
  switch (code) {
    case 'openrouter_route_failover':
      return servedBy ? `Switched to a backup route for ${servedBy}` : 'Switched to a backup route';
    case 'insufficient_credits':
      return servedBy ? `Switched to ${servedBy}` : 'Switched to a cheaper model';
    case 'research_unsupported_model':
      return 'Switched to web search';
    case UNSPECIFIED_SUBSTITUTION_REASON:
      return servedBy ? `Switched to ${servedBy}` : 'Switched to a different model';
    case 'managed_failover':
    default:
      return servedBy ? `Switched to ${servedBy}` : 'Switched to a backup model';
  }
}
