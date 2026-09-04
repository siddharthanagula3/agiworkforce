import 'server-only';

import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse, after } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { ALLOWED_MANAGED_PROVIDER_HOSTS, validateBaseUrl } from '@agiworkforce/provider-runtime';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getNeonDb } from '@/lib/server/neon-db';
import { buildServerProviderAdapter } from '@/lib/services/provider-adapter-service';
import { providerProxyAuthHeader, providerProxyDefaultBaseUrl } from '@/lib/e2b/provider-proxy';
import { verifyProviderProxyToken } from '@/lib/e2b/provider-proxy-token';
import { MANAGED_CLOUD_E2B_TENANT_ID, getE2BSession } from '@/lib/e2b/session-store';
import {
  invalidateCachedProviderProxyAccess,
  readCachedProviderProxyAccess,
  writeCachedProviderProxyAccess,
} from '@/lib/e2b/provider-proxy-access-cache';
import {
  getProviderProxyUsageParser,
  type ProviderProxyUsage,
} from '@/lib/e2b/provider-proxy-usage';
import {
  evaluateManagedComputeAccess,
  type ManagedComputeAccessDecision,
} from '@/lib/services/managed-compute-access';
import { resolveCloudCodeSessionOwnerOrganizationId } from '@/lib/services/cloud-code-session-service';
import { SubscriptionService } from '@/lib/services/subscription-service';
import { LLMCostCalculator } from '@/lib/services/llm-cost-calculator';
import { recordSettledProviderCost } from '@/lib/services/cogs-ledger-service';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ sessionId: string; path: string[] }> };

const HOP_BY_HOP_REQUEST_HEADERS: ReadonlySet<string> = new Set([
  'host',
  'connection',
  'content-length',
  'x-api-key',
  'authorization',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-vercel-id',
  'x-vercel-deployment-url',
]);

function proxyError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { message, type: 'invalid_request_error', code } }, { status });
}

function bearerToken(header: string | null): string | null {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

/**
 * The gate every other platform-funded compute entry point under
 * `api/code` already runs before a billable call. This is the highest-volume
 * one: every inference the sandboxed harness makes for the life of a session
 * lands here, so a session that goes `billing_read_only` mid-session must
 * stop being served here, not just refused at session creation.
 *
 * Cached per session (see `provider-proxy-access-cache.ts`) so the hot path
 * does not add a database read to every proxied call; only an ALLOWED
 * decision is cached, and for a bounded window, so the exposure a stale
 * cache entry creates is small and self-healing rather than open-ended.
 */
async function evaluateProviderProxyAccess(
  db: DatabaseAdapter,
  userId: string,
  sessionId: string,
): Promise<ManagedComputeAccessDecision> {
  const cached = await readCachedProviderProxyAccess(sessionId);
  if (cached) return cached;

  const [subscription, organizationId] = await Promise.all([
    SubscriptionService.getSubscription(db, userId),
    resolveCloudCodeSessionOwnerOrganizationId(db, userId, sessionId),
  ]);
  const decision = await evaluateManagedComputeAccess(db, userId, subscription, 'cli', {
    organizationId,
  });

  if (decision.allowed) {
    await writeCachedProviderProxyAccess(sessionId, decision);
  } else {
    await invalidateCachedProviderProxyAccess(sessionId);
  }
  return decision;
}

function isEventStreamResponse(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('text/event-stream');
}

function usageToLedgerTokens(usage: ProviderProxyUsage): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  cacheCreation1hInputTokens: number;
} {
  return {
    promptTokens: usage.inputTokens,
    completionTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens,
    cacheReadInputTokens: usage.cacheReadTokens,
    cacheCreationInputTokens: usage.cacheWriteTokens,
    cacheCreation1hInputTokens: usage.cacheWrite1hTokens,
  };
}

/**
 * Settle one proxied call's provider spend, the same funnel
 * `finalizeManagedUsageRequest` uses. Never thrown out of: this runs inside
 * `after()`, well after the proxied response has already reached the
 * sandbox, so a failure here can only be logged, never surfaced to the
 * caller.
 */
