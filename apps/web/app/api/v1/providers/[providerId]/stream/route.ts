import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { getEnv } from '@/utils/env';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import { withRateLimit } from '@/lib/rate-limit';
import { CreditService } from '@/lib/services/credit-service';
import { logger } from '@/lib/logger';
import { buildManagedComputeGateResponse } from '@/lib/managed-compute-gate';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// RT-01 fix: Allowlist of valid provider IDs. Must match the canonical IDs used by
// the api-gateway. providerId from the URL is validated against this set before any
// upstream request is made, preventing path-traversal / SSRF via crafted IDs.
const ALLOWED_PROVIDER_IDS = new Set([
  'anthropic',
  'openai',
  'google',
  'xai',
  'deepseek',
  'perplexity',
  'qwen',
  'moonshot',
  'zhipu',
  'ollama',
  'lmstudio',
]);

// Minimum credit reservation for a streaming request (in cents). This proxy
// refunds the reservation when upstream fails before a stream is handed off.
const MIN_STREAM_COST_CENTS = 1;

// Zod schema for the request body. Only validates structural shape; detailed
// parameter validation is the api-gateway's responsibility.
const StreamBodySchema = z.object({
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.union([z.string(), z.array(z.unknown())]),
      }),
    )
    .min(1),
  max_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

function validateGatewayUrl(): string | NextResponse {
  const gatewayUrl = getEnv('API_GATEWAY_URL', 'http://localhost:3000').replace(/\/+$/, '');

  if (process.env.NODE_ENV === 'production') {
    try {
      const parsed = new URL(gatewayUrl);
      if (parsed.protocol !== 'https:') {
        logger.error({ gatewayUrl }, 'RT-01: API_GATEWAY_URL must use https in production');
        return NextResponse.json({ error: 'Gateway misconfigured' }, { status: 503 });
      }
    } catch {
      return NextResponse.json({ error: 'Gateway misconfigured' }, { status: 503 });
    }
  }

  return gatewayUrl;
}

function getStreamRequestId(request: NextRequest): string {
  const rawHeader = request.headers.get('idempotency-key')?.trim();
  if (rawHeader && /^[a-zA-Z0-9._:-]{8,128}$/.test(rawHeader)) {
    return rawHeader;
  }
  return randomUUID();
}

async function refundStreamReservation(params: {
  db: ReturnType<typeof getNeonDb>;
  userId: string;
  providerId: string;
  model: string;
  requestId: string;
  reason: string;
}) {
  const refundKey = CreditService.generateIdempotencyKey(params.userId, 'refund', params.requestId);
  const result = await CreditService.deductCredits(
    params.db,
    params.userId,
    -MIN_STREAM_COST_CENTS,
    'Stream refund (upstream error)',
    {
      provider: params.providerId,
      providerId: params.providerId,
      model: params.model,
      requestId: params.requestId,
      reason: params.reason,
      type: 'refund',
    },
    refundKey,
  );

  if (!result.success) {
    logger.error(
      { providerId: params.providerId, userId: params.userId, requestId: params.requestId, result },
      'Stream refund failed',
    );
  }
}

/**
 * POST /api/v1/providers/:providerId/stream · authenticated proxy to api-gateway provider stream.
 *
 * Security controls added per RT-01 red-team finding (2026-05-04):
 * 1. JWT auth required (getAuthenticatedUser · Bearer or cookie).
 * 2. Per-user rate limiting via withRateLimit('llm-streaming').
 * 3. Credit pre-check and deduction before upstream call.
 * 4. providerId validated against ALLOWED_PROVIDER_IDS allowlist.
 * 5. Request body validated with Zod schema.
 * 6. API_GATEWAY_URL validated against https scheme in production.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> },
): Promise<Response> {
  // 1. Rate limit (IP + JWT-based identifier from withRateLimit internals)
  const rateLimitResponse = await withRateLimit(request, 'llm-streaming');
  if (rateLimitResponse) return rateLimitResponse;

  // 2. Authenticate · throws AppError(401) if missing/invalid
  let userId: string;
  try {
    const auth = await getClerkAuthUser(request);
    userId = auth.userId;
  } catch (err) {
    if (err && typeof err === 'object' && 'statusCode' in err) {
      const appErr = err as { statusCode: number; message: string };
      return NextResponse.json({ error: appErr.message }, { status: appErr.statusCode });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // 3. Validate providerId against allowlist
  const { providerId } = await params;
  if (!ALLOWED_PROVIDER_IDS.has(providerId)) {
    logger.warn({ providerId, userId }, 'RT-01: rejected invalid providerId');
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  // 4. Parse and validate body
  let rawBody: string;
  let parsedBody: z.infer<typeof StreamBodySchema>;
  try {
    rawBody = await request.text();
    parsedBody = StreamBodySchema.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const managedGateResponse = buildManagedComputeGateResponse(request, {
    provider: providerId,
    model: parsedBody.model,
    feature: 'provider_stream',
  });
  if (managedGateResponse) return managedGateResponse;

  const gatewayUrlOrResponse = validateGatewayUrl();
  if (typeof gatewayUrlOrResponse !== 'string') return gatewayUrlOrResponse;

  const gatewayUrl = gatewayUrlOrResponse;
  const requestId = getStreamRequestId(request);
  const db = getNeonDb();

  // 5. Credit pre-check
  const canAfford = await CreditService.checkAvailable(db, userId, MIN_STREAM_COST_CENTS);
  if (!canAfford) {
    logger.warn({ userId }, 'RT-01: insufficient credits for stream');
    return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 });
  }

  // 6. Deduct credits up-front (fire-and-forget on success; refund path below)
  const idempotencyKey = CreditService.generateIdempotencyKey(userId, 'reservation', requestId);
  const deductResult = await CreditService.deductCredits(
    db,
    userId,
    MIN_STREAM_COST_CENTS,
    'Provider stream request',
    { provider: providerId, providerId, model: parsedBody.model },
    idempotencyKey,
  );
  if (!deductResult.success) {
    return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 });
  }

  // 8. Forward to upstream (re-serialize validated body to prevent injection)
  const authHeader = request.headers.get('authorization') ?? '';
  const upstreamBody = JSON.stringify(parsedBody);

  let upstream: Response;
  const connectController = new AbortController();
  const connectTimeout = setTimeout(() => connectController.abort(), 30_000);
  try {
    upstream = await fetch(
      `${gatewayUrl}/api/v1/providers/${encodeURIComponent(providerId)}/stream`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-requested-with': 'agiworkforce-web',
          ...(authHeader ? { authorization: authHeader } : {}),
        },
        body: upstreamBody,
        signal: connectController.signal,
        // @ts-expect-error · Next.js Node runtime accepts duplex on streamed bodies.
        duplex: 'half',
      },
    );
  } catch (fetchErr) {
    logger.error({ fetchErr, providerId }, 'Upstream fetch failed');
    await refundStreamReservation({
      db,
      userId,
      providerId,
      model: parsedBody.model,
      requestId,
      reason: 'fetch_exception',
    });
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502 });
  } finally {
    clearTimeout(connectTimeout);
  }

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => '');
    await refundStreamReservation({
      db,
      userId,
      providerId,
      model: parsedBody.model,
      requestId,
      reason: `upstream_${upstream.status || 502}`,
    });
    logger.warn({ providerId, status: upstream.status, error: errText }, 'Upstream stream failed');
    return NextResponse.json(
      { error: `Upstream error ${upstream.status || 502}` },
      { status: upstream.status || 502 },
    );
  }

  // Pass the SSE stream straight through.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}

// Re-export for test access
export { ALLOWED_PROVIDER_IDS };
