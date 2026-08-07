import type {
  ManagedCloudConversation,
  ManagedCloudMessage,
  ManagedCloudUpdateConversationRequest,
} from '@agiworkforce/cloud-contracts';
import { getDesktopCloudChatPersistenceClient } from '../lib/cloudChatPersistence';
import {
  assertManagedCloudBoundary,
  captureManagedCloudBoundary,
  type ManagedCloudBoundary,
} from './managedCloudBoundary';
import {
  MANAGED_CLOUD_PAGE_SIZE,
  createManagedCloudPaginationGuard,
} from './managedCloudPagination';

/**
 * Compatibility projection consumed by Desktop's mature host chat store.
 *
 * Managed Cloud persistence itself is owned by the shared cloud-contracts
 * client. Rust `cloud_*` commands are intentionally fail-closed and must never
 * sit on the Desktop Cloud path.
 */
export interface CloudConversation {
  id: string;
  user_id: string;
  title: string | null;
  model: string | null;
  provider: string | null;
  project_id: string | null;
  pinned: boolean;
  starred: boolean;
  archived: boolean;
  is_temporary: boolean;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  message_count: number | null;
  metadata: Record<string, unknown> | null;
  source: string | null;
}

export interface CloudMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  content: string;
  model: string | null;
  provider: string | null;
  token_count: number | null;
  cost: number | null;
  tool_calls: unknown | null;
  tool_results: unknown | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const readyConversationIds = new Set<string>();

interface PendingConversationCreate {
  promise: Promise<CloudConversation>;
  controller: AbortController;
  activeWaiters: number;
}

const pendingConversationCreates = new Map<string, PendingConversationCreate>();
let coordinatorGeneration = 0;

export interface CloudConversationBoundary extends ManagedCloudBoundary {
  generation: number;
}

export function captureCloudConversationBoundary(): CloudConversationBoundary {
  const boundary = captureManagedCloudBoundary('Managed Cloud conversation');
  return {
    ...boundary,
    generation: coordinatorGeneration,
  };
}

export function assertCloudConversationBoundary(boundary: CloudConversationBoundary): void {
  if (boundary.generation !== coordinatorGeneration) {
    throw new Error('The Managed Cloud account changed while this request was in progress.');
  }
  assertManagedCloudBoundary(boundary);
}

function coordinatorKey(
  conversationId: string,
  accountId = captureCloudConversationBoundary().accountId,
): string {
  return `${accountId}:${conversationId}`;
}

export function resetCloudConversationCoordinator(): void {
  coordinatorGeneration += 1;
  readyConversationIds.clear();
  for (const pending of pendingConversationCreates.values()) {
    pending.controller.abort();
  }
  pendingConversationCreates.clear();
}

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error('Managed Cloud conversation request was stopped.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

/**
 * Give every caller an independently cancellable view of a shared idempotent
 * create. The transport is cancelled only after all current waiters stop, so
 * stopping one overlapping turn cannot break another turn joining the same
 * optimistic conversation create.
 */
function joinPendingConversationCreate(
  pending: PendingConversationCreate,
  signal?: AbortSignal,
): Promise<CloudConversation> {
  throwIfAborted(signal);
  pending.activeWaiters += 1;

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (cancelled: boolean) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      pending.activeWaiters -= 1;
      if (cancelled && pending.activeWaiters === 0) {
        pending.controller.abort();
      }
    };
    const onAbort = () => {
      finish(true);
      reject(abortError(signal!));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    pending.promise.then(
      (conversation) => {
        if (settled) return;
        finish(false);
        resolve(conversation);
      },
      (error: unknown) => {
        if (settled) return;
        finish(false);
        reject(error);
      },
    );
  });
}

function projectConversation(
  conversation: ManagedCloudConversation,
  messageCount: number | null = null,
): CloudConversation {
  return {
    id: conversation.id,
    user_id: '',
    title: conversation.title,
    model: conversation.model ?? null,
    provider: null,
    project_id: conversation.projectId,
    pinned: conversation.pinned,
    starred: conversation.starred,
    archived: conversation.archived,
    is_temporary: conversation.isTemporary,
    created_at: conversation.createdAt,
    updated_at: conversation.updatedAt,
    last_message_at: conversation.updatedAt,
    message_count: messageCount,
    metadata: null,
    source: 'desktop',
  };
}

function projectMessage(message: ManagedCloudMessage): CloudMessage {
  return {
    id: message.id,
    conversation_id: message.conversationId,
    user_id: '',
    role: message.role,
    content: message.content,
    model: message.model ?? null,
    provider: message.provider ?? null,
    token_count: message.inputTokens + message.outputTokens,
    cost: null,
    tool_calls: message.metadata?.['toolCalls'] ?? null,
    tool_results: message.metadata?.['toolResults'] ?? null,
    metadata: message.metadata ?? null,
    created_at: message.createdAt,
  };
}

