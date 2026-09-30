import { z } from 'zod';

export const FREE_QUOTA_CATALOGUE_PATH = '/api/models/free-quota';
export const FREE_QUOTA_COMPLETIONS_PATH = '/api/models/free-quota/completions';
export const FREE_QUOTA_EXHAUSTED_CODE = 'free_quota_exhausted';

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