async function settleProviderProxyUsage(input: {
  userId: string;
  sessionId: string;
  providerId: string;
  usage: ProviderProxyUsage;
  delivered: boolean;
}): Promise<void> {
  const { usage } = input;
  if (usage.inputTokens <= 0 && usage.outputTokens <= 0) return;
  if (!usage.model) {
    logger.warn(
      { sessionId: input.sessionId, providerId: input.providerId },
      '[e2b] provider-proxy observed token usage with no model id; cost not recorded',
    );
    return;
  }

  try {
    const actualCostCents = LLMCostCalculator.calculateCost(
      input.providerId,
      usage.model,
      usageToLedgerTokens(usage),
    );
    await recordSettledProviderCost({
      userId: input.userId,
      provider: input.providerId,
      model: usage.model,
      actualCostCents,
      sourceRef: `provider_proxy:${input.sessionId}:${randomUUID()}`,
      taskOutcome: input.delivered ? 'delivered' : 'undelivered',
      taskRef: input.sessionId,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        cacheWrite1hTokens: usage.cacheWrite1hTokens,
      },
    });
  } catch (err) {
    logger.error(
      { err, sessionId: input.sessionId, providerId: input.providerId },
      '[e2b] provider-proxy could not record settled provider cost',
    );
  }
}

/**
 * Tees the upstream body to the caller unchanged while it is read once more,
 * off to the side, to recover usage. Settlement fires from `after()` once the
 * stream ends (clean completion) or aborts (the sandbox or the client
 * disconnects), recording whatever usage was observed either way, without
 * delaying a single byte of the response the harness is waiting on.
 *
 * `getProviderProxyUsageParser` selects the parser by provider id: today only
 * Anthropic is covered, an OpenAI-compatible parser slots in there without
 * this function or the route changing.
 */
function attachUsageSettlement(
  upstreamResponse: Response,
  input: { userId: string; sessionId: string; providerId: string },
): ReadableStream<Uint8Array> | null {
  const body = upstreamResponse.body;
  if (!body) return null;

  const resolvedParser = getProviderProxyUsageParser(input.providerId);
  if (!resolvedParser) {
    logger.error(
      { sessionId: input.sessionId, providerId: input.providerId },
      '[e2b] provider-proxy has no usage parser for a credential-proxy-covered provider; spend on this call will not be recorded',
    );
    return body;
  }
  // Narrowing a `const` this way, rather than referencing `resolvedParser`
  // directly inside `settleOnce` below, is deliberate: TypeScript resets
  // narrowing at a nested function boundary, so the closure would otherwise
  // see the pre-guard `ProviderProxyUsageParser | null` type.
  const parser = resolvedParser;

  const streamAccumulator = isEventStreamResponse(upstreamResponse)
    ? parser.createStreamAccumulator()
    : null;
  const decoder = new TextDecoder();
  let jsonBuffer = '';
  let settled = false;
  let resolveUsage!: (usage: ProviderProxyUsage | null) => void;
  let resolveDelivered!: (delivered: boolean) => void;
  const usageSignal = new Promise<ProviderProxyUsage | null>((resolve) => {
    resolveUsage = resolve;
  });
  const deliveredSignal = new Promise<boolean>((resolve) => {
    resolveDelivered = resolve;
  });

  function settleOnce(delivered: boolean): void {
    if (settled) return;
    settled = true;
    let usage: ProviderProxyUsage | null = null;
    try {
      if (streamAccumulator) {
        usage = streamAccumulator.finish();
      } else if (jsonBuffer.trim().length > 0) {
        usage = parser.parseJsonBody(JSON.parse(jsonBuffer));
      }
    } catch (err) {
      logger.warn(
        { err, sessionId: input.sessionId, providerId: input.providerId },
        '[e2b] provider-proxy could not parse usage from the upstream response',
      );
    }
    resolveUsage(usage);
    resolveDelivered(delivered);
  }

  // The DOM lib's `Transformer` type predates the Streams spec update that
  // added `cancel` (invoked when the readable side, i.e. the client, is the
  // one that disconnects, distinct from `flush`'s clean end-of-stream). Node
  // implements it; typing the transformer object through this wider local
  // interface, then handing the already-typed value to the constructor,
  // reflects that without an excess-property error on the literal.
  interface TransformerWithCancel<I, O> extends Transformer<I, O> {
    cancel?(reason?: unknown): void | PromiseLike<void>;
  }
  const transformer: TransformerWithCancel<Uint8Array, Uint8Array> = {
    transform(chunk, controller) {
      controller.enqueue(chunk);
      const text = decoder.decode(chunk, { stream: true });
      if (streamAccumulator) streamAccumulator.push(text);
      else jsonBuffer += text;
    },
    flush() {
      settleOnce(true);
    },
    cancel() {
      settleOnce(false);
    },
  };
  const transform = new TransformStream<Uint8Array, Uint8Array>(transformer);

  after(
    (async () => {
      const usage = await usageSignal;
      if (!usage) return;
      const delivered = await deliveredSignal;
      await settleProviderProxyUsage({ ...input, usage, delivered });
    })(),
  );

  return body.pipeThrough(transform);
}