export function markCloudConversationReady(
  conversationId: string,
  boundary = captureCloudConversationBoundary(),
): void {
  assertCloudConversationBoundary(boundary);
  readyConversationIds.add(coordinatorKey(conversationId, boundary.accountId));
}

export async function waitForCloudConversationReady(
  conversationId: string,
  boundary = captureCloudConversationBoundary(),
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const pending = pendingConversationCreates.get(
    coordinatorKey(conversationId, boundary.accountId),
  );
  if (pending) await joinPendingConversationCreate(pending, signal);
  throwIfAborted(signal);
  assertCloudConversationBoundary(boundary);
}

/**
 * Create the exact client-owned UUID once and let concurrent first-message
 * sends join the same request. The Web route is idempotent for this UUID.
 */
export async function ensureCloudConversation(
  conversationId: string,
  title = 'New chat',
  model?: string,
  projectId?: string | null,
  signal?: AbortSignal,
  // Temporary chats are excluded from history and purged by the retention cron
  // (`/api/cron/purge-temporary-chats`). The field was declared on the wire
  // type and hardcoded `false` at both construction sites, so desktop could
  // never actually start one — the capability existed everywhere except the one
  // place that decides.
  isTemporary = false,
): Promise<CloudConversation> {
  throwIfAborted(signal);
  const boundary = captureCloudConversationBoundary();
  const key = coordinatorKey(conversationId, boundary.accountId);
  if (readyConversationIds.has(key)) {
    const now = new Date().toISOString();
    return {
      id: conversationId,
      user_id: '',
      title,
      model: model ?? null,
      provider: null,
      project_id: projectId ?? null,
      pinned: false,
      starred: false,
      archived: false,
      is_temporary: isTemporary,
      created_at: now,
      updated_at: now,
      last_message_at: null,
      message_count: 0,
      metadata: null,
      source: 'desktop',
    };
  }

  const existing = pendingConversationCreates.get(key);
  if (existing && !existing.controller.signal.aborted) {
    return joinPendingConversationCreate(existing, signal);
  }
  if (existing) {
    // The last prior waiter stopped, but the transport may not have observed
    // its abort and settled yet. Do not make a new turn join that doomed
    // operation; controller identity keeps its eventual cleanup from deleting
    // the replacement entry below.
    pendingConversationCreates.delete(key);
  }

  const controller = new AbortController();
  const promise = getDesktopCloudChatPersistenceClient()
    .createConversation(
      {
        id: conversationId,
        title,
        ...(model ? { model } : {}),
        ...(projectId !== undefined ? { projectId } : {}),
        ...(isTemporary ? { isTemporary: true } : {}),
      },
      { signal: controller.signal },
    )
    .then((conversation) => {
      assertCloudConversationBoundary(boundary);
      readyConversationIds.add(coordinatorKey(conversation.id, boundary.accountId));
      return projectConversation(conversation, 0);
    })
    .finally(() => {
      if (pendingConversationCreates.get(key)?.controller === controller) {
        pendingConversationCreates.delete(key);
      }
    });
  const pending = { controller, activeWaiters: 0, promise };
  pendingConversationCreates.set(key, pending);
  return joinPendingConversationCreate(pending, signal);
}

export async function getCloudConversations(signal?: AbortSignal): Promise<CloudConversation[]> {
  const boundary = captureCloudConversationBoundary();
  const client = getDesktopCloudChatPersistenceClient();
  const result: CloudConversation[] = [];
  const pagination = createManagedCloudPaginationGuard('conversations');
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const query = { limit: MANAGED_CLOUD_PAGE_SIZE, offset };
    const page = signal
      ? await client.listConversations(query, { signal })
      : await client.listConversations(query);
    assertCloudConversationBoundary(boundary);
    const nextOffset = pagination.acceptPage({
      items: page.conversations,
      hasMore: page.hasMore,
      currentOffset: offset,
      nextOffset: page.nextOffset,
    });
    for (const conversation of page.conversations) {
      readyConversationIds.add(coordinatorKey(conversation.id, boundary.accountId));
      result.push(projectConversation(conversation));
    }
    hasMore = page.hasMore;
    if (!hasMore) break;
    offset = nextOffset;
  }
  return result;
}

export async function createCloudConversation(
  title?: string,
  model?: string,
  _provider?: string,
  conversationId = crypto.randomUUID(),
  signal?: AbortSignal,
): Promise<CloudConversation> {
  return ensureCloudConversation(conversationId, title ?? 'New chat', model, undefined, signal);
}

