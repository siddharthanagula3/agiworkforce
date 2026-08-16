
import type {
  ChatRequest,
  ContentBlock,
  ProviderMessage,
  TextBlock,
  ToolDef,
  ToolChoice,
} from '@agiworkforce/types';
import type { OpenAICompletionsCompatDefaults } from '@agiworkforce/provider-protocol';
import {
  normalizeOpenAIStrictToolParameters,
  resolveOpenAIReasoningEffortForModel,
} from '@agiworkforce/provider-protocol';

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
    if (b.type === 'file') {
      throw new TypeError('File inputs require an OpenAI Responses-capable model');
    }
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
      const blocks = typeof msg.content === 'string' ? [] : msg.content;
      const toolResultMessages = extractToolResultMessages(blocks);
      out.push(...toolResultMessages);
      const remaining =
        typeof msg.content === 'string'
          ? msg.content
          : translateUserContent(blocks.filter((b) => b.type !== 'tool_result'));
      if (typeof remaining === 'string') {
        if (remaining.length > 0) {
          out.push({ role: 'user', content: remaining });
        }
      } else if (remaining.length > 0) {
        out.push({ role: 'user', content: remaining });
      }
      continue;
    }
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

function thinkingBudgetToRequestedEffort(
  budgetTokens: number | undefined,
): 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' {
  if (budgetTokens === undefined) return 'medium';
  if (budgetTokens >= 30000) return 'xhigh';
  if (budgetTokens >= 16000) return 'high';
  if (budgetTokens >= 4000) return 'medium';
  if (budgetTokens >= 1000) return 'low';
  return 'minimal';
}

const OPENAI_RESPONSES_ONLY_TOOL_TYPES = new Set(['web_search_preview', 'code_interpreter']);

export interface TranslateOptions {
  compat: OpenAICompletionsCompatDefaults;
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
  const translatedTools = req.tools?.map((t) => translateTool(t, strict, provider)) ?? [];
  const rawVendorTools = req.rawVendorTools ?? [];
  const hasTools = translatedTools.length + rawVendorTools.length > 0;
  const vendorTools =
    provider === 'openai'
      ? rawVendorTools.filter((t) => {
          const type = (t as { type?: unknown })?.type;
          return !(typeof type === 'string' && OPENAI_RESPONSES_ONLY_TOOL_TYPES.has(type));
        })
      : rawVendorTools;
  const tools = [
    ...translatedTools,
    ...(vendorTools as OpenAIChatCompletionCreateParams['tools'] & unknown[]),
  ];
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

  if (req.maxOutputTokens !== undefined) {
    if (compat.maxTokensField === 'max_completion_tokens') {
      params.max_completion_tokens = req.maxOutputTokens;
    } else {
      params.max_tokens = req.maxOutputTokens;
    }
  }

  if (
    compat.supportsReasoningEffort &&
    (req.effort !== undefined || req.thinking?.type === 'enabled')
  ) {
    const requested =
      req.effort ??
      thinkingBudgetToRequestedEffort(
        req.thinking?.type === 'enabled' ? req.thinking.budgetTokens : undefined,
      );
    const resolved = resolveOpenAIReasoningEffortForModel({
      model: { provider: 'openai', id: req.model },
      effort: requested,
    });
    const omitForTools = provider === 'openai' && hasTools;
    if (resolved && !omitForTools) {
      params.reasoning_effort = resolved as NonNullable<
        OpenAIChatCompletionCreateParams['reasoning_effort']
      >;
    }
  }

  return params;
}
