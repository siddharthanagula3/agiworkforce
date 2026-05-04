/**
 * Translate `ChatRequest` → OpenAI Responses API params.
 *
 * Notable mapping (vs Chat Completions):
 *   - `messages: ProviderMessage[]` → `input: ResponsesInputItem[]`
 *   - system messages → top-level `instructions` string (collapsed)
 *   - assistant `tool_use` blocks → `function_call` items (with `call_id`)
 *   - `tool_result` blocks → `function_call_output` items
 *   - text/image content → message with `content: ResponsesInputContent[]`
 *   - thinking blocks dropped from history (Responses tracks reasoning
 *     server-side via `previous_response_id`; transcripts shouldn't echo it)
 *   - `tools` → flat `[{ type: "function", name, description, parameters, strict }]`
 *   - `maxOutputTokens` → `max_output_tokens` (Responses uses this name)
 *   - `thinking.budgetTokens` → `reasoning.effort` (heuristic: budget→effort tier)
 *
 * Server-side `store` and `previous_response_id` are NOT set here — those
 * are stateful conversation knobs that belong to the caller (the api-gateway
 * or chat layer). The adapter passes them through if provided in
 * `OpenAIAdapterConfig.responsesStore` / per-request metadata, but the
 * default is stateless (matches Chat Completions semantics).
 */

import type {
  ChatRequest,
  ContentBlock,
  ImageBlock,
  ProviderMessage,
  TextBlock,
  ToolDef,
  ToolChoice,
} from '@agiworkforce/types';
import type { OpenAICompletionsCompatDefaults } from '@agiworkforce/llm-normalize';
import { normalizeOpenAIStrictToolParameters } from '@agiworkforce/llm-normalize';

import type {
  ResponsesCreateParams,
  ResponsesFunctionTool,
  ResponsesInputContent,
  ResponsesInputItem,
  ResponsesInputMessage,
  ResponsesReasoningConfig,
  ResponsesToolChoice,
} from './responses-types';

function isTextBlock(b: ContentBlock): b is TextBlock {
  return b.type === 'text';
}
function isImageBlock(b: ContentBlock): b is ImageBlock {
  return b.type === 'image';
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
  // System messages are NOT inserted as input items — they go on the
  // top-level `instructions` field. Caller filters them out.
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

  // Split content blocks into:
  //   - tool_use blocks → function_call input items
  //   - tool_result blocks → function_call_output input items
  //   - text/image blocks → a single message input item
  // Order matters: function_call must come before its function_call_output
  // in the input array.
  const textImage: ContentBlock[] = [];
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
    } else if (b.type === 'text' || b.type === 'image') {
      textImage.push(b);
    }
    // thinking blocks: drop from history (reasoning is server-side per
    // previous_response_id; replaying it confuses the model).
  }

  if (textImage.length > 0) {
    const collapsed = collapseTextOnly(textImage);
    const content = collapsed ?? blocksToInputContent(textImage);
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

function translateToolChoice(choice: ToolChoice | undefined): ResponsesToolChoice | undefined {
  if (choice === undefined) return undefined;
  if (choice === 'auto') return 'auto';
  if (choice === 'none') return 'none';
  if (choice === 'required') return 'required';
  return { type: 'function', name: choice.name };
}

function thinkingBudgetToEffort(
  budgetTokens: number | undefined,
): 'minimal' | 'low' | 'medium' | 'high' {
  if (budgetTokens === undefined) return 'medium';
  if (budgetTokens >= 16000) return 'high';
  if (budgetTokens >= 4000) return 'medium';
  if (budgetTokens >= 1000) return 'low';
  return 'minimal';
}

export interface TranslateResponsesOptions {
  /** Result of `detectOpenAICompletionsCompat()` — used for strict-mode tools + reasoning support. */
  compat: OpenAICompletionsCompatDefaults;
  /**
   * If provided, sets `previous_response_id` so the server reuses
   * server-stored conversation state instead of replaying full history.
   */
  previousResponseId?: string;
  /** Default false. When true, the server stores the response for chaining. */
  store?: boolean;
  /** OpenAI service tier (api.openai.com only). */
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
  const tools = req.tools?.map((t) => translateTool(t, strict));
  const toolChoice = translateToolChoice(req.toolChoice);

  const reasoning: ResponsesReasoningConfig | undefined =
    req.thinking?.type === 'enabled' && compat.supportsReasoningEffort
      ? { effort: thinkingBudgetToEffort(req.thinking.budgetTokens), summary: 'auto' }
      : undefined;

  const params: ResponsesCreateParams = {
    model: req.model,
    input: inputItems,
    stream: true,
    ...(instructions ? { instructions } : {}),
    ...(tools && tools.length > 0 ? { tools } : {}),
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
