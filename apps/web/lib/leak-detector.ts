
/**
 * EXPORTED so redactors can share ONE pattern list with the detector.
 * `lib/support/handoff/transcript.ts` needs to strip secrets out of a
 * user-pasted support transcript rather than throw on them — rejecting a user's
 * escalation because they pasted their own key is a worse outcome than
 * redacting it.
 *
 * The patterns themselves now live in `lib/security/secret-patterns.ts`, the
 * single registry shared with `lib/security/secrets-audit.ts`. This is the
 * conservative `assertable` subset, because matching here ABORTS a live
 * request; the registry's broader detectors are scan-and-warn only.
 *
 * Consumers must not mutate the array. Patterns are unanchored and non-global,
 * so a redactor has to rebuild them with the `g` flag (see `redactSecrets`).
 */
export { ASSERTABLE_SECRET_PATTERNS as SECRET_PATTERNS } from './security/secret-patterns';

import { ASSERTABLE_SECRET_PATTERNS } from './security/secret-patterns';

export class LeakDetectedError extends Error {
  constructor(label: string, pattern: string) {
    super(`Potential secret leak detected in ${label} (pattern: ${pattern})`);
    this.name = 'LeakDetectedError';
  }
}

function scanString(value: string, label: string): void {
  for (const pattern of ASSERTABLE_SECRET_PATTERNS) {
    if (pattern.test(value)) {
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
