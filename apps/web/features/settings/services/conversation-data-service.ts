import { z } from 'zod';
import {
  ManagedCloudConversationListResponseSchema,
  ManagedCloudDeleteConversationResponseSchema,
  ManagedCloudUpdateConversationResponseSchema,
  managedCloudConversationPath,
  normalizeManagedCloudConversation,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';

const BulkConversationResponseSchema = z.object({
  success: z.literal(true),
  action: z.enum(['archive_all', 'delete_all', 'delete_archived']),
  affectedCount: z.number().int().nonnegative(),
});

const SharedLinkSchema = z.object({
  token: z.string().min(1),
  title: z.string(),
  shareUrl: z.string().url(),
  modelId: z.string().nullable(),
  provider: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  expiresAt: z.string(),
  expired: z.boolean(),
});

const SharedLinkListResponseSchema = z.object({
  shares: z.array(SharedLinkSchema),
});

export type BulkConversationAction = z.infer<typeof BulkConversationResponseSchema>['action'];
export type SharedLinkSummary = z.infer<typeof SharedLinkSchema>;

export interface ArchivedConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ArchivedConversationPage {
  conversations: ArchivedConversationSummary[];
  hasMore: boolean;
  nextOffset: number;
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: { message?: string } | string;
  };
  const message =
    typeof body.error === 'string'
      ? body.error
      : typeof body.error?.message === 'string'
        ? body.error.message
        : fallback;
  return new Error(message);
}

export async function listArchivedConversations(
  offset = 0,
  signal?: AbortSignal,
): Promise<ArchivedConversationPage> {
  const response = await fetch(
    `/api/chat/conversations?archived=only&limit=50&offset=${Math.max(0, offset)}`,
    { credentials: 'include', signal },
  );
  if (!response.ok) {
    throw await responseError(response, 'Failed to load archived chats');
  }

  const data = ManagedCloudConversationListResponseSchema.parse(await response.json());
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

export async function restoreArchivedConversation(id: string): Promise<void> {
  const response = await fetch(managedCloudConversationPath(id), {
    method: 'PUT',
    credentials: 'include',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ archived: false }),
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to restore archived chat');
  }
  ManagedCloudUpdateConversationResponseSchema.parse(await response.json());
}

export async function deleteManagedConversation(id: string): Promise<void> {
  const response = await fetch(managedCloudConversationPath(id), {
    method: 'DELETE',
    credentials: 'include',
    headers: await addCsrfHeaders(),
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to delete chat');
  }
  ManagedCloudDeleteConversationResponseSchema.parse(await response.json());
}

export async function applyBulkConversationAction(action: BulkConversationAction): Promise<number> {
  const response = await fetch('/api/chat/conversations/bulk', {
    method: 'POST',
    credentials: 'include',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ action }),
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to update chats');
  }
  return BulkConversationResponseSchema.parse(await response.json()).affectedCount;
}

export async function listSharedLinks(signal?: AbortSignal): Promise<SharedLinkSummary[]> {
  const response = await fetch('/api/share', { credentials: 'include', signal });
  if (!response.ok) {
    throw await responseError(response, 'Failed to load shared links');
  }
  return SharedLinkListResponseSchema.parse(await response.json()).shares;
}

export async function revokeSharedLink(token: string): Promise<void> {
  const response = await fetch(`/api/share/${encodeURIComponent(token)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: await addCsrfHeaders(),
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to revoke shared link');
  }
}
