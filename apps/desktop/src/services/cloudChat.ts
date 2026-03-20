import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// Interfaces
// ============================================================================

export interface CloudConversation {
  id: string;
  user_id: string;
  title: string | null;
  model: string | null;
  provider: string | null;
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

export interface TransferResult {
  conversation_id: string;
  messages_transferred: number;
  direction: 'local_to_cloud' | 'cloud_to_local';
}

// ============================================================================
// Conversations
// ============================================================================

export async function getCloudConversations(): Promise<CloudConversation[]> {
  return invoke<CloudConversation[]>('cloud_get_conversations');
}

export async function createCloudConversation(
  title?: string,
  model?: string,
  provider?: string,
): Promise<CloudConversation> {
  return invoke<CloudConversation>('cloud_create_conversation', {
    request: { title, model, provider, source: 'desktop' },
  });
}

export async function deleteCloudConversation(conversationId: string): Promise<void> {
  return invoke<void>('cloud_delete_conversation', { conversationId });
}

export async function updateCloudConversationTitle(
  conversationId: string,
  title: string,
): Promise<void> {
  return invoke<void>('cloud_update_conversation_title', { conversationId, title });
}

// ============================================================================
// Messages
// ============================================================================

export async function getCloudMessages(conversationId: string): Promise<CloudMessage[]> {
  return invoke<CloudMessage[]>('cloud_get_messages', { conversationId });
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
  return invoke<CloudMessage>('cloud_create_message', { request: params });
}

// ============================================================================
// Transfer
// ============================================================================

export async function transferLocalToCloud(
  conversationId: number,
  userId: string,
  deleteSource: boolean,
): Promise<TransferResult> {
  return invoke<TransferResult>('cloud_transfer_local_to_cloud', {
    conversationId,
    userId,
    deleteSource,
  });
}

export async function transferCloudToLocal(
  cloudConversationId: string,
  userId: string,
  deleteSource: boolean,
): Promise<TransferResult> {
  return invoke<TransferResult>('cloud_transfer_cloud_to_local', {
    cloudConversationId,
    userId,
    deleteSource,
  });
}
