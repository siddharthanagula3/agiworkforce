import { z } from 'zod';

export const GUEST_CHAT_PATH = '/api/llm/v1/chat/completions/guest';

export const GUEST_CHAT_REMAINING_HEADER = 'x-guest-messages-remaining';
export const GUEST_CHAT_LIMIT_HEADER = 'x-guest-messages-limit';
export const GUEST_CHAT_RESET_HEADER = 'x-guest-messages-reset';

export const GUEST_CHAT_ERROR_CODES = {
  unavailable: 'guest_chat_unavailable',
  limitReached: 'guest_limit_reached',
  capacityReached: 'guest_capacity_reached',
  textOnly: 'guest_text_only',
  contentPolicy: 'content_policy_violation',
  upstream: 'guest_upstream_error',
} as const;

export type GuestChatErrorCode =
  (typeof GUEST_CHAT_ERROR_CODES)[keyof typeof GUEST_CHAT_ERROR_CODES];

export function guestChatRequestSchema(limits: { maxMessages: number; maxMessageChars: number }) {
  return z
    .object({
      messages: z
        .array(
          z
            .object({
              role: z.enum(['user', 'assistant']),
              content: z.string().trim().min(1).max(limits.maxMessageChars),
            })
            .strict(),
        )
        .min(1)
        .max(limits.maxMessages)
        .refine((messages) => messages.at(-1)?.role === 'user', {
          message: 'The last message must be the visitor’s.',
        }),
    })
    .strict();
}

export type GuestChatRequest = z.infer<ReturnType<typeof guestChatRequestSchema>>;

export interface GuestChatStatus {
  available: boolean;
  dailyLimit: number;
  remaining: number | null;
  resetAt: string | null;
  signInPath: string;
  signUpPath: string;
}

export interface GuestChatErrorBody {
  error: {
    code: GuestChatErrorCode;
    message: string;
    dailyLimit?: number;
    resetAt?: string;
    signInPath?: string;
  };
}
