import { z } from 'zod';

export const MOBILE_INTENT_TOKEN_PATH = '/api/mobile/intent-token';
export const MOBILE_INTENT_ASK_PATH = '/api/mobile/intent/ask';
export const MOBILE_INTENT_PROMPT_MAX_CHARS = 2_000;

const InstallIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/);

export const MobileIntentTokenIssueRequestSchema = z
  .object({
    installId: InstallIdSchema,
    defaultModelId: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const MobileIntentTokenIssueResponseSchema = z.object({
  token: z.string().regex(/^agi_it_[A-Za-z0-9_-]{43}$/),
});

export const MobileIntentTokenRevokeRequestSchema = z
  .object({ installId: InstallIdSchema.optional() })
  .strict();

export const MobileIntentAskRequestSchema = z
  .object({ prompt: z.string().trim().min(1).max(MOBILE_INTENT_PROMPT_MAX_CHARS) })
  .strict();

export const MobileIntentAskResponseSchema = z.object({
  text: z.string(),
  conversationId: z.string().uuid(),
});

export type MobileIntentTokenIssueResponse = z.infer<typeof MobileIntentTokenIssueResponseSchema>;
export type MobileIntentAskResponse = z.infer<typeof MobileIntentAskResponseSchema>;
