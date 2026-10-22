import 'server-only';

import { z } from 'zod';
import { absoluteUrl } from '@/lib/seo/site';
import { readEmailLinkToken, signEmailLinkToken } from '@/lib/services/signed-email-link';

const TRIAL_CANCEL_LINK_PURPOSE = 'trial-cancel-link';

export const TRIAL_CANCEL_PATH = '/trial/cancel';

const TrialCancelLinkSchema = z
  .object({
    purpose: z.literal(TRIAL_CANCEL_LINK_PURPOSE),
    userId: z.string().min(1),
    subscriptionId: z.string().regex(/^sub_[A-Za-z0-9]+$/),
    trialEnd: z.number().int().positive(),
  })
  .strict();

export interface TrialCancelLink {
  userId: string;
  subscriptionId: string;
  trialEnd: number;
}

export function trialCancelUrl(link: TrialCancelLink): string | null {
  const payload = TrialCancelLinkSchema.parse({ purpose: TRIAL_CANCEL_LINK_PURPOSE, ...link });
  const token = signEmailLinkToken(TRIAL_CANCEL_LINK_PURPOSE, payload);
  if (!token) return null;
  return absoluteUrl(`${TRIAL_CANCEL_PATH}?token=${encodeURIComponent(token)}`);
}

export function readTrialCancelToken(
  token: string | null | undefined,
  nowMs = Date.now(),
): TrialCancelLink | null {
  const parsed = readEmailLinkToken(TRIAL_CANCEL_LINK_PURPOSE, token, TrialCancelLinkSchema);
  if (!parsed || parsed.trialEnd * 1000 <= nowMs) return null;
  return {
    userId: parsed.userId,
    subscriptionId: parsed.subscriptionId,
    trialEnd: parsed.trialEnd,
  };
}
