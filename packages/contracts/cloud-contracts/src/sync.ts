
import { z } from 'zod';

export const ServerVersionSchema = z
  .string()
  .regex(/^\d{1,19}$/)
  .refine(
    (value) => value.length < 19 || value <= '9223372036854775807',
    'server version exceeds PostgreSQL bigint range',
  );

export const AppliedRowSchema = z.object({
  id: z.string(),
  server_version: ServerVersionSchema,
});
export type AppliedRow = z.infer<typeof AppliedRowSchema>;

export const SyncProtocolVersionSchema = z.literal(2);

function rejectDuplicateIds(
  items: ReadonlyArray<{ id: string }>,
  path: string,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.id)) {
      context.addIssue({
        code: 'custom',
        path: [path, index, 'id'],
        message: `duplicate ${path.slice(0, -1)} id in sync batch`,
      });
    }
    seen.add(item.id);
  }
}

export const ConversationWireDeltaSchema = z.object({
  id: z.string(),
  title: z.string(),
  model: z.string().nullable(),
  project_id: z.string().nullable(),
  pinned: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  server_version: ServerVersionSchema,
});
export type ConversationWireDelta = z.infer<typeof ConversationWireDeltaSchema>;

export const MessageWireDeltaSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  model: z.string().nullable(),
  provider: z.string().nullable(),
  input_tokens: z.number(),
  output_tokens: z.number(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  server_version: ServerVersionSchema,
});
export type MessageWireDelta = z.infer<typeof MessageWireDeltaSchema>;

export const ArtifactWireDeltaSchema = z.object({
  id: z.string(),
  conversation_id: z.string(),
  message_id: z.string().nullable(),
  title: z.string().nullable(),
  artifact_type: z.string(),
  language: z.string().nullable(),
  content: z.string(),
  current_version: z.number(),
  pinned: z.boolean(),
  tags: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  server_version: ServerVersionSchema,
});
export type ArtifactWireDelta = z.infer<typeof ArtifactWireDeltaSchema>;

export const ChatSyncPullResponseSchema = z.object({
  conversations: z.array(ConversationWireDeltaSchema),
  messages: z.array(MessageWireDeltaSchema),
  artifacts: z.array(ArtifactWireDeltaSchema),
  cursor: ServerVersionSchema,
  hasMore: z.boolean(),
});
export type ChatSyncPullResponse = z.infer<typeof ChatSyncPullResponseSchema>;

export const ConversationSyncPushItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(500),
  model: z.string().max(200).nullable().optional(),
  projectId: z.string().max(200).nullable().optional(),
  pinned: z.boolean().optional(),
  baseVersion: ServerVersionSchema,
  isDeleted: z.boolean().optional(),
});
export type ConversationSyncPushItem = z.infer<typeof ConversationSyncPushItemSchema>;

export const MessageSyncPushItemSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(1_000_000),
  model: z.string().max(200).nullable().optional(),
  provider: z.string().max(200).nullable().optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  baseVersion: ServerVersionSchema,
  isDeleted: z.boolean().optional(),
});
export type MessageSyncPushItem = z.infer<typeof MessageSyncPushItemSchema>;

export const ArtifactSyncPushItemSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  messageId: z.string().uuid().nullable().optional(),
  title: z.string().max(500).nullable().optional(),
  artifactType: z.string().max(50),
  language: z.string().max(50).nullable().optional(),
  content: z.string().max(2_000_000),
  currentVersion: z.number().int().positive().optional(),
  pinned: z.boolean().optional(),
  tags: z.array(z.string().max(100)).max(50).optional(),
  baseVersion: ServerVersionSchema,
  isDeleted: z.boolean().optional(),
});
export type ArtifactSyncPushItem = z.infer<typeof ArtifactSyncPushItemSchema>;

