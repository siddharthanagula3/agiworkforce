import 'server-only';

import { getIdentityUser } from '@/lib/server/identity';

export interface PrimaryEmailState {
  confirmed: boolean;
  email: string | null;
}

export async function readPrimaryEmailState(userId: string): Promise<PrimaryEmailState> {
  const user = await getIdentityUser(userId);
  return {
    confirmed: user?.primaryEmailVerification === 'verified',
    email: user?.primaryEmail ?? null,
  };
}
