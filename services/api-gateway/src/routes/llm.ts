/**
 * @file LLM Proxy Routes — Managed Cloud Model Access
 * @security
 * - Rate limiting: Tier-based (30/min hobby, 120/min pro)
 * - Input validation: Zod schemas with .strict() to reject unexpected fields
 * - Authentication: JWT required (via authenticateToken)
 * - Plan enforcement: Free tier blocked; hobby limited to small models
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
  getAllowedModelsForTier,
  getModelMetadataById,
  type Provider as CatalogProvider,
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
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getUserScopedClient } from '../lib/neonClients';
import { requireManagedComputeEligibility } from '../middleware/managedComputeGate';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';
import { buildProviderAdapter, type ProviderId } from '../lib/providerAdapters';
import {
  incompleteStreamFailure,
  isCanonicalStreamChunk,
  malformedStreamFailure,
  toSafeProviderFailure,
  type SafeProviderFailure,
} from '../lib/providerStreamSafety';
import { createStreamLifecycle, StreamClientAbortError } from '../lib/streamLifecycle';
import {
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
 * Models allowed on the Hobby tier — derived from `models.json` (P0-I).
 *
 * The catalog SSOT keeps `tierAllowedModels.economy` as the canonical
 * Hobby + Free model list (per `tasks/auto-routing-spec.md` §1: Hobby
 * pool = economy tier with workhorse / escalation / reasoning slots).
 * Reading the set here keeps the gateway in sync with picker UI, web
 * surface, and CLI without a separately-curated allow-list that drifts.
 *
 * Exported for unit tests; not part of the route API.
 */
export const HOBBY_ALLOWED_MODELS: ReadonlySet<string> = new Set(
  getAllowedModelsForTier('economy'),
);

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
  'groq',
  'mistral',
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
 * provider this gateway cannot proxy yet (BYOK-only providers like xAI,
 * DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, LM Studio, Ollama).
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
      `Model "${model}" belongs to provider "${metadata.provider}" which the api-gateway does not proxy. Use the desktop BYOK path for this provider.`,
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
 * Tier dispatch is an explicit allowlist (CONTRADICTIONS-HUNTER round 3
 * fix): previously only 'free' and 'hobby' were checked, so 'basic'/'team'
 * (and any other unrecognized string) silently fell through to unrestricted
 * access with no model check. 'basic' is the 2026-07-02 rename of 'hobby'
 * and gets the identical economy-model restriction rather than a duplicated
 * branch. 'team' gets the same allowance as 'pro' (no model restriction).
 * Any tier not listed below fails closed to the same 403 as 'free', instead
 * of falling through. NOTE: this route still has no credit/budget deduction
 * for any tier (only a `usage_events` observability insert below and the
 * flat per-route rate limit) — that's WP2 scope, intentionally untouched
 * here.
 *
 * Exported for unit tests; not part of the route API.
 */
