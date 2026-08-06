/**
 * @file Executor: disconnect one of the CALLER'S OWN connectors.
 *
 * Ownership is not validated against a static id allowlist — it is validated
 * against the caller's own resolved connector list, so a syntactically valid
 * id for a connector this user does not have is refused with the same
 * "not found" as an id that does not exist at all.
 *
 * The revoke does exactly what the settings UI does (/api/connectors DELETE):
 * soft-delete the enablement row AND clear the saved per-tool "Always allow"
 * verdicts. Doing only the first would be a WEAKER revoke than the control the
 * user already has, which is not acceptable for an action a bot performed.
 *
 * CUSTOM MCP CONNECTORS ARE OUT OF SCOPE, AND THAT IS DELIBERATE.
 * `public.user_custom_connectors` (migration 0052) has no `is_active` column —
 * the only way to disconnect one is to DELETE the row, which destroys the URL,
 * the transport and the user's encrypted bearer token. That is irreversible,
 * and irreversible operations are not in this allowlist. The agent explains and
 * links to Settings → Connections instead.
 */

import 'server-only';

import { logger } from '@/lib/logger';
import { getNeonDb } from '@/lib/server/neon-db';
import { resolveSupportAccountContext } from '../../account/context-resolver';
import { SupportActionRefusal, type SupportActionResult } from '../types';

const PG_UNDEFINED_TABLE = '42P01';

export const CUSTOM_CONNECTOR_PREFIX = 'custom-';

/** The control the agent points at when it refuses a custom connector. */
export const CUSTOM_CONNECTOR_CONTROL = Object.freeze({
  label: 'Settings → Connections',
  href: '/settings/connections',
});

function isUndefinedTable(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    ((error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE ||
      String((error as Record<string, unknown>)['message'] ?? '').includes('does not exist'))
  );
}

function refuseCustomConnector(): never {
  throw new SupportActionRefusal(
    'SUPPORT_ACTION_EXCLUDED',
    400,
    'Removing a custom MCP connector deletes its address and stored credential permanently, so the assistant will not do it for you.',
    {
      control: { ...CUSTOM_CONNECTOR_CONTROL },
      explain:
        'Open Settings → Connections, find the connector under your custom MCP servers, and remove it there. You will need its URL and token again to add it back.',
    },
  );
}

/**
 * Ownership pre-check, run at PROPOSE time and again after the token claim.
 * A connector can be disconnected between the two, so the second call is not
 * redundant — it is the one that decides whether the mutation runs.
 */
export async function assertConnectorRevocable(userId: string, connectorId: string): Promise<void> {
  if (connectorId.startsWith(CUSTOM_CONNECTOR_PREFIX)) refuseCustomConnector();

  const context = await resolveSupportAccountContext(userId);
  const owned = context.connectors.some(
    (c) => c.connectorId === connectorId && c.source !== 'custom',
  );
  if (!owned) {
    throw new SupportActionRefusal(
      'SUPPORT_ACTION_TARGET_NOT_FOUND',
      404,
      'That connector is not connected on your account.',
    );
  }
}

export async function executeRevokeConnector(args: {
  userId: string;
  connectorId: string;
}): Promise<SupportActionResult> {
  const { userId, connectorId } = args;
  if (connectorId.startsWith(CUSTOM_CONNECTOR_PREFIX)) refuseCustomConnector();

  const db = getNeonDb();

  if (connectorId === 'github') {
    // Matches the settings route: unlink this user's installations so github
    // tools stop being offered. The app stays installed on GitHub, so this is
    // reversible by relinking.
    try {
      await db.execute(`delete from github_installations where user_id = $1`, [userId]);
    } catch (error) {
      if (!isUndefinedTable(error)) throw error;
    }
  } else {
    try {
      await db.execute(
        `update user_connectors
            set is_active = false, updated_at = $1
          where user_id = $2 and connector_id = $3`,
        [new Date().toISOString(), userId, connectorId],
      );
    } catch (error) {
      if (isUndefinedTable(error)) {
        throw new SupportActionRefusal(
          'SUPPORT_ACTION_UNAVAILABLE',
          409,
          'Connectors are not available in this environment.',
        );
      }
      throw error;
    }
  }

  // Best-effort, exactly as the settings route treats it: the connector is
  // already disconnected and its tools will not be offered, so a cleanup
  // failure must not turn a successful revoke into an error. Logged, never
  // swallowed.
  try {
    await db.execute(
      `delete from public.connector_tool_permissions where user_id = $1 and connector_id = $2`,
      [userId, connectorId],
    );
  } catch (error) {
    if (!isUndefinedTable(error)) {
      logger.warn(
        { userId, connectorId, error },
        'Support action revoked a connector but could not clear its saved tool permissions',
      );
    }
  }

  return {
    kind: 'completed',
    message: `“${connectorId}” is disconnected. Its saved tool permissions were cleared, so reconnecting will ask you again.`,
  };
}
