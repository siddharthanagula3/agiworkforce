import 'server-only';

import type { McpToolCatalog } from '@agiworkforce/mcp';

export const orgSharedCatalogCache = new Map<
  string,
  { catalog: McpToolCatalog | null; expiresAt: number }
>();

export function orgSharedCacheKey(organizationId: string, rowId: string): string {
  return `${encodeURIComponent(organizationId)}:${encodeURIComponent(rowId)}`;
}

export async function evictOrgSharedConnectorCaches(
  organizationId: string,
  rowId: string,
): Promise<void> {
  const key = orgSharedCacheKey(organizationId, rowId);
  if (!orgSharedCatalogCache.has(key)) return;
  orgSharedCatalogCache.delete(key);
}
