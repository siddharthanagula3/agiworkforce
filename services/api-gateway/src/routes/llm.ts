/**
 * @file LLM Proxy Routes — Managed Cloud Model Access
 * @security
 * - Rate limiting: Tier-based (30/min hobby, 120/min pro)
 * - Input validation: Zod schemas with .strict() to reject unexpected fields
 * - Authentication: JWT required (via authenticateToken)
 * - Plan enforcement: Free tier blocked; hobby limited to small models
 * - Server-side API keys: Never exposed to client
 *
 * Proxies LLM requests from the desktop ManagedCloudProvider to upstream
 * providers (Anthropic, OpenAI, Google) using server-held API keys.
 * Normalizes all responses to OpenAI-compatible format.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticateToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { supabase } from '../lib/supabase';
import { createRateLimiter } from '../middleware/rateLimit';
import { logger } from '../lib/logger';

const router: Router = Router();

router.use(authenticateToken);

// =============================================================================
// CONSTANTS
// =============================================================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Models allowed on the hobby tier (small/cheap models only). */
const HOBBY_ALLOWED_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-haiku-4-5',
  'gpt-4o-mini',
  'gpt-4o-mini-2024-07-18',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
]);

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.union([z.string(), z.array(z.any())]),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(z.any()).optional(),
});

const chatCompletionSchema = z
  .object({
    model: z.string().min(1).max(100),
    messages: z.array(messageSchema).min(1),
    stream: z.boolean().optional().default(false),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().min(1).max(200_000).optional(),
    tools: z.array(z.any()).optional(),
    tool_choice: z.union([z.string(), z.object({}).passthrough()]).optional(),
  })
  .strict();

// =============================================================================
// HELPERS
// =============================================================================

type Provider = 'anthropic' | 'openai' | 'google';

function resolveProvider(model: string): Provider {
  if (model.startsWith('claude-')) return 'anthropic';
  if (
    model.startsWith('gpt-') ||
    model.startsWith('o1-') ||
    model.startsWith('o3-') ||
    model.startsWith('o4-')
  )
    return 'openai';
  if (model.startsWith('gemini-')) return 'google';
  throw new AppError(`Unsupported model: ${model}`, 400);
}

function getProviderKey(provider: Provider): string {
  const envMap: Record<Provider, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_API_KEY',
  };
  const key = process.env[envMap[provider]];
  if (!key) {
    throw new AppError(`Server is not configured for ${provider} models`, 502);
  }
  return key;
}

/**
 * Check the user's subscription tier and enforce model access.
 * Returns the tier string.
 */
async function enforcePlanTier(userId: string, model: string): Promise<string> {
  const { data: subscription, error } = await supabase
    .from('subscriptions')
    .select('plan_tier')
    .eq('user_id', userId)
    .single();

  if (error) {
    logger.error({ error, userId }, 'LLM proxy: failed to fetch subscription');
    throw new AppError('Service temporarily unavailable', 503);
  }

  const tier: string = subscription?.plan_tier ?? 'free';

  if (tier === 'free') {
    throw new AppError('Upgrade to a paid plan to use cloud models', 403);
  }

  if (tier === 'hobby' && !HOBBY_ALLOWED_MODELS.has(model)) {
    throw new AppError(
      `Model "${model}" requires a Pro plan. Hobby tier allows: haiku, gpt-4o-mini, gemini-flash.`,
      403,
    );
  }

  return tier;
}

// =============================================================================
// ANTHROPIC FORMAT CONVERSION
// =============================================================================

/**
 * Convert OpenAI-format messages to Anthropic's messages API format.
 * Extracts system messages into the top-level `system` param.
 */
