import 'server-only';

import { withUserConnectorMcpHandle } from '@/lib/user-connector-tools';
import {
  readDirectorySnapshot,
  upsertDirectoryRecord,
} from '@/lib/connectors/directory/snapshot-cache';

export async function discoverAndCacheToolNames(
  userId: string,
  connectorId: string,
): Promise<readonly string[] | null> {
  const snapshot = await readDirectorySnapshot();
  const existing = snapshot?.records.find((record) => record.id === connectorId);
  if (existing && existing.toolNames.length > 0) return existing.toolNames;

  const toolNames = await withUserConnectorMcpHandle(userId, connectorId, async ({ handle }) =>
    handle.catalog.tools.map((tool) => tool.toolName),
  );
  if (toolNames === null || toolNames.length === 0) return existing?.toolNames ?? null;

  if (existing) await upsertDirectoryRecord({ ...existing, toolNames });
  return toolNames;
}
