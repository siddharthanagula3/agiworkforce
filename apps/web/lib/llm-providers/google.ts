import 'server-only';

import { BaseLLMProvider, LLMProviderRequest, LLMProviderResponse } from './base';
import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';

const GOOGLE_JSON_SCHEMA_ONLY_KEYS = new Set([
  '$schema',
  '$defs',
  'definitions',
  'additionalProperties',
  'allOf',
  'anyOf',
  'const',
  'contains',
  'dependentRequired',
  'dependentSchemas',
  'else',
  'examples',
  'if',
  'not',
  'oneOf',
  'patternProperties',
  'prefixItems',
  'then',
  'unevaluatedItems',
  'unevaluatedProperties',
]);

type JsonObject = Record<string, unknown>;

const GOOGLE_THINKING_BUDGET: Readonly<Record<'low' | 'medium' | 'high', number>> = {
  low: 1024,
  medium: 8192,
  high: 24576,
};

function isPlainObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getGoogleThinkingBudget(effort: string | undefined): number | undefined {
  const normalized = effort?.toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') {
    return GOOGLE_THINKING_BUDGET[normalized];
  }
  return undefined;
}

function hasSchemaShape(value: unknown): value is JsonObject {
  return (
    isPlainObject(value) &&
    ['type', 'properties', 'items', 'required', '$defs', 'definitions'].some((key) => key in value)
  );
}

function normalizeGoogleToolSchema(schema: unknown, isRoot = true): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => normalizeGoogleToolSchema(item, false));
  }

  if (!isPlainObject(schema)) {
    return schema;
  }

  // Some MCP / JSON Schema tool adapters wrap the actual schema in a top-level `schema` field.
  if (isRoot && hasSchemaShape(schema['schema'])) {
    return normalizeGoogleToolSchema(schema['schema'], true);
  }

  const normalized: JsonObject = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === '$schema') continue;
    if (key === 'schema' && isPlainObject(value)) continue;
    normalized[key] = normalizeGoogleToolSchema(value, false);
  }

  if (normalized['type'] === 'array' && !('items' in normalized)) {
    normalized['items'] = {};
  }

  if (!('type' in normalized) && 'properties' in normalized) {
    normalized['type'] = 'object';
  }

  return normalized;
}

function requiresGoogleJsonSchema(schema: unknown): boolean {
  if (Array.isArray(schema)) {
    return schema.some(requiresGoogleJsonSchema);
  }

  if (!isPlainObject(schema)) {
    return false;
  }

  for (const [key, value] of Object.entries(schema)) {
    if (key === 'schema' && hasSchemaShape(value)) {
      return true;
    }
    if (GOOGLE_JSON_SCHEMA_ONLY_KEYS.has(key)) {
      return true;
    }
    if (requiresGoogleJsonSchema(value)) {
      return true;
    }
  }

  return false;
}

function getGoogleToolParameters(
  schema: unknown,
): { parameters: JsonObject } | { parametersJsonSchema: JsonObject } {
  const normalized = normalizeGoogleToolSchema(schema);
  const baseSchema =
    isPlainObject(normalized) && Object.keys(normalized).length > 0
      ? normalized
      : { type: 'object', properties: {} };

  if (requiresGoogleJsonSchema(schema)) {
    return { parametersJsonSchema: baseSchema };
  }

  return { parameters: baseSchema };
}

/**
 * Coerce a tool name into Google's function-name grammar:
 * must start with a letter or underscore, then only [a-zA-Z0-9_.:-], max 128 chars.
 * Google rejects the whole request (400 INVALID_ARGUMENT) otherwise, which
 * previously broke web search whenever a turn routed to a Gemini model.
 */
function sanitizeGoogleFunctionName(raw: unknown): string {
  let name = typeof raw === 'string' ? raw : '';
  name = name.replace(/[^a-zA-Z0-9_.:-]/g, '_');
  if (!/^[a-zA-Z_]/.test(name)) name = `_${name}`;
  name = name.slice(0, 128);
  return name || 'tool';
}

