export const SECRET_REDACTION_COUNT_HEADER = 'X-AGI-Secret-Redaction-Count';

const MAX_SECRET_REDACTION_HEADER_VALUE = 999;

export function toSecretRedactionCountHeaderValue(count: number | undefined): string | null {
  if (!count || !Number.isFinite(count) || count <= 0) return null;
  return String(Math.min(Math.floor(count), MAX_SECRET_REDACTION_HEADER_VALUE));
}

export function addSecretRedactionNoticeHeader(
  headers: Record<string, string>,
  source: { secretRedactionCount?: number | undefined },
): void {
  const value = toSecretRedactionCountHeaderValue(source.secretRedactionCount);
  if (value) headers[SECRET_REDACTION_COUNT_HEADER] = value;
}

export function describeSecretRedactionNotice(
  count: number | string | null | undefined,
): string | null {
  const parsed = typeof count === 'string' ? Number(count) : count;
  if (!parsed || !Number.isFinite(parsed) || parsed <= 0) return null;
  const whole = Math.floor(parsed);
  const noun = whole === 1 ? 'secret was' : 'secrets were';
  return `${whole} ${noun} removed from this message before it was sent.`;
}
