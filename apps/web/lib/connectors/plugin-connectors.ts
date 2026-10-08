import 'server-only';

import type { NextRequest } from 'next/server';
import type { PluginConnectorRegistration } from '@agiworkforce/cloud-contracts';

import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getUserScopedDb } from '@/lib/server/rls-db';
import { recordAuditEvent } from '@/lib/security-audit';
import { evictCustomConnectorCaches } from '@/lib/user-connector-tools';
import { createCustomConnector } from '@/lib/connectors/custom-connector-creation';
import { disconnectConnectorOAuthGrant } from '@/lib/connectors/oauth-access';
import {
  clearConnectorToolPermissions,
  customConnectorId,
} from '@/lib/connectors/mcp-custom-connections';

const CONNECTOR_SCOPE = { resolveOrganization: false } as const;
const CONFLICT_STATUS = 409;
const AUDIT_SOURCE = 'plugin';
const AUDIT_RESOURCE_TYPE = 'custom_mcp_connector';
const SSE_TRANSPORT = 'sse';
const HTTP_TRANSPORT = 'streamable-http';
const NAME_SEPARATOR = ': ';
const FAILED_FALLBACK = 'The server could not be reached.';

export interface PluginConnectorServer {
  name: string;
  transport: string;
  url?: string;
}

export interface PluginConnectorSource {
  pluginKey: string;
  pluginName: string;
  servers: readonly PluginConnectorServer[];
}

export async function registerPluginConnectors(
  request: NextRequest,
  plugins: readonly PluginConnectorSource[],
): Promise<PluginConnectorRegistration> {
  const registration: PluginConnectorRegistration = { added: [], failed: [] };
  if (!plugins.some((plugin) => plugin.servers.some((server) => server.url))) return registration;
  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);
  for (const plugin of plugins) {
    for (const server of plugin.servers) {
      if (!server.url) continue;
      const name = `${plugin.pluginName}${NAME_SEPARATOR}${server.name}`;
      try {
        const created = await createCustomConnector(db, {
          userId,
          request,
          name,
          url: server.url,
          transport: server.transport === SSE_TRANSPORT ? SSE_TRANSPORT : HTTP_TRANSPORT,
          auditSource: AUDIT_SOURCE,
        });
        await db.execute(
          `update public.user_custom_connectors
              set installed_by_plugin = $3
            where id = $1 and user_id = $2`,
          [created.connector.id, userId, plugin.pluginKey],
        );
        registration.added.push({ name, signInRequired: created.signInRequired });
      } catch (error) {
        if (isAppError(error) && error.statusCode === CONFLICT_STATUS) continue;
        logger.warn(
          { error, userId, pluginKey: plugin.pluginKey, server: server.name },
          '[plugin-connectors] a plugin MCP server was not added as a connector',
        );
        registration.failed.push({
          name,
          reason: isAppError(error) && error.isClientSafe() ? error.message : FAILED_FALLBACK,
        });
      }
    }
  }
  return registration;
}

export async function removePluginConnectors(
  request: NextRequest,
  pluginKey: string,
): Promise<void> {
  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);
  const removed = await db.query<{ id: string; short_id: string }>(
    `delete from public.user_custom_connectors
      where user_id = $1 and installed_by_plugin = $2
      returning id, short_id`,
    [userId, pluginKey],
  );
  for (const row of removed) {
    const connectorId = customConnectorId(row.short_id);
    await evictCustomConnectorCaches(userId, row.id);
    await disconnectConnectorOAuthGrant(userId, connectorId);
    await clearConnectorToolPermissions(db, userId, connectorId);
    await recordAuditEvent({
      userId,
      eventType: 'connector_removed',
      request,
      detail: {
        resourceType: AUDIT_RESOURCE_TYPE,
        resourceId: row.id,
        connectorId,
        source: AUDIT_SOURCE,
        reason: `removed with plugin ${pluginKey}`,
      },
    });
  }
}

export async function setPluginConnectorsEnabled(
  request: NextRequest,
  pluginKey: string,
  enabled: boolean,
): Promise<void> {
  const { db, userId } = await getUserScopedDb(request, CONNECTOR_SCOPE);
  const changed = await db.query<{ id: string }>(
    `update public.user_custom_connectors
        set disabled_by_plugin_at = case when $3 then null else coalesce(disabled_by_plugin_at, now()) end,
            updated_at = now()
      where user_id = $1 and installed_by_plugin = $2
        and (disabled_by_plugin_at is null) = $3
      returning id`,
    [userId, pluginKey, enabled],
  );
  for (const row of changed) await evictCustomConnectorCaches(userId, row.id);
}
