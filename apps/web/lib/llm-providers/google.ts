import 'server-only';

import { BaseLLMProvider, LLMProviderRequest, LLMProviderResponse } from './base';
import { logger } from '@/lib/logger';

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

    // Convert messages format for Google Gemini
    const contents = request.messages
      .filter((msg) => msg.role !== 'system')
      .filter((msg) => msg.content && msg.content.trim().length > 0) // Filter out empty messages
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

    const systemInstruction = request.messages.find((msg) => msg.role === 'system');

    // CRITICAL: Gemini 3 models require temperature of 1.0
    // Lower values cause looping or degraded performance
    const isGemini3 = request.model.includes('gemini-3');
    const temperature = isGemini3 && request.temperature === undefined ? 1.0 : request.temperature;

    const body: Record<string, unknown> = {
      contents,
      ...(systemInstruction && {
        systemInstruction: {
          parts: [{ text: systemInstruction.content }],
        },
      }),
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

      // Extract text from ALL parts, not just the first one
      const allTextParts =
        candidate.content?.parts?.filter((part: any) => part.text).map((part: any) => part.text) ||
        [];
      const content = allTextParts.join('');

      // Warn if response is empty despite successful completion
      if (!content && finishReason !== 'SAFETY' && finishReason !== 'RECITATION') {
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
      };
    } catch (error) {
      logger.error({ error, model: request.model }, 'Google request failed');
      throw error;
    }
  }

  async streamRequest(request: LLMProviderRequest): Promise<ReadableStream> {
    // IMPORTANT: alt=sse is required for streaming to work properly
    const url = `${this.baseUrl}/models/${request.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    // Convert messages format for Google Gemini
    const contents = request.messages
      .filter((msg) => msg.role !== 'system')
      .filter((msg) => msg.content && msg.content.trim().length > 0) // Filter out empty messages
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

    const systemInstruction = request.messages.find((msg) => msg.role === 'system');

    // CRITICAL: Gemini 3 models require temperature of 1.0
    // Lower values cause looping or degraded performance
    const isGemini3 = request.model.includes('gemini-3');
    const temperature = isGemini3 && request.temperature === undefined ? 1.0 : request.temperature;

    const body: Record<string, unknown> = {
      contents,
      ...(systemInstruction && {
        systemInstruction: {
          parts: [{ text: systemInstruction.content }],
        },
      }),
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

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API error: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming request');
    }

    // Transform Google's streaming format to OpenAI-compatible SSE format
    // Google returns: {"candidates":[{"content":{"parts":[{"text":"..."}]}}]}
    // We need: data: {"choices":[{"delta":{"content":"..."}}]}\n\n
    let buffer = '';
    let hasTextContent = false; // Track if we've sent any text content
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        const text = new TextDecoder().decode(chunk);
        buffer += text;

        // Process complete JSON objects (Google returns newline-delimited JSON)
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          try {
            const data = JSON.parse(trimmedLine);

            // Debug: Log the raw response to understand what Google is returning
            logger.info(
              {
                model: request.model,
                data: JSON.stringify(data).substring(0, 500),
                fullData: JSON.stringify(data),
                hasCandidates: !!data.candidates,
                candidatesLength: data.candidates?.length,
              },
              '[GEMINI DEBUG] Google streaming chunk received',
            );

            // Extract text from Google's format
            const candidate = data.candidates?.[0];
            if (!candidate) {
              logger.info(
                { model: request.model, data: JSON.stringify(data) },
                '[GEMINI DEBUG] Google streaming response has no candidates - SKIPPING',
              );
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
            const allTextParts =
              candidate.content?.parts
                ?.filter((part: any) => part.text)
                .map((part: any) => part.text) || [];
            const textContent = allTextParts.join('');

            // Debug: Log what we extracted
            logger.info(
              {
                model: request.model,
                hasContent: !!candidate.content,
                hasParts: !!candidate.content?.parts,
                partsLength: candidate.content?.parts?.length,
                parts: JSON.stringify(candidate.content?.parts),
                allTextPartsLength: allTextParts.length,
                textContentLength: textContent.length,
                textContentPreview: textContent.substring(0, 100),
              },
              '[GEMINI DEBUG] Extracted text from candidate',
            );

            if (!textContent && candidate.content?.parts?.length) {
              logger.info(
                {
                  model: request.model,
                  hasContent: !!candidate.content,
                  hasParts: !!candidate.content?.parts,
                  partsLength: candidate.content?.parts?.length,
                  parts: JSON.stringify(candidate.content?.parts),
                },
                '[GEMINI DEBUG] Google streaming chunk has parts but no text content - SKIPPING',
              );
            }

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
              logger.info(
                {
                  model: request.model,
                  textLength: textContent.length,
                  textPreview: textContent.substring(0, 100),
                  sseEventLength: sseEvent.length,
                },
                '[GEMINI DEBUG] SSE event sent to client',
              );
            } else {
              logger.info(
                { model: request.model },
                '[GEMINI DEBUG] No text content - NOT sending SSE event',
              );
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
              const doneEvent = `data: ${JSON.stringify({
                choices: [
                  {
                    finish_reason: candidate.finishReason.toLowerCase(),
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
          logger.error(
            { model: request.model },
            '[GEMINI DEBUG] Stream ended with NO text content - sending error',
          );
          const errorEvent = `data: ${JSON.stringify({
            choices: [
              {
                delta: {
                  content:
                    '[Error: Gemini returned an empty response. This may be due to content filtering or an API issue. Please try again.]',
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
