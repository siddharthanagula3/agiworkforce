/**
 * @file Provider Stream Routes — direct provider adapters via SSE
 * @security
 * - Authentication: JWT required
 * - Rate limiting: 30/min per user (chat-style action)
 * - Server-side API keys: never echoed back to client
 * - Input validation: Zod schemas with .strict()
 *
 * POST /api/v1/providers/:providerId/stream
 *   - Body: ChatRequest shape (provider-shape messages, tools, thinking)
 *   - Response: text/event-stream emitting one canonical StreamChunk per event
 *
 * GET /api/v1/providers/:providerId/catalog
 *   - Response: ModelInfo[]
 *
 * GET /api/v1/providers
 *   - Response: { providers: [{ id, available, unavailableReason? }] }
 *
 * This route is additive — does NOT replace the existing /api/llm/v1
 * OpenAI-compatible proxy. Eventually that proxy can migrate onto this
 * pipeline, but not in this PR.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { requireManagedComputeEligibility } from '../middleware/managedComputeGate';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';
import {
  buildProviderAdapter,
  isSupportedProviderId,
  listProviderAvailability,
  type ProviderId,
} from '../lib/providerAdapters';
import type { ChatRequest, StreamChunk } from '@agiworkforce/types';
import { classifyError } from '@agiworkforce/provider-runtime';

const router: Router = Router();

/**
 * GATEWAY-PROVIDER-STREAM-UNMETERED-01 — fail-closed billing guard.
 *
 * `/:providerId/stream` calls real, paid providers but performs NO usage
 * accounting. The metered path in `routes/llm.ts` parses `Idempotency-Key`
 * and runs the managed-usage reserve → settle cycle around every provider
 * call; this route does neither, so a turn served here costs real provider
 * money and is never reserved, settled, or counted against any allowance.
 * `requireManagedComputeEligibility` below gates WHO may call it — it does
 * not meter WHAT they spend.
 *
 * Until this route reuses the same reserve/settle path, it must not be
 * reachable by default. Operators who understand the exposure can opt in with
 * `AGI_GATEWAY_PROVIDER_STREAM_UNMETERED=1`; everyone else gets an honest 503
 * instead of free paid inference. The VS Code client that calls it already
 * defaults its `useProviderStream` setting to off, so failing closed here
 * matches the shipped client default rather than removing working behavior.
 */
const PROVIDER_STREAM_UNMETERED_ENV = 'AGI_GATEWAY_PROVIDER_STREAM_UNMETERED';

function providerStreamEnabled(): boolean {
  return process.env[PROVIDER_STREAM_UNMETERED_ENV] === '1';
}

function requireProviderStreamEnabled(): void {
  if (providerStreamEnabled()) return;
  throw new AppError(
    'Direct provider streaming is disabled because it performs no usage accounting. ' +
      'Use the metered chat completions endpoint.',
    503,
  );
}

router.use(authenticateToken);
router.use(createRateLimiter('default'));

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

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
    role: z.enum(['user', 'assistant', 'system']),
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

const chatRequestSchema = z
  .object({
    model: z.string().min(1).max(200),
    messages: z.array(messageSchema).min(1).max(500),
    system: z.union([z.string(), z.array(textBlockSchema)]).optional(),
    tools: z.array(toolDefSchema).max(64).optional(),
    toolChoice: toolChoiceSchema.optional(),
    maxOutputTokens: z.number().int().positive().max(200_000).optional(),
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().int().nonnegative().optional(),
    stopSequences: z.array(z.string()).max(10).optional(),
    thinking: thinkingConfigSchema.optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** GET /api/v1/providers — list providers and their availability. */
router.get('/', createRateLimiter('default'), (_req: Request, res: Response) => {
  res.json({ providers: listProviderAvailability() });
});

/** GET /api/v1/providers/:providerId/catalog — list a provider's model catalog. */
router.get(
  '/:providerId/catalog',
  createRateLimiter('default'),
  async (req: Request, res: Response) => {
    const providerId = req.params['providerId'];
    if (!isSupportedProviderId(providerId)) {
      throw new AppError(`Unknown provider: ${String(providerId)}`, 404);
    }
    const adapter = buildProviderAdapter(providerId);
    if (!adapter) {
      throw new AppError(
        `Provider "${providerId}" not configured (server is missing credentials)`,
        503,
      );
    }
    const catalog = await adapter.catalog();
    res.json({ provider: providerId, catalog });
  },
);

/** POST /api/v1/providers/:providerId/stream — stream a chat completion. */
router.post(
  '/:providerId/stream',
  createRateLimiter('device-command'),
  requireManagedComputeEligibility((req) => ({
    provider: String(req.params['providerId'] ?? 'unknown'),
    model: typeof req.body?.model === 'string' ? req.body.model : 'unknown',
  })),
  async (req: Request, res: Response) => {
    // Billing guard first: refuse before any provider work is done or any
    // credential is touched. See GATEWAY-PROVIDER-STREAM-UNMETERED-01.
    requireProviderStreamEnabled();

    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const providerId = req.params['providerId'];
    if (!isSupportedProviderId(providerId)) {
      throw new AppError(`Unknown provider: ${String(providerId)}`, 404);
    }

    const adapter = buildProviderAdapter(providerId as ProviderId);
    if (!adapter) {
      throw new AppError(
        `Provider "${providerId}" not configured (server is missing credentials)`,
        503,
      );
    }

    const parsed = chatRequestSchema.parse(req.body);
    // Cast through unknown to satisfy ChatRequest's narrower types; Zod has
    // already validated the wire shape.
    const chatRequest = parsed as unknown as ChatRequest;

    const ctrl = new AbortController();
    req.on('close', () => {
      if (!res.writableEnded) ctrl.abort();
    });

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering
    res.flushHeaders();

    const writeEvent = (chunk: StreamChunk): void => {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    };

    const startedAt = Date.now();
    let chunkCount = 0;

    try {
      for await (const chunk of adapter.stream(chatRequest, ctrl.signal)) {
        chunkCount += 1;
        writeEvent(chunk);
      }
    } catch (err) {
      const classified = classifyError(err);
      logger.warn(
        {
          providerId,
          userId: user.userId,
          err: classified.message,
          category: classified.category,
          code: classified.code,
        },
        'Provider stream errored',
      );
      const errorChunk: StreamChunk = {
        type: 'error',
        message: classified.message,
        retryable: classified.retryable,
        ...(classified.status !== undefined ? { code: String(classified.status) } : {}),
        ...(classified.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: classified.retryAfterSeconds }
          : {}),
      };
      writeEvent(errorChunk);
      writeEvent({ type: 'stop', reason: 'error' });
    } finally {
      logger.info(
        {
          providerId,
          userId: user.userId,
          model: chatRequest.model,
          chunks: chunkCount,
          durationMs: Date.now() - startedAt,
        },
        'Provider stream closed',
      );
      res.write('data: [DONE]\n\n');
      res.end();
    }
  },
);

export { router as providerStreamRouter };
