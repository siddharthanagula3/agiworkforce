import 'server-only';

import firstPartyTargetsJson from '@/lib/connectors/directory/sources/first-party.json';
import { deriveInternalBadge } from '@/lib/connectors/directory/badge';
import {
  brandSlugForConnectorId,
  brandSlugForSignals,
} from '@/lib/connectors/directory/brand-icons';
import { deriveDirectoryCategories } from '@/lib/connectors/directory/categorize';
import { connectableForInternalId } from '@/lib/connectors/directory/connectable';
import { hostnameOf, originOf } from '@/lib/connectors/directory/hosts';
import { unionCategories } from '@/lib/connectors/directory/merge';
import { deriveMonogram, deriveMonogramHue } from '@/lib/connectors/directory/monogram';
import { summarizeDescription } from '@/lib/connectors/directory/summary';
import type {
  DirectoryAuthMode,
  DirectoryIconSource,
  DirectoryRecord,
  DirectoryTransport,
} from '@/lib/connectors/directory/types';

const DEFAULT_FIRST_PARTY_AUTH_MODE: DirectoryAuthMode = 'oauth';

export interface FirstPartyTarget {
  readonly connectorId: string;
  readonly name: string;
  readonly description: string;
  readonly url: string;
  readonly transport: DirectoryTransport;
  readonly authMode?: DirectoryAuthMode;
  readonly toolNames: readonly string[];
  readonly documentationUrl: string;
  readonly overridesInternalUrl: boolean;
  readonly directoryOnly: boolean;
}

export const FIRST_PARTY_MCP_TARGETS: readonly FirstPartyTarget[] =
  firstPartyTargetsJson as FirstPartyTarget[];

function targetHosts(target: FirstPartyTarget): string[] {
  const host = hostnameOf(target.url);
  return host ? [host] : [];
}

function targetCategories(target: FirstPartyTarget) {
  return deriveDirectoryCategories({
    name: target.name,
    description: target.description,
    hosts: targetHosts(target),
  });
}

function upgradeIconSource(current: DirectoryIconSource): DirectoryIconSource {
  return current === 'monogram' ? 'site' : current;
}

function enrichRecord(record: DirectoryRecord, target: FirstPartyTarget): DirectoryRecord {
  const useTargetUrl =
    !target.directoryOnly && (target.overridesInternalUrl || record.remotes.length === 0);
  const categories = unionCategories(record.categories, targetCategories(target));
  const primaryCategory = categories[0] ?? '';

  return {
    ...record,
    description: summarizeDescription(target.description, target.name, primaryCategory),
    remotes: useTargetUrl ? [{ url: target.url, transport: target.transport }] : record.remotes,
    toolNames: target.toolNames.length > 0 ? target.toolNames : record.toolNames,
    documentationUrl: target.documentationUrl,
    categories,
    monogramHue: deriveMonogramHue(categories),
    authorUrl: record.authorUrl ?? originOf(target.documentationUrl),
    iconSource: upgradeIconSource(record.iconSource),
  };
}

function standaloneRecord(target: FirstPartyTarget): DirectoryRecord {
  const brandSlug =
    brandSlugForConnectorId(target.connectorId) ??
    brandSlugForSignals({ publisher: target.name, hosts: targetHosts(target) });
  const categories = targetCategories(target);
  const primaryCategory = categories[0] ?? '';

  return {
    id: target.connectorId,
    name: target.name,
    publisher: target.name,
    description: summarizeDescription(target.description, target.name, primaryCategory),
    categories,
    remotes: target.directoryOnly ? [] : [{ url: target.url, transport: target.transport }],
    authMode: target.authMode ?? DEFAULT_FIRST_PARTY_AUTH_MODE,
    connectable: connectableForInternalId(target.connectorId),
    toolNames: target.toolNames,
    repositoryUrl: null,
    version: null,
    sourceRegistry: 'internal',
    badge: deriveInternalBadge(),
    iconUrl: null,
    monogram: deriveMonogram(target.name),
    monogramHue: deriveMonogramHue(categories),
    documentationUrl: target.documentationUrl,
    iconSource: brandSlug ? 'brand' : 'site',
    brandSlug,
    authorName: target.name,
    authorUrl: originOf(target.documentationUrl),
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