/**
 * Google's native built-in tools are passed to the API as their own top-level
 * tool entries (siblings of the functionDeclarations object), NOT as function
 * declarations. Wrapping them in functionDeclarations turns grounding/code-exec
 * into a bogus no-op function the model can't ground with, which is exactly how
 * web search silently returned an empty turn. Keep this list in sync with the
 * built-in tools injected by the route's request-processor.
 */
const GOOGLE_NATIVE_TOOL_KEYS = new Set([
  'google_search',
  'googleSearch',
  'google_search_retrieval',
  'googleSearchRetrieval',
  'code_execution',
  'codeExecution',
  'url_context',
  'urlContext',
]);

function getGoogleNativeToolKey(tool: Record<string, unknown>): string | undefined {
  return Object.keys(tool).find((key) => GOOGLE_NATIVE_TOOL_KEYS.has(key));
}

/**
 * Convert the request's tools into Google's `tools` array. Function-style tools
 * (OpenAI/Anthropic/flat) are grouped into a single `functionDeclarations` entry;
 * native built-in tools (google_search, code_execution, url_context) are emitted
 * as their own pass-through entries. Returns the full array ready for `body.tools`.
 */
function transformToolsToGoogleFormat(tools: unknown[]): unknown[] {
  const declarations: unknown[] = [];
  const nativeTools: unknown[] = [];

  for (const raw of tools as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object') continue;

    // Native built-in tool, e.g. { google_search: {} } or { code_execution: {} }.
    // Pass it through unchanged as its own tool entry.
    const nativeKey = getGoogleNativeToolKey(raw);
    if (nativeKey) {
      nativeTools.push({ [nativeKey]: raw[nativeKey] ?? {} });
      continue;
    }

    // OpenAI format: { type: "function", function: { name, description, parameters } }
    if (raw['function']) {
      const fn = raw['function'] as Record<string, unknown>;
      declarations.push({
        name: sanitizeGoogleFunctionName(fn['name']),
        description: fn['description'] || '',
        ...getGoogleToolParameters(fn['parameters']),
      });
      continue;
    }
    // Anthropic format: { name, description, input_schema }
    if (raw['input_schema']) {
      declarations.push({
        name: sanitizeGoogleFunctionName(raw['name']),
        description: raw['description'] || '',
        ...getGoogleToolParameters(raw['input_schema']),
      });
      continue;
    }
    // Flat format (from desktop's transform): { name, description, parameters }
    declarations.push({
      name: sanitizeGoogleFunctionName(raw['name']),
      description: raw['description'] || '',
      ...getGoogleToolParameters(raw['parameters']),
    });
  }

  const result: unknown[] = [];
  if (declarations.length > 0) result.push({ functionDeclarations: declarations });
  result.push(...nativeTools);
  return result;
}

/**
 * Transform messages for Google Gemini, including tool call/result messages.
 * - System messages are extracted separately for systemInstruction
 * - Assistant messages with tool_calls become model messages with functionCall parts
 * - Tool role messages become user messages with functionResponse parts
 * - Consecutive same-role messages are merged (Gemini requires alternating roles)
 */
/** A single part in a Google Gemini content message */
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
}

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

interface GeminiSystemInstruction {
  parts: { text: string }[];
}

