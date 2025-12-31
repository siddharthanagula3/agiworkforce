import 'server-only';

import { BaseLLMProvider, LLMProviderRequest, LLMProviderResponse } from './base';
import { logger } from '@/lib/logger';

export class QwenProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    // Default to Alibaba DashScope, but can be overridden via QWEN_BASE_URL
    // for MuleRouter (https://api.mulerouter.ai) or other proxy services
    return 'https://dashscope.aliyuncs.com/api/v1';
  }

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    // Check if using custom base URL (e.g., MuleRouter) - use OpenAI-compatible format
    const isCustomBaseUrl = this.baseUrl !== this.getDefaultBaseUrl();

    if (isCustomBaseUrl) {
      // MuleRouter/OpenAI-compatible format
      return this.sendOpenAICompatibleRequest(request);
    } else {
      // DashScope format
      return this.sendDashScopeRequest(request);
    }
  }

  private async sendOpenAICompatibleRequest(
    request: LLMProviderRequest,
  ): Promise<LLMProviderResponse> {
    // MuleRouter and other OpenAI-compatible proxies use /chat/completions
    // See: https://www.mulerouter.ai/docs/api-reference/quickstart
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
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
          'Qwen API error (MuleRouter)',
        );

        // Handle specific error types
        if (response.status === 401) {
          throw new Error('Qwen API authentication failed. Please check your API key.');
        } else if (response.status === 429) {
          throw new Error('Qwen API rate limit exceeded. Please try again later.');
        } else if (response.status >= 500) {
          throw new Error('Qwen API service temporarily unavailable. Please try again later.');
        } else {
          throw new Error(`Qwen API error: ${response.status} ${errorText}`);
        }
      }

      const data = await response.json();

      return {
        content: data.choices?.[0]?.message?.content || '',
        model: data.model || request.model,
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        finishReason: data.choices?.[0]?.finish_reason,
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'Qwen request failed (MuleRouter)');
      throw error;
    }
  }

  private async sendDashScopeRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
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
          'Qwen API error (DashScope)',
        );

        // Handle specific error types
        if (response.status === 401) {
          throw new Error('Qwen API authentication failed. Please check your API key.');
        } else if (response.status === 429) {
          throw new Error('Qwen API rate limit exceeded. Please try again later.');
        } else if (response.status >= 500) {
          throw new Error('Qwen API service temporarily unavailable. Please try again later.');
        } else {
          throw new Error(`Qwen API error: ${response.status} ${errorText}`);
        }
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
      logger.error({ error, model: request.model }, 'Qwen request failed (DashScope)');
      throw error;
    }
  }
}
