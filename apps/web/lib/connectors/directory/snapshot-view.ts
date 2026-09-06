import type {
  DirectoryAuthMode,
  DirectoryBadge,
  DirectoryConnectableMode,
  DirectoryRecord,
  DirectorySource,
  DirectoryTransport,
} from '@/lib/connectors/directory/types';

const BADGE_RANK: Readonly<Record<DirectoryBadge, number>> = {
  'first-party': 0,
  official: 1,
  verified: 2,
  registry: 3,
  community: 4,
};

const CONNECTABLE_MODE_RANK: Readonly<Record<DirectoryConnectableMode, number>> = {
  connect: 0,
  'api-key-form': 1,
  'desktop-and-cli': 2,
  'needs-setup': 3,
};

const AUTH_MODE_RANK: Readonly<Record<DirectoryAuthMode, number>> = {
  none: 0,
  oauth: 1,
  'api-key': 2,
  unknown: 3,
};

const INTERNAL_SOURCE: DirectorySource = 'internal';
const DEFAULT_INTERNAL_BADGE: DirectoryBadge = 'first-party';
const DEFAULT_REGISTRY_BADGE: DirectoryBadge = 'community';

const NETWORK_TRANSPORTS: ReadonlySet<DirectoryTransport> = new Set(['streamable-http', 'sse']);
const CONNECTABLE_NOW_MODES: ReadonlySet<DirectoryConnectableMode> = new Set([
  'connect',
  'api-key-form',
]);

function rankedKeys<Key extends string>(rank: Readonly<Record<Key, number>>): readonly Key[] {
  return (Object.keys(rank) as Key[]).sort((left, right) => rank[left] - rank[right]);
}

export const DIRECTORY_BADGES = rankedKeys(BADGE_RANK);
export const DIRECTORY_CONNECTABLE_MODES = rankedKeys(CONNECTABLE_MODE_RANK);
export const DIRECTORY_AUTH_MODES = rankedKeys(AUTH_MODE_RANK);

export type StoredDirectoryRecord = Omit<DirectoryRecord, 'badge'> & {
  readonly badge?: string;
};

function isDirectoryBadge(value: string | undefined): value is DirectoryBadge {
  return value !== undefined && value in BADGE_RANK;
}

export function withDefaultBadge(record: StoredDirectoryRecord): DirectoryRecord {
  if (isDirectoryBadge(record.badge)) return record as DirectoryRecord;
  const badge =
    record.sourceRegistry === INTERNAL_SOURCE ? DEFAULT_INTERNAL_BADGE : DEFAULT_REGISTRY_BADGE;
  return { ...record, badge };
}

export function networkRemoteUrl(record: DirectoryRecord): string | null {
  return record.remotes.find((remote) => NETWORK_TRANSPORTS.has(remote.transport))?.url ?? null;
}

export function hasNetworkRemote(record: DirectoryRecord): boolean {
  return networkRemoteUrl(record) !== null;
}

export function isConnectableNow(record: DirectoryRecord): boolean {
  return CONNECTABLE_NOW_MODES.has(record.connectable);
}

export function hasIcon(record: DirectoryRecord): boolean {
  return record.iconUrl !== null || record.brandSlug !== null;
}

export function hasDescription(record: DirectoryRecord): boolean {
  return record.description.trim().length > 0;
}

export interface DirectoryCounts {
  readonly totalRecords: number;
  readonly remoteRecords: number;
  readonly byConnectable: Readonly<Record<DirectoryConnectableMode, number>>;
  readonly byBadge: Readonly<Record<DirectoryBadge, number>>;
}

function zeroCounts<Key extends string>(keys: readonly Key[]): Record<Key, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<Key, number>;
}

export function computeDirectoryCounts(records: readonly DirectoryRecord[]): DirectoryCounts {
  const byConnectable = zeroCounts(DIRECTORY_CONNECTABLE_MODES);
  const byBadge = zeroCounts(DIRECTORY_BADGES);
  let remoteRecords = 0;
  for (const record of records) {
    byConnectable[record.connectable] += 1;
    byBadge[record.badge] += 1;
    if (hasNetworkRemote(record)) remoteRecords += 1;
  }
  return { totalRecords: records.length, remoteRecords, byConnectable, byBadge };
}

const nameCollator = new Intl.Collator('en', { sensitivity: 'base' });
const LEADING_NON_ALPHANUMERIC = /^[^\p{L}\p{N}]+/u;
const DIGIT_LED = /^\p{N}/u;

function nameSortKey(name: string): string {
  return name.replace(LEADING_NON_ALPHANUMERIC, '');
}

function digitLed(key: string): number {
  return DIGIT_LED.test(key) ? 1 : 0;
}

function compareIds(left: DirectoryRecord, right: DirectoryRecord): number {
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

function missingDetails(record: DirectoryRecord): number {
  return (hasIcon(record) ? 0 : 1) + (hasDescription(record) ? 0 : 1);
}

interface FeaturedFlag {
  readonly featured?: boolean;
}

export function isFeatured(record: DirectoryRecord & FeaturedFlag): boolean {
  return record.featured === true;
}

function notFeatured(record: DirectoryRecord): number {
  return isFeatured(record) ? 0 : 1;
}

export function compareDirectoryRecordsByName(
  left: DirectoryRecord,
  right: DirectoryRecord,
): number {
  const leftKey = nameSortKey(left.name);
  const rightKey = nameSortKey(right.name);
  return (
    digitLed(leftKey) - digitLed(rightKey) ||
    nameCollator.compare(leftKey, rightKey) ||
    nameCollator.compare(left.name, right.name) ||
    compareIds(left, right)
  );
}

export function compareDirectoryRecords(left: DirectoryRecord, right: DirectoryRecord): number {
  return (
    BADGE_RANK[left.badge] - BADGE_RANK[right.badge] ||
    notFeatured(left) - notFeatured(right) ||
    missingDetails(left) - missingDetails(right) ||
    compareDirectoryRecordsByName(left, right)
  );
}

export function orderDirectoryRecords(records: readonly DirectoryRecord[]): DirectoryRecord[] {
  return [...records].sort(compareDirectoryRecords);
}
