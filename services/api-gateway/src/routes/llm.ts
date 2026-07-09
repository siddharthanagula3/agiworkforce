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
 * `packages/providers` adapters (restructure Wave 2). Request/response wire
 * conversion lives in `@agiworkforce/llm-normalize` (`openai-wire-compat`),
 * shared with the web v1 route, so the OpenAI-compatible contract stays
 * byte-stable while provider mechanics live in one place.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  getAllowedModelsForTier,
  getModelMetadataById,
  type Provider as CatalogProvider,
} from '@agiworkforce/types';
import {
  OpenAIWireAssembler,
  openAIWireRequestToChatRequest,
  type OpenAIWireChatRequest,
} from '@agiworkforce/llm-normalize';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getUserScopedClient } from '../lib/neonClients';
import { requireManagedComputeEligibility } from '../middleware/managedComputeGate';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';
import { buildProviderAdapter, type ProviderId } from '../lib/providerAdapters';
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

// Providers this proxy actually forwards to. The shared catalog
// (`@agiworkforce/types` -> models.json) knows about ~12 providers; this
// route currently proxies the 3 first-party managed ones. Widening this set
// is a deliberate contract change (restructure Wave 2 step 2/3) done together
// with adapter wiring + test updates — not implicitly.
type Provider = Extract<ProviderId, 'anthropic' | 'openai' | 'google'>;

const PROXIED_PROVIDERS: ReadonlySet<CatalogProvider> = new Set<CatalogProvider>([
  'anthropic',
  'openai',
  'google',
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
 * P1-GW-RLS: getUserScopedClient returns the service-role client (no DB-level
 * RLS — see lib/neonClients.ts). The `.eq('user_id', userId)` filter is the
 * SOLE tenant-isolation mechanism; there is no RLS backstop, so a
 * missing-filter regression here WOULD leak another tenant's plan_tier.
 */
async function enforcePlanTier(userId: string, model: string): Promise<string> {
  const userDb = getUserScopedClient(userId);
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

  if (tier === 'free') {
    throw new AppError('Upgrade to a paid plan to use cloud models', 403);
  }

  if (tier === 'hobby' && !HOBBY_ALLOWED_MODELS.has(model)) {
    throw new AppError(
      `Model "${model}" requires a Pro plan. Hobby tier allows: ${[...HOBBY_ALLOWED_MODELS].join(', ')}.`,
      403,
    );
  }

  return tier;
}

// GW-2 (audit 2026-05-03): SECURITY GUARDRAIL — upstream requests are built
// exclusively inside `packages/providers` adapters from server env keys.
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
    const provider = resolveProvider(body.model);
    const tier = await enforcePlanTier(user.userId, body.model);

    const adapter = buildProviderAdapter(provider);
    if (!adapter) {
      throw new AppError(`Server is not configured for ${provider} models`, 502);
    }

    const chatRequest = openAIWireRequestToChatRequest(body as OpenAIWireChatRequest);

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

    // P1-GW-RLS: service-role client (no DB-level RLS — see lib/neonClients.ts).
    // usage_events rows carry the explicit user_id set on insert; there is no
    // `user_id = auth.uid()` RLS backstop, so the explicit field is the SOLE
    // guard against mis-attribution. Keep setting it.
    const usageDb = getUserScopedClient(user.userId);

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

    const abort = new AbortController();
    req.on('close', () => abort.abort());

    const assembler = new OpenAIWireAssembler({ model: body.model });

    // Streaming response
    if (body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      try {
        for await (const chunk of adapter.stream(chatRequest, abort.signal)) {
          if (chunk.type === 'error') {
            logger.error(
              { provider, model: body.model, code: chunk.code, message: chunk.message },
              'Upstream provider error (stream)',
            );
          }
          const wire = assembler.sseChunk(chunk);
          if (wire) {
            res.write(`data: ${JSON.stringify(wire)}\n\n`);
          }
        }
        res.write('data: [DONE]\n\n');
      } catch (err) {
        logger.error({ error: err, provider, model: body.model }, 'SSE streaming error');
      } finally {
        res.end();
      }

      recordUsage('llm_stream');
      return;
    }

    // Non-streaming response
    try {
      for await (const chunk of adapter.stream(chatRequest, abort.signal)) {
        assembler.ingest(chunk);
      }
    } catch (err) {
      logger.error({ error: err, provider, model: body.model }, 'Upstream provider error');
      throw new AppError('Upstream provider error. Please try again.', 502);
    }

    if (assembler.lastError) {
      logger.error(
        { provider, model: body.model, errorBody: assembler.lastError.slice(0, 500) },
        'Upstream provider error',
      );
      throw new AppError('Upstream provider error. Please try again.', 502);
    }

    const openaiResponse = assembler.response();
    recordUsage('llm_completion', assembler.usageOrNull());

    res.json(openaiResponse);
  },
);

export { router as llmRouter };
