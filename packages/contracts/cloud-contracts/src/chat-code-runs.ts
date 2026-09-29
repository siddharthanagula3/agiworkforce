import { z } from 'zod';

export const CHAT_CODE_RUN_TOOL_NAME = 'execute_code';
export const CHAT_CODE_RUN_MAX_CODE_CHARS = 100_000;
export const CHAT_CODE_RUN_MAX_LANGUAGE_CHARS = 32;

export const ChatCodeRunRequestSchema = z.object({
  language: z.string().trim().min(1).max(CHAT_CODE_RUN_MAX_LANGUAGE_CHARS),
  code: z.string().min(1).max(CHAT_CODE_RUN_MAX_CODE_CHARS),
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
