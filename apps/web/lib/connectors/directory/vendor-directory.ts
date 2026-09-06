import 'server-only';

import firstPartyTargetsJson from '@/lib/connectors/directory/sources/first-party.json';
import vendorDirectoryJson from '@/lib/connectors/directory/sources/vendor-directory.json';
import { strongerBadge } from '@/lib/connectors/directory/badge';
import { brandSlugForSignals } from '@/lib/connectors/directory/brand-icons';
import { connectableFromAuthMode } from '@/lib/connectors/directory/connectable';
import {
  hostnameOf,
  isCodeForgeHost,
  isHostingPlatformHost,
  originOf,
  registrableDomain,
} from '@/lib/connectors/directory/hosts';
import { deriveMonogram, deriveMonogramHue } from '@/lib/connectors/directory/monogram';
import type {
  DirectoryAuthMode,
  DirectoryBadge,
  DirectoryConnectableMode,
  DirectoryIconSource,
  DirectoryRecord,
  DirectorySource,
  DirectoryTransport,
} from '@/lib/connectors/directory/types';

export type VendorCapability = 'read' | 'read-write' | 'interactive';

export interface VendorDirectoryEntry {
  readonly id: string;
  readonly externalDirectoryId: string | null;
  readonly name: string;
  readonly summary: string;
  readonly description: string;
  readonly mcpUrl: string | null;
  readonly transport: DirectoryTransport | null;
  readonly publisher: { readonly name: string; readonly url: string | null };
  readonly websiteUrl: string | null;
  readonly documentationUrl: string | null;
  readonly privacyPolicyUrl: string | null;
  readonly supportUrl: string | null;
  readonly categories: readonly string[];
  readonly capabilities: readonly VendorCapability[];
  readonly source: 'vendor-directory';
}

export const VENDOR_DIRECTORY_ENTRIES: readonly VendorDirectoryEntry[] =
  vendorDirectoryJson as VendorDirectoryEntry[];

const VENDOR_BADGE: DirectoryBadge = 'official';
const VENDOR_AUTH_MODE: DirectoryAuthMode = 'unknown';
const VENDOR_SOURCE: DirectorySource = 'internal';
const LISTED_CONNECTABLE: DirectoryConnectableMode = 'needs-setup';
const BRAND_ICON: DirectoryIconSource = 'brand';
const SITE_ICON: DirectoryIconSource = 'site';
const MONOGRAM_ICON: DirectoryIconSource = 'monogram';
const TRAILING_SLASHES = /\/+$/u;
const NAME_TOKEN = /[\p{L}\p{N}]+/gu;
const MIN_NAME_TOKEN_LENGTH = 3;
const GENERIC_NAME_TOKENS: ReadonlySet<string> = new Set([
  'mcp',
  'server',
  'cloud',
  'api',
  'app',
  'connector',
  'platform',
  'the',
  'and',
  'for',
]);

const FIRST_PARTY_SEED_IDS: ReadonlySet<string> = new Set(
  (firstPartyTargetsJson as readonly { connectorId: string }[]).map((target) => target.connectorId),
);

export type VendorMatchKind = 'url' | 'id' | 'host' | 'domain';

export interface VendorMatch {
  readonly entry: VendorDirectoryEntry;
  readonly record: DirectoryRecord;
  readonly kind: VendorMatchKind;
}

export interface VendorDirectoryPlan {
  readonly matches: readonly VendorMatch[];
  readonly created: readonly DirectoryRecord[];
  readonly withoutEndpoint: readonly VendorDirectoryEntry[];
  readonly skipped: readonly VendorDirectoryEntry[];
}

export function listingNoteFor(entry: VendorDirectoryEntry): string {
  return `${entry.publisher.name} lists this connector without a public endpoint; connect it from the vendor's own app or ask them for an MCP URL.`;
}

function urlKey(url: string): string {
  return url.trim().toLowerCase().replace(TRAILING_SLASHES, '');
}

function siteDomain(url: string | null): string | null {
  const host = url ? hostnameOf(url) : null;
  if (!host || isHostingPlatformHost(host) || isCodeForgeHost(host)) return null;
  return registrableDomain(host);
}

function remoteHostsOf(record: DirectoryRecord): string[] {
  return record.remotes
    .map((remote) => hostnameOf(remote.url))
    .filter((host): host is string => host !== null);
}

function shortestRemoteLength(record: DirectoryRecord): number {
  return Math.min(...record.remotes.map((remote) => remote.url.length), Number.POSITIVE_INFINITY);
}

