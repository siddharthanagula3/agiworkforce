import 'server-only';

import type { UserScopedDbOptions } from '@/lib/server/rls-db';

export const TWO_FACTOR_SCOPE: UserScopedDbOptions = {
  mfaGateExemptForOwner: true,
  resolveOrganization: false,
};
