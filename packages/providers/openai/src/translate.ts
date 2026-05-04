/**
 * Translate `ChatRequest` → OpenAI Chat Completions API params.
 *
 * Notable mapping:
 *   - `system` (string | TextBlock[]) → first message with role "system"
 *     (or "developer" when supportsDeveloperRole is true)
 *   - assistant `tool_use` blocks → `tool_calls` array on assistant message
 *   - `tool_result` blocks → separate messages with role "tool"
 *   - image blocks → `content: [{ type: "image_url", image_url: { url } }]`
 *   - `thinking` blocks → dropped from history (OpenAI handles reasoning server-side)
 *   - `tools` → `[{ type: "function", function: { name, description, parameters, strict? } }]`
 *   - `tool_choice` → vendor shape
 *   - `maxOutputTokens` → `max_completion_tokens` or `max_tokens` per
 *     `OpenAICompletionsCompatDefaults.maxTokensField`
 */

import type {
  ChatRequest,
  ContentBlock,
  ProviderMessage,
  TextBlock,
  ToolDef,
  ToolChoice,
} from '@agiworkforce/types';
import type { OpenAICompletionsCompatDefaults } from '@agiworkforce/llm-normalize';
import { normalizeOpenAIStrictToolParameters } from '@agiworkforce/llm-normalize';

import type {
  OpenAIChatAssistantToolCall,
  OpenAIChatCompletionCreateParams,
  OpenAIChatMessageParam,
  OpenAIChatToolMessageParam,
  OpenAIChatTool,
  OpenAIChatToolChoice,
  OpenAIChatUserMessagePart,
} from './types';

function isTextBlock(b: ContentBlock): b is TextBlock {
  return b.type === 'text';
}

function translateUserContent(blocks: ContentBlock[]): string | OpenAIChatUserMessagePart[] {
  // OpenAI accepts string content if it's text-only; otherwise array.
  const hasNonText = blocks.some((b) => b.type !== 'text');
  if (!hasNonText) {
    return blocks
      .filter(isTextBlock)
      .map((b) => b.text)
      .join('\n\n');
  }
  return blocks.flatMap<OpenAIChatUserMessagePart>((b) => {
    if (b.type === 'text') {
      return [{ type: 'text', text: b.text }];
    }
    if (b.type === 'image') {
      const url =
        b.source.type === 'base64'
          ? `data:${b.source.mediaType};base64,${b.source.data}`
          : b.source.url;
      return [{ type: 'image_url', image_url: { url } }];
    }
    // tool_result / tool_use / thinking are not valid in user content;
    // caller routes those elsewhere.
    return [];
  });
}

function translateAssistantContent(blocks: ContentBlock[]): {
  content: string | null;
  tool_calls: OpenAIChatAssistantToolCall[] | undefined;
} {
  const textParts = blocks.filter(isTextBlock).map((b) => b.text);
  const toolUses = blocks.filter((b) => b.type === 'tool_use') as Array<
    Extract<ContentBlock, { type: 'tool_use' }>
  >;
  const tool_calls = toolUses.length
    ? toolUses.map((tu) => ({
        id: tu.id,
        type: 'function' as const,
        function: {
          name: tu.name,
          arguments: JSON.stringify(tu.input),
        },
      }))
    : undefined;
  const content = textParts.length > 0 ? textParts.join('\n\n') : null;
  return { content, tool_calls };
}

function extractToolResultMessages(blocks: ContentBlock[]): OpenAIChatToolMessageParam[] {
  const out: OpenAIChatToolMessageParam[] = [];
  for (const b of blocks) {
    if (b.type !== 'tool_result') continue;
    const content =
      typeof b.content === 'string' ? b.content : b.content.map((tb) => tb.text).join('\n');
    out.push({
      role: 'tool',
      tool_call_id: b.toolUseId,
      content,
    });
  }
  return out;
}

/**
 * Convert a sequence of ProviderMessages to a flat OpenAI message list. Tool
 * results from assistant turns become standalone "tool" role messages.
 */
