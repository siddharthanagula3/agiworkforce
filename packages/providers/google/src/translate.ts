/**
 * Translate `ChatRequest` → Gemini `:streamGenerateContent` request body.
 *
 * Gemini-specific shape rules:
 *   - **No "system" role**: system messages go on top-level `systemInstruction`
 *   - **Roles are `user` / `model`**: assistant ≡ model
 *   - **Each message holds a `parts: GeminiPart[]`** array; text / inlineData (image) /
 *     functionCall / functionResponse / thought all live as parts
 *   - **Tool schemas pass through `cleanSchemaForGemini`** from llm-normalize
 *     to scrub disallowed JSON Schema keywords before submission
 *   - **Thinking** maps to `generationConfig.thinkingConfig` (`includeThoughts: true` +
 *     optional `thinkingBudget`)
 */

import type {
  ChatRequest,
  ContentBlock,
  ProviderMessage,
  TextBlock,
  ToolDef,
  ToolChoice,
} from '@agiworkforce/types';
import { cleanSchemaForGemini } from '@agiworkforce/llm-normalize';

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

function translatePart(block: ContentBlock): GeminiPart | null {
  switch (block.type) {
    case 'text':
      return { text: block.text };
    case 'image':
      // Gemini accepts inline base64. URL parts use fileData with a fileUri
      // that must be a Files-API uri (gs:// or generated upload uri); we
      // can't pass a generic public URL, so URL images are skipped here.
      if (block.source.type === 'base64') {
        return { inlineData: { mimeType: block.source.mediaType, data: block.source.data } };
      }
      return null;
    case 'tool_use':
      return { functionCall: { name: block.name, args: block.input } };
    case 'tool_result': {
      const text =
        typeof block.content === 'string'
          ? block.content
          : block.content.map((b) => b.text).join('\n');
      return { functionResponse: { name: block.toolUseId, response: { output: text } } };
    }
    case 'thinking':
      return {
        thought: true,
        ...(block.signature ? { thoughtSignature: block.signature } : {}),
        text: block.thinking,
      };
  }
}

function translateMessage(msg: ProviderMessage): GeminiContent | null {
  if (msg.role === 'system') return null;
  const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
  if (typeof msg.content === 'string') {
    return { role, parts: [{ text: msg.content }] };
  }
  const parts = msg.content.map(translatePart).filter((p): p is GeminiPart => p !== null);
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
  const contents = req.messages.map(translateMessage).filter((c): c is GeminiContent => c !== null);
  const systemInstruction = extractSystemInstruction(req.messages, req.system);

  const declarations =
    req.tools && req.tools.length > 0
      ? req.tools.flatMap(translateTool).filter((d): d is NonNullable<typeof d> => d !== undefined)
      : undefined;
  const tools: GeminiTool[] | undefined = declarations
    ? [{ functionDeclarations: declarations }]
    : undefined;
  const toolConfig = translateToolChoice(req.toolChoice);

  const generationConfig: NonNullable<GeminiGenerateContentRequest['generationConfig']> = {};
  if (req.temperature !== undefined) generationConfig.temperature = req.temperature;
  if (req.topP !== undefined) generationConfig.topP = req.topP;
  if (req.topK !== undefined) generationConfig.topK = req.topK;
  if (req.maxOutputTokens !== undefined) generationConfig.maxOutputTokens = req.maxOutputTokens;
  if (req.stopSequences) generationConfig.stopSequences = req.stopSequences;

  if (req.thinking?.type === 'enabled') {
    generationConfig.thinkingConfig = {
      includeThoughts: true,
      ...(req.thinking.budgetTokens !== undefined
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
