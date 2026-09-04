import 'server-only';

import { withUserConnectorMcpHandle } from '@/lib/user-connector-tools';
import {
  getCachedToolNames,
  setCachedToolNames,
} from '@/lib/connectors/directory/tool-names-cache';

export async function discoverAndCacheToolNames(
  userId: string,
  connectorId: string,
  existingToolNames: readonly string[],
): Promise<readonly string[] | null> {
  if (existingToolNames.length > 0) return existingToolNames;

  const cached = await getCachedToolNames(connectorId);
  if (cached && cached.length > 0) return cached;

  const toolNames = await withUserConnectorMcpHandle(userId, connectorId, async ({ handle }) =>
    handle.catalog.tools.map((tool) => tool.toolName),
  );
  if (toolNames === null || toolNames.length === 0) return null;

  await setCachedToolNames(connectorId, toolNames);
  return toolNames;
}
