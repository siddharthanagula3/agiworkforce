
import type {
  ChatRequest,
  ContentBlock,
  FileBlock,
  ImageBlock,
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
  ResponsesCreateParams,
  ResponsesFunctionTool,
  ResponsesInputContent,
  ResponsesInputItem,
  ResponsesInputMessage,
  ResponsesReasoningConfig,
  ResponsesNativeTool,
  ResponsesTool,
  ResponsesToolChoice,
} from './responses-types';

function isTextBlock(b: ContentBlock): b is TextBlock {
  return b.type === 'text';
}
function isImageBlock(b: ContentBlock): b is ImageBlock {
  return b.type === 'image';
}
function isFileBlock(b: ContentBlock): b is FileBlock {
  return b.type === 'file';
}

function blocksToInputContent(blocks: ContentBlock[]): ResponsesInputContent[] {
  const out: ResponsesInputContent[] = [];
  for (const b of blocks) {
    if (isTextBlock(b)) {
      out.push({ type: 'input_text', text: b.text });
    } else if (isImageBlock(b)) {
      const image_url =
        b.source.type === 'base64'
          ? `data:${b.source.mediaType};base64,${b.source.data}`
          : b.source.url;
      out.push({ type: 'input_image', image_url });
    } else if (isFileBlock(b)) {
      out.push({
        type: 'input_file',
        filename: b.filename,
        file_data: `data:${b.source.mediaType};base64,${b.source.data}`,
      });
    }
    // tool_use / tool_result / thinking are NOT valid inside an input
    // message's content — caller routes them as their own input items
    // (function_call / function_call_output) below.
  }
  return out;
}

function collapseTextOnly(blocks: ContentBlock[]): string | undefined {
  const texts = blocks.filter(isTextBlock).map((b) => b.text);
  const hasNonText = blocks.some((b) => !isTextBlock(b));
  if (texts.length === 0) return undefined;
  return hasNonText ? undefined : texts.join('\n\n');
}

function translateMessage(msg: ProviderMessage): ResponsesInputItem[] {
  if (msg.role === 'system') return [];

  const items: ResponsesInputItem[] = [];

  if (typeof msg.content === 'string') {
    const message: ResponsesInputMessage = {
      type: 'message',
      role: msg.role,
      content: msg.content,
    };
    items.push(message);
    return items;
  }

  const messageContent: ContentBlock[] = [];
  for (const b of msg.content) {
    if (b.type === 'tool_use') {
      items.push({
        type: 'function_call',
        call_id: b.id,
        name: b.name,
        arguments: JSON.stringify(b.input),
      });
    } else if (b.type === 'tool_result') {
      const output =
        typeof b.content === 'string' ? b.content : b.content.map((c) => c.text).join('\n');
      items.push({
        type: 'function_call_output',
        call_id: b.toolUseId,
        output,
      });
    } else if (b.type === 'text' || b.type === 'image' || b.type === 'file') {
      messageContent.push(b);
    }
    // thinking blocks: drop from history (reasoning is server-side per
    // previous_response_id; replaying it confuses the model).
  }

  if (messageContent.length > 0) {
    const collapsed = collapseTextOnly(messageContent);
    const content = collapsed ?? blocksToInputContent(messageContent);
    if (typeof content === 'string' ? content.length > 0 : content.length > 0) {
      items.push({ type: 'message', role: msg.role, content });
    }
  }

  return items;
}

function extractInstructions(
  messages: ProviderMessage[],
  explicit?: ChatRequest['system'],
): string | undefined {
  if (explicit !== undefined) {
    if (typeof explicit === 'string') return explicit;
    return explicit.map((b: TextBlock) => b.text).join('\n\n');
  }
  const systems = messages.filter((m) => m.role === 'system');
  if (systems.length === 0) return undefined;
  return systems
    .map((m) => {
      if (typeof m.content === 'string') return m.content;
      return m.content
        .filter(isTextBlock)
        .map((b) => b.text)
        .join('\n\n');
    })
    .join('\n\n');
}

