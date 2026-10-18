import 'server-only';

import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const PROVIDER_PROXY_TOKEN_SECRET_ENV = 'CSRF_SECRET';
const MIN_SECRET_BYTES = 32;
const PROVIDER_PROXY_TOKEN_PURPOSE = 'e2b-provider-proxy';
const SIGNING_KEY_INFO = 'agi/e2b-provider-proxy-token/v1';
const SIGNING_KEY_BYTES = 32;

let cachedSigningKey: Buffer | null = null;

// CSRF tokens are signed with the same secret, so these tokens sign with a key
// derived for this purpose alone and neither signature can stand in for the other.
function resolveSigningKey(): Buffer {
  if (cachedSigningKey) return cachedSigningKey;
  const secret = process.env[PROVIDER_PROXY_TOKEN_SECRET_ENV];
  if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    throw new Error(
      `${PROVIDER_PROXY_TOKEN_SECRET_ENV} must be set to at least ${MIN_SECRET_BYTES} bytes to mint or verify a provider-proxy token`,
    );
  }
  cachedSigningKey = Buffer.from(
    hkdfSync('sha256', secret, Buffer.alloc(0), SIGNING_KEY_INFO, SIGNING_KEY_BYTES),
  );
  return cachedSigningKey;
}

const ProviderProxyTokenPayloadSchema = z
  .object({
    purpose: z.literal(PROVIDER_PROXY_TOKEN_PURPOSE),
    sessionId: z.string().min(1),
    userId: z.string().min(1),
    providerId: z.string().min(1),
    expiresAt: z.number().int().positive(),
  })
  .strict();

export type ProviderProxyTokenPayload = z.infer<typeof ProviderProxyTokenPayloadSchema>;

export interface ProviderProxyTokenSubject {
  sessionId: string;
  userId: string;
  providerId: string;
}

function signatureFor(encodedPayload: string): string {
  return createHmac('sha256', resolveSigningKey()).update(encodedPayload).digest('base64url');
}

export function mintProviderProxyToken(
  subject: ProviderProxyTokenSubject,
  ttlMs: number,
  nowMs = Date.now(),
): string {
  const payload = ProviderProxyTokenPayloadSchema.parse({
    purpose: PROVIDER_PROXY_TOKEN_PURPOSE,
    sessionId: subject.sessionId,
    userId: subject.userId,
    providerId: subject.providerId,
    expiresAt: nowMs + Math.max(1, ttlMs),
  });
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encodedPayload}.${signatureFor(encodedPayload)}`;
}

export function verifyProviderProxyToken(
  token: string,
  nowMs = Date.now(),
): ProviderProxyTokenPayload | null {
  const [encodedPayload, providedSignature, extra] = token.split('.');
  if (!encodedPayload || !providedSignature || extra) return null;

  const expectedSignature = signatureFor(encodedPayload);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const result = ProviderProxyTokenPayloadSchema.safeParse(parsed);
  if (!result.success) return null;
  if (result.data.expiresAt < nowMs) return null;
  return result.data;
}
