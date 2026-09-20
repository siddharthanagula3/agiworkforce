export const PROHIBITED_MEMORY_CATEGORIES = [
  'credential',
  'payment_instrument',
  'government_identifier',
  'health',
  'biometric',
  'precise_location',
] as const;

export type ProhibitedMemoryCategory = (typeof PROHIBITED_MEMORY_CATEGORIES)[number];

export interface ProhibitedMemoryRule {
  readonly id: string;
  readonly category: ProhibitedMemoryCategory;
  matches(normalized: string): boolean;
}

function regexRule(
  id: string,
  category: ProhibitedMemoryCategory,
  pattern: RegExp,
): ProhibitedMemoryRule {
  return { id, category, matches: (normalized) => pattern.test(normalized) };
}

const DIGIT_RUN = /\d(?:[ -]?\d){12,18}/g;

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = digits.charCodeAt(index) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

function looksLikePaymentCard(normalized: string): boolean {
  for (const run of normalized.match(DIGIT_RUN) ?? []) {
    const digits = run.replace(/[^0-9]/g, '');
    if (digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)) return true;
  }
  return false;
}

const RULES: readonly ProhibitedMemoryRule[] = [
  regexRule(
    'credential.declared_secret',
    'credential',
    /\b(?:password|passcode|passphrase|pin code|api key|secret key|access token|refresh token|private key|ssh key|seed phrase|recovery phrase|recovery code|client secret)\b[^a-z0-9]{0,8}(?:is|are|=|:)?[^a-z0-9]{0,4}\S/,
  ),
  regexRule(
    'credential.opaque_token',
    'credential',
    /\b(?:token|secret|credential|authorization)\b\s*[:=]\s*[a-z0-9._-]{16,}/,
  ),
  { id: 'payment.card_number', category: 'payment_instrument', matches: looksLikePaymentCard },
  regexRule(
    'payment.named_field',
    'payment_instrument',
    /\b(?:cvv|cvc|card verification (?:code|value)|iban|swift code|routing number|sort code|bank account number)\b[^a-z0-9]{0,8}(?:is|=|:)?[^a-z0-9]{0,4}[a-z0-9]/,
  ),
  regexRule('government.ssn_shape', 'government_identifier', /\b\d{3}-\d{2}-\d{4}\b/),
  regexRule(
    'government.named_identifier',
    'government_identifier',
    /\b(?:ssn|social security number|passport number|driver'?s licen[cs]e number|national id(?:entity)? number|aadhaar(?: number)?|tax identification number|taxpayer id)\b[^a-z0-9]{0,8}(?:is|=|:)?[^a-z0-9]{0,4}[a-z0-9]/,
  ),
  regexRule(
    'health.condition_statement',
    'health',
    /\b(?:diagnosed with|prescribed|takes medication|taking medication|on medication for|blood type is|blood group is|is pregnant|hiv[- ]positive|undergoing (?:chemotherapy|dialysis|treatment for))\b/,
  ),
  regexRule(
    'biometric.identifier',
    'biometric',
    /\b(?:fingerprint|face scan|facial scan|retina scan|iris scan|voiceprint|dna (?:profile|sequence|sample))\b/,
  ),
  regexRule(
    'location.coordinates',
    'precise_location',
    /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/,
  ),
  regexRule(
    'location.street_address',
    'precise_location',
    /\b\d{1,5}[a-z]? [a-z0-9.'-]+(?: [a-z0-9.'-]+){0,3} (?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|terrace|place|pl)\b/,
  ),
];

export function prohibitedMemoryRules(
  category?: ProhibitedMemoryCategory,
): readonly ProhibitedMemoryRule[] {
  return category === undefined ? RULES : RULES.filter((rule) => rule.category === category);
}

function normalize(content: string): string {
  return content.toLowerCase().replace(/\s+/gu, ' ').trim();
}

/**
 * The single screen a fact passes before it may become durable memory. It reads
 * a stated value, not a topic, so "User works in cardiology" stays storable.
 */
export function prohibitedMemoryCategory(content: string): ProhibitedMemoryCategory | null {
  if (typeof content !== 'string' || !content.trim()) return null;
  const normalized = normalize(content);
  return RULES.find((rule) => rule.matches(normalized))?.category ?? null;
}

const CATEGORY_SUBJECT: { readonly [K in ProhibitedMemoryCategory]: string } = {
  credential: 'a password, key or token',
  payment_instrument: 'payment card or bank account details',
  government_identifier: 'a government identity number',
  health: 'health information',
  biometric: 'biometric identifiers',
  precise_location: 'a precise home or street location',
};

export function prohibitedMemoryMessage(category: ProhibitedMemoryCategory): string {
  return `Memory never stores ${CATEGORY_SUBJECT[category]}, so I left that out.`;
}
