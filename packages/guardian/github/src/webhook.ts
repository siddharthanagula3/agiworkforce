/**
 * GitHub webhook transport security: HMAC signature verification and
 * delivery-ID replay protection.
 *
 * Verification runs on the raw request body bytes, before any JSON parsing,
 * and uses constant-time comparison. Anything that fails here is dropped —
 * webhook payloads are attacker-reachable input.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-hub-signature-256';
export const DELIVERY_HEADER = 'x-github-delivery';
export const EVENT_HEADER = 'x-github-event';

/**
 * Verify `X-Hub-Signature-256` over the raw body. Returns false for missing,
 * malformed, or mismatched signatures; never throws on bad input.
 */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
): boolean {
  if (!secret || !signatureHeader) return false;
  const match = /^sha256=([0-9a-f]{64})$/.exec(signatureHeader.trim());
  if (!match || match[1] === undefined) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const provided = Buffer.from(match[1], 'hex');
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * Delivery-ID replay guard. Backed by an injected store so the control plane
 * can use a database unique constraint while tests use memory.
 */
export interface DeliveryStore {
  /** Record the id; MUST return false when the id was already recorded. */
  recordOnce(deliveryId: string): Promise<boolean>;
}

export class InMemoryDeliveryStore implements DeliveryStore {
  private readonly seen = new Set<string>();

  recordOnce(deliveryId: string): Promise<boolean> {
    if (this.seen.has(deliveryId)) return Promise.resolve(false);
    this.seen.add(deliveryId);
    return Promise.resolve(true);
  }
}

export interface WebhookHeaders {
  signature: string | null;
  deliveryId: string | null;
  event: string | null;
}

/** Extract the Guardian-relevant headers from a header-getter function. */
export function readWebhookHeaders(
  get: (name: string) => string | null | undefined,
): WebhookHeaders {
  return {
    signature: get(SIGNATURE_HEADER) ?? null,
    deliveryId: get(DELIVERY_HEADER) ?? null,
    event: get(EVENT_HEADER) ?? null,
  };
}
