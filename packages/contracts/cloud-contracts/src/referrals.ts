import { z } from 'zod';

export const REFERRALS_PATH = '/api/referrals';
export const REFERRAL_CODE_PATH = `${REFERRALS_PATH}/code`;

export const REFERRAL_STATUSES = [
  'signed_up',
  'converted',
  'rewarded',
  'capped',
  'blocked',
  'clawed_back',
] as const;

export const ReferralStatusSchema = z.enum(REFERRAL_STATUSES);
export type ReferralStatus = z.infer<typeof ReferralStatusSchema>;

export const ReferralOverviewSchema = z.object({
  code: z.string().nullable(),
  link: z.string().url().nullable(),
  program: z.object({
    friendTrialDays: z.number(),
    rewardCredits: z.number(),
    holdDays: z.number(),
    monthlyRewardCap: z.number(),
    yearlyRewardCap: z.number(),
    bonusExpiryDays: z.number(),
  }),
  stats: z.object({
    joined: z.number(),
    subscribed: z.number(),
    rewarded: z.number(),
    creditsEarned: z.number(),
  }),
  bonus: z.object({
    availableCredits: z.number(),
    nextExpiry: z.string().nullable(),
  }),
  friends: z.array(
    z.object({
      id: z.string(),
      status: ReferralStatusSchema,
      joinedAt: z.string(),
      rewardAt: z.string().nullable(),
    }),
  ),
});
export type ReferralOverviewResponse = z.infer<typeof ReferralOverviewSchema>;

export const ReferralCodeSchema = z.object({ code: z.string(), link: z.string().url() });
export type ReferralCodeResponse = z.infer<typeof ReferralCodeSchema>;
