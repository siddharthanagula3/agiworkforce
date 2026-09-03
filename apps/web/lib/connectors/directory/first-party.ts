import 'server-only';

import firstPartyTargetsJson from '@/lib/connectors/directory/sources/first-party.json';
import { deriveInternalBadge } from '@/lib/connectors/directory/badge';
import { brandSlugForConnectorId } from '@/lib/connectors/directory/brand-icons';
import { connectableForInternalId } from '@/lib/connectors/directory/connectable';
import { deriveDirectoryCategories } from '@/lib/connectors/directory/categorize';
import { deriveMonogram } from '@/lib/connectors/directory/monogram';
import type {
  DirectoryIconSource,
  DirectoryRecord,
  DirectoryTransport,
} from '@/lib/connectors/directory/types';

export interface FirstPartyTarget {
  readonly connectorId: string;
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly transport: DirectoryTransport;
  readonly toolNames: readonly string[];
  readonly documentationUrl: string;
  readonly overridesInternalUrl: boolean;
  readonly directoryOnly: boolean;
}

export const FIRST_PARTY_MCP_TARGETS: readonly FirstPartyTarget[] =
  firstPartyTargetsJson as FirstPartyTarget[];

function unionCategories(
  current: readonly string[],
  incoming: readonly string[],
): readonly string[] {
  return [...new Set([...current, ...incoming])];
}

function richerDescription(current: string, incoming: string): string {
  return incoming.length > current.length ? incoming : current;
}

function deriveAuthorUrl(documentationUrl: string): string | null {
  try {
    return new URL(documentationUrl).origin;
  } catch {
    return null;
  }
}

function upgradeIconSource(current: DirectoryIconSource): DirectoryIconSource {
  return current === 'monogram' ? 'site' : current;
}

function enrichRecord(record: DirectoryRecord, target: FirstPartyTarget): DirectoryRecord {
  const useTargetUrl =
    !target.directoryOnly && (target.overridesInternalUrl || record.remotes.length === 0);
  const targetCategories = deriveDirectoryCategories(target.description, target.name);

  return {
    ...record,
    description: richerDescription(record.description, target.description),
    remotes: useTargetUrl ? [{ url: target.url, transport: target.transport }] : record.remotes,
    toolNames: target.toolNames.length > 0 ? target.toolNames : record.toolNames,
    documentationUrl: target.documentationUrl,
    categories: unionCategories(record.categories, targetCategories),
    authorUrl: record.authorUrl ?? deriveAuthorUrl(target.documentationUrl),
    iconSource: upgradeIconSource(record.iconSource),
  };
}

function standaloneRecord(target: FirstPartyTarget): DirectoryRecord {
  const brandSlug = brandSlugForConnectorId(target.connectorId);

  return {
    id: target.connectorId,
    name: target.name,
    publisher: target.name,
    description: target.description,
    categories: deriveDirectoryCategories(target.description, target.name),
    remotes: target.directoryOnly ? [] : [{ url: target.url, transport: target.transport }],
    authMode: 'oauth',
    connectable: connectableForInternalId(target.connectorId),
    toolNames: target.toolNames,
    repositoryUrl: null,
    version: null,
    sourceRegistry: 'internal',
    badge: deriveInternalBadge(),
    iconUrl: null,
    monogram: deriveMonogram(target.name),
    documentationUrl: target.documentationUrl,
    iconSource: brandSlug ? 'brand' : 'site',
    brandSlug,
    authorName: target.name,
    authorUrl: deriveAuthorUrl(target.documentationUrl),
    websiteUrl: null,
    supportUrl: null,
    privacyPolicyUrl: null,
  };
}

export function applyFirstPartyTargets(records: readonly DirectoryRecord[]): DirectoryRecord[] {
  const targetsById = new Map(
    FIRST_PARTY_MCP_TARGETS.map((target) => [target.connectorId, target]),
  );
  const matchedIds = new Set<string>();

  const enriched = records.map((record) => {
    const target = targetsById.get(record.id);
    if (!target) return record;
    matchedIds.add(target.connectorId);
    return enrichRecord(record, target);
  });

  const standalone = FIRST_PARTY_MCP_TARGETS.filter(
    (target) => !matchedIds.has(target.connectorId),
  ).map(standaloneRecord);

  return [...enriched, ...standalone];
}
