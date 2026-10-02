import { z } from 'zod';
import { MAX_CHAT_ATTACHMENT_COUNT } from './chat-attachments';
import {
  MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH,
  ManagedCloudMessageMetadataSchema,
} from './conversations';

export const FREE_QUOTA_CATALOGUE_PATH = '/api/models/free-quota';
export const FREE_QUOTA_COMPLETIONS_PATH = '/api/models/free-quota/completions';
export const FREE_QUOTA_EXHAUSTED_CODE = 'free_quota_exhausted';
export const FREE_QUOTA_EXPIRED_CODE = 'free_quota_expired';
export const FREE_ALLOWANCE_EXHAUSTED_CODE = 'free_allowance_exhausted';

export const FREE_LIMIT_REASONS = [
  'allowance_used',
  'allowance_ended',
  'shared_pool_used',
] as const;

export const FreeLimitSchema = z.object({
  model: z.string().min(1),
  reason: z.enum(FREE_LIMIT_REASONS),
  resets_at: z.string().datetime({ offset: true }).optional(),
  alternative_model: z.string().min(1).optional(),
});

export type FreeLimit = z.infer<typeof FreeLimitSchema>;
export type FreeLimitReason = FreeLimit['reason'];

export type FreeQuotaMessageContent =
  string | Array<{ type: 'text'; text: string } | { type: 'file'; file: { asset_id: string } }>;

interface PromotionalRequestMessage {
  role: string;
  content: string | Array<{ type: string; text?: string }>;
}

const OMITTED_ATTACHMENT_NOTE =
  '[An attachment in this earlier message is unavailable in this turn.]';

export function normalizePromotionalChatHistory<T extends PromotionalRequestMessage>(
  messages: T[],
): T[] {
  const currentUserIndex = messages.map((message) => message.role).lastIndexOf('user');
  return messages.map((message, index) => {
    if (typeof message.content === 'string' || index === currentUserIndex) return message;
    const text = message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('\n');
    const omitted = message.content.some((part) => part.type !== 'text');
    return {
      ...message,
      content: omitted ? [text, OMITTED_ATTACHMENT_NOTE].filter(Boolean).join('\n') : text,
    } as T;
  });
}

const FreeOfferingContentSchema = z.union([
  z.string().max(MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH),
  z
    .array(
      z.discriminatedUnion('type', [
        z.object({
          type: z.literal('text'),
          text: z.string().max(MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH),
        }),
        z.object({ type: z.literal('file'), file: z.object({ asset_id: z.string().uuid() }) }),
      ]),
    )
    .min(1)
    .max(MAX_CHAT_ATTACHMENT_COUNT + 1),
]);

export function freeOfferingContentText(
  content: string | readonly { type: string; text?: string }[],
): string {
  return typeof content === 'string'
    ? content
    : content
        .filter((part) => part.type === 'text')
        .map((part) => part.text ?? '')
        .join('\n');
}

export const FreeOfferingRequestSchema = z.object({
  model: z.string().min(1),
  conversation_id: z.string().uuid(),
  assistant_message_id: z.string().uuid(),
  user_message: z
    .object({
      id: z.string().uuid(),
      metadata: ManagedCloudMessageMetadataSchema.optional().default({}),
      parent_id: z.string().uuid().nullable().optional(),
    })
    .optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: FreeOfferingContentSchema,
      }),
    )
    .min(1)
    .refine(
      (messages) =>
        messages.reduce(
          (total, message) => total + freeOfferingContentText(message.content).length,
          0,
        ) <= MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH,
    ),
  max_tokens: z.number().int().positive().optional(),
  work_mode: z.literal('chat').optional(),
  web_search: z.boolean().optional(),
  web_fetch: z.boolean().optional(),
  research: z.literal(false).optional(),
  code_execution: z.literal(false).optional(),
  office_creation: z.literal(false).optional(),
  skill_name: z.undefined().optional(),
  mcp_context: z.undefined().optional(),
  memory_enabled: z.boolean().optional(),
  personalization: z.boolean().optional(),
  client_timezone: z.string().max(64).optional(),
});

export type FreeOfferingRequest = z.infer<typeof FreeOfferingRequestSchema>;
export type FreeOfferingMessage = FreeOfferingRequest['messages'][number];

export const FreeQuotaModelSchema = z.object({
  key: z.string().min(1),
  displayName: z.string().min(1),
  providerModelId: z.string().nullable(),
  category: z.enum(['chat', 'image', 'video', 'audio', 'embedding']),
  limit: z.number().nullable(),
  unit: z.enum(['tokens', 'images', 'seconds', 'chars', 'calls']).nullable(),
  consumedApproximate: z.number().nullable(),
  expiresOn: z.string().nullable(),
  status: z.enum(['ready', 'exhausted', 'expired', 'unavailable']),
  outputSize: z.string().optional(),
  durationSeconds: z.number().optional(),
});

export const FreeQuotaCatalogueSchema = z.object({
  issuer: z.string().min(1),
  observedOn: z.string().min(1),
  evidenceUrl: z.string().min(1),
  reportedEligible: z.number().int().nonnegative(),
  reportedUnavailable: z.number().int().nonnegative(),
  models: z.array(FreeQuotaModelSchema),
});

export type FreeQuotaStatus = z.infer<typeof FreeQuotaModelSchema>['status'];
export type FreeQuotaModel = z.infer<typeof FreeQuotaModelSchema>;
export type FreeQuotaCatalogue = z.infer<typeof FreeQuotaCatalogueSchema>;