function preferRecord(left: DirectoryRecord, right: DirectoryRecord): number {
  const strongest = strongerBadge(left.badge, right.badge);
  if (left.badge !== right.badge) return strongest === left.badge ? -1 : 1;
  const byLength = shortestRemoteLength(left) - shortestRemoteLength(right);
  if (byLength !== 0) return byLength;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

class RecordIndex {
  private readonly byUrl = new Map<string, DirectoryRecord[]>();
  private readonly byHost = new Map<string, DirectoryRecord[]>();
  private readonly byDomain = new Map<string, DirectoryRecord[]>();
  private readonly byId = new Map<string, DirectoryRecord>();

  constructor(records: readonly DirectoryRecord[]) {
    for (const record of records) {
      this.byId.set(record.id, record);
      for (const remote of record.remotes) push(this.byUrl, urlKey(remote.url), record);
      for (const host of remoteHostsOf(record)) {
        push(this.byHost, host, record);
        if (!isHostingPlatformHost(host)) push(this.byDomain, registrableDomain(host), record);
      }
    }
  }

  candidates(
    entry: VendorDirectoryEntry,
  ): readonly (readonly [VendorMatchKind, readonly DirectoryRecord[]])[] {
    const host = entry.mcpUrl ? hostnameOf(entry.mcpUrl) : null;
    const domain = siteDomain(entry.websiteUrl);
    const own = this.byId.get(entry.id);
    return [
      ['url', entry.mcpUrl ? (this.byUrl.get(urlKey(entry.mcpUrl)) ?? []) : []],
      ['id', own ? [own] : []],
      ['host', host ? (this.byHost.get(host) ?? []) : []],
      ['domain', domain ? (this.byDomain.get(domain) ?? []) : []],
    ];
  }
}

function push(map: Map<string, DirectoryRecord[]>, key: string, record: DirectoryRecord): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(record);
  else map.set(key, [record]);
}

function nameTokens(value: string): string[] {
  return (value.toLowerCase().match(NAME_TOKEN) ?? []).filter(
    (token) => token.length >= MIN_NAME_TOKEN_LENGTH && !GENERIC_NAME_TOKENS.has(token),
  );
}

function sharesProductName(entry: VendorDirectoryEntry, record: DirectoryRecord): boolean {
  const haystack = `${record.id} ${record.name}`.toLowerCase();
  const publisherTokens = new Set(nameTokens(entry.publisher.name));
  const productTokens = nameTokens(`${entry.id} ${entry.name}`).filter(
    (token) => !publisherTokens.has(token),
  );
  const tokens = productTokens.length > 0 ? productTokens : [...publisherTokens];
  return tokens.some((token) => haystack.includes(token));
}

function findMatch(
  entry: VendorDirectoryEntry,
  index: RecordIndex,
  claimed: ReadonlySet<string>,
): VendorMatch | null {
  for (const [kind, records] of index.candidates(entry)) {
    const open = records
      .filter((record) => !claimed.has(record.id))
      .filter((record) => kind !== 'domain' || sharesProductName(entry, record))
      .sort(preferRecord);
    const record = open[0];
    if (record) return { entry, record, kind };
  }
  return null;
}

function vendorHosts(entry: VendorDirectoryEntry): string[] {
  return [entry.mcpUrl, entry.websiteUrl]
    .map((url) => (url ? hostnameOf(url) : null))
    .filter((host): host is string => host !== null);
}

function vendorBrandSlug(entry: VendorDirectoryEntry): string | null {
  return brandSlugForSignals({ publisher: entry.publisher.name, hosts: vendorHosts(entry) });
}

function vendorWebsite(entry: VendorDirectoryEntry): string | null {
  return entry.websiteUrl ?? (entry.mcpUrl ? originOf(entry.mcpUrl) : null);
}

function vendorIconSource(
  brandSlug: string | null,
  websiteUrl: string | null,
): DirectoryIconSource {
  if (brandSlug) return BRAND_ICON;
  return siteDomain(websiteUrl) ? SITE_ICON : MONOGRAM_ICON;
}

function withVendorIcon(record: DirectoryRecord, entry: VendorDirectoryEntry): DirectoryRecord {
  const brandSlug = vendorBrandSlug(entry);
  if (brandSlug && record.iconSource !== BRAND_ICON) {
    return { ...record, iconSource: BRAND_ICON, brandSlug };
  }
  if (record.iconSource === MONOGRAM_ICON && siteDomain(record.websiteUrl)) {
    return { ...record, iconSource: SITE_ICON };
  }
  return record;
}

function vendorRemotes(entry: VendorDirectoryEntry): DirectoryRecord['remotes'] {
  return entry.mcpUrl && entry.transport ? [{ url: entry.mcpUrl, transport: entry.transport }] : [];
}

