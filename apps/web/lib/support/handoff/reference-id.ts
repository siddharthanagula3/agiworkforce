/**
 * @file reference-id.ts
 *
 * Human-quotable escalation reference: `AGI-YYYYMMDD-XXXXXXXX`.
 *
 * Returned in EVERY handoff mode — including the fully degraded one where no
 * email could be sent — because the database row exists either way and a human
 * sweeping the table must be able to find what the user is quoting. A support
 * channel where the user has nothing to reference is the same failure as a
 * chat that never connects.
 *
 * The random half uses Crockford base32 (no I/L/O/U), so a reference read aloud
 * or retyped from a screenshot cannot be corrupted by 1/I or 0/O confusion.
 */

import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RANDOM_LENGTH = 8;

export const REFERENCE_ID_PATTERN = /^AGI-\d{8}-[0-9A-HJKMNP-TV-Z]{8}$/u;

function datePart(now: Date): string {
  const year = now.getUTCFullYear().toString().padStart(4, '0');
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = now.getUTCDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

export function generateReferenceId(now: Date = new Date()): string {
  const bytes = randomBytes(RANDOM_LENGTH);
  let random = '';
  for (let i = 0; i < RANDOM_LENGTH; i += 1) {
    random += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return `AGI-${datePart(now)}-${random}`;
}

export function isReferenceId(value: string): boolean {
  return REFERENCE_ID_PATTERN.test(value);
}
