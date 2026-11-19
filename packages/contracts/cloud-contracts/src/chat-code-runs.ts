import { z } from 'zod';

export const CHAT_CODE_RUN_TOOL_NAME = 'execute_code';
export const CHAT_CODE_RUN_MAX_CODE_CHARS = 100_000;
export const CHAT_CODE_RUN_MAX_LANGUAGE_CHARS = 32;
export const CHAT_CODE_RUN_MAX_DURATION_SECONDS = 300;
export const CHAT_CODE_RUN_APPROVAL_REQUIRED_CODE = 'approval_required';
export const CHAT_CODE_RUN_APPROVAL_REQUIRED_MESSAGE =
  'Your approvals are set to ask before every action. Approve this run to start it.';

export const CHAT_CODE_RUN_CONFIRMATION = Object.freeze({
  title: 'Run this code again?',
  message:
    "Your approvals are set to ask before every action. The code runs again in this chat's cloud sandbox and can change the files there.",
  confirmLabel: 'Run again',
});

export const ChatCodeRunRequestSchema = z.object({
  language: z.string().trim().min(1).max(CHAT_CODE_RUN_MAX_LANGUAGE_CHARS),
  code: z.string().min(1).max(CHAT_CODE_RUN_MAX_CODE_CHARS),
  approved: z.literal(true).optional(),
});
export type ChatCodeRunRequest = z.infer<typeof ChatCodeRunRequestSchema>;

export const ChatCodeRunResponseSchema = z.object({
  ok: z.boolean(),
  output: z.string(),
  error: z.string().nullable(),
  images: z.array(z.string()),
});
export type ChatCodeRunResponse = z.infer<typeof ChatCodeRunResponseSchema>;

export function chatCodeRunPath(conversationId: string): string {
  return `/api/chat/conversations/${encodeURIComponent(conversationId)}/code-runs`;
}
