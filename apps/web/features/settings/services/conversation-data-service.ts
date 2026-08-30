import { z } from 'zod';
import {
  MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE,
  ManagedCloudConversationListResponseSchema,
  ManagedCloudDeleteConversationResponseSchema,
  ManagedCloudUpdateConversationResponseSchema,
  managedCloudConversationPath,
  normalizeManagedCloudConversation,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';

const ARCHIVED_PAGE_SIZE = MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE;

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
    `/api/chat/conversations?archived=only&limit=${ARCHIVED_PAGE_SIZE}&offset=${Math.max(0, offset)}`,
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

export async function listDeletedConversations(
  offset = 0,
  signal?: AbortSignal,
): Promise<ArchivedConversationPage> {
  const response = await fetch(
    `/api/chat/conversations?deleted=only&limit=${ARCHIVED_PAGE_SIZE}&offset=${Math.max(0, offset)}`,
    { credentials: 'include', signal },
  );
  if (!response.ok) {
    throw await responseError(response, 'Failed to load deleted chats');
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

export async function restoreDeletedConversation(id: string) {
  const response = await fetch(`${managedCloudConversationPath(id)}/restore`, {
    method: 'POST',
    credentials: 'include',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to restore deleted chat');
  }
  return ManagedCloudUpdateConversationResponseSchema.parse(await response.json()).conversation;
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

const ConversationHistoryStatsSchema = z.object({
  historyStats: z.object({
    conversationCount: z.number().int().nonnegative(),
    messageCount: z.number().int().nonnegative(),
  }),
});

export interface ConversationHistoryStats {
  conversationCount: number;
  messageCount: number;
}

export async function fetchConversationHistoryStats(
  signal?: AbortSignal,
): Promise<ConversationHistoryStats> {
  const response = await fetch('/api/chat/conversations?includeHistoryStats=1&statsOnly=1', {
    credentials: 'include',
    signal,
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to load chat history size');
  }
  return ConversationHistoryStatsSchema.parse(await response.json()).historyStats;
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

const PublishedArtifactSchema = z.object({
  token: z.string().min(1),
  artifactId: z.string(),
  title: z.string(),
  kind: z.enum(['html', 'react', 'svg', 'mermaid', 'markdown', 'text', 'code']),
  language: z.string().nullable(),
  contentChars: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  shareUrl: z.string().url(),
  sandboxed: z.boolean(),
});

const PublishedArtifactListResponseSchema = z.object({
  artifacts: z.array(PublishedArtifactSchema),
});

export type PublishedArtifactSummary = z.infer<typeof PublishedArtifactSchema>;

export async function listPublishedArtifacts(
  signal?: AbortSignal,
): Promise<PublishedArtifactSummary[]> {
  const response = await fetch('/api/artifacts/publish', { credentials: 'include', signal });
  if (!response.ok) {
    throw await responseError(response, 'Failed to load published artifacts');
  }
  return PublishedArtifactListResponseSchema.parse(await response.json()).artifacts;
}

export async function unpublishArtifact(token: string): Promise<void> {
  const response = await fetch(`/api/artifacts/publish/${encodeURIComponent(token)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: await addCsrfHeaders(),
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to unpublish artifact');
  }
}