async function handleProxy(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse | Response> {
  const { sessionId, path } = await context.params;

  const incomingToken =
    request.headers.get('x-api-key') ?? bearerToken(request.headers.get('authorization'));
  if (!incomingToken) {
    return proxyError(401, 'provider_proxy_token_missing', 'No session credential was presented.');
  }

  const verified = verifyProviderProxyToken(incomingToken);
  if (!verified || verified.sessionId !== sessionId) {
    return proxyError(
      401,
      'provider_proxy_token_invalid',
      'This session credential is invalid or has expired.',
    );
  }

  const limited = await withRateLimit(request, 'code-provider-proxy', `user:${verified.userId}`);
  if (limited) return limited;

  const session = await getE2BSession({
    tenantId: MANAGED_CLOUD_E2B_TENANT_ID,
    userId: verified.userId,
    resource: { kind: 'code_session', id: sessionId },
  });
  if (!session) {
    return proxyError(401, 'provider_proxy_session_ended', 'This Code session has ended.');
  }

  const db = getNeonDb();
  const accessDecision = await evaluateProviderProxyAccess(db, verified.userId, sessionId);
  if (!accessDecision.allowed) {
    return proxyError(403, accessDecision.code, accessDecision.reason);
  }

  const providerId = verified.providerId;
  const authHeaderName = providerProxyAuthHeader(providerId);
  if (!authHeaderName) {
    return proxyError(
      502,
      'provider_proxy_unavailable',
      'This provider is not covered by the credential proxy.',
    );
  }

  let apiKey: string | undefined;
  let configuredBaseUrl: string | undefined;
  try {
    const adapter = buildServerProviderAdapter(providerId);
    apiKey = adapter.config.apiKey;
    configuredBaseUrl = adapter.config.baseUrl;
  } catch (err) {
    logger.error(
      { err, providerId, sessionId },
      '[e2b] provider-proxy has no managed key configured for this provider',
    );
  }
  if (!apiKey) {
    return proxyError(
      502,
      'provider_proxy_unavailable',
      'This coding agent has no managed credential configured.',
    );
  }

  const upstreamBase = configuredBaseUrl ?? providerProxyDefaultBaseUrl(providerId);
  if (!upstreamBase) {
    return proxyError(
      502,
      'provider_proxy_unavailable',
      'This provider has no configured endpoint.',
    );
  }
  const upstreamPath = path.map(encodeURIComponent).join('/');
  const upstreamCandidate = `${upstreamBase.replace(/\/+$/, '')}/${upstreamPath}${request.nextUrl.search}`;
  const validated = validateBaseUrl(upstreamCandidate, {
    allowedHosts: ALLOWED_MANAGED_PROVIDER_HOSTS,
  });
  if (!validated.ok) {
    logger.error(
      { providerId, reason: validated.reason, sessionId },
      '[e2b] provider-proxy refused a non-allowlisted upstream host',
    );
    return proxyError(
      502,
      'provider_proxy_unavailable',
      'This provider endpoint is not allowlisted.',
    );
  }

  const forwardHeaders = new Headers();
  for (const [key, value] of request.headers) {
    if (!HOP_BY_HOP_REQUEST_HEADERS.has(key.toLowerCase())) forwardHeaders.set(key, value);
  }
  forwardHeaders.set(
    authHeaderName,
    authHeaderName.toLowerCase() === 'authorization' ? `Bearer ${apiKey}` : apiKey,
  );

  const method = request.method.toUpperCase();
  const forwardsBody = method !== 'GET' && method !== 'HEAD';

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(validated.url, {
      method,
      headers: forwardHeaders,
      ...(forwardsBody ? { body: request.body, duplex: 'half' } : {}),
    } as RequestInit);
  } catch (err) {
    logger.error({ err, providerId, sessionId }, '[e2b] provider-proxy upstream request failed');
    return proxyError(
      502,
      'provider_proxy_unavailable',
      'The upstream provider could not be reached.',
    );
  }

  logger.info(
    { sessionId, providerId, path: upstreamPath, status: upstreamResponse.status },
    '[e2b] provider-proxy forwarded a request',
  );

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  const meteredBody = attachUsageSettlement(upstreamResponse, {
    userId: verified.userId,
    sessionId,
    providerId,
  });
  return new Response(meteredBody, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
