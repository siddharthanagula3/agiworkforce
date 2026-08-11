/**
 * @file LLM Proxy Routes — Managed Cloud Model Access
 * @security
 * - Rate limiting: Server-enforced per route
 * - Input validation: Zod schemas with .strict() to reject unexpected fields
 * - Authentication: JWT required (via authenticateToken)
 * - Plan enforcement: Canonical plan and model-tier admission
 * - Server-side API keys: Never exposed to client
 *
 * Proxies OpenAI-compatible LLM requests (desktop ManagedCloudProvider and
 * other managed-cloud clients) to upstream providers through the canonical
 * `packages/ai/providers` adapters (restructure Wave 2). Request/response wire
 * conversion lives in `@agiworkforce/provider-protocol` (`openai-wire-compat`),
 * shared with the web v1 route, so the OpenAI-compatible contract stays
 * byte-stable while provider mechanics live in one place.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  canAccessModelForSubscriptionTier,
  canUseBillingPlanCapability,
  effectivePlanTier,
  getAllowedModelsForTier,
  getMinimumRequiredTier,
  getModelMetadataById,
  isEntitledSubscriptionStatus,
  type Provider as CatalogProvider,
  type ProviderAdapter,
  type StreamChunk,
  type StreamChunkStop,
  type StreamChunkUsage,
} from '@agiworkforce/types';
import {
  OpenAIWireAssembler,
  openAIWireRequestToChatRequest,
  toProviderApiModelId,
  type OpenAIWireChatRequest,
} from '@agiworkforce/provider-protocol';
import { CredentialFailoverState } from '@agiworkforce/provider-runtime';
import { authenticateToken } from '../middleware/auth';
import type { CloudSurfaceClass } from '../authenticated-user';
import { AppError } from '../middleware/errorHandler';
import { getUserScopedClient } from '../lib/neonClients';
import { requireManagedComputeEligibility } from '../middleware/managedComputeGate';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';
import { buildProviderAdapter, type ProviderId } from '../lib/providerAdapters';
import {
  incompleteStreamFailure,
  isCanonicalStreamChunk,
  isFailoverEligibleFailure,
  malformedStreamFailure,
  toSafeProviderFailure,
  type SafeProviderFailure,
} from '../lib/providerStreamSafety';
import { createStreamLifecycle, StreamClientAbortError } from '../lib/streamLifecycle';
import {
  estimateAbandonedStreamUsage,
  finalizeManagedUsage,
  ManagedUsageBillingError,
  markManagedUsageClientDelivered,
  markManagedUsageProviderStarted,
  parseManagedUsageIdempotencyKey,
  reserveManagedUsage,
  type ManagedUsageIdentity,
  type ManagedUsageRequestBody,
} from '../services/managedUsageBilling';
import {
  toolCallResponseSchema,
  toolChoiceSchema,
  toolDefinitionSchema,
} from '../lib/llmToolSchemas';

const router: Router = Router();

router.use(authenticateToken);
// SECURITY: Baseline rate limit for all LLM endpoints (100/min fallback)
router.use(createRateLimiter('default'));

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Models allowed on the Basic tier — derived from the shared model catalog.
 *
 * The catalog SSOT keeps `tierAllowedModels.economy` as the canonical
 * Basic + Free model list.
 * Reading the set here keeps the gateway in sync with picker UI, web
 * surface, and CLI without a separately-curated allow-list that drifts.
 *
 * Exported for unit tests; not part of the route API.
 */
export const BASIC_ALLOWED_MODELS: ReadonlySet<string> = new Set(
  getAllowedModelsForTier('economy'),
);

/**
 * Tier model sets are catalog-derived. Basic receives economy models, Pro and
 * Team add pro_additions, and Max/Max 15x/Enterprise add flagships. Free chat
 * uses the economy set under its private server-side allowance.
 */
export const PRO_ALLOWED_MODELS: ReadonlySet<string> = new Set([
  ...getAllowedModelsForTier('economy'),
  ...getAllowedModelsForTier('pro_additions'),
]);

export const FLAGSHIP_ALLOWED_MODELS: ReadonlySet<string> = new Set([
  ...PRO_ALLOWED_MODELS,
  ...getAllowedModelsForTier('flagship_additions'),
]);

/** Hard upper bound for one managed-provider request, including streaming. */
const LLM_PROVIDER_DEADLINE_MS = 10 * 60 * 1_000;

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.union([z.string(), z.array(z.any())]),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(toolCallResponseSchema).max(32).optional(),
});

const chatCompletionSchema = z
  .object({
    model: z.string().min(1).max(100),
    messages: z.array(messageSchema).min(1),
    stream: z.boolean().optional().default(false),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().min(1).max(200_000).optional(),
    tools: z.array(toolDefinitionSchema).max(64).optional(),
    tool_choice: toolChoiceSchema.optional(),
  })
  .strict();

// =============================================================================
// HELPERS
// =============================================================================