export const ChatSyncPushRequestSchema = z
  .object({
    protocolVersion: SyncProtocolVersionSchema,
    conversations: z.array(ConversationSyncPushItemSchema).max(500).optional().default([]),
    messages: z.array(MessageSyncPushItemSchema).max(2_000).optional().default([]),
    artifacts: z.array(ArtifactSyncPushItemSchema).max(500).optional().default([]),
  })
  .superRefine(({ conversations, messages, artifacts }, context) => {
    rejectDuplicateIds(conversations, 'conversations', context);
    rejectDuplicateIds(messages, 'messages', context);
    rejectDuplicateIds(artifacts, 'artifacts', context);
  });
export type ChatSyncPushRequest = z.infer<typeof ChatSyncPushRequestSchema>;

export const ConversationSyncConflictSchema = z.object({
  id: z.string(),
  current: ConversationWireDeltaSchema.nullable(),
});
export const MessageSyncConflictSchema = z.object({
  id: z.string(),
  current: MessageWireDeltaSchema.nullable(),
});
export const ArtifactSyncConflictSchema = z.object({
  id: z.string(),
  current: ArtifactWireDeltaSchema.nullable(),
});

export const ChatSyncPushResponseSchema = z.object({
  protocolVersion: SyncProtocolVersionSchema,
  applied: z.object({
    conversations: z.array(AppliedRowSchema),
    messages: z.array(AppliedRowSchema),
    artifacts: z.array(AppliedRowSchema),
  }),
  conflicts: z.object({
    conversations: z.array(ConversationSyncConflictSchema),
    messages: z.array(MessageSyncConflictSchema),
    artifacts: z.array(ArtifactSyncConflictSchema),
  }),
  cursor: ServerVersionSchema,
});
export type ChatSyncPushResponse = z.infer<typeof ChatSyncPushResponseSchema>;

export const MemoryWireDeltaSchema = z.object({
  id: z.string(),
  content: z.string(),
  category: z.string().nullable(),
  source: z.string().nullable(),
  pinned: z.boolean(),
  is_deleted: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  server_version: ServerVersionSchema,
});
export type MemoryWireDelta = z.infer<typeof MemoryWireDeltaSchema>;

export const MemorySyncPullResponseSchema = z.object({
  memories: z.array(MemoryWireDeltaSchema),
  cursor: ServerVersionSchema,
  hasMore: z.boolean(),
});
export type MemorySyncPullResponse = z.infer<typeof MemorySyncPullResponseSchema>;

export const MemorySyncPushItemSchema = z.object({
  id: z.string().uuid(),
  content: z.string().max(20_000),
  category: z.string().max(200).nullable().optional(),
  source: z.string().max(50).nullable().optional(),
  pinned: z.boolean().optional(),
  baseVersion: ServerVersionSchema,
  isDeleted: z.boolean().optional(),
});
export type MemorySyncPushItem = z.infer<typeof MemorySyncPushItemSchema>;

export const MemorySyncPushRequestSchema = z
  .object({
    protocolVersion: SyncProtocolVersionSchema,
    memories: z.array(MemorySyncPushItemSchema).max(1_000),
  })
  .superRefine(({ memories }, context) => rejectDuplicateIds(memories, 'memories', context));
export type MemorySyncPushRequest = z.infer<typeof MemorySyncPushRequestSchema>;

export const MemorySyncConflictSchema = z.object({
  id: z.string(),
  current: MemoryWireDeltaSchema.nullable(),
});

export const MemorySyncPushResponseSchema = z.object({
  protocolVersion: SyncProtocolVersionSchema,
  applied: z.array(AppliedRowSchema),
  conflicts: z.array(MemorySyncConflictSchema),
  cursor: ServerVersionSchema,
});
export type MemorySyncPushResponse = z.infer<typeof MemorySyncPushResponseSchema>;

export const ProjectWireDeltaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  instructions: z.string().nullable(),
  color: z.string().nullable(),
  is_archived: z.boolean(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
  server_version: ServerVersionSchema,
});
export type ProjectWireDelta = z.infer<typeof ProjectWireDeltaSchema>;

