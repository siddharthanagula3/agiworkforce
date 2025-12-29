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
      'anthropic-version': '2025-12-01',
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
      max_tokens: request.max_tokens || 4096,
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
        cacheCreationInputTokens: data.usage?.cache_creation_input_tokens,
        cachedInputTokens: data.usage?.cache_read_input_tokens,
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'Anthropic request failed');
      throw error;
    }
  }
}
