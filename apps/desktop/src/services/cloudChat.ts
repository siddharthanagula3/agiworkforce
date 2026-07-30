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
const pendingConversationCreates = new Map<string, Promise<CloudConversation>>();
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
  pendingConversationCreates.clear();
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
): Promise<void> {
  const pending = pendingConversationCreates.get(
    coordinatorKey(conversationId, boundary.accountId),
  );
  if (pending) await pending;
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
): Promise<CloudConversation> {
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
      is_temporary: false,
      created_at: now,
      updated_at: now,
      last_message_at: null,
      message_count: 0,
      metadata: null,
      source: 'desktop',
    };
  }

  const existing = pendingConversationCreates.get(key);
  if (existing) return existing;

  const pending = getDesktopCloudChatPersistenceClient()
    .createConversation({
      id: conversationId,
      title,
      ...(model ? { model } : {}),
      ...(projectId !== undefined ? { projectId } : {}),
    })
    .then((conversation) => {
      assertCloudConversationBoundary(boundary);
      readyConversationIds.add(coordinatorKey(conversation.id, boundary.accountId));
      return projectConversation(conversation, 0);
    })
    .finally(() => {
      if (pendingConversationCreates.get(key) === pending) {
        pendingConversationCreates.delete(key);
      }
    });
  pendingConversationCreates.set(key, pending);
  return pending;
}

export async function getCloudConversations(): Promise<CloudConversation[]> {
  const boundary = captureCloudConversationBoundary();
  const client = getDesktopCloudChatPersistenceClient();
  const result: CloudConversation[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const page = await client.listConversations({ limit: 100, offset });
    assertCloudConversationBoundary(boundary);
    for (const conversation of page.conversations) {
      readyConversationIds.add(coordinatorKey(conversation.id, boundary.accountId));
      result.push(projectConversation(conversation));
    }
    hasMore = page.hasMore;
    if (!hasMore) break;
    if (page.conversations.length === 0) {
      throw new Error('AGI Cloud returned an invalid empty conversation page.');
    }
    offset = page.nextOffset;
  }
  return result;
}

export async function createCloudConversation(
  title?: string,
  model?: string,
  _provider?: string,
  conversationId = crypto.randomUUID(),
): Promise<CloudConversation> {
  return ensureCloudConversation(conversationId, title ?? 'New chat', model);
}

export async function deleteCloudConversation(conversationId: string): Promise<void> {
  const boundary = captureCloudConversationBoundary();
  await waitForCloudConversationReady(conversationId, boundary);
  await getDesktopCloudChatPersistenceClient().deleteConversation(conversationId);
  assertCloudConversationBoundary(boundary);
  const key = coordinatorKey(conversationId, boundary.accountId);
  readyConversationIds.delete(key);
  pendingConversationCreates.delete(key);
}

export async function updateCloudConversation(
  conversationId: string,
  updates: ManagedCloudUpdateConversationRequest,
): Promise<CloudConversation> {
  const boundary = captureCloudConversationBoundary();
  await waitForCloudConversationReady(conversationId, boundary);
  if (!readyConversationIds.has(coordinatorKey(conversationId, boundary.accountId))) {
    await ensureCloudConversation(
      conversationId,
      typeof updates.title === 'string' ? updates.title : 'New chat',
      typeof updates.model === 'string' ? updates.model : undefined,
      updates.projectId,
    );
  }
  const conversation = await getDesktopCloudChatPersistenceClient().updateConversation(
    conversationId,
    updates,
  );
  assertCloudConversationBoundary(boundary);
  readyConversationIds.add(coordinatorKey(conversation.id, boundary.accountId));
  return projectConversation(conversation);
}

export async function updateCloudConversationTitle(
  conversationId: string,
  title: string,
): Promise<void> {
  await updateCloudConversation(conversationId, { title });
}

export async function getCloudMessages(conversationId: string): Promise<CloudMessage[]> {
  const boundary = captureCloudConversationBoundary();
  await waitForCloudConversationReady(conversationId, boundary);
  const client = getDesktopCloudChatPersistenceClient();
  const messages: CloudMessage[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const page = await client.getConversation(conversationId, { limit: 100, offset });
    assertCloudConversationBoundary(boundary);
    readyConversationIds.add(coordinatorKey(page.conversation.id, boundary.accountId));
    messages.push(...page.messages.map(projectMessage));
    hasMore = page.hasMore;
    if (!hasMore) break;
    if (page.messages.length === 0) {
      throw new Error(`AGI Cloud conversation ${conversationId} returned an invalid empty page.`);
    }
    offset += page.messages.length;
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

export async function createCloudMessage(params: CreateCloudMessageParams): Promise<CloudMessage> {
  const boundary = captureCloudConversationBoundary();
  const role =
    params.role === 'assistant' || params.role === 'system' ? params.role : ('user' as const);
  const id = crypto.randomUUID();
  await getDesktopCloudChatPersistenceClient().saveMessage(params.conversationId, {
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
  });
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
