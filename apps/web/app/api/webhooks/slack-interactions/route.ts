import 'server-only';

import { NextRequest, NextResponse, after } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { recordAuditEvent } from '@/lib/security-audit';
import { SLACK_REQUEST_TIMEOUT_MS } from '@/lib/slack/slack-api';
import {
  decideSlackApprovalFromSlack,
  interactionReply,
  readSlackApprovalClick,
} from '@/lib/slack/slack-interactions';
import { SLACK_SIGNING_SECRET_ENV, verifySlackSignature } from '@/lib/triggers/trigger-signatures';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_BODY_BYTES = 64 * 1024;
const ENDPOINT = '/api/webhooks/slack-interactions';

async function replyInSlack(responseUrl: string | null, text: string): Promise<void> {
  if (!responseUrl) return;
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ replace_original: true, text }),
    signal: AbortSignal.timeout(SLACK_REQUEST_TIMEOUT_MS),
  }).catch((error: unknown) => {
    logger.warn({ error }, 'Slack interaction reply was not delivered');
  });
}

async function handleSlackInteraction(request: NextRequest): Promise<NextResponse> {
  const rateLimited = await withRateLimit(request, 'trigger-webhook');
  if (rateLimited) return rateLimited;

  const body = await request.text();
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  const verification = verifySlackSignature({
    body,
    timestamp: request.headers.get('x-slack-request-timestamp'),
    signature: request.headers.get('x-slack-signature'),
    secret: process.env[SLACK_SIGNING_SECRET_ENV],
    nowSeconds: Math.floor(Date.now() / 1000),
  });
  if (!verification.ok) {
    if (verification.reason === 'not_configured') {
      logger.error(`${SLACK_SIGNING_SECRET_ENV} is not set; Slack interactions are refused`);
      return NextResponse.json({ error: 'Slack is not configured' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new URLSearchParams(body).get('payload') ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const click = readSlackApprovalClick(payload);
  if (!click) return new NextResponse(null, { status: 200 });

  after(async () => {
    const outcome = await decideSlackApprovalFromSlack(getNeonDb(), click);
    await replyInSlack(click.responseUrl, interactionReply(outcome));
    if (outcome.kind === 'decided') {
      await recordAuditEvent({
        userId: outcome.userId,
        eventType: 'tool_approval_decided',
        endpoint: ENDPOINT,
        organizationId: outcome.organizationId,
        detail: {
          resourceType: 'slack_run',
          resourceId: click.runId,
          source: 'slack',
          status: outcome.decision,
          count: outcome.toolCallCount,
        },
      });
      await outcome.resume();
    }
  });
  return new NextResponse(null, { status: 200 });
}

export const POST = withErrorHandler(handleSlackInteraction);
