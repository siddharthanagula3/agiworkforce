import 'server-only';

import { BaseLLMProvider, LLMProviderRequest, LLMProviderResponse } from './base';
import { logger } from '@/lib/logger';

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function mapOpenAICompatibleMessages(messages: LLMProviderRequest['messages']) {
  return messages.map((msg) => {
    const mapped: Record<string, unknown> = {
      role: msg.role,
      content: msg.content,
    };
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      mapped['tool_calls'] = msg.tool_calls;
    }
    if (msg.tool_call_id) {
      mapped['tool_call_id'] = msg.tool_call_id;
    }
    return mapped;
  });
}

function requestIncludesToolState(request: LLMProviderRequest): boolean {
  return (
    Boolean(request.tools?.length) ||
    request.tool_choice !== undefined ||
    request.messages.some(
      (message) =>
        message.role === 'tool' ||
        Boolean(message.tool_calls?.length) ||
        message.tool_call_id !== undefined,
    )
  );
}

export class QwenProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    // Default to Alibaba DashScope, but can be overridden via QWEN_BASE_URL
    // for MuleRouter (https://api.mulerouter.ai) or other proxy services
    return 'https://dashscope.aliyuncs.com/api/v1';
  }

  protected override getHeaders(): Record<string, string> {
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
    const url = this.getOpenAICompatibleChatCompletionsUrl();

    const body: Record<string, unknown> = {
      model: request.model,
      messages: mapOpenAICompatibleMessages(request.messages),
    };

    if (request.temperature !== undefined) {
      body['temperature'] = request.temperature;
    }
    if (request.max_tokens !== undefined) {
      body['max_tokens'] = request.max_tokens;
    }
    if (request.stream !== undefined) {
      body['stream'] = request.stream;
    }
    if (request.tools) {
      body['tools'] = request.tools;
    }
    if (request.tool_choice) {
      body['tool_choice'] = request.tool_choice;
    }

    try {
      const response = await this.fetchWithRetry(url, {
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
      const message = data.choices?.[0]?.message;

      return {
        content: message?.content || '',
        model: data.model || request.model,
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
        finishReason: data.choices?.[0]?.finish_reason,
        ...(message?.tool_calls &&
          message.tool_calls.length > 0 && { tool_calls: message.tool_calls }),
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'Qwen request failed (MuleRouter)');
      throw error;
    }
  }

  private async sendDashScopeRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    if (requestIncludesToolState(request)) {
      throw new Error(
        'Qwen DashScope native adapter does not support tool calling. Configure QWEN_BASE_URL with an OpenAI-compatible Qwen base URL.',
      );
    }

    const url = `${this.baseUrl}/services/aigc/text-generation/generation`;

    const messages = request.messages.map((msg) => ({
      role: msg.role,
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
      const response = await this.fetchWithRetry(url, {
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

  async streamRequest(request: LLMProviderRequest): Promise<ReadableStream> {
    const url = this.getOpenAICompatibleChatCompletionsUrl();

    const body: Record<string, unknown> = {
      model: request.model,
      messages: mapOpenAICompatibleMessages(request.messages),
      stream: true,
    };

    if (request.temperature !== undefined) body['temperature'] = request.temperature;
    if (request.max_tokens !== undefined) body['max_tokens'] = request.max_tokens;
    if (request.tools && request.tools.length > 0) {
      body['tools'] = request.tools;
      if (request.tool_choice !== undefined) {
        body['tool_choice'] = request.tool_choice;
      }
    }
    body['stream_options'] = { include_usage: true };

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qwen API error: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming request');
    }

    return response.body;
  }

  private getOpenAICompatibleChatCompletionsUrl(): string {
    const baseUrl = trimTrailingSlash(this.baseUrl);

    if (baseUrl === trimTrailingSlash(this.getDefaultBaseUrl())) {
      throw new Error(
        'Qwen streaming requires an OpenAI-compatible Qwen base URL. Configure QWEN_BASE_URL for MuleRouter or DashScope compatible mode.',
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error('Qwen base URL is invalid.');
    }

    if (parsed.hostname === 'api.mulerouter.ai') {
      return `${baseUrl}/vendors/openai/v1/chat/completions`;
    }

    if (parsed.pathname.endsWith('/compatible-mode/v1')) {
      return `${baseUrl}/chat/completions`;
    }

    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return `${baseUrl}/chat/completions`;
    }

    throw new Error(
      'Qwen requests require an OpenAI-compatible Qwen base URL. Use MuleRouter or DashScope compatible mode.',
    );
  }
}
