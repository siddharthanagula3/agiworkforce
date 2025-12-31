import 'server-only';

import { BaseLLMProvider, LLMProviderRequest, LLMProviderResponse } from './base';
import { logger } from '@/lib/logger';

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
          messageObj.tool_calls = msg.tool_calls;
        }
        if (msg.tool_call_id) {
          messageObj.tool_call_id = msg.tool_call_id;
        }

        // Add cache_control to last message if prompt caching is enabled
        if (request.usePromptCache && index === array.length - 1 && msg.role === 'user') {
          messageObj.cache_control = { type: 'ephemeral' };
        }

        return messageObj;
      }),
    };
    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }
    if (request.max_tokens !== undefined) {
      body.max_tokens = request.max_tokens;
    }
    if (request.stream !== undefined) {
      body.stream = request.stream;
    }
    if (request.tools) {
      body.tools = request.tools;
    }
    if (request.tool_choice) {
      body.tool_choice = request.tool_choice;
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
        if (response.status === 401) {
          throw new Error('OpenAI API authentication failed. Please check your API key.');
        } else if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          throw new Error(
            `OpenAI API rate limit exceeded. ${retryAfter ? `Retry after ${retryAfter} seconds.` : 'Please try again later.'}`,
          );
        } else if (response.status === 500 || response.status === 502 || response.status === 503) {
          throw new Error('OpenAI API service temporarily unavailable. Please try again later.');
        } else {
          throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
        }
      }

      const data = await response.json();

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

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.max_tokens !== undefined) body.max_tokens = request.max_tokens;
    if (request.tools) body.tools = request.tools;
    if (request.tool_choice) body.tool_choice = request.tool_choice;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming request');
    }

    return response.body;
  }
}