export async function deleteCloudConversation(
  conversationId: string,
  signal?: AbortSignal,
): Promise<void> {
  const boundary = captureCloudConversationBoundary();
  await waitForCloudConversationReady(conversationId, boundary, signal);
  const client = getDesktopCloudChatPersistenceClient();
  if (signal) {
    await client.deleteConversation(conversationId, { signal });
  } else {
    await client.deleteConversation(conversationId);
  }
  assertCloudConversationBoundary(boundary);
  const key = coordinatorKey(conversationId, boundary.accountId);
  readyConversationIds.delete(key);
  pendingConversationCreates.delete(key);
}

export async function updateCloudConversation(
  conversationId: string,
  updates: ManagedCloudUpdateConversationRequest,
  signal?: AbortSignal,
): Promise<CloudConversation> {
  const boundary = captureCloudConversationBoundary();
  await waitForCloudConversationReady(conversationId, boundary, signal);
  if (!readyConversationIds.has(coordinatorKey(conversationId, boundary.accountId))) {
    await ensureCloudConversation(
      conversationId,
      typeof updates.title === 'string' ? updates.title : 'New chat',
      typeof updates.model === 'string' ? updates.model : undefined,
      updates.projectId,
      signal,
    );
  }
  const client = getDesktopCloudChatPersistenceClient();
  const conversation = signal
    ? await client.updateConversation(conversationId, updates, { signal })
    : await client.updateConversation(conversationId, updates);
  assertCloudConversationBoundary(boundary);
  readyConversationIds.add(coordinatorKey(conversation.id, boundary.accountId));
  return projectConversation(conversation);
}

export async function updateCloudConversationTitle(
  conversationId: string,
  title: string,
  signal?: AbortSignal,
): Promise<void> {
  await updateCloudConversation(conversationId, { title }, signal);
}

export async function getCloudMessages(
  conversationId: string,
  signal?: AbortSignal,
): Promise<CloudMessage[]> {
  const boundary = captureCloudConversationBoundary();
  await waitForCloudConversationReady(conversationId, boundary, signal);
  const client = getDesktopCloudChatPersistenceClient();
  const messages: CloudMessage[] = [];
  const pagination = createManagedCloudPaginationGuard('messages');
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const query = { limit: MANAGED_CLOUD_PAGE_SIZE, offset };
    const page = signal
      ? await client.getConversation(conversationId, query, { signal })
      : await client.getConversation(conversationId, query);
    assertCloudConversationBoundary(boundary);
    const nextOffset = pagination.acceptPage({
      items: page.messages,
      hasMore: page.hasMore,
      currentOffset: offset,
      reportedTotal: page.total,
    });
    readyConversationIds.add(coordinatorKey(page.conversation.id, boundary.accountId));
    messages.push(...page.messages.map(projectMessage));
    hasMore = page.hasMore;
    if (!hasMore) break;
    offset = nextOffset;
  }
  return messages;
}

export interface CreateCloudMessageParams {
  conversationId: string;
  role: string;
  content: string;
  model?: string;
  provider?: string;
  tokenCount?: number;
  cost?: number;
  toolCalls?: unknown;
  toolResults?: unknown;
}

export async function createCloudMessage(
  params: CreateCloudMessageParams,
  signal?: AbortSignal,
): Promise<CloudMessage> {
  const boundary = captureCloudConversationBoundary();
  const role: 'assistant' | 'system' | 'user' =
    params.role === 'assistant' || params.role === 'system' ? params.role : 'user';
  const id = crypto.randomUUID();
  const input = {
    id,
    role,
    content: params.content,
    ...(params.model ? { model: params.model } : {}),
    metadata: {
      ...(params.provider ? { provider: params.provider } : {}),
      ...(params.tokenCount !== undefined ? { tokenCount: params.tokenCount } : {}),
      ...(params.cost !== undefined ? { cost: params.cost } : {}),
      ...(params.toolCalls !== undefined ? { toolCalls: params.toolCalls } : {}),
      ...(params.toolResults !== undefined ? { toolResults: params.toolResults } : {}),
    },
  };
  const client = getDesktopCloudChatPersistenceClient();
  if (signal) {
    await client.saveMessage(params.conversationId, input, { signal });
  } else {
    await client.saveMessage(params.conversationId, input);
  }
  assertCloudConversationBoundary(boundary);
  const now = new Date().toISOString();
  return {
    id,
    conversation_id: params.conversationId,
    user_id: '',
    role,
    content: params.content,
    model: params.model ?? null,
    provider: params.provider ?? null,
    token_count: params.tokenCount ?? null,
    cost: params.cost ?? null,
    tool_calls: params.toolCalls ?? null,
    tool_results: params.toolResults ?? null,
    metadata: null,
    created_at: now,
  };
}