// Providers this proxy forwards to: every cloud adapter wired in
// lib/providerAdapters.ts (restructure Wave 2 step 2 widened this from the
// first-party trio to all eleven cloud providers). Local-device providers
// (ollama unless the server deploys one, lmstudio always) stay out of the
// managed proxy; models from unwired providers fail closed with a 400.
type Provider = Exclude<ProviderId, 'ollama'>;

const PROXIED_PROVIDERS: ReadonlySet<CatalogProvider> = new Set<CatalogProvider>([
  'anthropic',
  'openai',
  'google',
  'deepseek',
  'xai',
  'perplexity',
  'minimax',
  'moonshot',
  'qwen',
  'zhipu',
  'open_router',
]);

/**
 * Resolve which upstream provider to call for a given model ID.
 *
 * Catalog-driven (P0-I): the lookup reads `models.json` via
 * `getModelMetadataById()` so a model rename or provider re-attribution
 * lands here without code edits. Fails closed with a 400 if (a) the
 * model is not in the catalog at all or (b) the model belongs to a
 * provider without a registered managed-gateway adapter (for example,
 * local-device-only LM Studio).
 *
 * Exported for unit tests; not part of the route API.
 */
export function resolveProvider(model: string): Provider {
  const metadata = getModelMetadataById(model);
  if (!metadata) {
    throw new AppError(`Unsupported model: ${model}`, 400);
  }

  if (!PROXIED_PROVIDERS.has(metadata.provider)) {
    throw new AppError(
      `Model "${model}" belongs to provider "${metadata.provider}" which the api-gateway does not proxy.`,
      400,
    );
  }

  return metadata.provider as Provider;
}

/**
 * Check the user's subscription tier and enforce model access.
 * Returns the tier string.
 *
 * P1-GW-RLS: `subscriptions` has RLS enabled+forced with a policy keyed on
 * `user_id = current_app_user_id()` (0037_rls_user_isolation.sql), so this
 * runs through real Postgres RLS via getUserScopedClient's withUser(token)
 * binding — a DB-level backstop behind the `.eq('user_id', userId)` filter
 * below, not a replacement for it. Keep the filter.
 *
 * Exported for unit tests; not part of the route API.
 */
export async function enforcePlanTier(
  userId: string,
  token: string,
  model: string,
  surface: CloudSurfaceClass = 'app',
): Promise<string> {
  const userDb = getUserScopedClient({ userId, token });
  const { data: subscription, error } = await userDb
    .from('subscriptions')
    .select('plan_tier, status')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error({ error, userId }, 'LLM proxy: failed to fetch subscription');
    throw new AppError('Service temporarily unavailable', 503);
  }

  const rawTier = subscription?.plan_tier ?? 'free';
  if (
    subscription &&
    rawTier.toLowerCase() !== 'free' &&
    !isEntitledSubscriptionStatus(subscription.status)
  ) {
    logger.warn(
      { userId, tier: rawTier, status: subscription.status, surface },
      'LLM proxy: paid subscription is inactive, failing closed',
    );
    throw new AppError(
      `Subscription is ${subscription.status ?? 'inactive'}. Please update your payment method.`,
      403,
    );
  }

  // Preserve the existing fail-closed behavior for a corrupt empty-string
  // database tier. A missing row/null tier is the legitimate Free case, but
  // an explicitly stored empty tier must not silently gain Free admission.
  const tier =
    subscription?.plan_tier === ''
      ? subscription.plan_tier
      : effectivePlanTier(rawTier, subscription?.status);
  // Bind the required capability to the trusted surface class. Developer
  // surfaces (CLI/IDE device tokens) require Pro-or-higher developer_surfaces;
  // app surfaces require managed_chat. This closes the header-forgeable
  // developer-surface bypass at the LLM proxy, mirroring the plan-gate.
  const requiredCapability = surface === 'developer' ? 'developer_surfaces' : 'managed_chat';
  if (!canUseBillingPlanCapability(tier, requiredCapability)) {
    logger.warn(
      { userId, tier, surface },
      'LLM proxy: plan lacks managed capability, failing closed',
    );
    throw new AppError(
      surface === 'developer'
        ? 'Managed Cloud CLI and IDE access require Pro or higher.'
        : 'Managed models are not available for this plan',
      403,
    );
  }

  const minimumTier = getMinimumRequiredTier(model);
  if (!minimumTier) {
    throw new AppError(`Model "${model}" is not available on managed cloud.`, 403);
  }

  // Free resolves through the shared catalog gate like every other tier. This
  // previously carried `(tier === 'free' && minimumTier === 'basic')`, which
  // admitted Free to the ENTIRE Economy roster because `getMinimumRequiredTier`
  // is roster-based and reports 'basic' for all of it. apps/web meanwhile sells
  // Free only the models whose `tierPolicy.minTier` is 'free', so the gateway
  // was handing out models the product does not offer on that plan.
  const allowed = canAccessModelForSubscriptionTier(model, tier);
  if (allowed) return tier;

  if (tier === 'free') {
    throw new AppError(`Model "${model}" is not available on the Free plan.`, 403);
  }
  if (minimumTier === 'pro') {
    throw new AppError(`Model "${model}" requires a Pro plan or above.`, 403);
  }
  throw new AppError(`Model "${model}" requires a Max plan or above.`, 403);
}