function toAnthropicRequest(body: z.infer<typeof chatCompletionSchema>): {
  system?: string;
  messages: Array<{ role: string; content: string | Array<unknown> }>;
  model: string;
  max_tokens: number;
  temperature?: number;
  stream: boolean;
  tools?: Array<unknown>;
  tool_choice?: unknown;
} {
  const systemMessages: string[] = [];
  const messages: Array<{ role: string; content: string | Array<unknown> }> = [];

  for (const msg of body.messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string') {
        systemMessages.push(msg.content);
      }
    } else {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  const result: ReturnType<typeof toAnthropicRequest> = {
    model: body.model,
    messages,
    max_tokens: body.max_tokens ?? 4096,
    stream: body.stream,
  };

  if (systemMessages.length > 0) {
    result.system = systemMessages.join('\n\n');
  }
  if (body.temperature !== undefined) {
    result.temperature = body.temperature;
  }
  if (body.tools && body.tools.length > 0) {
    result.tools = body.tools.map((t: Record<string, unknown>) => ({
      name: (t['function'] as Record<string, unknown>)?.['name'] ?? t['name'],
      description: (t['function'] as Record<string, unknown>)?.['description'] ?? t['description'],
      input_schema: (t['function'] as Record<string, unknown>)?.['parameters'] ?? t['input_schema'],
    }));
  }
  if (body.tool_choice !== undefined) {
    if (body.tool_choice === 'auto') {
      result.tool_choice = { type: 'auto' };
    } else if (body.tool_choice === 'none') {
      result.tool_choice = { type: 'none' };
    } else if (typeof body.tool_choice === 'object') {
      result.tool_choice = body.tool_choice;
    }
  }

  return result;
}

/**
 * Convert a non-streaming Anthropic response to OpenAI-compatible format.
 */
