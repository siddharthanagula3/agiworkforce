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
      'anthropic-version': '2023-06-01', // Required API version (supports all Claude models)
      // Enable Claude 4.5/4.6 advanced features:
      // - output-128k-2025-02-19: Extended output limits for deep thinking
      // - context-1m-2025-08-07: 1M token context window
      // - interleaved-thinking-2025-05-14: Chain of thought with tool use
      'anthropic-beta':
        'output-128k-2025-02-19,context-1m-2025-08-07,interleaved-thinking-2025-05-14',
    };
  }

  async sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    const url = `${this.baseUrl}/messages`;

    // Convert messages format for Anthropic, preserving tool_use/tool_result blocks
    const messages = mapMessagesToAnthropic(
      request.messages.filter((msg) => msg.role !== 'system'),
      request.usePromptCache,
    );

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

    // Transform tools from OpenAI format to Anthropic format if needed
    let anthropicTools;
    if (request.tools) {
      anthropicTools = request.tools.map((tool: any) => {
        // If tool is already in Anthropic format (has input_schema), use as-is
        if (tool.input_schema) {
          return tool;
        }
        // Transform from OpenAI format (type: 'function', function: {...}) to Anthropic format
        if (tool.type === 'function' && tool.function) {
          return {
            name: tool.function.name,
            description: tool.function.description,
            input_schema: tool.function.parameters || {
              type: 'object',
              properties: {},
              required: [],
            },
          };
        }
        // Fallback: assume it's missing input_schema, use parameters if available
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters ||
            tool.input_schema || {
              type: 'object',
              properties: {},
              required: [],
            },
        };
      });
    }

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.max_tokens || 16384, // Increased for Claude 4.5 quality outputs
      messages,
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(anthropicTools && { tools: anthropicTools }),
      ...(request.thinking && { thinking: request.thinking }),
      ...(request.effort && { effort: request.effort }),
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
          'Anthropic API error',
        );

        // Handle specific error types based on status code
        // Use keywords that route.ts error matching expects
        if (response.status === 401) {
          throw new Error('Anthropic authentication error (401): Please check your API key.');
        } else if (response.status === 402) {
          throw new Error('Anthropic insufficient credits (402): Please upgrade your plan.');
        } else if (response.status === 403) {
          throw new Error(
            'Anthropic API permission denied (403): Your API key may not have access to this resource.',
          );
        } else if (response.status === 404) {
          throw new Error(`Anthropic not found (404): ${errorText}`);
        } else if (response.status === 413) {
          throw new Error('Anthropic API request too large (413): Maximum request size is 32 MB.');
        } else if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          throw new Error(
            `Anthropic rate limit exceeded (429). ${retryAfter ? `Retry after ${retryAfter} seconds.` : 'Please try again later.'}`,
          );
        } else if (response.status === 500 || response.status === 502 || response.status === 503) {
          throw new Error(
            `Anthropic API service error (${response.status}): Please try again later.`,
          );
        } else if (response.status === 529) {
          throw new Error('Anthropic API overloaded (529): Please try again later.');
        } else {
          throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
        }
      }

      const data = await response.json();

      // Check stop_reason for error cases
      const stopReason = data.stop_reason;
      if (stopReason === 'max_tokens') {
        logger.warn(
          { model: request.model, stopReason },
          'Anthropic response was truncated due to max_tokens limit',
        );
      } else if (stopReason === 'refusal') {
        logger.warn({ model: request.model, stopReason }, 'Anthropic request was refused');
      }

      // Extract text content from content array
      const textContent =
        data.content?.find((block: { type: string }) => block.type === 'text')?.text || '';

      // Extract tool_use blocks and map to OpenAI-format tool_calls
      const toolUseBlocks = (data.content || []).filter(
        (block: { type: string }) => block.type === 'tool_use',
      );
      const toolCalls =
        toolUseBlocks.length > 0
          ? toolUseBlocks.map(
              (block: { id: string; name: string; input: unknown }, index: number) => ({
                id: block.id,
                type: 'function' as const,
                index,
                function: {
                  name: block.name,
                  arguments: JSON.stringify(block.input || {}),
                },
              }),
            )
          : undefined;

      // Map Anthropic stop_reason to OpenAI finish_reason
      const finishReason = stopReason === 'tool_use' ? 'tool_calls' : stopReason;

      return {
        content: textContent,
        model: data.model || request.model,
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        finishReason,
        cacheCreationInputTokens: data.usage?.cache_creation_input_tokens,
        cachedInputTokens: data.usage?.cache_read_input_tokens,
        tool_calls: toolCalls,
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'Anthropic request failed');
      throw error;
    }
  }
  async streamRequest(request: LLMProviderRequest): Promise<ReadableStream> {
    const url = `${this.baseUrl}/messages`;

    // Convert messages to Anthropic format, preserving tool_use/tool_result blocks
    const messages = mapMessagesToAnthropic(
      request.messages.filter((msg) => msg.role !== 'system'),
    );

    const systemMessage = request.messages.find((msg) => msg.role === 'system');

    // Transform tools from OpenAI format to Anthropic format if needed
    let anthropicTools;
    if (request.tools) {
      anthropicTools = request.tools.map((tool: any) => {
        // If tool is already in Anthropic format (has input_schema), use as-is
        if (tool.input_schema) {
          return tool;
        }
        // Transform from OpenAI format (type: 'function', function: {...}) to Anthropic format
        if (tool.type === 'function' && tool.function) {
          return {
            name: tool.function.name,
            description: tool.function.description,
            input_schema: tool.function.parameters || {
              type: 'object',
              properties: {},
              required: [],
            },
          };
        }
        // Fallback: assume it's missing input_schema, use parameters if available
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters ||
            tool.input_schema || {
              type: 'object',
              properties: {},
              required: [],
            },
        };
      });
    }

    const body: Record<string, unknown> = {
      model: request.model,
      max_tokens: request.max_tokens || 16384, // Increased for Claude 4.5 quality outputs
      messages,
      stream: true,
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      ...(anthropicTools && { tools: anthropicTools }),
      ...(request.thinking && { thinking: request.thinking }),
      ...(request.effort && { effort: request.effort }),
    };

    // Apply prompt cache on system message (matching sendRequest behavior)
    if (systemMessage) {
      if (request.usePromptCache) {
        body.system = [
          {
            type: 'text',
            text: systemMessage.content,
            cache_control: { type: 'ephemeral' },
          },
        ];
      } else {
        body.system = systemMessage.content;
      }
    }

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
        'Anthropic streaming API error',
      );

      // Handle specific error types based on status code
      // Use keywords that route.ts error matching expects
      if (response.status === 401) {
        throw new Error('Anthropic authentication error (401): Please check your API key.');
      } else if (response.status === 402) {
        throw new Error('Anthropic insufficient credits (402): Please upgrade your plan.');
      } else if (response.status === 403) {
        throw new Error(
          'Anthropic API permission denied (403): Your API key may not have access to this model.',
        );
      } else if (response.status === 404) {
        throw new Error(`Anthropic not found (404): Model "${request.model}" not available.`);
      } else if (response.status === 413) {
        throw new Error('Anthropic API request too large (413): Maximum request size is 32 MB.');
      } else if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        throw new Error(
          `Anthropic rate limit exceeded (429). ${retryAfter ? `Retry after ${retryAfter} seconds.` : 'Please try again later.'}`,
        );
      } else if (response.status === 500 || response.status === 502 || response.status === 503) {
        throw new Error(
          `Anthropic API service error (${response.status}): Please try again later.`,
        );
      } else if (response.status === 529) {
        throw new Error('Anthropic API overloaded (529): Please try again later.');
      } else {
        throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
      }
    }

    if (!response.body) {
      throw new Error('No response body for streaming request');
    }

    return response.body;
  }
}

