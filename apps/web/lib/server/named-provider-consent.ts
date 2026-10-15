import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { ChineseHqProviderId, NamedProviderConsent } from '@agiworkforce/compliance';
import {
  NAMED_PROVIDER_CONSENT_NAMESPACE,
  readNamedProviderConsent,
} from '@/lib/named-provider-consent';

export async function loadNamedProviderConsent(
  db: Pick<DatabaseAdapter, 'query'>,
  userId: string,
  providerId: ChineseHqProviderId,
): Promise<NamedProviderConsent | null> {
  const [row] = await db.query<{ consent: unknown }>(
    `select settings -> $2::text as consent
       from public.user_settings
      where user_id = $1
      limit 1`,
    [userId, NAMED_PROVIDER_CONSENT_NAMESPACE],
  );
  return readNamedProviderConsent(row?.consent, providerId);
}
