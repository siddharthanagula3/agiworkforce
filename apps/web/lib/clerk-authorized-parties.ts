import 'server-only';

import { getIdentityAuthorizedParties } from '@/lib/server/identity';

export function getClerkAuthorizedParties(): string[] {
  return [...getIdentityAuthorizedParties()];
}
