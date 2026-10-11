import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';

import {
  CHAT_SYSTEM_PROMPT_ID,
  CHAT_SYSTEM_PROMPT_LEGACY_VERSION,
  CHAT_SYSTEM_PROMPT_PINNED_VERSION,
} from './chat-system-prompt';
import { promptVersions } from './prompt-registry';

/**
 * A stored conversation keeps the chat system prompt version it started on.
 *
 * Changing the system text under a conversation that is already under way can
 * change its behaviour mid-thread and, for providers that replay signed
 * reasoning, invalidate what is sent back, so a new version reaches new
 * conversations only. The first turn records the pinned version on the
 * conversation; every later turn reads it back. A conversation with no record
 * and an answer already in its history began before versions were recorded,
 * and keeps the legacy version.
 */

const PG_UNDEFINED_COLUMN = '42703';

export interface ConversationPromptScope {
  readonly conversationId: string;
  readonly userId: string;
}

export function parseChatSystemPromptVersion(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && promptVersions(CHAT_SYSTEM_PROMPT_ID).includes(parsed)
    ? parsed
    : null;
}

export function startsConversation(messages: readonly { readonly role: string }[]): boolean {
  return !messages.some((message) => message.role === 'assistant');
}

export async function resolveConversationChatSystemPromptVersion(input: {
  readonly db: DatabaseAdapter;
  readonly scope: ConversationPromptScope;
  readonly recorded: unknown;
  readonly startsConversation: boolean;
}): Promise<number> {
  const recorded = parseChatSystemPromptVersion(input.recorded);
  if (recorded !== null) return recorded;
  if (!input.startsConversation) return CHAT_SYSTEM_PROMPT_LEGACY_VERSION;
  try {
    const [row] = await input.db.query<{ chat_system_prompt_version: number | string | null }>(
      `update web_conversations
          set chat_system_prompt_version = coalesce(chat_system_prompt_version, $3)
        where id = $1
          and user_id = $2
      returning chat_system_prompt_version`,
      [input.scope.conversationId, input.scope.userId, CHAT_SYSTEM_PROMPT_PINNED_VERSION],
    );
    return (
      parseChatSystemPromptVersion(row?.chat_system_prompt_version) ??
      CHAT_SYSTEM_PROMPT_LEGACY_VERSION
    );
  } catch (error) {
    if ((error as { code?: string } | null)?.code === PG_UNDEFINED_COLUMN) {
      logger.warn(
        { conversationId: input.scope.conversationId },
        '[chat] web_conversations.chat_system_prompt_version is missing (migration 0361 not applied?)',
      );
    } else {
      logger.error(
        { error, conversationId: input.scope.conversationId },
        '[chat] the conversation prompt version could not be recorded',
      );
    }
    return CHAT_SYSTEM_PROMPT_LEGACY_VERSION;
  }
}
