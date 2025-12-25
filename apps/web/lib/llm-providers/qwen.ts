import 'server-only';

import { BaseLLMProvider, LLMProviderRequest, LLMProviderResponse } from './base';
import { logger } from '@/lib/logger';

export class QwenProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    return 'https://dashscope.aliyuncs.com/api/v1';
  }

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    const url = `${this.baseUrl}/services/aigc/text-generation/generation`;

    const messages = request.messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    }));

    const body = {
      model: request.model,
      input: {
        messages,
      },
      parameters: {
        ...(request.temperature !== undefined && { temperature: request.temperature }),
        ...(request.max_tokens !== undefined && { max_tokens: request.max_tokens }),
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
          'Qwen API error',
        );
        throw new Error(`Qwen API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      return {
        content: data.output?.choices?.[0]?.message?.content || '',
        model: data.model || request.model,
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        finishReason: data.output?.choices?.[0]?.finish_reason,
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'Qwen request failed');
      throw error;
    }
  }
}
