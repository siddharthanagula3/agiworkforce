import 'server-only';

import type { UserScopedDbOptions } from '@/lib/server/rls-db';

export const TWO_FACTOR_SCOPE: UserScopedDbOptions = {
  mfaEnrollment: true,
  resolveOrganization: false,
};
