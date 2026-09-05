import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { resolveSupportAccountContext } from '../../account/context-resolver';
import { SupportActionRefusal, type SupportActionResult } from '../types';

const PG_UNDEFINED_TABLE = '42P01';

export const CUSTOM_CONNECTOR_PREFIX = 'custom-';

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

export async function assertConnectorRevocable(
  db: DatabaseAdapter,
  userId: string,
  connectorId: string,
): Promise<void> {
  if (connectorId.startsWith(CUSTOM_CONNECTOR_PREFIX)) refuseCustomConnector();

  const context = await resolveSupportAccountContext(db, userId);
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
  db: DatabaseAdapter;
  userId: string;
  connectorId: string;
}): Promise<SupportActionResult> {
  const { db, userId, connectorId } = args;
  if (connectorId.startsWith(CUSTOM_CONNECTOR_PREFIX)) refuseCustomConnector();

  if (connectorId === 'github') {
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