function transformMessagesForGoogle(messages: LLMProviderRequest['messages']): {
  contents: GeminiContent[];
  systemInstruction?: GeminiSystemInstruction;
} {
  const systemMessage = messages.find((msg) => msg.role === 'system');
  const systemInstruction = systemMessage
    ? { parts: [{ text: systemMessage.content }] }
    : undefined;

  const contents: GeminiContent[] = [];

  // Build a map of tool_call_id → function name from assistant tool_calls
  const toolCallIdToName = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls as unknown[]) {
        const tcObj = tc as Record<string, unknown>;
        const id = tcObj['id'] || tcObj['tool_call_id'];
        const fn = tcObj['function'] as Record<string, unknown> | undefined;
        const name = fn?.['name'] || tcObj['name'];
        if (id && name) {
          toolCallIdToName.set(String(id), String(name));
        }
      }
    }
  }

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'tool') {
      // Tool result → Google's functionResponse part
      // Parse the content as JSON if possible, otherwise wrap as text
      let responseContent: unknown;
      try {
        responseContent = JSON.parse(msg.content);
      } catch {
        responseContent = { result: msg.content };
      }

      // Look up the actual function name from the tool_call_id.
      // Fall back to 'unknown_tool' - never use the raw UUID as function name
      // since Gemini validates the name matches a prior functionCall part.
      const functionName =
        (msg.tool_call_id && toolCallIdToName.get(msg.tool_call_id)) || 'unknown_tool';
      if (functionName === 'unknown_tool') {
        logger.warn(
          { tool_call_id: msg.tool_call_id },
          'Could not resolve function name for tool_call_id; falling back to "unknown_tool" which Gemini may reject',
        );
      }

      const functionResponse = {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: functionName,
              response: responseContent,
            },
          },
        ],
      };

      // Merge with previous user message if last was also user role
      const last = contents[contents.length - 1];
      if (last && last.role === 'user') {
        last.parts.push(...functionResponse.parts);
      } else {
        contents.push(functionResponse);
      }
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls && Array.isArray(msg.tool_calls)) {
      // Assistant with tool_calls → model message with functionCall parts
      const parts: GeminiPart[] = [];
      if (msg.content && msg.content.trim()) {
        parts.push({ text: msg.content });
      }
      for (const tc of msg.tool_calls as unknown[]) {
        const tcObj = tc as Record<string, unknown>;
        const fn = tcObj['function'] as Record<string, unknown> | undefined;
        const funcName = String(fn?.['name'] || tcObj['name'] || 'unknown');
        let funcArgs: Record<string, unknown> = {};
        try {
          const rawArgs = fn?.['arguments'] || tcObj['arguments'] || '{}';
          funcArgs =
            typeof rawArgs === 'string'
              ? JSON.parse(rawArgs)
              : (rawArgs as Record<string, unknown>);
        } catch {
          funcArgs = {};
        }
        parts.push({
          functionCall: {
            name: funcName,
            args: funcArgs,
          },
        });
      }
      contents.push({ role: 'model', parts });
      continue;
    }

    // Regular user or assistant message
    const role = msg.role === 'assistant' ? 'model' : 'user';
    if (!msg.content || !msg.content.trim()) continue;

    // Merge consecutive same-role messages (Gemini requires alternating)
    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts.push({ text: msg.content });
    } else {
      contents.push({ role, parts: [{ text: msg.content }] });
    }
  }

  return { contents, systemInstruction };
}

export class GoogleProvider extends BaseLLMProvider {
  getDefaultBaseUrl(): string {
    return 'https://generativelanguage.googleapis.com/v1beta';
  }

