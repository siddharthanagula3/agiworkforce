import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { logger } from '@/lib/logger';
import { resolveSupportAccountContext } from '../../account/context-resolver';
import { SupportActionRefusal, type SupportActionResult } from '../types';

export const CUSTOM_CONNECTOR_PREFIX = 'custom-';

export const CUSTOM_CONNECTOR_CONTROL = Object.freeze({
  label: 'Settings → Connections',
  href: '/settings/connections',
});

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
    await db.execute(`delete from github_installations where user_id = $1`, [userId]);
  } else {
    await db.execute(
      `update user_connectors
          set is_active = false, updated_at = $1
        where user_id = $2 and connector_id = $3`,
      [new Date().toISOString(), userId, connectorId],
    );
  }

  try {
    await db.execute(
      `delete from public.connector_tool_permissions where user_id = $1 and connector_id = $2`,
      [userId, connectorId],
    );
  } catch (error) {
    logger.warn(
      { userId, connectorId, error },
      'Support action revoked a connector but could not clear its saved tool permissions',
    );
  }

  return {
    kind: 'completed',
    message: `“${connectorId}” is disconnected. Its saved tool permissions were cleared, so reconnecting will ask you again.`,
  };
}
