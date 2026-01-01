import 'server-only';

import { BaseLLMProvider, LLMProviderRequest, LLMProviderResponse } from './base';
import { logger } from '@/lib/logger';

export class XAIProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    return 'https://api.x.ai/v1';
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
          'XAI API error',
        );

        // Handle specific error types based on status code
        if (response.status === 400) {
          throw new Error('XAI API invalid request. Please check your request parameters.');
        } else if (response.status === 401) {
          throw new Error('XAI API authentication failed. Please check your API key.');
        } else if (response.status === 429) {
          throw new Error('XAI API rate limit exceeded. Please try again later.');
        } else if (response.status >= 500) {
          throw new Error('XAI API service temporarily unavailable. Please try again later.');
        } else {
          throw new Error(`XAI API error: ${response.status} ${errorText}`);
        }
      }

      const data = await response.json();

      // Check for refusal in response (xAI safety system)
      const message = data.choices[0]?.message;
      if (message?.refusal) {
        logger.warn(
          { refusal: message.refusal, model: request.model },
          'XAI request was refused by safety system',
        );
        throw new Error(`Request was refused: ${message.refusal}`);
      }

      // Check finish_reason for error cases
      const finishReason = data.choices[0]?.finish_reason;
      if (finishReason === 'length') {
        logger.warn(
          { model: request.model, finishReason },
          'XAI response was truncated due to token limit',
        );
      }

      return {
        content: message?.content || '',
        model: data.model || request.model,
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        finishReason,
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'XAI request failed');
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
      throw new Error(`XAI API error: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming request');
    }

    return response.body;
  }
}
