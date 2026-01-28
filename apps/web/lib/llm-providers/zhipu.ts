import 'server-only';

import { BaseLLMProvider, LLMProviderRequest, LLMProviderResponse } from './base';
import { logger } from '@/lib/logger';

/**
 * ZhipuAI Provider (智谱AI / BigModel)
 *
 * API Documentation: https://docs.bigmodel.cn/cn/guide/develop/http/introduction
 *
 * Models:
 * - glm-4.7: Latest GLM model, excellent for coding (67% SWE-bench)
 * - glm-4.6v: Vision-capable model
 * - glm-4-plus: Enhanced model
 * - glm-4-flash: Fast, cost-effective model
 *
 * The API is OpenAI-compatible with Bearer token authentication.
 */
export class ZhipuProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    return 'https://open.bigmodel.cn/api/paas/v4';
  }

  async sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.max_tokens !== undefined) body.max_tokens = request.max_tokens;
    if (request.stream !== undefined) body.stream = request.stream;

    // ZhipuAI supports tools/function calling
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
    }
    if (request.tool_choice) {
      body.tool_choice = request.tool_choice;
    }

    // Enable thinking mode if requested (for glm-4.7 deep thinking)
    if (request.thinking_mode) {
      body.thinking = { type: 'enabled' };
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
          'ZhipuAI API error',
        );

        if (response.status === 400) {
          throw new Error('ZhipuAI API invalid request. Please check your request parameters.');
        } else if (response.status === 401) {
          throw new Error('ZhipuAI API authentication failed. Please check your API key.');
        } else if (response.status === 429) {
          throw new Error('ZhipuAI API rate limit exceeded. Please try again later.');
        } else if (response.status >= 500) {
          throw new Error('ZhipuAI API service temporarily unavailable. Please try again later.');
        } else {
          throw new Error(`ZhipuAI API error: ${response.status} ${errorText}`);
        }
      }

      const data = await response.json();

      const message = data.choices?.[0]?.message;
      const usage = data.usage || {};

      return {
        content: message?.content || '',
        model: data.model || request.model,
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
        finishReason: data.choices?.[0]?.finish_reason,
        // ZhipuAI supports prompt caching
        cachedInputTokens: usage.prompt_tokens_details?.cached_tokens,
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'ZhipuAI request failed');
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

    // Enable thinking mode if requested
    if (request.thinking_mode) {
      body.thinking = { type: 'enabled' };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ZhipuAI API error: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming request');
    }

    return response.body;
  }
}
