import 'server-only';

import { NeonMcpResponseCacheStore } from '@/lib/connectors/mcp-runtime-cache';

const TOOL_NAMES_CACHE_METHOD = 'connectors.directory.tool-names';
const TOOL_NAMES_TTL_MS = 30 * 24 * 60 * 60 * 1_000;

const cacheStore = new NeonMcpResponseCacheStore();

function toolNamesKey(connectorId: string) {
  return { method: TOOL_NAMES_CACHE_METHOD, params: connectorId, partition: '' };
}

export async function getCachedToolNames(connectorId: string): Promise<readonly string[] | null> {
  const entry = await cacheStore.get(toolNamesKey(connectorId));
  if (!entry) return null;
  try {
    return JSON.parse(entry.value) as string[];
  } catch {
    return null;
  }
}

export async function setCachedToolNames(
  connectorId: string,
  toolNames: readonly string[],
): Promise<void> {
  await cacheStore.set(toolNamesKey(connectorId), {
    value: JSON.stringify(toolNames),
    expiresAt: Date.now() + TOOL_NAMES_TTL_MS,
    scope: 'public',
  });
}
