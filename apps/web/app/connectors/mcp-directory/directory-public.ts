import { hasDescription } from '@/lib/connectors/directory/snapshot-view';
import type {
  DirectoryAuthMode,
  DirectoryBadge,
  DirectoryRecord,
  DirectorySource,
} from '@/lib/connectors/directory/types';

export const BASE_PATH = '/connectors/mcp-directory';
export const SIGN_IN_HREF = '/login?redirectTo=%2Fconnectors';
export const CONNECT_LABEL = 'Sign in to connect';
export const NOT_PROVIDED = 'Not provided';

export const BADGE_LABELS = {
  'first-party': 'First-party',
  official: 'Official',
  verified: 'Verified',
  registry: 'Community',
  community: 'Community',
} as const satisfies Record<DirectoryBadge, string>;

export const BADGE_NOTE =
  'We do not sign or vouch for a community server; the badge on each entry says who published it and nothing more.';

export const AUTH_MODE_LABELS = {
  oauth: 'OAuth sign-in with the provider',
  'api-key': 'An API key you supply',
  none: 'None',
  unknown: 'Not checked yet',
} as const satisfies Record<DirectoryAuthMode, string>;

export const SOURCE_LABELS = {
  internal: 'AGI vendor directory',
  'mcp-registry': 'Official MCP registry',
} as const satisfies Record<DirectorySource, string>;

export function directoryRecordPath(id: string): string {
  return `${BASE_PATH}/${id.split('/').map(encodeURIComponent).join('/')}`;
}

export function directoryRecordIdCandidates(segments: readonly string[]): string[] {
  const raw = segments.join('/');
  try {
    const decoded = segments.map(decodeURIComponent).join('/');
    return decoded === raw ? [raw] : [raw, decoded];
  } catch {
    return [raw];
  }
}

export function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function isIndexableDirectoryRecord(record: DirectoryRecord): boolean {
  return (
    hasDescription(record) &&
    [record.documentationUrl, record.websiteUrl, record.repositoryUrl].some(safeExternalUrl)
  );
}
