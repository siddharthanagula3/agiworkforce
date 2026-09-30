import {
  ChatCodeRunResponseSchema,
  chatCodeRunPath,
  type ChatCodeRunResponse,
} from '@agiworkforce/cloud-contracts';
import { apiFetch } from '@/services/api';

export const CODE_RUN_FAILED = 'The code did not run. Try again.';

export type CodeRunOutcome =
  { ok: true; result: ChatCodeRunResponse } | { ok: false; message: string };

function serverMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) return null;
  const message = (payload as { error?: { message?: unknown } }).error?.message;
  return typeof message === 'string' && message.trim() ? message : null;
}

export async function runCodeAgain(input: {
  conversationId: string;
  language: string;
  code: string;
  signal: AbortSignal;
}): Promise<CodeRunOutcome> {
  const response = await apiFetch(chatCodeRunPath(input.conversationId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: input.language, code: input.code }),
    signal: input.signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, message: serverMessage(payload) ?? CODE_RUN_FAILED };
  return { ok: true, result: ChatCodeRunResponseSchema.parse(payload) };
}
