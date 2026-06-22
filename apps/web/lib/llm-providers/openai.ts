import 'server-only';

/**
 * Web-internal OpenAI adapter (fetch-based, BaseLLMProvider contract).
 *
 * WHY TWO ADAPTERS EXIST:
 * This file implements the web app's internal LLM routing layer
 * (BaseLLMProvider, used by /api/llm/v1 and /api/llm/v2). It speaks the
 * web-internal LLMProviderRequest/LLMProviderResponse contract.
 *
 * The separate `packages/providers/openai/` adapter implements the
 * cross-surface ProviderAdapter contract (used by CLI, desktop, and the
 * /api/v1/providers/* routes via @agiworkforce/llm-normalize). It uses the
 * official openai npm SDK and supports the Responses API path.
 *
 * CONSOLIDATION STATUS:
 * Full consolidation would require migrating the web's internal LLM layer
 * to the ProviderAdapter contract, which is a larger refactor tracked
 * separately. In the interim, both adapters share model ID resolution via
 * getModelMetadataById / normalizeModelId from @agiworkforce/types, so
 * model IDs remain a single source of truth (packages/types/src/models.json).
 * See packages/providers/openai/src/index.ts for the SDK-based adapter.
 */

import {
  BaseLLMProvider,
  LLMProviderRequest,
  LLMProviderResponse,
  RETRYABLE_HTTP_STATUS_CODES,
} from './base';
import { logger } from '@/lib/logger';
import { getModelMetadataById, normalizeModelId } from '@agiworkforce/types';
import { supportsOpenAIReasoningEffort } from '@agiworkforce/llm-normalize';

/**
 * Check if a model requires max_completion_tokens instead of max_tokens
 */
function requiresMaxCompletionTokens(model: string): boolean {
  const metadata = getModelMetadataById(model);
  if (metadata?.provider === 'openai') {
    return metadata.capabilities.thinking;
  }

  const normalized = normalizeModelId(model)?.toLowerCase() ?? model.toLowerCase();
  return (
    normalized === 'o1' ||
    normalized === 'o3' ||
    normalized.startsWith('o1-') ||
    normalized.startsWith('o3-') ||
    normalized.startsWith('o4-')
  );
}

function openAIModelSupportsXHigh(model: string): boolean {
  return supportsOpenAIReasoningEffort(
    { provider: 'openai', id: normalizeModelId(model) ?? model },
    'xhigh',
  );
}

function normalizeReasoningEffort(effort: string | undefined, model: string): string | undefined {
  const normalized = effort?.toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return normalized;
  }
  if (normalized === 'xhigh' && openAIModelSupportsXHigh(model)) return normalized;
  return undefined;
}

/**
 * Derive a stable OpenAI `prompt_cache_key` from the request's STABLE prefix
 * (system prompt + tool names + model). Per OpenAI's prompt-caching docs this
 * optional key is used to route requests that share a common prefix to the same
 * cache, maximizing hit rates across requests. We hash only the stable prefix
 * (NOT the volatile user turn) so every request reusing the same system+tools
 * lands on the same key. Returns undefined when there is no system prompt (no
 * meaningful prefix to pin), letting OpenAI fall back to automatic prefix
 * matching. Uses a fast non-cryptographic FNV-1a hash — this is a routing hint,
 * not a security boundary.
 */
function derivePromptCacheKey(request: LLMProviderRequest): string | undefined {
  const system = request.messages.find((m) => m.role === 'system')?.content;
  if (!system) {
    return undefined;
  }
  const toolNames = Array.isArray(request.tools)
    ? request.tools
        .map((t) => {
          const tool = t as { function?: { name?: string }; name?: string };
          return tool.function?.name ?? tool.name ?? '';
        })
        .join(',')
    : '';
  const seed = `${request.model} ${system} ${toolNames}`;
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `agi-${(hash >>> 0).toString(16)}`;
}

