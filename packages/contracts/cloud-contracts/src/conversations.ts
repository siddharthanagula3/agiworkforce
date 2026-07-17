import { z } from 'zod';

export const MANAGED_CLOUD_CHAT_BASE_PATH = '/api/chat/conversations';
export const MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH = 100_000;
export const MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE = 50;
export const MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE = 100;

export const ManagedCloudConversationWireSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable(),
  model: z.string().nullable(),
  project_id: z.string().nullable(),
  pinned: z.boolean(),
  is_temporary: z.boolean(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});
export type ManagedCloudConversationWire = z.infer<typeof ManagedCloudConversationWireSchema>;

export const ManagedCloudMessageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type ManagedCloudMessageRole = z.infer<typeof ManagedCloudMessageRoleSchema>;

export const ManagedCloudMessageWireSchema = z.object({
  id: z.string().min(1),
  role: ManagedCloudMessageRoleSchema,
  content: z.string(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  input_tokens: z.coerce.number(),
  output_tokens: z.coerce.number(),
  cost_cents: z.coerce.number(),
  created_at: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});
export type ManagedCloudMessageWire = z.infer<typeof ManagedCloudMessageWireSchema>;

export const ManagedCloudConversationListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ManagedCloudConversationListQuery = z.infer<
  typeof ManagedCloudConversationListQuerySchema
>;

export const ManagedCloudCreateConversationRequestSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(500).optional().default('New conversation'),
  model: z.string().min(1).optional().default('auto'),
  projectId: z.string().max(200).nullable().optional(),
  isTemporary: z.boolean().optional().default(false),
});
export type ManagedCloudCreateConversationRequest = z.input<
  typeof ManagedCloudCreateConversationRequestSchema
>;

export const ManagedCloudUpdateConversationRequestSchema = z.object({
  title: z.string().max(500).optional(),
  model: z.string().min(1).optional(),
  projectId: z.string().max(200).nullable().optional(),
  pinned: z.boolean().optional(),
});
export type ManagedCloudUpdateConversationRequest = z.infer<
  typeof ManagedCloudUpdateConversationRequestSchema
>;

export const ManagedCloudCreateMessageRequestSchema = z.object({
  id: z.string().uuid().optional(),
  content: z
    .string()
    .min(1)
    .max(MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH)
    .refine((value) => value.trim().length > 0, 'Message content cannot be only whitespace'),
  model: z.string().min(1).optional().default('auto'),
  role: ManagedCloudMessageRoleSchema.optional().default('user'),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
  skipLlm: z.boolean().optional().default(false),
});
export type ManagedCloudCreateMessageRequest = z.input<
  typeof ManagedCloudCreateMessageRequestSchema
>;

export const ManagedCloudConversationListResponseSchema = z.object({
  conversations: z.array(ManagedCloudConversationWireSchema),
  hasMore: z.boolean(),
  nextOffset: z.number().int().nonnegative(),
});
export type ManagedCloudConversationListResponse = z.infer<
  typeof ManagedCloudConversationListResponseSchema
>;

export const ManagedCloudCreateConversationResponseSchema = z.object({
  conversation: ManagedCloudConversationWireSchema,
});
export const ManagedCloudUpdateConversationResponseSchema =
  ManagedCloudCreateConversationResponseSchema;

export const ManagedCloudConversationResponseSchema = z.object({
  conversation: ManagedCloudConversationWireSchema,
  messages: z.array(ManagedCloudMessageWireSchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export type ManagedCloudConversationResponse = z.infer<
  typeof ManagedCloudConversationResponseSchema
>;

export const ManagedCloudCreateMessageResponseSchema = z.object({
  message: z.object({ id: z.string().min(1) }).optional(),
  userMessage: z.object({ id: z.string().min(1) }).optional(),
});

export const ManagedCloudDeleteConversationResponseSchema = z.object({
  success: z.literal(true),
});
export const ManagedCloudDeleteMessageResponseSchema = ManagedCloudDeleteConversationResponseSchema;

export const ManagedCloudBranchConversationRequestSchema = z.object({
  sessionId: z.string().uuid(),
  branchPointMessageId: z.string().uuid(),
  branchName: z.string().max(200).optional(),
});
export type ManagedCloudBranchConversationRequest = z.infer<
  typeof ManagedCloudBranchConversationRequestSchema
>;

export const ManagedCloudBranchSessionWireSchema = z.object({
  id: z.string().min(1),
  user_id: z.string().min(1),
  title: z.string().nullable(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export const ManagedCloudBranchWireSchema = z.object({
  id: z.string().min(1),
  parent_session_id: z.string().min(1),
  child_session_id: z.string().min(1),
  branch_point_message_id: z.string().min(1),
  branch_name: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string().min(1),
});

export const ManagedCloudBranchConversationResponseSchema = z.object({
  session: ManagedCloudBranchSessionWireSchema,
  branch: ManagedCloudBranchWireSchema,
});
export type ManagedCloudBranchConversationResponse = z.infer<
  typeof ManagedCloudBranchConversationResponseSchema
>;

export interface ManagedCloudConversation {
  id: string;
  title: string;
  model?: string;
  projectId: string | null;
  pinned: boolean;
  isTemporary: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedCloudMessage {
  id: string;
  conversationId: string;
  role: ManagedCloudMessageRole;
  content: string;
  model?: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export function normalizeManagedCloudConversation(
  wire: ManagedCloudConversationWire,
): ManagedCloudConversation {
  return {
    id: wire.id,
    title: wire.title ?? 'Untitled',
    ...(wire.model ? { model: wire.model } : {}),
    projectId: wire.project_id,
    pinned: wire.pinned,
    isTemporary: wire.is_temporary,
    createdAt: wire.created_at,
    updatedAt: wire.updated_at,
  };
}

export function normalizeManagedCloudMessage(
  wire: ManagedCloudMessageWire,
  conversationId: string,
): ManagedCloudMessage {
  return {
    id: wire.id,
    conversationId,
    role: wire.role,
    content: wire.content,
    ...(wire.model ? { model: wire.model } : {}),
    ...(wire.provider ? { provider: wire.provider } : {}),
    inputTokens: wire.input_tokens,
    outputTokens: wire.output_tokens,
    costCents: wire.cost_cents,
    createdAt: wire.created_at,
    ...(wire.metadata ? { metadata: wire.metadata } : {}),
  };
}

export function managedCloudConversationPath(conversationId: string): string {
  return `${MANAGED_CLOUD_CHAT_BASE_PATH}/${encodeURIComponent(conversationId)}`;
}

export function managedCloudConversationMessagesPath(conversationId: string): string {
  return `${managedCloudConversationPath(conversationId)}/messages`;
}

export function managedCloudMessagePath(conversationId: string, messageId: string): string {
  return `${managedCloudConversationMessagesPath(conversationId)}/${encodeURIComponent(messageId)}`;
}

export function managedCloudBranchPath(): string {
  return '/api/chat/branch';
}
