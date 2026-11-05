import { z } from 'zod';
import {
  CONVERSATION_SHARES_PATH,
  ConversationShareListResponseSchema,
  conversationSharePath,
  type ConversationShareSummary,
  MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE,
  ManagedCloudConversationListResponseSchema,
  ManagedCloudDeleteConversationResponseSchema,
  ManagedCloudUpdateConversationResponseSchema,
  managedCloudConversationPath,
  normalizeManagedCloudConversation,
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
} from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import type { RequestAuthority } from '@/lib/identity/request-authority';

const ARCHIVED_PAGE_SIZE = MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE;

const BulkConversationResponseSchema = z.object({
  success: z.literal(true),
  action: z.enum(['archive_all', 'delete_all', 'delete_archived']),
  affectedCount: z.number().int().nonnegative(),
});

export type BulkConversationAction = z.infer<typeof BulkConversationResponseSchema>['action'];
export type SharedLinkSummary = ConversationShareSummary;

export interface ConversationDataAuthority {
  request: RequestAuthority;
  organizationId: string | null;
}

function scopedHeaders(scope?: ConversationDataAuthority): Record<string, string> {
  const headers: Record<string, string> = {};
  if (scope) headers[MANAGED_CLOUD_ORGANIZATION_HEADER] =
    scope.organizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE;
  return headers;
}

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
  scope?: ConversationDataAuthority,
): Promise<ArchivedConversationPage> {
  scope?.request.assertCurrent();
  const response = await (scope?.request.fetch ?? fetch)(
    `/api/chat/conversations?archived=only&limit=${ARCHIVED_PAGE_SIZE}&offset=${Math.max(0, offset)}`,
    { credentials: 'include', signal, headers: scopedHeaders(scope), cache: 'no-store' },
  );
  if (!response.ok) {
    throw await responseError(response, 'Failed to load archived chats');
  }

  const data = ManagedCloudConversationListResponseSchema.parse(await response.json());
  scope?.request.assertCurrent();
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
  scope?: ConversationDataAuthority,
): Promise<ArchivedConversationPage> {
  scope?.request.assertCurrent();
  const response = await (scope?.request.fetch ?? fetch)(
    `/api/chat/conversations?deleted=only&limit=${ARCHIVED_PAGE_SIZE}&offset=${Math.max(0, offset)}`,
    { credentials: 'include', signal, headers: scopedHeaders(scope), cache: 'no-store' },
  );
  if (!response.ok) {
    throw await responseError(response, 'Failed to load deleted chats');
  }

  const data = ManagedCloudConversationListResponseSchema.parse(await response.json());
  scope?.request.assertCurrent();
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

export async function restoreDeletedConversation(id: string, scope?: ConversationDataAuthority) {
  scope?.request.assertCurrent();
  const headers = await addCsrfHeaders({ ...scopedHeaders(scope), 'Content-Type': 'application/json' });
  scope?.request.assertCurrent();
  const response = await (scope?.request.fetch ?? fetch)(`${managedCloudConversationPath(id)}/restore`, {
    method: 'POST',
    credentials: 'include',
    headers,
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to restore deleted chat');
  }
  const receipt = ManagedCloudUpdateConversationResponseSchema.parse(await response.json()).conversation;
  scope?.request.assertCurrent();
  if (receipt.id !== id) throw new Error('Chat restore was not confirmed');
  return receipt;
}

export async function restoreArchivedConversation(id: string, scope?: ConversationDataAuthority) {
  scope?.request.assertCurrent();
  const headers = await addCsrfHeaders({ ...scopedHeaders(scope), 'Content-Type': 'application/json' });
  scope?.request.assertCurrent();
  const response = await (scope?.request.fetch ?? fetch)(managedCloudConversationPath(id), {
    method: 'PUT',
    credentials: 'include',
    headers,
    body: JSON.stringify({ archived: false }),
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to restore archived chat');
  }
  const receipt = ManagedCloudUpdateConversationResponseSchema.parse(await response.json()).conversation;
  scope?.request.assertCurrent();
  if (receipt.id !== id || receipt.archived) throw new Error('Chat restore was not confirmed');
  return receipt;
}

export async function deleteManagedConversation(id: string, scope?: ConversationDataAuthority): Promise<void> {
  scope?.request.assertCurrent();
  const headers = await addCsrfHeaders({ ...scopedHeaders(scope), 'Content-Type': 'application/json' });
  scope?.request.assertCurrent();
  const response = await (scope?.request.fetch ?? fetch)(managedCloudConversationPath(id), {
    method: 'DELETE',
    credentials: 'include',
    headers,
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to delete chat');
  }
  ManagedCloudDeleteConversationResponseSchema.parse(await response.json());
  scope?.request.assertCurrent();
}

const ConversationHistoryStatsSchema = z.object({
  historyStats: z.object({
    conversationCount: z.number().int().nonnegative(),
    activeConversationCount: z.number().int().nonnegative(),
    messageCount: z.number().int().nonnegative(),
  }),
});

export interface ConversationHistoryStats {
  conversationCount: number;
  activeConversationCount: number;
  messageCount: number;
}

export async function fetchConversationHistoryStats(
  signal?: AbortSignal,
  scope?: ConversationDataAuthority,
): Promise<ConversationHistoryStats> {
  scope?.request.assertCurrent();
  const response = await (scope?.request.fetch ?? fetch)('/api/chat/conversations?includeHistoryStats=1&statsOnly=1', {
    credentials: 'include',
    signal,
    headers: scopedHeaders(scope),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to load chat history size');
  }
  const data = ConversationHistoryStatsSchema.parse(await response.json());
  scope?.request.assertCurrent();
  return data.historyStats;
}

export async function applyBulkConversationAction(
  action: BulkConversationAction,
  scope?: ConversationDataAuthority,
): Promise<number> {
  scope?.request.assertCurrent();
  const headers = scopedHeaders(scope);
  headers['Content-Type'] = 'application/json';
  const csrfHeaders = await addCsrfHeaders(headers);
  scope?.request.assertCurrent();
  const response = await (scope?.request.fetch ?? fetch)('/api/chat/conversations/bulk', {
    method: 'POST',
    credentials: 'include',
    headers: csrfHeaders,
    body: JSON.stringify({ action }),
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to update chats');
  }
  const receipt = BulkConversationResponseSchema.parse(await response.json());
  scope?.request.assertCurrent();
  if (receipt.action !== action) throw new Error('Chat update was not confirmed');
  return receipt.affectedCount;
}

export async function listSharedLinks(signal?: AbortSignal): Promise<SharedLinkSummary[]> {
  const response = await fetch(CONVERSATION_SHARES_PATH, { credentials: 'include', signal });
  if (!response.ok) {
    throw await responseError(response, 'Failed to load shared links');
  }
  return ConversationShareListResponseSchema.parse(await response.json()).shares;
}

export async function revokeSharedLink(token: string): Promise<void> {
  const response = await fetch(conversationSharePath(token), {
    method: 'DELETE',
    credentials: 'include',
    headers: await addCsrfHeaders(),
  });
  if (!response.ok) {
    throw await responseError(response, 'Failed to revoke shared link');
  }
}