function translateTool(tool: ToolDef, strict: boolean): ResponsesFunctionTool {
  const parameters = normalizeOpenAIStrictToolParameters(tool.inputSchema, strict);
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: parameters as Record<string, unknown>,
    ...(strict ? { strict: true } : {}),
  };
}

function translateNativeTool(tool: unknown): ResponsesNativeTool {
  if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
    throw new TypeError('OpenAI Responses native tools must be objects');
  }
  const type = (tool as Record<string, unknown>)['type'];
  if (typeof type !== 'string' || type.trim().length === 0) {
    throw new TypeError('OpenAI Responses native tools require a non-empty type');
  }
  return { ...(tool as Record<string, unknown>), type };
}

function translateToolChoice(choice: ToolChoice | undefined): ResponsesToolChoice | undefined {
  if (choice === undefined) return undefined;
  if (choice === 'auto') return 'auto';
  if (choice === 'none') return 'none';
  if (choice === 'required') return 'required';
  return { type: 'function', name: choice.name };
}

function thinkingBudgetToEffort(
  budgetTokens: number | undefined,
): 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' {
  if (budgetTokens === undefined) return 'medium';
  if (budgetTokens >= 30000) return 'xhigh';
  if (budgetTokens >= 16000) return 'high';
  if (budgetTokens >= 4000) return 'medium';
  if (budgetTokens >= 1000) return 'low';
  return 'minimal';
}

export interface TranslateResponsesOptions {
  compat: OpenAICompletionsCompatDefaults;
  previousResponseId?: string;
  store?: boolean;
  serviceTier?: 'auto' | 'default' | 'flex';
}

export function translateChatRequestToResponses(
  req: ChatRequest,
  options: TranslateResponsesOptions,
): ResponsesCreateParams {
  const { compat } = options;

  const inputItems: ResponsesInputItem[] = [];
  for (const msg of req.messages) {
    inputItems.push(...translateMessage(msg));
  }

  const instructions = extractInstructions(req.messages, req.system);

  const strict = compat.supportsStrictMode && (req.tools?.some((t) => t.strict) ?? false);
  const tools: ResponsesTool[] = [
    ...(req.tools?.map((t) => translateTool(t, strict)) ?? []),
    ...(req.rawVendorTools?.map(translateNativeTool) ?? []),
  ];
  const usesNativeWebSearch = tools.some(
    (tool) => tool.type === 'web_search' || tool.type === 'web_search_2025_08_26',
  );
  const toolChoice = translateToolChoice(req.toolChoice);

  const reasoning: ResponsesReasoningConfig | undefined =
    (req.effort !== undefined || req.thinking?.type === 'enabled') && compat.supportsReasoningEffort
      ? (() => {
          const requested =
            req.effort ??
            thinkingBudgetToEffort(
              req.thinking?.type === 'enabled' ? req.thinking.budgetTokens : undefined,
            );
          const resolved = resolveOpenAIReasoningEffortForModel({
            model: { provider: 'openai', id: req.model },
            effort: requested,
          });
          return resolved
            ? {
                effort: resolved as NonNullable<ResponsesReasoningConfig['effort']>,
                summary: 'auto' as const,
              }
            : undefined;
        })()
      : undefined;

  const params: ResponsesCreateParams = {
    model: req.model,
    input: inputItems,
    stream: true,
    ...(instructions ? { instructions } : {}),
    ...(tools.length > 0 ? { tools } : {}),
    ...(usesNativeWebSearch ? { include: ['web_search_call.action.sources'] as const } : {}),
    ...(toolChoice !== undefined ? { tool_choice: toolChoice } : {}),
    ...(req.maxOutputTokens !== undefined ? { max_output_tokens: req.maxOutputTokens } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.topP !== undefined ? { top_p: req.topP } : {}),
    ...(req.stopSequences && req.stopSequences.length > 0 ? { stop: req.stopSequences } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(options.previousResponseId ? { previous_response_id: options.previousResponseId } : {}),
    ...(options.store !== undefined ? { store: options.store } : {}),
    ...(options.serviceTier ? { service_tier: options.serviceTier } : {}),
    ...(req.metadata ? { metadata: req.metadata as Record<string, string> } : {}),
  };

  return params;
}
