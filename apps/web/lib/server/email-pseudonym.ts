import 'server-only';

import { createHash, createHmac } from 'node:crypto';

import { logger } from '@/lib/logger';

export const EMAIL_HASH_PEPPER_ENV = 'EMAIL_HASH_PEPPER';

export const MISSING_EMAIL_HASH_PEPPER_MESSAGE =
  `${EMAIL_HASH_PEPPER_ENV} is not set, so a newly written email pseudonym would be an unkeyed ` +
  'SHA-256. Email addresses are low-entropy and enumerable, so that digest is reversible by ' +
  `dictionary and is not a pseudonym. Set ${EMAIL_HASH_PEPPER_ENV} (32+ random bytes) on the ` +
  'deployment and redeploy.';

export function normalizeEmailForHashing(email: string): string {
  return email.toLowerCase().trim();
}

export function legacyEmailSha256(email: string): string {
  return createHash('sha256').update(normalizeEmailForHashing(email)).digest('hex');
}

function readPepper(): string | null {
  return process.env[EMAIL_HASH_PEPPER_ENV]?.trim() || null;
}

function pepperedEmailHmac(pepper: string, email: string): string {
  return createHmac('sha256', pepper).update(normalizeEmailForHashing(email)).digest('hex');
}

function isProductionRuntime(): boolean {
  if (process.env['NEXT_PHASE'] === 'phase-production-build') return false;
  const vercelEnv = process.env['VERCEL_ENV'];
  if (vercelEnv === 'preview') return false;
  return vercelEnv === 'production' || process.env['NODE_ENV'] === 'production';
}

let missingPepperReported = false;

// Email addresses are low-entropy and enumerable, so an unkeyed digest is reversible by
// dictionary; a server-side pepper is what makes the stored value a pseudonym. Production
// therefore refuses to write one without the pepper rather than degrading in silence.
export function pseudonymizeEmail(email: string): string {
  const pepper = readPepper();
  if (!pepper) {
    if (isProductionRuntime()) throw new Error(MISSING_EMAIL_HASH_PEPPER_MESSAGE);
    if (!missingPepperReported) {
      missingPepperReported = true;
      logger.error({ env: EMAIL_HASH_PEPPER_ENV }, MISSING_EMAIL_HASH_PEPPER_MESSAGE);
    }
    return legacyEmailSha256(email);
  }
  return pepperedEmailHmac(pepper, email);
}

// Matching must not fail closed the way writing does: rows stored before the pepper existed
// carry the unkeyed digest, and erasure still has to reach them.
export function emailPseudonymCandidates(email: string): string[] {
  const pepper = readPepper();
  const candidates = pepper ? [pepperedEmailHmac(pepper, email)] : [];
  candidates.push(legacyEmailSha256(email));
  return [...new Set(candidates)];
}
