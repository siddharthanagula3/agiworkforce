import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';

const SHARE_PATH = '/api/share';
const BATCH_SIZE = 200;
const MAX_MESSAGE_CHARS = 100_000;
const TITLE_MAX_CHARS = 500;

export type SharedChatRole = 'user' | 'assistant' | 'system';

export interface SharedChatCopy {
  title: string;
  messages: Array<{ role: SharedChatRole; content: string }>;
}

export class SharedChatUnavailableError extends Error {}

export function readSharedChat(body: unknown): SharedChatCopy {
  const record = (body ?? {}) as { title?: unknown; messages?: unknown };
  const title =
    typeof record.title === 'string' && record.title.trim()
      ? record.title.trim().slice(0, TITLE_MAX_CHARS)
      : 'Shared conversation';
  const messages = Array.isArray(record.messages)
    ? record.messages.flatMap((item) => {
        const { role, content } = (item ?? {}) as { role?: unknown; content?: unknown };
        if (role !== 'user' && role !== 'assistant' && role !== 'system') return [];
        if (typeof content !== 'string') return [];
        const trimmed = content.trim().slice(0, MAX_MESSAGE_CHARS);
        return trimmed ? [{ role: role as SharedChatRole, content: trimmed }] : [];
      })
    : [];
  return { title, messages };
}

export async function fetchSharedChat(token: string): Promise<SharedChatCopy> {
  try {
    return readSharedChat(await api.get<unknown>(`${SHARE_PATH}/${encodeURIComponent(token)}`));
  } catch (error) {
    if (error instanceof ApiHttpError && (error.status === 404 || error.status === 410)) {
      throw new SharedChatUnavailableError(
        error.status === 410
          ? 'This shared conversation has expired.'
          : 'This shared conversation could not be found.',
      );
    }
    throw error;
  }
}

export async function copySharedChatInto(
  conversationId: string,
  messages: SharedChatCopy['messages'],
): Promise<void> {
  for (let index = 0; index < messages.length; index += BATCH_SIZE) {
    await api.post<unknown>(
      `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages/bulk`,
      { messages: messages.slice(index, index + BATCH_SIZE) },
    );
  }
}