function translateMessages(
  msgs: ProviderMessage[],
  systemRole: 'system' | 'developer',
): OpenAIChatMessageParam[] {
  const out: OpenAIChatMessageParam[] = [];
  for (const msg of msgs) {
    if (msg.role === 'system') {
      const text =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content
              .filter(isTextBlock)
              .map((b) => b.text)
              .join('\n\n');
      out.push({ role: systemRole, content: text });
      continue;
    }
    if (msg.role === 'user') {
      // Tool results sometimes come as user messages; split them out.
      const blocks = typeof msg.content === 'string' ? [] : msg.content;
      const toolResultMessages = extractToolResultMessages(blocks);
      out.push(...toolResultMessages);
      const remaining =
        typeof msg.content === 'string'
          ? msg.content
          : translateUserContent(blocks.filter((b) => b.type !== 'tool_result'));
      // Skip emitting an empty user message that consisted only of tool results.
      if (typeof remaining === 'string') {
        if (remaining.length > 0) {
          out.push({ role: 'user', content: remaining });
        }
      } else if (remaining.length > 0) {
        out.push({ role: 'user', content: remaining });
      }
      continue;
    }
    // assistant
    if (typeof msg.content === 'string') {
      out.push({ role: 'assistant', content: msg.content });
      continue;
    }
    const { content, tool_calls } = translateAssistantContent(msg.content);
    out.push({
      role: 'assistant',
      content,
      ...(tool_calls ? { tool_calls } : {}),
    });
  }
  return out;
}

function prependExplicitSystem(
  messages: OpenAIChatMessageParam[],
  system: ChatRequest['system'],
  systemRole: 'system' | 'developer',
): OpenAIChatMessageParam[] {
  if (system === undefined) return messages;
  const text =
    typeof system === 'string' ? system : system.map((b: TextBlock) => b.text).join('\n\n');
  // If first message is already a system message, replace; else prepend.
  if (messages[0]?.role === 'system' || messages[0]?.role === 'developer') {
    return [{ role: systemRole, content: text }, ...messages.slice(1)];
  }
  return [{ role: systemRole, content: text }, ...messages];
}

function translateTool(tool: ToolDef, strict: boolean, provider: string): OpenAIChatTool {
  const parameters = normalizeOpenAIStrictToolParameters(tool.inputSchema, strict);
  void provider;
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: parameters as Record<string, unknown>,
      ...(strict ? { strict: true } : {}),
    },
  };
}

function translateToolChoice(choice: ToolChoice | undefined): OpenAIChatToolChoice | undefined {
  if (choice === undefined) return undefined;
  if (choice === 'auto') return 'auto';
  if (choice === 'none') return 'none';
  if (choice === 'required') return 'required';
  return { type: 'function', function: { name: choice.name } };
}

export interface TranslateOptions {
  /** Result of `detectOpenAICompletionsCompat()` — drives field shape. */
  compat: OpenAICompletionsCompatDefaults;
  /** Provider id (for tool-schema cleaning). */
  provider: string;
}

export function translateChatRequest(
  req: ChatRequest,
  options: TranslateOptions,
): OpenAIChatCompletionCreateParams {
  const { compat, provider } = options;
  const systemRole = compat.supportsDeveloperRole ? 'developer' : 'system';

  const baseMessages = translateMessages(req.messages, systemRole);
  const messages = prependExplicitSystem(baseMessages, req.system, systemRole);

  const strict = compat.supportsStrictMode && (req.tools?.some((t) => t.strict) ?? false);
  const tools = req.tools?.map((t) => translateTool(t, strict, provider));
  const toolChoice = translateToolChoice(req.toolChoice);

  const params: OpenAIChatCompletionCreateParams = {
    model: req.model,
    messages,
    stream: true,
    stream_options: { include_usage: compat.supportsUsageInStreaming },
    ...(tools && tools.length > 0 ? { tools } : {}),
    ...(toolChoice !== undefined ? { tool_choice: toolChoice } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.topP !== undefined ? { top_p: req.topP } : {}),
    ...(req.stopSequences ? { stop: req.stopSequences } : {}),
    ...(req.metadata ? { metadata: req.metadata as Record<string, string> } : {}),
  };

  // max_tokens vs max_completion_tokens per compat
  if (req.maxOutputTokens !== undefined) {
    if (compat.maxTokensField === 'max_completion_tokens') {
      params.max_completion_tokens = req.maxOutputTokens;
    } else {
      params.max_tokens = req.maxOutputTokens;
    }
  }

  // Reasoning effort (mapped through compat thinking format)
  if (req.thinking?.type === 'enabled' && compat.supportsReasoningEffort) {
    // Map thinking budget to reasoning effort heuristically.
    const budget = req.thinking.budgetTokens ?? 8000;
    params.reasoning_effort = budget >= 16000 ? 'high' : budget >= 4000 ? 'medium' : 'low';
  }

  return params;
}
