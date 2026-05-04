import 'server-only';

import {
  BaseLLMProvider,
  LLMProviderRequest,
  LLMProviderResponse,
  RETRYABLE_HTTP_STATUS_CODES,
} from './base';
import { logger } from '@/lib/logger';

/**
 * Transform tools from OpenAI format to Anthropic format.
 * Handles four cases:
 *   1. Anthropic server-managed tools (web_search, code_execution) - pass through as-is
 *   2. Already-Anthropic custom tools (has input_schema) - pass through as-is
 *   3. OpenAI function format (type: 'function', function: {...}) - transform
 *   4. Bare format - transform with fallback input_schema
 */

/** Anthropic server-managed tool type prefixes (e.g. web_search_20260209, code_execution_20260120) */
const ANTHROPIC_SERVER_TOOL_PREFIXES = ['web_search_', 'code_execution_'];

interface OpenAITool {
  type?: string;
  function?: { name?: string; description?: string; parameters?: unknown };
  name?: string;
  description?: string;
  parameters?: unknown;
  input_schema?: unknown;
  // Server-managed tool fields (Anthropic-specific)
  [key: string]: unknown;
}

interface AnthropicTool {
  name?: string;
  type?: string;
  description?: string;
  input_schema?: unknown;
  [key: string]: unknown;
}

function transformTools(tools: OpenAITool[]): AnthropicTool[] {
  return tools.map((tool) => {
    // 1. Anthropic server-managed tools: type starts with a known server-tool prefix.
    //    These must be passed through exactly as-is - they have no input_schema.
    //    Examples: { type: 'web_search_20260209', name: 'web_search' }
    //             { type: 'code_execution_20260120', name: 'code_execution' }
    if (
      tool.type &&
      ANTHROPIC_SERVER_TOOL_PREFIXES.some((prefix) => (tool.type as string).startsWith(prefix))
    ) {
      return tool as unknown as AnthropicTool;
    }

    // 2. If tool is already in Anthropic custom tool format (has input_schema), use as-is
    if (tool.input_schema) {
      return tool as unknown as AnthropicTool;
    }
    // 3. Transform from OpenAI format (type: 'function', function: {...}) to Anthropic format
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
    // 4. Fallback: assume it's missing input_schema, use parameters if available
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

/**
 * Handle Anthropic HTTP error responses by throwing a descriptive error.
 * Status-specific messages use keywords that route.ts error matching expects.
 * @param retryAfter Optional value of the 'retry-after' response header for 429 responses.
 */
function handleAnthropicHttpError(
  status: number,
  errorText: string,
  retryAfter?: string | null,
): never {
  if (status === 401) {
    throw new Error('Anthropic authentication error (401): Please check your API key.');
  } else if (status === 402) {
    throw new Error('Anthropic insufficient credits (402): Please upgrade your plan.');
  } else if (status === 403) {
    throw new Error(
      'Anthropic API permission denied (403): Your API key may not have access to this resource.',
    );
  } else if (status === 404) {
    throw new Error(`Anthropic not found (404): ${errorText}`);
  } else if (status === 413) {
    throw new Error('Anthropic API request too large (413): Maximum request size is 32 MB.');
  } else if (status === 429) {
    throw new Error(
      `Anthropic rate limit exceeded (429). ${retryAfter ? `Retry after ${retryAfter} seconds.` : 'Please try again later.'}`,
    );
  } else if (RETRYABLE_HTTP_STATUS_CODES.has(status)) {
    throw new Error(`Anthropic API service error (${status}): Please try again later.`);
  } else if (status === 529) {
    throw new Error('Anthropic API overloaded (529): Please try again later.');
  } else {
    throw new Error(`Anthropic API error: ${status} ${errorText}`);
  }
}

export class AnthropicProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    return 'https://api.anthropic.com/v1';
  }

  protected override getHeaders(): Record<string, string> {
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
    const anthropicTools = request.tools
      ? transformTools(request.tools as OpenAITool[])
      : undefined;

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
      body['system'] = systemContent;
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

        handleAnthropicHttpError(response.status, errorText, response.headers.get('retry-after'));
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
      // Concatenate ALL text blocks (web search responses may have multiple text blocks)
      const textBlocks = (data.content || []).filter(
        (block: { type: string }) => block.type === 'text',
      );
      const textContent = textBlocks.map((block: { text: string }) => block.text || '').join('');

      // Extract citations from text blocks (Anthropic web_search returns citations in text blocks)
      const citations: Array<{
        type: string;
        cited_text: string;
        title?: string;
        url?: string;
      }> = [];
      for (const block of textBlocks) {
        const typedBlock = block as {
          citations?: Array<{ type: string; cited_text: string; title?: string; url?: string }>;
        };
        if (typedBlock.citations && Array.isArray(typedBlock.citations)) {
          citations.push(...typedBlock.citations);
        }
      }

      // Extract web_search_tool_result blocks for passing search results to the client
      const searchResultBlocks = (data.content || []).filter(
        (block: { type: string }) => block.type === 'web_search_tool_result',
      );

      // Extract tool_use blocks (client-executed tools) and map to OpenAI-format tool_calls
      // Note: server_tool_use blocks (like web_search) are server-executed and do NOT
      // need client-side execution - Anthropic handles them internally
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
      // server_tool_use stop_reason means Anthropic executed tools server-side and
      // returned results in the same response - this is a completed turn, map to 'stop'
      const finishReason =
        stopReason === 'tool_use' ? 'tool_calls' : stopReason === 'end_turn' ? 'stop' : stopReason;

      // Build response with optional web search metadata
      const result: LLMProviderResponse = {
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

      // Attach web search citations and search results as extended metadata
      if (citations.length > 0) {
        result.citations = citations;
      }
      if (searchResultBlocks.length > 0) {
        result.search_results = searchResultBlocks;
      }

      return result;
    } catch (error) {
      logger.error({ error, model: request.model }, 'Anthropic request failed');
      throw error;
    }
  }
  async streamRequest(request: LLMProviderRequest): Promise<ReadableStream> {
    const url = `${this.baseUrl}/messages`;

    // Convert messages to Anthropic format, preserving tool_use/tool_result blocks
    // Pass usePromptCache so message-body cache_control is applied (matching sendRequest)
    const messages = mapMessagesToAnthropic(
      request.messages.filter((msg) => msg.role !== 'system'),
      request.usePromptCache,
    );

    const systemMessage = request.messages.find((msg) => msg.role === 'system');

    // Transform tools from OpenAI format to Anthropic format if needed
    const anthropicTools = request.tools
      ? transformTools(request.tools as OpenAITool[])
      : undefined;

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
        body['system'] = [
          {
            type: 'text',
            text: systemMessage.content,
            cache_control: { type: 'ephemeral' },
          },
        ];
      } else {
        body['system'] = systemMessage.content;
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

      handleAnthropicHttpError(response.status, errorText, response.headers.get('retry-after'));
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
type ContentPart = { type: string; text?: string; image_url?: { url: string; detail?: string } };

function buildAnthropicContentBlocks(
  text: string,
  multimodalContent?: ContentPart[],
): Array<Record<string, unknown>> {
  if (!multimodalContent || multimodalContent.length === 0) {
    return [{ type: 'text', text }];
  }

  return multimodalContent.map((part) => {
    if (part.type === 'image_url' && part.image_url?.url) {
      const url = part.image_url.url;
      // Parse data URLs: data:<mediaType>;base64,<data>
      const dataUrlMatch = url.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUrlMatch) {
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: dataUrlMatch[1] as string,
            data: dataUrlMatch[2] as string,
          },
        };
      }
      // Fall back to URL type for remote images
      return { type: 'image', source: { type: 'url', url } };
    }
    return { type: 'text', text: part.text ?? '' };
  });
}