/**
 * Map messages to Anthropic format, converting tool_calls/tool_call_id
 * to Anthropic's tool_use/tool_result content blocks.
 */
function mapMessagesToAnthropic(
  messages: Array<{
    role: string;
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
  }>,
  usePromptCache?: boolean,
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isLast = i === messages.length - 1;

    // Tool role messages → Anthropic tool_result inside a user message
    if (msg.role === 'tool' && msg.tool_call_id) {
      // Anthropic requires tool_result blocks inside a role:"user" message.
      // Collect consecutive tool messages into a single user message.
      const toolResults: Array<Record<string, unknown>> = [];
      let j = i;
      while (j < messages.length && messages[j].role === 'tool' && messages[j].tool_call_id) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: messages[j].tool_call_id,
          content: messages[j].content || '',
        });
        j++;
      }
      if (toolResults.length > 0) {
        result.push({
          role: 'user',
          content: toolResults,
        });
      }
      // Skip the messages we just consumed (loop will increment i)
      i = j - 1;
      continue;
    }

    // Assistant messages with tool_calls → Anthropic tool_use content blocks
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const contentBlocks: Array<Record<string, unknown>> = [];
      // Add text content if present
      if (msg.content && msg.content.trim().length > 0) {
        contentBlocks.push({ type: 'text', text: msg.content });
      }
      // Convert each tool_call to a tool_use block
      for (const tc of msg.tool_calls as Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>) {
        contentBlocks.push({
          type: 'tool_use',
          id: tc.id || `call_${Date.now()}`,
          name: tc.function?.name || 'unknown',
          input: tc.function?.arguments
            ? (() => {
                try {
                  return JSON.parse(tc.function!.arguments!);
                } catch {
                  return {};
                }
              })()
            : {},
        });
      }
      result.push({ role: 'assistant', content: contentBlocks });
      continue;
    }

    // Skip empty content messages
    if (!msg.content || msg.content.trim().length === 0) {
      continue;
    }

    // Normal messages
    const contentObj: Record<string, unknown> = {
      role: msg.role === 'tool' ? 'user' : msg.role,
      content: msg.content,
    };

    // Add cache_control to last message if prompt caching is enabled
    if (usePromptCache && isLast) {
      contentObj.cache_control = { type: 'ephemeral' };
    }

    result.push(contentObj);
  }

  return result;
}
