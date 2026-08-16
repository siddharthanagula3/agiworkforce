import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-hub-signature-256';
export const DELIVERY_HEADER = 'x-github-delivery';
export const EVENT_HEADER = 'x-github-event';

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

export interface DeliveryStore {
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

export function readWebhookHeaders(
  get: (name: string) => string | null | undefined,
): WebhookHeaders {
  return {
    signature: get(SIGNATURE_HEADER) ?? null,
    deliveryId: get(DELIVERY_HEADER) ?? null,
    event: get(EVENT_HEADER) ?? null,
  };
}
