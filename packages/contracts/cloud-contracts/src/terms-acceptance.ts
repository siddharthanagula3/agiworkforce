import { z } from 'zod';

export const TERMS_ACCEPTANCE_PATH = '/api/terms/accept';

export const TERMS_ACCEPTANCE_SURFACES = ['web-signup', 'web-login', 'mobile-auth'] as const;

const POLICY_VERSION = z.string().min(1).max(32);

export const TermsAcceptanceRequestSchema = z.object({
  surface: z.enum(TERMS_ACCEPTANCE_SURFACES),
  version: POLICY_VERSION,
  marketingEmailNoticeVersion: POLICY_VERSION.optional(),
});

export type TermsAcceptanceRequest = z.infer<typeof TermsAcceptanceRequestSchema>;

export const TermsStatusSchema = z.object({
  currentVersion: z.string().min(1),
  accepted: z.boolean(),
});

export const TermsAcceptanceSchema = z.object({
  version: z.string().min(1),
  acceptedAt: z.string().datetime({ offset: true }),
});