function mapMessagesToAnthropic(
  messages: Array<{
    role: string;
    content: string;
    multimodal_content?: unknown[];
    tool_calls?: unknown[];
    tool_call_id?: string;
  }>,
  usePromptCache?: boolean,
): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;
    const isLast = i === messages.length - 1;

    // Tool role messages → Anthropic tool_result inside a user message
    if (msg.role === 'tool' && msg.tool_call_id) {
      // Anthropic requires tool_result blocks inside a role:"user" message.
      // Collect consecutive tool messages into a single user message.
      const toolResults: Array<Record<string, unknown>> = [];
      let j = i;
      while (j < messages.length) {
        const jMsg = messages[j];
        if (!jMsg || jMsg.role !== 'tool' || !jMsg.tool_call_id) break;
        toolResults.push({
          type: 'tool_result',
          tool_use_id: jMsg.tool_call_id,
          content: jMsg.content || '',
        });
        j++;
      }
      if (toolResults.length > 0) {
        // Re-evaluate whether this batch is the last in the conversation.
        // isLast was computed before the inner while-loop, so it can be wrong
        // when a conversation ends with tool-result messages.
        const batchIsLast = j === messages.length;
        if (batchIsLast && usePromptCache && toolResults.length > 0) {
          // Apply cache_control to the last tool_result block in the batch
          const lastResult = toolResults[toolResults.length - 1]!;
          (lastResult as Record<string, unknown>)['cache_control'] = { type: 'ephemeral' };
        }
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
                  return JSON.parse(tc.function!.arguments as string);
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

    // Skip empty content messages (unless there are image attachments)
    const multimodalParts = msg.multimodal_content as ContentPart[] | undefined;
    const hasImages = multimodalParts?.some((p) => p.type === 'image_url');
    if (!hasImages && (!msg.content || msg.content.trim().length === 0)) {
      continue;
    }

    // Normal messages (possibly multimodal)
    let contentValue: unknown;
    if (hasImages) {
      // Build Anthropic content blocks from multimodal parts
      const blocks = buildAnthropicContentBlocks(msg.content, multimodalParts);
      contentValue =
        usePromptCache && isLast
          ? blocks.map((b, idx) =>
              idx === blocks.length - 1 ? { ...b, cache_control: { type: 'ephemeral' } } : b,
            )
          : blocks;
    } else if (usePromptCache && isLast) {
      contentValue = [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }];
    } else {
      contentValue = msg.content;
    }

    result.push({
      role: msg.role === 'tool' ? 'user' : msg.role,
      content: contentValue,
    });
  }

  return result;
}
