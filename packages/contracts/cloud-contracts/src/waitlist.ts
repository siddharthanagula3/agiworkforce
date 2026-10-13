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
  people: z.number().int().nonnegative(),
  byPlan: z.array(OperatorWaitlistCountSchema),
  byInterval: z.array(OperatorWaitlistCountSchema),
  bySource: z.array(OperatorWaitlistCountSchema),
  byDay: z.array(OperatorWaitlistCountSchema),
  byDayWindowDays: z.number().int().positive(),
  entries: z.array(OperatorUpgradeWaitlistEntrySchema),
});
export type OperatorUpgradeWaitlistResponse = z.infer<typeof OperatorUpgradeWaitlistResponseSchema>;

export type OperatorWaitlistResponse =
  OperatorPublicWaitlistResponse | OperatorUpgradeWaitlistResponse;

export const OPERATOR_UPGRADE_ACCESS_PATH = '/api/admin/upgrade-access';
export const OPERATOR_UPGRADE_ACCESS_CODES_PATH = '/api/admin/upgrade-access/codes';

export const OperatorUpgradeAccessChangeSchema = z.object({ open: z.boolean() }).strict();
export type OperatorUpgradeAccessChange = z.infer<typeof OperatorUpgradeAccessChangeSchema>;

export const OperatorUpgradeAccessStateSchema = z.object({
  open: z.boolean(),
  switchOpen: z.boolean(),
  forcedOpenByEnvironment: z.boolean(),
  targetingRules: z.number().int().nonnegative(),
  lastChange: z
    .object({
      opened: z.boolean(),
      changedAt: z.string().min(1),
      changedBy: z.string().nullable(),
    })
    .nullable(),
});
export type OperatorUpgradeAccessState = z.infer<typeof OperatorUpgradeAccessStateSchema>;

export const UPGRADE_ACCESS_CODE_MAX_LENGTH = 50;
export const UPGRADE_ACCESS_CODE_MIN_LENGTH = 6;
export const UPGRADE_ACCESS_CODE_MAX_REDEMPTIONS = 100_000;
export const UPGRADE_ACCESS_CODE_NOTE_MAX_LENGTH = 200;

export const OperatorUpgradeAccessCodeCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(UPGRADE_ACCESS_CODE_MIN_LENGTH)
      .max(UPGRADE_ACCESS_CODE_MAX_LENGTH)
      .regex(/^[A-Za-z0-9]+$/)
      .transform((value) => value.toUpperCase())
      .optional(),
    maxRedemptions: z.number().int().min(1).max(UPGRADE_ACCESS_CODE_MAX_REDEMPTIONS),
    expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
    note: z.string().trim().max(UPGRADE_ACCESS_CODE_NOTE_MAX_LENGTH).optional(),
  })
  .strict();
export type OperatorUpgradeAccessCodeCreate = z.infer<typeof OperatorUpgradeAccessCodeCreateSchema>;

export const OperatorUpgradeAccessCodeDisableSchema = z.object({ id: z.string().uuid() }).strict();

export const OperatorUpgradeAccessCodeSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  maxRedemptions: z.number().int().nonnegative(),
  redemptions: z.number().int().nonnegative(),
  expiresAt: z.string().nullable(),
  active: z.boolean(),
  note: z.string().nullable(),
  createdAt: z.string().min(1),
  createdBy: z.string().nullable(),
});
export type OperatorUpgradeAccessCode = z.infer<typeof OperatorUpgradeAccessCodeSchema>;

export const OperatorUpgradeAccessCodesResponseSchema = z.object({
  codes: z.array(OperatorUpgradeAccessCodeSchema),
  truncated: z.boolean(),
});
export type OperatorUpgradeAccessCodesResponse = z.infer<
  typeof OperatorUpgradeAccessCodesResponseSchema
>;

export const OperatorUpgradeAccessCodeResponseSchema = z.object({
  code: OperatorUpgradeAccessCodeSchema,
});
