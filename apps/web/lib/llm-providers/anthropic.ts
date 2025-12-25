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
      'anthropic-version': '2024-11-01',
    };
  }

  async sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    const url = `${this.baseUrl}/messages`;

    // Convert messages format for Anthropic
    const messages = request.messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'tool' ? 'user' : msg.role,
        content: msg.content,
      }));

    const systemMessage = request.messages.find((msg) => msg.role === 'system');

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.max_tokens || 4096,
      messages,
      ...(systemMessage && { system: systemMessage.content }),
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(request.tools && { tools: request.tools }),
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
          'Anthropic API error',
        );
        throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      return {
        content: data.content[0]?.text || '',
        model: data.model || request.model,
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        finishReason: data.stop_reason,
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'Anthropic request failed');
      throw error;
    }
  }
}
