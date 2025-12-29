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
        const errorText = await response.text();
        logger.error(
          { status: response.status, error: errorText, model: request.model },
          'OpenAI API error',
        );
        throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      return {
        content: data.choices[0]?.message?.content || '',
        model: data.model || request.model,
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        finishReason: data.choices[0]?.finish_reason,
        cacheCreationInputTokens: data.usage?.cache_creation_input_tokens,
        cachedInputTokens: data.usage?.cache_read_input_tokens,
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'OpenAI request failed');
      throw error;
    }
  }
}
