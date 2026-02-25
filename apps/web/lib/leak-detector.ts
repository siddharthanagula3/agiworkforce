/**
 * Leak detector: scans request/response data for secret-shaped strings.
 * Call assertNoLeaks() on untrusted data before logging or returning to clients.
 */

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{32,}/, // Anthropic/OpenAI API keys
  /sk_live_[A-Za-z0-9]{24,}/, // Stripe live keys
  /sk_test_[A-Za-z0-9]{24,}/, // Stripe test keys
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, // JWTs
  /SUPABASE_SERVICE_ROLE[=:][^\s]{8,}/, // Supabase service role
  /Bearer\s+[A-Za-z0-9_-]{20,}/, // Bearer tokens
];

export class LeakDetectedError extends Error {
  constructor(label: string, pattern: string) {
    super(`Potential secret leak detected in ${label} (pattern: ${pattern})`);
    this.name = 'LeakDetectedError';
  }
}

function scanString(value: string, label: string): void {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(value)) {
      // Log sanitized warning (don't log the actual value)
      console.warn(`[leak-detector] Pattern ${pattern.source} matched in: ${label}`);
      throw new LeakDetectedError(label, pattern.source);
    }
  }
}

function scanValue(value: unknown, label: string): void {
  if (typeof value === 'string') {
    scanString(value, label);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => scanValue(item, `${label}[${i}]`));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, val] of Object.entries(value)) {
      scanValue(val, `${label}.${key}`);
    }
  }
}

export function assertNoLeaks(label: string, data: unknown): void {
  scanValue(data, label);
}