/**
 * Ordered managed-failover plan header (AUTO-ROUTER-MIGRATION-01).
 *
 * The canonical resolver (`packages/ai/routing` resolveAutoRoute) runs on the
 * client surface and emits registry-ordered, distinct-provider fallback routes
 * for AUTO-PROFILE selections only — explicit user selections always resolve
 * with an empty fallback list, because an explicit selection is a contract
 * the gateway must never silently rewrite. Clients forward that plan as a
 * comma-separated list of catalog model IDs in this header; its absence means
 * "no failover is permitted for this request".
 *
 * The plan rides a header rather than the body so the OpenAI-compatible wire
 * body stays byte-stable (see file docstring) and the billing request-hash /
 * idempotency fingerprint is unaffected by resolver plan recomputation.
 * Entries are advisory candidates: the gateway re-checks catalog membership,
 * proxied-provider support, and tier admission per attempt before use, and
 * never forwards upstream provider model IDs back to the client.
 */
export const MANAGED_FALLBACK_MODELS_HEADER = 'x-agi-fallback-models';

/** Resolver plans hold at most a few distinct-provider routes; bound defensively. */
const MAX_FALLBACK_PLAN_ROUTES = 4;
const FALLBACK_MODEL_ID_PATTERN = /^[A-Za-z0-9._:/-]{1,100}$/;

/**
 * Parse and syntax-validate the fallback plan header. Malformed plans fail
 * closed with a 400 before any billing reservation or provider work. Entries
 * duplicating the primary model or an earlier entry are dropped so the
 * attempt loop stays bounded by distinct routes.
 *
 * Exported for unit tests; not part of the route API.
 */
export function parseFallbackPlanHeader(
  header: string | string[] | undefined,
  primaryModel: string,
): string[] {
  if (header === undefined) return [];
  if (Array.isArray(header)) {
    throw new AppError(`${MANAGED_FALLBACK_MODELS_HEADER} header is invalid`, 400);
  }
  const entries = header.split(',').map((entry) => entry.trim());
  if (entries.length > MAX_FALLBACK_PLAN_ROUTES) {
    throw new AppError(`${MANAGED_FALLBACK_MODELS_HEADER} lists too many fallback routes`, 400);
  }
  const plan: string[] = [];
  for (const entry of entries) {
    if (!FALLBACK_MODEL_ID_PATTERN.test(entry)) {
      throw new AppError(`${MANAGED_FALLBACK_MODELS_HEADER} header is invalid`, 400);
    }
    if (entry === primaryModel || plan.includes(entry)) continue;
    plan.push(entry);
  }
  return plan;
}

/**
 * Characters of provider-generated output carried by one canonical chunk.
 *
 * Thinking and tool-call output count: providers bill them as output tokens
 * exactly like visible text, so an abandoned reasoning or tool-calling stream
 * costs real money even when the client saw no prose. `tool-use-start` carries
 * the emitted tool name, which is why a disconnect between a tool call opening
 * and its first argument delta is still charged rather than fully refunded.
 *
 * This undercounts providers that bill hidden reasoning the stream never
 * carries (including provider reasoning tokens): those turns settle below
 * their true provider cost. It is a floor on what the turn cost, not a
 * reconstruction of the provider's own invoice.
 */
function generatedOutputChars(chunk: StreamChunk): number {
  switch (chunk.type) {
    case 'text-delta':
    case 'thinking-delta':
      return chunk.delta.length;
    case 'tool-use-delta':
      return chunk.deltaJson.length;
    case 'tool-use-start':
      return chunk.name.length;
    default:
      return 0;
  }
}

// GW-2 (audit 2026-05-03): SECURITY GUARDRAIL — upstream requests are built
// exclusively inside `packages/ai/providers` adapters from server env keys.
// NEVER thread `req.headers` (or the user's `Authorization: Bearer <jwt>`)
// into adapter config/fetch — forwarding it upstream would leak the user's
// session token. If a future pattern needs to forward headers selectively,
// add an explicit allowlist — anything else is a security review blocker.

// =============================================================================
// ROUTE: POST /chat/completions
// =============================================================================

/**
 * POST /api/llm/v1/chat/completions
 * Proxy LLM requests to upstream providers with server-side API keys.
 *
 * Accepts OpenAI-compatible request format, routes to the correct provider
 * based on the model catalog, and returns OpenAI-compatible responses.
 *
 * SECURITY: JWT required. Plan tier enforced. Rate limited per tier.
 */
