import 'server-only';

import { CONNECTORS, type ConnectorCategory } from '@/features/connectors/data/connectors';
import {
  allowsPresentTenseCopy,
  getConnectorCapability,
  getDeclaredConnectorActions,
} from '@/lib/connectors/catalog';
import { getMcpEndpoint } from '@/lib/connectors/mcp-endpoints';
import { deriveInternalBadge, upgradeToVerifiedBadge } from '@/lib/connectors/directory/badge';
import { brandSlugForConnectorId } from '@/lib/connectors/directory/brand-icons';
import { OTHER_CATEGORY, type DirectoryCategory } from '@/lib/connectors/directory/categorize';
import { connectableForInternalId } from '@/lib/connectors/directory/connectable';
import {
  hostnameOf,
  isHostingPlatformHost,
  registrableDomain,
} from '@/lib/connectors/directory/hosts';
import { deriveMonogram, deriveMonogramHue } from '@/lib/connectors/directory/monogram';
import { summarizeDescription } from '@/lib/connectors/directory/summary';
import { applyVendorDirectory } from '@/lib/connectors/directory/vendor-directory';
import type {
  DirectoryAuthMode,
  DirectoryIconSource,
  DirectoryRecord,
  DirectoryRemote,
} from '@/lib/connectors/directory/types';

const AGI_PUBLISHER_LABEL = 'AGI Workforce';
const ICON_SOURCE_PRIORITY: Readonly<Record<DirectoryIconSource, number>> = {
  brand: 3,
  registry: 2,
  site: 1,
  monogram: 0,
};

const CATALOG_CATEGORY_MAP: Readonly<Record<ConnectorCategory, DirectoryCategory>> = {
  Productivity: 'Productivity',
  Developer: 'Code',
  CRM: 'Sales and marketing',
  Marketing: 'Sales and marketing',
  Finance: 'Financial services',
  Social: 'Communication',
  AI: 'Code',
  Communication: 'Communication',
  Cloud: 'Code',
  Data: 'Data',
  Design: 'Design',
  Storage: 'Productivity',
  Healthcare: 'Health',
  Exclusive: 'Code',
};

function authModeForCapability(authScheme: string | undefined): DirectoryAuthMode {
  if (authScheme === 'api-key' || authScheme === 'connection-string' || authScheme === 'pat')
    return 'api-key';
  if (authScheme === 'oauth2' || authScheme === 'github-app') return 'oauth';
  return 'unknown';
}

function internalCardDescription(name: string, capabilitySummary: string): string {
  return `Connect ${name} for ${capabilitySummary}.`;
}

export function buildInternalDirectoryRecords(): DirectoryRecord[] {
  return CONNECTORS.map((connector) => {
    const endpoint = getMcpEndpoint(connector.id);
    const remotes: DirectoryRemote[] = endpoint
      ? [{ url: endpoint.url, transport: endpoint.transport }]
      : [];
    const capability = getConnectorCapability(connector.id);
    const publisher = allowsPresentTenseCopy(connector.id) ? AGI_PUBLISHER_LABEL : connector.name;
    const brandSlug = brandSlugForConnectorId(connector.id);
    const categories = [CATALOG_CATEGORY_MAP[connector.category]];
    const primaryCategory = categories[0] ?? OTHER_CATEGORY;

    return {
      id: connector.id,
      name: connector.name,
      publisher,
      description: summarizeDescription(
        internalCardDescription(connector.name, connector.capabilitySummary),
        connector.name,
        primaryCategory,
      ),
      categories,
      remotes,
      authMode: authModeForCapability(capability?.authScheme),
      connectable: connectableForInternalId(connector.id),
      toolNames: getDeclaredConnectorActions(connector.id),
      repositoryUrl: null,
      version: null,
      sourceRegistry: 'internal',
      badge: deriveInternalBadge(),
      iconUrl: null,
      monogram: deriveMonogram(connector.name),
      monogramHue: deriveMonogramHue(categories),
      documentationUrl: null,
      iconSource: brandSlug ? 'brand' : 'monogram',
      brandSlug,
      authorName: publisher,
      authorUrl: null,
      websiteUrl: null,
      supportUrl: null,
      privacyPolicyUrl: null,
    };
  });
}

