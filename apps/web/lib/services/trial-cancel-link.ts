import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { absoluteUrl } from '@/lib/seo/site';

const SIGNING_SECRET_ENV = 'CSRF_SECRET';
const MIN_SECRET_BYTES = 32;
const TRIAL_CANCEL_LINK_PURPOSE = 'trial-cancel-link';

export const TRIAL_CANCEL_PATH = '/trial/cancel';

const TrialCancelLinkSchema = z
  .object({
    purpose: z.literal(TRIAL_CANCEL_LINK_PURPOSE),
    userId: z.string().min(1),
    subscriptionId: z.string().regex(/^sub_[A-Za-z0-9]+$/),
    trialEnd: z.number().int().positive(),
  })
  .strict();

export interface TrialCancelLink {
  userId: string;
  subscriptionId: string;
  trialEnd: number;
}

function signingKey(): Buffer | null {
  const secret = process.env[SIGNING_SECRET_ENV];
  if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) return null;
  return createHmac('sha256', secret).update(TRIAL_CANCEL_LINK_PURPOSE).digest();
}

function signatureFor(encodedPayload: string, key: Buffer): string {
  return createHmac('sha256', key).update(encodedPayload).digest('base64url');
}

export function trialCancelUrl(link: TrialCancelLink): string | null {
  const key = signingKey();
  if (!key) return null;
  const payload = TrialCancelLinkSchema.parse({ purpose: TRIAL_CANCEL_LINK_PURPOSE, ...link });
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const token = `${encodedPayload}.${signatureFor(encodedPayload, key)}`;
  return absoluteUrl(`${TRIAL_CANCEL_PATH}?token=${encodeURIComponent(token)}`);
}

export function readTrialCancelToken(
  token: string | null | undefined,
  nowMs = Date.now(),
): TrialCancelLink | null {
  const key = signingKey();
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
  const parsed = TrialCancelLinkSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.trialEnd * 1000 <= nowMs) return null;
  return {
    userId: parsed.data.userId,
    subscriptionId: parsed.data.subscriptionId,
    trialEnd: parsed.data.trialEnd,
  };
}
