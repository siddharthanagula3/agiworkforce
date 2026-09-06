import {
  brandSlugForHost,
  brandSlugForPublisherHandle,
} from '@/lib/connectors/directory/brand-icons';
import { isHostingPlatformHost, registrableDomain } from '@/lib/connectors/directory/hosts';
import type { DirectoryBadge } from '@/lib/connectors/directory/types';

export const GITHUB_NAMESPACE_PREFIX = 'io.github.';

const FIRST_PARTY_BADGE: DirectoryBadge = 'first-party';
const OFFICIAL_BADGE: DirectoryBadge = 'official';
const VERIFIED_BADGE: DirectoryBadge = 'verified';
const REGISTRY_BADGE: DirectoryBadge = 'registry';
const COMMUNITY_BADGE: DirectoryBadge = 'community';

const BADGE_RANK: Readonly<Record<DirectoryBadge, number>> = {
  'first-party': 4,
  official: 3,
  verified: 2,
  registry: 1,
  community: 0,
};

export const AGGREGATOR_DOMAINS: readonly string[] = [
  'smithery.ai',
  'pipeworx.io',
  'mcp.ai',
  'm2mcent.com',
  'mcparmory.com',
  'tooloracle.io',
  'olyport.com',
  'jojapi.com',
  'lazy-mac.com',
  'wishpool.app',
  'getvda.ai',
  'usefulapi.io',
  'mcpbundles.com',
  'waystation.ai',
  'pulsemcp.com',
  'glama.ai',
  'klavis.ai',
  'composio.dev',
  'pipedream.net',
  'mcp.run',
  'mcp.so',
  'mcpize.run',
  'alpic.live',
  'fastmcp.app',
  'doc2mcp.site',
  'mcpscores.com',
  'mcp-dir.com',
];

const VENDOR_DOMAINS: Readonly<Record<string, string>> = {
  'github.com': 'github',
  'gitlab.com': 'gitlab',
  'microsoft.com': 'microsoft',
  'cloud.microsoft': 'microsoft',
  'azure.com': 'microsoft',
  'office.com': 'microsoft',
  'amazon.com': 'amazon',
  'aws.dev': 'amazon',
  'salesforce.com': 'salesforce',
  'force.com': 'salesforce',
  'slack.com': 'slack',
  'canva.com': 'canva',
  'canva.dev': 'canva',
  'openai.com': 'openai',
  'plaid.com': 'plaid',
  'monday.com': 'monday',
  'tencent.com': 'tencent',
  'hp.com': 'hp',
  'hpe.com': 'hp',
  'apify.com': 'apify',
  'apify.actor': 'apify',
  'avalara.com': 'avalara',
  'infobip.com': 'infobip',
  'hasdata.com': 'hasdata',
  'twilio.com': 'twilio',
  'oracle.com': 'oracle',
  'ibm.com': 'ibm',
  'adobe.com': 'adobe',
  'cisco.com': 'cisco',
  'redhat.com': 'redhat',
  'vmware.com': 'vmware',
  'aliyun.com': 'alibaba',
  'alibabacloud.com': 'alibaba',
  'baidu.com': 'baidu',
  'huawei.com': 'huawei',
  'huaweicloud.com': 'huawei',
  'servicenow.com': 'servicenow',
  'workday.com': 'workday',
  'exa.ai': 'exa',
  'tavily.com': 'tavily',
  'firecrawl.dev': 'firecrawl',
  'browserbase.com': 'browserbase',
  'e2b.dev': 'e2b',
  'cohere.com': 'cohere',
  'context7.com': 'context7',
};