export const ProjectsSyncPullResponseSchema = z.object({
  projects: z.array(ProjectWireDeltaSchema),
  cursor: ServerVersionSchema,
  hasMore: z.boolean(),
});
export type ProjectsSyncPullResponse = z.infer<typeof ProjectsSyncPullResponseSchema>;

export const ProjectSyncPushItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(200),
  description: z.string().max(2_000).nullable().optional(),
  instructions: z.string().max(10_000).nullable().optional(),
  color: z.string().max(50).nullable().optional(),
  isArchived: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  baseVersion: ServerVersionSchema,
  deletedAt: z.string().datetime().nullable().optional(),
});
export type ProjectSyncPushItem = z.infer<typeof ProjectSyncPushItemSchema>;

export const ProjectsSyncPushRequestSchema = z
  .object({
    projects: z.array(ProjectSyncPushItemSchema).max(500).optional().default([]),
  })
  .superRefine(({ projects }, context) => {
    const seen = new Set<string>();
    for (const [index, project] of projects.entries()) {
      if (seen.has(project.id)) {
        context.addIssue({
          code: 'custom',
          path: ['projects', index, 'id'],
          message: 'duplicate project id in sync batch',
        });
      }
      seen.add(project.id);
    }
  });
export type ProjectsSyncPushRequest = z.infer<typeof ProjectsSyncPushRequestSchema>;

export const ProjectSyncConflictSchema = z.object({
  id: z.string(),
  current: ProjectWireDeltaSchema.nullable(),
});
export type ProjectSyncConflict = z.infer<typeof ProjectSyncConflictSchema>;

const ProjectAppliedRowSchema = AppliedRowSchema.extend({
  server_version: ServerVersionSchema,
});

export const ProjectsSyncPushResponseSchema = z.object({
  applied: z.array(ProjectAppliedRowSchema),
  conflicts: z.array(ProjectSyncConflictSchema).optional().default([]),
  cursor: ServerVersionSchema,
});
export type ProjectsSyncPushResponse = z.infer<typeof ProjectsSyncPushResponseSchema>;

const CloudSafeSettingsNamespaceSchema = z.record(z.string(), z.unknown());

export const CloudSafeSettingsSchema = z.object({
  appearance: CloudSafeSettingsNamespaceSchema.optional(),
  personalization: CloudSafeSettingsNamespaceSchema.optional(),
  profile: CloudSafeSettingsNamespaceSchema.optional(),
  notifications: CloudSafeSettingsNamespaceSchema.optional(),
  language: CloudSafeSettingsNamespaceSchema.optional(),
  accessibility: CloudSafeSettingsNamespaceSchema.optional(),
  capabilities: CloudSafeSettingsNamespaceSchema.optional(),
  chat: CloudSafeSettingsNamespaceSchema.optional(),
  editor: CloudSafeSettingsNamespaceSchema.optional(),
});
export type CloudSafeSettings = z.infer<typeof CloudSafeSettingsSchema>;

/** @deprecated Prefer the boundary-neutral ServerVersionSchema. */
export const SettingsServerVersionSchema = ServerVersionSchema;

export const SettingsSyncPullResponseSchema = z.object({
  settings: CloudSafeSettingsSchema,
  cursor: SettingsServerVersionSchema,
  hasMore: z.boolean(),
});
export type SettingsSyncPullResponse = z.infer<typeof SettingsSyncPullResponseSchema>;

export const SettingsSyncPushRequestSchema = z.object({
  settings: CloudSafeSettingsSchema,
  baseVersion: SettingsServerVersionSchema,
});
export type SettingsSyncPushRequest = z.infer<typeof SettingsSyncPushRequestSchema>;

export const SettingsSyncPushResponseSchema = z.object({
  applied: z.boolean(),
  cursor: SettingsServerVersionSchema,
});
export type SettingsSyncPushResponse = z.infer<typeof SettingsSyncPushResponseSchema>;
