import 'server-only';

import {
  BaseLLMProvider,
  LLMProviderRequest,
  LLMProviderResponse,
  RETRYABLE_HTTP_STATUS_CODES,
} from './base';
import { logger } from '@/lib/logger';
import { buildAnthropicCacheControl, resolveCacheRetention } from './cache-retention';

/** Site URL for OpenRouter attribution header (required by OpenRouter ToS). */
const OPENROUTER_SITE_URL = process.env['NEXT_PUBLIC_APP_URL'] || 'https://agiworkforce.app';
/** App name shown in OpenRouter dashboard under attribution. */
const OPENROUTER_APP_TITLE = 'AGI Workforce';

/**
 * Map messages to OpenAI-compatible format, preserving tool_calls and tool_call_id.
 * OpenRouter proxies to underlying models using the OpenAI wire format.
 *
 * For Anthropic-routed models (modelId starts with 'anthropic/'), OpenRouter
 * passes cache_control through to the upstream Anthropic API on system messages.
 * Reference: openclaw extra-params.openrouter-cache-control.test.ts · system
 * message only, not last-user or last-tool_result.
 */
function mapMessages(
  messages: LLMProviderRequest['messages'],
  systemCacheControl: { type: 'ephemeral'; ttl?: '5m' | '1h' } | null = null,
) {
  return messages.map((msg) => {
    const mapped: Record<string, unknown> = {
      role: msg.role,
      content: msg.content,
    };
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      mapped['tool_calls'] = msg.tool_calls;
    }
    if (msg.tool_call_id) {
      mapped['tool_call_id'] = msg.tool_call_id;
    }

    // Inject Anthropic cache_control on the system message for anthropic/* routes.
    // OpenRouter passes this through to upstream Anthropic; do not apply to
    // non-Anthropic models (google/*, meta-llama/*, etc.).
    if (msg.role === 'system' && systemCacheControl) {
      const text = typeof msg.content === 'string' ? msg.content : '';
      mapped['content'] = [{ type: 'text', text, cache_control: systemCacheControl }];
    }

    return mapped;
  });
}

/**
 * OpenRouter Provider
 *
 * Routes requests to hundreds of underlying models via OpenAI-compatible API.
 * Env key: OPENROUTER_API_KEY
 *
 * Requires two attribution headers per OpenRouter ToS:
 *   HTTP-Referer: <site URL>
 *   X-Title: <app name>
 *
 * Model IDs use provider-namespaced format from models.json catalog, e.g.:
 *   meta-llama/llama-3.3-70b-instruct:free
 *   mistralai/mistral-small-3.1-24b-instruct:free
 *   qwen/qwen3-coder:free
 *   nvidia/llama-3.3-nemotron-super-49b-v1:free (OpenRouter free tier — distinct from NIM Nemotron 3)
 *
 * Tool calling and vision capabilities depend on the underlying routed model.
 * Streaming uses OpenAI SSE format.
 */
