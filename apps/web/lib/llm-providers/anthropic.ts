import 'server-only';

import { BaseLLMProvider, LLMProviderRequest, LLMProviderResponse } from './base';
import { logger } from '@/lib/logger';

export class AnthropicProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    return 'https://api.anthropic.com/v1';
  }

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2024-10-22', // Updated for Claude 4.5 features
    };
  }

  async sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    const url = `${this.baseUrl}/messages`;

    // Convert messages format for Anthropic
    const messages = request.messages
      .filter((msg) => msg.role !== 'system')
      .map((msg, index, array) => {
        const contentObj: Record<string, unknown> = {
          role: msg.role === 'tool' ? 'user' : msg.role,
          content: msg.content,
        };

        // Add cache_control to last message if prompt caching is enabled
        if (request.usePromptCache && index === array.length - 1) {
          contentObj.cache_control = { type: 'ephemeral' };
        }

        return contentObj;
      });

    const systemMessage = request.messages.find((msg) => msg.role === 'system');

    // Build system content with cache_control if caching is enabled
    let systemContent: unknown = undefined;
    if (systemMessage) {
      if (request.usePromptCache) {
        systemContent = [
          {
            type: 'text',
            text: systemMessage.content,
            cache_control: { type: 'ephemeral' },
          },
        ];
      } else {
        systemContent = systemMessage.content;
      }
    }

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.max_tokens || 16384, // Increased for Claude 4.5 quality outputs
      messages,
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.tools && { tools: request.tools }),
    };

    if (systemContent) {
      body.system = systemContent;
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
          'Anthropic API error',
        );

        // Handle specific error types based on status code
        if (response.status === 401) {
          throw new Error('Anthropic API authentication failed. Please check your API key.');
        } else if (response.status === 403) {
          throw new Error(
            'Anthropic API permission denied. Your API key may not have access to this resource.',
          );
        } else if (response.status === 413) {
          throw new Error('Anthropic API request too large. Maximum request size is 32 MB.');
        } else if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          throw new Error(
            `Anthropic API rate limit exceeded. ${retryAfter ? `Retry after ${retryAfter} seconds.` : 'Please try again later.'}`,
          );
        } else if (response.status === 500) {
          throw new Error('Anthropic API internal server error. Please try again later.');
        } else if (response.status === 529) {
          throw new Error('Anthropic API is temporarily overloaded. Please try again later.');
        } else {
          throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
        }
      }

      const data = await response.json();

      // Check stop_reason for error cases
      const stopReason = data.stop_reason;
      if (stopReason === 'max_tokens') {
        logger.warn(
          { model: request.model, stopReason },
          'Anthropic response was truncated due to max_tokens limit',
        );
      } else if (stopReason === 'refusal') {
        logger.warn({ model: request.model, stopReason }, 'Anthropic request was refused');
      }

      // Extract text content from content array
      const textContent =
        data.content?.find((block: { type: string }) => block.type === 'text')?.text || '';

      return {
        content: textContent,
        model: data.model || request.model,
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        finishReason: stopReason,
        cacheCreationInputTokens: data.usage?.cache_creation_input_tokens,
        cachedInputTokens: data.usage?.cache_read_input_tokens,
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'Anthropic request failed');
      throw error;
    }
  }
  async streamRequest(request: LLMProviderRequest): Promise<ReadableStream> {
    const url = `${this.baseUrl}/messages`;

    const messages = request.messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'tool' ? 'user' : msg.role,
        content: msg.content,
      }));

    const systemMessage = request.messages.find((msg) => msg.role === 'system');

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.max_tokens || 16384, // Increased for Claude 4.5 quality outputs
      messages,
      stream: true,
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.tools && { tools: request.tools }),
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming request');
    }

    return response.body;
  }
}
