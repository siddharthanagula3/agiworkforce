import 'server-only';

import { BaseLLMProvider, LLMProviderRequest, LLMProviderResponse } from './base';
import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';

/**
 * Convert OpenAI-format tools to Google's functionDeclarations format.
 * OpenAI: { type: "function", function: { name, description, parameters } }
 * Google: { functionDeclarations: [{ name, description, parameters }] }
 */
function transformToolsToGoogleFormat(tools: unknown[]): { functionDeclarations: unknown[] } {
  const declarations = tools.map((tool: any) => {
    // Handle OpenAI format: { type: "function", function: { name, description, parameters } }
    if (tool.function) {
      return {
        name: tool.function.name,
        description: tool.function.description || '',
        parameters: tool.function.parameters || { type: 'object', properties: {} },
      };
    }
    // Handle Anthropic format: { name, description, input_schema }
    if (tool.input_schema) {
      return {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.input_schema,
      };
    }
    // Handle flat format (from desktop's transform): { name, description, parameters }
    return {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.parameters || { type: 'object', properties: {} },
    };
  });

  return { functionDeclarations: declarations };
}

/**
 * Transform messages for Google Gemini, including tool call/result messages.
 * - System messages are extracted separately for systemInstruction
 * - Assistant messages with tool_calls become model messages with functionCall parts
 * - Tool role messages become user messages with functionResponse parts
 * - Consecutive same-role messages are merged (Gemini requires alternating roles)
 */
function transformMessagesForGoogle(messages: LLMProviderRequest['messages']): {
  contents: any[];
  systemInstruction?: any;
} {
  const systemMessage = messages.find((msg) => msg.role === 'system');
  const systemInstruction = systemMessage
    ? { parts: [{ text: systemMessage.content }] }
    : undefined;

  const contents: any[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'tool') {
      // Tool result → Google's functionResponse part
      // Parse the content as JSON if possible, otherwise wrap as text
      let responseContent: any;
      try {
        responseContent = JSON.parse(msg.content);
      } catch {
        responseContent = { result: msg.content };
      }

      const functionResponse = {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: msg.tool_call_id || 'unknown_tool',
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
      const parts: any[] = [];
      if (msg.content && msg.content.trim()) {
        parts.push({ text: msg.content });
      }
      for (const tc of msg.tool_calls as any[]) {
        const funcName = tc.function?.name || tc.name || 'unknown';
        let funcArgs: any = {};
        try {
          const rawArgs = tc.function?.arguments || tc.arguments || '{}';
          funcArgs = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;
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
    // Force redeployment - 2026-02-03
    return 'https://generativelanguage.googleapis.com/v1beta';
  }

  protected getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  async sendRequest(request: LLMProviderRequest): Promise<LLMProviderResponse> {
    const url = `${this.baseUrl}/models/${request.model}:generateContent?key=${this.apiKey}`;

    // Convert messages format for Google Gemini (including tool call/result messages)
    const { contents, systemInstruction } = transformMessagesForGoogle(request.messages);

    // CRITICAL: Gemini 3 models require temperature of 1.0
    // Lower values cause looping or degraded performance
    const isGemini3 = request.model.includes('gemini-3');
    const temperature = isGemini3 && request.temperature === undefined ? 1.0 : request.temperature;

    const body: Record<string, unknown> = {
      contents,
      ...(systemInstruction && { systemInstruction }),
      generationConfig: {
        ...(temperature !== undefined && { temperature }),
        ...(request.max_tokens !== undefined && { maxOutputTokens: request.max_tokens }),
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
      body.tools = [transformToolsToGoogleFormat(request.tools)];
    }

    try {
      const response = await fetch(url, {
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
      const parts = candidate.content?.parts || [];
      const allTextParts = parts.filter((part: any) => part.text).map((part: any) => part.text);
      const content = allTextParts.join('');

      // Extract function calls (tool execution)
      const toolCalls = parts
        .filter((part: any) => part.functionCall)
        .map((part: any, idx: number) => ({
          id: `call_${randomUUID().replace(/-/g, '').substring(0, 24)}`,
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
    const url = `${this.baseUrl}/models/${request.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    // Convert messages format for Google Gemini (including tool call/result messages)
    const { contents, systemInstruction } = transformMessagesForGoogle(request.messages);

    // CRITICAL: Gemini 3 models require temperature of 1.0
    // Lower values cause looping or degraded performance
    const isGemini3 = request.model.includes('gemini-3');
    const temperature = isGemini3 && request.temperature === undefined ? 1.0 : request.temperature;

    const body: Record<string, unknown> = {
      contents,
      ...(systemInstruction && { systemInstruction }),
      generationConfig: {
        ...(temperature !== undefined && { temperature }),
        ...(request.max_tokens !== undefined && { maxOutputTokens: request.max_tokens }),
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
      body.tools = [transformToolsToGoogleFormat(request.tools)];
    }

    const response = await fetch(url, {
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
            const parts = candidate.content?.parts || [];
            const allTextParts = parts
              .filter((part: any) => part.text)
              .map((part: any) => part.text);
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

            // Extract function calls and emit as OpenAI-format tool_calls
            const functionCallParts = parts.filter((part: any) => part.functionCall);
            if (functionCallParts.length > 0) {
              hasTextContent = true; // Tool calls count as content
              const toolCalls = functionCallParts.map((part: any, idx: number) => ({
                index: idx,
                id: `call_${randomUUID().replace(/-/g, '').substring(0, 24)}`,
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
