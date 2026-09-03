import 'server-only';

import { FIRST_PARTY_MCP_TARGETS } from '@/lib/connectors/directory/sources/first-party-targets';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

function unionCategories(
  current: readonly string[],
  incoming: readonly string[],
): readonly string[] {
  return [...new Set([...current, ...incoming])];
}

export function applyFirstPartyTargets(records: readonly DirectoryRecord[]): DirectoryRecord[] {
  const targetsById = new Map(
    FIRST_PARTY_MCP_TARGETS.map((target) => [target.connectorId, target]),
  );

  return records.map((record) => {
    const target = targetsById.get(record.id);
    if (!target) return record;

    const useTargetUrl = target.overridesInternalUrl || record.remotes.length === 0;

    return {
      ...record,
      remotes: useTargetUrl ? [{ url: target.url, transport: target.transport }] : record.remotes,
      toolNames: target.toolNames.length > 0 ? target.toolNames : record.toolNames,
      docsUrl: target.docsUrl,
      categories: unionCategories(record.categories, target.categories),
    };
  });
}