export async function enforcePlanTier(
  userId: string,
  token: string,
  model: string,
): Promise<string> {
  const userDb = getUserScopedClient({ userId, token });
  const { data: subscription, error } = await userDb
    .from('subscriptions')
    .select('plan_tier')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.error({ error, userId }, 'LLM proxy: failed to fetch subscription');
    throw new AppError('Service temporarily unavailable', 503);
  }

  // null data means no subscription row — treat as free tier (throws 403 below)
  const tier: string = subscription?.plan_tier ?? 'free';

  switch (tier) {
    case 'free':
      throw new AppError('Upgrade to a paid plan to use cloud models', 403);
    case 'hobby':
    case 'basic':
      if (!HOBBY_ALLOWED_MODELS.has(model)) {
        throw new AppError(
          `Model "${model}" requires a Pro plan. Hobby/Basic tier allows: ${[...HOBBY_ALLOWED_MODELS].join(', ')}.`,
          403,
        );
      }
      return tier;
    case 'team':
    case 'pro':
    case 'max':
    case 'enterprise':
      return tier;
    default:
      // Unrecognized plan_tier value — fail closed like 'free', not an
      // unrestricted fallthrough.
      logger.warn({ userId, tier }, 'LLM proxy: unrecognized plan_tier, failing closed');
      throw new AppError('Upgrade to a paid plan to use cloud models', 403);
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
    const provider = resolveProvider(body.model);
    const tier = await enforcePlanTier(user.userId, user.token, body.model);

    const adapter = buildProviderAdapter(provider);
    if (!adapter) {
      throw new AppError(`Server is not configured for ${provider} models`, 502);
    }

    const chatRequest = openAIWireRequestToChatRequest({
      ...(body as OpenAIWireChatRequest),
      model: toProviderApiModelId(body.model),
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
        ...(chunk.reasoningTokens !== undefined
          ? { reasoningTokens: chunk.reasoningTokens }
          : {}),
      };
    };

    const finalizeBilling = async (outcome: 'completed' | 'failed'): Promise<void> => {
      if (billingFinalized) return;
      await finalizeManagedUsage({
        ...billingIdentity,
        outcome,
        model: body.model,
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
            provider,
            model: body.model,
            reason,
            billingCode:
              error instanceof ManagedUsageBillingError ? error.code : 'BILLING_UNKNOWN_ERROR',
          },
          'Managed usage reservation release could not be persisted; lease recovery will retry',
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
            provider,
            model: body.model,
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
          model: body.model,
          provider,
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
            if (error) logger.debug({ error }, 'Failed to log usage event (table may not exist)');
          },
          (err: unknown) => {
            logger.debug({ err }, `Usage event insert rejected (${eventType} path)`);
          },
        );
    };

    const assembler = new OpenAIWireAssembler({ model: body.model });
    const lifecycle = createStreamLifecycle({ deadlineMs: LLM_PROVIDER_DEADLINE_MS });
    let responseComplete = false;

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
      let iterator: AsyncIterator<StreamChunk> | null = null;
      let routeError: AppError | null = null;
      let wroteClientEvent = false;
      let terminalEmitted = false;
      let pendingStop: StreamChunkStop | null = null;

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
        if (!accepted) await lifecycle.waitForDrain(res);
      };

      const writeWireEvent = async (wire: Record<string, unknown>): Promise<void> => {
        await writeSsePayload(`data: ${JSON.stringify(wire)}\n\n`);
      };

      const logFailure = (failure: SafeProviderFailure, phase: string): void => {
        logger.error(
          {
            provider,
            model: body.model,
            phase,
            category: failure.category,
            code: failure.chunk.code,
            retryable: failure.chunk.retryable,
            statusCode: failure.statusCode,
          },
          'Upstream provider request failed',
        );
      };

      const emitFailureTerminal = async (failure: SafeProviderFailure): Promise<void> => {
        if (terminalEmitted) return;
        terminalEmitted = true;
        for (const wire of assembler.sseChunks(failure.chunk)) {
          await writeWireEvent(wire);
        }
      };

      const handleFailure = async (failure: SafeProviderFailure, phase: string): Promise<void> => {
        logFailure(failure, phase);
        if (!wroteClientEvent && !res.headersSent) {
          routeError = new AppError(failure.chunk.message, failure.statusCode);
          return;
        }
        await emitFailureTerminal(failure);
      };

      try {
        iterator = adapter.stream(chatRequest, lifecycle.signal)[Symbol.asyncIterator]();

        while (!routeError && !terminalEmitted) {
          const next = await lifecycle.next(iterator);
          if (next.done) break;

          if (!isCanonicalStreamChunk(next.value)) {
            await handleFailure(malformedStreamFailure(), 'invalid-event');
            break;
          }

          const chunk = next.value;
          if (chunk.type === 'error') {
            await handleFailure(toSafeProviderFailure(chunk, chunk), 'provider-error-event');
            break;
          }

          if (chunk.type === 'stop') {
            if (chunk.reason === 'error' || chunk.reason === 'cancel') {
              await handleFailure(incompleteStreamFailure(), `provider-stop-${chunk.reason}`);
              break;
            }
            pendingStop ??= chunk;
            continue;
          }

          if (chunk.type === 'usage') captureUsage(chunk);

          // OpenAI-compatible providers may emit a usage-only event after
          // their finish event. No other data is valid after a stop.
          if (pendingStop && chunk.type !== 'usage') {
            await handleFailure(malformedStreamFailure(), 'event-after-stop');
            break;
          }

          for (const wire of assembler.sseChunks(chunk)) {
            await writeWireEvent(wire);
          }
        }

        if (!routeError && !terminalEmitted) {
          if (!pendingStop) {
            await handleFailure(incompleteStreamFailure(), 'missing-stop');
          } else {
            providerSuccessObserved = true;
            await finalizeBilling('completed');
            terminalEmitted = true;
            for (const wire of assembler.sseChunks(pendingStop)) {
              await writeWireEvent(wire);
            }
            await writeSsePayload('data: [DONE]\n\n');
            await markClientDelivered();
          }
        }
      } catch (err) {
        if (
          err instanceof StreamClientAbortError ||
          lifecycle.signal.reason instanceof StreamClientAbortError ||
          req.aborted ||
          res.destroyed
        ) {
          logger.info({ provider, model: body.model }, 'LLM stream client disconnected');
        } else if (err instanceof AppError) {
          routeError = err;
        } else if (err instanceof ManagedUsageBillingError) {
          const billingFailure: SafeProviderFailure = {
            category: 'gateway',
            statusCode: err.statusCode,
            chunk: {
              type: 'error',
              message: 'Usage settlement is temporarily unavailable. Please retry.',
              code: err.code.toLowerCase(),
              retryable: err.statusCode >= 500,
            },
          };
          await handleFailure(billingFailure, 'billing-finalization');
        } else {
          await handleFailure(toSafeProviderFailure(err), 'thrown-error');
        }
      } finally {
        await releaseFailedReservation('stream_not_completed');
        if (iterator) lifecycle.release(iterator);
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
    let iterator: AsyncIterator<StreamChunk> | null = null;
    let routeError: AppError | null = null;
    let sawStop = false;

    try {
      iterator = adapter.stream(chatRequest, lifecycle.signal)[Symbol.asyncIterator]();

      while (!routeError) {
        const next = await lifecycle.next(iterator);
        if (next.done) break;

        if (!isCanonicalStreamChunk(next.value)) {
          const failure = malformedStreamFailure();
          routeError = new AppError(failure.chunk.message, failure.statusCode);
          break;
        }

        const chunk = next.value;
        if (chunk.type === 'error') {
          const failure = toSafeProviderFailure(chunk, chunk);
          logger.error(
            {
              provider,
              model: body.model,
              category: failure.category,
              code: failure.chunk.code,
              retryable: failure.chunk.retryable,
              statusCode: failure.statusCode,
            },
            'Upstream provider request failed',
          );
          routeError = new AppError(failure.chunk.message, failure.statusCode);
          break;
        }

        if (chunk.type === 'stop') {
          if (chunk.reason === 'error' || chunk.reason === 'cancel') {
            const failure = incompleteStreamFailure();
            routeError = new AppError(failure.chunk.message, failure.statusCode);
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
          const failure = malformedStreamFailure();
          routeError = new AppError(failure.chunk.message, failure.statusCode);
          break;
        }

        assembler.ingest(chunk);
      }

      if (!routeError && !sawStop) {
        const failure = incompleteStreamFailure();
        routeError = new AppError(failure.chunk.message, failure.statusCode);
      }
      if (!routeError && sawStop) {
        providerSuccessObserved = true;
        await finalizeBilling('completed');
      }
    } catch (err) {
      if (
        err instanceof StreamClientAbortError ||
        lifecycle.signal.reason instanceof StreamClientAbortError ||
        req.aborted ||
        res.destroyed
      ) {
        logger.info({ provider, model: body.model }, 'LLM request client disconnected');
      } else if (err instanceof AppError) {
        routeError = err;
      } else if (err instanceof ManagedUsageBillingError) {
        routeError = new AppError(err.message, err.statusCode);
      } else {
        const failure = toSafeProviderFailure(err);
        logger.error(
          {
            provider,
            model: body.model,
            category: failure.category,
            code: failure.chunk.code,
            retryable: failure.chunk.retryable,
            statusCode: failure.statusCode,
          },
          'Upstream provider request failed',
        );
        routeError = new AppError(failure.chunk.message, failure.statusCode);
      }
    } finally {
      await releaseFailedReservation('completion_not_completed');
      if (iterator) lifecycle.release(iterator);
      lifecycle.cleanup();
      responseComplete = true;
      detachConnectionListeners();
    }

    if (routeError) throw routeError;
    if (req.aborted || res.destroyed) return;

    const openaiResponse = assembler.response();
    recordUsage('llm_completion', assembler.usageOrNull());

    res.json(openaiResponse);
    await markClientDelivered();
  },
);

export { router as llmRouter };
