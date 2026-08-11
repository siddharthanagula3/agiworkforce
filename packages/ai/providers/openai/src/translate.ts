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
    if (b.type === 'file') {
      throw new TypeError('File inputs require an OpenAI Responses-capable model');
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

/**
 * OpenAI built-in tools that exist only on the Responses API. The Chat
 * Completions endpoint (which every provider `translateChatRequest` targets,
 * including all 9 openai-compat vendors) rejects them with HTTP 400
 * ("Supported values are: 'function' and 'custom'"). Reproduces
 * `apps/web/lib/llm-providers/openai.ts`'s `OPENAI_RESPONSES_ONLY_TOOL_TYPES`/
 * `toOpenAiChatTools` exactly, scoped to `provider === 'openai'` only (see
 * below) rather than applied to every compat vendor.
 */
const OPENAI_RESPONSES_ONLY_TOOL_TYPES = new Set(['web_search_preview', 'code_interpreter']);

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
  const translatedTools = req.tools?.map((t) => translateTool(t, strict, provider)) ?? [];
  const rawVendorTools = req.rawVendorTools ?? [];
  // hasTools mirrors apps/web/lib/llm-providers/openai.ts's `Array.isArray(request.tools)
  // && request.tools.length > 0`, computed on the PRE-strip merged tool set -- a request
  // whose only "tool" is web_search_preview (stripped to zero below) still counts as
  // hasTools for the reasoning_effort gate further down, matching legacy's own order of
  // operations (it computes hasTools before ever stripping Responses-only tool types).
  const hasTools = translatedTools.length + rawVendorTools.length > 0;
  // rawVendorTools are provider-native payloads (e.g. web_search_preview) appended
  // verbatim -- the caller owns their wire shape. EXCEPT for provider === 'openai':
  // web_search_preview/code_interpreter exist only on OpenAI's Responses API and
  // /chat/completions rejects them with HTTP 400 ("Supported values are: 'function' and
  // 'custom'"). apps/web/lib/llm-providers/openai.ts strips them so the call degrades to
  // no native search/interpreter instead of failing outright -- reproduced here so the
  // canonical path doesn't turn that silent no-op into a hard error. Scoped to 'openai'
  // only: none of the 9 openai-compat providers' legacy files strip anything (request-
  // processor.ts only ever injects web_search_preview when provider === 'openai'), so
  // extending this to every compat vendor would be an unverified behavior change for
  // consumers this migration hasn't audited.
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

  // max_tokens vs max_completion_tokens per compat
  if (req.maxOutputTokens !== undefined) {
    if (compat.maxTokensField === 'max_completion_tokens') {
      params.max_completion_tokens = req.maxOutputTokens;
    } else {
      params.max_tokens = req.maxOutputTokens;
    }
  }

  // Reasoning effort (mapped through compat thinking format). An explicit `req.effort` --
  // set directly by a caller that already knows the exact tier it wants (e.g. apps/web's
  // canonical-request.ts buildOpenAIChatRequest) -- takes priority over a
  // thinking.budgetTokens-derived tier: thinkingBudgetToRequestedEffort's thresholds don't
  // round-trip `Effort` tiers losslessly (see `ChatRequest.effort`'s docstring in
  // packages/contracts/types/src/provider-adapter.ts), so a caller with the real tier in hand should
  // be able to bypass that heuristic entirely rather than have it re-derived from a budget
  // number and possibly land on a different tier.
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
    // OpenAI's /v1/chat/completions returns HTTP 400 when a request combines
    // reasoning_effort with function tools on current reasoning models --
    // apps/web/lib/llm-providers/openai.ts omits reasoning_effort whenever any tools are
    // present, computed on the same pre-strip hasTools above. Scoped to provider ===
    // 'openai' like the tool-stripping above: none of the compat providers' legacy files
    // have this gate, so it must not start omitting reasoning_effort for their requests.
    const omitForTools = provider === 'openai' && hasTools;
    if (resolved && !omitForTools) {
      params.reasoning_effort = resolved as NonNullable<
        OpenAIChatCompletionCreateParams['reasoning_effort']
      >;
    }
  }

  return params;
}
