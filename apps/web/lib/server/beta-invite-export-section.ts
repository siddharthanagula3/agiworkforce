import 'server-only';

import { z } from 'zod';

const betaInviteExportSchema = z.object({
  id: z.string(),
  plan_tier: z.string().nullable(),
  trial_days: z.number().int().nonnegative().nullable(),
});

export const BETA_INVITE_EXPORT_SECTION = {
  sql: `select id, plan_tier, trial_days
        from beta_invites where id = any($1::uuid[])`,
  schema: betaInviteExportSchema,
  section: 'beta_invites',
};
