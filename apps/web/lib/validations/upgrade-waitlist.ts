import { z } from 'zod';
import { isSelfServePaidPlanTier } from '@agiworkforce/types';

export const WAITLIST_ACCESS_REQUIRED_CODE = 'waitlist_access_required';

export const UpgradeWaitlistStatusSchema = z.object({
  joinedPlans: z.array(z.string()).transform((plans) => plans.filter(isSelfServePaidPlanTier)),
  upgradeGateEnabled: z.boolean(),
  accessGranted: z.boolean(),
  noticeEmail: z.string().nullable().optional(),
});

export type UpgradeWaitlistStatus = z.output<typeof UpgradeWaitlistStatusSchema>;
