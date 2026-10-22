import { z } from 'zod';

export const MANAGED_CLOUD_AGENTS_PATH = '/api/custom-agents';

export const AGENT_STATUSES = ['active', 'paused', 'retired'] as const;
export const AGENT_VISIBILITIES = ['private', 'people', 'workspace'] as const;

export const AGENT_NAME_MAX_CHARS = 80;
export const AGENT_DESCRIPTION_MAX_CHARS = 300;
export const AGENT_INSTRUCTIONS_MAX_CHARS = 32_000;
export const AGENT_OUTPUT_EXAMPLES_MAX_CHARS = 8_000;
export const AGENT_STARTERS_MAX = 6;
export const AGENT_STARTER_MAX_CHARS = 200;
export const AGENT_DAILY_TURN_LIMIT_MAX = 10_000;
export const AGENT_MONTHLY_CREDIT_LIMIT_MAX = 100_000_000;
export const AGENT_SELECTION_MAX = 200;
export const AGENT_FILES_MAX = 20;
export const AGENT_FILE_MAX_BYTES = 512_000;
export const AGENT_VERSION_NOTE_MAX_CHARS = 300;
export const AGENT_SHARE_PEOPLE_MAX = 100;
export const AGENT_USAGE_WINDOW_DAYS = 30;
export const AGENT_WEB_DOMAINS_MAX = 32;

const IdentifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);
const SelectionSchema = z.array(z.string().trim().min(1).max(200)).max(AGENT_SELECTION_MAX);
const WebDomainListSchema = z.array(z.string().trim().min(1).max(253)).max(AGENT_WEB_DOMAINS_MAX);

export const AgentStatusSchema = z.enum(AGENT_STATUSES);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

export const AgentVisibilitySchema = z.enum(AGENT_VISIBILITIES);
export type AgentVisibility = z.infer<typeof AgentVisibilitySchema>;

