import 'server-only';

import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import {
  MAX_PURCHASABLE_SEATS,
  MIN_PURCHASABLE_SEATS,
  SELF_SERVE_PAID_PLAN_TIERS,
} from '@agiworkforce/types';

const PREVIEW_TOKEN_TTL_MS = 10 * 60 * 1000;

const UpgradePreviewTokenPayloadSchema = z
  .object({
    userId: z.string().min(1),
    plan: z.enum(SELF_SERVE_PAID_PLAN_TIERS),
    billingInterval: z.enum(['monthly', 'yearly']),
    stripeSubscriptionId: z.string().regex(/^sub_[A-Za-z0-9]+$/),
    /**
     * Line-item quantity the preview was computed for. Bound into the HMAC
     * because the proration figure the customer confirmed is quantity-dependent:
     * without it, a client could preview 2 seats and apply the same token with
     * 50, and be charged the 2-seat proration for a 50-seat subscription.
     * Always 1 for per-account plans.
     */
    seats: z.number().int().min(MIN_PURCHASABLE_SEATS).max(MAX_PURCHASABLE_SEATS),
    prorationDate: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
  })
  .strict();

type UpgradePreviewTokenPayload = z.infer<typeof UpgradePreviewTokenPayloadSchema>;

type CreateUpgradePreviewTokenInput = Omit<UpgradePreviewTokenPayload, 'expiresAt'>;

type ExpectedUpgradePreview = Omit<UpgradePreviewTokenPayload, 'prorationDate' | 'expiresAt'>;

function signatureFor(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function createUpgradePreviewToken(
  input: CreateUpgradePreviewTokenInput,
  secret: string,
  nowMs = Date.now(),
): string {
  const payload = UpgradePreviewTokenPayloadSchema.parse({
    ...input,
    expiresAt: nowMs + PREVIEW_TOKEN_TTL_MS,
  });
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encodedPayload}.${signatureFor(encodedPayload, secret)}`;
}

export function verifyUpgradePreviewToken(
  token: string,
  expected: ExpectedUpgradePreview,
  secret: string,
  nowMs = Date.now(),
): UpgradePreviewTokenPayload {
  const [encodedPayload, providedSignature, extra] = token.split('.');
  if (!encodedPayload || !providedSignature || extra) {
    throw new Error('Invalid upgrade preview token');
  }

  const expectedSignature = signatureFor(encodedPayload, secret);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid upgrade preview token');
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid upgrade preview token');
  }
  const result = UpgradePreviewTokenPayloadSchema.safeParse(parsedPayload);
  if (!result.success) throw new Error('Invalid upgrade preview token');

  const payload = result.data;
  if (payload.expiresAt < nowMs) throw new Error('Upgrade preview token expired');
  if (
    payload.userId !== expected.userId ||
    payload.plan !== expected.plan ||
    payload.billingInterval !== expected.billingInterval ||
    payload.stripeSubscriptionId !== expected.stripeSubscriptionId ||
    payload.seats !== expected.seats
  ) {
    throw new Error('Invalid upgrade preview token');
  }

  return payload;
}