const VENDOR_GITHUB_OWNERS: Readonly<Record<string, string>> = {
  microsoft: 'microsoft',
  azure: 'microsoft',
  aws: 'amazon',
  awslabs: 'amazon',
  awssamples: 'amazon',
  openai: 'openai',
  slackapi: 'slack',
  canva: 'canva',
  salesforce: 'salesforce',
  salesforcecli: 'salesforce',
  forcedotcom: 'salesforce',
  plaid: 'plaid',
  mondaycom: 'monday',
  mondaydotcomorg: 'monday',
  apify: 'apify',
  hasdata: 'hasdata',
  twilio: 'twilio',
  oracle: 'oracle',
  ibm: 'ibm',
  adobe: 'adobe',
  cisco: 'cisco',
  tencent: 'tencent',
  alibaba: 'alibaba',
  redhatofficial: 'redhat',
  vmware: 'vmware',
  browserbase: 'browserbase',
  e2bdev: 'e2b',
  cohereai: 'cohere',
  upstash: 'context7',
  mendableai: 'firecrawl',
  exalabs: 'exa',
  tavilyai: 'tavily',
  googlecloudplatform: 'google',
  facebook: 'meta',
};

export type RegistryNamespace =
  | { readonly kind: 'github'; readonly owner: string }
  | { readonly kind: 'domain'; readonly domain: string };

export interface RegistryBadgeSignals {
  readonly registryName: string;
  readonly remoteHosts: readonly string[];
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/gu, '');
}

export function parseRegistryNamespace(registryName: string): RegistryNamespace {
  const namespace = registryName.split('/')[0] ?? registryName;
  if (namespace.startsWith(GITHUB_NAMESPACE_PREFIX)) {
    return { kind: 'github', owner: namespace.slice(GITHUB_NAMESPACE_PREFIX.length) };
  }
  const labels = namespace.split('.').filter(Boolean);
  return { kind: 'domain', domain: [...labels].reverse().join('.') };
}

export function isAggregatorDomain(domain: string): boolean {
  return AGGREGATOR_DOMAINS.includes(registrableDomain(domain));
}

function vendorOfDomainLabels(host: string): string | null {
  const labels = host.toLowerCase().split('.');
  for (let index = 0; index < labels.length - 1; index += 1) {
    const vendor = VENDOR_DOMAINS[labels.slice(index).join('.')];
    if (vendor) return vendor;
  }
  return null;
}

export function vendorOfHost(host: string): string | null {
  if (isHostingPlatformHost(host) || isAggregatorDomain(host)) return null;
  return vendorOfDomainLabels(host) ?? brandSlugForHost(host);
}

export function vendorOfNamespace(namespace: RegistryNamespace): string | null {
  if (namespace.kind === 'domain') return vendorOfHost(namespace.domain);
  const owner = normalizeLabel(namespace.owner);
  return brandSlugForPublisherHandle(owner) ?? VENDOR_GITHUB_OWNERS[owner] ?? null;
}

function integratesOwnProduct(vendor: string, remoteHosts: readonly string[]): boolean {
  return remoteHosts.every((host) => {
    const remoteVendor = vendorOfHost(host);
    return remoteVendor === null || remoteVendor === vendor;
  });
}

export function isIdentifiedOrganization(namespace: RegistryNamespace): boolean {
  return (
    namespace.kind === 'domain' &&
    !isAggregatorDomain(namespace.domain) &&
    !isHostingPlatformHost(namespace.domain)
  );
}

export function deriveInternalBadge(): DirectoryBadge {
  return FIRST_PARTY_BADGE;
}

export function deriveRegistryBadge(signals: RegistryBadgeSignals): DirectoryBadge {
  const namespace = parseRegistryNamespace(signals.registryName);
  const vendor = vendorOfNamespace(namespace);
  if (vendor && integratesOwnProduct(vendor, signals.remoteHosts)) return OFFICIAL_BADGE;
  return isIdentifiedOrganization(namespace) ? REGISTRY_BADGE : COMMUNITY_BADGE;
}

export function upgradeToVerifiedBadge(
  badge: DirectoryBadge,
  remoteHosts: readonly string[],
  vendorDomains: ReadonlySet<string>,
): DirectoryBadge {
  if (BADGE_RANK[badge] >= BADGE_RANK[VERIFIED_BADGE]) return badge;
  const vouched = remoteHosts.some(
    (host) => !isHostingPlatformHost(host) && vendorDomains.has(registrableDomain(host)),
  );
  return vouched ? VERIFIED_BADGE : badge;
}

export function strongerBadge(left: DirectoryBadge, right: DirectoryBadge): DirectoryBadge {
  return BADGE_RANK[right] > BADGE_RANK[left] ? right : left;
}
