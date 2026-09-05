import { z } from 'zod';
import {
  getDefaultAutoRoutingProfile,
  INTERACTIVE_CARDS_MAX_PER_MESSAGE,
  INTERACTIVE_CARDS_METADATA_KEY,
} from '@agiworkforce/types';
import { CloudAgentWorkModeSchema, type CloudAgentWorkMode } from './cloud-agent-runs';

export const MANAGED_CLOUD_DEFAULT_MODEL_SELECTION = getDefaultAutoRoutingProfile().id;

export const MANAGED_CLOUD_CHAT_BASE_PATH = '/api/chat/conversations';
export const MANAGED_CLOUD_ORGANIZATION_HEADER = 'x-agi-organization-id';
export const MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE = 'personal';
export const MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH = 100_000;
export const MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH = 32_000;

export function managedCloudMetadataLength(value: unknown): number {
  try {
    return JSON.stringify(value ?? {})?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export const ManagedCloudMessageMetadataSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, ctx) => {
    const cards = value[INTERACTIVE_CARDS_METADATA_KEY];
    if (Array.isArray(cards) && cards.length > INTERACTIVE_CARDS_MAX_PER_MESSAGE) {
      ctx.addIssue({
        code: 'custom',
        path: [INTERACTIVE_CARDS_METADATA_KEY],
        message: `Message metadata contains too many interactive cards (${cards.length}, limit ${INTERACTIVE_CARDS_MAX_PER_MESSAGE}).`,
      });
    }
  })
  .refine((value) => managedCloudMetadataLength(value) <= MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH, {
    message: `Message metadata exceeds ${MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH} characters. Large payloads (for example an inline data: image) must be uploaded to storage and referenced by id, not embedded in the message.`,
  });
export const MANAGED_CLOUD_CHAT_DEFAULT_PAGE_SIZE = 50;
export const MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE = 100;
export const MANAGED_CLOUD_CHAT_MAX_MESSAGE_PAGE_SIZE = 500;
export const MANAGED_CLOUD_REFLECT_PATH = '/api/reflect';

export const ManagedCloudConversationTopicSchema = z.enum([
  'coding',
  'research',
  'writing',
  'brainstorm',
  'analysis',
  'debug',
  'creative',
  'general',
]);
export type ManagedCloudConversationTopic = z.infer<typeof ManagedCloudConversationTopicSchema>;

export const ManagedCloudReflectRangeSchema = z.enum(['30d', '90d', '180d', '365d']);
export type ManagedCloudReflectRange = z.infer<typeof ManagedCloudReflectRangeSchema>;

export const ManagedCloudConversationWireSchema = z.object({
  id: z.string().min(1),
  organization_id: z.string().uuid().nullable().optional(),
  title: z.string().nullable(),
  model: z.string().nullable(),
  project_id: z.string().nullable(),
  pinned: z.boolean(),
  starred: z.boolean(),
  archived: z.boolean(),
  is_temporary: z.boolean(),
  active_leaf_message_id: z.string().uuid().nullable().optional(),
  // Derived from the conversation's FIRST agent run, not stored on the
  // conversation row: the mode a task was started in is what the badge names,
  // and a later turn switched to Chat must not erase it.
  work_mode: CloudAgentWorkModeSchema.nullable().optional(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});
export type ManagedCloudConversationWire = z.infer<typeof ManagedCloudConversationWireSchema>;

export const ManagedCloudMessageRoleSchema = z.enum(['user', 'assistant', 'system']);
export type ManagedCloudMessageRole = z.infer<typeof ManagedCloudMessageRoleSchema>;

export const ManagedCloudMessageWireSchema = z.object({
  id: z.string().min(1),
  parent_id: z.string().uuid().nullable().optional(),
  role: ManagedCloudMessageRoleSchema,
  content: z.string().max(MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  input_tokens: z.coerce.number(),
  output_tokens: z.coerce.number(),
  created_at: z.string().min(1),
  metadata: ManagedCloudMessageMetadataSchema.nullable(),
});
export type ManagedCloudMessageWire = z.infer<typeof ManagedCloudMessageWireSchema>;

export const ManagedCloudConversationListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  includeHistoryStats: z.boolean().optional(),
  archived: z.enum(['include', 'only', 'exclude']).optional(),
});
export type ManagedCloudConversationListQuery = z.infer<
  typeof ManagedCloudConversationListQuerySchema
