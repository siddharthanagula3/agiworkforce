import { z } from 'zod';
import { MAX_CHAT_ATTACHMENT_COUNT } from './chat-attachments';
import {
  MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH,
  ManagedCloudMessageMetadataSchema,
} from './conversations';

export {
  FREE_QUOTA_ATTESTATION_PATH,
  FREE_QUOTA_CATALOGUE_PATH,
  FREE_QUOTA_COMPLETIONS_PATH,
  FREE_QUOTA_MEDIA_OFFER_PATH,
} from './free-quota-paths';

export const FREE_QUOTA_EXHAUSTED_CODE = 'free_quota_exhausted';
export const FREE_QUOTA_EXPIRED_CODE = 'free_quota_expired';
export const FREE_ALLOWANCE_EXHAUSTED_CODE = 'free_allowance_exhausted';
export const FREE_QUOTA_DAILY_LIMIT_CODE = 'free_quota_daily_limit';
export const FREE_QUOTA_FALLBACK_REQUEST_KEY = 'x_free_quota_fallback' as const;

export const FREE_LIMIT_REASONS = [
  'allowance_used',
  'allowance_ended',
  'shared_pool_used',
  'daily_limit_reached',
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

export const FREE_QUOTA_MEDIA_CATEGORIES = ['image', 'video'] as const;

export const FreeQuotaLimitedOfferSchema = z.object({
  category: z.enum(FREE_QUOTA_MEDIA_CATEGORIES),
  dailyCap: z.number().int().positive(),
  remainingToday: z.number().int().nonnegative(),
  resetsAt: z.string().datetime({ offset: true }),
});

export const FreeQuotaCatalogueSchema = z.object({
  issuer: z.string().min(1),
  observedOn: z.string().min(1),
  evidenceUrl: z.string().min(1),
  reportedEligible: z.number().int().nonnegative(),
  reportedUnavailable: z.number().int().nonnegative(),
  models: z.array(FreeQuotaModelSchema),
  mediaUseOrder: z.array(z.string().min(1)).optional(),
  limitedOffer: z.array(FreeQuotaLimitedOfferSchema).optional(),
});

export const FreeQuotaMediaOfferSchema = z.object({
  image: z.object({ lastDay: z.string().date().nullable() }).nullable(),
  video: z.object({ lastDay: z.string().date().nullable() }).nullable(),
});

export type FreeQuotaStatus = z.infer<typeof FreeQuotaModelSchema>['status'];
export type FreeQuotaModel = z.infer<typeof FreeQuotaModelSchema>;
export type FreeQuotaCatalogue = z.infer<typeof FreeQuotaCatalogueSchema>;
export type FreeQuotaMediaCategory = (typeof FREE_QUOTA_MEDIA_CATEGORIES)[number];
export type FreeQuotaLimitedOffer = z.infer<typeof FreeQuotaLimitedOfferSchema>;
export type FreeQuotaMediaOffer = z.infer<typeof FreeQuotaMediaOfferSchema>;

export const FREE_QUOTA_UNAVAILABLE_REASONS = [
  'not_integrated',
  'quota_only_not_observed',
  'terms_review_missing',
  'media_not_served',
  'allowance_unknown',
  'credential_missing',
  'shared_state_unavailable',
  'account_billing_signal',
  'attestation_missing',
  'attestation_other_credential',
  'attestation_stale',
  'attestation_excludes_offering',
  'managed_route_shares_allowance',
  'provider_withdrawn',
  'provider_refused',
] as const;

export const FREE_QUOTA_BLOCKED_OUTCOMES = [
  ...FREE_QUOTA_UNAVAILABLE_REASONS,
  'exhausted',
  'expired',
] as const;

export const FREE_QUOTA_ATTESTATION_STANDINGS = [
  'current',
  'expiring',
  'stale',
  'missing',
  'other_credential',
  'billing_signal',
] as const;

export const FREE_QUOTA_WITHDRAWAL_CAUSES = [
  'exhausted',
  'billing',
  'withdrawn',
  'refused',
] as const;

export const FREE_QUOTA_TERMS_REVIEW_STANDINGS = [
  'current',
  'expiring',
  'expired',
  'not_yet_valid',
  'terms_refused',
  'missing',
] as const;

export const FreeQuotaTermsSchema = z.object({
  commercialUseAllowed: z.boolean(),
  thirdPartyServingAllowed: z.boolean(),
  proxyingAllowed: z.boolean(),
  promptsExcludedFromTraining: z.boolean(),
});

export const FreeQuotaAttestedOfferingsSchema = z.union([
  z.literal('all'),
  z.array(z.string().min(1)).min(1),
]);

export const FreeQuotaAttestationRequestSchema = z.object({
  checkedAtMs: z.union([z.literal('now'), z.number().int().positive()]),
  quotaOnlyOfferings: FreeQuotaAttestedOfferingsSchema,
});

export const FreeQuotaAttestationReceiptSchema = z.object({
  checkedAtMs: z.number().int().positive(),
  freshUntilMs: z.number().int().positive(),
  offerings: z.union([z.literal('all'), z.number().int().positive()]),
});

export const FreeQuotaTermsReviewStatusSchema = z.object({
  standing: z.enum(FREE_QUOTA_TERMS_REVIEW_STANDINGS),
  review: z
    .object({
      reviewedBy: z.string().min(1),
      verifiedAtMs: z.number().int().positive(),
      expiresAtMs: z.number().int().positive(),
      evidenceUrl: z.url({ protocol: /^https?$/ }),
      terms: FreeQuotaTermsSchema,
      approvedOfferings: z.number().int().positive(),
    })
    .nullable(),
});

export const FreeQuotaAttestationStandingStatusSchema = z.object({
  standing: z.enum(FREE_QUOTA_ATTESTATION_STANDINGS),
  record: FreeQuotaAttestationReceiptSchema.extend({
    boundToCurrentKey: z.boolean(),
    attestedBy: z.string().min(1),
  }).nullable(),
});

export const FreeQuotaAttestationStatusSchema = z.discriminatedUnion('configured', [
  z.object({
    configured: z.literal(false),
    sharedState: z.boolean(),
    credential: z.boolean(),
    inventory: z.boolean(),
  }),
  z.object({
    configured: z.literal(true),
    nowMs: z.number().int().positive(),
    issuer: z.string().min(1),
    consolePage: z.url({ protocol: /^https$/ }),
    validForMs: z.number().int().positive(),
    recordWindowMs: z.number().int().positive(),
    consoleCheckReminderLeadMs: z.number().int().positive(),
    termsReviewReminderLeadMs: z.number().int().positive(),
    termsReview: FreeQuotaTermsReviewStatusSchema,
    attestation: FreeQuotaAttestationStandingStatusSchema,
    billingSignalAtMs: z.number().int().positive().nullable(),
    billingSignalUnreadable: z.boolean(),
    withdrawn: z.array(
      z.object({
        key: z.string().min(1),
        displayName: z.string().min(1),
        cause: z.enum(FREE_QUOTA_WITHDRAWAL_CAUSES),
      }),
    ),
    offerings: z.array(
      z.object({
        key: z.string().min(1),
        displayName: z.string().min(1),
        providerModelId: z.string().min(1),
        category: FreeQuotaModelSchema.shape.category,
        expiresOn: z.string().nullable(),
        attested: z.boolean(),
      }),
    ),
    serving: z.object({
      ready: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
      blocked: z.array(
        z.object({
          outcome: z.enum(FREE_QUOTA_BLOCKED_OUTCOMES),
          count: z.number().int().positive(),
        }),
      ),
    }),
  }),
]);

export type FreeQuotaUnavailableReason = (typeof FREE_QUOTA_UNAVAILABLE_REASONS)[number];
export type FreeQuotaBlockedOutcome = (typeof FREE_QUOTA_BLOCKED_OUTCOMES)[number];
export type FreeQuotaAttestationStanding = (typeof FREE_QUOTA_ATTESTATION_STANDINGS)[number];
export type FreeQuotaWithdrawalCause = (typeof FREE_QUOTA_WITHDRAWAL_CAUSES)[number];
export type FreeQuotaTermsReviewStanding = (typeof FREE_QUOTA_TERMS_REVIEW_STANDINGS)[number];
export type FreeQuotaTerms = z.infer<typeof FreeQuotaTermsSchema>;
export type FreeQuotaAttestationRequest = z.infer<typeof FreeQuotaAttestationRequestSchema>;
export type FreeQuotaAttestationReceipt = z.infer<typeof FreeQuotaAttestationReceiptSchema>;
export type FreeQuotaTermsReviewStatus = z.infer<typeof FreeQuotaTermsReviewStatusSchema>;
export type FreeQuotaAttestationStandingStatus = z.infer<
  typeof FreeQuotaAttestationStandingStatusSchema
>;
export type FreeQuotaAttestationStatus = z.infer<typeof FreeQuotaAttestationStatusSchema>;