export class OpenAIProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    return 'https://api.openai.com/v1';
  }

  async sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map((msg) => {
        const messageObj: Record<string, unknown> = {
          role: msg.role,
          content: msg.content,
        };
        if (msg.tool_calls) {
          messageObj['tool_calls'] = msg.tool_calls;
        }
        if (msg.tool_call_id) {
          messageObj['tool_call_id'] = msg.tool_call_id;
        }

        // NOTE: OpenAI does NOT support message-level cache_control markers.
        // Prompt caching on OpenAI is automatic for prefixes >= 1024 tokens on
        // supported models (gpt-4o+, gpt-5 series). Cache hits are reported via
        // usage.prompt_tokens_details.cached_tokens in the response · see below.

        return messageObj;
      }),
    };
    if (request.temperature !== undefined) {
      body['temperature'] = request.temperature;
    }
    if (request.max_tokens !== undefined) {
      // Use max_completion_tokens for OpenAI thinking/reasoning models.
      // Fall back to max_tokens for non-thinking or legacy-compatible models.
      if (requiresMaxCompletionTokens(request.model)) {
        body['max_completion_tokens'] = request.max_tokens;
      } else {
        body['max_tokens'] = request.max_tokens;
      }
    }
    const reasoningEffort = normalizeReasoningEffort(request.effort, request.model);
    const hasTools = Array.isArray(request.tools) && request.tools.length > 0;
    if (reasoningEffort && !hasTools) {
      // OpenAI /v1/chat/completions returns HTTP 400 when a request combines
      // reasoning_effort with function tools (observed for GPT-5 series).
      // When tools are present, omit reasoning_effort so the call succeeds.
      // TODO: migrate GPT-5 tool requests to /v1/responses endpoint (see
      // packages/llm-normalize/src/openai-responses-payload-policy.ts).
      body['reasoning_effort'] = reasoningEffort;
    }
    if (request.stream !== undefined) {
      body['stream'] = request.stream;
    }
    // Stable prompt_cache_key maximizes automatic-cache hit rates across requests
    // sharing the same system+tools prefix (OpenAI prompt caching is automatic;
    // the key only improves routing). Pin only when caching is desired.
    if (request.usePromptCache !== false) {
      const promptCacheKey = derivePromptCacheKey(request);
      if (promptCacheKey) {
        body['prompt_cache_key'] = promptCacheKey;
      }
    }
    if (request.tools) {
      // Transform tools to OpenAI format and ensure 'type' field
      body['tools'] = request.tools.map((tool: any) => {
        // If tool already has function field, it's in OpenAI format
        if (tool.function) {
          return {
            type: 'function',
            function: tool.function,
          };
        }
        // If tool has input_schema, it's in Anthropic format - transform it
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
        // Fallback: assume it's already in OpenAI format, just ensure type field
        return {
          ...tool,
          type: tool.type || 'function',
        };
      });
    }
    if (request.tool_choice) {
      body['tool_choice'] = request.tool_choice;
    }

    try {
      const response = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let errorText: string;
        let errorData: unknown;
        try {
          errorText = await response.text();
          errorData = JSON.parse(errorText);
        } catch {
          errorText = response.statusText;
          errorData = { status: response.status };
        }

        logger.error(
          {
            status: response.status,
            error: errorText,
            errorData,
            model: request.model,
          },
          'OpenAI API error',
        );

        // Handle specific error types based on status code
        // Use keywords that route.ts error matching expects
        if (response.status === 401) {
          throw new Error('OpenAI authentication error (401): Please check your API key.');
        } else if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          throw new Error(
            `OpenAI rate limit exceeded (429). ${retryAfter ? `Retry after ${retryAfter} seconds.` : 'Please try again later.'}`,
          );
        } else if (response.status === 402) {
          throw new Error('OpenAI insufficient credits (402): Please upgrade your plan.');
        } else if (response.status === 404) {
          throw new Error(`OpenAI not found (404): ${errorText}`);
        } else if (RETRYABLE_HTTP_STATUS_CODES.has(response.status)) {
          throw new Error(`OpenAI API service error (${response.status}): Please try again later.`);
        } else {
          throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
        }
      }

      const data = await response.json();

      // Guard against empty choices (content-policy / filtered responses)
      if (!data.choices || data.choices.length === 0) {
        throw new Error(`OpenAI returned empty choices: ${JSON.stringify(data).substring(0, 200)}`);
      }

      // Check for refusal in response (OpenAI safety system)
      const message = data.choices[0]?.message;
      if (message?.refusal) {
        logger.warn(
          { refusal: message.refusal, model: request.model },
          'OpenAI request was refused by safety system',
        );
        throw new Error(`Request was refused: ${message.refusal}`);
      }

      // Check finish_reason for error cases
      const finishReason = data.choices[0]?.finish_reason;
      if (finishReason === 'length') {
        logger.warn(
          { model: request.model, finishReason },
          'OpenAI response was truncated due to token limit',
        );
      } else if (finishReason === 'content_filter') {
        logger.warn(
          { model: request.model, finishReason },
          'OpenAI response was filtered by content filter',
        );
      }

      // OpenAI exposes cache hits via:
      //   Chat Completions: usage.prompt_tokens_details.cached_tokens
      //   Responses API:    usage.input_tokens_details.cached_tokens
      // OpenAI does NOT expose a separate cache_creation counter.
      // Reference: openclaw prompt-caching.md "OpenAI direct API" section.
      const openAiCachedTokens =
        data.usage?.prompt_tokens_details?.cached_tokens ??
        data.usage?.input_tokens_details?.cached_tokens ??
        undefined;

      // Reasoning tokens:
      //   Chat Completions: usage.completion_tokens_details.reasoning_tokens
      //   Responses API:    usage.output_tokens_details.reasoning_tokens
      // Billed at output rate; parsed separately from completion_tokens.
      const reasoningOutputTokens =
        data.usage?.completion_tokens_details?.reasoning_tokens ??
        data.usage?.output_tokens_details?.reasoning_tokens ??
        undefined;

      return {
        content: message?.content || '',
        model: data.model || request.model,
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        finishReason,
        // cacheCreationInputTokens intentionally omitted for OpenAI (not exposed).
        cachedInputTokens: openAiCachedTokens,
        reasoningOutputTokens,
        tool_calls: message?.tool_calls, // Include tool calls if present
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'OpenAI request failed');
      throw error;
    }
  }
  async streamRequest(request: LLMProviderRequest): Promise<ReadableStream> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        ...(msg.tool_calls && { tool_calls: msg.tool_calls }),
        ...(msg.tool_call_id && { tool_call_id: msg.tool_call_id }),
      })),
      stream: true,
      // Request a final usage event before [DONE] so streaming callers can
      // capture actual token counts including cache hits and reasoning tokens.
      // Reference: OpenAI Chat Completions streaming usage docs.
      stream_options: { include_usage: true },
    };

    if (request.temperature !== undefined) body['temperature'] = request.temperature;
    if (request.max_tokens !== undefined) {
      // Use max_completion_tokens for reasoning models (GPT-5 series, o-series)
      // Use max_tokens for legacy models (GPT-5.5, GPT-5.4-mini, etc.)
      if (requiresMaxCompletionTokens(request.model)) {
        body['max_completion_tokens'] = request.max_tokens;
      } else {
        body['max_tokens'] = request.max_tokens;
      }
    }
    const reasoningEffort = normalizeReasoningEffort(request.effort, request.model);
    const hasTools = Array.isArray(request.tools) && request.tools.length > 0;
    if (reasoningEffort && !hasTools) {
      // OpenAI /v1/chat/completions returns HTTP 400 when a request combines
      // reasoning_effort with function tools (observed for GPT-5 series).
      // When tools are present, omit reasoning_effort so the call succeeds.
      // TODO: migrate GPT-5 tool requests to /v1/responses endpoint (see
      // packages/llm-normalize/src/openai-responses-payload-policy.ts).
      body['reasoning_effort'] = reasoningEffort;
    }
    // Stable prompt_cache_key (same derivation as sendRequest) to improve
    // automatic-cache hit routing across requests sharing the system+tools prefix.
    if (request.usePromptCache !== false) {
      const promptCacheKey = derivePromptCacheKey(request);
      if (promptCacheKey) {
        body['prompt_cache_key'] = promptCacheKey;
      }
    }
    if (request.tools) {
      // Transform tools to OpenAI format and ensure 'type' field
      body['tools'] = request.tools.map((tool: any) => {
        // If tool already has function field, it's in OpenAI format
        if (tool.function) {
          return {
            type: 'function',
            function: tool.function,
          };
        }
        // If tool has input_schema, it's in Anthropic format - transform it
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
        // Fallback: assume it's already in OpenAI format, just ensure type field
        return {
          ...tool,
          type: tool.type || 'function',
        };
      });
    }
    if (request.tool_choice) body['tool_choice'] = request.tool_choice;

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text();

      // Create error message with keywords that route.ts can match
      let message = '';
      if (status === 401) {
        message = `OpenAI authentication error (401): ${errorText}`;
      } else if (status === 429) {
        message = `OpenAI rate limit exceeded (429): ${errorText}`;
      } else if (status === 402) {
        message = `OpenAI insufficient credits (402): ${errorText}`;
      } else if (status === 404) {
        message = `OpenAI not found (404): ${errorText}`;
      } else {
        message = `OpenAI API error: ${status} ${errorText}`;
      }

      throw new Error(message);
    }

    if (!response.body) {
      throw new Error('No response body for streaming request');
    }

    return response.body;
  }
}
