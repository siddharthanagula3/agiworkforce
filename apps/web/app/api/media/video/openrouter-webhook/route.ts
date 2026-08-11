import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { nudgeVideoGenerationJobFromProviderEvent } from '@/lib/server/video-generation-jobs';
import {
  OpenRouterVideoWebhookVerificationError,
  verifyOpenRouterVideoWebhook,
} from '@/lib/services/openrouter-video-webhook-service';

export const runtime = 'nodejs';
export const maxDuration = 10;

const MAX_WEBHOOK_BYTES = 64 * 1024;

async function readBoundedRawBody(request: NextRequest): Promise<Buffer | null> {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      byteLength += value.byteLength;
      if (byteLength > MAX_WEBHOOK_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, byteLength);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const signingSecret = process.env['OPENROUTER_WEBHOOK_SECRET']?.trim();
  if (!signingSecret) {
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  }
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: 'Webhook payload is too large' }, { status: 413 });
  }

  let rawBody: Buffer | null;
  try {
    rawBody = await readBoundedRawBody(request);
  } catch {
    return NextResponse.json({ error: 'Webhook payload could not be read' }, { status: 400 });
  }
  if (!rawBody || rawBody.byteLength === 0) {
    return NextResponse.json({ error: 'Webhook payload is invalid' }, { status: 400 });
  }

  let event;
  try {
    event = verifyOpenRouterVideoWebhook({
      rawBody,
      signatureHeader: request.headers.get('x-openrouter-signature'),
      idempotencyKey: request.headers.get('x-openrouter-idempotency-key'),
      signingSecret,
    });
  } catch (error) {
    const status =
      error instanceof OpenRouterVideoWebhookVerificationError && error.kind === 'payload'
        ? 400
        : 401;
    return NextResponse.json({ error: 'Webhook verification failed' }, { status });
  }

  try {
    const eventKey = request.headers.get('x-openrouter-idempotency-key')!;
    const disposition = await nudgeVideoGenerationJobFromProviderEvent({
      db: getNeonDb(),
      provider: 'openrouter',
      providerTaskId: event.data.id,
      eventKey,
    });
    if (disposition === 'not_found') {
      logger.warn(
        { provider: 'openrouter', eventType: event.type },
        'Signed video webhook arrived before its durable task attachment',
      );
    }
    return NextResponse.json(
      { accepted: true, duplicate: disposition === 'duplicate' },
      { status: 202 },
    );
  } catch (error) {
    logger.error({ error, provider: 'openrouter' }, 'Video webhook reconciliation nudge failed');
    return NextResponse.json({ error: 'Webhook reconciliation is unavailable' }, { status: 503 });
  }
}