export const AgentConfigSchema = z.object({
  name: z.string().trim().min(1).max(AGENT_NAME_MAX_CHARS),
  description: z.string().trim().max(AGENT_DESCRIPTION_MAX_CHARS),
  icon: IdentifierSchema,
  accentColor: IdentifierSchema,
  instructions: z.string().max(AGENT_INSTRUCTIONS_MAX_CHARS),
  outputExamples: z.string().max(AGENT_OUTPUT_EXAMPLES_MAX_CHARS),
  conversationStarters: z
    .array(z.string().trim().min(1).max(AGENT_STARTER_MAX_CHARS))
    .max(AGENT_STARTERS_MAX),
  model: z.string().trim().min(1).max(200).nullable(),
  webSearch: z.boolean(),
  codeExecution: z.boolean(),
  imageGeneration: z.boolean(),
  connectorIds: SelectionSchema.nullable(),
  skillNames: SelectionSchema.nullable(),
  allowedWebDomains: WebDomainListSchema.default([]),
  blockedWebDomains: WebDomainListSchema.default([]),
  dailyTurnLimit: z.number().int().min(1).max(AGENT_DAILY_TURN_LIMIT_MAX).nullable(),
  monthlyCreditLimit: z
    .number()
    .int()
    .min(1)
    .max(AGENT_MONTHLY_CREDIT_LIMIT_MAX)
    .nullable()
    .default(null),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const AgentCreateRequestSchema = AgentConfigSchema.partial().extend({
  name: AgentConfigSchema.shape.name,
});
export type AgentCreateRequest = z.infer<typeof AgentCreateRequestSchema>;

export const AgentUpdateRequestSchema = AgentConfigSchema.partial();
export type AgentUpdateRequest = z.infer<typeof AgentUpdateRequestSchema>;

export const ManagedCloudAgentSchema = AgentConfigSchema.extend({
  id: z.string().uuid(),
  isOwner: z.boolean(),
  ownerName: z.string().nullable(),
  ownerUserId: z.string().nullable().optional(),
  organizationId: z.string().uuid().nullable(),
  status: AgentStatusSchema,
  visibility: AgentVisibilitySchema,
  publishedVersion: z.number().int().min(1).nullable(),
  hasUnpublishedChanges: z.boolean(),
  pausedAt: z.string().nullable(),
  retiredAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ManagedCloudAgent = z.infer<typeof ManagedCloudAgentSchema>;

export const ManagedCloudAgentListResponseSchema = z.object({
  agents: z.array(ManagedCloudAgentSchema),
});
export type ManagedCloudAgentListResponse = z.infer<typeof ManagedCloudAgentListResponseSchema>;

export const ManagedCloudAgentResponseSchema = z.object({ agent: ManagedCloudAgentSchema });
export type ManagedCloudAgentResponse = z.infer<typeof ManagedCloudAgentResponseSchema>;

export const AgentStatusRequestSchema = z.object({ status: AgentStatusSchema });
export type AgentStatusRequest = z.infer<typeof AgentStatusRequestSchema>;

export const AgentPublishRequestSchema = z.object({
  note: z.string().trim().max(AGENT_VERSION_NOTE_MAX_CHARS).optional(),
});
export type AgentPublishRequest = z.infer<typeof AgentPublishRequestSchema>;

export const AgentVersionSchema = z.object({
  version: z.number().int().min(1),
  note: z.string().nullable(),
  publishedAt: z.string(),
  publishedByName: z.string().nullable(),
  config: AgentConfigSchema,
});
export type AgentVersion = z.infer<typeof AgentVersionSchema>;

export const AgentVersionListResponseSchema = z.object({ versions: z.array(AgentVersionSchema) });
export type AgentVersionListResponse = z.infer<typeof AgentVersionListResponseSchema>;

export const AgentRestoreRequestSchema = z.object({ version: z.number().int().min(1) });
export type AgentRestoreRequest = z.infer<typeof AgentRestoreRequestSchema>;

export const AgentShareRequestSchema = z.object({
  visibility: AgentVisibilitySchema,
  userIds: z.array(z.string().min(1).max(200)).max(AGENT_SHARE_PEOPLE_MAX).default([]),
});
export type AgentShareRequest = z.infer<typeof AgentShareRequestSchema>;

export const AgentShareMemberSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  hasAccess: z.boolean(),
});
export type AgentShareMember = z.infer<typeof AgentShareMemberSchema>;

export const AgentShareResponseSchema = z.object({
  visibility: AgentVisibilitySchema,
  workspaceName: z.string().nullable(),
  members: z.array(AgentShareMemberSchema),
});
export type AgentShareResponse = z.infer<typeof AgentShareResponseSchema>;

export const AgentTransferRequestSchema = z.object({ newOwnerId: z.string().min(1).max(200) });
export type AgentTransferRequest = z.infer<typeof AgentTransferRequestSchema>;

export const AgentUsageResponseSchema = z.object({
  windowDays: z.number().int().min(1),
  conversations: z.number().int().min(0),
  people: z.number().int().min(0),
  turns: z.number().int().min(0),
});
export type AgentUsageResponse = z.infer<typeof AgentUsageResponseSchema>;

export const AgentActivityConversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  updatedAt: z.string(),
});

export const AgentActivityRoutineSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.string(),
  lastExecutedAt: z.string().nullable(),
  nextExecutionAt: z.string().nullable(),
});

export const AgentActivityResponseSchema = z.object({
  conversations: z.array(AgentActivityConversationSchema),
  routines: z.array(AgentActivityRoutineSchema),
});
export type AgentActivityResponse = z.infer<typeof AgentActivityResponseSchema>;

export const AgentFileSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  mimeType: z.string(),
  byteSize: z.number().int().min(0),
  createdAt: z.string(),
});
export type AgentFile = z.infer<typeof AgentFileSchema>;

export const AgentFileListResponseSchema = z.object({ files: z.array(AgentFileSchema) });
export type AgentFileListResponse = z.infer<typeof AgentFileListResponseSchema>;

export const AgentConversationResponseSchema = z.object({ conversationId: z.string().uuid() });
export type AgentConversationResponse = z.infer<typeof AgentConversationResponseSchema>;

export const AgentImportRequestSchema = z.object({
  markdown: z
    .string()
    .min(1)
    .max(AGENT_INSTRUCTIONS_MAX_CHARS + 4_000),
});
export type AgentImportRequest = z.infer<typeof AgentImportRequestSchema>;