export class OpenRouterProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    return 'https://openrouter.ai/api/v1';
  }

  protected override getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
      'HTTP-Referer': OPENROUTER_SITE_URL,
      'X-Title': OPENROUTER_APP_TITLE,
    };
  }

  async sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    // For Anthropic-routed models, inject cache_control on the system message.
    // Resolve retention once (stability: do not re-evaluate mid-session).
    const retention = resolveCacheRetention(undefined, 'openrouter', request.model);
    const systemCacheControl = buildAnthropicCacheControl(
      request.cacheRetention ?? retention ?? undefined,
    );

    const body: Record<string, unknown> = {
      model: request.model,
      messages: mapMessages(request.messages, systemCacheControl),
    };

    if (request.temperature !== undefined) {
      body['temperature'] = request.temperature;
    }
    if (request.max_tokens !== undefined) {
      body['max_tokens'] = request.max_tokens;
    }
    if (request.stream !== undefined) {
      body['stream'] = request.stream;
    }
    if (request.tools && request.tools.length > 0) {
      body['tools'] = request.tools.map((tool: any) => {
        if (tool.function) {
          return { type: 'function', function: tool.function };
        }
        if (tool.input_schema) {
          return {
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema,
            },
          };
        }
        return { ...tool, type: tool.type || 'function' };
      });
      if (request.tool_choice !== undefined) {
        body['tool_choice'] = request.tool_choice;
      }
    }

    try {
      const response = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let errorText: string;
        try {
          errorText = await response.text();
        } catch {
          errorText = response.statusText;
        }

        logger.error(
          { status: response.status, error: errorText, model: request.model },
          'OpenRouter API error',
        );

        if (response.status === 401) {
          throw new Error(
            'OpenRouter authentication error (401): Please check your OPENROUTER_API_KEY.',
          );
        } else if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          throw new Error(
            `OpenRouter rate limit exceeded (429). ${retryAfter ? `Retry after ${retryAfter} seconds.` : 'Please try again later.'}`,
          );
        } else if (response.status === 402) {
          throw new Error(
            'OpenRouter insufficient credits (402): Please add credits to your account.',
          );
        } else if (RETRYABLE_HTTP_STATUS_CODES.has(response.status)) {
          throw new Error(
            `OpenRouter API service error (${response.status}): Please try again later.`,
          );
        } else {
          throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
        }
      }

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error(
          `OpenRouter returned empty choices: ${JSON.stringify(data).substring(0, 200)}`,
        );
      }

      const message = data.choices[0]?.message;
      const finishReason = data.choices[0]?.finish_reason;

      // OpenRouter exposes Anthropic-style cache counters when routing to anthropic/*.
      // Fields: usage.cache_read_input_tokens, usage.cache_creation_input_tokens.
      // Reference: openclaw prompt-caching.md "OpenRouter models" section.
      // For NON-Anthropic routes (deepseek/*, openai/*, google/*, …) OpenRouter
      // normalizes usage into the OpenAI shape (usage.prompt_tokens_details.cached_tokens
      // / input_tokens_details.cached_tokens). Read both so the cache-read discount
      // is captured regardless of which underlying model served the request.
      const cacheReadTokens: number | undefined =
        data.usage?.cache_read_input_tokens ??
        data.usage?.prompt_tokens_details?.cached_tokens ??
        data.usage?.input_tokens_details?.cached_tokens ??
        undefined;
      const cacheCreationTokens: number | undefined =
        data.usage?.cache_creation_input_tokens ?? undefined;

      return {
        content: message?.content || '',
        model: data.model || request.model,
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        finishReason,
        cachedInputTokens: cacheReadTokens,
        cacheCreationInputTokens: cacheCreationTokens,
        ...(message?.tool_calls &&
          message.tool_calls.length > 0 && { tool_calls: message.tool_calls }),
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'OpenRouter request failed');
      throw error;
    }
  }

  async streamRequest(request: LLMProviderRequest): Promise<ReadableStream> {
    const url = `${this.baseUrl}/chat/completions`;

    // Resolve Anthropic cache_control for streaming (same logic as sendRequest).
    const retentionStream = resolveCacheRetention(undefined, 'openrouter', request.model);
    const systemCacheControlStream = buildAnthropicCacheControl(
      request.cacheRetention ?? retentionStream ?? undefined,
    );

    const body: Record<string, unknown> = {
      model: request.model,
      messages: mapMessages(request.messages, systemCacheControlStream),
      stream: true,
      // Request a final usage event before [DONE] so streaming callers can
      // capture actual token counts. OpenRouter forwards this to underlying
      // providers; behavior depends on the routed model.
      // Reference: OpenRouter streaming docs (usage reporting section).
      stream_options: { include_usage: true },
    };

    if (request.temperature !== undefined) body['temperature'] = request.temperature;
    if (request.max_tokens !== undefined) body['max_tokens'] = request.max_tokens;
    if (request.tools && request.tools.length > 0) {
      body['tools'] = request.tools.map((tool: any) => {
        if (tool.function) return { type: 'function', function: tool.function };
        if (tool.input_schema) {
          return {
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema,
            },
          };
        }
        return { ...tool, type: tool.type || 'function' };
      });
      if (request.tool_choice !== undefined) body['tool_choice'] = request.tool_choice;
    }

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text();

      let message: string;
      if (status === 401) {
        message = `OpenRouter authentication error (401): ${errorText}`;
      } else if (status === 429) {
        message = `OpenRouter rate limit exceeded (429): ${errorText}`;
      } else if (status === 402) {
        message = `OpenRouter insufficient credits (402): ${errorText}`;
      } else {
        message = `OpenRouter API error: ${status} ${errorText}`;
      }

      throw new Error(message);
    }

    if (!response.body) {
      throw new Error('No response body for OpenRouter streaming request');
    }

    return response.body;
  }
}
