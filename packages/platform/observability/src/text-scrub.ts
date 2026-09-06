const REDACTED_TEXT = '[redacted]';
const MAX_SCRUBBED_TEXT_LENGTH = 256;
const TRUNCATION_SUFFIX = '…';

const TEXT_SCRUB_PATTERNS: readonly RegExp[] = [
  /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,24}/gu,
  /\bhttps?:\/\/[^\s'")]{1,2048}/giu,
  /(?:\/[\w.-]{1,255}){2,64}/gu,
  /\b(?:bearer|basic)\s{1,8}[A-Za-z0-9._~+/=-]{8,512}/giu,
  /\beyJ[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{4,1024}/gu,
  /\b[A-Za-z0-9_-]{0,64}(?:secret|token|password)[A-Za-z0-9_-]{0,64}[-_][A-Za-z0-9_-]{8,256}\b/giu,
  /\b(?:sk|pk|rk|whsec)[-_][A-Za-z0-9_-]{12,256}\b/gu,
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
