/**
 * Archived chats service.
 *
 * Reuses the same Managed Cloud endpoints and wire schemas the web Settings →
 * Archived chats section already talks to, rather than defining a second
 * mobile-only contract:
 *   - GET    /api/chat/conversations?archived=only   list
 *   - PUT    /api/chat/conversations/:id             restore ({ archived: false })
 *   - DELETE /api/chat/conversations/:id             delete one
 *   - POST   /api/chat/conversations/bulk            archive/delete in bulk
 *
 * All four are owner-scoped server-side; nothing here performs access control.
 *
 * The bulk route validates `action` against the same three-value enum on the
 * server (apps/web/app/api/chat/conversations/bulk/route.ts), so the three
 * bulk helpers below are the whole client surface — there is no fourth action
 * to add without a server change.
 */
import { z } from 'zod';
import {
  ManagedCloudConversationListResponseSchema,
  ManagedCloudDeleteConversationResponseSchema,
  ManagedCloudUpdateConversationResponseSchema,
  managedCloudConversationPath,
  normalizeManagedCloudConversation,
} from '@agiworkforce/cloud-contracts';

import { api } from '@/services/api';

/** Page size matches web so both surfaces paginate identically. */
const PAGE_SIZE = 50;

const BULK_CONVERSATION_ACTIONS = ['archive_all', 'delete_all', 'delete_archived'] as const;

type BulkConversationAction = (typeof BULK_CONVERSATION_ACTIONS)[number];

const BulkConversationResponseSchema = z.object({
  success: z.literal(true),
  action: z.enum(BULK_CONVERSATION_ACTIONS),
  affectedCount: z.number().int().nonnegative(),
});

/**
 * Single POST path for every bulk action so a caller cannot invent an action
 * string the server would reject. Returns how many chats the server reports it
 * actually touched — callers surface that number rather than guessing.
 */
async function postBulkConversationAction(action: BulkConversationAction): Promise<number> {
  const data = BulkConversationResponseSchema.parse(
    await api.post<unknown>('/api/chat/conversations/bulk', { action }),
  );
  return data.affectedCount;
}

export interface ArchivedConversation {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ArchivedConversationPage {
  conversations: ArchivedConversation[];
  hasMore: boolean;
  nextOffset: number;
}

export async function fetchArchivedConversations(
  offset = 0,
  signal?: AbortSignal,
): Promise<ArchivedConversationPage> {
  const data = ManagedCloudConversationListResponseSchema.parse(
    await api.get<unknown>(
      `/api/chat/conversations?archived=only&limit=${PAGE_SIZE}&offset=${Math.max(0, offset)}`,
      signal ? { signal } : undefined,
    ),
  );

  return {
    conversations: data.conversations.map((wire) => {
      const conversation = normalizeManagedCloudConversation(wire);
      return {
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
      };
    }),
    hasMore: data.hasMore,
    nextOffset: data.nextOffset,
  };
}

/** Move a chat back into the main list. */
export async function restoreArchivedConversation(id: string): Promise<void> {
  ManagedCloudUpdateConversationResponseSchema.parse(
    await api.put<unknown>(managedCloudConversationPath(id), { archived: false }),
  );
}

/** Archive a chat that is currently in the main list. */
export async function archiveConversation(id: string): Promise<void> {
  ManagedCloudUpdateConversationResponseSchema.parse(
    await api.put<unknown>(managedCloudConversationPath(id), { archived: true }),
  );
}

export async function deleteArchivedConversation(id: string): Promise<void> {
  ManagedCloudDeleteConversationResponseSchema.parse(
    await api.delete<unknown>(managedCloudConversationPath(id)),
  );
}

/** Returns how many chats the server actually deleted. */
export async function deleteAllArchivedConversations(): Promise<number> {
  return postBulkConversationAction('delete_archived');
}

/**
 * Archive every non-archived cloud chat. Local Mode conversations never reach
 * the server, so they are untouched by this. Returns how many chats the server
 * actually archived.
 */
export async function archiveAllConversations(): Promise<number> {
  return postBulkConversationAction('archive_all');
}

/**
 * Soft-delete every cloud chat, archived or not. Returns how many chats the
 * server actually deleted. Local Mode conversations are untouched — those are
 * wiped from Settings → Storage.
 */
export async function deleteAllConversations(): Promise<number> {
  return postBulkConversationAction('delete_all');
}
