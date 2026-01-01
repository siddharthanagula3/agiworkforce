import 'server-only';

import { BaseLLMProvider, LLMProviderRequest, LLMProviderResponse } from './base';
import { logger } from '@/lib/logger';

export class MoonshotProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    return 'https://api.moonshot.cn/v1';
  }

  async sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body = {
      model: request.model,
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.max_tokens !== undefined && { max_tokens: request.max_tokens }),
      ...(request.stream !== undefined && { stream: request.stream }),
    };

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
          'Moonshot API error',
        );

        // Handle specific error types
        if (response.status === 401) {
          throw new Error('Moonshot API authentication failed. Please check your API key.');
        } else if (response.status === 429) {
          throw new Error('Moonshot API rate limit exceeded. Please try again later.');
        } else if (response.status >= 500) {
          throw new Error('Moonshot API service temporarily unavailable. Please try again later.');
        } else {
          throw new Error(`Moonshot API error: ${response.status} ${errorText}`);
        }
      }

      const data = await response.json();

      // Check for error in response (Moonshot returns errors in response body)
      if (data.error) {
        logger.error(
          { error: data.error, model: request.model },
          'Moonshot API returned error in response',
        );
        throw new Error(
          `Moonshot API error: ${data.error.type || 'unknown'} - ${data.error.message || JSON.stringify(data.error)}`,
        );
      }

      return {
        content: data.choices[0]?.message?.content || '',
        model: data.model || request.model,
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        finishReason: data.choices[0]?.finish_reason,
        // Moonshot supports cached_tokens
        cachedInputTokens: data.usage?.cached_tokens,
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'Moonshot request failed');
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
      })),
      stream: true,
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.max_tokens !== undefined) body.max_tokens = request.max_tokens;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Moonshot API error: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming request');
    }

    return response.body;
  }
}