function fillLinks(record: DirectoryRecord, entry: VendorDirectoryEntry): DirectoryRecord {
  return {
    ...record,
    websiteUrl: record.websiteUrl ?? entry.websiteUrl,
    documentationUrl: record.documentationUrl ?? entry.documentationUrl,
    privacyPolicyUrl: record.privacyPolicyUrl ?? entry.privacyPolicyUrl,
    supportUrl: record.supportUrl ?? entry.supportUrl,
    featured: true,
  };
}

function overrideWithVendor(record: DirectoryRecord, entry: VendorDirectoryEntry): DirectoryRecord {
  const remotes = record.remotes.length > 0 ? record.remotes : vendorRemotes(entry);
  return withVendorIcon(
    {
      ...record,
      name: entry.name,
      publisher: entry.publisher.name,
      description: entry.summary,
      categories: entry.categories,
      monogram: deriveMonogram(entry.name),
      monogramHue: deriveMonogramHue(entry.categories),
      remotes,
      badge: strongerBadge(record.badge, VENDOR_BADGE),
      authorName: entry.publisher.name,
      authorUrl: entry.publisher.url ?? record.authorUrl,
      websiteUrl: vendorWebsite(entry) ?? record.websiteUrl,
      documentationUrl: entry.documentationUrl ?? record.documentationUrl,
      privacyPolicyUrl: entry.privacyPolicyUrl ?? record.privacyPolicyUrl,
      supportUrl: entry.supportUrl ?? record.supportUrl,
      featured: true,
    },
    entry,
  );
}

export function enrichWithVendor(
  record: DirectoryRecord,
  entry: VendorDirectoryEntry,
): DirectoryRecord {
  return FIRST_PARTY_SEED_IDS.has(record.id)
    ? fillLinks(record, entry)
    : overrideWithVendor(record, entry);
}

export function buildVendorRecord(entry: VendorDirectoryEntry): DirectoryRecord {
  const remotes = vendorRemotes(entry);
  const brandSlug = vendorBrandSlug(entry);
  const websiteUrl = vendorWebsite(entry);
  const listed = remotes.length === 0;
  return {
    id: entry.id,
    name: entry.name,
    publisher: entry.publisher.name,
    description: entry.summary,
    categories: entry.categories,
    remotes,
    authMode: VENDOR_AUTH_MODE,
    connectable: listed ? LISTED_CONNECTABLE : connectableFromAuthMode(VENDOR_AUTH_MODE, true),
    toolNames: [],
    repositoryUrl: null,
    version: null,
    sourceRegistry: VENDOR_SOURCE,
    badge: VENDOR_BADGE,
    iconUrl: null,
    monogram: deriveMonogram(entry.name),
    monogramHue: deriveMonogramHue(entry.categories),
    documentationUrl: entry.documentationUrl,
    iconSource: vendorIconSource(brandSlug, websiteUrl),
    brandSlug,
    authorName: entry.publisher.name,
    authorUrl: entry.publisher.url,
    websiteUrl,
    supportUrl: entry.supportUrl,
    privacyPolicyUrl: entry.privacyPolicyUrl,
    featured: true,
    ...(listed ? { listingNote: listingNoteFor(entry) } : {}),
  };
}

export function planVendorDirectory(
  records: readonly DirectoryRecord[],
  entries: readonly VendorDirectoryEntry[] = VENDOR_DIRECTORY_ENTRIES,
): VendorDirectoryPlan {
  const index = new RecordIndex(records);
  const claimed = new Set<string>();
  const matches: VendorMatch[] = [];
  const created: DirectoryRecord[] = [];
  const withoutEndpoint: VendorDirectoryEntry[] = [];
  const skipped: VendorDirectoryEntry[] = [];
  for (const entry of entries) {
    const match = findMatch(entry, index, claimed);
    if (match) {
      claimed.add(match.record.id);
      matches.push(match);
      continue;
    }
    if (claimed.has(entry.id)) {
      skipped.push(entry);
      continue;
    }
    const record = buildVendorRecord(entry);
    claimed.add(record.id);
    created.push(record);
    if (record.remotes.length === 0) withoutEndpoint.push(entry);
  }
  return { matches, created, withoutEndpoint, skipped };
}

export function applyVendorDirectory(
  records: readonly DirectoryRecord[],
  entries: readonly VendorDirectoryEntry[] = VENDOR_DIRECTORY_ENTRIES,
): DirectoryRecord[] {
  const plan = planVendorDirectory(records, entries);
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const match of plan.matches) {
    byId.set(match.record.id, enrichWithVendor(match.record, match.entry));
  }
  for (const record of plan.created) {
    if (!byId.has(record.id)) byId.set(record.id, record);
  }
  return [...byId.values()];
}
