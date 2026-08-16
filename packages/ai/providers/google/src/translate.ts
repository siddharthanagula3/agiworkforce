
import type {
  ChatRequest,
  ContentBlock,
  ProviderMessage,
  TextBlock,
  ToolDef,
  ToolChoice,
} from '@agiworkforce/types';
import { cleanSchemaForGemini } from '@agiworkforce/provider-protocol';

import type {
  GeminiContent,
  GeminiGenerateContentRequest,
  GeminiPart,
  GeminiSystemInstruction,
  GeminiTool,
  GeminiToolConfig,
} from './types';

function isTextBlock(b: ContentBlock): b is TextBlock {
  return b.type === 'text';
}

function buildToolUseNameMap(messages: ProviderMessage[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    if (typeof msg.content === 'string') continue;
    for (const block of msg.content) {
      if (block.type === 'tool_use') {
        map.set(block.id, block.name);
      }
    }
  }
  return map;
}

function translatePart(block: ContentBlock, toolUseNames: Map<string, string>): GeminiPart | null {
  switch (block.type) {
    case 'text':
      return { text: block.text };
    case 'image':
      if (block.source.type === 'base64') {
        return { inlineData: { mimeType: block.source.mediaType, data: block.source.data } };
      }
      return null;
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
      return { parts: [{ text: explicit }] };
    }
    return { parts: explicit.map((b: TextBlock) => ({ text: b.text })) };
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
  return { parts: [{ text }] };
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
  const toolUseNames = buildToolUseNameMap(req.messages);
  const contents = req.messages
    .map((m) => translateMessage(m, toolUseNames))
    .filter((c): c is GeminiContent => c !== null);
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
