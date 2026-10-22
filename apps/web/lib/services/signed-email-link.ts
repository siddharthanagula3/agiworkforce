import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { z } from 'zod';

const SIGNING_SECRET_ENV = 'CSRF_SECRET';
const MIN_SECRET_BYTES = 32;

function signingKey(purpose: string): Buffer | null {
  const secret = process.env[SIGNING_SECRET_ENV];
  if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) return null;
  return createHmac('sha256', secret).update(purpose).digest();
}

function signatureFor(encodedPayload: string, key: Buffer): string {
  return createHmac('sha256', key).update(encodedPayload).digest('base64url');
}

export function signEmailLinkToken(purpose: string, payload: unknown): string | null {
  const key = signingKey(purpose);
  if (!key) return null;
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encodedPayload}.${signatureFor(encodedPayload, key)}`;
}

export function readEmailLinkToken<T>(
  purpose: string,
  token: string | null | undefined,
  schema: z.ZodType<T>,
): T | null {
  const key = signingKey(purpose);
  if (!key || !token) return null;
  const [encodedPayload, providedSignature, extra] = token.split('.');
  if (!encodedPayload || !providedSignature || extra !== undefined) return null;

  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(signatureFor(encodedPayload, key));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = schema.safeParse(decoded);
  return parsed.success ? parsed.data : null;
}
