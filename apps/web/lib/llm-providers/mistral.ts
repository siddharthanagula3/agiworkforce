import 'server-only';

import {
  BaseLLMProvider,
  LLMProviderRequest,
  LLMProviderResponse,
  RETRYABLE_HTTP_STATUS_CODES,
} from './base';
import { logger } from '@/lib/logger';

/**
 * Map messages to OpenAI-compatible format, preserving tool_calls and tool_call_id.
 * Mistral uses the same wire format as OpenAI.
 */
function mapMessages(messages: LLMProviderRequest['messages']) {
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
    return mapped;
  });
}

/**
 * Mistral AI Provider
 *
 * Uses OpenAI-compatible API format (chat/completions endpoint).
 * Env key: MISTRAL_API_KEY
 *
 * Supports:
 * - Streaming SSE (OpenAI format)
 * - Tool/function calling (OpenAI-compatible schema)
 * - Vision on pixtral-large-latest
 * - Prompt caching (not yet; omitted here)
 *
 * Model IDs are resolved through the canonical models.json catalog:
 *   mistral-large-3  -> apiModelId: mistral-large-2512
 *   mistral-medium-3 -> apiModelId: mistral-medium-2508
 *   mistral-small-3  -> apiModelId: mistral-small-2603 (Mistral Small 4; 2506 deprecated Apr 2026)
 *   codestral-2      -> apiModelId: codestral-2508
 *   pixtral-large    -> apiModelId: pixtral-large-latest
 */
export class MistralProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    return 'https://api.mistral.ai/v1';
  }

  async sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: mapMessages(request.messages),
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
      const response = await fetch(url, {
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
          'Mistral API error',
        );

        if (response.status === 401) {
          throw new Error('Mistral authentication error (401): Please check your MISTRAL_API_KEY.');
        } else if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          throw new Error(
            `Mistral rate limit exceeded (429). ${retryAfter ? `Retry after ${retryAfter} seconds.` : 'Please try again later.'}`,
          );
        } else if (response.status === 402) {
          throw new Error('Mistral insufficient credits (402): Please upgrade your plan.');
        } else if (RETRYABLE_HTTP_STATUS_CODES.has(response.status)) {
          throw new Error(
            `Mistral API service error (${response.status}): Please try again later.`,
          );
        } else {
          throw new Error(`Mistral API error: ${response.status} ${errorText}`);
        }
      }

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error(
          `Mistral returned empty choices: ${JSON.stringify(data).substring(0, 200)}`,
        );
      }

      const message = data.choices[0]?.message;
      const finishReason = data.choices[0]?.finish_reason;

      return {
        content: message?.content || '',
        model: data.model || request.model,
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        finishReason,
        ...(message?.tool_calls &&
          message.tool_calls.length > 0 && { tool_calls: message.tool_calls }),
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'Mistral request failed');
      throw error;
    }
  }

  async streamRequest(request: LLMProviderRequest): Promise<ReadableStream> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: mapMessages(request.messages),
      stream: true,
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

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text();

      let message: string;
      if (status === 401) {
        message = `Mistral authentication error (401): ${errorText}`;
      } else if (status === 429) {
        message = `Mistral rate limit exceeded (429): ${errorText}`;
      } else if (status === 402) {
        message = `Mistral insufficient credits (402): ${errorText}`;
      } else {
        message = `Mistral API error: ${status} ${errorText}`;
      }

      throw new Error(message);
    }

    if (!response.body) {
      throw new Error('No response body for Mistral streaming request');
    }

    return response.body;
  }
}
