import type {
  ChatRequest,
  ContentBlock,
  ProviderMessage,
  TextBlock,
  ToolDef,
  ToolChoice,
} from '@agiworkforce/types';
import { UnsupportedFileInputError } from '@agiworkforce/types';
import {
  cleanSchemaForGemini,
  stripSystemPromptCacheBoundary,
} from '@agiworkforce/provider-protocol';

import type {
  GeminiContent,
  GeminiGenerateContentRequest,
  GeminiPart,
  GeminiSystemInstruction,
  GeminiTool,
  GeminiToolConfig,
} from './types';

const JSON_MIME_TYPE = 'application/json';
const IMAGE_BY_URL_MEDIA_TYPE = 'image/*';

function isTextBlock(b: ContentBlock): b is TextBlock {
  return b.type === 'text';
}

/**
 * Gemini numbers tool calls per turn, so an id repeats across turns. A result
 * is named after the latest call with its id that came before it.
 */
function recordToolUseNames(msg: ProviderMessage, toolUseNames: Map<string, string>): void {
  if (msg.role !== 'assistant' || typeof msg.content === 'string') return;
  for (const block of msg.content) {
    if (block.type === 'tool_use') toolUseNames.set(block.id, block.name);
  }
}

function translatePart(block: ContentBlock, toolUseNames: Map<string, string>): GeminiPart | null {
  switch (block.type) {
    case 'text':
      return { text: block.text };
    case 'image':
      if (block.source.type === 'base64') {
        return { inlineData: { mimeType: block.source.mediaType, data: block.source.data } };
      }
      throw new UnsupportedFileInputError(
        block.source.url,
        IMAGE_BY_URL_MEDIA_TYPE,
        'Gemini takes images as inline bytes, not by link',
      );
    case 'file':
      return {
        inlineData: { mimeType: block.source.mediaType, data: block.source.data },
      };
    case 'tool_use':
      return {
        functionCall: { name: block.name, args: block.input },
        thoughtSignature: 'skip_thought_signature_validator',
      };
    case 'tool_result': {
      const text =
        typeof block.content === 'string'
          ? block.content
          : block.content.map((b) => b.text).join('\n');
      const name = toolUseNames.get(block.toolUseId) ?? block.toolUseId;
      return { functionResponse: { name, response: { output: text } } };
    }
    case 'thinking':
      return {
        thought: true,
        ...(block.signature ? { thoughtSignature: block.signature } : {}),
        text: block.thinking,
      };
  }
}

function translateMessage(
  msg: ProviderMessage,
  toolUseNames: Map<string, string>,
): GeminiContent | null {
  if (msg.role === 'system') return null;
  const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
  if (typeof msg.content === 'string') {
    return { role, parts: [{ text: msg.content }] };
  }
  const parts = msg.content
    .map((b) => translatePart(b, toolUseNames))
    .filter((p): p is GeminiPart => p !== null);
  if (parts.length === 0) return null;
  return { role, parts };
}

function extractSystemInstruction(
  messages: ProviderMessage[],
  explicit?: ChatRequest['system'],
): GeminiSystemInstruction | undefined {
  if (explicit !== undefined) {
    if (typeof explicit === 'string') {
      return { parts: [{ text: stripSystemPromptCacheBoundary(explicit) }] };
    }
    return {
      parts: explicit.map((b: TextBlock) => ({ text: stripSystemPromptCacheBoundary(b.text) })),
    };
  }
  const systems = messages.filter((m) => m.role === 'system');
  if (systems.length === 0) return undefined;
  const text = systems
    .map((m) => {
      if (typeof m.content === 'string') return m.content;
      return m.content
        .filter(isTextBlock)
        .map((b) => b.text)
        .join('\n\n');
    })
    .join('\n\n');
  return { parts: [{ text: stripSystemPromptCacheBoundary(text) }] };
}

function translateTool(tool: ToolDef): GeminiTool['functionDeclarations'] {
  const cleaned = cleanSchemaForGemini(tool.inputSchema) as Record<string, unknown>;
  return [
    {
      name: tool.name,
      description: tool.description,
      parameters: cleaned,
    },
  ];
}

function translateToolChoice(choice: ToolChoice | undefined): GeminiToolConfig | undefined {
  if (choice === undefined) return undefined;
  if (choice === 'auto') return { functionCallingConfig: { mode: 'AUTO' } };
  if (choice === 'none') return { functionCallingConfig: { mode: 'NONE' } };
  if (choice === 'required') return { functionCallingConfig: { mode: 'ANY' } };
  return { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [choice.name] } };
}

export function translateChatRequest(req: ChatRequest): GeminiGenerateContentRequest {
  const toolUseNames = new Map<string, string>();
  const contents: GeminiContent[] = [];
  for (const msg of req.messages) {
    recordToolUseNames(msg, toolUseNames);
    const content = translateMessage(msg, toolUseNames);
    if (content) contents.push(content);
  }
  const systemInstruction = extractSystemInstruction(req.messages, req.system);

  const declarations =
    req.tools && req.tools.length > 0
      ? req.tools.flatMap(translateTool).filter((d): d is NonNullable<typeof d> => d !== undefined)
      : undefined;
  const vendorTools = (req.rawVendorTools ?? []) as GeminiTool[];
  const combinedTools: GeminiTool[] = [
    ...(declarations ? [{ functionDeclarations: declarations }] : []),
    ...vendorTools,
  ];
  const tools: GeminiTool[] | undefined = combinedTools.length > 0 ? combinedTools : undefined;
  const choiceConfig = translateToolChoice(req.toolChoice);

  const combinesBuiltInAndFunctions =
    declarations !== undefined && declarations.length > 0 && vendorTools.length > 0;
  const toolConfig: GeminiToolConfig | undefined = combinesBuiltInAndFunctions
    ? { ...(choiceConfig ?? {}), includeServerSideToolInvocations: true }
    : choiceConfig;

  const generationConfig: NonNullable<GeminiGenerateContentRequest['generationConfig']> = {};
  if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
  if (req.topP !== undefined) generationConfig.topP = req.topP;
  if (req.topK !== undefined) generationConfig.topK = req.topK;
  if (req.maxOutputTokens !== undefined) generationConfig.maxOutputTokens = req.maxOutputTokens;
  if (req.stopSequences) generationConfig.stopSequences = req.stopSequences;
  if (req.responseFormat && !tools) {
    generationConfig.responseMimeType = JSON_MIME_TYPE;
    if (req.responseFormat.type === 'json_schema') {
      generationConfig.responseJsonSchema = req.responseFormat.schema;
    }
  }

  if (req.thinking?.type === 'enabled') {
    const includeThoughts = req.thinking.includeThoughts ?? true;
    generationConfig.thinkingConfig = {
      ...(includeThoughts ? { includeThoughts: true } : {}),
      ...(req.thinking.thinkingLevel !== undefined
        ? { thinkingLevel: req.thinking.thinkingLevel }
        : req.thinking.budgetTokens !== undefined
          ? { thinkingBudget: req.thinking.budgetTokens }
          : {}),
    };
  }

  return {
    contents,
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(tools ? { tools } : {}),
    ...(toolConfig ? { toolConfig } : {}),
    ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
  };
}
