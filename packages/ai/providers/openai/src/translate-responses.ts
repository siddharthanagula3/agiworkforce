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
import { getModelReasoning } from '@agiworkforce/types';
import type { OpenAICompletionsCompatDefaults } from '@agiworkforce/provider-protocol';
import {
  normalizeOpenAIStrictToolParameters,
  resolveOpenAIReasoningEffortForModel,
  stripSystemPromptCacheBoundary,
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
import { derivePromptCacheKey } from './translate';

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
    const joined =
      typeof explicit === 'string' ? explicit : explicit.map((b: TextBlock) => b.text).join('\n\n');
    return stripSystemPromptCacheBoundary(joined);
  }
  const systems = messages.filter((m) => m.role === 'system');
  if (systems.length === 0) return undefined;
  const joined = systems
    .map((m) => {
      if (typeof m.content === 'string') return m.content;
      return m.content
        .filter(isTextBlock)
        .map((b) => b.text)
        .join('\n\n');
    })
    .join('\n\n');
  return stripSystemPromptCacheBoundary(joined);
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
  const raw = tool as Record<string, unknown>;
  const type = raw['type'];
  if (typeof type !== 'string' || type.trim().length === 0) {
    throw new TypeError('OpenAI Responses native tools require a non-empty type');
  }
  // Responses rejects code_interpreter without a container ("Missing required
  // parameter: 'tools[].container'"); auto reuses the response's live container.
  if (type === 'code_interpreter' && raw['container'] == null) {
    return { ...raw, type, container: { type: 'auto' } };
  }
  return { ...raw, type };
}

/**
 * A hosted Responses tool is chosen by its own `type`, not by the function
 * shape: `{ type: 'web_search' }`, never `{ type: 'function', name:
 * 'web_search' }`. The canonical `ToolChoice` carries only a name, so the
 * request's own tool list is what resolves which of the two shapes to send.
 * Dated hosted variants (`web_search_2025_08_26`) answer to the undated name.
 */
function findHostedToolType(tools: readonly ResponsesTool[], name: string): string | undefined {
  return tools.find(
    (tool) =>
      tool.type !== 'function' &&
      (tool.type === name || tool.type.startsWith(`${name}${HOSTED_TOOL_VARIANT_SEPARATOR}`)),
  )?.type;
}

const HOSTED_TOOL_VARIANT_SEPARATOR = '_';

function translateToolChoice(
  choice: ToolChoice | undefined,
  tools: readonly ResponsesTool[],
): ResponsesToolChoice | undefined {
  if (choice === undefined) return undefined;
  if (choice === 'auto') return 'auto';
  if (choice === 'none') return 'none';
  if (choice === 'required') return 'required';
  const hostedType = findHostedToolType(tools, choice.name);
  if (hostedType !== undefined) return { type: hostedType };
  return { type: 'function', name: choice.name };
}

const REASONING_SUMMARY_MODE: NonNullable<ResponsesReasoningConfig['summary']> = 'auto';
const FALLBACK_REASONING_EFFORT = 'medium' as const;

function thinkingBudgetToEffort(
  budgetTokens: number | undefined,
): 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' {
  if (budgetTokens === undefined) return FALLBACK_REASONING_EFFORT;
  if (budgetTokens >= 30000) return 'xhigh';
  if (budgetTokens >= 16000) return 'high';
  if (budgetTokens >= 4000) return FALLBACK_REASONING_EFFORT;
  if (budgetTokens >= 1000) return 'low';
  return 'minimal';
}

function resolveReasoningConfig(
  req: ChatRequest,
  compat: OpenAICompletionsCompatDefaults,
): ResponsesReasoningConfig | undefined {
  if (!compat.supportsReasoningEffort) return undefined;
  if (req.thinking?.type === 'disabled') return undefined;

  const modelReasoning = getModelReasoning(req.model);
  const hasExplicitSignal = req.effort !== undefined || req.thinking?.type === 'enabled';
  if (!hasExplicitSignal && !modelReasoning.capable) return undefined;

  const requested =
    req.effort ??
    (req.thinking?.type === 'enabled'
      ? thinkingBudgetToEffort(req.thinking.budgetTokens)
      : (modelReasoning.defaultEffort ?? FALLBACK_REASONING_EFFORT));

  const resolved = resolveOpenAIReasoningEffortForModel({
    model: { provider: 'openai', id: req.model },
    effort: requested,
  });

  return resolved
    ? {
        effort: resolved as NonNullable<ResponsesReasoningConfig['effort']>,
        summary: REASONING_SUMMARY_MODE,
      }
    : undefined;
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
  const toolChoice = translateToolChoice(req.toolChoice, tools);

  const reasoning = resolveReasoningConfig(req, compat);

  const promptCacheKey = derivePromptCacheKey(req);

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
    ...(promptCacheKey ? { prompt_cache_key: promptCacheKey } : {}),
  };

  return params;
}