function remoteHostsOf(record: DirectoryRecord): string[] {
  return record.remotes
    .map((remote) => hostnameOf(remote.url))
    .filter((host): host is string => host !== null);
}

function buildInternalHostIndex(
  internalRecords: readonly DirectoryRecord[],
): Map<string, DirectoryRecord> {
  const index = new Map<string, DirectoryRecord>();
  for (const record of internalRecords) {
    for (const host of remoteHostsOf(record)) index.set(host, record);
  }
  return index;
}

function buildVendorDomains(internalRecords: readonly DirectoryRecord[]): Set<string> {
  const domains = new Set<string>();
  for (const record of internalRecords) {
    for (const host of remoteHostsOf(record)) {
      if (!isHostingPlatformHost(host)) domains.add(registrableDomain(host));
    }
  }
  return domains;
}

function matchInternalRecord(
  registryRecord: DirectoryRecord,
  internalHosts: Map<string, DirectoryRecord>,
): DirectoryRecord | undefined {
  for (const host of remoteHostsOf(registryRecord)) {
    const match = internalHosts.get(host);
    if (match) return match;
  }
  return undefined;
}

export function unionCategories(
  current: readonly string[],
  incoming: readonly string[],
): readonly string[] {
  const union = [...new Set([...current, ...incoming])];
  const specific = union.filter((category) => category !== OTHER_CATEGORY);
  return specific.length > 0 ? specific : union;
}

function enrichWithRegistryRecord(
  current: DirectoryRecord,
  registryRecord: DirectoryRecord,
): DirectoryRecord {
  const takeIncomingIcon =
    ICON_SOURCE_PRIORITY[registryRecord.iconSource] > ICON_SOURCE_PRIORITY[current.iconSource];
  const categories = unionCategories(current.categories, registryRecord.categories);

  return {
    ...current,
    description: current.description || registryRecord.description,
    categories,
    monogramHue: deriveMonogramHue(categories),
    toolNames: current.toolNames.length > 0 ? current.toolNames : registryRecord.toolNames,
    repositoryUrl: current.repositoryUrl ?? registryRecord.repositoryUrl,
    documentationUrl: current.documentationUrl ?? registryRecord.documentationUrl,
    authorUrl: current.authorUrl ?? registryRecord.authorUrl,
    websiteUrl: current.websiteUrl ?? registryRecord.websiteUrl,
    supportUrl: current.supportUrl ?? registryRecord.supportUrl,
    privacyPolicyUrl: current.privacyPolicyUrl ?? registryRecord.privacyPolicyUrl,
    iconUrl: takeIncomingIcon ? registryRecord.iconUrl : current.iconUrl,
    iconSource: takeIncomingIcon ? registryRecord.iconSource : current.iconSource,
    brandSlug: takeIncomingIcon ? registryRecord.brandSlug : current.brandSlug,
  };
}

function withVendorBadge(record: DirectoryRecord, vendorDomains: ReadonlySet<string>) {
  const badge = upgradeToVerifiedBadge(record.badge, remoteHostsOf(record), vendorDomains);
  return badge === record.badge ? record : { ...record, badge };
}

export function mergeDirectoryRecords(
  internalRecords: readonly DirectoryRecord[],
  registryRecords: readonly DirectoryRecord[],
): DirectoryRecord[] {
  const internalHosts = buildInternalHostIndex(internalRecords);
  const vendorDomains = buildVendorDomains(internalRecords);
  const merged = new Map<string, DirectoryRecord>();
  for (const record of internalRecords) merged.set(record.id, record);

  for (const registryRecord of registryRecords) {
    const matched = matchInternalRecord(registryRecord, internalHosts);
    if (matched) {
      const current = merged.get(matched.id) ?? matched;
      merged.set(matched.id, enrichWithRegistryRecord(current, registryRecord));
      continue;
    }
    if (!merged.has(registryRecord.id)) {
      merged.set(registryRecord.id, withVendorBadge(registryRecord, vendorDomains));
    }
  }

  return applyVendorDirectory([...merged.values()]);
}
