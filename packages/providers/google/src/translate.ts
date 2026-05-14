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

/**
 * Build a map of `toolUseId → functionName` from prior assistant
 * `tool_use` blocks so that subsequent `tool_result` blocks can carry the
 * original function name when translated to Gemini's `functionResponse`.
 *
 * Gemini requires `functionResponse.name` to match a
 * `tools.functionDeclarations[].name`. Passing the opaque toolUseId
 * (e.g. `toolu_01ABC...`) breaks the multi-turn round-trip — Gemini
 * either errors or treats the response as an unrecognized function output.
 */
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
      // Look up the original function name from the prior assistant
      // tool_use block. Fall back to the toolUseId only if we can't find
      // it (defensive — a well-formed transcript will always have a match).
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
