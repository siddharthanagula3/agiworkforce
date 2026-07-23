/**
 * Translate `ChatRequest` → Gemini `:streamGenerateContent` request body.
 *
 * Gemini-specific shape rules:
 *   - **No "system" role**: system messages go on top-level `systemInstruction`
 *   - **Roles are `user` / `model`**: assistant ≡ model
 *   - **Each message holds a `parts: GeminiPart[]`** array; text / inlineData (image) /
 *     functionCall / functionResponse / thought all live as parts
 *   - **Tool schemas pass through `cleanSchemaForGemini`** from provider-protocol
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
    case 'file':
      return {
        inlineData: { mimeType: block.source.mediaType, data: block.source.data },
      };
    case 'tool_use':
      // Gemini 3 strictly validates thought signatures on replayed functionCall
      // parts: omitting one 400s with INVALID_ARGUMENT ("Function call is
      // missing a thought_signature in functionCall parts", live repro
      // 2026-07-10 on gemini-3.5-flash with the tool loop's replayed assistant
      // turn). Our tool loops replay assistant tool calls over the
      // OpenAI-compatible wire, which cannot carry Gemini's signature — from
      // Gemini's perspective these are INJECTED function calls, and the docs
      // (ai.google.dev/gemini-api/docs/generate-content/thought-signatures)
      // document exactly this dummy value to skip validation for injected
      // calls. Real-signature continuity needs the signature to survive the
      // shared wire (same class as the Anthropic thinking-continuity fix) —
      // tracked in known-flaws as GEMINI-FUNCTIONCALL-THOUGHT-SIGNATURE-01.
      return {
        functionCall: { name: block.name, args: block.input },
        thoughtSignature: 'skip_thought_signature_validator',
      };
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
  // rawVendorTools are provider-native tool entries (e.g. { google_search: {} })
  // appended verbatim as additional GeminiTool objects — caller owns the shape.
  const vendorTools = (req.rawVendorTools ?? []) as GeminiTool[];
  const combinedTools: GeminiTool[] = [
    ...(declarations ? [{ functionDeclarations: declarations }] : []),
    ...vendorTools,
  ];
  const tools: GeminiTool[] | undefined = combinedTools.length > 0 ? combinedTools : undefined;
  const choiceConfig = translateToolChoice(req.toolChoice);

  // Gemini requires `toolConfig.includeServerSideToolInvocations: true` when a
  // request carries BOTH built-in tools (rawVendorTools, e.g. google_search
  // grounding) AND functionDeclarations — without it the API rejects the
  // request with 400 INVALID_ARGUMENT ("Please enable
  // tool_config.include_server_side_tool_invocations to use Built-in tools
  // with Function calling."). Scoped narrowly to the combined case: requests
  // with only one kind of tool keep their existing byte-identical body (the
  // key is never emitted), and all catalog Gemini models are 3.x, which
  // support the flag.
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
    // includeThoughts defaults to true (Gemini streams a reasoning summary
    // back) so every caller that predates this field -- e.g. services/api-
    // gateway's /api/v1/providers/:providerId/stream, which takes a caller-
    // supplied ChatRequest.thinking directly -- keeps today's behavior with
    // zero change. A caller can opt OUT (apps/web's web v1 route does, to
    // hold its byte-stability contract with the pre-adapter Google provider,
    // which only ever sent thinkingBudget -- see canonical-request.ts's
    // toCanonicalGoogleThinking) by setting includeThoughts:false, which
    // omits the key entirely rather than sending it as a literal `false`
    // (Gemini's own default), matching the pre-adapter wire byte-for-byte.
    const includeThoughts = req.thinking.includeThoughts ?? true;
    // Gemini 3.x: prefer the discrete `thinkingLevel` (current control). Fall back
    // to the legacy `thinkingBudget` integer (2.5-era, still accepted) when no
    // level is set — preserving byte-stability for legacy callers that only ever
    // sent a budget. See reasoning-effort-capability-matrix-2026-07-10 flag 4.
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
