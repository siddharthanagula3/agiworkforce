import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { InMemoryDeliveryStore, readWebhookHeaders, verifyWebhookSignature } from '../webhook.js';

const SECRET = 'test-webhook-secret';

function sign(body: string, secret: string = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

describe('verifyWebhookSignature', () => {
  const body = JSON.stringify({ action: 'opened', number: 1 });

  it('accepts a correctly signed body', () => {
    expect(verifyWebhookSignature(SECRET, body, sign(body))).toBe(true);
  });

  it('accepts Buffer bodies', () => {
    expect(verifyWebhookSignature(SECRET, Buffer.from(body), sign(body))).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifyWebhookSignature(SECRET, body.replace('opened', 'closed'), sign(body))).toBe(
      false,
    );
  });

  it('rejects a signature from the wrong secret', () => {
    expect(verifyWebhookSignature(SECRET, body, sign(body, 'other-secret'))).toBe(false);
  });

  it('rejects missing, malformed, and non-sha256 signatures without throwing', () => {
    expect(verifyWebhookSignature(SECRET, body, null)).toBe(false);
    expect(verifyWebhookSignature(SECRET, body, '')).toBe(false);
    expect(verifyWebhookSignature(SECRET, body, 'sha256=zzzz')).toBe(false);
    expect(verifyWebhookSignature(SECRET, body, 'sha1=abcdef')).toBe(false);
    expect(verifyWebhookSignature(SECRET, body, 'sha256=abc')).toBe(false);
  });

  it('rejects everything when the secret is empty', () => {
    expect(verifyWebhookSignature('', body, sign(body, ''))).toBe(false);
  });
});

describe('InMemoryDeliveryStore', () => {
  it('accepts a delivery once and rejects the replay', async () => {
    const store = new InMemoryDeliveryStore();
    expect(await store.recordOnce('delivery-1')).toBe(true);
    expect(await store.recordOnce('delivery-1')).toBe(false);
    expect(await store.recordOnce('delivery-2')).toBe(true);
  });
});

describe('readWebhookHeaders', () => {
  it('extracts the three Guardian headers', () => {
    const headers = new Map([
      ['x-hub-signature-256', 'sha256=abc'],
      ['x-github-delivery', 'uuid-1'],
      ['x-github-event', 'push'],
    ]);
    const result = readWebhookHeaders((name) => headers.get(name) ?? null);
    expect(result).toEqual({ signature: 'sha256=abc', deliveryId: 'uuid-1', event: 'push' });
  });
});
