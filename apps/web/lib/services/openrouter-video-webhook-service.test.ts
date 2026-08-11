import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  OpenRouterVideoWebhookVerificationError,
  verifyOpenRouterVideoWebhook,
} from './openrouter-video-webhook-service';

const NOW_SECONDS = 1_800_000_000;
const SECRET = 'synthetic-webhook-secret';
const TASK_ID = 'synthetic-task-1';

function payload(status: 'completed' | 'failed' = 'completed'): Buffer {
  return Buffer.from(
    JSON.stringify({
      type: `video.generation.${status}`,
      created_at: '2027-01-15T08:00:00.000Z',
      data: { id: TASK_ID, status },
    }),
  );
}

function signature(rawBody: Buffer, timestamp = NOW_SECONDS): string {
  const digest = createHmac('sha256', SECRET)
    .update(Buffer.from(`${timestamp},`))
    .update(rawBody)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

describe('OpenRouter video webhook verification', () => {
  it('authenticates exact raw bytes and the documented event idempotency key', () => {
    const rawBody = payload();
    expect(
      verifyOpenRouterVideoWebhook({
        rawBody,
        signatureHeader: signature(rawBody),
        idempotencyKey: `${TASK_ID}-completed`,
        signingSecret: SECRET,
        nowSeconds: NOW_SECONDS,
      }).data.id,
    ).toBe(TASK_ID);
  });

  it('rejects reserialized bytes even when the JSON value is equivalent', () => {
    const signedBody = payload();
    const changedBody = Buffer.from(
      JSON.stringify({
        data: { status: 'completed', id: TASK_ID },
        created_at: '2027-01-15T08:00:00.000Z',
        type: 'video.generation.completed',
      }),
    );
    expect(() =>
      verifyOpenRouterVideoWebhook({
        rawBody: changedBody,
        signatureHeader: signature(signedBody),
        idempotencyKey: `${TASK_ID}-completed`,
        signingSecret: SECRET,
        nowSeconds: NOW_SECONDS,
      }),
    ).toThrowError(expect.objectContaining({ kind: 'signature' }));
  });

  it.each([NOW_SECONDS - 301, NOW_SECONDS + 301])(
    'rejects a timestamp outside the replay window (%s)',
    (timestamp) => {
      const rawBody = payload();
      expect(() =>
        verifyOpenRouterVideoWebhook({
          rawBody,
          signatureHeader: signature(rawBody, timestamp),
          idempotencyKey: `${TASK_ID}-completed`,
          signingSecret: SECRET,
          nowSeconds: NOW_SECONDS,
        }),
      ).toThrowError(expect.objectContaining({ kind: 'timestamp' }));
    },
  );

  it('rejects mismatched event type/status and delivery idempotency keys', () => {
    const rawBody = payload('failed');
    expect(() =>
      verifyOpenRouterVideoWebhook({
        rawBody,
        signatureHeader: signature(rawBody),
        idempotencyKey: `${TASK_ID}-completed`,
        signingSecret: SECRET,
        nowSeconds: NOW_SECONDS,
      }),
    ).toThrow(OpenRouterVideoWebhookVerificationError);
  });

  it('checks the signature before attempting to parse JSON', () => {
    const rawBody = Buffer.from('{not-json');
    expect(() =>
      verifyOpenRouterVideoWebhook({
        rawBody,
        signatureHeader: `t=${NOW_SECONDS},v1=${'0'.repeat(64)}`,
        idempotencyKey: `${TASK_ID}-completed`,
        signingSecret: SECRET,
        nowSeconds: NOW_SECONDS,
      }),
    ).toThrowError(expect.objectContaining({ kind: 'signature' }));
  });
});
