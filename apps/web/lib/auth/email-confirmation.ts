import 'server-only';

import { getIdentityUser } from '@/lib/server/identity';

export interface PrimaryEmailState {
  confirmed: boolean;
  email: string | null;
}

export const UNCONFIRMED_EMAIL_MESSAGE =
  'Confirm your email address first. Sign in again and we will email you a code.';

export async function readPrimaryEmailState(userId: string): Promise<PrimaryEmailState> {
  const user = await getIdentityUser(userId);
  return {
    confirmed: user?.primaryEmailVerification === 'verified',
    email: user?.primaryEmail ?? null,
  };
}