function anthropicToOpenAI(
  anthropicResp: Record<string, unknown>,
  model: string,
): Record<string, unknown> {
  const content = anthropicResp['content'] as Array<Record<string, unknown>> | undefined;
  const textBlocks = (content ?? []).filter((b) => b['type'] === 'text');
  const toolBlocks = (content ?? []).filter((b) => b['type'] === 'tool_use');

  const message: Record<string, unknown> = {
    role: 'assistant',
    content: textBlocks.map((b) => b['text']).join('') || null,
  };

  if (toolBlocks.length > 0) {
    message['tool_calls'] = toolBlocks.map((b, i) => ({
      id: b['id'],
      type: 'function',
      index: i,
      function: {
        name: b['name'],
        arguments: JSON.stringify(b['input']),
      },
    }));
  }

  const usage = anthropicResp['usage'] as Record<string, number> | undefined;

  return {
    id: anthropicResp['id'] ?? `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: mapAnthropicStopReason(anthropicResp['stop_reason'] as string),
      },
    ],
    usage: usage
      ? {
          prompt_tokens: usage['input_tokens'],
          completion_tokens: usage['output_tokens'],
          total_tokens: (usage['input_tokens'] ?? 0) + (usage['output_tokens'] ?? 0),
        }
      : undefined,
  };
}

function mapAnthropicStopReason(reason: string | undefined): string {
  if (reason === 'end_turn') return 'stop';
  if (reason === 'tool_use') return 'tool_calls';
  if (reason === 'max_tokens') return 'length';
  return reason ?? 'stop';
}

// =============================================================================
// GOOGLE FORMAT CONVERSION
// =============================================================================

function toGoogleRequest(body: z.infer<typeof chatCompletionSchema>): {
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  generationConfig?: Record<string, unknown>;
} {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  for (const msg of body.messages) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    // Gemini merges system into the first user turn
    if (msg.role === 'system') {
      contents.push({ role: 'user', parts: [{ text: `[System]: ${text}` }] });
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }

  const result: ReturnType<typeof toGoogleRequest> = { contents };
  const generationConfig: Record<string, unknown> = {};
  if (body.temperature !== undefined) generationConfig['temperature'] = body.temperature;
  if (body.max_tokens !== undefined) generationConfig['maxOutputTokens'] = body.max_tokens;
  if (Object.keys(generationConfig).length > 0) result.generationConfig = generationConfig;

  return result;
}

function googleToOpenAI(
  googleResp: Record<string, unknown>,
  model: string,
): Record<string, unknown> {
  const candidates = googleResp['candidates'] as Array<Record<string, unknown>> | undefined;
  const firstCandidate = candidates?.[0];
  const contentObj = firstCandidate?.['content'] as Record<string, unknown> | undefined;
  const parts = contentObj?.['parts'] as Array<Record<string, unknown>> | undefined;
  const text = parts?.map((p) => p['text']).join('') ?? '';

  const usageMeta = googleResp['usageMetadata'] as Record<string, number> | undefined;

  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
    usage: usageMeta
      ? {
          prompt_tokens: usageMeta['promptTokenCount'],
          completion_tokens: usageMeta['candidatesTokenCount'],
          total_tokens: usageMeta['totalTokenCount'],
        }
      : undefined,
  };
}

// =============================================================================
// UPSTREAM REQUEST EXECUTION
// =============================================================================

async function callUpstream(
  provider: Provider,
  apiKey: string,
  body: z.infer<typeof chatCompletionSchema>,
): Promise<globalThis.Response> {
  switch (provider) {
    case 'anthropic': {
      const anthropicBody = toAnthropicRequest(body);
      return fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(anthropicBody),
      });
    }
    case 'openai': {
      return fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: body.model,
          messages: body.messages,
          stream: body.stream,
          ...(body.temperature !== undefined && { temperature: body.temperature }),
          ...(body.max_tokens !== undefined && { max_tokens: body.max_tokens }),
          ...(body.tools && { tools: body.tools }),
          ...(body.tool_choice !== undefined && { tool_choice: body.tool_choice }),
        }),
      });
    }
    case 'google': {
      const action = body.stream ? 'streamGenerateContent' : 'generateContent';
      // SECURITY: Pass API key via header instead of URL query to prevent credential exposure in logs
      const url = `${GOOGLE_API_BASE}/${body.model}:${action}`;
      const googleBody = toGoogleRequest(body);
      return fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(googleBody),
      });
    }
  }
}

// =============================================================================
// SSE STREAMING
// =============================================================================

/**
 * Pipe upstream SSE to the client, converting Anthropic format to OpenAI-compatible
 * SSE chunks on the fly. OpenAI responses are passed through as-is.
 */
async function streamResponse(
  provider: Provider,
  upstream: globalThis.Response,
  res: Response,
  model: string,
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const body = upstream.body;
  if (!body) {
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }
        if (!data) continue;

        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;

          if (provider === 'anthropic') {
            const chunk = convertAnthropicStreamChunk(parsed, model);
            if (chunk) {
              res.write(`data: ${JSON.stringify(chunk)}\n\n`);
            }
          } else {
            // OpenAI format — pass through
            res.write(`data: ${JSON.stringify(parsed)}\n\n`);
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Ensure [DONE] is sent
    res.write('data: [DONE]\n\n');
  } catch (err) {
    logger.error({ error: err }, 'SSE streaming error');
  } finally {
    res.end();
  }
}

/**
 * Convert a single Anthropic SSE event to an OpenAI-compatible stream chunk.
 */
function convertAnthropicStreamChunk(
  event: Record<string, unknown>,
  model: string,
): Record<string, unknown> | null {
  const type = event['type'] as string;

  if (type === 'content_block_delta') {
    const delta = event['delta'] as Record<string, unknown> | undefined;
    if (!delta) return null;

    if (delta['type'] === 'text_delta') {
      return {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: { content: delta['text'] },
            finish_reason: null,
          },
        ],
      };
    }

    if (delta['type'] === 'input_json_delta') {
      return {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: (event['index'] as number) ?? 0,
                  function: { arguments: delta['partial_json'] },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      };
    }
  }

  if (type === 'content_block_start') {
    const block = event['content_block'] as Record<string, unknown> | undefined;
    if (block?.['type'] === 'tool_use') {
      return {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: (event['index'] as number) ?? 0,
                  id: block['id'],
                  type: 'function',
                  function: { name: block['name'], arguments: '' },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      };
    }
  }

  if (type === 'message_delta') {
    const delta = event['delta'] as Record<string, unknown> | undefined;
    const stopReason = delta?.['stop_reason'] as string | undefined;
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: mapAnthropicStopReason(stopReason),
        },
      ],
    };
  }

  return null;
}

/**
 * Stream Google Gemini response. Gemini's streaming returns an array of
 * candidate chunks. Convert each to OpenAI-compatible SSE.
 */
async function streamGoogleResponse(
  upstream: globalThis.Response,
  res: Response,
  model: string,
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const body = upstream.body;
  if (!body) {
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Gemini streaming returns JSON array chunks separated by newlines
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === '[' || trimmed === ']' || trimmed === ',') continue;

        // Strip leading comma if present
        const clean = trimmed.startsWith(',') ? trimmed.slice(1).trim() : trimmed;
        if (!clean) continue;

        try {
          const parsed = JSON.parse(clean) as Record<string, unknown>;
          const candidates = parsed['candidates'] as Array<Record<string, unknown>> | undefined;
          const contentObj = candidates?.[0]?.['content'] as Record<string, unknown> | undefined;
          const parts = contentObj?.['parts'] as Array<Record<string, unknown>> | undefined;
          const text = parts?.map((p) => p['text']).join('') ?? '';

          if (text) {
            const chunk = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  delta: { content: text },
                  finish_reason: null,
                },
              ],
            };
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    res.write('data: [DONE]\n\n');
  } catch (err) {
    logger.error({ error: err }, 'Google SSE streaming error');
  } finally {
    res.end();
  }
}

// =============================================================================
// ROUTE: POST /chat/completions
// =============================================================================

/**
 * POST /api/llm/v1/chat/completions
 * Proxy LLM requests to upstream providers with server-side API keys.
 *
 * Accepts OpenAI-compatible request format, routes to the correct provider
 * based on model prefix, and returns OpenAI-compatible responses.
 *
 * SECURITY: JWT required. Plan tier enforced. Rate limited per tier.
 */
router.post(
  '/chat/completions',
  createRateLimiter('llm-completions'),
  async (req: Request, res: Response) => {
    const user = req.user;
    if (!user) {
      throw new AppError('Unauthorized', 401);
    }

    const body = chatCompletionSchema.parse(req.body);
    const provider = resolveProvider(body.model);
    const tier = await enforcePlanTier(user.userId, body.model);
    const apiKey = getProviderKey(provider);

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

    const upstream = await callUpstream(provider, apiKey, body);

    if (!upstream.ok) {
      const errorBody = await upstream.text().catch(() => 'Unknown upstream error');
      logger.error(
        {
          provider,
          model: body.model,
          status: upstream.status,
          errorBody: errorBody.slice(0, 500),
        },
        'Upstream provider error',
      );
      throw new AppError('Upstream provider error. Please try again.', 502);
    }

    // Streaming response
    if (body.stream) {
      if (provider === 'google') {
        await streamGoogleResponse(upstream, res, body.model);
      } else {
        await streamResponse(provider, upstream, res, body.model);
      }
      // Best-effort usage tracking (fire and forget for streaming)
      supabase
        .from('usage_events')
        .insert({
          user_id: user.userId,
          model: body.model,
          provider,
          tier,
          event_type: 'llm_stream',
          created_at: new Date().toISOString(),
        })
        .then(({ error }) => {
          if (error) logger.debug({ error }, 'Failed to log usage event (table may not exist)');
        });
      return;
    }

    // Non-streaming response
    const upstreamJson = (await upstream.json()) as Record<string, unknown>;

    let openaiResponse: Record<string, unknown>;
    if (provider === 'anthropic') {
      openaiResponse = anthropicToOpenAI(upstreamJson, body.model);
    } else if (provider === 'google') {
      openaiResponse = googleToOpenAI(upstreamJson, body.model);
    } else {
      openaiResponse = upstreamJson;
    }

    // Best-effort usage tracking
    const usage = openaiResponse['usage'] as Record<string, number> | undefined;
    supabase
      .from('usage_events')
      .insert({
        user_id: user.userId,
        model: body.model,
        provider,
        tier,
        event_type: 'llm_completion',
        prompt_tokens: usage?.['prompt_tokens'] ?? null,
        completion_tokens: usage?.['completion_tokens'] ?? null,
        created_at: new Date().toISOString(),
      })
      .then(({ error }) => {
        if (error) logger.debug({ error }, 'Failed to log usage event (table may not exist)');
      });

    res.json(openaiResponse);
  },
);

export { router as llmRouter };
