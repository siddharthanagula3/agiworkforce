import type { IdentityUser } from '@agiworkforce/identity';

export const NEW_ACCOUNT_WINDOW_MS = 10 * 60_000;
export const SIGN_UP_AGREEMENT_NOT_APPLICABLE_STATUS = 412;
const CLOCK_SKEW_ALLOWANCE_MS = 60_000;

/**
 * Whether the account was created moments ago, judged from the identity
 * provider's own record. The browser cannot vouch for this: the provider's
 * client drops a finished sign-up once it is finalized, and the page load that
 * follows starts from a client that never held it.
 */
export function isNewAccount(
  account: Pick<IdentityUser, 'createdAt'> | null,
  now: number = Date.now(),
): boolean {
  if (!account || account.createdAt === null) return false;
  const age = now - account.createdAt;
  return age >= -CLOCK_SKEW_ALLOWANCE_MS && age <= NEW_ACCOUNT_WINDOW_MS;
}
