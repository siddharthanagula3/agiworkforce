import 'server-only';

/**
 * LLM v2 Chat API Route
 * Endpoint: POST /api/llm/v2/chat
 *
 * A parallel API path that routes through the Vercel AI SDK v6.
 * Supports the same request shape as /api/llm/v1/chat/completions but uses
 * AI SDK's `streamText` → `toDataStreamResponse()` for the response.
 *
 * Opt-in: set the `x-use-ai-sdk: true` header (or the route itself implies it).
 * Falls back to the v1 provider factory if the requested model is not supported
 * by one of the three AI SDK providers (anthropic, openai, google).
 *
 * Authentication & rate-limiting reuse the same middleware as v1.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { handleCorsPreflightRequest, getCorsHeaders, getSecurityHeaders } from '@/lib/cors';
import { requireCsrfToken } from '@/lib/csrf';
import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import {
  detectAiSdkProvider,
  getModelForProvider,
  buildAnthropicProviderOptions,
  buildOpenAIProviderOptions,
  type AnthropicProviderOptions,
  type OpenAIProviderOptions,
} from '@/lib/ai-sdk/providers';
import { createAiSdkStream, toCoreMessages, toAiSdkTools } from '@/lib/ai-sdk/stream-handler';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import {
  estimateTokenCount,
  getModelContextWindow,
  buildAnthropicContextManagement,
  getContextManagementBetaHeader,
  type ContextManagementOptions,
  type ChatMessage,
} from '@/lib/llm-providers/context-management';

// ---------------------------------------------------------------------------
// Request schema (same shape as v1)
// ---------------------------------------------------------------------------

const V2ChatRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant', 'tool', 'function']),
      content: z.union([
        z.string(),
        z.array(
          z.object({
            type: z.string(),
            text: z.string().optional(),
            image_url: z
              .object({
                url: z.string(),
                detail: z.enum(['auto', 'low', 'high']).optional(),
              })
              .optional(),
          }),
        ),
      ]),
      name: z.string().optional(),
      tool_calls: z.array(z.unknown()).optional(),
      tool_call_id: z.string().optional(),
    }),
  ),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().positive().optional(),
  max_completion_tokens: z.number().int().positive().optional(),
  stream: z.boolean().optional().default(true),
  tools: z.array(z.unknown()).optional(),
  tool_choice: z.unknown().optional(),
  // Thinking / reasoning options
  thinking_mode: z.boolean().optional(),
  thinking: z
    .object({
      type: z.string(),
      budget_tokens: z.number().int().positive().optional(),
    })
    .optional(),
  effort: z.string().optional(),
  // OpenAI reasoning-specific
  reasoning_effort: z.enum(['low', 'medium', 'high']).optional(),
  reasoning_summary: z.enum(['auto', 'concise', 'detailed', 'none']).optional(),
  service_tier: z.enum(['auto', 'default', 'flex']).optional(),
});

type V2ChatRequest = z.infer<typeof V2ChatRequestSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract plain text from OpenAI-style content (string or parts array). */
function extractText(
  content: string | Array<{ type: string; text?: string; image_url?: unknown }>,
): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text!)
    .join('\n');
}

/** Build Anthropic provider options from request body. */
function buildAnthropicOptions(req: V2ChatRequest): AnthropicProviderOptions | undefined {
  const opts: AnthropicProviderOptions = {};

  if (req.thinking_mode || req.thinking) {
    opts.thinking = {
      type: 'enabled',
      budgetTokens: req.thinking?.budget_tokens ?? 8000,
    };
  }

  if (req.effort) {
    const effort = req.effort.toLowerCase();
    if (effort === 'low' || effort === 'medium' || effort === 'high') {
      opts.effort = effort;
    }
  }

  return Object.keys(opts).length > 0 ? opts : undefined;
}

