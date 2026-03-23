/**
 * Chat API — typed wrappers for all chat_*, conversation_*, and search_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface Conversation {
  id: number;
  title: string;
  userId: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  isPinned: boolean;
}

export interface Message {
  id: number;
  conversationId: number;
  userId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tokens?: number;
  cost?: number;
  createdAt: string;
}

export interface CreateMessageRequest {
  conversationId: number;
  userId: string;
  role: string;
  content: string;
  tokens?: number;
  cost?: number;
}

export interface UpdateConversationRequest {
  title: string;
  userId: string;
}

export interface ConversationStats {
  messageCount: number;
  totalTokens: number;
  totalCost: number;
}

export interface ChatAttachment {
  id: string;
  type: string;
  name: string;
  mimeType?: string;
  content?: string;
  path?: string;
}

export interface OutputConfig {
  [key: string]: unknown;
}

export interface ChatSendMessageRequest {
  conversationId?: number;
  userId: string;
  content: string;
  provider?: string;
  model?: string;
  providerOverride?: string;
  modelOverride?: string;
  stream?: boolean;
  enableTools?: boolean;
  thinkingMode?: boolean;
  thinkingBudget?: number;
  temperature?: number;
  maxOutputTokens?: number;
  outputConfig?: OutputConfig;
  attachments?: ChatAttachment[];
  customInstructions?: string;
  projectFolder?: string;
  incognito?: boolean;
  autoInjectSkills?: boolean;
}

export interface ChatSendMessageResponse {
  [key: string]: unknown;
}

export interface ForkResult {
  conversationId: number;
  branchId: string;
}

export interface ConversationBranch {
  id: string;
  name: string;
  messageId: number;
  createdAt: string;
}

export interface CostOverviewResponse {
  [key: string]: unknown;
}

export interface CostAnalyticsResponse {
  [key: string]: unknown;
}

export interface ChatSearchResult {
  id: number;
  conversationId: number;
  content: string;
  role: string;
  score: number;
}

export interface ConversationSearchResult {
  id: number;
  title: string;
  matchCount: number;
  lastMatch: string;
}

export interface ConversationSummary {
  id: number;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface ShareResult {
  url: string;
  expiresAt?: string;
}

export interface ContextCompactionResponse {
  [key: string]: unknown;
}

export interface PendingUserMessage {
  id: string;
  content: string;
  timestamp: string;
  conversationId?: number;
}

export interface AddPendingMessageRequest {
  content: string;
  conversationId?: number;
}

export interface PopPendingMessageRequest {
  conversationId?: number;
  pendingMessageId?: string;
}

// ---- Conversation CRUD ----

export async function chatCreateConversation(title: string, userId: string): Promise<Conversation> {
  return command<Conversation>('chat_create_conversation', { title, userId });
}

export async function chatGetConversations(userId: string): Promise<Conversation[]> {
  return command<Conversation[]>('chat_get_conversations', { userId });
}

export async function chatGetConversation(id: number, userId: string): Promise<Conversation> {
  return command<Conversation>('chat_get_conversation', { id, userId });
}

export async function chatUpdateConversation(
  id: number,
  request: UpdateConversationRequest,
): Promise<void> {
  return command<void>('chat_update_conversation_title', {
    conversationId: id,
    title: request.title,
    userId: request.user_id,
  });
}

export async function chatDeleteConversation(id: number, userId: string): Promise<void> {
  return command<void>('chat_delete_conversation', { id, userId });
}

// ---- Message CRUD ----

export async function chatCreateMessage(request: CreateMessageRequest): Promise<Message> {
  return command<Message>('chat_create_message', { request });
}

export async function chatGetMessages(conversationId: number, userId: string): Promise<Message[]> {
  return command<Message[]>('chat_get_messages', { conversationId, userId });
}

export async function chatUpdateMessage(id: number, content: string): Promise<Message> {
  return command<Message>('chat_update_message', { id, content });
}

export async function chatDeleteMessage(id: number): Promise<void> {
  return command<void>('chat_delete_message', { id });
}

export async function chatGetConversationStats(conversationId: number): Promise<ConversationStats> {
  return command<ConversationStats>('chat_get_conversation_stats', { conversationId });
}

export async function syncConversationsToCloud(userId: string): Promise<unknown> {
  return command<unknown>('sync_conversations_to_cloud', { userId });
}

// ---- Send Message (Streaming) ----

export async function chatSendMessage(
  request: ChatSendMessageRequest,
): Promise<ChatSendMessageResponse> {
  return command<ChatSendMessageResponse>('chat_send_message', { request });
}

// ---- Generation Control ----

export async function chatStopGeneration(conversationId?: number): Promise<void> {
  return command<void>('chat_stop_generation', { conversationId });
}

export async function cancelToolExecution(toolId: string): Promise<boolean> {
  return command<boolean>('cancel_tool_execution', { toolId });
}

export async function chatHandleStop(): Promise<boolean> {
  return command<boolean>('chat_handle_stop');
}

// ---- Branching ----

export async function conversationFork(
  conversationId: number,
  messageId: number,
  branchName: string,
  userId?: string,
): Promise<ForkResult> {
  return command<ForkResult>('conversation_fork', {
    conversationId,
    messageId,
    branchName,
    userId,
  });
}

export async function conversationListBranches(
  conversationId: number,
  userId?: string,
): Promise<ConversationBranch[]> {
  return command<ConversationBranch[]>('conversation_list_branches', { conversationId, userId });
}

export async function conversationSwitchBranch(
  conversationId: number,
  branchId: string,
  userId?: string,
): Promise<Message[]> {
  return command<Message[]>('conversation_switch_branch', { conversationId, branchId, userId });
}

export async function conversationDeleteBranch(
  conversationId: number,
  branchId: string,
  userId?: string,
): Promise<void> {
  return command<void>('conversation_delete_branch', { conversationId, branchId, userId });
}

// ---- Cost Analytics ----

export async function chatGetCostOverview(userId: string): Promise<CostOverviewResponse> {
  return command<CostOverviewResponse>('chat_get_cost_overview', { userId });
}

export async function chatGetCostAnalytics(
  userId: string,
  days?: number,
  provider?: string,
  model?: string,
): Promise<CostAnalyticsResponse> {
  return command<CostAnalyticsResponse>('chat_get_cost_analytics', {
    userId,
    days,
    provider,
    model,
  });
}

export async function chatSetMonthlyBudget(amount?: number): Promise<void> {
  return command<void>('chat_set_monthly_budget', { amount });
}

// ---- Search ----

export async function searchChatHistory(
  query: string,
  limit?: number,
): Promise<ChatSearchResult[]> {
  return command<ChatSearchResult[]>('search_chat_history', { query, limit });
}

export async function searchChatHistorySemantic(
  query: string,
  limit?: number,
): Promise<ChatSearchResult[]> {
  return command<ChatSearchResult[]>('search_chat_history_semantic', { query, limit });
}

export async function searchPastConversations(
  query: string,
  limit?: number,
  conversationId?: number,
): Promise<ConversationSearchResult[]> {
  return command<ConversationSearchResult[]>('search_past_conversations', {
    query,
    limit,
    conversationId,
  });
}

export async function getRecentConversations(limit?: number): Promise<ConversationSummary[]> {
  return command<ConversationSummary[]>('get_recent_conversations', { limit });
}

// ---- Export / Share ----

export async function conversationExport(conversationId: string, format: string): Promise<string> {
  return command<string>('conversation_export', { conversationId, format });
}

export async function conversationExportPdf(
  conversationId: string,
  outputPath: string,
): Promise<string> {
  return command<string>('conversation_export_pdf', { conversationId, outputPath });
}

export async function conversationShare(conversationId: string): Promise<ShareResult> {
  return command<ShareResult>('conversation_share', { conversationId });
}

// ---- Context Compaction ----

export async function chatCompactContext(
  conversationId: number,
  userId: string,
  focus?: string,
): Promise<ContextCompactionResponse> {
  return command<ContextCompactionResponse>('chat_compact_context', {
    conversationId,
    focus,
    userId,
  });
}

// ---- Pending Messages ----

export async function chatAddPendingMessage(
  request: AddPendingMessageRequest,
): Promise<PendingUserMessage> {
  return command<PendingUserMessage>('chat_add_pending_message', { request });
}

export async function chatGetPendingMessages(): Promise<PendingUserMessage[]> {
  return command<PendingUserMessage[]>('chat_get_pending_messages');
}

export async function chatClearPendingMessages(): Promise<void> {
  return command<void>('chat_clear_pending_messages');
}

export async function chatPopPendingMessage(
  request: PopPendingMessageRequest,
): Promise<PendingUserMessage | null> {
  return command<PendingUserMessage | null>('chat_pop_pending_message', { request });
}

// ---- Chat Memory Integration ----

export async function chatLoadProjectMemories(): Promise<unknown> {
  return command<unknown>('chat_load_project_memories');
}

export async function chatDetectAndSaveDecision(message: string): Promise<unknown> {
  return command<unknown>('chat_detect_and_save_decision', { message });
}

export async function chatSaveDecision(message: string): Promise<unknown> {
  return command<unknown>('chat_save_decision', { message });
}

export async function chatConfigureMemoryInjection(
  enabled: boolean,
  maxMemories: number,
  minImportance: number,
): Promise<void> {
  return command<void>('chat_configure_memory_injection', { enabled, maxMemories, minImportance });
}

export async function chatGetMemoryDashboard(): Promise<unknown> {
  return command<unknown>('chat_get_memory_dashboard');
}

export async function chatSuggestMemoriesForReview(): Promise<unknown> {
  return command<unknown>('chat_suggest_memories_for_review');
}

export async function chatPrefetchSessionMemories(): Promise<string> {
  return command<string>('chat_prefetch_session_memories');
}

export async function chatLogMilestone(description: string, metadata?: unknown): Promise<number> {
  return command<number>('chat_log_milestone', { description, metadata });
}

export async function chatLogAction(action: string, metadata?: unknown): Promise<number> {
  return command<number>('chat_log_action', { action, metadata });
}

export async function chatRecallMemory(
  category: string,
  topic: string,
  boostImportance?: boolean,
): Promise<unknown> {
  return command<unknown>('chat_recall_memory', { category, topic, boostImportance });
}

export async function chatSearchMemories(query: string, limit?: number): Promise<unknown[]> {
  return command<unknown[]>('chat_search_memories', { query, limit });
}
