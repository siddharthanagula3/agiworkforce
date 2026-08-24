import 'server-only';

import { logger } from '@/lib/logger';
import { getCurrentUserRlsDb } from '@/lib/server/rls-db';

interface TelemetryConsentRow {
  share_telemetry: string | null;
}

/**
 * The authoritative telemetry consent for the signed-in caller, read through
 * the RLS-scoped client so 0134's FORCE policy on `user_settings` stays real
 * rather than decorative (see app/api/settings/preferences/route.ts). Used to
 * render the account's real consent into the document server-side
 * (WEB-TELEMETRY-CONSENT-NOT-CROSS-DEVICE-01) so a brand-new device's first
 * paint doesn't depend on a localStorage mirror it has never written.
 *
 * Fails closed on every exit: signed out, no token, missing row, unset key,
 * or a DB error all resolve to false. A telemetry read must never be able to
 * break page rendering or default a user into being tracked.
 */
export async function readServerTelemetryConsent(): Promise<boolean> {
  try {
    const scoped = await getCurrentUserRlsDb();
    if (!scoped) return false;

    const rows = await scoped.db.query<TelemetryConsentRow>(
      `select settings #>> '{privacy,shareTelemetry}' as share_telemetry
         from public.user_settings
        where user_id = $1
        limit 1`,
      [scoped.userId],
    );
    return rows[0]?.share_telemetry === 'true';
  } catch (error) {
    logger.error({ error }, 'Failed to read server-side telemetry consent');
    return false;
  }
}