  protected override getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.apiKey,
    };
  }

  async sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    const url = `${this.baseUrl}/models/${request.model}:generateContent`;

    // Convert messages format for Google Gemini (including tool call/result messages)
    const { contents, systemInstruction } = transformMessagesForGoogle(request.messages);

    // CRITICAL: Gemini 3 models require temperature of 1.0
    // Lower values cause looping or degraded performance
    const isGemini3 = request.model.includes('gemini-3');
    const temperature = isGemini3 && request.temperature === undefined ? 1.0 : request.temperature;
    const thinkingBudget = getGoogleThinkingBudget(request.effort);

    const body: Record<string, unknown> = {
      contents,
      ...(systemInstruction && { systemInstruction }),
      generationConfig: {
        ...(temperature !== undefined && { temperature }),
        ...(request.max_tokens !== undefined && { maxOutputTokens: request.max_tokens }),
        ...(thinkingBudget !== undefined && { thinkingConfig: { thinkingBudget } }),
      },
      // Disable safety filters to prevent blank responses for code/terminal prompts
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    // Add tool declarations if provided
    if (request.tools && request.tools.length > 0) {
      const googleTools = transformToolsToGoogleFormat(request.tools);
      if (googleTools.length > 0) body['tools'] = googleTools;
    }

    try {
      const response = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let errorText: string;
        let errorData: unknown;
        try {
          errorText = await response.text();
          errorData = JSON.parse(errorText);
        } catch {
          errorText = response.statusText;
          errorData = { status: response.status };
        }

        logger.error(
          {
            status: response.status,
            error: errorText,
            errorData,
            model: request.model,
          },
          'Google API error',
        );

        // Handle specific error types based on status code
        if (response.status === 400) {
          throw new Error('Google API invalid request. Please check your request parameters.');
        } else if (response.status === 401) {
          throw new Error('Google API authentication failed. Please check your API key.');
        } else if (response.status === 403) {
          throw new Error(
            'Google API permission denied. Your API key may not have access to this resource.',
          );
        } else if (response.status === 429) {
          throw new Error('Google API rate limit exceeded. Please try again later.');
        } else if (response.status >= 500) {
          throw new Error('Google API service temporarily unavailable. Please try again later.');
        } else {
          throw new Error(`Google API error: ${response.status} ${errorText}`);
        }
      }

      const data = await response.json();

      // Check for errors in response
      if (data.error) {
        logger.error(
          { error: data.error, model: request.model },
          'Google API returned error in response',
        );
        throw new Error(`Google API error: ${data.error.message || JSON.stringify(data.error)}`);
      }

      const candidate = data.candidates?.[0];
      if (!candidate) {
        logger.warn({ model: request.model, data }, 'Google API returned no candidates');
        throw new Error('Google API returned no response candidates');
      }

      // Check finishReason for error cases
      const finishReason = candidate.finishReason;
      if (finishReason === 'MAX_TOKENS') {
        logger.warn(
          { model: request.model, finishReason },
          'Google response was truncated due to token limit',
        );
      } else if (finishReason === 'SAFETY') {
        logger.warn(
          { model: request.model, finishReason, safetyRatings: candidate.safetyRatings },
          'Google response was blocked by safety filters',
        );
        throw new Error('Response was blocked by safety filters');
      } else if (finishReason === 'RECITATION') {
        logger.warn(
          { model: request.model, finishReason },
          'Google response was blocked due to recitation concerns',
        );
        throw new Error('Response was blocked due to recitation concerns');
      } else if (finishReason === 'OTHER') {
        logger.warn(
          { model: request.model, finishReason, candidate },
          'Google response blocked with OTHER reason',
        );
        throw new Error('Response was blocked by content filter');
      }

      // Extract text and functionCall parts
      const parts: GeminiPart[] = candidate.content?.parts || [];
      const allTextParts = parts.filter((part) => part.text).map((part) => part.text);
      const content = allTextParts.join('');

      // Extract function calls (tool execution)
      const toolCalls = parts
        .filter(
          (part): part is GeminiPart & { functionCall: NonNullable<GeminiPart['functionCall']> } =>
            !!part.functionCall,
        )
        .map((part, idx: number) => ({
          id: `call_${randomUUID().replace(/-/g, '')}`,
          type: 'function' as const,
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
          index: idx,
        }));

      // Warn if response is empty despite successful completion and no tool calls
      if (
        !content &&
        toolCalls.length === 0 &&
        finishReason !== 'SAFETY' &&
        finishReason !== 'RECITATION'
      ) {
        logger.warn(
          {
            model: request.model,
            finishReason,
            hasParts: !!candidate.content?.parts,
            partsLength: candidate.content?.parts?.length,
            parts: candidate.content?.parts,
          },
          'Google returned empty content despite successful completion',
        );
      }

      // Google returns token counts in usageMetadata
      const promptTokens = data.usageMetadata?.promptTokenCount || 0;
      const completionTokens = data.usageMetadata?.candidatesTokenCount || 0;
      const totalTokens = data.usageMetadata?.totalTokenCount || promptTokens + completionTokens;

      return {
        content,
        model: data.model || request.model,
        promptTokens,
        completionTokens,
        totalTokens,
        finishReason,
        ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'Google request failed');
      throw error;
    }
  }

  async streamRequest(request: LLMProviderRequest): Promise<ReadableStream> {
    // IMPORTANT: alt=sse is required for streaming to work properly
    const url = `${this.baseUrl}/models/${request.model}:streamGenerateContent?alt=sse`;

    // Convert messages format for Google Gemini (including tool call/result messages)
    const { contents, systemInstruction } = transformMessagesForGoogle(request.messages);

    // CRITICAL: Gemini 3 models require temperature of 1.0
    // Lower values cause looping or degraded performance
    const isGemini3 = request.model.includes('gemini-3');
    const temperature = isGemini3 && request.temperature === undefined ? 1.0 : request.temperature;
    const thinkingBudget = getGoogleThinkingBudget(request.effort);

    const body: Record<string, unknown> = {
      contents,
      ...(systemInstruction && { systemInstruction }),
      generationConfig: {
        ...(temperature !== undefined && { temperature }),
        ...(request.max_tokens !== undefined && { maxOutputTokens: request.max_tokens }),
        ...(thinkingBudget !== undefined && { thinkingConfig: { thinkingBudget } }),
      },
      // Disable safety filters to prevent blank responses for code/terminal prompts
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ],
    };

    // Add tool declarations if provided
    if (request.tools && request.tools.length > 0) {
      const googleTools = transformToolsToGoogleFormat(request.tools);
      if (googleTools.length > 0) body['tools'] = googleTools;
    }

    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        { model: request.model, status: response.status, error: errorText },
        'Gemini streaming request failed',
      );
      throw new Error(`Google API error: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      logger.error({ model: request.model }, 'Gemini response has no body');
      throw new Error('No response body for streaming request');
    }

    logger.info({ model: request.model, url }, 'Gemini streaming request initiated');

    // Transform Google's streaming format to OpenAI-compatible SSE format
    // Google returns: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}
    // We need: data: {"choices":[{"delta":{"content":"..."}}]}\n\n
    let buffer = '';
    let hasTextContent = false; // Track if we've sent any text content
    let groundingEmitted = false; // Track if we've surfaced grounding source cards
    let chunkCount = 0;
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        buffer += text;
        chunkCount++;

        // Process SSE events (Google returns: data: {...}\n\n with alt=sse parameter)
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          // Skip non-data lines (comments, empty lines)
          if (!trimmedLine.startsWith('data:')) continue;

          // Remove 'data: ' prefix and parse JSON
          const jsonStr = trimmedLine.substring(5).trim();
          if (jsonStr === '[DONE]') continue;

          try {
            const data = JSON.parse(jsonStr);

            // Extract text from Google's format
            const candidate = data.candidates?.[0];
            if (!candidate) {
              continue;
            }

            // Check for safety blocks
            if (candidate.finishReason === 'SAFETY') {
              logger.warn(
                { model: request.model, safetyRatings: candidate.safetyRatings },
                'Google streaming response blocked by safety filters',
              );
              // Send error as SSE event
              const errorEvent = `data: ${JSON.stringify({
                error: 'Response was blocked by safety filters',
                finishReason: 'SAFETY',
              })}\n\n`;
              controller.enqueue(new TextEncoder().encode(errorEvent));
              continue;
            }

            // Extract text from ALL parts, not just the first one (fixes multi-part text loss)
            const parts: GeminiPart[] = candidate.content?.parts || [];
            const allTextParts = parts.filter((part) => part.text).map((part) => part.text);
            const textContent = allTextParts.join('');

            if (textContent) {
              hasTextContent = true; // Mark that we've sent content
              // Convert to OpenAI SSE format
              const sseEvent = `data: ${JSON.stringify({
                choices: [
                  {
                    delta: {
                      content: textContent,
                    },
                    index: 0,
                  },
                ],
                model: request.model,
              })}\n\n`;
              controller.enqueue(new TextEncoder().encode(sseEvent));
            }

            // Surface Google Search grounding sources as web-search result cards.
            // Gemini attaches groundingMetadata.groundingChunks (web: {uri,title})
            // on the chunk(s) where it grounded an answer. We map these to the
            // x_search_results delta the chat client already renders as favicon
            // source cards (InlineSearchResults). Emit once to avoid duplicates.
            const groundingChunks = candidate.groundingMetadata?.groundingChunks;
            if (!groundingEmitted && Array.isArray(groundingChunks) && groundingChunks.length > 0) {
              const resultContent = groundingChunks
                .map((gc) => gc?.web)
                .filter((web): web is { uri: string; title?: string } => !!web?.uri)
                .map((web, idx) => ({
                  type: 'web_search_result',
                  url: web.uri,
                  title: web.title || web.uri,
                  position: idx + 1,
                }));
              if (resultContent.length > 0) {
                groundingEmitted = true;
                hasTextContent = true; // grounded sources count as observable output
                const searchEvent = `data: ${JSON.stringify({
                  choices: [
                    {
                      delta: { x_search_results: { content: resultContent } },
                      index: 0,
                    },
                  ],
                  model: request.model,
                })}\n\n`;
                controller.enqueue(new TextEncoder().encode(searchEvent));
              }
            }

            // Extract function calls and emit as OpenAI-format tool_calls
            const functionCallParts = parts.filter(
              (
                part,
              ): part is GeminiPart & { functionCall: NonNullable<GeminiPart['functionCall']> } =>
                !!part.functionCall,
            );
            if (functionCallParts.length > 0) {
              hasTextContent = true; // Tool calls count as content
              const toolCalls = functionCallParts.map((part, idx: number) => ({
                index: idx,
                id: `call_${randomUUID().replace(/-/g, '')}`,
                type: 'function',
                function: {
                  name: part.functionCall.name,
                  arguments: JSON.stringify(part.functionCall.args || {}),
                },
              }));

              const toolEvent = `data: ${JSON.stringify({
                choices: [
                  {
                    delta: {
                      tool_calls: toolCalls,
                    },
                    index: 0,
                  },
                ],
                model: request.model,
              })}\n\n`;
              controller.enqueue(new TextEncoder().encode(toolEvent));
            }

            // Send usage data if present
            if (data.usageMetadata) {
              const usageEvent = `data: ${JSON.stringify({
                usageMetadata: data.usageMetadata,
                usage: {
                  prompt_tokens: data.usageMetadata.promptTokenCount || 0,
                  completion_tokens: data.usageMetadata.candidatesTokenCount || 0,
                  total_tokens: data.usageMetadata.totalTokenCount || 0,
                },
              })}\n\n`;
              controller.enqueue(new TextEncoder().encode(usageEvent));
            }

            // Send done signal if finished
            if (candidate.finishReason && candidate.finishReason !== 'SAFETY') {
              // If functionCall parts were present, emit "tool_calls" finish_reason
              // instead of Google's "STOP" to match OpenAI format
              const hasToolCalls = functionCallParts.length > 0;
              const finishReason = hasToolCalls
                ? 'tool_calls'
                : candidate.finishReason.toLowerCase();
              const doneEvent = `data: ${JSON.stringify({
                choices: [
                  {
                    finish_reason: finishReason,
                    index: 0,
                  },
                ],
              })}\n\ndata: [DONE]\n\n`;
              controller.enqueue(new TextEncoder().encode(doneEvent));
            }
          } catch (error) {
            // Skip malformed chunks
            logger.debug({ error, line }, 'Failed to parse Google streaming chunk');
          }
        }
      },
      flush(controller) {
        // If we never sent any text content, send an error message
        if (!hasTextContent) {
          logger.warn(
            { model: request.model, chunksReceived: chunkCount },
            'Gemini stream ended with no text content',
          );
          const errorEvent = `data: ${JSON.stringify({
            choices: [
              {
                delta: {
                  content:
                    '[Error: The model returned an empty response. This may be due to content filtering. Please try rephrasing your message.]',
                },
                index: 0,
              },
            ],
            model: request.model,
          })}\n\ndata: [DONE]\n\n`;
          controller.enqueue(new TextEncoder().encode(errorEvent));
        }
      },
    });

    return response.body.pipeThrough(transformStream);
  }
}
