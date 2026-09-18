import 'server-only';

import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { STEP_UP_ACTIONS, stepUpActionSpec, type StepUpAction } from './actions';

const MIN_SECRET_BYTES = 32;
const DERIVATION_INFO = 'agi:step-up-grant:v1';

export const STEP_UP_METHODS = ['totp', 'backup_code'] as const;
export type StepUpMethod = (typeof STEP_UP_METHODS)[number];

const GrantPayloadSchema = z
  .object({
    userId: z.string().min(1).max(255),
    action: z.enum(Object.keys(STEP_UP_ACTIONS) as [StepUpAction, ...StepUpAction[]]),
    resourceId: z.string().max(255).nullable(),
    method: z.enum(STEP_UP_METHODS),
    issuedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
    nonce: z.string().min(16).max(64),
  })
  .strict();

export type StepUpGrantPayload = z.infer<typeof GrantPayloadSchema>;

export interface StepUpGrantSubject {
  userId: string;
  action: StepUpAction;
  resourceId?: string | null;
}

export class StepUpGrantInvalidError extends Error {
  constructor(readonly reason: 'malformed' | 'signature' | 'expired' | 'subject_mismatch') {
    super(`step-up grant rejected: ${reason}`);
    this.name = 'StepUpGrantInvalidError';
  }
}

let cachedKey: Buffer | null = null;

// Derived from CSRF_SECRET rather than read from a variable of its own: a
// separate key with the same lifecycle would double the rotation surface, and
// HKDF keeps the two uses from ever producing the same signature.
function signingKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env['CSRF_SECRET'];
  if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    throw new Error(
      'Step-up authentication needs CSRF_SECRET (at least 32 bytes) to sign its grants',
    );
  }
  cachedKey = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), DERIVATION_INFO, 32));
  return cachedKey;
}

export function resetStepUpSigningKeyCache(): void {
  cachedKey = null;
}

function signatureFor(encodedPayload: string): string {
  return createHmac('sha256', signingKey()).update(encodedPayload).digest('base64url');
}

export function createStepUpGrant(
  input: StepUpGrantSubject & { method: StepUpMethod },
  nowMs = Date.now(),
): { token: string; expiresAt: number } {
  const expiresAt = nowMs + stepUpActionSpec(input.action).freshnessSeconds * 1000;
  const payload = GrantPayloadSchema.parse({
    userId: input.userId,
    action: input.action,
    resourceId: input.resourceId ?? null,
    method: input.method,
    issuedAt: nowMs,
    expiresAt,
    nonce: randomBytes(16).toString('base64url'),
  });
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return { token: `${encodedPayload}.${signatureFor(encodedPayload)}`, expiresAt };
}

export function verifyStepUpGrant(
  token: string,
  expected: StepUpGrantSubject,
  nowMs = Date.now(),
): StepUpGrantPayload {
  const [encodedPayload, providedSignature, extra] = token.split('.');
  if (!encodedPayload || !providedSignature || extra) {
    throw new StepUpGrantInvalidError('malformed');
  }

  const expectedSignature = signatureFor(encodedPayload);
  const provided = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (provided.length !== expectedBuffer.length || !timingSafeEqual(provided, expectedBuffer)) {
    throw new StepUpGrantInvalidError('signature');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new StepUpGrantInvalidError('malformed');
  }

  const parsed = GrantPayloadSchema.safeParse(decoded);
  if (!parsed.success) throw new StepUpGrantInvalidError('malformed');

  const payload = parsed.data;
  if (
    payload.userId !== expected.userId ||
    payload.action !== expected.action ||
    payload.resourceId !== (expected.resourceId ?? null)
  ) {
    throw new StepUpGrantInvalidError('subject_mismatch');
  }
  if (payload.expiresAt <= nowMs) throw new StepUpGrantInvalidError('expired');

  return payload;
}
