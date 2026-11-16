import {
  CHAT_CODE_RUN_APPROVAL_REQUIRED_CODE,
  CHAT_CODE_RUN_MAX_DURATION_SECONDS,
  ChatCodeRunResponseSchema,
  chatCodeRunPath,
  type ChatCodeRunResponse,
} from '@agiworkforce/cloud-contracts';
import { apiFetch } from '@/services/api';

export const CODE_RUN_FAILED = 'The code did not run. Try again.';

export const CODE_RUN_TIMEOUT_MS = CHAT_CODE_RUN_MAX_DURATION_SECONDS * 1000;

export type CodeRunOutcome =
  | { ok: true; result: ChatCodeRunResponse }
  | { ok: false; message: string; approvalRequired?: true };

function serverError(payload: unknown): { message: string | null; code: string | null } {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) {
    return { message: null, code: null };
  }
  const error = (payload as { error?: { message?: unknown; code?: unknown } }).error;
  const message = typeof error?.message === 'string' && error.message.trim() ? error.message : null;
  const code = typeof error?.code === 'string' ? error.code : null;
  return { message, code };
}

export async function runCodeAgain(input: {
  conversationId: string;
  language: string;
  code: string;
  signal: AbortSignal;
  approved?: boolean;
}): Promise<CodeRunOutcome> {
  const response = await apiFetch(
    chatCodeRunPath(input.conversationId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: input.language,
        code: input.code,
        ...(input.approved ? { approved: true } : {}),
      }),
      signal: input.signal,
    },
    { timeout: CODE_RUN_TIMEOUT_MS },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const { message, code } = serverError(payload);
    return {
      ok: false,
      message: message ?? CODE_RUN_FAILED,
      ...(code === CHAT_CODE_RUN_APPROVAL_REQUIRED_CODE ? { approvalRequired: true as const } : {}),
    };
  }
  return { ok: true, result: ChatCodeRunResponseSchema.parse(payload) };
}