>;

export const ManagedCloudCreateConversationRequestSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().max(500).optional().default('New conversation'),
  model: z.string().min(1).optional().default(MANAGED_CLOUD_DEFAULT_MODEL_SELECTION),
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
  starred: z.boolean().optional(),
  archived: z.boolean().optional(),
  isTemporary: z.boolean().optional(),
  // Three-way, matching resolveParentId in the messages route's thread lib:
  // absent leaves the recorded leaf alone, a uuid names the variant being read,
  // and an explicit null returns the conversation to its linear reading, the
  // only honest answer once the path that leaf named has been deleted.
  activeLeafMessageId: z.string().uuid().nullable().optional(),
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
  model: z.string().min(1).optional().default(MANAGED_CLOUD_DEFAULT_MODEL_SELECTION),
  role: ManagedCloudMessageRoleSchema.optional().default('user'),
  metadata: ManagedCloudMessageMetadataSchema.optional().default({}),
  skipLlm: z.boolean().optional().default(false),
  parentId: z.string().uuid().nullable().optional(),
});
export type ManagedCloudCreateMessageRequest = z.input<
  typeof ManagedCloudCreateMessageRequestSchema
>;

export const ManagedCloudConversationHistoryStatsSchema = z.object({
  conversationCount: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
});
export type ManagedCloudConversationHistoryStats = z.infer<
  typeof ManagedCloudConversationHistoryStatsSchema
>;

export const ManagedCloudConversationListResponseSchema = z.object({
  conversations: z.array(ManagedCloudConversationWireSchema).max(MANAGED_CLOUD_CHAT_MAX_PAGE_SIZE),
  hasMore: z.boolean(),
  nextOffset: z.number().int().nonnegative(),
  historyStats: ManagedCloudConversationHistoryStatsSchema.optional(),
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
  messages: z.array(ManagedCloudMessageWireSchema).max(MANAGED_CLOUD_CHAT_MAX_MESSAGE_PAGE_SIZE),
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

export const ManagedCloudConversationBranchItemSchema = z.object({
  conversationId: z.string().uuid(),
  title: z.string().min(1).max(500),
});
export type ManagedCloudConversationBranchItem = z.infer<
  typeof ManagedCloudConversationBranchItemSchema
>;

export const ManagedCloudConversationBranchGroupSchema = z.object({
  messageId: z.string().uuid(),
  activeConversationId: z.string().uuid(),
  branches: z.array(ManagedCloudConversationBranchItemSchema).min(2).max(50),
});
export type ManagedCloudConversationBranchGroup = z.infer<
  typeof ManagedCloudConversationBranchGroupSchema
>;

export const ManagedCloudConversationBranchesResponseSchema = z.object({
  groups: z.array(ManagedCloudConversationBranchGroupSchema).max(100),
});
export type ManagedCloudConversationBranchesResponse = z.infer<
  typeof ManagedCloudConversationBranchesResponseSchema
>;

export const ManagedCloudCreateConversationBranchRequestSchema = z.object({
  messageId: z.string().uuid(),
  requestId: z.string().uuid(),
});
export type ManagedCloudCreateConversationBranchRequest = z.infer<
  typeof ManagedCloudCreateConversationBranchRequestSchema
>;

export const ManagedCloudCreateConversationBranchResponseSchema = z.object({
  conversation: ManagedCloudConversationWireSchema,
});
export type ManagedCloudCreateConversationBranchResponse = z.infer<
  typeof ManagedCloudCreateConversationBranchResponseSchema
>;

const ManagedCloudReflectDateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ManagedCloudReflectRecapSchema = z.object({
  range: ManagedCloudReflectRangeSchema,
  generatedAt: z.string().datetime(),
  period: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    label: z.string().min(1).max(80),
  }),
  summary: z.object({
    headline: z.string().min(1).max(160),
    body: z.string().min(1).max(500),
  }),
  stats: z.object({
    totalConversations: z.number().int().nonnegative(),
    activeDays: z.number().int().nonnegative(),
    mostActiveDay: ManagedCloudReflectDateKeySchema.nullable(),
    peakHour: z.number().int().min(0).max(23).nullable(),
  }),
  dailyActivity: z
    .array(
      z.object({
        date: ManagedCloudReflectDateKeySchema,
        conversationCount: z.number().int().positive(),
      }),
    )
    .max(366),
  topics: z
    .array(
      z.object({
        id: ManagedCloudConversationTopicSchema,
        label: z.string().min(1).max(80),
        description: z.string().min(1).max(240),
        conversationCount: z.number().int().positive(),
        percentage: z.number().min(0).max(100),
      }),
    )
    .max(ManagedCloudConversationTopicSchema.options.length),
  insights: z
    .array(
      z.object({
        dimension: z.enum(['delegation', 'description', 'discernment', 'diligence']),
        title: z.string().min(1).max(120),
        observation: z.string().min(1).max(300),
        nextStep: z.string().min(1).max(300),
        href: z
          .string()
          .regex(/^\/(?!\/)/, 'Expected a same-origin path')
          .optional(),
      }),
    )
    .max(4),
  sampled: z.boolean(),
  sampledConversationCount: z.number().int().nonnegative(),
});
export type ManagedCloudReflectRecap = z.infer<typeof ManagedCloudReflectRecapSchema>;

