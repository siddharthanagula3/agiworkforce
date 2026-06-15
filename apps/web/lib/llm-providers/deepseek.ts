import 'server-only';

import { BaseLLMProvider, LLMProviderRequest, LLMProviderResponse } from './base';
import { logger } from '@/lib/logger';

/**
 * Map messages to OpenAI-compatible format, preserving tool_calls and tool_call_id
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

export class DeepSeekProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    return 'https://api.deepseek.com';
  }

  protected override getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: mapMessages(request.messages),
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.max_tokens !== undefined && { max_tokens: request.max_tokens }),
      ...(request.stream !== undefined && { stream: request.stream }),
      // DeepSeek supports thinking mode - default to disabled
      thinking: { type: 'disabled' },
    };

    // Include tool definitions if provided
    if (request.tools && request.tools.length > 0) {
      body['tools'] = request.tools;
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
          'DeepSeek API error',
        );

        // Handle specific error types
        if (response.status === 401) {
          throw new Error('DeepSeek API authentication failed. Please check your API key.');
        } else if (response.status === 429) {
          throw new Error('DeepSeek API rate limit exceeded. Please try again later.');
        } else if (response.status >= 500) {
          throw new Error('DeepSeek API service temporarily unavailable. Please try again later.');
        } else {
          throw new Error(`DeepSeek API error: ${response.status} ${errorText}`);
        }
      }

      const data = await response.json();
      const message = data.choices[0]?.message;

      // DeepSeek automatic context caching: ~90% off on cache hits.
      // Usage fields (DeepSeek Chat Completions, June 2026):
      //   usage.prompt_cache_hit_tokens  — tokens served from cache (billed at cached_input rate)
      //   usage.prompt_cache_miss_tokens — tokens NOT in cache (billed at full input rate)
      // There is no separate cache_creation counter; miss tokens are billed at the
      // standard input rate (i.e., the creation cost equals the normal input rate).
      const deepseekCacheHit: number | undefined = data.usage?.prompt_cache_hit_tokens ?? undefined;

      return {
        content: message?.content || '',
        model: data.model || request.model,
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        finishReason: data.choices[0]?.finish_reason,
        cachedInputTokens: deepseekCacheHit,
        // Extract tool_calls from response (OpenAI format)
        ...(message?.tool_calls &&
          message.tool_calls.length > 0 && { tool_calls: message.tool_calls }),
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'DeepSeek request failed');
      throw error;
    }
  }

  async streamRequest(request: LLMProviderRequest): Promise<ReadableStream> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: mapMessages(request.messages),
      stream: true,
      // DeepSeek supports thinking mode - default to disabled
      thinking: { type: 'disabled' },
    };

    if (request.temperature !== undefined) body['temperature'] = request.temperature;
    if (request.max_tokens !== undefined) body['max_tokens'] = request.max_tokens;

    // Include tool definitions if provided
    if (request.tools && request.tools.length > 0) {
      body['tools'] = request.tools;
      if (request.tool_choice !== undefined) {
        body['tool_choice'] = request.tool_choice;
      }
    }

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming request');
    }

    return response.body;
  }
}
