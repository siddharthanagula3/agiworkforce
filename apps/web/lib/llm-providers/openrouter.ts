import 'server-only';

import {
  BaseLLMProvider,
  LLMProviderRequest,
  LLMProviderResponse,
  RETRYABLE_HTTP_STATUS_CODES,
} from './base';
import { logger } from '@/lib/logger';

/** Site URL for OpenRouter attribution header (required by OpenRouter ToS). */
const OPENROUTER_SITE_URL = process.env['NEXT_PUBLIC_APP_URL'] || 'https://agiworkforce.app';
/** App name shown in OpenRouter dashboard under attribution. */
const OPENROUTER_APP_TITLE = 'AGI Workforce';

/**
 * Map messages to OpenAI-compatible format, preserving tool_calls and tool_call_id.
 * OpenRouter proxies to underlying models using the OpenAI wire format.
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
 *   nvidia/nemotron-3-super-120b-a12b:free
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
      logger.error({ error, model: request.model }, 'OpenRouter request failed');
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
