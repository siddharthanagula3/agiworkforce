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
        const errorText = await response.text();
        logger.error(
          { status: response.status, error: errorText, model: request.model },
          'Google API error',
        );
        throw new Error(`Google API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

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
        finishReason: data.candidates?.[0]?.finishReason,
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'Google request failed');
      throw error;
    }
  }
}
