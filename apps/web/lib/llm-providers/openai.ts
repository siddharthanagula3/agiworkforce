/* eslint-disable @typescript-eslint/no-explicit-any -- LLM tool schemas have dynamic structure */
import 'server-only';

import {
  BaseLLMProvider,
  LLMProviderRequest,
  LLMProviderResponse,
  RETRYABLE_HTTP_STATUS_CODES,
} from './base';
import { logger } from '@/lib/logger';

/**
 * Models that require max_completion_tokens instead of max_tokens.
 * These are reasoning models (GPT-5 series, o-series) that generate
 * both visible output tokens and internal reasoning tokens.
 *
 * See: https://help.openai.com/en/articles/5072518-controlling-the-length-of-openai-model-responses
 */
const MODELS_REQUIRING_MAX_COMPLETION_TOKENS = [
  // GPT-5 series (reasoning models)
  'gpt-5',
  'gpt-5-turbo',
  'gpt-5-mini',
  'gpt-5-nano',
  // O-series (reasoning models)
  'o1',
  'o1-mini',
  'o1-preview',
  'o3',
  'o3-mini',
  'o4-mini',
];

/**
 * Check if a model requires max_completion_tokens instead of max_tokens
 */
function requiresMaxCompletionTokens(model: string): boolean {
  const modelLower = model.toLowerCase();
  return MODELS_REQUIRING_MAX_COMPLETION_TOKENS.some(
    (m) => modelLower === m || modelLower.startsWith(`${m}-`),
  );
}

export class OpenAIProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    return 'https://api.openai.com/v1';
  }

  async sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map((msg, index, array) => {
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

        // Add cache_control to last message if prompt caching is enabled
        if (request.usePromptCache && index === array.length - 1 && msg.role === 'user') {
          messageObj['cache_control'] = { type: 'ephemeral' };
        }

        return messageObj;
      }),
    };
    if (request.temperature !== undefined) {
      body['temperature'] = request.temperature;
    }
    if (request.max_tokens !== undefined) {
      // Use max_completion_tokens for reasoning models (GPT-5 series, o-series)
      // Use max_tokens for legacy models (GPT-4o, GPT-4o-mini, etc.)
      if (requiresMaxCompletionTokens(request.model)) {
        body['max_completion_tokens'] = request.max_tokens;
      } else {
        body['max_tokens'] = request.max_tokens;
      }
    }
    if (request.stream !== undefined) {
      body['stream'] = request.stream;
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
      const response = await fetch(url, {
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

      return {
        content: message?.content || '',
        model: data.model || request.model,
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        finishReason,
        cacheCreationInputTokens: data.usage?.cache_creation_input_tokens,
        cachedInputTokens: data.usage?.cache_read_input_tokens,
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
    };

    if (request.temperature !== undefined) body['temperature'] = request.temperature;
    if (request.max_tokens !== undefined) {
      // Use max_completion_tokens for reasoning models (GPT-5 series, o-series)
      // Use max_tokens for legacy models (GPT-4o, GPT-4o-mini, etc.)
      if (requiresMaxCompletionTokens(request.model)) {
        body['max_completion_tokens'] = request.max_tokens;
      } else {
        body['max_tokens'] = request.max_tokens;
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

    const response = await fetch(url, {
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
