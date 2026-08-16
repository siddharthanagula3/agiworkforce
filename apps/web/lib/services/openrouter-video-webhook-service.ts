import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const FIVE_MINUTES_SECONDS = 5 * 60;
const TASK_ID_PATTERN = /^[A-Za-z0-9._~-]{1,512}$/u;
const SignatureSchema = z.string().regex(/^[a-f0-9]{64}$/u);

const terminalStatuses = ['completed', 'failed', 'cancelled', 'expired'] as const;
const eventTypes = [
  'video.generation.completed',
  'video.generation.failed',
  'video.generation.cancelled',
  'video.generation.expired',
] as const;

const OpenRouterVideoWebhookSchema = z
  .object({
    type: z.enum(eventTypes),
    created_at: z.string().datetime(),
    data: z
      .object({
        id: z.string().regex(TASK_ID_PATTERN),
        status: z.enum(terminalStatuses),
      })
      .passthrough(),
  })
  .passthrough()
  .superRefine((event, context) => {
    if (event.type !== `video.generation.${event.data.status}`) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['type'],
        message: 'Webhook event type and status disagree',
      });
    }
  });

export type OpenRouterVideoWebhookEvent = z.infer<typeof OpenRouterVideoWebhookSchema>;

export class OpenRouterVideoWebhookVerificationError extends Error {
  constructor(readonly kind: 'signature' | 'timestamp' | 'payload' | 'idempotency') {
    super(`Invalid OpenRouter video webhook ${kind}`);
    this.name = 'OpenRouterVideoWebhookVerificationError';
  }
}

function signatureParts(header: string): { timestamp: string; signatures: string[] } {
  let timestamp = '';
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [name, value] = part.trim().split('=', 2);
    if (name === 't' && /^\d{1,16}$/u.test(value ?? '')) timestamp = value!;
    if (name === 'v1' && SignatureSchema.safeParse(value).success) signatures.push(value!);
  }
  if (!timestamp || signatures.length === 0) {
    throw new OpenRouterVideoWebhookVerificationError('signature');
  }
  return { timestamp, signatures };
}

export function verifyOpenRouterVideoWebhook(input: {
  rawBody: Buffer;
  signatureHeader: string | null;
  idempotencyKey: string | null;
  signingSecret: string;
  nowSeconds?: number;
}): OpenRouterVideoWebhookEvent {
  if (!input.signatureHeader || !input.signingSecret) {
    throw new OpenRouterVideoWebhookVerificationError('signature');
  }
  const { timestamp, signatures } = signatureParts(input.signatureHeader);
  const timestampSeconds = Number(timestamp);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1_000);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > FIVE_MINUTES_SECONDS
  ) {
    throw new OpenRouterVideoWebhookVerificationError('timestamp');
  }

  const expected = createHmac('sha256', input.signingSecret)
    .update(Buffer.from(`${timestamp},`, 'utf8'))
    .update(input.rawBody)
    .digest();
  const signatureValid = signatures.some((signature) => {
    const supplied = Buffer.from(signature, 'hex');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
  if (!signatureValid) throw new OpenRouterVideoWebhookVerificationError('signature');

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody.toString('utf8'));
  } catch {
    throw new OpenRouterVideoWebhookVerificationError('payload');
  }
  const parsed = OpenRouterVideoWebhookSchema.safeParse(payload);
  if (!parsed.success) throw new OpenRouterVideoWebhookVerificationError('payload');

  if (input.idempotencyKey !== `${parsed.data.data.id}-${parsed.data.data.status}`) {
    throw new OpenRouterVideoWebhookVerificationError('idempotency');
  }
  return parsed.data;
}
