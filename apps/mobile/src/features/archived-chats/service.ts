import { z } from 'zod';
import {
  MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE,
  ManagedCloudConversationListResponseSchema,
  ManagedCloudDeleteConversationResponseSchema,
  ManagedCloudUpdateConversationResponseSchema,
  managedCloudConversationPath,
  normalizeManagedCloudConversation,
} from '@agiworkforce/cloud-contracts';

import { api } from '@/services/api';
import {
  assertCloudAccountEpochCurrent,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';

const PAGE_SIZE = MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE;

const BULK_CONVERSATION_ACTIONS = ['archive_all', 'delete_all', 'delete_archived'] as const;

type BulkConversationAction = (typeof BULK_CONVERSATION_ACTIONS)[number];

const BulkConversationResponseSchema = z.object({
  success: z.literal(true),
  action: z.enum(BULK_CONVERSATION_ACTIONS),
  affectedCount: z.number().int().nonnegative(),
});

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

async function setConversationArchived(
  id: string,
  archived: boolean,
  account: CloudAccountEpoch,
): Promise<void> {
  assertCloudAccountEpochCurrent(account);
  const response = await api.put<unknown>(
    managedCloudConversationPath(id),
    { archived },
    { accountEpoch: account },
  );
  assertCloudAccountEpochCurrent(account);
  ManagedCloudUpdateConversationResponseSchema.parse(response);
}

export async function restoreArchivedConversation(
  id: string,
  account: CloudAccountEpoch,
): Promise<void> {
  return setConversationArchived(id, false, account);
}

export async function archiveConversation(id: string, account: CloudAccountEpoch): Promise<void> {
  return setConversationArchived(id, true, account);
}

export async function deleteArchivedConversation(id: string): Promise<void> {
  ManagedCloudDeleteConversationResponseSchema.parse(
    await api.delete<unknown>(managedCloudConversationPath(id)),
  );
}

export async function deleteAllArchivedConversations(): Promise<number> {
  return postBulkConversationAction('delete_archived');
}

export async function archiveAllConversations(): Promise<number> {
  return postBulkConversationAction('archive_all');
}

export async function deleteAllConversations(): Promise<number> {
  return postBulkConversationAction('delete_all');
}