export interface ManagedCloudConversation {
  id: string;
  organizationId?: string | null;
  title: string;
  model?: string;
  projectId: string | null;
  pinned: boolean;
  starred: boolean;
  archived: boolean;
  isTemporary: boolean;
  activeLeafMessageId?: string | null;
  workMode?: CloudAgentWorkMode;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedCloudMessage {
  id: string;
  conversationId: string;
  parentId?: string | null;
  role: ManagedCloudMessageRole;
  content: string;
  model?: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export function normalizeManagedCloudConversation(
  wire: ManagedCloudConversationWire,
): ManagedCloudConversation {
  return {
    id: wire.id,
    ...(wire.organization_id !== undefined ? { organizationId: wire.organization_id } : {}),
    title: wire.title ?? 'Untitled',
    ...(wire.model ? { model: wire.model } : {}),
    projectId: wire.project_id,
    pinned: wire.pinned,
    starred: wire.starred,
    archived: wire.archived,
    isTemporary: wire.is_temporary,
    ...(wire.active_leaf_message_id !== undefined
      ? { activeLeafMessageId: wire.active_leaf_message_id }
      : {}),
    ...(wire.work_mode ? { workMode: wire.work_mode } : {}),
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
    ...(wire.parent_id !== undefined ? { parentId: wire.parent_id } : {}),
    role: wire.role,
    content: wire.content,
    ...(wire.model ? { model: wire.model } : {}),
    ...(wire.provider ? { provider: wire.provider } : {}),
    inputTokens: wire.input_tokens,
    outputTokens: wire.output_tokens,
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

export function managedCloudConversationBranchesPath(conversationId: string): string {
  return `${managedCloudConversationPath(conversationId)}/branches`;
}

/**
 * The delete route's subtree mode, named here because both sides read it: the
 * route to decide which mode it is in, the caller to ask for it.
 */
export const MANAGED_CLOUD_MESSAGE_SUBTREE_PARAM = 'subtree';
export const MANAGED_CLOUD_MESSAGE_SUBTREE_VALUE = 'true';

/**
 * `subtree` deletes the message with everything descended from it, which is what
 * removing one answer among several means. Without it the route splices the
 * message's children onto its own parent, so the turns around it close up.
 */
export function managedCloudMessagePath(
  conversationId: string,
  messageId: string,
  options: { subtree?: boolean } = {},
): string {
  const path = `${managedCloudConversationMessagesPath(conversationId)}/${encodeURIComponent(messageId)}`;
  return options.subtree
    ? `${path}?${MANAGED_CLOUD_MESSAGE_SUBTREE_PARAM}=${MANAGED_CLOUD_MESSAGE_SUBTREE_VALUE}`
    : path;
}
