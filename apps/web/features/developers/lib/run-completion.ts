import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';

import { sendAuthorizedJson } from '@features/auth/step-up-fetch';

export const CHAT_COMPLETIONS_PATH = '/api/llm/v1/chat/completions';

export interface GatewayCompletionRequest {
  model: string;
  system: string;
  message: string;
  maxTokens: number | null;
  temperature: number | null;
}

export interface GatewayCompletionResult {
  content: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

interface CompletionPayload {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export async function runGatewayCompletion(
  request: GatewayCompletionRequest,
): Promise<GatewayCompletionResult> {
  const system = request.system.trim();
  const started = performance.now();
  const response = await sendAuthorizedJson(
    CHAT_COMPLETIONS_PATH,
    {
      method: 'POST',
      body: {
        model: request.model,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: request.message },
        ],
        stream: false,
        personalization: false,
        ...(request.maxTokens ? { max_tokens: request.maxTokens } : {}),
        ...(request.temperature !== null ? { temperature: request.temperature } : {}),
      },
    },
    {
      'Idempotency-Key': createManagedChatIdempotencyKey({
        surface: 'web',
        purpose: 'send',
        operationId: crypto.randomUUID(),
      }),
    },
  );
  const latencyMs = Math.round(performance.now() - started);
  const payload = (await response.json().catch(() => null)) as CompletionPayload | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message || `The gateway answered ${response.status}.`);
  }
  return {
    content: payload?.choices?.[0]?.message?.content ?? '',
    latencyMs,
    inputTokens: payload?.usage?.prompt_tokens ?? null,
    outputTokens: payload?.usage?.completion_tokens ?? null,
  };
}