router.post(
  '/chat/completions',
  createRateLimiter('llm-completions'),
  requireManagedComputeEligibility((req) => {
    const model = typeof req.body?.model === 'string' ? req.body.model : 'unknown';
    return { provider: resolveProvider(model), model };
  }),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const body = chatCompletionSchema.parse(req.body);
    let idempotencyKey: string;
    try {
      idempotencyKey = parseManagedUsageIdempotencyKey(req.headers['idempotency-key']);
    } catch (error) {
      if (error instanceof ManagedUsageBillingError) {
        throw new AppError(error.message, error.statusCode);
      }
      throw error;
    }
    const fallbackModels = parseFallbackPlanHeader(
      req.headers[MANAGED_FALLBACK_MODELS_HEADER],
      body.model,
    );
    const provider = resolveProvider(body.model);
    const tier = await enforcePlanTier(user.userId, user.token, body.model, user.surface);

    const adapter = buildProviderAdapter(provider);
    if (!adapter) {
      throw new AppError(`Server is not configured for ${provider} models`, 502);
    }

    const buildChatRequest = (model: string) =>
      openAIWireRequestToChatRequest({
        ...(body as OpenAIWireChatRequest),
        model: toProviderApiModelId(model),
      });

    const usageDb = getUserScopedClient(user);
    let reservation;
    try {
      reservation = await reserveManagedUsage({
        client: usageDb,
        userId: user.userId,
        idempotencyKey,
        provider,
        request: body as ManagedUsageRequestBody,
        // The rolling five-hour, weekly and flagship ceilings are per-tier;
        // without the tier the reservation cannot be capped at all.
        planTier: tier,
      });
      await markManagedUsageProviderStarted({
        client: usageDb,
        userId: user.userId,
        ...reservation,
      });
    } catch (error) {
      if (error instanceof ManagedUsageBillingError) {
        throw new AppError(error.message, error.statusCode);
      }
      throw error;
    }

    const billingIdentity: ManagedUsageIdentity = {
      client: usageDb,
      userId: user.userId,
      idempotencyKey: reservation.idempotencyKey,
      requestHash: reservation.requestHash,
      leaseToken: reservation.leaseToken,
    };
    let billingFinalized = false;
    let providerSuccessObserved = false;
    let actualUsage: Omit<StreamChunkUsage, 'type'> = {};
    // Output characters the current attempt got out of the provider. A client
    // that hangs up or stalls mid-stream never reaches the provider's usage
    // event, so this is the only measure left of what was already generated.
    let servedOutputChars = 0;

    // The route currently serving the request. Starts at the primary and
    // advances only when managed failover rotates to a fallback attempt, so
    // billing settlement, usage events, and response attribution always name
    // the model that actually served (or last attempted) the request.
    let served: { model: string; provider: Provider } = { model: body.model, provider };

    const captureUsage = (chunk: StreamChunkUsage): void => {
      actualUsage = {
        ...actualUsage,
        ...(chunk.inputTokens !== undefined ? { inputTokens: chunk.inputTokens } : {}),
        ...(chunk.outputTokens !== undefined ? { outputTokens: chunk.outputTokens } : {}),
        ...(chunk.cacheReadTokens !== undefined ? { cacheReadTokens: chunk.cacheReadTokens } : {}),
        ...(chunk.cacheWriteTokens !== undefined
          ? { cacheWriteTokens: chunk.cacheWriteTokens }
          : {}),
        ...(chunk.cacheWrite1hTokens !== undefined
          ? { cacheWrite1hTokens: chunk.cacheWrite1hTokens }
          : {}),
        ...(chunk.reasoningTokens !== undefined ? { reasoningTokens: chunk.reasoningTokens } : {}),
      };
    };

    const finalizeBilling = async (outcome: 'completed' | 'failed'): Promise<void> => {
      if (billingFinalized) return;
      await finalizeManagedUsage({
        ...billingIdentity,
        outcome,
        model: served.model,
        ...(outcome === 'completed' ? { usage: actualUsage } : {}),
        estimatedCostCents: reservation.estimatedCostCents,
      });
      billingFinalized = true;
    };

    const releaseFailedReservation = async (reason: string): Promise<void> => {
      if (billingFinalized || providerSuccessObserved) return;
      try {
        await finalizeBilling('failed');
      } catch (error) {
        logger.error(
          {
            userId: user.userId,
            provider: served.provider,
            model: served.model,
            reason,
            billingCode:
              error instanceof ManagedUsageBillingError ? error.code : 'BILLING_UNKNOWN_ERROR',
          },
          'Managed usage reservation release could not be persisted; lease recovery will retry',
        );
      }
    };

    // A client that abandons a stream mid-flight — hanging up, or stalling the
    // socket until the gateway deadline fires — used to land in
    // `releaseFailedReservation`, which refunds the whole reservation and leaves
    // nothing in the rolling windows. The provider had already generated (and
    // charged AGI for) the tokens streamed so far, so walking away one chunk
    // before the end of every turn ran for free. Output the provider actually
    // produced settles as completed instead; abandonment before the first output
    // token still releases, matching `recover_stale_managed_usage_requests`.
    //
    // Scope: this covers CLIENT-caused abandonment only. A mid-stream provider
    // error, a missing stop, or a deadline reached while waiting on the provider
    // still refunds in full — charging a user for the gateway's own failure is a
    // product decision, not this guard's call.
    const settleAbandonedStream = async (): Promise<void> => {
      if (billingFinalized || providerSuccessObserved) return;
      const measured =
        actualUsage.inputTokens !== undefined || actualUsage.outputTokens !== undefined;
      if (!measured && servedOutputChars === 0) return;
      // Claim the terminal transition before awaiting: the finally block below
      // runs `releaseFailedReservation`, which must not refund this stream.
      providerSuccessObserved = true;
      logger.info(
        {
          userId: user.userId,
          provider: served.provider,
          model: served.model,
          servedOutputChars,
          measuredUsage: measured,
        },
        'Managed usage settling an abandoned stream on the output already generated',
      );
      try {
        if (!measured) {
          actualUsage = estimateAbandonedStreamUsage(
            { ...(body as ManagedUsageRequestBody), model: served.model },
            servedOutputChars,
          );
        }
        await finalizeBilling('completed');
      } catch (error) {
        // No safety net behind this: `providerSuccessObserved` is already
        // latched so the `finally` release is suppressed, and lease recovery
        // does not retry a settlement — `recover_stale_managed_usage_requests`
        // (0056) enqueues `-estimated_cost_cents` and marks the row
        // `outcome_unknown`, i.e. exactly the full refund this settle exists to
        // prevent. A failure here therefore loses the charge; it is logged at
        // error level so it is visible rather than silently free.
        logger.error(
          {
            userId: user.userId,
            provider: served.provider,
            model: served.model,
            billingCode:
              error instanceof ManagedUsageBillingError ? error.code : 'BILLING_UNKNOWN_ERROR',
          },
          'Managed usage abandoned-stream settlement failed; the turn will be refunded by lease recovery',
        );
      }
    };

    const markClientDelivered = async (): Promise<void> => {
      try {
        await markManagedUsageClientDelivered(billingIdentity);
      } catch (error) {
        logger.error(
          {
            userId: user.userId,
            provider: served.provider,
            model: served.model,
            billingCode:
              error instanceof ManagedUsageBillingError ? error.code : 'BILLING_UNKNOWN_ERROR',
          },
          'Managed usage client-delivery audit marker could not be persisted',
        );
      }
    };

    logger.info(
      {
        userId: user.userId,
        model: body.model,
        provider,
        tier,
        stream: body.stream,
        messageCount: body.messages.length,
        fallbackRoutes: fallbackModels.length,
      },
      'LLM proxy request',
    );

    const recordUsage = (
      eventType: 'llm_stream' | 'llm_completion',
      usage?: { prompt_tokens?: number; completion_tokens?: number } | null,
    ): void => {
      // PostgrestBuilder.then() returns PromiseLike, not Promise — `.catch`
      // isn't on the prototype. Pair the rejection handler via the 2-arg
      // `.then(onfulfilled, onrejected)` form to swallow rejected inserts
      // (audit 2026-05-20, §14: was leaking unhandledRejection on dropped
      // SSE connections).
      usageDb
        .from('usage_events')
        .insert({
          user_id: user.userId,
          model: served.model,
          provider: served.provider,
          tier,
          event_type: eventType,
          ...(eventType === 'llm_completion'
            ? {
                prompt_tokens: usage?.prompt_tokens ?? null,
                completion_tokens: usage?.completion_tokens ?? null,
              }
            : {}),
          created_at: new Date().toISOString(),
        })
        .then(
          ({ error }) => {
            if (error) logger.debug({ error }, 'Failed to log usage event');
          },
          (err: unknown) => {
            logger.debug({ err }, `Usage event insert rejected (${eventType} path)`);
          },
        );
    };

    // One lifecycle (and one 10-minute deadline) spans the whole request,
    // including every failover attempt: a client disconnect or expired
    // deadline terminates the request, never a rotation.
    const lifecycle = createStreamLifecycle({ deadlineMs: LLM_PROVIDER_DEADLINE_MS });
    let responseComplete = false;

    interface AttemptRoute {
      model: string;
      provider: Provider;
      adapter: ProviderAdapter;
    }

    // Admission is re-checked per attempt at attempt time: a fallback entry
    // that is catalog-unknown, non-proxied, tier-forbidden, or unconfigured is
    // skipped (never served), and the original provider failure surfaces if no
    // admitted candidate remains. Only AppError-class rejections skip — an
    // infrastructure error (unexpected throw) still fails the request.
    const remainingFallbackModels = [...fallbackModels];
    const credentialFailover = new CredentialFailoverState();
    const nextFallbackRoute = async (): Promise<AttemptRoute | null> => {
      while (remainingFallbackModels.length > 0) {
        const candidate = remainingFallbackModels.shift() as string;
        try {
          const candidateProvider = resolveProvider(candidate);
          if (credentialFailover.blocksRoute(candidateProvider)) {
            logger.warn(
              { userId: user.userId, model: candidate, provider: candidateProvider },
              'LLM managed failover candidate skipped: provider credentials already rejected',
            );
            continue;
          }
          await enforcePlanTier(user.userId, user.token, candidate, user.surface);
          const candidateAdapter = buildProviderAdapter(candidateProvider);
          if (!candidateAdapter) {
            logger.warn(
              { userId: user.userId, model: candidate, provider: candidateProvider },
              'LLM managed failover candidate skipped: provider not configured',
            );
            continue;
          }
          return { model: candidate, provider: candidateProvider, adapter: candidateAdapter };
        } catch (error) {
          if (error instanceof AppError) {
            logger.warn(
              { userId: user.userId, model: candidate, statusCode: error.statusCode },
              'LLM managed failover candidate skipped: admission re-check failed',
            );
            continue;
          }
          throw error;
        }
      }
      return null;
    };

    const rotateAfterFailure = async (
      failure: SafeProviderFailure,
    ): Promise<AttemptRoute | null> => {
      if (lifecycle.signal.aborted) return null;
      // A rejected key condemns the provider account, not the request: the
      // remaining plan routes are distinct providers holding distinct keys, so
      // a suspended, revoked or out-of-credit upstream rotates instead of
      // stranding the turn. Recorded before the route lookup so the rejected
      // provider's own remaining routes are skipped rather than replayed.
      const credentialRotation = credentialFailover.recordFailure(
        served.provider,
        failure.category,
      );
      if (!credentialRotation && !isFailoverEligibleFailure(failure)) return null;
      const nextRoute = await nextFallbackRoute();
      if (nextRoute) {
        logger.warn(
          {
            userId: user.userId,
            fromModel: served.model,
            fromProvider: served.provider,
            toModel: nextRoute.model,
            toProvider: nextRoute.provider,
            category: failure.category,
            code: failure.chunk.code,
            credentialRejectedProviders: credentialFailover.rejectedProviders(),
          },
          'LLM managed failover: rotating to fallback route',
        );
      }
      return nextRoute;
    };

    const abortForDisconnect = (): void => {
      if (!responseComplete) lifecycle.abortClient();
    };
    req.once('aborted', abortForDisconnect);
    res.once('close', abortForDisconnect);

    const detachConnectionListeners = (): void => {
      req.removeListener('aborted', abortForDisconnect);
      res.removeListener('close', abortForDisconnect);
    };

    // Streaming response
    if (body.stream) {
      let routeError: AppError | null = null;
      let wroteClientEvent = false;
      // True only while a write is parked waiting for the client's socket to
      // drain. A client that stops reading without closing never sets
      // `req.aborted`/`res.destroyed`, so this flag is the only evidence that
      // the gateway deadline expired because the CLIENT stalled rather than
      // because the provider hung — see the stalled-reader settle in the catch
      // below.
      let awaitingClientDrain = false;

      const prepareSseHeaders = (): void => {
        if (res.hasHeader('Content-Type')) return;
        // Deliberately do not flush here. The first actual SSE event commits
        // the 200 response, preserving an HTTP error path if the provider
        // fails before producing client-visible output.
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
      };

      const writeSsePayload = async (payload: string): Promise<void> => {
        if (res.destroyed || res.writableEnded) {
          throw new StreamClientAbortError();
        }
        prepareSseHeaders();
        const accepted = res.write(payload);
        wroteClientEvent = true;
        if (!accepted) {
          // Left latched when the drain never arrives, so the catch below can
          // tell a stalled reader apart from a hung provider.
          awaitingClientDrain = true;
          await lifecycle.waitForDrain(res);
          awaitingClientDrain = false;
        }
      };

      const logFailure = (failure: SafeProviderFailure, phase: string): void => {
        logger.error(
          {
            provider: served.provider,
            model: served.model,
            phase,
            category: failure.category,
            code: failure.chunk.code,
            retryable: failure.chunk.retryable,
            statusCode: failure.statusCode,
          },
          'Upstream provider request failed',
        );
      };

      let attempt: AttemptRoute | null = { model: body.model, provider, adapter };

      try {
        while (attempt) {
          served = { model: attempt.model, provider: attempt.provider };
          actualUsage = {};
          servedOutputChars = 0;
          // Per-attempt assembler so the wire stream attributes the model
          // that is actually serving this attempt, never a failed primary.
          const assembler = new OpenAIWireAssembler({ model: attempt.model });
          const writeWireEvent = async (wire: Record<string, unknown>): Promise<void> => {
            await writeSsePayload(`data: ${JSON.stringify(wire)}\n\n`);
          };

          let iterator: AsyncIterator<StreamChunk> | null = null;
          let pendingStop: StreamChunkStop | null = null;
          let attemptFailure: { failure: SafeProviderFailure; phase: string } | null = null;
          let succeeded = false;
          let clientGone = false;

          try {
            iterator = attempt.adapter
              .stream(buildChatRequest(attempt.model), lifecycle.signal)
              [Symbol.asyncIterator]();

            while (!attemptFailure) {
              const next: IteratorResult<StreamChunk> = await lifecycle.next(iterator);
              if (next.done) break;

              if (!isCanonicalStreamChunk(next.value)) {
                attemptFailure = { failure: malformedStreamFailure(), phase: 'invalid-event' };
                break;
              }

              const chunk: StreamChunk = next.value;
              if (chunk.type === 'error') {
                attemptFailure = {
                  failure: toSafeProviderFailure(chunk, chunk),
                  phase: 'provider-error-event',
                };
                break;
              }

              if (chunk.type === 'stop') {
                if (chunk.reason === 'error' || chunk.reason === 'cancel') {
                  attemptFailure = {
                    failure: incompleteStreamFailure(),
                    phase: `provider-stop-${chunk.reason}`,
                  };
                  break;
                }
                pendingStop ??= chunk;
                continue;
              }

              if (chunk.type === 'usage') captureUsage(chunk);

              // OpenAI-compatible providers may emit a usage-only event after
              // their finish event. No other data is valid after a stop.
              if (pendingStop && chunk.type !== 'usage') {
                attemptFailure = { failure: malformedStreamFailure(), phase: 'event-after-stop' };
                break;
              }

              servedOutputChars += generatedOutputChars(chunk);
              for (const wire of assembler.sseChunks(chunk)) {
                await writeWireEvent(wire);
              }
            }

            if (!attemptFailure) {
              if (!pendingStop) {
                attemptFailure = { failure: incompleteStreamFailure(), phase: 'missing-stop' };
              } else {
                providerSuccessObserved = true;
                await finalizeBilling('completed');
                for (const wire of assembler.sseChunks(pendingStop)) {
                  await writeWireEvent(wire);
                }
                await writeSsePayload('data: [DONE]\n\n');
                await markClientDelivered();
                succeeded = true;
              }
            }
          } catch (err) {
            if (
              err instanceof StreamClientAbortError ||
              lifecycle.signal.reason instanceof StreamClientAbortError ||
              req.aborted ||
              res.destroyed
            ) {
              logger.info(
                { provider: served.provider, model: served.model },
                'LLM stream client disconnected',
              );
              clientGone = true;
            } else if (err instanceof AppError) {
              routeError = err;
            } else if (err instanceof ManagedUsageBillingError) {
              attemptFailure = {
                failure: {
                  category: 'gateway',
                  statusCode: err.statusCode,
                  chunk: {
                    type: 'error',
                    message: 'Usage settlement is temporarily unavailable. Please retry.',
                    code: err.code.toLowerCase(),
                    retryable: err.statusCode >= 500,
                  },
                },
                phase: 'billing-finalization',
              };
            } else {
              attemptFailure = { failure: toSafeProviderFailure(err), phase: 'thrown-error' };
            }

            // The same abandonment as a hang-up, with the socket left open: the
            // client stopped reading and never sent FIN, so the write parked in
            // `waitForDrain` until the gateway deadline expired. `req.aborted`
            // and `res.destroyed` both stay false, so the branches above cannot
            // see it and the turn would otherwise reach
            // `releaseFailedReservation` and be refunded in full after the
            // provider had already generated (and charged for) the output.
            // Only the settlement changes here — the failure terminal below is
            // still composed and attempted, so the wire contract is unchanged.
            if (!clientGone && awaitingClientDrain) {
              logger.info(
                { provider: served.provider, model: served.model },
                'LLM stream client stopped reading; settling the stalled response as abandoned',
              );
              await settleAbandonedStream();
            }
          } finally {
            if (iterator) lifecycle.release(iterator);
          }

          if (clientGone) {
            await settleAbandonedStream();
            break;
          }
          if (succeeded || routeError) break;
          if (!attemptFailure) break;

          logFailure(attemptFailure.failure, attemptFailure.phase);

          // Managed failover: only before the first byte reaches the client
          // (a half-streamed response from provider A continued by provider B
          // would be corruption), and only for failures `rotateAfterFailure`
          // admits — availability, or a credential rejection that condemns one
          // provider account.
          const nextRoute: AttemptRoute | null = wroteClientEvent
            ? null
            : await rotateAfterFailure(attemptFailure.failure);
          if (nextRoute) {
            attempt = nextRoute;
            continue;
          }

          if (!wroteClientEvent && !res.headersSent) {
            routeError = new AppError(
              attemptFailure.failure.chunk.message,
              attemptFailure.failure.statusCode,
            );
          } else {
            try {
              for (const wire of assembler.sseChunks(attemptFailure.failure.chunk)) {
                await writeWireEvent(wire);
              }
            } catch {
              // The failure terminal could not be delivered (client gone or
              // deadline expired mid-write); the reservation release below
              // still records the failed outcome durably.
            }
          }
          break;
        }
      } finally {
        await releaseFailedReservation('stream_not_completed');
        lifecycle.cleanup();
        responseComplete = true;
        detachConnectionListeners();

        if (!routeError && res.headersSent && !res.writableEnded && !res.destroyed) {
          res.end();
        }
      }

      if (routeError) throw routeError;
      recordUsage('llm_stream');
      return;
    }

    // Non-streaming response
    let routeError: AppError | null = null;
    let servedAssembler: OpenAIWireAssembler | null = null;

    const logNonStreamFailure = (failure: SafeProviderFailure, phase: string): void => {
      logger.error(
        {
          provider: served.provider,
          model: served.model,
          phase,
          category: failure.category,
          code: failure.chunk.code,
          retryable: failure.chunk.retryable,
          statusCode: failure.statusCode,
        },
        'Upstream provider request failed',
      );
    };

    let attempt: AttemptRoute | null = { model: body.model, provider, adapter };

    try {
      while (attempt) {
        served = { model: attempt.model, provider: attempt.provider };
        actualUsage = {};
        servedOutputChars = 0;
        const assembler = new OpenAIWireAssembler({ model: attempt.model });

        let iterator: AsyncIterator<StreamChunk> | null = null;
        let sawStop = false;
        let attemptFailure: { failure: SafeProviderFailure; phase: string } | null = null;
        let succeeded = false;
        let clientGone = false;

        try {
          iterator = attempt.adapter
            .stream(buildChatRequest(attempt.model), lifecycle.signal)
            [Symbol.asyncIterator]();

          while (!attemptFailure) {
            const next = await lifecycle.next(iterator);
            if (next.done) break;

            if (!isCanonicalStreamChunk(next.value)) {
              attemptFailure = { failure: malformedStreamFailure(), phase: 'invalid-event' };
              break;
            }

            const chunk = next.value;
            if (chunk.type === 'error') {
              attemptFailure = {
                failure: toSafeProviderFailure(chunk, chunk),
                phase: 'provider-error-event',
              };
              break;
            }

            if (chunk.type === 'stop') {
              if (chunk.reason === 'error' || chunk.reason === 'cancel') {
                attemptFailure = {
                  failure: incompleteStreamFailure(),
                  phase: `provider-stop-${chunk.reason}`,
                };
                break;
              }
              if (!sawStop) {
                assembler.ingest(chunk);
                sawStop = true;
              }
              continue;
            }

            if (chunk.type === 'usage') captureUsage(chunk);

            if (sawStop && chunk.type !== 'usage') {
              attemptFailure = { failure: malformedStreamFailure(), phase: 'event-after-stop' };
              break;
            }

            servedOutputChars += generatedOutputChars(chunk);
            assembler.ingest(chunk);
          }

          if (!attemptFailure) {
            if (!sawStop) {
              attemptFailure = { failure: incompleteStreamFailure(), phase: 'missing-stop' };
            } else {
              providerSuccessObserved = true;
              await finalizeBilling('completed');
              servedAssembler = assembler;
              succeeded = true;
            }
          }
        } catch (err) {
          if (
            err instanceof StreamClientAbortError ||
            lifecycle.signal.reason instanceof StreamClientAbortError ||
            req.aborted ||
            res.destroyed
          ) {
            logger.info(
              { provider: served.provider, model: served.model },
              'LLM request client disconnected',
            );
            clientGone = true;
          } else if (err instanceof AppError) {
            routeError = err;
          } else if (err instanceof ManagedUsageBillingError) {
            routeError = new AppError(err.message, err.statusCode);
          } else {
            attemptFailure = { failure: toSafeProviderFailure(err), phase: 'thrown-error' };
          }
        } finally {
          if (iterator) lifecycle.release(iterator);
        }

        if (clientGone) {
          await settleAbandonedStream();
          break;
        }
        if (succeeded || routeError) break;
        if (!attemptFailure) break;

        logNonStreamFailure(attemptFailure.failure, attemptFailure.phase);

        // Managed failover: nothing has been written to the client on this
        // path (the JSON body is sent only after success), so an eligible
        // availability failure may rotate even after partial provider output —
        // the per-attempt assembler and usage reset discard that output.
        const nextRoute = await rotateAfterFailure(attemptFailure.failure);
        if (nextRoute) {
          attempt = nextRoute;
          continue;
        }

        routeError = new AppError(
          attemptFailure.failure.chunk.message,
          attemptFailure.failure.statusCode,
        );
        break;
      }
    } finally {
      await releaseFailedReservation('completion_not_completed');
      lifecycle.cleanup();
      responseComplete = true;
      detachConnectionListeners();
    }

    if (routeError) throw routeError;
    if (req.aborted || res.destroyed || !servedAssembler) return;

    const openaiResponse = servedAssembler.response();
    recordUsage('llm_completion', servedAssembler.usageOrNull());

    res.json(openaiResponse);
    await markClientDelivered();
  },
);

export { router as llmRouter };
