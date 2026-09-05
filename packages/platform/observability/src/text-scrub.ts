const REDACTED_TEXT = '[redacted]';
const MAX_SCRUBBED_TEXT_LENGTH = 256;
const TRUNCATION_SUFFIX = '…';

const TEXT_SCRUB_PATTERNS: readonly RegExp[] = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu,
  /\bhttps?:\/\/[^\s'")]+/giu,
  /(?:\/[\w.-]+){2,}/gu,
  /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/giu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/gu,
  /\b[A-Za-z0-9_-]*(?:secret|token|password)[A-Za-z0-9_-]*[-_][A-Za-z0-9_-]{8,}\b/giu,
  /\b(?:sk|pk|rk|whsec)[-_][A-Za-z0-9_-]{12,}\b/gu,
];

export function scrubText(value: string): string {
  let scrubbed = value;
  for (const pattern of TEXT_SCRUB_PATTERNS) {
    pattern.lastIndex = 0;
    scrubbed = scrubbed.replace(pattern, REDACTED_TEXT);
  }
  return scrubbed.length > MAX_SCRUBBED_TEXT_LENGTH
    ? `${scrubbed.slice(0, MAX_SCRUBBED_TEXT_LENGTH)}${TRUNCATION_SUFFIX}`
    : scrubbed;
}

export type ScrubbedAttributeValue = string | number | boolean;

export function scrubAttributes(
  attributes: Readonly<Record<string, unknown>>,
): Record<string, ScrubbedAttributeValue> {
  const out: Record<string, ScrubbedAttributeValue> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      out[key] = scrubText(value);
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) out[key] = value;
    } else if (typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}
