import { z } from 'zod';

export const TERMS_ACCEPTANCE_PATH = '/api/terms/accept';

export const TermsStatusSchema = z.object({
  currentVersion: z.string().min(1),
  accepted: z.boolean(),
});

export const TermsAcceptanceSchema = z.object({
  version: z.string().min(1),
  acceptedAt: z.string().datetime({ offset: true }),
});
