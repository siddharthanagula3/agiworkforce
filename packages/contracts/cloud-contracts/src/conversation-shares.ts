import { z } from 'zod';

export const CONVERSATION_SHARES_PATH = '/api/share';

export function conversationSharePath(token: string): string {
  return `${CONVERSATION_SHARES_PATH}/${encodeURIComponent(token)}`;
}

export const ConversationShareListQuerySchema = z.object({
  conversation_id: z.string().uuid().optional(),
});

export function conversationSharesPath(conversationId: string): string {
  return `${CONVERSATION_SHARES_PATH}?${new URLSearchParams({ conversation_id: conversationId })}`;
}

export const CONVERSATION_SHARE_VISIBILITIES = ['public', 'organization'] as const;

export const ConversationShareVisibilitySchema = z.enum(CONVERSATION_SHARE_VISIBILITIES);
export type ConversationShareVisibility = z.infer<typeof ConversationShareVisibilitySchema>;

export const ConversationShareWorkspaceSchema = z
  .object({ memberCount: z.number().int().nonnegative() })
  .nullable();

export const ConversationShareCreatedSchema = z.object({
  shareUrl: z.string().url(),
  token: z.string().min(1),
  expiresAt: z.string(),
  messageCount: z.number().int().nonnegative(),
  visibility: ConversationShareVisibilitySchema.default('public'),
  workspace: ConversationShareWorkspaceSchema.optional().default(null),
});
export type ConversationShareCreated = z.input<typeof ConversationShareCreatedSchema>;

export const ConversationShareSummarySchema = z.object({
  token: z.string().min(1),
  title: z.string(),
  shareUrl: z.string().url(),
  modelId: z.string().nullable(),
  provider: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
  visibility: ConversationShareVisibilitySchema.default('public'),
  createdAt: z.string(),
  expiresAt: z.string(),
  expired: z.boolean(),
});
export type ConversationShareSummary = z.infer<typeof ConversationShareSummarySchema>;

export const ConversationShareListResponseSchema = z.object({
  shares: z.array(ConversationShareSummarySchema),
  workspace: ConversationShareWorkspaceSchema.optional(),
});
export type ConversationShareListResponse = z.input<typeof ConversationShareListResponseSchema>;

export const ConversationShareAudienceChangeSchema = z.object({
  visibility: ConversationShareVisibilitySchema,
});

export const ConversationShareAudienceResponseSchema = z.object({
  token: z.string().min(1),
  shareUrl: z.string().url(),
  visibility: ConversationShareVisibilitySchema,
  organizationId: z.string().nullable(),
  expiresAt: z.string(),
});
export type ConversationShareAudienceResponse = z.input<
  typeof ConversationShareAudienceResponseSchema
>;

export const ConversationShareRevokedSchema = z.object({ success: z.literal(true) });
export type ConversationShareRevoked = z.input<typeof ConversationShareRevokedSchema>;

export const ConversationSharesRevokedSchema = z.object({
  success: z.literal(true),
  revoked: z.number().int().nonnegative(),
});
export type ConversationSharesRevoked = z.input<typeof ConversationSharesRevokedSchema>;

export const ConversationSharesRefreshedSchema = z.object({
  refreshed: z.number().int().positive(),
  tokens: z.array(z.string().min(1)).min(1),
  messageCount: z.number().int().positive(),
});
export type ConversationSharesRefreshed = z.input<typeof ConversationSharesRefreshedSchema>;

export const SharedConversationSchema = z.object({
  id: z.string(),
  token: z.string().min(1),
  title: z.string().nullable(),
  model_id: z.string().nullable(),
  provider: z.string().nullable(),
  messages: z.array(z.record(z.string(), z.unknown())),
  total_messages: z.number().int().nonnegative(),
  visibility: ConversationShareVisibilitySchema.default('public'),
  expires_at: z.string(),
  created_at: z.string(),
});
export type SharedConversation = z.input<typeof SharedConversationSchema>;
