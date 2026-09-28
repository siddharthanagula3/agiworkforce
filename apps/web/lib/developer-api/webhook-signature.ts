import 'server-only';

import { createHmac, randomBytes } from 'node:crypto';

export const WEBHOOK_SECRET_PREFIX = 'whsec_';

const SECRET_BYTES = 32;
const VISIBLE_PREFIX_LENGTH = 10;

export function generateWebhookSecret(): { secret: string; prefix: string } {
  const secret = `${WEBHOOK_SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString('base64')}`;
  return { secret, prefix: secret.slice(0, VISIBLE_PREFIX_LENGTH) };
}

export function signWebhookPayload(
  secret: string,
  messageId: string,
  timestamp: number,
  body: string,
): string {
  const key = Buffer.from(secret.slice(WEBHOOK_SECRET_PREFIX.length), 'base64');
  const signature = createHmac('sha256', key)
    .update(`${messageId}.${timestamp}.${body}`)
    .digest('base64');
  return `v1,${signature}`;
}

export function webhookDeliveryHeaders(input: {
  secret: string;
  messageId: string;
  timestamp: number;
  body: string;
}): Record<string, string> {
  return {
    'content-type': 'application/json',
    'user-agent': 'AGI-Webhooks',
    'webhook-id': input.messageId,
    'webhook-timestamp': String(input.timestamp),
    'webhook-signature': signWebhookPayload(
      input.secret,
      input.messageId,
      input.timestamp,
      input.body,
    ),
  };
}
