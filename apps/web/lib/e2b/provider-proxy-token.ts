import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const PROVIDER_PROXY_TOKEN_SECRET_ENV = 'CSRF_SECRET';
const MIN_SECRET_BYTES = 32;
const PROVIDER_PROXY_TOKEN_PURPOSE = 'e2b-provider-proxy';

let cachedSecret: string | null = null;

function resolveSecret(): string {
  if (cachedSecret) return cachedSecret;
  const secret = process.env[PROVIDER_PROXY_TOKEN_SECRET_ENV];
  if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    throw new Error(
      `${PROVIDER_PROXY_TOKEN_SECRET_ENV} must be set to at least ${MIN_SECRET_BYTES} bytes to mint or verify a provider-proxy token`,
    );
  }
  cachedSecret = secret;
  return cachedSecret;
}

export function resetProviderProxyTokenSecretCache(): void {
  cachedSecret = null;
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

function signatureFor(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
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
  return `${encodedPayload}.${signatureFor(encodedPayload, resolveSecret())}`;
}

export function verifyProviderProxyToken(
  token: string,
  nowMs = Date.now(),
): ProviderProxyTokenPayload | null {
  const [encodedPayload, providedSignature, extra] = token.split('.');
  if (!encodedPayload || !providedSignature || extra) return null;

  const expectedSignature = signatureFor(encodedPayload, resolveSecret());
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
