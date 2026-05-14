/**
 * Translate `ChatRequest` to Anthropic Messages API params.
 *
 * Splits the request:
 *   - `system` (string | TextBlock[]) → top-level `system`
 *   - non-system messages → `messages[]` array
 *   - `tools` → vendor `tools` array (Anthropic input_schema shape)
 *   - `thinking` → top-level `thinking` (Anthropic extended thinking)
 *
 * Cache control (ephemeral) and `service_tier` are NOT applied here — they're
 * decided by `applyAnthropicPayloadPolicyToParams` from `@agiworkforce/llm-normalize`
 * after this translation step.
 */

import type {
  ChatRequest,
  ContentBlock,
  ProviderMessage,
  TextBlock,
  ToolDef,
  ToolChoice,
} from '@agiworkforce/types';

interface AnthropicTranslatedRequest {
  model: string;
  messages: AnthropicMessageParam[];
  system?: string | AnthropicSystemBlock[];
  tools?: AnthropicToolParam[];
  tool_choice?: AnthropicToolChoiceParam;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  thinking?: { type: 'enabled'; budget_tokens: number } | { type: 'disabled' };
  metadata?: Record<string, unknown>;
}

interface AnthropicMessageParam {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

type AnthropicContentBlock =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' } }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string };
    }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string | Array<{ type: 'text'; text: string }>;
      is_error?: boolean;
    }
  | { type: 'thinking'; thinking: string; signature?: string };

interface AnthropicSystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
}

interface AnthropicToolParam {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

type AnthropicToolChoiceParam =
  | { type: 'auto' }
  | { type: 'any' }
  | { type: 'tool'; name: string }
  | { type: 'none' };

const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

function translateContentBlock(block: ContentBlock): AnthropicContentBlock {
  switch (block.type) {
    case 'text':
      return {
        type: 'text',
        text: block.text,
        ...(block.cacheControl ? { cache_control: block.cacheControl } : {}),
      };
    case 'image':
      if (block.source.type === 'base64') {
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: block.source.mediaType,
            data: block.source.data,
          },
        };
      }
      return {
        type: 'image',
        source: { type: 'url', url: block.source.url },
      };
    case 'tool_use':
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
    case 'tool_result': {
      const content =
        typeof block.content === 'string'
          ? block.content
          : block.content.map((b) => ({ type: 'text' as const, text: b.text }));
      return {
        type: 'tool_result',
        tool_use_id: block.toolUseId,
        content,
        ...(block.isError ? { is_error: true } : {}),
      };
    }
    case 'thinking':
      return {
        type: 'thinking',
        thinking: block.thinking,
        ...(block.signature ? { signature: block.signature } : {}),
      };
  }
}

function translateMessage(msg: ProviderMessage): AnthropicMessageParam | null {
  if (msg.role === 'system') {
    // System messages are passed via the top-level `system` field, not the
    // messages array. Caller handles them separately.
    return null;
  }
  if (typeof msg.content === 'string') {
    return { role: msg.role, content: msg.content };
  }
  return {
    role: msg.role,
    content: msg.content.map(translateContentBlock),
  };
}

function translateSystem(
  messages: ProviderMessage[],
  explicit?: ChatRequest['system'],
): string | AnthropicSystemBlock[] | undefined {
  if (explicit !== undefined) {
    if (typeof explicit === 'string') {
      return explicit;
    }
    return explicit.map((b: TextBlock) => ({
      type: 'text' as const,
      text: b.text,
      ...(b.cacheControl ? { cache_control: b.cacheControl } : {}),
    }));
  }
  // Otherwise, collect any system messages from the messages array.
  const systemMsgs = messages.filter((m) => m.role === 'system');
  if (systemMsgs.length === 0) {
    return undefined;
  }
  // Collapse all system messages into a single string. Block-shaped system
  // prompts should be passed via the explicit `system` field.
  return systemMsgs
    .map((m) => {
      if (typeof m.content === 'string') return m.content;
      return m.content
        .filter((b): b is TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n\n');
    })
    .join('\n\n');
}

function translateTool(tool: ToolDef): AnthropicToolParam {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  };
}

function translateToolChoice(choice: ToolChoice | undefined): AnthropicToolChoiceParam | undefined {
  if (choice === undefined) return undefined;
  if (choice === 'auto') return { type: 'auto' };
  if (choice === 'none') return { type: 'none' };
  if (choice === 'required') return { type: 'any' };
  return { type: 'tool', name: choice.name };
}

export function translateChatRequest(req: ChatRequest): AnthropicTranslatedRequest {
  const messages = req.messages
    .map(translateMessage)
    .filter((m): m is AnthropicMessageParam => m !== null);
  const system = translateSystem(req.messages, req.system);
  const tools = req.tools?.map(translateTool);
  const toolChoice = translateToolChoice(req.toolChoice);

  const thinking =
    req.thinking?.type === 'enabled'
      ? {
          type: 'enabled' as const,
          budget_tokens: req.thinking.budgetTokens ?? 8000,
        }
      : req.thinking?.type === 'disabled'
        ? { type: 'disabled' as const }
        : undefined;

  return {
    model: req.model,
    messages,
    ...(system !== undefined ? { system } : {}),
    ...(tools && tools.length > 0 ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
    max_tokens: req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.topP !== undefined ? { top_p: req.topP } : {}),
    ...(req.topK !== undefined ? { top_k: req.topK } : {}),
    ...(req.stopSequences ? { stop_sequences: req.stopSequences } : {}),
    ...(thinking ? { thinking } : {}),
    ...(req.metadata ? { metadata: req.metadata } : {}),
  };
}

export type { AnthropicTranslatedRequest };
