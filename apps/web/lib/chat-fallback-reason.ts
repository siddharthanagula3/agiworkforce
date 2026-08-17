export const FALLBACK_REASON_HEADER = 'X-AGI-Fallback-Reason';

export const FALLBACK_REASON_CODES = [
  'managed_failover',
  'openrouter_route_failover',
  'insufficient_credits',
] as const;

export type FallbackReasonCode = (typeof FALLBACK_REASON_CODES)[number];

export function toFallbackReasonHeaderValue(source: {
  usedFallback?: boolean;
  fallbackReason?: string | undefined;
}): string | null {
  if (!source.usedFallback) return null;
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
    default:
      return servedBy
        ? `This reply came from ${servedBy} instead of the model you picked.`
        : 'This reply came from a different model than the one you picked.';
  }
}
