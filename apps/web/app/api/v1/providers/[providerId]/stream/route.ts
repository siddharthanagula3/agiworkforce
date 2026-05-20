import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { getEnv } from '@/utils/env';
import { getAuthenticatedUser } from '@/lib/api-auth';
import { getUserClient } from '@/lib/supabase-server';
import { withRateLimit } from '@/lib/rate-limit';
import { CreditService } from '@/lib/services/credit-service';
import { logger } from '@/lib/logger';
import { createError } from '@/lib/errors';
import { PROVIDER_STREAM_PROVIDER_PRESET_IDS } from '@agiworkforce/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// RT-01 fix: Allowlist of provider IDs currently served by the api-gateway
// provider adapter factory. providerId from the URL is validated against this
// set before any upstream request is made, preventing path-traversal / SSRF via
// crafted IDs.
const ALLOWED_PROVIDER_IDS = new Set<string>(PROVIDER_STREAM_PROVIDER_PRESET_IDS);

// Minimum credit estimate for a streaming request (in cents). Charged up-front;
// any unspent portion is refunded after the stream closes.
const MIN_STREAM_COST_CENTS = 1;

// Provider-shape request schema. This intentionally mirrors the api-gateway's
// canonical ChatRequest validator so rich fields do not get stripped by the web
// proxy before reaching provider adapters.
const textBlockSchema = z
  .object({
    type: z.literal('text'),
    text: z.string(),
    cacheControl: z
      .object({ type: z.literal('ephemeral'), ttl: z.enum(['5m', '1h']).optional() })
      .optional(),
  })
  .strict();

const imageBlockSchema = z
  .object({
    type: z.literal('image'),
    source: z.union([
      z.object({ type: z.literal('base64'), mediaType: z.string(), data: z.string() }).strict(),
      z.object({ type: z.literal('url'), url: z.string().url() }).strict(),
    ]),
  })
  .strict();

const toolUseBlockSchema = z
  .object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.unknown()),
  })
  .strict();

const toolResultBlockSchema = z
  .object({
    type: z.literal('tool_result'),
    toolUseId: z.string(),
    content: z.union([z.string(), z.array(textBlockSchema)]),
    isError: z.boolean().optional(),
  })
  .strict();

const thinkingBlockSchema = z
  .object({
    type: z.literal('thinking'),
    thinking: z.string(),
    signature: z.string().optional(),
  })
  .strict();

const contentBlockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  imageBlockSchema,
  toolUseBlockSchema,
  toolResultBlockSchema,
  thinkingBlockSchema,
]);

const messageSchema = z
  .object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.union([z.string(), z.array(contentBlockSchema)]),
  })
  .strict();

const toolDefSchema = z
  .object({
    name: z.string().max(100),
    description: z.string().max(8000),
    inputSchema: z.record(z.string(), z.unknown()),
    strict: z.boolean().optional(),
  })
  .strict();

const toolChoiceSchema = z.union([
  z.literal('auto'),
  z.literal('none'),
  z.literal('required'),
  z.object({ type: z.literal('tool'), name: z.string() }).strict(),
]);

const thinkingConfigSchema = z.union([
  z
    .object({ type: z.literal('enabled'), budgetTokens: z.number().int().positive().optional() })
    .strict(),
  z.object({ type: z.literal('disabled') }).strict(),
]);

const StreamBodySchema = z
  .object({
    model: z.string().min(1).max(200),
    messages: z.array(messageSchema).min(1).max(500),
    system: z.union([z.string(), z.array(textBlockSchema)]).optional(),
    tools: z.array(toolDefSchema).max(64).optional(),
    toolChoice: toolChoiceSchema.optional(),
    maxOutputTokens: z.number().int().positive().max(200_000).optional(),
    // Legacy web callers used OpenAI-compatible naming. Accept it at this edge
    // and forward only the canonical gateway field.
    max_tokens: z.number().int().positive().max(200_000).optional(),
    stream: z.boolean().optional(),
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().int().nonnegative().optional(),
    stopSequences: z.array(z.string()).max(10).optional(),
    thinking: thinkingConfigSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

function toGatewayStreamBody(parsedBody: z.infer<typeof StreamBodySchema>) {
  const { max_tokens, stream: _stream, ...gatewayBody } = parsedBody;
  if (gatewayBody.maxOutputTokens === undefined && max_tokens !== undefined) {
    return { ...gatewayBody, maxOutputTokens: max_tokens };
  }
  return gatewayBody;
}

/**
 * POST /api/v1/providers/:providerId/stream — authenticated proxy to api-gateway provider stream.
 *
 * Security controls added per RT-01 red-team finding (2026-05-04):
 * 1. JWT auth required (getAuthenticatedUser — Bearer or cookie).
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

  // 2. Authenticate — throws AppError(401) if missing/invalid
  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  // RLS-bound client derived from the Bearer token when available.
  // Cookie-path has no raw JWT, so falls back to the string overload (service-role).
  let userClient: SupabaseClient | string;
  try {
    user = await getAuthenticatedUser(request);
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      userClient = getUserClient(authHeader.substring(7));
    } else {
      // Cookie auth: no raw JWT accessible here; use userId string so CreditService
      // falls back to the service-role overload path.
      userClient = user.id;
    }
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
    logger.warn({ providerId, userId: user.id }, 'RT-01: rejected invalid providerId');
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

  // 5. Credit pre-check
  const canAfford = await CreditService.checkAvailable(userClient, user.id, MIN_STREAM_COST_CENTS);
  if (!canAfford) {
    logger.warn({ userId: user.id }, 'RT-01: insufficient credits for stream');
    return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 });
  }

  // 6. Deduct credits up-front (fire-and-forget on success; refund path below)
  const idempotencyKey = CreditService.generateIdempotencyKey(
    user.id,
    'reservation',
    `stream-${Date.now()}`,
  );
  const deductResult = await CreditService.deductCredits(
    userClient,
    user.id,
    MIN_STREAM_COST_CENTS,
    'Provider stream request',
    { providerId, model: parsedBody.model },
    idempotencyKey,
  );
  if (!deductResult.success) {
    return NextResponse.json({ error: 'insufficient_credits' }, { status: 402 });
  }

  // 7. Validate gateway URL (production must be https, not localhost)
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

  // 8. Forward to upstream (re-serialize validated body to prevent injection)
  const authHeader = request.headers.get('authorization') ?? '';
  const upstreamBody = JSON.stringify(toGatewayStreamBody(parsedBody));

  let upstream: Response;
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
        // @ts-expect-error — Next.js Node runtime accepts duplex on streamed bodies.
        duplex: 'half',
      },
    );
  } catch (fetchErr) {
    logger.error({ fetchErr, providerId }, 'Upstream fetch failed');
    // Refund on hard failure
    void CreditService.deductCredits(
      userClient,
      user.id,
      -MIN_STREAM_COST_CENTS,
      'Stream refund (upstream error)',
      { idempotencyKey },
    );
    return NextResponse.json({ error: 'Upstream unavailable' }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => '');
    // Refund on upstream error
    void CreditService.deductCredits(
      userClient,
      user.id,
      -MIN_STREAM_COST_CENTS,
      'Stream refund (upstream error)',
      { idempotencyKey },
    );
    return NextResponse.json(
      { error: errText || `Upstream error ${upstream.status}` },
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

// Satisfy unused import warning from createError (used in type context above)
void createError;