/** Build OpenAI provider options from request body. */
function buildOpenAIOptions(req: V2ChatRequest): OpenAIProviderOptions | undefined {
  const opts: OpenAIProviderOptions = {};

  if (req.reasoning_effort) opts.reasoningEffort = req.reasoning_effort;
  if (req.reasoning_summary) opts.reasoningSummary = req.reasoning_summary;
  if (req.service_tier) opts.serviceTier = req.service_tier;

  return Object.keys(opts).length > 0 ? opts : undefined;
}

// ---------------------------------------------------------------------------
// v1 fallback  (for providers not in AI SDK: xai, qwen, moonshot, etc.)
// ---------------------------------------------------------------------------

async function handleViaV1Fallback(
  request: NextRequest,
  chatRequest: V2ChatRequest,
): Promise<NextResponse> {
  logger.info(
    { model: chatRequest.model },
    'v2: model not in AI SDK providers — proxying to v1 factory',
  );

  const provider = LLMProviderFactory.getProviderFromModel(chatRequest.model);
  const internalMessages = chatRequest.messages.map((msg) => ({
    role: msg.role as 'system' | 'user' | 'assistant' | 'tool',
    content: extractText(msg.content),
    tool_calls: msg.tool_calls,
    tool_call_id: msg.tool_call_id,
  }));

  const maxTokens = chatRequest.max_tokens ?? chatRequest.max_completion_tokens ?? 4096;

  const llmRequest = {
    model: chatRequest.model,
    messages: internalMessages,
    temperature: chatRequest.temperature,
    max_tokens: maxTokens,
    stream: chatRequest.stream,
    tools: chatRequest.tools,
    tool_choice: chatRequest.tool_choice,
    thinking_mode: chatRequest.thinking_mode,
    thinking: chatRequest.thinking,
    effort: chatRequest.effort,
  };

  if (chatRequest.stream !== false) {
    const stream = await LLMProviderFactory.streamRequest(provider, llmRequest);
    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'x-agi-provider': provider,
        'x-agi-sdk-path': 'v1-fallback',
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      },
    });
  }

  const llmResponse = await LLMProviderFactory.sendRequest(provider, llmRequest);
  return NextResponse.json(
    {
      id: `chatcmpl-v2-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: chatRequest.model,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: llmResponse.content },
          finish_reason: llmResponse.finishReason ?? 'stop',
        },
      ],
      usage: {
        prompt_tokens: llmResponse.promptTokens,
        completion_tokens: llmResponse.completionTokens,
        total_tokens: llmResponse.totalTokens,
      },
    },
    {
      headers: {
        'x-agi-provider': provider,
        'x-agi-sdk-path': 'v1-fallback',
        ...getCorsHeaders(request),
        ...getSecurityHeaders(),
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

async function handleV2Chat(request: NextRequest): Promise<Response> {
  // CORS preflight
  const preflight = handleCorsPreflightRequest(request);
  if (preflight) return preflight;

  // Rate limiting
  const rateLimitResponse = await withRateLimit(request, 'llm-completion');
  if (rateLimitResponse) return rateLimitResponse;

  // CSRF protection
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  // Authentication
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      {
        error: {
          message: 'Missing or invalid authorization header',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
      {
        status: 401,
        headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
      },
    );
  }

  const token = authHeader.substring(7);

  // Verify with Supabase
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, flowType: 'pkce' },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json(
      {
        error: {
          message: 'Invalid authentication token',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
      {
        status: 401,
        headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
      },
    );
  }

  // Parse body
  const MAX_BODY_BYTES = 2_000_000;
  let body: unknown;
  try {
    const rawBody = await request.arrayBuffer();
    if (rawBody.byteLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        {
          error: {
            message: `Request body too large (${rawBody.byteLength} bytes). Maximum is ${MAX_BODY_BYTES} bytes.`,
            type: 'invalid_request_error',
            code: 'payload_too_large',
          },
        },
        {
          status: 413,
          headers: { ...getCorsHeaders(request), ...getSecurityHeaders() },
        },
      );
    }
    body = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return NextResponse.json(
      { error: { message: 'Invalid JSON in request body', type: 'invalid_request_error' } },
      { status: 400, headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
    );
  }

  const validation = V2ChatRequestSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      {
        error: {
          message: validation.error.message,
          type: 'invalid_request_error',
          param: validation.error.issues[0]?.path.join('.'),
        },
      },
      { status: 400, headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
    );
  }

  const chatRequest = validation.data;
  const useAiSdk = request.headers.get('x-use-ai-sdk') !== 'false'; // default on for this route

  // Detect which AI SDK provider to use (null = fall back to v1 factory)
  const aiSdkProvider = detectAiSdkProvider(chatRequest.model);

  if (!aiSdkProvider || !useAiSdk) {
    return handleViaV1Fallback(request, chatRequest);
  }

  // Map model id (same mapping as v1)
  const apiModelId = LLMProviderFactory.mapModelIdToApiId(chatRequest.model);

  let languageModel;
  try {
    languageModel = getModelForProvider(
      aiSdkProvider,
      apiModelId,
      undefined, // use env vars
    );
  } catch (err) {
    logger.error({ err, model: apiModelId, provider: aiSdkProvider }, 'v2: failed to get model');
    return NextResponse.json(
      {
        error: {
          message: `Failed to initialize ${aiSdkProvider} model: ${err instanceof Error ? err.message : String(err)}`,
          type: 'server_error',
        },
      },
      { status: 500, headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
    );
  }

  // Convert messages to AI SDK CoreMessage format
  const internalMessages = chatRequest.messages.map((msg) => ({
    role: msg.role,
    content: extractText(msg.content),
    tool_calls: msg.tool_calls as
      | Array<{ id: string; function: { name: string; arguments: string } }>
      | undefined,
    tool_call_id: msg.tool_call_id,
  }));

  // ── Auto context management for Anthropic models ──────────────────────────
  // When the conversation is approaching the model's context window (> 60%),
  // automatically request Anthropic's compact_20260112 compaction.
  let contextCompacted = false;
  let contextManagementBetaHeader: string | null = null;
  let contextManagementObj: Record<string, unknown> | null = null;

  if (aiSdkProvider === 'anthropic') {
    const chatMessages: ChatMessage[] = internalMessages.map((m) => ({
      role: m.role as ChatMessage['role'],
      content: m.content,
    }));
    const contextWindow = getModelContextWindow(chatRequest.model);
    const estimatedTokens = estimateTokenCount(chatMessages);
    const compactionThresholdPct = 0.6; // trigger at 60% full
    const triggerTokens = Math.floor(contextWindow * compactionThresholdPct);

    if (estimatedTokens > triggerTokens) {
      const cmOptions: ContextManagementOptions = {
        mode: 'compact',
        triggerTokens,
        preserveRecentMessages: 10,
      };
      contextManagementObj = buildAnthropicContextManagement(cmOptions);
      contextManagementBetaHeader = getContextManagementBetaHeader('compact');
      contextCompacted = true;
      logger.info(
        {
          userId: user.id,
          model: chatRequest.model,
          estimatedTokens,
          contextWindow,
          triggerTokens,
        },
        'v2: Auto context compaction triggered for Anthropic request',
      );
    }
  }

  // Build providerOptions for streamText (Bug 1 fix + Bug 2 context management)
  let providerOptions: ProviderOptions | undefined;

  if (aiSdkProvider === 'anthropic') {
    const anthropicOpts = buildAnthropicOptions(chatRequest);
    const baseProviderOptions = buildAnthropicProviderOptions(anthropicOpts);
    const anthropicBlock: Record<string, unknown> = {
      ...(baseProviderOptions?.['anthropic'] ?? {}),
    };

    // Inject context management into the anthropic providerOptions block
    if (contextManagementObj) {
      anthropicBlock['contextManagement'] = contextManagementObj;
    }

    // Pass the required beta header for context management
    if (contextManagementBetaHeader) {
      const existingBetas = (anthropicBlock['betas'] as string[] | undefined) ?? [];
      anthropicBlock['betas'] = [...existingBetas, contextManagementBetaHeader];
    }

    if (Object.keys(anthropicBlock).length > 0) {
      providerOptions = { anthropic: anthropicBlock as ProviderOptions[string] };
    }
  } else if (aiSdkProvider === 'openai') {
    const openAIOpts = buildOpenAIOptions(chatRequest);
    providerOptions = buildOpenAIProviderOptions(openAIOpts);
  }

  const coreMessages = toCoreMessages(internalMessages);

  // Extract system message (AI SDK handles it separately)
  const systemMessages = coreMessages.filter((m) => m.role === 'system');
  const nonSystemMessages = coreMessages.filter((m) => m.role !== 'system');
  const system = systemMessages.map((m) => m.content as string).join('\n') || undefined;

  // Convert tools
  const sdkTools = toAiSdkTools(
    chatRequest.tools as
      | Array<{
          type?: string;
          function?: { name: string; description?: string; parameters?: Record<string, unknown> };
        }>
      | undefined,
  );

  const maxTokens = chatRequest.max_tokens ?? chatRequest.max_completion_tokens ?? 4096;

  logger.info(
    {
      userId: user.id,
      model: apiModelId,
      provider: aiSdkProvider,
      sdkPath: 'v2-ai-sdk',
      hasTools: !!sdkTools,
      streaming: chatRequest.stream !== false,
      contextCompacted,
    },
    'v2: routing to AI SDK',
  );

  try {
    const streamResponse = await createAiSdkStream({
      model: languageModel,
      messages: nonSystemMessages,
      system,
      maxTokens,
      temperature: chatRequest.temperature,
      topP: chatRequest.top_p,
      tools: sdkTools,
      providerOptions,
      abortSignal: request.signal,
      onFinish: ({ text, usage, finishReason, reasoning }) => {
        logger.info(
          {
            userId: user.id,
            model: apiModelId,
            provider: aiSdkProvider,
            promptTokens: usage?.promptTokens,
            completionTokens: usage?.completionTokens,
            finishReason,
            hasReasoning: !!reasoning,
            responseLength: text.length,
          },
          'v2: AI SDK stream finished',
        );
      },
    });

    // Attach extra AGI-specific headers to the AI SDK response
    const responseHeaders = new Headers(streamResponse.headers);
    responseHeaders.set('x-agi-provider', aiSdkProvider);
    responseHeaders.set('x-agi-sdk-path', 'v2-ai-sdk');
    responseHeaders.set('x-agi-model', apiModelId);
    if (contextCompacted) {
      responseHeaders.set('x-context-compacted', 'true');
    }

    const corsHeaders = getCorsHeaders(request);
    const securityHeaders = getSecurityHeaders();
    for (const [k, v] of Object.entries({ ...corsHeaders, ...securityHeaders })) {
      responseHeaders.set(k, v);
    }

    return new Response(streamResponse.body, {
      status: streamResponse.status,
      headers: responseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err, userId: user.id, model: apiModelId, provider: aiSdkProvider },
      'v2: AI SDK stream error',
    );

    let status = 500;
    let errorType = 'server_error';
    if (message.includes('401') || message.includes('Unauthorized')) {
      status = 401;
      errorType = 'authentication_error';
    } else if (message.includes('429') || message.includes('rate limit')) {
      status = 429;
      errorType = 'rate_limit_error';
    } else if (message.includes('404') || message.includes('not found')) {
      status = 404;
      errorType = 'not_found';
    }

    return NextResponse.json(
      { error: { message, type: errorType } },
      { status, headers: { ...getCorsHeaders(request), ...getSecurityHeaders() } },
    );
  }
}

export const POST = withErrorHandler(handleV2Chat);

export function OPTIONS(request: NextRequest) {
  return (
    handleCorsPreflightRequest(request) ??
    new NextResponse(null, { status: 204, headers: getSecurityHeaders() })
  );
}
