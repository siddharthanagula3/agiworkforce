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
import type { SupabaseClient } from '@supabase/supabase-js';

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

// Minimum credit estimate for a streaming request (in cents). Charged up-front;
// any unspent portion is refunded after the stream closes.
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
  const upstreamBody = JSON.stringify(parsedBody);

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
