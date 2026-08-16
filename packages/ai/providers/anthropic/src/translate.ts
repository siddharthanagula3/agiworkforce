
import type {
  ChatRequest,
  ContentBlock,
  ProviderMessage,
  TextBlock,
  ToolDef,
  ToolChoice,
} from '@agiworkforce/types';
import { getModelMetadataById } from '@agiworkforce/types';

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
  thinking?:
    | { type: 'enabled'; budget_tokens: number }
    | { type: 'disabled' }
    | { type: 'adaptive' };
  output_config?: { effort: string };
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
  | {
      type: 'document';
      title: string;
      source: { type: 'base64'; media_type: 'application/pdf'; data: string };
    }
  | {
      type: 'document';
      title: string;
      source: { type: 'text'; media_type: 'text/plain'; data: string };
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

function resolveMaxOutputTokens(
  requested: number | undefined,
  registryCeiling: number | undefined,
): number {
  const wanted = requested ?? DEFAULT_MAX_OUTPUT_TOKENS;
  return registryCeiling === undefined ? wanted : Math.min(wanted, registryCeiling);
}

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
    case 'file':
      if (block.source.mediaType === 'application/pdf') {
        return {
          type: 'document',
          title: block.filename,
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: block.source.data,
          },
        };
      }
      if (block.source.mediaType.startsWith('text/')) {
        return {
          type: 'document',
          title: block.filename,
          source: {
            type: 'text',
            media_type: 'text/plain',
            data: Buffer.from(block.source.data, 'base64').toString('utf8'),
          },
        };
      }
      throw new TypeError(
        `Anthropic document input does not support ${block.source.mediaType}; use PDF or text`,
      );
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
  const systemMsgs = messages.filter((m) => m.role === 'system');
  if (systemMsgs.length === 0) {
    return undefined;
  }
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
  const metadata = getModelMetadataById(req.model);
  const reasoning = metadata?.reasoning;
  const effortOrder = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
  const maximumDisabledEffort = reasoning?.maxEffortWhenThinkingDisabled;
  if (
    req.thinking?.type === 'disabled' &&
    req.effort &&
    maximumDisabledEffort &&
    effortOrder.indexOf(req.effort) > effortOrder.indexOf(maximumDisabledEffort)
  ) {
    throw new Error(
      `Thinking is disabled for ${req.model}; effort must be ${maximumDisabledEffort} or lower.`,
    );
  }

  const messages = req.messages
    .map(translateMessage)
    .filter((m): m is AnthropicMessageParam => m !== null);
  const system = translateSystem(req.messages, req.system);
  const translatedTools = req.tools?.map(translateTool) ?? [];
  const tools = [...translatedTools, ...((req.rawVendorTools ?? []) as AnthropicToolParam[])];
  const toolChoice = translateToolChoice(req.toolChoice);

  const thinking =
    reasoning?.thinkingDefault === 'adaptive' &&
    reasoning.supportsManualThinking === false &&
    req.thinking?.type !== 'disabled' &&
    req.thinking !== undefined
      ? { type: 'adaptive' as const }
      : req.thinking?.type === 'enabled'
        ? {
            type: 'enabled' as const,
            budget_tokens: req.thinking.budgetTokens ?? 8000,
          }
        : req.thinking?.type === 'disabled'
          ? { type: 'disabled' as const }
          : req.thinking?.type === 'adaptive'
            ? { type: 'adaptive' as const }
            : undefined;

  const rejectsSamplingParameters = reasoning?.rejectsSamplingParameters === true;

  return {
    model: req.model,
    messages,
    ...(system !== undefined ? { system } : {}),
    ...(tools && tools.length > 0 ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
    max_tokens: resolveMaxOutputTokens(req.maxOutputTokens, metadata?.maxOutputTokens),
    ...(!rejectsSamplingParameters && req.temperature !== undefined
      ? { temperature: req.temperature }
      : {}),
    ...(!rejectsSamplingParameters && req.topP !== undefined ? { top_p: req.topP } : {}),
    ...(!rejectsSamplingParameters && req.topK !== undefined ? { top_k: req.topK } : {}),
    ...(req.stopSequences ? { stop_sequences: req.stopSequences } : {}),
    ...(thinking ? { thinking } : {}),
    ...(req.effort ? { output_config: { effort: req.effort } } : {}),
    ...(req.metadata ? { metadata: req.metadata } : {}),
  };
}

export type { AnthropicTranslatedRequest };
