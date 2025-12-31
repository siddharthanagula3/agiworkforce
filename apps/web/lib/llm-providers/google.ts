import 'server-only';

import { BaseLLMProvider, LLMProviderRequest, LLMProviderResponse } from './base';
import { logger } from '@/lib/logger';

export class GoogleProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  async sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    const url = `${this.baseUrl}/models/${request.model}:generateContent?key=${this.apiKey}`;

    // Convert messages format for Google Gemini
    const contents = request.messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

    const systemInstruction = request.messages.find((msg) => msg.role === 'system');

    const body: Record<string, unknown> = {
      contents,
      ...(systemInstruction && {
        systemInstruction: {
          parts: [{ text: systemInstruction.content }],
        },
      }),
      generationConfig: {
        ...(request.temperature !== undefined && { temperature: request.temperature }),
        ...(request.max_tokens !== undefined && { maxOutputTokens: request.max_tokens }),
      },
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
          'Google API error',
        );

        // Handle specific error types based on status code
        if (response.status === 400) {
          throw new Error('Google API invalid request. Please check your request parameters.');
        } else if (response.status === 401) {
          throw new Error('Google API authentication failed. Please check your API key.');
        } else if (response.status === 403) {
          throw new Error(
            'Google API permission denied. Your API key may not have access to this resource.',
          );
        } else if (response.status === 429) {
          throw new Error('Google API rate limit exceeded. Please try again later.');
        } else if (response.status >= 500) {
          throw new Error('Google API service temporarily unavailable. Please try again later.');
        } else {
          throw new Error(`Google API error: ${response.status} ${errorText}`);
        }
      }

      const data = await response.json();

      // Check for errors in response
      if (data.error) {
        logger.error(
          { error: data.error, model: request.model },
          'Google API returned error in response',
        );
        throw new Error(`Google API error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      const candidate = data.candidates?.[0];
      if (!candidate) {
        logger.warn({ model: request.model, data }, 'Google API returned no candidates');
        throw new Error('Google API returned no response candidates');
      }

      // Check finishReason for error cases
      const finishReason = candidate.finishReason;
      if (finishReason === 'MAX_TOKENS') {
        logger.warn(
          { model: request.model, finishReason },
          'Google response was truncated due to token limit',
        );
      } else if (finishReason === 'SAFETY') {
        logger.warn(
          { model: request.model, finishReason, safetyRatings: candidate.safetyRatings },
          'Google response was blocked by safety filters',
        );
        throw new Error('Response was blocked by safety filters');
      } else if (finishReason === 'RECITATION') {
        logger.warn(
          { model: request.model, finishReason },
          'Google response was blocked due to recitation concerns',
        );
        throw new Error('Response was blocked due to recitation concerns');
      }

      const content = candidate.content?.parts?.[0]?.text || '';

      // Google returns token counts in usageMetadata
      const promptTokens = data.usageMetadata?.promptTokenCount || 0;
      const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;
      const totalTokens = data.usageMetadata?.totalTokenCount || promptTokens + completionTokens;

      return {
        content,
        model: data.model || request.model,
        promptTokens,
        completionTokens,
        totalTokens,
        finishReason,
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'Google request failed');
      throw error;
    }
  }
}
