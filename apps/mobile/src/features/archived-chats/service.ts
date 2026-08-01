/**
 * Archived chats service.
 *
 * Reuses the same Managed Cloud endpoints and wire schemas the web Settings →
 * Archived chats section already talks to, rather than defining a second
 * mobile-only contract:
 *   - GET    /api/chat/conversations?archived=only   list
 *   - PUT    /api/chat/conversations/:id             restore ({ archived: false })
 *   - DELETE /api/chat/conversations/:id             delete one
 *   - POST   /api/chat/conversations/bulk            delete every archived chat
 *
 * All four are owner-scoped server-side; nothing here performs access control.
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

const BulkConversationResponseSchema = z.object({
  success: z.literal(true),
  action: z.enum(['archive_all', 'delete_all', 'delete_archived']),
  affectedCount: z.number().int().nonnegative(),
});

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
  const data = BulkConversationResponseSchema.parse(
    await api.post<unknown>('/api/chat/conversations/bulk', { action: 'delete_archived' }),
  );
  return data.affectedCount;
}
