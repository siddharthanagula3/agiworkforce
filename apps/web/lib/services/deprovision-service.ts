import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { unshareConnector } from '@/lib/services/org-shared-connector-service';
import { evictOrgSharedConnectorCaches } from '@/lib/user-connector-tools';

export interface DeprovisionResult {
  userId: string;
  organizationId: string;
  sessionsRevoked: number;
  sessionsFailed: number;
  deviceTokensRevoked: number;
  apiKeysRevoked: number;
  /** Connectors of theirs the workspace was still invoking, now unshared. */
  sharedConnectorsUnshared: number;
  /** Non-fatal problems. Deprovision reports what it could not reach. */
  errors: string[];
}

/** Bounded so one leaver with many sessions cannot stall the removal request. */
const REVOKE_BATCH = 10;
const MAX_SESSION_PAGES = 10;
const SESSION_PAGE_SIZE = 50;

interface SessionRevoker {
  sessions: {
    getSessionList(options: {
      userId: string;
      status: 'active';
      limit: number;
      offset: number;
    }): Promise<{ data: Array<{ id: string }> }>;
    revokeSession(sessionId: string): Promise<unknown>;
  };
}

async function revokeClerkSessions(
  client: SessionRevoker,
  userId: string,
): Promise<{ revoked: number; failed: number; errors: string[] }> {
  const ids: string[] = [];
  const errors: string[] = [];

  try {
    for (let page = 0; page < MAX_SESSION_PAGES; page++) {
      const response = await client.sessions.getSessionList({
        userId,
        status: 'active',
        limit: SESSION_PAGE_SIZE,
        offset: page * SESSION_PAGE_SIZE,
      });
      ids.push(...response.data.map((session) => session.id));
      if (response.data.length < SESSION_PAGE_SIZE) break;
    }
  } catch (error) {
    // Listing failed, so we cannot know what to revoke. Say so rather than
    // reporting zero sessions as if the user had none.
    errors.push(
      `Could not list sessions, so none were revoked: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { revoked: 0, failed: 0, errors };
  }

  let revoked = 0;
  let failed = 0;

  for (let index = 0; index < ids.length; index += REVOKE_BATCH) {
    const batch = ids.slice(index, index + REVOKE_BATCH);
    const results = await Promise.allSettled(batch.map((id) => client.sessions.revokeSession(id)));
    for (const result of results) {
      if (result.status === 'fulfilled') revoked += 1;
      else failed += 1;
    }
  }

  if (failed > 0) errors.push(`${failed} session(s) could not be revoked and may still be live.`);
  return { revoked, failed, errors };
}

/**
 * Revokes every credential a departing member holds.
 *
 * Each step is independent and a failure in one does not abandon the rest: a
 * Clerk outage must not leave the member's developer keys live as well. What
 * could not be reached is returned so the caller can record it, because a
 * deprovision that silently half-succeeded is worse than one that failed
 * loudly.
 *
 * Device tokens and API keys are revoked for the USER, not scoped to the
 * organization: neither carries an organization column, and a credential that
 * can still reach the workspace's data through a stale scope is exactly what
 * this exists to prevent. The member re-issues them from their personal account
 * if they still need them.
 */
export async function deprovisionMember(
  db: DatabaseAdapter,
  clerk: SessionRevoker,
  input: { userId: string; organizationId: string },
): Promise<DeprovisionResult> {
  const { userId, organizationId } = input;
  const errors: string[] = [];

  const sessions = await revokeClerkSessions(clerk, userId);
  errors.push(...sessions.errors);

  let deviceTokensRevoked = 0;
  try {
    const rows = await db.query<{ id: string }>(
      `update public.device_refresh_tokens
          set revoked_at = now()
        where user_id = $1 and revoked_at is null
        returning id`,
      [userId],
    );
    deviceTokensRevoked = rows.length;
  } catch (error) {
    errors.push(
      `Device tokens were not revoked: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let apiKeysRevoked = 0;
  try {
    const rows = await db.query<{ id: string }>(
      `update public.api_keys
          set revoked_at = now()
        where user_id = $1 and revoked_at is null
        returning id`,
      [userId],
    );
    apiKeysRevoked = rows.length;
  } catch (error) {
    errors.push(
      `API keys were not revoked: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let sharedConnectorsUnshared = 0;
  try {
    const shares = await db.query<{ connector_row_id: string }>(
      `select s.connector_row_id
         from public.organization_shared_connectors s
         join public.user_custom_connectors c on c.id = s.connector_row_id
        where s.organization_id = $1
          and c.user_id = $2`,
      [organizationId, userId],
    );
    for (const share of shares) {
      const removed = await unshareConnector(db, organizationId, share.connector_row_id);
      if (!removed) continue;
      sharedConnectorsUnshared += 1;
      // Same follow-up the interactive unshare does: a warm instance would keep
      // advertising the leaver's tools from its cached catalog until the TTL.
      await evictOrgSharedConnectorCaches(organizationId, share.connector_row_id);
    }
  } catch (error) {
    errors.push(
      `Connectors shared with the workspace were not unshared: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const result: DeprovisionResult = {
    userId,
    organizationId,
    sessionsRevoked: sessions.revoked,
    sessionsFailed: sessions.failed,
    deviceTokensRevoked,
    apiKeysRevoked,
    sharedConnectorsUnshared,
    errors,
  };

  if (errors.length > 0) {
    logger.error({ ...result }, '[deprovision] member deprovisioned with unreached credentials');
  } else {
    logger.info({ ...result }, '[deprovision] member credentials revoked');
  }

  return result;
}
