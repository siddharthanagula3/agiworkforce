import { z } from 'zod';

export const PUBLIC_WAITLIST_PATH = '/api/waitlist/public';

export const PublicWaitlistTokenResponseSchema = z.object({
  token: z.string().min(1),
});
export type PublicWaitlistTokenResponse = z.infer<typeof PublicWaitlistTokenResponseSchema>;

export const PublicWaitlistJoinResponseSchema = z.object({
  ok: z.literal(true),
  joined: z.literal(true),
});
export type PublicWaitlistJoinResponse = z.infer<typeof PublicWaitlistJoinResponseSchema>;

export const OPERATOR_WAITLIST_PATH = '/api/admin/waitlist';
export const OPERATOR_WAITLIST_EXPORT_PATH = '/api/admin/waitlist/export';

export const OPERATOR_WAITLIST_LISTS = ['public', 'upgrade'] as const;
export const OperatorWaitlistListSchema = z.enum(OPERATOR_WAITLIST_LISTS);
export type OperatorWaitlistList = z.infer<typeof OperatorWaitlistListSchema>;

export const OperatorWaitlistConsentSchema = z.object({
  purpose: z.string().min(1),
  granted: z.boolean(),
  recordedAt: z.string().min(1),
  noticeVersion: z.string(),
  surface: z.string(),
});
export type OperatorWaitlistConsent = z.infer<typeof OperatorWaitlistConsentSchema>;

export const OperatorPublicWaitlistEntrySchema = z.object({
  id: z.string().min(1),
  email: z.string().nullable(),
  source: z.string(),
  joinedAt: z.string().min(1),
  consent: z.array(OperatorWaitlistConsentSchema),
});
export type OperatorPublicWaitlistEntry = z.infer<typeof OperatorPublicWaitlistEntrySchema>;

export const OperatorUpgradeWaitlistEntrySchema = z.object({
  id: z.string().min(1),
  userId: z.string().nullable(),
  plan: z.string().nullable(),
  joinedAt: z.string().min(1),
});
export type OperatorUpgradeWaitlistEntry = z.infer<typeof OperatorUpgradeWaitlistEntrySchema>;

export const OperatorWaitlistCountSchema = z.object({
  key: z.string(),
  count: z.number().int().nonnegative(),
});
export type OperatorWaitlistCount = z.infer<typeof OperatorWaitlistCountSchema>;

const operatorWaitlistPageFields = {
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
};

export const OperatorPublicWaitlistResponseSchema = z.object({
  list: z.literal('public'),
  ...operatorWaitlistPageFields,
  bySource: z.array(OperatorWaitlistCountSchema),
  exportRowLimit: z.number().int().positive(),
  entries: z.array(OperatorPublicWaitlistEntrySchema),
});
export type OperatorPublicWaitlistResponse = z.infer<typeof OperatorPublicWaitlistResponseSchema>;

export const OperatorUpgradeWaitlistResponseSchema = z.object({
  list: z.literal('upgrade'),
  ...operatorWaitlistPageFields,
  byPlan: z.array(OperatorWaitlistCountSchema),
  entries: z.array(OperatorUpgradeWaitlistEntrySchema),
});
export type OperatorUpgradeWaitlistResponse = z.infer<typeof OperatorUpgradeWaitlistResponseSchema>;

export type OperatorWaitlistResponse =
  OperatorPublicWaitlistResponse | OperatorUpgradeWaitlistResponse;
