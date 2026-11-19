import 'server-only';

import type { IdentityUser } from '@agiworkforce/identity';
import { withTimeout } from '@agiworkforce/utils';

import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getIdentityUser } from '@/lib/server/identity';
import { IDENTITY_LOOKUP_TIMEOUT_MS } from '@/lib/server/identity-timeouts';

export interface PrimaryEmailState {
  confirmed: boolean;
  email: string | null;
}

export const UNCONFIRMED_EMAIL_MESSAGE =
  'Confirm your email address first. Sign in again and we will email you a code.';

export const MISSING_REPLY_EMAIL_MESSAGE =
  'Add an email address to your account so support can reply.';

const EMAIL_UNREADABLE_MESSAGE =
  'Your email address could not be checked, so nothing was changed. Try again in a moment.';

export async function readPrimaryEmailState(
  userId: string,
  timeoutMs: number = IDENTITY_LOOKUP_TIMEOUT_MS,
): Promise<PrimaryEmailState> {
  let user: IdentityUser | null;
  try {
    user = await withTimeout(() => getIdentityUser(userId), timeoutMs);
  } catch (error) {
    logger.warn({ userId, error }, 'Primary email lookup failed');
    throw createError.serviceUnavailable(EMAIL_UNREADABLE_MESSAGE).asUserSafe();
  }
  return {
    confirmed: user?.primaryEmailVerification === 'verified',
    email: user?.primaryEmail ?? null,
  };
}

/**
 * The address a reply goes to. A session token may carry no email claim (the
 * native app's never does), so the account's primary email stands in, and only
 * once the identity provider has verified it.
 */
export async function requireReplyEmail(
  userId: string,
  claimedEmail: string | null | undefined,
): Promise<string> {
  if (claimedEmail) return claimedEmail;
  const account = await readPrimaryEmailState(userId);
  if (!account.email) throw createError.validation(MISSING_REPLY_EMAIL_MESSAGE);
  if (!account.confirmed) throw createError.validation(UNCONFIRMED_EMAIL_MESSAGE);
  return account.email;
}
